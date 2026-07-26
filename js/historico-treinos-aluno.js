import { supabase } from './supabase.js';

const alunoId = new URLSearchParams(location.search).get('id');
const list = document.querySelector('#workout-history-list');
const summary = document.querySelector('#workout-history-summary');
const historyTab = document.querySelector('[data-record-tab="history"]');
const managementButton = document.querySelector('#delete-student');
const recordMessage = document.querySelector('#record-message');

let historyLoaded = false;
let historyLoadingPromise = null;
let studentStatus = '';

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function showManagementMessage(text, type = 'success') {
  if (!recordMessage) return;
  recordMessage.textContent = text;
  recordMessage.className = `message ${type}`;
}

async function syncStudentManagement() {
  if (!alunoId || !managementButton) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return;

  const { data, error } = await supabase
    .from('alunos')
    .select('status')
    .eq('id', alunoId)
    .eq('personal_id', session.user.id)
    .single();

  if (error) return;
  studentStatus = String(data.status || 'ativo');
  const ended = studentStatus === 'encerrado';
  managementButton.textContent = ended ? 'Reativar acompanhamento' : 'Encerrar acompanhamento';
  managementButton.classList.toggle('btn-danger', !ended);
  managementButton.classList.toggle('btn-outline', ended);
  managementButton.dataset.studentManagementReady = 'true';
}

managementButton?.addEventListener('click', async event => {
  if (!managementButton.dataset.studentManagementReady) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const studentName = document.querySelector('#student-name')?.textContent?.trim() || 'este aluno';
  const ended = studentStatus === 'encerrado';
  const confirmation = ended
    ? `Reativar o acompanhamento de ${studentName}? O acesso será liberado novamente, mas sessões antigas continuarão encerradas.`
    : `Encerrar o acompanhamento de ${studentName}? O histórico será preservado e o acesso do aluno será desativado.`;

  if (!confirm(confirmation)) return;

  managementButton.disabled = true;
  try {
    const rpc = ended ? 'fsfit_reativar_aluno' : 'fsfit_arquivar_aluno';
    const { error } = await supabase.rpc(rpc, { p_aluno_id: alunoId });
    if (error) throw error;

    studentStatus = ended ? 'ativo' : 'encerrado';
    const statusBadge = document.querySelector('#student-status');
    if (statusBadge) statusBadge.textContent = studentStatus.toUpperCase();
    managementButton.textContent = ended ? 'Encerrar acompanhamento' : 'Reativar acompanhamento';
    managementButton.classList.toggle('btn-danger', ended);
    managementButton.classList.toggle('btn-outline', !ended);
    showManagementMessage(ended ? 'Acompanhamento reativado com sucesso.' : 'Acompanhamento encerrado. Todo o histórico foi preservado.');
  } catch (error) {
    showManagementMessage(error.message || 'Não foi possível atualizar o acompanhamento.', 'error');
  } finally {
    managementButton.disabled = false;
  }
}, true);

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatDuration(start, end) {
  if (!start || !end) return '—';
  const minutes = Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest}min` : `${rest} min`;
}

async function loadWorkoutHistory() {
  if (!alunoId || !list || historyLoaded) return;
  if (historyLoadingPromise) return historyLoadingPromise;

  historyLoadingPromise = (async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user?.id) {
      if (summary) summary.textContent = 'Não foi possível carregar';
      list.innerHTML = '<p class="empty">Sessão indisponível. Atualize a página e tente novamente.</p>';
      return;
    }

    const { data, error } = await supabase
      .from('sessoes_treino')
      .select('id,treino_id,checkin_at,iniciado_at,finalizada_at,treinos(nome),sessao_exercicios(id,concluido)')
      .eq('aluno_id', alunoId)
      .eq('personal_id', session.user.id)
      .eq('status', 'finalizada')
      .order('finalizada_at', { ascending: false });

    if (error) {
      console.error('Erro ao carregar histórico de treinos:', error);
      if (summary) summary.textContent = 'Erro ao carregar';
      list.innerHTML = '<p class="empty">Não foi possível carregar o histórico de treinos.</p>';
      return;
    }

    const items = data || [];
    historyLoaded = true;
    if (summary) summary.textContent = `${items.length} ${items.length === 1 ? 'treino finalizado' : 'treinos finalizados'}`;

    if (!items.length) {
      list.innerHTML = '<p class="empty">Nenhum treino finalizado registrado para este aluno.</p>';
      return;
    }

    list.innerHTML = items.map(item => {
      const exercises = item.sessao_exercicios || [];
      const total = exercises.length;
      const completed = exercises.filter(exercise => exercise.concluido).length;
      const percent = total ? Math.round((completed / total) * 100) : 0;
      const workoutName = item.treinos?.nome || 'Plano de treino';

      return `<article class="workout-history-item">
        <div class="workout-history-head">
          <div>
            <small>${esc(formatDateTime(item.finalizada_at || item.iniciado_at || item.checkin_at))}</small>
            <h3>${esc(workoutName)}</h3>
          </div>
          <span class="workout-history-status">FINALIZADO</span>
        </div>
        <div class="workout-history-metrics">
          <div><span>Duração</span><strong>${esc(formatDuration(item.iniciado_at, item.finalizada_at))}</strong></div>
          <div><span>Exercícios</span><strong>${completed}/${total}</strong></div>
          <div><span>Conclusão</span><strong>${percent}%</strong></div>
        </div>
        <div class="workout-history-progress" aria-label="${percent}% concluído"><span style="width:${percent}%"></span></div>
        <div class="workout-history-times">
          <span>Início: ${esc(formatDateTime(item.iniciado_at || item.checkin_at))}</span>
          <span>Fim: ${esc(formatDateTime(item.finalizada_at))}</span>
        </div>
      </article>`;
    }).join('');
  })();

  try {
    await historyLoadingPromise;
  } finally {
    historyLoadingPromise = null;
  }
}

if (alunoId && list) {
  historyTab?.addEventListener('click', () => {
    void loadWorkoutHistory();
  });

  if (location.hash === '#history') {
    void loadWorkoutHistory();
  }
}

void syncStudentManagement();
