const card = await waitForElement('#home-now-card');
const liveList = document.querySelector('#live-students-list');

if (card && liveList && !card.querySelector('[data-home-live-navigation]')) {
  injectStyles();

  const previousButton = createNavigationButton('previous', '‹', 'Voltar para o aluno anterior');
  const nextButton = createNavigationButton('next', '›', 'Avançar para o próximo aluno');
  card.append(previousButton, nextButton);

  const liveRows = () => [...liveList.querySelectorAll('[data-open-live-session]')];

  const syncNavigation = () => {
    const hasMultipleStudents = liveRows().length > 1;
    previousButton.hidden = !hasMultipleStudents;
    nextButton.hidden = !hasMultipleStudents;
    card.classList.toggle('has-desktop-student-navigation', hasMultipleStudents);
    syncDesktopHint();
  };

  previousButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    dispatchSwipe(card, 'previous');
  });

  nextButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    dispatchSwipe(card, 'next');
  });

  new MutationObserver(syncNavigation).observe(liveList, { childList: true, subtree: true });

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

  const desktopQuery = window.matchMedia('(min-width: 721px)');
  if (typeof desktopQuery.addEventListener === 'function') {
    desktopQuery.addEventListener('change', syncNavigation);
  }

  syncNavigation();
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
  const startX = direction === 'next' ? 180 : 40;
  const endX = direction === 'next' ? 40 : 180;
  const clientY = 120;

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
  if (!window.matchMedia('(min-width: 721px)').matches) return;

  const hint = document.querySelector('#home-now-swipe-hint');
  if (!hint || hint.hidden) return;

  const current = hint.textContent?.trim() || '';
  if (!current || current.includes('use as setas')) return;

  const position = current.split('·')[0]?.trim();
  hint.textContent = `${position}${position ? ' · ' : ''}use as setas para trocar de aluno`;
}

function injectStyles() {
  if (document.querySelector('#painel-home-desktop-carousel-styles')) return;

  const style = document.createElement('style');
  style.id = 'painel-home-desktop-carousel-styles';
  style.textContent = `
    .home-now-desktop-nav{
      position:absolute;
      z-index:5;
      top:62%;
      display:none;
      place-items:center;
      width:44px;
      height:44px;
      padding:0;
      border:1px solid rgba(177,255,0,.42);
      border-radius:50%;
      background:rgba(7,15,20,.82);
      color:var(--primary);
      font:inherit;
      font-size:2rem;
      font-weight:500;
      line-height:1;
      cursor:pointer;
      box-shadow:0 9px 26px rgba(0,0,0,.32);
      backdrop-filter:blur(8px);
      -webkit-backdrop-filter:blur(8px);
      transform:translateY(-50%);
      transition:background .18s ease,border-color .18s ease,transform .18s ease;
    }
    .home-now-desktop-nav span{display:block;transform:translateY(-1px)}
    .home-now-desktop-nav-previous{left:4%}
    .home-now-desktop-nav-next{right:4%}
    .home-now-desktop-nav:hover,
    .home-now-desktop-nav:focus-visible{
      border-color:var(--primary);
      background:rgba(177,255,0,.14);
      outline:none;
      transform:translateY(-50%) scale(1.06);
    }
    .home-now-desktop-nav:active{transform:translateY(-50%) scale(.95)}
    .home-now-desktop-nav[hidden]{display:none!important}

    @media(min-width:721px){
      .home-now-card.has-desktop-student-navigation .home-now-desktop-nav{display:grid}
      .home-now-card.has-desktop-student-navigation .home-now-copy{padding-inline:58px}
      .home-now-card.has-desktop-student-navigation .home-now-action{width:calc(100% - 116px);margin-left:58px}
    }
  `;
  document.head.appendChild(style);
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
