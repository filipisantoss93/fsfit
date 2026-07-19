import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('perfil');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const form = document.querySelector('#profile-form');
const message = document.querySelector('#profile-message');
const publicLinkBox = document.querySelector('#public-link-box');
const avatarFile = document.querySelector('#avatar-file');
const workplaceFile = document.querySelector('#workplace-file');
const galleryFiles = document.querySelector('#gallery-files');
const galleryAdmin = document.querySelector('#gallery-admin');
const galleryCount = document.querySelector('#gallery-count');
const passwordModal = document.querySelector('#password-modal');
const passwordForm = document.querySelector('#password-form');
const passwordMessage = document.querySelector('#password-message');
const openPasswordModalButton = document.querySelector('#open-password-modal');
const closePasswordModalButton = document.querySelector('#close-password-modal');
const cancelPasswordChangeButton = document.querySelector('#cancel-password-change');
const BUCKET = 'perfil-publico';
const PUBLIC_SITE_ORIGIN = 'https://fsfit.com.br';
let avatarUrl = '';
let workplaceUrl = '';
let gallery = [];

function digits(value = '') { return String(value).replace(/\D/g, '').slice(0, 11); }
function slugify(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
function publicUrl(slug) { return `${PUBLIC_SITE_ORIGIN}/p/${encodeURIComponent(slug)}`; }
function renderPublicLink(slug, published = true) {
  if (!slug) { publicLinkBox.className = 'message'; publicLinkBox.textContent = ''; return; }
  const url = publicUrl(slug);
  publicLinkBox.className = 'message show success';
  publicLinkBox.innerHTML = `<strong>${published ? 'Seu link público:' : 'Link configurado, mas a página está desativada:'}</strong><br><a href="${url}">${url}</a><div class="public-link-actions"><button id="copy-public-link" class="btn btn-outline" type="button">Copiar link</button><a class="btn btn-secondary" href="${url}">Ver minha página</a></div>`;
  document.querySelector('#copy-public-link')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(url); showMessage(message, 'Link público copiado.'); }
    catch { showMessage(message, 'Não foi possível copiar automaticamente. Selecione o link acima.', 'error'); }
  });
}
function setPreview(id, url, label) {
  const host = document.querySelector(id);
  if (!url) { host.className = `upload-preview${id === '#avatar-preview' ? ' avatar' : ''} upload-placeholder`; host.textContent = label; return; }
  host.className = `upload-preview${id === '#avatar-preview' ? ' avatar' : ''}`;
  host.src = url;
  if (host.tagName !== 'IMG') {
    const img = document.createElement('img');
    img.id = host.id; img.className = host.className; img.src = url; img.alt = label;
    host.replaceWith(img);
  }
}
function ensureImagePreview(id, url, label, avatar = false) {
  const old = document.querySelector(id);
  const el = document.createElement(url ? 'img' : 'div');
  el.id = id.slice(1);
  el.className = `upload-preview${avatar ? ' avatar' : ''}${url ? '' : ' upload-placeholder'}`;
  if (url) { el.src = url; el.alt = label; } else el.textContent = label;
  old.replaceWith(el);
}
function validateImage(file) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) throw new Error('Use somente imagens JPEG, PNG ou WebP.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Cada imagem deve ter no máximo 5 MB.');
}
function extFor(file) { return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[file.type] || 'jpg'; }
async function uploadImage(file, kind) {
  validateImage(file);
  const path = `${session.user.id}/${kind}/${Date.now()}-${crypto.randomUUID()}.${extFor(file)}`;
  const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return { url: publicData.publicUrl, path: data.path };
}
function renderGallery() {
  gallery.sort((a, b) => a.ordem - b.ordem);
  galleryCount.textContent = `${gallery.length} de 10 fotos`;
  galleryAdmin.innerHTML = gallery.map(item => `<div class="gallery-admin-item"><img src="${item.foto_url}" alt="Foto da rotina profissional"><button class="gallery-remove" type="button" data-id="${item.id}" data-path="${item.storage_path}" aria-label="Remover foto">×</button></div>`).join('');
  galleryAdmin.querySelectorAll('.gallery-remove').forEach(button => button.addEventListener('click', async () => {
    button.disabled = true;
    const id = button.dataset.id;
    const path = button.dataset.path;
    try {
      const { error: dbError } = await supabase.from('perfil_fotos').delete().eq('id', id).eq('personal_id', session.user.id);
      if (dbError) throw dbError;
      if (path) await supabase.storage.from(BUCKET).remove([path]);
      gallery = gallery.filter(item => item.id !== id);
      renderGallery();
    } catch (error) { console.error(error); showMessage(message, 'Não foi possível remover a foto.', 'error'); button.disabled = false; }
  }));
}

function openPasswordModal() {
  passwordForm.reset();
  passwordMessage.className = 'message';
  passwordMessage.textContent = '';
  passwordModal.classList.add('open');
  passwordModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  setTimeout(() => passwordForm.current_password.focus(), 0);
}

function closePasswordModal() {
  passwordModal.classList.remove('open');
  passwordModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  passwordForm.reset();
  passwordMessage.className = 'message';
  passwordMessage.textContent = '';
}

openPasswordModalButton?.addEventListener('click', openPasswordModal);
closePasswordModalButton?.addEventListener('click', closePasswordModal);
cancelPasswordChangeButton?.addEventListener('click', closePasswordModal);
passwordModal?.addEventListener('click', event => {
  if (event.target === passwordModal) closePasswordModal();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && passwordModal?.classList.contains('open')) closePasswordModal();
});

passwordForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const currentPassword = passwordForm.current_password.value;
  const newPassword = passwordForm.new_password.value;
  const confirmPassword = passwordForm.confirm_password.value;

  if (!currentPassword) return showMessage(passwordMessage, 'Informe sua senha atual.', 'error');
  if (newPassword.length < 6) return showMessage(passwordMessage, 'A nova senha deve ter pelo menos 6 caracteres.', 'error');
  if (newPassword !== confirmPassword) return showMessage(passwordMessage, 'A confirmação da senha não corresponde à nova senha.', 'error');
  if (currentPassword === newPassword) return showMessage(passwordMessage, 'A nova senha deve ser diferente da senha atual.', 'error');
  if (!session.user.email) return showMessage(passwordMessage, 'Não foi possível identificar o e-mail da sua conta.', 'error');

  const submitButton = passwordForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = 'Alterando...';

  try {
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword
    });
    if (reauthError) {
      throw new Error('Senha atual incorreta. Verifique e tente novamente.');
    }

    const { error: updatePasswordError } = await supabase.auth.updateUser({ password: newPassword });
    if (updatePasswordError) throw updatePasswordError;

    closePasswordModal();
    showMessage(message, 'Senha alterada com sucesso.');
  } catch (error) {
    console.error(error);
    const text = String(error?.message || '').toLowerCase();
    if (text.includes('same password') || text.includes('different from the old password')) {
      showMessage(passwordMessage, 'A nova senha deve ser diferente da senha atual.', 'error');
    } else if (text.includes('password should be at least')) {
      showMessage(passwordMessage, 'A nova senha não atende aos requisitos mínimos de segurança.', 'error');
    } else {
      showMessage(passwordMessage, error.message || 'Não foi possível alterar sua senha.', 'error');
    }
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Salvar nova senha';
  }
});

const [{ data: profile, error: profileError }, { data: publicProfile, error: publicError }, { data: photos, error: photosError }] = await Promise.all([
  supabase.from('perfis').select('nome,telefone,nome_empresa,plano,ativo').eq('id', session.user.id).single(),
  supabase.from('perfis_publicos').select('slug,nome_publico,foto_url,foto_local_url,local_trabalho,cidade,bio,especialidades,instagram,publicado').eq('personal_id', session.user.id).maybeSingle(),
  supabase.from('perfil_fotos').select('id,foto_url,storage_path,ordem').eq('personal_id', session.user.id).order('ordem')
]);

if (profileError || publicError || photosError) {
  console.error(profileError || publicError || photosError);
  showMessage(message, 'Não foi possível carregar seu perfil.', 'error');
} else {
  form.full_name.value = profile.nome || session.user.user_metadata?.full_name || '';
  form.whatsapp.value = profile.telefone || '';
  form.email.value = session.user.email || '';
  const defaultSlug = slugify(publicProfile?.slug || profile.nome || session.user.user_metadata?.full_name || 'personal');
  form.slug.value = defaultSlug;
  avatarUrl = publicProfile?.foto_url || '';
  workplaceUrl = publicProfile?.foto_local_url || '';
  form.local_trabalho.value = publicProfile?.local_trabalho || '';
  form.cidade.value = publicProfile?.cidade || '';
  form.especialidades.value = publicProfile?.especialidades || '';
  form.bio.value = publicProfile?.bio || '';
  form.instagram.value = publicProfile?.instagram || '';
  form.publicado.checked = publicProfile?.publicado ?? true;
  gallery = photos || [];
  ensureImagePreview('#avatar-preview', avatarUrl, 'Foto de perfil', true);
  ensureImagePreview('#workplace-preview', workplaceUrl, 'Foto do local');
  renderGallery();
  renderPublicLink(defaultSlug, form.publicado.checked);
}

form.whatsapp.addEventListener('input', () => { form.whatsapp.value = digits(form.whatsapp.value); });
form.slug.addEventListener('input', () => { form.slug.value = slugify(form.slug.value); renderPublicLink(form.slug.value, form.publicado.checked); });
form.publicado.addEventListener('change', () => renderPublicLink(form.slug.value, form.publicado.checked));

avatarFile.addEventListener('change', async () => {
  const file = avatarFile.files?.[0]; if (!file) return;
  avatarFile.disabled = true;
  try { const result = await uploadImage(file, 'avatar'); avatarUrl = result.url; ensureImagePreview('#avatar-preview', avatarUrl, 'Foto de perfil', true); showMessage(message, 'Foto enviada. Salve o perfil para confirmar a alteração.'); }
  catch (error) { console.error(error); showMessage(message, error.message || 'Não foi possível enviar a foto.', 'error'); }
  finally { avatarFile.disabled = false; avatarFile.value = ''; }
});

workplaceFile.addEventListener('change', async () => {
  const file = workplaceFile.files?.[0]; if (!file) return;
  workplaceFile.disabled = true;
  try { const result = await uploadImage(file, 'local'); workplaceUrl = result.url; ensureImagePreview('#workplace-preview', workplaceUrl, 'Foto do local'); showMessage(message, 'Foto enviada. Salve o perfil para confirmar a alteração.'); }
  catch (error) { console.error(error); showMessage(message, error.message || 'Não foi possível enviar a foto.', 'error'); }
  finally { workplaceFile.disabled = false; workplaceFile.value = ''; }
});

galleryFiles.addEventListener('change', async () => {
  const files = [...(galleryFiles.files || [])];
  const remaining = 10 - gallery.length;
  if (!files.length) return;
  if (files.length > remaining) { showMessage(message, `Você pode adicionar somente mais ${remaining} foto(s).`, 'error'); galleryFiles.value = ''; return; }
  galleryFiles.disabled = true;
  try {
    const used = new Set(gallery.map(item => item.ordem));
    const freeOrders = Array.from({ length: 10 }, (_, i) => i).filter(i => !used.has(i));
    for (let i = 0; i < files.length; i++) {
      const uploaded = await uploadImage(files[i], 'galeria');
      const { data, error } = await supabase.from('perfil_fotos').insert({ personal_id: session.user.id, foto_url: uploaded.url, storage_path: uploaded.path, ordem: freeOrders[i] }).select('id,foto_url,storage_path,ordem').single();
      if (error) { await supabase.storage.from(BUCKET).remove([uploaded.path]); throw error; }
      gallery.push(data);
      renderGallery();
    }
    showMessage(message, 'Galeria atualizada com sucesso.');
  } catch (error) { console.error(error); showMessage(message, error.message || 'Não foi possível enviar as fotos.', 'error'); }
  finally { galleryFiles.disabled = false; galleryFiles.value = ''; }
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const telefone = digits(form.whatsapp.value);
  const nome = form.full_name.value.trim();
  const slug = slugify(form.slug.value);
  if (nome.length < 2) return showMessage(message, 'Informe seu nome.', 'error');
  if (telefone && telefone.length !== 11) return showMessage(message, 'O WhatsApp deve conter DDD e número, totalizando 11 dígitos.', 'error');
  if (slug.length < 3) return showMessage(message, 'Defina um endereço público com pelo menos 3 caracteres.', 'error');
  const button = form.querySelector('[type="submit"]'); button.disabled = true;
  try {
    const { error: updateError } = await supabase.from('perfis').update({ nome, telefone: telefone || null }).eq('id', session.user.id);
    if (updateError) throw updateError;
    const publicPayload = { personal_id: session.user.id, slug, nome_publico: nome, foto_url: avatarUrl || null, foto_local_url: workplaceUrl || null, local_trabalho: form.local_trabalho.value.trim() || null, cidade: form.cidade.value.trim() || null, especialidades: form.especialidades.value.trim() || null, bio: form.bio.value.trim() || null, instagram: form.instagram.value.trim() || null, publicado: form.publicado.checked, updated_at: new Date().toISOString() };
    const { error: publicSaveError } = await supabase.from('perfis_publicos').upsert(publicPayload, { onConflict: 'personal_id' });
    if (publicSaveError) { if (publicSaveError.code === '23505') throw new Error('Esse endereço público já está sendo usado por outro personal. Escolha outro.'); throw publicSaveError; }
    await supabase.auth.updateUser({ data: { full_name: nome, tipo: 'personal' } });
    showMessage(message, 'Perfil e página pública atualizados com sucesso.');
    renderPublicLink(slug, form.publicado.checked);
    await setGreeting(session);
  } catch (saveError) { console.error(saveError); showMessage(message, saveError.message || 'Não foi possível atualizar seu perfil.', 'error'); }
  finally { button.disabled = false; }
});
