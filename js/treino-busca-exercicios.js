import { supabase } from './supabase.js';
import { requireSession } from './layout.js';

const session = await requireSession();
if (!session) throw new Error('Sessão inválida');

const batchSelector = document.querySelector('#batch-exercise-selector');
const categorySelect = document.querySelector('#exercise-category');
const checkboxList = document.querySelector('#exercise-checkbox-list');
const selectedBuilder = document.querySelector('#selected-exercises-builder');
const openExerciseButton = document.querySelector('#open-exercise-modal');

if (batchSelector && categorySelect && checkboxList) {
  const categoryGroup = categorySelect.closest('.form-group');
  const searchGroup = document.createElement('div');
  searchGroup.className = 'form-group';
  searchGroup.innerHTML = `
    <label for="exercise-global-search">Pesquisar em todos os exercícios</label>
    <input id="exercise-global-search" type="search" autocomplete="off" placeholder="Carregando exercícios..." disabled>
    <p class="workout-builder-help">Pesquise pelo nome do exercício sem precisar escolher uma categoria.</p>`;
  categoryGroup?.parentElement?.insertBefore(searchGroup, categoryGroup);

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

  categorySelect.addEventListener('change', () => {
    if (searchInput && searchInput.value) searchInput.value = '';
  });

  openExerciseButton?.addEventListener('click', () => {
    if (!searchInput) return;
    searchInput.value = '';
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
      searchInput.placeholder = 'Digite o nome do exercício';
    }
  } catch (error) {
    console.error('Erro ao carregar busca geral de exercícios:', error);
    if (searchInput) {
      searchInput.disabled = true;
      searchInput.placeholder = 'Busca indisponível';
    }
  }
}
