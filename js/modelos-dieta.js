import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('alimentacao');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const message = document.querySelector('#diet-model-message');
const modelList = document.querySelector('#diet-model-list');
const modelSearch = document.querySelector('#model-search');
const modelModal = document.querySelector('#model-modal');
const modelForm = document.querySelector('#model-form');
const modelFormTitle = document.querySelector('#model-form-title');
const modelSubmit = document.querySelector('#model-submit');
const detailModal = document.querySelector('#model-detail-modal');
const detailTitle = document.querySelector('#model-detail-title');
const detailSummary = document.querySelector('#model-detail-summary');
const modelMealList = document.querySelector('#model-meal-list');
const addMealModal = document.querySelector('#add-model-meal-modal');
const libraryMealList = document.querySelector('#model-library-meal-list');
const libraryMealSearch = document.querySelector('#model-meal-search');

let models = [];
let selectedModelId = null;
let editingModelId = null;
let modelMeals = [];
let libraryMeals = [];

function esc(value = '') { const div = document.createElement('div'); div.textContent = value ?? ''; return div.innerHTML; }
function normalize(value = '') { return String(value || '').trim().toLocaleLowerCase('pt-BR'); }
function openModal(target) { target.classList.add('open'); target.setAttribute('aria-hidden', 'false'); document.body.classList.add('library-modal-open'); }
function closeModal(target) { target.classList.remove('open'); target.setAttribute('aria-hidden', 'true'); if (!document.querySelector('.library-modal.open')) document.body.classList.remove('library-modal-open'); }

function visibleModels() {
  const customized = new Set(models.filter(item => !item.global && item.personal_id === session.user.id && item.origem_global_id).map(item => item.origem_global_id));
  return models.filter(item => !(item.global && customized.has(item.id)));
}

function renderModels() {
  const term = normalize(modelSearch.value);
  const filtered = visibleModels().filter(item => !term || [item.nome, item.descricao, item.orientacoes].filter(Boolean).some(value => normalize(value).includes(term)));
  if (!filtered.length) {
    modelList.innerHTML = '<div class="model-empty">Nenhum modelo encontrado. Crie o primeiro modelo de dieta.</div>';
    return;
  }
  modelList.innerHTML = filtered.map(item => `
    <article class="diet-model-card">
      <div><small>${item.global ? 'PADRÃO FS FIT' : item.origem_global_id ? 'PERSONALIZADO' : 'MEU MODELO'}</small><h3>${esc(item.nome)}</h3><p>${esc(item.descricao || 'Sem descrição')}</p></div>
      <button class="btn btn-outline" type="button" data-open-model="${item.id}">Abrir modelo</button>
    </article>`).join('');
}

async function loadModels() {
  const { data, error } = await supabase.from('modelos_dieta').select('id,personal_id,nome,descricao,orientacoes,agua_ml,global,origem_global_id').or(`global.eq.true,personal_id.eq.${session.user.id}`).order('global', { ascending: false }).order('nome');
  if (error) throw error;
  models = data || [];
  renderModels();
}

function resetModelForm() {
  editingModelId = null;
  modelForm.reset();
  modelFormTitle.textContent = 'Novo modelo';
  modelSubmit.textContent = 'Criar modelo';
}

function startNewModel() {
  resetModelForm();
  openModal(modelModal);
  setTimeout(() => modelForm.nome.focus(), 0);
}

function startEditModel() {
  const model = models.find(item => item.id === selectedModelId);
  if (!model) return;
  editingModelId = model.global ? null : model.id;
  modelForm.nome.value = model.nome || '';
  modelForm.descricao.value = model.descricao || '';
  modelForm.orientacoes.value = model.orientacoes || '';
  modelForm.agua_ml.value = model.agua_ml ?? '';
  modelFormTitle.textContent = `Editar ${model.nome}`;
  modelSubmit.textContent = 'Salvar alterações';
  closeModal(detailModal);
  openModal(modelModal);
}

async function loadModelMeals() {
  if (!selectedModelId) return;
  const { data, error } = await supabase.from('modelo_dieta_refeicoes').select('id,categoria_id,nome,horario,ordem').eq('modelo_dieta_id', selectedModelId).order('ordem').order('horario');
  if (error) throw error;
  modelMeals = data || [];
  if (!modelMeals.length) {
    modelMealList.innerHTML = '<div class="model-empty">Nenhuma refeição adicionada a este modelo.</div>';
    return;
  }
  modelMealList.innerHTML = modelMeals.map(item => `
    <article class="model-meal-card">
      <div><strong>${esc(item.nome)}</strong><p>${item.horario ? esc(item.horario.slice(0, 5)) : 'Horário não definido'} · ordem ${item.ordem || 1}</p></div>
      <button class="btn btn-danger" type="button" data-delete-model-meal="${item.id}">Remover</button>
    </article>`).join('');
}

async function openModel(id) {
  const model = models.find(item => item.id === id);
  if (!model) return;
  selectedModelId = id;
  detailTitle.textContent = model.nome;
  detailSummary.innerHTML = `
    <div><small>Meta de água</small><strong>${model.agua_ml != null ? `${esc(String(model.agua_ml))} ml/dia` : 'Não informada'}</strong></div>
    <div><small>Origem</small><strong>${model.global ? 'Padrão FS Fit' : model.origem_global_id ? 'Personalizado' : 'Modelo próprio'}</strong></div>
    <div class="wide"><small>Descrição</small><p>${esc(model.descricao || 'Sem descrição')}</p></div>
    <div class="wide"><small>Orientações</small><p>${esc(model.orientacoes || 'Sem orientações gerais')}</p></div>`;
  document.querySelector('#edit-model-button').classList.toggle('hidden', Boolean(model.global));
  document.querySelector('#delete-model-button').classList.toggle('hidden', Boolean(model.global));
  await loadModelMeals();
  openModal(detailModal);
}

async function loadLibraryMeals() {
  const [{ data: meals, error }, { data: categories }, { data: items }] = await Promise.all([
    supabase.from('biblioteca_refeicoes').select('id,personal_id,categoria_id,nome,descricao,global,origem_global_id').or(`global.eq.true,personal_id.eq.${session.user.id}`).order('nome'),
    supabase.from('categorias_refeicoes').select('id,nome'),
    supabase.from('biblioteca_refeicao_itens').select('refeicao_biblioteca_id')
  ]);
  if (error) throw error;
  const categoryMap = new Map((categories || []).map(item => [item.id, item.nome]));
  const counts = (items || []).reduce((acc, item) => { acc[item.refeicao_biblioteca_id] = (acc[item.refeicao_biblioteca_id] || 0) + 1; return acc; }, {});
  const customized = new Set((meals || []).filter(item => !item.global && item.personal_id === session.user.id && item.origem_global_id).map(item => item.origem_global_id));
  libraryMeals = (meals || []).filter(item => !(item.global && customized.has(item.id))).map(item => ({ ...item, categoria_nome: categoryMap.get(item.categoria_id) || 'Refeição', itens_count: counts[item.id] || 0 }));
  renderLibraryMeals();
}

function renderLibraryMeals() {
  const term = normalize(libraryMealSearch.value);
  const filtered = libraryMeals.filter(item => !term || [item.nome, item.descricao, item.categoria_nome].filter(Boolean).some(value => normalize(value).includes(term)));
  if (!filtered.length) {
    libraryMealList.innerHTML = '<div class="model-empty">Nenhuma refeição encontrada na biblioteca.</div>';
    return;
  }
  libraryMealList.innerHTML = filtered.map(item => `
    <article class="model-library-meal-card">
      <div><small>${esc(item.categoria_nome)}</small><h3>${esc(item.nome)}</h3><p>${esc(item.descricao || 'Sem descrição')} · ${item.itens_count} ${item.itens_count === 1 ? 'item' : 'itens'}</p></div>
      <button class="btn btn-primary" type="button" data-add-library-meal="${item.id}">Adicionar</button>
    </article>`).join('');
}

async function addLibraryMealToModel(libraryMealId) {
  if (!selectedModelId) return;
  const source = libraryMeals.find(item => item.id === libraryMealId);
  if (!source) return;
  const nextOrder = modelMeals.length ? Math.max(...modelMeals.map(item => Number(item.ordem) || 1)) + 1 : 1;
  const { data: created, error } = await supabase.from('modelo_dieta_refeicoes').insert({ modelo_dieta_id: selectedModelId, categoria_id: source.categoria_id, nome: source.nome, ordem: nextOrder }).select('id').single();
  if (error) return showMessage(message, 'Não foi possível adicionar a refeição ao modelo.', 'error');

  const { data: sourceItems, error: itemReadError } = await supabase.from('biblioteca_refeicao_itens').select('alimento_id,nome_alimento,quantidade,unidade,observacoes,ordem').eq('refeicao_biblioteca_id', libraryMealId).order('ordem');
  if (itemReadError) return showMessage(message, 'A refeição foi adicionada, mas não foi possível carregar seus itens.', 'error');
  if (sourceItems?.length) {
    const { error: itemInsertError } = await supabase.from('modelo_dieta_itens').insert(sourceItems.map(item => ({ modelo_refeicao_id: created.id, alimento_id: item.alimento_id, nome_alimento: item.nome_alimento, quantidade: item.quantidade, unidade: item.unidade, observacoes: item.observacoes, ordem: item.ordem })));
    if (itemInsertError) {
      await supabase.from('modelo_dieta_refeicoes').delete().eq('id', created.id);
      return showMessage(message, 'Não foi possível copiar os itens da refeição para o modelo.', 'error');
    }
  }
  closeModal(addMealModal);
  await loadModelMeals();
  showMessage(message, `Refeição “${source.nome}” adicionada ao modelo.`);
}

async function deleteModelMeal(id) {
  if (!confirm('Remover esta refeição do modelo?')) return;
  await supabase.from('modelo_dieta_itens').delete().eq('modelo_refeicao_id', id);
  const { error } = await supabase.from('modelo_dieta_refeicoes').delete().eq('id', id).eq('modelo_dieta_id', selectedModelId);
  if (error) return showMessage(message, 'Não foi possível remover a refeição.', 'error');
  await loadModelMeals();
  showMessage(message, 'Refeição removida do modelo.');
}

async function deleteSelectedModel() {
  const model = models.find(item => item.id === selectedModelId);
  if (!model || model.global) return;
  if (!confirm(`Excluir o modelo “${model.nome}”?`)) return;
  for (const meal of modelMeals) await supabase.from('modelo_dieta_itens').delete().eq('modelo_refeicao_id', meal.id);
  await supabase.from('modelo_dieta_refeicoes').delete().eq('modelo_dieta_id', model.id);
  const { error } = await supabase.from('modelos_dieta').delete().eq('id', model.id).eq('personal_id', session.user.id).eq('global', false);
  if (error) return showMessage(message, 'Não foi possível excluir o modelo.', 'error');
  closeModal(detailModal);
  selectedModelId = null;
  await loadModels();
  showMessage(message, 'Modelo excluído com sucesso.');
}

modelForm.addEventListener('submit', async event => {
  event.preventDefault();
  const payload = { nome: modelForm.nome.value.trim(), descricao: modelForm.descricao.value.trim() || null, orientacoes: modelForm.orientacoes.value.trim() || null, agua_ml: modelForm.agua_ml.value ? Number(modelForm.agua_ml.value) : null, personal_id: session.user.id, global: false };
  if (payload.nome.length < 2) return showMessage(message, 'Informe o nome do modelo.', 'error');
  modelSubmit.disabled = true;
  try {
    if (editingModelId) {
      const { error } = await supabase.from('modelos_dieta').update({ nome: payload.nome, descricao: payload.descricao, orientacoes: payload.orientacoes, agua_ml: payload.agua_ml }).eq('id', editingModelId).eq('personal_id', session.user.id).eq('global', false);
      if (error) throw error;
      selectedModelId = editingModelId;
      showMessage(message, 'Modelo atualizado com sucesso.');
    } else {
      const { data, error } = await supabase.from('modelos_dieta').insert(payload).select('id').single();
      if (error) throw error;
      selectedModelId = data.id;
      showMessage(message, 'Modelo criado com sucesso.');
    }
    closeModal(modelModal);
    resetModelForm();
    await loadModels();
    if (selectedModelId) await openModel(selectedModelId);
  } catch (error) {
    console.error(error);
    showMessage(message, 'Não foi possível salvar o modelo.', 'error');
  } finally {
    modelSubmit.disabled = false;
  }
});

modelSearch.addEventListener('input', renderModels);
libraryMealSearch.addEventListener('input', renderLibraryMeals);
document.querySelector('#open-model-modal').addEventListener('click', startNewModel);
document.querySelector('#open-add-model-meal').addEventListener('click', async () => { await loadLibraryMeals(); openModal(addMealModal); });
document.querySelector('#edit-model-button').addEventListener('click', startEditModel);
document.querySelector('#delete-model-button').addEventListener('click', deleteSelectedModel);

document.addEventListener('click', event => {
  const openButton = event.target.closest('[data-open-model]');
  if (openButton) return openModel(openButton.dataset.openModel);
  const addButton = event.target.closest('[data-add-library-meal]');
  if (addButton) return addLibraryMealToModel(addButton.dataset.addLibraryMeal);
  const deleteMealButton = event.target.closest('[data-delete-model-meal]');
  if (deleteMealButton) return deleteModelMeal(deleteMealButton.dataset.deleteModelMeal);
  if (event.target.closest('[data-close-model-modal]')) { closeModal(modelModal); resetModelForm(); }
  if (event.target.closest('[data-close-model-detail-modal]')) { closeModal(detailModal); selectedModelId = null; }
  if (event.target.closest('[data-close-add-model-meal-modal]')) closeModal(addMealModal);
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (addMealModal.classList.contains('open')) return closeModal(addMealModal);
  if (modelModal.classList.contains('open')) return closeModal(modelModal);
  if (detailModal.classList.contains('open')) return closeModal(detailModal);
});

try { await loadModels(); } catch (error) { console.error(error); showMessage(message, 'Não foi possível carregar os modelos de dieta.', 'error'); }
