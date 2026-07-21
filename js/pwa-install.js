const DISMISS_KEY = 'fsfit_pwa_install_dismissed_until';
const DISMISS_DAYS = 7;
const IOS_GUIDE_GIF = '/assets/Gif adicionar a tela de início.gif?v=20260720-pwa-install-guide1';
let deferredPrompt = null;
let lockedScrollY = 0;

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

function lockPageScroll() {
  if (document.body.classList.contains('pwa-install-modal-open')) return;
  lockedScrollY = window.scrollY;
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.classList.add('pwa-install-modal-open');
}

function unlockPageScroll() {
  if (!document.body.classList.contains('pwa-install-modal-open')) return;
  document.body.classList.remove('pwa-install-modal-open');
  document.body.style.top = '';
  window.scrollTo(0, lockedScrollY);
}

function removeModal() {
  document.querySelector('#fsfit-pwa-install-modal')?.remove();
  unlockPageScroll();
}

function showModal() {
  if (isStandalone() || isDismissed() || document.querySelector('#fsfit-pwa-install-modal')) return;
  if (!deferredPrompt && !isIos()) return;

  const ios = isIos();
  const modal = document.createElement('div');
  modal.id = 'fsfit-pwa-install-modal';
  modal.innerHTML = `
    <div class="pwa-install-backdrop" data-pwa-close></div>
    <section class="pwa-install-dialog" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
      <button class="pwa-install-close" type="button" aria-label="Fechar" data-pwa-close>×</button>
      <div class="pwa-install-heading">
        <span class="pwa-install-brand" aria-hidden="true">FS</span>
        <div>
          <span class="pwa-install-kicker">FS FIT NO SEU CELULAR</span>
          <h2 id="pwa-install-title">${ios ? 'Instale o FS Fit no seu iPhone' : 'Instale o FS Fit no seu celular'}</h2>
        </div>
      </div>
      <p class="pwa-install-description">Acesse seus alunos, treinos e agenda direto pela Tela de Início, com uma experiência mais rápida e parecida com um aplicativo.</p>
      ${ios ? `
        <div class="pwa-install-guide">
          <img class="pwa-install-guide-media" src="${IOS_GUIDE_GIF}" alt="Demonstração de como adicionar o FS Fit à Tela de Início do iPhone">
          <div class="pwa-install-steps">
            <div><span>1</span><p>Toque em <strong>Compartilhar</strong> no Safari.</p></div>
            <div><span>2</span><p>Escolha <strong>Adicionar à Tela de Início</strong>.</p></div>
          </div>
        </div>` : `
        <div class="pwa-install-android-note">Toque em <strong>Instalar FS Fit</strong> para adicionar o aplicativo à sua Tela de Início.</div>`}
      <div class="pwa-install-actions">
        <button class="btn btn-primary" type="button" id="pwa-install-confirm">${ios ? 'Entendi' : 'Instalar FS Fit'}</button>
        <button class="btn btn-secondary" type="button" id="pwa-install-later">Agora não</button>
      </div>
    </section>`;

  document.body.appendChild(modal);
  lockPageScroll();

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
    if (ios) {
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
    body.pwa-install-modal-open{position:fixed;left:0;right:0;width:100%;overflow:hidden;overscroll-behavior:none}
    #fsfit-pwa-install-modal{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom));overscroll-behavior:contain}
    .pwa-install-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
    .pwa-install-dialog{position:relative;z-index:1;width:min(100%,480px);max-height:calc(100dvh - max(32px,env(safe-area-inset-top)) - max(32px,env(safe-area-inset-bottom)));overflow:auto;-webkit-overflow-scrolling:touch;padding:24px;border:1px solid rgba(255,255,255,.11);border-radius:22px;background:#171a20;color:#fff;box-shadow:0 24px 70px rgba(0,0,0,.5)}
    .pwa-install-heading{display:flex;align-items:center;gap:14px;padding-right:38px}
    .pwa-install-brand{display:grid;place-items:center;flex:0 0 48px;width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#43df45,#f1cc14);color:#0d1117;font-size:1.05rem;font-weight:950;letter-spacing:-.04em}
    .pwa-install-kicker{display:block;margin-bottom:4px;color:#32d74b;font-size:.68rem;font-weight:900;letter-spacing:.08em}
    .pwa-install-dialog h2{margin:0;font-size:1.35rem;line-height:1.16}
    .pwa-install-description{margin:16px 0 0;color:#b9bec8;line-height:1.5;font-size:.92rem}
    .pwa-install-close{position:absolute;top:14px;right:14px;width:38px;height:38px;border:1px solid rgba(255,255,255,.08);border-radius:50%;background:rgba(255,255,255,.08);color:#fff;font-size:25px;line-height:1;cursor:pointer}
    .pwa-install-guide{margin-top:18px}
    .pwa-install-guide-media{display:block;width:100%;max-height:330px;object-fit:contain;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:#0f1115}
    .pwa-install-steps{display:grid;gap:8px;margin-top:12px}
    .pwa-install-steps>div{display:grid;grid-template-columns:28px minmax(0,1fr);gap:10px;align-items:center;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.055)}
    .pwa-install-steps span{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:rgba(50,215,75,.14);color:#52e56a;font-size:.78rem;font-weight:900}
    .pwa-install-steps p{margin:0;color:#e7e9ed;font-size:.84rem;line-height:1.4}
    .pwa-install-android-note{margin-top:18px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.06);color:#e8eaee;font-size:.88rem;line-height:1.5}
    .pwa-install-actions{display:flex;gap:10px;margin-top:18px}
    .pwa-install-actions .btn{flex:1}
    @media(max-width:520px){
      #fsfit-pwa-install-modal{place-items:end center;padding:max(12px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom))}
      .pwa-install-dialog{width:100%;max-height:calc(100dvh - max(24px,env(safe-area-inset-top)) - max(24px,env(safe-area-inset-bottom)));padding:20px 18px;border-radius:22px}
      .pwa-install-brand{flex-basis:44px;width:44px;height:44px;border-radius:13px}
      .pwa-install-dialog h2{font-size:1.2rem}
      .pwa-install-description{font-size:.86rem}
      .pwa-install-guide-media{max-height:min(34dvh,300px)}
      .pwa-install-actions{flex-direction:column}
    }
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

if (document.querySelector('#today-list') || document.querySelector('#live-students-list')) {
  import('./painel-compact-enhancements.js?v=20260720-dashboard-compact2').catch(error => {
    console.error('Falha ao carregar melhorias compactas do painel:', error);
  });
  import('./aulas-painel-exercise-controls.js?v=20260720-live-exercise-controls1').catch(error => {
    console.error('Falha ao carregar controles de exercício em aula:', error);
  });
  import('./exercicio-drag-order.js?v=20260720-dnd1').catch(error => {
    console.error('Falha ao carregar reordenação de exercícios em aula:', error);
  });
}
