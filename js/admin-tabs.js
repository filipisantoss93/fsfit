const ADMIN_ICON_VERSION = '20260722-admin-icon1';

function applyAdminPageIcon() {
  const icon32 = `/assets/icons/admin/admin-icon-32x32.png?v=${ADMIN_ICON_VERSION}`;
  const icon180 = `/assets/icons/admin/admin-icon-180x180.png?v=${ADMIN_ICON_VERSION}`;

  document.querySelectorAll('link[rel="icon"]').forEach(link => link.remove());
  document.querySelectorAll('link[rel="apple-touch-icon"]').forEach(link => link.remove());

  const favicon = document.createElement('link');
  favicon.rel = 'icon';
  favicon.type = 'image/png';
  favicon.sizes = '32x32';
  favicon.href = icon32;
  document.head.appendChild(favicon);

  const appleTouchIcon = document.createElement('link');
  appleTouchIcon.rel = 'apple-touch-icon';
  appleTouchIcon.sizes = '180x180';
  appleTouchIcon.href = icon180;
  document.head.appendChild(appleTouchIcon);
}

applyAdminPageIcon();

const tabButtons = [...document.querySelectorAll('[data-admin-tab]')];
const tabPanels = [...document.querySelectorAll('[data-admin-tab-panel]')];
const validTabs = new Set(tabButtons.map(button => button.dataset.adminTab));
const storageKey = 'fsfit-admin-active-tab';

function resolveInitialTab() {
  const hashTab = window.location.hash.replace('#', '');
  if (validTabs.has(hashTab)) return hashTab;
  const saved = sessionStorage.getItem(storageKey);
  if (validTabs.has(saved)) return saved;
  return 'visao-geral';
}

function openTab(name, options = {}) {
  const tabName = validTabs.has(name) ? name : 'visao-geral';
  tabButtons.forEach(button => {
    const active = button.dataset.adminTab === tabName;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  tabPanels.forEach(panel => {
    panel.hidden = panel.dataset.adminTabPanel !== tabName;
  });

  sessionStorage.setItem(storageKey, tabName);
  if (options.updateHash !== false) {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${tabName}`);
  }
  if (options.focus) {
    document.querySelector(`[data-admin-tab="${CSS.escape(tabName)}"]`)?.focus();
  }
  window.dispatchEvent(new CustomEvent('fsfit:admin-tab-change', { detail: { tab: tabName } }));
}

tabButtons.forEach((button, index) => {
  button.addEventListener('click', () => openTab(button.dataset.adminTab));
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabButtons.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = tabButtons.length - 1;
    openTab(tabButtons[nextIndex].dataset.adminTab, { focus: true });
  });
});

window.addEventListener('hashchange', () => {
  const requested = window.location.hash.replace('#', '');
  if (validTabs.has(requested)) openTab(requested, { updateHash: false });
});

window.fsfitAdminTabs = { open: openTab };
openTab(resolveInitialTab(), { updateHash: false });
