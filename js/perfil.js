import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('perfil');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const form = document.querySelector('#profile-form');
const message = document.querySelector('#profile-message');
const avatarFile = document.querySelector('#avatar-file');
const workplaceFile = document.querySelector('#workplace-file');
const galleryFiles = document.querySelector('#gallery-files');
const galleryAdmin = document.querySelector('#gallery-admin');
const galleryCount = document.querySelector('#gallery-count');
const profileSaveBar = document.querySelector('#profile-save-bar');
const profileSaveButton = document.querySelector('#profile-save-button');
const profileTabs = [...document.querySelectorAll('[data-profile-tab]')];
const profilePanels = [...document.querySelectorAll('[data-profile-panel]')];

const publicLinkUrl = document.querySelector('#public-link-url');
const publicLinkState = document.querySelector('#public-link-state');
const copyPublicLinkButton = document.querySelector('#copy-public-link');
const viewPublicLink = document.querySelector('#view-public-link');
const summaryViewPage = document.querySelector('#summary-view-page');
const summaryCopyLink = document.querySelector('#summary-copy-link');
const summaryAvatar = document.querySelector('#profile-summary-avatar');
const summaryName = document.querySelector('#profile-summary-name');
const summaryHandle = document.querySelector('#profile-summary-handle');
const summaryStatus = document.querySelector('#profile-summary-status');

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
let baseline = '';
let profileLoaded = false;
let lockedScrollY = 0;

function digits(value = '') {
  return String(value).replace(/\D/g, '').slice(0, 11);
}

function slugify(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function publicUrl(slug) {
  return `${PUBLIC_SITE_ORIGIN}/p/${encodeURIComponent(slug)}`;
}

function initials(value = '') {
  const parts = String(value).trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map(part => part[0]?.toUpperCase()).join('') || 'FS';
}

function setActiveTab(tabName) {
  profileTabs.forEach(tab => {
    const active = tab.dataset.profileTab === tabName;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  profilePanels.forEach(panel => panel.classList.toggle('active', panel.dataset.profilePanel === tabName));
}

profileTabs.forEach(tab => {
  tab.addEventListener('click', () => setActiveTab(tab.dataset.profileTab));
});

function renderSummary() {
  const name = form.full_name.value.trim() || 'Seu perfil';
  const slug = slugify(form.slug.value);
  const published = form.publicado.checked;

  summaryName.textContent = name;
  summaryHandle.textContent = slug ? `@${slug}` : 'Defina seu endereço público';
  summaryStatus.textContent = published ? 'Página pública ativa' : 'Página pública desativada';
  summaryStatus.classList.toggle('inactive', !published);

  summaryAvatar.replaceChildren();
  if (avatarUrl) {
    const img = document.createElement('img');
    img.src = avatarUrl;
    img.alt = `Foto de ${name}`;
    summaryAvatar.appendChild(img);
  } else {
    summaryAvatar.textContent = initials(name);
  }
}

function renderPublicLink(slug, published = true) {
  const cleanSlug = slugify(slug);
  const hasSlug = Boolean(cleanSlug);
  const url = hasSlug ? publicUrl(cleanSlug) : '';

  if (hasSlug) {
    publicLinkUrl.textContent = url;
    publicLinkUrl.href = url;
    viewPublicLink.href = url;
    summaryViewPage.href = url;
  } else {
    publicLinkUrl.textContent = 'Defina seu endereço público';
    publicLinkUrl.removeAttribute('href');
    viewPublicLink.href = '#';
    summaryViewPage.href = '#';
  }

  publicLinkState.textContent = hasSlug
    ? (published ? 'A página está ativa e pronta para ser compartilhada.' : 'O link está configurado, mas a página está desativada.')
    : 'Crie um endereço para gerar seu link público.';

  copyPublicLinkButton.disabled = !hasSlug;
  summaryCopyLink.disabled = !hasSlug;
  viewPublicLink.setAttribute('aria-disabled', String(!hasSlug));
  summaryViewPage.setAttribute('aria-disabled', String(!hasSlug));
  renderSummary();
}

async function copyCurrentPublicLink(button) {
  const slug = slugify(form.slug.value);
  if (!slug) return showMessage(message, 'Defina primeiro o endereço da sua página pública.', 'error');

  const url = publicUrl(slug);
  const originalText = button.textContent;
  try {
    await navigator.clipboard.writeText(url);
    button.textContent = 'Link copiado';
    setTimeout(() => { button.textContent = originalText; }, 1600);
  } catch {
    showMessage(message, 'Não foi possível copiar automaticamente. Toque e segure sobre o link para copiá-lo.', 'error');
  }
}

copyPublicLinkButton?.addEventListener('click', event => copyCurrentPublicLink(event.currentTarget));
summaryCopyLink?.addEventListener('click', event => copyCurrentPublicLink(event.currentTarget));

[viewPublicLink, summaryViewPage].forEach(link => {
  link?.addEventListener('click', event => {
    if (!slugify(form.slug.value)) {
      event.preventDefault();
      setActiveTab('pagina-publica');
      showMessage(message, 'Defina primeiro o endereço da sua página pública.', 'error');
    }
  });
});

function ensureImagePreview(id, url, label, avatar = false) {
  const old = document.querySelector(id);
  const el = document.createElement(url ? 'img' : 'div');
  el.id = id.slice(1);
  el.className = `upload-preview${avatar ? ' avatar' : ''}${url ? '' : ' upload-placeholder'}`;
  if (url) {
    el.src = url;
    el.alt = label;
  } else {
    el.textContent = label;
  }
  old.replaceWith(el);
}

function validateImage(file) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) throw new Error('Use somente imagens JPEG, PNG ou WebP.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Cada imagem deve ter no máximo 5 MB.');
}

function extFor(file) {
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[file.type] || 'jpg';
}

async function uploadImage(file, kind) {
  validateImage(file);
  const path = `${session.user.id}/${kind}/${Date.now()}-${crypto.randomUUID()}.${extFor(file)}`;
  const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: false
  });
  if (error) throw error;
  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return { url: publicData.publicUrl, path: data.path };
}

function serializeProfileState() {
  return JSON.stringify({
    full_name: form.full_name.value.trim(),
    whatsapp: digits(form.whatsapp.value),
    slug: slugify(form.slug.value),
    local_trabalho: form.local_trabalho.value.trim(),
    cidade: form.cidade.value.trim(),
    especialidades: form.especialidades.value.trim(),
    bio: form.bio.value.trim(),
    instagram: form.instagram.value.trim(),
    publicado: form.publicado.checked,
    avatarUrl,
    workplaceUrl
  });
}

function updateDirtyState() {
  if (!profileLoaded) return;
  const dirty = serializeProfileState() !== baseline;
  profileSaveBar.hidden = !dirty;
  document.body.classList.toggle('profile-has-pending-changes', dirty);
}

function captureBaseline() {
  baseline = serializeProfileState();
  updateDirtyState();
}

function renderGallery() {
  gallery.sort((a, b) => a.ordem - b.ordem);
  galleryCount.textContent = `${gallery.length} de 10 fotos`;

  galleryAdmin.innerHTML = gallery.map((item, index) => `
    <div class="gallery-admin-item">
      <img src="${item.foto_url}" alt="Foto da rotina profissional">
      <div class="gallery-item-actions">
        <button class="gallery-action" type="button" data-gallery-action="previous" data-id="${item.id}" aria-label="Mover foto para trás" ${index === 0 ? 'disabled' : ''}>‹</button>
        <button class="gallery-action" type="button" data-gallery-action="next" data-id="${item.id}" aria-label="Mover foto para frente" ${index === gallery.length - 1 ? 'disabled' : ''}>›</button>
        <button class="gallery-action gallery-remove" type="button" data-gallery-action="remove" data-id="${item.id}" data-path="${item.storage_path || ''}" aria-label="Remover foto">×</button>
      </div>
    </div>
  `).join('');
}

async function moveGalleryItem(id, direction) {
  gallery.sort((a, b) => a.ordem - b.ordem);
  const index = gallery.findIndex(item => String(item.id) === String(id));
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= gallery.length) return;

  const current = gallery[index];
  const target = gallery[targetIndex];
  const currentOrder = current.ordem;
  const targetOrder = target.ordem;

  const { error: firstError } = await supabase
    .from('perfil_fotos')
    .update({ ordem: targetOrder })
    .eq('id', current.id)
    .eq('personal_id', session.user.id);
  if (firstError) throw firstError;

  const { error: secondError } = await supabase
    .from('perfil_fotos')
    .update({ ordem: currentOrder })
    .eq('id', target.id)
    .eq('personal_id', session.user.id);

  if (secondError) {
    await supabase.from('perfil_fotos').update({ ordem: currentOrder }).eq('id', current.id).eq('personal_id', session.user.id);
    throw secondError;
  }

  current.ordem = targetOrder;
  target.ordem = currentOrder;
  renderGallery();
}

async function removeGalleryItem(button) {
  const id = button.dataset.id;
  const path = button.dataset.path;
  const { error: dbError } = await supabase.from('perfil_fotos').delete().eq('id', id).eq('personal_id', session.user.id);
  if (dbError) throw dbError;
  if (path) await supabase.storage.from(BUCKET).remove([path]);
  gallery = gallery.filter(item => String(item.id) !== String(id));
  renderGallery();
}

galleryAdmin?.addEventListener('click', async event => {
  const button = event.target.closest('[data-gallery-action]');
  if (!button || button.disabled) return;
  button.disabled = true;

  try {
    if (button.dataset.galleryAction === 'remove') {
      await removeGalleryItem(button);
      showMessage(message, 'Foto removida da galeria.');
    } else if (button.dataset.galleryAction === 'previous') {
      await moveGalleryItem(button.dataset.id, -1);
    } else if (button.dataset.galleryAction === 'next') {
      await moveGalleryItem(button.dataset.id, 1);
    }
  } catch (error) {
    console.error(error);
    showMessage(message, 'Não foi possível atualizar a ordem das fotos.', 'error');
    renderGallery();
  }
});

function lockPageScroll() {
  lockedScrollY = window.scrollY;
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.classList.add('profile-modal-open');
}

function unlockPageScroll() {
  document.body.classList.remove('profile-modal-open');
  document.body.style.top = '';
  window.scrollTo(0, lockedScrollY);
}

function openPasswordModal() {
  passwordForm.reset();
  passwordMessage.className = 'message';
  passwordMessage.textContent = '';
  passwordModal.classList.add('open');
  passwordModal.setAttribute('aria-hidden', 'false');
  lockPageScroll();
  setTimeout(() => passwordForm.current_password.focus(), 0);
}

function closePasswordModal() {
  if (!passwordModal.classList.contains('open')) return;
  passwordModal.classList.remove('open');
  passwordModal.setAttribute('aria-hidden', 'true');
  unlockPageScroll();
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
    if (reauthError) throw new Error('Senha atual incorreta. Verifique e tente novamente.');

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

const [
  { data: profile, error: profileError },
  { data: publicProfile, error: publicError },
  { data: photos, error: photosError }
] = await Promise.all([
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
  profileLoaded = true;
  captureBaseline();
}

form.whatsapp.addEventListener('input', () => {
  form.whatsapp.value = digits(form.whatsapp.value);
  updateDirtyState();
});

form.full_name.addEventListener('input', () => {
  renderSummary();
  updateDirtyState();
});

form.slug.addEventListener('input', () => {
  form.slug.value = slugify(form.slug.value);
  renderPublicLink(form.slug.value, form.publicado.checked);
  updateDirtyState();
});

form.publicado.addEventListener('change', () => {
  renderPublicLink(form.slug.value, form.publicado.checked);
  updateDirtyState();
});

form.addEventListener('input', event => {
  if (!['whatsapp', 'full_name', 'slug'].includes(event.target.name)) updateDirtyState();
});

form.addEventListener('change', event => {
  if (event.target.name !== 'publicado' && event.target.type !== 'file') updateDirtyState();
});

avatarFile.addEventListener('change', async () => {
  const file = avatarFile.files?.[0];
  if (!file) return;
  avatarFile.disabled = true;

  try {
    const result = await uploadImage(file, 'avatar');
    avatarUrl = result.url;
    ensureImagePreview('#avatar-preview', avatarUrl, 'Foto de perfil', true);
    renderSummary();
    updateDirtyState();
    showMessage(message, 'Foto enviada. Salve as alterações para confirmar.');
  } catch (error) {
    console.error(error);
    showMessage(message, error.message || 'Não foi possível enviar a foto.', 'error');
  } finally {
    avatarFile.disabled = false;
    avatarFile.value = '';
  }
});

workplaceFile.addEventListener('change', async () => {
  const file = workplaceFile.files?.[0];
  if (!file) return;
  workplaceFile.disabled = true;

  try {
    const result = await uploadImage(file, 'local');
    workplaceUrl = result.url;
    ensureImagePreview('#workplace-preview', workplaceUrl, 'Foto do local');
    updateDirtyState();
    showMessage(message, 'Foto enviada. Salve as alterações para confirmar.');
  } catch (error) {
    console.error(error);
    showMessage(message, error.message || 'Não foi possível enviar a foto.', 'error');
  } finally {
    workplaceFile.disabled = false;
    workplaceFile.value = '';
  }
});

galleryFiles.addEventListener('change', async () => {
  const files = [...(galleryFiles.files || [])];
  const remaining = 10 - gallery.length;
  if (!files.length) return;

  if (files.length > remaining) {
    showMessage(message, `Você pode adicionar somente mais ${remaining} foto(s).`, 'error');
    galleryFiles.value = '';
    return;
  }

  galleryFiles.disabled = true;
  try {
    const used = new Set(gallery.map(item => item.ordem));
    const freeOrders = Array.from({ length: 10 }, (_, i) => i).filter(i => !used.has(i));

    for (let i = 0; i < files.length; i++) {
      const uploaded = await uploadImage(files[i], 'galeria');
      const { data, error } = await supabase
        .from('perfil_fotos')
        .insert({
          personal_id: session.user.id,
          foto_url: uploaded.url,
          storage_path: uploaded.path,
          ordem: freeOrders[i]
        })
        .select('id,foto_url,storage_path,ordem')
        .single();

      if (error) {
        await supabase.storage.from(BUCKET).remove([uploaded.path]);
        throw error;
      }
      gallery.push(data);
      renderGallery();
    }
    showMessage(message, 'Galeria atualizada com sucesso.');
  } catch (error) {
    console.error(error);
    showMessage(message, error.message || 'Não foi possível enviar as fotos.', 'error');
  } finally {
    galleryFiles.disabled = false;
    galleryFiles.value = '';
  }
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const telefone = digits(form.whatsapp.value);
  const nome = form.full_name.value.trim();
  const slug = slugify(form.slug.value);

  if (nome.length < 2) {
    setActiveTab('perfil');
    return showMessage(message, 'Informe seu nome.', 'error');
  }
  if (telefone && telefone.length !== 11) {
    setActiveTab('perfil');
    return showMessage(message, 'O WhatsApp deve conter DDD e número, totalizando 11 dígitos.', 'error');
  }
  if (slug.length < 3) {
    setActiveTab('pagina-publica');
    return showMessage(message, 'Defina um endereço público com pelo menos 3 caracteres.', 'error');
  }

  profileSaveButton.disabled = true;
  profileSaveButton.textContent = 'Salvando...';

  try {
    const { error: updateError } = await supabase
      .from('perfis')
      .update({ nome, telefone: telefone || null })
      .eq('id', session.user.id);
    if (updateError) throw updateError;

    const publicPayload = {
      personal_id: session.user.id,
      slug,
      nome_publico: nome,
      foto_url: avatarUrl || null,
      foto_local_url: workplaceUrl || null,
      local_trabalho: form.local_trabalho.value.trim() || null,
      cidade: form.cidade.value.trim() || null,
      especialidades: form.especialidades.value.trim() || null,
      bio: form.bio.value.trim() || null,
      instagram: form.instagram.value.trim() || null,
      publicado: form.publicado.checked,
      updated_at: new Date().toISOString()
    };

    const { error: publicSaveError } = await supabase
      .from('perfis_publicos')
      .upsert(publicPayload, { onConflict: 'personal_id' });

    if (publicSaveError) {
      if (publicSaveError.code === '23505') {
        setActiveTab('pagina-publica');
        throw new Error('Esse endereço público já está sendo usado por outro personal. Escolha outro.');
      }
      throw publicSaveError;
    }

    const { error: authUpdateError } = await supabase.auth.updateUser({ data: { full_name: nome, tipo: 'personal' } });
    if (authUpdateError) throw authUpdateError;

    session.user.user_metadata = { ...(session.user.user_metadata || {}), full_name: nome, tipo: 'personal' };
    form.slug.value = slug;
    renderPublicLink(slug, form.publicado.checked);
    captureBaseline();
    showMessage(message, 'Alterações salvas com sucesso.');
    await setGreeting(session);
  } catch (saveError) {
    console.error(saveError);
    showMessage(message, saveError.message || 'Não foi possível atualizar seu perfil.', 'error');
  } finally {
    profileSaveButton.disabled = false;
    profileSaveButton.textContent = 'Salvar alterações';
  }
});

window.addEventListener('beforeunload', event => {
  if (profileSaveBar.hidden) return;
  event.preventDefault();
  event.returnValue = '';
});
