const DISMISS_KEY = 'fsfit_pwa_install_dismissed_until';
const DISMISS_DAYS = 7;
const IOS_GUIDE_GIF = '/assets/Gif adicionar a tela de início.gif?v=20260720-pwa-install-guide1';
let deferredPrompt = null;

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

const isIos = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);
const isMobileDevice = () =>
  /android|iphone|ipad|ipod|mobile/i.test(window.navigator.userAgent) ||
  window.matchMedia('(max-width: 860px)').matches;

const isDismissed = () => {
  const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
  return until > Date.now();
};

function dismissForDays(days = DISMISS_DAYS) {
  localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 24 * 60 * 60 * 1000));
}


function removeModal() {
  document.querySelector('#fsfit-pwa-install-modal')?.remove();
  window.FSFitModalManager?.sync();
}

function showModal() {
  if (isStandalone() || isDismissed() || document.querySelector('#fsfit-pwa-install-modal')) return;
  if (!deferredPrompt && !isIos()) return;

  const ios = isIos();
  const mobile = isMobileDevice();
  const kicker = mobile ? 'FS FIT NO SEU CELULAR' : 'FS FIT NA ÁREA DE TRABALHO';
  const title = ios
    ? 'Instale o FS Fit no seu iPhone'
    : mobile
      ? 'Instale o FS Fit no seu celular'
      : 'Instale o FS Fit no seu computador';
  const description = mobile
    ? 'Acesse seus alunos, treinos e agenda direto pela Tela de Início, com uma experiência mais rápida e parecida com um aplicativo.'
    : 'Abra seus alunos, treinos e agenda diretamente pela área de trabalho, em uma janela própria e sem depender de uma aba do navegador.';

  const modal = document.createElement('div');
  modal.id = 'fsfit-pwa-install-modal';
  modal.innerHTML = `
    <div class="pwa-install-backdrop" data-pwa-close></div>
    <section class="pwa-install-dialog" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
      <button class="pwa-install-close" type="button" aria-label="Fechar" data-pwa-close>×</button>
      <div class="pwa-install-heading">
        <span class="pwa-install-brand" aria-hidden="true">FS</span>
        <div>
          <span class="pwa-install-kicker">${kicker}</span>
          <h2 id="pwa-install-title">${title}</h2>
        </div>
      </div>
      <p class="pwa-install-description">${description}</p>
      ${ios ? `
        <div class="pwa-install-guide">
          <img class="pwa-install-guide-media" src="${IOS_GUIDE_GIF}" alt="Demonstração de como adicionar o FS Fit à Tela de Início do iPhone">
          <div class="pwa-install-steps">
            <div><span>1</span><p>Toque em <strong>Compartilhar</strong> no Safari.</p></div>
            <div><span>2</span><p>Escolha <strong>Adicionar à Tela de Início</strong>.</p></div>
          </div>
        </div>` : `
        <div class="pwa-install-android-note">${mobile
          ? 'Toque em <strong>Instalar FS Fit</strong> para adicionar o aplicativo à sua Tela de Início.'
          : 'Clique em <strong>Instalar FS Fit</strong> para adicionar o aplicativo ao Chrome e criar um atalho na área de trabalho.'}</div>`}
      <div class="pwa-install-actions">
        <button class="btn btn-primary" type="button" id="pwa-install-confirm">${ios ? 'Entendi' : 'Instalar FS Fit'}</button>
        <button class="btn btn-secondary" type="button" id="pwa-install-later">Agora não</button>
      </div>
    </section>`;

  document.body.appendChild(modal);
  window.FSFitModalManager?.sync();

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


if (isIos()) {
  window.setTimeout(showModal, 900);
}

if (document.querySelector('#today-list') || document.querySelector('#live-students-list')) {
  import('./painel-home-redesign.js?v=20260723-home-redesign1')
    .then(() => import('./painel-day-summary.js?v=20260724-day-summary1').catch(error => {
      console.error('Falha ao carregar o resumo diário do painel:', error);
    }))
    .catch(error => {
      console.error('Falha ao carregar nova tela inicial do painel:', error);
    });
  import('./painel-home-desktop-carousel.js?v=20260724-desktop-carousel1').catch(error => {
    console.error('Falha ao carregar as setas do carrossel de alunos:', error);
  });
  import('./painel-home-avatar.js?v=20260724-home-avatar1').catch(error => {
    console.error('Falha ao carregar a foto do aluno no card Agora:', error);
  });
  import('./painel-compact-enhancements.js?v=20260720-dashboard-compact2').catch(error => {
    console.error('Falha ao carregar melhorias compactas do painel:', error);
  });
  import('./aulas-painel-quick-actions.js?v=20260724-live-actions1')
    .then(() => import('./aulas-painel-exercise-categories.js?v=20260724-exercise-categories1'))
    .catch(error => {
      console.error('Falha ao carregar ações rápidas da aula:', error);
    });
  import('./aulas-painel-delete-controls.js?v=20260724-live-delete1')
    .then(() => import('./aulas-painel-delete-layout-fix.js?v=20260724-live-delete-layout1'))
    .catch(error => {
      console.error('Falha ao carregar exclusão de exercícios em aula:', error);
    });
  import('./aulas-painel-exercise-controls.js?v=20260720-live-exercise-controls1').catch(error => {
    console.error('Falha ao carregar controles de exercício em aula:', error);
  });
  import('./exercicio-drag-order.js?v=20260722-dnd2').catch(error => {
    console.error('Falha ao carregar reordenação de exercícios em aula:', error);
  });
  import('./painel-agenda-modal.js?v=20260723-agenda-dashboard2').catch(error => {
    console.error('Falha ao carregar dashboard da agenda de hoje:', error);
  });
  import('./painel-agenda-modal-hotfix.js?v=20260723-agenda-modal-hotfix4').catch(error => {
    console.error('Falha ao carregar correção do modal da agenda de hoje:', error);
  });
  import('./painel-agenda-modal-avatar.js?v=20260723-agenda-avatar3').catch(error => {
    console.error('Falha ao carregar a foto do aluno no modal da agenda de hoje:', error);
  });

  if (window.matchMedia('(min-width: 1100px)').matches) {
    import('./painel-resumo-geral.js?v=20260727-general1').catch(error => {
      console.error('Falha ao carregar o resumo geral do painel:', error);
    });
  }
}
