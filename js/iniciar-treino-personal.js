import { supabase } from './supabase.js';

const alunoId = new URLSearchParams(window.location.search).get('id');
const actionHost = document.querySelector('.student-preview-action');
const previewLink = document.querySelector('#student-preview-link');
const profileActions = document.querySelector('.profile-card .actions');
const deleteStudentButton = document.querySelector('#delete-student');
const message = document.querySelector('#record-message');

if (!alunoId || !actionHost) throw new Error('Aluno não informado para iniciar treino.');

const style = document.createElement('style');
style.textContent = `
  .student-preview-action{display:grid;grid-template-columns:1fr;gap:10px}
  .student-preview-action .btn{width:100%;min-height:46px}
  .btn-workout-active{
    color:#171100;
    border-color:rgba(255,193,7,.78);
    background:linear-gradient(180deg,#ffd43b 0%,#f2b900 100%);
    box-shadow:0 10px 26px rgba(255,193,7,.18);
  }
  .btn-workout-active:hover{
    color:#171100;
    border-color:#ffd95a;
    background:linear-gradient(180deg,#ffdc52 0%,#f9c515 100%);
    box-shadow:0 12px 30px rgba(255,193,7,.24);
  }
`;
document.head.appendChild(style);

if (previewLink && profileActions) {
  previewLink.className = 'btn btn-outline';
  if (deleteStudentButton) profileActions.insertBefore(previewLink, deleteStudentButton);
  else profileActions.appendChild(previewLink);
}

const startButton = document.createElement('button');
startButton.id = 'start-workout-personal';
startButton.className = 'btn btn-primary';
startButton.type = 'button';
startButton.textContent = '▶ Iniciar treino';
actionHost.prepend(startButton);

let currentSessionId = null;
let currentStatus = null;
let loading = false;
let stateChecked = false;

function setupRecordSwipeNavigation() {
  const container = document.querySelector('.student-record-container');
  const tabs = [...document.querySelectorAll('[data-record-tab]')];
  if (!container || tabs.length < 2 || container.dataset.recordSwipeBound === '1') return;

  container.dataset.recordSwipeBound = '1';
  const blockedSelector = [
    'input',
    'textarea',
    'select',
    'button',
    'a',
    'label',
    'video',
    'iframe',
    '[contenteditable="true"]',
    '.record-tabs',
    '.table-wrap',
    '.student-media-grid'
  ].join(',');

  let startX = 0;
  let startY = 0;
  let startedAt = 0;
  let tracking = false;

  const reset = () => {
    tracking = false;
    startX = 0;
    startY = 0;
    startedAt = 0;
  };

  container.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) return reset();

    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(blockedSelector)) return reset();

    const touch = event.touches[0];
    const edgeGuard = 24;
    if (touch.clientX <= edgeGuard || touch.clientX >= window.innerWidth - edgeGuard) return reset();

    startX = touch.clientX;
    startY = touch.clientY;
    startedAt = Date.now();
    tracking = true;
  }, { passive: true });

  container.addEventListener('touchend', event => {
    if (!tracking) return;

    const touch = event.changedTouches?.[0];
    if (!touch) return reset();

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    const elapsed = Date.now() - startedAt;
    reset();

    const horizontalDistance = Math.abs(deltaX);
    const verticalDistance = Math.abs(deltaY);
    if (elapsed > 900 || horizontalDistance < 58 || horizontalDistance <= verticalDistance * 1.2) return;

    const currentIndex = tabs.findIndex(tab => tab.classList.contains('active'));
    if (currentIndex < 0) return;

    const nextIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1;
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;

    nextTab.click();
    nextTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, { passive: true });

  container.addEventListener('touchcancel', reset, { passive: true });
}

setupRecordSwipeNavigation();

function showLocalMessage(text, type = 'success') {
  if (!message) return;
  message.textContent = text;
  message.className = `message show ${type}`;
}

function applyState(status, sessionId = null) {
  currentStatus = status || null;
  currentSessionId = sessionId || null;

  if (status === 'em_aula') {
    startButton.textContent = 'Treino em andamento';
    startButton.className = 'btn btn-workout-active';
    startButton.title = 'Abrir acompanhamento ao vivo no painel';
    return;
  }

  startButton.className = 'btn btn-primary';
  startButton.title = '';
  startButton.textContent = status === 'aguardando_confirmacao'
    ? '▶ Iniciar treino agora'
    : '▶ Iniciar treino';
}

async function refreshSessionState() {
  if (stateChecked) return;
  stateChecked = true;

  const { data, error } = await supabase.rpc('listar_sessoes_em_aula_personal');
  if (error) {
    stateChecked = false;
    console.warn('Não foi possível consultar o estado da sessão:', error);
    return;
  }

  const row = (data || []).find(item => String(item.aluno_id) === String(alunoId));
  applyState(row?.status || null, row?.sessao_id || null);
}

startButton.addEventListener('click', async () => {
  if (loading) return;

  if (!stateChecked) {
    await refreshSessionState();
  }

  if (currentStatus === 'em_aula') {
    window.location.href = 'painel.html#live-students-list';
    return;
  }

  const studentName = document.querySelector('#student-name')?.textContent?.trim() || 'este aluno';
  const prompt = currentStatus === 'aguardando_confirmacao'
    ? `Há um check-in aguardando confirmação para ${studentName}. Iniciar o treino agora?`
    : `Iniciar o treino de ${studentName} agora, sem aguardar check-in?`;

  if (!window.confirm(prompt)) return;

  loading = true;
  const originalText = startButton.textContent;
  startButton.disabled = true;
  startButton.textContent = 'Iniciando...';

  try {
    const { data, error } = await supabase.rpc('iniciar_sessao_personal_sem_checkin', {
      p_aluno_id: alunoId
    });
    if (error) throw error;
    if (!data) throw new Error('Não foi possível iniciar a sessão de treino.');

    applyState('em_aula', data);
    stateChecked = true;
    showLocalMessage(`Treino de ${studentName} iniciado. O aluno já aparece em “Em aula” no painel.`);
  } catch (error) {
    console.error(error);
    applyState(currentStatus, currentSessionId);
    showLocalMessage(error.message || 'Não foi possível iniciar o treino.', 'error');
  } finally {
    loading = false;
    startButton.disabled = false;
    if (startButton.textContent === 'Iniciando...') startButton.textContent = originalText;
  }
});