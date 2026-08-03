import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const allowedOrigins = new Set(["https://fit.fssolucoes.tech", ...String(Deno.env.get("FSFIT_ALLOWED_ORIGINS") || "").split(",").map(v => v.trim()).filter(Boolean)]);
const cors = (req: Request) => { const origin = req.headers.get("origin") || ""; return { "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://fit.fssolucoes.tech", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" }; };
const originAllowed = (req: Request) => !req.headers.get("origin") || allowedOrigins.has(req.headers.get("origin") || "");
const json = (req: Request, data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" } });
const env = (name: string) => { const value = Deno.env.get(name); if (!value) throw new Error(`Secret ausente: ${name}`); return value; };
const decode64 = (value: string) => new TextDecoder().decode(Uint8Array.from(atob(value), c => c.charCodeAt(0)));

class AppError extends Error { constructor(message: string, public status = 500) { super(message); } }
function pemParts(pem: string) { const cert = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/)?.[0]; const key = pem.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA )?PRIVATE KEY-----/)?.[0]; if (!cert || !key) throw new Error("Certificado PEM inválido"); return { cert, key }; }
function baseUrl() { return String(Deno.env.get("EFI_ENV") || "production").toLowerCase().startsWith("prod") ? "https://pix.api.efipay.com.br" : "https://pix-h.api.efipay.com.br"; }
async function efiToken(http: Deno.HttpClient) { const auth = btoa(`${env("EFI_CLIENT_ID")}:${env("EFI_CLIENT_SECRET")}`); const response = await fetch(`${baseUrl()}/oauth/token`, { method: "POST", client: http, headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" }, body: JSON.stringify({ grant_type: "client_credentials" }) }); const body = await response.json().catch(() => ({})); if (!response.ok || !body.access_token) throw new AppError(body?.error_description || body?.mensagem || "Falha OAuth Efí", 502); return String(body.access_token); }
async function readCharge(txid: string, token: string, http: Deno.HttpClient) { const response = await fetch(`${baseUrl()}/v2/cob/${encodeURIComponent(txid)}`, { client: http, headers: { Authorization: `Bearer ${token}` } }); return { response, body: await response.json().catch(() => ({})) }; }
async function removeCharge(txid: string, token: string, http: Deno.HttpClient) { const response = await fetch(`${baseUrl()}/v2/cob/${encodeURIComponent(txid)}`, { method: "PATCH", client: http, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" }) }); if (response.ok) return true; const current = await readCharge(txid, token, http); return ["REMOVIDA_PELO_USUARIO_RECEBEDOR", "REMOVIDA_PELO_PSP"].includes(String(current.body?.status || "").toUpperCase()); }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return originAllowed(req) ? new Response("ok", { headers: cors(req) }) : json(req, { erro: "Origem não autorizada" }, 403);
  if (req.method !== "POST") return json(req, { erro: "Método não permitido" }, 405);
  if (!originAllowed(req)) return json(req, { erro: "Origem não autorizada" }, 403);

  try {
    const authorization = req.headers.get("Authorization") || "";
    const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json(req, { erro: "Não autenticado" }, 401);

    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: rateAllowed, error: rateError } = await admin.rpc("fsfit_consumir_rate_limit_assinatura", { p_escopo: "criar_pix", p_sujeito: userData.user.id, p_limite: 2, p_janela_segundos: 60 });
    if (rateError) throw rateError;
    if (!rateAllowed) return json(req, { erro: "Aguarde antes de gerar outra cobrança PIX." }, 429);

    const body = await req.json().catch(() => ({}));
    const planoId = String(body?.plano_id || "").trim();
    if (!planoId) return json(req, { erro: "plano_id obrigatório" }, 400);

    const { data: plan, error: planError } = await userClient.from("planos_assinatura").select("id,nome,valor_centavos,intervalo_meses,meio_pagamento").eq("id", planoId).eq("ativo", true).single();
    if (planError || !plan || plan.meio_pagamento !== "pix") return json(req, { erro: "Plano PIX inválido" }, 400);

    const { data: incident, error: incidentError } = await admin.from("incidentes_financeiros").select("id").eq("personal_id", userData.user.id).eq("tipo", "pix_orfao").in("status", ["pendente", "em_analise"]).limit(1).maybeSingle();
    if (incidentError) throw incidentError;
    if (incident) return json(req, { erro: "Existe uma divergência financeira em análise. Aguarde a regularização." }, 409);

    const { cert, key } = pemParts(decode64(env("EFI_CERT_KEY_PEM_BASE64")));
    const http = Deno.createHttpClient({ cert, key });
    try {
      const token = await efiToken(http);
      const { data: pending, error: pendingError } = await admin.from("cobrancas_pix").select("id,txid,vence_em").eq("personal_id", userData.user.id).eq("status", "pendente").order("created_at", { ascending: false });
      if (pendingError) throw pendingError;
      for (const previous of pending || []) {
        const expired = previous.vence_em && new Date(previous.vence_em).getTime() <= Date.now();
        if (expired) { await admin.from("cobrancas_pix").update({ status: "expirada", updated_at: new Date().toISOString() }).eq("id", previous.id).eq("status", "pendente"); continue; }
        if (!previous.txid || await removeCharge(previous.txid, token, http)) { await admin.from("cobrancas_pix").update({ status: "cancelada", updated_at: new Date().toISOString() }).eq("id", previous.id).eq("status", "pendente"); continue; }
        const remote = await readCharge(previous.txid, token, http);
        if (String(remote.body?.status || "").toUpperCase() === "CONCLUIDA") throw new AppError("Existe um PIX pago aguardando confirmação.", 409);
        throw new AppError("Não foi possível cancelar a cobrança PIX anterior.", 502);
      }

      const txid = crypto.randomUUID().replaceAll("-", "").slice(0, 32);
      const expirationSeconds = 3600;
      const response = await fetch(`${baseUrl()}/v2/cob/${txid}`, { method: "PUT", client: http, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ calendario: { expiracao: expirationSeconds }, valor: { original: (Number(plan.valor_centavos) / 100).toFixed(2) }, chave: env("EFI_PIX_KEY"), solicitacaoPagador: `Assinatura FS Fit - ${plan.nome}` }) });
      const charge = await response.json().catch(() => ({}));
      if (!response.ok) throw new AppError(charge?.mensagem || charge?.detail || "Falha ao criar cobrança PIX", 502);

      let copyPaste: string | null = null; let qrCodeUrl: string | null = null;
      if (charge?.loc?.id) { const qrResponse = await fetch(`${baseUrl()}/v2/loc/${charge.loc.id}/qrcode`, { client: http, headers: { Authorization: `Bearer ${token}` } }); const qr = await qrResponse.json().catch(() => ({})); if (qrResponse.ok) { copyPaste = qr?.qrcode || null; qrCodeUrl = qr?.imagemQrcode || null; } }

      const { data: inserted, error: insertError } = await admin.from("cobrancas_pix").insert({ personal_id: userData.user.id, plano_id: plan.id, txid, status: "pendente", valor_centavos: plan.valor_centavos, vence_em: new Date(Date.now() + expirationSeconds * 1000).toISOString(), loc_id: charge?.loc?.id ? String(charge.loc.id) : null, loc_url: charge?.location || charge?.loc?.location || null, pix_copia_cola: copyPaste, qr_code_url: qrCodeUrl, payload_efi: charge }).select("id,txid,status,valor_centavos,vence_em,pix_copia_cola,qr_code_url").single();
      if (insertError) {
        const compensated = await removeCharge(txid, token, http).catch(() => false);
        if (!compensated) await admin.from("incidentes_financeiros").upsert({ personal_id: userData.user.id, origem: "criar-pix-fsfit", tipo: "pix_orfao", referencia_externa: txid, status: "pendente", codigo_erro: "INSERT_LOCAL_FALHOU", mensagem: insertError.message, contexto: { plano_id: plan.id, valor_centavos: plan.valor_centavos } }, { onConflict: "personal_id,referencia_externa,tipo" });
        await admin.from("eventos_financeiros").insert({ personal_id: userData.user.id, origem: "criar-pix-fsfit", tipo_evento: compensated ? "pix_compensado_apos_falha_local" : "pix_orfao_detectado", referencia_externa: txid, sucesso: compensated, codigo_erro: "INSERT_LOCAL_FALHOU", mensagem_resumida: insertError.message.slice(0, 500) });
        throw new AppError(compensated ? "Falha local; a cobrança remota foi cancelada com segurança." : "Divergência financeira detectada. Não gere outro PIX.", 500);
      }

      await admin.from("eventos_financeiros").insert({ personal_id: userData.user.id, origem: "criar-pix-fsfit", tipo_evento: "pix_criado", referencia_externa: txid, cobranca_id: inserted.id, status_novo: "pendente", sucesso: true });
      return json(req, { sucesso: true, cobranca: inserted });
    } finally { http.close(); }
  } catch (error) {
    console.error("criar-pix-fsfit", error);
    return json(req, { erro: error instanceof Error ? error.message : "Erro interno" }, error instanceof AppError ? error.status : 500);
  }
});