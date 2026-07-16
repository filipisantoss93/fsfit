const builder = document.querySelector('#selected-exercises-builder');

function repetitionOptions(selected = '12') {
  return Array.from({ length: 60 }, (_, index) => index + 1)
    .map(value => `<option value="${value}"${String(value) === String(selected || '12') ? ' selected' : ''}>${value}</option>`)
    .join('');
}

function applyDefaults(root = document) {
  root.querySelectorAll?.('[data-selected-exercise]').forEach(card => {
    const series = card.querySelector('[data-config-field="series"]');
    if (series && !series.value) {
      series.value = '4';
      series.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const repetitions = card.querySelector('[data-config-field="repeticoes"]');
    if (repetitions && repetitions.tagName !== 'SELECT') {
      const current = repetitions.value || '12';
      const select = document.createElement('select');
      select.dataset.configField = 'repeticoes';
      select.innerHTML = repetitionOptions(current);
      repetitions.replaceWith(select);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (repetitions && !repetitions.value) {
      repetitions.value = '12';
      repetitions.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const rest = card.querySelector('[data-config-field="descanso_segundos"]');
    if (rest && !rest.value) {
      rest.value = '60';
      rest.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}

if (builder) {
  const observer = new MutationObserver(() => applyDefaults(builder));
  observer.observe(builder, { childList: true, subtree: true });
  applyDefaults(builder);
}
