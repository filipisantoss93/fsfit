// @ts-ignore The browser resolves this versioned side-effect module.
import './global-runtime-bootstrap.js?v=20260731-global-runtime1';
const INACTIVE_ACCOUNT_GUARD_KEY = '__FSFIT_INACTIVE_ACCOUNT_BODY_GUARD__';
function installInactiveAccountGuard() {
    const guardGlobal = globalThis;
    if (guardGlobal[INACTIVE_ACCOUNT_GUARD_KEY])
        return;
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    if (!descriptor?.get || !descriptor?.set)
        return;
    const originalGet = descriptor.get;
    const originalSet = descriptor.set;
    guardGlobal[INACTIVE_ACCOUNT_GUARD_KEY] = true;
    Object.defineProperty(Element.prototype, 'innerHTML', {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get() {
            return originalGet.call(this);
        },
        set(value) {
            const html = String(value ?? '');
            const isInactiveAccountRender = this === document.body && html.includes('inactive-account-screen');
            if (!isInactiveAccountRender) {
                originalSet.call(this, value);
                return;
            }
            if (document.querySelector('#inactive-account-screen'))
                return;
            document.body.classList.remove('nav-menu-open', 'workout-modal-open');
            document.body.classList.add('inactive-account-mode');
            [...document.body.children].forEach(element => {
                if (!(element instanceof HTMLElement))
                    return;
                if (element.matches('script, style, template'))
                    return;
                element.dataset.fsfitInactivePreviousHidden = String(element.hidden);
                element.hidden = true;
                element.setAttribute('aria-hidden', 'true');
            });
            const template = document.createElement('template');
            originalSet.call(template, html.trim());
            const screen = template.content.querySelector('.inactive-account-screen') || template.content.firstElementChild;
            if (!screen)
                return;
            screen.id = screen.id || 'inactive-account-screen';
            screen.setAttribute('role', 'main');
            document.body.appendChild(screen);
        }
    });
}
installInactiveAccountGuard();
