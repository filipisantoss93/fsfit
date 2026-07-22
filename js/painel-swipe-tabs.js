const tabs = Array.from(document.querySelectorAll('[data-dashboard-tab]'));
const panels = Array.from(document.querySelectorAll('.dashboard-tab-panel'));
const surface = document.querySelector('main.container');

if (tabs.length > 1 && surface) {
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let tracking = false;
  let horizontalIntent = false;
  let movedHorizontally = false;
  let draggedPanel = null;
  let suppressClickUntil = 0;

  const excludedStartSelector = 'input,select,textarea,[contenteditable="true"],.dashboard-tabs';
  const modalOpen = () => document.querySelector('.workout-modal.open,.live-session-modal.open,.live-workout-editor-modal.open,.fsfit-more-sheet.is-open,#fsfit-pwa-install-modal');

  function activeIndex() {
    const index = tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true');
    return index >= 0 ? index : 0;
  }

  function activePanel() {
    const current = tabs[activeIndex()];
    const panelId = current?.getAttribute('aria-controls');
    return (panelId && document.getElementById(panelId)) || panels.find(panel => !panel.hidden) || null;
  }

  function activateIndex(index) {
    if (index < 0 || index >= tabs.length) return false;
    tabs[index].click();
    return true;
  }

  function clearPanelMotion(panel) {
    if (!panel) return;
    panel.style.removeProperty('transition');
    panel.style.removeProperty('transform');
    panel.style.removeProperty('opacity');
    panel.style.removeProperty('will-change');
  }

  function resetGesture({ animate = true } = {}) {
    const panel = draggedPanel;
    tracking = false;
    horizontalIntent = false;
    movedHorizontally = false;
    draggedPanel = null;
    surface.classList.remove('dashboard-swipe-dragging');

    if (!panel) return;
    if (!animate) {
      clearPanelMotion(panel);
      return;
    }

    panel.style.transition = 'transform 180ms cubic-bezier(.2,.8,.2,1), opacity 180ms ease';
    panel.style.transform = 'translate3d(0,0,0) scale(1)';
    panel.style.opacity = '1';
    window.setTimeout(() => clearPanelMotion(panel), 200);
  }

  function animateTabChange(nextIndex, deltaX) {
    const currentPanel = draggedPanel || activePanel();
    const direction = deltaX < 0 ? -1 : 1;
    const width = Math.max(surface.clientWidth, window.innerWidth || 1);
    const exitDistance = Math.min(width * .28, 180);

    suppressClickUntil = performance.now() + 500;
    tracking = false;
    horizontalIntent = false;
    movedHorizontally = false;
    draggedPanel = null;
    surface.classList.remove('dashboard-swipe-dragging');

    if (!currentPanel) {
      activateIndex(nextIndex);
      return;
    }

    currentPanel.style.transition = 'transform 130ms cubic-bezier(.4,0,1,1), opacity 130ms ease';
    currentPanel.style.transform = `translate3d(${direction * exitDistance}px,0,0) scale(.985)`;
    currentPanel.style.opacity = '.42';

    window.setTimeout(() => {
      clearPanelMotion(currentPanel);
      activateIndex(nextIndex);

      const nextPanel = activePanel();
      if (!nextPanel) return;
      nextPanel.style.transition = 'none';
      nextPanel.style.transform = `translate3d(${-direction * Math.min(width * .2, 130)}px,0,0) scale(.988)`;
      nextPanel.style.opacity = '.58';
      nextPanel.style.willChange = 'transform, opacity';

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          nextPanel.style.transition = 'transform 190ms cubic-bezier(.2,.8,.2,1), opacity 190ms ease';
          nextPanel.style.transform = 'translate3d(0,0,0) scale(1)';
          nextPanel.style.opacity = '1';
          window.setTimeout(() => clearPanelMotion(nextPanel), 220);
        });
      });
    }, 120);
  }

  surface.addEventListener('touchstart', event => {
    if (event.touches.length !== 1 || modalOpen()) return;
    if (event.target.closest(excludedStartSelector)) return;

    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startTime = performance.now();
    tracking = true;
    horizontalIntent = false;
    movedHorizontally = false;
    draggedPanel = activePanel();
  }, { passive: true });

  surface.addEventListener('touchmove', event => {
    if (!tracking || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!horizontalIntent) {
      if (absX < 9 && absY < 9) return;
      if (absY >= absX * .82) {
        resetGesture({ animate: false });
        return;
      }
      horizontalIntent = true;
      movedHorizontally = true;
      surface.classList.add('dashboard-swipe-dragging');
      if (draggedPanel) draggedPanel.style.willChange = 'transform, opacity';
    }

    event.preventDefault();

    const current = activeIndex();
    const tryingPrevious = deltaX > 0;
    const tryingNext = deltaX < 0;
    const hasDestination = (tryingPrevious && current > 0) || (tryingNext && current < tabs.length - 1);
    const width = Math.max(surface.clientWidth, window.innerWidth || 1);
    const maxTravel = width * .42;
    const resistance = hasDestination ? 1 : .22;
    const visualX = Math.max(-maxTravel, Math.min(maxTravel, deltaX * resistance));
    const progress = Math.min(Math.abs(visualX) / Math.max(width, 1), 1);

    if (draggedPanel) {
      draggedPanel.style.transition = 'none';
      draggedPanel.style.transform = `translate3d(${visualX}px,0,0) scale(${1 - progress * .025})`;
      draggedPanel.style.opacity = String(1 - progress * .28);
    }
  }, { passive: false });

  surface.addEventListener('touchend', event => {
    if (!tracking || !horizontalIntent) {
      resetGesture({ animate: false });
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    const elapsed = Math.max(performance.now() - startTime, 1);
    const velocity = Math.abs(deltaX) / elapsed;
    const current = activeIndex();
    const next = deltaX < 0 ? current + 1 : current - 1;
    const validDestination = next >= 0 && next < tabs.length;
    const enoughDistance = Math.abs(deltaX) >= 52 && Math.abs(deltaX) > Math.abs(deltaY) * 1.08;
    const enoughVelocity = velocity >= .16 || Math.abs(deltaX) >= 88;

    if (movedHorizontally) suppressClickUntil = performance.now() + 420;

    if (validDestination && enoughDistance && enoughVelocity) {
      animateTabChange(next, deltaX);
      return;
    }

    resetGesture({ animate: true });
  }, { passive: true });

  surface.addEventListener('touchcancel', () => {
    resetGesture({ animate: true });
  }, { passive: true });

  surface.addEventListener('click', event => {
    if (performance.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    suppressClickUntil = 0;
  }, true);

  panels.forEach(panel => {
    panel.style.touchAction = 'pan-y';
  });
}