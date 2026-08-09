import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  adminClient,
  createEfiHttpClient,
  efiAccessToken,
  efiBaseUrl,
  normalizeEfiCredentials,
  safeEfiError,
  webhookJson,
} from "../_shared/efi-pix-personal.ts";

type Session = {
  accessToken: string;
  client: Deno.HttpClient;
  credentials: ReturnType<typeof normalizeEfiCredentials>;
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return webhookJson({ ok: false }, 405);
  const admin = adminClient();
  const supplied = req.headers.get("x-cron-secret") || "";
  const { data: runtime, error: runtimeError } = await admin.from("app_runtime_secrets").select("cron_secret").eq("id", 1).maybeSingle();
  if (runtimeError || !runtime?.cron_secret || supplied !== runtime.cron_secret) return webhookJson({ ok: false }, 401);

  const result = { analisadas: 0, pagas: 0, ativadas: 0, expiradas: 0, canceladas: 0, falhas: 0 };
  const sessions = new Map<string, Session>();

  try {
    const { data: charges, error: chargesError } = await admin
      .from("cobrancas_pix_mensalidades")
      .select("id,mensalidade_id,personal_id,txid,status,valor,vence_em")
      .in("status", ["criando", "pendente"])
      .order("updated_at", { ascending: true })
      .limit(100);
    if (chargesError) throw chargesError;

    for (const charge of charges || []) {
      result.analisadas += 1;
      try {
        let session = sessions.get(charge.personal_id);
        if (!session) {
          const { data: secret, error: secretError } = await admin.rpc("fsfit_obter_segredo_integracao_pix_personal", {
            p_personal_id: charge.personal_id,
            p_exigir_ativa: true,
          });
          if (secretError || !secret) throw secretError || new Error("Integração Efí indisponível.");
          const credentials = normalizeEfiCredentials(secret);
          const client = createEfiHttpClient(credentials);
          const { accessToken } = await efiAccessToken(credentials, client);
          session = { accessToken, client, credentials };
          sessions.set(charge.personal_id, session);
        }

        const response = await fetch(`${efiBaseUrl(session.credentials.ambiente)}/v2/cob/${encodeURIComponent(charge.txid)}`, {
          client: session.client,
          headers: { Authorization: `Bearer ${session.accessToken}`, "Accept-Encoding": "identity" },
        });
        const payload = await response.json().catch(() => ({}));
        if (response.status === 404 && charge.status === "criando") {
          const { error } = await admin.rpc("fsfit_atualizar_estado_cobranca_pix_mensalidade", {
            p_txid: charge.txid,
            p_status: "erro",
            p_payload: payload,
            p_erro: "Cobrança não encontrada na Efí.",
          });
          if (error) throw error;
          result.falhas += 1;
          continue;
        }
        if (!response.ok) throw new Error(safeEfiError(payload, "Falha ao consultar a cobrança Pix."));

        const status = String(payload?.status || "").toUpperCase();
        const copyPaste = String(payload?.pixCopiaECola || "").trim();
        if (charge.status === "criando" && copyPaste.length >= 50 && ["ATIVA", "CONCLUIDA"].includes(status)) {
          const { error: finalizeError } = await admin.rpc("fsfit_finalizar_cobranca_pix_mensalidade", {
            p_cobranca_id: charge.id,
            p_txid: charge.txid,
            p_pix_copia_cola: copyPaste,
            p_loc_id: payload?.loc?.id == null ? null : String(payload.loc.id),
            p_loc_url: payload?.location || payload?.loc?.location || null,
            p_payload: payload,
          });
          if (finalizeError) throw finalizeError;
          result.ativadas += 1;
        }

        if (status === "CONCLUIDA") {
          const pix = Array.isArray(payload?.pix) && payload.pix.length ? payload.pix[0] : null;
          const value = Number(String(pix?.valor || payload?.valor?.original || charge.valor).replace(",", "."));
          const { data: lowered, error: lowerError } = await admin.rpc("fsfit_baixar_pix_mensalidade", {
            p_txid: charge.txid,
            p_pago_em: typeof pix?.horario === "string" ? pix.horario : new Date().toISOString(),
            p_e2e_id: typeof pix?.endToEndId === "string" ? pix.endToEndId : null,
            p_valor: Number.isFinite(value) ? value : null,
            p_payload: payload,
            p_origem: "pix_reconciliacao",
            p_webhook_token: null,
          });
          if (lowerError || !lowered?.ok) throw lowerError || new Error(String(lowered?.erro || "Baixa Pix não aplicada."));
          if (!lowered.duplicado) result.pagas += 1;
        } else if (["REMOVIDA_PELO_USUARIO_RECEBEDOR", "REMOVIDA_PELO_PSP"].includes(status)) {
          const localStatus = new Date(charge.vence_em).getTime() <= Date.now() ? "expirada" : "cancelada";
          const { error } = await admin.rpc("fsfit_atualizar_estado_cobranca_pix_mensalidade", {
            p_txid: charge.txid,
            p_status: localStatus,
            p_payload: payload,
            p_erro: null,
          });
          if (error) throw error;
          if (localStatus === "expirada") result.expiradas += 1;
          else result.canceladas += 1;
        } else if (status === "ATIVA") {
          const { error } = await admin.rpc("fsfit_atualizar_estado_cobranca_pix_mensalidade", {
            p_txid: charge.txid,
            p_status: "pendente",
            p_payload: payload,
            p_erro: null,
          });
          if (error) throw error;
        }
      } catch (error) {
        result.falhas += 1;
        const message = error instanceof Error ? error.message.slice(0, 500) : "Erro desconhecido";
        await admin.from("eventos_financeiros").insert({
          personal_id: charge.personal_id,
          origem: "reconciliar-pix-mensalidades",
          tipo_evento: "falha_reconciliacao_pix_mensalidade",
          referencia_externa: charge.txid,
          cobranca_id: charge.id,
          sucesso: false,
          codigo_erro: "RECONCILIACAO_PIX_MENSALIDADE",
          mensagem_resumida: message,
          metadados: { mensalidade_id: charge.mensalidade_id },
        }).catch(() => undefined);
      }
    }

    await admin.from("eventos_financeiros").insert({
      origem: "reconciliar-pix-mensalidades",
      tipo_evento: "ciclo_reconciliacao_pix_mensalidade_concluido",
      sucesso: result.falhas === 0,
      mensagem_resumida: JSON.stringify(result),
    });
    return webhookJson({ ok: true, ...result });
  } catch (error) {
    console.error("reconciliar-pix-mensalidades", error instanceof Error ? error.message : "erro");
    return webhookJson({ ok: false, erro: "Falha na reconciliação." }, 500);
  } finally {
    for (const session of sessions.values()) session.client.close();
  }
});
