const PANEL_PAGE = (window.location.pathname.split('/').pop() || '') === 'painel.html';

if (PANEL_PAGE) {
  const BODY_LOCK_CLASS = 'today-workout-dashboard-open';
  const MODAL_ID = 'today-workout-dashboard-modal';
  let visibilityTimer = 0;

  function modalElement() {
    return document.getElementById(MODAL_ID);
  }

  function clearForcedVisibility(modal) {
    if (!modal || modal.classList.contains('open')) return;
    ['display', 'visibility', 'opacity', 'pointer-events', 'z-index'].forEach(property => {
      modal.style.removeProperty(property);
    });
  }

  function unlockOrphanedPage() {
    const modal = modalElement();
    const modalOpen = Boolean(modal?.classList.contains('open'));
    if (!modalOpen) {
      document.body.classList.remove(BODY_LOCK_CLASS);
      clearForcedVisibility(modal);
    }
  }

  function guaranteeVisibleModal() {
    window.clearTimeout(visibilityTimer);

    if (!document.body.classList.contains(BODY_LOCK_CLASS)) {
      clearForcedVisibility(modalElement());
      return;
    }

    const modal = modalElement();
    if (!modal) {
      document.body.classList.remove(BODY_LOCK_CLASS);
      return;
    }

    // O clique no atendimento bloqueia o scroll antes da consulta ao Supabase.
    // No iOS/PWA, uma combinação de JS em cache e repaint pode deixar o modal
    // invisível enquanto o body continua bloqueado. Reforça somente o estado
    // visual do modal já aberto, sem interferir na lógica ou nos dados.
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    modal.style.setProperty('display', 'flex', 'important');
    modal.style.setProperty('visibility', 'visible', 'important');
    modal.style.setProperty('opacity', '1', 'important');
    modal.style.setProperty('pointer-events', 'auto', 'important');
    modal.style.setProperty('z-index', '10000', 'important');

    visibilityTimer = window.setTimeout(() => {
      if (!document.body.classList.contains(BODY_LOCK_CLASS)) clearForcedVisibility(modal);
    }, 350);
  }

  document.addEventListener('click', event => {
    const row = event.target.closest?.('#today-list .today-entry');
    if (!row || row.classList.contains('locked') || row.classList.contains('is-in-class')) return;

    // Executa depois dos listeners existentes da agenda, garantindo que o modal
    // criado por painel-agenda-modal.js seja exibido no mesmo frame do clique.
    queueMicrotask(guaranteeVisibleModal);
    requestAnimationFrame(guaranteeVisibleModal);
    window.setTimeout(guaranteeVisibleModal, 80);
  }, true);

  const stateObserver = new MutationObserver(records => {
    const relevant = records.some(record =>
      record.target === document.body ||
      record.target?.id === MODAL_ID ||
      record.addedNodes?.length
    );
    if (!relevant) return;

    if (document.body.classList.contains(BODY_LOCK_CLASS)) guaranteeVisibleModal();
    else clearForcedVisibility(modalElement());
  });

  stateObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'aria-hidden']
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') window.setTimeout(unlockOrphanedPage, 0);
  });

  window.addEventListener('pageshow', unlockOrphanedPage);
  window.addEventListener('pagehide', unlockOrphanedPage);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') unlockOrphanedPage();
  });
}
