const SELECTOR_TIMEOUT_MS = 10000;

waitForWorkoutBuilder().catch(error => {
  console.error('Falha ao ativar seleção múltipla de exercícios:', error);
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
  if (nativeSelect.dataset.fsfitMultiselect === '1') return;
  nativeSelect.dataset.fsfitMultiselect = '1';

  injectStyles();

  const field = nativeSelect.closest('.exercise-field');
  const searchInput = modal.querySelector('#saved-item-search');
  const categorySelect = modal.querySelector('#saved-item-category');
  const seriesInput = modal.querySelector('#saved-item-series');
  const repsInput = modal.querySelector('#saved-item-reps');
  const loadInput = modal.querySelector('#saved-item-load');
  const restInput = modal.querySelector('#saved-item-rest');
  const notesInput = modal.querySelector('#saved-item-notes');
  const cancelEditButton = modal.querySelector('#saved-item-cancel-edit');

  if (!field || !searchInput || !categorySelect) return;

  const selectedIds = new Set();
  const optionCache = new Map();
  let bypassBatchInterceptor = false;
  let panelOpen = false;

  nativeSelect.classList.add('saved-exercise-native-select-hidden');
  nativeSelect.setAttribute('aria-hidden', 'true');
  nativeSelect.tabIndex = -1;

  const custom = document.createElement('div');
  custom.className = 'saved-exercise-multiselect';
  custom.innerHTML = `
    <button class="saved-exercise-multiselect-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
      <span class="saved-exercise-multiselect-label">Selecione um ou mais exercícios</span>
      <span class="saved-exercise-multiselect-meta">
        <span class="saved-exercise-multiselect-count hidden">0</span>
        <span class="saved-exercise-multiselect-chevron" aria-hidden="true">⌄</span>
      </span>
    </button>
    <div class="saved-exercise-multiselect-panel" role="listbox" aria-multiselectable="true" hidden>
      <div class="saved-exercise-multiselect-panel-head">
        <strong>Selecionar exercícios</strong>
        <span class="saved-exercise-multiselect-panel-count">0 selecionados</span>
      </div>
      <div class="saved-exercise-multiselect-options"></div>
    </div>`;

  nativeSelect.after(custom);

  const trigger = custom.querySelector('.saved-exercise-multiselect-trigger');
  const triggerLabel = custom.querySelector('.saved-exercise-multiselect-label');
  const triggerCount = custom.querySelector('.saved-exercise-multiselect-count');
  const panel = custom.querySelector('.saved-exercise-multiselect-panel');
  const panelCount = custom.querySelector('.saved-exercise-multiselect-panel-count');
  const optionsHost = custom.querySelector('.saved-exercise-multiselect-options');

  function cacheNativeOptions() {
    [...nativeSelect.querySelectorAll('option[value]')].forEach(option => {
      if (!option.value) return;
      const group = option.closest('optgroup')?.label || 'Outros';
      optionCache.set(option.value, {
        id: option.value,
        label: option.textContent?.trim() || 'Exercício',
        group
      });
    });
  }

  function visibleNativeOptions() {
    cacheNativeOptions();
    return [...nativeSelect.querySelectorAll('option[value]')]
      .filter(option => option.value)
      .map(option => optionCache.get(option.value))
      .filter(Boolean);
  }

  function isEditingItem() {
    return addButton.textContent.trim().toLocaleLowerCase('pt-BR').startsWith('salvar exercício');
  }

  function renderOptions() {
    const options = visibleNativeOptions();

    if (!options.length) {
      optionsHost.innerHTML = '<p class="saved-exercise-multiselect-empty">Nenhum exercício encontrado com os filtros atuais.</p>';
      syncTrigger();
      return;
    }

    const groups = new Map();
    options.forEach(option => {
      if (!groups.has(option.group)) groups.set(option.group, []);
      groups.get(option.group).push(option);
    });

    optionsHost.innerHTML = [...groups.entries()].map(([group, items]) => `
      <section class="saved-exercise-multiselect-group">
        <div class="saved-exercise-multiselect-group-title">${escapeHtml(group)}</div>
        ${items.map(item => `
          <label class="saved-exercise-multiselect-option${selectedIds.has(item.id) ? ' selected' : ''}">
            <input type="checkbox" value="${escapeHtml(item.id)}" ${selectedIds.has(item.id) ? 'checked' : ''}>
            <span class="saved-exercise-multiselect-check" aria-hidden="true">✓</span>
            <span class="saved-exercise-multiselect-option-copy">${escapeHtml(item.label)}</span>
          </label>`).join('')}
      </section>`).join('');

    syncTrigger();
  }

  function syncTrigger() {
    const ids = [...selectedIds];
    const count = ids.length;

    if (!count) {
      triggerLabel.textContent = 'Selecione um ou mais exercícios';
      triggerCount.classList.add('hidden');
    } else if (count === 1) {
      triggerLabel.textContent = optionCache.get(ids[0])?.label || '1 exercício selecionado';
      triggerCount.textContent = '1';
      triggerCount.classList.remove('hidden');
    } else {
      triggerLabel.textContent = `${count} exercícios selecionados`;
      triggerCount.textContent = String(count);
      triggerCount.classList.remove('hidden');
    }

    panelCount.textContent = `${count} ${count === 1 ? 'selecionado' : 'selecionados'}`;
    nativeSelect.value = ids.find(id => nativeSelect.querySelector(`option[value="${cssEscape(id)}"]`)) || '';
  }

  function setPanelOpen(open) {
    panelOpen = open;
    panel.hidden = !open;
    custom.classList.toggle('open', open);
    trigger.setAttribute('aria-expanded', String(open));
  }

  function clearSelection() {
    selectedIds.clear();
    nativeSelect.value = '';
    renderOptions();
  }

  function selectOnly(id) {
    selectedIds.clear();
    if (id) selectedIds.add(id);
    renderOptions();
  }

  trigger.addEventListener('click', () => setPanelOpen(!panelOpen));

  optionsHost.addEventListener('change', event => {
    const checkbox = event.target.closest('input[type="checkbox"]');
    if (!checkbox) return;

    if (isEditingItem() && checkbox.checked) {
      selectedIds.clear();
      selectedIds.add(checkbox.value);
    } else if (checkbox.checked) {
      selectedIds.add(checkbox.value);
    } else {
      selectedIds.delete(checkbox.value);
    }

    renderOptions();
  });

  document.addEventListener('click', event => {
    if (panelOpen && !event.target.closest('.saved-exercise-multiselect')) setPanelOpen(false);

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

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panelOpen) {
      event.stopPropagation();
      setPanelOpen(false);
      trigger.focus();
    }
  });

  const selectObserver = new MutationObserver(() => renderOptions());
  selectObserver.observe(nativeSelect, { childList: true, subtree: true });

  const buttonObserver = new MutationObserver(() => {
    if (!isEditingItem() && selectedIds.size === 1 && !nativeSelect.value) clearSelection();
  });
  buttonObserver.observe(addButton, { childList: true, subtree: true, characterData: true });

  searchInput.addEventListener('input', () => setTimeout(renderOptions, 0));
  categorySelect.addEventListener('change', () => setTimeout(renderOptions, 0));

  addButton.addEventListener('click', event => {
    if (bypassBatchInterceptor) return;

    const ids = [...selectedIds];
    if (ids.length <= 1 || isEditingItem()) {
      if (ids[0]) ensureNativeOption(ids[0]);
      nativeSelect.value = ids[0] || nativeSelect.value;
      setTimeout(() => {
        if (!isEditingItem()) clearSelection();
      }, 0);
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
    setPanelOpen(false);
  }, true);

  function ensureNativeOption(id) {
    if (nativeSelect.querySelector(`option[value="${cssEscape(id)}"]`)) return;
    const cached = optionCache.get(id);
    if (!cached) return;
    const option = document.createElement('option');
    option.value = id;
    option.textContent = cached.label;
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

  cacheNativeOptions();
  renderOptions();
}

function injectStyles() {
  if (document.querySelector('#saved-exercise-multiselect-styles')) return;

  const style = document.createElement('style');
  style.id = 'saved-exercise-multiselect-styles';
  style.textContent = `
    .saved-exercise-native-select-hidden{display:none!important}
    .saved-workout-item-grid .exercise-field{position:relative}
    .saved-exercise-multiselect{position:relative;width:100%}
    .saved-exercise-multiselect-trigger{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:48px;padding:0 14px;border:1px solid var(--border);border-radius:12px;background:var(--surface-light);color:var(--text);font:inherit;text-align:left;cursor:pointer;transition:border-color .18s ease,box-shadow .18s ease,background .18s ease}
    .saved-exercise-multiselect-trigger:hover{background:rgba(255,255,255,.055)}
    .saved-exercise-multiselect.open .saved-exercise-multiselect-trigger{border-color:var(--primary);box-shadow:0 0 0 1px rgba(50,215,75,.22)}
    .saved-exercise-multiselect-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
    .saved-exercise-multiselect-meta{display:flex;align-items:center;gap:8px;flex:0 0 auto}
    .saved-exercise-multiselect-count{display:grid;place-items:center;min-width:24px;height:24px;padding:0 7px;border-radius:999px;background:rgba(50,215,75,.14);color:var(--primary);font-size:.68rem;font-weight:900}
    .saved-exercise-multiselect-count.hidden{display:none}
    .saved-exercise-multiselect-chevron{color:var(--muted);font-size:1.15rem;line-height:1;transition:transform .18s ease}
    .saved-exercise-multiselect.open .saved-exercise-multiselect-chevron{transform:rotate(180deg)}
    .saved-exercise-multiselect-panel{position:absolute;left:0;right:0;top:calc(100% + 7px);z-index:40;max-height:min(360px,48dvh);overflow:auto;padding:8px;border:1px solid var(--border);border-radius:15px;background:#171b21;box-shadow:0 22px 60px rgba(0,0,0,.58);overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
    .saved-exercise-multiselect-panel[hidden]{display:none}
    .saved-exercise-multiselect-panel-head{position:sticky;top:-8px;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:10px;margin:-8px -8px 6px;padding:12px 12px 10px;border-bottom:1px solid var(--border);background:rgba(23,27,33,.97);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
    .saved-exercise-multiselect-panel-head strong{font-size:.78rem}
    .saved-exercise-multiselect-panel-head span{color:var(--primary);font-size:.68rem;font-weight:850}
    .saved-exercise-multiselect-options{display:grid;gap:8px}
    .saved-exercise-multiselect-group{display:grid;gap:4px}
    .saved-exercise-multiselect-group-title{padding:7px 8px 4px;color:var(--muted);font-size:.65rem;font-weight:900;letter-spacing:.07em;text-transform:uppercase}
    .saved-exercise-multiselect-option{display:grid;grid-template-columns:28px minmax(0,1fr);gap:9px;align-items:center;min-height:46px;padding:7px 9px;border:1px solid transparent;border-radius:10px;background:rgba(255,255,255,.025);cursor:pointer;transition:.16s ease}
    .saved-exercise-multiselect-option:hover{background:rgba(255,255,255,.055)}
    .saved-exercise-multiselect-option.selected{border-color:rgba(50,215,75,.45);background:rgba(50,215,75,.07)}
    .saved-exercise-multiselect-option input{position:absolute;opacity:0;pointer-events:none}
    .saved-exercise-multiselect-check{display:grid;place-items:center;width:28px;height:28px;border:1px solid #596474;border-radius:8px;background:#252b34;color:transparent;font-size:.86rem;font-weight:950;transition:.16s ease}
    .saved-exercise-multiselect-option.selected .saved-exercise-multiselect-check{border-color:var(--primary);background:var(--primary);color:#07120a}
    .saved-exercise-multiselect-option-copy{min-width:0;color:var(--text);font-size:.8rem;font-weight:750;line-height:1.35}
    .saved-exercise-multiselect-empty{margin:0;padding:18px 10px;color:var(--muted);font-size:.76rem;text-align:center}
    @media(max-width:720px){
      .saved-exercise-multiselect-trigger{min-height:52px;padding:0 13px;border-radius:12px}
      .saved-exercise-multiselect-panel{max-height:min(330px,44dvh);border-radius:14px}
      .saved-exercise-multiselect-option{min-height:48px;padding:8px 9px}
      .saved-exercise-multiselect-option-copy{font-size:.82rem}
    }
  `;
  document.head.appendChild(style);
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function cssEscape(value) {
  return window.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
