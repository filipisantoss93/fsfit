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


function escapeHtml(value = '') {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function cssEscape(value) {
  return window.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
