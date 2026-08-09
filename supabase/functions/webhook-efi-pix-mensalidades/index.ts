import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { adminClient, sha256Hex, webhookJson } from "../_shared/efi-pix-personal.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return webhookJson({ ok: false }, 405);
  if (Number(req.headers.get("content-length") || 0) > 131072) return webhookJson({ ok: false }, 413);

  const url = new URL(req.url);
  const token = String(url.searchParams.get("token") || "").trim();
  if (!/^[a-f0-9]{64}$/.test(token)) return webhookJson({ ok: false }, 401);

  const admin = adminClient();
  const tokenHash = await sha256Hex(token);
  const { data: integration, error: integrationError } = await admin
    .from("integracoes_pix_personal")
    .select("personal_id,status")
    .eq("webhook_token_hash", tokenHash)
    .in("status", ["pendente", "ativa"])
    .maybeSingle();
  if (integrationError) return webhookJson({ ok: false }, 500);
  if (!integration) return webhookJson({ ok: false }, 401);

  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body?.pix) ? body.pix.slice(0, 50) : [];
  if (!items.length) return webhookJson({ ok: true, teste: true, resultados: [] });

  const results: Array<Record<string, unknown>> = [];
  let temporaryFailure = false;

  for (const item of items) {
    const txid = typeof item?.txid === "string" ? item.txid.trim() : "";
    if (!/^[A-Za-z0-9]{26,35}$/.test(txid)) continue;
    const value = Number(String(item?.valor || "").replace(",", "."));
    const { data, error } = await admin.rpc("fsfit_baixar_pix_mensalidade", {
      p_txid: txid,
      p_pago_em: typeof item?.horario === "string" ? item.horario : new Date().toISOString(),
      p_e2e_id: typeof item?.endToEndId === "string" ? item.endToEndId : null,
      p_valor: Number.isFinite(value) ? value : null,
      p_payload: item,
      p_origem: "pix_webhook",
      p_webhook_token: token,
    });
    if (error) {
      temporaryFailure = true;
      results.push({ txid, ok: false });
      continue;
    }
    results.push({ txid, ok: Boolean(data?.ok), duplicado: Boolean(data?.duplicado), erro: data?.erro || null });
  }

  return webhookJson({ ok: !temporaryFailure, resultados: results }, temporaryFailure ? 500 : 200);
});
