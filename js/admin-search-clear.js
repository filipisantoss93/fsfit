"use strict";
const input = document.querySelector('#admin-user-search');
const clearButton = document.querySelector('#admin-user-search-clear');
if (input instanceof HTMLInputElement && clearButton instanceof HTMLButtonElement) {
    const syncClearButton = () => {
        clearButton.hidden = input.value.length === 0;
    };
    clearButton.addEventListener('click', () => {
        if (input.value.length === 0)
            return;
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
        syncClearButton();
    });
    input.addEventListener('input', syncClearButton);
    syncClearButton();
}
