const modalActions = document.querySelector<HTMLElement>('#live-session-modal-actions');

function normalizeLayout(): void {
  if (!modalActions?.classList.contains('live-session-modal-actions-quick')) return;

  const clearButton = modalActions.querySelector<HTMLElement>('[data-live-clear-exercises]');
  const finishButton = modalActions.querySelector<HTMLElement>('[data-modal-finish-session]');
  if (!clearButton || !finishButton) return;

  clearButton.setAttribute('aria-label', 'Limpar todos os exercícios do treino de hoje');
  clearButton.title = 'Limpar todos os exercícios do treino de hoje';
}

if (modalActions) {
  normalizeLayout();

  const observer = new MutationObserver(normalizeLayout);
  observer.observe(modalActions, { childList: true, subtree: true });
}
