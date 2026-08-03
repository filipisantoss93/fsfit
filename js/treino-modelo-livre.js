import { supabase } from './supabase.js';
import { requireSession, showMessage } from './layout.js';

const session = await requireSession();
if (!session) throw new Error('Sessão inválida');

const alunoId = new URLSearchParams(location.search).get('id');
const message = document.querySelector('#workout-message');
const workoutForm = document.querySelector('#workout-form');
const exerciseForm = document.querySelector('#workout-exercise-form');
const newButton = document.querySelector('#new-workout-button');
const applyButton = document.querySelector('#apply-workout-button');
const modalApplyButton = document.querySelector('#workout-modal-activate');

let formMode = 'new';
const dayNames = {1:'Seg',2:'Ter',3:'Qua',4:'Qui',5:'Sex',6:'Sáb',7:'Dom'};

function selectedWorkoutId() {
  return document.querySelector('.workout-plan-row.selected[data-select-workout]')?.dataset.selectWorkout || null;
}

function notifyWorkoutUpdate(detail = {}) {
  const payload = { alunoId, ...detail };
  window.dispatchEvent(new CustomEvent('fsfit:workout-updated', { detail: payload }));
  document.dispatchEvent(new CustomEvent('fsfit:workout-updated', { detail: payload }));
}

function simplifyWorkoutForm() {
  if (!workoutForm) return;
  const weekdayGroup = document.querySelector('#weekday-options')?.closest('.form-group');
  if (weekdayGroup) weekdayGroup.hidden = true;
  if (!workoutForm.querySelector('.workout-template-note')) {
    const note = document.createElement('div');
    note.className = 'workout-template-note';
    note.innerHTML = '<strong>Crie primeiro a sequência do treino</strong>Os dias da semana serão escolhidos depois, no momento de aplicar este treino ao aluno.';
    workoutForm.prepend(note);
  }
  const submit = workoutForm.querySelector('[type="submit"]');
  if (submit) submit.textContent = 'Salvar treino';
}

async function saveTemplate(event) {
  if (!workoutForm || !alunoId) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const nome = workoutForm.nome.value.trim();
  if (!nome) return showMessage(message, 'Informe o nome do treino.', 'error');
  const dataInicio = workoutForm.data_inicio.value || null;
  const dataFim = workoutForm.data_fim.value || null;
  if (dataInicio && dataFim && dataFim < dataInicio) return showMessage(message, 'A data final não pode ser anterior à data inicial.', 'error');

  const payload = {
    nome,
    descricao: workoutForm.descricao.value.trim() || null,
    data_inicio: dataInicio,
    data_fim: dataFim,
    dias_semana: [1],
    modelo: true,
    status: 'inativo'
  };

  const editingId = formMode === 'edit' ? selectedWorkoutId() : null;
  let error;
  let savedWorkout = null;
  if (editingId) {
    const result = await supabase.from('treinos').update(payload).eq('id', editingId).eq('personal_id', session.user.id).select('id,nome,descricao,data_inicio,data_fim,dias_semana,modelo,status').single();
    error = result.error;
    savedWorkout = result.data;
  } else {
    const result = await supabase.from('treinos').insert({ ...payload, personal_id: session.user.id, aluno_id: alunoId }).select('id,nome,descricao,data_inicio,data_fim,dias_semana,modelo,status').single();
    error = result.error;
    savedWorkout = result.data;
  }
  if (error) return showMessage(message, editingId ? 'Não foi possível atualizar o treino.' : 'Não foi possível criar o treino.', 'error');

  showMessage(message, editingId ? 'Treino atualizado.' : 'Treino salvo. Agora adicione os exercícios e depois escolha os dias para aplicar.');
  notifyWorkoutUpdate({ action: editingId ? 'updated' : 'created', workout: savedWorkout });
  workoutForm.reset();
  formMode = 'new';
  simplifyWorkoutForm();
  document.querySelector('[data-close-workout-modal], #workout-modal-close')?.click();
}

function normalizeExerciseBuilder() {
  if (!exerciseForm) return;
  const weekdayGroup = document.querySelector('#exercise-weekday-options')?.closest('.form-group');
  if (weekdayGroup) weekdayGroup.hidden = true;
  document.querySelectorAll('#exercise-weekday-options input').forEach(input => { input.checked = input.value === '1'; });
  const hiddenDay = exerciseForm.querySelector('[name="dia_semana"]');
  if (hiddenDay) hiddenDay.value = '1';
  const title = document.querySelector('#exercise-modal-title');
  if (title && !title.textContent.includes('Editar')) title.textContent = 'Montar sequência do treino';
}

function openApplicationSheet(workoutId) {
  if (!workoutId) return;
  document.querySelector('.workout-application-sheet')?.remove();
  const sheet = document.createElement('div');
  sheet.className = 'workout-application-sheet';
  sheet.innerHTML = `<section class="workout-application-card" role="dialog" aria-modal="true" aria-labelledby="application-title">
    <h2 id="application-title">Aplicar treino</h2>
    <p>Escolha os dias em que esta sequência será exibida ao aluno. Você pode selecionar vários dias.</p>
    <div class="workout-application-days">${Object.entries(dayNames).map(([day,label]) => `<label><input type="checkbox" value="${day}"><span>${label}</span></label>`).join('')}</div>
    <div class="workout-application-actions"><button class="btn btn-neutral" type="button" data-cancel-application>Cancelar</button><button class="btn btn-primary" type="button" data-confirm-application>Aplicar treino</button></div>
  </section>`;
  document.body.append(sheet);
  document.body.classList.add('workout-application-open');
  sheet.querySelector('[data-cancel-application]').addEventListener('click', () => closeApplicationSheet(sheet));
  sheet.addEventListener('click', event => { if (event.target === sheet) closeApplicationSheet(sheet); });
  sheet.querySelector('[data-confirm-application]').addEventListener('click', () => applyTemplate(workoutId, sheet));
}

function closeApplicationSheet(sheet) {
  sheet?.remove();
  document.body.classList.remove('workout-application-open');
}

async function applyTemplate(workoutId, sheet) {
  const days = [...sheet.querySelectorAll('input:checked')].map(input => Number(input.value));
  if (!days.length) return showMessage(message, 'Selecione pelo menos um dia.', 'error');
  const confirmButton = sheet.querySelector('[data-confirm-application]');
  confirmButton.disabled = true;
  confirmButton.textContent = 'Aplicando...';

  const { data: baseRows, error: rowsError } = await supabase.from('treino_exercicios').select('*').eq('treino_id', workoutId).order('ordem');
  if (rowsError) return applicationError(confirmButton, 'Não foi possível carregar os exercícios.');
  const sourceRows = (baseRows || []).filter(row => Number(row.dia_semana) === 1);
  if (!sourceRows.length) return applicationError(confirmButton, 'Adicione exercícios antes de aplicar o treino.');

  const { error: deleteError } = await supabase.from('treino_exercicios').delete().eq('treino_id', workoutId);
  if (deleteError) return applicationError(confirmButton, 'Não foi possível preparar os dias do treino.');

  const copies = days.flatMap(day => sourceRows.map(({ id, created_at, updated_at, ...row }) => ({ ...row, dia_semana: day })));
  const { error: insertError } = await supabase.from('treino_exercicios').insert(copies);
  if (insertError) return applicationError(confirmButton, 'Não foi possível distribuir os exercícios nos dias escolhidos.');

  const { data: updatedWorkout, error: updateError } = await supabase.from('treinos').update({ dias_semana: days, modelo: false }).eq('id', workoutId).eq('personal_id', session.user.id).select('id,nome,descricao,data_inicio,data_fim,dias_semana,modelo,status').single();
  if (updateError) return applicationError(confirmButton, 'Não foi possível salvar os dias do treino.');

  const { error: activateError } = await supabase.rpc('fsfit_ativar_treino_aluno', { p_treino_id: workoutId });
  if (activateError) return applicationError(confirmButton, activateError.message || 'Não foi possível aplicar o treino.');

  closeApplicationSheet(sheet);
  showMessage(message, 'Treino aplicado nos dias selecionados.');
  notifyWorkoutUpdate({ action: 'applied', workout: { ...updatedWorkout, status: 'ativo' }, days });
}

function applicationError(button, text) {
  button.disabled = false;
  button.textContent = 'Aplicar treino';
  showMessage(message, text, 'error');
}

simplifyWorkoutForm();

newButton?.addEventListener('click', () => { formMode = 'new'; queueMicrotask(simplifyWorkoutForm); }, true);
document.querySelector('#workout-modal-edit')?.addEventListener('click', () => { formMode = 'edit'; queueMicrotask(simplifyWorkoutForm); }, true);
workoutForm?.addEventListener('submit', saveTemplate, true);
document.querySelector('#open-exercise-modal')?.addEventListener('click', () => setTimeout(normalizeExerciseBuilder, 0), true);
exerciseForm?.addEventListener('reset', () => setTimeout(normalizeExerciseBuilder, 0));

function interceptApply(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  openApplicationSheet(event.currentTarget.dataset.workoutId || selectedWorkoutId());
}
applyButton?.addEventListener('click', interceptApply, true);
modalApplyButton?.addEventListener('click', interceptApply, true);

const observer = new MutationObserver(() => {
  simplifyWorkoutForm();
  if (document.querySelector('#exercise-modal.open')) normalizeExerciseBuilder();
  document.querySelectorAll('.workout-day-header strong').forEach(strong => {
    if (strong.textContent.includes('Segunda-feira') && selectedWorkoutId()) strong.textContent = 'Sequência do treino';
  });
});
observer.observe(document.body, { childList: true, subtree: true });
