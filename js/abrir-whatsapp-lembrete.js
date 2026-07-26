import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting } from './layout.js';

renderHeader('');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const status = document.querySelector('#whatsapp-reminder-status');
const linkButton = document.querySelector('#whatsapp-reminder-link');
const reminderId = new URLSearchParams(window.location.search).get('id');

function normalizeWhatsAppNumber(value = '') {
  const digits = String(value).replace(/\D/g, '');
  if (/^55\d{10,11}$/.test(digits)) return digits;
  if (/^\d{10,11}$/.test(digits)) return `55${digits}`;
  return '';
}

function buildMessage(studentName, title, message) {
  return [
    `Olá, ${studentName || 'aluno'}! 👋`,
    '',
    `⏰ *${title || 'Lembrete'}*`,
    String(message || '').trim(),
    '',
    'Mensagem do seu personal pelo FS Fit.'
  ].filter((line, index, items) => !(line === '' && items[index - 1] === '')).join('\n');
}

async function markAsOpened(reminder) {
  if (reminder.recorrencia_rrule || reminder.status !== 'whatsapp_pendente') return;

  const { error } = await supabase.rpc('fsfit_marcar_lembrete_whatsapp_aberto', {
    p_lembrete_id: reminder.id
  });

  if (error) console.warn('Não foi possível atualizar o status do lembrete:', error);
}

async function openWhatsApp(reminder, whatsappUrl) {
  await markAsOpened(reminder);
  window.location.assign(whatsappUrl);
}

async function load() {
  if (!reminderId || !/^[0-9a-f-]{36}$/i.test(reminderId)) throw new Error('Lembrete inválido.');

  const { data: reminder, error: reminderError } = await supabase
    .from('lembretes')
    .select('id,personal_id,aluno_id,titulo,mensagem,canal,status,recorrencia_rrule')
    .eq('id', reminderId)
    .eq('personal_id', session.user.id)
    .maybeSingle();

  if (reminderError) throw reminderError;
  if (!reminder) throw new Error('Lembrete não encontrado ou sem permissão.');
  if (!['whatsapp', 'ambos'].includes(reminder.canal)) throw new Error('Este lembrete não utiliza WhatsApp.');

  const { data: student, error: studentError } = await supabase
    .from('alunos')
    .select('id,nome,telefone')
    .eq('id', reminder.aluno_id)
    .eq('personal_id', session.user.id)
    .maybeSingle();

  if (studentError) throw studentError;
  if (!student) throw new Error('Aluno não encontrado.');

  const phone = normalizeWhatsAppNumber(student.telefone);
  if (!phone) throw new Error('O aluno não possui um WhatsApp válido cadastrado. Atualize o telefone na ficha do aluno.');

  const text = buildMessage(student.nome, reminder.titulo, reminder.mensagem);
  const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;

  linkButton.href = whatsappUrl;
  linkButton.classList.remove('hidden');
  linkButton.addEventListener('click', async event => {
    event.preventDefault();
    await openWhatsApp(reminder, whatsappUrl);
  });

  status.textContent = `Abrindo a conversa com ${student.nome || 'o aluno'} e preenchendo a mensagem automaticamente.`;
  window.setTimeout(() => openWhatsApp(reminder, whatsappUrl), 250);
}

load().catch(error => {
  console.error(error);
  status.textContent = error.message || 'Não foi possível abrir o WhatsApp para este lembrete.';
  linkButton.classList.add('hidden');
});
