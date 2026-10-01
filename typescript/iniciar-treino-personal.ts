// @ts-ignore Existing browser JavaScript module.
import { supabase } from './supabase.js';

type SessionRow = { aluno_id?: string | number | null; status?: string | null; sessao_id?: string | null };
type MessageType = 'success' | 'error';

const alunoId = new URLSearchParams(window.location.search).get('id');
const actionHost = document.querySelector<HTMLElement>('.student-preview-action');
const previewLink = document.querySelector<HTMLAnchorElement>('#student-preview-link');
const profileActions = document.querySelector<HTMLElement>('.profile-card .actions');
const deleteStudentButton = document.querySelector<HTMLElement>('#delete-student');
const message = document.querySelector<HTMLElement>('#record-message');

if (!alunoId || !actionHost) throw new Error('Aluno não informado para iniciar treino.');

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

let currentSessionId: string | null = null;
let currentStatus: string | null = null;
let loading = false;
let stateChecked = false;

function setupRecordSwipeNavigation(): void {
  const container = document.querySelector<HTMLElement>('.student-record-container');
  const tabs = [...document.querySelectorAll<HTMLElement>('[data-record-tab]')];
  if (!container || tabs.length < 2 || container.dataset.recordSwipeBound === '1') return;

  container.dataset.recordSwipeBound = '1';
  const blockedSelector = [
    'input', 'textarea', 'select', 'button', 'a', 'label', 'video', 'iframe',
    '[contenteditable="true"]', '.record-tabs', '.table-wrap', '.student-media-grid'
  ].join(',');

  let startX = 0;
  let startY = 0;
  let startedAt = 0;
  let tracking = false;

  const reset = (): void => {
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

function showLocalMessage(text: string, type: MessageType = 'success'): void {
  if (!message) return;
  message.textContent = text;
  message.className = `message show ${type}`;
}

function applyState(status: string | null, sessionId: string | null = null): void {
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

async function refreshSessionState(): Promise<void> {
  if (stateChecked) return;
  stateChecked = true;

  const { data, error } = await supabase.rpc('listar_sessoes_em_aula_personal');
  if (error) {
    stateChecked = false;
    console.warn('Não foi possível consultar o estado da sessão:', error);
    return;
  }

  const rows = (Array.isArray(data) ? data : []) as SessionRow[];
  const row = rows.find(item => String(item.aluno_id) === String(alunoId));
  applyState(row?.status || null, row?.sessao_id || null);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

startButton.addEventListener('click', async () => {
  if (loading) return;

  if (!stateChecked) await refreshSessionState();

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

    applyState('em_aula', String(data));
    stateChecked = true;
    showLocalMessage(`Treino de ${studentName} iniciado. O aluno já aparece em “Em aula” no painel.`);
  } catch (error) {
    console.error(error);
    applyState(currentStatus, currentSessionId);
    showLocalMessage(errorMessage(error, 'Não foi possível iniciar o treino.'), 'error');
  } finally {
    loading = false;
    startButton.disabled = false;
    if (startButton.textContent === 'Iniciando...') startButton.textContent = originalText;
  }
});
