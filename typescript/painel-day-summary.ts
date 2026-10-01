// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { supabase } from './supabase.js';
// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { requireSession } from './layout.js';

interface DaySummary {
  completed: number;
  live: number;
  overdue: number;
}

interface AgendaEntry {
  studentId: string;
  name: string;
  time?: string | null;
  manual: boolean;
}

interface SessionRow {
  id?: string | number;
  aluno_id?: string | number | null;
  finalizada_at?: string | null;
  iniciado_at?: string | null;
  checkin_at?: string | null;
}

interface WorkoutAgendaRow {
  id?: string | number;
  nome?: string | null;
  dias_semana?: Array<number | string> | null;
  alunos?: { id?: string | number; nome?: string | null; horario_aula?: string | null } | null;
}

interface AppointmentRow {
  aluno_id?: string | number | null;
  horario?: string | null;
  alunos?: { nome?: string | null } | null;
}

interface CancellationRow {
  aluno_id?: string | number | null;
}

const homePanel = await waitForElement('#dashboard-home-panel');

if (homePanel) {
  const session = await requireSession();
  if (session) void initializeDaySummary(session);
}

async function initializeDaySummary(session: { user: { id: string | number } }): Promise<void> {
  configureSummaryMarkup();

  let currentSummary: DaySummary = { completed: 0, live: 0, overdue: 0 };
  let refreshRunning = false;
  let refreshAgain = false;
  let applyQueued = false;

  function queueApply(): void {
    if (applyQueued) return;
    applyQueued = true;
    queueMicrotask(() => {
      applyQueued = false;
      applySummary(currentSummary);
    });
  }

  async function refresh(): Promise<void> {
    if (refreshRunning) {
      refreshAgain = true;
      return;
    }

    refreshRunning = true;
    try {
      const now = new Date();
      const [agenda, sessions] = await Promise.all([
        loadTodayAgenda(String(session.user.id), now),
        loadTodaySessions(String(session.user.id), now)
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
        void refresh();
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
      liveRefreshTimer = window.setTimeout(() => void refresh(), 40);
    }).observe(liveList, { childList: true, subtree: true });
  }

  await refresh();

  window.setInterval(() => void refresh(), 30000);
  window.addEventListener('focus', () => void refresh());
  window.addEventListener('pageshow', () => void refresh());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh();
  });
}

function configureSummaryMarkup(): void {
  const legacyTotal = document.querySelector<HTMLElement>('#home-day-total');
  if (legacyTotal) {
    const item = legacyTotal.closest<HTMLElement>('span');
    if (item) {
      item.innerHTML = '<i class="home-day-dot overdue"></i><strong id="home-day-overdue">0</strong> atrasados';
    } else {
      legacyTotal.id = 'home-day-overdue';
    }
  }

  const progress = document.querySelector<HTMLElement>('.home-day-progress');
  if (progress && !progress.querySelector('#home-day-progress-overdue')) {
    const overdueBar = document.createElement('span');
    overdueBar.id = 'home-day-progress-overdue';
    overdueBar.className = 'home-day-progress-overdue';
    progress.appendChild(overdueBar);
  }

  const title = document.querySelector<HTMLElement>('.home-day-card .home-section-title');
  if (title) title.setAttribute('aria-label', 'Resumo somente do dia atual');
}

function applySummary(summary: DaySummary): void {
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

async function loadTodayAgenda(personalId: string, now = new Date()): Promise<AgendaEntry[]> {
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

  const appointments = (Array.isArray(appointmentsResult.data) ? appointmentsResult.data : []) as AppointmentRow[];
  const manualEntries: AgendaEntry[] = appointments.map(row => ({
    studentId: String(row.aluno_id || ''),
    name: row.alunos?.nome || 'Aluno',
    time: row.horario,
    manual: true
  }));
  const manualStudentIds = new Set(manualEntries.map(entry => entry.studentId));
  const cancellations = (Array.isArray(cancellationsResult.data) ? cancellationsResult.data : []) as CancellationRow[];
  const cancelledStudentIds = new Set(cancellations.map(row => String(row.aluno_id || '')).filter(Boolean));
  const recurringEntries: AgendaEntry[] = [];
  const seenStudents = new Set<string>();

  const workouts = (Array.isArray(workoutsResult.data) ? workoutsResult.data : []) as WorkoutAgendaRow[];
  workouts.forEach(workout => {
    const student = workout.alunos;
    const studentId = String(student?.id || '');
    if (!studentId || !Array.isArray(workout.dias_semana)) return;
    if (!workout.dias_semana.map(Number).includes(dayNumber)) return;
    if (seenStudents.has(studentId)) return;
    seenStudents.add(studentId);
    if (cancelledStudentIds.has(studentId) || manualStudentIds.has(studentId)) return;

    recurringEntries.push({
      studentId,
      name: student?.nome || 'Aluno',
      time: student?.horario_aula,
      manual: false
    });
  });

  return [...recurringEntries, ...manualEntries];
}

async function loadTodaySessions(personalId: string, now = new Date()): Promise<{ completed: SessionRow[]; live: SessionRow[] }> {
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

  return {
    completed: (Array.isArray(completedResult.data) ? completedResult.data : []) as SessionRow[],
    live: (Array.isArray(liveResult.data) ? liveResult.data : []) as SessionRow[]
  };
}

function observeWhenAvailable(selector: string, observer: MutationObserver, options: MutationObserverInit): void {
  const element = document.querySelector(selector);
  if (element) observer.observe(element, options);
}

function setTextIfChanged(selector: string, value: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element && element.textContent !== value) element.textContent = value;
}

function setWidthIfChanged(selector: string, value: number): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) return;
  const normalized = `${Math.max(0, Math.min(100, Math.round(value * 100) / 100))}%`;
  if (element.style.width !== normalized) element.style.width = normalized;
}

function timeToMinutes(value: unknown): number | null {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatDateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function waitForElement(selector: string, timeout = 5000): Promise<Element | null> {
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
