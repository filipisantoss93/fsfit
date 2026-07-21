const todayList = document.querySelector('#today-list');
const liveList = document.querySelector('#live-students-list');

if (todayList || liveList) {
  injectCompactDashboardStyles();
  enhanceTodayAgenda();
  compactLiveStudents();
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function timeToMinutes(value = '') {
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function enhanceTodayAgenda() {
  if (!todayList) return;

  const apply = () => {
    const rows = [...todayList.querySelectorAll('.today-entry')];
    if (!rows.length) return;

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
      row.classList.toggle('is-now', index === nowIndex);
      row.classList.toggle('is-next', index === nextIndex);

      const main = row.querySelector('.today-entry-main');
      if (!main) return;

      const name = main.querySelector('strong')?.textContent?.trim() || 'Aluno';
      const workout = main.querySelector('span')?.textContent?.trim() || main.dataset.workout || 'Treino ativo';
      const rawDetails = main.querySelector('small')?.textContent?.trim() || main.dataset.details || '';
      const local = rawDetails.includes('·') ? rawDetails.split('·').pop().trim() : rawDetails;

      main.dataset.workout = workout;
      main.dataset.details = rawDetails;

      const badge = index === nowIndex
        ? '<span class="today-status now">AGORA</span>'
        : index === nextIndex
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
  };

  apply();
  const observer = new MutationObserver(apply);
  observer.observe(todayList, { childList: true });
  window.setInterval(apply, 60000);
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
    .today-entry.is-now{background:rgba(50,215,75,.065)!important}
    .today-entry.is-next{background:rgba(79,145,255,.04)!important}
    .today-time{font-size:.96rem!important;font-variant-numeric:tabular-nums}
    .today-entry-main{display:grid!important;gap:3px!important;min-width:0}
    .today-entry-title-row{display:flex;align-items:center;gap:7px;min-width:0}
    .today-entry-title-row strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.94rem!important}
    .today-entry-main small{margin-top:0!important;color:var(--muted)!important;font-size:.74rem!important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .today-status{flex:0 0 auto;padding:2px 6px;border-radius:999px;border:1px solid var(--border);font-size:.54rem;font-weight:900;letter-spacing:.05em;line-height:1.25}
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
