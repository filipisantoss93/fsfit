import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('alunos');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const alunoId = new URLSearchParams(location.search).get('id');
const message = document.querySelector('#diet-message');
const dietForm = document.querySelector('#diet-form');
const mealForm = document.querySelector('#meal-form');
const mealList = document.querySelector('#meal-list');
let planId = null;
let editingMealId = null;

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

async function loadStudent() {
  const { data, error } = await supabase
    .from('alunos')
    .select('id,nome')
    .eq('id', alunoId)
    .eq('personal_id', session.user.id)
    .single();

  if (error) {
    showMessage(message, 'Aluno não encontrado ou sem permissão.', 'error');
    throw error;
  }

  document.querySelector('#student-name').textContent = `Plano alimentar · ${data.nome}`;
  document.querySelector('#back-link').href = `ficha-aluno.html?id=${data.id}`;
}

async function ensurePlan() {
  const { data: existing, error } = await supabase
    .from('planos_alimentares')
    .select('id,titulo,orientacoes,agua_ml,data_inicio,data_fim,ativo')
    .eq('aluno_id', alunoId)
    .eq('personal_id', session.user.id)
    .order('ativo', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (existing) {
    planId = existing.id;
    dietForm.titulo.value = existing.titulo || '';
    dietForm.orientacoes.value = existing.orientacoes || '';
    dietForm.agua_ml.value = existing.agua_ml ?? '';
    dietForm.data_inicio.value = existing.data_inicio || '';
    dietForm.data_fim.value = existing.data_fim || '';
    return;
  }

  const { data: created, error: createError } = await supabase
    .from('planos_alimentares')
    .insert({
      personal_id: session.user.id,
      aluno_id: alunoId,
      titulo: 'Plano alimentar',
      ativo: true
    })
    .select('id')
    .single();

  if (createError) throw createError;
  planId = created.id;
  dietForm.titulo.value = 'Plano alimentar';
}

async function loadMeals() {
  if (!planId) return;

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

  if (!data?.length) {
    mealList.innerHTML = '<p class="empty">Nenhuma refeição cadastrada.</p>';
    return;
  }

  mealList.innerHTML = Object.entries(dayNames).map(([day, label]) => {
    const meals = data.filter(meal => (meal.dias_semana || []).includes(Number(day)));
    if (!meals.length) return '';
    return `
      <section style="margin-top:20px">
        <div class="section-heading compact"><div><small>DIA ${day}</small><strong>${label}</strong></div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Horário</th><th>Refeição</th><th>Descrição</th><th>Substituições</th><th>Ações</th></tr></thead>
            <tbody>${meals.map(meal => `
              <tr>
                <td>${esc(meal.horario ? meal.horario.slice(0, 5) : '—')}</td>
                <td><strong>${esc(meal.nome)}</strong></td>
                <td>${esc(meal.descricao || '—')}</td>
                <td>${esc(meal.substituicoes || '—')}</td>
                <td><div class="actions">
                  <button class="btn btn-outline" data-edit-meal="${meal.id}" type="button">Editar</button>
                  <button class="btn btn-danger" data-delete-meal="${meal.id}" type="button">Excluir</button>
                </div></td>
              </tr>`).join('')}</tbody>
          </table>
        </div>
      </section>`;
  }).join('') || '<p class="empty">As refeições cadastradas ainda não possuem dias da semana definidos.</p>';
}

dietForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!planId) return;

  const payload = {
    titulo: dietForm.titulo.value.trim(),
    orientacoes: dietForm.orientacoes.value.trim() || null,
    agua_ml: dietForm.agua_ml.value ? Number(dietForm.agua_ml.value) : null,
    data_inicio: dietForm.data_inicio.value || null,
    data_fim: dietForm.data_fim.value || null,
    ativo: true
  };

  if (!payload.titulo) return showMessage(message, 'Informe o título do plano.', 'error');
  if (payload.data_inicio && payload.data_fim && payload.data_fim < payload.data_inicio) {
    return showMessage(message, 'A data final não pode ser anterior à data inicial.', 'error');
  }

  const { error } = await supabase
    .from('planos_alimentares')
    .update(payload)
    .eq('id', planId)
    .eq('personal_id', session.user.id);

  if (error) return showMessage(message, error.message, 'error');
  showMessage(message, 'Plano alimentar atualizado com sucesso.');
});

mealForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!planId) return;

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

  if (!payload.nome || !payload.descricao) {
    return showMessage(message, 'Informe o nome e a descrição da refeição.', 'error');
  }

  const result = editingMealId
    ? await supabase.from('refeicoes').update(payload).eq('id', editingMealId).eq('plano_alimentar_id', planId)
    : await supabase.from('refeicoes').insert(payload);

  if (result.error) return showMessage(message, result.error.message, 'error');

  showMessage(message, editingMealId ? 'Refeição atualizada com sucesso.' : 'Refeição adicionada com sucesso.');
  resetMealForm();
  await loadMeals();
});

document.addEventListener('click', async event => {
  const edit = event.target.closest('[data-edit-meal]');
  if (edit) {
    const { data, error } = await supabase
      .from('refeicoes')
      .select('id,nome,horario,descricao,substituicoes,ordem,dias_semana')
      .eq('id', edit.dataset.editMeal)
      .eq('plano_alimentar_id', planId)
      .single();

    if (error) return showMessage(message, 'Não foi possível abrir a refeição.', 'error');
    editingMealId = data.id;
    mealForm.nome.value = data.nome || '';
    mealForm.horario.value = data.horario ? data.horario.slice(0, 5) : '';
    mealForm.descricao.value = data.descricao || '';
    mealForm.substituicoes.value = data.substituicoes || '';
    mealForm.ordem.value = data.ordem || 1;
    setSelectedDays(data.dias_semana || []);
    mealForm.querySelector('[type="submit"]').textContent = 'Salvar alteração';
    mealForm.scrollIntoView({ behavior: 'smooth' });
    return;
  }

  const remove = event.target.closest('[data-delete-meal]');
  if (remove && confirm('Excluir esta refeição do plano?')) {
    const { error } = await supabase
      .from('refeicoes')
      .delete()
      .eq('id', remove.dataset.deleteMeal)
      .eq('plano_alimentar_id', planId);
    if (error) return showMessage(message, error.message, 'error');
    showMessage(message, 'Refeição excluída.');
    if (editingMealId === remove.dataset.deleteMeal) resetMealForm();
    await loadMeals();
  }
});

await loadStudent();
try {
  await ensurePlan();
  await loadMeals();
} catch (error) {
  console.error(error);
  showMessage(message, 'Não foi possível preparar o plano alimentar.', 'error');
}