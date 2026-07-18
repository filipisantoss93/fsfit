(() => {
  const VIEWPORT_CONTENT = 'width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover';
  let lastTouchEndAt = 0;

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
    root.style.touchAction = 'pan-y';
    root.style.webkitTextSizeAdjust = '100%';
    root.style.overflowX = 'hidden';
    root.style.maxWidth = '100%';

    if (document.body) {
      document.body.style.touchAction = 'pan-y';
      document.body.style.webkitTextSizeAdjust = '100%';
      document.body.style.overflowX = 'hidden';
      document.body.style.maxWidth = '100%';
      document.body.style.width = '100%';
    }

    // Em navegadores iOS uma página previamente deslocada pode manter scrollLeft.
    if (window.scrollX !== 0) window.scrollTo(0, window.scrollY);
    if (root.scrollLeft !== 0) root.scrollLeft = 0;
    if (document.body?.scrollLeft) document.body.scrollLeft = 0;
  }

  function preventZoom(event) {
    if (event.cancelable) event.preventDefault();
  }

  function preventMultiTouch(event) {
    if (event.touches && event.touches.length > 1) preventZoom(event);
  }

  function keepHorizontalPositionLocked() {
    if (window.scrollX !== 0) window.scrollTo(0, window.scrollY);
  }

  // Executa imediatamente no <head>, antes de qualquer interação do usuário.
  applyViewportLock();

  ['gesturestart', 'gesturechange', 'gestureend'].forEach(type => {
    document.addEventListener(type, preventZoom, { passive: false, capture: true });
  });

  document.addEventListener('touchstart', preventMultiTouch, { passive: false, capture: true });
  document.addEventListener('touchmove', preventMultiTouch, { passive: false, capture: true });

  // Bloqueia zoom por duplo toque no Safari/iOS sem impedir um toque simples.
  document.addEventListener('touchend', event => {
    const now = Date.now();
    if (now - lastTouchEndAt <= 320) preventZoom(event);
    lastTouchEndAt = now;
  }, { passive: false, capture: true });

  document.addEventListener('dblclick', preventZoom, { passive: false, capture: true });

  // Bloqueia Ctrl/Cmd + gesto de zoom em navegadores desktop com trackpad/mouse.
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
