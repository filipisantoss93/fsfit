import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('agenda');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const grid = document.querySelector('#agenda-grid');
const message = document.querySelector('#agenda-message');

const days = [
  [1, 'Segunda-feira'],
  [2, 'Terça-feira'],
  [3, 'Quarta-feira'],
  [4, 'Quinta-feira'],
  [5, 'Sexta-feira'],
  [6, 'Sábado'],
  [0, 'Domingo']
];

const periodLabels = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite'
};

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

function renderAgenda(entries) {
  grid.innerHTML = days.map(([dayNumber, dayLabel]) => {
    const dayEntries = entries
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
      : '<p class="agenda-empty">Nenhum treino programado.</p>';

    return `
      <article class="card agenda-day">
        <div class="agenda-day-heading">
          <h2>${dayLabel}</h2>
          <span>${dayEntries.length} ${dayEntries.length === 1 ? 'aluno' : 'alunos'}</span>
        </div>
        <div class="agenda-day-list">${content}</div>
      </article>`;
  }).join('');
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
    showMessage(message, 'Não foi possível carregar a agenda semanal.', 'error');
    return;
  }

  const entries = normalizeEntries(data || []);
  renderAgenda(entries);

  const invalidTimes = entries.filter(entry => entry.horario_aula && !isHalfHourSlot(entry.horario_aula));
  if (invalidTimes.length) {
    showMessage(message, 'Alguns horários antigos não estão em intervalos de 30 minutos e foram marcados com *. Edite o cadastro do aluno para ajustar.', 'error');
  }
}

await loadAgenda();
