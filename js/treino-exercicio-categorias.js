const PICKER_SELECTOR = '#simple-workout-modal-body .simple-picker';
const STYLE_SELECTOR = 'link[data-simple-picker-category-styles]';

const categories = [
  { key: 'all', label: 'Todos' },
  { key: 'abdomen', label: 'Abdômen', terms: ['abdomen', 'core'] },
  { key: 'gluteos', label: 'Glúteos', terms: ['gluteo'] },
  { key: 'ombro', label: 'Ombro', terms: ['ombro', 'deltoide', 'manguito'] },
  { key: 'peito', label: 'Peito', terms: ['peito', 'peitoral'] },
  { key: 'costas', label: 'Costas', terms: ['costas', 'dorsal', 'latissimo', 'lombar', 'trapezio'] },
  { key: 'pernas', label: 'Pernas', terms: ['perna', 'quadriceps', 'posterior', 'isquiotibial', 'panturrilha', 'adutor', 'abdutor', 'coxa'] },
  { key: 'biceps', label: 'Bíceps', terms: ['biceps'] },
  { key: 'triceps', label: 'Tríceps', terms: ['triceps'] },
  { key: 'cardio', label: 'Cardio', terms: ['cardio', 'aerobico'] },
  { key: 'mobilidade', label: 'Mobilidade', terms: ['mobilidade', 'alongamento', 'flexibilidade'] },
  { key: 'other', label: 'Outros' }
];

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function optionGroup(option) {
  const metadata = option.querySelector('small')?.textContent || '';
  return metadata.split('·')[0].trim();
}

function optionCategory(option) {
  const group = normalize(optionGroup(option));
  if (!group) return 'other';
  const match = categories.find(category => category.terms?.some(term => group.includes(term)));
  return match?.key || 'other';
}

function ensureStyles() {
  if (document.querySelector(STYLE_SELECTOR)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/treino-exercicio-categorias.css?v=20260725-category1';
  link.dataset.simplePickerCategoryStyles = 'true';
  document.head.appendChild(link);
}

function enhancePicker(picker) {
  if (!(picker instanceof HTMLElement) || picker.dataset.categoryFilterReady === 'true') return;

  const searchField = picker.querySelector('.simple-search-field');
  const list = picker.querySelector('#simple-picker-list');
  if (!(searchField instanceof HTMLElement) || !(list instanceof HTMLElement)) return;

  picker.dataset.categoryFilterReady = 'true';
  let selectedCategory = 'all';

  const availableCategories = new Set(['all']);
  list.querySelectorAll('.simple-picker-option').forEach(option => {
    availableCategories.add(optionCategory(option));
  });

  const filterPanel = document.createElement('div');
  filterPanel.className = 'simple-picker-filter-panel';
  searchField.insertAdjacentElement('beforebegin', filterPanel);
  filterPanel.appendChild(searchField);

  const categoryBar = document.createElement('div');
  categoryBar.className = 'simple-picker-category-bar';
  categoryBar.setAttribute('role', 'tablist');
  categoryBar.setAttribute('aria-label', 'Categorias de exercícios');
  categoryBar.setAttribute('data-allow-horizontal-scroll', 'true');
  categoryBar.innerHTML = categories
    .filter(category => availableCategories.has(category.key))
    .map(category => `<button class="simple-picker-category-chip${category.key === 'all' ? ' active' : ''}" type="button" role="tab" aria-selected="${category.key === 'all'}" aria-controls="simple-picker-list" data-exercise-category="${category.key}" data-allow-horizontal-scroll="true">${category.label}</button>`)
    .join('');
  filterPanel.appendChild(categoryBar);

  const syncActiveChip = () => {
    categoryBar.querySelectorAll('[data-exercise-category]').forEach(button => {
      const active = button.dataset.exerciseCategory === selectedCategory;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
  };

  const applyFilter = () => {
    let visibleOptions = 0;
    list.querySelectorAll('.simple-picker-option').forEach(option => {
      const category = optionCategory(option);
      option.dataset.exerciseCategory = category;
      const visible = selectedCategory === 'all' || category === selectedCategory;
      option.hidden = !visible;
      if (visible) visibleOptions += 1;
    });

    const nativeEmptyState = list.querySelector('.simple-empty-inline:not(.simple-category-empty)');
    let categoryEmptyState = list.querySelector('.simple-category-empty');
    if (!visibleOptions && !nativeEmptyState) {
      if (!categoryEmptyState) {
        categoryEmptyState = document.createElement('div');
        categoryEmptyState.className = 'simple-empty-inline simple-category-empty';
        categoryEmptyState.textContent = 'Nenhum exercício nesta categoria.';
        list.appendChild(categoryEmptyState);
      }
    } else {
      categoryEmptyState?.remove();
    }
  };

  let dragged = false;
  let pointerStartX = 0;
  let pointerStartY = 0;

  categoryBar.addEventListener('pointerdown', event => {
    dragged = false;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
  }, { passive: true });

  categoryBar.addEventListener('pointermove', event => {
    if (Math.abs(event.clientX - pointerStartX) > 7 && Math.abs(event.clientX - pointerStartX) > Math.abs(event.clientY - pointerStartY)) {
      dragged = true;
    }
  }, { passive: true });

  categoryBar.addEventListener('click', event => {
    const button = event.target.closest('[data-exercise-category]');
    if (!button) return;
    if (dragged) {
      event.preventDefault();
      dragged = false;
      return;
    }
    selectedCategory = button.dataset.exerciseCategory || 'all';
    syncActiveChip();
    applyFilter();
    button.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  });

  const listObserver = new MutationObserver(() => applyFilter());
  listObserver.observe(list, { childList: true });
  applyFilter();
}

function scanPickers() {
  document.querySelectorAll(PICKER_SELECTOR).forEach(enhancePicker);
}

ensureStyles();
scanPickers();

const pickerObserver = new MutationObserver(() => {
  window.requestAnimationFrame(scanPickers);
});
pickerObserver.observe(document.documentElement, { childList: true, subtree: true });
