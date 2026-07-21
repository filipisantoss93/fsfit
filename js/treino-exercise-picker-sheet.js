import { supabase } from './supabase.js';

const WAIT_MS = 10000;

waitForBuilder().catch(error => {
  console.error('Falha ao ativar seletor mobile do treino estruturado:', error);
});

async function waitForBuilder() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < WAIT_MS) {
    const batchSelector = document.querySelector('#batch-exercise-selector');
    const categorySelect = document.querySelector('#exercise-category');
    const checkboxList = document.querySelector('#exercise-checkbox-list');
    const selectedBuilder = document.querySelector('#selected-exercises-builder');
    if (batchSelector && categorySelect && checkboxList && selectedBuilder) {
      await enhance(batchSelector, categorySelect, checkboxList, selectedBuilder);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 80));
  }
}

async function enhance(batchSelector, categorySelect, checkboxList, selectedBuilder) {
  if (batchSelector.dataset.fsfitPicker === '1') return;
  batchSelector.dataset.fsfitPicker = '1';

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const { data, error } = await supabase
    .from('exercicios')
    .select('id,nome,grupo_muscular,equipamento,tipo_prescricao')
    .or(`global.eq.true,personal_id.eq.${session.user.id}`)
    .order('nome');
  if (error) throw error;

  const library = (data || []).map(item => ({
    ...item,
    categoria: (item.grupo_muscular || 'Outros').trim() || 'Outros',
    tipo_prescricao: item.tipo_prescricao || 'repeticoes'
  }));

  injectStyles();

  const sourceSearchGroup = document.querySelector('#exercise-global-search')?.closest('.workout-exercise-search-group');
  const sourceCategoryGroup = categorySelect.closest('.form-group');
  const sourceListGroup = checkboxList.closest('.form-group');
  sourceSearchGroup?.classList.add('structured-picker-source-hidden');
  sourceCategoryGroup?.classList.add('structured-picker-source-hidden');
  sourceListGroup?.classList.add('structured-picker-source-hidden');

  const control = document.createElement('div');
  control.className = 'structured-exercise-picker-control';
  control.innerHTML = `
    <button class="structured-exercise-picker-trigger" type="button" aria-haspopup="dialog">
      <span><small>EXERCÍCIOS</small><strong class="structured-exercise-picker-label">Selecionar exercícios</strong></span>
      <span class="structured-exercise-picker-meta"><b class="structured-exercise-picker-count">0 selecionados</b><i aria-hidden="true">›</i></span>
    </button>
    <div class="structured-exercise-picker-chips" hidden></div>`;
  batchSelector.prepend(control);

  const sheet = document.createElement('div');
  sheet.className = 'structured-exercise-picker-sheet';
  sheet.setAttribute('aria-hidden', 'true');
  sheet.innerHTML = `
    <button class="structured-exercise-picker-backdrop" type="button" data-close-structured-picker aria-label="Fechar seleção"></button>
    <section class="structured-exercise-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="structured-picker-title">
      <header class="structured-exercise-picker-head">
        <div><small>EXERCÍCIOS</small><h2 id="structured-picker-title">Selecionar exercícios</h2></div>
        <button class="structured-exercise-picker-close" type="button" data-close-structured-picker aria-label="Fechar">×</button>
      </header>
      <div class="structured-exercise-picker-tools">
        <input class="structured-exercise-picker-search" type="search" autocomplete="off" placeholder="Buscar exercício" aria-label="Buscar exercício">
        <div class="structured-exercise-picker-categories" aria-label="Categorias de exercícios"></div>
      </div>
      <div class="structured-exercise-picker-options"></div>
      <footer class="structured-exercise-picker-footer">
        <span class="structured-exercise-picker-footer-count">0 exercícios selecionados</span>
        <button class="btn btn-primary structured-exercise-picker-confirm" type="button">Confirmar seleção</button>
      </footer>
    </section>`;
  document.body.appendChild(sheet);

  const trigger = control.querySelector('.structured-exercise-picker-trigger');
  const label = control.querySelector('.structured-exercise-picker-label');
  const count = control.querySelector('.structured-exercise-picker-count');
  const chips = control.querySelector('.structured-exercise-picker-chips');
  const search = sheet.querySelector('.structured-exercise-picker-search');
  const categoryHost = sheet.querySelector('.structured-exercise-picker-categories');
  const optionsHost = sheet.querySelector('.structured-exercise-picker-options');
  const footerCount = sheet.querySelector('.structured-exercise-picker-footer-count');
  const confirmButton = sheet.querySelector('.structured-exercise-picker-confirm');
  let activeCategory = '';

  function selectedIds() {
    return new Set(
      [...selectedBuilder.querySelectorAll('[data-selected-exercise]')]
        .map(card => String(card.dataset.selectedExercise || ''))
        .filter(Boolean)
    );
  }

  function normalize(value = '') {
    return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function prescriptionLabel(type) {
    return { repeticoes: 'Repetições', tempo: 'Tempo', distancia: 'Distância' }[type] || 'Repetições';
  }

  function categories() {
    return [...new Set(library.map(item => item.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }

  function renderCategories() {
    categoryHost.innerHTML = ['Todos', ...categories()].map(category => {
      const value = category === 'Todos' ? '' : category;
      return `<button class="structured-exercise-picker-category${activeCategory === value ? ' active' : ''}" type="button" data-structured-category="${escapeHtml(value)}">${escapeHtml(category)}</button>`;
    }).join('');
  }

  function renderOptions() {
    const selected = selectedIds();
    const term = normalize(search.value);
    const filtered = library.filter(item => {
      if (activeCategory && item.categoria !== activeCategory) return false;
      if (!term) return true;
      return normalize(`${item.nome} ${item.categoria} ${item.equipamento || ''}`).includes(term);
    });

    if (!filtered.length) {
      optionsHost.innerHTML = '<p class="structured-exercise-picker-empty">Nenhum exercício encontrado.</p>';
      syncCounts();
      return;
    }

    const groups = new Map();
    filtered.forEach(item => {
      if (!groups.has(item.categoria)) groups.set(item.categoria, []);
      groups.get(item.categoria).push(item);
    });

    optionsHost.innerHTML = [...groups.entries()].map(([group, items]) => `
      <section class="structured-exercise-picker-group">
        <div class="structured-exercise-picker-group-title">${escapeHtml(group)}</div>
        ${items.map(item => {
          const detail = [item.equipamento, prescriptionLabel(item.tipo_prescricao)].filter(Boolean).join(' · ');
          return `<label class="structured-exercise-picker-option${selected.has(String(item.id)) ? ' selected' : ''}">
            <input type="checkbox" value="${escapeHtml(item.id)}" ${selected.has(String(item.id)) ? 'checked' : ''}>
            <span class="structured-exercise-picker-check" aria-hidden="true">✓</span>
            <span class="structured-exercise-picker-copy"><strong>${escapeHtml(item.nome)}</strong><small>${escapeHtml(detail)}</small></span>
          </label>`;
        }).join('')}
      </section>`).join('');
    syncCounts();
  }

  function syncCounts() {
    const selected = selectedIds();
    const total = selected.size;
    label.textContent = total ? `${total} ${total === 1 ? 'exercício selecionado' : 'exercícios selecionados'}` : 'Selecionar exercícios';
    count.textContent = `${total} ${total === 1 ? 'selecionado' : 'selecionados'}`;
    footerCount.textContent = `${total} ${total === 1 ? 'exercício selecionado' : 'exercícios selecionados'}`;
    confirmButton.textContent = total ? `Confirmar ${total} ${total === 1 ? 'exercício' : 'exercícios'}` : 'Confirmar seleção';

    chips.hidden = total === 0;
    chips.innerHTML = [...selected].map(id => {
      const item = library.find(exercise => String(exercise.id) === id);
      return `<button class="structured-exercise-picker-chip" type="button" data-remove-structured-chip="${escapeHtml(id)}">${escapeHtml(item?.nome || 'Exercício')} <span>×</span></button>`;
    }).join('');
  }

  function setExerciseSelection(id, checked) {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = id;
    input.checked = checked;
    input.style.display = 'none';
    checkboxList.appendChild(input);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    setTimeout(() => {
      input.remove();
      syncCounts();
      renderOptions();
    }, 0);
  }

  function openPicker() {
    activeCategory = '';
    search.value = '';
    renderCategories();
    renderOptions();
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('structured-exercise-picker-open');
    setTimeout(() => search.focus(), 50);
  }

  function closePicker() {
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('structured-exercise-picker-open');
  }

  trigger.addEventListener('click', openPicker);
  confirmButton.addEventListener('click', closePicker);
  search.addEventListener('input', renderOptions);

  sheet.addEventListener('click', event => {
    if (event.target.closest('[data-close-structured-picker]')) return closePicker();
    const category = event.target.closest('[data-structured-category]');
    if (category) {
      activeCategory = category.dataset.structuredCategory || '';
      categorySelect.value = activeCategory;
      renderCategories();
      renderOptions();
    }
  });

  optionsHost.addEventListener('change', event => {
    const input = event.target.closest('input[type="checkbox"]');
    if (!input) return;
    setExerciseSelection(input.value, input.checked);
  });

  chips.addEventListener('click', event => {
    const chip = event.target.closest('[data-remove-structured-chip]');
    if (!chip) return;
    setExerciseSelection(chip.dataset.removeStructuredChip, false);
  });

  const observer = new MutationObserver(() => {
    syncCounts();
    if (sheet.classList.contains('open')) renderOptions();
  });
  observer.observe(selectedBuilder, { childList: true });

  syncCounts();
}

function injectStyles() {
  if (document.querySelector('#structured-exercise-picker-styles')) return;
  const style = document.createElement('style');
  style.id = 'structured-exercise-picker-styles';
  style.textContent = `
    #batch-exercise-selector .structured-picker-source-hidden{display:none!important}
    .structured-exercise-picker-control{display:grid;gap:8px}
    .structured-exercise-picker-trigger{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:54px;padding:10px 13px;border:1px solid var(--border);border-radius:12px;background:var(--surface-light);color:var(--text);font:inherit;text-align:left}.structured-exercise-picker-trigger>span:first-child{display:grid;gap:2px;min-width:0}.structured-exercise-picker-trigger small{color:var(--muted);font-size:.58rem;font-weight:900;letter-spacing:.07em}.structured-exercise-picker-trigger strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.86rem}.structured-exercise-picker-meta{display:flex;align-items:center;gap:8px;flex:0 0 auto}.structured-exercise-picker-meta b{color:var(--primary);font-size:.68rem}.structured-exercise-picker-meta i{color:var(--muted);font-size:1.35rem;font-style:normal}
    .structured-exercise-picker-chips{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}.structured-exercise-picker-chips::-webkit-scrollbar{display:none}.structured-exercise-picker-chip{flex:0 0 auto;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:6px 9px;border:1px solid rgba(50,215,75,.25);border-radius:999px;background:rgba(50,215,75,.07);color:var(--primary);font:inherit;font-size:.68rem;font-weight:800}.structured-exercise-picker-chip span{margin-left:4px}
    body.structured-exercise-picker-open{overflow:hidden}
    .structured-exercise-picker-sheet{position:fixed;inset:0;z-index:27000;display:none;align-items:flex-end;justify-content:center;padding:max(10px,env(safe-area-inset-top)) 10px max(10px,env(safe-area-inset-bottom))}.structured-exercise-picker-sheet.open{display:flex}.structured-exercise-picker-backdrop{position:absolute;inset:0;border:0;background:rgba(4,7,10,.8);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px)}
    .structured-exercise-picker-dialog{position:relative;z-index:1;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;width:min(620px,100%);height:min(88dvh,760px);overflow:hidden;border:1px solid var(--border);border-radius:22px 22px 14px 14px;background:#171b21;box-shadow:0 28px 80px rgba(0,0,0,.58)}
    .structured-exercise-picker-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 16px 12px;border-bottom:1px solid var(--border)}.structured-exercise-picker-head small{display:block;margin-bottom:3px;color:var(--primary);font-size:.62rem;font-weight:900;letter-spacing:.08em}.structured-exercise-picker-head h2{margin:0;font-size:1.22rem}.structured-exercise-picker-close{width:40px;height:40px;border:1px solid var(--border);border-radius:50%;background:var(--surface-light);color:var(--text);font-size:1.45rem;line-height:1}
    .structured-exercise-picker-tools{display:grid;gap:10px;padding:12px 14px 10px}.structured-exercise-picker-search{min-height:46px}.structured-exercise-picker-categories{display:flex;gap:7px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}.structured-exercise-picker-categories::-webkit-scrollbar{display:none}.structured-exercise-picker-category{flex:0 0 auto;min-height:34px;padding:0 11px;border:1px solid var(--border);border-radius:999px;background:var(--surface-light);color:var(--muted);font:inherit;font-size:.7rem;font-weight:800}.structured-exercise-picker-category.active{border-color:var(--primary);background:rgba(50,215,75,.08);color:var(--primary)}
    .structured-exercise-picker-options{overflow:auto;padding:0 14px 14px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}.structured-exercise-picker-group{display:grid;gap:6px}.structured-exercise-picker-group+.structured-exercise-picker-group{margin-top:12px}.structured-exercise-picker-group-title{padding:6px 3px 2px;color:var(--muted);font-size:.62rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
    .structured-exercise-picker-option{display:grid;grid-template-columns:30px minmax(0,1fr);gap:10px;align-items:center;min-height:56px;padding:9px 10px;border:1px solid transparent;border-radius:12px;background:rgba(255,255,255,.025)}.structured-exercise-picker-option.selected{border-color:rgba(50,215,75,.42);background:rgba(50,215,75,.065)}.structured-exercise-picker-option input{position:absolute;opacity:0;pointer-events:none}.structured-exercise-picker-check{display:grid;place-items:center;width:30px;height:30px;border:2px solid #596474;border-radius:8px;background:#252b34;color:transparent;font-size:.86rem;font-weight:950}.structured-exercise-picker-option.selected .structured-exercise-picker-check{border-color:var(--primary);background:var(--primary);color:#07120a}.structured-exercise-picker-copy{display:grid;gap:2px;min-width:0}.structured-exercise-picker-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem}.structured-exercise-picker-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:.68rem}.structured-exercise-picker-empty{margin:0;padding:24px 10px;color:var(--muted);font-size:.78rem;text-align:center}
    .structured-exercise-picker-footer{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 14px calc(10px + env(safe-area-inset-bottom));border-top:1px solid var(--border);background:rgba(23,27,33,.97);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}.structured-exercise-picker-footer-count{color:var(--muted);font-size:.7rem;font-weight:800}.structured-exercise-picker-confirm{min-width:180px;margin:0!important}
    @media(max-width:640px){.structured-exercise-picker-dialog{width:100%;height:calc(100dvh - max(18px,env(safe-area-inset-top)) - max(18px,env(safe-area-inset-bottom)));border-radius:20px}.structured-exercise-picker-footer{grid-template-columns:1fr}.structured-exercise-picker-footer-count{text-align:center}.structured-exercise-picker-confirm{width:100%;min-width:0}.structured-exercise-picker-option{min-height:58px}.structured-exercise-picker-copy strong{font-size:.86rem}}
  `;
  document.head.appendChild(style);
}

function escapeHtml(value = '') {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
