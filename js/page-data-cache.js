import { supabase } from './supabase.js';
import { readUiCache, writeUiCache } from './ui-cache.js';

const PAGE = window.location.pathname.split('/').pop() || 'index.html';
const TARGET_PAGES = new Set([
  'alunos.html',
  'agenda.html',
  'biblioteca-exercicios.html',
  'biblioteca-alimentar.html'
]);

if (TARGET_PAGES.has(PAGE)) {
  boot().catch(error => console.info('Cache visual da página indisponível:', error?.message || error));
}

async function boot() {
  if (document.readyState === 'loading') {
    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }

  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;

  if (PAGE === 'alunos.html') setupStudentsCache(userId);
  if (PAGE === 'agenda.html') setupAgendaCache(userId);
  if (PAGE === 'biblioteca-exercicios.html') setupExerciseLibraryCache(userId);
  if (PAGE === 'biblioteca-alimentar.html') setupFoodLibraryCache(userId);
}

function cacheReadyHtml(html = '') {
  const text = String(html || '');
  if (!text.trim()) return false;
  return !/carregando|aguarde/i.test(stripHtml(text));
}

function stripHtml(html = '') {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

function debounce(callback, delay = 120) {
  let timer = 0;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  };
}

function observeElements(elements, callback) {
  const observer = new MutationObserver(callback);
  elements.filter(Boolean).forEach(element => {
    observer.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'aria-pressed']
    });
  });
  return observer;
}

function setupStudentsCache(userId) {
  const scope = 'page:alunos:v1';
  const list = document.querySelector('#students-list');
  const count = document.querySelector('#student-count');
  const countLabel = document.querySelector('#student-count-label');
  if (!list) return;

  const cached = readUiCache(userId, scope)?.value;
  if (cached && cacheReadyHtml(cached.listHtml)) {
    list.innerHTML = cached.listHtml;
    if (count && cached.count != null) count.textContent = String(cached.count);
    if (countLabel && cached.countLabel) countLabel.textContent = cached.countLabel;
    document.documentElement.dataset.fsfitStudentsCache = 'restored';
  }

  const save = debounce(() => {
    if (!cacheReadyHtml(list.innerHTML)) return;
    writeUiCache(userId, scope, {
      listHtml: list.innerHTML,
      count: count?.textContent?.trim() || '',
      countLabel: countLabel?.textContent?.trim() || ''
    });
  });

  observeElements([list, count, countLabel], save);
  window.addEventListener('pagehide', save);
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function agendaDateValue() {
  const input = document.querySelector('#agenda-date');
  const fromInput = input?.value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(fromInput || ''))) return fromInput;
  const fromUrl = new URLSearchParams(location.search).get('data');
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(fromUrl || ''))) return fromUrl;
  return todayIso();
}

function setupAgendaCache(userId) {
  const grid = document.querySelector('#agenda-grid');
  const dateInput = document.querySelector('#agenda-date');
  const dateDisplay = document.querySelector('#agenda-date-display');
  const todayRow = document.querySelector('#agenda-today-row');
  if (!grid) return;

  const scopeForDate = date => `page:agenda:v1:${date}`;

  const restore = () => {
    const date = agendaDateValue();
    const cached = readUiCache(userId, scopeForDate(date))?.value;
    if (!cached || !cacheReadyHtml(cached.gridHtml)) return false;
    grid.innerHTML = cached.gridHtml;
    if (dateInput) dateInput.value = date;
    if (dateDisplay && cached.dateDisplay) dateDisplay.textContent = cached.dateDisplay;
    if (todayRow && typeof cached.todayRowHidden === 'boolean') todayRow.hidden = cached.todayRowHidden;
    document.documentElement.dataset.fsfitAgendaCache = 'restored';
    return true;
  };

  const save = debounce(() => {
    if (!cacheReadyHtml(grid.innerHTML)) return;
    const date = agendaDateValue();
    writeUiCache(userId, scopeForDate(date), {
      gridHtml: grid.innerHTML,
      dateDisplay: dateDisplay?.textContent?.trim() || '',
      todayRowHidden: Boolean(todayRow?.hidden)
    });
  });

  restore();
  observeElements([grid, dateDisplay, todayRow], save);

  const restoreAfterNavigation = () => window.setTimeout(restore, 0);
  dateInput?.addEventListener('change', restoreAfterNavigation);
  document.querySelector('#agenda-prev-day')?.addEventListener('click', restoreAfterNavigation);
  document.querySelector('#agenda-next-day')?.addEventListener('click', restoreAfterNavigation);
  document.querySelector('#agenda-today')?.addEventListener('click', restoreAfterNavigation);
  window.addEventListener('pageshow', restoreAfterNavigation);
  window.addEventListener('pagehide', save);
}

function setupExerciseLibraryCache(userId) {
  const scope = 'page:biblioteca-exercicios:v1';
  const categoryNav = document.querySelector('#library-category-nav');
  const list = document.querySelector('#exercise-library-list');
  const activeActions = document.querySelector('#active-category-actions');
  const selectedTitle = document.querySelector('#selected-category-title');
  if (!categoryNav || !list) return;

  const cached = readUiCache(userId, scope)?.value;
  if (cached && cacheReadyHtml(cached.categoryNavHtml) && cacheReadyHtml(cached.listHtml)) {
    categoryNav.innerHTML = cached.categoryNavHtml;
    list.innerHTML = cached.listHtml;
    if (activeActions && cached.activeActionsHtml != null) {
      activeActions.innerHTML = cached.activeActionsHtml;
      activeActions.classList.toggle('hidden', Boolean(cached.activeActionsHidden));
    }
    if (selectedTitle && cached.selectedTitle) selectedTitle.textContent = cached.selectedTitle;
    document.documentElement.dataset.fsfitExerciseLibraryCache = 'restored';
  }

  const save = debounce(() => {
    if (!cacheReadyHtml(categoryNav.innerHTML) || !cacheReadyHtml(list.innerHTML)) return;
    writeUiCache(userId, scope, {
      categoryNavHtml: categoryNav.innerHTML,
      listHtml: list.innerHTML,
      activeActionsHtml: activeActions?.innerHTML || '',
      activeActionsHidden: Boolean(activeActions?.classList.contains('hidden')),
      selectedTitle: selectedTitle?.textContent?.trim() || ''
    });
  }, 180);

  observeElements([categoryNav, list, activeActions, selectedTitle], save);
  window.addEventListener('pagehide', save);
}

function setupFoodLibraryCache(userId) {
  const scope = 'page:biblioteca-alimentar:v1';
  const foodCategoryNav = document.querySelector('#food-category-nav');
  const foodList = document.querySelector('#food-library-list');
  const activeActions = document.querySelector('#active-food-category-actions');
  const selectedTitle = document.querySelector('#selected-food-category-title');
  const mealList = document.querySelector('#meal-library-list');
  if (!foodCategoryNav || !foodList) return;

  const cached = readUiCache(userId, scope)?.value;
  if (cached && cacheReadyHtml(cached.foodCategoryNavHtml) && cacheReadyHtml(cached.foodListHtml)) {
    foodCategoryNav.innerHTML = cached.foodCategoryNavHtml;
    foodList.innerHTML = cached.foodListHtml;
    if (activeActions && cached.activeActionsHtml != null) {
      activeActions.innerHTML = cached.activeActionsHtml;
      activeActions.classList.toggle('hidden', Boolean(cached.activeActionsHidden));
    }
    if (selectedTitle && cached.selectedTitle) selectedTitle.textContent = cached.selectedTitle;
    if (mealList && cacheReadyHtml(cached.mealListHtml)) mealList.innerHTML = cached.mealListHtml;
    document.documentElement.dataset.fsfitFoodLibraryCache = 'restored';
  }

  const save = debounce(() => {
    if (!cacheReadyHtml(foodCategoryNav.innerHTML) || !cacheReadyHtml(foodList.innerHTML)) return;
    writeUiCache(userId, scope, {
      foodCategoryNavHtml: foodCategoryNav.innerHTML,
      foodListHtml: foodList.innerHTML,
      activeActionsHtml: activeActions?.innerHTML || '',
      activeActionsHidden: Boolean(activeActions?.classList.contains('hidden')),
      selectedTitle: selectedTitle?.textContent?.trim() || '',
      mealListHtml: mealList?.innerHTML || ''
    });
  }, 180);

  observeElements([foodCategoryNav, foodList, activeActions, selectedTitle, mealList], save);
  window.addEventListener('pagehide', save);
}
