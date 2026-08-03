import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const allowedOrigins = new Set([
  "https://fit.fssolucoes.tech",
  ...String(Deno.env.get("FSFIT_ALLOWED_ORIGINS") || "").split(",").map(v => v.trim()).filter(Boolean),
]);
function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://fit.fssolucoes.tech",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function originAllowed(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || allowedOrigins.has(origin);
}
function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return originAllowed(req) ? new Response("ok", { headers: cors(req) }) : json(req, { erro: "Origem não autorizada" }, 403);
  if (req.method !== "POST") return json(req, { erro: "Método não permitido" }, 405);
  if (!originAllowed(req)) return json(req, { erro: "Origem não autorizada" }, 403);

  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!url || !anon || !serviceRole) throw new Error("Configuração interna ausente");

    const authorization = req.headers.get("Authorization") || "";
    const client = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) return json(req, { erro: "Não autenticado" }, 401);

    const admin = createClient(url, serviceRole);
    const { data: rateAllowed, error: rateError } = await admin.rpc("fsfit_consumir_rate_limit_assinatura", {
      p_escopo: "verificar_pix",
      p_sujeito: userData.user.id,
      p_limite: 8,
      p_janela_segundos: 60,
    });
    if (rateError) throw rateError;
    if (!rateAllowed) return json(req, { erro: "Muitas verificações em pouco tempo. Aguarde alguns segundos." }, 429);

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    if (!id) return json(req, { erro: "id obrigatório" }, 400);

    const { data, error } = await client
      .from("cobrancas_pix")
      .select("id,txid,status,pago_em,processada_em,assinatura_id,vence_em")
      .eq("id", id)
      .eq("personal_id", userData.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return json(req, { erro: "Cobrança não encontrada" }, 404);

    return json(req, { sucesso: true, cobranca: data });
  } catch (error) {
    console.error("verificar-pix-fsfit", error);
    return json(req, { erro: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});