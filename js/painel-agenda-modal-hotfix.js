const PANEL_PAGE = (window.location.pathname.split('/').pop() || '') === 'painel.html';

if (PANEL_PAGE) {
  const BODY_LOCK_CLASS = 'today-workout-dashboard-open';
  const MODAL_ID = 'today-workout-dashboard-modal';
  const LEGACY_FORCED_PROPERTIES = ['display', 'visibility', 'opacity', 'pointer-events', 'z-index'];

  function modalElement() {
    return document.getElementById(MODAL_ID);
  }

  function ensureRowFallback(row) {
    if (!row || row.tagName !== 'A' || row.hasAttribute('href')) return;
    const studentId = row.dataset.studentId || '';
    if (!studentId) return;
    row.href = `ficha-aluno.html?id=${encodeURIComponent(studentId)}&origem=painel`;
  }

  function clearLegacyForcedStyles(modal) {
    if (!modal || modal.classList.contains('open')) return;
    LEGACY_FORCED_PROPERTIES.forEach(property => modal.style.removeProperty(property));
  }

  function cleanupClosedModalState() {
    const modal = modalElement();
    if (modal?.classList.contains('open')) return;

    clearLegacyForcedStyles(modal);
    document.body.classList.remove(BODY_LOCK_CLASS);
  }

  // Fallback progressivo: se o módulo principal do modal falhar, a linha ainda
  // conserva um destino válido para a ficha do aluno. Não interfere no modal quando
  // painel-agenda-modal.js está funcionando, pois ele cancela a navegação no clique.
  document.addEventListener('click', event => {
    const row = event.target.closest?.('#today-list .today-entry');
    if (row && !row.classList.contains('locked') && !row.classList.contains('is-in-class')) {
      ensureRowFallback(row);
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      const row = event.target.closest?.('#today-list .today-entry');
      if (row && !row.classList.contains('locked') && !row.classList.contains('is-in-class')) {
        ensureRowFallback(row);
      }
    }

    if (event.key === 'Escape') {
      window.setTimeout(cleanupClosedModalState, 0);
    }
  }, true);

  // A versão antiga deste hotfix aplicava display:flex !important diretamente no
  // modal. Quando o módulo principal removia .open, o elemento continuava visível,
  // enquanto currentEntry/currentWorkout já haviam sido zerados. O resultado era
  // um modal aparentemente travado e botões sem ação. Agora o CSS do módulo principal
  // é a única fonte de verdade para abrir/fechar; aqui apenas limpamos resíduos antigos.
  document.addEventListener('click', () => {
    window.setTimeout(cleanupClosedModalState, 0);
  });

  window.addEventListener('pageshow', cleanupClosedModalState);
  window.addEventListener('pagehide', cleanupClosedModalState);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') cleanupClosedModalState();
  });

  cleanupClosedModalState();
}
