import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class AppError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

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
    throw new AppError(body?.error_description || body?.mensagem || "Falha OAuth Efí", 502);
  }
  return body.access_token as string;
}

async function getRemoteCharge(txid: string, accessToken: string, client: Deno.HttpClient) {
  const response = await fetch(`${baseUrl()}/v2/cob/${encodeURIComponent(txid)}`, {
    client,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function cancelPreviousPendingCharges(
  admin: ReturnType<typeof createClient>,
  personalId: string,
  accessToken: string,
  client: Deno.HttpClient,
) {
  const { data: pending, error } = await admin
    .from("cobrancas_pix")
    .select("id,txid,status,vence_em")
    .eq("personal_id", personalId)
    .eq("status", "pendente")
    .order("created_at", { ascending: false });

  if (error) throw error;

  for (const charge of pending || []) {
    const expiresAt = charge.vence_em ? new Date(charge.vence_em).getTime() : Number.NaN;
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      const { error: expireError } = await admin
        .from("cobrancas_pix")
        .update({ status: "expirada", updated_at: new Date().toISOString() })
        .eq("id", charge.id)
        .eq("status", "pendente");
      if (expireError) throw expireError;
      continue;
    }

    let canceled = !charge.txid;

    if (charge.txid) {
      const response = await fetch(`${baseUrl()}/v2/cob/${encodeURIComponent(charge.txid)}`, {
        method: "PATCH",
        client,
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" }),
      });

      if (response.ok) {
        canceled = true;
      } else {
        const remote = await getRemoteCharge(charge.txid, accessToken, client);
        const remoteStatus = String(remote.body?.status || "").toUpperCase();
        if (remoteStatus === "REMOVIDA_PELO_USUARIO_RECEBEDOR" || remoteStatus === "REMOVIDA_PELO_PSP") {
          canceled = true;
        } else if (remoteStatus === "CONCLUIDA") {
          throw new AppError("Existe um PIX pago aguardando confirmação. Aguarde a atualização antes de gerar outra cobrança.", 409);
        } else {
          throw new AppError("Não foi possível cancelar a cobrança PIX anterior. Tente novamente em instantes.", 502);
        }
      }
    }

    if (canceled) {
      const { error: updateError } = await admin
        .from("cobrancas_pix")
        .update({ status: "cancelada", updated_at: new Date().toISOString() })
        .eq("id", charge.id)
        .eq("status", "pendente");
      if (updateError) throw updateError;
    }
  }
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

    const requestBody = await req.json().catch(() => ({}));
    const planoId = String(requestBody?.plano_id || "");
    if (!planoId) return json({ erro: "plano_id obrigatório" }, 400);

    const { data: plano, error: planError } = await userClient
      .from("planos_assinatura")
      .select("id,codigo,nome,valor_centavos,intervalo_meses,ativo,meio_pagamento")
      .eq("id", planoId)
      .eq("ativo", true)
      .single();

    if (planError || !plano || plano.meio_pagamento !== "pix") {
      return json({ erro: "Plano PIX inválido" }, 400);
    }

    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
    const { cert, key } = pemParts(decode64(env("EFI_CERT_KEY_PEM_BASE64")));
    const httpClient = Deno.createHttpClient({ cert, key });

    try {
      const accessToken = await efiToken(httpClient);
      await cancelPreviousPendingCharges(admin, authData.user.id, accessToken, httpClient);

      const txid = crypto.randomUUID().replaceAll("-", "").slice(0, 32);
      const expirationSeconds = 3600;
      const amount = (Number(plano.valor_centavos) / 100).toFixed(2);
      const payload = {
        calendario: { expiracao: expirationSeconds },
        valor: { original: amount },
        chave: env("EFI_PIX_KEY"),
        solicitacaoPagador: `Assinatura FS Fit - ${plano.nome}`,
      };

      const response = await fetch(`${baseUrl()}/v2/cob/${txid}`, {
        method: "PUT",
        client: httpClient,
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const charge = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new AppError(charge?.mensagem || charge?.detail || charge?.nome || "Falha ao criar cobrança PIX", 502);
      }

      let copyPaste: string | null = null;
      let qrCodeUrl: string | null = null;
      if (charge?.loc?.id) {
        const qrResponse = await fetch(`${baseUrl()}/v2/loc/${charge.loc.id}/qrcode`, {
          client: httpClient,
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const qrBody = await qrResponse.json().catch(() => ({}));
        if (qrResponse.ok) {
          copyPaste = qrBody?.qrcode || null;
          qrCodeUrl = qrBody?.imagemQrcode || null;
        }
      }

      const { data: inserted, error: insertError } = await admin
        .from("cobrancas_pix")
        .insert({
          personal_id: authData.user.id,
          plano_id: plano.id,
          txid,
          status: "pendente",
          valor_centavos: plano.valor_centavos,
          vence_em: new Date(Date.now() + expirationSeconds * 1000).toISOString(),
          loc_id: charge?.loc?.id ? String(charge.loc.id) : null,
          loc_url: charge?.location || charge?.loc?.location || null,
          pix_copia_cola: copyPaste,
          qr_code_url: qrCodeUrl,
          payload_efi: charge,
        })
        .select("id,txid,status,valor_centavos,vence_em,pix_copia_cola,qr_code_url")
        .single();

      if (insertError) {
        throw new AppError(`Cobrança criada na Efí, mas falhou ao salvar no FS Fit: ${insertError.message}`, 500);
      }

      return json({ sucesso: true, cobranca: inserted });
    } finally {
      httpClient.close();
    }
  } catch (error) {
    console.error("criar-pix-fsfit", error);
    const status = error instanceof AppError ? error.status : 500;
    return json({ erro: error instanceof Error ? error.message : "Erro interno" }, status);
  }
});