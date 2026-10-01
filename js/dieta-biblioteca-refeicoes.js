// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { supabase } from './supabase.js';
// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { showMessage } from './layout.js';
const message = document.querySelector('#diet-message');
const openButton = document.querySelector('#use-library-meal-button');
const modal = document.querySelector('#library-meal-modal');
const list = document.querySelector('#library-meal-list');
const search = document.querySelector('#library-meal-search');
const closeButtons = document.querySelectorAll('[data-close-library-meal-modal]');
const alunoId = new URLSearchParams(location.search).get('id');
let session = null;
let meals = [];
function esc(value = '') {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
}
function normalize(value = '') {
    return String(value || '').trim().toLocaleLowerCase('pt-BR');
}
async function getSession() {
    const { data: { session: current } } = await supabase.auth.getSession();
    session = (current || null);
    return session;
}
function openModal() {
    modal?.classList.add('open');
    modal?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('diet-modal-open');
    search?.focus();
}
function closeModal() {
    modal?.classList.remove('open');
    modal?.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.diet-modal.open'))
        document.body.classList.remove('diet-modal-open');
}
function visibleMeals() {
    const customizedGlobalIds = new Set(meals
        .filter(item => !item.global && item.personal_id === session?.user?.id && item.origem_global_id != null)
        .map(item => String(item.origem_global_id)));
    return meals.filter(item => !(item.global && customizedGlobalIds.has(String(item.id))));
}
function renderMeals() {
    if (!list)
        return;
    const term = normalize(search?.value);
    const filtered = visibleMeals().filter(item => !term || [item.nome, item.descricao, item.categoria_nome]
        .filter(Boolean)
        .some(value => normalize(value).includes(term)));
    if (!filtered.length) {
        list.innerHTML = `
      <div class="diet-plan-empty">
        <strong>Nenhuma refeição encontrada.</strong>
        <span>Crie uma nova refeição na Biblioteca Alimentar para reutilizá-la nos planos.</span>
        <a class="btn btn-primary" href="biblioteca-alimentar.html">Abrir Biblioteca Alimentar</a>
      </div>`;
        return;
    }
    list.innerHTML = filtered.map(item => `
    <article class="diet-library-meal-card">
      <div>
        <small>${esc(item.categoria_nome || 'REFEIÇÃO')}</small>
        <h3>${esc(item.nome)}</h3>
        <p>${esc(item.descricao || 'Sem descrição')}</p>
        <span>${item.itens_count || 0} ${item.itens_count === 1 ? 'item' : 'itens'}</span>
      </div>
      <button class="btn btn-primary" type="button" data-use-library-meal="${item.id}">Usar no plano</button>
    </article>`).join('');
}
async function loadMeals() {
    if (!session)
        await getSession();
    const userId = session?.user?.id;
    if (!userId)
        return;
    const [{ data: mealData, error: mealError }, { data: categoryData }, { data: itemData }] = await Promise.all([
        supabase.from('biblioteca_refeicoes').select('id,personal_id,categoria_id,nome,descricao,global,origem_global_id').or(`global.eq.true,personal_id.eq.${userId}`).order('global', { ascending: false }).order('nome'),
        supabase.from('categorias_refeicoes').select('id,nome'),
        supabase.from('biblioteca_refeicao_itens').select('refeicao_biblioteca_id')
    ]);
    if (mealError) {
        showMessage(message, 'Não foi possível carregar a biblioteca de refeições.', 'error');
        return;
    }
    const categories = (Array.isArray(categoryData) ? categoryData : []);
    const itemRefs = (Array.isArray(itemData) ? itemData : []);
    const categoryMap = new Map(categories.map(item => [String(item.id), item.nome]));
    const counts = itemRefs.reduce((acc, item) => {
        const key = String(item.refeicao_biblioteca_id);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const rows = (Array.isArray(mealData) ? mealData : []);
    meals = rows.map(item => ({
        ...item,
        categoria_nome: item.categoria_id != null ? (categoryMap.get(String(item.categoria_id)) || '') : '',
        itens_count: counts[String(item.id)] || 0
    }));
    renderMeals();
}
async function getActivePlanId() {
    if (!session)
        await getSession();
    const userId = session?.user?.id;
    if (!userId || !alunoId)
        return null;
    const { data, error } = await supabase
        .from('planos_alimentares')
        .select('id')
        .eq('aluno_id', alunoId)
        .eq('personal_id', userId)
        .eq('ativo', true)
        .maybeSingle();
    if (error)
        throw error;
    return data?.id || null;
}
async function useLibraryMeal(id) {
    const selected = meals.find(item => String(item.id) === String(id));
    if (!selected)
        return;
    const planId = await getActivePlanId();
    if (!planId) {
        showMessage(message, 'Crie ou ative um plano alimentar antes de usar uma refeição da biblioteca.', 'error');
        return;
    }
    const { data: sourceItemsData, error: sourceError } = await supabase
        .from('biblioteca_refeicao_itens')
        .select('alimento_id,nome_alimento,quantidade,unidade,observacoes,ordem')
        .eq('refeicao_biblioteca_id', id)
        .order('ordem');
    if (sourceError) {
        showMessage(message, 'Não foi possível carregar os itens da refeição.', 'error');
        return;
    }
    const sourceItems = (Array.isArray(sourceItemsData) ? sourceItemsData : []);
    const description = sourceItems.map(item => {
        const qty = item.quantidade != null ? `${item.quantidade} ` : '';
        const unit = item.unidade ? `${item.unidade} ` : '';
        return `${qty}${unit}${item.nome_alimento}`.trim();
    }).join(', ') || selected.descricao || 'Refeição da biblioteca';
    const { data: createdMeal, error: mealError } = await supabase
        .from('refeicoes')
        .insert({
        plano_alimentar_id: planId,
        nome: selected.nome,
        descricao: description,
        substituicoes: null,
        ordem: 1,
        dias_semana: [1, 2, 3, 4, 5, 6, 7]
    })
        .select('id')
        .single();
    if (mealError || !createdMeal?.id) {
        showMessage(message, 'Não foi possível adicionar a refeição ao plano.', 'error');
        return;
    }
    if (sourceItems.length) {
        const payload = sourceItems.map(item => ({
            refeicao_id: createdMeal.id,
            alimento_id: item.alimento_id,
            nome_alimento: item.nome_alimento,
            quantidade: item.quantidade,
            unidade: item.unidade,
            observacoes: item.observacoes,
            ordem: item.ordem
        }));
        const { error: itemError } = await supabase.from('refeicao_itens').insert(payload);
        if (itemError) {
            await supabase.from('refeicoes').delete().eq('id', createdMeal.id);
            showMessage(message, 'A refeição não pôde ser concluída porque os itens não foram copiados.', 'error');
            return;
        }
    }
    closeModal();
    showMessage(message, `Refeição “${selected.nome}” adicionada ao plano ativo.`);
    window.dispatchEvent(new CustomEvent('fsfit:diet-updated', {
        detail: { alunoId, planId, mealId: createdMeal.id, source: 'library' }
    }));
}
openButton?.addEventListener('click', async () => {
    await loadMeals();
    openModal();
});
search?.addEventListener('input', renderMeals);
closeButtons.forEach(button => button.addEventListener('click', closeModal));
document.addEventListener('click', event => {
    if (!(event.target instanceof Element))
        return;
    const button = event.target.closest('[data-use-library-meal]');
    const id = button?.dataset.useLibraryMeal;
    if (id)
        useLibraryMeal(id).catch(error => {
            console.error(error);
            showMessage(message, 'Não foi possível usar a refeição da biblioteca.', 'error');
        });
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal?.classList.contains('open'))
        closeModal();
});
