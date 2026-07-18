(() => {
  const VIEWPORT_CONTENT = 'width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover';
  const HORIZONTAL_SCROLL_SELECTOR = [
    '.table-wrap',
    '.admin-revenue-trend',
    '.library-category-nav',
    '.record-tabs',
    '[data-allow-horizontal-scroll="true"]'
  ].join(',');
  let lastTouchEndAt = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchAxis = null;
  let allowHorizontalScroll = false;

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
    document.addEventListener('DOMContentLoaded', applyTouchLock, { once: true });
  } else {
    applyTouchLock();
  }

  window.addEventListener('pageshow', () => {
    applyViewportLock();
    applyTouchLock();
  });
})();