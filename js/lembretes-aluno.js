import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('alunos');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const alunoId = new URLSearchParams(location.search).get('id');
const message = document.querySelector('#reminder-message');
const form = document.querySelector('#reminder-form');
const list = document.querySelector('#reminders-list');
const formTitle = document.querySelector('#form-title');
const cancelEdit = document.querySelector('#cancel-edit');
let editingId = null;

if (!alunoId) {
  showMessage(message, 'Aluno não informado.', 'error');
  throw new Error('Aluno não informado');
}

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function recurrenceToRrule(value) {
  if (value === 'daily') return 'FREQ=DAILY';
  if (value === 'weekly') return 'FREQ=WEEKLY';
  if (value === 'weekdays') return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  return null;
}

function rruleToRecurrence(value) {
  if (value === 'FREQ=DAILY') return 'daily';
  if (value === 'FREQ=WEEKLY') return 'weekly';
  if (value === 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') return 'weekdays';
  return '';
}

function recurrenceLabel(value) {
  return {
    'FREQ=DAILY': 'Diário',
    'FREQ=WEEKLY': 'Semanal',
    'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR': 'Seg. a sex.'
  }[value] || 'Uma vez';
}

function channelLabel(value) {
  return { push: 'Notificação', whatsapp: 'WhatsApp', ambos: 'Ambos' }[value] || value;
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function loadStudent() {
  const { data, error } = await supabase.from('alunos')
    .select('id,nome')
    .eq('id', alunoId)
    .eq('personal_id', session.user.id)
    .single();

  if (error) {
    showMessage(message, 'Aluno não encontrado ou sem permissão.', 'error');
    throw error;
  }

  document.querySelector('#student-name').textContent = `Lembretes de ${data.nome}`;
  document.querySelector('#back-link').href = `ficha-aluno.html?id=${data.id}`;
}

async function loadReminders() {
  const { data, error } = await supabase.from('lembretes')
    .select('id,titulo,mensagem,canal,agendado_para,recorrencia_rrule,status,enviado_em,erro')
    .eq('aluno_id', alunoId)
    .eq('personal_id', session.user.id)
    .order('agendado_para', { ascending: true });

  if (error) {
    showMessage(message, 'Não foi possível carregar os lembretes.', 'error');
    return;
  }

  list.innerHTML = data?.length ? data.map(item => `
    <tr>
      <td>${esc(formatDateTime(item.agendado_para))}</td>
      <td><strong>${esc(item.titulo)}</strong><br><small>${esc(item.mensagem)}</small></td>
      <td>${esc(channelLabel(item.canal))}</td>
      <td>${esc(recurrenceLabel(item.recorrencia_rrule))}</td>
      <td><span class="badge">${esc(String(item.status).toUpperCase())}</span>${item.erro ? `<br><small>${esc(item.erro)}</small>` : ''}</td>
      <td><div class="actions">
        <button class="btn btn-outline" data-edit="${item.id}">Editar</button>
        ${item.status !== 'cancelado' ? `<button class="btn btn-secondary" data-cancel="${item.id}">Cancelar</button>` : ''}
        <button class="btn btn-danger" data-delete="${item.id}" data-title="${esc(item.titulo)}">Excluir</button>
      </div></td>
    </tr>`).join('') : '<tr><td colspan="6" class="empty">Nenhum lembrete programado.</td></tr>';
}

function resetForm() {
  editingId = null;
  form.reset();
  formTitle.textContent = 'Novo lembrete';
  cancelEdit.classList.add('hidden');
  const now = new Date(Date.now() + 30 * 60 * 1000);
  form.agendado_para.value = toLocalInput(now.toISOString());
  form.canal.value = 'push';
  form.status.value = 'agendado';
}

async function editReminder(id) {
  const { data, error } = await supabase.from('lembretes')
    .select('id,titulo,mensagem,canal,agendado_para,recorrencia_rrule,status')
    .eq('id', id)
    .eq('aluno_id', alunoId)
    .eq('personal_id', session.user.id)
    .single();

  if (error) return showMessage(message, 'Não foi possível abrir o lembrete.', 'error');

  editingId = data.id;
  formTitle.textContent = `Editar ${data.titulo}`;
  form.titulo.value = data.titulo;
  form.mensagem.value = data.mensagem;
  form.agendado_para.value = toLocalInput(data.agendado_para);
  form.canal.value = data.canal;
  form.recorrencia.value = rruleToRecurrence(data.recorrencia_rrule);
  form.status.value = ['agendado', 'cancelado'].includes(data.status) ? data.status : 'agendado';
  cancelEdit.classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth' });
}

form.addEventListener('submit', async event => {
  event.preventDefault();

  const scheduled = new Date(form.agendado_para.value);
  if (Number.isNaN(scheduled.getTime())) return showMessage(message, 'Informe uma data e horário válidos.', 'error');

  const payload = {
    personal_id: session.user.id,
    aluno_id: alunoId,
    titulo: form.titulo.value.trim(),
    mensagem: form.mensagem.value.trim(),
    canal: form.canal.value,
    agendado_para: scheduled.toISOString(),
    recorrencia_rrule: recurrenceToRrule(form.recorrencia.value),
    status: form.status.value,
    erro: null
  };

  if (payload.titulo.length < 2 || payload.mensagem.length < 2) {
    return showMessage(message, 'Informe título e mensagem do lembrete.', 'error');
  }

  const result = editingId
    ? await supabase.from('lembretes').update(payload).eq('id', editingId).eq('personal_id', session.user.id).eq('aluno_id', alunoId)
    : await supabase.from('lembretes').insert(payload);

  if (result.error) return showMessage(message, result.error.message, 'error');

  showMessage(message, editingId ? 'Lembrete atualizado com sucesso.' : 'Lembrete programado com sucesso.');
  resetForm();
  await loadReminders();
});

cancelEdit.addEventListener('click', resetForm);

document.addEventListener('click', async event => {
  const edit = event.target.closest('[data-edit]');
  if (edit) return editReminder(edit.dataset.edit);

  const cancel = event.target.closest('[data-cancel]');
  if (cancel) {
    const { error } = await supabase.from('lembretes')
      .update({ status: 'cancelado' })
      .eq('id', cancel.dataset.cancel)
      .eq('personal_id', session.user.id)
      .eq('aluno_id', alunoId);
    if (error) showMessage(message, error.message, 'error');
    else {
      showMessage(message, 'Lembrete cancelado.');
      await loadReminders();
    }
    return;
  }

  const remove = event.target.closest('[data-delete]');
  if (remove && confirm(`Excluir o lembrete "${remove.dataset.title}"?`)) {
    const { error } = await supabase.from('lembretes')
      .delete()
      .eq('id', remove.dataset.delete)
      .eq('personal_id', session.user.id)
      .eq('aluno_id', alunoId);
    if (error) showMessage(message, error.message, 'error');
    else {
      showMessage(message, 'Lembrete excluído.');
      await loadReminders();
    }
  }
});

await loadStudent();
resetForm();
await loadReminders();