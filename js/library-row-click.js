"use strict";
(() => {
    const rowSelector = '.exercise-library-item, .food-library-item';
    const editSelector = '[data-edit-exercise], [data-edit-food]';
    const interactiveSelector = 'button, a, input, select, textarea, label';
    function openRow(row) {
        row?.querySelector(editSelector)?.click();
    }
    function getNonInteractiveRow(target) {
        if (!(target instanceof Element))
            return null;
        const row = target.closest(rowSelector);
        return row && !target.closest(interactiveSelector) ? row : null;
    }
    document.addEventListener('click', event => {
        openRow(getNonInteractiveRow(event.target));
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ')
            return;
        const row = getNonInteractiveRow(event.target);
        if (!row)
            return;
        event.preventDefault();
        openRow(row);
    });
    const observer = new MutationObserver(() => {
        document.querySelectorAll(rowSelector).forEach(row => {
            if (!row.querySelector(editSelector))
                return;
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
