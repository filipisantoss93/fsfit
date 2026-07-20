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
  if (!document.querySelector('style[data-fsfit-compact-exercise-selector]')) {
    const style = document.createElement('style');
    style.dataset.fsfitCompactExerciseSelector = 'true';
    style.textContent = `
      #exercise-modal .workout-exercise-builder-modal{max-height:min(92dvh,900px);padding:20px 18px}
      #exercise-modal .workout-modal-kicker{margin-bottom:4px}
      #exercise-modal .workout-modal-card h2{margin-bottom:14px}
      #workout-exercise-form{display:grid;gap:12px}
      #workout-exercise-form>.form-group,#batch-exercise-selector>.form-group{margin-bottom:0}
      #exercise-weekday-options{gap:8px;margin:0}
      #exercise-weekday-options label{gap:6px;font-size:.92rem;font-weight:750}
      #exercise-weekday-options input{width:20px!important;height:20px;flex-basis:20px}
      #batch-exercise-selector{display:grid;gap:10px}
      .workout-exercise-search-group{margin:0}
      .workout-exercise-search-group input,#exercise-category{min-height:48px}
      #exercise-checkbox-list{margin-top:0;gap:8px}
      .exercise-checkbox-option{padding:10px 11px;gap:10px}
      .exercise-checkbox-option input{width:20px!important;height:20px;flex-basis:20px}
      .exercise-checkbox-option strong{font-size:.9rem}
      .exercise-checkbox-option small{margin-top:2px;font-size:.72rem}
      .selected-exercises-section{margin-top:10px;padding-top:12px}
      .selected-exercises-heading{margin-bottom:9px}
      .selected-exercise-card{padding:11px}
      .selected-exercise-card-head{margin-bottom:9px}
      .selected-exercise-config-grid{gap:8px}
      .selected-exercise-notes{margin-top:8px}
      #exercise-modal .workout-modal-actions{margin-top:12px}
      @media(max-width:640px){
        #exercise-modal .workout-exercise-builder-modal{width:calc(100vw - 12px);max-width:calc(100vw - 12px);padding:18px 14px;border-radius:18px 18px 12px 12px}
        #exercise-modal .workout-modal-close{top:10px;right:10px;width:38px;height:38px}
        #exercise-modal .workout-modal-card h2{font-size:clamp(1.6rem,8vw,2rem);margin-bottom:12px}
        #exercise-weekday-options{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px 6px}
        .workout-exercise-search-group input,#exercise-category{min-height:46px;padding-top:10px;padding-bottom:10px}
        .exercise-checkbox-list{gap:7px}
        .exercise-checkbox-option{padding:9px 10px}
        .selected-exercise-config-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      }
    `;
    document.head.appendChild(style);
  }

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