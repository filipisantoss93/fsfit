import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const env = (name: string) => { const value = Deno.env.get(name); if (!value) throw new Error(`Secret ausente: ${name}`); return value; };
const decode64 = (value: string) => new TextDecoder().decode(Uint8Array.from(atob(value), c => c.charCodeAt(0)));

function pemParts(pem: string) {
  const cert = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/)?.[0];
  const key = pem.match(/-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA )?PRIVATE KEY-----/)?.[0];
  if (!cert || !key) throw new Error("Certificado PEM inválido");
  return { cert, key };
}

function baseUrl() {
  return String(Deno.env.get("EFI_ENV") || "production").toLowerCase().startsWith("prod")
    ? "https://pix.api.efipay.com.br"
    : "https://pix-h.api.efipay.com.br";
}

async function efiToken(http: Deno.HttpClient) {
  const auth = btoa(`${env("EFI_CLIENT_ID")}:${env("EFI_CLIENT_SECRET")}`);
  const response = await fetch(`${baseUrl()}/oauth/token`, {
    method: "POST",
    client: http,
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(body?.error_description || body?.mensagem || "Falha ao autenticar na Efí");
  return String(body.access_token);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);

  try {
    const url = env("SUPABASE_URL");
    const anon = env("SUPABASE_ANON_KEY");
    const auth = req.headers.get("Authorization") || "";
    const client = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) return json({ erro: "Não autenticado" }, 401);

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "");
    if (!id) return json({ erro: "id obrigatório" }, 400);

    const { data: charge, error: chargeError } = await client
      .from("cobrancas_pix")
      .select("id,txid,status,pago_em,processada_em,assinatura_id")
      .eq("id", id)
      .eq("personal_id", userData.user.id)
      .maybeSingle();
    if (chargeError) return json({ erro: chargeError.message }, 500);
    if (!charge) return json({ erro: "Cobrança não encontrada" }, 404);
    if (charge.status === "paga" || charge.processada_em) return json({ sucesso: true, cobranca: charge });

    const { cert, key } = pemParts(decode64(env("EFI_CERT_KEY_PEM_BASE64")));
    const http = Deno.createHttpClient({ cert, key });
    try {
      const token = await efiToken(http);
      const response = await fetch(`${baseUrl()}/v2/cob/${encodeURIComponent(charge.txid)}`, {
        client: http,
        headers: { Authorization: `Bearer ${token}` },
      });
      const efi = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(efi?.mensagem || efi?.detail || "Não foi possível consultar a cobrança na Efí");

      if (String(efi?.status || "").toUpperCase() === "CONCLUIDA") {
        const pix = Array.isArray(efi?.pix) && efi.pix.length ? efi.pix[0] : null;
        const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"));
        const { error: updateError } = await admin
          .from("cobrancas_pix")
          .update({
            status: "paga",
            pago_em: typeof pix?.horario === "string" ? pix.horario : new Date().toISOString(),
            e2e_id: typeof pix?.endToEndId === "string" ? pix.endToEndId : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", charge.id)
          .eq("personal_id", userData.user.id);
        if (updateError) throw updateError;
      }

      const { data: updated, error: readError } = await client
        .from("cobrancas_pix")
        .select("id,txid,status,pago_em,processada_em,assinatura_id")
        .eq("id", id)
        .eq("personal_id", userData.user.id)
        .maybeSingle();
      if (readError) return json({ erro: readError.message }, 500);
      return json({ sucesso: true, cobranca: updated, status_efi: efi?.status || null });
    } finally {
      http.close();
    }
  } catch (error) {
    console.error("verificar-pix-fsfit", error);
    return json({ erro: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});
