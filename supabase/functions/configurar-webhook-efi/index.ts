import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Secret ausente: ${name}`);
  return value;
}

function decode64(value: string) {
  return new TextDecoder().decode(Uint8Array.from(atob(value), (char) => char.charCodeAt(0)));
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

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function gerarWebhookSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function efiToken(client: Deno.HttpClient) {
  const authorization = btoa(`${env("EFI_CLIENT_ID")}:${env("EFI_CLIENT_SECRET")}`);
  const response = await fetch(`${baseUrl()}/oauth/token`, {
    method: "POST",
    client,
    headers: { Authorization: `Basic ${authorization}`, "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(payload?.error_description || payload?.mensagem || "Falha OAuth Efí");
  }
  return String(payload.access_token);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);

  try {
    const authorization = req.headers.get("Authorization") || "";
    const jwt = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return json({ erro: "Não autenticado" }, 401);

    const supabaseUrl = env("SUPABASE_URL");
    const admin = createClient(supabaseUrl, env("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: userData, error: userError } = await admin.auth.getUser(jwt);
    if (userError || !userData.user) return json({ erro: "Não autenticado" }, 401);

    const { data: adminRow, error: adminError } = await admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (adminError) throw adminError;
    if (!adminRow) return json({ erro: "Acesso restrito à administração da plataforma" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "consultar").toLowerCase();
    if (!["consultar", "registrar", "rotacionar"].includes(action)) {
      return json({ erro: "Ação inválida" }, 400);
    }

    const { cert, key } = pemParts(decode64(env("EFI_CERT_KEY_PEM_BASE64")));
    const client = Deno.createHttpClient({ cert, key });

    try {
      const accessToken = await efiToken(client);
      const pixKey = encodeURIComponent(env("EFI_PIX_KEY"));

      if (action === "consultar") {
        const response = await fetch(`${baseUrl()}/v2/webhook/${pixKey}`, {
          client,
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const payload = await response.json().catch(() => ({}));
        return json({
          sucesso: response.ok,
          status: response.status,
          configurado: Boolean(payload?.webhookUrl || payload?.webhook_url),
        }, response.ok ? 200 : response.status);
      }

      const { data: secretRow, error: secretReadError } = await admin
        .from("app_runtime_secrets")
        .select("efi_webhook_secret")
        .eq("id", 1)
        .maybeSingle();
      if (secretReadError) throw secretReadError;

      const existingSecret = typeof secretRow?.efi_webhook_secret === "string"
        ? secretRow.efi_webhook_secret.trim()
        : "";
      const webhookSecret = action === "rotacionar" || !/^[a-f0-9]{64}$/i.test(existingSecret)
        ? gerarWebhookSecret()
        : existingSecret;

      if (webhookSecret !== existingSecret) {
        const { error: secretWriteError } = await admin
          .from("app_runtime_secrets")
          .update({ efi_webhook_secret: webhookSecret })
          .eq("id", 1);
        if (secretWriteError) throw secretWriteError;
      }

      const webhookUrl = `${supabaseUrl}/functions/v1/webhook-efi-pix/${webhookSecret}`;
      const response = await fetch(`${baseUrl()}/v2/webhook/${pixKey}`, {
        method: "PUT",
        client,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "x-skip-mtls-checking": "true",
        },
        body: JSON.stringify({ webhookUrl }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return json({
          sucesso: false,
          status: response.status,
          erro: payload?.mensagem || payload?.message || "Falha ao registrar webhook",
        }, response.status);
      }

      return json({
        sucesso: true,
        status: response.status,
        configurado: true,
        segredo_rotacionado: webhookSecret !== existingSecret,
      });
    } finally {
      client.close();
    }
  } catch (error) {
    console.error("configurar-webhook-efi", error);
    return json({ erro: "Não foi possível configurar o webhook" }, 500);
  }
});
