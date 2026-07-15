import { supabase } from './supabase.js';

const form = document.querySelector('#recovery-form');
const message = document.querySelector('#recovery-message');

const PRODUCTION_ORIGIN = 'https://fit.fssolucoes.tech';

function show(text, type = 'error') {
  message.textContent = text;
  message.className = `message show ${type}`;
}

form?.addEventListener('submit', async event => {
  event.preventDefault();
  const email = form.email.value.trim().toLowerCase();
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = 'Enviando...';

  try {
    const redirectTo = `${PRODUCTION_ORIGIN}/nova-senha.html`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;

    show('Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha.', 'success');
    form.reset();
  } catch (error) {
    console.error(error);
    show(error.message || 'Não foi possível enviar o e-mail de recuperação.');
  } finally {
    button.disabled = false;
    button.textContent = 'Enviar link de recuperação';
  }
});
