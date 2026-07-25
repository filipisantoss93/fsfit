import { supabase } from './supabase.js';

function injectBottomNavigationPositionFix() {
  if (document.querySelector('#fsfit-bottom-navigation-position-fix')) return;

  const style = document.createElement('style');
  style.id = 'fsfit-bottom-navigation-position-fix';
  style.textContent = `
    @media (max-width: 860px) {
      html {
        scroll-padding-bottom: calc(var(--fsfit-nav-height) + env(safe-area-inset-bottom, 0px) + 12px) !important;
      }

      html body {
        padding-bottom: calc(var(--fsfit-nav-height) + env(safe-area-inset-bottom, 0px) + 12px) !important;
      }

      html body .fsfit-bottom-nav {
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        min-height: calc(var(--fsfit-nav-height) + env(safe-area-inset-bottom, 0px)) !important;
        padding: 7px 10px calc(7px + env(safe-area-inset-bottom, 0px)) !important;
        border-left: 0 !important;
        border-right: 0 !important;
        border-bottom: 0 !important;
        border-radius: 18px 18px 0 0 !important;
      }

      html body .fsfit-bottom-nav::before {
        display: none !important;
        content: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

injectBottomNavigationPositionFix();

function revealAdminEntry(entry) {
  if (!(entry instanceof HTMLElement)) return;
  entry.hidden = false;
  entry.classList.remove('hidden');
}

async function resolveAdminEntry(entry) {
  if (!(entry instanceof HTMLElement) || entry.dataset.adminCheckStarted === '1') return;
  entry.dataset.adminCheckStarted = '1';

  const desktopAdminEntry = document.querySelector('#admin-nav');
  if (desktopAdminEntry instanceof HTMLElement && !desktopAdminEntry.classList.contains('hidden')) {
    revealAdminEntry(entry);
    return;
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user?.id) return;

    const { data: admin, error } = await supabase
      .from('platform_admins')
      .select('user_id')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (!error && admin) revealAdminEntry(entry);
  } catch (error) {
    console.warn('Não foi possível verificar o atalho administrativo:', error);
  }
}

function ensureMoreSheetEntries(sheet) {
  if (!(sheet instanceof HTMLElement)) return;
  const list = sheet.querySelector('.fsfit-more-list');
  if (!(list instanceof HTMLElement)) return;

  if (!list.querySelector('[data-fsfit-food-library-entry]')) {
    const exerciseEntry = list.querySelector('a[href="biblioteca-exercicios.html"]');
    exerciseEntry?.insertAdjacentHTML('afterend', `
      <a class="fsfit-more-item" href="biblioteca-alimentar.html" data-fsfit-food-library-entry>
        <span class="fsfit-more-item-icon" aria-hidden="true">AL</span>
        <span class="fsfit-more-item-copy"><strong>Biblioteca de alimentos</strong><small>Gerencie alimentos e informações nutricionais</small></span>
        <span class="fsfit-more-item-chevron" aria-hidden="true">›</span>
      </a>`);
  }

  if (!list.querySelector('[data-fsfit-admin-entry]')) {
    const logoutEntry = list.querySelector('[data-fsfit-logout]');
    logoutEntry?.insertAdjacentHTML('beforebegin', `
      <a class="fsfit-more-item hidden" href="admin.html" data-fsfit-admin-entry hidden>
        <span class="fsfit-more-item-icon" aria-hidden="true">AD</span>
        <span class="fsfit-more-item-copy"><strong>Painel administrativo</strong><small>Usuários, assinaturas e faturamento</small></span>
        <span class="fsfit-more-item-chevron" aria-hidden="true">›</span>
      </a>`);
  }

  resolveAdminEntry(list.querySelector('[data-fsfit-admin-entry]'));
}

function bindMoreSheetSwipe(sheet) {
  if (!(sheet instanceof HTMLElement) || sheet.dataset.swipeCloseBound === '1') return;

  ensureMoreSheetEntries(sheet);

  const panel = sheet.querySelector('.fsfit-more-panel');
  const backdrop = sheet.querySelector('.fsfit-more-backdrop');
  const closeButton = sheet.querySelector('.fsfit-more-close');
  if (!(panel instanceof HTMLElement) || !(closeButton instanceof HTMLElement)) return;

  sheet.dataset.swipeCloseBound = '1';

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let lastDistance = 0;
  let tracking = false;
  let dragging = false;

  const clearInlineStyles = () => {
    panel.style.removeProperty('transform');
    panel.style.removeProperty('transition');
    panel.style.removeProperty('will-change');
    if (backdrop instanceof HTMLElement) {
      backdrop.style.removeProperty('opacity');
      backdrop.style.removeProperty('transition');
    }
  };

  const snapBack = () => {
    panel.style.transition = 'transform .24s cubic-bezier(.22,.75,.22,1)';
    panel.style.transform = 'translateY(0)';
    if (backdrop instanceof HTMLElement) {
      backdrop.style.transition = 'opacity .2s ease';
      backdrop.style.opacity = '1';
    }
    window.setTimeout(clearInlineStyles, 260);
  };

  const closeWithMotion = () => {
    const distance = Math.max(panel.getBoundingClientRect().height, window.innerHeight * .55);
    panel.style.transition = 'transform .2s ease';
    panel.style.transform = `translateY(${distance}px)`;
    if (backdrop instanceof HTMLElement) {
      backdrop.style.transition = 'opacity .18s ease';
      backdrop.style.opacity = '0';
    }

    window.setTimeout(() => {
      clearInlineStyles();
      closeButton.click();
    }, 170);
  };

  panel.addEventListener('touchstart', event => {
    if (!sheet.classList.contains('is-open') || event.touches.length !== 1) return;
    if (panel.scrollTop > 0) return;

    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startTime = performance.now();
    lastDistance = 0;
    tracking = true;
    dragging = false;
  }, { passive: true });

  panel.addEventListener('touchmove', event => {
    if (!tracking || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;

    if (!dragging) {
      if (Math.abs(deltaX) < 7 && Math.abs(deltaY) < 7) return;
      if (deltaY <= 0 || Math.abs(deltaX) > Math.abs(deltaY)) {
        tracking = false;
        return;
      }
      dragging = true;
      panel.style.transition = 'none';
      panel.style.willChange = 'transform';
      if (backdrop instanceof HTMLElement) backdrop.style.transition = 'none';
    }

    event.preventDefault();
    lastDistance = Math.max(0, deltaY);
    const visualDistance = Math.min(lastDistance, panel.getBoundingClientRect().height);
    panel.style.transform = `translateY(${visualDistance}px)`;

    if (backdrop instanceof HTMLElement) {
      const progress = Math.min(visualDistance / Math.max(panel.getBoundingClientRect().height * .7, 1), 1);
      backdrop.style.opacity = String(Math.max(.12, 1 - progress));
    }
  }, { passive: false });

  const finishGesture = cancelled => {
    if (!tracking && !dragging) return;

    const elapsed = Math.max(performance.now() - startTime, 1);
    const velocity = lastDistance / elapsed;
    const threshold = Math.min(150, panel.getBoundingClientRect().height * .2);
    const shouldClose = !cancelled && dragging && (lastDistance >= threshold || velocity >= .72);

    tracking = false;
    dragging = false;

    if (shouldClose) closeWithMotion();
    else if (lastDistance > 0) snapBack();
    else clearInlineStyles();

    lastDistance = 0;
  };

  panel.addEventListener('touchend', () => finishGesture(false), { passive: true });
  panel.addEventListener('touchcancel', () => finishGesture(true), { passive: true });
}

function bindExistingSheets(root = document) {
  if (root instanceof HTMLElement && root.matches('.fsfit-more-sheet')) bindMoreSheetSwipe(root);
  root.querySelectorAll?.('.fsfit-more-sheet').forEach(bindMoreSheetSwipe);
}

function initMoreSheetSwipe() {
  bindExistingSheets();

  const observer = new MutationObserver(records => {
    records.forEach(record => {
      record.addedNodes.forEach(node => {
        if (node instanceof HTMLElement) bindExistingSheets(node);
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMoreSheetSwipe, { once: true });
} else {
  initMoreSheetSwipe();
}
