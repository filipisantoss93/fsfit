import { supabase } from './supabase.js';
import { requireSession } from './layout.js';

const session = await requireSession();
if (!session) throw new Error('Sessão inválida');

const batchSelector = document.querySelector('#batch-exercise-selector');
const categorySelect = document.querySelector('#exercise-category');
const checkboxList = document.querySelector('#exercise-checkbox-list');
const selectedBuilder = document.querySelector('#selected-exercises-builder');
const openExerciseButton = document.querySelector('#open-exercise-modal');

function applyCompactExerciseSelector() {
  const weekdayGroup = document.querySelector('#exercise-weekday-options')?.closest('.form-group');
  weekdayGroup?.querySelector(':scope > label')?.remove();

  const categoryGroup = categorySelect?.closest('.form-group');
  categoryGroup?.querySelector(':scope > label')?.remove();
  categorySelect?.setAttribute('aria-label', 'Categoria do exercício');

  const exerciseListGroup = checkboxList?.closest('.form-group');
  exerciseListGroup?.querySelector(':scope > label')?.remove();
  exerciseListGroup?.querySelector('.workout-builder-help')?.remove();
}

if (batchSelector && categorySelect && checkboxList) {
  const categoryGroup = categorySelect.closest('.form-group');
  const searchGroup = document.createElement('div');
  searchGroup.className = 'form-group workout-exercise-search-group';
  searchGroup.innerHTML = `
    <input id="exercise-global-search" type="search" autocomplete="off" aria-label="Pesquisar exercício" placeholder="Pesquisar exercício" disabled>`;
  categoryGroup?.parentElement?.insertBefore(searchGroup, categoryGroup);

  applyCompactExerciseSelector();

  const searchInput = searchGroup.querySelector('#exercise-global-search');
  let exerciseLibrary = [];

  function esc(value = '') {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
  }

  function normalizeText(value = '') {
    return String(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function categoryName(item) {
    return (item.grupo_muscular || 'Outros').trim() || 'Outros';
  }

  function prescriptionLabel(type) {
    return { repeticoes: 'Repetições', tempo: 'Tempo', distancia: 'Distância' }[type] || 'Repetições';
  }

  function selectedExerciseIds() {
    return new Set(
      [...(selectedBuilder?.querySelectorAll('[data-selected-exercise]') || [])]
        .map(item => item.dataset.selectedExercise)
        .filter(Boolean)
    );
  }

  function restoreCategoryView() {
    categorySelect.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function renderSearchResults(value) {
    const term = normalizeText(value);
    if (!term) {
      restoreCategoryView();
      return;
    }

    const selectedIds = selectedExerciseIds();
    const filtered = exerciseLibrary.filter(item => {
      const searchable = normalizeText([
        item.nome,
        categoryName(item),
        item.equipamento
      ].filter(Boolean).join(' '));
      return searchable.includes(term);
    });

    if (!filtered.length) {
      checkboxList.innerHTML = '<p class="empty">Nenhum exercício encontrado para esta busca.</p>';
      return;
    }

    checkboxList.innerHTML = filtered.map(item => {
      const checked = selectedIds.has(String(item.id));
      const detail = [categoryName(item), item.equipamento, prescriptionLabel(item.tipo_prescricao)]
        .filter(Boolean)
        .join(' · ');
      return `<label class="exercise-checkbox-option${checked ? ' selected' : ''}">
        <input type="checkbox" value="${esc(item.id)}"${checked ? ' checked' : ''}>
        <span><strong>${esc(item.nome)}</strong><small>${esc(detail)}</small></span>
      </label>`;
    }).join('');
  }

  searchInput?.addEventListener('input', () => renderSearchResults(searchInput.value));

  checkboxList.addEventListener('change', () => {
    if (!searchInput?.value.trim()) return;
    setTimeout(() => renderSearchResults(searchInput.value), 0);
  });

  categorySelect.addEventListener('change', () => {
    if (searchInput && searchInput.value) searchInput.value = '';
  });

  openExerciseButton?.addEventListener('click', () => {
    if (!searchInput) return;
    searchInput.value = '';
    applyCompactExerciseSelector();
  });

  try {
    const { data, error } = await supabase
      .from('exercicios')
      .select('id,nome,grupo_muscular,equipamento,tipo_prescricao')
      .or(`global.eq.true,personal_id.eq.${session.user.id}`)
      .order('nome');

    if (error) throw error;
    exerciseLibrary = (data || []).map(item => ({
      ...item,
      tipo_prescricao: item.tipo_prescricao || 'repeticoes'
    }));

    if (searchInput) {
      searchInput.disabled = false;
      searchInput.placeholder = 'Pesquisar exercício';
    }
  } catch (error) {
    console.error('Erro ao carregar busca geral de exercícios:', error);
    if (searchInput) {
      searchInput.disabled = true;
      searchInput.placeholder = 'Busca indisponível';
    }
  }
}
