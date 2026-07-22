import { supabase } from './supabase.js';

const alunoId = new URLSearchParams(location.search).get('id');
const form = document.querySelector('#workout-exercise-form');
const modal = document.querySelector('#exercise-modal');
const weekdayOptions = document.querySelector('#exercise-weekday-options');
const openButton = document.querySelector('#open-exercise-modal');
const workspace = document.querySelector('#active-workout-workspace');

let targetWorkoutId = null;
let targetWorkoutDays = [];
let loadingWorkout = null;

function checkedDays() {
  return [...(weekdayOptions?.querySelectorAll('input:checked') || [])].map(input => Number(input.value));
}

function unlockAllDays() {
  weekdayOptions?.querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.disabled = false;
    input.closest('label')?.classList.remove('workout-weekday-disabled');
  });
}

function workspaceWorkout() {
  const id = workspace?.dataset.workoutId || '';
  if (!id) return null;
  let days = [];
  try {
    days = JSON.parse(workspace?.dataset.workoutDays || '[]').map(Number);
  } catch {
    days = [];
  }
  return { id, dias_semana: days };
}

async function loadTargetWorkout() {
  const current = workspaceWorkout();
  if (current) {
    targetWorkoutId = current.id;
    targetWorkoutDays = current.dias_semana;
    return current;
  }

  if (!alunoId) return null;
  if (loadingWorkout) return loadingWorkout;

  loadingWorkout = supabase
    .from('treinos')
    .select('id,dias_semana')
    .eq('aluno_id', alunoId)
    .eq('status', 'ativo')
    .maybeSingle()
    .then(({ data, error }) => {
      if (error) throw error;
      targetWorkoutId = data?.id || null;
      targetWorkoutDays = (data?.dias_semana || []).map(Number);
      return data;
    })
    .finally(() => {
      loadingWorkout = null;
    });

  return loadingWorkout;
}

async function ensureDaysInTargetWorkout(days) {
  await loadTargetWorkout();
  if (!targetWorkoutId || !days.length) return;

  const mergedDays = [...new Set([...targetWorkoutDays, ...days].map(Number))]
    .filter(day => day >= 1 && day <= 7)
    .sort((a, b) => a - b);

  const changed = mergedDays.length !== targetWorkoutDays.length
    || mergedDays.some((day, index) => day !== targetWorkoutDays[index]);

  if (!changed) return;

  const { error } = await supabase
    .from('treinos')
    .update({ dias_semana: mergedDays })
    .eq('id', targetWorkoutId);

  if (error) throw error;
  targetWorkoutDays = mergedDays;

  if (workspace?.dataset.workoutId === targetWorkoutId) {
    workspace.dataset.workoutDays = JSON.stringify(mergedDays);
  }
  window.dispatchEvent(new CustomEvent('fsfit-workout-days-updated', {
    detail: { workoutId: targetWorkoutId, days: mergedDays }
  }));
}

async function prepareFreeDaySelection() {
  try {
    await loadTargetWorkout();
  } catch (error) {
    console.error('Não foi possível carregar os dias do plano selecionado:', error);
  } finally {
    unlockAllDays();
  }
}

openButton?.addEventListener('click', () => {
  setTimeout(prepareFreeDaySelection, 30);
});

document.addEventListener('click', event => {
  if (event.target.closest('#exercise-detail-edit')) {
    setTimeout(prepareFreeDaySelection, 30);
  }
});

weekdayOptions?.addEventListener('change', () => {
  unlockAllDays();
});

window.addEventListener('fsfit-workout-selection-changed', () => {
  const current = workspaceWorkout();
  targetWorkoutId = current?.id || null;
  targetWorkoutDays = current?.dias_semana || [];
});

if (modal) {
  const observer = new MutationObserver(() => {
    if (modal.classList.contains('open')) setTimeout(prepareFreeDaySelection, 30);
  });
  observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
}

// O módulo multidias salva os exercícios no submit. Interceptamos apenas quando
// o personal escolhe um dia ainda não configurado e atualizamos o plano selecionado.
document.addEventListener('submit', async event => {
  if (event.target !== form) return;

  const days = checkedDays();
  if (!days.length) return;

  try {
    await loadTargetWorkout();
    const hasNewDay = days.some(day => !targetWorkoutDays.includes(day));
    if (!hasNewDay) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    await ensureDaysInTargetWorkout(days);
    unlockAllDays();
    form.requestSubmit();
  } catch (error) {
    console.error('Não foi possível habilitar os novos dias no plano:', error);
  }
}, true);

prepareFreeDaySelection();