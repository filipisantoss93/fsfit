const modalActions = document.querySelector('#live-session-modal-actions');

if (modalActions) {
  injectStyles();
  normalizeLayout();

  const observer = new MutationObserver(normalizeLayout);
  observer.observe(modalActions, { childList: true, subtree: true });
}

function normalizeLayout() {
  if (!modalActions?.classList.contains('live-session-modal-actions-quick')) return;

  const clearButton = modalActions.querySelector('[data-live-clear-exercises]');
  const finishButton = modalActions.querySelector('[data-modal-finish-session]');
  if (!clearButton || !finishButton) return;

  clearButton.setAttribute('aria-label', 'Limpar todos os exercícios do treino de hoje');
  clearButton.title = 'Limpar todos os exercícios do treino de hoje';
}

function injectStyles() {
  if (document.querySelector('#live-session-delete-layout-fix-styles')) return;

  const style = document.createElement('style');
  style.id = 'live-session-delete-layout-fix-styles';
  style.textContent = `
    .live-session-modal-actions.live-session-modal-actions-quick{
      display:grid!important;
      grid-template-columns:minmax(112px,.78fr) minmax(0,1.22fr)!important;
      gap:8px!important;
      align-items:stretch!important;
    }
    .live-session-modal-actions.live-session-modal-actions-quick>.live-session-quick-actions{
      grid-column:1/-1!important;
    }
    .live-session-modal-actions.live-session-modal-actions-quick>.live-session-end-actions{
      display:contents!important;
    }
    .live-session-modal-actions.live-session-modal-actions-quick .live-session-clear-action{
      grid-column:1!important;
      width:100%!important;
      min-width:0!important;
      margin:0!important;
    }
    .live-session-modal-actions.live-session-modal-actions-quick .live-session-end-actions>[data-modal-finish-session],
    .live-session-modal-actions.live-session-modal-actions-quick>[data-modal-finish-session]{
      grid-column:2!important;
      width:100%!important;
      min-width:0!important;
      margin:0!important;
    }
    @media(max-width:520px){
      .live-session-modal-actions.live-session-modal-actions-quick{
        grid-template-columns:minmax(104px,.72fr) minmax(0,1.28fr)!important;
        gap:6px!important;
      }
      .live-session-clear-action .btn-action-description{
        display:none!important;
      }
      .live-session-clear-action .btn-action-copy{
        justify-content:center!important;
      }
      .live-session-clear-action .btn-action-title{
        white-space:nowrap!important;
      }
    }
  `;
  document.head.appendChild(style);
}
