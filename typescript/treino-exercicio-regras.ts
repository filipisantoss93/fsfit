// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { supabase } from './supabase.js';
// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { showMessage } from './layout.js';

interface WorkoutExerciseForm extends HTMLFormElement {
  exercicio_id?: HTMLInputElement;
}

interface WorkoutTarget {
  id: string | number;
  dias_semana: number[];
}

interface DuplicateRow {
  id?: string | number;
  dia_semana?: number | string | null;
  exercicio_id?: string | number | null;
  exercicios?: { nome?: string | null } | null;
}

const alunoId = new URLSearchParams(location.search).get('id');
const form = document.querySelector<WorkoutExerciseForm>('#workout-exercise-form');
const message = document.querySelector<HTMLElement>('#workout-message');
const weekdayOptions = document.querySelector<HTMLElement>('#exercise-weekday-options');
const selectedBuilder = document.querySelector<HTMLElement>('#selected-exercises-builder');
const saveButton = document.querySelector<HTMLButtonElement>('#save-exercise-batch');
const workspace = document.querySelector<HTMLElement>('#active-workout-workspace');

const dayNames: Record<number, string> = {
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
  7: 'Domingo'
};

let editingExerciseId: string | null = null;
let targetWorkout: WorkoutTarget | null = null;
let targetWorkoutPromise: Promise<WorkoutTarget | null> | null = null;
let currentUserIdPromise: Promise<string> | null = null;

function checkedDays(): number[] {
  return [...(weekdayOptions?.querySelectorAll<HTMLInputElement>('input:checked') || [])]
    .map(input => Number(input.value))
    .filter(day => day >= 1 && day <= 7);
}

function selectedExerciseIds(): string[] {
  if (editingExerciseId) {
    return form?.exercicio_id?.value ? [form.exercicio_id.value] : [];
  }
  return [...(selectedBuilder?.querySelectorAll<HTMLElement>('[data-selected-exercise]') || [])]
    .map(card => card.dataset.selectedExercise)
    .filter((value): value is string => Boolean(value));
}

function workspaceWorkout(): WorkoutTarget | null {
  const id = workspace?.dataset.workoutId || '';
  if (!id) return null;
  let days: number[] = [];
  try {
    const raw = JSON.parse(workspace?.dataset.workoutDays || '[]') as unknown[];
    days = raw.map(Number);
  } catch {
    days = [];
  }
  return { id, dias_semana: days };
}

function currentUserId(): Promise<string> {
  if (!currentUserIdPromise) {
    currentUserIdPromise = supabase.auth.getSession().then(({ data, error }: { data: any; error: any }) => {
      if (error) throw error;
      const userId = data?.session?.user?.id;
      if (!userId) throw new Error('Sessão inválida.');
      return String(userId);
    }).catch((error: unknown) => {
      currentUserIdPromise = null;
      throw error;
    });
  }
  return currentUserIdPromise;
}

async function loadTargetWorkout(): Promise<WorkoutTarget | null> {
  const current = workspaceWorkout();
  if (current) {
    targetWorkout = current;
    return current;
  }
  if (!alunoId) return null;
  if (targetWorkoutPromise) return targetWorkoutPromise;

  targetWorkoutPromise = (async () => {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from('treinos')
      .select('id,dias_semana')
      .eq('aluno_id', alunoId)
      .eq('personal_id', userId)
      .eq('status', 'ativo')
      .maybeSingle();
    if (error) throw error;
    targetWorkout = data ? {
      id: data.id,
      dias_semana: (Array.isArray(data.dias_semana) ? data.dias_semana : []).map(Number)
    } : null;
    return targetWorkout;
  })().finally(() => {
    targetWorkoutPromise = null;
  });

  return targetWorkoutPromise;
}

async function includeDaysInWorkout(days: number[]): Promise<WorkoutTarget | null> {
  const workout = await loadTargetWorkout();
  if (!workout?.id || !days.length) return workout;

  const mergedDays = [...new Set([...(workout.dias_semana || []), ...days].map(Number))]
    .filter(day => day >= 1 && day <= 7)
    .sort((a, b) => a - b);
  const currentDays = [...(workout.dias_semana || [])].map(Number).sort((a, b) => a - b);
  const changed = mergedDays.length !== currentDays.length
    || mergedDays.some((day, index) => day !== currentDays[index]);

  if (!changed) return workout;

  const userId = await currentUserId();
  const { error } = await supabase
    .from('treinos')
    .update({ dias_semana: mergedDays })
    .eq('id', workout.id)
    .eq('personal_id', userId);
  if (error) throw error;

  targetWorkout = { ...workout, dias_semana: mergedDays };
  if (workspace?.dataset.workoutId === String(workout.id)) {
    workspace.dataset.workoutDays = JSON.stringify(mergedDays);
  }
  window.dispatchEvent(new CustomEvent('fsfit-workout-days-updated', {
    detail: { workoutId: workout.id, days: mergedDays }
  }));
  return targetWorkout;
}

function duplicateMessage(rows: DuplicateRow[] = []): string {
  const grouped = new Map<string, string>();
  rows.forEach(row => {
    const name = row.exercicios?.nome || 'Exercício';
    const key = `${row.exercicio_id}:${row.dia_semana}`;
    if (!grouped.has(key)) grouped.set(key, `${name} — ${dayNames[Number(row.dia_semana)] || 'dia selecionado'}`);
  });
  const details = [...grouped.values()];
  const visible = details.slice(0, 3).join(', ');
  const remaining = details.length > 3 ? ` e mais ${details.length - 3}` : '';
  return `Não é permitido repetir o mesmo exercício no mesmo dia. Já cadastrado: ${visible}${remaining}.`;
}

async function validateDuplicates(workoutId: string | number, days: number[], exerciseIds: string[]): Promise<DuplicateRow[]> {
  if (!workoutId || !days.length || !exerciseIds.length) return [];
  let query = supabase
    .from('treino_exercicios')
    .select('id,dia_semana,exercicio_id,exercicios(nome)')
    .eq('treino_id', workoutId)
    .in('dia_semana', days)
    .in('exercicio_id', exerciseIds);
  if (editingExerciseId) query = query.neq('id', editingExerciseId);
  const { data, error } = await query;
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as DuplicateRow[];
}

function repetitionOptions(selected: unknown = '12'): string {
  return Array.from({ length: 60 }, (_, index) => index + 1)
    .map(value => `<option value="${value}"${String(value) === String(selected || '12') ? ' selected' : ''}>${value}</option>`)
    .join('');
}

function applyDefaults(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-selected-exercise]').forEach(card => {
    const series = card.querySelector<HTMLInputElement>('[data-config-field="series"]');
    if (series && !series.value) {
      series.value = '4';
      series.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const repetitions = card.querySelector<HTMLInputElement | HTMLSelectElement>('[data-config-field="repeticoes"]');
    if (repetitions && repetitions.tagName !== 'SELECT') {
      const current = repetitions.value || '12';
      const select = document.createElement('select');
      select.dataset.configField = 'repeticoes';
      select.innerHTML = repetitionOptions(current);
      repetitions.replaceWith(select);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (repetitions && !repetitions.value) {
      repetitions.value = '12';
      repetitions.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const rest = card.querySelector<HTMLInputElement>('[data-config-field="descanso_segundos"]');
    if (rest && !rest.value) {
      rest.value = '60';
      rest.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}

function continueSubmit(): void {
  if (!form) return;
  form.dataset.fsfitRulesValidated = 'true';
  if (saveButton) saveButton.disabled = false;
  form.requestSubmit();
}

document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  const detailRow = event.target.closest<HTMLElement>('[data-open-exercise-detail]');
  if (detailRow) editingExerciseId = detailRow.dataset.openExerciseDetail || null;
  if (event.target.closest('#open-exercise-modal')) editingExerciseId = null;
  if (event.target.closest('[data-close-exercise-modal]')) editingExerciseId = null;
});

window.addEventListener('fsfit-workout-selection-changed', () => {
  targetWorkout = workspaceWorkout();
});

if (selectedBuilder) {
  const observer = new MutationObserver(() => applyDefaults(selectedBuilder));
  observer.observe(selectedBuilder, { childList: true, subtree: true });
  applyDefaults(selectedBuilder);
}

if (form) {
  form.addEventListener('submit', async event => {
    if (form.dataset.fsfitRulesValidated === 'true') {
      delete form.dataset.fsfitRulesValidated;
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    if (saveButton?.disabled) return;
    if (saveButton) saveButton.disabled = true;
    let handedOff = false;

    try {
      const days = checkedDays();
      const exerciseIds = selectedExerciseIds();
      if (!days.length || !exerciseIds.length) {
        handedOff = true;
        continueSubmit();
        return;
      }

      const workout = await includeDaysInWorkout(days);
      if (!workout?.id) {
        showMessage(message, 'Selecione um plano antes de adicionar exercícios.', 'error');
        return;
      }

      const duplicates = await validateDuplicates(workout.id, days, exerciseIds);
      if (duplicates.length) {
        showMessage(message, duplicateMessage(duplicates), 'error');
        return;
      }

      handedOff = true;
      continueSubmit();
    } catch (error) {
      console.error('Erro ao preparar o salvamento do exercício:', error);
      showMessage(message, 'Não foi possível validar o exercício antes de salvar. Tente novamente.', 'error');
    } finally {
      if (!handedOff && saveButton) saveButton.disabled = false;
    }
  }, true);
}
