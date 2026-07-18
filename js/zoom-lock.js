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
    document.documentElement.style.touchAction = 'pan-x pan-y';
    document.documentElement.style.webkitTextSizeAdjust = '100%';
    if (document.body) {
      document.body.style.touchAction = 'pan-x pan-y';
      document.body.style.webkitTextSizeAdjust = '100%';
    }
  }

  function preventZoom(event) {
    if (event.cancelable) event.preventDefault();
  }

  function preventMultiTouch(event) {
    if (event.touches && event.touches.length > 1) preventZoom(event);
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