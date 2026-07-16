import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('agenda');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const grid = document.querySelector('#agenda-grid');
const message = document.querySelector('#agenda-message');
const dateInput = document.querySelector('#agenda-date');
const prevDayButton = document.querySelector('#agenda-prev-day');
const nextDayButton = document.querySelector('#agenda-next-day');
const todayButton = document.querySelector('#agenda-today');

const dayLabels = {
  0: 'Domingo',
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado'
};

const periodLabels = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite'
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

function isHalfHourSlot(value) {
  if (!value) return false;
  const [hour, minute] = String(value).slice(0, 5).split(':').map(Number);
  return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && (minute === 0 || minute === 30);
}

function formatDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateValue(value) {
  if (!value) return new Date();
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatFullDate(date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(date);
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

  const content = dayEntries.length
    ? dayEntries.map(entry => {
        const validSlot = isHalfHourSlot(entry.horario_aula);
        const timeLabel = entry.horario_aula
          ? validSlot ? formatTime(entry.horario_aula) : `${formatTime(entry.horario_aula)} *`
          : '—';

        return `
          <a class="agenda-entry" href="ficha-aluno.html?id=${entry.id}">
            <div class="agenda-time">${timeLabel}</div>
            <div class="agenda-entry-main">
              <strong>${esc(entry.nome)}</strong>
              <span>${esc(entry.treino_nome || 'Treino ativo')}</span>
              <small>${esc(entry.horario_aula
                ? `${periodLabels[entry.periodo_aula] || 'Período não informado'} · ${entry.local_aula || 'Local não informado'}`
                : 'Horário não definido')}</small>
            </div>
            <span class="agenda-open">Abrir ficha →</span>
          </a>`;
      }).join('')
    : '<p class="agenda-empty">Nenhum treino programado para este dia.</p>';

  grid.innerHTML = `
    <article class="card agenda-day">
      <div class="agenda-day-heading">
        <div>
          <span class="agenda-day-label">${dayLabels[dayNumber]}</span>
          <h2>${formatFullDate(date)}</h2>
        </div>
        <span>${dayEntries.length} ${dayEntries.length === 1 ? 'aluno' : 'alunos'}</span>
      </div>
      <div class="agenda-day-list">${content}</div>
    </article>`;
}

function selectDate(date) {
  dateInput.value = formatDateValue(date);
  renderAgendaForDate(date);
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
  selectDate(new Date());

  const invalidTimes = agendaEntries.filter(entry => entry.horario_aula && !isHalfHourSlot(entry.horario_aula));
  if (invalidTimes.length) {
    showMessage(message, 'Alguns horários antigos não estão em intervalos de 30 minutos e foram marcados com *. Edite o cadastro do aluno para ajustar.', 'error');
  }
}

dateInput.addEventListener('change', () => renderAgendaForDate(parseDateValue(dateInput.value)));
prevDayButton.addEventListener('click', () => shiftSelectedDate(-1));
nextDayButton.addEventListener('click', () => shiftSelectedDate(1));
todayButton.addEventListener('click', () => selectDate(new Date()));

await loadAgenda();