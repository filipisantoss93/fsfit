(() => {
  const ROW_SELECTOR = '.exercise-library-item, .food-library-item';
  const EDIT_SELECTOR = '[data-edit-exercise], [data-edit-food]';
  const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, label';

  function openRow(row) {
    const editButton = row?.querySelector(EDIT_SELECTOR);
    if (!editButton) return;
    editButton.click();
  }

  document.addEventListener('click', event => {
    const row = event.target.closest(ROW_SELECTOR);
    if (!row || event.target.closest(INTERACTIVE_SELECTOR)) return;
    openRow(row);
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest(ROW_SELECTOR);
    if (!row || event.target.closest(INTERACTIVE_SELECTOR)) return;
    event.preventDefault();
    openRow(row);
  });

  const observer = new MutationObserver(() => {
    document.querySelectorAll(ROW_SELECTOR).forEach(row => {
      if (!row.querySelector(EDIT_SELECTOR)) return;
      row.classList.add('library-clickable-row');
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      if (!row.hasAttribute('aria-label')) {
        const title = row.querySelector('h3')?.textContent?.trim();
        row.setAttribute('aria-label', title ? `Editar ${title}` : 'Editar item');
      }
    });
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
