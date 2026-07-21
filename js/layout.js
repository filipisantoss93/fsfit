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

function ensureModernUiStyles() {
  if (document.querySelector('style[data-fsfit-modern-ui]')) return;
  const style = document.createElement('style');
  style.dataset.fsfitModernUi = 'true';
  style.textContent = `
    :root{
      --fsfit-nav-height:68px;
      --fsfit-glass:rgba(20,23,29,.9);
    }
    .card{
      transition:border-color .18s ease,box-shadow .18s ease,background .18s ease;
    }
    .btn{
      -webkit-tap-highlight-color:transparent;
    }
    .btn-primary{
      box-shadow:0 10px 26px rgba(50,215,75,.14);
    }
    .btn-primary:active,.btn-secondary:active,.btn-outline:active,.btn-neutral:active{
      transform:scale(.985);
    }
    .nav-menu a,.nav-menu button{
      transition:background .18s ease,color .18s ease,border-color .18s ease;
    }
    .fsfit-bottom-nav{display:none}

    body.fsfit-dashboard-modern .page-header{
      margin-bottom:18px;
    }
    body.fsfit-dashboard-modern .page-header h1{
      letter-spacing:-.045em;
    }
    body.fsfit-dashboard-modern .dashboard-tabs{
      margin-bottom:18px;
      border-color:rgba(255,255,255,.09);
      background:rgba(26,29,35,.72);
      box-shadow:0 8px 24px rgba(0,0,0,.16);
      backdrop-filter:blur(14px);
      -webkit-backdrop-filter:blur(14px);
    }
    body.fsfit-dashboard-modern .dashboard-tab-icon{
      display:inline-grid;
      place-items:center;
      min-width:18px;
      color:inherit;
      font-size:.9rem;
      line-height:1;
    }
    body.fsfit-dashboard-modern .dashboard-overview-summary{
      grid-template-columns:repeat(4,minmax(0,1fr));
      gap:10px;
      margin-bottom:18px;
    }
    body.fsfit-dashboard-modern .dashboard-summary-card{
      position:relative;
      overflow:hidden;
      min-height:108px;
      padding:17px;
      border-top-width:1px!important;
      box-shadow:none;
    }
    body.fsfit-dashboard-modern .dashboard-summary-card::before{
      content:'';
      position:absolute;
      top:0;
      left:0;
      right:0;
      height:3px;
      background:var(--summary-accent,var(--primary));
    }
    body.fsfit-dashboard-modern .dashboard-summary-card.is-students{--summary-accent:var(--primary)}
    body.fsfit-dashboard-modern .dashboard-summary-card.is-today{--summary-accent:var(--secondary)}
    body.fsfit-dashboard-modern .dashboard-summary-card.is-revenue{--summary-accent:#7ddc8d}
    body.fsfit-dashboard-modern .dashboard-summary-card.is-pending{--summary-accent:var(--warning)}
    body.fsfit-dashboard-modern .dashboard-summary-card small{
      min-height:0;
      margin-bottom:10px;
      font-size:.69rem;
      letter-spacing:.01em;
    }
    body.fsfit-dashboard-modern .dashboard-summary-card strong{
      font-size:1.35rem;
    }
    body.fsfit-dashboard-modern .attention-card{
      position:relative;
      margin-bottom:16px;
      padding:20px;
      overflow:hidden;
      border-color:rgba(255,193,7,.2);
      background:linear-gradient(135deg,rgba(255,193,7,.055),rgba(26,29,35,.96) 42%);
      box-shadow:0 14px 38px rgba(0,0,0,.22);
    }
    body.fsfit-dashboard-modern .attention-card::before{
      content:'';
      position:absolute;
      top:0;
      left:0;
      bottom:0;
      width:3px;
      background:var(--warning);
    }
    body.fsfit-dashboard-modern .attention-card h2{
      margin-bottom:4px;
    }
    body.fsfit-dashboard-modern .attention-list{
      grid-template-columns:repeat(2,minmax(0,1fr));
    }
    body.fsfit-dashboard-modern .attention-item{
      min-height:66px;
      background:rgba(37,42,51,.72);
      transition:border-color .18s ease,background .18s ease,transform .18s ease;
    }
    body.fsfit-dashboard-modern a.attention-item:hover{
      transform:translateY(-1px);
      border-color:rgba(255,255,255,.18);
      background:rgba(43,49,59,.92);
    }
    body.fsfit-dashboard-modern .quick-actions{
      margin:18px 0;
    }
    body.fsfit-dashboard-modern .quick-actions h2{
      margin-bottom:10px;
    }
    body.fsfit-dashboard-modern .quick-actions-grid{
      grid-template-columns:repeat(5,minmax(0,1fr));
      gap:9px;
    }
    body.fsfit-dashboard-modern .quick-action{
      position:relative;
      min-height:84px;
      justify-content:center;
      padding:14px 34px 14px 14px;
      border-color:rgba(255,255,255,.08);
      background:rgba(26,29,35,.74);
    }
    body.fsfit-dashboard-modern .quick-action::after{
      content:'›';
      position:absolute;
      right:13px;
      top:50%;
      transform:translateY(-50%);
      color:#667080;
      font-size:1.35rem;
      line-height:1;
    }
    body.fsfit-dashboard-modern .quick-action:hover{
      transform:translateY(-1px);
      border-color:rgba(59,130,246,.42);
      background:rgba(37,42,51,.85);
    }
    body.fsfit-dashboard-modern .quick-action strong{
      font-size:.86rem;
    }
    body.fsfit-dashboard-modern .quick-action small{
      font-size:.69rem;
    }
    body.fsfit-dashboard-modern .dashboard-public-link-compact,
    body.fsfit-dashboard-modern .dashboard-activity-card{
      box-shadow:none;
      border-color:rgba(255,255,255,.08);
    }

    @media(max-width:860px){
      body{
        padding-bottom:calc(var(--fsfit-nav-height) + env(safe-area-inset-bottom,0px) + 12px);
      }
      .fsfit-bottom-nav{
        position:fixed;
        z-index:140;
        left:10px;
        right:10px;
        bottom:calc(8px + env(safe-area-inset-bottom,0px));
        display:grid;
        grid-template-columns:repeat(5,minmax(0,1fr));
        min-height:var(--fsfit-nav-height);
        padding:7px;
        border:1px solid rgba(255,255,255,.1);
        border-radius:18px;
        background:var(--fsfit-glass);
        box-shadow:0 18px 50px rgba(0,0,0,.45);
        backdrop-filter:blur(18px) saturate(1.25);
        -webkit-backdrop-filter:blur(18px) saturate(1.25);
      }
      .fsfit-bottom-nav a,.fsfit-bottom-nav button{
        position:relative;
        display:flex;
        min-width:0;
        min-height:52px;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:3px;
        padding:5px 2px;
        border:0;
        border-radius:12px;
        background:transparent;
        color:#8f99a8;
        font:inherit;
        font-size:.63rem;
        font-weight:800;
        line-height:1.05;
        cursor:pointer;
        -webkit-tap-highlight-color:transparent;
      }
      .fsfit-bottom-nav a span,.fsfit-bottom-nav button span{
        display:grid;
        place-items:center;
        min-height:20px;
        color:inherit;
        font-size:1.12rem;
        font-weight:900;
        line-height:1;
      }
      .fsfit-bottom-nav a.active,.fsfit-bottom-nav button.active{
        background:rgba(50,215,75,.11);
        color:var(--primary);
      }
      .fsfit-bottom-nav a.active::after,.fsfit-bottom-nav button.active::after{
        content:'';
        position:absolute;
        top:3px;
        width:18px;
        height:2px;
        border-radius:999px;
        background:var(--primary);
      }
      .main-header{
        backdrop-filter:blur(18px);
        -webkit-backdrop-filter:blur(18px);
      }
      body.fsfit-dashboard-modern .dashboard-overview-summary{
        grid-template-columns:repeat(2,minmax(0,1fr));
      }
      body.fsfit-dashboard-modern .attention-list{
        grid-template-columns:1fr;
      }
      body.fsfit-dashboard-modern .quick-actions-grid{
        grid-template-columns:repeat(2,minmax(0,1fr));
      }
    }

    @media(max-width:620px){
      body.fsfit-dashboard-modern .page-header{
        align-items:stretch;
        gap:14px;
      }
      body.fsfit-dashboard-modern #new-student-button{
        width:100%;
      }
      body.fsfit-dashboard-modern .dashboard-tabs{
        position:sticky;
        top:calc(8px + env(safe-area-inset-top,0px));
        z-index:35;
      }
      body.fsfit-dashboard-modern .dashboard-summary-card{
        min-height:96px;
        padding:14px 12px;
      }
      body.fsfit-dashboard-modern .dashboard-summary-card strong{
        font-size:1.18rem;
      }
      body.fsfit-dashboard-modern .attention-card{
        padding:17px;
      }
      body.fsfit-dashboard-modern .quick-actions-grid{
        grid-template-columns:1fr;
        gap:8px;
      }
      body.fsfit-dashboard-modern .quick-action{
        min-height:68px;
        padding:12px 38px 12px 14px;
      }
      body.fsfit-dashboard-modern .quick-action strong{
        font-size:.88rem;
      }
      body.fsfit-dashboard-modern .quick-action small{
        font-size:.7rem;
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
  if (!primaryPages.has(inferredActive)) moreButton.classList.add('active');
  moreButton.addEventListener('click', () => {
    const menu = document.querySelector('#nav-menu');
    if (!menu) return;
    const isOpen = menu.classList.toggle('active');
    moreButton.setAttribute('aria-expanded', String(isOpen));
  });
  nav.appendChild(moreButton);

  document.body.appendChild(nav);
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
  core.renderHeader(active);
  ensureMobileOverflowGuard();
  ensureModernUiStyles();
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
