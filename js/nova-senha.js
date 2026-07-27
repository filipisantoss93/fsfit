import { supabase } from './supabase.js';

const form = document.querySelector('#password-form');
const message = document.querySelector('#password-message');
const status = document.querySelector('#recovery-status');
const fields = form ? [...form.querySelectorAll('input, button[type="submit"]')] : [];
let recoveryReady = false;
let validationFinished = false;

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

function setStatus(text, state = '') {
  if (!status) return;
  status.textContent = text;
  status.className = `password-reset-status${state ? ` ${state}` : ''}`;
}

function setFormEnabled(enabled) {
  fields.forEach(field => {
    field.disabled = !enabled;
  });
}

function markRecoveryReady() {
  if (recoveryReady) return;
  recoveryReady = true;
  validationFinished = true;
  setStatus('Link validado. Agora você pode criar sua nova senha.', 'ready');
  setFormEnabled(true);
  document.querySelector('#new-password')?.focus();
}

function markRecoveryInvalid() {
  if (recoveryReady) return;
  validationFinished = true;
  setStatus('Este link é inválido ou expirou. Solicite um novo link de recuperação.', 'invalid');
  setFormEnabled(false);
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') markRecoveryReady();
});

const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
const queryParams = new URLSearchParams(window.location.search);
const recoveryFlow = hashParams.get('type') === 'recovery' || queryParams.get('type') === 'recovery';

try {
  const { data: { session } } = await supabase.auth.getSession();
  if (session && recoveryFlow) {
    markRecoveryReady();
  } else {
    window.setTimeout(() => {
      if (!recoveryReady) markRecoveryInvalid();
    }, 1200);
  }
} catch (error) {
  console.error(error);
  markRecoveryInvalid();
}

form?.addEventListener('submit', async event => {
  event.preventDefault();
  clearMessage();

  const password = form.password.value;
  const confirmPassword = form.confirm_password.value;

  if (!validationFinished || !recoveryReady) {
    return show('Este link de recuperação é inválido ou expirou. Solicite um novo link.');
  }
  if (password.length < 8) return show('A senha deve ter pelo menos 8 caracteres.');
  if (password !== confirmPassword) return show('As senhas não coincidem.');

  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = 'Salvando...';

  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;

    await supabase.auth.signOut();
    setStatus('Senha atualizada com segurança.', 'ready');
    show('Senha alterada com sucesso. Redirecionando para o login...', 'success');
    form.querySelectorAll('input').forEach(input => {
      input.disabled = true;
      input.value = '';
    });
    window.setTimeout(() => window.location.replace('index.html?modo=login#cadastro'), 1400);
  } catch (error) {
    console.error(error);
    show(error.message || 'Não foi possível atualizar sua senha. Solicite um novo link e tente novamente.');
    button.disabled = false;
    button.textContent = 'Salvar nova senha';
  }
});