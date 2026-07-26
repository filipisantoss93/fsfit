(() => {
  const stylesheetId = 'fsfit-student-record-actions-styles';

  function ensureStylesheet() {
    if (document.getElementById(stylesheetId)) return;
    const link = document.createElement('link');
    link.id = stylesheetId;
    link.rel = 'stylesheet';
    link.href = 'css/ficha-aluno-acoes.css?v=20260726-ux2';
    document.head.append(link);
  }

  function closeMenu(menu, toggle, { restoreFocus = false } = {}) {
    if (!menu || !toggle) return;
    menu.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toggle.focus({ preventScroll: true });
  }

  function buildHeaderActions() {
    const header = document.querySelector('.student-record-header');
    const preview = document.querySelector('#student-preview-link');
    const edit = document.querySelector('#edit-registration');
    const remove = document.querySelector('#delete-student');
    if (!header || !preview || !edit || !remove || header.querySelector('.student-record-header-actions')) return;

    header.classList.add('student-record-header-enhanced');

    const actions = document.createElement('div');
    actions.className = 'student-record-header-actions';

    const previewAction = preview.cloneNode(true);
    previewAction.classList.add('student-record-primary-action');
    previewAction.textContent = 'Visualizar como aluno';

    const menuWrap = document.createElement('div');
    menuWrap.className = 'student-record-menu';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'student-record-menu-toggle';
    toggle.setAttribute('aria-label', 'Mais ações do aluno');
    toggle.setAttribute('aria-haspopup', 'menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = '⋮';

    const menu = document.createElement('div');
    menu.className = 'student-record-menu-popover';
    menu.setAttribute('role', 'menu');

    const editAction = document.createElement('button');
    editAction.type = 'button';
    editAction.className = 'student-record-menu-action';
    editAction.setAttribute('role', 'menuitem');
    editAction.innerHTML = '<span aria-hidden="true">✎</span><span>Editar cadastro</span>';
    editAction.addEventListener('click', () => {
      closeMenu(menu, toggle);
      edit.click();
    });

    const accessAction = document.createElement('button');
    accessAction.type = 'button';
    accessAction.className = 'student-record-menu-action';
    accessAction.setAttribute('role', 'menuitem');
    accessAction.innerHTML = '<span aria-hidden="true">#</span><span>Gerenciar acesso</span>';
    accessAction.addEventListener('click', () => {
      closeMenu(menu, toggle);
      document.querySelector('[data-record-tab="access"]')?.click();
      document.querySelector('[data-record-panel="access"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const deleteAction = document.createElement('button');
    deleteAction.type = 'button';
    deleteAction.className = 'student-record-menu-action student-record-menu-action-danger';
    deleteAction.setAttribute('role', 'menuitem');
    deleteAction.innerHTML = '<span aria-hidden="true">⌫</span><span>Excluir aluno</span>';
    deleteAction.addEventListener('click', () => {
      closeMenu(menu, toggle);
      remove.click();
    });

    menu.append(editAction, accessAction, deleteAction);
    menuWrap.append(toggle, menu);
    actions.append(previewAction, menuWrap);
    header.append(actions);

    toggle.addEventListener('click', event => {
      event.stopPropagation();
      const willOpen = !menu.classList.contains('open');
      document.querySelectorAll('.student-record-menu-popover.open').forEach(openMenu => {
        if (openMenu !== menu) openMenu.classList.remove('open');
      });
      menu.classList.toggle('open', willOpen);
      toggle.setAttribute('aria-expanded', String(willOpen));
      if (willOpen) editAction.focus({ preventScroll: true });
    });

    document.addEventListener('click', event => {
      if (!menuWrap.contains(event.target)) closeMenu(menu, toggle);
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.classList.contains('open')) {
        event.preventDefault();
        closeMenu(menu, toggle, { restoreFocus: true });
      }
    });

    document.body.classList.add('student-record-header-actions-ready');
  }

  function enhanceModal() {
    const modal = document.querySelector('#student-edit-modal');
    const close = document.querySelector('#student-edit-close');
    const edit = document.querySelector('#edit-registration');
    if (!modal || !close || !edit) return;

    let previousFocus = null;

    edit.addEventListener('click', () => {
      previousFocus = document.activeElement;
      requestAnimationFrame(() => close.focus({ preventScroll: true }));
    });

    const observer = new MutationObserver(() => {
      const isOpen = modal.classList.contains('open');
      modal.setAttribute('aria-hidden', String(!isOpen));
      if (!isOpen && previousFocus instanceof HTMLElement) {
        previousFocus.focus({ preventScroll: true });
      }
    });

    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modal.classList.contains('open')) {
        event.preventDefault();
        close.click();
      }
    });
  }

  function init() {
    ensureStylesheet();
    buildHeaderActions();
    enhanceModal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
