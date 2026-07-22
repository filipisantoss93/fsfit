import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const enc = new TextEncoder();
const hex = (bytes: Uint8Array) => Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value))));
const PROFILE_BUCKET = "aluno-perfil";
const MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024;

async function verifyPin(pin: string, stored: string) {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") return false;
  const iterations = Number(parts[1]);
  const saltParts = parts[2].match(/.{1,2}/g);
  if (!saltParts || !Number.isFinite(iterations)) return false;
  const salt = Uint8Array.from(saltParts.map((x) => parseInt(x, 16)));
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return hex(new Uint8Array(bits)) === parts[3];
}

async function hashPin(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 210000;
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return `pbkdf2_sha256$${iterations}$${hex(salt)}$${hex(new Uint8Array(bits))}`;
}

async function createSession(admin: any, alunoId: string, userAgent: string | null) {
  const raw = hex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256(raw);
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await admin.from("aluno_sessoes").insert({ aluno_id: alunoId, token_hash: tokenHash, expira_em: expires, user_agent: userAgent });
  if (error) throw error;
  return { token: raw, expira_em: expires };
}

async function resolvePersonal(admin: any, slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const { data } = await admin
    .from("perfis_publicos")
    .select("personal_id,slug,nome_publico,foto_url,local_trabalho,cidade")
    .eq("slug", slug)
    .eq("publicado", true)
    .maybeSingle();
  return data || null;
}

async function resolveStudentSession(admin: any, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await sha256(token);
  const { data: sessao } = await admin
    .from("aluno_sessoes")
    .select("id,aluno_id,expira_em,revogada_em")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!sessao || sessao.revogada_em || new Date(sessao.expira_em) < new Date()) return null;

  await admin.from("aluno_sessoes").update({ ultimo_uso_em: new Date().toISOString() }).eq("id", sessao.id);
  const { data: aluno, error } = await admin
    .from("alunos")
    .select("id,nome,nome_exibicao,foto_perfil_url,foto_perfil_path,telefone,sexo,data_nascimento,altura_cm,objetivo,personal_id,status")
    .eq("id", sessao.aluno_id)
    .maybeSingle();

  if (error || !aluno || aluno.status !== "ativo") return null;
  return { sessao, aluno };
}

async function registerFailedAttempt(admin: any, aluno: any, message: string) {
  const attempts = Number(aluno.pin_tentativas || 0) + 1;
  const blocked = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
  await admin.from("alunos").update({
    pin_tentativas: attempts >= 5 ? 0 : attempts,
    pin_bloqueado_ate: blocked,
  }).eq("id", aluno.id);
  return json({ error: blocked ? "Muitas tentativas. Acesso bloqueado por 15 minutos." : message }, blocked ? 429 : 401);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();
    const action = String(body.action || "");
    const telefone = String(body.telefone || "").replace(/\D/g, "");
    const pin = String(body.pin || "");
    const activationCode = String(body.activation_code || body.codigo_ativacao || "").replace(/\D/g, "");
    const personalSlug = String(body.personal_slug || "").trim().toLowerCase();

    if (action === "personal_reset_pin") {
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!token) return json({ error: "Sessão do personal inválida." }, 401);
      const { data: userData, error: userError } = await admin.auth.getUser(token);
      if (userError || !userData?.user) return json({ error: "Sessão do personal inválida." }, 401);
      const alunoId = String(body.aluno_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(alunoId) || !/^\d{4}$/.test(pin)) return json({ error: "Informe um PIN de 4 números." }, 400);
      const { data: aluno } = await admin.from("alunos").select("id,personal_id").eq("id", alunoId).maybeSingle();
      if (!aluno || aluno.personal_id !== userData.user.id) return json({ error: "Aluno não encontrado." }, 404);
      const now = new Date().toISOString();
      const { error } = await admin.from("alunos").update({
        pin_hash: await hashPin(pin),
        pin_definido_em: now,
        pin_atualizado_em: now,
        primeiro_acesso_concluido: true,
        pin_tentativas: 0,
        pin_bloqueado_ate: null,
        codigo_ativacao_hash: null,
        codigo_ativacao_expira_em: null,
      }).eq("id", aluno.id);
      if (error) throw error;
      await admin.from("aluno_sessoes").update({ revogada_em: now }).eq("aluno_id", aluno.id).is("revogada_em", null);
      return json({ success: true });
    }

    if (action === "lookup" || action === "activate" || action === "login") {
      if (!/^\d{11}$/.test(telefone)) return json({ error: "Informe o WhatsApp com 11 números." }, 400);
      const personal = await resolvePersonal(admin, personalSlug);
      if (!personal) return json({ error: "Página do personal não encontrada ou indisponível." }, 404);

      const phoneCandidates = [telefone, `55${telefone}`, `+55${telefone}`];
      const { data: aluno } = await admin
        .from("alunos")
        .select("id,nome,nome_exibicao,foto_perfil_url,pin_hash,pin_tentativas,pin_bloqueado_ate,primeiro_acesso_concluido,status,codigo_ativacao_hash,codigo_ativacao_expira_em")
        .eq("personal_id", personal.personal_id)
        .in("telefone", phoneCandidates)
        .maybeSingle();

      if (!aluno || aluno.status !== "ativo") return json({ error: "Aluno não encontrado para este personal." }, 404);
      const studentName = aluno.nome_exibicao || aluno.nome;

      if (action === "lookup") {
        return json({
          success: true,
          aluno: { id: aluno.id, nome: studentName, foto_perfil_url: aluno.foto_perfil_url || null },
          next: aluno.primeiro_acesso_concluido && aluno.pin_hash ? "login" : "activate",
          activation_ready: Boolean(aluno.codigo_ativacao_hash && aluno.codigo_ativacao_expira_em && new Date(aluno.codigo_ativacao_expira_em) > new Date()),
        });
      }

      if (aluno.pin_bloqueado_ate && new Date(aluno.pin_bloqueado_ate) > new Date()) {
        return json({ error: "Acesso temporariamente bloqueado. Tente novamente mais tarde." }, 429);
      }

      if (action === "activate") {
        if (!/^\d{4}$/.test(pin)) return json({ error: "Crie um PIN de 4 números." }, 400);
        if (!/^\d{6}$/.test(activationCode)) return json({ error: "Informe o código de ativação de 6 números fornecido pelo seu personal." }, 400);
        if (aluno.primeiro_acesso_concluido && aluno.pin_hash) return json({ error: "Primeiro acesso já concluído. Faça login com seu PIN." }, 409);
        if (!aluno.codigo_ativacao_hash || !aluno.codigo_ativacao_expira_em) {
          return json({ error: "Seu código de ativação ainda não foi gerado. Solicite ao seu personal." }, 409);
        }
        if (new Date(aluno.codigo_ativacao_expira_em) <= new Date()) {
          return json({ error: "Seu código de ativação expirou. Solicite um novo código ao seu personal." }, 410);
        }

        const validActivationCode = await sha256(activationCode) === aluno.codigo_ativacao_hash;
        if (!validActivationCode) return registerFailedAttempt(admin, aluno, "Código de ativação inválido.");

        const now = new Date().toISOString();
        const validationWindow = new Date(Date.now() + 60 * 1000).toISOString();
        const { error: validationError } = await admin.from("alunos").update({ ativacao_validada_ate: validationWindow }).eq("id", aluno.id);
        if (validationError) throw validationError;

        const pinHash = await hashPin(pin);
        const { error } = await admin.from("alunos").update({
          pin_hash: pinHash,
          pin_definido_em: now,
          pin_atualizado_em: now,
          primeiro_acesso_concluido: true,
          pin_tentativas: 0,
          pin_bloqueado_ate: null,
          codigo_ativacao_hash: null,
          codigo_ativacao_expira_em: null,
          ultimo_acesso_em: now,
        }).eq("id", aluno.id);
        if (error) throw error;

        const session = await createSession(admin, aluno.id, req.headers.get("user-agent"));
        return json({ success: true, aluno: { id: aluno.id, nome: studentName }, personal, ...session });
      }

      if (!/^\d{4}$/.test(pin)) return json({ error: "Informe seu PIN de 4 números." }, 400);
      if (!aluno.primeiro_acesso_concluido || !aluno.pin_hash) return json({ error: "Conclua seu primeiro acesso com o código fornecido pelo personal." }, 409);

      const valid = await verifyPin(pin, aluno.pin_hash);
      if (!valid) return registerFailedAttempt(admin, aluno, "WhatsApp ou PIN inválido.");

      const now = new Date().toISOString();
      await admin.from("alunos").update({ pin_tentativas: 0, pin_bloqueado_ate: null, ultimo_acesso_em: now }).eq("id", aluno.id);
      const session = await createSession(admin, aluno.id, req.headers.get("user-agent"));
      return json({ success: true, aluno: { id: aluno.id, nome: studentName }, personal, ...session });
    }

    if (action === "me" || action === "profile_upload_url" || action === "update_profile") {
      const token = String(body.token || "");
      const resolved = await resolveStudentSession(admin, token);
      if (!resolved) return json({ error: "Sessão expirada." }, 401);
      const { aluno } = resolved;

      if (action === "me") {
        const { data: personal } = await admin
          .from("perfis_publicos")
          .select("slug,nome_publico,foto_url,local_trabalho,cidade")
          .eq("personal_id", aluno.personal_id)
          .maybeSingle();
        return json({
          success: true,
          aluno: {
            ...aluno,
            nome_perfil: aluno.nome_exibicao || aluno.nome,
          },
          personal,
        });
      }

      if (action === "profile_upload_url") {
        const mimeType = String(body.mime_type || "").toLowerCase();
        const sizeBytes = Number(body.size_bytes || 0);
        const extensions: Record<string, string> = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
        };
        const extension = extensions[mimeType];
        if (!extension) return json({ error: "Formato de imagem não permitido. Use JPG, PNG ou WebP." }, 400);
        if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_PROFILE_IMAGE_SIZE) {
          return json({ error: "A foto deve ter no máximo 5 MB." }, 400);
        }

        const path = `${aluno.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
        const { data, error } = await admin.storage.from(PROFILE_BUCKET).createSignedUploadUrl(path);
        if (error || !data?.token) throw error || new Error("Não foi possível preparar o envio da foto.");
        return json({ success: true, path, upload_token: data.token });
      }

      const displayName = String(body.nome_exibicao || "").trim();
      if (displayName.length < 2 || displayName.length > 80) {
        return json({ error: "O nome do perfil deve ter entre 2 e 80 caracteres." }, 400);
      }

      const requestedPath = String(body.foto_perfil_path || "").trim();
      let photoPath = aluno.foto_perfil_path || null;
      let photoUrl = aluno.foto_perfil_url || null;

      if (requestedPath) {
        const expectedPrefix = `${aluno.id}/`;
        if (!requestedPath.startsWith(expectedPrefix) || !/\.(jpg|jpeg|png|webp)$/i.test(requestedPath)) {
          return json({ error: "Foto de perfil inválida." }, 400);
        }

        const filename = requestedPath.slice(expectedPrefix.length);
        const { data: files, error: listError } = await admin.storage.from(PROFILE_BUCKET).list(aluno.id, { search: filename, limit: 10 });
        if (listError) throw listError;
        if (!(files || []).some((file: any) => file.name === filename)) return json({ error: "A foto enviada não foi encontrada." }, 400);

        const { data: publicData } = admin.storage.from(PROFILE_BUCKET).getPublicUrl(requestedPath);
        if (!publicData?.publicUrl) return json({ error: "Não foi possível publicar a foto de perfil." }, 500);
        photoPath = requestedPath;
        photoUrl = publicData.publicUrl;
      }

      const previousPath = aluno.foto_perfil_path || null;
      const { data: updated, error: updateError } = await admin
        .from("alunos")
        .update({ nome_exibicao: displayName, foto_perfil_path: photoPath, foto_perfil_url: photoUrl })
        .eq("id", aluno.id)
        .select("id,nome,nome_exibicao,foto_perfil_url,foto_perfil_path")
        .single();
      if (updateError) throw updateError;

      if (requestedPath && previousPath && previousPath !== requestedPath) {
        await admin.storage.from(PROFILE_BUCKET).remove([previousPath]).catch(() => undefined);
      }

      return json({
        success: true,
        aluno: {
          ...updated,
          nome_perfil: updated.nome_exibicao || updated.nome,
        },
      });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: "Não foi possível concluir o acesso." }, 500);
  }
});
