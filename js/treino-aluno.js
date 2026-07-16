import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('alunos');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const alunoId = new URLSearchParams(location.search).get('id');
const message = document.querySelector('#workout-message');
const workoutList = document.querySelector('#workout-list');
const workoutModal = document.querySelector('#workout-modal');
const workoutModalTitle = document.querySelector('#workout-modal-title');
const workoutModalView = document.querySelector('#workout-modal-view');
const workoutModalBody = document.querySelector('#workout-modal-body');
const workoutModalActivate = document.querySelector('#workout-modal-activate');
const workoutModalEdit = document.querySelector('#workout-modal-edit');
const workoutModalDelete = document.querySelector('#workout-modal-delete');
const workoutForm = document.querySelector('#workout-form');
const newWorkoutButton = document.querySelector('#new-workout-button');
const cancelWorkoutEdit = document.querySelector('#cancel-workout-edit');
const activeWorkoutTitle = document.querySelector('#active-workout-title');
const activeWorkoutSummary = document.querySelector('#active-workout-summary');
const activeWorkoutDetails = document.querySelector('#active-workout-details');
const activeWorkoutWorkspace = document.querySelector('#active-workout-workspace');
const workoutExerciseForm = document.querySelector('#workout-exercise-form');
const exerciseSelect = document.querySelector('#exercise-select');
const workoutDaySelect = workoutExerciseForm.querySelector('[name="dia_semana"]');
const workoutDays = document.querySelector('#workout-days');
const exerciseModal = document.querySelector('#exercise-modal');
const exerciseDetailModal = document.querySelector('#exercise-detail-modal');
const exerciseDetailTitle = document.querySelector('#exercise-detail-title');
const exerciseDetailBody = document.querySelector('#exercise-detail-body');
const exerciseDetailEdit = document.querySelector('#exercise-detail-edit');
const exerciseDetailDelete = document.querySelector('#exercise-detail-delete');
const openExerciseModalButton = document.querySelector('#open-exercise-modal');

let treinoId = null;
let selectedWorkoutId = null;
let editingWorkoutId = null;
let selectedExerciseId = null;
let editingExerciseId = null;
let workoutsCache = [];
let workoutExercisesCache = [];

const dayNames = { 1: 'Segunda-feira', 2: 'Terça-feira', 3: 'Quarta-feira', 4: 'Quinta-feira', 5: 'Sexta-feira', 6: 'Sábado', 7: 'Domingo' };

if (!alunoId) {
  showMessage(message, 'Aluno não informado.', 'error');
  throw new Error('Aluno não informado');
}

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function formatDate(value) {
  if (!value) return 'Não informada';
  const [year, month, day] = String(value).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function selectedDays() {
  return [...document.querySelectorAll('#weekday-options input:checked')].map(input => Number(input.value));
}

function setSelectedDays(days = []) {
  document.querySelectorAll('#weekday-options input').forEach(input => {
    input.checked = days.map(Number).includes(Number(input.value));
  });
}

function activeWorkout() {
  return workoutsCache.find(item => item.id === treinoId) || null;
}

function updateWorkoutDayOptions(days = activeWorkout()?.dias_semana || []) {
  const current = workoutDaySelect.value;
  const orderedDays = [1, 2, 3, 4, 5, 6, 7].filter(day => (days || []).map(Number).includes(day));
  workoutDaySelect.innerHTML = orderedDays.length
    ? '<option value="">Selecione</option>' + orderedDays.map(day => `<option value="${day}">${dayNames[day]}</option>`).join('')
    : '<option value="">Configure os dias do treino ativo</option>';
  workoutDaySelect.disabled = orderedDays.length === 0;
  if (orderedDays.includes(Number(current))) workoutDaySelect.value = current;
}

function closeWorkoutModal() {
  workoutModal.classList.remove('open');
  workoutModal.setAttribute('aria-hidden', 'true');
  selectedWorkoutId = null;
  editingWorkoutId = null;
  workoutForm.reset();
  workoutForm.classList.add('hidden');
  workoutModalView.classList.remove('hidden');
  syncBodyModalState();
}

function fillWorkoutForm(workout = null) {
  editingWorkoutId = workout?.id || null;
  workoutForm.nome.value = workout?.nome || '';
  workoutForm.descricao.value = workout?.descricao || '';
  workoutForm.data_inicio.value = workout?.data_inicio || '';
  workoutForm.data_fim.value = workout?.data_fim || '';
  setSelectedDays(workout?.dias_semana || []);
}

function showWorkoutForm(workout = null) {
  fillWorkoutForm(workout);
  workoutModalTitle.textContent = workout ? 'Editar plano de treino' : 'Novo plano de treino';
  workoutModalView.classList.add('hidden');
  workoutForm.classList.remove('hidden');
  workoutModal.classList.add('open');
  workoutModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('workout-modal-open');
  setTimeout(() => workoutForm.nome.focus(), 0);
}

function openWorkoutModal(id) {
  const workout = workoutsCache.find(item => item.id === id);
  if (!workout) return;
  selectedWorkoutId = workout.id;
  const days = (workout.dias_semana || []).map(Number).map(day => dayNames[day]).filter(Boolean).join(', ') || 'Nenhum dia configurado';
  workoutModalTitle.textContent = workout.nome || 'Plano de treino';
  workoutModalBody.innerHTML = `
    <div class="workout-detail"><small>Status</small><strong>${workout.status === 'ativo' ? 'Plano ativo' : 'Plano inativo'}</strong></div>
    <div class="workout-detail"><small>Período</small><strong>${esc(formatDate(workout.data_inicio))} → ${esc(formatDate(workout.data_fim))}</strong></div>
    <div class="workout-detail"><small>Dias da semana</small><p>${esc(days)}</p></div>
    <div class="workout-detail"><small>Descrição</small><p>${esc(workout.descricao || 'Nenhuma descrição informada.')}</p></div>`;
  workoutModalActivate.classList.toggle('hidden', workout.status === 'ativo');
  workoutForm.classList.add('hidden');
  workoutModalView.classList.remove('hidden');
  workoutModal.classList.add('open');
  workoutModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('workout-modal-open');
}

function openExerciseModal(exerciseId = null) {
  if (!treinoId) return showMessage(message, 'Crie ou ative um plano de treino antes de adicionar exercícios.', 'error');
  const workout = activeWorkout();
  updateWorkoutDayOptions(workout?.dias_semana || []);
  editingExerciseId = exerciseId;
  const data = exerciseId ? workoutExercisesCache.find(item => item.id === exerciseId) : null;
  workoutExerciseForm.reset();
  workoutExerciseForm.ordem.value = data?.ordem || 1;
  workoutExerciseForm.dia_semana.value = data?.dia_semana != null ? String(data.dia_semana) : '';
  workoutExerciseForm.exercicio_id.value = data?.exercicio_id || '';
  workoutExerciseForm.series.value = data?.series ?? '';
  workoutExerciseForm.repeticoes.value = data?.repeticoes || '';
  workoutExerciseForm.carga.value = data?.carga || '';
  workoutExerciseForm.descanso_segundos.value = data?.descanso_segundos ?? '';
  workoutExerciseForm.observacoes.value = data?.observacoes || '';
  document.querySelector('#exercise-modal-title').textContent = data ? 'Editar exercício' : 'Novo exercício';
  workoutExerciseForm.querySelector('[type="submit"]').textContent = data ? 'Salvar alteração' : 'Salvar exercício';
  exerciseModal.classList.add('open');
  exerciseModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('workout-modal-open');
}

function closeExerciseModal() {
  exerciseModal.classList.remove('open');
  exerciseModal.setAttribute('aria-hidden', 'true');
  editingExerciseId = null;
  syncBodyModalState();
}

function openExerciseDetailModal(id) {
  const row = workoutExercisesCache.find(item => item.id === id);
  if (!row) return;
  selectedExerciseId = id;
  const ex = row.exercicios || {};
  exerciseDetailTitle.textContent = ex.nome || 'Exercício';
  exerciseDetailBody.innerHTML = `
    <div class="workout-detail"><small>Dia</small><strong>${esc(dayNames[row.dia_semana] || 'Não informado')}</strong></div>
    <div class="workout-detail"><small>Grupo / equipamento</small><p>${esc([ex.grupo_muscular, ex.equipamento].filter(Boolean).join(' • ') || 'Não informado')}</p></div>
    <div class="workout-detail-grid">
      <div class="workout-detail"><small>Séries</small><strong>${esc(String(row.series ?? '—'))}</strong></div>
      <div class="workout-detail"><small>Repetições</small><strong>${esc(row.repeticoes || '—')}</strong></div>
      <div class="workout-detail"><small>Carga</small><strong>${esc(row.carga || '—')}</strong></div>
      <div class="workout-detail"><small>Descanso</small><strong>${row.descanso_segundos ? `${row.descanso_segundos}s` : '—'}</strong></div>
    </div>
    <div class="workout-detail"><small>Observações</small><p>${esc(row.observacoes || 'Nenhuma observação informada.')}</p></div>
    ${ex.instrucoes ? `<div class="workout-detail"><small>Instruções</small><p>${esc(ex.instrucoes)}</p></div>` : ''}`;
  exerciseDetailModal.classList.add('open');
  exerciseDetailModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('workout-modal-open');
}

function closeExerciseDetailModal() {
  exerciseDetailModal.classList.remove('open');
  exerciseDetailModal.setAttribute('aria-hidden', 'true');
  selectedExerciseId = null;
  syncBodyModalState();
}

function syncBodyModalState() {
  const anyOpen = [workoutModal, exerciseModal, exerciseDetailModal].some(modal => modal.classList.contains('open'));
  document.body.classList.toggle('workout-modal-open', anyOpen);
}

async function loadStudent() {
  const { data, error } = await supabase.from('alunos').select('id,nome').eq('id', alunoId).eq('personal_id', session.user.id).single();
  if (error) throw error;
  document.querySelector('#student-name').textContent = `Treino · ${data.nome}`;
  document.querySelector('#back-link').href = `ficha-aluno.html?id=${data.id}`;
}

async function loadWorkouts() {
  const { data, error } = await supabase
    .from('treinos')
    .select('id,nome,descricao,dias_semana,data_inicio,data_fim,status,created_at,updated_at')
    .eq('aluno_id', alunoId)
    .eq('personal_id', session.user.id)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  workoutsCache = data || [];
  const active = workoutsCache.find(item => item.status === 'ativo') || null;
  treinoId = active?.id || null;
  renderWorkoutList();
  renderActiveWorkout();
  updateWorkoutDayOptions(active?.dias_semana || []);
  await loadWorkoutExercises();
}

function renderWorkoutList() {
  if (!workoutsCache.length) {
    workoutList.innerHTML = '<div class="workout-plan-empty"><strong>Nenhum plano de treino cadastrado.</strong><span>Crie o primeiro treino para começar a adicionar exercícios.</span></div>';
    return;
  }
  workoutList.innerHTML = workoutsCache.map(workout => {
    const days = (workout.dias_semana || []).map(Number).map(day => dayNames[day]?.replace('-feira', '')).filter(Boolean).join(', ') || 'Dias não definidos';
    return `<button class="workout-plan-row ${workout.status === 'ativo' ? 'active' : ''}" type="button" data-open-workout="${workout.id}">
      <span class="workout-plan-row-main">
        <span class="workout-plan-row-title"><strong>${esc(workout.nome)}</strong>${workout.status === 'ativo' ? '<em>ATIVO</em>' : ''}</span>
        <span class="workout-plan-row-meta">${esc(formatDate(workout.data_inicio))} → ${esc(formatDate(workout.data_fim))}</span>
        <span class="workout-plan-row-note">${esc(days)}</span>
      </span><span class="workout-row-arrow">›</span></button>`;
  }).join('');
}

function renderActiveWorkout() {
  const workout = activeWorkout();
  const enabled = Boolean(workout);
  activeWorkoutWorkspace.classList.toggle('workout-disabled', !enabled);
  activeWorkoutDetails.disabled = !enabled;
  openExerciseModalButton.disabled = !enabled;
  if (!workout) {
    activeWorkoutTitle.textContent = 'Nenhum treino ativo';
    activeWorkoutSummary.innerHTML = '<p>Crie um plano de treino ou torne um treino existente ativo para adicionar exercícios.</p>';
    return;
  }
  const days = (workout.dias_semana || []).map(Number).map(day => dayNames[day]).filter(Boolean).join(', ') || 'Nenhum dia configurado';
  activeWorkoutTitle.textContent = workout.nome;
  activeWorkoutSummary.innerHTML = `
    <div><small>Período</small><strong>${esc(formatDate(workout.data_inicio))} → ${esc(formatDate(workout.data_fim))}</strong></div>
    <div><small>Dias de treino</small><strong>${esc(days)}</strong></div>
    <div class="wide"><small>Descrição</small><p>${esc(workout.descricao || 'Nenhuma descrição informada.')}</p></div>`;
}

async function loadExerciseLibrary() {
  const { data, error } = await supabase.from('exercicios').select('id,nome,grupo_muscular,equipamento').or(`global.eq.true,personal_id.eq.${session.user.id}`).order('nome');
  if (error) throw error;
  exerciseSelect.innerHTML = '<option value="">Selecione</option>' + (data || []).map(item => {
    const detail = [item.grupo_muscular, item.equipamento].filter(Boolean).join(' • ');
    return `<option value="${item.id}">${esc(item.nome)}${detail ? ` — ${esc(detail)}` : ''}</option>`;
  }).join('');
}

async function loadWorkoutExercises() {
  if (!treinoId) {
    workoutExercisesCache = [];
    workoutDays.innerHTML = '<p class="empty">Nenhum plano de treino ativo.</p>';
    return;
  }
  const { data, error } = await supabase
    .from('treino_exercicios')
    .select('id,treino_id,exercicio_id,dia_semana,ordem,series,repeticoes,carga,descanso_segundos,observacoes,exercicios(nome,grupo_muscular,equipamento,instrucoes,video_url)')
    .eq('treino_id', treinoId)
    .order('dia_semana').order('ordem');
  if (error) throw error;
  workoutExercisesCache = data || [];
  if (!workoutExercisesCache.length) {
    workoutDays.innerHTML = '<p class="empty">Nenhum exercício cadastrado no treino ativo.</p>';
    return;
  }
  const groups = workoutExercisesCache.reduce((acc, row) => {
    (acc[row.dia_semana] ||= []).push(row);
    return acc;
  }, {});
  workoutDays.innerHTML = [1,2,3,4,5,6,7].map(day => {
    const rows = groups[day] || [];
    if (!rows.length) return '';
    return `<section class="workout-day-section">
      <div class="workout-day-header"><div><small>DIA ${day}</small><strong>${dayNames[day]}</strong></div><span>${rows.length} ${rows.length === 1 ? 'exercício' : 'exercícios'}</span></div>
      <div class="workout-exercise-list">${rows.map(row => `<button class="workout-exercise-row" type="button" data-open-exercise-detail="${row.id}">
        <span class="workout-exercise-order">${row.ordem || '—'}</span>
        <span class="workout-exercise-main"><strong>${esc(row.exercicios?.nome || '')}</strong><span>${esc([row.series ? `${row.series} séries` : null, row.repeticoes, row.carga].filter(Boolean).join(' • ') || 'Ver detalhes')}</span></span>
        <span class="workout-row-arrow">›</span></button>`).join('')}</div>
    </section>`;
  }).join('');
}

async function setActiveWorkout(id) {
  const target = workoutsCache.find(item => item.id === id);
  if (!target) return;
  const { error: deactivateError } = await supabase.from('treinos').update({ status: 'inativo' }).eq('aluno_id', alunoId).eq('personal_id', session.user.id).neq('id', id);
  if (deactivateError) return showMessage(message, 'Não foi possível atualizar o treino ativo.', 'error');
  const { error } = await supabase.from('treinos').update({ status: 'ativo' }).eq('id', id).eq('personal_id', session.user.id);
  if (error) return showMessage(message, 'Não foi possível ativar o treino.', 'error');
  closeWorkoutModal();
  showMessage(message, `Treino “${target.nome}” definido como ativo.`);
  await loadWorkouts();
}

async function deleteWorkout(id) {
  const workout = workoutsCache.find(item => item.id === id);
  if (!workout || !confirm(`Excluir o treino “${workout.nome}”? Todos os exercícios vinculados também serão removidos.`)) return;
  const wasActive = workout.status === 'ativo';
  const { error } = await supabase.from('treinos').delete().eq('id', id).eq('aluno_id', alunoId).eq('personal_id', session.user.id);
  if (error) return showMessage(message, 'Não foi possível excluir o treino.', 'error');
  closeWorkoutModal();
  showMessage(message, 'Plano de treino excluído com sucesso.');
  await loadWorkouts();
  if (wasActive && !treinoId && workoutsCache.length) await setActiveWorkout(workoutsCache[0].id);
}

async function deleteExercise(id) {
  const row = workoutExercisesCache.find(item => item.id === id);
  if (!row || !confirm(`Remover “${row.exercicios?.nome || 'este exercício'}” do treino?`)) return;
  const { error } = await supabase.from('treino_exercicios').delete().eq('id', id).eq('treino_id', treinoId);
  if (error) return showMessage(message, 'Não foi possível remover o exercício.', 'error');
  closeExerciseDetailModal();
  showMessage(message, 'Exercício removido com sucesso.');
  await loadWorkoutExercises();
}

workoutForm.addEventListener('submit', async event => {
  event.preventDefault();
  const payload = {
    nome: workoutForm.nome.value.trim(),
    descricao: workoutForm.descricao.value.trim() || null,
    dias_semana: selectedDays(),
    data_inicio: workoutForm.data_inicio.value || null,
    data_fim: workoutForm.data_fim.value || null
  };
  if (!payload.nome) return showMessage(message, 'Informe o nome do treino.', 'error');
  if (payload.data_inicio && payload.data_fim && payload.data_fim < payload.data_inicio) return showMessage(message, 'A data final não pode ser anterior à data inicial.', 'error');

  let savedId = editingWorkoutId;
  if (editingWorkoutId) {
    const { error } = await supabase.from('treinos').update(payload).eq('id', editingWorkoutId).eq('personal_id', session.user.id);
    if (error) return showMessage(message, 'Não foi possível atualizar o treino.', 'error');
    showMessage(message, 'Plano de treino atualizado com sucesso.');
  } else {
    const shouldActivate = !workoutsCache.some(item => item.status === 'ativo');
    const { data, error } = await supabase.from('treinos').insert({ ...payload, personal_id: session.user.id, aluno_id: alunoId, status: shouldActivate ? 'ativo' : 'inativo', modelo: false }).select('id').single();
    if (error) return showMessage(message, 'Não foi possível criar o treino.', 'error');
    savedId = data.id;
    showMessage(message, 'Plano de treino criado com sucesso.');
  }
  closeWorkoutModal();
  await loadWorkouts();
  if (savedId && workoutsCache.some(item => item.id === savedId)) openWorkoutModal(savedId);
});

workoutExerciseForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!treinoId) return showMessage(message, 'Ative um plano de treino antes de adicionar exercícios.', 'error');
  const day = Number(workoutExerciseForm.dia_semana.value);
  const allowedDays = (activeWorkout()?.dias_semana || []).map(Number);
  if (!allowedDays.includes(day)) return showMessage(message, 'Selecione um dia habilitado no treino ativo.', 'error');
  const payload = {
    treino_id: treinoId,
    exercicio_id: workoutExerciseForm.exercicio_id.value,
    dia_semana: day,
    ordem: Number(workoutExerciseForm.ordem.value || 1),
    series: workoutExerciseForm.series.value ? Number(workoutExerciseForm.series.value) : null,
    repeticoes: workoutExerciseForm.repeticoes.value.trim() || null,
    carga: workoutExerciseForm.carga.value.trim() || null,
    descanso_segundos: workoutExerciseForm.descanso_segundos.value ? Number(workoutExerciseForm.descanso_segundos.value) : null,
    observacoes: workoutExerciseForm.observacoes.value.trim() || null
  };
  const result = editingExerciseId
    ? await supabase.from('treino_exercicios').update(payload).eq('id', editingExerciseId).eq('treino_id', treinoId)
    : await supabase.from('treino_exercicios').insert(payload);
  if (result.error) return showMessage(message, 'Não foi possível salvar o exercício. Verifique os dados e tente novamente.', 'error');
  closeExerciseModal();
  showMessage(message, editingExerciseId ? 'Exercício atualizado com sucesso.' : 'Exercício adicionado com sucesso.');
  await loadWorkoutExercises();
});

newWorkoutButton.addEventListener('click', () => showWorkoutForm());
cancelWorkoutEdit.addEventListener('click', () => selectedWorkoutId ? openWorkoutModal(selectedWorkoutId) : closeWorkoutModal());
activeWorkoutDetails.addEventListener('click', () => { if (treinoId) openWorkoutModal(treinoId); });
workoutModalEdit.addEventListener('click', () => { const workout = workoutsCache.find(item => item.id === selectedWorkoutId); if (workout) showWorkoutForm(workout); });
workoutModalActivate.addEventListener('click', () => { if (selectedWorkoutId) setActiveWorkout(selectedWorkoutId); });
workoutModalDelete.addEventListener('click', () => { if (selectedWorkoutId) deleteWorkout(selectedWorkoutId); });
openExerciseModalButton.addEventListener('click', () => openExerciseModal());
exerciseDetailEdit.addEventListener('click', () => { const id = selectedExerciseId; closeExerciseDetailModal(); if (id) openExerciseModal(id); });
exerciseDetailDelete.addEventListener('click', () => { if (selectedExerciseId) deleteExercise(selectedExerciseId); });

document.addEventListener('click', event => {
  const openWorkout = event.target.closest('[data-open-workout]');
  if (openWorkout) return openWorkoutModal(openWorkout.dataset.openWorkout);
  const openExercise = event.target.closest('[data-open-exercise-detail]');
  if (openExercise) return openExerciseDetailModal(openExercise.dataset.openExerciseDetail);
  if (event.target.closest('[data-close-workout-modal]')) return closeWorkoutModal();
  if (event.target.closest('[data-close-exercise-modal]')) return closeExerciseModal();
  if (event.target.closest('[data-close-exercise-detail-modal]')) return closeExerciseDetailModal();
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (exerciseDetailModal.classList.contains('open')) closeExerciseDetailModal();
  else if (exerciseModal.classList.contains('open')) closeExerciseModal();
  else if (workoutModal.classList.contains('open')) closeWorkoutModal();
});

try {
  await loadStudent();
  await loadExerciseLibrary();
  await loadWorkouts();
} catch (error) {
  console.error(error);
  showMessage(message, error.message || 'Não foi possível carregar os planos de treino.', 'error');
}