import { supabase } from './supabase.js';

const form = document.querySelector('#recovery-form');
const message = document.querySelector('#recovery-message');
const submitButton = form?.querySelector('[type="submit"]') || null;
const defaultButtonText = submitButton?.textContent || 'Enviar link de recuperação';

function show(text, type = 'error') {
  if (!message) return;
  message.textContent = text;
  message.className = `message show ${type}`;
  message.setAttribute('role', type === 'error' ? 'alert' : 'status');
  message.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
}

function setSubmitting(submitting) {
  if (!submitButton) return;
  submitButton.disabled = submitting;
  submitButton.textContent = submitting ? 'Enviando...' : defaultButtonText;
}

form?.addEventListener('submit', async event => {
  event.preventDefault();

  const emailField = form.elements.namedItem('email');
  const email = emailField instanceof HTMLInputElement
    ? emailField.value.trim().toLowerCase()
    : '';

  if (!email || !emailField?.checkValidity()) {
    emailField?.focus();
    show('Informe um e-mail válido.');
    return;
  }

  setSubmitting(true);

  try {
    const redirectTo = new URL('nova-senha.html', window.location.origin).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;

    show('Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha.', 'success');
    form.reset();
  } catch (error) {
    console.error('Falha ao solicitar recuperação de senha:', error);
    show('Não foi possível enviar o link agora. Aguarde alguns minutos e tente novamente.');
  } finally {
    setSubmitting(false);
  }
});
