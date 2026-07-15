import { supabase } from './supabase.js';

const message = document.querySelector('#access-message');
const loginForm = document.querySelector('#login-form');
const activationForm = document.querySelector('#activation-form');
const digits = (value, max) => String(value || '').replace(/\D/g, '').slice(0, max);
const show = (text, type = 'error') => {
  message.textContent = text;
  message.className = `message show ${type}`;
};

[loginForm.telefone, activationForm.telefone].forEach(input => input.addEventListener('input', () => input.value = digits(input.value, 11)));
[loginForm.pin, activationForm.pin].forEach(input => input.addEventListener('input', () => input.value = digits(input.value, 4)));
activationForm.codigo.addEventListener('input', () => activationForm.codigo.value = digits(activationForm.codigo.value, 6));

async function authenticate(body, button) {
  button.disabled = true;
  try {
    const { data, error } = await supabase.functions.invoke('aluno-auth', { body });
    if (error) throw error;
    if (!data?.success || !data?.token) throw new Error(data?.error || 'Não foi possível concluir o acesso.');
    localStorage.setItem('fsfit_aluno_token', data.token);
    localStorage.setItem('fsfit_aluno_token_expira_em', data.expira_em || '');
    window.location.replace('aluno.html');
  } catch (error) {
    show(error?.context?.body?.error || error.message || 'Não foi possível concluir o acesso.');
  } finally {
    button.disabled = false;
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const telefone = digits(loginForm.telefone.value, 11);
  const pin = digits(loginForm.pin.value, 4);
  if (telefone.length !== 11 || pin.length !== 4) return show('Informe WhatsApp com 11 números e PIN com 4 números.');
  await authenticate({ action: 'login', telefone, pin }, loginForm.querySelector('[type=submit]'));
});

activationForm.addEventListener('submit', async event => {
  event.preventDefault();
  const telefone = digits(activationForm.telefone.value, 11);
  const codigo = digits(activationForm.codigo.value, 6);
  const pin = digits(activationForm.pin.value, 4);
  if (telefone.length !== 11 || codigo.length !== 6 || pin.length !== 4) return show('Revise WhatsApp, código de ativação e PIN.');
  await authenticate({ action: 'activate', telefone, codigo, pin }, activationForm.querySelector('[type=submit]'));
});

if (localStorage.getItem('fsfit_aluno_token')) window.location.replace('aluno.html');