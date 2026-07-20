import { supabase } from './supabase.js';

const params = new URLSearchParams(window.location.search);
const pathMatch = window.location.pathname.match(/^\/p\/([^/]+)\/?$/i);
const slug = String(pathMatch?.[1] || params.get('u') || '').trim().toLowerCase();
const profileHost = document.querySelector('#public-profile');
const profileDetailsHost = document.querySelector('#public-profile-details');
const accessSection = document.querySelector('#student-access');
const message = document.querySelector('#access-message');
const phoneForm = document.querySelector('#phone-form');
const pinForm = document.querySelector('#pin-form');
const activationForm = document.querySelector('#activation-form');
let phone = '';
let hasActiveStudentSession = false;
let activeStudentPersonalSlug = '';

function esc(value = '') { const div = document.createElement('div'); div.textContent = value ?? ''; return div.innerHTML; }
function instagramHref(value = '') {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const withoutAt = raw.replace(/^@+/, '');
  if (/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i.test(withoutAt)) {
    const candidate = /^https?:\/\//i.test(withoutAt) ? withoutAt : `https://${withoutAt}`;
    try {
      const url = new URL(candidate);
      const handle = url.pathname.split('/').filter(Boolean)[0] || '';
      return handle ? `https://www.instagram.com/${encodeURIComponent(handle)}/` : 'https://www.instagram.com/';
    } catch (_) {
      return '';
    }
  }

  const handle = withoutAt.split(/[\/?#]/)[0].trim();
  return handle ? `https://www.instagram.com/${encodeURIComponent(handle)}/` : '';
}
function whatsappHref(value = '') {
  const number = String(value ?? '').replace(/\D/g, '');
  if (number.length === 10 || number.length === 11) return `https://wa.me/55${number}`;
  if (number.length >= 12 && number.length <= 15) return `https://wa.me/${number}`;
  return '';
}
function digits(value = '', max = 11) { return String(value).replace(/\D/g, '').slice(0, max); }
function show(text, type = 'error') { message.textContent = text; message.className = `message show ${type}`; }
function clearMessage() { message.className = 'message'; message.textContent = ''; }
function resetAccess() { phone = ''; phoneForm.classList.remove('hidden'); pinForm.classList.add('hidden'); activationForm.classList.add('hidden'); phoneForm.reset(); pinForm.reset(); activationForm.reset(); clearMessage(); }
function clearStoredStudentSession() {
  localStorage.removeItem('fsfit_aluno_token');
  localStorage.removeItem('fsfit_aluno_token_expira_em');
}
function storedStudentSession() {
  const token = String(localStorage.getItem('fsfit_aluno_token') || '').trim();
  const expiresAt = String(localStorage.getItem('fsfit_aluno_token_expira_em') || '').trim();
  const personalSlug = String(localStorage.getItem('fsfit_personal_slug') || '').trim().toLowerCase();
  if (!token) return null;
  if (expiresAt) {
    const expires = new Date(expiresAt);
    if (!Number.isNaN(expires.getTime()) && expires <= new Date()) {
      clearStoredStudentSession();
      return null;
    }
  }
  return { token, personalSlug };
}
function saveSession(result) {
  localStorage.setItem('fsfit_aluno_token', result.token);
  localStorage.setItem('fsfit_aluno_token_expira_em', result.expira_em || '');
  localStorage.setItem('fsfit_personal_slug', slug);
  window.location.replace('/aluno.html');
}

function insertReturnAction(id, href, label, className = 'btn btn-outline') {
  if (document.querySelector(`#${id}`)) return;
  const actions = document.createElement('div');
  actions.id = id;
  actions.className = 'public-return-actions';
  actions.innerHTML = `<a class="${className} public-return-button" href="${href}">← ${label}</a>`;
  profileHost.parentNode.insertBefore(actions, profileHost);
}

function renderStudentPortalReturnButton() {
  insertReturnAction('student-portal-return', '/aluno.html', 'Voltar ao portal do aluno', 'btn btn-outline');
}

async function renderOwnerReturnButton(personalId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id || session.user.id !== personalId) return;

  const { data: profile } = await supabase
    .from('perfis')
    .select('tipo')
    .eq('id', session.user.id)
    .maybeSingle();

  if (profile?.tipo !== 'personal') return;
  insertReturnAction('owner-panel-return', '/painel.html', 'Voltar ao painel', 'btn btn-outline');
}

async function invoke(body) {
  const { data, error } = await supabase.functions.invoke('aluno-auth', { body });
  if (error) {
    let detail = error.message;
    try { const response = error.context; if (response && typeof response.json === 'function') { const payload = await response.json(); detail = payload?.error || detail; } } catch (_) {}
    throw new Error(detail || 'Não foi possível concluir o acesso.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function prepareStoredStudentSession() {
  const stored = storedStudentSession();
  if (!stored) return false;

  try {
    const result = await invoke({ action: 'me', token: stored.token });
    if (!result?.success || !result?.aluno) return false;

    hasActiveStudentSession = true;
    activeStudentPersonalSlug = String(result?.personal?.slug || stored.personalSlug || '').trim().toLowerCase();
    if (activeStudentPersonalSlug) localStorage.setItem('fsfit_personal_slug', activeStudentPersonalSlug);
    renderStudentPortalReturnButton();
    return true;
  } catch (error) {
    const errorMessage = String(error?.message || '').toLowerCase();
    if (errorMessage.includes('sessão expirada') || errorMessage.includes('sessão inválida')) clearStoredStudentSession();
    return false;
  }
}

function createLightbox() {
  const modal = document.createElement('div');
  modal.id = 'photo-lightbox';
  modal.className = 'photo-lightbox hidden';
  modal.innerHTML = '<div class="photo-lightbox-dialog" role="dialog" aria-modal="true" aria-label="Visualização da foto"><button class="photo-lightbox-close" type="button" aria-label="Fechar">×</button><img class="photo-lightbox-image" alt="Foto ampliada"></div>';
  document.body.appendChild(modal);
  const image = modal.querySelector('.photo-lightbox-image');
  const close = () => modal.classList.add('hidden');
  modal.querySelector('.photo-lightbox-close').addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  return { open(url, alt) { image.src = url; image.alt = alt || 'Foto ampliada'; modal.classList.remove('hidden'); }, close };
}

const lightbox = createLightbox();

async function loadProfile() {
  if (!slug) { profileHost.innerHTML = '<div class="public-profile-error"><h1>Link inválido</h1><p>O endereço do personal não foi informado.</p></div>'; return; }

  const { data, error } = await supabase.from('perfis_publicos').select('personal_id,slug,nome_publico,foto_url,foto_local_url,local_trabalho,cidade,bio,especialidades,instagram,whatsapp').eq('slug', slug).eq('publicado', true).maybeSingle();
  if (error || !data) { profileHost.innerHTML = '<div class="public-profile-error"><h1>Página indisponível</h1><p>Este perfil não existe ou não está publicado.</p></div>'; return; }

  await renderOwnerReturnButton(data.personal_id);

  const { data: photos, error: photosError } = await supabase.from('perfil_fotos').select('id,foto_url,ordem').eq('personal_id', data.personal_id).order('ordem').limit(10);
  if (photosError) console.error(photosError);

  document.title = `${data.nome_publico} — FS Fit`;
  if (!hasActiveStudentSession) localStorage.setItem('fsfit_personal_slug', slug);

  const avatar = data.foto_url ? `<img class="public-profile-avatar" src="${esc(data.foto_url)}" alt="Foto de ${esc(data.nome_publico)}">` : `<div class="public-profile-avatar public-profile-avatar-placeholder">${esc(data.nome_publico.charAt(0).toUpperCase())}</div>`;
  const location = [data.local_trabalho, data.cidade].filter(Boolean).map(esc).join(' · ');
  const instagramUrl = instagramHref(data.instagram);
  const professionalWhatsappUrl = whatsappHref(data.whatsapp || '');
  const quickActions = [
    instagramUrl ? `<a class="btn btn-outline public-instagram-button" href="${esc(instagramUrl)}" target="_blank" rel="noopener noreferrer">Instagram</a>` : '',
    professionalWhatsappUrl ? `<a class="btn btn-primary" href="${esc(professionalWhatsappUrl)}" target="_blank" rel="noopener noreferrer">Falar no WhatsApp</a>` : ''
  ].filter(Boolean).join('');

  profileHost.innerHTML = `<div class="public-profile-top">${avatar}<div class="public-profile-top-content"><span class="hero-badge">PERSONAL TRAINER</span><h1>${esc(data.nome_publico)}</h1>${location ? `<p class="public-profile-location">${location}</p>` : ''}${data.especialidades ? `<p class="public-profile-specialty-summary">${esc(data.especialidades)}</p>` : ''}</div></div>${quickActions ? `<div class="public-profile-quick-actions">${quickActions}</div>` : ''}`;

  const about = data.bio || data.especialidades ? `<section class="public-about-section"><h2>Sobre mim</h2><div class="public-about-panel">${data.bio ? `<p class="public-profile-bio">${esc(data.bio)}</p>` : ''}${data.especialidades ? `<div class="public-specialties-block"><strong>Especialidades</strong><span>${esc(data.especialidades)}</span></div>` : ''}</div></section>` : '';
  const workplace = data.foto_local_url ? `<section class="public-media-section"><h2>Onde eu trabalho</h2><button class="public-workplace-photo photo-open" type="button" data-photo="${esc(data.foto_local_url)}" aria-label="Ampliar foto do local de trabalho"><img src="${esc(data.foto_local_url)}" alt="Local de trabalho de ${esc(data.nome_publico)}"></button></section>` : '';
  const gallery = photos?.length ? `<section class="public-media-section"><h2>Meu dia a dia</h2><div class="public-photo-grid">${photos.map((item, index) => `<button class="public-photo-item photo-open" type="button" data-photo="${esc(item.foto_url)}" aria-label="Ampliar foto ${index + 1}"><img src="${esc(item.foto_url)}" alt="Dia a dia profissional de ${esc(data.nome_publico)}"></button>`).join('')}</div></section>` : '';

  if (profileDetailsHost) {
    profileDetailsHost.innerHTML = `${about}${workplace}${gallery}`;
    profileDetailsHost.classList.toggle('hidden', !(about || workplace || gallery));
    profileDetailsHost.querySelectorAll('.photo-open').forEach(button => button.addEventListener('click', () => lightbox.open(button.dataset.photo, button.querySelector('img')?.alt)));
  }

  accessSection.classList.toggle('hidden', hasActiveStudentSession);
}

phoneForm.telefone.addEventListener('input', () => { phoneForm.telefone.value = digits(phoneForm.telefone.value); });
pinForm.pin.addEventListener('input', () => { pinForm.pin.value = digits(pinForm.pin.value, 4); });
activationForm.pin.addEventListener('input', () => { activationForm.pin.value = digits(activationForm.pin.value, 4); });
activationForm.pin_confirm.addEventListener('input', () => { activationForm.pin_confirm.value = digits(activationForm.pin_confirm.value, 4); });
document.querySelector('#change-phone').addEventListener('click', resetAccess);
document.querySelector('#change-phone-activation').addEventListener('click', resetAccess);

phoneForm.addEventListener('submit', async event => {
  event.preventDefault(); clearMessage(); phone = digits(phoneForm.telefone.value);
  if (phone.length !== 11) return show('Informe seu WhatsApp com DDD e número, totalizando 11 dígitos.');
  const button = phoneForm.querySelector('[type="submit"]'); button.disabled = true;
  try {
    const result = await invoke({ action: 'lookup', telefone: phone, personal_slug: slug });
    phoneForm.classList.add('hidden');
    if (result.next === 'activate') {
      activationForm.classList.remove('hidden');
      show('Primeiro acesso: crie um PIN de 4 números para entrar.', 'success');
    } else {
      pinForm.classList.remove('hidden');
    }
  } catch (error) { show(error.message); } finally { button.disabled = false; }
});

pinForm.addEventListener('submit', async event => {
  event.preventDefault(); clearMessage(); const pin = digits(pinForm.pin.value, 4);
  if (pin.length !== 4) return show('Informe seu PIN de 4 números.');
  const button = pinForm.querySelector('[type="submit"]'); button.disabled = true;
  try { const result = await invoke({ action: 'login', telefone: phone, pin, personal_slug: slug }); saveSession(result); }
  catch (error) { show(error.message); } finally { button.disabled = false; }
});

activationForm.addEventListener('submit', async event => {
  event.preventDefault(); clearMessage();
  const pin = digits(activationForm.pin.value, 4);
  const pinConfirm = digits(activationForm.pin_confirm.value, 4);
  if (pin.length !== 4 || pinConfirm.length !== 4) return show('Crie e confirme um PIN de 4 números.');
  if (pin !== pinConfirm) return show('Os PINs informados não coincidem.');
  const button = activationForm.querySelector('[type="submit"]'); button.disabled = true;
  try {
    const result = await invoke({ action: 'activate', telefone: phone, pin, personal_slug: slug });
    saveSession(result);
  } catch (error) { show(error.message); } finally { button.disabled = false; }
});

await prepareStoredStudentSession();
await loadProfile();
