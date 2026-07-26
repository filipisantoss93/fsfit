import { supabase } from './supabase.js';

const form = document.querySelector('#recovery-form');
const message = document.querySelector('#recovery-message');

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
    const redirectTo = `${window.location.origin}/nova-senha.html`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;

    show('Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha.', 'success');
    form.reset();
  } catch (error) {
    console.error(error);
    show('Não foi possível enviar o link agora. Aguarde alguns minutos e tente novamente.');
  } finally {
    button.disabled = false;
    button.textContent = 'Enviar link de recuperação';
  }
});
