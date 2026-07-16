import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('alunos');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const alunoId = new URLSearchParams(location.search).get('id');
const message = document.querySelector('#diet-message');
const planList = document.querySelector('#plan-list');
const planModal = document.querySelector('#plan-modal');
const planModalTitle = document.querySelector('#plan-modal-title');
const planModalView = document.querySelector('#plan-modal-view');
const planModalBody = document.querySelector('#plan-modal-body');
const planModalActivate = document.querySelector('#plan-modal-activate');
const planModalEdit = document.querySelector('#plan-modal-edit');
const planModalDelete = document.querySelector('#plan-modal-delete');
const planForm = document.querySelector('#plan-form');
const newPlanButton = document.querySelector('#new-plan-button');
const cancelPlanEdit = document.querySelector('#cancel-plan-edit');
const activePlanTitle = document.querySelector('#active-plan-title');
const activePlanSummary = document.querySelector('#active-plan-summary');
const activePlanDetails = document.querySelector('#active-plan-details');
const activePlanWorkspace = document.querySelector('#active-plan-workspace');
const mealForm = document.querySelector('#meal-form');
const mealList = document.querySelector('#meal-list');
const mealModal = document.querySelector('#meal-modal');
const mealModalTitle = document.querySelector('#meal-modal-title');
const mealModalBody = document.querySelector('#meal-modal-body');
const mealModalEdit = document.querySelector('#meal-modal-edit');
const mealModalDelete = document.querySelector('#meal-modal-delete');

let planId = null;
let editingPlanId = null;
let selectedPlanId = null;
let editingMealId = null;
let selectedMealId = null;
let plansCache = [];
let mealsCache = [];

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
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function selectedDays() {
  return [...document.querySelectorAll('#meal-days input:checked')].map(input => Number(input.value));
}

function setSelectedDays(days = []) {
  document.querySelectorAll('#meal-days input').forEach(input => {
    input.checked = days.includes(Number(input.value));
  });
}

function resetMealForm() {
  editingMealId = null;
  mealForm.reset();
  mealForm.ordem.value = '1';
  setSelectedDays([]);
  mealForm.querySelector('[type="submit"]').textContent = 'Adicionar refeição';
}

function closeMealModal() {
  mealModal.classList.remove('open');
  mealModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('diet-modal-open');
  selectedMealId = null;
}

function openMealModal(mealId) {
  const meal = mealsCache.find(item => item.id === mealId);
  if (!meal) return;
  selectedMealId = meal.id;
  const days = (meal.dias_semana || []).map(day => dayNames[day]).filter(Boolean).join(', ') || 'Não informado';
  const time = meal.horario ? meal.horario.slice(0, 5) : 'Não informado';
  mealModalTitle.textContent = meal.nome || 'Refeição';
  mealModalBody.innerHTML = `
    <div class="diet-detail"><small>Horário</small><strong>${esc(time)}</strong></div>
    <div class="diet-detail"><small>Dias da semana</small><p>${esc(days)}</p></div>
    <div class="diet-detail"><small>Descrição</small><p>${esc(meal.descricao || 'Não informado')}</p></div>
    <div class="diet-detail"><small>Substituições</small><p>${esc(meal.substituicoes || 'Nenhuma substituição informada')}</p></div>
    <div class="diet-detail"><small>Ordem no plano</small><strong>${esc(String(meal.ordem || '—'))}</strong></div>`;
  mealModal.classList.add('open');
  mealModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('diet-modal-open');
  mealModalEdit.focus();
}

function closePlanModal() {
  planModal.classList.remove('open');
  planModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('diet-modal-open');
  selectedPlanId = null;
  editingPlanId = null;
  planForm.reset();
  planForm.classList.add('hidden');
  planModalView.classList.remove('hidden');
}

function fillPlanForm(plan = null) {
  editingPlanId = plan?.id || null;
  planForm.titulo.value = plan?.titulo || '';
  planForm.data_inicio.value = plan?.data_inicio || '';
  planForm.data_fim.value = plan?.data_fim || '';
  planForm.agua_ml.value = plan?.agua_ml ?? '';
  planForm.orientacoes.value = plan?.orientacoes || '';
}

function showPlanForm(plan = null) {
  fillPlanForm(plan);
  planModalTitle.textContent = plan ? 'Editar plano alimentar' : 'Novo plano alimentar';
  planModalView.classList.add('hidden');
  planForm.classList.remove('hidden');
  planModal.classList.add('open');
  planModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('diet-modal-open');
  planForm.titulo.focus();
}

function openPlanModal(planIdToOpen) {
  const plan = plansCache.find(item => item.id === planIdToOpen);
  if (!plan) return;
  selectedPlanId = plan.id;
  planModalTitle.textContent = plan.titulo || 'Plano alimentar';
  planModalBody.innerHTML = `
    <div class="diet-detail"><small>Status</small><strong>${plan.ativo ? 'Plano ativo' : 'Plano inativo'}</strong></div>
    <div class="diet-detail"><small>Data de início</small><strong>${esc(formatDate(plan.data_inicio))}</strong></div>
    <div class="diet-detail"><small>Data de término</small><strong>${esc(formatDate(plan.data_fim))}</strong></div>
    <div class="diet-detail"><small>Meta de água</small><strong>${plan.agua_ml != null ? `${esc(String(plan.agua_ml))} ml/dia` : 'Não informada'}</strong></div>
    <div class="diet-detail"><small>Orientações gerais</small><p>${esc(plan.orientacoes || 'Nenhuma orientação informada.')}</p></div>`;
  planModalActivate.classList.toggle('hidden', Boolean(plan.ativo));
  planForm.classList.add('hidden');
  planModalView.classList.remove('hidden');
  planModal.classList.add('open');
  planModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('diet-modal-open');
  planModalEdit.focus();
}

function renderPlanList() {
  if (!plansCache.length) {
    planList.innerHTML = '<div class="diet-plan-empty"><strong>Nenhum plano alimentar cadastrado.</strong><span>Crie o primeiro plano para começar a adicionar refeições.</span></div>';
    return;
  }

  planList.innerHTML = plansCache.map(plan => `
    <button class="diet-plan-row ${plan.ativo ? 'active' : ''}" type="button" data-open-plan="${plan.id}">
      <span class="diet-plan-row-main">
        <span class="diet-plan-row-title"><strong>${esc(plan.titulo)}</strong>${plan.ativo ? '<em>ATIVO</em>' : ''}</span>
        <span class="diet-plan-row-meta">${esc(formatDate(plan.data_inicio))} → ${esc(formatDate(plan.data_fim))} · ${plan.agua_ml != null ? `${esc(String(plan.agua_ml))} ml/dia` : 'Água não informada'}</span>
        <span class="diet-plan-row-note">${esc(plan.orientacoes || 'Sem orientações gerais')}</span>
      </span>
      <span class="diet-meal-arrow" aria-hidden="true">›</span>
    </button>`).join('');
}

function renderActivePlan() {
  const plan = plansCache.find(item => item.id === planId);
  const hasActive = Boolean(plan);
  activePlanWorkspace.classList.toggle('diet-disabled', !hasActive);
  activePlanDetails.disabled = !hasActive;
  mealForm.querySelectorAll('input, textarea, button').forEach(control => { control.disabled = !hasActive; });

  if (!plan) {
    activePlanTitle.textContent = 'Nenhum plano ativo';
    activePlanSummary.innerHTML = '<p>Crie um plano alimentar ou torne um plano existente ativo para adicionar refeições.</p>';
    return;
  }

  activePlanTitle.textContent = plan.titulo;
  activePlanSummary.innerHTML = `
    <div><small>Período</small><strong>${esc(formatDate(plan.data_inicio))} → ${esc(formatDate(plan.data_fim))}</strong></div>
    <div><small>Meta de água</small><strong>${plan.agua_ml != null ? `${esc(String(plan.agua_ml))} ml/dia` : 'Não informada'}</strong></div>
    <div class="wide"><small>Orientações gerais</small><p>${esc(plan.orientacoes || 'Nenhuma orientação informada.')}</p></div>`;
}

async function loadStudent() {
  const { data, error } = await supabase.from('alunos').select('id,nome').eq('id', alunoId).eq('personal_id', session.user.id).single();
  if (error) {
    showMessage(message, 'Aluno não encontrado ou sem permissão.', 'error');
    throw error;
  }
  document.querySelector('#student-name').textContent = `Plano alimentar · ${data.nome}`;
  document.querySelector('#back-link').href = `ficha-aluno.html?id=${data.id}`;
}

async function loadPlans() {
  const { data, error } = await supabase
    .from('planos_alimentares')
    .select('id,titulo,orientacoes,agua_ml,data_inicio,data_fim,ativo,created_at,updated_at')
    .eq('aluno_id', alunoId)
    .eq('personal_id', session.user.id)
    .order('ativo', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) throw error;
  plansCache = data || [];
  const activePlan = plansCache.find(plan => plan.ativo) || null;
  planId = activePlan?.id || null;
  renderPlanList();
  renderActivePlan();
  await loadMeals();
}

async function setActivePlan(targetPlanId) {
  const target = plansCache.find(plan => plan.id === targetPlanId);
  if (!target) return;

  const { error: deactivateError } = await supabase
    .from('planos_alimentares')
    .update({ ativo: false })
    .eq('aluno_id', alunoId)
    .eq('personal_id', session.user.id)
    .neq('id', targetPlanId);
  if (deactivateError) return showMessage(message, 'Não foi possível atualizar o plano ativo.', 'error');

  const { error } = await supabase
    .from('planos_alimentares')
    .update({ ativo: true })
    .eq('id', targetPlanId)
    .eq('personal_id', session.user.id);
  if (error) return showMessage(message, 'Não foi possível ativar o plano.', 'error');

  closePlanModal();
  showMessage(message, `Plano “${target.titulo}” definido como ativo.`);
  resetMealForm();
  await loadPlans();
}

async function deletePlan(targetPlanId) {
  const plan = plansCache.find(item => item.id === targetPlanId);
  if (!plan) return;
  if (!confirm(`Excluir o plano “${plan.titulo}”? Todas as refeições vinculadas também serão excluídas.`)) return;

  const wasActive = plan.ativo;
  const { error } = await supabase
    .from('planos_alimentares')
    .delete()
    .eq('id', targetPlanId)
    .eq('aluno_id', alunoId)
    .eq('personal_id', session.user.id);
  if (error) return showMessage(message, 'Não foi possível excluir o plano alimentar.', 'error');

  closePlanModal();
  showMessage(message, 'Plano alimentar excluído com sucesso.');
  await loadPlans();

  if (wasActive && !planId && plansCache.length) {
    await setActivePlan(plansCache[0].id);
  }
}

async function loadMeals() {
  if (!planId) {
    mealsCache = [];
    mealList.innerHTML = '<p class="empty">Nenhum plano alimentar ativo.</p>';
    return;
  }

  const { data, error } = await supabase
    .from('refeicoes')
    .select('id,nome,horario,descricao,substituicoes,ordem,dias_semana')
    .eq('plano_alimentar_id', planId)
    .order('ordem', { ascending: true })
    .order('horario', { ascending: true });

  if (error) {
    showMessage(message, 'Não foi possível carregar as refeições.', 'error');
    return;
  }

  mealsCache = data || [];
  if (!mealsCache.length) {
    mealList.innerHTML = '<p class="empty">Nenhuma refeição cadastrada no plano ativo.</p>';
    return;
  }

  mealList.innerHTML = Object.entries(dayNames).map(([day, label]) => {
    const meals = mealsCache.filter(meal => (meal.dias_semana || []).includes(Number(day)));
    if (!meals.length) return '';
    return `
      <section class="diet-day-section">
        <div class="diet-day-header">
          <div><small>DIA ${day}</small><strong>${label}</strong></div>
          <span class="diet-day-count">${meals.length} ${meals.length === 1 ? 'refeição' : 'refeições'}</span>
        </div>
        <div class="diet-meal-list">
          ${meals.map(meal => `
            <button class="diet-meal-row" type="button" data-open-meal="${meal.id}" aria-label="Abrir detalhes de ${esc(meal.nome)}">
              <span class="diet-meal-time">${esc(meal.horario ? meal.horario.slice(0, 5) : '—')}</span>
              <span class="diet-meal-main"><strong>${esc(meal.nome)}</strong><span>${esc(meal.descricao || 'Sem descrição')}</span></span>
              <span class="diet-meal-arrow" aria-hidden="true">›</span>
            </button>`).join('')}
        </div>
      </section>`;
  }).join('') || '<p class="empty">As refeições cadastradas ainda não possuem dias da semana definidos.</p>';
}

function startEditingMeal(mealId) {
  const data = mealsCache.find(item => item.id === mealId);
  if (!data) return showMessage(message, 'Não foi possível abrir a refeição.', 'error');
  editingMealId = data.id;
  mealForm.nome.value = data.nome || '';
  mealForm.horario.value = data.horario ? data.horario.slice(0, 5) : '';
  mealForm.descricao.value = data.descricao || '';
  mealForm.substituicoes.value = data.substituicoes || '';
  mealForm.ordem.value = data.ordem || 1;
  setSelectedDays(data.dias_semana || []);
  mealForm.querySelector('[type="submit"]').textContent = 'Salvar alteração';
  closeMealModal();
  mealForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteMeal(mealId) {
  const meal = mealsCache.find(item => item.id === mealId);
  if (!meal) return;
  if (!confirm(`Excluir a refeição “${meal.nome}” do plano?`)) return;
  const { error } = await supabase.from('refeicoes').delete().eq('id', mealId).eq('plano_alimentar_id', planId);
  if (error) return showMessage(message, 'Não foi possível excluir a refeição.', 'error');
  closeMealModal();
  showMessage(message, 'Refeição excluída com sucesso.');
  if (editingMealId === mealId) resetMealForm();
  await loadMeals();
}

planForm.addEventListener('submit', async event => {
  event.preventDefault();
  const payload = {
    titulo: planForm.titulo.value.trim(),
    orientacoes: planForm.orientacoes.value.trim() || null,
    agua_ml: planForm.agua_ml.value ? Number(planForm.agua_ml.value) : null,
    data_inicio: planForm.data_inicio.value || null,
    data_fim: planForm.data_fim.value || null
  };

  if (!payload.titulo) return showMessage(message, 'Informe o título do plano.', 'error');
  if (payload.data_inicio && payload.data_fim && payload.data_fim < payload.data_inicio) {
    return showMessage(message, 'A data final não pode ser anterior à data inicial.', 'error');
  }

  let savedId = editingPlanId;
  if (editingPlanId) {
    const { error } = await supabase.from('planos_alimentares').update(payload).eq('id', editingPlanId).eq('personal_id', session.user.id);
    if (error) return showMessage(message, 'Não foi possível atualizar o plano alimentar.', 'error');
    showMessage(message, 'Plano alimentar atualizado com sucesso.');
  } else {
    const shouldActivate = !plansCache.some(plan => plan.ativo);
    const { data, error } = await supabase.from('planos_alimentares').insert({
      ...payload,
      personal_id: session.user.id,
      aluno_id: alunoId,
      ativo: shouldActivate
    }).select('id').single();
    if (error) return showMessage(message, 'Não foi possível criar o plano alimentar.', 'error');
    savedId = data.id;
    showMessage(message, 'Plano alimentar criado com sucesso.');
  }

  closePlanModal();
  await loadPlans();
  if (savedId && plansCache.some(plan => plan.id === savedId)) openPlanModal(savedId);
});

mealForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!planId) return showMessage(message, 'Crie ou ative um plano alimentar antes de adicionar refeições.', 'error');
  const days = selectedDays();
  if (!days.length) return showMessage(message, 'Selecione ao menos um dia da semana.', 'error');

  const payload = {
    plano_alimentar_id: planId,
    nome: mealForm.nome.value.trim(),
    horario: mealForm.horario.value || null,
    descricao: mealForm.descricao.value.trim(),
    substituicoes: mealForm.substituicoes.value.trim() || null,
    ordem: Number(mealForm.ordem.value || 1),
    dias_semana: days
  };
  if (!payload.nome || !payload.descricao) return showMessage(message, 'Informe o nome e a descrição da refeição.', 'error');

  const result = editingMealId
    ? await supabase.from('refeicoes').update(payload).eq('id', editingMealId).eq('plano_alimentar_id', planId)
    : await supabase.from('refeicoes').insert(payload);
  if (result.error) return showMessage(message, 'Não foi possível salvar a refeição. Verifique os dados e tente novamente.', 'error');

  showMessage(message, editingMealId ? 'Refeição atualizada com sucesso.' : 'Refeição adicionada com sucesso.');
  resetMealForm();
  await loadMeals();
});

newPlanButton.addEventListener('click', () => showPlanForm());
cancelPlanEdit.addEventListener('click', () => {
  if (selectedPlanId) openPlanModal(selectedPlanId);
  else closePlanModal();
});
activePlanDetails.addEventListener('click', () => { if (planId) openPlanModal(planId); });
planModalEdit.addEventListener('click', () => {
  const plan = plansCache.find(item => item.id === selectedPlanId);
  if (plan) showPlanForm(plan);
});
planModalActivate.addEventListener('click', () => { if (selectedPlanId) setActivePlan(selectedPlanId); });
planModalDelete.addEventListener('click', () => { if (selectedPlanId) deletePlan(selectedPlanId); });
mealModalEdit.addEventListener('click', () => { if (selectedMealId) startEditingMeal(selectedMealId); });
mealModalDelete.addEventListener('click', () => { if (selectedMealId) deleteMeal(selectedMealId); });

document.addEventListener('click', event => {
  const openPlan = event.target.closest('[data-open-plan]');
  if (openPlan) return openPlanModal(openPlan.dataset.openPlan);
  const openMeal = event.target.closest('[data-open-meal]');
  if (openMeal) return openMealModal(openMeal.dataset.openMeal);
  if (event.target.closest('[data-close-plan-modal]')) return closePlanModal();
  if (event.target.closest('[data-close-meal-modal]')) return closeMealModal();
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (planModal.classList.contains('open')) closePlanModal();
  if (mealModal.classList.contains('open')) closeMealModal();
});

await loadStudent();
try {
  await loadPlans();
} catch (error) {
  console.error(error);
  showMessage(message, 'Não foi possível carregar os planos alimentares.', 'error');
}