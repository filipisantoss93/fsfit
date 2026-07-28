(() => {
  const VIEWPORT_CONTENT = 'width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover';
  const HORIZONTAL_SCROLL_SELECTOR = [
    '.table-wrap',
    '.admin-revenue-trend',
    '.library-category-nav',
    '.record-tabs',
    '[data-allow-horizontal-scroll="true"]'
  ].join(',');
  const MODAL_CANDIDATE_SELECTOR = [
    '.live-session-modal.open',
    '.live-workout-editor-modal.open',
    '.password-modal.open',
    '#student-form-card:not(.hidden)',
    '.modal.open',
    '.modal.show',
    '.modal.active',
    '.modal-overlay.open',
    '.modal-overlay.show',
    '[class*="-modal"].open',
    '[class*="-modal"].show',
    '[class*="-modal"].active',
    '[class*="-modal"]:not(.hidden)[aria-hidden="false"]',
    '[class*="-sheet"].open',
    '[data-modal-root].open',
    '[data-modal-root][aria-hidden="false"]',
    '[role="dialog"][aria-modal="true"]'
  ].join(',');
  const MODAL_SCROLL_SELECTOR = [
    '.live-session-modal-body',
    '.live-session-dialog',
    '.live-workout-editor-dialog',
    '.password-modal-card',
    '#student-form-card:not(.hidden)',
    '.modal-body',
    '.modal-content',
    '.modal-dialog',
    '[class*="-modal-card"]',
    '[class*="-modal-body"]',
    '[class*="-modal-content"]',
    '[class*="-modal-dialog"]',
    '[class*="-modal-panel"]',
    '[class*="-sheet-panel"]',
    '[data-modal-scroll]',
    '[role="dialog"][aria-modal="true"]'
  ].join(',');

  let lastTouchEndAt = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchAxis = null;
  let allowHorizontalScroll = false;
  let modalLocked = false;
  let modalScrollY = 0;
  let modalSyncScheduled = false;
  let savedBodyStyles = null;
  let savedRootStyles = null;
  const manualModalLocks = new Set();

  function ensureFloatingNotificationStyles() {
    if (document.querySelector('style[data-fsfit-floating-notifications]')) return;

    const style = document.createElement('style');
    style.dataset.fsfitFloatingNotifications = 'true';
    style.textContent = `
      .message.show:not(#public-link-box):not(#access-notice){
        position:fixed!important;
        top:calc(env(safe-area-inset-top, 0px) + 12px)!important;
        left:50%!important;
        right:auto!important;
        bottom:auto!important;
        z-index:30000!important;
        display:block!important;
        width:min(560px,calc(100vw - 24px))!important;
        max-width:calc(100vw - 24px)!important;
        margin:0!important;
        padding:14px 18px!important;
        border-radius:14px!important;
        transform:translateX(-50%)!important;
        box-shadow:0 18px 55px rgba(0,0,0,.52)!important;
        backdrop-filter:blur(18px)!important;
        -webkit-backdrop-filter:blur(18px)!important;
        animation:fsfitFloatingNotificationIn .22s ease-out both;
      }
      .message.show.success:not(#public-link-box){
        background:rgba(24,66,35,.97)!important;
        border-color:rgba(50,215,75,.62)!important;
        color:#d7ffdd!important;
      }
      .message.show.error:not(#access-notice){
        background:rgba(68,30,34,.97)!important;
        border-color:rgba(255,90,95,.65)!important;
        color:#ffd1d3!important;
      }
      @keyframes fsfitFloatingNotificationIn{
        from{opacity:0;transform:translate(-50%,-10px)}
        to{opacity:1;transform:translate(-50%,0)}
      }
      @media(max-width:620px){
        .message.show:not(#public-link-box):not(#access-notice){
          top:calc(env(safe-area-inset-top, 0px) + 8px)!important;
          width:calc(100vw - 16px)!important;
          max-width:calc(100vw - 16px)!important;
          padding:13px 15px!important;
          border-radius:13px!important;
          font-size:.9rem!important;
          line-height:1.4!important;
        }
      }
    `;
    document.head.appendChild(style);
  }


  function applyViewportLock() {
    let viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.head.prepend(viewport);
    }
    viewport.setAttribute('content', VIEWPORT_CONTENT);
  }

  function applyTouchLock() {
    const root = document.documentElement;

    // Permite que componentes internos com overflow-x capturem o gesto horizontal.
    // O deslocamento horizontal do documento continua bloqueado pelo handler abaixo.
    root.style.touchAction = 'pan-x pan-y';
    root.style.webkitTextSizeAdjust = '100%';
    root.style.overflowX = 'clip';
    root.style.maxWidth = '100%';
    root.style.width = '100%';
    root.style.overscrollBehaviorX = 'none';

    if (document.body) {
      document.body.style.touchAction = 'pan-x pan-y';
      document.body.style.webkitTextSizeAdjust = '100%';
      document.body.style.overflowX = 'clip';
      document.body.style.maxWidth = '100%';
      document.body.style.width = '100%';
      document.body.style.overscrollBehaviorX = 'none';
    }

    document.querySelectorAll(HORIZONTAL_SCROLL_SELECTOR).forEach(element => {
      element.style.touchAction = 'pan-x pan-y';
      element.style.webkitOverflowScrolling = 'touch';
      element.style.overscrollBehaviorX = 'contain';
    });

    document.querySelectorAll(MODAL_SCROLL_SELECTOR).forEach(element => {
      element.style.webkitOverflowScrolling = 'touch';
      element.style.overscrollBehaviorY = 'contain';
    });

    keepHorizontalPositionLocked();
  }

  function preventZoom(event) {
    if (event.cancelable) event.preventDefault();
  }

  function keepHorizontalPositionLocked() {
    const root = document.documentElement;
    const scrollingElement = document.scrollingElement;
    if (window.scrollX !== 0) window.scrollTo(0, window.scrollY);
    if (scrollingElement?.scrollLeft) scrollingElement.scrollLeft = 0;
    if (root.scrollLeft !== 0) root.scrollLeft = 0;
    if (document.body?.scrollLeft) document.body.scrollLeft = 0;
  }

  function isVisibleModalCandidate(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.id === 'student-form-card' && document.body?.classList.contains('embed-edit')) return false;
    if (element.hidden || element.classList.contains('hidden')) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;

    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;

    return element.getClientRects().length > 0;
  }

  function hasOpenModal() {
    if (manualModalLocks.size) return true;
    return Array.from(document.querySelectorAll(MODAL_CANDIDATE_SELECTOR)).some(isVisibleModalCandidate);
  }

  function acquireModalLock(key = Symbol('fsfit-modal-lock')) {
    manualModalLocks.add(key);
    scheduleModalStateSync();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      manualModalLocks.delete(key);
      scheduleModalStateSync();
    };
  }

  function releaseModalLock(key) {
    manualModalLocks.delete(key);
    scheduleModalStateSync();
  }

  function lockPageForModal() {
    if (modalLocked || !document.body) return;

    const root = document.documentElement;
    const body = document.body;
    modalScrollY = window.scrollY || document.scrollingElement?.scrollTop || 0;

    savedRootStyles = {
      overflow: root.style.overflow,
      overscrollBehavior: root.style.overscrollBehavior
    };
    savedBodyStyles = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      overscrollBehavior: body.style.overscrollBehavior
    };

    root.classList.add('fsfit-modal-open');
    body.classList.add('fsfit-modal-open');
    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    body.style.position = 'fixed';
    body.style.top = `-${modalScrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    modalLocked = true;
  }

  function unlockPageForModal() {
    if (!modalLocked || !document.body) return;

    const root = document.documentElement;
    const body = document.body;
    root.classList.remove('fsfit-modal-open');
    body.classList.remove('fsfit-modal-open');

    if (savedRootStyles) {
      root.style.overflow = savedRootStyles.overflow;
      root.style.overscrollBehavior = savedRootStyles.overscrollBehavior;
    }
    if (savedBodyStyles) {
      body.style.position = savedBodyStyles.position;
      body.style.top = savedBodyStyles.top;
      body.style.left = savedBodyStyles.left;
      body.style.right = savedBodyStyles.right;
      body.style.width = savedBodyStyles.width;
      body.style.overflow = savedBodyStyles.overflow;
      body.style.overscrollBehavior = savedBodyStyles.overscrollBehavior;
    }

    const restoreY = modalScrollY;
    modalLocked = false;
    savedRootStyles = null;
    savedBodyStyles = null;
    window.scrollTo(0, restoreY);
    keepHorizontalPositionLocked();
  }

  function synchronizeModalState() {
    modalSyncScheduled = false;
    if (hasOpenModal()) lockPageForModal();
    else unlockPageForModal();

    document.querySelectorAll(MODAL_SCROLL_SELECTOR).forEach(element => {
      element.style.webkitOverflowScrolling = 'touch';
      element.style.overscrollBehaviorY = 'contain';
    });
  }

  function scheduleModalStateSync() {
    if (modalSyncScheduled) return;
    modalSyncScheduled = true;
    requestAnimationFrame(synchronizeModalState);
  }

  window.FSFitModalManager = Object.freeze({
    acquire: acquireModalLock,
    release: releaseModalLock,
    sync: scheduleModalStateSync,
    get locked() {
      return modalLocked;
    }
  });

  function observeModalState() {
    const observer = new MutationObserver(scheduleModalStateSync);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']
    });
    scheduleModalStateSync();
  }

  function beginTouch(event) {
    if (event.touches?.length > 1) {
      preventZoom(event);
      return;
    }

    const touch = event.touches?.[0];
    if (!touch) return;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchAxis = null;
    allowHorizontalScroll = Boolean(event.target?.closest?.(HORIZONTAL_SCROLL_SELECTOR));
  }

  function handleTouchMove(event) {
    if (event.touches?.length > 1) {
      preventZoom(event);
      return;
    }

    // Menus, abas, tabelas e gráficos horizontalmente roláveis cuidam do próprio gesto.
    if (allowHorizontalScroll) return;

    const touch = event.touches?.[0];
    if (!touch) return;

    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;

    if (!touchAxis && Math.max(Math.abs(dx), Math.abs(dy)) >= 6) {
      touchAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }

    if (touchAxis === 'x') {
      preventZoom(event);
      keepHorizontalPositionLocked();
    }
  }

  function endTouch(event) {
    touchAxis = null;
    allowHorizontalScroll = false;

    const now = Date.now();
    if (now - lastTouchEndAt <= 320) preventZoom(event);
    lastTouchEndAt = now;
    keepHorizontalPositionLocked();
  }

  ensureFloatingNotificationStyles();
  applyViewportLock();

  ['gesturestart', 'gesturechange', 'gestureend'].forEach(type => {
    document.addEventListener(type, preventZoom, { passive: false, capture: true });
  });

  document.addEventListener('touchstart', beginTouch, { passive: false, capture: true });
  document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
  document.addEventListener('touchend', endTouch, { passive: false, capture: true });
  document.addEventListener('touchcancel', () => {
    touchAxis = null;
    allowHorizontalScroll = false;
    keepHorizontalPositionLocked();
  }, { capture: true });

  document.addEventListener('dblclick', preventZoom, { passive: false, capture: true });

  document.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey) preventZoom(event);
  }, { passive: false, capture: true });

  window.addEventListener('scroll', keepHorizontalPositionLocked, { passive: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyTouchLock();
      observeModalState();
    }, { once: true });
  } else {
    applyTouchLock();
    observeModalState();
  }

  window.addEventListener('pageshow', () => {
    ensureFloatingNotificationStyles();
      applyViewportLock();
    applyTouchLock();
    scheduleModalStateSync();
  });
})();
