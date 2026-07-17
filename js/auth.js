import { supabase } from './supabase.js';
import { ensurePersonalProfile } from './layout.js';

const form = document.querySelector('#auth-form');
const title = document.querySelector('#auth-title');
const submit = document.querySelector('#auth-submit');
const switchButton = document.querySelector('#auth-switch');
const nameGroup = document.querySelector('#name-group');
const confirmGroup = document.querySelector('#confirm-group');
const forgotWrap = document.querySelector('#forgot-password-wrap');
const legalConsentGroup = document.querySelector('#legal-consent-group');
const legalConsent = document.querySelector('#legal-consent');
const trialNote = document.querySelector('#auth-trial-note');
const message = document.querySelector('#auth-message');
let mode = 'login';

function show(text, type = 'error') {
  message.textContent = text;
  message.className = `message show ${type}`;
}

function setMode(nextMode, { preserveMessage = false } = {}) {
  mode = nextMode;
  const signup = mode === 'signup';
  title.textContent = signup ? 'Comece seus 7 dias grátis' : 'Acesse sua conta';
  submit.textContent = signup ? 'Começar meus 7 dias grátis' : 'Entrar';
  switchButton.textContent = signup ? 'Já possui cadastro? Entrar' : 'Ainda não tem cadastro? Clique aqui.';
  if (trialNote) {
    trialNote.innerHTML = signup
      ? '<strong>7 dias grátis.</strong> Crie sua conta agora. Depois do período gratuito, continue por R$ 29,90.'
      : '<strong>Novo por aqui?</strong> Crie sua conta e ganhe 7 dias grátis.';
  }
  nameGroup.classList.toggle('hidden', !signup);
  confirmGroup.classList.toggle('hidden', !signup);
  legalConsentGroup?.classList.toggle('hidden', !signup);
  forgotWrap?.classList.toggle('hidden', signup);
  form.password.autocomplete = signup ? 'new-password' : 'current-password';
  if (!signup) {
    form.confirm_password.value = '';
    if (legalConsent) legalConsent.checked = false;
  }
  if (!preserveMessage) message.className = 'message';
}

function toggleMode() {
  setMode(mode === 'login' ? 'signup' : 'login');
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
  if (mode === 'signup' && !legalConsent?.checked) {
    return show('Para criar sua conta, leia e aceite os Termos de Uso e a Política de Privacidade.');
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

    const acceptedAt = new Date().toISOString();
    const confirmationRedirect = `${window.location.origin}/?email_confirmado=true`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: confirmationRedirect,
        data: {
          full_name: fullName,
          tipo: 'personal',
          termos_aceitos_em: acceptedAt,
          politica_privacidade_aceita_em: acceptedAt,
          versao_termos: '2026-07-17',
          versao_privacidade: '2026-07-17'
        }
      }
    });

    if (error) throw error;

    if (data.session) {
      await supabase.auth.signOut();
    }

    form.reset();
    setMode('login', { preserveMessage: true });
    form.email.value = email;
    show(
      data.session
        ? 'Conta criada com sucesso. Seus 7 dias grátis já estão disponíveis. Faça login para continuar.'
        : 'Conta criada. Confirme seu e-mail para ativar o cadastro e iniciar seus 7 dias grátis.',
      'success'
    );
  } catch (error) {
    console.error(error);
    show(error.message || 'Não foi possível concluir a autenticação.');
  } finally {
    submit.disabled = false;
    submit.textContent = mode === 'signup' ? 'Começar meus 7 dias grátis' : 'Entrar';
  }
});

setMode('login');

const url = new URL(window.location.href);
const emailConfirmedReturn = url.searchParams.get('email_confirmado') === 'true';

if (emailConfirmedReturn) {
  show('✅ E-mail confirmado com sucesso! Sua conta foi ativada. Agora você pode acessar o FS Fit.', 'success');
  url.searchParams.delete('email_confirmado');
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

const { data: { session } } = await supabase.auth.getSession();
if (session) {
  if (emailConfirmedReturn) {
    await supabase.auth.signOut();
  } else {
    try {
      await finishAuthenticatedAccess(session);
    } catch (error) {
      console.error(error);
      show('Não foi possível preparar seu perfil. Tente novamente.');
    }
  }
}
