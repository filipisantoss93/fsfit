/* FS Fit · Componentes compartilhados · Fase 2 */

function ensureDesignSystemStyles() {
  if (!document.querySelector('link[data-fsfit-design-system]')) {
    const designSystem = document.createElement('link');
    designSystem.rel = 'stylesheet';
    designSystem.href = 'css/fsfit-design-system.css?v=20260726-phase3';
    designSystem.dataset.fsfitDesignSystem = 'true';
    document.head.appendChild(designSystem);
  }
  document.body?.classList.add('fsfit-saas');
}

function ensureSharedStyles() {
  if (document.querySelector('link[data-fsfit-shared-components]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/shared-components.css?v=20260726-phase3';
  link.dataset.fsfitSharedComponents = 'true';
  document.head.appendChild(link);
}

function ensurePagePolishStyles() {
  const page = window.location.pathname.split('/').pop() || '';
  if (page !== 'treino-aluno.html' || document.querySelector('link[data-fsfit-workout-phase6]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/treino-aluno-fase6.css?v=20260727-phase6';
  link.dataset.fsfitWorkoutPhase6 = 'true';
  document.head.appendChild(link);
}

function lockDocumentScroll() {
  const scrollY = window.scrollY;
  document.documentElement.dataset.fsfitScrollY = String(scrollY);
  document.documentElement.classList.add('fsfit-scroll-locked');
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollY}px`;
  document.body.style.width = '100%';
}

function unlockDocumentScroll() {
  const scrollY = Number(document.documentElement.dataset.fsfitScrollY || 0);
  document.documentElement.classList.remove('fsfit-scroll-locked');
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  delete document.documentElement.dataset.fsfitScrollY;
  window.scrollTo(0, scrollY);
}

function syncSharedOverlayState() {
  const hasOpenSheet = Boolean(document.querySelector('.fsfit-more-sheet.is-open'));
  const hasOpenMenu = document.body.classList.contains('nav-menu-open');
  const hasOpenModal = Boolean(document.querySelector('.modal.show, .modal.open, .modal[aria-hidden="false"], .workout-modal.open, .workout-modal[aria-hidden="false"], dialog[open]'));
  if (hasOpenSheet || hasOpenMenu || hasOpenModal) {
    if (!document.documentElement.classList.contains('fsfit-scroll-locked')) lockDocumentScroll();
  } else if (document.documentElement.classList.contains('fsfit-scroll-locked')) {
    unlockDocumentScroll();
  }
}

function normalizeSharedStates() {
  document.querySelectorAll('.empty-state').forEach(el => el.classList.add('fsfit-shared-empty'));
  document.querySelectorAll('.error-state').forEach(el => el.classList.add('fsfit-shared-error'));
  document.querySelectorAll('.loading-state').forEach(el => el.classList.add('fsfit-shared-loading'));
}

function observeSharedComponents() {
  const observer = new MutationObserver(() => {
    normalizeSharedStates();
    syncSharedOverlayState();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    subtree: true,
    childList: true,
    attributeFilter: ['class', 'open', 'aria-hidden']
  });
}

export function initializeSharedComponents() {
  ensureDesignSystemStyles();
  ensureSharedStyles();
  ensurePagePolishStyles();
  normalizeSharedStates();
  observeSharedComponents();
  window.addEventListener('pageshow', syncSharedOverlayState);
  window.addEventListener('resize', syncSharedOverlayState);
}

initializeSharedComponents();