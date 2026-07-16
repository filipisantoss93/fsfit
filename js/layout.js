import { supabase } from './supabase.js';

const FREE_ALLOWED_PAGES = new Set([
  'painel.html',
  'perfil.html',
  'contato.html'
]);

const messageTimers = new WeakMap();

function currentPage() {
  const page = window.location.pathname.split('/').pop();
  return page || 'index.html';
}

export async function ensurePersonalProfile(session) {
  if (!session?.user?.id) throw new Error('Sessão inválida.');

  const { data: existing, error: selectError } = await supabase
    .from('perfis')
    .select('id,nome,tipo,ativo,plano,trial_inicio,trial_fim')
    .eq('id', session.user.id)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing;

  const fallbackName = session.user.user_metadata?.full_name?.trim()
    || session.user.email?.split('@')[0]
    || 'Personal';

  const trialInicio = new Date();
  const trialFim = new Date(trialInicio.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from('perfis')
    .insert({
      id: session.user.id,
      tipo: 'personal',
      nome: fallbackName,
      plano: 'trial',
      ativo: true,
      trial_inicio: trialInicio.toISOString(),
      trial_fim: trialFim.toISOString()
    })
    .select('id,nome,tipo,ativo,plano,trial_inicio,trial_fim')
    .single();

  if (error) throw error;
  return data;
}

export async function getAccessStatus() {
  const { data, error } = await supabase.rpc('fsfit_sincronizar_meu_acesso');
  if (error) throw error;
  return data;
}

export async function requireSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    window.location.replace('index.html?login=1');
    return null;
  }

  try {
    await ensurePersonalProfile(session);
    const access = await getAccessStatus();

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

export function renderHeader(active = '') {
  const host = document.querySelector('#header-container');
  if (!host) return;
  host.innerHTML = `
    <header class="main-header">
      <nav class="nav-container">
        <a class="logo-nav" href="painel.html"><strong>FS</strong><span>Fit</span></a>
        <span id="user-greeting" class="user-greeting"></span>
        <ul id="nav-menu" class="nav-menu">
          <li><a data-page="painel" href="painel.html">Início</a></li>
          <li><a data-page="alunos" href="alunos.html">Alunos</a></li>
          <li><a data-page="exercicios" href="biblioteca-exercicios.html">Exercícios</a></li>
          <li><a data-page="alimentacao" href="biblioteca-alimentar.html">Alimentação</a></li>
          <li><a data-page="agenda" href="agenda.html">Agenda</a></li>
          <li><a data-page="contato" href="contato.html">Contato</a></li>
          <li id="admin-support-nav" class="hidden"><a data-page="admin-suporte" href="admin-contatos.html">Suporte</a></li>
          <li><a data-page="perfil" href="perfil.html">Meu perfil</a></li>
          <li><button id="logout-button" class="logout" type="button">SAIR</button></li>
        </ul>
        <button id="menu-button" class="menu-mobile-btn" type="button" aria-label="Abrir menu">☰</button>
      </nav>
    </header>`;
  host.querySelector(`[data-page="${active}"]`)?.classList.add('active');
  host.querySelector('#menu-button')?.addEventListener('click', () => host.querySelector('#nav-menu')?.classList.toggle('active'));
  host.querySelector('#logout-button')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    window.location.replace('index.html');
  });
}

export async function setGreeting(session) {
  const target = document.querySelector('#user-greeting');
  if (!target || !session) return;
  const [{ data: profile }, { data: admin }] = await Promise.all([
    supabase.from('perfis').select('nome').eq('id', session.user.id).maybeSingle(),
    supabase.from('platform_admins').select('user_id').eq('user_id', session.user.id).maybeSingle()
  ]);
  const name = profile?.nome?.trim() || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Personal';
  target.textContent = `Olá, ${name}`;
  if (admin) document.querySelector('#admin-support-nav')?.classList.remove('hidden');
}

export function showMessage(element, text, type = 'success') {
  if (!element || !text) return;

  const previousTimer = messageTimers.get(element);
  if (previousTimer) clearTimeout(previousTimer);

  const isError = type === 'error';
  element.textContent = text;
  element.className = `message show ${type}`;
  element.setAttribute('role', isError ? 'alert' : 'status');
  element.setAttribute('aria-live', isError ? 'assertive' : 'polite');

  Object.assign(element.style, {
    position: 'fixed',
    top: 'calc(92px + env(safe-area-inset-top, 0px))',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    zIndex: '10000',
    width: 'min(520px, calc(100vw - 32px))',
    maxWidth: 'calc(100vw - 32px)',
    margin: '0',
    padding: '14px 18px',
    borderRadius: '14px',
    transform: 'translate(-50%, 0)',
    boxShadow: '0 18px 50px rgba(0, 0, 0, .45)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    cursor: 'pointer',
    opacity: '1',
    transition: 'opacity .22s ease, transform .22s ease',
    background: isError ? 'rgba(68, 30, 34, .96)' : 'rgba(24, 66, 35, .96)',
    border: isError ? '1px solid rgba(255, 90, 95, .62)' : '1px solid rgba(50, 215, 75, .58)',
    color: isError ? '#ffd1d3' : '#d7ffdd'
  });

  const hide = () => {
    const activeTimer = messageTimers.get(element);
    if (activeTimer) clearTimeout(activeTimer);
    messageTimers.delete(element);
    element.style.opacity = '0';
    element.style.transform = 'translate(-50%, -10px)';
    setTimeout(() => {
      element.classList.remove('show');
      element.textContent = '';
    }, 230);
  };

  element.onclick = hide;
  const timer = setTimeout(hide, isError ? 6000 : 4000);
  messageTimers.set(element, timer);
}