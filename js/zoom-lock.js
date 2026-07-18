(() => {
  const VIEWPORT_CONTENT = 'width=device-width,initial-scale=1,maximum-scale=1,minimum-scale=1,user-scalable=no,viewport-fit=cover';

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
    if (document.body) document.body.style.touchAction = 'pan-x pan-y';
  }

  function preventGesture(event) {
    event.preventDefault();
  }

  applyViewportLock();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTouchLock, { once: true });
  } else {
    applyTouchLock();
  }

  document.addEventListener('gesturestart', preventGesture, { passive: false });
  document.addEventListener('gesturechange', preventGesture, { passive: false });
  document.addEventListener('gestureend', preventGesture, { passive: false });
  document.addEventListener('touchmove', event => {
    if (event.touches && event.touches.length > 1) event.preventDefault();
  }, { passive: false });
})();
