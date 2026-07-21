const SELECTOR_TIMEOUT_MS = 10000;

waitForWorkoutBuilder().catch(error => {
  console.error('Falha ao ativar seletor de exercícios:', error);
});

async function waitForWorkoutBuilder() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < SELECTOR_TIMEOUT_MS) {
    const modal = document.querySelector('.saved-workout-modal');
    const nativeSelect = document.querySelector('#saved-item-exercise');
    const addButton = document.querySelector('#saved-item-add');
    if (modal && nativeSelect && addButton) {
      enhanceWorkoutExerciseSelector(modal, nativeSelect, addButton);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 80));
  }
}

function enhanceWorkoutExerciseSelector(modal, nativeSelect, addButton) {
  if (nativeSelect.dataset.fsfitPicker === '1') return;
  nativeSelect.dataset.fsfitPicker = '1';

  injectStyles();

  const field = nativeSelect.closest('.exercise-field');
  const searchGroup = modal.querySelector('#saved-item-search')?.closest('.exercise-search-field');
  const categoryGroup = modal.querySelector('#saved-item-category')?.closest('.category-field');
  const seriesInput = modal.querySelector('#saved-item-series');
  const repsInput = modal.querySelector('#saved-item-reps');
  const loadInput = modal.querySelector('#saved-item-load');
  const restInput = modal.querySelector('#saved-item-rest');
  const notesInput = modal.querySelector('#saved-item-notes');
  const cancelEditButton = modal.querySelector('#saved-item-cancel-edit');

  if (!field) return;

  const selectedIds = new Set();
  const optionCache = new Map();
  let workingIds = new Set();
  let activeCategory = '';
  let bypassBatchInterceptor = false;

  cacheNativeOptions();

  nativeSelect.classList.add('saved-exercise-native-select-hidden');
  nativeSelect.setAttribute('aria-hidden', 'true');
  nativeSelect.tabIndex = -1;
  searchGroup?.classList.add('saved-exercise-source-field-hidden');
  categoryGroup?.classList.add('saved-exercise-source-field-hidden');

  const custom = document.createElement('div');
  custom.className = 'saved-exercise-picker-control';
  custom.innerHTML = `
    <button class="saved-exercise-picker-trigger" type="button" aria-haspopup="dialog">
      <span>
        <small>EXERCÍCIOS</small>
        <strong class="saved-exercise-picker-label">Selecionar exercícios</strong>
      </span>
      <span class="saved-exercise-picker-trigger-meta"><b class="saved-exercise-picker-count">0 selecionados</b><i aria-hidden="true">›</i></span>
    </button>
    <div class="saved-exercise-picker-chips" hidden></div>`;
  nativeSelect.after(custom);

  const sheet = document.createElement('div');
  sheet.className = 'saved-exercise-picker-sheet';
  sheet.setAttribute('aria-hidden', 'true');
  sheet.innerHTML = `
    <button class="saved-exercise-picker-backdrop" type="button" data-close-exercise-picker aria-label="Fechar seleção"></button>
    <section class="saved-exercise-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="saved-exercise-picker-title">
      <header class="saved-exercise-picker-head">
        <div><small>EXERCÍCIOS</small><h2 id="saved-exercise-picker-title">Selecionar exercícios</h2></div>
        <button class="saved-exercise-picker-close" type="button" data-close-exercise-picker aria-label="Fechar">×</button>
      </header>
      <div class="saved-exercise-picker-tools">
        <input class="saved-exercise-picker-search" type="search" autocomplete="off" placeholder="Buscar exercício" aria-label="Buscar exercício">
        <div class="saved-exercise-picker-categories" aria-label="Categorias de exercícios"></div>
      </div>
      <div class="saved-exercise-picker-options"></div>
      <footer class="saved-exercise-picker-footer">
        <span class="saved-exercise-picker-footer-count">0 exercícios selecionados</span>
        <button class="btn btn-primary saved-exercise-picker-confirm" type="button">Confirmar seleção</button>
      </footer>
    </section>`;
  document.body.appendChild(sheet);

  const trigger = custom.querySelector('.saved-exercise-picker-trigger');
  const label = custom.querySelector('.saved-exercise-picker-label');
  const count = custom.querySelector('.saved-exercise-picker-count');
  const chips = custom.querySelector('.saved-exercise-picker-chips');
  const search = sheet.querySelector('.saved-exercise-picker-search');
  const categoryHost = sheet.querySelector('.saved-exercise-picker-categories');
  const optionsHost = sheet.querySelector('.saved-exercise-picker-options');
  const footerCount = sheet.querySelector('.saved-exercise-picker-footer-count');
  const confirmButton = sheet.querySelector('.saved-exercise-picker-confirm');

  function cacheNativeOptions() {
    [...nativeSelect.querySelectorAll('option[value]')].forEach(option => {
      if (!option.value) return;
      const group = option.closest('optgroup')?.label || 'Outros';
      const raw = option.textContent?.trim() || 'Exercício';
      const [name, ...detailParts] = raw.split(' · ');
      optionCache.set(option.value, {
        id: option.value,
        name: name.trim(),
        detail: detailParts.join(' · ').trim(),
        group
      });
    });
  }

  function allOptions() {
    cacheNativeOptions();
    return [...optionCache.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  }

  function categories() {
    return [...new Set(allOptions().map(item => item.group))].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }

  function normalize(value = '') {
    return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function isEditingItem() {
    return addButton.textContent.trim().toLocaleLowerCase('pt-BR').startsWith('salvar exercício');
  }

  function renderCategories() {
    const values = categories();
    categoryHost.innerHTML = ['Todos', ...values].map(category => {
      const value = category === 'Todos' ? '' : category;
      return `<button class="saved-exercise-picker-category${activeCategory === value ? ' active' : ''}" type="button" data-picker-category="${escapeHtml(value)}">${escapeHtml(category)}</button>`;
    }).join('');
  }

  function renderOptions() {
    const term = normalize(search.value);
    const options = allOptions().filter(item => {
      if (activeCategory && item.group !== activeCategory) return false;
      if (!term) return true;
      return normalize(`${item.name} ${item.detail} ${item.group}`).includes(term);
    });

    if (!options.length) {
      optionsHost.innerHTML = '<p class="saved-exercise-picker-empty">Nenhum exercício encontrado.</p>';
      syncWorkingCount();
      return;
    }

    const groups = new Map();
    options.forEach(item => {
      if (!groups.has(item.group)) groups.set(item.group, []);
      groups.get(item.group).push(item);
    });

    optionsHost.innerHTML = [...groups.entries()].map(([group, items]) => `
      <section class="saved-exercise-picker-group">
        <div class="saved-exercise-picker-group-title">${escapeHtml(group)}</div>
        ${items.map(item => `
          <label class="saved-exercise-picker-option${workingIds.has(item.id) ? ' selected' : ''}">
            <input type="checkbox" value="${escapeHtml(item.id)}" ${workingIds.has(item.id) ? 'checked' : ''}>
            <span class="saved-exercise-picker-check" aria-hidden="true">✓</span>
            <span class="saved-exercise-picker-copy"><strong>${escapeHtml(item.name)}</strong>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ''}</span>
          </label>`).join('')}
      </section>`).join('');
    syncWorkingCount();
  }

  function syncWorkingCount() {
    const total = workingIds.size;
    footerCount.textContent = `${total} ${total === 1 ? 'exercício selecionado' : 'exercícios selecionados'}`;
    confirmButton.textContent = total ? `Confirmar ${total} ${total === 1 ? 'exercício' : 'exercícios'}` : 'Confirmar seleção';
  }

  function syncMainControl() {
    const ids = [...selectedIds];
    const total = ids.length;
    label.textContent = total ? `${total} ${total === 1 ? 'exercício selecionado' : 'exercícios selecionados'}` : 'Selecionar exercícios';
    count.textContent = `${total} ${total === 1 ? 'selecionado' : 'selecionados'}`;
    chips.hidden = total === 0;
    chips.innerHTML = ids.map(id => {
      const item = optionCache.get(id);
      return `<button type="button" class="saved-exercise-picker-chip" data-remove-picker-chip="${escapeHtml(id)}">${escapeHtml(item?.name || 'Exercício')} <span>×</span></button>`;
    }).join('');
    nativeSelect.value = ids.find(id => nativeSelect.querySelector(`option[value="${cssEscape(id)}"]`)) || '';
  }

  function openPicker() {
    cacheNativeOptions();
    workingIds = new Set(selectedIds);
    activeCategory = '';
    search.value = '';
    renderCategories();
    renderOptions();
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('saved-exercise-picker-open');
    setTimeout(() => search.focus(), 50);
  }

  function closePicker() {
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('saved-exercise-picker-open');
  }

  function clearSelection() {
    selectedIds.clear();
    workingIds.clear();
    nativeSelect.value = '';
    syncMainControl();
  }

  function selectOnly(id) {
    selectedIds.clear();
    if (id) selectedIds.add(id);
    syncMainControl();
  }

  trigger.addEventListener('click', openPicker);

  sheet.addEventListener('click', event => {
    if (event.target.closest('[data-close-exercise-picker]')) return closePicker();
    const categoryButton = event.target.closest('[data-picker-category]');
    if (categoryButton) {
      activeCategory = categoryButton.dataset.pickerCategory || '';
      renderCategories();
      renderOptions();
    }
  });

  search.addEventListener('input', renderOptions);

  optionsHost.addEventListener('change', event => {
    const checkbox = event.target.closest('input[type="checkbox"]');
    if (!checkbox) return;

    if (isEditingItem() && checkbox.checked) {
      workingIds.clear();
      workingIds.add(checkbox.value);
    } else if (checkbox.checked) {
      workingIds.add(checkbox.value);
    } else {
      workingIds.delete(checkbox.value);
    }
    renderOptions();
  });

  confirmButton.addEventListener('click', () => {
    selectedIds.clear();
    workingIds.forEach(id => selectedIds.add(id));
    syncMainControl();
    closePicker();
  });

  chips.addEventListener('click', event => {
    const chip = event.target.closest('[data-remove-picker-chip]');
    if (!chip) return;
    selectedIds.delete(chip.dataset.removePickerChip);
    syncMainControl();
  });

  document.addEventListener('click', event => {
    const editButton = event.target.closest('[data-edit-saved-item]');
    if (editButton) {
      setTimeout(() => selectOnly(nativeSelect.value), 0);
      return;
    }
    if (event.target.closest('#saved-item-cancel-edit')) {
      setTimeout(clearSelection, 0);
      return;
    }
    if (event.target.closest('#new-saved-workout') || event.target.closest('[data-close-saved-workout]')) {
      setTimeout(clearSelection, 0);
    }
  });

  addButton.addEventListener('click', event => {
    if (bypassBatchInterceptor) return;
    const ids = [...selectedIds];

    if (!ids.length) return;
    if (ids.length === 1 || isEditingItem()) {
      ensureNativeOption(ids[0]);
      nativeSelect.value = ids[0];
      setTimeout(() => { if (!isEditingItem()) clearSelection(); }, 0);
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const sharedValues = {
      series: seriesInput?.value || '',
      reps: repsInput?.value || '',
      load: loadInput?.value || '',
      rest: restInput?.value || '',
      notes: notesInput?.value || ''
    };

    bypassBatchInterceptor = true;
    try {
      ids.forEach(id => {
        ensureNativeOption(id);
        nativeSelect.value = id;
        restoreSharedValues(sharedValues);
        addButton.click();
      });
    } finally {
      bypassBatchInterceptor = false;
    }
    clearSelection();
  }, true);

  function ensureNativeOption(id) {
    if (nativeSelect.querySelector(`option[value="${cssEscape(id)}"]`)) return;
    const cached = optionCache.get(id);
    if (!cached) return;
    const option = document.createElement('option');
    option.value = id;
    option.textContent = cached.detail ? `${cached.name} · ${cached.detail}` : cached.name;
    nativeSelect.appendChild(option);
  }

  function restoreSharedValues(values) {
    if (seriesInput) seriesInput.value = values.series;
    if (repsInput) repsInput.value = values.reps;
    if (loadInput) loadInput.value = values.load;
    if (restInput) restInput.value = values.rest;
    if (notesInput) notesInput.value = values.notes;
  }

  cancelEditButton?.addEventListener('click', () => setTimeout(clearSelection, 0));
  syncMainControl();
}

function injectStyles() {
  if (document.querySelector('#saved-exercise-picker-styles')) return;
  const style = document.createElement('style');
  style.id = 'saved-exercise-picker-styles';
  style.textContent = `
    .saved-exercise-native-select-hidden,.saved-exercise-source-field-hidden{display:none!important}
    .saved-exercise-picker-control{display:grid;gap:8px}
    .saved-exercise-picker-trigger{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:54px;padding:10px 13px;border:1px solid var(--border);border-radius:12px;background:var(--surface-light);color:var(--text);font:inherit;text-align:left;cursor:pointer}
    .saved-exercise-picker-trigger>span:first-child{display:grid;gap:2px;min-width:0}.saved-exercise-picker-trigger small{color:var(--muted);font-size:.58rem;font-weight:900;letter-spacing:.07em}.saved-exercise-picker-trigger strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.86rem}.saved-exercise-picker-trigger-meta{display:flex;align-items:center;gap:8px;flex:0 0 auto}.saved-exercise-picker-trigger-meta b{color:var(--primary);font-size:.68rem}.saved-exercise-picker-trigger-meta i{color:var(--muted);font-size:1.35rem;font-style:normal}
    .saved-exercise-picker-chips{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}.saved-exercise-picker-chips::-webkit-scrollbar{display:none}.saved-exercise-picker-chip{flex:0 0 auto;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:6px 9px;border:1px solid rgba(50,215,75,.25);border-radius:999px;background:rgba(50,215,75,.07);color:var(--primary);font:inherit;font-size:.68rem;font-weight:800}.saved-exercise-picker-chip span{margin-left:4px}
    body.saved-exercise-picker-open{overflow:hidden}
    .saved-exercise-picker-sheet{position:fixed;inset:0;z-index:26000;display:none;align-items:flex-end;justify-content:center;padding:max(10px,env(safe-area-inset-top)) 10px max(10px,env(safe-area-inset-bottom))}.saved-exercise-picker-sheet.open{display:flex}.saved-exercise-picker-backdrop{position:absolute;inset:0;border:0;background:rgba(4,7,10,.78);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px)}
    .saved-exercise-picker-dialog{position:relative;z-index:1;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;width:min(620px,100%);height:min(88dvh,760px);overflow:hidden;border:1px solid var(--border);border-radius:22px 22px 14px 14px;background:#171b21;box-shadow:0 28px 80px rgba(0,0,0,.58)}
    .saved-exercise-picker-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 16px 12px;border-bottom:1px solid var(--border)}.saved-exercise-picker-head small{display:block;margin-bottom:3px;color:var(--primary);font-size:.62rem;font-weight:900;letter-spacing:.08em}.saved-exercise-picker-head h2{margin:0;font-size:1.22rem}.saved-exercise-picker-close{width:40px;height:40px;border:1px solid var(--border);border-radius:50%;background:var(--surface-light);color:var(--text);font-size:1.45rem;line-height:1}
    .saved-exercise-picker-tools{display:grid;gap:10px;padding:12px 14px 10px}.saved-exercise-picker-search{min-height:46px}.saved-exercise-picker-categories{display:flex;gap:7px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}.saved-exercise-picker-categories::-webkit-scrollbar{display:none}.saved-exercise-picker-category{flex:0 0 auto;min-height:34px;padding:0 11px;border:1px solid var(--border);border-radius:999px;background:var(--surface-light);color:var(--muted);font:inherit;font-size:.7rem;font-weight:800}.saved-exercise-picker-category.active{border-color:var(--primary);background:rgba(50,215,75,.08);color:var(--primary)}
    .saved-exercise-picker-options{overflow:auto;padding:0 14px 14px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}.saved-exercise-picker-group{display:grid;gap:6px}.saved-exercise-picker-group+.saved-exercise-picker-group{margin-top:12px}.saved-exercise-picker-group-title{padding:6px 3px 2px;color:var(--muted);font-size:.62rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
    .saved-exercise-picker-option{display:grid;grid-template-columns:30px minmax(0,1fr);gap:10px;align-items:center;min-height:56px;padding:9px 10px;border:1px solid transparent;border-radius:12px;background:rgba(255,255,255,.025);cursor:pointer}.saved-exercise-picker-option.selected{border-color:rgba(50,215,75,.42);background:rgba(50,215,75,.065)}.saved-exercise-picker-option input{position:absolute;opacity:0;pointer-events:none}.saved-exercise-picker-check{display:grid;place-items:center;width:30px;height:30px;border:2px solid #596474;border-radius:8px;background:#252b34;color:transparent;font-size:.86rem;font-weight:950}.saved-exercise-picker-option.selected .saved-exercise-picker-check{border-color:var(--primary);background:var(--primary);color:#07120a}.saved-exercise-picker-copy{display:grid;gap:2px;min-width:0}.saved-exercise-picker-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem}.saved-exercise-picker-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:.68rem}.saved-exercise-picker-empty{margin:0;padding:24px 10px;color:var(--muted);font-size:.78rem;text-align:center}
    .saved-exercise-picker-footer{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 14px calc(10px + env(safe-area-inset-bottom));border-top:1px solid var(--border);background:rgba(23,27,33,.97);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}.saved-exercise-picker-footer-count{color:var(--muted);font-size:.7rem;font-weight:800}.saved-exercise-picker-confirm{min-width:180px;margin:0!important}
    @media(max-width:640px){.saved-workout-item-form{padding:12px}.saved-exercise-picker-dialog{width:100%;height:calc(100dvh - max(18px,env(safe-area-inset-top)) - max(18px,env(safe-area-inset-bottom)));border-radius:20px}.saved-exercise-picker-footer{grid-template-columns:1fr}.saved-exercise-picker-footer-count{text-align:center}.saved-exercise-picker-confirm{width:100%;min-width:0}.saved-exercise-picker-option{min-height:58px}.saved-exercise-picker-copy strong{font-size:.86rem}}
  `;
  document.head.appendChild(style);
}

function escapeHtml(value = '') {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function cssEscape(value) {
  return window.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
