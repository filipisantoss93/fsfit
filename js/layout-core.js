import { supabase } from './supabase.js';

const ACCESS_CACHE_KEY = 'fsfit:access-status-cache';
const ACCESS_CACHE_MAX_AGE_MS = 15 * 60 * 1000;
const FREE_ALLOWED_PAGES = new Set([
  'painel.html',
  'perfil.html',
  'contato.html',
  'assinatura.html',
  'admin.html',
  'admin-contatos.html'
]);

const messageTimers = new WeakMap();
let lastProfile = null;
let profilePromise = null;
let profilePromiseUserId = null;
let accessPromise = null;
let accessPromiseAt = 0;
let coreSessionPromise = null;
let notificationChannel = null;
let notificationChannelUserId = null;
let notificationRefreshTimer = null;

function currentPage() {
  const page = window.location.pathname.split('/').pop();
  return page || 'index.html';
}

if (currentPage() !== 'ficha-aluno.html') {
  import('./mobile-experience.js?v=20260721-mobile-polish1').catch(() => undefined);
  import('./mobile-experience-fixes.js?v=20260721-mobile-polish2').catch(() => undefined);
}

function withTimeout(promise, ms, label) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(`${label} excedeu o tempo limite.`)), ms);
    })
  ]).finally(() => {
    if (timer) window.clearTimeout(timer);
  });
}

function ensureHeaderStyles() {
  if (document.querySelector('link[data-fsfit-header-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/header-menu.css?v=20260717-support2';
  link.dataset.fsfitHeaderStyles = 'true';
  document.head.appendChild(link);
}

export function renderHeader(active = '') {
  ensureHeaderStyles();
  const host = document.querySelector('#header-container');
  if (!host) return;

  host.innerHTML = `
    <header class="main-header">
      <nav class="nav-container" aria-label="Navegação principal">
        <a class="logo-nav" href="painel.html" aria-label="FS Fit — Início"><strong>FS</strong><span>Fit</span></a>
        <span id="user-greeting" class="user-greeting"></span>
        <ul id="nav-menu" class="nav-menu" aria-label="Menu principal">
          <li><a data-page="painel" href="painel.html">Início</a></li>
          <li><a data-page="alunos" href="alunos.html">Alunos</a></li>
          <li><a data-page="exercicios" href="biblioteca-exercicios.html">Exercícios</a></li>
          <li><a data-page="alimentacao" href="biblioteca-alimentar.html">Alimentação</a></li>
          <li><a data-page="agenda" href="agenda.html">Agenda</a></li>
          <li><a data-page="financeiro" href="financeiro.html">Financeiro</a></li>
          <li class="nav-divider" aria-hidden="true"></li>
          <li><a data-page="perfil" href="perfil.html">Perfil</a></li>
          <li><a data-page="assinatura" href="assinatura.html">Assinatura</a></li>
          <li><a data-page="contato" href="contato.html">Contato</a></li>
          <li id="admin-nav" class="hidden nav-admin-item"><a data-page="admin" href="admin.html"><span aria-hidden="true">⚙</span><span>Administração</span><span class="admin-support-nav-badge hidden" data-admin-support-badge>0</span></a></li>
          <li class="nav-divider" aria-hidden="true"></li>
          <li><button id="logout-button" class="logout" type="button">SAIR</button></li>
        </ul>
        <div class="nav-header-actions">
          <div class="notification-shell">
            <button id="notification-button" class="notification-button" type="button" aria-label="Abrir notificações" aria-expanded="false" aria-controls="notification-panel"><span class="notification-bell" aria-hidden="true">🔔</span><span id="notification-badge" class="notification-badge hidden">0</span></button>
            <section id="notification-panel" class="notification-panel" aria-label="Notificações" hidden>
              <div class="notification-panel-header"><div><small>CENTRAL</small><strong>Notificações</strong></div><div class="notification-panel-actions"><button id="notification-mark-all" type="button" class="notification-mark-all hidden">Marcar todas como lidas</button><button id="notification-clear-all" type="button" class="notification-clear-all hidden">Limpar notificações</button></div></div>
              <div id="notification-list" class="notification-list"><p class="notification-empty">Nenhuma notificação.</p></div>
            </section>
          </div>
          <button id="menu-button" class="menu-mobile-btn" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="nav-menu">☰</button>
        </div>
      </nav>
    </header>`;

  const menu = host.querySelector('#nav-menu');
  const menuButton = host.querySelector('#menu-button');
  const notificationButton = host.querySelector('#notification-button');
  const notificationPanel = host.querySelector('#notification-panel');
  host.querySelector(`[data-page="${active}"]`)?.classList.add('active');

  const setMenuOpen = open => {
    menu?.classList.toggle('active', open);
    menuButton?.setAttribute('aria-expanded', String(open));
    menuButton?.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    document.body.classList.toggle('nav-menu-open', open && window.matchMedia('(max-width: 860px)').matches);
  };

  const setNotificationsOpen = open => {
    if (!notificationPanel || !notificationButton) return;
    notificationPanel.hidden = !open;
    notificationButton.setAttribute('aria-expanded', String(open));
  };

  menuButton?.addEventListener('click', event => {
    event.stopPropagation();
    setNotificationsOpen(false);
    setMenuOpen(!menu?.classList.contains('active'));
  });

  notificationButton?.addEventListener('click', event => {
    event.stopPropagation();
    setMenuOpen(false);
    setNotificationsOpen(notificationPanel?.hidden ?? true);
  });

  menu?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenuOpen(false)));

  document.addEventListener('click', event => {
    if (!host.contains(event.target)) {
      setMenuOpen(false);
      setNotificationsOpen(false);
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      setMenuOpen(false);
      setNotificationsOpen(false);
    }
  });

  window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width: 860px)').matches) setMenuOpen(false);
  });

  host.querySelector('#logout-button')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    sessionStorage.removeItem(ACCESS_CACHE_KEY);
    window.location.replace('index.html');
  });
}

async function preparePersonalProfile(session) {
  if (!session?.user?.id) throw new Error('Sessão inválida.');

  const result = await withTimeout(
    supabase.from('perfis').select('id,nome,tipo,ativo,plano,trial_inicio,trial_fim').eq('id', session.user.id).maybeSingle(),
    5000,
    'Carregamento do perfil'
  );
  if (result?.error) throw result.error;
  if (result?.data) {
    lastProfile = result.data;
    return result.data;
  }

  const fallbackName = session.user.user_metadata?.full_name?.trim()
    || session.user.user_metadata?.nome?.trim()
    || session.user.email?.split('@')[0]
    || 'Personal';
  const trialInicio = new Date();
  const trialFim = new Date(trialInicio.getTime() + 7 * 24 * 60 * 60 * 1000);
  const insertResult = await withTimeout(
    supabase.from('perfis').insert({
      id: session.user.id,
      tipo: 'personal',
      nome: fallbackName,
      plano: 'trial',
      ativo: true,
      trial_inicio: trialInicio.toISOString(),
      trial_fim: trialFim.toISOString()
    }).select('id,nome,tipo,ativo,plano,trial_inicio,trial_fim').single(),
    5000,
    'Criação do perfil'
  );
  if (insertResult?.error) throw insertResult.error;
  lastProfile = insertResult?.data || null;
  return lastProfile;
}

export function ensurePersonalProfile(session) {
  const userId = session?.user?.id || null;
  if (!userId) return Promise.reject(new Error('Sessão inválida.'));
  if (!profilePromise || profilePromiseUserId !== userId) {
    profilePromiseUserId = userId;
    profilePromise = preparePersonalProfile(session).catch(error => {
      profilePromise = null;
      throw error;
    });
  }
  return profilePromise;
}

function readCachedAccess() {
  try {
    const cached = JSON.parse(sessionStorage.getItem(ACCESS_CACHE_KEY) || 'null');
    if (cached?.value && Date.now() - Number(cached.savedAt || 0) < ACCESS_CACHE_MAX_AGE_MS) return cached.value;
  } catch {}
  return null;
}

export async function getAccessStatus() {
  const now = Date.now();
  if (accessPromise && now - accessPromiseAt < 30000) return accessPromise;

  accessPromiseAt = now;
  accessPromise = (async () => {
    try {
      const result = await withTimeout(supabase.rpc('fsfit_sincronizar_meu_acesso'), 5000, 'Verificação de acesso');
      if (result?.error) throw result.error;
      const access = result?.data || null;
      if (!access) throw new Error('Status de acesso indisponível.');
      try { sessionStorage.setItem(ACCESS_CACHE_KEY, JSON.stringify({ value: access, savedAt: Date.now() })); } catch {}
      return access;
    } catch (error) {
      const cached = readCachedAccess();
      if (cached) {
        console.warn('Verificação de acesso indisponível; usando último estado validado recente:', error);
        return { ...cached, cached: true };
      }
      console.error('Não foi possível validar o plano do usuário:', error);
      throw new Error('Não foi possível validar sua assinatura agora. Verifique sua conexão e tente novamente.');
    }
  })().finally(() => {
    window.setTimeout(() => {
      if (Date.now() - accessPromiseAt >= 30000) accessPromise = null;
    }, 30000);
  });

  return accessPromise;
}

function renderInactiveAccount() {
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
    sessionStorage.removeItem(ACCESS_CACHE_KEY);
    window.location.replace('index.html');
  });
}

async function prepareSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    window.location.replace('index.html?login=1');
    return null;
  }

  await ensurePersonalProfile(session);
  const access = await getAccessStatus();
  if (access?.tipo_acesso === 'inativo' && !access?.admin) {
    renderInactiveAccount();
    return null;
  }
  if (!access?.acesso_premium && !FREE_ALLOWED_PAGES.has(currentPage())) {
    window.location.replace('painel.html?acesso=free');
    return null;
  }
  session.fsfitAccess = access;
  return session;
}

export function requireSession() {
  if (!coreSessionPromise) {
    coreSessionPromise = prepareSession().catch(error => {
      coreSessionPromise = null;
      throw error;
    });
  }
  return coreSessionPromise;
}

function escapeNotificationHtml(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function formatNotificationDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function safeNotificationLink(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value), window.location.origin);
    if (url.origin !== window.location.origin) return '';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '';
  }
}

function updateAdminSupportBadges(count) {
  const value = Number(count || 0);
  document.querySelectorAll('[data-admin-support-badge]').forEach(badge => {
    badge.textContent = value > 99 ? '99+' : String(value);
    badge.classList.toggle('hidden', value === 0);
    badge.setAttribute('aria-label', `${value} ${value === 1 ? 'notificação' : 'notificações'} de suporte`);
  });
}

function scheduleNotificationRefresh(session) {
  if (notificationRefreshTimer) clearTimeout(notificationRefreshTimer);
  notificationRefreshTimer = setTimeout(() => {
    notificationRefreshTimer = null;
    loadNotifications(session).catch(error => console.error('Não foi possível atualizar as notificações:', error));
  }, 120);
}

async function loadNotifications(session) {
  const badge = document.querySelector('#notification-badge');
  const list = document.querySelector('#notification-list');
  const markAll = document.querySelector('#notification-mark-all');
  const clearAll = document.querySelector('#notification-clear-all');
  if (!badge || !list || !session?.user?.id) return;

  try {
    const [notificationsResult, unreadResult, supportUnreadResult] = await Promise.all([
      supabase.from('notificacoes').select('id,titulo,mensagem,link,lida,created_at').eq('destinatario_id', session.user.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('notificacoes').select('id', { count: 'exact', head: true }).eq('destinatario_id', session.user.id).eq('lida', false),
      supabase.from('notificacoes').select('id', { count: 'exact', head: true }).eq('destinatario_id', session.user.id).eq('lida', false).in('tipo', ['suporte_novo', 'suporte_resposta'])
    ]);
    if (notificationsResult.error) throw notificationsResult.error;
    if (unreadResult.error) throw unreadResult.error;
    if (supportUnreadResult.error) throw supportUnreadResult.error;

    const notifications = notificationsResult.data || [];
    const unreadCount = Number(unreadResult.count || 0);
    const supportUnreadCount = Number(supportUnreadResult.count || 0);
    badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    badge.classList.toggle('hidden', unreadCount === 0);
    markAll?.classList.toggle('hidden', unreadCount === 0);
    clearAll?.classList.toggle('hidden', notifications.length === 0);
    updateAdminSupportBadges(supportUnreadCount);

    list.innerHTML = notifications.length
      ? notifications.map(item => {
          const link = safeNotificationLink(item.link);
          const tag = link ? `a href="${escapeNotificationHtml(link)}"` : 'div';
          return `<${tag} class="notification-item ${item.lida ? '' : 'unread'}" data-notification-id="${item.id}"><span class="notification-dot" aria-hidden="true"></span><span class="notification-copy"><strong>${escapeNotificationHtml(item.titulo || 'Notificação')}</strong><span>${escapeNotificationHtml(item.mensagem || '')}</span><small>${escapeNotificationHtml(formatNotificationDate(item.created_at))}</small></span></${link ? 'a' : 'div'}>`;
        }).join('')
      : '<p class="notification-empty">Nenhuma notificação.</p>';

    list.querySelectorAll('[data-notification-id]').forEach(item => {
      item.addEventListener('click', async event => {
        if (!item.classList.contains('unread')) return;
        const targetLink = item.tagName === 'A' ? item.getAttribute('href') : '';
        if (targetLink) event.preventDefault();
        try {
          const { error: updateError } = await supabase.from('notificacoes').update({ lida: true, lida_em: new Date().toISOString() }).eq('id', item.dataset.notificationId).eq('destinatario_id', session.user.id);
          if (updateError) throw updateError;
          await loadNotifications(session);
        } finally {
          if (targetLink) window.location.assign(targetLink);
        }
      });
    });

    if (markAll) markAll.onclick = async () => {
      markAll.disabled = true;
      try {
        const { error } = await supabase.from('notificacoes').update({ lida: true, lida_em: new Date().toISOString() }).eq('destinatario_id', session.user.id).eq('lida', false);
        if (error) throw error;
        await loadNotifications(session);
      } finally {
        markAll.disabled = false;
      }
    };

    if (clearAll) clearAll.onclick = async () => {
      if (!window.confirm('Apagar todas as suas notificações? Esta ação não pode ser desfeita.')) return;
      clearAll.disabled = true;
      try {
        const { error } = await supabase.from('notificacoes').delete().eq('destinatario_id', session.user.id);
        if (error) throw error;
        await loadNotifications(session);
      } finally {
        clearAll.disabled = false;
      }
    };
  } catch (error) {
    console.info('Central de notificações indisponível:', error?.message || error);
    badge.classList.add('hidden');
    markAll?.classList.add('hidden');
    clearAll?.classList.add('hidden');
    updateAdminSupportBadges(0);
    list.innerHTML = '<p class="notification-empty">Nenhuma notificação.</p>';
  }
}

async function setupNotificationRealtime(session) {
  const userId = session?.user?.id;
  if (!userId || notificationChannelUserId === userId) return;
  if (notificationChannel) {
    await supabase.removeChannel(notificationChannel);
    notificationChannel = null;
  }

  notificationChannelUserId = userId;
  const filter = `destinatario_id=eq.${userId}`;
  notificationChannel = supabase
    .channel(`fsfit-notificacoes-${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter }, () => scheduleNotificationRefresh(session))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notificacoes', filter }, () => scheduleNotificationRefresh(session))
    .subscribe();

  window.addEventListener('beforeunload', () => {
    if (notificationChannel) supabase.removeChannel(notificationChannel);
  }, { once: true });
}

export async function setGreeting(session) {
  if (!session) return;
  const resolvedName = lastProfile?.nome?.trim()
    || session.user?.user_metadata?.full_name?.trim()
    || session.user?.user_metadata?.nome?.trim()
    || session.user?.email?.split('@')[0]
    || 'Personal';
  const text = `Olá, ${resolvedName}`;
  const headerGreeting = document.querySelector('#user-greeting');
  const dashboardGreeting = document.querySelector('#dashboard-user-greeting');
  if (headerGreeting) headerGreeting.textContent = text;
  if (dashboardGreeting) {
    dashboardGreeting.textContent = text;
    dashboardGreeting.classList.remove('hidden');
  }

  try {
    const { data: admin } = await supabase.from('platform_admins').select('user_id').eq('user_id', session.user.id).maybeSingle();
    if (admin) document.querySelector('#admin-nav')?.classList.remove('hidden');
  } catch (error) {
    console.warn('Não foi possível verificar o menu administrativo:', error);
  }

  if (currentPage() === 'ficha-aluno.html') return;
  await loadNotifications(session);
  await setupNotificationRealtime(session);
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
    boxShadow: '0 18px 50px rgba(0,0,0,.45)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    cursor: 'pointer',
    opacity: '1',
    transition: 'opacity .22s ease, transform .22s ease',
    background: isError ? 'rgba(68,30,34,.96)' : 'rgba(24,66,35,.96)',
    border: isError ? '1px solid rgba(255,90,95,.62)' : '1px solid rgba(50,215,75,.58)',
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