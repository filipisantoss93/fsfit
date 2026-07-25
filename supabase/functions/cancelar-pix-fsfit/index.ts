import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Secret ausente: ${name}`);
  return value;
}

function decode64(value: string) {
  return new TextDecoder().decode(Uint8Array.from(atob(value), char => char.charCodeAt(0)));
}

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

async function efiToken(client: Deno.HttpClient) {
  const auth = btoa(`${env("EFI_CLIENT_ID")}:${env("EFI_CLIENT_SECRET")}`);
  const response = await fetch(`${baseUrl()}/oauth/token`, {
    method: "POST",
    client,
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(body?.error_description || body?.mensagem || "Falha OAuth Efí");
  }
  return body.access_token as string;
}

async function readCharge(txid: string, accessToken: string, client: Deno.HttpClient) {
  const response = await fetch(`${baseUrl()}/v2/cob/${encodeURIComponent(txid)}`, {
    client,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);

  try {
    const authorization = req.headers.get("Authorization") || "";
    const userClient = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ erro: "Não autenticado" }, 401);

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "");
    if (!id) return json({ erro: "id obrigatório" }, 400);

    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: charge, error: chargeError } = await admin
      .from("cobrancas_pix")
      .select("id,personal_id,txid,status,vence_em")
      .eq("id", id)
      .eq("personal_id", authData.user.id)
      .maybeSingle();

    if (chargeError) throw chargeError;
    if (!charge) return json({ erro: "Cobrança não encontrada" }, 404);
    if (charge.status === "cancelada" || charge.status === "expirada") {
      return json({ sucesso: true, cobranca: { id: charge.id, status: charge.status } });
    }
    if (charge.status !== "pendente") {
      return json({ erro: "Somente cobranças PIX pendentes podem ser canceladas" }, 409);
    }

    const expiresAt = charge.vence_em ? new Date(charge.vence_em).getTime() : Number.NaN;
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      const { error: expireError } = await admin
        .from("cobrancas_pix")
        .update({ status: "expirada", updated_at: new Date().toISOString() })
        .eq("id", charge.id)
        .eq("status", "pendente");
      if (expireError) throw expireError;
      return json({ sucesso: true, cobranca: { id: charge.id, status: "expirada" } });
    }

    if (!charge.txid) {
      const { error: updateError } = await admin
        .from("cobrancas_pix")
        .update({ status: "cancelada", updated_at: new Date().toISOString() })
        .eq("id", charge.id)
        .eq("status", "pendente");
      if (updateError) throw updateError;
      return json({ sucesso: true, cobranca: { id: charge.id, status: "cancelada" } });
    }

    const { cert, key } = pemParts(decode64(env("EFI_CERT_KEY_PEM_BASE64")));
    const httpClient = Deno.createHttpClient({ cert, key });

    try {
      const accessToken = await efiToken(httpClient);
      const cancelResponse = await fetch(`${baseUrl()}/v2/cob/${encodeURIComponent(charge.txid)}`, {
        method: "PATCH",
        client: httpClient,
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" }),
      });
      const cancelBody = await cancelResponse.json().catch(() => ({}));

      let removable = cancelResponse.ok;
      if (!removable) {
        const current = await readCharge(charge.txid, accessToken, httpClient);
        const remoteStatus = String(current.body?.status || "").toUpperCase();
        if (remoteStatus === "REMOVIDA_PELO_USUARIO_RECEBEDOR" || remoteStatus === "REMOVIDA_PELO_PSP") {
          removable = true;
        } else if (remoteStatus === "CONCLUIDA") {
          return json({ erro: "Este PIX já foi pago e está aguardando confirmação no FS Fit" }, 409);
        } else {
          const message = cancelBody?.mensagem || cancelBody?.detail || current.body?.mensagem || "Não foi possível cancelar a cobrança na Efí";
          return json({ erro: message }, cancelResponse.status >= 400 ? cancelResponse.status : 502);
        }
      }

      const { data: updated, error: updateError } = await admin
        .from("cobrancas_pix")
        .update({ status: "cancelada", updated_at: new Date().toISOString() })
        .eq("id", charge.id)
        .eq("personal_id", authData.user.id)
        .eq("status", "pendente")
        .select("id,status")
        .maybeSingle();

      if (updateError) throw updateError;
      return json({ sucesso: true, cobranca: updated || { id: charge.id, status: "cancelada" } });
    } finally {
      httpClient.close();
    }
  } catch (error) {
    console.error("cancelar-pix-fsfit", error);
    return json({ erro: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});