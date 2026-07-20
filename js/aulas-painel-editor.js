const liveList = document.querySelector('#live-students-list');
const sessionModal = document.querySelector('#live-session-modal');
const modalActions = document.querySelector('#live-session-modal-actions');
const editorModal = document.querySelector('#live-workout-editor-modal');
const editorFrame = document.querySelector('#live-workout-editor-frame');
const editorClose = document.querySelector('#live-workout-editor-close');

let currentSessionId = '';

function currentStudentId() {
  const recordLink = modalActions?.querySelector('a[href*="ficha-aluno.html?id="]');
  if (!recordLink) return '';
  try {
    const url = new URL(recordLink.href, window.location.origin);
    return url.searchParams.get('id') || '';
  } catch {
    return '';
  }
}

function injectEditButton() {
  if (!modalActions || modalActions.querySelector('[data-live-edit-workout]')) return;
  const studentId = currentStudentId();
  if (!studentId) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-outline btn-action-tile';
  button.dataset.liveEditWorkout = studentId;
  button.innerHTML = `
    <span class="btn-action-icon" aria-hidden="true">✎</span>
    <span class="btn-action-copy">
      <span class="btn-action-title">Editar treino</span>
      <span class="btn-action-description">Ajustar exercícios e dias</span>
    </span>`;
  modalActions.prepend(button);
}

function openEditor(studentId) {
  if (!editorModal || !editorFrame || !studentId) return;
  editorFrame.src = `treino-aluno.html?id=${encodeURIComponent(studentId)}&embed=1`;
  editorModal.classList.add('open');
  editorModal.setAttribute('aria-hidden', 'false');
}

function closeEditor() {
  if (!editorModal || !editorFrame) return;
  editorModal.classList.remove('open');
  editorModal.setAttribute('aria-hidden', 'true');
  editorFrame.src = 'about:blank';
}

liveList?.addEventListener('click', event => {
  const row = event.target.closest('[data-open-live-session]');
  if (!row) return;
  currentSessionId = row.dataset.openLiveSession || '';
  sessionModal?.setAttribute('data-current-session-id', currentSessionId);
  setTimeout(injectEditButton, 0);
});

modalActions?.addEventListener('click', event => {
  const button = event.target.closest('[data-live-edit-workout]');
  if (!button) return;
  openEditor(button.dataset.liveEditWorkout);
});

if (modalActions) {
  const observer = new MutationObserver(() => {
    if (sessionModal?.classList.contains('open')) injectEditButton();
  });
  observer.observe(modalActions, { childList: true });
}

editorClose?.addEventListener('click', closeEditor);
editorModal?.addEventListener('click', event => {
  if (event.target === editorModal) closeEditor();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && editorModal?.classList.contains('open')) {
    event.stopImmediatePropagation();
    closeEditor();
  }
}, true);

window.addEventListener('message', event => {
  if (event.origin !== location.origin) return;
  if (event.data?.type === 'fsfit-close-workout-modal' || event.data?.type === 'fsfit-workout-updated') {
    closeEditor();
  }
});