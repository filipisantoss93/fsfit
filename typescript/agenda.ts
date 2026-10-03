// @ts-ignore Existing browser JavaScript module.
import { supabase } from './supabase.js';
// @ts-ignore Existing browser JavaScript module.
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('agenda');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const grid = document.querySelector<HTMLElement>('#agenda-grid')!;
const message = document.querySelector<HTMLElement>('#agenda-message')!;
const dateInput = document.querySelector<HTMLInputElement>('#agenda-date')!;
const dateDisplayButton = document.querySelector<HTMLButtonElement>('#agenda-date-display')!;
const prevDayButton = document.querySelector<HTMLButtonElement>('#agenda-prev-day')!;
const nextDayButton = document.querySelector<HTMLButtonElement>('#agenda-next-day')!;
const todayButton = document.querySelector<HTMLButtonElement>('#agenda-today')!;
const todayRow = document.querySelector<HTMLElement>('#agenda-today-row')!;

type JsonRecord = Record<string, any>;
type AgendaEntry = JsonRecord;

const dayLabels: Record<number, string> = {
  0: 'Domingo',
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado'
};

let agendaEntries: AgendaEntry[] = [];
let workoutRecords: JsonRecord[] = [];
let manualAppointments: AgendaEntry[] = [];
let cancelledStudentIds = new Set<string>();
let liveStudentIds = new Set<string>();
let studentRecords: JsonRecord[] = [];
let scheduleReturnFocus: HTMLElement | null = null;
let dateRequestId = 0;

const scheduleUi = ensureScheduleUi();
const scheduleModal = scheduleUi.modal;
const scheduleForm = scheduleUi.form;
const scheduleStudent = scheduleForm.querySelector<HTMLSelectElement>('[name="aluno_id"]')!;

const scheduleDate = scheduleForm.querySelector<HTMLInputElement>('[name="data"]')!;


const scheduleTime = scheduleForm.querySelector<HTMLInputElement>('[name="horario"]')!;
const scheduleLocation = scheduleForm.querySelector<HTMLInputElement>('[name="local"]')!;
const scheduleTitle = scheduleForm.querySelector<HTMLInputElement>('[name="titulo"]')!;
const scheduleSubmit = scheduleForm.querySelector<HTMLButtonElement>('#schedule-submit')!;

function esc(value: unknown = ''): string {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function withLoadingTimeout<T>(request: PromiseLike<T>, timeoutMs = 12000): Promise<T> {
  let timer = 0;
  const timeout = new Promise<T>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error('A solicitação demorou demais.')), timeoutMs);
  });
  return Promise.race([Promise.resolve(request), timeout]).finally(() => window.clearTimeout(timer));
}

function formatTime(value: unknown): string {
  return value ? String(value).slice(0, 5) : '—';
}

function timeToMinutes(value: unknown): number | null {
  if (!value) return null;
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateValue(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return new Date();
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return new Date();
  return date;
}

function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function monthName(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(date);
}

function formatDateDisplay(date: Date): string {
  const prefix = isSameDate(date, new Date()) ? 'Hoje, ' : '';
  return `${prefix}${date.getDate()} de ${monthName(date)}`;
}

function formatDayHeading(date: Date): string {
  return `${dayLabels[date.getDay()]}, ${date.getDate()} de ${monthName(date)}`;
}

function normalizeWeekday(value: unknown, legacyTrainingDay = false): number | null {
  if (typeof value === 'number' || /^\d+$/.test(String(value ?? ''))) {
    const number = Number(value);
    if (legacyTrainingDay) return number === 7 ? 0 : number >= 1 && number <= 6 ? number : number === 0 ? 0 : null;
    return number >= 0 && number <= 6 ? number : null;
  }
  const day = String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const aliases: Record<string, number> = { domingo: 0, dom: 0, segunda: 1, seg: 1, terca: 2, ter: 2, quarta: 3, qua: 3, quinta: 4, qui: 4, sexta: 5, sex: 5, sabado: 6, sab: 6 };
  return aliases[day] ?? null;
}
function normalizeEntries(workouts: JsonRecord[] = [], students: JsonRecord[] = []): AgendaEntry[] {
  const byId = new Map<string, JsonRecord>();
  students.forEach(student => { if (student?.id) byId.set(String(student.id), student); });
  workouts.forEach(workout => { const s = workout.alunos; if (s?.id && !byId.has(String(s.id))) byId.set(String(s.id), s); });
  const workoutByStudent = new Map<string, JsonRecord>();
  workouts.forEach(workout => { const id = String(workout.alunos?.id || ''); if (id && !workoutByStudent.has(id)) workoutByStudent.set(id, workout); });
  const entries: AgendaEntry[] = [];
  const seen = new Set<string>();
  byId.forEach((student, id) => {
    const days = Array.isArray(student.dias_semana) && student.dias_semana.length ? student.dias_semana : Array.isArray(student.dias_aula) && student.dias_aula.length ? student.dias_aula : [];
    const workout = workoutByStudent.get(id);
    const fallback = !days.length && Array.isArray(workout?.dias_semana) ? workout.dias_semana : [];
    const normalized = days.length ? days.map(day => normalizeWeekday(day)).filter((day): day is number => day !== null) : fallback.map(day => normalizeWeekday(day, true)).filter((day): day is number => day !== null);
    normalized.forEach(day => {
      const key = `${id}:${day}`;
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({ day, id: student.id, nome: student.nome, periodo_aula: student.periodo_aula, horario_aula: student.horario_aula, local_aula: student.local_aula, treino_id: workout?.id || null, treino_nome: days.length ? 'Rotina semanal' : (workout?.nome || 'Rotina semanal'), manual: false });
    });
  });
  return entries;
}

function normalizeManualAppointment(row: JsonRecord): AgendaEntry {
  return {
    day: parseDateValue(row.data).getDay(),
    id: row.aluno_id,
    nome: row.alunos?.nome || 'Aluno',
    periodo_aula: null,
    horario_aula: row.horario,
    local_aula: row.local,
    treino_id: row.treino_id,
    treino_nome: row.titulo || row.treinos?.nome || 'Agendamento',
    manual: true,
    appointment_id: row.id
  };
}

function buildStudentRecordUrl(studentId: string | number, date: Date): string {
  const params = new URLSearchParams({
    id: String(studentId),
    origem: 'agenda',
    data: formatDateValue(date)
  });
  return `ficha-aluno.html?${params.toString()}`;
}

function getStatusIndexes(entries: AgendaEntry[], date: Date): { nowIndex: number; nextIndex: number } {
  if (!isSameDate(date, new Date())) return { nowIndex: -1, nextIndex: -1 };

  const current = new Date();
  const nowMinutes = current.getHours() * 60 + current.getMinutes();
  let nowIndex = -1;
  let nextIndex = -1;

  entries.forEach((entry, index) => {
    const entryMinutes = timeToMinutes(entry.horario_aula);
    if (entryMinutes == null) return;

    if (entryMinutes <= nowMinutes && nowMinutes - entryMinutes < 60) nowIndex = index;
    if (nextIndex === -1 && entryMinutes > nowMinutes) nextIndex = index;
  });

  return { nowIndex, nextIndex };
}

function combinedEntriesForDate(date: Date): AgendaEntry[] {
  const dayNumber = date.getDay();
  const manualStudentIds = new Set(manualAppointments.map(entry => String(entry.id)));

  const recurring = agendaEntries.filter(entry =>
    entry.day === dayNumber &&
    !cancelledStudentIds.has(String(entry.id)) &&
    !manualStudentIds.has(String(entry.id))
  );

  return [...recurring, ...manualAppointments]
    .sort((a, b) => {
      if (!a.horario_aula && !b.horario_aula) return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
      if (!a.horario_aula) return 1;
      if (!b.horario_aula) return -1;
      const timeCompare = String(a.horario_aula).localeCompare(String(b.horario_aula));
      return timeCompare || String(a.nome).localeCompare(String(b.nome), 'pt-BR');
    });
}

function renderAgendaForDate(date: Date): void {
  const dayEntries = combinedEntriesForDate(date);
  const { nowIndex, nextIndex } = getStatusIndexes(dayEntries, date);
  const today = isSameDate(date, new Date());

  const content = dayEntries.length
    ? dayEntries.map((entry, index) => {
        const timeLabel = formatTime(entry.horario_aula);
        const inClass = today && liveStudentIds.has(String(entry.id));
        const isNow = !inClass && index === nowIndex;
        const isNext = !inClass && index === nextIndex;
        const status = inClass
          ? '<span class="agenda-status in-class">EM AULA</span>'
          : isNow
            ? '<span class="agenda-status now">AGORA</span>'
            : isNext
              ? '<span class="agenda-status next">PRÓXIMO</span>'
              : '';
        const detail = [entry.local_aula || 'Local não informado', entry.treino_nome || 'Treino ativo'].filter(Boolean).join(' · ');

        return `
          <a class="agenda-entry${inClass ? ' is-in-class' : ''}${isNow ? ' is-now' : ''}${isNext ? ' is-next' : ''}" href="${buildStudentRecordUrl(entry.id, date)}" aria-label="Abrir ficha de ${esc(entry.nome)}">
            <div class="agenda-time">${timeLabel}</div>
            <div class="agenda-entry-main">
              <div class="agenda-entry-title-row"><strong>${esc(entry.nome)}</strong>${status}</div>
              <small>${esc(detail)}</small>
            </div>
            <span class="agenda-arrow" aria-hidden="true">›</span>
          </a>`;
      }).join('')
    : '<p class="agenda-empty">Nenhum treino programado para este dia.</p>';

  grid.innerHTML = `
    <article class="card agenda-day">
      <div class="agenda-day-heading">
        <h2>${esc(formatDayHeading(date))}</h2>
        <span>${dayEntries.length} ${dayEntries.length === 1 ? 'aluno' : 'alunos'}</span>
      </div>
      <div class="agenda-day-list">${content}</div>
    </article>`;
}

function updateDateControls(date: Date): void {
  dateDisplayButton.textContent = formatDateDisplay(date);
  const isToday = isSameDate(date, new Date());
  todayRow.hidden = isToday;
}

async function loadDateSpecificData(date: Date): Promise<{ appointments: AgendaEntry[]; cancelledIds: Set<string> }> {
  const value = formatDateValue(date);
  const [appointmentsResult, cancellationsResult] = await withLoadingTimeout(Promise.all([
    supabase
      .from('agenda_agendamentos')
      .select('id,aluno_id,treino_id,data,horario,local,titulo,alunos(id,nome),treinos(id,nome)')
      .eq('personal_id', session.user.id)
      .eq('data', value)
      .order('horario'),
    supabase
      .from('agenda_cancelamentos')
      .select('aluno_id')
      .eq('personal_id', session.user.id)
      .eq('data', value)
  ]));

  if (appointmentsResult.error) console.error('Erro ao carregar agendamentos manuais:', appointmentsResult.error);
  if (cancellationsResult.error) console.error('Erro ao carregar cancelamentos da agenda:', cancellationsResult.error);

  return {
    appointments: (appointmentsResult.data || []).map(normalizeManualAppointment),
    cancelledIds: new Set((cancellationsResult.data || []).map((row: JsonRecord) => String(row.aluno_id || '')).filter(Boolean))
  };
}

async function selectDate(date: Date): Promise<void> {
  const value = formatDateValue(date);
  const requestId = ++dateRequestId;
  dateInput.value = value;
  updateDateControls(date);
  manualAppointments = [];
  cancelledStudentIds = new Set();
  renderAgendaForDate(date);
  history.replaceState({}, '', `agenda.html?data=${encodeURIComponent(value)}`);

  try {
    const result = await loadDateSpecificData(date);
    if (requestId !== dateRequestId || dateInput.value !== value) return;
    manualAppointments = result.appointments;
    cancelledStudentIds = result.cancelledIds;
    renderAgendaForDate(date);
  } catch (error) {
    console.error('Erro ao carregar detalhes da data da agenda:', error);
    if (requestId === dateRequestId) showMessage(message, 'Não foi possível carregar os agendamentos manuais. Os treinos ativos continuam visíveis.', 'error');
  }
}

function shiftSelectedDate(days: number): void {
  const date = parseDateValue(dateInput.value);
  date.setDate(date.getDate() + days);
  selectDate(date).catch(console.error);
}

async function loadLiveStudents(): Promise<void> {
  const { data, error } = await supabase.rpc('listar_sessoes_em_aula_personal');
  if (error) {
    console.error('Não foi possível carregar alunos em aula:', error);
    return;
  }
  liveStudentIds = new Set(
    (Array.isArray(data) ? data : [])
      .filter(row => row.status === 'em_aula')
      .map(row => String(row.aluno_id || ''))
      .filter(Boolean)
  );
  if (dateInput.value) renderAgendaForDate(parseDateValue(dateInput.value));
}

async function loadStudents(): Promise<void> {
  const { data, error } = await supabase
    .from('alunos')
    .select('id,nome,periodo_aula,horario_aula,local_aula,dias_semana,dias_aula,status')
    .eq('personal_id', session.user.id)
    .eq('status', 'ativo')
    .order('nome');

  if (error) {
    console.error('Erro ao carregar alunos para agendamento:', error);
    return;
  }

  studentRecords = (data || []) as JsonRecord[];
  scheduleStudent.innerHTML = '<option value="">Selecione um aluno</option>' + studentRecords
    .map(student => `<option value="${esc(student.id)}">${esc(student.nome)}</option>`)
    .join('');
}

function openScheduleModal(): void {
  scheduleReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const selectedDate = dateInput.value || formatDateValue(new Date());
  scheduleForm.reset();
  scheduleDate.value = selectedDate;
  scheduleModal.classList.add('open');
  scheduleModal.setAttribute('aria-hidden', 'false');
  (window as any).FSFitModalManager?.sync();
  requestAnimationFrame(() => scheduleModal.querySelector<HTMLElement>('.agenda-modal-close')?.focus());
}

function closeScheduleModal(): void {
  scheduleModal.classList.remove('open');
  scheduleModal.setAttribute('aria-hidden', 'true');
  (window as any).FSFitModalManager?.sync();
  scheduleReturnFocus?.focus({ preventScroll: true });
  scheduleReturnFocus = null;
}

async function saveAppointment(event: Event): Promise<void> {
  event.preventDefault();
  const studentId = scheduleStudent.value;
  if (!studentId) return;

  scheduleSubmit.disabled = true;
  const originalText = scheduleSubmit.textContent;
  scheduleSubmit.textContent = 'Salvando...';

  try {
    const payload = {
      personal_id: session.user.id,
      aluno_id: studentId,
      treino_id: null,
      data: scheduleDate.value,
      horario: scheduleTime.value || null,
      local: scheduleLocation.value.trim() || null,
      titulo: scheduleTitle.value.trim() || null
    };
    const { error } = await supabase.from('agenda_agendamentos').insert(payload);
    if (error) throw error;
    closeScheduleModal();
    showMessage(message, 'Agendamento válido somente nesta data salvo.');
    if (scheduleDate.value === dateInput.value) await selectDate(parseDateValue(dateInput.value));
  } catch (error) {
    console.error('Erro ao agendar aluno:', error);
    showMessage(message, error instanceof Error && error.message ? error.message : 'Não foi possível salvar o agendamento.', 'error');
  } finally {
    scheduleSubmit.disabled = false;
    scheduleSubmit.textContent = originalText;
  }
}

async function loadAgenda(): Promise<void> {
  const initialDate = new URLSearchParams(location.search).get('data');
  const selectedDate = initialDate ? parseDateValue(initialDate) : new Date();
  dateInput.value = formatDateValue(selectedDate);
  updateDateControls(selectedDate);
  grid.innerHTML = '<article class="card agenda-loading-card" role="status">Carregando agenda…</article>';

  const query = supabase
    .from('treinos')
    .select('id,nome,dias_semana,status,alunos!inner(id,nome,periodo_aula,horario_aula,local_aula,dias_semana,dias_aula)')
    .eq('personal_id', session.user.id)
    .eq('status', 'ativo')
    .order('updated_at', { ascending: false });
  let result: Awaited<typeof query>;
  try {
    result = await withLoadingTimeout(query);
  } catch (error) {
    console.error('Erro ao carregar treinos da agenda:', error);
    grid.innerHTML = '<article class="card agenda-empty" role="alert">A agenda demorou para carregar. Atualize a página para tentar novamente.</article>';
    return showMessage(message, 'A agenda demorou para carregar.', 'error');
  }
  const { data, error } = result;

  if (error) {
    console.error(error);
    grid.innerHTML = '';
    showMessage(message, 'Não foi possível carregar a agenda.', 'error');
    return;
  }

  workoutRecords = (data || []) as JsonRecord[];
  await loadStudents();
  agendaEntries = normalizeEntries(workoutRecords, studentRecords);
  void loadLiveStudents();

  await selectDate(selectedDate);
}

function ensureScheduleUi(): { modal: HTMLElement; form: HTMLFormElement } {
  const header = document.querySelector<HTMLElement>('.agenda-header');
  const manageLink = document.querySelector<HTMLElement>('.agenda-manage-link');
  let actions = document.querySelector<HTMLElement>('.agenda-header-actions');

  if (!actions && header && manageLink) {
    actions = document.createElement('div');
    actions.className = 'agenda-header-actions';
    header.insertBefore(actions, manageLink);
    actions.appendChild(manageLink);
  }

  let openButton = document.querySelector<HTMLButtonElement>('#open-schedule-modal');
  if (!openButton && actions) {
    openButton = document.createElement('button');
    openButton.id = 'open-schedule-modal';
    openButton.className = 'btn btn-primary agenda-schedule-button';
    openButton.type = 'button';
    openButton.textContent = '+ Agendar aluno';
    actions.insertBefore(openButton, actions.firstChild);
  }

  let modal = document.querySelector<HTMLElement>('#schedule-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'schedule-modal';
    modal.className = 'agenda-modal';
    modal.dataset.modalRoot = 'true';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="agenda-modal-backdrop" data-close-schedule-modal></div>
      <section class="agenda-modal-card" data-modal-scroll role="dialog" aria-modal="true" aria-labelledby="schedule-modal-title">
        <button class="agenda-modal-close" type="button" data-close-schedule-modal aria-label="Fechar">×</button>
        <div class="agenda-modal-kicker">AGENDA</div>
        <h2 id="schedule-modal-title">Agendar aluno</h2>
                <form id="schedule-form">
          <p class="form-hint">Este agendamento vale somente nesta data. Para mudar a rotina semanal, edite o cadastro do aluno.</p>
          <div class="form-group"><label>Aluno *</label><select name="aluno_id" required><option value="">Selecione um aluno</option></select></div>
          <div class="grid grid-2">
            <div class="form-group"><label>Data *</label><input name="data" type="date" required></div>
            <div class="form-group"><label>Horário *</label><input name="horario" type="time" required></div>
          </div>
          <div class="form-group"><label>Local</label><input name="local" maxlength="140" placeholder="Ex.: Academia Central"></div>
          <div class="form-group"><label>Descrição</label><input name="titulo" maxlength="140" placeholder="Ex.: Avaliação, aula extra..."></div>
          <div class="agenda-modal-actions">
            <button class="btn btn-neutral" type="button" data-close-schedule-modal>Cancelar</button>
            <button id="schedule-submit" class="btn btn-primary" type="submit">Salvar nesta data</button>
          </div>
        </form>
      </section>`;
    document.body.appendChild(modal);
  }

  modal.dataset.modalRoot = 'true';
  modal.querySelector('.agenda-modal-card')?.setAttribute('data-modal-scroll', '');

  const form = modal.querySelector<HTMLFormElement>('#schedule-form')!;
  openButton?.addEventListener('click', openScheduleModal);
  modal.querySelectorAll('[data-close-schedule-modal]').forEach(button => button.addEventListener('click', closeScheduleModal));
  form?.addEventListener('submit', saveAppointment);

  return { modal, form };
}

scheduleStudent.addEventListener('change', () => {
  const student = studentRecords.find(item => String(item.id) === String(scheduleStudent.value));
  if (!student) return;
  if (!scheduleTime.value && student.horario_aula) scheduleTime.value = formatTime(student.horario_aula);
  if (!scheduleLocation.value && student.local_aula) scheduleLocation.value = student.local_aula;
});

dateDisplayButton.addEventListener('click', () => {
  try {
    if (typeof dateInput.showPicker === 'function') dateInput.showPicker();
    else dateInput.click();
  } catch (_) {
    dateInput.focus();
    dateInput.click();
  }
});

dateInput.addEventListener('change', () => selectDate(parseDateValue(dateInput.value)).catch(console.error));
prevDayButton.addEventListener('click', () => shiftSelectedDate(-1));
nextDayButton.addEventListener('click', () => shiftSelectedDate(1));
todayButton.addEventListener('click', () => selectDate(new Date()).catch(console.error));

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && scheduleModal.classList.contains('open')) closeScheduleModal();
});

setInterval(() => {
  if (dateInput.value) renderAgendaForDate(parseDateValue(dateInput.value));
}, 60000);

setInterval(() => {
  if (document.visibilityState === 'visible') loadLiveStudents().catch(console.error);
}, 15000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadLiveStudents().catch(console.error);
});

await loadAgenda();
