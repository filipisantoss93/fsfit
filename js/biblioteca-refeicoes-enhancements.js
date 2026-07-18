import { supabase } from './supabase.js';
import { showMessage } from './layout.js';

const foodSection = document.querySelector('.food-library-page > .library-list-card:not(.meal-library-section)');
const mealSection = document.querySelector('.meal-library-section');
const mealList = document.querySelector('#meal-library-list');
const mealSearch = document.querySelector('#meal-search');
const mealModal = document.querySelector('#meal-builder-modal');
const mealForm = document.querySelector('#meal-builder-form');
const mealSubmit = document.querySelector('#meal-submit');
const mealTitle = document.querySelector('#meal-builder-title');
const message = document.querySelector('#food-library-message');
const openMealBuilder = document.querySelector('#open-meal-builder');

if (!foodSection || !mealSection || !mealList || !mealForm) {
  console.warn('Biblioteca de refeições: estrutura esperada não encontrada.');
} else {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id || null;
  let editContext = null;

  const style = document.createElement('style');
  style.textContent = `
    .food-library-view-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:20px 0 0;padding:6px;border:1px solid var(--border);border-radius:16px;background:rgba(26,29,35,.94)}
    .food-library-view-tab{display:flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 14px;border:0;border-radius:11px;background:transparent;color:var(--muted);font-weight:850;cursor:pointer}
    .food-library-view-tab.active{background:var(--surface-light);color:var(--text);box-shadow:inset 0 0 0 1px rgba(255,255,255,.04)}
    .food-library-view-tab .view-count{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:rgba(59,130,246,.14);color:var(--secondary);font-size:.7rem;font-weight:900}
    .food-library-view-tab.active .view-count{background:rgba(50,215,75,.13);color:var(--primary)}
    .food-library-panel-hidden{display:none!important}
    .meal-library-section{margin-top:20px}
    .meal-library-actions{display:flex;gap:8px;flex-wrap:wrap}
    .meal-library-actions .btn{min-height:40px;padding:0 13px;font-size:.82rem}
    @media(max-width:560px){
      .food-library-view-tabs{position:sticky;top:calc(82px + var(--safe-area-top));z-index:18;margin-inline:0;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
      .food-library-view-tab{min-height:44px;padding:0 9px;font-size:.82rem}
      .meal-library-actions{width:100%}
      .meal-library-actions .btn{flex:1 1 auto}
    }
  `;
  document.head.appendChild(style);

  const tabs = document.createElement('nav');
  tabs.className = 'food-library-view-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Conteúdo da biblioteca alimentar');
  tabs.innerHTML = `
    <button class="food-library-view-tab active" type="button" role="tab" aria-selected="true" data-library-view="foods">Alimentos</button>
    <button class="food-library-view-tab" type="button" role="tab" aria-selected="false" data-library-view="meals">Refeições salvas <span class="view-count" id="saved-meal-count">0</span></button>
  `;
  foodSection.before(tabs);

  foodSection.setAttribute('role', 'tabpanel');
  foodSection.dataset.libraryPanel = 'foods';
  mealSection.setAttribute('role', 'tabpanel');
  mealSection.dataset.libraryPanel = 'meals';

  function setView(view, { focus = false } = {}) {
    const mealsActive = view === 'meals';
    foodSection.classList.toggle('food-library-panel-hidden', mealsActive);
    mealSection.classList.toggle('food-library-panel-hidden', !mealsActive);
    tabs.querySelectorAll('[data-library-view]').forEach(button => {
      const active = button.dataset.libraryView === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    sessionStorage.setItem('fsfit-food-library-view', view);
    if (focus) (mealsActive ? mealSection : foodSection).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  tabs.addEventListener('click', event => {
    const button = event.target.closest('[data-library-view]');
    if (button) setView(button.dataset.libraryView, { focus: true });
  });

  tabs.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const view = event.key === 'ArrowRight' ? 'meals' : 'foods';
    setView(view);
    tabs.querySelector(`[data-library-view="${view}"]`)?.focus();
  });

  function updateMealCountAndActions() {
    const cards = mealList.querySelectorAll('.meal-library-item');
    const count = document.querySelector('#saved-meal-count');
    if (count) count.textContent = String(cards.length);

    cards.forEach(card => {
      const actions = card.querySelector('.meal-library-actions');
      const deleteButton = card.querySelector('[data-delete-meal]');
      if (!actions || !deleteButton || actions.querySelector('[data-edit-meal]')) return;
      const editButton = document.createElement('button');
      editButton.className = 'btn btn-outline';
      editButton.type = 'button';
      editButton.dataset.editMeal = deleteButton.dataset.deleteMeal;
      editButton.textContent = 'Editar';
      actions.prepend(editButton);
    });
  }

  new MutationObserver(updateMealCountAndActions).observe(mealList, { childList: true, subtree: true });
  updateMealCountAndActions();

  function resetEditState() {
    editContext = null;
    delete mealForm.dataset.editingMealId;
    mealTitle.textContent = 'Montar refeição';
    mealSubmit.textContent = 'Salvar refeição';
  }

  async function openMealEditor(mealId) {
    if (!userId) return;

    const [{ data: meal, error: mealError }, { data: items, error: itemsError }] = await Promise.all([
      supabase.from('biblioteca_refeicoes').select('id,nome,descricao,categoria_id,personal_id,global').eq('id', mealId).eq('personal_id', userId).eq('global', false).single(),
      supabase.from('biblioteca_refeicao_itens').select('alimento_id,nome_alimento,quantidade,unidade,observacoes,ordem').eq('refeicao_biblioteca_id', mealId).order('ordem')
    ]);

    if (mealError || itemsError || !meal) {
      showMessage(message, 'Não foi possível carregar a refeição para edição.', 'error');
      return;
    }

    openMealBuilder?.click();
    mealForm.dataset.editingMealId = meal.id;
    mealTitle.textContent = `Editar ${meal.nome}`;
    mealSubmit.textContent = 'Salvar alterações';
    mealForm.nome.value = meal.nome || '';
    mealForm.categoria_id.value = meal.categoria_id || '';
    mealForm.descricao.value = meal.descricao || '';

    editContext = {
      originalMeal: { categoria_id: meal.categoria_id || null, nome: meal.nome, descricao: meal.descricao || null },
      originalItems: (items || []).map(item => ({ ...item }))
    };

    const foodIds = [...new Set((items || []).map(item => item.alimento_id).filter(Boolean))];
    if (foodIds.length) {
      const { data: foodRows } = await supabase.from('alimentos').select('id,categoria_id').in('id', foodIds);
      const categoryByFood = new Map((foodRows || []).map(item => [item.id, item.categoria_id]));

      for (const item of items || []) {
        if (!item.alimento_id) continue;
        const categoryId = categoryByFood.get(item.alimento_id);
        if (categoryId) document.querySelector(`[data-meal-food-category="${CSS.escape(categoryId)}"]`)?.click();
        const checkbox = document.querySelector(`[data-select-meal-food="${CSS.escape(item.alimento_id)}"]`);
        if (checkbox && !checkbox.checked) {
          checkbox.checked = true;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      for (const item of items || []) {
        if (!item.alimento_id) continue;
        const quantity = document.querySelector(`[data-meal-quantity="${CSS.escape(item.alimento_id)}"]`);
        const unit = document.querySelector(`[data-meal-unit="${CSS.escape(item.alimento_id)}"]`);
        const note = document.querySelector(`[data-meal-note="${CSS.escape(item.alimento_id)}"]`);
        if (quantity) { quantity.value = item.quantidade ?? ''; quantity.dispatchEvent(new Event('change', { bubbles: true })); }
        if (unit) { unit.value = item.unidade || ''; unit.dispatchEvent(new Event('change', { bubbles: true })); }
        if (note) { note.value = item.observacoes || ''; note.dispatchEvent(new Event('change', { bubbles: true })); }
      }
    }
  }

  document.addEventListener('click', event => {
    const editButton = event.target.closest('[data-edit-meal]');
    if (editButton) {
      event.preventDefault();
      openMealEditor(editButton.dataset.editMeal).catch(error => {
        console.error(error);
        showMessage(message, 'Não foi possível abrir a refeição para edição.', 'error');
      });
      return;
    }

    if (event.target.closest('#cancel-meal-builder,[data-close-meal-builder]')) resetEditState();
  });

  mealForm.addEventListener('submit', async event => {
    const mealId = mealForm.dataset.editingMealId;
    if (!mealId) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const nome = mealForm.nome.value.trim();
    const rows = [...mealForm.querySelectorAll('.meal-selected-row')];
    if (nome.length < 2) return showMessage(message, 'Informe o nome da refeição.', 'error');
    if (!rows.length) return showMessage(message, 'Selecione pelo menos um alimento.', 'error');

    const newMeal = {
      categoria_id: mealForm.categoria_id.value || null,
      nome,
      descricao: mealForm.descricao.value.trim() || null
    };
    const newItems = rows.map((row, index) => {
      const foodId = row.dataset.selectedRow;
      const quantity = row.querySelector(`[data-meal-quantity="${CSS.escape(foodId)}"]`)?.value;
      const unit = row.querySelector(`[data-meal-unit="${CSS.escape(foodId)}"]`)?.value;
      const note = row.querySelector(`[data-meal-note="${CSS.escape(foodId)}"]`)?.value;
      return {
        refeicao_biblioteca_id: mealId,
        alimento_id: foodId,
        nome_alimento: row.querySelector('.meal-selected-row-name')?.textContent?.trim() || 'Alimento',
        quantidade: quantity === '' ? null : Number(quantity),
        unidade: unit?.trim() || null,
        observacoes: note?.trim() || null,
        ordem: index + 1
      };
    });

    mealSubmit.disabled = true;
    try {
      const { error: updateError } = await supabase.from('biblioteca_refeicoes').update(newMeal).eq('id', mealId).eq('personal_id', userId).eq('global', false);
      if (updateError) throw updateError;

      const { error: deleteItemsError } = await supabase.from('biblioteca_refeicao_itens').delete().eq('refeicao_biblioteca_id', mealId);
      if (deleteItemsError) throw deleteItemsError;

      const { error: insertItemsError } = await supabase.from('biblioteca_refeicao_itens').insert(newItems);
      if (insertItemsError) throw insertItemsError;

      sessionStorage.setItem('fsfit-food-library-view', 'meals');
      sessionStorage.setItem('fsfit-food-library-flash', 'Refeição atualizada com sucesso.');
      window.location.reload();
    } catch (error) {
      console.error(error);
      if (editContext) {
        await supabase.from('biblioteca_refeicoes').update(editContext.originalMeal).eq('id', mealId).eq('personal_id', userId).eq('global', false);
        const { data: currentItems } = await supabase.from('biblioteca_refeicao_itens').select('id').eq('refeicao_biblioteca_id', mealId).limit(1);
        if (!currentItems?.length && editContext.originalItems.length) {
          await supabase.from('biblioteca_refeicao_itens').insert(editContext.originalItems.map(item => ({ refeicao_biblioteca_id: mealId, ...item })));
        }
      }
      showMessage(message, error.message || 'Não foi possível atualizar a refeição.', 'error');
    } finally {
      mealSubmit.disabled = false;
    }
  }, true);

  const preferredView = sessionStorage.getItem('fsfit-food-library-view') || 'foods';
  setView(preferredView === 'meals' ? 'meals' : 'foods');

  const flash = sessionStorage.getItem('fsfit-food-library-flash');
  if (flash) {
    sessionStorage.removeItem('fsfit-food-library-flash');
    showMessage(message, flash);
  }
}
