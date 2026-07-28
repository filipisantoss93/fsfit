(() => {
  const contentStylesheetId = 'fsfit-student-record-content-styles';
  const mobileHotfixStylesheetId = 'fsfit-student-record-mobile-hotfix';

  function appendStylesheet(id, href) {
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.append(link);
  }

  function ensureSupplementalStylesheets() {
    // ficha-aluno-acoes.css já é carregado estaticamente em ficha-aluno.html.
    appendStylesheet(contentStylesheetId, 'css/ficha-aluno-conteudo.css?v=20260726-ux3');
    appendStylesheet(mobileHotfixStylesheetId, 'css/ficha-aluno-mobile-hotfix.css?v=20260726-scroll1');
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

  function enhanceInternalContent() {
    const labels = {
      overview: 'Resumo',
      planning: 'Plano',
      evolution: 'Evolução',
      history: 'Treinos',
      access: 'Acesso'
    };

    document.querySelectorAll('[data-record-tab]').forEach(tab => {
      const label = labels[tab.dataset.recordTab];
      if (label) tab.textContent = label;
    });

    const actionContent = [
      ['#workout-editor-link', 'Treinos', 'Monte e organize as rotinas de exercícios do aluno.'],
      ['#diet-editor-link', 'Alimentação', 'Estruture orientações e refeições por horário.'],
      ['#reminders-link', 'Lembretes', 'Programe avisos e acompanhamentos importantes.']
    ];

    actionContent.forEach(([selector, title, description]) => {
      const action = document.querySelector(selector);
      if (!action || action.dataset.enhanced === 'true') return;
      action.dataset.enhanced = 'true';
      action.innerHTML = `<span class="planning-action-title">${title}</span><span class="planning-action-description">${description}</span><span class="planning-action-arrow" aria-hidden="true">→</span>`;
    });
  }

  function enhanceModal() {
    const modal = document.querySelector('#student-edit-modal');
    const close = document.querySelector('#student-edit-close');
    const edit = document.querySelector('#edit-registration');
    if (!modal || !close || !edit) return;

    let previousFocus = null;

    const syncScrollLock = () => {
      const isOpen = modal.classList.contains('open');
      document.body.classList.toggle('student-edit-open', isOpen);
      modal.setAttribute('aria-hidden', String(!isOpen));

      if (!isOpen) {
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('position');
        document.body.style.removeProperty('top');
        document.body.style.removeProperty('width');
        document.documentElement.style.removeProperty('overflow');
      }
    };

    edit.addEventListener('click', () => {
      previousFocus = document.activeElement;
      requestAnimationFrame(() => close.focus({ preventScroll: true }));
    });

    const observer = new MutationObserver(() => {
      const isOpen = modal.classList.contains('open');
      syncScrollLock();
      if (!isOpen && previousFocus instanceof HTMLElement) {
        previousFocus.focus({ preventScroll: true });
      }
    });

    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
    syncScrollLock();

    window.addEventListener('pageshow', syncScrollLock);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) syncScrollLock();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modal.classList.contains('open')) {
        event.preventDefault();
        close.click();
      }
    });
  }

  function init() {
    ensureSupplementalStylesheets();
    buildHeaderActions();
    enhanceInternalContent();
    enhanceModal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();