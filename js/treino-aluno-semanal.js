import { supabase } from './supabase.js';

const workoutDays = document.querySelector('#workout-days');
const alunoId = new URLSearchParams(location.search).get('id');

const dayNames = {
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
  7: 'Domingo'
};

const dayShortNames = {
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
  7: 'Dom'
};

function currentWeekDay() {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function effectiveExercise(row = {}) {
  const exercise = row.exercicios || {};
  return {
    nome: row.exercicio_nome_snapshot ?? exercise.nome ?? '',
    grupo_muscular: row.grupo_muscular_snapshot ?? exercise.grupo_muscular ?? '',
    equipamento: row.equipamento_snapshot ?? exercise.equipamento ?? ''
  };
}

let selectedDay = currentWeekDay();
let observer = null;
let refreshTimer = null;
let activeWorkoutsCache = [];
let weeklyExercisesCache = [];

function createDaySelector() {
  return `<div class="workout-weekday-nav" role="tablist" aria-label="Dias da semana">
    ${Object.keys(dayNames).map(day => {
      const number = Number(day);
      const active = number === selectedDay;
      return `<button class="workout-weekday-button ${active ? 'active' : ''}" type="button" role="tab" data-workout-weekday="${number}" aria-selected="${String(active)}">${dayShortNames[number]}</button>`;
    }).join('')}
  </div>`;
}

function renderExerciseRow(row) {
  const exercise = effectiveExercise(row);
  const details = [
    row.series ? `${row.series} séries` : null,
    row.repeticoes ? `${row.repeticoes} rep.` : null,
    row.carga,
    row.descanso_segundos ? `${row.descanso_segundos}s` : null
  ].filter(Boolean).join(' • ');

  return `<div class="workout-exercise-row" data-weekly-exercise="${row.id}" data-weekly-workout="${row.treino_id}">
    <span class="workout-exercise-order">${row.ordem || '—'}</span>
    <span class="workout-exercise-main">
      <strong>${esc(exercise.nome || 'Exercício')}</strong>
      <span>${esc(details || [exercise.grupo_muscular, exercise.equipamento].filter(Boolean).join(' • ') || 'Ver detalhes do exercício')}</span>
    </span>
    <span class="workout-row-arrow" aria-hidden="true">›</span>
  </div>`;
}

function renderSelectedDay() {
  if (!workoutDays) return;

  const workoutsForDay = activeWorkoutsCache.filter(workout =>
    (workout.dias_semana || []).map(Number).includes(selectedDay)
  );

  const totalExercises = workoutsForDay.reduce((total, workout) => (
    total + weeklyExercisesCache.filter(row => row.treino_id === workout.id && Number(row.dia_semana) === selectedDay).length
  ), 0);

  let dayContent = '';

  if (!workoutsForDay.length) {
    dayContent = `<section class="workout-day-section workout-day-placeholder" data-weekday="${selectedDay}">
      <div class="workout-day-header">
        <div><small>${selectedDay === currentWeekDay() ? 'HOJE' : `DIA ${selectedDay}`}</small><strong>${dayNames[selectedDay]}</strong></div>
        <span>Descanso</span>
      </div>
      <p class="empty workout-day-empty-message">Nenhum treino ativo programado para este dia.</p>
    </section>`;
  } else {
    dayContent = `<section class="workout-day-section workout-day-selected" data-weekday="${selectedDay}">
      <div class="workout-day-header">
        <div><small>${selectedDay === currentWeekDay() ? 'HOJE' : `DIA ${selectedDay}`}</small><strong>${dayNames[selectedDay]}</strong></div>
        <span>${workoutsForDay.length} ${workoutsForDay.length === 1 ? 'plano ativo' : 'planos ativos'} · ${totalExercises} ${totalExercises === 1 ? 'exercício' : 'exercícios'}</span>
      </div>
      <div class="workout-exercise-list">
        ${workoutsForDay.map(workout => {
          const exercises = weeklyExercisesCache
            .filter(row => row.treino_id === workout.id && Number(row.dia_semana) === selectedDay)
            .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));

          return `<article class="workout-detail" data-weekly-workout-group="${workout.id}">
            <div class="workout-day-header">
              <div><small>PLANO ATIVO</small><strong>${esc(workout.nome || 'Plano de treino')}</strong></div>
              <span>${exercises.length} ${exercises.length === 1 ? 'exercício' : 'exercícios'}</span>
            </div>
            ${exercises.length
              ? `<div class="workout-exercise-list">${exercises.map(renderExerciseRow).join('')}</div>`
              : '<p class="empty workout-day-empty-message">Nenhum exercício cadastrado neste plano para este dia.</p>'}
          </article>`;
        }).join('')}
      </div>
    </section>`;
  }

  workoutDays.innerHTML = `<div data-weekly-consolidated="true">${createDaySelector()}${dayContent}</div>`;
}

async function loadActiveWeek() {
  if (!workoutDays || !alunoId) return;

  const { data: workouts, error: workoutError } = await supabase
    .from('treinos')
    .select('id,nome,dias_semana,data_inicio,data_fim,status,modelo,updated_at')
    .eq('aluno_id', alunoId)
    .eq('status', 'ativo')
    .eq('modelo', false)
    .order('updated_at', { ascending: false });

  if (workoutError) throw workoutError;

  activeWorkoutsCache = workouts || [];
  const ids = activeWorkoutsCache.map(workout => workout.id);

  if (!ids.length) {
    weeklyExercisesCache = [];
    renderSelectedDay();
    return;
  }

  const { data: exercises, error: exerciseError } = await supabase
    .from('treino_exercicios')
    .select('id,treino_id,exercicio_id,dia_semana,ordem,series,repeticoes,carga,descanso_segundos,observacoes,exercicio_nome_snapshot,grupo_muscular_snapshot,equipamento_snapshot,exercicios(nome,grupo_muscular,equipamento)')
    .in('treino_id', ids)
    .order('dia_semana')
    .order('ordem');

  if (exerciseError) throw exerciseError;

  weeklyExercisesCache = exercises || [];
  renderSelectedDay();
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    loadActiveWeek().catch(error => console.error('Não foi possível carregar a semana consolidada de treinos ativos:', error));
  }, 80);
}

if (workoutDays) {
  workoutDays.addEventListener('click', event => {
    const button = event.target.closest('[data-workout-weekday]');
    if (button) {
      selectedDay = Number(button.dataset.workoutWeekday) || currentWeekDay();
      renderSelectedDay();
      return;
    }

    const weeklyRow = event.target.closest('[data-weekly-workout]');
    if (!weeklyRow) return;
    const workoutId = weeklyRow.dataset.weeklyWorkout;
    const planButton = document.querySelector(`[data-select-workout="${CSS.escape(workoutId)}"]`);
    if (planButton) planButton.click();
  });

  observer = new MutationObserver(() => {
    if (workoutDays.querySelector('[data-weekly-consolidated="true"]')) return;
    scheduleRefresh();
  });

  observer.observe(workoutDays, { childList: true, subtree: false });

  window.addEventListener('fsfit-workout-exercises-updated', scheduleRefresh);
  window.addEventListener('focus', scheduleRefresh);

  loadActiveWeek().catch(error => console.error('Não foi possível carregar a semana consolidada de treinos ativos:', error));
}
