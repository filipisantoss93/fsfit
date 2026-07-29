const input = document.querySelector('#admin-user-search');
const clearButton = document.querySelector('#admin-user-search-clear');

if (input && clearButton) {
  const syncClearButton = () => {
    clearButton.hidden = !input.value;
  };

  clearButton.addEventListener('click', () => {
    if (!input.value) return;
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    syncClearButton();
  });

  input.addEventListener('input', syncClearButton);
  syncClearButton();
}
