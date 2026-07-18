import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting } from './layout.js';

renderHeader('financeiro');
const session = await requireSession();

const message = document.querySelector('#finance-message');
const pixForm = document.querySelector('#pix-config-form');
const studentsList = document.querySelector('#finance-students-list');
const confirmationsCard = document.querySelector('#payment-confirmations-card');
const confirmationsList = document.querySelector('#payment-confirmations-list');
const confirmationsCount = document.querySelector('#payment-confirmations-count');
const studentModal = document.querySelector('#student-finance-modal');
const studentModalTitle = document.querySelector('#student-finance-modal-title');
const studentModalStatus = document.querySelector('#student-finance-modal-status');
const studentModalValue = document.querySelector('#student-finance-value');
const studentModalDay = document.querySelector('#student-finance-day');
const studentModalActive = document.querySelector('#student-finance-active');
const studentModalCompetence = document.querySelector('#student-finance-competence');
const studentModalDueDate = document.querySelector('#student-finance-due-date');
const studentModalChargeValue = document.querySelector('#student-finance-charge-value');
const studentModalReportedAt = document.querySelector('#student-finance-reported-at');
const studentModalConfirmedAt = document.querySelector('#student-finance-confirmed-at');
const studentModalSave = document.querySelector('#student-finance-save');
const studentModalMarkPaid = document.querySelector('#student-finance-mark-paid');

let students = [];
let payments = [];
let profile = null;
let selectedStudentId = null;

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function show(text, type = 'success') {
  if (!message) return;
  message.textContent = text;
  message.className = `message show ${type}`;
  window.clearTimeout(show.timer);
  show.timer = window.setTimeout(() => {
    message.textContent = '';
    message.className = 'message';
  }, 4500);
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return '—';
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR');
}

function formatCompetence(value) {
  if (!value) return '—';
  const [year, month] = String(value).slice(0, 7).split('-').map(Number);
  if (!year || !month) return '—';
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function currentCompetence() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function dueDateForDay(day, competence = currentCompetence()) {
  const [year, month] = competence.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(Math.max(Number(day || 1), 1), lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function paymentForStudent(studentId, competence = currentCompetence()) {
  return payments.find(item => item.aluno_id === studentId && item.competencia === competence) || null;
}

function statusInfo(payment, student) {
  if (!student.mensalidade_ativa || !student.mensalidade_valor || !student.mensalidade_dia_vencimento) {
    return { label: 'Não configurada', className: '' };
  }
  if (!payment) return { label: 'Pendente', className: '' };
  if (payment.status === 'pago') return { label: 'Pago', className: 'paid' };
  if (payment.status === 'informado') return { label: 'Aguardando confirmação', className: 'waiting' };
  if (payment.vencimento < todayIso()) return { label: 'Atrasado', className: 'overdue' };
  return { label: 'Pendente', className: '' };
}

async function fetchPayments() {
  const { data, error } = await supabase
    .from('mensalidades_alunos')
    .select('id,personal_id,aluno_id,competencia,vencimento,valor,status,informado_em,confirmado_em,created_at,updated_at')
    .eq('personal_id', session.user.id)
    .order('vencimento', { ascending: false });
  if (error) throw error;
  payments = data || [];
}

async function ensureCurrentCharges() {
  const competence = currentCompetence();
  const currentIds = new Set(payments.filter(item => item.competencia === competence).map(item => item.aluno_id));
  const rows = students
    .filter(student => student.mensalidade_ativa && Number(student.mensalidade_valor) > 0 && Number(student.mensalidade_dia_vencimento) > 0)
    .filter(student => !currentIds.has(student.id))
    .map(student => ({
      personal_id: session.user.id,
      aluno_id: student.id,
      competencia: competence,
      vencimento: dueDateForDay(student.mensalidade_dia_vencimento, competence),
      valor: Number(student.mensalidade_valor),
      status: 'pendente'
    }));

  if (!rows.length) return;

  const { error } = await supabase
    .from('mensalidades_alunos')
    .upsert(rows, { onConflict: 'aluno_id,competencia', ignoreDuplicates: true });
  if (error) throw error;
  await fetchPayments();
}

function renderSummary() {
  const competence = currentCompetence();
  const monthPayments = payments.filter(item => item.competencia === competence);
  const expected = monthPayments.reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const receivedRows = monthPayments.filter(item => item.status === 'pago');
  const waitingRows = monthPayments.filter(item => item.status === 'informado');
  const overdueRows = payments.filter(item => item.status === 'pendente' && item.vencimento < todayIso());

  document.querySelector('#summary-expected').textContent = formatCurrency(expected);
  document.querySelector('#summary-expected-count').textContent = `${monthPayments.length} ${monthPayments.length === 1 ? 'mensalidade' : 'mensalidades'}`;
  document.querySelector('#summary-received').textContent = formatCurrency(receivedRows.reduce((sum, item) => sum + Number(item.valor || 0), 0));
  document.querySelector('#summary-received-count').textContent = `${receivedRows.length} ${receivedRows.length === 1 ? 'confirmada' : 'confirmadas'}`;
  document.querySelector('#summary-waiting').textContent = formatCurrency(waitingRows.reduce((sum, item) => sum + Number(item.valor || 0), 0));
  document.querySelector('#summary-waiting-count').textContent = `${waitingRows.length} ${waitingRows.length === 1 ? 'pagamento informado' : 'pagamentos informados'}`;
  document.querySelector('#summary-overdue').textContent = formatCurrency(overdueRows.reduce((sum, item) => sum + Number(item.valor || 0), 0));
  document.querySelector('#summary-overdue-count').textContent = `${overdueRows.length} ${overdueRows.length === 1 ? 'mensalidade' : 'mensalidades'}`;
}

function renderConfirmations() {
  const waiting = payments
    .filter(item => item.status === 'informado')
    .sort((a, b) => new Date(a.informado_em || a.updated_at) - new Date(b.informado_em || b.updated_at));
  const studentMap = new Map(students.map(student => [student.id, student]));

  confirmationsCount.textContent = String(waiting.length);
  confirmationsCard.classList.toggle('hidden', waiting.length === 0);
  confirmationsList.innerHTML = waiting.map(item => {
    const student = studentMap.get(item.aluno_id);
    return `<article class="finance-confirmation-item">
      <div class="finance-confirmation-main">
        <strong>${esc(student?.nome || 'Aluno')}</strong>
        <span>Vencimento ${esc(formatDate(item.vencimento))} · informou o pagamento ${item.informado_em ? `em ${esc(new Date(item.informado_em).toLocaleString('pt-BR'))}` : ''}</span>
      </div>
      <span class="finance-confirmation-value">${esc(formatCurrency(item.valor))}</span>
      <button class="btn btn-primary" type="button" data-confirm-payment="${esc(item.id)}">Confirmar pagamento</button>
    </article>`;
  }).join('');
}

function renderStudents() {
  if (!students.length) {
    studentsList.innerHTML = '<tr><td colspan="2" class="finance-empty">Nenhum aluno ativo cadastrado.</td></tr>';
    return;
  }

  studentsList.innerHTML = students.map(student => {
    const payment = paymentForStudent(student.id);
    const status = statusInfo(payment, student);

    return `<tr class="finance-student-row" data-student-row="${esc(student.id)}" tabindex="0" role="button" aria-label="Abrir mensalidade de ${esc(student.nome)}">
      <td><div class="finance-student-name"><strong>${esc(student.nome)}</strong></div></td>
      <td><div class="finance-student-status-cell"><span class="finance-status ${status.className}">${esc(status.label)}</span><span class="finance-student-open" aria-hidden="true">›</span></div></td>
    </tr>`;
  }).join('');
}

function fillPixForm() {
  if (!profile || !pixForm) return;
  pixForm.pix_tipo.value = profile.pix_tipo || '';
  pixForm.pix_chave.value = profile.pix_chave || '';
  pixForm.pix_nome_recebedor.value = profile.pix_nome_recebedor || '';
  pixForm.pix_cidade.value = profile.pix_cidade || '';
}

function openStudentModal(studentId) {
  if (!studentModal) return;
  const student = students.find(item => item.id === studentId);
  if (!student) return;

  selectedStudentId = studentId;
  const payment = paymentForStudent(studentId);
  const status = statusInfo(payment, student);

  studentModalTitle.textContent = student.nome;
  studentModalStatus.textContent = status.label;
  studentModalStatus.className = `finance-status ${status.className}`;
  studentModalValue.value = student.mensalidade_valor != null ? Number(student.mensalidade_valor).toFixed(2) : '';
  studentModalDay.value = student.mensalidade_dia_vencimento || '';
  studentModalActive.checked = Boolean(student.mensalidade_ativa);
  studentModalCompetence.textContent = payment ? formatCompetence(payment.competencia) : formatCompetence(currentCompetence());
  studentModalDueDate.textContent = payment ? formatDate(payment.vencimento) : (student.mensalidade_dia_vencimento ? formatDate(dueDateForDay(student.mensalidade_dia_vencimento)) : '—');
  studentModalChargeValue.textContent = payment ? formatCurrency(payment.valor) : (student.mensalidade_valor ? formatCurrency(student.mensalidade_valor) : '—');
  studentModalReportedAt.textContent = payment ? formatDateTime(payment.informado_em) : '—';
  studentModalConfirmedAt.textContent = payment ? formatDateTime(payment.confirmado_em) : '—';

  if (payment && payment.status !== 'pago') {
    studentModalMarkPaid.classList.remove('hidden');
    studentModalMarkPaid.dataset.paymentId = payment.id;
    studentModalMarkPaid.textContent = payment.status === 'informado' ? 'Confirmar pagamento' : 'Marcar como pago';
  } else {
    studentModalMarkPaid.classList.add('hidden');
    studentModalMarkPaid.removeAttribute('data-payment-id');
  }

  studentModal.classList.remove('hidden');
  document.body.classList.add('finance-modal-open');
  requestAnimationFrame(() => document.querySelector('[data-close-finance-modal]')?.focus());
}

function closeStudentModal() {
  if (!studentModal) return;
  studentModal.classList.add('hidden');
  document.body.classList.remove('finance-modal-open');
  selectedStudentId = null;
}

async function saveStudentConfig(studentId, value, day, active, button) {
  if (active && (!(value > 0) || day < 1 || day > 31)) {
    show('Para ativar a mensalidade, informe um valor maior que zero e um dia de vencimento entre 1 e 31.', 'error');
    return;
  }

  button.disabled = true;
  try {
    const { error } = await supabase
      .from('alunos')
      .update({
        mensalidade_valor: value > 0 ? value : null,
        mensalidade_dia_vencimento: day >= 1 && day <= 31 ? day : null,
        mensalidade_ativa: active,
        updated_at: new Date().toISOString()
      })
      .eq('id', studentId);
    if (error) throw error;

    const student = students.find(item => item.id === studentId);
    if (student) {
      student.mensalidade_valor = value > 0 ? value : null;
      student.mensalidade_dia_vencimento = day >= 1 && day <= 31 ? day : null;
      student.mensalidade_ativa = active;
    }

    if (active) {
      const existing = paymentForStudent(studentId);
      const payload = {
        valor: value,
        vencimento: dueDateForDay(day),
        updated_at: new Date().toISOString()
      };

      if (!existing) {
        const { error: insertError } = await supabase.from('mensalidades_alunos').insert({
          personal_id: session.user.id,
          aluno_id: studentId,
          competencia: currentCompetence(),
          vencimento: payload.vencimento,
          valor: payload.valor,
          status: 'pendente'
        });
        if (insertError) throw insertError;
      } else if (existing.status === 'pendente') {
        const { error: updateError } = await supabase
          .from('mensalidades_alunos')
          .update(payload)
          .eq('id', existing.id);
        if (updateError) throw updateError;
      }
    }

    await fetchPayments();
    renderSummary();
    renderConfirmations();
    renderStudents();
    openStudentModal(studentId);
    show('Mensalidade do aluno atualizada.');
  } catch (error) {
    console.error(error);
    show('Não foi possível atualizar a mensalidade deste aluno.', 'error');
  } finally {
    button.disabled = false;
  }
}

async function load() {
  if (!session) return;
  await setGreeting(session);

  const [profileResult, studentsResult] = await Promise.all([
    supabase
      .from('perfis')
      .select('id,nome,pix_tipo,pix_chave,pix_nome_recebedor,pix_cidade')
      .eq('id', session.user.id)
      .single(),
    supabase
      .from('alunos')
      .select('id,nome,status,mensalidade_valor,mensalidade_dia_vencimento,mensalidade_ativa')
      .eq('status', 'ativo')
      .order('nome', { ascending: true })
  ]);

  if (profileResult.error) throw profileResult.error;
  if (studentsResult.error) throw studentsResult.error;

  profile = profileResult.data;
  students = studentsResult.data || [];
  await fetchPayments();
  await ensureCurrentCharges();

  fillPixForm();
  renderSummary();
  renderConfirmations();
  renderStudents();
}

pixForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.querySelector('#save-pix-button');
  const pixTipo = String(pixForm.pix_tipo.value || '').trim();
  const pixChave = String(pixForm.pix_chave.value || '').trim();
  const pixNome = String(pixForm.pix_nome_recebedor.value || '').trim();
  const pixCidade = String(pixForm.pix_cidade.value || '').trim();

  if (pixChave && (!pixTipo || !pixNome || !pixCidade)) {
    show('Para gerar o QR Code Pix, informe tipo da chave, chave, nome do recebedor e cidade.', 'error');
    return;
  }

  button.disabled = true;
  try {
    const { error } = await supabase
      .from('perfis')
      .update({
        pix_tipo: pixTipo || null,
        pix_chave: pixChave || null,
        pix_nome_recebedor: pixNome || null,
        pix_cidade: pixCidade || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', session.user.id);
    if (error) throw error;

    profile = { ...profile, pix_tipo: pixTipo, pix_chave: pixChave, pix_nome_recebedor: pixNome, pix_cidade: pixCidade };
    show(pixChave ? 'Configuração Pix salva. Seus alunos já poderão gerar o QR Code e o Pix Copia e Cola.' : 'Configuração Pix removida.');
  } catch (error) {
    console.error(error);
    show('Não foi possível salvar a configuração Pix.', 'error');
  } finally {
    button.disabled = false;
  }
});

studentsList?.addEventListener('click', event => {
  const row = event.target.closest('[data-student-row]');
  if (!row) return;
  openStudentModal(row.dataset.studentRow);
});

studentsList?.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const row = event.target.closest('[data-student-row]');
  if (!row) return;
  event.preventDefault();
  openStudentModal(row.dataset.studentRow);
});

studentModal?.addEventListener('click', event => {
  if (event.target.closest('[data-close-finance-modal]')) closeStudentModal();
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !studentModal?.classList.contains('hidden')) closeStudentModal();
});

studentModalSave?.addEventListener('click', async () => {
  if (!selectedStudentId) return;
  const value = Number(studentModalValue.value || 0);
  const day = Number(studentModalDay.value || 0);
  const active = Boolean(studentModalActive.checked);
  await saveStudentConfig(selectedStudentId, value, day, active, studentModalSave);
});

studentModalMarkPaid?.addEventListener('click', async () => {
  const paymentId = studentModalMarkPaid.dataset.paymentId;
  if (!paymentId) return;
  await confirmPayment(paymentId, studentModalMarkPaid);
});

confirmationsList?.addEventListener('click', async event => {
  const button = event.target.closest('[data-confirm-payment]');
  if (!button) return;
  await confirmPayment(button.dataset.confirmPayment, button);
});

async function confirmPayment(paymentId, button) {
  button.disabled = true;
  try {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('mensalidades_alunos')
      .update({ status: 'pago', confirmado_em: now, updated_at: now })
      .eq('id', paymentId)
      .eq('personal_id', session.user.id);
    if (error) throw error;

    await fetchPayments();
    renderSummary();
    renderConfirmations();
    renderStudents();
    if (selectedStudentId) openStudentModal(selectedStudentId);
    show('Pagamento confirmado com sucesso.');
  } catch (error) {
    console.error(error);
    show('Não foi possível confirmar o pagamento.', 'error');
  } finally {
    button.disabled = false;
  }
}

load().catch(error => {
  console.error('Erro ao carregar financeiro:', error);
  show('Não foi possível carregar o Financeiro. Atualize a página e tente novamente.', 'error');
  studentsList.innerHTML = '<tr><td colspan="2" class="finance-empty">Não foi possível carregar os dados financeiros.</td></tr>';
});