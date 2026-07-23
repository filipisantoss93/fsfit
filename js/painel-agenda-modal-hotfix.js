const PANEL_PAGE = (window.location.pathname.split('/').pop() || '') === 'painel.html';

if (PANEL_PAGE) {
  const BODY_LOCK_CLASS = 'today-workout-dashboard-open';
  const MODAL_ID = 'today-workout-dashboard-modal';
  const LEGACY_FORCED_PROPERTIES = ['display', 'visibility', 'opacity', 'pointer-events', 'z-index'];
  let activeStudentId = '';

  function modalElement() {
    return document.getElementById(MODAL_ID);
  }

  function studentIdFromRow(row) {
    if (!row) return '';
    if (row.dataset?.studentId) return row.dataset.studentId;
    const href = row.getAttribute?.('href') || '';
    if (!href) return '';
    try {
      return new URL(href, location.href).searchParams.get('id') || '';
    } catch {
      return '';
    }
  }

  function rememberStudent(row) {
    const studentId = studentIdFromRow(row);
    if (studentId) activeStudentId = studentId;
  }

  function ensureRowFallback(row) {
    if (!row || row.tagName !== 'A' || row.hasAttribute('href')) return;
    const studentId = studentIdFromRow(row);
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

  function openWorkoutEditor(studentId) {
    const editorModal = document.querySelector('#live-workout-editor-modal');
    const editorFrame = document.querySelector('#live-workout-editor-frame');
    if (!studentId || !editorModal || !editorFrame) return false;

    const todayModal = modalElement();
    todayModal?.classList.remove('open');
    todayModal?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove(BODY_LOCK_CLASS);
    clearLegacyForcedStyles(todayModal);

    editorFrame.src = `treino-aluno.html?id=${encodeURIComponent(studentId)}&embed=1`;
    editorModal.classList.add('open');
    editorModal.setAttribute('aria-hidden', 'false');
    return true;
  }

  // Corrige o fluxo do botão "Editar treino". O módulo principal fechava o dashboard
  // antes de ler currentEntry.studentId; closeDashboard() zera currentEntry e o acesso
  // seguinte gerava erro. Interceptamos o clique em capture, preservamos o aluno ativo
  // e abrimos o editor com o id correto.
  document.addEventListener('click', event => {
    const editButton = event.target.closest?.('#today-workout-edit');
    if (editButton && activeStudentId && openWorkoutEditor(activeStudentId)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }

    const row = event.target.closest?.('#today-list .today-entry');
    if (row && !row.classList.contains('locked') && !row.classList.contains('is-in-class')) {
      rememberStudent(row);
      ensureRowFallback(row);
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      const row = event.target.closest?.('#today-list .today-entry');
      if (row && !row.classList.contains('locked') && !row.classList.contains('is-in-class')) {
        rememberStudent(row);
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
