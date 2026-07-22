const tabs = Array.from(document.querySelectorAll('[data-dashboard-tab]'));
const panels = Array.from(document.querySelectorAll('.dashboard-tab-panel'));
const surface = document.querySelector('main.container');

if (tabs.length > 1 && surface) {
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let tracking = false;
  let horizontalIntent = false;

  const interactiveSelector = 'a,button,input,select,textarea,[contenteditable="true"],[role="button"]';
  const modalOpen = () => document.querySelector('.workout-modal.open,.live-session-modal.open,.live-workout-editor-modal.open,.fsfit-more-sheet.is-open,#fsfit-pwa-install-modal');

  function activeIndex() {
    const index = tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
    return index >= 0 ? index : 0;
  }

  function activateIndex(index) {
    if (index < 0 || index >= tabs.length) return;
    tabs[index].click();
  }

  surface.addEventListener('touchstart', event => {
    if (event.touches.length !== 1 || modalOpen()) return;
    if (event.target.closest(interactiveSelector)) return;

    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startTime = performance.now();
    tracking = true;
    horizontalIntent = false;
  }, { passive: true });

  surface.addEventListener('touchmove', event => {
    if (!tracking || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;

    if (!horizontalIntent) {
      if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) return;
      if (Math.abs(deltaY) >= Math.abs(deltaX) * .82) {
        tracking = false;
        return;
      }
      horizontalIntent = true;
    }

    if (horizontalIntent) event.preventDefault();
  }, { passive: false });

  surface.addEventListener('touchend', event => {
    if (!tracking || !horizontalIntent) {
      tracking = false;
      horizontalIntent = false;
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    const elapsed = Math.max(performance.now() - startTime, 1);
    const velocity = Math.abs(deltaX) / elapsed;

    tracking = false;
    horizontalIntent = false;

    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) return;
    if (velocity < .18 && Math.abs(deltaX) < 80) return;

    const current = activeIndex();
    const next = deltaX < 0 ? current + 1 : current - 1;
    activateIndex(next);
  }, { passive: true });

  surface.addEventListener('touchcancel', () => {
    tracking = false;
    horizontalIntent = false;
  }, { passive: true });

  panels.forEach(panel => {
    panel.style.touchAction = 'pan-y';
  });
}
