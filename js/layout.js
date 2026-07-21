import { supabase } from './supabase.js';
import * as core from './layout-core.js';
import './checkout-endereco.js';

export * from './layout-core.js';

const FREE_ALLOWED_PAGES = new Set([
  'painel.html',
  'perfil.html',
  'contato.html',
  'assinatura.html',
  'admin.html',
  'admin-contatos.html'
]);

const PANEL_RETURN_SCROLL_KEY = 'fsfit:panel:return-scroll';
const PANEL_RESTORE_SCROLL_KEY = 'fsfit:panel:restore-scroll';

function currentPage() {
  const page = window.location.pathname.split('/').pop();
  return page || 'index.html';
}

function ensureMobileNavigationStylesheet() {
  if (document.querySelector('link[data-fsfit-mobile-navigation]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/mobile-navigation.css?v=20260721-more-sheet1';
  link.dataset.fsfitMobileNavigation = 'true';
  document.head.appendChild(link);
}

function ensureMobileOverflowGuard() {
  if (document.querySelector('style[data-fsfit-mobile-overflow-guard]')) return;
  const style = document.createElement('style');
  style.dataset.fsfitMobileOverflowGuard = 'true';
  style.textContent = `
    html,body{max-width:100%;overflow-x:clip}
    #header-container .user-greeting{display:none!important}
    @media(max-width:860px){
      #header-container .nav-menu{
        transform:translateY(-8px) scale(.98)!important;
        transform-origin:top right!important;
      }
      #header-container .nav-menu.active{
        transform:translateY(0) scale(1)!important;
      }
    }
  `;
  document.head.appendChild(style);
}

function normalizeHeaderLabels() {
  const profileLink = document.querySelector('#nav-menu [data-page="perfil"]');
  if (profileLink) profileLink.textContent = 'Perfil';

  const subscriptionLink = document.querySelector('#nav-menu [data-page="assinatura"]');
  if (subscriptionLink) subscriptionLink.textContent = 'Assinatura';
}

function ensureSubscriptionMenuLink(active = '') {
  const menu = document.querySelector('#nav-menu');
  if (!menu || menu.querySelector('[data-page="assinatura"]')) return;
  const divider = Array.from(menu.children).find(item => item.classList?.contains('nav-divider'));
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.dataset.page = 'assinatura';
  link.href = 'assinatura.html';
  link.textContent = 'Assinatura';
  if (active === 'assinatura') link.classList.add('active');
  link.addEventListener('click', () => menu.classList.remove('active'));
  item.appendChild(link);

  if (divider) menu.insertBefore(item, divider);
  else menu.appendChild(item);
}

function ensureMobileMoreSheet(trigger) {
  document.querySelector('.fsfit-more-sheet')?.remove();

  const sheet = document.createElement('div');
  sheet.className = 'fsfit-more-sheet';
  sheet.setAttribute('aria-hidden', 'true');
  sheet.innerHTML = `
    <button class="fsfit-more-backdrop" type="button" aria-label="Fechar menu"></button>
    <section class="fsfit-more-panel" role="dialog" aria-modal="true" aria-labelledby="fsfit-more-title">
      <div class="fsfit-more-handle" aria-hidden="true"></div>
      <header class="fsfit-more-heading">
        <div>
          <small>FS FIT</small>
          <h2 id="fsfit-more-title">Mais opções</h2>
        </div>
        <button class="fsfit-more-close" type="button" aria-label="Fechar">×</button>
      </header>
      <nav class="fsfit-more-list" aria-label="Mais opções do FS Fit">
        <a class="fsfit-more-item" href="perfil.html">
          <span class="fsfit-more-item-icon" aria-hidden="true">PF</span>
          <span class="fsfit-more-item-copy"><strong>Perfil</strong><small>Dados profissionais e configurações</small></span>
          <span class="fsfit-more-item-chevron" aria-hidden="true">›</span>
        </a>
        <a class="fsfit-more-item" href="biblioteca-exercicios.html">
          <span class="fsfit-more-item-icon" aria-hidden="true">EX</span>
          <span class="fsfit-more-item-copy"><strong>Biblioteca de exercícios</strong><small>Gerencie exercícios e categorias</small></span>
          <span class="fsfit-more-item-chevron" aria-hidden="true">›</span>
        </a>
        <button class="fsfit-more-item" type="button" data-fsfit-public-page>
          <span class="fsfit-more-item-icon" aria-hidden="true">↗</span>
          <span class="fsfit-more-item-copy"><strong>Página pública</strong><small>Veja sua página como seus alunos veem</small></span>
          <span class="fsfit-more-item-chevron" aria-hidden="true">›</span>
        </button>
        <a class="fsfit-more-item" href="assinatura.html">
          <span class="fsfit-more-item-icon" aria-hidden="true">AS</span>
          <span class="fsfit-more-item-copy"><strong>Assinatura</strong><small>Plano, cobrança e renovação</small></span>
          <span class="fsfit-more-item-chevron" aria-hidden="true">›</span>
        </a>
        <a class="fsfit-more-item" href="contato.html">
          <span class="fsfit-more-item-icon" aria-hidden="true">?</span>
          <span class="fsfit-more-item-copy"><strong>Contato</strong><small>Suporte e canais de atendimento</small></span>
          <span class="fsfit-more-item-chevron" aria-hidden="true">›</span>
        </a>
        <button class="fsfit-more-item is-danger" type="button" data-fsfit-logout>
          <span class="fsfit-more-item-icon" aria-hidden="true">SA</span>
          <span class="fsfit-more-item-copy"><strong>Sair</strong><small>Encerrar sua sessão no FS Fit</small></span>
          <span class="fsfit-more-item-chevron" aria-hidden="true">›</span>
        </button>
      </nav>
    </section>
  `;

  document.body.appendChild(sheet);

  const closeButton = sheet.querySelector('.fsfit-more-close');
  const backdrop = sheet.querySelector('.fsfit-more-backdrop');
  const publicPageButton = sheet.querySelector('[data-fsfit-public-page]');
  const logoutButton = sheet.querySelector('[data-fsfit-logout]');
  let previousFocus = null;

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

  backdrop?.addEventListener('click', closeSheet);
  closeButton?.addEventListener('click', closeSheet);

  sheet.querySelectorAll('a.fsfit-more-item').forEach(link => {
    link.addEventListener('click', () => {
      sheet.classList.remove('is-open');
      document.documentElement.classList.remove('fsfit-sheet-open');
    });
  });

  publicPageButton?.addEventListener('click', async () => {
    publicPageButton.disabled = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.assign('perfil.html');
        return;
      }

      const { data: publicProfile, error } = await supabase
        .from('perfis_publicos')
        .select('slug')
        .eq('personal_id', session.user.id)
        .maybeSingle();

      if (!error && publicProfile?.slug) {
        window.location.assign(`/p/${encodeURIComponent(publicProfile.slug)}`);
        return;
      }

      window.location.assign('perfil.html');
    } catch (error) {
      console.error('Não foi possível abrir a página pública:', error);
      window.location.assign('perfil.html');
    } finally {
      publicPageButton.disabled = false;
    }
  });

  logoutButton?.addEventListener('click', async () => {
    closeSheet();
    const existingLogout = document.querySelector('#nav-menu .logout, #nav-menu [data-action="logout"], #logout-button');
    if (existingLogout instanceof HTMLElement) {
      existingLogout.click();
      return;
    }

    try {
      await supabase.auth.signOut();
    } finally {
      localStorage.clear();
      window.location.replace('index.html');
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sheet.classList.contains('is-open')) closeSheet();
  });

  trigger.addEventListener('click', openSheet);

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

function enhanceDashboard() {
  if (currentPage() !== 'painel.html' || document.body.classList.contains('fsfit-dashboard-modern')) return;
  document.body.classList.add('fsfit-dashboard-modern');

  const overviewPanel = document.getElementById('dashboard-overview-panel');
  const summary = overviewPanel?.querySelector('.dashboard-overview-summary');
  const attention = overviewPanel?.querySelector('.attention-card');

  if (overviewPanel && summary && attention) {
    overviewPanel.insertBefore(attention, summary);
  }

  if (summary) {
    const cards = Array.from(summary.querySelectorAll('.dashboard-summary-card'));
    cards[0]?.classList.add('is-students');
    cards[1]?.classList.add('is-revenue');
    cards[2]?.classList.add('is-pending');

    if (!document.getElementById('summary-today-sessions')) {
      const todayCard = document.createElement('article');
      todayCard.className = 'card dashboard-summary-card is-today';
      todayCard.innerHTML = '<small>Atendimentos hoje</small><strong id="summary-today-sessions">—</strong>';
      if (cards[0]?.nextSibling) summary.insertBefore(todayCard, cards[0].nextSibling);
      else summary.appendChild(todayCard);
    }
  }

  const todayCount = document.getElementById('today-count');
  const todaySummary = document.getElementById('summary-today-sessions');
  const syncTodaySummary = () => {
    if (!todaySummary || !todayCount) return;
    todaySummary.textContent = todayCount.textContent.trim() || '—';
  };
  syncTodaySummary();
  if (todayCount && todaySummary) {
    new MutationObserver(syncTodaySummary).observe(todayCount, { childList:true, subtree:true, characterData:true });
  }

  const quickActionsTitle = overviewPanel?.querySelector('.quick-actions h2');
  if (quickActionsTitle) quickActionsTitle.textContent = 'Acesso rápido';

  const tabIcons = {
    overview: '⌂',
    agenda: '▦',
    live: '●'
  };
  document.querySelectorAll('[data-dashboard-tab]').forEach(tab => {
    if (tab.querySelector('.dashboard-tab-icon')) return;
    const icon = document.createElement('span');
    icon.className = 'dashboard-tab-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = tabIcons[tab.dataset.dashboardTab] || '•';
    tab.prepend(icon);
  });
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
        canReturnToSavedPanel = Boolean(
          saved &&
          Number.isFinite(Number(saved.y)) &&
          Date.now() - Number(saved.savedAt || 0) < 2 * 60 * 60 * 1000
        );
      } catch {
        canReturnToSavedPanel = false;
      }

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
  backLink.href = /^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))
    ? `agenda.html?data=${encodeURIComponent(date)}`
    : 'agenda.html';
}

export function renderHeader(active = '') {
  ensureMobileNavigationStylesheet();
  core.renderHeader(active);
  ensureMobileOverflowGuard();
  ensureSubscriptionMenuLink(active);
  normalizeHeaderLabels();
  ensureMobileBottomNav(active);
  enhanceDashboard();
  configureStudentRecordBackLink();
}

export async function setGreeting(session) {
  await core.setGreeting(session);

  const headerGreeting = document.querySelector('#user-greeting');
  const dashboardGreeting = document.querySelector('#dashboard-user-greeting');
  if (dashboardGreeting) {
    dashboardGreeting.textContent = headerGreeting?.textContent || '';
    dashboardGreeting.classList.toggle('hidden', !dashboardGreeting.textContent.trim());
  }
}

export async function requireSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    window.location.replace('index.html?login=1');
    return null;
  }

  try {
    await core.ensurePersonalProfile(session);
    const access = await core.getAccessStatus();

    if (access?.tipo_acesso === 'inativo' && !access?.admin) {
      document.body.innerHTML = `
        <main class="container" style="min-height:100vh;display:grid;place-items:center;padding:24px">
          <section class="card" style="width:min(520px,100%);text-align:center;padding:32px">
            <h1>Conta desativada</h1>
            <p style="margin:12px 0 22px;color:var(--muted)">Seu acesso ao FS Fit foi suspenso pela administração. Entre em contato com o suporte caso precise de ajuda.</p>
            <button id="inactive-account-logout" class="btn btn-primary" type="button">Voltar para o login</button>
          </section>
        </main>`;
      document.querySelector('#inactive-account-logout')?.addEventListener('click', async () => {
        await supabase.auth.signOut();
        localStorage.clear();
        window.location.replace('index.html');
      });
      return null;
    }

    if (!access?.acesso_premium && !FREE_ALLOWED_PAGES.has(currentPage())) {
      window.location.replace('painel.html?acesso=free');
      return null;
    }

    session.fsfitAccess = access;
  } catch (profileError) {
    console.error('Não foi possível preparar/verificar o perfil do personal:', profileError);
    throw new Error('Não foi possível verificar seu acesso. Atualize a página e tente novamente.');
  }

  return session;
}

if (currentPage() === 'ficha-aluno.html') {
  import('./ficha-treinos-salvos.js?v=20260718-workout-library1').catch(error => {
    console.error('Não foi possível carregar os treinos salvos na ficha do aluno:', error);
  });
  import('./iniciar-treino-personal.js?v=20260719-start-workout1').catch(error => {
    console.error('Não foi possível carregar a ação de iniciar treino do aluno:', error);
  });
}
