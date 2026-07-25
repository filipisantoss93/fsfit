const DISMISS_KEY = 'fsfit_student_push_onboarding_dismissed_until';
const DAY_MS = 24 * 60 * 60 * 1000;

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isDismissed = () => Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now();

function dismissFor(hours = 24) {
  localStorage.setItem(DISMISS_KEY, String(Date.now() + hours * 60 * 60 * 1000));
}

function injectStyles() {
  if (document.querySelector('#student-push-onboarding-styles')) return;
  const style = document.createElement('style');
  style.id = 'student-push-onboarding-styles';
  style.textContent = `
    body.student-push-onboarding-open{overflow:hidden}
    #student-push-onboarding{position:fixed;inset:0;z-index:1600;display:grid;place-items:end center;padding:max(12px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom));overscroll-behavior:contain}
    .student-push-onboarding-backdrop{position:absolute;inset:0;border:0;background:rgba(0,0,0,.7);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
    .student-push-onboarding-dialog{position:relative;z-index:1;width:min(100%,520px);max-height:calc(100dvh - max(24px,env(safe-area-inset-top)) - max(24px,env(safe-area-inset-bottom)));overflow:auto;padding:22px;border:1px solid rgba(255,255,255,.11);border-radius:24px;background:#171a20;color:#f2f4f7;box-shadow:0 24px 70px rgba(0,0,0,.52)}
    .student-push-onboarding-close{position:absolute;top:14px;right:14px;width:38px;height:38px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:rgba(255,255,255,.06);color:#fff;font-size:25px;line-height:1;cursor:pointer}
    .student-push-onboarding-icon{display:grid;place-items:center;width:52px;height:52px;margin-bottom:14px;border:1px solid rgba(50,215,75,.34);border-radius:16px;background:rgba(50,215,75,.12);font-size:1.5rem}
    .student-push-onboarding-kicker{display:block;margin-bottom:5px;color:#32d74b;font-size:.68rem;font-weight:900;letter-spacing:.09em}
    .student-push-onboarding-dialog h2{margin:0;padding-right:40px;font-size:1.35rem;line-height:1.18}
    .student-push-onboarding-description{margin:12px 0 0;color:#b5bdc8;font-size:.9rem;line-height:1.55}
    .student-push-onboarding-steps{display:grid;gap:9px;margin-top:18px}
    .student-push-onboarding-step{display:grid;grid-template-columns:30px minmax(0,1fr);gap:11px;align-items:center;padding:11px 12px;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(255,255,255,.04)}
    .student-push-onboarding-step>span{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:rgba(50,215,75,.14);color:#52e56a;font-size:.78rem;font-weight:900}
    .student-push-onboarding-step p{margin:0;color:#e8ebef;font-size:.84rem;line-height:1.42}
    .student-push-onboarding-actions{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.72fr);gap:10px;margin-top:20px}
    .student-push-onboarding-actions .btn{width:100%}
    .student-push-onboarding-feedback{min-height:20px;margin:12px 0 0;color:#b5bdc8;font-size:.78rem;text-align:center}
    @media(max-width:520px){.student-push-onboarding-dialog{padding:20px 18px}.student-push-onboarding-dialog h2{font-size:1.22rem}.student-push-onboarding-actions{grid-template-columns:1fr}.student-push-onboarding-description{font-size:.86rem}}
  `;
  document.head.appendChild(style);
}

function closeDialog({ remember = true } = {}) {
  document.querySelector('#student-push-onboarding')?.remove();
  document.body.classList.remove('student-push-onboarding-open');
  if (remember) dismissFor(24);
}

function showInstallGuide() {
  injectStyles();
  document.querySelector('#student-push-onboarding')?.remove();

  const modal = document.createElement('div');
  modal.id = 'student-push-onboarding';
  modal.innerHTML = `
    <button class="student-push-onboarding-backdrop" type="button" aria-label="Fechar orientação de instalação"></button>
    <section class="student-push-onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="student-push-onboarding-title">
      <button class="student-push-onboarding-close" type="button" aria-label="Fechar">×</button>
      <div class="student-push-onboarding-icon" aria-hidden="true">🔔</div>
      <span class="student-push-onboarding-kicker">NOTIFICAÇÕES NO IPHONE</span>
      <h2 id="student-push-onboarding-title">Instale o FS Fit para receber avisos</h2>
      <p class="student-push-onboarding-description">No iPhone, as notificações funcionam somente quando o FS Fit é aberto pelo ícone instalado na Tela de Início.</p>
      <div class="student-push-onboarding-steps">
        <div class="student-push-onboarding-step"><span>1</span><p>No Safari, toque em <strong>Compartilhar</strong>.</p></div>
        <div class="student-push-onboarding-step"><span>2</span><p>Escolha <strong>Adicionar à Tela de Início</strong>.</p></div>
        <div class="student-push-onboarding-step"><span>3</span><p>Abra o FS Fit pelo novo ícone e toque em <strong>Ativar notificações</strong>.</p></div>
      </div>
      <div class="student-push-onboarding-actions">
        <button class="btn btn-primary" type="button" data-student-push-understood>Entendi</button>
        <button class="btn btn-neutral" type="button" data-student-push-later>Agora não</button>
      </div>
    </section>`;

  document.body.appendChild(modal);
  document.body.classList.add('student-push-onboarding-open');
  modal.querySelector('.student-push-onboarding-backdrop')?.addEventListener('click', () => closeDialog());
  modal.querySelector('.student-push-onboarding-close')?.addEventListener('click', () => closeDialog());
  modal.querySelector('[data-student-push-understood]')?.addEventListener('click', () => closeDialog());
  modal.querySelector('[data-student-push-later]')?.addEventListener('click', () => closeDialog());
}

function showActivationPrompt() {
  const enableButton = document.querySelector('#enable-notifications');
  const status = document.querySelector('#notification-status');
  if (!enableButton || enableButton.classList.contains('hidden') || Notification.permission === 'denied') return;

  injectStyles();
  document.querySelector('#student-push-onboarding')?.remove();

  const modal = document.createElement('div');
  modal.id = 'student-push-onboarding';
  modal.innerHTML = `
    <button class="student-push-onboarding-backdrop" type="button" aria-label="Fechar ativação de notificações"></button>
    <section class="student-push-onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="student-push-onboarding-title">
      <button class="student-push-onboarding-close" type="button" aria-label="Fechar">×</button>
      <div class="student-push-onboarding-icon" aria-hidden="true">🔔</div>
      <span class="student-push-onboarding-kicker">NÃO PERCA NENHUM AVISO</span>
      <h2 id="student-push-onboarding-title">Ative as notificações do FS Fit</h2>
      <p class="student-push-onboarding-description">Receba lembretes, mensagens e avisos do seu personal mesmo quando o aplicativo estiver fechado.</p>
      <div class="student-push-onboarding-actions">
        <button class="btn btn-primary" type="button" data-student-push-enable>Ativar notificações</button>
        <button class="btn btn-neutral" type="button" data-student-push-later>Agora não</button>
      </div>
      <p class="student-push-onboarding-feedback" aria-live="polite"></p>
    </section>`;

  document.body.appendChild(modal);
  document.body.classList.add('student-push-onboarding-open');

  const activateButton = modal.querySelector('[data-student-push-enable]');
  const feedback = modal.querySelector('.student-push-onboarding-feedback');

  const finishWhenReady = new MutationObserver(() => {
    const text = String(status?.textContent || '').toLowerCase();
    if (text.includes('notificações ativas')) {
      localStorage.removeItem(DISMISS_KEY);
      finishWhenReady.disconnect();
      closeDialog({ remember: false });
      return;
    }
    if (text.includes('não foi possível') || text.includes('bloqueadas')) {
      if (activateButton) {
        activateButton.disabled = false;
        activateButton.textContent = 'Tentar novamente';
      }
      if (feedback) feedback.textContent = status?.textContent || 'Não foi possível ativar as notificações.';
    }
  });
  if (status) finishWhenReady.observe(status, { childList: true, characterData: true, subtree: true });

  activateButton?.addEventListener('click', () => {
    activateButton.disabled = true;
    activateButton.textContent = 'Ativando...';
    if (feedback) feedback.textContent = 'Confirme a permissão quando o iPhone solicitar.';
    enableButton.click();
  });
  modal.querySelector('.student-push-onboarding-backdrop')?.addEventListener('click', () => closeDialog());
  modal.querySelector('.student-push-onboarding-close')?.addEventListener('click', () => closeDialog());
  modal.querySelector('[data-student-push-later]')?.addEventListener('click', () => closeDialog());
}

function setupInstallShortcut() {
  if (!isIos() || isStandalone()) return;
  const installButton = document.querySelector('#install-app');
  if (!installButton) return;
  installButton.textContent = 'Como instalar o FS Fit';
  installButton.classList.remove('hidden');
  installButton.addEventListener('click', showInstallGuide);
}

function waitForNotificationState(attempt = 0) {
  const enableButton = document.querySelector('#enable-notifications');
  const status = document.querySelector('#notification-status');
  const ready = enableButton && status && !status.textContent.toLowerCase().includes('verificando');

  if (!ready && attempt < 20) {
    window.setTimeout(() => waitForNotificationState(attempt + 1), 350);
    return;
  }

  if (isIos() && !isStandalone()) {
    if (!isDismissed()) showInstallGuide();
    return;
  }

  if (typeof Notification !== 'undefined' && Notification.permission !== 'denied' && !enableButton?.classList.contains('hidden') && !isDismissed()) {
    showActivationPrompt();
  }
}

setupInstallShortcut();
window.setTimeout(() => waitForNotificationState(), 1300);
