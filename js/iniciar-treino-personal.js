import { supabase } from './supabase.js';

const alunoId = new URLSearchParams(window.location.search).get('id');
const actionHost = document.querySelector('.student-preview-action');
const previewLink = document.querySelector('#student-preview-link');
const message = document.querySelector('#record-message');

if (!alunoId || !actionHost) throw new Error('Aluno não informado para iniciar treino.');

const style = document.createElement('style');
style.textContent = `
  .student-preview-action{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .student-preview-action .btn{min-height:46px}
  @media(max-width:640px){.student-preview-action{grid-template-columns:1fr}}
`;
document.head.appendChild(style);

previewLink?.classList.remove('btn-primary');
previewLink?.classList.add('btn-secondary');

const startButton = document.createElement('button');
startButton.id = 'start-workout-personal';
startButton.className = 'btn btn-primary';
startButton.type = 'button';
startButton.textContent = '▶ Iniciar treino';
actionHost.prepend(startButton);

let currentSessionId = null;
let currentStatus = null;
let loading = false;

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
    startButton.className = 'btn btn-secondary';
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
  const { data, error } = await supabase.rpc('listar_sessoes_em_aula_personal');
  if (error) {
    console.warn('Não foi possível consultar o estado da sessão:', error);
    return;
  }

  const row = (data || []).find(item => String(item.aluno_id) === String(alunoId));
  applyState(row?.status || null, row?.sessao_id || null);
}

startButton.addEventListener('click', async () => {
  if (loading) return;

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

await refreshSessionState();
