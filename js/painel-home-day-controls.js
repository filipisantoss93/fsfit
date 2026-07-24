import { supabase } from './supabase.js';
import { requireSession } from './layout.js';

const homePanel = await waitForElement('#dashboard-home-panel');

if (homePanel) {
  const session = await requireSession();
  if (session) initializeHomeDayControls(session).catch(error => console.error('Falha ao consolidar o resumo do dia:', error));
}

async function initializeHomeDayControls(session) {
  injectStyles();

  const state = {
    scheduleEntries: [],
    completedCount: 0,
    completedStudentIds: new Set(),
    liveCount: 0,
    liveStudentIds: new Set(),
    overdueCount: 0,
    ready: false,
    rendering: false,
    refreshing: false
  };

  const nowCard = await waitForElement('#home-now-card');
  const liveList = document.querySelector('#live-students-list');
  const dayCard = await waitForElement('.home-day-card');
  const upcomingList = await waitForElement('#home-upcoming-list');

  setupDayCard(dayCard);
  setupDesktopCarousel(nowCard, liveList);

  const applyConsolidatedView = () => {
    if (!state.ready || state.rendering) return;
    state.rendering = true;
    try {
      renderDaySummary(state);
      renderTodayUpcoming(state.scheduleEntries, state);
      renderTodayHero(state.scheduleEntries, state);
      syncDesktopCarouselHint();
    } finally {
      queueMicrotask(() => { state.rendering = false; });
    }
  };

  const refresh = async () => {
    if (state.refreshing) return;
    state.refreshing = true;
    try {
      const [scheduleEntries, sessionStatus] = await Promise.all([
        loadTodayAgenda(session.user.id),
        loadTodaySessionStatus(session.user.id)
      ]);

      state.scheduleEntries = scheduleEntries;
      state.completedCount = sessionStatus.completedCount;
      state.completedStudentIds = sessionStatus.completedStudentIds;
      state.liveCount = sessionStatus.liveCount;
      state.liveStudentIds = sessionStatus.liveStudentIds;
      state.overdueCount = calculateOverdue(scheduleEntries, sessionStatus);
      state.ready = true;
      applyConsolidatedView();
    } finally {
      state.refreshing = false;
    }
  };

  const watchTargets = [
    dayCard,
    upcomingList,
    nowCard,
    liveList
  ].filter(Boolean);

  const observer = new MutationObserver(() => {
    if (!state.ready || state.rendering) return;
    queueMicrotask(applyConsolidatedView);
  });

  watchTargets.forEach(target => observer.observe(target, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'class']
  }));

  await refresh();

  window.setInterval(refresh, 60000);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
}

function setupDayCard(card) {
  if (!card) return;
  card.setAttribute('aria-live', 'polite');

  const summaryItems = card.querySelectorAll('.home-day-summary > span');
  const overdueItem = summaryItems[2];
  if (overdueItem) {
    const dot = overdueItem.querySelector('.home-day-dot');
    const value = overdueItem.querySelector('strong');
    dot?.classList.add('overdue');
    if (value) value.id = 'home-day-overdue';
    const labelNode = [...overdueItem.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (labelNode) labelNode.textContent = ' atrasados';
  }

  const progress = card.querySelector('.home-day-progress');
  if (progress && !progress.querySelector('#home-day-progress-overdue')) {
    const overdueBar = document.createElement('span');
    overdueBar.id = 'home-day-progress-overdue';
    overdueBar.className = 'home-day-progress-overdue';
    progress.appendChild(overdueBar);
  }
}

function setupDesktopCarousel(card, liveList) {
  if (!card || card.querySelector('[data-home-live-nav]')) return;

  const previous = document.createElement('button');
  previous.type = 'button';
  previous.className = 'home-now-nav home-now-nav-previous';
  previous.dataset.homeLiveNav = 'previous';
  previous.setAttribute('aria-label', 'Aluno anterior em acompanhamento');
  previous.innerHTML = '<span aria-hidden="true">‹</span>';

  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'home-now-nav home-now-nav-next';
  next.dataset.homeLiveNav = 'next';
  next.setAttribute('aria-label', 'Próximo aluno em acompanhamento');
  next.innerHTML = '<span aria-hidden="true">›</span>';

  card.append(previous, next);

  const liveRows = () => [...document.querySelectorAll('#live-students-list [data-open-live-session]')];

  const syncVisibility = () => {
    const visible = liveRows().length > 1;
    previous.hidden = !visible;
    next.hidden = !visible;
    card.classList.toggle('has-desktop-live-navigation', visible);
    syncDesktopCarouselHint();
  };

  previous.addEventListener('click', event => {
    event.stopPropagation();
    dispatchSyntheticSwipe(card, 'previous');
  });

  next.addEventListener('click', event => {
    event.stopPropagation();
    dispatchSyntheticSwipe(card, 'next');
  });

  if (liveList) {
    new MutationObserver(syncVisibility).observe(liveList, { childList: true, subtree: true });
  }

  window.matchMedia('(min-width: 721px)').addEventListener?.('change', syncVisibility);
  syncVisibility();
}

function dispatchSyntheticSwipe(card, direction) {
  const startX = direction === 'next' ? 160 : 40;
  const endX = direction === 'next' ? 40 : 160;
  const y = 100;

  const startEvent = new Event('touchstart', { bubbles: true, cancelable: true });
  Object.defineProperty(startEvent, 'touches', { value: [{ clientX: startX, clientY: y }] });
  card.dispatchEvent(startEvent);

  const endEvent = new Event('touchend', { bubbles: true, cancelable: true });
  Object.defineProperty(endEvent, 'changedTouches', { value: [{ clientX: endX, clientY: y }] });
  card.dispatchEvent(endEvent);

  window.setTimeout(syncDesktopCarouselHint, 0);
}

function syncDesktopCarouselHint() {
  if (!window.matchMedia('(min-width: 721px)').matches) return;
  const hint = document.querySelector('#home-now-swipe-hint');
  if (!hint || hint.hidden) return;
  const text = hint.textContent || '';
  const prefix = text.split('·')[0]?.trim();
  hint.textContent = `${prefix}${prefix ? ' · ' : ''}use as setas para trocar de aluno`;
}

function renderDaySummary(state) {
  const total = Math.max(
    state.scheduleEntries.length,
    state.completedCount + state.liveCount + state.overdueCount
  );

  setTextIfChanged('#home-day-completed', String(state.completedCount));
  setTextIfChanged('#home-day-live', String(state.liveCount));
  setTextIfChanged('#home-day-overdue', String(state.overdueCount));

  const completedPercent = total ? Math.min(100, state.completedCount / total * 100) : 0;
  const livePercent = total ? Math.min(100 - completedPercent, state.liveCount / total * 100) : 0;
  const overduePercent = total ? Math.min(100 - completedPercent - livePercent, state.overdueCount / total * 100) : 0;

  setWidth('#home-day-progress-done', completedPercent);
  setWidth('#home-day-progress-live', livePercent);
  setWidth('#home-day-progress-overdue', overduePercent);
}

function renderTodayUpcoming(entries, state) {
  const list = document.querySelector('#home-upcoming-list');
  if (!list) return;

  const upcoming = getTodayUpcoming(entries, state).slice(0, 3);
  const html = upcoming.length
    ? upcoming.map(entry => `
        <a class="home-upcoming-item" href="${escapeHtml(entry.href)}" data-fsfit-today-only="1">
          <div class="home-upcoming-time">
            <small>Hoje</small>
            <strong>${escapeHtml(formatTime(entry.time))}</strong>
          </div>
          <div class="home-upcoming-main">
            <strong>${escapeHtml(entry.name)}</strong>
            <span>${escapeHtml(entry.workout || 'Atendimento agendado')}</span>
          </div>
          <span class="home-upcoming-arrow" aria-hidden="true">›</span>
        </a>`).join('')
    : '<p class="home-upcoming-empty" data-fsfit-today-only="1">Nenhum atendimento restante hoje.</p>';

  if (list.innerHTML !== html) list.innerHTML = html;
}

function renderTodayHero(entries, state) {
  const liveRows = document.querySelectorAll('#live-students-list [data-open-live-session]');
  if (liveRows.length) return;

  const next = getTodayUpcoming(entries, state)[0];
  const personRow = document.querySelector('.home-now-person');
  const action = document.querySelector('#home-now-action');
  const indicators = document.querySelector('#home-now-indicators');
  const hint = document.querySelector('#home-now-swipe-hint');

  if (next) {
    setTextIfChanged('#home-now-icon', '◷');
    setTextIfChanged('#home-now-title', next.name);
    setTextIfChanged('#home-now-status', `Hoje${next.time ? ` às ${formatTime(next.time)}` : ''}`);
    if (personRow) personRow.hidden = false;
    setTextIfChanged('#home-now-person-text', 'Próximo atendimento');
    setTextIfChanged('#home-now-meta', next.workout || 'Atendimento agendado');
    if (action) {
      action.hidden = false;
      action.textContent = 'Ver atendimento  →';
      action.dataset.mode = 'appointment';
      action.dataset.href = next.href;
      delete action.dataset.sessionId;
    }
  } else {
    setTextIfChanged('#home-now-icon', '✓');
    setTextIfChanged('#home-now-title', 'Tudo em dia por agora');
    setTextIfChanged('#home-now-status', 'Nenhum atendimento restante hoje.');
    if (personRow) personRow.hidden = false;
    setTextIfChanged('#home-now-person-text', 'Seu dia está organizado');
    setTextIfChanged('#home-now-meta', 'Os próximos compromissos aparecerão amanhã.');
    if (action) {
      action.hidden = true;
      delete action.dataset.mode;
      delete action.dataset.sessionId;
      delete action.dataset.href;
    }
  }

  if (indicators) {
    indicators.hidden = true;
    indicators.innerHTML = '';
  }
  if (hint) hint.hidden = true;
}

function getTodayUpcoming(entries, state) {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return entries
    .filter(entry => {
      const minutes = timeToMinutes(entry.time);
      if (minutes == null || minutes < nowMinutes) return false;
      if (state.completedStudentIds.has(entry.studentId)) return false;
      if (state.liveStudentIds.has(entry.studentId)) return false;
      return true;
    })
    .sort(compareScheduleEntries);
}

function calculateOverdue(entries, sessionStatus) {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return entries.filter(entry => {
    const minutes = timeToMinutes(entry.time);
    if (minutes == null || minutes >= nowMinutes) return false;
    if (sessionStatus.completedStudentIds.has(entry.studentId)) return false;
    if (sessionStatus.liveStudentIds.has(entry.studentId)) return false;
    return true;
  }).length;
}

async function loadTodaySessionStatus(personalId) {
  const start = startOfDay(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [completedResult, liveResult] = await Promise.all([
    supabase
      .from('sessoes_treino')
      .select('id,aluno_id,status,finalizada_at')
      .eq('personal_id', personalId)
      .eq('status', 'finalizada')
      .gte('finalizada_at', start.toISOString())
      .lt('finalizada_at', end.toISOString()),
    supabase.rpc('listar_sessoes_em_aula_personal')
  ]);

  if (completedResult.error) throw completedResult.error;
  if (liveResult.error) throw liveResult.error;

  const completedRows = completedResult.data || [];
  const liveRows = (liveResult.data || []).filter(row => row.status === 'em_aula');

  return {
    completedCount: completedRows.length,
    completedStudentIds: new Set(completedRows.map(row => String(row.aluno_id || '')).filter(Boolean)),
    liveCount: liveRows.length,
    liveStudentIds: new Set(liveRows.map(row => String(row.aluno_id || '')).filter(Boolean))
  };
}

async function loadTodayAgenda(personalId) {
  const today = startOfDay(new Date());
  const todayValue = formatDateValue(today);
  const todayDay = today.getDay();

  const [workoutsResult, appointmentsResult, cancellationsResult] = await Promise.all([
    supabase
      .from('treinos')
      .select('id,nome,dias_semana,status,updated_at,alunos!inner(id,nome,periodo_aula,horario_aula,local_aula)')
      .eq('personal_id', personalId)
      .eq('status', 'ativo')
      .order('updated_at', { ascending: false }),
    supabase
      .from('agenda_agendamentos')
      .select('id,aluno_id,treino_id,data,horario,local,titulo,alunos(id,nome),treinos(id,nome)')
      .eq('personal_id', personalId)
      .eq('data', todayValue)
      .order('horario'),
    supabase
      .from('agenda_cancelamentos')
      .select('aluno_id,data')
      .eq('personal_id', personalId)
      .eq('data', todayValue)
  ]);

  if (workoutsResult.error) throw workoutsResult.error;
  if (appointmentsResult.error) throw appointmentsResult.error;
  if (cancellationsResult.error) throw cancellationsResult.error;

  const manualEntries = (appointmentsResult.data || []).map(row => ({
    date: todayValue,
    studentId: String(row.aluno_id || ''),
    name: row.alunos?.nome || 'Aluno',
    time: row.horario,
    workout: row.titulo || row.treinos?.nome || 'Agendamento',
    location: row.local || '',
    manual: true
  }));

  const manualStudentIds = new Set(manualEntries.map(entry => entry.studentId));
  const cancellations = new Set((cancellationsResult.data || []).map(row => String(row.aluno_id || '')));
  const recurring = [];
  const seen = new Set();

  (workoutsResult.data || []).forEach(workout => {
    const student = workout.alunos;
    if (!student?.id || !Array.isArray(workout.dias_semana)) return;
    if (!workout.dias_semana.map(Number).includes(todayDay)) return;

    const studentId = String(student.id);
    if (seen.has(studentId) || manualStudentIds.has(studentId) || cancellations.has(studentId)) return;
    seen.add(studentId);

    recurring.push({
      date: todayValue,
      studentId,
      name: student.nome || 'Aluno',
      time: student.horario_aula,
      workout: workout.nome || 'Treino ativo',
      location: student.local_aula || '',
      manual: false
    });
  });

  return [...recurring, ...manualEntries]
    .filter(entry => entry.studentId && !cancellations.has(entry.studentId))
    .map(entry => ({
      ...entry,
      href: `ficha-aluno.html?id=${encodeURIComponent(entry.studentId)}&origem=agenda&data=${encodeURIComponent(todayValue)}`
    }))
    .sort(compareScheduleEntries);
}

function compareScheduleEntries(a, b) {
  const aMinutes = timeToMinutes(a.time);
  const bMinutes = timeToMinutes(b.time);
  if (aMinutes == null && bMinutes == null) return String(a.name).localeCompare(String(b.name), 'pt-BR');
  if (aMinutes == null) return 1;
  if (bMinutes == null) return -1;
  return aMinutes - bMinutes || String(a.name).localeCompare(String(b.name), 'pt-BR');
}

function timeToMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : '—';
}

function formatDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function setTextIfChanged(selector, value) {
  const element = document.querySelector(selector);
  if (element && element.textContent !== value) element.textContent = value;
}

function setWidth(selector, value) {
  const element = document.querySelector(selector);
  if (!element) return;
  const width = `${Math.max(0, value)}%`;
  if (element.style.width !== width) element.style.width = width;
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function waitForElement(selector, timeout = 5000) {
  const existing = document.querySelector(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise(resolve => {
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (!element) return;
      observer.disconnect();
      resolve(element);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector(selector));
    }, timeout);
  });
}

function injectStyles() {
  if (document.querySelector('#painel-home-day-controls-styles')) return;
  const style = document.createElement('style');
  style.id = 'painel-home-day-controls-styles';
  style.textContent = `
    .home-day-dot.overdue{background:#ff8a3d!important}
    .home-day-progress-overdue{background:#ff8a3d}

    .home-now-nav{position:absolute;z-index:4;top:57%;display:grid;place-items:center;width:44px;height:44px;padding:0;border:1px solid rgba(177,255,0,.38);border-radius:50%;background:rgba(8,16,21,.82);color:var(--primary);font:inherit;font-size:2rem;font-weight:500;line-height:1;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.28);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transform:translateY(-50%);transition:border-color .18s ease,background .18s ease,transform .18s ease}
    .home-now-nav:hover,.home-now-nav:focus-visible{border-color:var(--primary);background:rgba(177,255,0,.12);outline:none;transform:translateY(-50%) scale(1.05)}
    .home-now-nav:active{transform:translateY(-50%) scale(.96)}
    .home-now-nav-previous{left:18px}
    .home-now-nav-next{right:18px}
    .home-now-nav[hidden]{display:none!important}

    @media(min-width:721px){
      .home-now-card.has-desktop-live-navigation .home-now-content{padding-inline:52px}
      .home-now-card.has-desktop-live-navigation .home-now-action{width:calc(100% - 104px);margin-left:52px}
    }

    @media(max-width:720px){
      .home-now-nav{display:none!important}
    }
  `;
  document.head.appendChild(style);
}
