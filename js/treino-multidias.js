import { supabase } from './supabase.js';
import { requireSession, showMessage } from './layout.js';

const session = await requireSession();
if (!session) throw new Error('Sessão inválida');

const alunoId = new URLSearchParams(location.search).get('id');
const form = document.querySelector('#workout-exercise-form');
const modal = document.querySelector('#exercise-modal');
const message = document.querySelector('#workout-message');
const originalDaySelect = form?.querySelector('[name="dia_semana"]');
const weekdayOptions = document.querySelector('#exercise-weekday-options');
const categorySelect = document.querySelector('#exercise-category');
const exerciseSelect = document.querySelector('#exercise-select');

let activeWorkoutId = null;
let allowedDays = [];
let editingExerciseId = null;
let exerciseLibrary = [];

if (originalDaySelect) {
  originalDaySelect.style.display = 'none';
  originalDaySelect.required = false;
}

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

function categoryName(item) {
  return (item.grupo_muscular || 'Outros').trim() || 'Outros';
}

function populateExerciseOptions(category, selectedExerciseId = '') {
  if (!exerciseSelect) return;
  if (!category) {
    exerciseSelect.innerHTML = '<option value="">Selecione uma categoria primeiro</option>';
    exerciseSelect.disabled = true;
    return;
  }

  const filtered = exerciseLibrary.filter(item => categoryName(item) === category);
  exerciseSelect.innerHTML = '<option value="">Selecione</option>' + filtered.map(item => {
    const detail = item.equipamento ? ` — ${item.equipamento}` : '';
    return `<option value="${item.id}">${item.nome}${detail}</option>`;
  }).join('');
  exerciseSelect.disabled = false;
  if (selectedExerciseId) exerciseSelect.value = selectedExerciseId;
}

function syncCategoryForExercise(exerciseId) {
  const item = exerciseLibrary.find(exercise => exercise.id === exerciseId);
  if (!item || !categorySelect) {
    if (categorySelect) categorySelect.value = '';
    populateExerciseOptions('');
    return;
  }

  const category = categoryName(item);
  categorySelect.value = category;
  populateExerciseOptions(category, exerciseId);
}

async function loadExerciseLibrary() {
  const { data, error } = await supabase
    .from('exercicios')
    .select('id,nome,grupo_muscular,equipamento')
    .or(`global.eq.true,personal_id.eq.${session.user.id}`)
    .order('nome');

  if (error) throw error;
  exerciseLibrary = data || [];

  const categories = [...new Set(exerciseLibrary.map(categoryName))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  if (categorySelect) {
    categorySelect.innerHTML = '<option value="">Selecione uma categoria</option>' +
      categories.map(category => `<option value="${category}">${category}</option>`).join('');
  }

  populateExerciseOptions('');
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
  if (categorySelect) categorySelect.value = '';
  populateExerciseOptions('');
}

function prepareExerciseEdit(id) {
  editingExerciseId = id;
  const selectedDay = Number(originalDaySelect?.value);
  setCheckedDays(selectedDay ? [selectedDay] : []);
  syncCategoryForExercise(form?.exercicio_id?.value || '');
}

async function getNextOrders(days) {
  if (!activeWorkoutId || !days.length) return {};

  const { data, error } = await supabase
    .from('treino_exercicios')
    .select('dia_semana,ordem')
    .eq('treino_id', activeWorkoutId)
    .in('dia_semana', days);

  if (error) throw error;

  const nextOrders = {};
  for (const day of days) {
    const maxOrder = (data || [])
      .filter(row => Number(row.dia_semana) === Number(day))
      .reduce((max, row) => Math.max(max, Number(row.ordem) || 0), 0);
    nextOrders[day] = maxOrder + 1;
  }
  return nextOrders;
}

categorySelect?.addEventListener('change', () => {
  populateExerciseOptions(categorySelect.value);
});

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
    showMessage(message, 'Selecione uma categoria e um exercício.', 'error');
    return;
  }

  const commonPayload = {
    treino_id: activeWorkoutId,
    exercicio_id: exerciseId,
    series: form.series.value ? Number(form.series.value) : null,
    repeticoes: form.repeticoes.value || null,
    carga: form.carga.value.trim() || null,
    descanso_segundos: form.descanso_segundos.value ? Number(form.descanso_segundos.value) : null,
    observacoes: form.observacoes.value.trim() || null
  };

  let error = null;

  try {
    if (editingExerciseId) {
      const [firstDay, ...extraDays] = days;
      const preservedOrder = Number(form.ordem.value || 1);
      const updateResult = await supabase
        .from('treino_exercicios')
        .update({ ...commonPayload, dia_semana: firstDay, ordem: preservedOrder })
        .eq('id', editingExerciseId)
        .eq('treino_id', activeWorkoutId);
      error = updateResult.error;

      if (!error && extraDays.length) {
        const nextOrders = await getNextOrders(extraDays);
        const insertResult = await supabase
          .from('treino_exercicios')
          .insert(extraDays.map(day => ({ ...commonPayload, dia_semana: day, ordem: nextOrders[day] })));
        error = insertResult.error;
      }
    } else {
      const nextOrders = await getNextOrders(days);
      const insertResult = await supabase
        .from('treino_exercicios')
        .insert(days.map(day => ({ ...commonPayload, dia_semana: day, ordem: nextOrders[day] })));
      error = insertResult.error;
    }
  } catch (saveError) {
    console.error('Erro ao calcular a ordem dos exercícios:', saveError);
    error = saveError;
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

try {
  await loadExerciseLibrary();
  await refreshActiveWorkoutDays();
} catch (error) {
  console.error(error);
  showMessage(message, 'Não foi possível carregar as categorias de exercícios.', 'error');
}