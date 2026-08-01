import { supabase } from './supabase.js';
import { showMessage } from './layout.js';

const message = document.querySelector('#student-message');
const statusById = new Map();

async function loadStatuses() {
  const { data, error } = await supabase
    .from('alunos')
    .select('id,status')
    .order('nome');

  if (error) {
    console.warn('Não foi possível carregar o status dos alunos:', error);
    return;
  }

  statusById.clear();
  for (const student of data || []) statusById.set(student.id, student.status);
  syncButtons();
}

function syncButtons() {
  document.querySelectorAll('[data-delete]').forEach(button => {
    const id = button.dataset.delete;
    const archived = statusById.get(id) === 'encerrado';
    button.dataset.studentArchiveAction = archived ? 'reactivate' : 'archive';
    button.textContent = archived ? 'Reativar aluno' : 'Encerrar aluno';
    button.classList.toggle('btn-danger', !archived);
    button.classList.toggle('btn-outline', archived);
    button.setAttribute('aria-label', archived ? 'Reativar aluno' : 'Encerrar aluno');
  });
}

const list = document.querySelector('#students-list');
if (list) new MutationObserver(syncButtons).observe(list, { childList: true, subtree: true });

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-delete]');
  if (!button) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const id = button.dataset.delete;
  const name = button.dataset.name || 'este aluno';
  const action = button.dataset.studentArchiveAction === 'reactivate' ? 'reactivate' : 'archive';
  const confirmation = action === 'reactivate'
    ? `Reativar ${name}? O aluno precisará entrar novamente no portal.`
    : `Encerrar o acompanhamento de ${name}? O histórico será preservado e o acesso ao portal será desativado.`;

  if (!window.confirm(confirmation)) return;

  button.disabled = true;
  try {
    const rpc = action === 'reactivate' ? 'fsfit_reativar_aluno' : 'fsfit_arquivar_aluno';
    const { error } = await supabase.rpc(rpc, { p_aluno_id: id });
    if (error) throw error;

    const status = action === 'reactivate' ? 'ativo' : 'encerrado';
    showMessage(
      message,
      action === 'reactivate'
        ? `${name} foi reativado com sucesso.`
        : `${name} foi encerrado. Todo o histórico foi preservado.`
    );

    statusById.set(id, status);
    syncButtons();
    button.disabled = false;
    window.dispatchEvent(new CustomEvent('fsfit:student-status-updated', {
      detail: { alunoId: id, status, action }
    }));
  } catch (error) {
    console.error(error);
    showMessage(message, error.message || 'Não foi possível concluir a ação.', 'error');
    button.disabled = false;
  }
}, true);

await loadStatuses();
