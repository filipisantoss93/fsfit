"use strict";
const attachedDialogs = new WeakMap();
function visibleDialogs() {
    return [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
        .filter(dialog => !dialog.closest('[hidden], .hidden, [aria-hidden="true"]'));
}
function focusableElements(dialog) {
    return [...dialog.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')].filter(element => !element.closest('[hidden], .hidden, [aria-hidden="true"]'));
}
function manageDialog(dialog) {
    if (attachedDialogs.has(dialog) || dialog.closest('[hidden], .hidden, [aria-hidden="true"]'))
        return;
    const activeElement = document.activeElement;
    const returnFocus = activeElement instanceof HTMLElement ? activeElement : null;
    attachedDialogs.set(dialog, returnFocus);
    if (!focusableElements(dialog).length && !dialog.hasAttribute('tabindex'))
        dialog.setAttribute('tabindex', '-1');
    requestAnimationFrame(() => {
        if (!dialog.isConnected)
            return;
        const focusable = focusableElements(dialog);
        (focusable[0] || dialog).focus();
    });
}
function releaseDialog(dialog) {
    const returnFocus = attachedDialogs.get(dialog);
    attachedDialogs.delete(dialog);
    if (returnFocus?.isConnected)
        returnFocus.focus();
}
function restoreRemovedDialogs(nodes) {
    nodes.forEach(node => {
        if (!(node instanceof HTMLElement))
            return;
        const removed = [];
        if (node.matches('[role="dialog"][aria-modal="true"]'))
            removed.push(node);
        removed.push(...node.querySelectorAll('[role="dialog"][aria-modal="true"]'));
        removed.forEach(releaseDialog);
    });
}
document.addEventListener('keydown', event => {
    const dialog = visibleDialogs().at(-1);
    if (!dialog)
        return;
    if (event.key === 'Escape') {
        const closeButton = dialog.querySelector('button[aria-label*="fechar" i], [data-pwa-close], [data-close-install-help], [data-close-saved-workout], [data-close-subscription-modal], [data-close-plan-modal], [data-close-workout-modal], [data-close-exercise-modal], [data-cancel-application]');
        if (closeButton) {
            event.preventDefault();
            closeButton.click();
        }
        return;
    }
    if (event.key !== 'Tab')
        return;
    const focusable = focusableElements(dialog);
    if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
    }
    else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
    }
});
// fsfit-allow-persistent-observer: document-wide focus management for injected dialogs.
const dialogObserver = new MutationObserver(records => {
    for (const record of records) {
        restoreRemovedDialogs(record.removedNodes);
        record.addedNodes.forEach(node => {
            if (!(node instanceof HTMLElement))
                return;
            if (node.matches('[role="dialog"][aria-modal="true"]'))
                manageDialog(node);
            node.querySelectorAll('[role="dialog"][aria-modal="true"]').forEach(manageDialog);
        });
        if (record.type === 'attributes' && record.target instanceof Element) {
            const target = record.target;
            const dialogs = [];
            if (target instanceof HTMLElement && target.matches('[role="dialog"][aria-modal="true"]'))
                dialogs.push(target);
            dialogs.push(...target.querySelectorAll('[role="dialog"][aria-modal="true"]'));
            dialogs.forEach(dialog => {
                if (dialog.closest('[hidden], .hidden, [aria-hidden="true"]'))
                    releaseDialog(dialog);
                else
                    manageDialog(dialog);
            });
        }
    }
});
dialogObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-hidden', 'class', 'hidden']
});
