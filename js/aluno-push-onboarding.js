const DISMISS_KEY = 'fsfit_student_push_onboarding_dismissed_until';
const DAY_MS = 24 * 60 * 60 * 1000;

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isDismissed = () => Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now();

function dismissFor(hours = 24) {
  localStorage.setItem(DISMISS_KEY, String(Date.now() + hours * 60 * 60 * 1000));
}

function closeDialog({ remember = true } = {}) {
  document.querySelector('#student-push-onboarding')?.remove();
  document.body.classList.remove('student-push-onboarding-open');
  if (remember) dismissFor(24);
}

function showInstallGuide() {
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
