import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  adminClient,
  consumeRateLimit,
  createEfiHttpClient,
  efiAccessToken,
  efiBaseUrl,
  isUuid,
  json,
  normalizeEfiCredentials,
  randomHex,
  requestOriginAllowed,
  responseHeaders,
  safeEfiError,
} from "../_shared/efi-pix-personal.ts";

function publicCharge(charge: Record<string, unknown>) {
  return {
    cobranca_id: charge.cobranca_id,
    pix_copia_cola: charge.pix_copia_cola,
    status: charge.status,
    txid: charge.txid,
    valor: charge.valor,
    vence_em: charge.vence_em,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: responseHeaders(req) });
  if (req.method !== "POST") return json(req, { erro: "Método não permitido." }, 405);
  if (!requestOriginAllowed(req)) return json(req, { erro: "Origem não permitida." }, 403);
  if (Number(req.headers.get("content-length") || 0) > 65536) return json(req, { erro: "Requisição muito grande." }, 413);

  const admin = adminClient();
  let chargeId = "";
  let remoteCreated = false;

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "criar").trim();
    const sessionToken = String(body?.session_token || "").trim();
    const monthlyId = String(body?.mensalidade_id || "").trim();
    if (!/^[a-f0-9]{64}$/.test(sessionToken) || !isUuid(monthlyId)) {
      return json(req, { erro: "Sessão ou mensalidade inválida." }, 400);
    }

    if (action === "status") {
      const allowed = await consumeRateLimit(admin, "status-pix-mensalidade-aluno", sessionToken, 150, 600);
      if (!allowed) return json(req, { erro: "Muitas consultas. Aguarde alguns instantes." }, 429);
      const { data, error } = await admin.rpc("fsfit_obter_status_mensalidade_aluno", {
        p_session_token: sessionToken,
        p_mensalidade_id: monthlyId,
      });
      if (error) throw error;
      if (!data?.ok) return json(req, { erro: "Mensalidade não encontrada." }, 404);
      return json(req, { sucesso: true, mensalidade: data });
    }
    if (action !== "criar") return json(req, { erro: "Ação inválida." }, 400);

    const allowed = await consumeRateLimit(admin, "criar-pix-mensalidade-aluno", sessionToken, 6, 300);
    if (!allowed) return json(req, { erro: "Aguarde antes de gerar outro QR Code Pix." }, 429);

    const txid = randomHex(16);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data: reservation, error: reservationError } = await admin.rpc("fsfit_reservar_cobranca_pix_mensalidade", {
      p_session_token: sessionToken,
      p_mensalidade_id: monthlyId,
      p_txid: txid,
      p_vence_em: expiresAt,
    });
    if (reservationError) throw reservationError;
    if (!reservation?.ok) {
      const unavailable = reservation?.erro === "pix_automatico_nao_configurado";
      return json(req, { erro: unavailable ? "Seu personal ainda não ativou a confirmação automática do Pix." : "Esta mensalidade não está disponível para pagamento." }, unavailable ? 409 : 400);
    }
    if (reservation?.pago) return json(req, { sucesso: true, pago: true, status: "pago" });
    if (reservation?.reutilizada) return json(req, { sucesso: true, automatico: true, cobranca: publicCharge(reservation) });
    if (reservation?.processando) return json(req, { erro: "O QR Code está sendo preparado. Tente novamente em alguns segundos." }, 409);

    chargeId = String(reservation.cobranca_id || "");
    const { data: secret, error: secretError } = await admin.rpc("fsfit_obter_segredo_integracao_pix_personal", {
      p_personal_id: reservation.personal_id,
      p_exigir_ativa: true,
    });
    if (secretError || !secret) throw secretError || new Error("Integração Pix automática indisponível.");
    const credentials = normalizeEfiCredentials(secret);
    if (credentials.pix_chave !== reservation.pix_chave) throw new Error("A chave Pix conectada está desatualizada.");

    const client = createEfiHttpClient(credentials);
    try {
      const { accessToken } = await efiAccessToken(credentials, client);
      const competence = String(reservation.competencia || "").slice(0, 7);
      const payerRequest = `Mensalidade FS Fit - ${String(reservation.aluno_nome || "Aluno")} - ${competence}`.slice(0, 140);
      const response = await fetch(`${efiBaseUrl(credentials.ambiente)}/v2/cob/${encodeURIComponent(String(reservation.txid))}`, {
        method: "PUT",
        client,
        headers: {
          "Accept-Encoding": "identity",
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          calendario: { expiracao: 86400 },
          valor: { original: Number(reservation.valor).toFixed(2) },
          chave: credentials.pix_chave,
          solicitacaoPagador: payerRequest,
          infoAdicionais: [{ nome: "Competência", valor: competence }],
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(safeEfiError(payload, "Não foi possível gerar a cobrança Pix."));
      remoteCreated = true;

      const copyPaste = String(payload?.pixCopiaECola || "").trim();
      if (copyPaste.length < 50) throw new Error("A Efí não retornou um Pix Copia e Cola válido.");
      const { data: finalized, error: finalizeError } = await admin.rpc("fsfit_finalizar_cobranca_pix_mensalidade", {
        p_cobranca_id: chargeId,
        p_txid: reservation.txid,
        p_pix_copia_cola: copyPaste,
        p_loc_id: payload?.loc?.id == null ? null : String(payload.loc.id),
        p_loc_url: payload?.location || payload?.loc?.location || null,
        p_payload: payload,
      });
      if (finalizeError || finalized !== true) throw finalizeError || new Error("Cobrança Pix aguardando sincronização.");

      return json(req, {
        sucesso: true,
        automatico: true,
        cobranca: publicCharge({
          cobranca_id: chargeId,
          pix_copia_cola: copyPaste,
          status: "pendente",
          txid: reservation.txid,
          valor: reservation.valor,
          vence_em: reservation.vence_em,
        }),
      });
    } finally {
      client.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Não foi possível gerar o QR Code Pix.";
    if (chargeId && !remoteCreated) {
      await admin.rpc("fsfit_falhar_cobranca_pix_mensalidade", {
        p_cobranca_id: chargeId,
        p_erro: message,
      }).catch(() => undefined);
    } else if (chargeId && remoteCreated) {
      await admin.from("eventos_financeiros").insert({
        origem: "criar-pix-mensalidade-aluno",
        tipo_evento: "pix_mensalidade_aguardando_reconciliacao",
        cobranca_id: chargeId,
        sucesso: false,
        codigo_erro: "FINALIZACAO_LOCAL",
        mensagem_resumida: message.slice(0, 500),
      }).catch(() => undefined);
    }
    console.error("criar-pix-mensalidade-aluno", message);
    return json(req, { erro: remoteCreated ? "A cobrança foi criada e está sendo sincronizada. Tente novamente em instantes." : message }, remoteCreated ? 503 : 502);
  }
});
