import { supabase } from './supabase.js';

const container = document.querySelector('#live-students-list');
const badge = document.querySelector('#live-students-count');
const modal = document.querySelector('#live-session-modal');
const modalClose = document.querySelector('#live-session-modal-close');
const modalName = document.querySelector('#live-session-modal-name');
const modalMeta = document.querySelector('#live-session-modal-meta');
const modalProgress = document.querySelector('#live-session-modal-progress');
const chatThread = document.querySelector('#live-session-chat-thread');
const chatForm = document.querySelector('#live-session-chat-form');
const chatInput = chatForm?.querySelector('textarea[name="mensagem"]');
const chatSubmit = chatForm?.querySelector('button[type="submit"]');
const modalActions = document.querySelector('#live-session-modal-actions');

if (!container) throw new Error('Área Em aula não encontrada');

let loadingLiveStudents = false;
let rowsById = new Map();
let currentSessionId = null;
let chatLoading = false;

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function elapsed(value) {
  if (!value) return '0 min';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

function formatTime(value) {
  return value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
}

function sessionMeta(row) {
  const status = row.status === 'aguardando_confirmacao'
    ? `check-in há ${elapsed(row.checkin_at)}`
    : `em aula há ${elapsed(row.iniciado_at || row.checkin_at)}`;
  return `${row.treino_nome || 'Treino'} • ${status}`;
}

function progressText(row) {
  const total = Number(row.total_exercicios || 0);
  const done = Number(row.exercicios_concluidos || 0);
  return `${done}/${total} concluídos`;
}

function progressPercent(row) {
  const total = Number(row.total_exercicios || 0);
  const done = Number(row.exercicios_concluidos || 0);
  return total ? Math.min(100, Math.round((done / total) * 100)) : 0;
}

async function notifyAluno(sessionId) {
  const { error } = await supabase.functions.invoke('chat-push', {
    body: { action: 'notify_from_personal', session_id: sessionId }
  });
  if (error) console.error('Falha ao notificar aluno:', error);
}

function renderModalActions(row) {
  if (!modalActions) return;

  if (row.status === 'aguardando_confirmacao') {
    modalActions.innerHTML = `
      <button class="btn btn-primary btn-action-tile" type="button" data-modal-confirm-session="${esc(row.sessao_id)}">
        <span class="btn-action-icon" aria-hidden="true">✓</span>
        <span class="btn-action-copy"><span class="btn-action-title">Confirmar início</span><span class="btn-action-description">Liberar o aluno para começar a aula</span></span>
      </button>
      <button class="btn btn-danger btn-action-tile" type="button" data-modal-cancel-checkin="${esc(row.sessao_id)}">
        <span class="btn-action-icon" aria-hidden="true">×</span>
        <span class="btn-action-copy"><span class="btn-action-title">Cancelar check-in</span><span class="btn-action-description">Remover esta solicitação de início</span></span>
      </button>
      <a class="btn btn-outline btn-action-tile" href="ficha-aluno.html?id=${encodeURIComponent(row.aluno_id)}&origem=aula">
        <span class="btn-action-icon" aria-hidden="true">▣</span>
        <span class="btn-action-copy"><span class="btn-action-title">Abrir ficha</span><span class="btn-action-description">Ver dados e histórico</span></span>
      </a>
      <button class="btn btn-neutral btn-action-tile" type="button" data-modal-close-session>
        <span class="btn-action-icon" aria-hidden="true">×</span>
        <span class="btn-action-copy"><span class="btn-action-title">Fechar</span><span class="btn-action-description">Voltar sem realizar alterações</span></span>
      </button>`;
    return;
  }

  modalActions.innerHTML = `
    <a class="btn btn-outline btn-action-tile" href="ficha-aluno.html?id=${encodeURIComponent(row.aluno_id)}&origem=aula">
      <span class="btn-action-icon" aria-hidden="true">▣</span>
      <span class="btn-action-copy"><span class="btn-action-title">Abrir ficha</span><span class="btn-action-description">Ver dados e histórico</span></span>
    </a>
    <button class="btn btn-danger btn-action-tile" type="button" data-modal-finish-session="${esc(row.sessao_id)}">
      <span class="btn-action-icon" aria-hidden="true">■</span>
      <span class="btn-action-copy"><span class="btn-action-title">Encerrar treino</span><span class="btn-action-description">Finalizar esta sessão do aluno</span></span>
    </button>
    <button class="btn btn-neutral btn-action-tile" type="button" data-modal-close-session>
      <span class="btn-action-icon" aria-hidden="true">×</span>
      <span class="btn-action-copy"><span class="btn-action-title">Fechar</span><span class="btn-action-description">Voltar sem realizar alterações</span></span>
    </button>`;
}

function setChatAvailability(active) {
  if (!chatForm || !chatInput || !chatSubmit) return;
  chatInput.disabled = !active;
  chatSubmit.disabled = !active;
  chatForm.classList.toggle('hidden', !active);
}

async function loadChat(sessionId) {
  if (!chatThread || chatLoading || currentSessionId !== sessionId) return;
  const row = rowsById.get(sessionId);
  if (!row || row.status !== 'em_aula') {
    setChatAvailability(false);
    chatThread.innerHTML = '<p class="empty">O chat fica disponível após o início da aula.</p>';
    return;
  }

  chatLoading = true;
  try {
    setChatAvailability(true);
    const { data: messages, error } = await supabase
      .from('sessao_mensagens')
      .select('id,autor_tipo,mensagem,created_at')
      .eq('sessao_id', sessionId)
      .order('created_at');

    if (error) throw error;
    if (currentSessionId !== sessionId) return;

    const wasNearBottom = chatThread.scrollHeight - chatThread.scrollTop - chatThread.clientHeight < 80;
    chatThread.innerHTML = (messages || []).length
      ? messages.map(message => `
          <div class="live-chat-message ${message.autor_tipo === 'personal' ? 'mine' : ''}">
            <small>${message.autor_tipo === 'personal' ? 'Você' : 'Aluno'} · ${formatTime(message.created_at)}</small>
            <p>${esc(message.mensagem)}</p>
          </div>`).join('')
      : '<p class="empty">Nenhuma mensagem ainda.</p>';

    if (wasNearBottom || !chatThread.dataset.loaded) chatThread.scrollTop = chatThread.scrollHeight;
    chatThread.dataset.loaded = '1';
  } catch (error) {
    console.error(error);
    if (currentSessionId === sessionId) chatThread.innerHTML = '<p class="empty">Não foi possível carregar o chat.</p>';
  } finally {
    chatLoading = false;
  }
}

function openModal(sessionId) {
  const row = rowsById.get(sessionId);
  if (!row || !modal) return;

  currentSessionId = sessionId;
  modalName.textContent = row.aluno_nome || 'Aluno';
  modalMeta.textContent = sessionMeta(row);
  modalProgress.textContent = progressText(row);
  renderModalActions(row);

  if (chatThread) {
    delete chatThread.dataset.loaded;
    chatThread.innerHTML = row.status === 'em_aula'
      ? '<p class="empty">Carregando chat...</p>'
      : '<p class="empty">O chat fica disponível após o início da aula.</p>';
  }
  setChatAvailability(row.status === 'em_aula');

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('live-session-modal-open');

  if (row.status === 'em_aula') loadChat(sessionId).catch(console.error);
}

function closeModal() {
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('live-session-modal-open');
  currentSessionId = null;
  if (chatThread) {
    chatThread.innerHTML = '';
    delete chatThread.dataset.loaded;
  }
  chatForm?.reset();
}

async function confirmStart(sessionId, button) {
  if (!confirm('Confirmar o início desta aula?')) return;
  button.disabled = true;
  try {
    const { data, error } = await supabase.rpc('confirmar_inicio_sessao_personal', { p_sessao_id: sessionId });
    if (error || data !== true) throw error || new Error('Sessão não confirmada');
    await loadLiveStudents();
    openModal(sessionId);
  } catch (error) {
    console.error(error);
    alert('Não foi possível confirmar o início da aula.');
    button.disabled = false;
  }
}

async function cancelCheckin(sessionId, studentName, button) {
  if (!confirm(`Cancelar o check-in de ${studentName}?\n\nO aluno precisará fazer um novo check-in para solicitar o início da aula.`)) return;
  button.disabled = true;
  const originalHtml = button.innerHTML;
  button.textContent = 'Cancelando...';

  try {
    const { data, error } = await supabase.rpc('cancelar_checkin_personal', { p_sessao_id: sessionId });
    if (error) throw error;
    if (data !== true) throw new Error('O check-in não está mais aguardando confirmação ou não pertence a este personal.');
    closeModal();
    await loadLiveStudents();
  } catch (error) {
    console.error(error);
    alert(error.message || 'Não foi possível cancelar o check-in.');
    button.disabled = false;
    button.innerHTML = originalHtml;
  }
}

async function finishSession(sessionId, studentName, button) {
  if (!confirm(`Encerrar o treino de ${studentName}?\n\nUse esta opção quando o aluno esquecer de finalizar o treino. A sessão será marcada como finalizada.`)) return;
  button.disabled = true;
  const originalHtml = button.innerHTML;
  button.textContent = 'Encerrando...';

  try {
    const { data, error } = await supabase.rpc('finalizar_sessao_personal', { p_sessao_id: sessionId });
    if (error) throw error;
    if (data !== true) throw new Error('A sessão não está mais em andamento ou não pertence a este personal.');
    closeModal();
    await loadLiveStudents();
  } catch (error) {
    console.error(error);
    alert(error.message || 'Não foi possível encerrar o treino.');
    button.disabled = false;
    button.innerHTML = originalHtml;
  }
}

async function sendMessage(event) {
  event.preventDefault();
  if (!currentSessionId || !chatInput || !chatSubmit) return;
  const message = chatInput.value.trim();
  if (!message) return;

  chatSubmit.disabled = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sessão inválida');

    const { error } = await supabase.from('sessao_mensagens').insert({
      sessao_id: currentSessionId,
      autor_tipo: 'personal',
      autor_id: session.user.id,
      mensagem: message
    });
    if (error) throw error;

    await notifyAluno(currentSessionId);
    chatForm.reset();
    await loadChat(currentSessionId);
  } catch (error) {
    console.error(error);
    alert('Não foi possível enviar a mensagem.');
  } finally {
    chatSubmit.disabled = false;
  }
}

function renderRows(rows) {
  if (badge) badge.textContent = String(rows.length);

  container.innerHTML = rows.length ? rows.map(row => {
    const pending = row.status === 'aguardando_confirmacao';
    const percent = progressPercent(row);
    return `
      <button class="live-student-row ${pending ? 'pending' : ''}" type="button" data-open-live-session="${esc(row.sessao_id)}">
        <div class="live-student-main">
          <span class="live-dot"></span>
          <div>
            <strong>${esc(row.aluno_nome)}</strong>
            <small>${esc(sessionMeta(row))}</small>
          </div>
        </div>
        <div class="live-student-progress">
          <span>${esc(progressText(row))}</span>
          <div class="live-progress" aria-label="${percent}% concluído"><span style="width:${percent}%"></span></div>
        </div>
        <span class="live-student-arrow" aria-hidden="true">›</span>
      </button>`;
  }).join('') : '<p class="empty">Nenhum aluno aguardando confirmação ou em aula neste momento.</p>';
}

async function loadLiveStudents() {
  if (loadingLiveStudents) return;
  loadingLiveStudents = true;

  try {
    const { data, error } = await supabase.rpc('listar_sessoes_em_aula_personal');
    if (error) {
      console.error(error);
      if (!container.querySelector('.live-student-row')) container.innerHTML = '<p class="empty">Não foi possível carregar os alunos em aula.</p>';
      return;
    }

    const rows = data || [];
    rowsById = new Map(rows.map(row => [row.sessao_id, row]));
    renderRows(rows);

    if (currentSessionId) {
      const currentRow = rowsById.get(currentSessionId);
      if (!currentRow) {
        closeModal();
      } else if (modal?.classList.contains('open')) {
        modalName.textContent = currentRow.aluno_nome || 'Aluno';
        modalMeta.textContent = sessionMeta(currentRow);
        modalProgress.textContent = progressText(currentRow);
        renderModalActions(currentRow);
        setChatAvailability(currentRow.status === 'em_aula');
      }
    }
  } finally {
    loadingLiveStudents = false;
  }
}

container.addEventListener('click', event => {
  const row = event.target.closest('[data-open-live-session]');
  if (!row) return;
  openModal(row.dataset.openLiveSession);
});

modalClose?.addEventListener('click', closeModal);
modal?.addEventListener('click', event => {
  if (event.target === modal) closeModal();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && modal?.classList.contains('open')) closeModal();
});

modalActions?.addEventListener('click', event => {
  const closeButton = event.target.closest('[data-modal-close-session]');
  if (closeButton) return closeModal();

  const confirmButton = event.target.closest('[data-modal-confirm-session]');
  if (confirmButton) return confirmStart(confirmButton.dataset.modalConfirmSession, confirmButton);

  const cancelButton = event.target.closest('[data-modal-cancel-checkin]');
  if (cancelButton) {
    const row = rowsById.get(cancelButton.dataset.modalCancelCheckin);
    return cancelCheckin(cancelButton.dataset.modalCancelCheckin, row?.aluno_nome || 'este aluno', cancelButton);
  }

  const finishButton = event.target.closest('[data-modal-finish-session]');
  if (finishButton) {
    const row = rowsById.get(finishButton.dataset.modalFinishSession);
    return finishSession(finishButton.dataset.modalFinishSession, row?.aluno_nome || 'este aluno', finishButton);
  }
});

chatForm?.addEventListener('submit', event => sendMessage(event).catch(console.error));

await loadLiveStudents();