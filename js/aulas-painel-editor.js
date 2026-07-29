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
let currentExerciseId = '';
let currentExercises = new Map();
let currentProgressSignature = '';

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

function sessionProgress() {
  return {
    done: Math.max(0, Number(sessionModal?.dataset.progressDone || 0)),
    total: Math.max(0, Number(sessionModal?.dataset.progressTotal || 0)),
    active: sessionModal?.dataset.sessionStatus === 'em_aula'
  };
}

function ensureTabbedLayout() {
  if (!modalBody || document.querySelector('#live-session-tabs')) return;

  const tabs = document.createElement('nav');
  tabs.id = 'live-session-tabs';
  tabs.className = 'live-session-tabs';
  tabs.setAttribute('aria-label', 'Acompanhamento do aluno');
  tabs.innerHTML = `
    <button class="live-session-tab active" type="button" data-live-tab="workouts" aria-selected="true">Treino</button>
    <button class="live-session-tab" type="button" data-live-tab="chat" aria-selected="false">Chat</button>`;

  const workoutsPanel = document.createElement('section');
  workoutsPanel.className = 'live-session-tab-panel active';
  workoutsPanel.dataset.liveTabPanel = 'workouts';
  workoutsPanel.innerHTML = `
    <div class="live-session-workouts-heading">
      <div><small>TREINO DE HOJE</small><strong>Exercícios do aluno</strong><p>Acompanhe a sequência e abra um exercício para ajustar.</p></div>
    </div>
    <div id="live-session-workouts-list" class="live-session-workouts-list"><div class="live-session-workout-empty">Carregando treino de hoje...</div></div>`;

  const chatPanel = document.createElement('section');
  chatPanel.className = 'live-session-tab-panel';
  chatPanel.dataset.liveTabPanel = 'chat';

  modalBody.prepend(tabs);
  tabs.after(workoutsPanel, chatPanel);

  const headerInfo = sessionModal?.querySelector('.live-session-modal-header > div:first-child');
  if (progressLabel && headerInfo) {
    const label = progressLabel.querySelector('span');
    if (label) label.textContent = 'Progresso';
    headerInfo.append(progressLabel);
  }
  if (modalActions) workoutsPanel.append(modalActions);
  if (chatTitle) chatPanel.append(chatTitle);
  if (chatThread) chatPanel.append(chatThread);
  if (chatForm) chatPanel.append(chatForm);

  workoutsPanel.addEventListener('click', event => {
    const exercise = event.target.closest('[data-live-exercise-id]');
    if (exercise) openExerciseEditor(exercise.dataset.liveExerciseId);
  });

  tabs.addEventListener('click', event => {
    const button = event.target.closest('[data-live-tab]');
    if (!button) return;
    setActiveTab(button.dataset.liveTab);
  });

  ensureExerciseEditor();
  ensureEditActionButton();
}

function ensureEditActionButton() {
  if (!modalActions || modalActions.querySelector('[data-live-edit-workout]')) return;
  const recordLink = modalActions.querySelector('a[href*="ficha-aluno.html?id="]');
  const studentId = currentStudent || currentStudentId();
  if (!recordLink || !studentId) return;

  const button = document.createElement('button');
  button.className = 'btn btn-outline btn-action-tile';
  button.type = 'button';
  button.dataset.liveEditWorkout = studentId;
  button.innerHTML = `
    <span class="btn-action-icon" aria-hidden="true">✎</span>
    <span class="btn-action-copy"><span class="btn-action-title">Editar treino</span><span class="btn-action-description">Ajustar planos, dias e exercícios</span></span>`;
  recordLink.before(button);
}

function todayWorkoutDay() {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

function ensureExerciseEditor() {
  if (!sessionModal || document.querySelector('#live-exercise-edit-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'live-exercise-edit-modal';
  modal.className = 'live-exercise-edit-modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <section class="live-exercise-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="live-exercise-edit-title">
      <h3 id="live-exercise-edit-title">Ajustar exercício</h3>
      <p id="live-exercise-edit-subtitle">Altere séries e repetições para este aluno.</p>
      <form id="live-exercise-edit-form">
        <div class="live-exercise-edit-grid">
          <div class="form-group"><label for="live-exercise-series">Séries</label><input id="live-exercise-series" name="series" type="number" min="1" max="20" step="1"></div>
          <div class="form-group"><label for="live-exercise-repetitions">Repetições</label><input id="live-exercise-repetitions" name="repeticoes" type="text" maxlength="50" placeholder="Ex.: 12 ou 15–20"></div>
        </div>
        <div class="live-exercise-edit-actions">
          <button class="btn btn-neutral" type="button" data-close-live-exercise-edit>Cancelar</button>
          <button class="btn btn-primary" type="submit">Salvar</button>
        </div>
      </form>
    </section>`;
  sessionModal.appendChild(modal);

  modal.addEventListener('click', event => {
    if (event.target === modal || event.target.closest('[data-close-live-exercise-edit]')) closeExerciseEditor();
  });
  modal.querySelector('#live-exercise-edit-form')?.addEventListener('submit', saveExerciseAdjustments);
}

function openExerciseEditor(exerciseId) {
  const row = currentExercises.get(exerciseId);
  const modal = document.querySelector('#live-exercise-edit-modal');
  if (!row || !modal) return;
  currentExerciseId = exerciseId;
  modal.querySelector('#live-exercise-edit-title').textContent = row.exercicios?.nome || 'Ajustar exercício';
  modal.querySelector('#live-exercise-series').value = row.series ?? '';
  modal.querySelector('#live-exercise-repetitions').value = row.repeticoes ?? '';
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeExerciseEditor() {
  const modal = document.querySelector('#live-exercise-edit-modal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  currentExerciseId = '';
}

async function saveExerciseAdjustments(event) {
  event.preventDefault();
  const row = currentExercises.get(currentExerciseId);
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  if (!row || !currentExerciseId || !submit) return;

  const seriesRaw = String(form.series.value || '').trim();
  const repetitions = String(form.repeticoes.value || '').trim();
  const series = seriesRaw ? Number(seriesRaw) : null;
  if (series != null && (!Number.isInteger(series) || series < 1 || series > 20)) return;

  submit.disabled = true;
  const originalText = submit.textContent;
  submit.textContent = 'Salvando...';
  try {
    const { error } = await supabase
      .from('treino_exercicios')
      .update({ series, repeticoes: repetitions || null })
      .eq('id', currentExerciseId)
      .eq('treino_id', row.treino_id);
    if (error) throw error;
    row.series = series;
    row.repeticoes = repetitions || null;
    closeExerciseEditor();
    if (currentStudent) await loadStudentWorkouts(currentStudent);
  } catch (error) {
    console.error('Erro ao atualizar exercício no acompanhamento:', error);
    alert('Não foi possível atualizar séries e repetições deste exercício.');
  } finally {
    submit.disabled = false;
    submit.textContent = originalText;
  }
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

function renderWorkoutExercises(workout, exercises, exerciseOffset = 0) {
  if (!exercises.length) {
    return '<div class="live-session-exercise-empty">Nenhum exercício cadastrado neste plano.</div>';
  }

  const progress = sessionProgress();
  const groups = exercises.reduce((acc, row) => {
    const day = Number(row.dia_semana) || 0;
    (acc[day] ||= []).push(row);
    return acc;
  }, {});
  let localPosition = 0;

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
            ${rows.map((row, index) => {
              const progressIndex = exerciseOffset + localPosition++;
              const done = progressIndex < progress.done;
              const current = progress.active && !done && progressIndex === progress.done && progress.done < Math.max(progress.total, exercises.length + exerciseOffset);
              const stateClass = done ? 'done' : current ? 'current' : 'pending';
              const marker = done ? '✓' : current ? '●' : '○';
              const stateLabel = done ? 'Concluído' : current ? 'Exercício atual' : 'Pendente';
              return `
                <button class="live-session-exercise-row ${stateClass}" type="button" data-live-exercise-id="${escapeHtml(row.id)}" aria-label="${escapeHtml(`${row.exercicios?.nome || 'Exercício'} — ${stateLabel}`)}">
                  <span class="live-session-exercise-marker" aria-hidden="true">${marker}</span>
                  <span class="live-session-exercise-order">${escapeHtml(String(row.ordem || index + 1))}</span>
                  <span class="live-session-exercise-copy">
                    <strong>${escapeHtml(row.exercicios?.nome || 'Exercício')}</strong>
                    <span>${escapeHtml(exerciseMeta(row))}</span>
                  </span>
                  <span class="live-session-exercise-arrow" aria-hidden="true">›</span>
                </button>`;
            }).join('')}
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

    const todayDay = todayWorkoutDay();
    const todayName = DAY_NAMES[todayDay] || 'Hoje';
    currentExercises = new Map((exerciseData || []).map(row => [row.id, row]));

    const exercisesByWorkout = (exerciseData || []).reduce((acc, row) => {
      if (Number(row.dia_semana) === todayDay) (acc[row.treino_id] ||= []).push(row);
      return acc;
    }, {});

    let visibleWorkouts = workouts.filter(workout => workout.status === 'ativo' && (exercisesByWorkout[workout.id] || []).length);
    if (!visibleWorkouts.length) {
      visibleWorkouts = workouts.filter(workout => (exercisesByWorkout[workout.id] || []).length);
    }

    if (!visibleWorkouts.length) {
      host.innerHTML = `<div class="live-session-workout-empty">Nenhum exercício agendado para hoje (${escapeHtml(todayName)}).</div>`;
      ensureEditActionButton();
      return;
    }

    let exerciseOffset = 0;
    host.innerHTML = visibleWorkouts.map(workout => {
      const start = formatDate(workout.data_inicio);
      const end = formatDate(workout.data_fim);
      const period = [start, end].filter(Boolean).join(' → ');
      const workoutExercises = exercisesByWorkout[workout.id] || [];
      const workoutOffset = exerciseOffset;
      exerciseOffset += workoutExercises.length;

      return `
        <article class="live-session-workout-card">
          <div class="live-session-workout-header">
            <div class="live-session-workout-main">
              <div class="live-session-workout-title">
                <strong>${escapeHtml(workout.nome || 'Plano de treino')}</strong>
                ${workout.status === 'ativo' ? '<span class="live-session-workout-badge">ATIVO</span>' : ''}
              </div>
              <span class="live-session-workout-meta">Hoje · ${escapeHtml(todayName)}</span>
              ${period ? `<span class="live-session-workout-period">${escapeHtml(period)}</span>` : ''}
            </div>
            <span class="live-session-workout-count">${workoutExercises.length} ${workoutExercises.length === 1 ? 'exercício' : 'exercícios'}</span>
          </div>
          <div class="live-session-workout-exercises">${renderWorkoutExercises(workout, workoutExercises, workoutOffset)}</div>
        </article>`;
    }).join('');
    ensureEditActionButton();
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
    ensureEditActionButton();
    const studentId = currentStudentId();
    if (studentId && studentId !== currentStudent) loadStudentWorkouts(studentId).catch(console.error);
  });
  observer.observe(modalActions, { childList: true });
}

sessionModal?.addEventListener('fsfit-live-session-updated', event => {
  const detail = event.detail || {};
  const signature = `${detail.sessionId || ''}:${detail.done || 0}:${detail.total || 0}:${detail.status || ''}`;
  if (signature === currentProgressSignature) return;
  currentProgressSignature = signature;
  if (!sessionModal.classList.contains('open') || !currentStudent) return;
  loadStudentWorkouts(currentStudent).catch(console.error);
});

modalActions?.addEventListener('click', event => {
  const editButton = event.target.closest('[data-live-edit-workout]');
  if (!editButton) return;
  openEditor(editButton.dataset.liveEditWorkout || currentStudent || currentStudentId());
});

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