import { supabase } from './supabase.js';
import * as core from './layout-core.js';
import './page-data-cache.js?v=20260723-page-cache1';
import './shared-components.js?v=20260728-static-shell1';

export * from './layout-core.js';

const PANEL_RETURN_SCROLL_KEY = 'fsfit:panel:return-scroll';
const PANEL_RESTORE_SCROLL_KEY = 'fsfit:panel:restore-scroll';
const DESKTOP_SHELL_STYLESHEET = 'css/header-menu.css?v=20260729-shell-order1';
const AUTO_SHELL_ACTIVE_BY_PAGE = {
  'painel.html': 'painel',
  'alunos.html': 'alunos',
  'ficha-aluno.html': 'alunos',
  'agenda.html': 'agenda',
  'financeiro.html': 'financeiro',
  'perfil.html': 'perfil',
  'biblioteca-exercicios.html': 'exercicios',
  'biblioteca-alimentar.html': 'alimentacao',
  'assinatura.html': 'assinatura',
  'contato.html': 'contato',
  'admin.html': 'admin',
  'admin-contatos.html': 'admin'
};
const STUDENT_AVATAR_PAGES = new Set(['painel.html', 'alunos.html', 'agenda.html', 'financeiro.html', 'ficha-aluno.html']);
let enhancementsScheduled = false;
let mobileMoreCleanup = null;

function currentPage() {
  const page = window.location.pathname.split('/').pop();
  return page || 'index.html';
}

function inferShellActivePage() {
  return AUTO_SHELL_ACTIVE_BY_PAGE[currentPage()] || '';
}

function ensureDesktopShellStyles() {
  const bundle = document.querySelector('link[data-fsfit-bundle][data-fsfit-header-styles]');
  if (bundle) {
    document.querySelectorAll('link[href*="header-menu.css"]').forEach(link => link.remove());
    return;
  }

  const existingStyles = Array.from(document.querySelectorAll('link[data-fsfit-header-styles], link[href*="header-menu.css"]'));
  existingStyles.forEach(link => link.remove());

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = DESKTOP_SHELL_STYLESHEET;
  stylesheet.dataset.fsfitHeaderStyles = '';
  document.head.appendChild(stylesheet);
}

function scheduleNonCriticalEnhancements() {
  if (enhancementsScheduled) return;
  enhancementsScheduled = true;
  window.setTimeout(() => {
    const page = currentPage();
    if (document.querySelector('[data-checkout-endereco], #checkout-endereco, [name="cep"]')) {
      import('./checkout-endereco.js').catch(error => console.error('Não foi possível carregar o complemento de endereço:', error));
    }
    if (document.querySelector('.fsfit-more-sheet, [data-bottom-page="mais"]')) {
      import('./mobile-more-swipe.js?v=20260721-more-swipe1').catch(error => console.error('Não foi possível carregar os gestos do menu Mais:', error));
    }
    if (STUDENT_AVATAR_PAGES.has(page)) {
      import('./student-avatars-personal.js?v=20260722-student-avatars1').catch(error => console.error('Não foi possível carregar os avatares dos alunos:', error));
    }
  }, 0);
}

function ensureMobileMoreSheet(trigger) {
  mobileMoreCleanup?.();
  document.querySelector('.fsfit-more-sheet')?.remove();

  const sheet = document.createElement('div');
  sheet.className = 'fsfit-more-sheet';
  sheet.setAttribute('aria-hidden', 'true');
  sheet.innerHTML = `
    <button class="fsfit-more-backdrop" type="button" aria-label="Fechar menu"></button>
    <section class="fsfit-more-panel" role="dialog" aria-modal="true" aria-labelledby="fsfit-more-title">
      <div class="fsfit-more-handle" aria-hidden="true"></div>
      <header class="fsfit-more-heading">
        <div><small>FS FIT</small><h2 id="fsfit-more-title">Mais opções</h2></div>
        <button class="fsfit-more-close" type="button" aria-label="Fechar">×</button>
      </header>
      <nav class="fsfit-more-list" aria-label="Mais opções do FS Fit">
        <a class="fsfit-more-item" href="perfil.html"><span class="fsfit-more-item-icon" aria-hidden="true">PF</span><span class="fsfit-more-item-copy"><strong>Perfil</strong><small>Dados profissionais e configurações</small></span><span class="fsfit-more-item-chevron" aria-hidden="true">›</span></a>
        <a class="fsfit-more-item" href="biblioteca-exercicios.html"><span class="fsfit-more-item-icon" aria-hidden="true">EX</span><span class="fsfit-more-item-copy"><strong>Biblioteca de exercícios</strong><small>Gerencie exercícios e categorias</small></span><span class="fsfit-more-item-chevron" aria-hidden="true">›</span></a>
        <button class="fsfit-more-item" type="button" data-fsfit-public-page><span class="fsfit-more-item-icon" aria-hidden="true">↗</span><span class="fsfit-more-item-copy"><strong>Página pública</strong><small>Veja sua página como seus alunos veem</small></span><span class="fsfit-more-item-chevron" aria-hidden="true">›</span></button>
        <a class="fsfit-more-item" href="assinatura.html"><span class="fsfit-more-item-icon" aria-hidden="true">AS</span><span class="fsfit-more-item-copy"><strong>Assinatura</strong><small>Plano, cobrança e renovação</small></span><span class="fsfit-more-item-chevron" aria-hidden="true">›</span></a>
        <a class="fsfit-more-item" href="contato.html"><span class="fsfit-more-item-icon" aria-hidden="true">?</span><span class="fsfit-more-item-copy"><strong>Contato</strong><small>Suporte e canais de atendimento</small></span><span class="fsfit-more-item-chevron" aria-hidden="true">›</span></a>
        <button class="fsfit-more-item is-danger" type="button" data-fsfit-logout><span class="fsfit-more-item-icon" aria-hidden="true">SA</span><span class="fsfit-more-item-copy"><strong>Sair</strong><small>Encerrar sua sessão no FS Fit</small></span><span class="fsfit-more-item-chevron" aria-hidden="true">›</span></button>
      </nav>
    </section>`;

  document.body.appendChild(sheet);
  const panel = sheet.querySelector('.fsfit-more-panel');
  const closeButton = sheet.querySelector('.fsfit-more-close');
  const backdrop = sheet.querySelector('.fsfit-more-backdrop');
  const publicPageButton = sheet.querySelector('[data-fsfit-public-page]');
  const logoutButton = sheet.querySelector('[data-fsfit-logout]');
  let previousFocus = null;

  const focusableElements = () => Array.from(panel?.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') || []);

  const closeSheet = () => {
    if (!sheet.classList.contains('is-open')) return;
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
    trigger.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('fsfit-sheet-open');
    previousFocus?.focus?.();
  };

  const openSheet = () => {
    previousFocus = document.activeElement;
    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    trigger.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('fsfit-sheet-open');
    requestAnimationFrame(() => closeButton?.focus());
  };

  const handleKeydown = event => {
    if (!sheet.classList.contains('is-open')) return;
    if (event.key === 'Escape') {
      closeSheet();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = focusableElements();
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  backdrop?.addEventListener('click', closeSheet);
  closeButton?.addEventListener('click', closeSheet);
  sheet.querySelectorAll('a.fsfit-more-item').forEach(link => link.addEventListener('click', closeSheet));

  publicPageButton?.addEventListener('click', async () => {
    publicPageButton.disabled = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return window.location.assign('perfil.html');
      const { data: publicProfile, error } = await supabase.from('perfis_publicos').select('slug').eq('personal_id', session.user.id).maybeSingle();
      if (!error && publicProfile?.slug) return window.location.assign(`/p/${encodeURIComponent(publicProfile.slug)}`);
      window.location.assign('perfil.html');
    } catch (error) {
      console.error('Não foi possível abrir a página pública:', error);
      window.location.assign('perfil.html');
    } finally {
      publicPageButton.disabled = false;
    }
  });

  logoutButton?.addEventListener('click', () => {
    closeSheet();
    document.querySelector('#logout-button')?.click();
  });

  document.addEventListener('keydown', handleKeydown);
  trigger.addEventListener('click', openSheet);
  mobileMoreCleanup = () => {
    document.removeEventListener('keydown', handleKeydown);
    trigger.removeEventListener('click', openSheet);
    document.documentElement.classList.remove('fsfit-sheet-open');
  };

  return { openSheet, closeSheet };
}

function ensureMobileBottomNav(active = '') {
  document.querySelector('.fsfit-bottom-nav')?.remove();
  const page = currentPage();
  const inferredActive = active || page.replace(/\.html$/i, '');
  const primaryPages = new Set(['painel', 'alunos', 'agenda', 'financeiro']);
  const nav = document.createElement('nav');
  nav.className = 'fsfit-bottom-nav';
  nav.setAttribute('aria-label', 'Navegação principal');

  const items = [
    { key: 'painel', href: 'painel.html', icon: '⌂', label: 'Início' },
    { key: 'alunos', href: 'alunos.html', icon: '◎', label: 'Alunos' },
    { key: 'agenda', href: 'agenda.html', icon: '▦', label: 'Agenda' },
    { key: 'financeiro', href: 'financeiro.html', icon: '$', label: 'Financeiro' }
  ];

  items.forEach(item => {
    const link = document.createElement('a');
    link.href = item.href;
    link.dataset.bottomPage = item.key;
    link.innerHTML = `<span aria-hidden="true">${item.icon}</span>${item.label}`;
    if (inferredActive === item.key || page === item.href) link.classList.add('active');
    nav.appendChild(link);
  });

  const moreButton = document.createElement('button');
  moreButton.type = 'button';
  moreButton.dataset.bottomPage = 'mais';
  moreButton.innerHTML = '<span aria-hidden="true">•••</span>Mais';
  moreButton.setAttribute('aria-label', 'Abrir mais opções');
  moreButton.setAttribute('aria-expanded', 'false');
  moreButton.setAttribute('aria-haspopup', 'dialog');
  if (!primaryPages.has(inferredActive)) moreButton.classList.add('active');
  nav.appendChild(moreButton);

  document.body.appendChild(nav);
  ensureMobileMoreSheet(moreButton);
}

function configureStudentRecordBackLink() {
  if (currentPage() !== 'ficha-aluno.html') return;
  const backLink = document.querySelector('.record-back-link');
  if (!backLink) return;

  const params = new URLSearchParams(window.location.search);
  const origin = params.get('origem');
  if (origin === 'aula') {
    backLink.textContent = '← Voltar para aula';
    backLink.href = 'painel.html#live-students-list';
    return;
  }

  if (origin === 'painel') {
    backLink.textContent = '← Voltar ao painel';
    backLink.href = 'painel.html#today-list';
    backLink.addEventListener('click', event => {
      let canReturnToSavedPanel = false;
      try {
        const saved = JSON.parse(sessionStorage.getItem(PANEL_RETURN_SCROLL_KEY) || 'null');
        canReturnToSavedPanel = Boolean(saved && Number.isFinite(Number(saved.y)) && Date.now() - Number(saved.savedAt || 0) < 2 * 60 * 60 * 1000);
      } catch {}
      if (!canReturnToSavedPanel || window.history.length <= 1) return;
      event.preventDefault();
      sessionStorage.setItem(PANEL_RESTORE_SCROLL_KEY, '1');
      window.history.back();
    });
    return;
  }

  if (origin !== 'agenda') return;
  const date = params.get('data');
  backLink.textContent = '← Voltar para agenda';
  backLink.href = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? `agenda.html?data=${encodeURIComponent(date)}` : 'agenda.html';
}

export function renderHeader(active = '') {
  ensureDesktopShellStyles();
  core.renderHeader(active);
  ensureMobileBottomNav(active);
  configureStudentRecordBackLink();
  scheduleNonCriticalEnhancements();
}

export async function setGreeting(session) {
  return core.setGreeting(session);
}

export async function requireSession() {
  return core.requireSession();
}

if (currentPage() === 'ficha-aluno.html') {
  import('./ficha-treinos-salvos.js?v=20260718-workout-library1').catch(error => console.error('Não foi possível carregar os treinos salvos na ficha do aluno:', error));
  import('./iniciar-treino-personal.js?v=20260719-start-workout1').catch(error => console.error('Não foi possível carregar a ação de iniciar treino do aluno:', error));
  import('./ficha-aluno-ativacao.js?v=20260722-secure-activation1').catch(error => console.error('Não foi possível carregar o acesso seguro do aluno:', error));
}

Promise.resolve().then(() => {
  const active = inferShellActivePage();
  if (!active) return;
  const host = document.querySelector('#header-container');
  if (!host || host.querySelector('.main-header')) return;
  renderHeader(active);
});
