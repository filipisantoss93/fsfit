import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('exercicios');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const form = document.querySelector('#exercise-library-form');
const categoryForm = document.querySelector('#category-form');
const message = document.querySelector('#library-message');
const list = document.querySelector('#exercise-library-list');
const categoryNav = document.querySelector('#library-category-nav');
const activeCategoryActions = document.querySelector('#active-category-actions');
const selectedCategoryTitle = document.querySelector('#selected-category-title');
const search = document.querySelector('#exercise-search');
const formTitle = document.querySelector('#library-form-title');
const submitButton = document.querySelector('#library-submit');
const categoryFormTitle = document.querySelector('#category-form-title');
const categorySubmit = document.querySelector('#category-submit');
const modal = document.querySelector('#library-modal');
const categoryModal = document.querySelector('#category-modal');

let exercises = [];
let categories = [];
let editingId = null;
let editingGlobalId = null;
let editingCategoryId = null;
let activeCategoryId = null;

function esc(value = '') { const div = document.createElement('div'); div.textContent = value ?? ''; return div.innerHTML; }
function normalize(value = '') { return String(value || '').trim().toLocaleLowerCase('pt-BR'); }
function categoryById(id) { return categories.find(item => item.id === id); }
function getVisibleExercises() {
  const customizedGlobalIds = new Set(exercises.filter(item => !item.global && item.personal_id === session.user.id && item.origem_global_id).map(item => item.origem_global_id));
  return exercises.filter(item => !(item.global && customizedGlobalIds.has(item.id)));
}
function populateCategorySelect(selectedId = '') {
  form.categoria_id.innerHTML = '<option value="">Selecione uma categoria</option>' + categories.map(category => `<option value="${category.id}">${esc(category.nome)}${category.global ? ' · FS Fit' : ''}</option>`).join('');
  form.categoria_id.value = selectedId || '';
}
function resetExerciseForm() { editingId = null; editingGlobalId = null; form.reset(); populateCategorySelect(activeCategoryId || ''); formTitle.textContent = 'Novo exercício'; submitButton.textContent = 'Adicionar exercício'; }
function resetCategoryForm() { editingCategoryId = null; categoryForm.reset(); categoryFormTitle.textContent = 'Nova categoria'; categorySubmit.textContent = 'Criar categoria'; }
function openModal(target) { target.classList.add('open'); target.setAttribute('aria-hidden', 'false'); document.body.classList.add('library-modal-open'); }
function closeModal(target, reset) { target.classList.remove('open'); target.setAttribute('aria-hidden', 'true'); if (!document.querySelector('.library-modal.open')) document.body.classList.remove('library-modal-open'); reset(); }

function renderCategoryNav() {
  if (!categories.length) { categoryNav.innerHTML = '<span class="empty">Nenhuma categoria disponível.</span>'; return; }
  categoryNav.innerHTML = categories.map(category => {
    const active = category.id === activeCategoryId;
    return `<button class="library-category-pill${active ? ' active' : ''}" type="button" data-open-category="${category.id}" aria-pressed="${active}">${esc(category.nome)}</button>`;
  }).join('');
  const active = categoryById(activeCategoryId);
  const own = active && !active.global && active.personal_id === session.user.id;
  if (own) {
    activeCategoryActions.innerHTML = `<span>Categoria personalizada</span><div class="actions"><button class="btn btn-outline" type="button" data-edit-category="${active.id}">Editar categoria</button><button class="btn btn-danger" type="button" data-delete-category="${active.id}" data-name="${esc(active.nome)}">Excluir categoria</button></div>`;
    activeCategoryActions.classList.remove('hidden');
  } else {
    activeCategoryActions.innerHTML = '';
    activeCategoryActions.classList.add('hidden');
  }
}

function renderExercises() {
  const active = categoryById(activeCategoryId);
  selectedCategoryTitle.textContent = active ? active.nome : 'Exercícios';
  if (!activeCategoryId) { list.innerHTML = '<p class="empty">Nenhuma categoria selecionada.</p>'; return; }
  const term = normalize(search.value);
  const filtered = getVisibleExercises().filter(item => item.categoria_id === activeCategoryId && (!term || [item.nome, item.equipamento, item.instrucoes].filter(Boolean).some(value => normalize(value).includes(term))));
  if (!filtered.length) { list.innerHTML = '<p class="empty">Nenhum exercício nesta categoria.</p>'; return; }
  list.innerHTML = filtered.map(item => {
    const isGlobal = Boolean(item.global);
    const isCustomized = Boolean(item.origem_global_id);
    const badge = isGlobal ? 'PADRÃO FS FIT' : isCustomized ? 'PERSONALIZADO' : 'MEU EXERCÍCIO';
    return `<article class="exercise-library-item"><div class="exercise-library-item-content"><div class="exercise-library-item-title"><h3>${esc(item.nome)}</h3><span class="library-badge${isGlobal ? '' : ' personal'}">${badge}</span></div><p>${esc(item.equipamento || 'Sem equipamento informado')}</p>${item.instrucoes ? `<p class="library-instructions">${esc(item.instrucoes)}</p>` : ''}${item.video_url ? `<a class="record-secondary-link" href="${esc(item.video_url)}" target="_blank" rel="noopener">Abrir vídeo / mídia →</a>` : ''}</div><div class="actions library-item-actions${isGlobal ? ' single-action' : ''}"><button class="btn btn-outline library-edit-exercise" type="button" data-edit-exercise="${item.id}">Editar</button>${isGlobal ? '' : `<button class="btn btn-danger" type="button" data-delete-exercise="${item.id}" data-name="${esc(item.nome)}">Excluir</button>`}</div></article>`;
  }).join('');
}

function openCategory(categoryId) {
  const category = categoryById(categoryId);
  if (!category) return;
  activeCategoryId = categoryId;
  search.value = '';
  renderCategoryNav();
  renderExercises();
  requestAnimationFrame(() => document.querySelector(`[data-open-category="${CSS.escape(categoryId)}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }));
}

async function loadData() {
  const previousCategoryId = activeCategoryId;
  const [{ data: categoryData, error: categoryError }, { data: exerciseData, error: exerciseError }] = await Promise.all([
    supabase.from('categorias_exercicios').select('id,nome,global,personal_id').or(`global.eq.true,personal_id.eq.${session.user.id}`),
    supabase.from('exercicios').select('id,nome,grupo_muscular,equipamento,instrucoes,video_url,global,personal_id,origem_global_id,categoria_id').or(`global.eq.true,personal_id.eq.${session.user.id}`).order('global', { ascending: false }).order('nome')
  ]);
  if (categoryError || exerciseError) throw categoryError || exerciseError;
  categories = (categoryData || []).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
  exercises = exerciseData || [];
  populateCategorySelect();
  activeCategoryId = previousCategoryId && categoryById(previousCategoryId) ? previousCategoryId : (categories[0]?.id || null);
  renderCategoryNav();
  renderExercises();
}

function editExercise(id) {
  const item = exercises.find(exercise => exercise.id === id);
  if (!item || (!item.global && item.personal_id !== session.user.id)) return;
  editingId = item.global ? null : item.id;
  editingGlobalId = item.global ? item.id : null;
  form.nome.value = item.nome || '';
  populateCategorySelect(item.categoria_id);
  form.equipamento.value = item.equipamento || '';
  form.instrucoes.value = item.instrucoes || '';
  form.video_url.value = item.video_url || '';
  formTitle.textContent = `Editar ${item.nome}`;
  submitButton.textContent = 'Salvar alterações';
  openModal(modal);
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const category = categoryById(form.categoria_id.value);
  if (!category) return showMessage(message, 'Selecione uma categoria para o exercício.', 'error');
  const payload = { personal_id: session.user.id, nome: form.nome.value.trim(), categoria_id: category.id, grupo_muscular: category.nome, equipamento: form.equipamento.value.trim() || null, instrucoes: form.instrucoes.value.trim() || null, video_url: form.video_url.value.trim() || null, global: false };
  if (payload.nome.length < 2) return showMessage(message, 'Informe o nome do exercício.', 'error');
  const wasEditing = Boolean(editingId || editingGlobalId);
  submitButton.disabled = true;
  try {
    let query;
    if (editingGlobalId) query = supabase.from('exercicios').insert({ ...payload, origem_global_id: editingGlobalId });
    else if (editingId) query = supabase.from('exercicios').update(payload).eq('id', editingId).eq('personal_id', session.user.id).eq('global', false);
    else query = supabase.from('exercicios').insert(payload);
    const { error } = await query;
    if (error) throw error;
    const selectedCategory = category.id;
    closeModal(modal, resetExerciseForm);
    activeCategoryId = selectedCategory;
    await loadData();
    showMessage(message, wasEditing ? 'Exercício atualizado para sua biblioteca.' : 'Exercício salvo na categoria selecionada.');
  } catch (error) { console.error(error); showMessage(message, error.message || 'Não foi possível salvar o exercício.', 'error'); } finally { submitButton.disabled = false; }
});

categoryForm.addEventListener('submit', async event => {
  event.preventDefault();
  const nome = categoryForm.nome.value.trim();
  if (nome.length < 2) return showMessage(message, 'Informe o nome da categoria.', 'error');
  if (categories.some(item => item.id !== editingCategoryId && normalize(item.nome) === normalize(nome))) return showMessage(message, 'Já existe uma categoria com esse nome.', 'error');
  const wasEditing = Boolean(editingCategoryId);
  categorySubmit.disabled = true;
  try {
    if (editingCategoryId) {
      const { error } = await supabase.from('categorias_exercicios').update({ nome, updated_at: new Date().toISOString() }).eq('id', editingCategoryId).eq('personal_id', session.user.id).eq('global', false);
      if (error) throw error;
      const { error: exerciseError } = await supabase.from('exercicios').update({ grupo_muscular: nome }).eq('categoria_id', editingCategoryId).eq('personal_id', session.user.id).eq('global', false);
      if (exerciseError) throw exerciseError;
    } else {
      const { data, error } = await supabase.from('categorias_exercicios').insert({ nome, personal_id: session.user.id, global: false }).select('id').single();
      if (error) throw error;
      activeCategoryId = data?.id || activeCategoryId;
    }
    closeModal(categoryModal, resetCategoryForm);
    await loadData();
    showMessage(message, wasEditing ? 'Categoria atualizada.' : 'Categoria criada com sucesso.');
  } catch (error) { console.error(error); showMessage(message, error.message || 'Não foi possível salvar a categoria.', 'error'); } finally { categorySubmit.disabled = false; }
});

document.querySelector('#open-library-modal').addEventListener('click', () => { resetExerciseForm(); openModal(modal); });
document.querySelector('#open-category-modal').addEventListener('click', () => { resetCategoryForm(); openModal(categoryModal); });
document.querySelector('#cancel-library-edit').addEventListener('click', () => closeModal(modal, resetExerciseForm));
document.querySelector('#cancel-category-edit').addEventListener('click', () => closeModal(categoryModal, resetCategoryForm));
search.addEventListener('input', renderExercises);
document.addEventListener('click', async event => {
  if (event.target.closest('[data-close-library-modal]')) return closeModal(modal, resetExerciseForm);
  if (event.target.closest('[data-close-category-modal]')) return closeModal(categoryModal, resetCategoryForm);
  const editExerciseButton = event.target.closest('[data-edit-exercise]');
  if (editExerciseButton) return editExercise(editExerciseButton.dataset.editExercise);
  const editCategoryButton = event.target.closest('[data-edit-category]');
  if (editCategoryButton) { const category = categoryById(editCategoryButton.dataset.editCategory); if (!category || category.global || category.personal_id !== session.user.id) return; editingCategoryId = category.id; categoryForm.nome.value = category.nome; categoryFormTitle.textContent = `Editar ${category.nome}`; categorySubmit.textContent = 'Salvar alterações'; return openModal(categoryModal); }
  const deleteCategoryButton = event.target.closest('[data-delete-category]');
  if (deleteCategoryButton) { if (!confirm(`Excluir a categoria ${deleteCategoryButton.dataset.name}?`)) return; const { error } = await supabase.from('categorias_exercicios').delete().eq('id', deleteCategoryButton.dataset.deleteCategory).eq('personal_id', session.user.id).eq('global', false); if (error) return showMessage(message, 'Não é possível excluir uma categoria que possui exercícios. Mova ou exclua os exercícios primeiro.', 'error'); await loadData(); return showMessage(message, 'Categoria excluída.'); }
  const deleteExerciseButton = event.target.closest('[data-delete-exercise]');
  if (deleteExerciseButton) { if (!confirm(`Excluir ${deleteExerciseButton.dataset.name} da biblioteca?`)) return; const { error } = await supabase.from('exercicios').delete().eq('id', deleteExerciseButton.dataset.deleteExercise).eq('personal_id', session.user.id).eq('global', false); if (error) return showMessage(message, 'Não foi possível excluir o exercício.', 'error'); await loadData(); return showMessage(message, 'Exercício excluído.'); }
  const categoryButton = event.target.closest('[data-open-category]');
  if (categoryButton && !event.target.closest('[data-edit-category],[data-delete-category]')) return openCategory(categoryButton.dataset.openCategory);
});

await loadData();
