import { supabase } from './supabase.js';

const sessionModal = document.querySelector('#live-session-modal');
const picker = document.querySelector('#live-quick-action-picker');

let libraryPromise = null;
let exerciseLibrary = [];
let activeCategory = 'all';
let activeSearch = '';

if (sessionModal && picker) {
  injectStyles();

  const observer = new MutationObserver(() => {
    prepareExercisePicker().catch(error => {
      console.error('Falha ao organizar exercícios por categorias:', error);
    });
  });

  observer.observe(picker, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  prepareExercisePicker().catch(console.error);
}

async function prepareExercisePicker() {
  const input = picker?.querySelector('#live-quick-exercise-search');
  const results = picker?.querySelector('#live-quick-exercise-results');
  if (!input || !results || input.dataset.categoryReady === 'true') return;

  input.dataset.categoryReady = 'true';
  activeCategory = 'all';
  activeSearch = '';

  const searchWrap = input.closest('.live-quick-search-wrap');
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
    activeSearch = event.currentTarget.value || '';
    renderCategorizedExercises();
  });

  categoryNav.addEventListener('click', event => {
    const button = event.target.closest('[data-live-exercise-category]');
    if (!button) return;
    activeCategory = button.dataset.liveExerciseCategory || 'all';
    renderCategorizedExercises();
  });

  exerciseLibrary = await loadExerciseLibrary();
  renderCategorizedExercises();
}

async function loadExerciseLibrary() {
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

    const categoryNames = new Map((categoryResult.data || []).map(category => [String(category.id), category.nome]));
    return (exerciseResult.data || []).map(exercise => ({
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

function renderCategorizedExercises() {
  const results = picker?.querySelector('#live-quick-exercise-results');
  const categoryNav = picker?.querySelector('.live-quick-category-nav');
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

  const categoryCounts = filteredBySearch.reduce((map, exercise) => {
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

  const groups = visible.reduce((map, exercise) => {
    const category = exercise.category || 'Outros';
    if (!map.has(category)) map.set(category, []);
    map.get(category).push(exercise);
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

function categoryChip(value, label, count) {
  const active = activeCategory === value;
  return `
    <button class="live-quick-category-chip${active ? ' active' : ''}" type="button" role="tab" aria-selected="${active}" data-live-exercise-category="${escapeHtml(value)}">
      <span>${escapeHtml(label)}</span><em>${count}</em>
    </button>`;
}

function renderExerciseOption(exercise) {
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

function normalizeSearch(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function slug(value = '') {
  return normalizeSearch(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'outros';
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function injectStyles() {
  if (document.querySelector('#live-exercise-categories-styles')) return;
  const style = document.createElement('style');
  style.id = 'live-exercise-categories-styles';
  style.textContent = `
    .live-quick-action-picker{
      position:fixed!important;
      inset:0!important;
      box-sizing:border-box!important;
      padding:calc(env(safe-area-inset-top,0px) + 12px) 12px calc(env(safe-area-inset-bottom,0px) + 12px)!important;
      align-items:flex-end!important;
    }
    .live-quick-action-dialog{
      width:min(620px,100%)!important;
      max-height:calc(100dvh - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - 24px)!important;
      margin:0!important;
    }
    .live-quick-action-header{
      position:sticky!important;
      top:0!important;
      z-index:5!important;
      flex:0 0 auto!important;
      background:#171c22!important;
    }
    .live-quick-action-close{margin-top:0!important}
    .live-quick-action-body{
      min-height:0!important;
      padding-bottom:calc(18px + env(safe-area-inset-bottom,0px))!important;
      -webkit-overflow-scrolling:touch;
    }
    .live-quick-exercise-tools{
      position:sticky;
      top:0;
      z-index:4;
      margin:-2px -2px 12px;
      padding:2px 2px 10px;
      background:linear-gradient(180deg,#171c22 82%,rgba(23,28,34,0));
    }
    .live-quick-exercise-tools .live-quick-search-wrap{margin-bottom:10px}
    .live-quick-category-nav{
      display:flex;
      gap:7px;
      overflow-x:auto;
      padding:1px 1px 5px;
      scrollbar-width:none;
      overscroll-behavior-x:contain;
      -webkit-overflow-scrolling:touch;
    }
    .live-quick-category-nav::-webkit-scrollbar{display:none}
    .live-quick-category-chip{
      display:inline-flex;
      align-items:center;
      gap:6px;
      flex:0 0 auto;
      min-height:36px;
      padding:7px 10px;
      border:1px solid var(--border);
      border-radius:999px;
      background:var(--surface-light);
      color:var(--muted);
      font:inherit;
      font-size:.7rem;
      font-weight:850;
      white-space:nowrap;
      cursor:pointer;
    }
    .live-quick-category-chip em{
      display:grid;
      place-items:center;
      min-width:20px;
      height:20px;
      padding:0 5px;
      border-radius:999px;
      background:rgba(255,255,255,.06);
      color:inherit;
      font-size:.58rem;
      font-style:normal;
      font-weight:950;
    }
    .live-quick-category-chip.active{
      border-color:var(--primary);
      background:rgba(177,255,0,.1);
      color:var(--primary);
    }
    .live-quick-category-chip.active em{background:rgba(177,255,0,.16)}
    .live-quick-category-results{display:grid!important;gap:16px!important}
    .live-quick-category-group{display:grid;gap:8px}
    .live-quick-category-heading{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      padding:0 3px;
    }
    .live-quick-category-heading strong{
      color:var(--text);
      font-size:.74rem;
      font-weight:950;
      letter-spacing:.045em;
      text-transform:uppercase;
    }
    .live-quick-category-heading span{
      display:grid;
      place-items:center;
      min-width:24px;
      height:24px;
      padding:0 6px;
      border-radius:999px;
      background:rgba(177,255,0,.08);
      color:var(--primary);
      font-size:.62rem;
      font-weight:950;
    }
    @media(min-width:721px){
      .live-quick-action-picker{align-items:center!important;padding:24px!important}
      .live-quick-action-dialog{max-height:min(82dvh,760px)!important}
    }
    @media(max-width:520px){
      .live-quick-action-picker{
        padding:calc(env(safe-area-inset-top,0px) + 10px) 10px calc(env(safe-area-inset-bottom,0px) + 8px)!important;
      }
      .live-quick-action-dialog{
        max-height:calc(100dvh - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - 18px)!important;
        border-radius:18px!important;
      }
      .live-quick-action-header{padding:15px 14px 12px!important}
      .live-quick-action-header h3{font-size:1.08rem!important}
      .live-quick-action-header p{font-size:.71rem!important}
      .live-quick-action-body{padding:11px 12px calc(16px + env(safe-area-inset-bottom,0px))!important}
      .live-quick-category-chip{min-height:34px;padding:6px 9px;font-size:.66rem}
      .live-quick-option{min-height:54px!important}
    }
  `;
  document.head.appendChild(style);
}
