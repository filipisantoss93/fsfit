import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve((req: Request) => {
  const origin = req.headers.get("origin") || "";
  const allowedOrigin = ["https://fsfit.com.br", "https://www.fsfit.com.br"].includes(origin) ? origin : "https://fsfit.com.br";
  const headers = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": allowedOrigin,
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  return new Response(
    JSON.stringify({ sucesso: false, erro: "O Pix automático para mensalidades foi desativado. Use o QR Code direto do personal." }),
    { status: 410, headers },
  );
});
