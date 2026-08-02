import { supabase } from './supabase.js';
import { showMessage } from './layout.js';

const alunoId = new URLSearchParams(location.search).get('id');
const message = document.querySelector('#diet-message');
const openButton = document.querySelector('#use-diet-model-button');
const modal = document.querySelector('#diet-model-picker-modal');
const list = document.querySelector('#diet-model-picker-list');
const search = document.querySelector('#diet-model-picker-search');

let session = null;
let models = [];

function esc(value = '') { const div = document.createElement('div'); div.textContent = value ?? ''; return div.innerHTML; }
function normalize(value = '') { return String(value || '').trim().toLocaleLowerCase('pt-BR'); }
function openModal() { modal?.classList.add('open'); modal?.setAttribute('aria-hidden', 'false'); document.body.classList.add('diet-modal-open'); search?.focus(); }
function closeModal() { modal?.classList.remove('open'); modal?.setAttribute('aria-hidden', 'true'); if (!document.querySelector('.diet-modal.open')) document.body.classList.remove('diet-modal-open'); }

function visibleModels() {
  const customized = new Set(models.filter(item => !item.global && item.personal_id === session?.user?.id && item.origem_global_id).map(item => item.origem_global_id));
  return models.filter(item => !(item.global && customized.has(item.id)));
}

function renderModels() {
  const term = normalize(search?.value);
  const filtered = visibleModels().filter(item => !term || [item.nome, item.descricao, item.orientacoes].filter(Boolean).some(value => normalize(value).includes(term)));
  if (!filtered.length) {
    list.innerHTML = '<div class="diet-plan-empty"><strong>Nenhum modelo encontrado.</strong><span>Crie um modelo de dieta para reutilizá-lo nos planos dos alunos.</span><a class="btn btn-primary" href="modelos-dieta.html">Criar modelo de dieta</a></div>';
    return;
  }
  list.innerHTML = filtered.map(item => `
    <article class="diet-library-meal-card">
      <div><small>${item.global ? 'PADRÃO FS FIT' : item.origem_global_id ? 'PERSONALIZADO' : 'MEU MODELO'}</small><h3>${esc(item.nome)}</h3><p>${esc(item.descricao || 'Sem descrição')}</p><span>${item.agua_ml != null ? `${esc(String(item.agua_ml))} ml de água/dia` : 'Meta de água não informada'}</span></div>
      <button class="btn btn-primary" type="button" data-apply-diet-model="${item.id}">Usar modelo</button>
    </article>`).join('');
}

async function loadModels() {
  const { data: { session: current } } = await supabase.auth.getSession();
  session = current;
  if (!session?.user?.id) return;
  const { data, error } = await supabase.from('modelos_dieta').select('id,personal_id,nome,descricao,orientacoes,agua_ml,global,origem_global_id').or(`global.eq.true,personal_id.eq.${session.user.id}`).order('global', { ascending: false }).order('nome');
  if (error) throw error;
  models = data || [];
  renderModels();
}

async function rollbackPlan(planId, mealIds) {
  if (mealIds.length) {
    await supabase.from('refeicao_itens').delete().in('refeicao_id', mealIds);
    await supabase.from('refeicoes').delete().in('id', mealIds);
  }
  await supabase.from('planos_alimentares').delete().eq('id', planId).eq('personal_id', session.user.id);
}

async function applyModel(modelId) {
  const model = models.find(item => item.id === modelId);
  if (!model) return;
  if (!confirm(`Criar um novo plano para este aluno usando o modelo “${model.nome}”?`)) return;

  const buttons = [...document.querySelectorAll('[data-apply-diet-model]')];
  buttons.forEach(button => { button.disabled = true; });
  let createdPlanId = null;
  const createdMealIds = [];

  try {
    await supabase.from('planos_alimentares').update({ ativo: false }).eq('aluno_id', alunoId).eq('personal_id', session.user.id);

    const { data: createdPlan, error: planError } = await supabase.from('planos_alimentares').insert({
      personal_id: session.user.id,
      aluno_id: alunoId,
      titulo: model.nome,
      orientacoes: model.orientacoes,
      agua_ml: model.agua_ml,
      ativo: true
    }).select('id').single();
    if (planError) throw planError;
    createdPlanId = createdPlan.id;

    const { data: sourceMeals, error: mealsError } = await supabase.from('modelo_dieta_refeicoes').select('id,nome,horario,ordem').eq('modelo_dieta_id', modelId).order('ordem');
    if (mealsError) throw mealsError;

    for (const sourceMeal of sourceMeals || []) {
      const { data: sourceItems, error: itemsReadError } = await supabase.from('modelo_dieta_itens').select('alimento_id,nome_alimento,quantidade,unidade,observacoes,ordem').eq('modelo_refeicao_id', sourceMeal.id).order('ordem');
      if (itemsReadError) throw itemsReadError;
      const description = (sourceItems || []).map(item => `${item.quantidade != null ? `${item.quantidade} ` : ''}${item.unidade ? `${item.unidade} ` : ''}${item.nome_alimento}`.trim()).join(', ') || 'Refeição do modelo';

      const { data: createdMeal, error: mealError } = await supabase.from('refeicoes').insert({
        plano_alimentar_id: createdPlanId,
        nome: sourceMeal.nome,
        horario: sourceMeal.horario,
        descricao: description,
        substituicoes: null,
        ordem: sourceMeal.ordem || 1,
        dias_semana: [1, 2, 3, 4, 5, 6, 7]
      }).select('id').single();
      if (mealError) throw mealError;
      createdMealIds.push(createdMeal.id);

      if (sourceItems?.length) {
        const { error: itemInsertError } = await supabase.from('refeicao_itens').insert(sourceItems.map(item => ({
          refeicao_id: createdMeal.id,
          alimento_id: item.alimento_id,
          nome_alimento: item.nome_alimento,
          quantidade: item.quantidade,
          unidade: item.unidade,
          observacoes: item.observacoes,
          ordem: item.ordem
        })));
        if (itemInsertError) throw itemInsertError;
      }
    }

    closeModal();
    showMessage(message, `Modelo “${model.nome}” aplicado ao aluno com sucesso.`);
    window.dispatchEvent(new CustomEvent('fsfit:diet-plan-updated', {
      detail: {
        alunoId,
        planId: createdPlanId,
        modelId,
        model,
        mealIds: createdMealIds
      }
    }));
    document.querySelector('[data-refresh-diet-plan],#refresh-diet-plan')?.click();
  } catch (error) {
    console.error(error);
    if (createdPlanId) await rollbackPlan(createdPlanId, createdMealIds);
    showMessage(message, 'Não foi possível aplicar o modelo de dieta. Nenhum plano incompleto foi mantido.', 'error');
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

openButton?.addEventListener('click', async () => {
  try { await loadModels(); openModal(); }
  catch (error) { console.error(error); showMessage(message, 'Não foi possível carregar os modelos de dieta.', 'error'); }
});
search?.addEventListener('input', renderModels);
document.addEventListener('click', event => {
  if (event.target.closest('[data-close-diet-model-picker]')) return closeModal();
  const button = event.target.closest('[data-apply-diet-model]');
  if (button) applyModel(button.dataset.applyDietModel);
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && modal?.classList.contains('open')) closeModal(); });
