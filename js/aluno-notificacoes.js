import { supabase } from './supabase.js';

const notificationButton = document.querySelector('#student-notification-button');
const notificationBadge = document.querySelector('#student-notification-badge');
const notificationSheet = document.querySelector('#student-notification-sheet');
const notificationList = document.querySelector('#student-notification-list');
const markAllButton = document.querySelector('#student-mark-all-notifications');
const clearButton = document.querySelector('#student-clear-notifications');
const settingsButton = document.querySelector('#student-settings-button');
const settingsSheet = document.querySelector('#student-settings-sheet');

let refreshTimer = null;

function token() {
  return localStorage.getItem('fsfit_aluno_token');
}

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function safeLink(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value), window.location.origin);
    if (url.origin !== window.location.origin) return '';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '';
  }
}

async function invoke(body) {
  const { data, error } = await supabase.functions.invoke('aluno-push', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

function updateBadge(count) {
  const total = Number(count || 0);
  if (!notificationBadge) return;
  notificationBadge.textContent = total > 99 ? '99+' : String(total);
  notificationBadge.classList.toggle('hidden', total === 0);
}

function renderNotifications(items = []) {
  if (!notificationList) return;
  notificationList.innerHTML = items.length
    ? items.map(item => {
        const link = safeLink(item.link);
        return `<button class="student-notification-item ${item.lida ? '' : 'unread'}" type="button" data-student-notification-id="${esc(item.id)}" data-student-notification-link="${esc(link)}">
          <span class="student-notification-dot" aria-hidden="true"></span>
          <span class="student-notification-copy">
            <strong>${esc(item.titulo || 'Notificação')}</strong>
            <span>${esc(item.mensagem || '')}</span>
            <small>${esc(formatDate(item.created_at))}</small>
          </span>
        </button>`;
      }).join('')
    : '<p class="student-notification-empty">Nenhuma notificação por aqui.</p>';
}

async function loadNotifications() {
  const sessionToken = token();
  if (!sessionToken) return;
  try {
    const data = await invoke({ action: 'list_notifications', token: sessionToken });
    renderNotifications(data?.notifications || []);
    updateBadge(data?.unread_count || 0);
    markAllButton?.classList.toggle('hidden', !(Number(data?.unread_count || 0) > 0));
    clearButton?.classList.toggle('hidden', !(data?.notifications || []).length);
  } catch (error) {
    console.error('Não foi possível carregar as notificações do aluno:', error);
    if (notificationList) notificationList.innerHTML = '<p class="student-notification-empty">Não foi possível carregar as notificações agora.</p>';
  }
}

function closeSheets() {
  [notificationSheet, settingsSheet].forEach(sheet => {
    sheet?.classList.remove('open');
    sheet?.setAttribute('aria-hidden', 'true');
  });
  document.body.classList.remove('student-sheet-open');
}

function openSheet(sheet) {
  closeSheets();
  sheet?.classList.add('open');
  sheet?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('student-sheet-open');
}

notificationButton?.addEventListener('click', async () => {
  openSheet(notificationSheet);
  await loadNotifications();
});

settingsButton?.addEventListener('click', () => openSheet(settingsSheet));

document.querySelectorAll('[data-close-student-sheet]').forEach(button => {
  button.addEventListener('click', closeSheets);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeSheets();
});

notificationList?.addEventListener('click', async event => {
  const item = event.target.closest('[data-student-notification-id]');
  if (!item) return;

  const sessionToken = token();
  const notificationId = item.dataset.studentNotificationId;
  const link = safeLink(item.dataset.studentNotificationLink);
  if (!sessionToken || !notificationId) return;

  item.disabled = true;
  try {
    await invoke({ action: 'mark_notification_read', token: sessionToken, notification_id: notificationId });
    await loadNotifications();
    if (link) window.location.assign(link);
  } catch (error) {
    console.error('Não foi possível marcar a notificação como lida:', error);
    item.disabled = false;
  }
});

markAllButton?.addEventListener('click', async () => {
  const sessionToken = token();
  if (!sessionToken) return;
  markAllButton.disabled = true;
  try {
    await invoke({ action: 'mark_all_notifications_read', token: sessionToken });
    await loadNotifications();
  } catch (error) {
    console.error('Não foi possível marcar todas as notificações como lidas:', error);
  } finally {
    markAllButton.disabled = false;
  }
});

clearButton?.addEventListener('click', async () => {
  if (!confirm('Limpar todas as notificações?')) return;
  const sessionToken = token();
  if (!sessionToken) return;
  clearButton.disabled = true;
  try {
    await invoke({ action: 'clear_notifications', token: sessionToken });
    await loadNotifications();
  } catch (error) {
    console.error('Não foi possível limpar as notificações:', error);
  } finally {
    clearButton.disabled = false;
  }
});

function scheduleRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') loadNotifications();
  }, 30000);
}

window.addEventListener('focus', loadNotifications);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadNotifications();
});

loadNotifications();
scheduleRefresh();
