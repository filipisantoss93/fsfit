import { supabase } from './supabase.js';

const WAIT_MS = 10000;

waitForBuilder().catch(error => {
  console.error('Falha ao ativar seletor mobile do treino estruturado:', error);
});

async function waitForBuilder(): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < WAIT_MS) {
    const batchSelector = document.querySelector('#batch-exercise-selector');
    const categorySelect = document.querySelector('#exercise-category');
    const checkboxList = document.querySelector('#exercise-checkbox-list');
    const selectedBuilder = document.querySelector('#selected-exercises-builder');
    if (batchSelector && categorySelect && checkboxList && selectedBuilder) {
      await enhance(batchSelector as HTMLElement, categorySelect as HTMLSelectElement, checkboxList as HTMLElement, selectedBuilder as HTMLElement);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 80));
  }
}

async function enhance(batchSelector: HTMLElement, categorySelect: HTMLSelectElement, checkboxList: HTMLElement, selectedBuilder: HTMLElement): Promise<void> {
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

  const library: any[] = (data || []).map((item: any) => ({
    ...item,
    categoria: (item.grupo_muscular || 'Outros').trim() || 'Outros',
    tipo_prescricao: item.tipo_prescricao || 'repeticoes'
  }));

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

  const trigger = control.querySelector('.structured-exercise-picker-trigger') as HTMLButtonElement;
  const label = control.querySelector('.structured-exercise-picker-label') as HTMLElement;
  const count = control.querySelector('.structured-exercise-picker-count') as HTMLElement;
  const chips = control.querySelector('.structured-exercise-picker-chips') as HTMLElement;
  const search = sheet.querySelector('.structured-exercise-picker-search') as HTMLInputElement;
  const categoryHost = sheet.querySelector('.structured-exercise-picker-categories') as HTMLElement;
  const optionsHost = sheet.querySelector('.structured-exercise-picker-options') as HTMLElement;
  const footerCount = sheet.querySelector('.structured-exercise-picker-footer-count') as HTMLElement;
  const confirmButton = sheet.querySelector('.structured-exercise-picker-confirm') as HTMLButtonElement;
  let activeCategory = '';

  function selectedIds(): Set<string> {
    return new Set(
      [...selectedBuilder.querySelectorAll('[data-selected-exercise]')]
        .map(card => String((card as HTMLElement).dataset.selectedExercise || ''))
        .filter(Boolean)
    );
  }

  function normalize(value: unknown = ''): string {
    return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function prescriptionLabel(type: string): string {
    return ({ repeticoes: 'Repetições', tempo: 'Tempo', distancia: 'Distância' } as Record<string, string>)[type] || 'Repetições';
  }

  function categories(): string[] {
    return [...new Set(library.map((item: any) => String(item.categoria)))].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }

  function renderCategories(): void {
    categoryHost.innerHTML = ['Todos', ...categories()].map(category => {
      const value = category === 'Todos' ? '' : category;
      return `<button class="structured-exercise-picker-category${activeCategory === value ? ' active' : ''}" type="button" data-structured-category="${escapeHtml(value)}">${escapeHtml(category)}</button>`;
    }).join('');
  }

  function renderOptions(): void {
    const selected = selectedIds();
    const term = normalize(search.value);
    const filtered = library.filter((item: any) => {
      if (activeCategory && item.categoria !== activeCategory) return false;
      if (!term) return true;
      return normalize(`${item.nome} ${item.categoria} ${item.equipamento || ''}`).includes(term);
    });

    if (!filtered.length) {
      optionsHost.innerHTML = '<p class="structured-exercise-picker-empty">Nenhum exercício encontrado.</p>';
      syncCounts();
      return;
    }

    const groups = new Map<string, any[]>();
    filtered.forEach((item: any) => {
      if (!groups.has(item.categoria)) groups.set(item.categoria, []);
      groups.get(item.categoria)!.push(item);
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

  function syncCounts(): void {
    const selected = selectedIds();
    const total = selected.size;
    label.textContent = total ? `${total} ${total === 1 ? 'exercício selecionado' : 'exercícios selecionados'}` : 'Selecionar exercícios';
    count.textContent = `${total} ${total === 1 ? 'selecionado' : 'selecionados'}`;
    footerCount.textContent = `${total} ${total === 1 ? 'exercício selecionado' : 'exercícios selecionados'}`;
    confirmButton.textContent = total ? `Confirmar ${total} ${total === 1 ? 'exercício' : 'exercícios'}` : 'Confirmar seleção';

    chips.hidden = total === 0;
    chips.innerHTML = [...selected].map(id => {
      const item = library.find((exercise: any) => String(exercise.id) === id);
      return `<button class="structured-exercise-picker-chip" type="button" data-remove-structured-chip="${escapeHtml(id)}">${escapeHtml(item?.nome || 'Exercício')} <span>×</span></button>`;
    }).join('');
  }

  function setExerciseSelection(id: string, checked: boolean): void {
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

  function openPicker(): void {
    activeCategory = '';
    search.value = '';
    renderCategories();
    renderOptions();
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('structured-exercise-picker-open');
    setTimeout(() => search.focus(), 50);
  }

  function closePicker(): void {
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('structured-exercise-picker-open');
  }

  trigger.addEventListener('click', openPicker);
  confirmButton.addEventListener('click', closePicker);
  search.addEventListener('input', renderOptions);

  sheet.addEventListener('click', (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-close-structured-picker]')) return closePicker();
    const category = target?.closest('[data-structured-category]') as HTMLElement | null;
    if (category) {
      activeCategory = category.dataset.structuredCategory || '';
      categorySelect.value = activeCategory;
      renderCategories();
      renderOptions();
    }
  });

  optionsHost.addEventListener('change', (event: Event) => {
    const target = event.target instanceof Element ? event.target : null;
    const input = target?.closest('input[type="checkbox"]') as HTMLInputElement | null;
    if (!input) return;
    setExerciseSelection(input.value, input.checked);
  });

  chips.addEventListener('click', (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    const chip = target?.closest('[data-remove-structured-chip]') as HTMLElement | null;
    if (!chip) return;
    if (chip.dataset.removeStructuredChip) setExerciseSelection(chip.dataset.removeStructuredChip, false);
  });

  const observer = new MutationObserver(() => {
    syncCounts();
    if (sheet.classList.contains('open')) renderOptions();
  });
  observer.observe(selectedBuilder, { childList: true });

  syncCounts();
}


function escapeHtml(value: unknown = ''): string {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
