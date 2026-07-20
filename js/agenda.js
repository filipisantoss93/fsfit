import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('agenda');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const grid = document.querySelector('#agenda-grid');
const message = document.querySelector('#agenda-message');
const dateInput = document.querySelector('#agenda-date');
const dateDisplayButton = document.querySelector('#agenda-date-display');
const prevDayButton = document.querySelector('#agenda-prev-day');
const nextDayButton = document.querySelector('#agenda-next-day');
const todayButton = document.querySelector('#agenda-today');
const todayRow = document.querySelector('#agenda-today-row');

const dayLabels = {
  0: 'Domingo',
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado'
};

let agendaEntries = [];

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : '—';
}

function timeToMinutes(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateValue(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return new Date();
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return new Date();
  return date;
}

function isSameDate(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function monthName(date) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(date);
}

function formatDateDisplay(date) {
  const prefix = isSameDate(date, new Date()) ? 'Hoje, ' : '';
  return `${prefix}${date.getDate()} de ${monthName(date)}`;
}

function formatDayHeading(date) {
  return `${dayLabels[date.getDay()]}, ${date.getDate()} de ${monthName(date)}`;
}

function normalizeEntries(workouts = []) {
  const entries = [];
  const seen = new Set();

  workouts.forEach(workout => {
    const student = workout.alunos;
    if (!student?.id || !Array.isArray(workout.dias_semana)) return;

    workout.dias_semana.forEach(day => {
      const dayNumber = Number(day);
      if (!Number.isInteger(dayNumber) || dayNumber < 0 || dayNumber > 6) return;

      const key = `${student.id}:${dayNumber}`;
      if (seen.has(key)) return;
      seen.add(key);

      entries.push({
        day: dayNumber,
        id: student.id,
        nome: student.nome,
        periodo_aula: student.periodo_aula,
        horario_aula: student.horario_aula,
        local_aula: student.local_aula,
        treino_nome: workout.nome
      });
    });
  });

  return entries;
}

function buildStudentRecordUrl(studentId, date) {
  const params = new URLSearchParams({
    id: studentId,
    origem: 'agenda',
    data: formatDateValue(date)
  });
  return `ficha-aluno.html?${params.toString()}`;
}

function getStatusIndexes(entries, date) {
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

function renderAgendaForDate(date) {
  const dayNumber = date.getDay();
  const dayEntries = agendaEntries
    .filter(entry => entry.day === dayNumber)
    .sort((a, b) => {
      if (!a.horario_aula && !b.horario_aula) return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
      if (!a.horario_aula) return 1;
      if (!b.horario_aula) return -1;
      return String(a.horario_aula).localeCompare(String(b.horario_aula));
    });

  const { nowIndex, nextIndex } = getStatusIndexes(dayEntries, date);

  const content = dayEntries.length
    ? dayEntries.map((entry, index) => {
        const timeLabel = formatTime(entry.horario_aula);
        const isNow = index === nowIndex;
        const isNext = index === nextIndex;
        const status = isNow
          ? '<span class="agenda-status now">AGORA</span>'
          : isNext
            ? '<span class="agenda-status next">PRÓXIMO</span>'
            : '';
        const detail = [entry.local_aula || 'Local não informado', entry.treino_nome || 'Treino ativo'].filter(Boolean).join(' · ');

        return `
          <a class="agenda-entry${isNow ? ' is-now' : ''}${isNext ? ' is-next' : ''}" href="${buildStudentRecordUrl(entry.id, date)}" aria-label="Abrir ficha de ${esc(entry.nome)}">
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

function updateDateControls(date) {
  dateDisplayButton.textContent = formatDateDisplay(date);
  const isToday = isSameDate(date, new Date());
  todayRow.hidden = isToday;
}

function selectDate(date) {
  const value = formatDateValue(date);
  dateInput.value = value;
  updateDateControls(date);
  renderAgendaForDate(date);
  history.replaceState({}, '', `agenda.html?data=${encodeURIComponent(value)}`);
}

function shiftSelectedDate(days) {
  const date = parseDateValue(dateInput.value);
  date.setDate(date.getDate() + days);
  selectDate(date);
}

async function loadAgenda() {
  const { data, error } = await supabase
    .from('treinos')
    .select('id,nome,dias_semana,status,alunos!inner(id,nome,periodo_aula,horario_aula,local_aula)')
    .eq('personal_id', session.user.id)
    .eq('status', 'ativo')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error(error);
    grid.innerHTML = '';
    showMessage(message, 'Não foi possível carregar a agenda.', 'error');
    return;
  }

  agendaEntries = normalizeEntries(data || []);
  const requestedDate = new URLSearchParams(location.search).get('data');
  selectDate(requestedDate ? parseDateValue(requestedDate) : new Date());
}

dateDisplayButton.addEventListener('click', () => {
  try {
    if (typeof dateInput.showPicker === 'function') dateInput.showPicker();
    else dateInput.click();
  } catch (_) {
    dateInput.focus();
    dateInput.click();
  }
});

dateInput.addEventListener('change', () => selectDate(parseDateValue(dateInput.value)));
prevDayButton.addEventListener('click', () => shiftSelectedDate(-1));
nextDayButton.addEventListener('click', () => shiftSelectedDate(1));
todayButton.addEventListener('click', () => selectDate(new Date()));

setInterval(() => {
  if (dateInput.value) renderAgendaForDate(parseDateValue(dateInput.value));
}, 60000);

await loadAgenda();
