import './ficha-aluno.js?v=20260726-ux2';
import './historico-treinos-aluno.js?v=20260726-ux2';
import { supabase } from './supabase.js';
import { requireSession, showMessage } from './layout.js';

const RUNTIME_KEY = '__FSFIT_FICHA_ALUNO_RUNTIME__';

if (!globalThis[RUNTIME_KEY]) {
  globalThis[RUNTIME_KEY] = true;

  const deleteButton = document.querySelector('#delete-student');
  const editButton = document.querySelector('#edit-registration');
  const previewButton = document.querySelector('#student-preview-link');
  const editModal = document.querySelector('#student-edit-modal');
  const editFrame = document.querySelector('#student-edit-frame');
  const editClose = document.querySelector('#student-edit-close');
  const recordMessage = document.querySelector('#record-message');
  const alunoId = new URLSearchParams(location.search).get('id');

  if (previewButton && alunoId) {
    previewButton.href = `visualizar-aluno.html?id=${encodeURIComponent(alunoId)}`;
  }

  const openEditModal = () => {
    if (!alunoId || !editFrame || !editModal) return;
    editFrame.src = `alunos.html?editar=${encodeURIComponent(alunoId)}&embed=1`;
    editModal.classList.add('open');
    editModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('student-edit-open');
  };

  const closeEditModal = ({ reload = false } = {}) => {
    if (!editModal || !editFrame) return;
    editModal.classList.remove('open');
    editModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('student-edit-open');
    editFrame.src = 'about:blank';
    if (reload) location.reload();
  };

  editButton?.addEventListener('click', event => {
    event.preventDefault();
    openEditModal();
  });

  editClose?.addEventListener('click', () => closeEditModal());
  editModal?.addEventListener('click', event => {
    if (event.target === editModal) closeEditModal();
  });

  window.addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    if (event.data?.type === 'fsfit-close-student-modal') closeEditModal();
    if (event.data?.type === 'fsfit-student-updated') closeEditModal({ reload: true });
  });

  deleteButton?.addEventListener('click', async () => {
    const studentName = document.querySelector('#student-name')?.textContent?.trim() || 'este aluno';
    const confirmed = confirm(`Excluir ${studentName}? Todos os dados vinculados também serão removidos. Esta ação não pode ser desfeita.`);
    if (!confirmed) return;

    const session = await requireSession();
    if (!session || !alunoId) return;

    deleteButton.disabled = true;
    const { error } = await supabase
      .from('alunos')
      .delete()
      .eq('id', alunoId)
      .eq('personal_id', session.user.id);

    if (error) {
      deleteButton.disabled = false;
      showMessage(recordMessage, error.message || 'Não foi possível excluir o aluno.', 'error');
      return;
    }

    window.location.href = 'alunos.html';
  });
}
