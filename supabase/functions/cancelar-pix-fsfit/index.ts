import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const allowedOrigins = new Set(["https://fit.fssolucoes.tech", ...String(Deno.env.get("FSFIT_ALLOWED_ORIGINS") || "").split(",").map(v => v.trim()).filter(Boolean)]);
const cors = (req: Request) => { const origin = req.headers.get("origin") || ""; return { "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://fit.fssolucoes.tech", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" }; };
const originAllowed = (req: Request) => !req.headers.get("origin") || allowedOrigins.has(req.headers.get("origin") || "");
const json = (req: Request, data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" } });
const env = (name: string) => { const value = Deno.env.get(name); if (!value) throw new Error(`Secret ausente: ${name}`); return value; };
const decode64 = (value: string) => new TextDecoder().decode(Uint8Array.from(atob(value), c => c.charCodeAt(0)));
function pemParts(pem: string) { const cert = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/)?.[0]; const key = pem.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA )?PRIVATE KEY-----/)?.[0]; if (!cert || !key) throw new Error("Certificado PEM inválido"); return { cert, key }; }
function baseUrl() { return String(Deno.env.get("EFI_ENV") || "production").toLowerCase().startsWith("prod") ? "https://pix.api.efipay.com.br" : "https://pix-h.api.efipay.com.br"; }
async function efiToken(http: Deno.HttpClient) { const auth = btoa(`${env("EFI_CLIENT_ID")}:${env("EFI_CLIENT_SECRET")}`); const response = await fetch(`${baseUrl()}/oauth/token`, { method: "POST", client: http, headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" }, body: JSON.stringify({ grant_type: "client_credentials" }) }); const body = await response.json().catch(() => ({})); if (!response.ok || !body.access_token) throw new Error(body?.error_description || body?.mensagem || "Falha OAuth Efí"); return String(body.access_token); }
async function readCharge(txid: string, token: string, http: Deno.HttpClient) { const response = await fetch(`${baseUrl()}/v2/cob/${encodeURIComponent(txid)}`, { client: http, headers: { Authorization: `Bearer ${token}` } }); return { response, body: await response.json().catch(() => ({})) }; }

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
    const { data: rateAllowed, error: rateError } = await admin.rpc("fsfit_consumir_rate_limit_assinatura", { p_escopo: "cancelar_pix", p_sujeito: userData.user.id, p_limite: 4, p_janela_segundos: 60 });
    if (rateError) throw rateError;
    if (!rateAllowed) return json(req, { erro: "Muitas tentativas de cancelamento. Aguarde alguns segundos." }, 429);

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    if (!id) return json(req, { erro: "id obrigatório" }, 400);

    const { data: charge, error: chargeError } = await admin.from("cobrancas_pix").select("id,personal_id,txid,status,vence_em").eq("id", id).eq("personal_id", userData.user.id).maybeSingle();
    if (chargeError) throw chargeError;
    if (!charge) return json(req, { erro: "Cobrança não encontrada" }, 404);
    if (["cancelada", "expirada"].includes(charge.status)) return json(req, { sucesso: true, cobranca: { id: charge.id, status: charge.status } });
    if (charge.status !== "pendente") return json(req, { erro: "Somente cobranças PIX pendentes podem ser canceladas" }, 409);

    if (charge.vence_em && new Date(charge.vence_em).getTime() <= Date.now()) {
      await admin.from("cobrancas_pix").update({ status: "expirada", updated_at: new Date().toISOString() }).eq("id", charge.id).eq("status", "pendente");
      return json(req, { sucesso: true, cobranca: { id: charge.id, status: "expirada" } });
    }

    if (!charge.txid) {
      await admin.from("cobrancas_pix").update({ status: "cancelada", updated_at: new Date().toISOString() }).eq("id", charge.id).eq("status", "pendente");
      return json(req, { sucesso: true, cobranca: { id: charge.id, status: "cancelada" } });
    }

    const { cert, key } = pemParts(decode64(env("EFI_CERT_KEY_PEM_BASE64")));
    const http = Deno.createHttpClient({ cert, key });
    try {
      const token = await efiToken(http);
      const cancelResponse = await fetch(`${baseUrl()}/v2/cob/${encodeURIComponent(charge.txid)}`, { method: "PATCH", client: http, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" }) });
      let removable = cancelResponse.ok;
      if (!removable) {
        const current = await readCharge(charge.txid, token, http);
        const status = String(current.body?.status || "").toUpperCase();
        if (["REMOVIDA_PELO_USUARIO_RECEBEDOR", "REMOVIDA_PELO_PSP"].includes(status)) removable = true;
        else if (status === "CONCLUIDA") return json(req, { erro: "Este PIX já foi pago e está aguardando confirmação" }, 409);
        else return json(req, { erro: "Não foi possível cancelar a cobrança na Efí" }, 502);
      }

      const { data: updated, error: updateError } = await admin.from("cobrancas_pix").update({ status: "cancelada", updated_at: new Date().toISOString() }).eq("id", charge.id).eq("personal_id", userData.user.id).eq("status", "pendente").select("id,status").maybeSingle();
      if (updateError) throw updateError;
      await admin.from("eventos_financeiros").insert({ personal_id: userData.user.id, origem: "cancelar-pix-fsfit", tipo_evento: "pix_cancelado", referencia_externa: charge.txid, cobranca_id: charge.id, status_anterior: "pendente", status_novo: "cancelada", sucesso: true });
      return json(req, { sucesso: true, cobranca: updated || { id: charge.id, status: "cancelada" } });
    } finally { http.close(); }
  } catch (error) {
    console.error("cancelar-pix-fsfit", error);
    return json(req, { erro: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});