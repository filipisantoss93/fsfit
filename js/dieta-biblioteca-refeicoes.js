import { supabase } from './supabase.js';
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
  div.textContent = value ?? '';
  return div.innerHTML;
}

function normalize(value = '') {
  return String(value || '').trim().toLocaleLowerCase('pt-BR');
}

async function getSession() {
  const { data: { session: current } } = await supabase.auth.getSession();
  session = current;
  return current;
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
  if (!document.querySelector('.diet-modal.open')) document.body.classList.remove('diet-modal-open');
}

function visibleMeals() {
  const customizedGlobalIds = new Set(meals.filter(item => !item.global && item.personal_id === session?.user?.id && item.origem_global_id).map(item => item.origem_global_id));
  return meals.filter(item => !(item.global && customizedGlobalIds.has(item.id)));
}

function renderMeals() {
  if (!list) return;
  const term = normalize(search?.value);
  const filtered = visibleMeals().filter(item => !term || [item.nome, item.descricao, item.categoria_nome].filter(Boolean).some(value => normalize(value).includes(term)));

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
  if (!session) await getSession();
  if (!session?.user?.id) return;

  const [{ data: mealData, error: mealError }, { data: categoryData }, { data: itemData }] = await Promise.all([
    supabase.from('biblioteca_refeicoes').select('id,personal_id,categoria_id,nome,descricao,global,origem_global_id').or(`global.eq.true,personal_id.eq.${session.user.id}`).order('global', { ascending: false }).order('nome'),
    supabase.from('categorias_refeicoes').select('id,nome'),
    supabase.from('biblioteca_refeicao_itens').select('refeicao_biblioteca_id')
  ]);

  if (mealError) {
    showMessage(message, 'Não foi possível carregar a biblioteca de refeições.', 'error');
    return;
  }

  const categoryMap = new Map((categoryData || []).map(item => [item.id, item.nome]));
  const counts = (itemData || []).reduce((acc, item) => {
    acc[item.refeicao_biblioteca_id] = (acc[item.refeicao_biblioteca_id] || 0) + 1;
    return acc;
  }, {});

  meals = (mealData || []).map(item => ({
    ...item,
    categoria_nome: categoryMap.get(item.categoria_id) || '',
    itens_count: counts[item.id] || 0
  }));
  renderMeals();
}

async function getActivePlanId() {
  const { data, error } = await supabase
    .from('planos_alimentares')
    .select('id')
    .eq('aluno_id', alunoId)
    .eq('personal_id', session.user.id)
    .eq('ativo', true)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

async function useLibraryMeal(id) {
  const selected = meals.find(item => item.id === id);
  if (!selected) return;

  const planId = await getActivePlanId();
  if (!planId) return showMessage(message, 'Crie ou ative um plano alimentar antes de usar uma refeição da biblioteca.', 'error');

  const { data: sourceItems, error: sourceError } = await supabase
    .from('biblioteca_refeicao_itens')
    .select('alimento_id,nome_alimento,quantidade,unidade,observacoes,ordem')
    .eq('refeicao_biblioteca_id', id)
    .order('ordem');
  if (sourceError) return showMessage(message, 'Não foi possível carregar os itens da refeição.', 'error');

  const description = (sourceItems || []).map(item => {
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

  if (mealError) return showMessage(message, 'Não foi possível adicionar a refeição ao plano.', 'error');

  if (sourceItems?.length) {
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
      return showMessage(message, 'A refeição não pôde ser concluída porque os itens não foram copiados.', 'error');
    }
  }

  closeModal();
  showMessage(message, `Refeição “${selected.nome}” adicionada ao plano ativo.`);
  setTimeout(() => window.location.reload(), 350);
}

openButton?.addEventListener('click', async () => {
  await loadMeals();
  openModal();
});
search?.addEventListener('input', renderMeals);
closeButtons.forEach(button => button.addEventListener('click', closeModal));

document.addEventListener('click', event => {
  const button = event.target.closest('[data-use-library-meal]');
  if (button) useLibraryMeal(button.dataset.useLibraryMeal).catch(error => {
    console.error(error);
    showMessage(message, 'Não foi possível usar a refeição da biblioteca.', 'error');
  });
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && modal?.classList.contains('open')) closeModal();
});
