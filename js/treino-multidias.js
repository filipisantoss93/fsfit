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
const batchCategorySelect = document.querySelector('#exercise-category');
const singleCategorySelect = document.querySelector('#single-exercise-category');
const exerciseSelect = document.querySelector('#exercise-select');
const checkboxList = document.querySelector('#exercise-checkbox-list');
const selectedSection = document.querySelector('#selected-exercises-section');
const selectedBuilder = document.querySelector('#selected-exercises-builder');
const selectedCount = document.querySelector('#selected-exercises-count');
const batchSelector = document.querySelector('#batch-exercise-selector');
const singleEditor = document.querySelector('#single-exercise-editor');
const saveButton = document.querySelector('#save-exercise-batch');
const modalTitle = document.querySelector('#exercise-modal-title');
const workspace = document.querySelector('#active-workout-workspace');

let targetWorkoutId = null;
let allowedDays = [];
let editingExerciseId = null;
let exerciseLibrary = [];
let selectedExerciseIds = [];
const selectedConfigs = new Map();

if (originalDaySelect) {
  originalDaySelect.style.display = 'none';
  originalDaySelect.required = false;
}

const repetitionsField = form?.repeticoes?.closest('.form-group');
const prescriptionTypeField = document.createElement('div');
prescriptionTypeField.className = 'form-group';
prescriptionTypeField.innerHTML = '<label>Tipo de prescrição</label><input id="exercise-prescription-type" type="text" value="Repetições" readonly>';
repetitionsField?.parentElement?.insertBefore(prescriptionTypeField, repetitionsField);

const durationInput = form?.duracao_minutos;
const distanceInput = form?.distancia_km;
const durationField = document.createElement('div');
durationField.className = 'form-group hidden';
durationField.innerHTML = '<label>Duração (minutos)</label>';
if (durationInput) {
  durationInput.type = 'number';
  durationInput.min = '0';
  durationInput.step = '0.5';
  durationInput.placeholder = 'Ex.: 30';
  durationField.appendChild(durationInput);
}
repetitionsField?.parentElement?.insertBefore(durationField, repetitionsField?.nextSibling || null);

const distanceField = document.createElement('div');
distanceField.className = 'form-group hidden';
distanceField.innerHTML = '<label>Distância (km)</label>';
if (distanceInput) {
  distanceInput.type = 'number';
  distanceInput.min = '0';
  distanceInput.step = '0.1';
  distanceInput.placeholder = 'Ex.: 5';
  distanceField.appendChild(distanceInput);
}
durationField.parentElement?.insertBefore(distanceField, durationField.nextSibling);


function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
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

function prescriptionLabel(type) {
  return { repeticoes: 'Repetições', tempo: 'Tempo', distancia: 'Distância' }[type] || 'Repetições';
}

function exerciseById(id) {
  return exerciseLibrary.find(item => item.id === id) || null;
}

function defaultConfig(item) {
  const type = item?.tipo_prescricao || 'repeticoes';
  return {
    series: '4',
    repeticoes: type === 'repeticoes' ? '12' : '',
    duracao_minutos: '',
    distancia_km: '',
    carga: '',
    descanso_segundos: '60',
    observacoes: '',
    tipo_prescricao: type
  };
}

function seriesOptions(selected = '') {
  return '<option value="">—</option>' + Array.from({ length: 10 }, (_, index) => index + 1)
    .map(value => `<option value="${value}"${String(value) === String(selected) ? ' selected' : ''}>${value}</option>`).join('');
}

function prescriptionInput(item, config) {
  const type = item.tipo_prescricao || 'repeticoes';
  if (type === 'tempo') {
    return `<div class="form-group"><label>Duração (min)</label><input data-config-field="duracao_minutos" type="number" min="0" step="0.5" inputmode="decimal" value="${esc(config.duracao_minutos)}" placeholder="30"></div>`;
  }
  if (type === 'distancia') {
    return `<div class="form-group"><label>Distância (km)</label><input data-config-field="distancia_km" type="number" min="0" step="0.1" inputmode="decimal" value="${esc(config.distancia_km)}" placeholder="5"></div>`;
  }
  return `<div class="form-group"><label>Repetições</label><input data-config-field="repeticoes" inputmode="numeric" value="${esc(config.repeticoes)}" placeholder="12"></div>`;
}

function configSummary(item, config) {
  const type = item?.tipo_prescricao || 'repeticoes';
  const parts = [];
  if (config.series) parts.push(`${config.series} séries`);
  if (type === 'tempo' && config.duracao_minutos) parts.push(`${config.duracao_minutos} min`);
  else if (type === 'distancia' && config.distancia_km) parts.push(`${config.distancia_km} km`);
  else if (config.repeticoes) parts.push(`${config.repeticoes} rep.`);
  if (config.carga) parts.push(config.carga);
  if (config.descanso_segundos) parts.push(`${config.descanso_segundos}s`);
  return parts.join(' · ') || 'Toque para configurar';
}

function renderSelectedBuilder() {
  const items = selectedExerciseIds.map(exerciseById).filter(Boolean);
  selectedSection?.classList.toggle('hidden', items.length === 0);
  if (selectedCount) selectedCount.textContent = String(items.length);
  if (saveButton && !editingExerciseId) saveButton.textContent = items.length ? `Adicionar ${items.length} ${items.length === 1 ? 'exercício' : 'exercícios'}` : 'Adicionar exercícios';
  if (!selectedBuilder) return;

  selectedBuilder.innerHTML = items.map((item, index) => {
    const config = selectedConfigs.get(item.id) || defaultConfig(item);
    selectedConfigs.set(item.id, config);
    return `<article class="selected-exercise-card" data-selected-exercise="${item.id}">
      <div class="selected-exercise-card-head">
        <span class="selected-exercise-order">${index + 1}</span>
        <button class="selected-exercise-toggle" type="button" data-toggle-selected-config="${item.id}" aria-expanded="false">
          <span class="selected-exercise-title"><strong>${esc(item.nome)}</strong><small class="selected-exercise-summary">${esc(configSummary(item, config))}</small></span>
          <span class="selected-exercise-chevron" aria-hidden="true">›</span>
        </button>
        <button class="selected-exercise-remove" type="button" data-remove-selected="${item.id}" aria-label="Remover ${esc(item.nome)}">×</button>
      </div>
      <div class="selected-exercise-config-panel" hidden>
        <div class="selected-exercise-config-grid">
          <div class="form-group"><label>Séries</label><select data-config-field="series">${seriesOptions(config.series)}</select></div>
          ${prescriptionInput(item, config)}
          <div class="form-group"><label>Carga</label><input data-config-field="carga" value="${esc(config.carga)}" placeholder="Opcional"></div>
          <div class="form-group"><label>Descanso (s)</label><input data-config-field="descanso_segundos" type="number" min="0" step="5" value="${esc(config.descanso_segundos)}" placeholder="60"></div>
        </div>
        <div class="form-group selected-exercise-notes"><label>Observações</label><textarea data-config-field="observacoes" placeholder="Técnica, intensidade, cadência...">${esc(config.observacoes)}</textarea></div>
      </div>
    </article>`;
  }).join('');
}

function updateCardSummary(card, id) {
  const item = exerciseById(id);
  const config = selectedConfigs.get(id) || defaultConfig(item);
  const summary = card?.querySelector('.selected-exercise-summary');
  if (summary) summary.textContent = configSummary(item, config);
}

function renderExerciseCheckboxes(category) {
  if (!checkboxList) return;
  if (!category) {
    checkboxList.innerHTML = '<p class="empty">Selecione uma categoria para ver os exercícios.</p>';
    return;
  }
  const filtered = exerciseLibrary.filter(item => categoryName(item) === category);
  if (!filtered.length) {
    checkboxList.innerHTML = '<p class="empty">Nenhum exercício nesta categoria.</p>';
    return;
  }
  checkboxList.innerHTML = filtered.map(item => {
    const checked = selectedExerciseIds.includes(item.id);
    const detail = [item.equipamento, prescriptionLabel(item.tipo_prescricao)].filter(Boolean).join(' · ');
    return `<label class="exercise-checkbox-option${checked ? ' selected' : ''}">
      <input type="checkbox" value="${item.id}"${checked ? ' checked' : ''}>
      <span><strong>${esc(item.nome)}</strong><small>${esc(detail)}</small></span>
    </label>`;
  }).join('');
}

function populateSingleExerciseOptions(category, selectedExerciseId = '') {
  if (!exerciseSelect) return;
  if (!category) {
    exerciseSelect.innerHTML = '<option value="">Selecione uma categoria primeiro</option>';
    exerciseSelect.disabled = true;
    return;
  }
  const filtered = exerciseLibrary.filter(item => categoryName(item) === category);
  exerciseSelect.innerHTML = '<option value="">Selecione</option>' + filtered.map(item => `<option value="${item.id}">${esc(item.nome)}${item.equipamento ? ` — ${esc(item.equipamento)}` : ''}</option>`).join('');
  exerciseSelect.disabled = false;
  if (selectedExerciseId) exerciseSelect.value = selectedExerciseId;
}

function syncSinglePrescriptionUI(type = 'repeticoes') {
  const normalized = ['repeticoes', 'tempo', 'distancia'].includes(type) ? type : 'repeticoes';
  const typeInput = document.querySelector('#exercise-prescription-type');
  if (typeInput) typeInput.value = prescriptionLabel(normalized);
  repetitionsField?.classList.toggle('hidden', normalized !== 'repeticoes');
  durationField.classList.toggle('hidden', normalized !== 'tempo');
  distanceField.classList.toggle('hidden', normalized !== 'distancia');
}

function syncSingleCategoryForExercise(exerciseId) {
  const item = exerciseById(exerciseId);
  if (!item || !singleCategorySelect) return;
  const category = categoryName(item);
  singleCategorySelect.value = category;
  populateSingleExerciseOptions(category, item.id);
  syncSinglePrescriptionUI(item.tipo_prescricao || 'repeticoes');
}

async function loadExerciseLibrary() {
  const { data, error } = await supabase
    .from('exercicios')
    .select('id,nome,grupo_muscular,equipamento,tipo_prescricao')
    .or(`global.eq.true,personal_id.eq.${session.user.id}`)
    .order('nome');
  if (error) throw error;
  exerciseLibrary = (data || []).map(item => ({ ...item, tipo_prescricao: item.tipo_prescricao || 'repeticoes' }));
  const categories = [...new Set(exerciseLibrary.map(categoryName))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const options = '<option value="">Selecione uma categoria</option>' + categories.map(category => `<option value="${esc(category)}">${esc(category)}</option>`).join('');
  if (batchCategorySelect) batchCategorySelect.innerHTML = options;
  if (singleCategorySelect) singleCategorySelect.innerHTML = options;
  renderExerciseCheckboxes('');
}

async function refreshTargetWorkout() {
  const workspaceId = workspace?.dataset.workoutId || '';
  if (workspaceId) {
    targetWorkoutId = workspaceId;
    try {
      allowedDays = JSON.parse(workspace?.dataset.workoutDays || '[]').map(Number);
    } catch {
      allowedDays = [];
    }
    setCheckedDays([]);
    return;
  }

  if (!alunoId) return;
  const { data } = await supabase.from('treinos').select('id,dias_semana').eq('aluno_id', alunoId).eq('personal_id', session.user.id).eq('status', 'ativo').maybeSingle();
  targetWorkoutId = data?.id || null;
  allowedDays = (data?.dias_semana || []).map(Number);
  setCheckedDays([]);
}

async function prepareNewExercise() {
  editingExerciseId = null;
  selectedExerciseIds = [];
  selectedConfigs.clear();
  await refreshTargetWorkout();
  if (batchCategorySelect) batchCategorySelect.value = '';
  batchSelector?.classList.remove('hidden');
  singleEditor?.classList.add('hidden');
  if (modalTitle) modalTitle.textContent = 'Montar sequência';
  renderExerciseCheckboxes('');
  renderSelectedBuilder();
}

async function prepareExerciseEdit(id) {
  editingExerciseId = id;
  await refreshTargetWorkout();
  batchSelector?.classList.add('hidden');
  singleEditor?.classList.remove('hidden');
  if (modalTitle) modalTitle.textContent = 'Editar exercício';
  if (saveButton) saveButton.textContent = 'Salvar alteração';
  const selectedDay = Number(originalDaySelect?.value);
  setCheckedDays(selectedDay ? [selectedDay] : []);

  const { data } = await supabase.from('treino_exercicios').select('duracao_minutos,distancia_km,exercicio_id,treino_id').eq('id', id).maybeSingle();
  if (data?.treino_id) targetWorkoutId = data.treino_id;
  const exerciseId = data?.exercicio_id || form?.exercicio_id?.value || '';
  syncSingleCategoryForExercise(exerciseId);
  if (form?.duracao_minutos) form.duracao_minutos.value = data?.duracao_minutos ?? '';
  if (form?.distancia_km) form.distancia_km.value = data?.distancia_km ?? '';
}

async function getNextOrders(days) {
  if (!targetWorkoutId || !days.length) return {};
  const { data, error } = await supabase.from('treino_exercicios').select('dia_semana,ordem').eq('treino_id', targetWorkoutId).in('dia_semana', days);
  if (error) throw error;
  const nextOrders = {};
  for (const day of days) {
    const maxOrder = (data || []).filter(row => Number(row.dia_semana) === Number(day)).reduce((max, row) => Math.max(max, Number(row.ordem) || 0), 0);
    nextOrders[day] = maxOrder + 1;
  }
  return nextOrders;
}

batchCategorySelect?.addEventListener('change', () => renderExerciseCheckboxes(batchCategorySelect.value));
singleCategorySelect?.addEventListener('change', () => populateSingleExerciseOptions(singleCategorySelect.value));
exerciseSelect?.addEventListener('change', () => syncSinglePrescriptionUI(exerciseById(exerciseSelect.value)?.tipo_prescricao || 'repeticoes'));

checkboxList?.addEventListener('change', event => {
  const input = event.target.closest('input[type="checkbox"]');
  if (!input) return;
  const id = input.value;
  if (input.checked) {
    if (!selectedExerciseIds.includes(id)) selectedExerciseIds.push(id);
    if (!selectedConfigs.has(id)) selectedConfigs.set(id, defaultConfig(exerciseById(id)));
  } else {
    selectedExerciseIds = selectedExerciseIds.filter(item => item !== id);
    selectedConfigs.delete(id);
  }
  renderExerciseCheckboxes(batchCategorySelect?.value || '');
  renderSelectedBuilder();
});

function syncConfigFromEvent(event) {
  const card = event.target.closest('[data-selected-exercise]');
  const field = event.target.dataset.configField;
  if (!card || !field) return;
  const id = card.dataset.selectedExercise;
  const config = selectedConfigs.get(id) || defaultConfig(exerciseById(id));
  config[field] = event.target.value;
  selectedConfigs.set(id, config);
  updateCardSummary(card, id);
}

selectedBuilder?.addEventListener('input', syncConfigFromEvent);
selectedBuilder?.addEventListener('change', syncConfigFromEvent);

selectedBuilder?.addEventListener('click', event => {
  const remove = event.target.closest('[data-remove-selected]');
  if (remove) {
    const id = remove.dataset.removeSelected;
    selectedExerciseIds = selectedExerciseIds.filter(item => item !== id);
    selectedConfigs.delete(id);
    renderExerciseCheckboxes(batchCategorySelect?.value || '');
    renderSelectedBuilder();
    return;
  }

  const toggle = event.target.closest('[data-toggle-selected-config]');
  if (!toggle) return;
  const card = toggle.closest('[data-selected-exercise]');
  const panel = card?.querySelector('.selected-exercise-config-panel');
  if (!card || !panel) return;
  const expanded = !card.classList.contains('expanded');
  card.classList.toggle('expanded', expanded);
  panel.hidden = !expanded;
  toggle.setAttribute('aria-expanded', String(expanded));
});

document.querySelector('#open-exercise-modal')?.addEventListener('click', () => setTimeout(() => prepareNewExercise(), 0));
document.addEventListener('click', event => {
  const detailRow = event.target.closest('[data-open-exercise-detail]');
  if (detailRow) editingExerciseId = detailRow.dataset.openExerciseDetail;
  if (event.target.closest('#exercise-detail-edit')) setTimeout(() => prepareExerciseEdit(editingExerciseId), 0);
});

window.addEventListener('fsfit-workout-selection-changed', () => {
  refreshTargetWorkout().catch(console.error);
});

form?.addEventListener('submit', async event => {
  event.preventDefault();
  event.stopImmediatePropagation();

  const days = checkedDays();
  if (!days.length) return showMessage(message, 'Selecione pelo menos um dia da semana.', 'error');
  if (!targetWorkoutId) await refreshTargetWorkout();
  if (!targetWorkoutId) return showMessage(message, 'Selecione um plano antes de adicionar exercícios.', 'error');

  saveButton.disabled = true;
  try {
    const savedWorkoutId = targetWorkoutId;
    const wasEditing = Boolean(editingExerciseId);
    const addedCount = selectedExerciseIds.length;

    if (editingExerciseId) {
      const exerciseId = form.exercicio_id.value;
      const exercise = exerciseById(exerciseId);
      if (!exercise) return showMessage(message, 'Selecione um exercício.', 'error');
      const type = exercise.tipo_prescricao || 'repeticoes';
      const duration = form.duracao_minutos?.value ? Number(form.duracao_minutos.value) : null;
      const distance = form.distancia_km?.value ? Number(form.distancia_km.value) : null;
      if (type === 'tempo' && !duration) return showMessage(message, 'Informe a duração do exercício em minutos.', 'error');
      if (type === 'distancia' && !distance) return showMessage(message, 'Informe a distância do exercício em quilômetros.', 'error');
      const [firstDay] = days;
      const payload = {
        treino_id: savedWorkoutId,
        exercicio_id: exerciseId,
        dia_semana: firstDay,
        ordem: Number(form.ordem.value || 1),
        series: form.series.value ? Number(form.series.value) : null,
        repeticoes: type === 'repeticoes' ? (form.repeticoes.value || null) : null,
        duracao_minutos: type === 'tempo' ? duration : null,
        distancia_km: type === 'distancia' ? distance : null,
        carga: form.carga.value.trim() || null,
        descanso_segundos: form.descanso_segundos.value ? Number(form.descanso_segundos.value) : null,
        observacoes: form.observacoes.value.trim() || null
      };
      const { error } = await supabase.from('treino_exercicios').update(payload).eq('id', editingExerciseId).eq('treino_id', savedWorkoutId);
      if (error) throw error;
    } else {
      if (!selectedExerciseIds.length) return showMessage(message, 'Selecione pelo menos um exercício.', 'error');
      const nextOrders = await getNextOrders(days);
      const rows = [];

      for (const day of days) {
        selectedExerciseIds.forEach((exerciseId, index) => {
          const exercise = exerciseById(exerciseId);
          const config = selectedConfigs.get(exerciseId) || defaultConfig(exercise);
          const type = exercise?.tipo_prescricao || 'repeticoes';
          const duration = config.duracao_minutos ? Number(config.duracao_minutos) : null;
          const distance = config.distancia_km ? Number(config.distancia_km) : null;
          if (type === 'tempo' && !duration) throw new Error(`Informe a duração de “${exercise.nome}”.`);
          if (type === 'distancia' && !distance) throw new Error(`Informe a distância de “${exercise.nome}”.`);
          rows.push({
            treino_id: savedWorkoutId,
            exercicio_id: exerciseId,
            dia_semana: day,
            ordem: nextOrders[day] + index,
            series: config.series ? Number(config.series) : null,
            repeticoes: type === 'repeticoes' ? (config.repeticoes || null) : null,
            duracao_minutos: type === 'tempo' ? duration : null,
            distancia_km: type === 'distancia' ? distance : null,
            carga: config.carga?.trim() || null,
            descanso_segundos: config.descanso_segundos ? Number(config.descanso_segundos) : null,
            observacoes: config.observacoes?.trim() || null
          });
        });
      }

      const { error } = await supabase.from('treino_exercicios').insert(rows);
      if (error) throw error;
    }

    modal?.classList.remove('open');
    modal?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('workout-modal-open');
    showMessage(message, wasEditing ? 'Exercício atualizado com sucesso.' : `${addedCount} ${addedCount === 1 ? 'exercício adicionado' : 'exercícios adicionados'} ao plano.`);

    selectedExerciseIds = [];
    selectedConfigs.clear();
    editingExerciseId = null;
    window.dispatchEvent(new CustomEvent('fsfit-workout-exercises-updated', {
      detail: { workoutId: savedWorkoutId }
    }));
  } catch (error) {
    console.error('Erro ao salvar exercícios:', error);
    showMessage(message, error.message || 'Não foi possível salvar os exercícios.', 'error');
  } finally {
    saveButton.disabled = false;
  }
}, true);

try {
  await loadExerciseLibrary();
  await refreshTargetWorkout();
} catch (error) {
  console.error(error);
  showMessage(message, 'Não foi possível carregar a biblioteca de exercícios.', 'error');
}

