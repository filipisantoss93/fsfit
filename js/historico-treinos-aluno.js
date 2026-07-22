import { supabase } from './supabase.js';

const alunoId = new URLSearchParams(location.search).get('id');
const list = document.querySelector('#workout-history-list');
const summary = document.querySelector('#workout-history-summary');
const historyTab = document.querySelector('[data-record-tab="history"]');

let historyLoaded = false;
let historyLoadingPromise = null;

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

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