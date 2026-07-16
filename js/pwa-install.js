const DISMISS_KEY = 'fsfit_pwa_install_dismissed_until';
const DISMISS_DAYS = 7;
let deferredPrompt = null;

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);

const isDismissed = () => {
  const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
  return until > Date.now();
};

function dismissForDays(days = DISMISS_DAYS) {
  localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 24 * 60 * 60 * 1000));
}

function removeModal() {
  document.querySelector('#fsfit-pwa-install-modal')?.remove();
}

function showModal() {
  if (isStandalone() || isDismissed() || document.querySelector('#fsfit-pwa-install-modal')) return;
  if (!deferredPrompt && !isIos()) return;

  const modal = document.createElement('div');
  modal.id = 'fsfit-pwa-install-modal';
  modal.innerHTML = `
    <div class="pwa-install-backdrop" data-pwa-close></div>
    <section class="pwa-install-dialog" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
      <button class="pwa-install-close" type="button" aria-label="Fechar" data-pwa-close>×</button>
      <div class="pwa-install-icon" aria-hidden="true">📲</div>
      <h2 id="pwa-install-title">Tenha uma experiência melhor com o FS Fit</h2>
      <p>Instale o FS Fit no seu celular para acessar a plataforma de forma mais rápida, prática e com uma experiência semelhante a um aplicativo.</p>
      ${isIos() ? '<p class="pwa-install-ios"><strong>No iPhone/iPad:</strong> toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</p>' : ''}
      <div class="pwa-install-actions">
        <button class="btn btn-primary" type="button" id="pwa-install-confirm">${isIos() ? 'Entendi' : 'Instalar FS Fit'}</button>
        <button class="btn btn-secondary" type="button" id="pwa-install-later">Agora não</button>
      </div>
    </section>`;

  document.body.appendChild(modal);

  modal.querySelectorAll('[data-pwa-close]').forEach(button => {
    button.addEventListener('click', () => {
      dismissForDays();
      removeModal();
    });
  });

  modal.querySelector('#pwa-install-later')?.addEventListener('click', () => {
    dismissForDays();
    removeModal();
  });

  modal.querySelector('#pwa-install-confirm')?.addEventListener('click', async () => {
    if (isIos()) {
      dismissForDays(30);
      removeModal();
      return;
    }

    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    removeModal();
  });
}

function injectStyles() {
  if (document.querySelector('#fsfit-pwa-install-styles')) return;
  const style = document.createElement('style');
  style.id = 'fsfit-pwa-install-styles';
  style.textContent = `
    #fsfit-pwa-install-modal{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px}
    .pwa-install-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.68);backdrop-filter:blur(4px)}
    .pwa-install-dialog{position:relative;z-index:1;width:min(100%,460px);padding:28px;border:1px solid rgba(255,255,255,.1);border-radius:20px;background:#171a20;color:#fff;box-shadow:0 24px 70px rgba(0,0,0,.45)}
    .pwa-install-dialog h2{margin:8px 36px 10px 0;font-size:1.45rem;line-height:1.2}
    .pwa-install-dialog p{margin:0;color:#b9bec8;line-height:1.55}
    .pwa-install-icon{font-size:2rem}
    .pwa-install-close{position:absolute;top:14px;right:14px;width:36px;height:36px;border:0;border-radius:50%;background:rgba(255,255,255,.08);color:#fff;font-size:24px;cursor:pointer}
    .pwa-install-ios{margin-top:14px!important;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.06);color:#e8eaee!important}
    .pwa-install-actions{display:flex;gap:10px;margin-top:22px}
    .pwa-install-actions .btn{flex:1}
    @media(max-width:520px){.pwa-install-dialog{padding:24px 20px}.pwa-install-actions{flex-direction:column}.pwa-install-dialog h2{font-size:1.25rem}}
  `;
  document.head.appendChild(style);
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredPrompt = event;
  showModal();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  localStorage.removeItem(DISMISS_KEY);
  removeModal();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => console.error('Falha ao registrar o service worker:', error));
  });
}

injectStyles();

if (isIos()) {
  window.setTimeout(showModal, 900);
}
