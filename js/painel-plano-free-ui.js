import { supabase } from './supabase.js';

const ACCESS_CACHE_KEY = 'fsfit:access-status-cache';
const ACCESS_CACHE_MAX_AGE_MS = 15 * 60 * 1000;
const REDIRECT_NOTICE_DURATION_MS = 7000;
const redirectedFromBlockedPage = new URLSearchParams(window.location.search).get('acesso') === 'free';
let redirectNoticeDismissed = false;
let updatingNotice = false;
let freeAccessActive = false;
let syncScheduled = false;

function injectStyles() {
  if (document.querySelector('#fsfit-free-plan-panel-styles')) return;

  const style = document.createElement('style');
  style.id = 'fsfit-free-plan-panel-styles';
  style.textContent = `
    #access-notice {
      display: none !important;
    }

    #access-notice.free-access-redirect {
      display: flex !important;
      align-items: center;
      gap: 10px;
      margin: 0 0 12px !important;
      padding: 10px 11px;
      border: 1px solid var(--border);
      border-left: 3px solid var(--primary);
      border-radius: 12px;
      background: rgba(16, 24, 36, .92);
      color: var(--text);
      box-shadow: none;
    }

    .free-access-redirect-copy {
      min-width: 0;
      flex: 1 1 auto;
      font-size: .72rem;
      line-height: 1.4;
    }

    .free-access-redirect-copy strong {
      display: block;
      margin-bottom: 1px;
      font-size: .76rem;
    }

    .free-access-redirect-action {
      flex: 0 0 auto;
      color: var(--primary);
      font-size: .69rem;
      font-weight: 900;
      white-space: nowrap;
    }

    .free-access-redirect-close {
      display: grid;
      place-items: center;
      flex: 0 0 30px;
      width: 30px;
      height: 30px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: rgba(255,255,255,.06);
      color: var(--muted);
      font: inherit;
      font-size: 1rem;
      cursor: pointer;
    }

    .plan-renewal-card.free-compact {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      margin: 0;
      padding: 13px 14px;
      border: 1px solid var(--border);
      border-left: 3px solid var(--primary);
      border-radius: 14px;
      background: linear-gradient(110deg, rgba(184,229,28,.055), rgba(16,24,36,.9) 55%, rgba(8,13,21,.96));
      box-shadow: none;
    }

    .plan-renewal-card.free-compact .plan-renewal-copy small {
      display: block;
      margin-bottom: 3px;
      color: var(--primary);
      font-size: .6rem;
      font-weight: 900;
      letter-spacing: .08em;
    }

    .plan-renewal-card.free-compact .plan-renewal-copy strong {
      display: block;
      font-size: .88rem;
      line-height: 1.25;
    }

    .plan-renewal-card.free-compact .plan-renewal-copy span {
      display: block;
      margin-top: 2px;
      color: var(--muted);
      font-size: .68rem;
      line-height: 1.35;
    }

    .plan-renewal-card.free-compact .plan-renewal-actions {
      display: flex;
      width: auto;
      flex: 0 0 auto;
      flex-wrap: nowrap;
    }

    .plan-renewal-card.free-compact .plan-renewal-actions .btn {
      width: auto !important;
      min-height: 38px;
      padding: 8px 12px;
      border-radius: 10px;
      font-size: .7rem;
      white-space: nowrap;
    }

    @media (max-width: 340px) {
      .plan-renewal-card.free-compact {
        grid-template-columns: 1fr;
        gap: 9px;
      }

      .plan-renewal-card.free-compact .plan-renewal-actions,
      .plan-renewal-card.free-compact .plan-renewal-actions .btn {
        width: 100% !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function removeRedirectParameter() {
  if (!redirectedFromBlockedPage) return;
  const url = new URL(window.location.href);
  url.searchParams.delete('acesso');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function isNoticeHidden(notice) {
  return notice.className === 'message'
    && notice.style.display === 'none'
    && !notice.hasChildNodes()
    && !notice.hasAttribute('role')
    && !notice.hasAttribute('aria-live');
}

function hideLegacyNotice(notice) {
  if (!(notice instanceof HTMLElement) || updatingNotice || isNoticeHidden(notice)) return;

  updatingNotice = true;
  notice.className = 'message';
  notice.style.display = 'none';
  notice.removeAttribute('role');
  notice.removeAttribute('aria-live');
  delete notice.dataset.freeRedirectReady;
  notice.replaceChildren();
  updatingNotice = false;
}

function dismissRedirectNotice(notice) {
  redirectNoticeDismissed = true;
  hideLegacyNotice(notice);
}

function isRedirectNoticeReady(notice) {
  return notice.classList.contains('free-access-redirect')
    && notice.dataset.freeRedirectReady === '1'
    && Boolean(notice.querySelector('.free-access-redirect-copy'))
    && Boolean(notice.querySelector('.free-access-redirect-close'));
}

function renderRedirectNotice(notice) {
  if (!(notice instanceof HTMLElement) || redirectNoticeDismissed || updatingNotice || isRedirectNoticeReady(notice)) return;

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

function configureAccessNotice() {
  const notice = document.querySelector('#access-notice');
  if (!(notice instanceof HTMLElement)) return;

  const sync = () => {
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

function isFreePlanCard(card) {
  if (!(card instanceof HTMLElement)) return false;
  const label = card.querySelector('.plan-renewal-copy small')?.textContent?.trim().toUpperCase() || '';
  const button = card.querySelector('#plan-card-action')?.textContent?.trim().toLowerCase() || '';
  return card.classList.contains('expired') || label === 'PLANO FREE' || button === 'ativar plano';
}

function removeTransientFreeCard() {
  const transientCard = document.querySelector('#plan-renewal-card');
  if (isFreePlanCard(transientCard)) transientCard.remove();
}

function buildPersistentFreeCard() {
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

function ensurePersistentFreeCard() {
  if (!freeAccessActive) return;
  const homePanel = document.querySelector('#dashboard-home-panel');
  if (!(homePanel instanceof HTMLElement)) return;

  let card = document.querySelector('#free-plan-persistent-card');
  if (!(card instanceof HTMLElement)) card = buildPersistentFreeCard();
  if (card.parentElement !== homePanel) homePanel.prepend(card);

  removeTransientFreeCard();
}

function removePersistentFreeCard() {
  document.querySelector('#free-plan-persistent-card')?.remove();
}

function applyAccessStatus(access) {
  freeAccessActive = Boolean(access && !access.admin && !access.acesso_premium && access.tipo_acesso !== 'inativo');
  if (freeAccessActive) ensurePersistentFreeCard();
  else removePersistentFreeCard();
}

function readCachedAccess() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(ACCESS_CACHE_KEY) || 'null');
    if (cached?.value && Date.now() - Number(cached.savedAt || 0) < ACCESS_CACHE_MAX_AGE_MS) return cached.value;
  } catch {}
  return null;
}

async function resolveAccessStatus() {
  const cached = readCachedAccess();
  if (cached) applyAccessStatus(cached);

  try {
    const { data, error } = await supabase.rpc('fsfit_sincronizar_meu_acesso');
    if (error) throw error;
    if (data) applyAccessStatus(data);
  } catch (error) {
    if (!cached) console.warn('Não foi possível confirmar o estado do plano Free:', error);
  }
}

function schedulePersistentCardSync() {
  if (!freeAccessActive || syncScheduled) return;
  syncScheduled = true;
  queueMicrotask(() => {
    syncScheduled = false;
    ensurePersistentFreeCard();
  });
}

function observePersistentCard() {
  const root = document.querySelector('main.container') || document.body;
  const observer = new MutationObserver(schedulePersistentCardSync);
  observer.observe(root, { childList: true, subtree: true });
}

function init() {
  if (!document.querySelector('#dashboard-home-panel')) return;
  injectStyles();
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
