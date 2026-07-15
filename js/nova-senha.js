import { supabase } from './supabase.js';

const form = document.querySelector('#password-form');
const message = document.querySelector('#password-message');
let recoveryReady = false;

function show(text, type = 'error') {
  message.textContent = text;
  message.className = `message show ${type}`;
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
    recoveryReady = true;
  }
});

const { data: { session } } = await supabase.auth.getSession();
if (session) recoveryReady = true;

form?.addEventListener('submit', async event => {
  event.preventDefault();
  const password = form.password.value;
  const confirmPassword = form.confirm_password.value;

  if (password !== confirmPassword) return show('As senhas não coincidem.');
  if (password.length < 6) return show('A senha deve ter pelo menos 6 caracteres.');
  if (!recoveryReady) return show('Este link de recuperação é inválido ou expirou. Solicite um novo link.');

  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = 'Salvando...';

  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    await supabase.auth.signOut();
    show('Senha alterada com sucesso. Redirecionando para o login...', 'success');
    setTimeout(() => window.location.replace('index.html'), 1200);
  } catch (error) {
    console.error(error);
    show(error.message || 'Não foi possível atualizar sua senha.');
    button.disabled = false;
    button.textContent = 'Salvar nova senha';
  }
});
