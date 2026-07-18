import { supabase } from './supabase.js';

const alunoId = new URLSearchParams(location.search).get('id');
const form = document.querySelector('#workout-exercise-form');
const modal = document.querySelector('#exercise-modal');
const weekdayOptions = document.querySelector('#exercise-weekday-options');
const openButton = document.querySelector('#open-exercise-modal');

let activeWorkoutId = null;
let activeWorkoutDays = [];
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

async function loadActiveWorkout() {
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
      activeWorkoutId = data?.id || null;
      activeWorkoutDays = (data?.dias_semana || []).map(Number);
      return data;
    })
    .finally(() => {
      loadingWorkout = null;
    });

  return loadingWorkout;
}

async function ensureDaysInActiveWorkout(days) {
  await loadActiveWorkout();
  if (!activeWorkoutId || !days.length) return;

  const mergedDays = [...new Set([...activeWorkoutDays, ...days].map(Number))]
    .filter(day => day >= 1 && day <= 7)
    .sort((a, b) => a - b);

  const changed = mergedDays.length !== activeWorkoutDays.length
    || mergedDays.some((day, index) => day !== activeWorkoutDays[index]);

  if (!changed) return;

  const { error } = await supabase
    .from('treinos')
    .update({ dias_semana: mergedDays })
    .eq('id', activeWorkoutId);

  if (error) throw error;
  activeWorkoutDays = mergedDays;
}

async function prepareFreeDaySelection() {
  try {
    await loadActiveWorkout();
  } catch (error) {
    console.error('Não foi possível carregar os dias do treino ativo:', error);
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

if (modal) {
  const observer = new MutationObserver(() => {
    if (modal.classList.contains('open')) setTimeout(prepareFreeDaySelection, 30);
  });
  observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
}

// O módulo multidias original salva os exercícios no submit. Interceptamos apenas
// quando há um dia novo, atualizamos o plano ativo e então reenviamos o formulário.
document.addEventListener('submit', async event => {
  if (event.target !== form) return;

  const days = checkedDays();
  if (!days.length) return;

  try {
    await loadActiveWorkout();
    const hasNewDay = days.some(day => !activeWorkoutDays.includes(day));
    if (!hasNewDay) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    await ensureDaysInActiveWorkout(days);
    unlockAllDays();
    form.requestSubmit();
  } catch (error) {
    console.error('Não foi possível habilitar os novos dias no treino:', error);
  }
}, true);

prepareFreeDaySelection();
