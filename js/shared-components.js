/* FS Fit · Componentes compartilhados · Fase 2 */

function applySharedBodyClass() {
  document.body?.classList.add('fsfit-saas');
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
  const hasOpenModal = Boolean(document.querySelector('.modal.show, .modal.open, .modal[aria-hidden="false"], .workout-modal.open, .workout-modal[aria-hidden="false"], .live-session-modal.open, .live-workout-editor-modal.open, .student-sheet[aria-hidden="false"], .student-pix-modal[aria-hidden="false"], .student-detail-modal[aria-hidden="false"], dialog[open]'));
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

function initializePullToRefresh() {
  if (!('ontouchstart' in window) || document.querySelector('.fsfit-pull-refresh')) return;

  const indicator = document.createElement('div');
  indicator.className = 'fsfit-pull-refresh';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  indicator.innerHTML = '<span class="fsfit-pull-refresh-icon">↻</span><span class="fsfit-pull-refresh-label">Puxe para atualizar</span>';
  document.body.appendChild(indicator);

  const label = indicator.querySelector('.fsfit-pull-refresh-label');
  const threshold = 76;
  let startY = 0;
  let distance = 0;
  let tracking = false;
  let refreshing = false;

  const reset = () => {
    tracking = false;
    distance = 0;
    indicator.classList.remove('is-visible', 'is-ready');
    indicator.style.transform = 'translate(-50%, -70px)';
    label.textContent = 'Puxe para atualizar';
  };

  const isInsideOverlay = target => Boolean(target.closest('.modal, .workout-modal, .live-session-modal, .live-workout-editor-modal, .student-sheet, .student-pix-modal, .student-detail-modal, .fsfit-more-panel, dialog'));

  const hasScrollableAncestor = target => {
    let element = target instanceof Element ? target : null;
    while (element && element !== document.body) {
      const style = getComputedStyle(element);
      const canScroll = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
      if (canScroll) return true;
      element = element.parentElement;
    }
    return false;
  };

  document.addEventListener('touchstart', event => {
    if (refreshing || window.scrollY > 0 || document.documentElement.classList.contains('fsfit-scroll-locked')) return;
    if (event.touches.length !== 1 || event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (isInsideOverlay(event.target) || hasScrollableAncestor(event.target)) return;
    startY = event.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  document.addEventListener('touchmove', event => {
    if (!tracking || refreshing || event.touches.length !== 1) return;
    const delta = event.touches[0].clientY - startY;
    if (delta <= 0) {
      reset();
      return;
    }

    distance = Math.min(delta * .55, 110);
    if (distance < 8) return;
    event.preventDefault();

    indicator.classList.add('is-visible');
    indicator.classList.toggle('is-ready', distance >= threshold);
    indicator.style.transform = `translate(-50%, ${Math.min(distance - 58, 22)}px)`;
    label.textContent = distance >= threshold ? 'Solte para atualizar' : 'Puxe para atualizar';
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (!tracking || refreshing) return;
    if (distance < threshold) {
      reset();
      return;
    }

    refreshing = true;
    tracking = false;
    indicator.classList.remove('is-ready');
    indicator.classList.add('is-visible', 'is-refreshing');
    label.textContent = 'Atualizando...';
    if (navigator.vibrate) navigator.vibrate(20);
    window.setTimeout(() => window.location.reload(), 320);
  }, { passive: true });

  document.addEventListener('touchcancel', reset, { passive: true });
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
  applySharedBodyClass();
  normalizeSharedStates();
  initializePullToRefresh();
  observeSharedComponents();
  window.addEventListener('pageshow', syncSharedOverlayState);
  window.addEventListener('resize', syncSharedOverlayState);
}

initializeSharedComponents();
