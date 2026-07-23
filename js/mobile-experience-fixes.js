const LOADING_SELECTOR = 'p, td, .empty, .dashboard-empty, [data-loading]';

function ensureFixStyles() {
  if (document.querySelector('link[data-fsfit-mobile-experience-fixes]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/mobile-experience-fixes.css?v=20260721-mobile-polish2';
  link.dataset.fsfitMobileExperienceFixes = 'true';
  document.head.appendChild(link);
}

function syncLoadingElement(element) {
  if (!(element instanceof Element)) return;
  const elements = [];
  if (element.matches?.(LOADING_SELECTOR)) elements.push(element);
  elements.push(...(element.querySelectorAll?.(LOADING_SELECTOR) || []));

  elements.forEach(item => {
    const text = item.textContent?.trim() || '';
    const loading = /^(carregando|aguarde)(\.{0,3}|\s.+)?$/i.test(text) && text.length < 80;
    item.classList.toggle('fsfit-loading-placeholder', loading);
  });
}

function setupSkeletonCleanup() {
  syncLoadingElement(document.body);
  const observer = new MutationObserver(records => {
    records.forEach(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target) syncLoadingElement(target);
      record.addedNodes.forEach(node => {
        if (node instanceof Element) syncLoadingElement(node);
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function syncToastMessages(root = document) {
  const messages = [];
  if (root instanceof Element && root.matches('.message')) messages.push(root);
  messages.push(...(root.querySelectorAll?.('.message') || []));

  messages.forEach(message => {
    if (message.id === 'access-notice') return;
    message.classList.toggle('fsfit-toast-message', message.classList.contains('show'));
  });
}

function setupToastMessages() {
  syncToastMessages();
  const observer = new MutationObserver(records => {
    records.forEach(record => {
      if (record.target instanceof Element) syncToastMessages(record.target);
      record.addedNodes.forEach(node => {
        if (node instanceof Element) syncToastMessages(node);
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}

function isIos() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function showIosInstallHelp() {
  document.querySelector('.fsfit-install-help')?.remove();
  const modal = document.createElement('div');
  modal.className = 'fsfit-install-help';
  modal.innerHTML = `
    <section class="fsfit-install-help-card" role="dialog" aria-modal="true" aria-label="Instalar FS Fit no iPhone">
      <h2>Adicionar FS Fit à Tela de Início</h2>
      <p>No iPhone, a instalação é feita pelo menu de compartilhamento do Safari.</p>
      <ol class="fsfit-install-steps">
        <li>1. Toque no botão <strong>Compartilhar</strong> do Safari.</li>
        <li>2. Escolha <strong>Adicionar à Tela de Início</strong>.</li>
        <li>3. Confirme em <strong>Adicionar</strong>.</li>
      </ol>
      <button class="btn btn-primary" type="button" data-close-install-help>Entendi</button>
    </section>`;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('[data-close-install-help]')?.addEventListener('click', close);
  modal.addEventListener('click', event => {
    if (event.target === modal) close();
  });
}

function injectIosInstallAction() {
  if (!isIos() || isStandalone() || document.querySelector('[data-fsfit-install-app], [data-fsfit-ios-install]')) return;
  const list = document.querySelector('.fsfit-more-list');
  if (!list) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fsfit-more-item fsfit-install-item';
  button.dataset.fsfitIosInstall = 'true';
  button.innerHTML = `
    <span class="fsfit-more-item-icon" aria-hidden="true">↓</span>
    <span class="fsfit-more-item-copy"><strong>Instalar FS Fit</strong><small>Adicionar à Tela de Início do iPhone</small></span>
    <span class="fsfit-more-item-chevron" aria-hidden="true">›</span>`;
  list.insertBefore(button, list.lastElementChild);
  button.addEventListener('click', showIosInstallHelp);
}

function setupIosInstallAction() {
  injectIosInstallAction();
  if (!isIos() || isStandalone()) return;
  const observer = new MutationObserver(injectIosInstallAction);
  observer.observe(document.body, { childList: true, subtree: true });
}

function setupDashboardTabsStickyOffset() {
  const tabs = document.querySelector('.dashboard-tabs');
  if (!tabs) return;

  const mobileQuery = window.matchMedia('(max-width: 720px)');
  const sync = () => {
    if (mobileQuery.matches) {
      tabs.style.setProperty('top', 'calc(env(safe-area-inset-top, 0px) + 8px)', 'important');
      return;
    }
    tabs.style.removeProperty('top');
  };

  sync();
  if (typeof mobileQuery.addEventListener === 'function') mobileQuery.addEventListener('change', sync);
  else if (typeof mobileQuery.addListener === 'function') mobileQuery.addListener(sync);
}

function init() {
  ensureFixStyles();
  setupSkeletonCleanup();
  setupToastMessages();
  setupIosInstallAction();
  setupDashboardTabsStickyOffset();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();