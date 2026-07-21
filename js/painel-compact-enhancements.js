import { supabase } from './supabase.js';

const todayList = document.querySelector('#today-list');
const liveList = document.querySelector('#live-students-list');
const LIVE_STATUS_REFRESH_MS = 15000;

let liveStudentIds = new Set();
let liveStudentNames = new Set();
let applyingTodayAgenda = false;

if (todayList || liveList) {
  injectCompactDashboardStyles();
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

function isStudentInClass(row, name) {
  const studentId = studentIdFromRow(row);
  if (studentId && liveStudentIds.has(studentId)) return true;
  return liveStudentNames.has(normalizeName(name));
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
  applyTodayAgenda();
}

function enhanceTodayAgenda() {
  if (!todayList) return;

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

function injectCompactDashboardStyles() {
  if (document.querySelector('#dashboard-compact-enhancements-styles')) return;
  const style = document.createElement('style');
  style.id = 'dashboard-compact-enhancements-styles';
  style.textContent = `
    .today-card-header{padding:15px 16px 11px!important}
    .today-card-header h2{font-size:1.08rem!important}
    .today-card-header p{font-size:.78rem!important}
    .today-count{min-width:36px!important;height:36px!important;border-radius:10px!important}
    .today-entry{grid-template-columns:52px minmax(0,1fr) 20px!important;gap:10px!important;min-height:58px!important;padding:9px 12px!important;border-radius:0!important;background:transparent!important}
    .today-entry:hover,.today-entry:focus-visible{background:rgba(255,255,255,.035)!important}
    .today-entry.is-in-class{background:rgba(255,204,51,.07)!important}
    .today-entry.is-now{background:rgba(50,215,75,.065)!important}
    .today-entry.is-next{background:rgba(79,145,255,.04)!important}
    .today-time{font-size:.96rem!important;font-variant-numeric:tabular-nums}
    .today-entry-main{display:grid!important;gap:3px!important;min-width:0}
    .today-entry-title-row{display:flex;align-items:center;gap:7px;min-width:0}
    .today-entry-title-row strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.94rem!important}
    .today-entry-main small{margin-top:0!important;color:var(--muted)!important;font-size:.74rem!important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .today-status{flex:0 0 auto;padding:2px 6px;border-radius:999px;border:1px solid var(--border);font-size:.54rem;font-weight:900;letter-spacing:.05em;line-height:1.25}
    .today-status.in-class{border-color:rgba(255,204,51,.72);background:rgba(255,204,51,.1);color:var(--warning,#ffcc33)}
    .today-status.now{border-color:var(--primary);background:rgba(50,215,75,.08);color:var(--primary)}
    .today-status.next{border-color:rgba(79,145,255,.55);background:rgba(79,145,255,.07);color:#8bb7ff}
    .today-open.today-arrow{display:block!important;color:var(--muted)!important;font-size:1.45rem!important;font-weight:400!important;line-height:1;text-align:right}

    .live-students-card{margin:14px 0!important}
    .live-students-heading{padding:14px 16px 10px!important}
    .live-students-heading small{margin-bottom:0!important;font-size:.66rem!important}
    .live-student-row{grid-template-columns:minmax(0,1fr) auto 18px!important;gap:8px!important;min-height:54px!important;padding:8px 12px!important}
    .live-student-main{gap:8px!important}
    .live-student-main>div{gap:2px!important}
    .live-student-main strong{font-size:.9rem!important}
    .live-student-main small{font-size:.69rem!important}
    .live-student-progress{display:block!important;grid-column:auto!important;margin-left:0!important;min-width:auto!important}
    .live-student-progress>span{font-size:.68rem!important;font-weight:750!important;color:var(--muted);white-space:nowrap}
    .live-student-progress .live-progress{display:none!important}
    .live-student-arrow{grid-column:auto!important;grid-row:auto!important;font-size:1.45rem!important}
    .live-dot{width:8px!important;height:8px!important;flex:0 0 8px!important}

    @media(max-width:620px){
      .today-card-header{padding:13px 14px 9px!important}
      .today-entry{grid-template-columns:48px minmax(0,1fr) 18px!important;gap:8px!important;min-height:54px!important;padding:8px 8px!important}
      .today-time{font-size:.92rem!important}
      .today-entry-title-row strong{font-size:.9rem!important}
      .today-entry-main small{font-size:.7rem!important}
      .today-status{font-size:.5rem;padding:2px 5px}
      .live-students-heading{padding:12px 14px 9px!important}
      .live-student-row{grid-template-columns:minmax(0,1fr) auto 16px!important;gap:7px!important;min-height:50px!important;padding:7px 10px!important}
      .live-student-main strong{font-size:.87rem!important}
      .live-student-main small{font-size:.66rem!important}
      .live-student-progress>span{font-size:.64rem!important}
    }
  `;
  document.head.appendChild(style);
}
