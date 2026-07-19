import { supabase } from './supabase.js';

const message = document.querySelector('#access-message');
const resolverForm = document.querySelector('#student-resolver-form');
const pinForm = document.querySelector('#student-pin-form');
const activationForm = document.querySelector('#student-activation-form');
const selectedPersonalHost = document.querySelector('#selected-personal');
const description = document.querySelector('#access-description');

let phone = '';
let personalSlug = '';
let selectedPersonal = null;

function digits(value = '', max = 11) {
  return String(value).replace(/\D/g, '').slice(0, max);
}

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function show(text, type = 'error') {
  if (!message) return;
  message.textContent = text;
  message.className = `message show ${type}`;
}

function clearMessage() {
  if (!message) return;
  message.textContent = '';
  message.className = 'message';
}

function getStoredStudentToken() {
  const token = String(localStorage.getItem('fsfit_aluno_token') || '').trim();
  const expiresAt = String(localStorage.getItem('fsfit_aluno_token_expira_em') || '').trim();
  if (!token) return '';

  if (expiresAt) {
    const expires = new Date(expiresAt);
    if (!Number.isNaN(expires.getTime()) && expires <= new Date()) {
      localStorage.removeItem('fsfit_aluno_token');
      localStorage.removeItem('fsfit_aluno_token_expira_em');
      return '';
    }
  }

  return token;
}

function readPendingPersonals() {
  try {
    const value = JSON.parse(sessionStorage.getItem('fsfit_student_personals_pending') || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function clearPendingSelection() {
  sessionStorage.removeItem('fsfit_student_phone_pending');
  sessionStorage.removeItem('fsfit_student_phone_prefill');
  sessionStorage.removeItem('fsfit_student_personals_pending');
}

function renderSelectedPersonal(personal) {
  if (!selectedPersonalHost) return;
  const name = personal?.nome || 'Seu personal';
  const location = [personal?.local_trabalho, personal?.cidade].filter(Boolean).join(' · ');
  const avatar = personal?.foto_url
    ? `<img class="selected-personal-avatar" src="${esc(personal.foto_url)}" alt="Foto de ${esc(name)}">`
    : `<div class="selected-personal-avatar selected-personal-placeholder">${esc(name.charAt(0).toUpperCase())}</div>`;

  selectedPersonalHost.innerHTML = `${avatar}<div><strong>${esc(name)}</strong><span>${esc(location || 'Acompanhamento selecionado')}</span></div>`;
  selectedPersonalHost.classList.remove('hidden');
}

function resetAccess() {
  phone = '';
  personalSlug = '';
  selectedPersonal = null;
  clearPendingSelection();
  localStorage.removeItem('fsfit_personal_slug');
  clearMessage();
  selectedPersonalHost?.classList.add('hidden');
  resolverForm?.classList.remove('hidden');
  pinForm?.classList.add('hidden');
  activationForm?.classList.add('hidden');
  resolverForm?.reset();
  pinForm?.reset();
  activationForm?.reset();
  if (description) description.textContent = 'Informe seu WhatsApp cadastrado. Se você tiver mais de um personal, poderá escolher qual acompanhamento deseja acessar.';
  history.replaceState({}, '', 'acesso-aluno.html');
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

function saveSession(result) {
  localStorage.setItem('fsfit_aluno_token', result.token);
  localStorage.setItem('fsfit_aluno_token_expira_em', result.expira_em || '');
  localStorage.setItem('fsfit_personal_slug', personalSlug);
  clearPendingSelection();
  window.location.replace('aluno.html');
}

async function beginPersonalAccess(personal, telefone) {
  phone = digits(telefone);
  personalSlug = String(personal?.slug || '').trim().toLowerCase();
  selectedPersonal = personal || null;

  if (phone.length !== 11 || !personalSlug) {
    resetAccess();
    return show('Não foi possível identificar o acompanhamento selecionado. Informe seu WhatsApp novamente.');
  }

  clearMessage();
  localStorage.setItem('fsfit_personal_slug', personalSlug);
  sessionStorage.setItem('fsfit_student_phone_pending', phone);
  resolverForm?.classList.add('hidden');
  pinForm?.classList.add('hidden');
  activationForm?.classList.add('hidden');
  renderSelectedPersonal(personal);
  if (description) description.textContent = 'Confirme seu acesso para abrir diretamente a sua área de treinos.';

  try {
    const result = await invoke({ action: 'lookup', telefone: phone, personal_slug: personalSlug });
    if (result.next === 'activate') {
      activationForm?.classList.remove('hidden');
      show('Primeiro acesso: crie um PIN de 4 números para entrar.', 'success');
    } else {
      pinForm?.classList.remove('hidden');
    }
  } catch (error) {
    console.error(error);
    show(error.message || 'Não foi possível abrir este acompanhamento.');
  }
}

async function redirectPersonalPreview() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;

  try {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    const isStudentRecord = referrer?.origin === location.origin && referrer.pathname.endsWith('/ficha-aluno.html');
    const alunoId = isStudentRecord ? referrer.searchParams.get('id') : null;
    if (!alunoId) return false;

    window.location.replace(`aluno-preview.html?id=${encodeURIComponent(alunoId)}`);
    return true;
  } catch {
    return false;
  }
}

resolverForm?.telefone?.addEventListener('input', () => {
  resolverForm.telefone.value = digits(resolverForm.telefone.value);
});

pinForm?.pin?.addEventListener('input', () => {
  pinForm.pin.value = digits(pinForm.pin.value, 4);
});

activationForm?.pin?.addEventListener('input', () => {
  activationForm.pin.value = digits(activationForm.pin.value, 4);
});

activationForm?.pin_confirm?.addEventListener('input', () => {
  activationForm.pin_confirm.value = digits(activationForm.pin_confirm.value, 4);
});

document.querySelectorAll('[data-change-student-access]').forEach(button => {
  button.addEventListener('click', resetAccess);
});

resolverForm?.addEventListener('submit', async event => {
  event.preventDefault();
  clearMessage();
  const telefone = digits(resolverForm.telefone.value);
  if (telefone.length !== 11) return show('Informe seu WhatsApp com DDD e número, totalizando 11 dígitos.');

  const button = resolverForm.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = 'Localizando...';

  try {
    const { data, error } = await supabase.rpc('fsfit_listar_personais_aluno', { p_telefone: telefone });
    if (error) throw error;

    const personals = Array.isArray(data) ? data : [];
    if (!personals.length) {
      throw new Error('Não encontramos um aluno ativo com este WhatsApp. Confira o número ou fale com seu personal.');
    }

    sessionStorage.setItem('fsfit_student_phone_pending', telefone);
    sessionStorage.setItem('fsfit_student_personals_pending', JSON.stringify(personals));

    if (personals.length === 1) {
      await beginPersonalAccess(personals[0], telefone);
      return;
    }

    window.location.replace('selecionar-personal.html');
  } catch (error) {
    console.error(error);
    show(error.message || 'Não foi possível localizar seu acesso agora.');
    button.disabled = false;
    button.textContent = 'Continuar para minha área';
  }
});

pinForm?.addEventListener('submit', async event => {
  event.preventDefault();
  clearMessage();
  const pin = digits(pinForm.pin.value, 4);
  if (pin.length !== 4) return show('Informe seu PIN de 4 números.');

  const button = pinForm.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const result = await invoke({ action: 'login', telefone: phone, pin, personal_slug: personalSlug });
    saveSession(result);
  } catch (error) {
    console.error(error);
    show(error.message || 'Não foi possível entrar na sua área.');
    button.disabled = false;
  }
});

activationForm?.addEventListener('submit', async event => {
  event.preventDefault();
  clearMessage();
  const pin = digits(activationForm.pin.value, 4);
  const pinConfirm = digits(activationForm.pin_confirm.value, 4);

  if (pin.length !== 4 || pinConfirm.length !== 4) return show('Crie e confirme um PIN de 4 números.');
  if (pin !== pinConfirm) return show('Os PINs informados não coincidem.');

  const button = activationForm.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    const result = await invoke({ action: 'activate', telefone: phone, pin, personal_slug: personalSlug });
    saveSession(result);
  } catch (error) {
    console.error(error);
    show(error.message || 'Não foi possível concluir seu primeiro acesso.');
    button.disabled = false;
  }
});

async function init() {
  if (await redirectPersonalPreview()) return;

  if (getStoredStudentToken()) {
    window.location.replace('aluno.html');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const requestedSlug = String(params.get('u') || '').trim().toLowerCase();
  const pendingPhone = digits(sessionStorage.getItem('fsfit_student_phone_pending') || sessionStorage.getItem('fsfit_student_phone_prefill') || '');
  const pendingPersonals = readPendingPersonals();

  if (requestedSlug && pendingPhone) {
    const personal = pendingPersonals.find(item => String(item?.slug || '').toLowerCase() === requestedSlug) || { slug: requestedSlug, nome: 'Seu personal' };
    await beginPersonalAccess(personal, pendingPhone);
    return;
  }

  if (pendingPhone && resolverForm?.telefone) resolverForm.telefone.value = pendingPhone;
}

init();