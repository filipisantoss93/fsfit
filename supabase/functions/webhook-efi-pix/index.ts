import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
const enc = new TextEncoder();
const hex = (bytes: Uint8Array) => Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value))));

function tokenFromRequest(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get("token");
  if (query) return query;
  const marker = "/webhook-efi-pix/";
  const pos = url.pathname.indexOf(marker);
  if (pos < 0) return "";
  return url.pathname.slice(pos + marker.length).split("/").filter(Boolean)[0] || "";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405);
  if (Number(req.headers.get("content-length") || 0) > 131072) return json({ ok: false }, 413);

  const token = tokenFromRequest(req);
  if (!token || token.length < 24 || token.length > 200) return json({ ok: false }, 401);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceRole) return json({ ok: false }, 500);
  const db = createClient(url, serviceRole);

  const body = await req.json().catch(() => null);
  const itens = Array.isArray(body?.pix) ? body.pix.slice(0, 50) : [];
  if (!itens.length) return json({ ok: true, resultados: [] });

  const tokenHash = await sha256(token);
  const resultados: Array<{ txid: string; ok: boolean; duplicado?: boolean }> = [];

  for (const item of itens) {
    const txid = typeof item?.txid === "string" ? item.txid.trim() : "";
    if (!/^[A-Za-z0-9-]{10,80}$/.test(txid)) continue;
    const eventHash = await sha256(`pix:${tokenHash}:${txid}:${String(item?.endToEndId || "")}`);
    const { data: state, error: stateError } = await db.rpc("fsfit_iniciar_evento_webhook_efi", { p_origem: "pix", p_chave_hash: eventHash });
    if (stateError) {
      resultados.push({ txid, ok: false });
      continue;
    }
    if (state === "duplicado" || state === "em_processamento") {
      resultados.push({ txid, ok: true, duplicado: true });
      continue;
    }

    try {
      const { data, error } = await db.rpc("fsfit_baixar_pix_webhook", {
        p_token: token,
        p_txid: txid,
        p_pago_em: typeof item?.horario === "string" ? item.horario : new Date().toISOString(),
        p_e2e_id: typeof item?.endToEndId === "string" ? item.endToEndId.slice(0, 120) : null,
      });
      const ok = !error && data === true;
      await db.rpc("fsfit_finalizar_evento_webhook_efi", { p_origem: "pix", p_chave_hash: eventHash, p_sucesso: ok, p_erro: error?.message || null });
      resultados.push({ txid, ok });
    } catch (error) {
      await db.rpc("fsfit_finalizar_evento_webhook_efi", { p_origem: "pix", p_chave_hash: eventHash, p_sucesso: false, p_erro: error instanceof Error ? error.message : "erro" });
      resultados.push({ txid, ok: false });
    }
  }

  return json({ ok: true, resultados });
});