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
const recurrenceIntervalFields = document.querySelector('#recurrence-interval-fields');
let editingId = null;
let studentPhone = '';

if (!alunoId) {
  showMessage(message, 'Aluno não informado.', 'error');
  throw new Error('Aluno não informado');
}

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function normalizeWhatsAppNumber(value = '') {
  const digits = String(value).replace(/\D/g, '');
  if (/^55\d{10,11}$/.test(digits)) return digits;
  if (/^\d{10,11}$/.test(digits)) return `55${digits}`;
  return '';
}

function recurrenceToRrule(value, intervalValue, intervalUnit) {
  if (value === 'daily') return 'FREQ=DAILY';
  if (value === 'weekly') return 'FREQ=WEEKLY';
  if (value === 'weekdays') return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  if (value === 'interval') {
    const amount = Number(intervalValue);
    if (!Number.isInteger(amount) || amount < 1 || amount > 999) return null;
    const freq = { minutes: 'MINUTELY', hours: 'HOURLY', days: 'DAILY' }[intervalUnit];
    return freq ? `FREQ=${freq};INTERVAL=${amount}` : null;
  }
  return null;
}

function parseRrule(value) {
  if (value === 'FREQ=DAILY') return { recurrence: 'daily', intervalValue: 30, intervalUnit: 'minutes' };
  if (value === 'FREQ=WEEKLY') return { recurrence: 'weekly', intervalValue: 30, intervalUnit: 'minutes' };
  if (value === 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR') return { recurrence: 'weekdays', intervalValue: 30, intervalUnit: 'minutes' };

  const match = /^FREQ=(MINUTELY|HOURLY|DAILY);INTERVAL=([1-9]\d*)$/.exec(String(value || ''));
  if (match) {
    return {
      recurrence: 'interval',
      intervalValue: Number(match[2]),
      intervalUnit: { MINUTELY: 'minutes', HOURLY: 'hours', DAILY: 'days' }[match[1]]
    };
  }

  return { recurrence: '', intervalValue: 30, intervalUnit: 'minutes' };
}

function recurrenceLabel(value) {
  const fixed = {
    'FREQ=DAILY': 'Diário',
    'FREQ=WEEKLY': 'Semanal',
    'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR': 'Seg. a sex.'
  }[value];
  if (fixed) return fixed;

  const match = /^FREQ=(MINUTELY|HOURLY|DAILY);INTERVAL=([1-9]\d*)$/.exec(String(value || ''));
  if (!match) return 'Uma vez';

  const amount = Number(match[2]);
  const labels = {
    MINUTELY: amount === 1 ? 'minuto' : 'minutos',
    HOURLY: amount === 1 ? 'hora' : 'horas',
    DAILY: amount === 1 ? 'dia' : 'dias'
  };
  return `A cada ${amount} ${labels[match[1]]}`;
}

function toggleIntervalFields() {
  const isInterval = form.recorrencia.value === 'interval';
  recurrenceIntervalFields?.classList.toggle('hidden', !isInterval);
  if (form.intervalo_valor) form.intervalo_valor.required = isInterval;
  if (form.intervalo_unidade) form.intervalo_unidade.required = isInterval;
}

function channelLabel(value) {
  return {
    push: 'Notificação',
    whatsapp: 'WhatsApp manual',
    ambos: 'Notificação + WhatsApp'
  }[value] || value;
}

function statusLabel(value) {
  return {
    agendado: 'AGENDADO',
    processando: 'PROCESSANDO',
    enviado: 'ENVIADO',
    whatsapp_pendente: 'AGUARDANDO ENVIO NO WHATSAPP',
    whatsapp_aberto: 'ABERTO NO WHATSAPP',
    falhou: 'FALHOU',
    falhou_parcial: 'FALHOU PARCIALMENTE',
    cancelado: 'CANCELADO'
  }[value] || String(value || '').replaceAll('_', ' ').toUpperCase();
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

function hideInternalStatusField() {
  const statusField = form?.status?.closest('.form-group');
  if (statusField) statusField.hidden = true;
  if (form?.status) form.status.disabled = true;
}

async function loadStudent() {
  const { data, error } = await supabase.from('alunos')
    .select('id,nome,telefone')
    .eq('id', alunoId)
    .eq('personal_id', session.user.id)
    .single();

  if (error) {
    showMessage(message, 'Aluno não encontrado ou sem permissão.', 'error');
    throw error;
  }

  studentPhone = data.telefone || '';
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
      <td><span class="badge">${esc(statusLabel(item.status))}</span>${item.erro ? `<br><small>${esc(item.erro)}</small>` : ''}</td>
      <td><div class="actions">
        ${item.status === 'agendado' ? `<button class="btn btn-outline" data-edit="${item.id}">Editar</button>` : ''}
        ${item.status === 'agendado' ? `<button class="btn btn-secondary" data-cancel="${item.id}" data-title="${esc(item.titulo)}">Cancelar lembrete</button>` : ''}
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
  form.recorrencia.value = '';
  form.intervalo_valor.value = '30';
  form.intervalo_unidade.value = 'minutes';
  toggleIntervalFields();
  hideInternalStatusField();
}

async function editReminder(id) {
  const { data, error } = await supabase.from('lembretes')
    .select('id,titulo,mensagem,canal,agendado_para,recorrencia_rrule,status')
    .eq('id', id)
    .eq('aluno_id', alunoId)
    .eq('personal_id', session.user.id)
    .single();

  if (error) return showMessage(message, 'Não foi possível abrir o lembrete.', 'error');
  if (data.status !== 'agendado') return showMessage(message, 'Somente lembretes agendados podem ser editados.', 'error');

  const recurrence = parseRrule(data.recorrencia_rrule);
  editingId = data.id;
  formTitle.textContent = `Editar ${data.titulo}`;
  form.titulo.value = data.titulo;
  form.mensagem.value = data.mensagem;
  form.agendado_para.value = toLocalInput(data.agendado_para);
  form.canal.value = data.canal;
  form.recorrencia.value = recurrence.recurrence;
  form.intervalo_valor.value = String(recurrence.intervalValue);
  form.intervalo_unidade.value = recurrence.intervalUnit;
  toggleIntervalFields();
  cancelEdit.classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth' });
}

form.recorrencia.addEventListener('change', toggleIntervalFields);

form.addEventListener('submit', async event => {
  event.preventDefault();

  const scheduled = new Date(form.agendado_para.value);
  if (Number.isNaN(scheduled.getTime())) return showMessage(message, 'Informe uma data e horário válidos.', 'error');

  if (form.recorrencia.value === 'interval') {
    const intervalValue = Number(form.intervalo_valor.value);
    if (!Number.isInteger(intervalValue) || intervalValue < 1 || intervalValue > 999) {
      return showMessage(message, 'Informe um intervalo inteiro entre 1 e 999.', 'error');
    }
  }

  const recurrenceRrule = recurrenceToRrule(
    form.recorrencia.value,
    form.intervalo_valor.value,
    form.intervalo_unidade.value
  );

  if (form.recorrencia.value && !recurrenceRrule) {
    return showMessage(message, 'Não foi possível configurar a recorrência informada.', 'error');
  }

  const payload = {
    aluno_id: alunoId,
    titulo: form.titulo.value.trim(),
    mensagem: form.mensagem.value.trim(),
    canal: form.canal.value,
    agendado_para: scheduled.toISOString(),
    recorrencia_rrule: recurrenceRrule
  };

  if (payload.titulo.length < 2 || payload.mensagem.length < 2) {
    return showMessage(message, 'Informe título e mensagem do lembrete.', 'error');
  }

  if (['whatsapp', 'ambos'].includes(payload.canal) && !normalizeWhatsAppNumber(studentPhone)) {
    return showMessage(message, 'Cadastre um WhatsApp válido na ficha do aluno antes de usar este canal.', 'error');
  }

  const result = editingId
    ? await supabase.from('lembretes').update(payload).eq('id', editingId).eq('personal_id', session.user.id).eq('aluno_id', alunoId)
    : await supabase.from('lembretes').insert(payload);

  if (result.error) return showMessage(message, result.error.message, 'error');

  const successText = ['whatsapp', 'ambos'].includes(payload.canal)
    ? 'Lembrete programado. No horário definido, você receberá o atalho para abrir o WhatsApp com a mensagem pronta.'
    : (editingId ? 'Lembrete atualizado com sucesso.' : 'Lembrete programado com sucesso.');
  showMessage(message, successText);
  resetForm();
  await loadReminders();
});

cancelEdit.addEventListener('click', resetForm);

document.addEventListener('click', async event => {
  const edit = event.target.closest('[data-edit]');
  if (edit) return editReminder(edit.dataset.edit);

  const cancel = event.target.closest('[data-cancel]');
  if (!cancel) return;
  if (!confirm(`Cancelar o lembrete "${cancel.dataset.title || 'selecionado'}"? O histórico será preservado.`)) return;

  cancel.disabled = true;
  const { error } = await supabase.rpc('fsfit_cancelar_lembrete', { p_lembrete_id: cancel.dataset.cancel });
  if (error) {
    cancel.disabled = false;
    showMessage(message, error.message || 'Não foi possível cancelar o lembrete.', 'error');
    return;
  }

  showMessage(message, 'Lembrete cancelado. O histórico foi preservado.');
  await loadReminders();
});

await loadStudent();
hideInternalStatusField();
resetForm();
await loadReminders();
