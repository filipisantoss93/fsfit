import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  adminClient,
  authenticatedUser,
  consumeRateLimit,
  createEfiHttpClient,
  efiAccessToken,
  efiBaseUrl,
  env,
  json,
  maskedPixKey,
  normalizeEfiCredentials,
  randomHex,
  requestOriginAllowed,
  responseHeaders,
  safeEfiError,
  sha256Hex,
} from "../_shared/efi-pix-personal.ts";

function safeIntegration(row: Record<string, unknown> | null) {
  if (!row) return { configurada: false, status: "desativada" };
  return {
    ambiente: row.ambiente,
    configurada: row.status === "ativa",
    pix_chave_mascarada: maskedPixKey(String(row.pix_chave || "")),
    status: row.status,
    ultimo_erro: row.status === "erro" ? row.ultimo_erro : null,
    validado_em: row.validado_em,
    webhook_configurado_em: row.webhook_configurado_em,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: responseHeaders(req) });
  if (req.method !== "POST") return json(req, { erro: "Método não permitido." }, 405);
  if (!requestOriginAllowed(req)) return json(req, { erro: "Origem não permitida." }, 403);
  if (Number(req.headers.get("content-length") || 0) > 220000) return json(req, { erro: "Requisição muito grande." }, 413);

  const admin = adminClient();
  const user = await authenticatedUser(req, admin);
  if (!user) return json(req, { erro: "Não autenticado." }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "status").trim();

    const { data: profile } = await admin.from("perfis").select("id,tipo").eq("id", user.id).maybeSingle();
    if (!profile || profile.tipo !== "personal") return json(req, { erro: "Perfil de personal não encontrado." }, 403);

    if (action === "status") {
      const { data, error } = await admin
        .from("integracoes_pix_personal")
        .select("ambiente,pix_chave,status,ultimo_erro,validado_em,webhook_configurado_em")
        .eq("personal_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return json(req, { sucesso: true, integracao: safeIntegration(data) });
    }

    const allowed = await consumeRateLimit(admin, `pix-mensalidade:${action}`, user.id, 6, 900);
    if (!allowed) return json(req, { erro: "Muitas tentativas. Aguarde alguns minutos." }, 429);

    if (action === "desativar") {
      const { data: integration, error: integrationError } = await admin
        .from("integracoes_pix_personal")
        .select("personal_id,ambiente,pix_chave,status")
        .eq("personal_id", user.id)
        .maybeSingle();
      if (integrationError) throw integrationError;
      if (!integration || integration.status === "desativada") {
        return json(req, { sucesso: true, integracao: safeIntegration(integration) });
      }

      const { data: secret, error: secretError } = await admin.rpc("fsfit_obter_segredo_integracao_pix_personal", {
        p_personal_id: user.id,
        p_exigir_ativa: false,
      });
      if (secretError || !secret) throw secretError || new Error("Credenciais Efí indisponíveis.");

      const credentials = normalizeEfiCredentials(secret);
      const client = createEfiHttpClient(credentials);
      try {
        const { accessToken } = await efiAccessToken(credentials, client);
        const response = await fetch(`${efiBaseUrl(credentials.ambiente)}/v2/webhook/${encodeURIComponent(credentials.pix_chave)}`, {
          method: "DELETE",
          client,
          headers: { Authorization: `Bearer ${accessToken}`, "Accept-Encoding": "identity" },
        });
        if (!response.ok && response.status !== 404) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(safeEfiError(payload, "Não foi possível remover o webhook na Efí."));
        }
      } finally {
        client.close();
      }

      const { error: deactivateError } = await admin.rpc("fsfit_desativar_integracao_pix_personal", {
        p_personal_id: user.id,
      });
      if (deactivateError) throw deactivateError;
      return json(req, { sucesso: true, integracao: { configurada: false, status: "desativada" } });
    }

    if (action !== "conectar") return json(req, { erro: "Ação inválida." }, 400);

    const credentials = normalizeEfiCredentials({
      ambiente: body?.ambiente,
      certificado_pem: body?.certificado_pem,
      client_id: body?.client_id,
      client_secret: body?.client_secret,
      pix_chave: body?.pix_chave,
    });
    const pixTipo = String(body?.pix_tipo || "").trim();
    const receiverName = String(body?.pix_nome_recebedor || "").trim().slice(0, 25);
    const city = String(body?.pix_cidade || "").trim().slice(0, 15);
    if (!receiverName || !city || !["cpf", "cnpj", "email", "telefone", "aleatoria"].includes(pixTipo)) {
      return json(req, { erro: "Complete os dados públicos da chave Pix." }, 400);
    }

    const client = createEfiHttpClient(credentials);
    const webhookToken = randomHex(32);
    const webhookTokenHash = await sha256Hex(webhookToken);
    let persisted = false;

    try {
      const { accessToken } = await efiAccessToken(credentials, client);
      const { error: saveError } = await admin.rpc("fsfit_salvar_integracao_pix_personal", {
        p_personal_id: user.id,
        p_ambiente: credentials.ambiente,
        p_pix_chave: credentials.pix_chave,
        p_segredo: {
          certificado_pem: credentials.certificado_pem,
          client_id: credentials.client_id,
          client_secret: credentials.client_secret,
        },
        p_webhook_token_hash: webhookTokenHash,
      });
      if (saveError) throw saveError;
      persisted = true;

      const webhookUrl = `${env("SUPABASE_URL")}/functions/v1/webhook-efi-pix-mensalidades?token=${webhookToken}&ignorar=`;
      const response = await fetch(`${efiBaseUrl(credentials.ambiente)}/v2/webhook/${encodeURIComponent(credentials.pix_chave)}`, {
        method: "PUT",
        client,
        headers: {
          "Accept-Encoding": "identity",
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "x-skip-mtls-checking": "true",
        },
        body: JSON.stringify({ webhookUrl }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(safeEfiError(payload, "Não foi possível configurar o webhook Pix."));

      const [{ error: statusError }, { error: profileError }] = await Promise.all([
        admin.rpc("fsfit_atualizar_status_integracao_pix_personal", {
          p_personal_id: user.id,
          p_status: "ativa",
          p_ultimo_erro: null,
        }),
        admin.from("perfis").update({
          pix_tipo: pixTipo,
          pix_chave: credentials.pix_chave,
          pix_nome_recebedor: receiverName,
          pix_cidade: city,
          updated_at: new Date().toISOString(),
        }).eq("id", user.id),
      ]);
      if (statusError || profileError) throw statusError || profileError;

      return json(req, {
        sucesso: true,
        integracao: {
          ambiente: credentials.ambiente,
          configurada: true,
          pix_chave_mascarada: maskedPixKey(credentials.pix_chave),
          status: "ativa",
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : "Falha ao conectar a conta Efí.";
      if (persisted) {
        await admin.rpc("fsfit_atualizar_status_integracao_pix_personal", {
          p_personal_id: user.id,
          p_status: "erro",
          p_ultimo_erro: message,
        }).catch(() => undefined);
      }
      console.error("configurar-pix-automatico-personal", message);
      return json(req, { erro: message }, 502);
    } finally {
      client.close();
    }
  } catch (error) {
    console.error("configurar-pix-automatico-personal", error instanceof Error ? error.message : "erro");
    return json(req, { erro: "Não foi possível configurar a confirmação automática." }, 500);
  }
});
