/* FS Fit · Componentes compartilhados · Fase 2 */

function ensureSharedStyles() {
  if (document.querySelector('link[data-fsfit-shared-components]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/shared-components.css?v=20260726-phase2';
  link.dataset.fsfitSharedComponents = 'true';
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
  const hasOpenModal = Boolean(document.querySelector('.modal.show, .modal.open, .modal[aria-hidden="false"], dialog[open]'));
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
  ensureSharedStyles();
  normalizeSharedStates();
  observeSharedComponents();
  window.addEventListener('pageshow', syncSharedOverlayState);
  window.addEventListener('resize', syncSharedOverlayState);
}

initializeSharedComponents();
