import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const allowedOrigins = new Set([
  "https://fit.fssolucoes.tech",
  ...String(Deno.env.get("FSFIT_ALLOWED_ORIGINS") || "").split(",").map(v => v.trim()).filter(Boolean),
]);
const cors = (req: Request) => {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://fit.fssolucoes.tech",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};
const originAllowed = (req: Request) => !req.headers.get("origin") || allowedOrigins.has(req.headers.get("origin") || "");
const json = (req: Request, data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" } });
const env = (name: string) => { const value = Deno.env.get(name); if (!value) throw new Error(`Secret ausente: ${name}`); return value; };
const FALLBACK_PAYEE_CODE = "8d3b722dfbaed4ded27c717dd8a5f682";

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
    const { data: rateAllowed, error: rateError } = await admin.rpc("fsfit_consumir_rate_limit_assinatura", {
      p_escopo: "config_cartao",
      p_sujeito: userData.user.id,
      p_limite: 10,
      p_janela_segundos: 60,
    });
    if (rateError) throw rateError;
    if (!rateAllowed) return json(req, { erro: "Muitas tentativas. Aguarde alguns segundos." }, 429);

    const payeeCode = Deno.env.get("EFI_PAYEE_CODE") || Deno.env.get("EFI_ACCOUNT_IDENTIFIER") || FALLBACK_PAYEE_CODE;
    const production = String(Deno.env.get("EFI_ENV") || "production").toLowerCase().startsWith("prod");
    return json(req, { payee_code: payeeCode, environment: production ? "production" : "sandbox" });
  } catch (error) {
    console.error("config-assinatura-cartao-fsfit", error);
    return json(req, { erro: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});