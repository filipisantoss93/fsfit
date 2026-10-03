// @ts-ignore Existing browser JavaScript module.
import { supabase } from './supabase.js';
// @ts-ignore Existing browser JavaScript module.
import * as core from './layout-core.js?v=20261003-platform-menu1';
// @ts-ignore Existing browser JavaScript module.
import './shared-components.js?v=20261001-shared-ts1';

// @ts-ignore Existing browser JavaScript module.
export * from './layout-core.js?v=20261003-platform-menu1';

const PANEL_RETURN_SCROLL_KEY = 'fsfit:panel:return-scroll';
const PANEL_RESTORE_SCROLL_KEY = 'fsfit:panel:restore-scroll';
const DESKTOP_SHELL_STYLESHEET = 'css/header-menu.css?v=20261003-platform-menu1';
const AUTO_SHELL_ACTIVE_BY_PAGE: Record<string, string> = {
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
let mobileMoreCleanup: (() => void) | null = null;

function currentPage(): string {
  const page = window.location.pathname.split('/').pop();
  return page || 'index.html';
}

function inferShellActivePage(): string {
  return AUTO_SHELL_ACTIVE_BY_PAGE[currentPage()] || '';
}

function ensureDesktopShellStyles(): void {
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

function scheduleNonCriticalEnhancements(): void {
  if (enhancementsScheduled) return;
  enhancementsScheduled = true;
  window.setTimeout(() => {
    const page = currentPage();
    if (document.querySelector('[data-checkout-endereco], #checkout-endereco, [name="cep"]')) {
      // @ts-ignore Existing browser JavaScript module.
      import('./checkout-endereco.js?v=20261001-ts-address1').catch(error => console.error('Não foi possível carregar o complemento de endereço:', error));
    }
    if (document.querySelector('.fsfit-more-sheet')) {
      // @ts-ignore Existing browser JavaScript module.
      import('./mobile-more-swipe.js?v=20261003-platform-menu1').catch(error => console.error('Não foi possível carregar os recursos do menu:', error));
    }
    if (document.querySelector('#fsfit-profile-menu-button')) {
      // @ts-ignore Existing browser JavaScript module.
      import('./sidebar-profile-photo.js?v=20261003-header-avatar1').catch(error => console.error('Não foi possível carregar a foto do perfil:', error));
    }
    if (STUDENT_AVATAR_PAGES.has(page)) {
      // @ts-ignore Existing browser JavaScript module.
      import('./student-avatars-personal.js?v=20260722-student-avatars1').catch(error => console.error('Não foi possível carregar os avatares dos alunos:', error));
    }
  }, 0);
}

function ensureMobileMoreSheet(trigger: HTMLButtonElement): { openSheet: () => void; closeSheet: () => void } {
  mobileMoreCleanup?.();
  document.querySelector('.fsfit-more-sheet')?.remove();

  const sheet = document.createElement('div');
  sheet.className = 'fsfit-more-sheet';
  sheet.setAttribute('aria-hidden', 'true');
  sheet.innerHTML = `
    <button class="fsfit-more-backdrop" type="button" aria-label="Fechar menu"></button>
    <section id="fsfit-more-dialog" class="fsfit-more-panel" role="dialog" aria-modal="true" aria-labelledby="fsfit-more-title">
      <div class="fsfit-more-handle" aria-hidden="true"></div>
      <header class="fsfit-more-heading">
        <div><small>FS FIT</small><h2 id="fsfit-more-title">Menu da plataforma</h2></div>
        <button class="fsfit-more-close" type="button" aria-label="Fechar">×</button>
      </header>
      <nav class="fsfit-more-list" aria-label="Mais opções do FS Fit">
        <a class="fsfit-more-item" href="perfil.html"><span class="fsfit-more-item-icon" aria-hidden="true">PF</span><span class="fsfit-more-item-copy"><strong>Perfil</strong><small>Dados profissionais e configurações</small></span><span class="fsfit-more-item-chevron" aria-hidden="true">›</span></a>
        <a class="fsfit-more-item" href="biblioteca-exercicios.html"><span class="fsfit-more-item-icon" aria-hidden="true">EX</span><span class="fsfit-more-item-copy"><strong>Biblioteca de exercícios</strong><small>Gerencie exercícios e categorias</small></span><span class="fsfit-more-item-chevron" aria-hidden="true">›</span></a>
        <button class="fsfit-more-item" type="button" data-fsfit-public-page><span class="fsfit-more-item-icon" aria-hidden="true">↗</span><span class="fsfit-more-item-copy"><strong>Página pública</strong><small>Veja sua página como seus alunos veem</small></span><span class="fsfit-more-item-chevron" aria-hidden="true">›</span></button>
        <a class="fsfit-more-item" href="assinatura.html"><span class="fsfit-more-item-icon" aria-hidden="true">AS</span><span class="fsfit-more-item-copy"><strong>Assinatura</strong><small>Plano, cobrança e renovação</small></span><span class="fsfit-more-item-chevron" aria-hidden="true">›</span></a>
        <a class="fsfit-more-item" href="contato.html"><span class="fsfit-more-item-icon" aria-hidden="true">?</span><span class="fsfit-more-item-copy"><strong>Contato</strong><small>Suporte e canais de atendimento</small></span><span class="fsfit-more-item-chevron" aria-hidden="true">›</span></a>
        <div class="fsfit-more-theme fsfit-theme-setting" aria-label="Tema visual">
          <span class="fsfit-theme-setting-label">Tema</span>
          <div class="fsfit-theme-control" role="group" aria-label="Escolher tema">
            <button type="button" data-fsfit-theme-choice="auto" aria-pressed="false">Sistema</button>
            <button type="button" data-fsfit-theme-choice="light" aria-pressed="false">Claro</button>
            <button type="button" data-fsfit-theme-choice="dark" aria-pressed="false">Escuro</button>
          </div>
        </div>
        <button class="fsfit-more-item is-danger" type="button" data-fsfit-logout><span class="fsfit-more-item-icon" aria-hidden="true">SA</span><span class="fsfit-more-item-copy"><strong>Sair</strong><small>Encerrar sua sessão no FS Fit</small></span><span class="fsfit-more-item-chevron" aria-hidden="true">›</span></button>
      </nav>
    </section>`;

  document.body.appendChild(sheet);
  const panel = sheet.querySelector<HTMLElement>('.fsfit-more-panel');
  const closeButton = sheet.querySelector<HTMLButtonElement>('.fsfit-more-close');
  const backdrop = sheet.querySelector<HTMLButtonElement>('.fsfit-more-backdrop');
  const publicPageButton = sheet.querySelector<HTMLButtonElement>('[data-fsfit-public-page]');
  const logoutButton = sheet.querySelector<HTMLButtonElement>('[data-fsfit-logout]');
  let previousFocus: HTMLElement | null = null;

  const focusableElements = (): HTMLElement[] => Array.from(panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') || []);

  const closeSheet = (): void => {
    if (!sheet.classList.contains('is-open')) return;
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
    trigger.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('fsfit-sheet-open');
    previousFocus?.focus();
  };

  const openSheet = (): void => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheet.classList.add('is-open');
    sheet.setAttribute('aria-hidden', 'false');
    trigger.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('fsfit-sheet-open');
    requestAnimationFrame(() => closeButton?.focus());
  };

  const handleKeydown = (event: KeyboardEvent): void => {
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
  sheet.querySelectorAll<HTMLAnchorElement>('a.fsfit-more-item').forEach(link => link.addEventListener('click', closeSheet));

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
    document.querySelector<HTMLButtonElement>('#logout-button')?.click();
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

function ensureMobileBottomNav(active = ''): void {
  document.querySelector('.fsfit-bottom-nav')?.remove();
  const page = currentPage();
  const inferredActive = active || page.replace(/\.html$/i, '');
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

  document.body.appendChild(nav);
  const profileMenuButton = document.querySelector<HTMLButtonElement>('#fsfit-profile-menu-button');
  if (profileMenuButton) ensureMobileMoreSheet(profileMenuButton);
}

function configureStudentRecordBackLink(): void {
  if (currentPage() !== 'ficha-aluno.html') return;
  const backLink = document.querySelector<HTMLAnchorElement>('.record-back-link');
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
  backLink.href = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? `agenda.html?data=${encodeURIComponent(date || '')}` : 'agenda.html';
}

export function renderHeader(active = ''): void {
  ensureDesktopShellStyles();
  core.renderHeader(active);
  ensureMobileBottomNav(active);
  configureStudentRecordBackLink();
  scheduleNonCriticalEnhancements();
}

export async function setGreeting(session: any): Promise<any> {
  return core.setGreeting(session);
}

export async function requireSession(): Promise<any> {
  return core.requireSession();
}

if (currentPage() === 'ficha-aluno.html') {
  // @ts-ignore Existing browser JavaScript module.
  import('./ficha-treinos-salvos.js?v=20261001-ts1').catch(error => console.error('Não foi possível carregar os treinos salvos na ficha do aluno:', error));
  // @ts-ignore Existing browser JavaScript module.
  import('./iniciar-treino-personal.js?v=20261001-ts-start1').catch(error => console.error('Não foi possível carregar a ação de iniciar treino do aluno:', error));
  // @ts-ignore Existing browser JavaScript module.
  import('./ficha-aluno-ativacao.js?v=20260722-secure-activation1').catch(error => console.error('Não foi possível carregar o acesso seguro do aluno:', error));
}

Promise.resolve().then(() => {
  const active = inferShellActivePage();
  if (!active) return;
  const host = document.querySelector('#header-container');
  if (!host || host.querySelector('.main-header')) return;
  renderHeader(active);
});
