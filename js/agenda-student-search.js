const form = document.querySelector('#schedule-form');

if (form) {
  const select = form.querySelector('select[name="aluno_id"]');

  if (select && !form.querySelector('.agenda-student-search')) {
    const group = select.closest('.form-group');
    const wrapper = document.createElement('div');
    wrapper.className = 'agenda-student-search';
    wrapper.innerHTML = `
      <button class="agenda-student-search-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
        <span class="agenda-student-search-value">Selecione um aluno</span>
        <span class="agenda-student-search-chevron" aria-hidden="true">⌄</span>
      </button>
      <div class="agenda-student-search-panel" hidden>
        <div class="agenda-student-search-input-wrap">
          <span aria-hidden="true">⌕</span>
          <input class="agenda-student-search-input" type="search" autocomplete="off" placeholder="Buscar aluno pelo nome" aria-label="Buscar aluno">
        </div>
        <div class="agenda-student-search-results" role="listbox" aria-label="Alunos"></div>
      </div>`;

    select.classList.add('agenda-student-native-select');
    select.setAttribute('aria-hidden', 'true');
    select.tabIndex = -1;
    select.insertAdjacentElement('afterend', wrapper);

    const trigger = wrapper.querySelector('.agenda-student-search-trigger');
    const value = wrapper.querySelector('.agenda-student-search-value');
    const panel = wrapper.querySelector('.agenda-student-search-panel');
    const input = wrapper.querySelector('.agenda-student-search-input');
    const results = wrapper.querySelector('.agenda-student-search-results');

    const normalize = text => String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    function options() {
      return [...select.options]
        .filter(option => option.value)
        .map(option => ({ value: option.value, label: option.textContent.trim() }));
    }

    function selectedLabel() {
      const option = select.selectedOptions?.[0];
      return option?.value ? option.textContent.trim() : 'Selecione um aluno';
    }

    function render(query = '') {
      const term = normalize(query);
      const items = options().filter(item => !term || normalize(item.label).includes(term));

      results.innerHTML = items.length
        ? items.map(item => `
            <button class="agenda-student-search-option${String(select.value) === String(item.value) ? ' is-selected' : ''}" type="button" role="option" aria-selected="${String(select.value) === String(item.value)}" data-student-id="${escapeHtml(item.value)}">
              <span class="agenda-student-search-initials" aria-hidden="true">${escapeHtml(initials(item.label))}</span>
              <span class="agenda-student-search-name">${escapeHtml(item.label)}</span>
              ${String(select.value) === String(item.value) ? '<span class="agenda-student-search-check" aria-hidden="true">✓</span>' : ''}
            </button>`).join('')
        : '<p class="agenda-student-search-empty">Nenhum aluno encontrado.</p>';
    }

    function open() {
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      wrapper.classList.add('is-open');
      input.value = '';
      render();
      requestAnimationFrame(() => input.focus());
    }

    function close() {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      wrapper.classList.remove('is-open');
    }

    function sync() {
      value.textContent = selectedLabel();
      trigger.classList.toggle('has-value', Boolean(select.value));
      render(input.value);
    }

    trigger.addEventListener('click', () => panel.hidden ? open() : close());
    input.addEventListener('input', () => render(input.value));

    results.addEventListener('click', event => {
      const option = event.target.closest('[data-student-id]');
      if (!option) return;
      select.value = option.dataset.studentId || '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
      close();
    });

    select.addEventListener('change', sync);

    document.addEventListener('click', event => {
      if (!wrapper.contains(event.target)) close();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) {
        event.stopPropagation();
        close();
        trigger.focus();
      }
    });

    const observer = new MutationObserver(sync);
    observer.observe(select, { childList: true, subtree: true });

    const scheduleModal = document.querySelector('#schedule-modal');
    if (scheduleModal) {
      new MutationObserver(() => {
        if (scheduleModal.classList.contains('open')) {
          close();
          sync();
        }
      }).observe(scheduleModal, { attributes: true, attributeFilter: ['class'] });
    }

    sync();
  }
}

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map(part => part.charAt(0)).join('') || 'A').toUpperCase();
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
