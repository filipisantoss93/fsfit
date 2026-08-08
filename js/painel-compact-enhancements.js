import { supabase } from './supabase.js';

const todayList = document.querySelector('#today-list');
const liveList = document.querySelector('#live-students-list');
const LIVE_STATUS_REFRESH_MS = 15000;

let liveStudentIds = new Set();
let liveStudentNames = new Set();
let liveSessionByStudentId = new Map();
let liveSessionByStudentName = new Map();
let applyingTodayAgenda = false;

if (todayList || liveList) {
  enhanceTodayAgenda();
  compactLiveStudents();
  refreshLiveStudentStatus().catch(console.error);

  window.setInterval(() => {
    if (document.visibilityState === 'visible') refreshLiveStudentStatus().catch(console.error);
  }, LIVE_STATUS_REFRESH_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshLiveStudentStatus().catch(console.error);
  });
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeName(value = '') {
  return String(value || '').trim().toLocaleLowerCase('pt-BR');
}

function timeToMinutes(value = '') {
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function studentIdFromRow(row) {
  if (row?.dataset?.studentId) return row.dataset.studentId;
  const href = row?.getAttribute?.('href');
  if (!href) return '';
  try {
    return new URL(href, window.location.href).searchParams.get('id') || '';
  } catch {
    return '';
  }
}

function studentNameFromRow(row) {
  const main = row?.querySelector?.('.today-entry-main');
  return main?.dataset?.studentName || main?.querySelector?.('strong')?.textContent?.trim() || '';
}

function isStudentInClass(row, name) {
  const studentId = studentIdFromRow(row);
  if (studentId && liveStudentIds.has(studentId)) return true;
  return liveStudentNames.has(normalizeName(name));
}

function liveSessionIdFromRow(row) {
  const studentId = studentIdFromRow(row);
  if (studentId && liveSessionByStudentId.has(studentId)) return liveSessionByStudentId.get(studentId);
  return liveSessionByStudentName.get(normalizeName(studentNameFromRow(row))) || '';
}

async function refreshLiveStudentStatus() {
  if (!todayList) return;

  const { data, error } = await supabase.rpc('listar_sessoes_em_aula_personal');
  if (error) {
    console.error('Não foi possível sincronizar o status Em aula na agenda de hoje:', error);
    return;
  }

  const activeRows = (Array.isArray(data) ? data : []).filter(row => row.status === 'em_aula');
  liveStudentIds = new Set(activeRows.map(row => String(row.aluno_id || '')).filter(Boolean));
  liveStudentNames = new Set(activeRows.map(row => normalizeName(row.aluno_nome)).filter(Boolean));
  liveSessionByStudentId = new Map(activeRows
    .filter(row => row.aluno_id && row.sessao_id)
    .map(row => [String(row.aluno_id), String(row.sessao_id)]));
  liveSessionByStudentName = new Map(activeRows
    .filter(row => row.aluno_nome && row.sessao_id)
    .map(row => [normalizeName(row.aluno_nome), String(row.sessao_id)]));
  applyTodayAgenda();
}

function enhanceTodayAgenda() {
  if (!todayList) return;

  todayList.addEventListener('click', event => {
    const row = event.target.closest('.today-entry');
    if (!row || !row.classList.contains('is-in-class')) return;

    const sessionId = liveSessionIdFromRow(row);
    if (!sessionId) return;

    const liveRow = document.querySelector(`[data-open-live-session="${sessionId}"]`);
    if (!liveRow) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    liveRow.click();
  }, true);

  applyTodayAgenda();
  const observer = new MutationObserver(() => applyTodayAgenda());
  observer.observe(todayList, { childList: true });
  window.setInterval(applyTodayAgenda, 60000);
}

function applyTodayAgenda() {
  if (!todayList || applyingTodayAgenda) return;

  const rows = [...todayList.querySelectorAll('.today-entry')];
  if (!rows.length) return;

  applyingTodayAgenda = true;
  try {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    let nowIndex = -1;
    let nextIndex = -1;

    rows.forEach((row, index) => {
      const minutes = timeToMinutes(row.querySelector('.today-time')?.textContent || '');
      if (minutes == null) return;
      if (minutes <= nowMinutes && nowMinutes - minutes < 60) nowIndex = index;
      if (nextIndex === -1 && minutes > nowMinutes) nextIndex = index;
    });

    rows.forEach((row, index) => {
      const main = row.querySelector('.today-entry-main');
      if (!main) return;

      const name = main.querySelector('strong')?.textContent?.trim() || main.dataset.studentName || 'Aluno';
      const workout = main.dataset.workout || main.querySelector(':scope > span:not(.today-status)')?.textContent?.trim() || 'Treino ativo';
      const rawDetails = main.dataset.details || main.querySelector(':scope > small')?.textContent?.trim() || '';
      const local = rawDetails.includes('·') ? rawDetails.split('·').pop().trim() : rawDetails;
      const inClass = isStudentInClass(row, name);
      const isNow = !inClass && index === nowIndex;
      const isNext = !inClass && index === nextIndex;

      main.dataset.studentName = name;
      main.dataset.workout = workout;
      main.dataset.details = rawDetails;

      row.classList.toggle('is-in-class', inClass);
      row.classList.toggle('is-now', isNow);
      row.classList.toggle('is-next', isNext);
      row.setAttribute('aria-label', inClass ? `Abrir aula de ${name}` : `Abrir ficha de ${name}`);

      const badge = inClass
        ? '<span class="today-status in-class">EM AULA</span>'
        : isNow
          ? '<span class="today-status now">AGORA</span>'
          : isNext
            ? '<span class="today-status next">PRÓXIMO</span>'
            : '';
      const compactDetail = [local || 'Local não informado', workout].filter(Boolean).join(' · ');

      main.innerHTML = `
        <div class="today-entry-title-row">
          <strong>${escapeHtml(name)}</strong>
          ${badge}
        </div>
        <small>${escapeHtml(compactDetail)}</small>`;

      const open = row.querySelector('.today-open');
      if (open && !row.classList.contains('locked')) {
        open.textContent = '›';
        open.classList.add('today-arrow');
        open.setAttribute('aria-hidden', 'true');
      }
    });
  } finally {
    applyingTodayAgenda = false;
  }
}

function compactLiveStudents() {
  if (!liveList) return;
  liveList.classList.add('live-students-list-compact');
}
