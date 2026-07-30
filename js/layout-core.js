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
let accessPromise = null;
let accessPromiseAt = 0;
let accessPromiseUserId = null;
let coreSessionPromise = null;
let coreSessionUserId = null;
let notificationChannel = null;
let notificationChannelUserId = null;
let notificationRefreshTimer = null;
let headerCleanup = null;

function currentPage() {
  const page = window.location.pathname.split('/').pop();
  return page || 'index.html';
}

function accessCacheKey(userId) {
  return userId ? `${ACCESS_CACHE_KEY}:${userId}` : ACCESS_CACHE_KEY;
}

function clearFsFitStorage() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith('fsfit:')) localStorage.removeItem(key);
    }
  } catch {}

  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith('fsfit:')) sessionStorage.removeItem(key);
    }
  } catch {}
}

async function resetClientSessionState({ clearStorage = false } = {}) {
  if (notificationRefreshTimer) {
    clearTimeout(notificationRefreshTimer);
    notificationRefreshTimer = null;
  }
  if (notificationChannel) {
    try { await supabase.removeChannel(notificationChannel); } catch {}
  }
  notificationChannel = null;
  notificationChannelUserId = null;
  accessPromise = null;
  accessPromiseAt = 0;
  accessPromiseUserId = null;
  coreSessionPromise = null;
  coreSessionUserId = null;
  if (clearStorage) clearFsFitStorage();
}

async function signOutAndRedirect() {
  try {
    await supabase.auth.signOut();
  } finally {
    await resetClientSessionState({ clearStorage: true });
    window.location.replace('index.html');
  }
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

function icon(name) {
  const paths = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    dumbbell: '<path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/>',
    apple: '<path d="M12 7c-1.8-2.2-5.7-1.7-7.3.5C2.1 11 4.2 20 8.2 21c1.5.4 2.6-.7 3.8-.7s2.3 1.1 3.8.7c4-1 6.1-10 3.5-13.5C17.7 5.3 13.8 4.8 12 7Z"/><path d="M12 7c0-2.6 1.6-4.8 4-6"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    finance: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3h4a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10h.1v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
    logout: '<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M21 19V5a2 2 0 0 0-2-2h-6"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>'
  };
  return `<svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.home}</svg>`;
}

export function renderHeader(active = '') {
  const host = document.querySelector('#header-container');
  if (!host) return;

  headerCleanup?.();
  headerCleanup = null;

  host.innerHTML = `
    <header class="main-header">
      <nav class="nav-container" aria-label="Navegação principal">
        <a class="logo-nav" href="painel.html" aria-label="FS Fit — Início"><strong>FS</strong><span>Fit</span></a>
        <span id="user-greeting" class="user-greeting"></span>
        <ul id="nav-menu" class="nav-menu" aria-label="Menu principal">
          <li><a data-page="painel" href="painel.html">${icon('home')}<span>Início</span></a></li>
          <li><a data-page="alunos" href="alunos.html">${icon('users')}<span>Alunos</span></a></li>
          <li><a data-page="exercicios" href="biblioteca-exercicios.html">${icon('dumbbell')}<span>Exercícios</span></a></li>
          <li><a data-page="alimentacao" href="biblioteca-alimentar.html">${icon('apple')}<span>Alimentação</span></a></li>
          <li><a data-page="agenda" href="agenda.html">${icon('calendar')}<span>Agenda</span></a></li>
          <li><a data-page="financeiro" href="financeiro.html">${icon('finance')}<span>Financeiro</span></a></li>
          <li class="nav-divider" aria-hidden="true"></li>
          <li><a data-page="assinatura" href="assinatura.html">${icon('card')}<span>Assinatura</span></a></li>
          <li><a data-page="contato" href="contato.html">${icon('mail')}<span>Contato</span></a></li>
          <li id="admin-nav" class="hidden nav-admin-item"><a data-page="admin" href="admin.html">${icon('settings')}<span>Administração</span><span class="admin-support-nav-badge hidden" data-admin-support-badge>0</span></a></li>
        </ul>
        <div class="nav-footer">
          <a id="sidebar-profile" class="sidebar-profile" href="perfil.html" data-page="perfil">
            <span id="sidebar-profile-avatar" class="sidebar-profile-avatar" aria-hidden="true">PF</span>
            <span class="sidebar-profile-copy"><strong id="sidebar-profile-name">Personal</strong><small>Meu perfil</small></span>
            ${icon('chevron')}
          </a>
          <button id="logout-button" class="sidebar-logout" type="button">${icon('logout')}<span>Sair</span></button>
        </div>
        <div class="nav-header-actions">
          <div class="notification-shell">
            <button id="notification-button" class="notification-button" type="button" aria-label="Abrir notificações" aria-expanded="false" aria-controls="notification-panel">${icon('bell')}<span id="notification-badge" class="notification-badge hidden">0</span></button>
            <section id="notification-panel" class="notification-panel" aria-label="Notificações" hidden>
              <div class="notification-panel-header"><div><small>CENTRAL</small><strong>Notificações</strong></div><div class="notification-panel-actions"><button id="notification-mark-all" type="button" class="notification-mark-all hidden">Marcar todas como lidas</button><button id="notification-clear-all" type="button" class="notification-clear-all hidden">Limpar</button></div></div>
              <div id="notification-list" class="notification-list"><div class="notification-empty"><strong>Nenhuma notificação nova</strong><span>As atualizações dos seus alunos aparecerão aqui.</span></div></div>
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

  const handleDocumentClick = event => {
    if (!host.contains(event.target)) {
      setMenuOpen(false);
      setNotificationsOpen(false);
    }
  };

  const handleDocumentKeydown = event => {
    if (event.key === 'Escape') {
      setMenuOpen(false);
      setNotificationsOpen(false);
    }
  };

  const handleResize = () => {
    if (!window.matchMedia('(max-width: 860px)').matches) setMenuOpen(false);
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
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleDocumentKeydown);
  window.addEventListener('resize', handleResize);
  host.querySelector('#logout-button')?.addEventListener('click', signOutAndRedirect);

  headerCleanup = () => {
    document.removeEventListener('click', handleDocumentClick);
    document.removeEventListener('keydown', handleDocumentKeydown);
    window.removeEventListener('resize', handleResize);
    document.body.classList.remove('nav-menu-open');
  };
}

async function loadPersonalProfile(session) {
  if (!session?.user?.id) throw new Error('Sessão inválida.');

  const result = await withTimeout(
    supabase.from('perfis').select('id,nome').eq('id', session.user.id).maybeSingle(),
    5000,
    'Carregamento do perfil'
  );
  if (result?.error) throw result.error;
  if (!result?.data) {
    throw new Error('Perfil não encontrado. O provisionamento automático da conta não foi concluído.');
  }
  return result.data;
}

function readCachedAccess(userId) {
  if (!userId) return null;
  try {
    const cached = JSON.parse(sessionStorage.getItem(accessCacheKey(userId)) || 'null');
    if (cached?.userId === userId && cached?.value && Date.now() - Number(cached.savedAt || 0) < ACCESS_CACHE_MAX_AGE_MS) return cached.value;
  } catch {}
  return null;
}

export async function getAccessStatus(userId) {
  if (!userId) throw new Error('Sessão inválida.');
  const now = Date.now();
  if (accessPromise && accessPromiseUserId === userId && now - accessPromiseAt < 30000) return accessPromise;

  accessPromiseAt = now;
  accessPromiseUserId = userId;
  accessPromise = (async () => {
    try {
      const result = await withTimeout(supabase.rpc('fsfit_sincronizar_meu_acesso'), 5000, 'Verificação de acesso');
      if (result?.error) throw result.error;
      const access = result?.data || null;
      if (!access) throw new Error('Status de acesso indisponível.');
      try { sessionStorage.setItem(accessCacheKey(userId), JSON.stringify({ userId, value: access, savedAt: Date.now() })); } catch {}
      return access;
    } catch (error) {
      const cached = readCachedAccess(userId);
      if (cached) {
        console.warn('Verificação de acesso indisponível; usando último estado validado recente:', error);
        return { ...cached, cached: true };
      }
      console.error('Não foi possível validar o plano do usuário:', error);
      throw new Error('Não foi possível validar sua assinatura agora. Verifique sua conexão e tente novamente.');
    }
  })().finally(() => {
    window.setTimeout(() => {
      if (accessPromiseUserId === userId && Date.now() - accessPromiseAt >= 30000) {
        accessPromise = null;
        accessPromiseUserId = null;
      }
    }, 30000);
  });

  return accessPromise;
}

function renderInactiveAccount() {
  document.body.innerHTML = `
    <main class="container inactive-account-screen">
      <section class="card inactive-account-card">
        <h1>Conta desativada</h1>
        <p class="inactive-account-message">Seu acesso ao FS Fit foi suspenso pela administração. Entre em contato com o suporte caso precise de ajuda.</p>
        <button id="inactive-account-logout" class="btn btn-primary" type="button">Voltar para o login</button>
      </section>
    </main>`;
  document.querySelector('#inactive-account-logout')?.addEventListener('click', signOutAndRedirect);
}

async function prepareSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    await resetClientSessionState();
    window.location.replace('index.html?login=1');
    return null;
  }

  const userId = session.user.id;
  if (coreSessionUserId && coreSessionUserId !== userId) await resetClientSessionState();
  coreSessionUserId = userId;
  const profile = await loadPersonalProfile(session);
  const access = await getAccessStatus(userId);
  if (access?.tipo_acesso === 'inativo' && !access?.admin) {
    renderInactiveAccount();
    return null;
  }
  if (!access?.acesso_premium && !FREE_ALLOWED_PAGES.has(currentPage())) {
    window.location.replace('painel.html?acesso=free');
    return null;
  }
  session.fsfitProfile = profile;
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
    badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
    badge.classList.toggle('hidden', unreadCount === 0);
    markAll?.classList.toggle('hidden', unreadCount === 0);
    clearAll?.classList.toggle('hidden', notifications.length === 0);
    updateAdminSupportBadges(supportUnreadCount);

    list.innerHTML = notifications.length
      ? notifications.map(item => {
          const link = safeNotificationLink(item.link);
          const tag = link ? `a href="${escapeNotificationHtml(link)}"` : 'div';
          return `<${tag} class="notification-item ${item.lida ? '' : 'unread'}" data-notification-id="${item.id}"><span class="notification-dot" aria-hidden="true"></span><span class="notification-copy"><strong>${escapeNotificationHtml(item.titulo || 'Notificação')}</strong><span>${escapeNotificationHtml(item.mensagem || '')}</span><small>${escapeNotificationHtml(formatNotificationDate(item.created_at))}</small></span><span class="notification-chevron" aria-hidden="true">›</span></${link ? 'a' : 'div'}>`;
        }).join('')
      : '<div class="notification-empty"><strong>Nenhuma notificação nova</strong><span>As atualizações dos seus alunos aparecerão aqui.</span></div>';

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
    list.innerHTML = '<div class="notification-empty"><strong>Nenhuma notificação nova</strong><span>As atualizações dos seus alunos aparecerão aqui.</span></div>';
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
  const resolvedName = session.fsfitProfile?.nome?.trim()
    || session.user?.user_metadata?.full_name?.trim()
    || session.user?.user_metadata?.nome?.trim()
    || session.user?.email?.split('@')[0]
    || 'Personal';
  const text = `Olá, ${resolvedName}`;
  const headerGreeting = document.querySelector('#user-greeting');
  const dashboardGreeting = document.querySelector('#dashboard-user-greeting');
  const sidebarName = document.querySelector('#sidebar-profile-name');
  const sidebarAvatar = document.querySelector('#sidebar-profile-avatar');
  if (headerGreeting) headerGreeting.textContent = text;
  if (dashboardGreeting) {
    dashboardGreeting.textContent = text;
    dashboardGreeting.classList.remove('hidden');
  }
  if (sidebarName) sidebarName.textContent = resolvedName;
  if (sidebarAvatar) {
    const initials = resolvedName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'PF';
    const avatarUrl = session.user?.user_metadata?.avatar_url || session.user?.user_metadata?.picture || '';
    if (avatarUrl) {
      sidebarAvatar.style.backgroundImage = `url("${String(avatarUrl).replace(/"/g, '%22')}")`;
      sidebarAvatar.textContent = '';
      sidebarAvatar.classList.add('has-image');
    } else {
      sidebarAvatar.textContent = initials;
    }
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
  element.classList.remove('is-hiding');
  const hide = () => {
    const activeTimer = messageTimers.get(element);
    if (activeTimer) clearTimeout(activeTimer);
    messageTimers.delete(element);
    element.classList.add('is-hiding');
    setTimeout(() => {
      element.classList.remove('show', 'is-hiding');
      element.textContent = '';
    }, 230);
  };
  element.onclick = hide;
  const timer = setTimeout(hide, isError ? 6000 : 4000);
  messageTimers.set(element, timer);
}
