// @ts-ignore Existing browser JavaScript module.
import { supabase } from './supabase.js';

type AuthMode = 'login' | 'signup';
type Attribution = Record<string, string>;
interface AuthForm extends HTMLFormElement { email: HTMLInputElement; password: HTMLInputElement; full_name?: HTMLInputElement; confirm_password?: HTMLInputElement; }
declare global { interface Window { dataLayer?: Array<Record<string, unknown>>; } }

const PLAY_DISTRIBUTION_KEY = 'fsfit_distribution';
const PLAY_DISTRIBUTION_VALUE = 'google-play';
const ATTRIBUTION_STORAGE_KEY = 'fsfit_attribution';
const ATTRIBUTION_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'gbraid', 'wbraid'];
const currentUrl = new URL(window.location.href);
const launchedFromGooglePlay = currentUrl.searchParams.get('platform') === 'android-play';

function readStoredAttribution(): Attribution {
  try {
    return JSON.parse(localStorage.getItem(ATTRIBUTION_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function captureAttribution(): Attribution {
  const now = new Date().toISOString();
  const stored = readStoredAttribution();
  const current: Attribution = {};

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

function acquisitionMetadata(attribution: Attribution): Record<string, string | null> {
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

function trackSignupCreated(attribution: Attribution): void {
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

function authErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : '';
  const message = raw.toLowerCase();
  if (message.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (message.includes('email not confirmed')) return 'Confirme seu e-mail antes de acessar.';
  if (message.includes('user already registered')) return 'Este e-mail já possui cadastro.';
  if (message.includes('password should be')) return 'A senha não atende aos requisitos mínimos de segurança.';
  if (message.includes('rate limit') || message.includes('too many requests')) return 'Muitas tentativas em pouco tempo. Aguarde e tente novamente.';
  return raw || 'Não foi possível concluir a autenticação.';
}

const attribution = captureAttribution();

if (launchedFromGooglePlay) {
  localStorage.setItem(PLAY_DISTRIBUTION_KEY, PLAY_DISTRIBUTION_VALUE);
  sessionStorage.setItem(PLAY_DISTRIBUTION_KEY, PLAY_DISTRIBUTION_VALUE);
}

const isGooglePlayDistribution = launchedFromGooglePlay
  || localStorage.getItem(PLAY_DISTRIBUTION_KEY) === PLAY_DISTRIBUTION_VALUE
  || sessionStorage.getItem(PLAY_DISTRIBUTION_KEY) === PLAY_DISTRIBUTION_VALUE;

const form = document.querySelector<AuthForm>('#auth-form')!;
const title = document.querySelector<HTMLElement>('#auth-title');
const submit = document.querySelector<HTMLButtonElement>('#auth-submit');
const switchButton = document.querySelector<HTMLButtonElement>('#auth-switch');
const nameGroup = document.querySelector<HTMLElement>('#name-group');
const confirmGroup = document.querySelector<HTMLElement>('#confirm-group');
const forgotWrap = document.querySelector<HTMLElement>('#forgot-password-wrap');
const legalConsentGroup = document.querySelector<HTMLElement>('#legal-consent-group');
const legalConsent = document.querySelector<HTMLInputElement>('#legal-consent');
const trialNote = document.querySelector<HTMLElement>('#auth-trial-note');
const priceNote = document.querySelector<HTMLElement>('.auth-price-note');
const signupSectionTitle = document.querySelector<HTMLElement>('#signup-section-title');
const signupSectionDescription = document.querySelector<HTMLElement>('#signup-section-description');
const signupPoints = document.querySelector<HTMLElement>('.lp-signup-points');
const heroBadge = document.querySelector<HTMLElement>('.hero-badge');
const message = document.querySelector<HTMLElement>('#auth-message');
const requestedMode = currentUrl.searchParams.get('modo');
const defaultAuthMode = document.body?.dataset.authDefault === 'signup'
  || requestedMode === 'cadastro'
  || requestedMode === 'signup'
  || currentUrl.searchParams.get('cadastro') === '1'
  ? 'signup'
  : 'login';
let mode: AuthMode = 'login';

function show(text: string, type: 'error' | 'success' = 'error'): void {
  if (!message) return;
  message.textContent = text;
  message.className = `message show ${type}`;
  message.setAttribute('role', type === 'error' ? 'alert' : 'status');
  message.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  message.setAttribute('aria-atomic', 'true');
}

function clearFormErrors(): void {
  form?.querySelectorAll('[aria-invalid="true"]').forEach(field => {
    field.removeAttribute('aria-invalid');
    if (field.getAttribute('aria-describedby') === message?.id) field.removeAttribute('aria-describedby');
  });
  if (message) {
    message.textContent = '';
    message.className = 'message';
  }
}

function showFieldError(text: string, field: Element | null): void {
  if (field) {
    field.setAttribute('aria-invalid', 'true');
    if (message?.id) field.setAttribute('aria-describedby', message.id);
  }
  show(text);
  field?.focus();
}

form?.addEventListener('input', event => {
  const field = event.target;
  if (!(field instanceof Element)) return;
  field.removeAttribute('aria-invalid');
  if (field.getAttribute('aria-describedby') === message?.id) field.removeAttribute('aria-describedby');
  if (message?.classList.contains('show')) {
    message.textContent = '';
    message.className = 'message';
  }
});

form?.addEventListener('change', event => {
  const field = event.target;
  field?.removeAttribute?.('aria-invalid');
  if (field?.getAttribute?.('aria-describedby') === message?.id) field.removeAttribute('aria-describedby');
  if (message?.classList.contains('show')) {
    message.textContent = '';
    message.className = 'message';
  }
});

function applyGooglePlayConsumptionMode(): void {
  if (!isGooglePlayDistribution) return;
  switchButton?.closest('.auth-switch')?.classList.add('hidden');
  heroBadge?.classList.add('hidden');
  if (priceNote) priceNote.textContent = 'Acesse com sua conta FS Fit existente.';
}

function setMode(nextMode: AuthMode, { preserveMessage = false }: { preserveMessage?: boolean } = {}): void {
  if (isGooglePlayDistribution && nextMode === 'signup') nextMode = 'login';

  mode = nextMode;
  const signup = mode === 'signup';
  if (title) title.textContent = signup ? 'Comece seus 7 dias grátis' : 'Acesse sua conta';
  if (submit) submit.textContent = signup ? 'Começar meus 7 dias grátis' : 'Entrar';
  if (switchButton) switchButton.textContent = signup ? 'Já possui cadastro? Entrar' : 'Novo no FS Fit? Criar conta grátis';
  if (trialNote) {
    trialNote.innerHTML = signup
      ? '<strong>7 dias grátis.</strong> Crie sua conta agora. Depois do período gratuito, continue por R$ 29,90.'
      : '<strong>Novo por aqui?</strong> Crie sua conta e ganhe 7 dias grátis.';
  }
  if (signupSectionTitle) {
    signupSectionTitle.textContent = signup
      ? 'Crie sua conta e organize seu primeiro aluno hoje.'
      : 'Acesse sua conta do FS Fit.';
  }
  if (signupSectionDescription) {
    signupSectionDescription.textContent = signup
      ? 'O cadastro leva poucos minutos. Seus 7 dias grátis começam após a ativação da conta.'
      : 'Entre com seu e-mail e senha para continuar sua consultoria.';
  }
  signupPoints?.classList.toggle('hidden', !signup);
  if (priceNote) {
    priceNote.textContent = signup
      ? 'Depois do período gratuito, continue por R$ 29,90/mês.'
      : 'Novo no FS Fit? Crie sua conta e teste por 7 dias.';
  }
  nameGroup?.classList.toggle('hidden', !signup);
  confirmGroup?.classList.toggle('hidden', !signup);
  legalConsentGroup?.classList.toggle('hidden', !signup);
  forgotWrap?.classList.toggle('hidden', signup);
  if (form?.password) form.password.autocomplete = signup ? 'new-password' : 'current-password';
  if (!signup && form) {
    if (form.confirm_password) form.confirm_password.value = '';
    if (legalConsent) legalConsent.checked = false;
  }
  if (!preserveMessage) clearFormErrors();
}

function toggleMode(): void {
  if (isGooglePlayDistribution) return;
  setMode(mode === 'login' ? 'signup' : 'login');
}

function finishAuthenticatedAccess(session: any): void {
  if (!session?.user?.id) throw new Error('Não foi possível validar a sessão. Faça login novamente.');
  if (isGooglePlayDistribution) {
    localStorage.setItem(PLAY_DISTRIBUTION_KEY, PLAY_DISTRIBUTION_VALUE);
    sessionStorage.setItem(PLAY_DISTRIBUTION_KEY, PLAY_DISTRIBUTION_VALUE);
  }
  window.location.replace('painel.html');
}

if (!isGooglePlayDistribution) switchButton?.addEventListener('click', toggleMode);
form?.addEventListener('submit', async event => {
  event.preventDefault();
  clearFormErrors();

  if (isGooglePlayDistribution && mode !== 'login') {
    setMode('login');
    return show('No aplicativo Google Play, acesse com uma conta FS Fit existente.');
  }

  const email = form.email.value.trim().toLowerCase();
  const password = form.password.value;
  const fullName = form.full_name?.value.trim() || '';
  const confirmPassword = form.confirm_password?.value || '';
  const emailField = form.elements.namedItem('email') as HTMLInputElement | null;
  const passwordField = form.elements.namedItem('password') as HTMLInputElement | null;
  const fullNameField = form.elements.namedItem('full_name') as HTMLInputElement | null;
  const confirmPasswordField = form.elements.namedItem('confirm_password') as HTMLInputElement | null;

  if (!email) return showFieldError('Informe seu e-mail.', emailField);
  if (emailField instanceof HTMLInputElement && !emailField.checkValidity()) {
    return showFieldError('Informe um endereço de e-mail válido.', emailField);
  }
  if (!password) return showFieldError('Informe sua senha.', passwordField);
  if (mode === 'signup' && fullName.length < 2) {
    return showFieldError('Informe seu nome completo.', fullNameField);
  }
  if (mode === 'signup' && password.length < 6) {
    return showFieldError('A senha deve ter pelo menos 6 caracteres.', passwordField);
  }
  if (mode === 'signup' && !confirmPassword) {
    return showFieldError('Confirme sua senha.', confirmPasswordField);
  }
  if (mode === 'signup' && password !== confirmPassword) {
    return showFieldError('As senhas não coincidem.', confirmPasswordField);
  }
  if (mode === 'signup' && !legalConsent?.checked) {
    return showFieldError(
      'Para criar sua conta, leia e aceite os Termos de Uso e a Política de Privacidade.',
      legalConsent
    );
  }

  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Aguarde...';
  }

  try {
    if (mode === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      finishAuthenticatedAccess(data.session);
      return;
    }

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

    if (data.session) await supabase.auth.signOut();

    form.reset();
    setMode('login', { preserveMessage: true });
    form.email.value = email;
    show(
      data.session
        ? 'Conta criada com sucesso. Faça login para continuar.'
        : 'Conta criada. Confirme seu e-mail para ativar o cadastro e iniciar seus 7 dias grátis.',
      'success'
    );
  } catch (error) {
    console.error(error);
    show(authErrorMessage(error));
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = mode === 'signup' ? 'Começar meus 7 dias grátis' : 'Entrar';
    }
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
      finishAuthenticatedAccess(session);
    } catch (error) {
      console.error(error);
      show(authErrorMessage(error));
    }
  }
}
