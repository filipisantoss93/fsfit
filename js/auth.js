import { supabase } from './supabase.js';
import { ensurePersonalProfile } from './layout.js';

const form = document.querySelector('#auth-form');
const title = document.querySelector('#auth-title');
const submit = document.querySelector('#auth-submit');
const switchButton = document.querySelector('#auth-switch');
const nameGroup = document.querySelector('#name-group');
const confirmGroup = document.querySelector('#confirm-group');
const message = document.querySelector('#auth-message');
let mode = 'login';

function show(text, type = 'error') {
  message.textContent = text;
  message.className = `message show ${type}`;
}

function toggleMode() {
  mode = mode === 'login' ? 'signup' : 'login';
  const signup = mode === 'signup';
  title.textContent = signup ? 'Crie sua conta' : 'Acesse sua conta';
  submit.textContent = signup ? 'Cadastrar' : 'Entrar';
  switchButton.textContent = signup ? 'Já possui cadastro? Entrar' : 'Ainda não tem cadastro? Criar conta';
  nameGroup.classList.toggle('hidden', !signup);
  confirmGroup.classList.toggle('hidden', !signup);
  message.className = 'message';
}

async function finishAuthenticatedAccess(session) {
  await ensurePersonalProfile(session);
  window.location.replace('painel.html');
}

switchButton?.addEventListener('click', toggleMode);
form?.addEventListener('submit', async event => {
  event.preventDefault();

  const email = form.email.value.trim().toLowerCase();
  const password = form.password.value;
  const fullName = form.full_name.value.trim();
  const confirmPassword = form.confirm_password.value;

  if (mode === 'signup' && password !== confirmPassword) {
    return show('As senhas não coincidem.');
  }

  submit.disabled = true;
  submit.textContent = 'Aguarde...';

  try {
    if (mode === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await finishAuthenticatedAccess(data.session);
      return;
    }

    if (fullName.length < 2) throw new Error('Informe seu nome completo.');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, tipo: 'personal' } }
    });

    if (error) throw error;

    if (data.session) {
      await finishAuthenticatedAccess(data.session);
    } else {
      show('Conta criada. Verifique seu e-mail para confirmar o cadastro.', 'success');
    }
  } catch (error) {
    console.error(error);
    show(error.message || 'Não foi possível concluir a autenticação.');
  } finally {
    submit.disabled = false;
    submit.textContent = mode === 'signup' ? 'Cadastrar' : 'Entrar';
  }
});

const { data: { session } } = await supabase.auth.getSession();
if (session) {
  try {
    await finishAuthenticatedAccess(session);
  } catch (error) {
    console.error(error);
    show('Não foi possível preparar seu perfil. Tente novamente.');
  }
}