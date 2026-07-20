import { supabase } from './supabase.js';

const liveList = document.querySelector('#live-students-list');
const sessionModal = document.querySelector('#live-session-modal');
const modalBody = sessionModal?.querySelector('.live-session-modal-body');
const modalActions = document.querySelector('#live-session-modal-actions');
const progressLabel = sessionModal?.querySelector('.live-session-progress-label');
const chatTitle = sessionModal?.querySelector('.live-session-chat-title');
const chatThread = document.querySelector('#live-session-chat-thread');
const chatForm = document.querySelector('#live-session-chat-form');
const editorModal = document.querySelector('#live-workout-editor-modal');
const editorFrame = document.querySelector('#live-workout-editor-frame');
const editorClose = document.querySelector('#live-workout-editor-close');

let currentSessionId = '';
let currentStudent = '';
let workoutsRequest = 0;

const DAY_NAMES = {
  0: 'Domingo',
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
  7: 'Domingo'
};

function escapeHtml(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function formatDate(value) {
  if (!value) return '';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : '';
}

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

function injectStyles() {
  if (document.querySelector('#live-session-tabs-styles')) return;
  const style = document.createElement('style');
  style.id = 'live-session-tabs-styles';
  style.textContent = `
    .live-session-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:0 0 16px;padding:5px;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,.025)}
    .live-session-tab{min-height:40px;border:0;border-radius:7px;background:transparent;color:var(--muted);font-size:.82rem;font-weight:850;cursor:pointer;transition:.18s ease}
    .live-session-tab:hover{color:var(--text);background:rgba(255,255,255,.035)}
    .live-session-tab.active{color:var(--text);background:var(--surface-light);box-shadow:inset 0 0 0 1px rgba(255,255,255,.045)}
    .live-session-tab-panel{display:none}
    .live-session-tab-panel.active{display:block}
    .live-session-workouts-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin:0 0 12px}
    .live-session-workouts-heading small{display:block;margin-bottom:3px;color:var(--primary);font-size:.68rem;font-weight:850;letter-spacing:.08em}
    .live-session-workouts-heading strong{display:block;font-size:1rem}
    .live-session-workouts-heading p{margin:4px 0 0;color:var(--muted);font-size:.76rem}
    .live-session-workouts-list{display:grid;gap:10px;margin:0 0 14px}
    .live-session-workout-card{display:block;padding:12px 13px;border:1px solid var(--border);border-radius:9px;background:rgba(255,255,255,.025)}
    .live-session-workout-main{min-width:0}
    .live-session-workout-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
    .live-session-workout-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .live-session-workout-title strong{font-size:.9rem}
    .live-session-workout-badge{display:inline-flex;align-items:center;min-height:22px;padding:0 7px;border:1px solid rgba(50,215,75,.3);border-radius:999px;background:rgba(50,215,75,.09);color:var(--primary);font-size:.6rem;font-weight:900;letter-spacing:.05em}
    .live-session-workout-meta{display:block;margin-top:5px;color:var(--muted);font-size:.72rem;line-height:1.4}
    .live-session-workout-period{display:block;margin-top:2px;color:#8d96a3;font-size:.68rem}
    .live-session-workout-count{flex:0 0 auto;color:var(--muted);font-size:.68rem;font-weight:800;white-space:nowrap}
    .live-session-workout-exercises{display:grid;gap:10px;margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07)}
    .live-session-workout-day{display:grid;gap:6px}
    .live-session-workout-day-title{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--muted);font-size:.66rem;font-weight:850;letter-spacing:.045em;text-transform:uppercase}
    .live-session-exercise-list{display:grid;gap:5px}
    .live-session-exercise-row{display:grid;grid-template-columns:26px minmax(0,1fr);gap:9px;align-items:start;padding:8px 9px;border:1px solid rgba(255,255,255,.07);border-radius:7px;background:rgba(255,255,255,.02)}
    .live-session-exercise-order{display:grid;place-items:center;width:26px;height:26px;border-radius:7px;background:rgba(59,130,246,.1);color:var(--secondary);font-size:.68rem;font-weight:900}
    .live-session-exercise-copy{min-width:0}
    .live-session-exercise-copy strong{display:block;font-size:.78rem;line-height:1.3}
    .live-session-exercise-copy span{display:block;margin-top:2px;color:var(--muted);font-size:.67rem;line-height:1.35}
    .live-session-exercise-empty{padding:10px;border:1px dashed rgba(255,255,255,.1);border-radius:7px;color:var(--muted);font-size:.72rem;text-align:center}
    .live-session-workout-empty{padding:18px 14px;border:1px dashed var(--border);border-radius:9px;color:var(--muted);font-size:.8rem;text-align:center}
    .live-session-edit-workout{width:100%;margin-bottom:4px}
    .live-session-tab-panel[data-live-tab-panel="chat"] .live-session-chat-title{margin-top:2px}
    @media(max-width:720px){
      .live-session-tabs{position:sticky;top:0;z-index:3;background:#151a1f}
      .live-session-workouts-heading{align-items:center}
      .live-session-workout-card{padding:11px 12px}
      .live-session-tab-panel[data-live-tab-panel="chat"] .live-chat-thread{max-height:45dvh}
    }
  `;
  document.head.appendChild(style);
}

function ensureTabbedLayout() {
  if (!modalBody || document.querySelector('#live-session-tabs')) return;

  const tabs = document.createElement('nav');
  tabs.id = 'live-session-tabs';
  tabs.className = 'live-session-tabs';
  tabs.setAttribute('aria-label', 'Acompanhamento do aluno');
  tabs.innerHTML = `
    <button class="live-session-tab active" type="button" data-live-tab="workouts" aria-selected="true">Treinos</button>
    <button class="live-session-tab" type="button" data-live-tab="chat" aria-selected="false">Chat</button>`;

  const workoutsPanel = document.createElement('section');
  workoutsPanel.className = 'live-session-tab-panel active';
  workoutsPanel.dataset.liveTabPanel = 'workouts';
  workoutsPanel.innerHTML = `
    <div class="live-session-workouts-heading">
      <div><small>PLANEJAMENTO</small><strong>Treinos do aluno</strong><p>Veja planos, dias e exercícios e edite sem sair do acompanhamento.</p></div>
    </div>
    <div id="live-session-workouts-list" class="live-session-workouts-list"><div class="live-session-workout-empty">Carregando treinos...</div></div>
    <button id="live-session-edit-workout" class="btn btn-outline btn-action-tile live-session-edit-workout" type="button">
      <span class="btn-action-icon" aria-hidden="true">✎</span>
      <span class="btn-action-copy"><span class="btn-action-title">Editar treino</span><span class="btn-action-description">Ajustar planos, dias e exercícios deste aluno</span></span>
    </button>`;

  const chatPanel = document.createElement('section');
  chatPanel.className = 'live-session-tab-panel';
  chatPanel.dataset.liveTabPanel = 'chat';

  modalBody.prepend(tabs);
  tabs.after(workoutsPanel, chatPanel);

  if (progressLabel) workoutsPanel.prepend(progressLabel);
  if (modalActions) workoutsPanel.append(modalActions);
  if (chatTitle) chatPanel.append(chatTitle);
  if (chatThread) chatPanel.append(chatThread);
  if (chatForm) chatPanel.append(chatForm);

  tabs.addEventListener('click', event => {
    const button = event.target.closest('[data-live-tab]');
    if (!button) return;
    setActiveTab(button.dataset.liveTab);
  });

  document.querySelector('#live-session-edit-workout')?.addEventListener('click', () => {
    const studentId = currentStudent || currentStudentId();
    if (studentId) openEditor(studentId);
  });
}

function setActiveTab(tab = 'workouts') {
  document.querySelectorAll('[data-live-tab]').forEach(button => {
    const active = button.dataset.liveTab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-live-tab-panel]').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.liveTabPanel === tab);
  });
}

function exerciseMeta(row) {
  return [
    row.series ? `${row.series} séries` : null,
    row.repeticoes ? `${row.repeticoes} rep.` : null,
    row.carga || null,
    row.descanso_segundos ? `${row.descanso_segundos}s descanso` : null
  ].filter(Boolean).join(' • ') || 'Sem prescrição detalhada';
}

function renderWorkoutExercises(workout, exercises) {
  if (!exercises.length) {
    return '<div class="live-session-exercise-empty">Nenhum exercício cadastrado neste plano.</div>';
  }

  const groups = exercises.reduce((acc, row) => {
    const day = Number(row.dia_semana) || 0;
    (acc[day] ||= []).push(row);
    return acc;
  }, {});

  return Object.keys(groups)
    .map(Number)
    .sort((a, b) => a - b)
    .map(day => {
      const rows = groups[day].sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
      const dayName = DAY_NAMES[day] || 'Dia não informado';
      return `
        <section class="live-session-workout-day">
          <div class="live-session-workout-day-title"><span>${escapeHtml(dayName)}</span><span>${rows.length} ${rows.length === 1 ? 'exercício' : 'exercícios'}</span></div>
          <div class="live-session-exercise-list">
            ${rows.map((row, index) => `
              <div class="live-session-exercise-row">
                <span class="live-session-exercise-order">${escapeHtml(String(row.ordem || index + 1))}</span>
                <span class="live-session-exercise-copy">
                  <strong>${escapeHtml(row.exercicios?.nome || 'Exercício')}</strong>
                  <span>${escapeHtml(exerciseMeta(row))}</span>
                </span>
              </div>`).join('')}
          </div>
        </section>`;
    }).join('');
}

async function loadStudentWorkouts(studentId) {
  const host = document.querySelector('#live-session-workouts-list');
  if (!host || !studentId) return;

  currentStudent = studentId;
  host.innerHTML = '<div class="live-session-workout-empty">Carregando treinos e exercícios...</div>';
  const requestId = ++workoutsRequest;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sessão inválida');

    const { data, error } = await supabase
      .from('treinos')
      .select('id,nome,dias_semana,data_inicio,data_fim,status,updated_at')
      .eq('aluno_id', studentId)
      .eq('personal_id', session.user.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    if (requestId !== workoutsRequest || currentStudent !== studentId) return;

    const workouts = Array.isArray(data) ? data : [];
    workouts.sort((a, b) => Number(b.status === 'ativo') - Number(a.status === 'ativo'));

    if (!workouts.length) {
      host.innerHTML = '<div class="live-session-workout-empty">Este aluno ainda não possui plano de treino. Use “Editar treino” para criar o primeiro.</div>';
      return;
    }

    const workoutIds = workouts.map(workout => workout.id);
    const { data: exerciseData, error: exerciseError } = await supabase
      .from('treino_exercicios')
      .select('id,treino_id,dia_semana,ordem,series,repeticoes,carga,descanso_segundos,observacoes,exercicios(nome,grupo_muscular,equipamento)')
      .in('treino_id', workoutIds)
      .order('dia_semana')
      .order('ordem');

    if (exerciseError) throw exerciseError;
    if (requestId !== workoutsRequest || currentStudent !== studentId) return;

    const exercisesByWorkout = (exerciseData || []).reduce((acc, row) => {
      (acc[row.treino_id] ||= []).push(row);
      return acc;
    }, {});

    host.innerHTML = workouts.map(workout => {
      const days = (workout.dias_semana || [])
        .map(Number)
        .map(day => DAY_NAMES[day])
        .filter(Boolean)
        .join(', ') || 'Dias não definidos';
      const start = formatDate(workout.data_inicio);
      const end = formatDate(workout.data_fim);
      const period = [start, end].filter(Boolean).join(' → ');
      const workoutExercises = exercisesByWorkout[workout.id] || [];

      return `
        <article class="live-session-workout-card">
          <div class="live-session-workout-header">
            <div class="live-session-workout-main">
              <div class="live-session-workout-title">
                <strong>${escapeHtml(workout.nome || 'Plano de treino')}</strong>
                ${workout.status === 'ativo' ? '<span class="live-session-workout-badge">ATIVO</span>' : ''}
              </div>
              <span class="live-session-workout-meta">${escapeHtml(days)}</span>
              ${period ? `<span class="live-session-workout-period">${escapeHtml(period)}</span>` : ''}
            </div>
            <span class="live-session-workout-count">${workoutExercises.length} ${workoutExercises.length === 1 ? 'exercício' : 'exercícios'}</span>
          </div>
          <div class="live-session-workout-exercises">${renderWorkoutExercises(workout, workoutExercises)}</div>
        </article>`;
    }).join('');
  } catch (error) {
    console.error('Erro ao carregar treinos no acompanhamento:', error);
    if (requestId === workoutsRequest) {
      host.innerHTML = '<div class="live-session-workout-empty">Não foi possível carregar os treinos e exercícios deste aluno agora.</div>';
    }
  }
}

function refreshWorkoutTab() {
  const studentId = currentStudentId();
  if (!studentId) return;
  currentStudent = studentId;
  loadStudentWorkouts(studentId).catch(console.error);
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
  if (currentStudent) loadStudentWorkouts(currentStudent).catch(console.error);
}

injectStyles();
ensureTabbedLayout();

liveList?.addEventListener('click', event => {
  const row = event.target.closest('[data-open-live-session]');
  if (!row) return;
  currentSessionId = row.dataset.openLiveSession || '';
  currentStudent = '';
  sessionModal?.setAttribute('data-current-session-id', currentSessionId);
  setActiveTab('workouts');
  setTimeout(refreshWorkoutTab, 0);
});

if (modalActions) {
  const observer = new MutationObserver(() => {
    if (!sessionModal?.classList.contains('open')) return;
    const studentId = currentStudentId();
    if (studentId && studentId !== currentStudent) loadStudentWorkouts(studentId).catch(console.error);
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
