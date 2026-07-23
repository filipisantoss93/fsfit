const PANEL_PAGE = (window.location.pathname.split('/').pop() || '') === 'painel.html';

if (PANEL_PAGE) {
  const BODY_LOCK_CLASS = 'today-workout-dashboard-open';
  const MODAL_ID = 'today-workout-dashboard-modal';
  const FORCED_PROPERTIES = ['display', 'visibility', 'opacity', 'pointer-events', 'z-index'];
  let visibilityTimer = 0;

  function modalElement() {
    return document.getElementById(MODAL_ID);
  }

  function ensureRowFallback(row) {
    if (!row || row.tagName !== 'A' || row.hasAttribute('href')) return;
    const studentId = row.dataset.studentId || '';
    if (!studentId) return;
    row.href = `ficha-aluno.html?id=${encodeURIComponent(studentId)}&origem=painel`;
  }

  function clearForcedVisibility(modal) {
    if (!modal || modal.classList.contains('open')) return;
    FORCED_PROPERTIES.forEach(property => modal.style.removeProperty(property));
  }

  function unlockOrphanedPage() {
    const modal = modalElement();
    const modalOpen = Boolean(modal?.classList.contains('open'));
    if (modalOpen) return;

    document.body.classList.remove(BODY_LOCK_CLASS);
    clearForcedVisibility(modal);
  }

  function forceVisibleModal() {
    window.clearTimeout(visibilityTimer);

    if (!document.body.classList.contains(BODY_LOCK_CLASS)) {
      clearForcedVisibility(modalElement());
      return;
    }

    const modal = modalElement();
    if (!modal || !modal.classList.contains('open')) {
      // Nunca deixa a página bloqueada quando o modal não chegou a abrir.
      document.body.classList.remove(BODY_LOCK_CLASS);
      clearForcedVisibility(modal);
      return;
    }

    // O modal principal já deve estar aberto por painel-agenda-modal.js.
    // Aqui apenas reforçamos a pintura no iOS/PWA, sem alterar novamente a classe
    // .open em um MutationObserver (isso gerava um ciclo de mutações e travava a UI).
    if (modal.getAttribute('aria-hidden') !== 'false') {
      modal.setAttribute('aria-hidden', 'false');
    }

    const expectedStyles = {
      display: 'flex',
      visibility: 'visible',
      opacity: '1',
      'pointer-events': 'auto',
      'z-index': '10000'
    };

    Object.entries(expectedStyles).forEach(([property, value]) => {
      if (modal.style.getPropertyValue(property) !== value || modal.style.getPropertyPriority(property) !== 'important') {
        modal.style.setProperty(property, value, 'important');
      }
    });

    visibilityTimer = window.setTimeout(() => {
      if (!document.body.classList.contains(BODY_LOCK_CLASS)) clearForcedVisibility(modal);
    }, 350);
  }

  function scheduleVisibilityCheck() {
    queueMicrotask(forceVisibleModal);
    requestAnimationFrame(forceVisibleModal);
    window.setTimeout(forceVisibleModal, 80);
  }

  document.addEventListener('click', event => {
    const row = event.target.closest?.('#today-list .today-entry');
    if (!row || row.classList.contains('locked') || row.classList.contains('is-in-class')) return;

    // O modal remove o href para transformar a linha em botão. Restauramos o link
    // como fallback progressivo: se o módulo do modal falhar, o clique ainda abre
    // a ficha do aluno em vez de deixar a interface sem resposta.
    ensureRowFallback(row);
    scheduleVisibilityCheck();
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      window.setTimeout(unlockOrphanedPage, 0);
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest?.('#today-list .today-entry');
    if (!row || row.classList.contains('locked') || row.classList.contains('is-in-class')) return;
    ensureRowFallback(row);
    scheduleVisibilityCheck();
  }, true);

  window.addEventListener('pageshow', unlockOrphanedPage);
  window.addEventListener('pagehide', unlockOrphanedPage);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') unlockOrphanedPage();
  });
}
