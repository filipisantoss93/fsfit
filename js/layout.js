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
