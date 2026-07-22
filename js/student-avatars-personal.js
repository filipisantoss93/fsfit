import { supabase } from './supabase.js';

const SUPPORTED_PAGES = new Set(['painel.html', 'agenda.html', 'financeiro.html', 'ficha-aluno.html']);
const page = window.location.pathname.split('/').pop() || 'index.html';

let studentsPromise = null;
let liveSessionsPromise = null;
let liveSessionsLoadedAt = 0;
let syncTimer = null;
let syncRunning = false;
let syncAgain = false;

function initials(value = '') {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map(part => part.charAt(0)).join('') || 'A').toUpperCase();
}

function studentIdFromHref(element) {
  const href = element?.getAttribute?.('href') || element?.dataset?.studentHref || '';
  if (!href) return '';
  try {
    return new URL(href, window.location.origin).searchParams.get('id') || '';
  } catch {
    return '';
  }
}

function createAvatar(student, size = 'md') {
  const avatar = document.createElement('span');
  avatar.className = `fsfit-personal-student-avatar is-${size}`;
  avatar.setAttribute('aria-hidden', 'true');
  avatar.dataset.studentAvatarId = student?.id || '';
  avatar.dataset.avatarUrl = student?.foto_perfil_url || '';

  if (student?.foto_perfil_url) {
    const image = document.createElement('img');
    image.src = student.foto_perfil_url;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    avatar.appendChild(image);
  } else {
    avatar.textContent = initials(student?.nome);
  }

  return avatar;
}

function syncAvatar(target, student, size = 'md', placement = 'prepend') {
  if (!target || !student) return null;
  const existing = target.querySelector(':scope > .fsfit-personal-student-avatar');
  const expectedUrl = student.foto_perfil_url || '';
  if (existing?.dataset.avatarUrl === expectedUrl && existing?.dataset.studentAvatarId === student.id) return existing;

  const avatar = createAvatar(student, size);
  if (existing) existing.replaceWith(avatar);
  else if (placement === 'before-copy') {
    const copy = [...target.children].find(child => child.tagName === 'DIV');
    if (copy) target.insertBefore(avatar, copy);
    else target.prepend(avatar);
  } else {
    target.prepend(avatar);
  }
  return avatar;
}

async function loadStudents(force = false) {
  if (force) studentsPromise = null;
  if (studentsPromise) return studentsPromise;

  studentsPromise = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return new Map();

    const { data, error } = await supabase
      .from('alunos')
      .select('id,nome,foto_perfil_url')
      .eq('personal_id', session.user.id);

    if (error) {
      console.warn('Fotos dos alunos indisponíveis:', error.message || error);
      return new Map();
    }

    return new Map((data || []).map(student => [String(student.id), student]));
  })().catch(error => {
    studentsPromise = null;
    console.warn('Não foi possível carregar os avatares dos alunos:', error);
    return new Map();
  });

  return studentsPromise;
}

async function loadLiveSessionMap(force = false) {
  const fresh = Date.now() - liveSessionsLoadedAt < 10000;
  if (!force && liveSessionsPromise && fresh) return liveSessionsPromise;

  liveSessionsLoadedAt = Date.now();
  liveSessionsPromise = (async () => {
    const { data, error } = await supabase.rpc('listar_sessoes_em_aula_personal');
    if (error) return new Map();
    return new Map((data || []).map(row => [String(row.sessao_id), String(row.aluno_id)]));
  })().catch(() => new Map());

  return liveSessionsPromise;
}

function ensureStyles() {
  if (document.querySelector('style[data-fsfit-personal-student-avatars]')) return;
  const style = document.createElement('style');
  style.dataset.fsfitPersonalStudentAvatars = 'true';
  style.textContent = `
    .fsfit-personal-student-avatar {
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      overflow: hidden;
      border: 1px solid rgba(255,255,255,.14);
      border-radius: 50%;
      background: linear-gradient(145deg, rgba(50,215,75,.18), rgba(59,130,246,.13)), var(--surface-light);
      color: var(--text);
      font-weight: 900;
      line-height: 1;
      text-transform: uppercase;
    }
    .fsfit-personal-student-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .fsfit-personal-student-avatar.is-sm { width: 34px; height: 34px; font-size: .66rem; }
    .fsfit-personal-student-avatar.is-md { width: 38px; height: 38px; font-size: .72rem; }
    .fsfit-personal-student-avatar.is-lg { width: 68px; height: 68px; font-size: 1.05rem; border-width: 2px; }

    .agenda-entry.fsfit-has-student-avatar { grid-template-columns: 58px 38px minmax(0,1fr) 24px !important; }
    .agenda-entry.fsfit-has-student-avatar .agenda-entry-main,
    .agenda-entry.fsfit-has-student-avatar .agenda-entry-title-row,
    .agenda-entry.fsfit-has-student-avatar .agenda-entry-main strong { min-width: 0; }
    .agenda-entry.fsfit-has-student-avatar .agenda-entry-title-row { flex-wrap: nowrap; }

    .today-entry.fsfit-has-student-avatar { grid-template-columns: 62px 40px minmax(0,1fr) auto !important; }
    .today-entry.fsfit-has-student-avatar .today-entry-main { min-width: 0; }

    .finance-student-name { flex-wrap: nowrap !important; min-width: 0; }
    .finance-student-name .fsfit-personal-student-avatar { margin-right: 1px; }
    .finance-student-name strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .live-student-main { flex-wrap: nowrap !important; }
    .live-student-main .fsfit-personal-student-avatar { flex: 0 0 auto; }
    .live-student-main > div { min-width: 0; }

    .recent-student-avatar img { width: 100%; height: 100%; display: block; object-fit: cover; border-radius: inherit; }

    .student-record-person {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }
    .student-record-person-copy { min-width: 0; }
    .student-record-person-copy h1,
    .student-record-person-copy p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    @media (max-width: 620px) {
      .fsfit-personal-student-avatar.is-sm { width: 32px; height: 32px; font-size: .62rem; }
      .fsfit-personal-student-avatar.is-md { width: 34px; height: 34px; font-size: .64rem; }
      .fsfit-personal-student-avatar.is-lg { width: 58px; height: 58px; font-size: .92rem; }
      .agenda-entry.fsfit-has-student-avatar { grid-template-columns: 48px 34px minmax(0,1fr) 20px !important; gap: 8px !important; }
      .today-entry.fsfit-has-student-avatar { grid-template-columns: 48px 34px minmax(0,1fr) !important; gap: 9px !important; }
      .today-entry.fsfit-has-student-avatar .today-open { display: none !important; }
      .student-record-person { gap: 11px; }
      .student-record-person-copy h1 { font-size: 1.75rem !important; }
    }
  `;
  document.head.appendChild(style);
}

function syncAgenda(map) {
  document.querySelectorAll('.agenda-entry').forEach(entry => {
    const student = map.get(String(studentIdFromHref(entry)));
    const main = entry.querySelector('.agenda-entry-main');
    if (!student || !main) return;
    const avatar = syncAvatar(entry, student, 'md');
    if (avatar && avatar.nextElementSibling !== main) entry.insertBefore(avatar, main);
    entry.classList.add('fsfit-has-student-avatar');
  });
}

function syncToday(map) {
  document.querySelectorAll('#today-list .today-entry').forEach(entry => {
    const student = map.get(String(studentIdFromHref(entry)));
    const main = entry.querySelector('.today-entry-main');
    if (!student || !main) return;
    const avatar = syncAvatar(entry, student, 'md');
    if (avatar && avatar.nextElementSibling !== main) entry.insertBefore(avatar, main);
    entry.classList.add('fsfit-has-student-avatar');
  });
}

function syncRecentStudents(map) {
  document.querySelectorAll('#recent-list .recent-student-row').forEach(row => {
    const student = map.get(String(studentIdFromHref(row)));
    const host = row.querySelector('.recent-student-avatar');
    if (!student || !host) return;
    if (student.foto_perfil_url) {
      if (host.dataset.avatarUrl === student.foto_perfil_url) return;
      host.textContent = '';
      const image = document.createElement('img');
      image.src = student.foto_perfil_url;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      host.appendChild(image);
      host.dataset.avatarUrl = student.foto_perfil_url;
    } else if (!host.textContent.trim()) {
      host.textContent = initials(student.nome);
      host.removeAttribute('data-avatar-url');
    }
  });
}

function syncFinance(map) {
  document.querySelectorAll('.finance-student-row[data-student-row]').forEach(row => {
    const student = map.get(String(row.dataset.studentRow || ''));
    const host = row.querySelector('.finance-student-name');
    if (!student || !host) return;
    syncAvatar(host, student, 'sm');
  });
}

function syncStudentRecord(map) {
  const studentId = new URLSearchParams(window.location.search).get('id');
  const student = map.get(String(studentId || ''));
  const host = document.querySelector('.student-record-title > div');
  if (!student || !host) return;

  if (!host.classList.contains('student-record-person')) {
    const name = host.querySelector('#student-name');
    const summary = host.querySelector('#student-summary');
    if (!name || !summary) return;

    const copy = document.createElement('div');
    copy.className = 'student-record-person-copy';
    host.insertBefore(copy, name);
    copy.appendChild(name);
    copy.appendChild(summary);
    host.classList.add('student-record-person');
  }

  syncAvatar(host, student, 'lg');
}

async function syncLiveStudents(map) {
  const rows = [...document.querySelectorAll('.live-student-row[data-open-live-session]')];
  if (!rows.length) return;
  const sessionMap = await loadLiveSessionMap();

  rows.forEach(row => {
    const studentId = sessionMap.get(String(row.dataset.openLiveSession || ''));
    const student = map.get(String(studentId || ''));
    const host = row.querySelector('.live-student-main');
    if (!student || !host) return;
    syncAvatar(host, student, 'md', 'before-copy');
  });
}

async function syncAll() {
  if (!SUPPORTED_PAGES.has(page)) return;
  if (syncRunning) {
    syncAgain = true;
    return;
  }

  syncRunning = true;
  try {
    const map = await loadStudents();
    if (!map.size) return;

    if (page === 'agenda.html') syncAgenda(map);
    if (page === 'financeiro.html') syncFinance(map);
    if (page === 'ficha-aluno.html') syncStudentRecord(map);
    if (page === 'painel.html') {
      syncToday(map);
      syncRecentStudents(map);
      await syncLiveStudents(map);
    }
  } finally {
    syncRunning = false;
    if (syncAgain) {
      syncAgain = false;
      scheduleSync();
    }
  }
}

function scheduleSync() {
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => syncAll().catch(console.warn), 60);
}

function init() {
  if (!SUPPORTED_PAGES.has(page)) return;
  ensureStyles();
  scheduleSync();

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('focus', () => {
    studentsPromise = null;
    liveSessionsPromise = null;
    scheduleSync();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    studentsPromise = null;
    liveSessionsPromise = null;
    scheduleSync();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
