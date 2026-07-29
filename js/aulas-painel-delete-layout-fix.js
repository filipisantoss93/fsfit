const modalActions = document.querySelector('#live-session-modal-actions');

if (modalActions) {
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
