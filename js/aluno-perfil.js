import { supabase } from './supabase.js';

const PROFILE_BUCKET = 'aluno-perfil';
const MAX_SOURCE_SIZE = 15 * 1024 * 1024;
const MAX_OUTPUT_SIDE = 1024;

const form = document.querySelector('#student-profile-form');
const nameInput = document.querySelector('#student-profile-display-name');
const photoInput = document.querySelector('#student-profile-photo-input');
const choosePhotoButton = document.querySelector('#student-profile-photo-button');
const saveButton = document.querySelector('#student-profile-save');
const statusHost = document.querySelector('#student-profile-save-message');
const mainName = document.querySelector('#student-name');
const mainAvatar = document.querySelector('#student-profile-avatar');
const editorAvatar = document.querySelector('#student-profile-editor-avatar');

let pendingPhoto = null;
let pendingPreviewUrl = '';
let currentProfile = null;

function sessionToken() {
  return String(localStorage.getItem('fsfit_aluno_token') || '').trim();
}

function initials(value = '') {
  const parts = String(value).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A';
  return `${parts[0]?.[0] || ''}${parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : ''}`.toUpperCase();
}

function setStatus(text = '', type = '') {
  if (!statusHost) return;
  statusHost.textContent = text;
  statusHost.className = `student-profile-save-message${type ? ` ${type}` : ''}`;
}

function renderAvatar(host, url, name) {
  if (!host) return;
  const image = host.querySelector('img');
  const fallback = host.querySelector('span');
  if (fallback) fallback.textContent = initials(name);

  if (url && image) {
    image.src = url;
    image.alt = `Foto de perfil de ${name || 'aluno'}`;
    image.classList.remove('hidden');
  } else if (image) {
    image.removeAttribute('src');
    image.classList.add('hidden');
  }
}

function renderProfile(aluno, previewUrl = '') {
  if (!aluno) return;
  currentProfile = aluno;
  const displayName = String(aluno.nome_perfil || aluno.nome_exibicao || aluno.nome || 'Aluno').trim();
  const photoUrl = previewUrl || aluno.foto_perfil_url || '';

  if (mainName) mainName.textContent = displayName;
  if (nameInput && document.activeElement !== nameInput) nameInput.value = displayName;
  renderAvatar(mainAvatar, photoUrl, displayName);
  renderAvatar(editorAvatar, photoUrl, displayName);
}

async function invoke(body) {
  const { data, error } = await supabase.functions.invoke('aluno-auth', { body });
  if (error) {
    let detail = error.message;
    try {
      const payload = await error.context?.json?.();
      detail = payload?.error || detail;
    } catch (_) {}
    throw new Error(detail || 'Não foi possível atualizar seu perfil.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível abrir esta imagem. Escolha outra foto.'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível preparar a foto.')), 'image/jpeg', quality);
  });
}

async function preparePhoto(file) {
  if (!file || !String(file.type || '').startsWith('image/')) throw new Error('Selecione uma imagem válida.');
  if (file.size > MAX_SOURCE_SIZE) throw new Error('A imagem original é muito grande. Escolha uma foto de até 15 MB.');

  const { image, url } = await loadImage(file);
  try {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error('Não foi possível identificar o tamanho da imagem.');

    const scale = Math.min(1, MAX_OUTPUT_SIDE / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Não foi possível preparar a foto neste aparelho.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    let blob = await canvasToBlob(canvas, .86);
    if (blob.size > 5 * 1024 * 1024) blob = await canvasToBlob(canvas, .7);
    if (blob.size > 5 * 1024 * 1024) throw new Error('A foto ficou maior que 5 MB. Escolha outra imagem.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadProfile() {
  const token = sessionToken();
  if (!token) return;
  try {
    const result = await invoke({ action: 'me', token });
    renderProfile(result.aluno);
  } catch (error) {
    console.warn('Não foi possível carregar o perfil editável do aluno:', error);
    setStatus('Não foi possível carregar a edição do perfil agora.', 'error');
  }
}

choosePhotoButton?.addEventListener('click', () => photoInput?.click());

photoInput?.addEventListener('change', async () => {
  const file = photoInput.files?.[0];
  if (!file) return;
  choosePhotoButton.disabled = true;
  setStatus('Preparando foto...');
  try {
    pendingPhoto = await preparePhoto(file);
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    pendingPreviewUrl = URL.createObjectURL(pendingPhoto);
    const previewName = nameInput?.value.trim() || currentProfile?.nome_perfil || currentProfile?.nome || 'Aluno';
    renderAvatar(mainAvatar, pendingPreviewUrl, previewName);
    renderAvatar(editorAvatar, pendingPreviewUrl, previewName);
    setStatus('Foto pronta. Toque em Salvar perfil para confirmar.');
  } catch (error) {
    pendingPhoto = null;
    photoInput.value = '';
    setStatus(error.message || 'Não foi possível preparar a foto.', 'error');
  } finally {
    choosePhotoButton.disabled = false;
  }
});

nameInput?.addEventListener('input', () => {
  const name = nameInput.value.trim() || currentProfile?.nome_perfil || currentProfile?.nome || 'Aluno';
  if (mainName) mainName.textContent = name;
  renderAvatar(mainAvatar, pendingPreviewUrl || currentProfile?.foto_perfil_url || '', name);
  renderAvatar(editorAvatar, pendingPreviewUrl || currentProfile?.foto_perfil_url || '', name);
});

form?.addEventListener('submit', async event => {
  event.preventDefault();
  const token = sessionToken();
  const displayName = String(nameInput?.value || '').trim();
  if (!token) return setStatus('Sua sessão expirou. Entre novamente.', 'error');
  if (displayName.length < 2 || displayName.length > 80) return setStatus('O nome deve ter entre 2 e 80 caracteres.', 'error');

  saveButton.disabled = true;
  choosePhotoButton.disabled = true;
  setStatus('Salvando perfil...');

  try {
    let uploadedPath = '';
    if (pendingPhoto) {
      const upload = await invoke({
        action: 'profile_upload_url',
        token,
        mime_type: 'image/jpeg',
        size_bytes: pendingPhoto.size,
      });

      const { error: uploadError } = await supabase.storage
        .from(PROFILE_BUCKET)
        .uploadToSignedUrl(upload.path, upload.upload_token, pendingPhoto, {
          contentType: 'image/jpeg',
          cacheControl: '3600',
        });
      if (uploadError) throw uploadError;
      uploadedPath = upload.path;
    }

    const payload = { action: 'update_profile', token, nome_exibicao: displayName };
    if (uploadedPath) payload.foto_perfil_path = uploadedPath;
    const result = await invoke(payload);

    currentProfile = result.aluno;
    pendingPhoto = null;
    photoInput.value = '';
    if (pendingPreviewUrl) {
      URL.revokeObjectURL(pendingPreviewUrl);
      pendingPreviewUrl = '';
    }
    renderProfile(result.aluno);
    setStatus('Perfil atualizado com sucesso.', 'success');
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'Não foi possível salvar seu perfil.', 'error');
    if (currentProfile) renderProfile(currentProfile, pendingPreviewUrl);
  } finally {
    saveButton.disabled = false;
    choosePhotoButton.disabled = false;
  }
});

window.addEventListener('beforeunload', () => {
  if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
});

loadProfile();
