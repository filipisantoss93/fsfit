import { supabase } from './supabase.js';

const LOADING_SELECTOR = 'p, td, .empty, .dashboard-empty, [data-loading]';
const NOTIFICATION_EMPTY_HTML = '<div class="notification-empty"><strong>Nenhuma notificação nova</strong><span>As atualizações dos seus alunos aparecerão aqui.</span></div>';
let notificationDeleteChannel = null;
let notificationDeleteUserId = null;
let notificationReconnectTimer = null;
let notificationRefreshTimer = null;
let notificationActionPending = false;
let cleanupRegistered = false;

function ensureFixStyles() {
  if (document.querySelector('link[data-fsfit-mobile-experience-fixes]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/mobile-experience-fixes.css?v=20260721-mobile-polish2';
  link.dataset.fsfitMobileExperienceFixes = 'true';
  document.head.appendChild(link);
}

function syncLoadingElement(element) {
  if (!(element instanceof Element)) return;
  const elements = [];
  if (element.matches?.(LOADING_SELECTOR)) elements.push(element);
  elements.push(...(element.querySelectorAll?.(LOADING_SELECTOR) || []));

  elements.forEach(item => {
    const text = item.textContent?.trim() || '';
    const loading = /^(carregando|aguarde)(\.{0,3}|\s.+)?$/i.test(text) && text.length < 80;
    item.classList.toggle('fsfit-loading-placeholder', loading);
  });
}

function setupSkeletonCleanup() {
  syncLoadingElement(document.body);
  const observer = new MutationObserver(records => {
    records.forEach(record => {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target) syncLoadingElement(target);
      record.addedNodes.forEach(node => {
        if (node instanceof Element) syncLoadingElement(node);
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function syncToastMessages(root = document) {
  const messages = [];
  if (root instanceof Element && root.matches('.message')) messages.push(root);
  messages.push(...(root.querySelectorAll?.('.message') || []));

  messages.forEach(message => {
    if (message.id === 'access-notice') return;
    message.classList.toggle('fsfit-toast-message', message.classList.contains('show'));
  });
}

function setupToastMessages() {
  syncToastMessages();
  const observer = new MutationObserver(records => {
    records.forEach(record => {
      if (record.target instanceof Element) syncToastMessages(record.target);
      record.addedNodes.forEach(node => {
        if (node instanceof Element) syncToastMessages(node);
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}

function isIos() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function showIosInstallHelp() {
  document.querySelector('.fsfit-install-help')?.remove();
  const modal = document.createElement('div');
  modal.className = 'fsfit-install-help';
  modal.innerHTML = `
    <section class="fsfit-install-help-card" role="dialog" aria-modal="true" aria-label="Instalar FS Fit no iPhone">
      <h2>Adicionar FS Fit à Tela de Início</h2>
      <p>No iPhone, a instalação é feita pelo menu de compartilhamento do Safari.</p>
      <ol class="fsfit-install-steps">
        <li>1. Toque no botão <strong>Compartilhar</strong> do Safari.</li>
        <li>2. Escolha <strong>Adicionar à Tela de Início</strong>.</li>
        <li>3. Confirme em <strong>Adicionar</strong>.</li>
      </ol>
      <button class="btn btn-primary" type="button" data-close-install-help>Entendi</button>
    </section>`;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('[data-close-install-help]')?.addEventListener('click', close);
  modal.addEventListener('click', event => {
    if (event.target === modal) close();
  });
}

function injectIosInstallAction() {
  if (!isIos() || isStandalone() || document.querySelector('[data-fsfit-install-app], [data-fsfit-ios-install]')) return;
  const list = document.querySelector('.fsfit-more-list');
  if (!list) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fsfit-more-item fsfit-install-item';
  button.dataset.fsfitIosInstall = 'true';
  button.innerHTML = `
    <span class="fsfit-more-item-icon" aria-hidden="true">↓</span>
    <span class="fsfit-more-item-copy"><strong>Instalar FS Fit</strong><small>Adicionar à Tela de Início do iPhone</small></span>
    <span class="fsfit-more-item-chevron" aria-hidden="true">›</span>`;
  list.insertBefore(button, list.lastElementChild);
  button.addEventListener('click', showIosInstallHelp);
}

function setupIosInstallAction() {
  injectIosInstallAction();
  if (!isIos() || isStandalone()) return;
  const observer = new MutationObserver(injectIosInstallAction);
  observer.observe(document.body, { childList: true, subtree: true });
}

function notificationElements() {
  return {
    badge: document.querySelector('#notification-badge'),
    list: document.querySelector('#notification-list'),
    markAll: document.querySelector('#notification-mark-all'),
    clearAll: document.querySelector('#notification-clear-all')
  };
}

function setNotificationBusy(busy) {
  notificationActionPending = busy;
  const { markAll, clearAll } = notificationElements();
  if (markAll) markAll.disabled = busy;
  if (clearAll) clearAll.disabled = busy;
}

function decrementNotificationBadge() {
  const { badge, markAll } = notificationElements();
  if (!badge) return;
  const current = Number.parseInt(badge.textContent || '0', 10);
  const next = Number.isFinite(current) ? Math.max(0, current - 1) : 0;
  badge.textContent = next > 9 ? '9+' : String(next);
  badge.classList.toggle('hidden', next === 0);
  markAll?.classList.toggle('hidden', next === 0);
}

function clearNotificationUi() {
  const { badge, list, markAll, clearAll } = notificationElements();
  if (badge) {
    badge.textContent = '0';
    badge.classList.add('hidden');
  }
  markAll?.classList.add('hidden');
  clearAll?.classList.add('hidden');
  if (list) list.innerHTML = NOTIFICATION_EMPTY_HTML;
  document.querySelectorAll('[data-admin-support-badge]').forEach(item => {
    item.textContent = '0';
    item.classList.add('hidden');
  });
}

function scheduleNotificationPageRefresh() {
  if (notificationRefreshTimer) clearTimeout(notificationRefreshTimer);
  notificationRefreshTimer = window.setTimeout(() => {
    notificationRefreshTimer = null;
    window.dispatchEvent(new CustomEvent('fsfit-notifications-invalidated'));
    const button = document.querySelector('#notification-button');
    if (button?.getAttribute('aria-expanded') === 'true') button.click();
  }, 180);
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user?.id || null;
}

async function markOneNotification(item, userId) {
  const targetLink = item.tagName === 'A' ? item.getAttribute('href') : '';
  item.classList.remove('unread');
  item.setAttribute('aria-busy', 'true');
  decrementNotificationBadge();

  const { error } = await supabase
    .from('notificacoes')
    .update({ lida: true, lida_em: new Date().toISOString() })
    .eq('id', item.dataset.notificationId)
    .eq('destinatario_id', userId);

  item.removeAttribute('aria-busy');
  if (error) {
    item.classList.add('unread');
    scheduleNotificationPageRefresh();
    throw error;
  }
  if (targetLink) window.location.assign(targetLink);
}

async function markAllNotifications(userId) {
  const { error } = await supabase
    .from('notificacoes')
    .update({ lida: true, lida_em: new Date().toISOString() })
    .eq('destinatario_id', userId)
    .eq('lida', false);
  if (error) throw error;

  document.querySelectorAll('#notification-list .notification-item.unread').forEach(item => item.classList.remove('unread'));
  const { badge, markAll } = notificationElements();
  if (badge) {
    badge.textContent = '0';
    badge.classList.add('hidden');
  }
  markAll?.classList.add('hidden');
}

async function deleteAllNotifications(userId) {
  const { error } = await supabase.from('notificacoes').delete().eq('destinatario_id', userId);
  if (error) throw error;
  clearNotificationUi();
}

function setupNotificationActions() {
  document.addEventListener('click', async event => {
    const item = event.target.closest('#notification-list .notification-item.unread[data-notification-id]');
    const markAll = event.target.closest('#notification-mark-all');
    const clearAll = event.target.closest('#notification-clear-all');
    if (!item && !markAll && !clearAll) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (notificationActionPending) return;

    try {
      const userId = await currentUserId();
      if (!userId) throw new Error('Sessão inválida.');
      setNotificationBusy(true);

      if (item) await markOneNotification(item, userId);
      else if (markAll) await markAllNotifications(userId);
      else if (clearAll && window.confirm('Apagar todas as suas notificações? Esta ação não pode ser desfeita.')) await deleteAllNotifications(userId);
    } catch (error) {
      console.error('Não foi possível concluir a ação da notificação:', error);
      window.alert('Não foi possível atualizar as notificações. Verifique sua conexão e tente novamente.');
      scheduleNotificationPageRefresh();
    } finally {
      setNotificationBusy(false);
    }
  }, true);
}

function clearNotificationReconnectTimer() {
  if (!notificationReconnectTimer) return;
  clearTimeout(notificationReconnectTimer);
  notificationReconnectTimer = null;
}

async function removeNotificationDeleteChannel() {
  clearNotificationReconnectTimer();
  if (notificationDeleteChannel) {
    try { await supabase.removeChannel(notificationDeleteChannel); } catch {}
  }
  notificationDeleteChannel = null;
  notificationDeleteUserId = null;
}

function scheduleNotificationReconnect(userId) {
  if (notificationReconnectTimer || !userId) return;
  notificationReconnectTimer = window.setTimeout(() => {
    notificationReconnectTimer = null;
    setupNotificationDeleteRealtime(userId).catch(error => console.warn('Falha ao reconectar notificações:', error));
  }, 3000);
}

async function setupNotificationDeleteRealtime(explicitUserId = null) {
  const userId = explicitUserId || await currentUserId();
  if (!userId || notificationDeleteUserId === userId) return;
  await removeNotificationDeleteChannel();

  notificationDeleteUserId = userId;
  const filter = `destinatario_id=eq.${userId}`;
  notificationDeleteChannel = supabase
    .channel(`fsfit-notificacoes-delete-${userId}`)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'notificacoes', filter }, () => {
      scheduleNotificationPageRefresh();
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') clearNotificationReconnectTimer();
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        notificationDeleteUserId = null;
        scheduleNotificationReconnect(userId);
      }
    });
}

function setupNotificationLifecycle() {
  setupNotificationActions();
  setupNotificationDeleteRealtime().catch(error => console.warn('Realtime complementar de notificações indisponível:', error));

  if (!cleanupRegistered) {
    cleanupRegistered = true;
    window.addEventListener('beforeunload', () => {
      clearNotificationReconnectTimer();
      if (notificationRefreshTimer) clearTimeout(notificationRefreshTimer);
      if (notificationDeleteChannel) supabase.removeChannel(notificationDeleteChannel);
    }, { once: true });
  }
}

function init() {
  ensureFixStyles();
  setupSkeletonCleanup();
  setupToastMessages();
  setupIosInstallAction();
  setupNotificationLifecycle();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();