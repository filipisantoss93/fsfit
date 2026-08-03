import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
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
    method: "POST", client: http,
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(body?.error_description || body?.mensagem || "Falha OAuth Efí");
  return String(body.access_token);
}

async function getCharge(txid: string, token: string, http: Deno.HttpClient) {
  const response = await fetch(`${baseUrl()}/v2/cob/${encodeURIComponent(txid)}`, {
    client: http, headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function removeCharge(txid: string, token: string, http: Deno.HttpClient) {
  const response = await fetch(`${baseUrl()}/v2/cob/${encodeURIComponent(txid)}`, {
    method: "PATCH", client: http,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" }),
  });
  if (response.ok) return true;
  const remote = await getCharge(txid, token, http);
  return ["REMOVIDA_PELO_USUARIO_RECEBEDOR", "REMOVIDA_PELO_PSP"].includes(String(remote.body?.status || "").toUpperCase());
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false }, 405);
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const supplied = req.headers.get("x-cron-secret") || "";
  const { data: secret, error: secretError } = await db.from("app_runtime_secrets").select("cron_secret").eq("id", 1).maybeSingle();
  if (secretError || !secret?.cron_secret || supplied !== secret.cron_secret) return json({ ok: false }, 401);

  const { cert, key } = pemParts(decode64(env("EFI_CERT_KEY_PEM_BASE64")));
  const http = Deno.createHttpClient({ cert, key });
  const result = { analisadas: 0, pagas: 0, removidas: 0, expiradas: 0, incidentes_resolvidos: 0, falhas: 0 };

  try {
    const token = await efiToken(http);
    const { data: charges, error: chargesError } = await db
      .from("cobrancas_pix")
      .select("id,personal_id,txid,status,vence_em")
      .eq("status", "pendente")
      .order("created_at", { ascending: true })
      .limit(100);
    if (chargesError) throw chargesError;

    for (const charge of charges || []) {
      result.analisadas += 1;
      try {
        const remote = await getCharge(charge.txid, token, http);
        if (!remote.response.ok) throw new Error(remote.body?.mensagem || remote.body?.detail || "Falha ao consultar cobrança na Efí");
        const status = String(remote.body?.status || "").toUpperCase();
        let statusNovo: string | null = null;
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

        if (status === "CONCLUIDA") {
          const pix = Array.isArray(remote.body?.pix) && remote.body.pix.length ? remote.body.pix[0] : null;
          statusNovo = "paga";
          patch.status = statusNovo;
          patch.pago_em = typeof pix?.horario === "string" ? pix.horario : new Date().toISOString();
          patch.e2e_id = typeof pix?.endToEndId === "string" ? pix.endToEndId : null;
          result.pagas += 1;
        } else if (["REMOVIDA_PELO_USUARIO_RECEBEDOR", "REMOVIDA_PELO_PSP"].includes(status)) {
          statusNovo = "cancelada";
          patch.status = statusNovo;
          result.removidas += 1;
        } else if (charge.vence_em && new Date(charge.vence_em).getTime() <= Date.now()) {
          statusNovo = "expirada";
          patch.status = statusNovo;
          result.expiradas += 1;
        }

        if (statusNovo) {
          const { error: updateError } = await db.from("cobrancas_pix").update(patch).eq("id", charge.id).eq("status", "pendente");
          if (updateError) throw updateError;
          await db.from("eventos_financeiros").insert({
            personal_id: charge.personal_id, origem: "reconciliacao", tipo_evento: `pix_${statusNovo}`,
            referencia_externa: charge.txid, cobranca_id: charge.id,
            status_anterior: "pendente", status_novo: statusNovo, sucesso: true,
          });
        }
      } catch (error) {
        result.falhas += 1;
        await db.from("eventos_financeiros").insert({
          personal_id: charge.personal_id, origem: "reconciliacao", tipo_evento: "falha_reconciliacao_pix",
          referencia_externa: charge.txid, cobranca_id: charge.id, sucesso: false,
          codigo_erro: "RECONCILIACAO_PIX", mensagem_resumida: error instanceof Error ? error.message.slice(0, 500) : "Erro desconhecido",
        });
      }
    }

    const { data: incidents, error: incidentsError } = await db
      .from("incidentes_financeiros")
      .select("id,personal_id,referencia_externa,tentativas")
      .eq("tipo", "pix_orfao")
      .in("status", ["pendente", "em_analise"])
      .order("created_at", { ascending: true })
      .limit(50);
    if (incidentsError) throw incidentsError;

    for (const incident of incidents || []) {
      const txid = String(incident.referencia_externa || "");
      if (!txid) continue;
      try {
        if (!await removeCharge(txid, token, http)) throw new Error("Cobrança remota ainda não foi removida");
        await db.from("incidentes_financeiros").update({
          status: "resolvido", tentativas: Number(incident.tentativas || 0) + 1,
          ultima_tentativa_em: new Date().toISOString(),
        }).eq("id", incident.id);
        result.incidentes_resolvidos += 1;
      } catch (error) {
        result.falhas += 1;
        await db.from("incidentes_financeiros").update({
          status: "em_analise", tentativas: Number(incident.tentativas || 0) + 1,
          ultima_tentativa_em: new Date().toISOString(),
          mensagem: error instanceof Error ? error.message.slice(0, 1000) : "Erro desconhecido",
        }).eq("id", incident.id);
      }
    }

    await db.from("eventos_financeiros").insert({
      origem: "reconciliacao", tipo_evento: "ciclo_reconciliacao_concluido",
      sucesso: result.falhas === 0, mensagem_resumida: JSON.stringify(result),
    });
    return json({ ok: true, ...result });
  } catch (error) {
    console.error("reconciliar-pagamentos-fsfit", error);
    return json({ ok: false, erro: error instanceof Error ? error.message : "Erro interno" }, 500);
  } finally {
    http.close();
  }
});