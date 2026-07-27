import { supabase } from './supabase.js';
import { requireSession } from './layout.js';

const session = await requireSession();
const root = document.querySelector('[data-library-dashboard]');
if (!session || !root) throw new Error('Dashboard da biblioteca indisponível');

const type = root.dataset.libraryDashboard;
const setText = (id, value) => { const node = document.querySelector(id); if (node) node.textContent = String(value); };
const esc = (value = '') => { const div = document.createElement('div'); div.textContent = value ?? ''; return div.innerHTML; };

function renderDistribution(items, categories, categoryKey, host) {
  const categoryMap = new Map(categories.map(item => [item.id, item.nome]));
  const counts = new Map();
  items.forEach(item => counts.set(item[categoryKey], (counts.get(item[categoryKey]) || 0) + 1));
  const rows = [...counts.entries()]
    .map(([id, count]) => ({ name: categoryMap.get(id) || 'Sem categoria', count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, 7);
  host.innerHTML = rows.length ? rows.map(row => `<div class="fs-library-distribution-row"><span>${esc(row.name)}</span><strong>${row.count}</strong></div>`).join('') : '<div class="fs-library-empty">Nenhum item disponível.</div>';
}

function renderPersonal(items, categories, categoryKey, host, emptyText) {
  const categoryMap = new Map(categories.map(item => [item.id, item.nome]));
  host.innerHTML = items.length ? items.slice(0, 8).map(item => `<div class="fs-library-personal-item"><strong>${esc(item.nome)}</strong><small>${esc(categoryMap.get(item[categoryKey]) || 'Sem categoria')}</small></div>`).join('') : `<div class="fs-library-empty">${esc(emptyText)}</div>`;
}

async function loadExercises() {
  const [categoriesResult, exercisesResult, templatesResult] = await Promise.all([
    supabase.from('categorias_exercicios').select('id,nome,global,personal_id').or(`global.eq.true,personal_id.eq.${session.user.id}`),
    supabase.from('exercicios').select('id,nome,categoria_id,global,personal_id,origem_global_id,video_url').or(`global.eq.true,personal_id.eq.${session.user.id}`),
    supabase.from('treinos').select('id').eq('personal_id', session.user.id).eq('modelo', true).is('aluno_id', null)
  ]);
  const error = categoriesResult.error || exercisesResult.error || templatesResult.error;
  if (error) throw error;
  const categories = categoriesResult.data || [];
  const exercises = exercisesResult.data || [];
  const customizedIds = new Set(exercises.filter(item => !item.global && item.origem_global_id).map(item => item.origem_global_id));
  const visible = exercises.filter(item => !(item.global && customizedIds.has(item.id)));
  const personal = visible.filter(item => !item.global && item.personal_id === session.user.id);
  setText('#library-dashboard-total', visible.length);
  setText('#library-dashboard-personal', personal.length);
  setText('#library-dashboard-categories', categories.length);
  setText('#library-dashboard-saved', (templatesResult.data || []).length);
  renderDistribution(visible, categories, 'categoria_id', document.querySelector('#library-dashboard-distribution'));
  renderPersonal(personal, categories, 'categoria_id', document.querySelector('#library-dashboard-personal-list'), 'Nenhum exercício personalizado ainda.');
}

async function loadFoods() {
  const [categoriesResult, foodsResult, mealsResult] = await Promise.all([
    supabase.from('categorias_alimentos').select('id,nome,global,personal_id').or(`global.eq.true,personal_id.eq.${session.user.id}`),
    supabase.from('alimentos').select('id,nome,categoria_id,global,personal_id,origem_global_id').or(`global.eq.true,personal_id.eq.${session.user.id}`),
    supabase.from('biblioteca_refeicoes').select('id').or(`global.eq.true,personal_id.eq.${session.user.id}`)
  ]);
  const error = categoriesResult.error || foodsResult.error || mealsResult.error;
  if (error) throw error;
  const categories = categoriesResult.data || [];
  const foods = foodsResult.data || [];
  const customizedIds = new Set(foods.filter(item => !item.global && item.origem_global_id).map(item => item.origem_global_id));
  const visible = foods.filter(item => !(item.global && customizedIds.has(item.id)));
  const personal = visible.filter(item => !item.global && item.personal_id === session.user.id);
  setText('#library-dashboard-total', visible.length);
  setText('#library-dashboard-personal', personal.length);
  setText('#library-dashboard-categories', categories.length);
  setText('#library-dashboard-saved', (mealsResult.data || []).length);
  renderDistribution(visible, categories, 'categoria_id', document.querySelector('#library-dashboard-distribution'));
  renderPersonal(personal, categories, 'categoria_id', document.querySelector('#library-dashboard-personal-list'), 'Nenhum alimento personalizado ainda.');
}

try {
  if (type === 'exercises') await loadExercises();
  if (type === 'foods') await loadFoods();
} catch (error) {
  console.error('Erro ao carregar dashboard da biblioteca:', error);
  const distribution = document.querySelector('#library-dashboard-distribution');
  const personal = document.querySelector('#library-dashboard-personal-list');
  if (distribution) distribution.innerHTML = '<div class="fs-library-empty">Não foi possível carregar o resumo.</div>';
  if (personal) personal.innerHTML = '<div class="fs-library-empty">Atualize a página e tente novamente.</div>';
}