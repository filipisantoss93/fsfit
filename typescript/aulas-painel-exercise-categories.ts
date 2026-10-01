// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { supabase } from './supabase.js';

interface ExerciseLibraryItem {
  id: string | number;
  nome?: string | null;
  grupo_muscular?: string | null;
  equipamento?: string | null;
  categoria_id?: string | number | null;
  category: string;
  [key: string]: unknown;
}

interface ExerciseCategoryRow {
  id: string | number;
  nome: string;
}

const sessionModal = document.querySelector<HTMLElement>('#live-session-modal');
const picker = document.querySelector<HTMLElement>('#live-quick-action-picker');

let libraryPromise: Promise<ExerciseLibraryItem[]> | null = null;
let exerciseLibrary: ExerciseLibraryItem[] = [];
let activeCategory = 'all';
let activeSearch = '';

if (sessionModal && picker) {
  const observer = new MutationObserver(() => {
    prepareExercisePicker().catch(error => {
      console.error('Falha ao organizar exercícios por categorias:', error);
    });
  });

  observer.observe(picker, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  prepareExercisePicker().catch(console.error);
}

async function prepareExercisePicker(): Promise<void> {
  const input = picker?.querySelector<HTMLInputElement>('#live-quick-exercise-search');
  const results = picker?.querySelector<HTMLElement>('#live-quick-exercise-results');
  if (!input || !results || input.dataset.categoryReady === 'true') return;

  input.dataset.categoryReady = 'true';
  activeCategory = 'all';
  activeSearch = '';

  const searchWrap = input.closest<HTMLElement>('.live-quick-search-wrap');
  const tools = document.createElement('div');
  tools.className = 'live-quick-exercise-tools';
  searchWrap?.before(tools);
  if (searchWrap) tools.appendChild(searchWrap);

  const categoryNav = document.createElement('div');
  categoryNav.className = 'live-quick-category-nav';
  categoryNav.setAttribute('role', 'tablist');
  categoryNav.setAttribute('aria-label', 'Categorias de exercícios');
  tools.appendChild(categoryNav);

  results.classList.add('live-quick-category-results');
  results.innerHTML = '<div class="live-quick-loading">Organizando exercícios...</div>';

  input.addEventListener('input', event => {
    event.stopPropagation();
    activeSearch = (event.currentTarget as HTMLInputElement).value || '';
    renderCategorizedExercises();
  });

  categoryNav.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLElement>('[data-live-exercise-category]');
    if (!button) return;
    activeCategory = button.dataset.liveExerciseCategory || 'all';
    renderCategorizedExercises();
  });

  exerciseLibrary = await loadExerciseLibrary();
  renderCategorizedExercises();
}

async function loadExerciseLibrary(): Promise<ExerciseLibraryItem[]> {
  if (libraryPromise) return libraryPromise;

  libraryPromise = (async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user?.id) throw sessionError || new Error('Sessão inválida.');

    const userId = session.user.id;
    const [exerciseResult, categoryResult] = await Promise.all([
      supabase
        .from('exercicios')
        .select('id,nome,grupo_muscular,equipamento,categoria_id')
        .or(`global.eq.true,personal_id.eq.${userId}`)
        .order('nome'),
      supabase
        .from('categorias_exercicios')
        .select('id,nome')
        .or(`global.eq.true,personal_id.eq.${userId}`)
        .order('nome')
    ]);

    if (exerciseResult.error) throw exerciseResult.error;
    if (categoryResult.error) console.warn('Categorias de exercícios indisponíveis:', categoryResult.error);

    const categoryRows = (Array.isArray(categoryResult.data) ? categoryResult.data : []) as ExerciseCategoryRow[];
    const categoryNames = new Map(categoryRows.map(category => [String(category.id), category.nome]));
    const exerciseRows = (Array.isArray(exerciseResult.data) ? exerciseResult.data : []) as Omit<ExerciseLibraryItem, 'category'>[];
    return exerciseRows.map(exercise => ({
      ...exercise,
      category: categoryNames.get(String(exercise.categoria_id || ''))
        || exercise.grupo_muscular
        || 'Outros'
    }));
  })().catch(error => {
    libraryPromise = null;
    throw error;
  });

  return libraryPromise;
}

function renderCategorizedExercises(): void {
  const results = picker?.querySelector<HTMLElement>('#live-quick-exercise-results');
  const categoryNav = picker?.querySelector<HTMLElement>('.live-quick-category-nav');
  if (!results || !categoryNav || !exerciseLibrary.length) {
    if (results && exerciseLibrary.length === 0) {
      results.innerHTML = '<div class="live-quick-empty"><strong>Nenhum exercício disponível.</strong><span>Cadastre exercícios na biblioteca para utilizá-los durante a aula.</span></div>';
    }
    return;
  }

  const search = normalizeSearch(activeSearch);
  const filteredBySearch = exerciseLibrary.filter(exercise => {
    if (!search) return true;
    return normalizeSearch([
      exercise.nome,
      exercise.category,
      exercise.grupo_muscular,
      exercise.equipamento
    ].filter(Boolean).join(' ')).includes(search);
  });

  const categoryCounts = filteredBySearch.reduce<Map<string, number>>((map, exercise) => {
    map.set(exercise.category, (map.get(exercise.category) || 0) + 1);
    return map;
  }, new Map());

  const categories = [...new Set(exerciseLibrary.map(exercise => exercise.category))]
    .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' }));

  if (activeCategory !== 'all' && !categories.includes(activeCategory)) activeCategory = 'all';

  categoryNav.innerHTML = [
    categoryChip('all', 'Todas', filteredBySearch.length),
    ...categories.map(category => categoryChip(category, category, categoryCounts.get(category) || 0))
  ].join('');

  const visible = activeCategory === 'all'
    ? filteredBySearch
    : filteredBySearch.filter(exercise => exercise.category === activeCategory);

  if (!visible.length) {
    results.innerHTML = '<div class="live-quick-empty compact"><strong>Nenhum exercício encontrado.</strong><span>Tente outra categoria ou termo de pesquisa.</span></div>';
    return;
  }

  const groups = visible.reduce<Map<string, ExerciseLibraryItem[]>>((map, exercise) => {
    const category = exercise.category || 'Outros';
    if (!map.has(category)) map.set(category, []);
    map.get(category)!.push(exercise);
    return map;
  }, new Map());

  results.innerHTML = [...groups.entries()]
    .sort(([a], [b]) => String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' }))
    .map(([category, exercises]) => `
      <section class="live-quick-category-group" aria-labelledby="live-category-${slug(category)}">
        <div class="live-quick-category-heading">
          <strong id="live-category-${slug(category)}">${escapeHtml(category)}</strong>
          <span>${exercises.length}</span>
        </div>
        <div class="live-quick-option-list">
          ${exercises.map(renderExerciseOption).join('')}
        </div>
      </section>`).join('');
}

function categoryChip(value: string, label: string, count: number): string {
  const active = activeCategory === value;
  return `
    <button class="live-quick-category-chip${active ? ' active' : ''}" type="button" role="tab" aria-selected="${active}" data-live-exercise-category="${escapeHtml(value)}">
      <span>${escapeHtml(label)}</span><em>${count}</em>
    </button>`;
}

function renderExerciseOption(exercise: ExerciseLibraryItem): string {
  const detail = [exercise.grupo_muscular, exercise.equipamento].filter(Boolean).join(' • ') || exercise.category;
  return `
    <button class="live-quick-option" type="button" data-live-library-exercise="${escapeHtml(exercise.id)}">
      <span class="live-quick-option-copy">
        <strong>${escapeHtml(exercise.nome || 'Exercício')}</strong>
        <small>${escapeHtml(detail || 'Biblioteca de exercícios')}</small>
      </span>
      <span class="live-quick-option-arrow" aria-hidden="true">＋</span>
    </button>`;
}

function normalizeSearch(value: unknown = ''): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function slug(value: unknown = ''): string {
  return normalizeSearch(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'outros';
}

function escapeHtml(value: unknown = ''): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
