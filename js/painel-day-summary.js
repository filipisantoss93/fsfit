import { supabase } from './supabase.js';
import { requireSession } from './layout.js';

const homePanel = await waitForElement('#dashboard-home-panel');

if (homePanel) {
  const session = await requireSession();
  if (session) initializeDaySummary(session);
}

async function initializeDaySummary(session) {
  injectStyles();
  configureSummaryMarkup();

  let currentSummary = { completed: 0, live: 0, overdue: 0 };
  let refreshRunning = false;
  let refreshAgain = false;
  let applyQueued = false;

  function queueApply() {
    if (applyQueued) return;
    applyQueued = true;
    queueMicrotask(() => {
      applyQueued = false;
      applySummary(currentSummary);
    });
  }

  async function refresh() {
    if (refreshRunning) {
      refreshAgain = true;
      return;
    }

    refreshRunning = true;
    try {
      const now = new Date();
      const [agenda, sessions] = await Promise.all([
        loadTodayAgenda(session.user.id, now),
        loadTodaySessions(session.user.id, now)
      ]);

      const completedStudentIds = new Set(sessions.completed.map(item => String(item.aluno_id || '')).filter(Boolean));
      const liveStudentIds = new Set(sessions.live.map(item => String(item.aluno_id || '')).filter(Boolean));
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      const overdue = agenda.filter(entry => {
        const minutes = timeToMinutes(entry.time);
        if (minutes == null || minutes >= nowMinutes) return false;
        if (completedStudentIds.has(entry.studentId)) return false;
        if (liveStudentIds.has(entry.studentId)) return false;
        return true;
      }).length;

      currentSummary = {
        completed: completedStudentIds.size,
        live: liveStudentIds.size,
        overdue
      };

      applySummary(currentSummary);
    } catch (error) {
      console.error('Não foi possível atualizar o resumo do dia:', error);
      applySummary(currentSummary);
    } finally {
      refreshRunning = false;
      if (refreshAgain) {
        refreshAgain = false;
        refresh();
      }
    }
  }

  const summaryObserver = new MutationObserver(queueApply);
  observeWhenAvailable('#home-day-completed', summaryObserver, { childList: true, subtree: true, characterData: true });
  observeWhenAvailable('#home-day-live', summaryObserver, { childList: true, subtree: true, characterData: true });
  observeWhenAvailable('#home-day-progress-done', summaryObserver, { attributes: true, attributeFilter: ['style'] });
  observeWhenAvailable('#home-day-progress-live', summaryObserver, { attributes: true, attributeFilter: ['style'] });

  const liveList = document.querySelector('#live-students-list');
  if (liveList) {
    let liveRefreshTimer = 0;
    new MutationObserver(() => {
      window.clearTimeout(liveRefreshTimer);
      liveRefreshTimer = window.setTimeout(refresh, 40);
    }).observe(liveList, { childList: true, subtree: true });
  }

  await refresh();

  window.setInterval(refresh, 30000);
  window.addEventListener('focus', refresh);
  window.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
}

function configureSummaryMarkup() {
  const legacyTotal = document.querySelector('#home-day-total');
  if (legacyTotal) {
    const item = legacyTotal.closest('span');
    if (item) {
      item.innerHTML = '<i class="home-day-dot overdue"></i><strong id="home-day-overdue">0</strong> atrasados';
    } else {
      legacyTotal.id = 'home-day-overdue';
    }
  }

  const progress = document.querySelector('.home-day-progress');
  if (progress && !progress.querySelector('#home-day-progress-overdue')) {
    const overdueBar = document.createElement('span');
    overdueBar.id = 'home-day-progress-overdue';
    overdueBar.className = 'home-day-progress-overdue';
    progress.appendChild(overdueBar);
  }

  const title = document.querySelector('.home-day-card .home-section-title');
  if (title) title.setAttribute('aria-label', 'Resumo somente do dia atual');
}

function applySummary(summary) {
  configureSummaryMarkup();

  setTextIfChanged('#home-day-completed', String(summary.completed));
  setTextIfChanged('#home-day-live', String(summary.live));
  setTextIfChanged('#home-day-overdue', String(summary.overdue));

  const total = summary.completed + summary.live + summary.overdue;
  const completedPercent = total ? summary.completed / total * 100 : 0;
  const livePercent = total ? summary.live / total * 100 : 0;
  const overduePercent = total ? Math.max(0, 100 - completedPercent - livePercent) : 0;

  setWidthIfChanged('#home-day-progress-done', completedPercent);
  setWidthIfChanged('#home-day-progress-live', livePercent);
  setWidthIfChanged('#home-day-progress-overdue', overduePercent);
}

async function loadTodayAgenda(personalId, now = new Date()) {
  const dateValue = formatDateValue(now);
  const dayNumber = now.getDay();

  const [workoutsResult, appointmentsResult, cancellationsResult] = await Promise.all([
    supabase
      .from('treinos')
      .select('id,nome,dias_semana,status,updated_at,alunos!inner(id,nome,horario_aula)')
      .eq('personal_id', personalId)
      .eq('status', 'ativo')
      .order('updated_at', { ascending: false }),
    supabase
      .from('agenda_agendamentos')
      .select('id,aluno_id,data,horario,alunos(id,nome)')
      .eq('personal_id', personalId)
      .eq('data', dateValue)
      .order('horario'),
    supabase
      .from('agenda_cancelamentos')
      .select('aluno_id')
      .eq('personal_id', personalId)
      .eq('data', dateValue)
  ]);

  if (workoutsResult.error) throw workoutsResult.error;
  if (appointmentsResult.error) throw appointmentsResult.error;
  if (cancellationsResult.error) throw cancellationsResult.error;

  const manualEntries = (appointmentsResult.data || []).map(row => ({
    studentId: String(row.aluno_id || ''),
    name: row.alunos?.nome || 'Aluno',
    time: row.horario,
    manual: true
  }));
  const manualStudentIds = new Set(manualEntries.map(entry => entry.studentId));
  const cancelledStudentIds = new Set((cancellationsResult.data || []).map(row => String(row.aluno_id || '')).filter(Boolean));
  const recurringEntries = [];
  const seenStudents = new Set();

  (workoutsResult.data || []).forEach(workout => {
    const student = workout.alunos;
    const studentId = String(student?.id || '');
    if (!studentId || !Array.isArray(workout.dias_semana)) return;
    if (!workout.dias_semana.map(Number).includes(dayNumber)) return;
    if (seenStudents.has(studentId)) return;
    seenStudents.add(studentId);
    if (cancelledStudentIds.has(studentId) || manualStudentIds.has(studentId)) return;

    recurringEntries.push({
      studentId,
      name: student.nome || 'Aluno',
      time: student.horario_aula,
      manual: false
    });
  });

  return [...recurringEntries, ...manualEntries];
}

async function loadTodaySessions(personalId, now = new Date()) {
  const start = startOfDay(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [completedResult, liveResult] = await Promise.all([
    supabase
      .from('sessoes_treino')
      .select('id,aluno_id,finalizada_at')
      .eq('personal_id', personalId)
      .eq('status', 'finalizada')
      .gte('finalizada_at', startIso)
      .lt('finalizada_at', endIso),
    supabase
      .from('sessoes_treino')
      .select('id,aluno_id,iniciado_at,checkin_at')
      .eq('personal_id', personalId)
      .eq('status', 'em_aula')
  ]);

  if (completedResult.error) throw completedResult.error;
  if (liveResult.error) throw liveResult.error;

  const live = (liveResult.data || []).filter(row => {
    const timestamp = row.iniciado_at || row.checkin_at;
    if (!timestamp) return false;
    const value = new Date(timestamp);
    return value >= start && value < end;
  });

  return {
    completed: completedResult.data || [],
    live
  };
}

function observeWhenAvailable(selector, observer, options) {
  const element = document.querySelector(selector);
  if (element) observer.observe(element, options);
}

function setTextIfChanged(selector, value) {
  const element = document.querySelector(selector);
  if (element && element.textContent !== value) element.textContent = value;
}

function setWidthIfChanged(selector, value) {
  const element = document.querySelector(selector);
  if (!element) return;
  const normalized = `${Math.max(0, Math.min(100, Math.round(value * 100) / 100))}%`;
  if (element.style.width !== normalized) element.style.width = normalized;
}

function timeToMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function injectStyles() {
  if (document.querySelector('#painel-day-summary-styles')) return;
  const style = document.createElement('style');
  style.id = 'painel-day-summary-styles';
  style.textContent = `
    .home-day-dot.overdue{background:#ff5f67!important}
    .home-day-progress-overdue{display:block;height:100%;background:#ff5f67}
  `;
  document.head.appendChild(style);
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