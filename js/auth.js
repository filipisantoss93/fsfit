import { supabase } from './supabase.js';
import { ensurePersonalProfile } from './layout.js';

const PLAY_DISTRIBUTION_KEY = 'fsfit_distribution';
const PLAY_DISTRIBUTION_VALUE = 'google-play';
const ATTRIBUTION_STORAGE_KEY = 'fsfit_attribution';
const ATTRIBUTION_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'gbraid', 'wbraid'];
const currentUrl = new URL(window.location.href);
const launchedFromGooglePlay = currentUrl.searchParams.get('platform') === 'android-play';

function readStoredAttribution() {
  try {
    return JSON.parse(localStorage.getItem(ATTRIBUTION_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function captureAttribution() {
  const now = new Date().toISOString();
  const stored = readStoredAttribution();
  const current = {};

  ATTRIBUTION_PARAMS.forEach(key => {
    const value = currentUrl.searchParams.get(key);
    if (value) current[key] = value.slice(0, 300);
  });

  const merged = {
    ...stored,
    ...current,
    first_landing_page: stored.first_landing_page || currentUrl.pathname,
    first_seen_at: stored.first_seen_at || now,
    last_landing_page: currentUrl.pathname,
    last_seen_at: now
  };

  try {
    localStorage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(merged));
  } catch (error) {
    console.warn('Não foi possível salvar a atribuição do cadastro:', error);
  }

  return merged;
}

function acquisitionMetadata(attribution) {
  const clickId = attribution.gclid || attribution.gbraid || attribution.wbraid || null;
  return {
    acquisition_source: attribution.utm_source || (clickId ? 'google' : 'direct'),
    acquisition_medium: attribution.utm_medium || (clickId ? 'paid_search' : null),
    acquisition_campaign: attribution.utm_campaign || null,
    acquisition_content: attribution.utm_content || null,
    acquisition_term: attribution.utm_term || null,
    acquisition_click_id: clickId,
    acquisition_first_landing_page: attribution.first_landing_page || null,
    acquisition_last_landing_page: attribution.last_landing_page || currentUrl.pathname,
    acquisition_first_seen_at: attribution.first_seen_at || null
  };
}

function trackSignupCreated(attribution) {
  const detail = {
    event: 'fsfit_signup_created',
    source: attribution.utm_source || 'direct',
    medium: attribution.utm_medium || null,
    campaign: attribution.utm_campaign || null,
    landing_page: attribution.last_landing_page || currentUrl.pathname
  };
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(detail);
  window.dispatchEvent(new CustomEvent('fsfit:signup-created', { detail }));
}

const attribution = captureAttribution();

if (launchedFromGooglePlay) {
  localStorage.setItem(PLAY_DISTRIBUTION_KEY, PLAY_DISTRIBUTION_VALUE);
  sessionStorage.setItem(PLAY_DISTRIBUTION_KEY, PLAY_DISTRIBUTION_VALUE);
}

const isGooglePlayDistribution = launchedFromGooglePlay
  || localStorage.getItem(PLAY_DISTRIBUTION_KEY) === PLAY_DISTRIBUTION_VALUE
  || sessionStorage.getItem(PLAY_DISTRIBUTION_KEY) === PLAY_DISTRIBUTION_VALUE;

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
const priceNote = document.querySelector('.auth-price-note');
const heroBadge = document.querySelector('.hero-badge');
const message = document.querySelector('#auth-message');
const requestedMode = currentUrl.searchParams.get('modo');
const defaultAuthMode = document.body?.dataset.authDefault === 'signup'
  || requestedMode === 'cadastro'
  || requestedMode === 'signup'
  || currentUrl.searchParams.get('cadastro') === '1'
  ? 'signup'
  : 'login';
let mode = 'login';

function show(text, type = 'error') {
  message.textContent = text;
  message.className = `message show ${type}`;
}

function applyGooglePlayConsumptionMode() {
  if (!isGooglePlayDistribution) return;
  switchButton?.closest('.auth-switch')?.classList.add('hidden');
  heroBadge?.classList.add('hidden');
  if (priceNote) priceNote.textContent = 'Acesse com sua conta FS Fit existente.';
}

function setMode(nextMode, { preserveMessage = false } = {}) {
  if (isGooglePlayDistribution && nextMode === 'signup') nextMode = 'login';

  mode = nextMode;
  const signup = mode === 'signup';
  title.textContent = signup ? 'Comece seus 7 dias grátis' : 'Acesse sua conta';
  submit.textContent = signup ? 'Começar meus 7 dias grátis' : 'Entrar';
  if (switchButton) switchButton.textContent = signup ? 'Já possui cadastro? Entrar' : 'Ainda não tem cadastro? Clique aqui.';
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
  if (isGooglePlayDistribution) return;
  setMode(mode === 'login' ? 'signup' : 'login');
}

async function finishAuthenticatedAccess(session) {
  if (isGooglePlayDistribution) {
    localStorage.setItem(PLAY_DISTRIBUTION_KEY, PLAY_DISTRIBUTION_VALUE);
    sessionStorage.setItem(PLAY_DISTRIBUTION_KEY, PLAY_DISTRIBUTION_VALUE);
  }
  await ensurePersonalProfile(session);
  window.location.replace('painel.html');
}

if (!isGooglePlayDistribution) switchButton?.addEventListener('click', toggleMode);
form?.addEventListener('submit', async event => {
  event.preventDefault();

  if (isGooglePlayDistribution && mode !== 'login') {
    setMode('login');
    return show('No aplicativo Google Play, acesse com uma conta FS Fit existente.');
  }

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
          versao_privacidade: '2026-07-17',
          ...acquisitionMetadata(attribution)
        }
      }
    });

    if (error) throw error;

    trackSignupCreated(attribution);

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

applyGooglePlayConsumptionMode();
setMode(defaultAuthMode);

const url = new URL(window.location.href);
const emailConfirmedReturn = url.searchParams.get('email_confirmado') === 'true';

if (emailConfirmedReturn) {
  setMode('login');
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