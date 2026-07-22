import { supabase } from './supabase.js';
import { showMessage } from './layout.js';

const alunoId = new URLSearchParams(location.search).get('id');
const form = document.querySelector('#workout-exercise-form');
const message = document.querySelector('#workout-message');
const weekdayOptions = document.querySelector('#exercise-weekday-options');
const selectedBuilder = document.querySelector('#selected-exercises-builder');
const saveButton = document.querySelector('#save-exercise-batch');
const workspace = document.querySelector('#active-workout-workspace');

const dayNames = {
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
  7: 'Domingo'
};

let editingExerciseId = null;
let bypassValidation = false;
let validating = false;

function checkedDays() {
  return [...(weekdayOptions?.querySelectorAll('input:checked') || [])]
    .map(input => Number(input.value))
    .filter(Boolean);
}

function selectedExerciseIds() {
  if (editingExerciseId) {
    return form?.exercicio_id?.value ? [form.exercicio_id.value] : [];
  }

  return [...(selectedBuilder?.querySelectorAll('[data-selected-exercise]') || [])]
    .map(card => card.dataset.selectedExercise)
    .filter(Boolean);
}

async function getTargetWorkoutId() {
  const selectedId = workspace?.dataset.workoutId || '';
  if (selectedId) return selectedId;
  if (!alunoId) return null;

  const { data, error } = await supabase
    .from('treinos')
    .select('id')
    .eq('aluno_id', alunoId)
    .eq('status', 'ativo')
    .maybeSingle();

  if (error) throw error;
  return data?.id || null;
}

function duplicateMessage(rows = []) {
  const grouped = new Map();

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

document.addEventListener('click', event => {
  const detailRow = event.target.closest('[data-open-exercise-detail]');
  if (detailRow) editingExerciseId = detailRow.dataset.openExerciseDetail || null;

  if (event.target.closest('#open-exercise-modal')) editingExerciseId = null;
  if (event.target.closest('[data-close-exercise-modal]')) editingExerciseId = null;
});

document.addEventListener('submit', async event => {
  if (event.target !== form) return;

  if (bypassValidation) {
    bypassValidation = false;
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  if (validating) return;
  validating = true;
  if (saveButton) saveButton.disabled = true;

  try {
    const days = checkedDays();
    const exerciseIds = selectedExerciseIds();

    if (!days.length || !exerciseIds.length) {
      bypassValidation = true;
      if (saveButton) saveButton.disabled = false;
      validating = false;
      form.requestSubmit();
      return;
    }

    const treinoId = await getTargetWorkoutId();
    if (!treinoId) {
      showMessage(message, 'Selecione um plano antes de adicionar exercícios.', 'error');
      return;
    }

    let query = supabase
      .from('treino_exercicios')
      .select('id,dia_semana,exercicio_id,exercicios(nome)')
      .eq('treino_id', treinoId)
      .in('dia_semana', days)
      .in('exercicio_id', exerciseIds);

    if (editingExerciseId) query = query.neq('id', editingExerciseId);

    const { data, error } = await query;
    if (error) throw error;

    if (data?.length) {
      showMessage(message, duplicateMessage(data), 'error');
      return;
    }

    bypassValidation = true;
    if (saveButton) saveButton.disabled = false;
    validating = false;
    form.requestSubmit();
  } catch (error) {
    console.error('Erro ao validar exercício duplicado:', error);
    showMessage(message, 'Não foi possível validar o exercício antes de salvar. Tente novamente.', 'error');
  } finally {
    if (!bypassValidation) {
      validating = false;
      if (saveButton) saveButton.disabled = false;
    }
  }
}, true);