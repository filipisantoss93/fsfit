import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('alunos');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const params = new URLSearchParams(location.search);
const alunoId = params.get('id');
const message = document.querySelector('#workout-message');
const workoutForm = document.querySelector('#workout-form');
const exerciseLibraryForm = document.querySelector('#exercise-library-form');
const workoutExerciseForm = document.querySelector('#workout-exercise-form');
const exerciseSelect = document.querySelector('#exercise-select');
const workoutDaySelect = workoutExerciseForm.querySelector('[name="dia_semana"]');
const workoutDays = document.querySelector('#workout-days');
const dayNames = { 0: 'Domingo', 1: 'Segunda-feira', 2: 'Terça-feira', 3: 'Quarta-feira', 4: 'Quinta-feira', 5: 'Sexta-feira', 6: 'Sábado' };
let treinoId = null;

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function selectedDays() {
  return [...document.querySelectorAll('#weekday-options input:checked')].map(input => Number(input.value));
}

function updateWorkoutDayOptions(days = selectedDays()) {
  const currentValue = workoutDaySelect.value;
  const uniqueDays = [...new Set((days || []).map(Number))];
  const orderedDays = [1, 2, 3, 4, 5, 6, 0].filter(day => uniqueDays.includes(day));

  workoutDaySelect.innerHTML = '<option value="">Selecione</option>' + orderedDays
    .map(day => `<option value="${day}">${dayNames[day]}</option>`)
    .join('');

  if (orderedDays.includes(Number(currentValue))) {
    workoutDaySelect.value = currentValue;
  }

  workoutDaySelect.disabled = orderedDays.length === 0;
  if (orderedDays.length === 0) {
    workoutDaySelect.innerHTML = '<option value="">Selecione os dias na configuração do treino</option>';
  }
}

async function loadStudent() {
  if (!alunoId) throw new Error('Aluno não informado.');
  const { data, error } = await supabase.from('alunos').select('id,nome').eq('id', alunoId).eq('personal_id', session.user.id).single();
  if (error) throw error;
  document.querySelector('#student-name').textContent = `Treino de ${data.nome}`;
  document.querySelector('#back-link').href = `ficha-aluno.html?id=${data.id}`;
}

async function loadOrCreateWorkout() {
  const { data: existing, error } = await supabase
    .from('treinos')
    .select('id,nome,descricao,dias_semana,data_inicio,data_fim,status')
    .eq('aluno_id', alunoId)
    .eq('personal_id', session.user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  if (existing) {
    treinoId = existing.id;
    workoutForm.nome.value = existing.nome || '';
    workoutForm.descricao.value = existing.descricao || '';
    workoutForm.data_inicio.value = existing.data_inicio || '';
    workoutForm.data_fim.value = existing.data_fim || '';
    const configuredDays = (existing.dias_semana || []).map(Number);
    document.querySelectorAll('#weekday-options input').forEach(input => {
      input.checked = configuredDays.includes(Number(input.value));
    });
    updateWorkoutDayOptions(configuredDays);
    return;
  }

  const { data, error: insertError } = await supabase.from('treinos').insert({
    personal_id: session.user.id,
    aluno_id: alunoId,
    nome: 'Plano de treino',
    descricao: '',
    dias_semana: [],
    status: 'ativo',
    modelo: false
  }).select('id').single();
  if (insertError) throw insertError;
  treinoId = data.id;
  workoutForm.nome.value = 'Plano de treino';
  updateWorkoutDayOptions([]);
}

async function loadExerciseLibrary() {
  const { data, error } = await supabase
    .from('exercicios')
    .select('id,nome,grupo_muscular,equipamento')
    .or(`global.eq.true,personal_id.eq.${session.user.id}`)
    .order('nome');
  if (error) throw error;

  exerciseSelect.innerHTML = '<option value="">Selecione</option>' + (data || []).map(item => {
    const detail = [item.grupo_muscular, item.equipamento].filter(Boolean).join(' • ');
    return `<option value="${item.id}">${esc(item.nome)}${detail ? ` — ${esc(detail)}` : ''}</option>`;
  }).join('');
}

async function loadWorkoutExercises() {
  const { data, error } = await supabase
    .from('treino_exercicios')
    .select('id,dia_semana,ordem,series,repeticoes,carga,descanso_segundos,observacoes,exercicios(nome,grupo_muscular,equipamento,instrucoes,video_url)')
    .eq('treino_id', treinoId)
    .order('dia_semana')
    .order('ordem');
  if (error) throw error;

  if (!data?.length) {
    workoutDays.innerHTML = '<p class="empty">Nenhum exercício adicionado ainda.</p>';
    return;
  }

  const groups = data.reduce((acc, row) => {
    const day = row.dia_semana ?? 0;
    (acc[day] ||= []).push(row);
    return acc;
  }, {});

  workoutDays.innerHTML = Object.entries(groups)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([day, rows]) => `
      <section style="margin-top:18px">
        <h3>${dayNames[day]}</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>#</th><th>Exercício</th><th>Séries</th><th>Repetições</th><th>Carga</th><th>Descanso</th><th>Ações</th></tr></thead>
          <tbody>${rows.map(row => `
            <tr>
              <td>${row.ordem || '—'}</td>
              <td><strong>${esc(row.exercicios?.nome || '')}</strong><br><small>${esc([row.exercicios?.grupo_muscular, row.exercicios?.equipamento].filter(Boolean).join(' • '))}</small>${row.observacoes ? `<br><small>${esc(row.observacoes)}</small>` : ''}</td>
              <td>${row.series ?? '—'}</td>
              <td>${esc(row.repeticoes || '—')}</td>
              <td>${esc(row.carga || '—')}</td>
              <td>${row.descanso_segundos ? `${row.descanso_segundos}s` : '—'}</td>
              <td><button class="btn btn-danger" type="button" data-remove-exercise="${row.id}">Remover</button></td>
            </tr>`).join('')}</tbody>
        </table></div>
      </section>`).join('');
}

document.querySelectorAll('#weekday-options input').forEach(input => {
  input.addEventListener('change', () => updateWorkoutDayOptions());
});

workoutForm.addEventListener('submit', async event => {
  event.preventDefault();
  const days = selectedDays();
  const payload = {
    nome: workoutForm.nome.value.trim(),
    descricao: workoutForm.descricao.value.trim(),
    dias_semana: days,
    data_inicio: workoutForm.data_inicio.value || null,
    data_fim: workoutForm.data_fim.value || null,
    status: 'ativo'
  };
  const { error } = await supabase.from('treinos').update(payload).eq('id', treinoId).eq('personal_id', session.user.id);
  if (error) return showMessage(message, error.message, 'error');
  updateWorkoutDayOptions(days);
  showMessage(message, 'Configuração do treino salva com sucesso.');
});

exerciseLibraryForm.addEventListener('submit', async event => {
  event.preventDefault();
  const payload = {
    personal_id: session.user.id,
    nome: exerciseLibraryForm.nome.value.trim(),
    grupo_muscular: exerciseLibraryForm.grupo_muscular.value.trim() || null,
    equipamento: exerciseLibraryForm.equipamento.value.trim() || null,
    instrucoes: exerciseLibraryForm.instrucoes.value.trim() || null,
    video_url: exerciseLibraryForm.video_url.value.trim() || null,
    global: false
  };
  const { error } = await supabase.from('exercicios').insert(payload);
  if (error) return showMessage(message, error.message, 'error');
  exerciseLibraryForm.reset();
  await loadExerciseLibrary();
  showMessage(message, 'Exercício adicionado à biblioteca.');
});

workoutExerciseForm.addEventListener('submit', async event => {
  event.preventDefault();
  const day = Number(workoutExerciseForm.dia_semana.value);
  const allowedDays = selectedDays();

  if (!workoutExerciseForm.dia_semana.value || !allowedDays.includes(day)) {
    return showMessage(message, 'Selecione um dia habilitado na configuração do treino.', 'error');
  }

  const payload = {
    treino_id: treinoId,
    exercicio_id: workoutExerciseForm.exercicio_id.value,
    dia_semana: day,
    ordem: Number(workoutExerciseForm.ordem.value || 1),
    series: workoutExerciseForm.series.value ? Number(workoutExerciseForm.series.value) : null,
    repeticoes: workoutExerciseForm.repeticoes.value.trim() || null,
    carga: workoutExerciseForm.carga.value.trim() || null,
    descanso_segundos: workoutExerciseForm.descanso_segundos.value ? Number(workoutExerciseForm.descanso_segundos.value) : null,
    observacoes: workoutExerciseForm.observacoes.value.trim() || null
  };
  const { error } = await supabase.from('treino_exercicios').insert(payload);
  if (error) return showMessage(message, error.message, 'error');
  workoutExerciseForm.reset();
  workoutExerciseForm.ordem.value = '1';
  updateWorkoutDayOptions(allowedDays);
  await loadWorkoutExercises();
  showMessage(message, 'Exercício adicionado ao treino.');
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-remove-exercise]');
  if (!button) return;
  if (!confirm('Remover este exercício do treino?')) return;
  const { error } = await supabase.from('treino_exercicios').delete().eq('id', button.dataset.removeExercise);
  if (error) return showMessage(message, error.message, 'error');
  await loadWorkoutExercises();
  showMessage(message, 'Exercício removido.');
});

try {
  await loadStudent();
  await loadOrCreateWorkout();
  await Promise.all([loadExerciseLibrary(), loadWorkoutExercises()]);
} catch (error) {
  console.error(error);
  showMessage(message, error.message || 'Não foi possível carregar o editor de treino.', 'error');
}
