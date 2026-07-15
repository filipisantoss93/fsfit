import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('agenda');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const grid = document.querySelector('#agenda-grid');
const message = document.querySelector('#agenda-message');

const days = [
  ['segunda', 'Segunda-feira'],
  ['terca', 'Terça-feira'],
  ['quarta', 'Quarta-feira'],
  ['quinta', 'Quinta-feira'],
  ['sexta', 'Sexta-feira'],
  ['sabado', 'Sábado'],
  ['domingo', 'Domingo']
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

function renderAgenda(students) {
  grid.innerHTML = days.map(([dayKey, dayLabel]) => {
    const entries = students
      .filter(student => Array.isArray(student.dias_semana) && student.dias_semana.includes(dayKey) && student.horario_aula)
      .sort((a, b) => String(a.horario_aula).localeCompare(String(b.horario_aula)));

    const content = entries.length
      ? entries.map(student => `
          <a class="agenda-entry" href="ficha-aluno.html?id=${student.id}">
            <div class="agenda-time">${formatTime(student.horario_aula)}</div>
            <div class="agenda-entry-main">
              <strong>${esc(student.nome)}</strong>
              <span>${esc(periodLabels[student.periodo_aula] || 'Período não informado')}</span>
              <small>${esc(student.local_aula || 'Local não informado')}</small>
            </div>
            <span class="agenda-open">Abrir ficha →</span>
          </a>`).join('')
      : '<p class="agenda-empty">Nenhuma aula cadastrada.</p>';

    return `
      <article class="card agenda-day">
        <div class="agenda-day-heading">
          <h2>${dayLabel}</h2>
          <span>${entries.length} ${entries.length === 1 ? 'aula' : 'aulas'}</span>
        </div>
        <div class="agenda-day-list">${content}</div>
      </article>`;
  }).join('');
}

async function loadAgenda() {
  const { data, error } = await supabase
    .from('alunos')
    .select('id,nome,dias_semana,periodo_aula,horario_aula,local_aula,status')
    .eq('personal_id', session.user.id)
    .eq('status', 'ativo')
    .order('nome');

  if (error) {
    console.error(error);
    grid.innerHTML = '';
    showMessage(message, 'Não foi possível carregar a agenda semanal.', 'error');
    return;
  }

  renderAgenda(data || []);
}

await loadAgenda();