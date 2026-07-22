import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const enc = new TextEncoder();
const hex = (bytes: Uint8Array) => Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value))));

async function hashPin(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 210000;
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return `pbkdf2_sha256$${iterations}$${hex(salt)}$${hex(new Uint8Array(bits))}`;
}

function generateActivationCode() {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(value).padStart(6, "0");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão do personal inválida." }, 401);

    const admin = createClient(url, service);
    const body = await req.json();
    const alunoId = String(body.aluno_id || "");
    const action = String(body.action || "set_pin");

    const { data: aluno } = await admin
      .from("alunos")
      .select("id,personal_id,primeiro_acesso_concluido,pin_hash")
      .eq("id", alunoId)
      .maybeSingle();

    if (!aluno || aluno.personal_id !== userData.user.id) {
      return json({ error: "Aluno não encontrado para este personal." }, 404);
    }

    if (action === "generate_activation_code") {
      if (aluno.primeiro_acesso_concluido && aluno.pin_hash) {
        return json({ error: "Este aluno já concluiu o primeiro acesso. Use a alteração de PIN se necessário." }, 409);
      }

      const activationCode = generateActivationCode();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await admin.from("alunos").update({
        codigo_ativacao_hash: await sha256(activationCode),
        codigo_ativacao_expira_em: expiresAt,
        pin_tentativas: 0,
        pin_bloqueado_ate: null,
      }).eq("id", alunoId);
      if (error) throw error;

      return json({
        success: true,
        activation_code: activationCode,
        expires_at: expiresAt,
        message: "Código de ativação gerado com segurança.",
      });
    }

    if (action === "set_pin") {
      const pin = String(body.pin || "");
      if (!/^\d{4}$/.test(pin)) return json({ error: "O PIN deve ter exatamente 4 números." }, 400);
      const now = new Date().toISOString();
      const pinHash = await hashPin(pin);
      const { error } = await admin.from("alunos").update({
        pin_hash: pinHash,
        pin_tentativas: 0,
        pin_bloqueado_ate: null,
        pin_atualizado_em: now,
        pin_definido_em: now,
        primeiro_acesso_concluido: true,
        codigo_ativacao_hash: null,
        codigo_ativacao_expira_em: null,
      }).eq("id", alunoId);
      if (error) throw error;
      await admin.from("aluno_sessoes").update({ revogada_em: now }).eq("aluno_id", alunoId).is("revogada_em", null);
      return json({ success: true, message: "PIN atualizado com segurança." });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: "Não foi possível atualizar o acesso do aluno." }, 500);
  }
});