import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('alimentacao');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const message = document.querySelector('#food-library-message');
const foodList = document.querySelector('#food-library-list');
const foodCategoryNav = document.querySelector('#food-category-nav');
const activeFoodCategoryActions = document.querySelector('#active-food-category-actions');
const selectedFoodCategoryTitle = document.querySelector('#selected-food-category-title');
const foodSearch = document.querySelector('#food-search');
const foodForm = document.querySelector('#food-form');
const foodModal = document.querySelector('#food-modal');
const foodFormTitle = document.querySelector('#food-form-title');
const foodSubmit = document.querySelector('#food-submit');
const foodCategoryForm = document.querySelector('#food-category-form');
const foodCategoryModal = document.querySelector('#food-category-modal');
const foodCategoryFormTitle = document.querySelector('#food-category-form-title');
const foodCategorySubmit = document.querySelector('#food-category-submit');
const mealList = document.querySelector('#meal-library-list');
const mealSearch = document.querySelector('#meal-search');
const mealModal = document.querySelector('#meal-builder-modal');
const mealForm = document.querySelector('#meal-builder-form');
const mealFoodCategoryNav = document.querySelector('#meal-food-category-nav');
const mealFoodSearch = document.querySelector('#meal-food-search');
const mealFoodPicker = document.querySelector('#meal-food-picker');
const mealSelectedItems = document.querySelector('#meal-selected-items');
const mealSelectedCount = document.querySelector('#meal-selected-count');
const mealSubmit = document.querySelector('#meal-submit');

let foodCategories = [];
let mealCategories = [];
let foods = [];
let meals = [];
let mealItems = [];
let activeFoodCategoryId = null;
let activeMealFoodCategoryId = null;
let editingFoodId = null;
let editingGlobalFoodId = null;
let editingFoodCategoryId = null;
let selectedMealFoods = new Map();

function esc(value = '') { const div = document.createElement('div'); div.textContent = value ?? ''; return div.innerHTML; }
function normalize(value = '') { return String(value || '').trim().toLocaleLowerCase('pt-BR'); }
function num(value) { if (value === '' || value == null) return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function formatNumber(value) { return value == null ? '' : Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 }); }
function foodCategoryById(id) { return foodCategories.find(item => item.id === id); }
function visibleFoods() {
  const customizedGlobalIds = new Set(foods.filter(item => !item.global && item.personal_id === session.user.id && item.origem_global_id).map(item => item.origem_global_id));
  return foods.filter(item => !(item.global && customizedGlobalIds.has(item.id)));
}
function openModal(target) { target.classList.add('open'); target.setAttribute('aria-hidden', 'false'); document.body.classList.add('library-modal-open'); }
function closeModal(target) { target.classList.remove('open'); target.setAttribute('aria-hidden', 'true'); if (!document.querySelector('.library-modal.open')) document.body.classList.remove('library-modal-open'); }

function populateFoodCategorySelect(selected = '') {
  foodForm.categoria_id.innerHTML = '<option value="">Selecione uma categoria</option>' + foodCategories.map(category => `<option value="${category.id}">${esc(category.nome)}${category.global ? ' · FS Fit' : ''}</option>`).join('');
  foodForm.categoria_id.value = selected || '';
}

function populateMealCategorySelect(selected = '') {
  mealForm.categoria_id.innerHTML = '<option value="">Sem categoria</option>' + mealCategories.map(category => `<option value="${category.id}">${esc(category.nome)}${category.global ? ' · FS Fit' : ''}</option>`).join('');
  mealForm.categoria_id.value = selected || '';
}

function resetFoodForm(prefillName = '') {
  editingFoodId = null;
  editingGlobalFoodId = null;
  foodForm.reset();
  populateFoodCategorySelect(activeFoodCategoryId || '');
  foodForm.nome.value = prefillName;
  foodFormTitle.textContent = 'Novo alimento';
  foodSubmit.textContent = 'Adicionar alimento';
}

function resetFoodCategoryForm() {
  editingFoodCategoryId = null;
  foodCategoryForm.reset();
  foodCategoryFormTitle.textContent = 'Nova categoria';
  foodCategorySubmit.textContent = 'Criar categoria';
}

function resetMealBuilder() {
  mealForm.reset();
  selectedMealFoods = new Map();
  activeMealFoodCategoryId = foodCategories[0]?.id || null;
  populateMealCategorySelect();
  renderMealFoodCategoryNav();
  renderMealFoodPicker();
  renderSelectedMealFoods();
}

function renderFoodCategoryNav() {
  if (!foodCategories.length) {
    foodCategoryNav.innerHTML = '<span class="empty">Nenhuma categoria disponível.</span>';
    return;
  }
  foodCategoryNav.innerHTML = foodCategories.map(category => `<button class="library-category-pill${category.id === activeFoodCategoryId ? ' active' : ''}" type="button" data-food-category="${category.id}">${esc(category.nome)}</button>`).join('');
  const active = foodCategoryById(activeFoodCategoryId);
  selectedFoodCategoryTitle.textContent = active?.nome || 'Alimentos';
  const own = active && !active.global && active.personal_id === session.user.id;
  activeFoodCategoryActions.classList.toggle('hidden', !own);
  activeFoodCategoryActions.innerHTML = own ? `<span>Categoria personalizada</span><div class="actions"><button class="btn btn-outline" type="button" data-edit-food-category="${active.id}">Editar categoria</button><button class="btn btn-danger" type="button" data-delete-food-category="${active.id}" data-name="${esc(active.nome)}">Excluir categoria</button></div>` : '';
}

function renderFoods() {
  if (!activeFoodCategoryId) {
    foodList.innerHTML = '<p class="empty">Nenhuma categoria selecionada.</p>';
    return;
  }
  const term = normalize(foodSearch.value);
  const filtered = visibleFoods().filter(item => item.categoria_id === activeFoodCategoryId && (!term || normalize(item.nome).includes(term) || normalize(item.observacoes).includes(term)));
  if (!filtered.length) {
    const label = foodSearch.value.trim();
    foodList.innerHTML = `<div class="empty-state"><p class="empty">Nenhum alimento encontrado${label ? ` para “${esc(label)}”` : ''}.</p>${label ? `<button class="btn btn-primary" type="button" data-add-missing-food="${esc(label)}">+ Adicionar “${esc(label)}”</button>` : ''}</div>`;
    return;
  }
  foodList.innerHTML = filtered.map(item => {
    const badge = item.global ? 'PADRÃO FS FIT' : item.origem_global_id ? 'PERSONALIZADO' : 'MEU ALIMENTO';
    const macros = [
      item.calorias != null ? `${formatNumber(item.calorias)} kcal` : null,
      item.proteinas_g != null ? `P ${formatNumber(item.proteinas_g)}g` : null,
      item.carboidratos_g != null ? `C ${formatNumber(item.carboidratos_g)}g` : null,
      item.gorduras_g != null ? `G ${formatNumber(item.gorduras_g)}g` : null
    ].filter(Boolean);
    return `<article class="food-library-item"><div><div class="exercise-library-item-title"><h3>${esc(item.nome)}</h3><span class="library-badge${item.global ? '' : ' personal'}">${badge}</span></div><p>${item.porcao_padrao != null ? `${formatNumber(item.porcao_padrao)} ${esc(item.unidade || '')}` : esc(item.unidade || 'Porção não informada')}</p>${item.observacoes ? `<p>${esc(item.observacoes)}</p>` : ''}${macros.length ? `<div class="food-macros">${macros.map(value => `<span class="food-macro-chip">${esc(value)}</span>`).join('')}</div>` : ''}</div><div class="actions"><button class="btn btn-outline" type="button" data-edit-food="${item.id}">Editar</button>${item.global ? '' : `<button class="btn btn-danger" type="button" data-delete-food="${item.id}" data-name="${esc(item.nome)}">Excluir</button>`}</div></article>`;
  }).join('');
}

function renderMealFoodCategoryNav() {
  mealFoodCategoryNav.innerHTML = foodCategories.map(category => `<button class="library-category-pill${category.id === activeMealFoodCategoryId ? ' active' : ''}" type="button" data-meal-food-category="${category.id}">${esc(category.nome)}</button>`).join('');
}

function renderMealFoodPicker() {
  const term = normalize(mealFoodSearch.value);
  const filtered = visibleFoods().filter(item => (!activeMealFoodCategoryId || item.categoria_id === activeMealFoodCategoryId) && (!term || normalize(item.nome).includes(term)));
  if (!filtered.length) {
    const label = mealFoodSearch.value.trim();
    mealFoodPicker.innerHTML = `<div class="empty-state"><p class="empty">Nenhum alimento encontrado${label ? ` para “${esc(label)}”` : ''}.</p>${label ? `<button class="btn btn-primary" type="button" data-add-missing-meal-food="${esc(label)}">+ Adicionar novo alimento</button>` : ''}</div>`;
    return;
  }
  mealFoodPicker.innerHTML = filtered.map(item => `<label class="meal-food-option"><input type="checkbox" data-select-meal-food="${item.id}" ${selectedMealFoods.has(item.id) ? 'checked' : ''}><span><strong>${esc(item.nome)}</strong><small>${item.porcao_padrao != null ? `${formatNumber(item.porcao_padrao)} ${esc(item.unidade || '')}` : esc(item.unidade || 'Sem porção padrão')}</small></span></label>`).join('');
}

function renderSelectedMealFoods() {
  const items = [...selectedMealFoods.values()];
  mealSelectedCount.textContent = `${items.length} ${items.length === 1 ? 'item' : 'itens'}`;
  if (!items.length) {
    mealSelectedItems.innerHTML = '<p class="empty">Selecione alimentos acima.</p>';
    return;
  }
  mealSelectedItems.innerHTML = items.map(item => `<div class="meal-selected-row" data-selected-row="${item.id}"><strong class="meal-selected-row-name">${esc(item.nome)}</strong><div class="form-group"><label>Quantidade</label><input type="number" min="0" step="0.01" data-meal-quantity="${item.id}" value="${item.quantidade ?? ''}"></div><div class="form-group"><label>Unidade</label><input maxlength="30" data-meal-unit="${item.id}" value="${esc(item.unidade || '')}"></div><div class="form-group"><label>Observação</label><input maxlength="160" data-meal-note="${item.id}" value="${esc(item.observacoes || '')}" placeholder="Opcional"></div><button class="btn btn-danger meal-remove" type="button" data-remove-meal-food="${item.id}">Remover</button></div>`).join('');
}

function renderMeals() {
  const term = normalize(mealSearch.value);
  const filtered = meals.filter(item => !term || normalize(item.nome).includes(term) || normalize(item.descricao).includes(term));
  if (!filtered.length) {
    mealList.innerHTML = '<p class="empty">Nenhuma refeição salva ainda.</p>';
    return;
  }
  mealList.innerHTML = filtered.map(meal => {
    const items = mealItems.filter(item => item.refeicao_biblioteca_id === meal.id).sort((a, b) => a.ordem - b.ordem);
    const category = mealCategories.find(item => item.id === meal.categoria_id);
    return `<article class="meal-library-item"><div><div class="exercise-library-item-title"><h3>${esc(meal.nome)}</h3><span class="library-badge${meal.global ? '' : ' personal'}">${meal.global ? 'PADRÃO FS FIT' : 'MINHA REFEIÇÃO'}</span></div>${meal.descricao ? `<p>${esc(meal.descricao)}</p>` : ''}<div class="meal-library-meta">${category ? `<span class="food-macro-chip">${esc(category.nome)}</span>` : ''}<span class="food-macro-chip">${items.length} ${items.length === 1 ? 'item' : 'itens'}</span></div>${items.length ? `<ul class="meal-library-items">${items.map(item => `<li>${item.quantidade != null ? `${formatNumber(item.quantidade)} ` : ''}${esc(item.unidade || '')} ${esc(item.nome_alimento)}</li>`).join('')}</ul>` : ''}</div><div class="meal-library-actions">${meal.global ? '' : `<button class="btn btn-danger" type="button" data-delete-meal="${meal.id}" data-name="${esc(meal.nome)}">Excluir</button>`}</div></article>`;
  }).join('');
}

async function loadData() {
  const [foodCategoryResult, foodResult, mealCategoryResult, mealResult, mealItemsResult] = await Promise.all([
    supabase.from('categorias_alimentos').select('id,nome,global,personal_id,ordem').or(`global.eq.true,personal_id.eq.${session.user.id}`).order('ordem').order('nome'),
    supabase.from('alimentos').select('*').or(`global.eq.true,personal_id.eq.${session.user.id}`).order('global', { ascending: false }).order('nome'),
    supabase.from('categorias_refeicoes').select('id,nome,global,personal_id,ordem').or(`global.eq.true,personal_id.eq.${session.user.id}`).order('ordem').order('nome'),
    supabase.from('biblioteca_refeicoes').select('*').or(`global.eq.true,personal_id.eq.${session.user.id}`).order('nome'),
    supabase.from('biblioteca_refeicao_itens').select('*').order('ordem')
  ]);
  const error = foodCategoryResult.error || foodResult.error || mealCategoryResult.error || mealResult.error || mealItemsResult.error;
  if (error) throw error;
  foodCategories = foodCategoryResult.data || [];
  foods = foodResult.data || [];
  mealCategories = mealCategoryResult.data || [];
  meals = mealResult.data || [];
  mealItems = mealItemsResult.data || [];
  if (!foodCategories.some(item => item.id === activeFoodCategoryId)) activeFoodCategoryId = foodCategories[0]?.id || null;
  if (!foodCategories.some(item => item.id === activeMealFoodCategoryId)) activeMealFoodCategoryId = foodCategories[0]?.id || null;
  populateFoodCategorySelect(activeFoodCategoryId || '');
  populateMealCategorySelect();
  renderFoodCategoryNav();
  renderFoods();
  renderMealFoodCategoryNav();
  renderMealFoodPicker();
  renderMeals();
}

function editFood(id) {
  const item = foods.find(food => food.id === id);
  if (!item) return;
  editingFoodId = item.global ? null : item.id;
  editingGlobalFoodId = item.global ? item.id : null;
  foodForm.nome.value = item.nome || '';
  populateFoodCategorySelect(item.categoria_id || '');
  foodForm.porcao_padrao.value = item.porcao_padrao ?? '';
  foodForm.unidade.value = item.unidade || '';
  foodForm.calorias.value = item.calorias ?? '';
  foodForm.proteinas_g.value = item.proteinas_g ?? '';
  foodForm.carboidratos_g.value = item.carboidratos_g ?? '';
  foodForm.gorduras_g.value = item.gorduras_g ?? '';
  foodForm.observacoes.value = item.observacoes || '';
  foodFormTitle.textContent = `Editar ${item.nome}`;
  foodSubmit.textContent = 'Salvar alterações';
  openModal(foodModal);
}

foodForm.addEventListener('submit', async event => {
  event.preventDefault();
  const payload = {
    personal_id: session.user.id,
    categoria_id: foodForm.categoria_id.value,
    nome: foodForm.nome.value.trim(),
    porcao_padrao: num(foodForm.porcao_padrao.value),
    unidade: foodForm.unidade.value.trim() || null,
    calorias: num(foodForm.calorias.value),
    proteinas_g: num(foodForm.proteinas_g.value),
    carboidratos_g: num(foodForm.carboidratos_g.value),
    gorduras_g: num(foodForm.gorduras_g.value),
    observacoes: foodForm.observacoes.value.trim() || null,
    global: false
  };
  if (!payload.categoria_id || payload.nome.length < 2) return showMessage(message, 'Informe nome e categoria do alimento.', 'error');
  foodSubmit.disabled = true;
  try {
    let query;
    if (editingGlobalFoodId) query = supabase.from('alimentos').insert({ ...payload, origem_global_id: editingGlobalFoodId });
    else if (editingFoodId) query = supabase.from('alimentos').update(payload).eq('id', editingFoodId).eq('personal_id', session.user.id).eq('global', false);
    else query = supabase.from('alimentos').insert(payload);
    const { error } = await query;
    if (error) throw error;
    activeFoodCategoryId = payload.categoria_id;
    closeModal(foodModal);
    resetFoodForm();
    await loadData();
    showMessage(message, 'Alimento salvo na biblioteca.');
  } catch (error) {
    console.error(error);
    showMessage(message, error.message || 'Não foi possível salvar o alimento.', 'error');
  } finally { foodSubmit.disabled = false; }
});

foodCategoryForm.addEventListener('submit', async event => {
  event.preventDefault();
  const nome = foodCategoryForm.nome.value.trim();
  if (nome.length < 2) return showMessage(message, 'Informe o nome da categoria.', 'error');
  foodCategorySubmit.disabled = true;
  try {
    if (editingFoodCategoryId) {
      const { error } = await supabase.from('categorias_alimentos').update({ nome, updated_at: new Date().toISOString() }).eq('id', editingFoodCategoryId).eq('personal_id', session.user.id).eq('global', false);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('categorias_alimentos').insert({ nome, personal_id: session.user.id, global: false }).select('id').single();
      if (error) throw error;
      activeFoodCategoryId = data.id;
    }
    closeModal(foodCategoryModal);
    resetFoodCategoryForm();
    await loadData();
    showMessage(message, 'Categoria salva.');
  } catch (error) {
    console.error(error);
    showMessage(message, error.message || 'Não foi possível salvar a categoria.', 'error');
  } finally { foodCategorySubmit.disabled = false; }
});

mealForm.addEventListener('submit', async event => {
  event.preventDefault();
  const nome = mealForm.nome.value.trim();
  if (nome.length < 2) return showMessage(message, 'Informe o nome da refeição.', 'error');
  if (!selectedMealFoods.size) return showMessage(message, 'Selecione pelo menos um alimento.', 'error');
  mealSubmit.disabled = true;
  try {
    const { data: meal, error: mealError } = await supabase.from('biblioteca_refeicoes').insert({ personal_id: session.user.id, categoria_id: mealForm.categoria_id.value || null, nome, descricao: mealForm.descricao.value.trim() || null, global: false }).select('id').single();
    if (mealError) throw mealError;
    const items = [...selectedMealFoods.values()].map((item, index) => ({ refeicao_biblioteca_id: meal.id, alimento_id: item.id, nome_alimento: item.nome, quantidade: num(item.quantidade), unidade: item.unidade || null, observacoes: item.observacoes || null, ordem: index + 1 }));
    const { error: itemsError } = await supabase.from('biblioteca_refeicao_itens').insert(items);
    if (itemsError) throw itemsError;
    closeModal(mealModal);
    resetMealBuilder();
    await loadData();
    showMessage(message, 'Refeição salva na biblioteca.');
  } catch (error) {
    console.error(error);
    showMessage(message, error.message || 'Não foi possível salvar a refeição.', 'error');
  } finally { mealSubmit.disabled = false; }
});

foodSearch.addEventListener('input', renderFoods);
mealSearch.addEventListener('input', renderMeals);
mealFoodSearch.addEventListener('input', renderMealFoodPicker);

document.querySelector('#open-food-modal').addEventListener('click', () => { resetFoodForm(); openModal(foodModal); });
document.querySelector('#open-food-category-modal').addEventListener('click', () => { resetFoodCategoryForm(); openModal(foodCategoryModal); });
document.querySelector('#open-meal-builder').addEventListener('click', () => { resetMealBuilder(); openModal(mealModal); });
document.querySelector('#cancel-food-edit').addEventListener('click', () => { closeModal(foodModal); resetFoodForm(); });
document.querySelector('#cancel-food-category-edit').addEventListener('click', () => { closeModal(foodCategoryModal); resetFoodCategoryForm(); });
document.querySelector('#cancel-meal-builder').addEventListener('click', () => { closeModal(mealModal); resetMealBuilder(); });

document.addEventListener('click', async event => {
  if (event.target.closest('[data-close-food-modal]')) { closeModal(foodModal); resetFoodForm(); return; }
  if (event.target.closest('[data-close-food-category-modal]')) { closeModal(foodCategoryModal); resetFoodCategoryForm(); return; }
  if (event.target.closest('[data-close-meal-builder]')) { closeModal(mealModal); resetMealBuilder(); return; }

  const categoryButton = event.target.closest('[data-food-category]');
  if (categoryButton) { activeFoodCategoryId = categoryButton.dataset.foodCategory; foodSearch.value = ''; renderFoodCategoryNav(); renderFoods(); return; }
  const mealCategoryButton = event.target.closest('[data-meal-food-category]');
  if (mealCategoryButton) { activeMealFoodCategoryId = mealCategoryButton.dataset.mealFoodCategory; renderMealFoodCategoryNav(); renderMealFoodPicker(); return; }

  const missingFood = event.target.closest('[data-add-missing-food]');
  if (missingFood) { resetFoodForm(missingFood.dataset.addMissingFood); openModal(foodModal); return; }
  const missingMealFood = event.target.closest('[data-add-missing-meal-food]');
  if (missingMealFood) { resetFoodForm(missingMealFood.dataset.addMissingMealFood); openModal(foodModal); return; }

  const editFoodButton = event.target.closest('[data-edit-food]');
  if (editFoodButton) { editFood(editFoodButton.dataset.editFood); return; }
  const deleteFoodButton = event.target.closest('[data-delete-food]');
  if (deleteFoodButton) {
    if (!confirm(`Excluir ${deleteFoodButton.dataset.name} da biblioteca?`)) return;
    const { error } = await supabase.from('alimentos').delete().eq('id', deleteFoodButton.dataset.deleteFood).eq('personal_id', session.user.id).eq('global', false);
    if (error) return showMessage(message, 'Não foi possível excluir o alimento.', 'error');
    await loadData();
    showMessage(message, 'Alimento excluído.');
    return;
  }

  const editCategoryButton = event.target.closest('[data-edit-food-category]');
  if (editCategoryButton) {
    const category = foodCategoryById(editCategoryButton.dataset.editFoodCategory);
    if (!category || category.global) return;
    editingFoodCategoryId = category.id;
    foodCategoryForm.nome.value = category.nome;
    foodCategoryFormTitle.textContent = `Editar ${category.nome}`;
    foodCategorySubmit.textContent = 'Salvar alterações';
    openModal(foodCategoryModal);
    return;
  }
  const deleteCategoryButton = event.target.closest('[data-delete-food-category]');
  if (deleteCategoryButton) {
    if (!confirm(`Excluir a categoria ${deleteCategoryButton.dataset.name}?`)) return;
    const { error } = await supabase.from('categorias_alimentos').delete().eq('id', deleteCategoryButton.dataset.deleteFoodCategory).eq('personal_id', session.user.id).eq('global', false);
    if (error) return showMessage(message, 'Não é possível excluir uma categoria que possui alimentos.', 'error');
    activeFoodCategoryId = null;
    await loadData();
    showMessage(message, 'Categoria excluída.');
    return;
  }

  const removeFoodButton = event.target.closest('[data-remove-meal-food]');
  if (removeFoodButton) {
    selectedMealFoods.delete(removeFoodButton.dataset.removeMealFood);
    renderMealFoodPicker();
    renderSelectedMealFoods();
    return;
  }

  const deleteMealButton = event.target.closest('[data-delete-meal]');
  if (deleteMealButton) {
    if (!confirm(`Excluir a refeição ${deleteMealButton.dataset.name}?`)) return;
    const { error } = await supabase.from('biblioteca_refeicoes').delete().eq('id', deleteMealButton.dataset.deleteMeal).eq('personal_id', session.user.id).eq('global', false);
    if (error) return showMessage(message, 'Não foi possível excluir a refeição.', 'error');
    await loadData();
    showMessage(message, 'Refeição excluída.');
  }
});

document.addEventListener('change', event => {
  const checkbox = event.target.closest('[data-select-meal-food]');
  if (checkbox) {
    const item = foods.find(food => food.id === checkbox.dataset.selectMealFood);
    if (!item) return;
    if (checkbox.checked) selectedMealFoods.set(item.id, { id: item.id, nome: item.nome, quantidade: item.porcao_padrao, unidade: item.unidade || '', observacoes: '' });
    else selectedMealFoods.delete(item.id);
    renderSelectedMealFoods();
    return;
  }
  const quantity = event.target.closest('[data-meal-quantity]');
  if (quantity) { const item = selectedMealFoods.get(quantity.dataset.mealQuantity); if (item) item.quantidade = quantity.value; return; }
  const unit = event.target.closest('[data-meal-unit]');
  if (unit) { const item = selectedMealFoods.get(unit.dataset.mealUnit); if (item) item.unidade = unit.value; return; }
  const note = event.target.closest('[data-meal-note]');
  if (note) { const item = selectedMealFoods.get(note.dataset.mealNote); if (item) item.observacoes = note.value; }
});

try {
  await loadData();
} catch (error) {
  console.error(error);
  showMessage(message, error.message || 'Não foi possível carregar a biblioteca alimentar.', 'error');
}
