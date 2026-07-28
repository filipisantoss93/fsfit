const homePanel = await waitForElement('#dashboard-home-panel');
const liveList = await waitForElement('#live-students-list');
const desktopQuery = window.matchMedia('(min-width: 721px)');

let currentCard = null;
let previousButton = null;
let nextButton = null;

if (homePanel && liveList) {
  const ensureNavigation = () => {
    const card = document.querySelector('#home-now-card');
    if (!card) return;

    const cardChanged = card !== currentCard;
    const controlsMissing = !card.querySelector('[data-home-live-navigation="previous"]')
      || !card.querySelector('[data-home-live-navigation="next"]');

    if (cardChanged || controlsMissing) {
      currentCard = card;
      currentCard.querySelectorAll('[data-home-live-navigation]').forEach(control => control.remove());

      previousButton = createNavigationButton('previous', '‹', 'Voltar para o aluno anterior');
      nextButton = createNavigationButton('next', '›', 'Avançar para o próximo aluno');
      currentCard.append(previousButton, nextButton);

      previousButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        dispatchSwipe(currentCard, 'previous');
      });

      nextButton.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        dispatchSwipe(currentCard, 'next');
      });
    }

    syncNavigation();
  };

  const syncNavigation = () => {
    if (!currentCard || !currentCard.isConnected || !previousButton || !nextButton) {
      ensureNavigation();
      return;
    }

    const hasMultipleStudents = liveRows().length > 1;
    const showControls = desktopQuery.matches && hasMultipleStudents;

    previousButton.hidden = !showControls;
    nextButton.hidden = !showControls;
    currentCard.classList.toggle('has-desktop-student-navigation', showControls);
    syncDesktopHint();
  };

  const homeObserver = new MutationObserver(ensureNavigation);
  homeObserver.observe(homePanel, { childList: true, subtree: true });

  const liveObserver = new MutationObserver(syncNavigation);
  liveObserver.observe(liveList, { childList: true, subtree: true });

  const hint = await waitForElement('#home-now-swipe-hint');
  if (hint) {
    new MutationObserver(syncDesktopHint).observe(hint, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['hidden']
    });
  }

  if (typeof desktopQuery.addEventListener === 'function') {
    desktopQuery.addEventListener('change', syncNavigation);
  } else {
    desktopQuery.addListener(syncNavigation);
  }

  ensureNavigation();
  requestAnimationFrame(ensureNavigation);
  window.setTimeout(ensureNavigation, 250);
}

function liveRows() {
  return [...document.querySelectorAll('#live-students-list [data-open-live-session]')];
}

function createNavigationButton(direction, symbol, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `home-now-desktop-nav home-now-desktop-nav-${direction}`;
  button.dataset.homeLiveNavigation = direction;
  button.setAttribute('aria-label', label);
  button.innerHTML = `<span aria-hidden="true">${symbol}</span>`;
  return button;
}

function dispatchSwipe(target, direction) {
  if (!target) return;

  const startX = direction === 'next' ? 220 : 50;
  const endX = direction === 'next' ? 50 : 220;
  const clientY = Math.max(80, Math.round(target.getBoundingClientRect().height / 2));

  const startEvent = new Event('touchstart', { bubbles: true, cancelable: true });
  Object.defineProperty(startEvent, 'touches', {
    configurable: true,
    value: [{ clientX: startX, clientY }]
  });
  target.dispatchEvent(startEvent);

  const endEvent = new Event('touchend', { bubbles: true, cancelable: true });
  Object.defineProperty(endEvent, 'changedTouches', {
    configurable: true,
    value: [{ clientX: endX, clientY }]
  });
  target.dispatchEvent(endEvent);

  window.setTimeout(syncDesktopHint, 0);
}

function syncDesktopHint() {
  if (!desktopQuery.matches) return;

  const hint = document.querySelector('#home-now-swipe-hint');
  if (!hint || hint.hidden) return;

  const current = hint.textContent?.trim() || '';
  if (!current) return;

  const position = current.split('·')[0]?.trim();
  const replacement = `${position}${position ? ' · ' : ''}use as setas para trocar de aluno`;
  if (hint.textContent !== replacement) hint.textContent = replacement;
}

function waitForElement(selector, timeout = 8000) {
  const existing = document.querySelector(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise(resolve => {
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (!element) return;
      observer.disconnect();
      resolve(element);
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector(selector));
    }, timeout);
  });
}
