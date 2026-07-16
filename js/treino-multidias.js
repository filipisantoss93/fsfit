import { supabase } from './supabase.js';
import { requireSession, showMessage } from './layout.js';

const session = await requireSession();
if (!session) throw new Error('Sessão inválida');

const alunoId = new URLSearchParams(location.search).get('id');
const form = document.querySelector('#workout-exercise-form');
const modal = document.querySelector('#exercise-modal');
const message = document.querySelector('#workout-message');
const originalDaySelect = form?.querySelector('[name="dia_semana"]');
const originalDayGroup = originalDaySelect?.closest('.form-group');
const dayLabels = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 7: 'Dom' };

let activeWorkoutId = null;
let allowedDays = [];
let editingExerciseId = null;

if (form && originalDaySelect && originalDayGroup) {
  originalDayGroup.style.gridColumn = '1 / -1';
  originalDaySelect.style.display = 'none';
  originalDaySelect.required = false;
  originalDayGroup.insertAdjacentHTML('beforeend', `
    <div id="exercise-weekday-options" class="workout-weekdays" aria-label="Dias da semana do exercício">
      ${Object.entries(dayLabels).map(([day, label]) => `<label><input type="checkbox" value="${day}"> ${label}</label>`).join('')}
    </div>
  `);
}

const weekdayOptions = document.querySelector('#exercise-weekday-options');

function checkedDays() {
  return [...(weekdayOptions?.querySelectorAll('input:checked') || [])].map(input => Number(input.value));
}

function setCheckedDays(days = []) {
  weekdayOptions?.querySelectorAll('input').forEach(input => {
    const day = Number(input.value);
    input.checked = days.includes(day);
    input.disabled = allowedDays.length > 0 && !allowedDays.includes(day);
    input.closest('label')?.classList.toggle('workout-weekday-disabled', input.disabled);
  });
}

async function refreshActiveWorkoutDays() {
  if (!alunoId) return;
  const { data } = await supabase
    .from('treinos')
    .select('id,dias_semana')
    .eq('aluno_id', alunoId)
    .eq('personal_id', session.user.id)
    .eq('status', 'ativo')
    .maybeSingle();

  activeWorkoutId = data?.id || null;
  allowedDays = (data?.dias_semana || []).map(Number);
  setCheckedDays([]);
}

async function prepareNewExercise() {
  editingExerciseId = null;
  await refreshActiveWorkoutDays();
}

function prepareExerciseEdit(id) {
  editingExerciseId = id;
  const selectedDay = Number(originalDaySelect.value);
  setCheckedDays(selectedDay ? [selectedDay] : []);
}

document.querySelector('#open-exercise-modal')?.addEventListener('click', () => {
  setTimeout(() => prepareNewExercise(), 0);
});

document.addEventListener('click', event => {
  const detailRow = event.target.closest('[data-open-exercise-detail]');
  if (detailRow) editingExerciseId = detailRow.dataset.openExerciseDetail;

  if (event.target.closest('#exercise-detail-edit')) {
    setTimeout(() => prepareExerciseEdit(editingExerciseId), 0);
  }
});

form?.addEventListener('submit', async event => {
  event.preventDefault();
  event.stopImmediatePropagation();

  const days = checkedDays();
  if (!days.length) {
    showMessage(message, 'Selecione pelo menos um dia da semana.', 'error');
    return;
  }

  if (!activeWorkoutId) await refreshActiveWorkoutDays();
  if (!activeWorkoutId) {
    showMessage(message, 'Ative um plano de treino antes de adicionar exercícios.', 'error');
    return;
  }

  const exerciseId = form.exercicio_id.value;
  if (!exerciseId) {
    showMessage(message, 'Selecione um exercício.', 'error');
    return;
  }

  const basePayload = {
    treino_id: activeWorkoutId,
    exercicio_id: exerciseId,
    ordem: Number(form.ordem.value || 1),
    series: form.series.value ? Number(form.series.value) : null,
    repeticoes: form.repeticoes.value.trim() || null,
    carga: form.carga.value.trim() || null,
    descanso_segundos: form.descanso_segundos.value ? Number(form.descanso_segundos.value) : null,
    observacoes: form.observacoes.value.trim() || null
  };

  let error = null;

  if (editingExerciseId) {
    const [firstDay, ...extraDays] = days;
    const updateResult = await supabase
      .from('treino_exercicios')
      .update({ ...basePayload, dia_semana: firstDay })
      .eq('id', editingExerciseId)
      .eq('treino_id', activeWorkoutId);
    error = updateResult.error;

    if (!error && extraDays.length) {
      const insertResult = await supabase
        .from('treino_exercicios')
        .insert(extraDays.map(day => ({ ...basePayload, dia_semana: day })));
      error = insertResult.error;
    }
  } else {
    const insertResult = await supabase
      .from('treino_exercicios')
      .insert(days.map(day => ({ ...basePayload, dia_semana: day })));
    error = insertResult.error;
  }

  if (error) {
    console.error('Erro ao salvar exercício em múltiplos dias:', error);
    showMessage(message, 'Não foi possível salvar o exercício. Verifique os dados e tente novamente.', 'error');
    return;
  }

  modal?.classList.remove('open');
  modal?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('workout-modal-open');
  showMessage(message, editingExerciseId ? 'Exercício atualizado com sucesso.' : 'Exercício adicionado aos dias selecionados com sucesso.');
  setTimeout(() => location.reload(), 450);
}, true);

await refreshActiveWorkoutDays();
