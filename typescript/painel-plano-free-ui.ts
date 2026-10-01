// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { supabase } from './supabase.js';

interface AccessStatus {
  admin?: boolean;
  acesso_premium?: boolean;
  tipo_acesso?: string | null;
}

interface AccessCacheEntry {
  value?: AccessStatus;
  savedAt?: number | string;
}

const ACCESS_CACHE_KEY = 'fsfit:access-status-cache';
const ACCESS_CACHE_MAX_AGE_MS = 15 * 60 * 1000;
const REDIRECT_NOTICE_DURATION_MS = 7000;
const redirectedFromBlockedPage = new URLSearchParams(window.location.search).get('acesso') === 'free';
let redirectNoticeDismissed = false;
let updatingNotice = false;
let freeAccessActive = false;
let syncScheduled = false;

function removeRedirectParameter(): void {
  if (!redirectedFromBlockedPage) return;
  const url = new URL(window.location.href);
  url.searchParams.delete('acesso');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function isNoticeHidden(notice: HTMLElement): boolean {
  return notice.className === 'message'
    && notice.style.display === 'none'
    && !notice.hasChildNodes()
    && !notice.hasAttribute('role')
    && !notice.hasAttribute('aria-live');
}

function hideLegacyNotice(notice: HTMLElement): void {
  if (updatingNotice || isNoticeHidden(notice)) return;

  updatingNotice = true;
  notice.className = 'message';
  notice.style.display = 'none';
  notice.removeAttribute('role');
  notice.removeAttribute('aria-live');
  delete notice.dataset.freeRedirectReady;
  notice.replaceChildren();
  updatingNotice = false;
}

function dismissRedirectNotice(notice: HTMLElement): void {
  redirectNoticeDismissed = true;
  hideLegacyNotice(notice);
}

function isRedirectNoticeReady(notice: HTMLElement): boolean {
  return notice.classList.contains('free-access-redirect')
    && notice.dataset.freeRedirectReady === '1'
    && Boolean(notice.querySelector('.free-access-redirect-copy'))
    && Boolean(notice.querySelector('.free-access-redirect-close'));
}

function renderRedirectNotice(notice: HTMLElement): void {
  if (redirectNoticeDismissed || updatingNotice || isRedirectNoticeReady(notice)) return;

  updatingNotice = true;

  const pageHeader = document.querySelector('.dashboard-home-header');
  if (pageHeader?.parentElement && notice.previousElementSibling !== pageHeader) {
    pageHeader.insertAdjacentElement('afterend', notice);
  }

  notice.className = 'free-access-redirect';
  notice.style.removeProperty('display');
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.dataset.freeRedirectReady = '1';
  notice.innerHTML = `
    <div class="free-access-redirect-copy">
      <strong>Área disponível no plano profissional</strong>
      <span>Você voltou ao Início porque esse recurso está bloqueado no plano Free.</span>
    </div>
    <a class="free-access-redirect-action" href="assinatura.html">Ver planos</a>
    <button class="free-access-redirect-close" type="button" aria-label="Fechar aviso">×</button>`;

  notice.querySelector('.free-access-redirect-close')?.addEventListener('click', () => dismissRedirectNotice(notice), { once: true });
  updatingNotice = false;
}

function configureAccessNotice(): void {
  const notice = document.querySelector<HTMLElement>('#access-notice');
  if (!notice) return;

  const sync = (): void => {
    if (redirectedFromBlockedPage && !redirectNoticeDismissed) renderRedirectNotice(notice);
    else hideLegacyNotice(notice);
  };

  sync();

  const observer = new MutationObserver(sync);
  observer.observe(notice, { attributes: true, childList: true, subtree: true });

  if (redirectedFromBlockedPage) {
    window.setTimeout(() => dismissRedirectNotice(notice), REDIRECT_NOTICE_DURATION_MS);
  }
}

function isFreePlanCard(card: Element | null): card is HTMLElement {
  if (!(card instanceof HTMLElement)) return false;
  const label = card.querySelector('.plan-renewal-copy small')?.textContent?.trim().toUpperCase() || '';
  const button = card.querySelector('#plan-card-action')?.textContent?.trim().toLowerCase() || '';
  return card.classList.contains('expired') || label === 'PLANO FREE' || button === 'ativar plano';
}

function removeTransientFreeCard(): void {
  const transientCard = document.querySelector('#plan-renewal-card');
  if (isFreePlanCard(transientCard)) transientCard.remove();
}

function buildPersistentFreeCard(): HTMLElement {
  const card = document.createElement('section');
  card.id = 'free-plan-persistent-card';
  card.className = 'plan-renewal-card free-compact';
  card.setAttribute('aria-label', 'Plano Free');
  card.innerHTML = `
    <div class="plan-renewal-copy">
      <small>PLANO FREE</small>
      <strong>Recursos profissionais bloqueados</strong>
      <span>Ative um plano para liberar as áreas de gestão.</span>
    </div>
    <div class="plan-renewal-actions">
      <a class="btn btn-primary" href="assinatura.html">Ativar plano</a>
    </div>`;
  return card;
}

function ensurePersistentFreeCard(): void {
  if (!freeAccessActive) return;
  const homePanel = document.querySelector<HTMLElement>('#dashboard-home-panel');
  if (!homePanel) return;

  let card = document.querySelector<HTMLElement>('#free-plan-persistent-card');
  if (!card) card = buildPersistentFreeCard();
  if (card.parentElement !== homePanel) homePanel.prepend(card);

  removeTransientFreeCard();
}

function removePersistentFreeCard(): void {
  document.querySelector('#free-plan-persistent-card')?.remove();
}

function applyAccessStatus(access: AccessStatus | null | undefined): void {
  freeAccessActive = Boolean(access && !access.admin && !access.acesso_premium && access.tipo_acesso !== 'inativo');
  if (freeAccessActive) ensurePersistentFreeCard();
  else removePersistentFreeCard();
}

function readCachedAccess(): AccessStatus | null {
  try {
    const cached = JSON.parse(sessionStorage.getItem(ACCESS_CACHE_KEY) || 'null') as AccessCacheEntry | null;
    if (cached?.value && Date.now() - Number(cached.savedAt || 0) < ACCESS_CACHE_MAX_AGE_MS) return cached.value;
  } catch {}
  return null;
}

async function resolveAccessStatus(): Promise<void> {
  const cached = readCachedAccess();
  if (cached) applyAccessStatus(cached);

  try {
    const { data, error } = await supabase.rpc('fsfit_sincronizar_meu_acesso');
    if (error) throw error;
    if (data) applyAccessStatus(data as AccessStatus);
  } catch (error) {
    if (!cached) console.warn('Não foi possível confirmar o estado do plano Free:', error);
  }
}

function schedulePersistentCardSync(): void {
  if (!freeAccessActive || syncScheduled) return;
  syncScheduled = true;
  queueMicrotask(() => {
    syncScheduled = false;
    ensurePersistentFreeCard();
  });
}

function observePersistentCard(): void {
  const root = document.querySelector('main.container') || document.body;
  const observer = new MutationObserver(schedulePersistentCardSync);
  observer.observe(root, { childList: true, subtree: true });
}

function init(): void {
  if (!document.querySelector('#dashboard-home-panel')) return;
  removeRedirectParameter();
  configureAccessNotice();
  observePersistentCard();
  resolveAccessStatus();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
