import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function tokenFromRequest(req: Request) {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("token");
  if (fromQuery) return fromQuery;
  const marker = "/webhook-efi-pix/";
  const pos = url.pathname.indexOf(marker);
  if (pos < 0) return "";
  const rest = url.pathname.slice(pos + marker.length).split("/").filter(Boolean);
  return rest[0] || "";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false }, 405);

  const token = tokenFromRequest(req);
  if (!token) return json({ ok: false }, 401);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceRole) return json({ ok: false }, 500);

  const db = createClient(url, serviceRole);
  const body = await req.json().catch(() => ({}));
  const itens = Array.isArray(body?.pix) ? body.pix : [];
  const resultados: Array<{ txid: string; ok: boolean }> = [];

  for (const item of itens) {
    const txid = typeof item?.txid === "string" ? item.txid : "";
    if (!txid) continue;
    const { data, error } = await db.rpc("fsfit_baixar_pix_webhook", {
      p_token: token,
      p_txid: txid,
      p_pago_em: typeof item?.horario === "string" ? item.horario : new Date().toISOString(),
      p_e2e_id: typeof item?.endToEndId === "string" ? item.endToEndId : null,
    });
    resultados.push({ txid, ok: !error && data === true });
  }

  return json({ ok: true, resultados });
});