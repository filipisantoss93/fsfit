import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

export const ALLOWED_ORIGINS = new Set([
  "https://fit.fssolucoes.tech",
  "https://fsfit.com.br",
  "https://www.fsfit.com.br",
]);

const encoder = new TextEncoder();

export function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Secret ausente: ${name}`);
  return value;
}

export function adminClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function requestOriginAllowed(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || ALLOWED_ORIGINS.has(origin);
}

export function responseHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://www.fsfit.com.br",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  };
}

export function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(req) });
}

export function webhookJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomHex(bytes = 32) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function authenticatedUser(req: Request, admin = adminClient()) {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return null;
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return null;
  return data.user;
}

export async function consumeRateLimit(
  admin: ReturnType<typeof adminClient>,
  scope: string,
  key: string,
  limit: number,
  windowSeconds: number,
) {
  const { data, error } = await admin.rpc("fsfit_consumir_limite_edge", {
    p_scope: scope,
    p_chave_hash: await sha256Hex(key),
    p_limite: limit,
    p_janela_segundos: windowSeconds,
  });
  if (error) throw error;
  const state = Array.isArray(data) ? data[0] : data;
  return Boolean(state?.permitido);
}

export type EfiPixCredentials = {
  ambiente: "homologacao" | "producao";
  certificado_pem: string;
  client_id: string;
  client_secret: string;
  pix_chave: string;
  personal_id?: string;
  status?: string;
};

export function normalizeEfiCredentials(raw: Record<string, unknown>): EfiPixCredentials {
  const ambiente = String(raw.ambiente || "producao") === "homologacao" ? "homologacao" : "producao";
  const credentials: EfiPixCredentials = {
    ambiente,
    certificado_pem: String(raw.certificado_pem || "").trim(),
    client_id: String(raw.client_id || "").trim(),
    client_secret: String(raw.client_secret || "").trim(),
    pix_chave: String(raw.pix_chave || "").trim(),
  };

  if (credentials.client_id.length < 8 || credentials.client_id.length > 300) {
    throw new Error("Client ID Efí inválido.");
  }
  if (credentials.client_secret.length < 8 || credentials.client_secret.length > 300) {
    throw new Error("Client Secret Efí inválido.");
  }
  if (credentials.pix_chave.length < 3 || credentials.pix_chave.length > 200) {
    throw new Error("Chave Pix inválida.");
  }
  if (credentials.certificado_pem.length < 100 || credentials.certificado_pem.length > 180000) {
    throw new Error("Certificado PEM Efí inválido.");
  }

  return credentials;
}

export function pemParts(pem: string) {
  const certs = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) || [];
  const key = pem.match(/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/)?.[0];
  if (!certs.length || !key) throw new Error("O arquivo deve conter o certificado e a chave privada em formato PEM.");
  return { cert: certs.join("\n"), key };
}

export function efiBaseUrl(ambiente: string) {
  return ambiente === "homologacao" ? "https://pix-h.api.efipay.com.br" : "https://pix.api.efipay.com.br";
}

export function createEfiHttpClient(credentials: EfiPixCredentials) {
  const { cert, key } = pemParts(credentials.certificado_pem);
  return Deno.createHttpClient({ cert, key });
}

export async function efiAccessToken(credentials: EfiPixCredentials, client: Deno.HttpClient) {
  const authorization = btoa(`${credentials.client_id}:${credentials.client_secret}`);
  const response = await fetch(`${efiBaseUrl(credentials.ambiente)}/oauth/token`, {
    method: "POST",
    client,
    headers: {
      "Accept-Encoding": "identity",
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    throw new Error(safeEfiError(payload, "Não foi possível autenticar a conta Efí."));
  }
  return { accessToken: String(payload.access_token), payload };
}

export function safeEfiError(payload: Record<string, unknown> | null | undefined, fallback: string) {
  const candidate = payload?.mensagem || payload?.message || payload?.detail || payload?.error_description;
  const text = typeof candidate === "string" ? candidate.trim() : "";
  return (text || fallback).slice(0, 500);
}

export function maskedPixKey(value: string) {
  const key = String(value || "").trim();
  return key ? `••••••${key.slice(-4)}` : "";
}

export function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}
