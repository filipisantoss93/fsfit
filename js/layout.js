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
  ensureSubscriptionMenuLink(active);
  normalizeHeaderLabels();
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
