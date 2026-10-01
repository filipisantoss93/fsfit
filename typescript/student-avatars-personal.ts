// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { supabase } from './supabase.js';

interface StudentAvatarRow {
  id: string | number;
  nome?: string | null;
  foto_perfil_url?: string | null;
}

interface LiveSessionAvatarRow {
  sessao_id?: string | number | null;
  aluno_id?: string | number | null;
}

const SUPPORTED_PAGES = new Set(['painel.html', 'agenda.html', 'financeiro.html', 'ficha-aluno.html']);
const page = window.location.pathname.split('/').pop() || 'index.html';
const root = document.documentElement;

let students = new Map<string, StudentAvatarRow>();
let liveSessions = new Map<string, string>();
let syncQueued = false;
let refreshing = false;

if (SUPPORTED_PAGES.has(page) && (page === 'agenda.html' || page === 'financeiro.html')) {
  root.classList.add('fsfit-student-avatars-loading');
}

function initials(value: unknown = ''): string {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map(part => part.charAt(0)).join('') || 'A').toUpperCase();
}

function studentIdFromElement(element: HTMLElement | null): string {
  const directId = String(
    element?.dataset?.studentId ||
    element?.dataset?.studentRow ||
    element?.dataset?.studentHref ||
    ''
  ).trim();

  if (directId && !directId.includes('.html')) return directId;

  const href = element?.getAttribute('href') || element?.dataset?.studentHref || '';
  if (!href) return '';

  try {
    return new URL(href, window.location.origin).searchParams.get('id') || '';
  } catch {
    return '';
  }
}

function fallbackStudent(id: unknown, name: unknown): StudentAvatarRow {
  return {
    id: String(id || ''),
    nome: String(name || 'Aluno'),
    foto_perfil_url: ''
  };
}

function createAvatar(student: StudentAvatarRow, size = 'md'): HTMLSpanElement {
  const avatar = document.createElement('span');
  const url = String(student?.foto_perfil_url || '').trim();
  const name = String(student?.nome || 'Aluno');

  avatar.className = `fsfit-personal-student-avatar is-${size}`;
  avatar.setAttribute('aria-hidden', 'true');
  avatar.dataset.studentAvatarId = String(student?.id || '');
  avatar.dataset.avatarUrl = url;
  avatar.dataset.avatarInitials = initials(name);

  if (url) {
    const image = document.createElement('img');
    image.src = url;
    image.alt = '';
    image.loading = 'eager';
    image.decoding = 'async';
    image.addEventListener('error', () => {
      avatar.replaceChildren(document.createTextNode(avatar.dataset.avatarInitials || 'A'));
      avatar.dataset.avatarUrl = '';
      avatar.classList.add('is-fallback');
    }, { once: true });
    avatar.appendChild(image);
  } else {
    avatar.textContent = initials(name);
    avatar.classList.add('is-fallback');
  }

  return avatar;
}

function syncAvatar(host: HTMLElement, student: StudentAvatarRow, size = 'md', before: Element | null = null): HTMLElement | null {
  if (!host || !student) return null;

  const id = String(student.id || '');
  const url = String(student.foto_perfil_url || '').trim();
  const existing = host.querySelector<HTMLElement>(':scope > .fsfit-personal-student-avatar');

  if (
    existing &&
    existing.dataset.studentAvatarId === id &&
    existing.dataset.avatarUrl === url
  ) {
    if (before && existing.nextElementSibling !== before) host.insertBefore(existing, before);
    return existing;
  }

  const avatar = createAvatar(student, size);
  if (existing) existing.replaceWith(avatar);
  else if (before) host.insertBefore(avatar, before);
  else host.prepend(avatar);
  return avatar;
}

async function loadStudents(): Promise<Map<string, StudentAvatarRow>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return new Map();

  const { data, error } = await supabase
    .from('alunos')
    .select('id,nome,foto_perfil_url')
    .eq('personal_id', session.user.id);

  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []) as StudentAvatarRow[];
  return new Map(rows.map(student => [String(student.id), student]));
}

async function loadLiveSessions(): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc('listar_sessoes_em_aula_personal');
  if (error) return new Map();
  const rows = (Array.isArray(data) ? data : []) as LiveSessionAvatarRow[];
  return new Map(rows.map(row => [String(row.sessao_id || ''), String(row.aluno_id || '')]));
}

function syncAgenda(): void {
  document.querySelectorAll<HTMLElement>('.agenda-entry').forEach(entry => {
    const id = studentIdFromElement(entry);
    const main = entry.querySelector<HTMLElement>('.agenda-entry-main');
    const name = main?.querySelector('strong')?.textContent || 'Aluno';
    if (!main) return;

    const student = students.get(String(id)) || fallbackStudent(id, name);
    syncAvatar(entry, student, 'md', main);
    entry.classList.add('fsfit-has-student-avatar');
  });
}

function syncFinance(): void {
  document.querySelectorAll<HTMLElement>('.finance-student-row[data-student-row]').forEach(row => {
    const id = studentIdFromElement(row);
    const host = row.querySelector<HTMLElement>('.finance-student-name');
    const name = host?.querySelector('strong')?.textContent || 'Aluno';
    if (!host) return;

    const student = students.get(String(id)) || fallbackStudent(id, name);
    syncAvatar(host, student, 'sm');
  });
}

function syncToday(): void {
  document.querySelectorAll<HTMLElement>('#today-list .today-entry').forEach(entry => {
    const id = studentIdFromElement(entry);
    const main = entry.querySelector<HTMLElement>('.today-entry-main');
    const name = main?.querySelector('strong')?.textContent || 'Aluno';
    if (!main) return;

    const student = students.get(String(id)) || fallbackStudent(id, name);
    syncAvatar(entry, student, 'md', main);
    entry.classList.add('fsfit-has-student-avatar');
  });
}

function syncRecentStudents(): void {
  document.querySelectorAll<HTMLElement>('#recent-list .recent-student-row').forEach(row => {
    const id = studentIdFromElement(row);
    const host = row.querySelector<HTMLElement>('.recent-student-avatar');
    const name = row.querySelector('strong')?.textContent || 'Aluno';
    if (!host) return;

    const student = students.get(String(id)) || fallbackStudent(id, name);
    const url = String(student.foto_perfil_url || '').trim();

    if (host.dataset.avatarUrl === url && host.dataset.studentAvatarId === String(student.id || '')) return;
    host.replaceChildren();
    host.dataset.avatarUrl = url;
    host.dataset.studentAvatarId = String(student.id || '');

    if (url) {
      const image = document.createElement('img');
      image.src = url;
      image.alt = '';
      image.loading = 'eager';
      image.decoding = 'async';
      image.addEventListener('error', () => { host.textContent = initials(student.nome); }, { once: true });
      host.appendChild(image);
    } else {
      host.textContent = initials(student.nome);
    }
  });
}

function syncStudentRecord(): void {
  const id = new URLSearchParams(window.location.search).get('id') || '';
  const host = document.querySelector<HTMLElement>('.student-record-title > div');
  const name = host?.querySelector('#student-name')?.textContent || 'Aluno';
  if (!host) return;

  const student = students.get(String(id)) || fallbackStudent(id, name);

  if (!host.classList.contains('student-record-person')) {
    const title = host.querySelector<HTMLElement>('#student-name');
    const summary = host.querySelector<HTMLElement>('#student-summary');
    if (!title || !summary) return;

    const copy = document.createElement('div');
    copy.className = 'student-record-person-copy';
    host.insertBefore(copy, title);
    copy.append(title, summary);
    host.classList.add('student-record-person');
  }

  syncAvatar(host, student, 'lg');
}

function syncLiveStudents(): void {
  document.querySelectorAll<HTMLElement>('.live-student-row[data-open-live-session]').forEach(row => {
    const studentId = liveSessions.get(String(row.dataset.openLiveSession || ''));
    const host = row.querySelector<HTMLElement>('.live-student-main');
    const name = host?.querySelector('strong')?.textContent || 'Aluno';
    if (!host) return;

    const student = students.get(String(studentId || '')) || fallbackStudent(studentId, name);
    const copy = [...host.children].find(child => child.tagName === 'DIV') || null;
    syncAvatar(host, student, 'md', copy);
  });
}

function syncPage(): void {
  syncQueued = false;
  if (page === 'agenda.html') syncAgenda();
  if (page === 'financeiro.html') syncFinance();
  if (page === 'ficha-aluno.html') syncStudentRecord();
  if (page === 'painel.html') {
    syncToday();
    syncRecentStudents();
    syncLiveStudents();
  }
  root.classList.remove('fsfit-student-avatars-loading');
}

function queueSync(): void {
  if (syncQueued) return;
  syncQueued = true;
  queueMicrotask(syncPage);
}

function observePage(): void {
  const selectors = page === 'agenda.html'
    ? ['#agenda-grid']
    : page === 'financeiro.html'
      ? ['#finance-students-list']
      : page === 'painel.html'
        ? ['#today-list', '#recent-list', '#live-students-list']
        : ['.student-record-title'];

  selectors.forEach(selector => {
    const target = document.querySelector(selector);
    if (!target) return;
    new MutationObserver(queueSync).observe(target, { childList: true, subtree: true });
  });
}

async function refreshData(): Promise<void> {
  if (refreshing) return;
  refreshing = true;
  try {
    students = await loadStudents();
    if (page === 'painel.html') liveSessions = await loadLiveSessions();
    syncPage();
  } catch (error) {
    console.warn('Não foi possível consolidar as fotos dos alunos:', error);
    root.classList.remove('fsfit-student-avatars-loading');
  } finally {
    refreshing = false;
  }
}

async function init(): Promise<void> {
  if (!SUPPORTED_PAGES.has(page)) return;
  observePage();
  await refreshData();

  window.addEventListener('focus', () => void refreshData());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshData();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void init(), { once: true });
} else {
  void init();
}
