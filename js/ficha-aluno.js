import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('alunos');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const alunoId = new URLSearchParams(location.search).get('id');
const message = document.querySelector('#record-message');
const weightForm = document.querySelector('#weight-form');
const assessmentForm = document.querySelector('#assessment-form');
const pinForm = document.querySelector('#pin-form');
const activationResult = document.querySelector('#activation-result');
let student = null;

if (!alunoId) {
  showMessage(message, 'Aluno não informado.', 'error');
  throw new Error('Aluno não informado');
}

function esc(value = '') { const div = document.createElement('div'); div.textContent = value ?? ''; return div.innerHTML; }
function valueOrNull(value) { if (value === '' || value == null) return null; const parsed = Number(String(value).replace(',', '.')); return Number.isFinite(parsed) ? parsed : null; }
function formatDate(value) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—'; }
function calculateAge(value) { if (!value) return null; const birth = new Date(`${value}T12:00:00`); const now = new Date(); let years = now.getFullYear() - birth.getFullYear(); if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) years--; return years; }
function calculateBmi(weight, heightCm) { if (!weight || !heightCm) return null; const height = Number(heightCm) / 100; return (Number(weight) / (height * height)).toFixed(1); }

async function loadStudent() {
  const { data, error } = await supabase.from('alunos')
    .select('id,nome,telefone,sexo,data_nascimento,altura_cm,peso_inicial_kg,percentual_gordura_inicial,objetivo,restricoes,observacoes,status')
    .eq('id', alunoId).eq('personal_id', session.user.id).single();
  if (error) { showMessage(message, 'Aluno não encontrado ou sem permissão.', 'error'); throw error; }
  student = data;
  const age = calculateAge(data.data_nascimento);
  document.querySelector('#student-name').textContent = data.nome;
  document.querySelector('#student-summary').textContent = [age != null ? `${age} anos` : null, data.telefone, data.objetivo].filter(Boolean).join(' · ') || 'Cadastro individual';
  document.querySelector('#student-status').textContent = String(data.status || 'ativo').toUpperCase();
  document.querySelector('#edit-registration').href = `alunos.html?editar=${data.id}`;
  document.querySelector('#workout-editor-link').href = `treino-aluno.html?id=${data.id}`;
  document.querySelector('#diet-editor-link').href = `dieta-aluno.html?id=${data.id}`;
  document.querySelector('#reminders-link').href = `lembretes-aluno.html?id=${data.id}`;
  document.querySelector('#student-height').textContent = data.altura_cm ? `${data.altura_cm} cm` : '—';
  document.querySelector('#profile-data').innerHTML = `<p><strong>WhatsApp:</strong> ${esc(data.telefone || 'Não informado')}</p><p><strong>Nascimento:</strong> ${formatDate(data.data_nascimento)}${age != null ? ` (${age} anos)` : ''}</p><p><strong>Objetivo:</strong> ${esc(data.objetivo || 'Não informado')}</p><p><strong>Restrições:</strong> ${esc(data.restricoes || 'Nenhuma informada')}</p><p><strong>Observações:</strong> ${esc(data.observacoes || 'Nenhuma')}</p>`;
}

async function loadEvolution() {
  const [{ data: weights, error: weightError }, { data: assessments, error: assessmentError }] = await Promise.all([
    supabase.from('historico_peso').select('id,peso_kg,data_registro,observacoes').eq('aluno_id', alunoId).eq('personal_id', session.user.id).order('data_registro', { ascending: false }),
    supabase.from('avaliacoes').select('percentual_gordura,data_avaliacao').eq('aluno_id', alunoId).eq('personal_id', session.user.id).order('data_avaliacao', { ascending: false }).limit(1)
  ]);
  if (weightError || assessmentError) { showMessage(message, 'Não foi possível carregar toda a evolução física.', 'error'); return; }
  const latestWeight = weights?.[0]?.peso_kg ?? student?.peso_inicial_kg;
  const latestFat = assessments?.[0]?.percentual_gordura ?? student?.percentual_gordura_inicial;
  document.querySelector('#current-weight').textContent = latestWeight ? `${latestWeight} kg` : '—';
  document.querySelector('#weight-date').textContent = weights?.[0]?.data_registro ? `Em ${formatDate(weights[0].data_registro)}` : 'Peso do cadastro';
  document.querySelector('#current-fat').textContent = latestFat ? `${latestFat}%` : '—';
  document.querySelector('#student-bmi').textContent = calculateBmi(latestWeight, student?.altura_cm) || '—';
  const chronological = [...(weights || [])].reverse();
  document.querySelector('#weight-history').innerHTML = weights?.length ? weights.map(row => { const index = chronological.findIndex(item => item.id === row.id); const previous = index > 0 ? Number(chronological[index - 1].peso_kg) : null; const diff = previous == null ? null : Number(row.peso_kg) - previous; const variation = diff == null ? 'Inicial' : `${diff > 0 ? '+' : ''}${diff.toFixed(1)} kg`; return `<tr><td>${formatDate(row.data_registro)}</td><td><strong>${row.peso_kg} kg</strong></td><td>${variation}</td><td>${esc(row.observacoes || '—')}</td></tr>`; }).join('') : '<tr><td colspan="4" class="empty">Nenhum peso registrado.</td></tr>';
}

weightForm.data_registro.value = new Date().toISOString().slice(0, 10);
assessmentForm.data_avaliacao.value = new Date().toISOString().slice(0, 10);

weightForm.addEventListener('submit', async event => {
  event.preventDefault();
  const payload = { personal_id: session.user.id, aluno_id: alunoId, peso_kg: valueOrNull(weightForm.peso_kg.value), data_registro: weightForm.data_registro.value, origem: 'personal', observacoes: weightForm.observacoes.value.trim() || null };
  const { error } = await supabase.from('historico_peso').insert(payload);
  if (error) return showMessage(message, error.message, 'error');
  showMessage(message, 'Peso registrado com sucesso.'); weightForm.reset(); weightForm.data_registro.value = new Date().toISOString().slice(0, 10); await loadEvolution();
});

assessmentForm.addEventListener('submit', async event => {
  event.preventDefault();
  const payload = { personal_id: session.user.id, aluno_id: alunoId, data_avaliacao: assessmentForm.data_avaliacao.value, percentual_gordura: valueOrNull(assessmentForm.percentual_gordura.value), cintura_cm: valueOrNull(assessmentForm.cintura_cm.value), quadril_cm: valueOrNull(assessmentForm.quadril_cm.value), braco_cm: valueOrNull(assessmentForm.braco_cm.value), coxa_cm: valueOrNull(assessmentForm.coxa_cm.value), observacoes: assessmentForm.observacoes.value.trim() || null };
  const { error } = await supabase.from('avaliacoes').insert(payload);
  if (error) return showMessage(message, error.message, 'error');
  showMessage(message, 'Avaliação física salva com sucesso.'); assessmentForm.reset(); assessmentForm.data_avaliacao.value = new Date().toISOString().slice(0, 10); await loadEvolution();
});

document.querySelector('#generate-activation').addEventListener('click', async () => {
  activationResult.className = 'message';
  const { data, error } = await supabase.functions.invoke('personal-aluno-pin', { body: { action: 'generate_activation', aluno_id: alunoId } });
  if (error || !data?.success) return showMessage(activationResult, data?.error || 'Não foi possível gerar o código.', 'error');
  showMessage(activationResult, `Código: ${data.codigo_ativacao} — válido por 7 dias. Envie este código ao aluno com segurança.`);
});

pinForm.pin.addEventListener('input', () => { pinForm.pin.value = pinForm.pin.value.replace(/\D/g, '').slice(0, 4); });
pinForm.addEventListener('submit', async event => {
  event.preventDefault();
  const pin = pinForm.pin.value.replace(/\D/g, '');
  if (pin.length !== 4) return showMessage(message, 'O PIN deve ter exatamente 4 números.', 'error');
  const { data, error } = await supabase.functions.invoke('personal-aluno-pin', { body: { action: 'set_pin', aluno_id: alunoId, pin } });
  if (error || !data?.success) return showMessage(message, data?.error || 'Não foi possível redefinir o PIN.', 'error');
  pinForm.reset();
  showMessage(message, 'PIN do aluno atualizado. Sessões anteriores foram encerradas.');
});

await loadStudent();
await loadEvolution();