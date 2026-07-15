import { supabase } from './supabase.js';

const params = new URLSearchParams(window.location.search);
const pathMatch = window.location.pathname.match(/^\/p\/([^/]+)\/?$/i);
const slug = String(pathMatch?.[1] || params.get('u') || '').trim().toLowerCase();
const profileHost = document.querySelector('#public-profile');
const accessSection = document.querySelector('#student-access');
const message = document.querySelector('#access-message');
const phoneForm = document.querySelector('#phone-form');
const pinForm = document.querySelector('#pin-form');
const activationForm = document.querySelector('#activation-form');
let phone = '';

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function digits(value = '', max = 11) {
  return String(value).replace(/\D/g, '').slice(0, max);
}

function show(text, type = 'error') {
  message.textContent = text;
  message.className = `message show ${type}`;
}

function clearMessage() {
  message.className = 'message';
  message.textContent = '';
}

function resetAccess() {
  phone = '';
  phoneForm.classList.remove('hidden');
  pinForm.classList.add('hidden');
  activationForm.classList.add('hidden');
  phoneForm.reset();
  pinForm.reset();
  activationForm.reset();
  clearMessage();
}

function saveSession(result) {
  localStorage.setItem('fsfit_aluno_token', result.token);
  localStorage.setItem('fsfit_aluno_token_expira_em', result.expira_em || '');
  window.location.href = '/aluno.html';
}

async function invoke(body) {
  const { data, error } = await supabase.functions.invoke('aluno-auth', { body });
  if (error) {
    let detail = error.message;
    try {
      const response = error.context;
      if (response && typeof response.json === 'function') {
        const payload = await response.json();
        detail = payload?.error || detail;
      }
    } catch (_) {}
    throw new Error(detail || 'Não foi possível concluir o acesso.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

async function loadProfile() {
  if (!slug) {
    profileHost.innerHTML = '<div class="public-profile-error"><h1>Link inválido</h1><p>O endereço do personal não foi informado.</p></div>';
    return;
  }

  const { data, error } = await supabase
    .from('perfis_publicos')
    .select('slug,nome_publico,foto_url,local_trabalho,cidade,bio,especialidades,instagram')
    .eq('slug', slug)
    .eq('publicado', true)
    .maybeSingle();

  if (error || !data) {
    profileHost.innerHTML = '<div class="public-profile-error"><h1>Página indisponível</h1><p>Este perfil não existe ou não está publicado.</p></div>';
    return;
  }

  localStorage.setItem('fsfit_personal_slug', data.slug);
  document.title = `${data.nome_publico} — FS Fit`;

  const canonicalUrl = `${window.location.origin}/p/${encodeURIComponent(data.slug)}`;
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = canonicalUrl;

  const avatar = data.foto_url
    ? `<img class="public-profile-avatar" src="${esc(data.foto_url)}" alt="Foto de ${esc(data.nome_publico)}">`
    : `<div class="public-profile-avatar public-profile-avatar-placeholder">${esc(data.nome_publico.charAt(0).toUpperCase())}</div>`;
  const location = [data.local_trabalho, data.cidade].filter(Boolean).map(esc).join(' · ');
  const instagram = data.instagram
    ? `<div class="public-profile-info"><strong>Instagram</strong><span>${esc(data.instagram)}</span></div>`
    : '';

  profileHost.innerHTML = `
    <div class="public-profile-top">
      ${avatar}
      <div>
        <span class="hero-badge">PERSONAL TRAINER</span>
        <h1>${esc(data.nome_publico)}</h1>
        ${location ? `<p class="public-profile-location">${location}</p>` : ''}
      </div>
    </div>
    ${data.bio ? `<p class="public-profile-bio">${esc(data.bio)}</p>` : ''}
    <div class="public-profile-details">
      ${data.especialidades ? `<div class="public-profile-info"><strong>Especialidades</strong><span>${esc(data.especialidades)}</span></div>` : ''}
      ${instagram}
    </div>`;

  accessSection.classList.remove('hidden');
}

phoneForm.telefone.addEventListener('input', () => {
  phoneForm.telefone.value = digits(phoneForm.telefone.value);
});
pinForm.pin.addEventListener('input', () => { pinForm.pin.value = digits(pinForm.pin.value, 4); });
activationForm.codigo.addEventListener('input', () => { activationForm.codigo.value = digits(activationForm.codigo.value, 6); });
activationForm.pin.addEventListener('input', () => { activationForm.pin.value = digits(activationForm.pin.value, 4); });

document.querySelector('#change-phone').addEventListener('click', resetAccess);
document.querySelector('#change-phone-activation').addEventListener('click', resetAccess);

phoneForm.addEventListener('submit', async event => {
  event.preventDefault();
  clearMessage();
  phone = digits(phoneForm.telefone.value);
  if (phone.length !== 11) return show('Informe seu WhatsApp com DDD e número, totalizando 11 dígitos.');

  const button = phoneForm.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const result = await invoke({ action: 'lookup', telefone: phone, personal_slug: slug });
    phoneForm.classList.add('hidden');
    if (result.next === 'activate') activationForm.classList.remove('hidden');
    else pinForm.classList.remove('hidden');
  } catch (error) {
    show(error.message);
  } finally {
    button.disabled = false;
  }
});

pinForm.addEventListener('submit', async event => {
  event.preventDefault();
  clearMessage();
  const pin = digits(pinForm.pin.value, 4);
  if (pin.length !== 4) return show('Informe seu PIN de 4 números.');

  const button = pinForm.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const result = await invoke({ action: 'login', telefone: phone, pin, personal_slug: slug });
    saveSession(result);
  } catch (error) {
    show(error.message);
  } finally {
    button.disabled = false;
  }
});

activationForm.addEventListener('submit', async event => {
  event.preventDefault();
  clearMessage();
  const codigo = digits(activationForm.codigo.value, 6);
  const pin = digits(activationForm.pin.value, 4);
  if (codigo.length !== 6 || pin.length !== 4) return show('Informe o código de 6 números e crie um PIN de 4 números.');

  const button = activationForm.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const result = await invoke({ action: 'activate', telefone: phone, codigo, pin, personal_slug: slug });
    saveSession(result);
  } catch (error) {
    show(error.message);
  } finally {
    button.disabled = false;
  }
});

await loadProfile();