// @ts-ignore Existing browser JavaScript module.
import { supabase } from './supabase.js';

interface StudentNotification {
  id: string | number;
  titulo?: string;
  mensagem?: string;
  created_at?: string;
  link?: string;
  lida?: boolean;
}

const notificationButton = document.querySelector<HTMLButtonElement>('#student-notification-button');
const notificationBadge = document.querySelector<HTMLElement>('#student-notification-badge');
const notificationSheet = document.querySelector<HTMLElement>('#student-notification-sheet');
const notificationList = document.querySelector<HTMLElement>('#student-notification-list');
const markAllButton = document.querySelector<HTMLButtonElement>('#student-mark-all-notifications');
const clearButton = document.querySelector<HTMLButtonElement>('#student-clear-notifications');
const settingsButton = document.querySelector<HTMLButtonElement>('#student-settings-button');
const settingsSheet = document.querySelector<HTMLElement>('#student-settings-sheet');

let refreshTimer: ReturnType<typeof setInterval> | null = null;

function token(): string | null {
  return localStorage.getItem('fsfit_aluno_token');
}

function esc(value: unknown = ''): string {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function formatDate(value: string | number | Date | null | undefined): string {
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

function safeLink(value: unknown): string {
  if (!value) return '';
  try {
    const url = new URL(String(value), window.location.origin);
    if (url.origin !== window.location.origin) return '';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '';
  }
}

function logoutStudent(): void {
  const personalSlug = String(localStorage.getItem('fsfit_personal_slug') || '').trim().toLowerCase();
  localStorage.removeItem('fsfit_aluno_token');
  localStorage.removeItem('fsfit_aluno_token_expira_em');
  if (refreshTimer !== null) clearInterval(refreshTimer);
  window.location.replace(personalSlug ? `/p/${encodeURIComponent(personalSlug)}` : '/acesso-aluno.html');
}

function setupLogoutButton(): void {
  const personalActions = document.querySelector('#personal-page-button')?.closest('.student-settings-group')?.querySelector('.actions');
  if (!personalActions || document.querySelector('#student-logout-button')) return;

  const button = document.createElement('button');
  button.id = 'student-logout-button';
  button.className = 'btn';
  button.type = 'button';
  button.textContent = 'SAIR';
  button.setAttribute('aria-label', 'Sair do portal do aluno');
  button.style.width = '100%';
  button.style.marginTop = '4px';
  button.style.background = '#e53935';
  button.style.border = '1px solid #ff5c5c';
  button.style.color = '#ffffff';
  button.style.fontWeight = '800';
  button.style.boxShadow = '0 8px 22px rgba(229,57,53,.18)';
  button.addEventListener('click', logoutStudent);
  personalActions.appendChild(button);
}

async function rpc(name: string, params: Record<string, unknown> = {}): Promise<any> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

function updateBadge(count: unknown): void {
  const total = Number(count || 0);
  if (!notificationBadge) return;
  notificationBadge.textContent = total > 99 ? '99+' : String(total);
  notificationBadge.classList.toggle('hidden', total === 0);
}

function renderNotifications(items: StudentNotification[] = []): void {
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

async function loadNotifications(): Promise<void> {
  const sessionToken = token();
  if (!sessionToken) return;
  try {
    const [notifications, unreadCount] = await Promise.all([
      rpc('listar_notificacoes_aluno', { p_session_token: sessionToken }),
      rpc('contar_notificacoes_nao_lidas_aluno', { p_session_token: sessionToken })
    ]);
    const items = Array.isArray(notifications) ? notifications : [];
    const unread = Number(unreadCount || 0);
    renderNotifications(items);
    updateBadge(unread);
    markAllButton?.classList.toggle('hidden', unread === 0);
    clearButton?.classList.toggle('hidden', items.length === 0);
  } catch (error) {
    console.error('Não foi possível carregar as notificações do aluno:', error);
    if (notificationList) notificationList.innerHTML = '<p class="student-notification-empty">Não foi possível carregar as notificações agora.</p>';
  }
}

function closeSheets(): void {
  [notificationSheet, settingsSheet].forEach(sheet => {
    sheet?.classList.remove('open');
    sheet?.setAttribute('aria-hidden', 'true');
  });
  document.body.classList.remove('student-sheet-open');
}

function openSheet(sheet: HTMLElement | null): void {
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

document.querySelectorAll<HTMLElement>('[data-close-student-sheet]').forEach(button => {
  button.addEventListener('click', closeSheets);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeSheets();
});

notificationList?.addEventListener('click', async event => {
  if (!(event.target instanceof Element)) return;
  const item = event.target.closest<HTMLButtonElement>('[data-student-notification-id]');
  if (!item) return;

  const sessionToken = token();
  const notificationId = item.dataset.studentNotificationId;
  const link = safeLink(item.dataset.studentNotificationLink);
  if (!sessionToken || !notificationId) return;

  item.disabled = true;
  try {
    await rpc('marcar_notificacao_aluno_lida', {
      p_session_token: sessionToken,
      p_notificacao_id: notificationId
    });
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
    await rpc('marcar_todas_notificacoes_aluno_lidas', { p_session_token: sessionToken });
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
    await rpc('limpar_notificacoes_aluno', { p_session_token: sessionToken });
    await loadNotifications();
  } catch (error) {
    console.error('Não foi possível limpar as notificações:', error);
  } finally {
    clearButton.disabled = false;
  }
});

function scheduleRefresh(): void {
  if (refreshTimer !== null) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') loadNotifications();
  }, 30000);
}

window.addEventListener('focus', loadNotifications);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadNotifications();
});

setupLogoutButton();
loadNotifications();
scheduleRefresh();

// @ts-ignore Existing browser JavaScript module.
import('./aluno-push-onboarding.js?v=20260725-push-onboarding1').catch(error => {
  console.error('Não foi possível carregar a orientação de notificações:', error);
});
