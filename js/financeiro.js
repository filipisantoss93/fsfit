import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting } from './layout.js';

renderHeader('financeiro');
const session = await requireSession();

const message = document.querySelector('#finance-message');
const pixForm = document.querySelector('#pix-config-form');
const studentsList = document.querySelector('#finance-students-list');
const studentsToolbar = document.querySelector('.finance-students-toolbar');
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
let studentStatusFilter = 'all';
let cancelPaymentButton = null;

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
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
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

function dueDateForDay(day) {
  const [year, month] = currentCompetence().split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(Math.max(Number(day || 1), 1), lastDay)).padStart(2, '0')}`;
}

function paymentForStudent(studentId) {
  return payments.find(item => item.aluno_id === studentId && item.competencia === currentCompetence()) || null;
}

function statusInfo(payment, student) {
  if (!student.mensalidade_ativa || !student.mensalidade_valor || !student.mensalidade_dia_vencimento) {
    return { key: 'not-configured', label: 'Não configurada', className: '' };
  }
  if (!payment) return { key: 'pending', label: 'Pendente', className: '' };
  if (payment.status === 'cancelada') return { key: 'cancelled', label: 'Cancelada', className: '' };
  if (payment.status === 'pago') return { key: 'paid', label: 'Pago', className: 'paid' };
  if (payment.status === 'informado') return { key: 'waiting', label: 'Aguardando confirmação', className: 'waiting' };
  if (payment.vencimento < todayIso()) return { key: 'overdue', label: 'Atrasado', className: 'overdue' };
  return { key: 'pending', label: 'Pendente', className: '' };
}

function ensureStudentStatusFilter() {
  if (!studentsToolbar || document.querySelector('#finance-students-status-nav')) return;
  const nav = document.createElement('nav');
  nav.id = 'finance-students-status-nav';
  nav.className = 'finance-status-filter-nav';
  nav.setAttribute('aria-label', 'Filtros de status das mensalidades');
  nav.innerHTML = `
    <button class="finance-status-filter-pill active" type="button" data-finance-status-filter="all" aria-pressed="true">Todos</button>
    <button class="finance-status-filter-pill" type="button" data-finance-status-filter="paid" aria-pressed="false">Pago</button>
    <button class="finance-status-filter-pill" type="button" data-finance-status-filter="pending" aria-pressed="false">Pendente</button>
    <button class="finance-status-filter-pill" type="button" data-finance-status-filter="overdue" aria-pressed="false">Atrasado</button>
    <button class="finance-status-filter-pill" type="button" data-finance-status-filter="waiting" aria-pressed="false">Aguardando confirmação</button>
    <button class="finance-status-filter-pill" type="button" data-finance-status-filter="not-configured" aria-pressed="false">Não configurada</button>`;
  studentsToolbar.insertAdjacentElement('afterend', nav);
  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-finance-status-filter]');
    if (!button) return;
    studentStatusFilter = button.dataset.financeStatusFilter || 'all';
    nav.querySelectorAll('[data-finance-status-filter]').forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    renderStudents();
  });
}

async function fetchPayments() {
  const { data, error } = await supabase
    .from('mensalidades_alunos')
    .select('id,aluno_id,competencia,vencimento,valor,status,informado_em,confirmado_em,updated_at')
    .eq('personal_id', session.user.id)
    .order('vencimento', { ascending: false });
  if (error) throw error;
  payments = data || [];
}

async function generateCurrentCharges() {
  const { error } = await supabase.rpc('fsfit_gerar_mensalidades_mes', { p_competencia: currentCompetence() });
  if (error) throw error;
  await fetchPayments();
}

function renderSummary() {
  const monthPayments = payments.filter(item => item.competencia === currentCompetence() && item.status !== 'cancelada');
  const received = monthPayments.filter(item => item.status === 'pago');
  const waiting = monthPayments.filter(item => item.status === 'informado');
  const overdue = payments.filter(item => item.status === 'pendente' && item.vencimento < todayIso());
  const expected = monthPayments.reduce((sum, item) => sum + Number(item.valor || 0), 0);

  document.querySelector('#summary-expected').textContent = formatCurrency(expected);
  document.querySelector('#summary-expected-count').textContent = `${monthPayments.length} ${monthPayments.length === 1 ? 'mensalidade' : 'mensalidades'}`;
  document.querySelector('#summary-received').textContent = formatCurrency(received.reduce((sum, item) => sum + Number(item.valor || 0), 0));
  document.querySelector('#summary-received-count').textContent = `${received.length} ${received.length === 1 ? 'confirmada' : 'confirmadas'}`;
  document.querySelector('#summary-waiting').textContent = formatCurrency(waiting.reduce((sum, item) => sum + Number(item.valor || 0), 0));
  document.querySelector('#summary-waiting-count').textContent = `${waiting.length} ${waiting.length === 1 ? 'pagamento informado' : 'pagamentos informados'}`;
  document.querySelector('#summary-overdue').textContent = formatCurrency(overdue.reduce((sum, item) => sum + Number(item.valor || 0), 0));
  document.querySelector('#summary-overdue-count').textContent = `${overdue.length} ${overdue.length === 1 ? 'mensalidade' : 'mensalidades'}`;
}

function renderConfirmations() {
  const waiting = payments.filter(item => item.status === 'informado')
    .sort((a, b) => new Date(a.informado_em || a.updated_at) - new Date(b.informado_em || b.updated_at));
  const studentMap = new Map(students.map(student => [student.id, student]));
  confirmationsCount.textContent = String(waiting.length);
  confirmationsCard.classList.toggle('hidden', waiting.length === 0);
  confirmationsList.innerHTML = waiting.map(item => `
    <article class="finance-confirmation-item">
      <div class="finance-confirmation-main"><strong>${esc(studentMap.get(item.aluno_id)?.nome || 'Aluno')}</strong><span>Vencimento ${esc(formatDate(item.vencimento))}${item.informado_em ? ` · informado em ${esc(formatDateTime(item.informado_em))}` : ''}</span></div>
      <span class="finance-confirmation-value">${esc(formatCurrency(item.valor))}</span>
      <button class="btn btn-primary" type="button" data-confirm-payment="${esc(item.id)}">Confirmar pagamento</button>
    </article>`).join('');
}

function renderStudents() {
  const visible = studentStatusFilter === 'all'
    ? students
    : students.filter(student => statusInfo(paymentForStudent(student.id), student).key === studentStatusFilter);
  studentsList.innerHTML = visible.length ? visible.map(student => {
    const status = statusInfo(paymentForStudent(student.id), student);
    return `<tr class="finance-student-row" data-student-row="${esc(student.id)}" tabindex="0" role="button" aria-label="Abrir mensalidade de ${esc(student.nome)}"><td><div class="finance-student-name"><strong>${esc(student.nome)}</strong></div></td><td><div class="finance-student-status-cell"><span class="finance-status ${status.className}">${esc(status.label)}</span><span class="finance-student-open" aria-hidden="true">›</span></div></td></tr>`;
  }).join('') : '<tr><td colspan="2" class="finance-empty">Nenhum aluno encontrado com este status.</td></tr>';
}

function fillPixForm() {
  if (!profile || !pixForm) return;
  pixForm.pix_tipo.value = profile.pix_tipo || '';
  pixForm.pix_chave.value = profile.pix_chave || '';
  pixForm.pix_nome_recebedor.value = profile.pix_nome_recebedor || '';
  pixForm.pix_cidade.value = profile.pix_cidade || '';
}

function ensureCancelButton() {
  if (cancelPaymentButton || !studentModal) return;
  cancelPaymentButton = document.createElement('button');
  cancelPaymentButton.type = 'button';
  cancelPaymentButton.className = 'btn btn-danger hidden';
  cancelPaymentButton.textContent = 'Cancelar mensalidade';
  studentModal.querySelector('.finance-modal-actions')?.insertBefore(cancelPaymentButton, studentModalMarkPaid);
  cancelPaymentButton.addEventListener('click', cancelSelectedPayment);
}

function openStudentModal(studentId) {
  const student = students.find(item => item.id === studentId);
  if (!student || !studentModal) return;
  ensureCancelButton();
  selectedStudentId = studentId;
  const payment = paymentForStudent(studentId);
  const status = statusInfo(payment, student);
  studentModalTitle.textContent = student.nome;
  studentModalStatus.textContent = status.label;
  studentModalStatus.className = `finance-status ${status.className}`;
  studentModalValue.value = student.mensalidade_valor != null ? Number(student.mensalidade_valor).toFixed(2) : '';
  studentModalDay.value = student.mensalidade_dia_vencimento || '';
  studentModalActive.checked = Boolean(student.mensalidade_ativa);
  studentModalCompetence.textContent = formatCompetence(payment?.competencia || currentCompetence());
  studentModalDueDate.textContent = payment ? formatDate(payment.vencimento) : (student.mensalidade_dia_vencimento ? formatDate(dueDateForDay(student.mensalidade_dia_vencimento)) : '—');
  studentModalChargeValue.textContent = payment ? formatCurrency(payment.valor) : (student.mensalidade_valor ? formatCurrency(student.mensalidade_valor) : '—');
  studentModalReportedAt.textContent = formatDateTime(payment?.informado_em);
  studentModalConfirmedAt.textContent = formatDateTime(payment?.confirmado_em);

  const actionable = payment && ['pendente', 'informado'].includes(payment.status);
  studentModalMarkPaid.classList.toggle('hidden', !actionable);
  cancelPaymentButton?.classList.toggle('hidden', !actionable);
  if (actionable) {
    studentModalMarkPaid.dataset.paymentId = payment.id;
    cancelPaymentButton.dataset.paymentId = payment.id;
    studentModalMarkPaid.textContent = payment.status === 'informado' ? 'Confirmar pagamento' : 'Marcar como pago';
  } else {
    studentModalMarkPaid.removeAttribute('data-payment-id');
    cancelPaymentButton?.removeAttribute('data-payment-id');
  }
  studentModal.classList.remove('hidden');
  document.body.classList.add('finance-modal-open');
}

function closeStudentModal() {
  studentModal?.classList.add('hidden');
  document.body.classList.remove('finance-modal-open');
  selectedStudentId = null;
}

async function refreshFinancialUi() {
  await fetchPayments();
  renderSummary();
  renderConfirmations();
  renderStudents();
  if (selectedStudentId) openStudentModal(selectedStudentId);
}

async function saveStudentConfig() {
  if (!selectedStudentId) return;
  const value = Number(studentModalValue.value || 0);
  const day = Number(studentModalDay.value || 0);
  const active = Boolean(studentModalActive.checked);
  if (active && (!(value > 0) || day < 1 || day > 31)) return show('Informe um valor maior que zero e um dia entre 1 e 31.', 'error');

  studentModalSave.disabled = true;
  try {
    const { error } = await supabase.rpc('fsfit_configurar_mensalidade_aluno', {
      p_aluno_id: selectedStudentId,
      p_valor: value > 0 ? value : null,
      p_dia_vencimento: day >= 1 && day <= 31 ? day : null,
      p_ativa: active
    });
    if (error) throw error;
    const student = students.find(item => item.id === selectedStudentId);
    if (student) {
      student.mensalidade_valor = active ? value : null;
      student.mensalidade_dia_vencimento = active ? day : null;
      student.mensalidade_ativa = active;
    }
    await refreshFinancialUi();
    show(active ? 'Mensalidade atualizada com segurança.' : 'Mensalidade desativada. Cobranças pendentes foram canceladas.');
  } catch (error) {
    console.error(error);
    show(error.message || 'Não foi possível atualizar a mensalidade.', 'error');
  } finally {
    studentModalSave.disabled = false;
  }
}

async function confirmPayment(paymentId, button) {
  if (!paymentId) return;
  button.disabled = true;
  try {
    const { error } = await supabase.rpc('fsfit_confirmar_pagamento_mensalidade', { p_mensalidade_id: paymentId });
    if (error) throw error;
    await refreshFinancialUi();
    show('Pagamento confirmado com sucesso.');
  } catch (error) {
    console.error(error);
    show(error.message || 'Não foi possível confirmar o pagamento.', 'error');
  } finally {
    button.disabled = false;
  }
}

async function cancelSelectedPayment() {
  const paymentId = cancelPaymentButton?.dataset.paymentId;
  const payment = payments.find(item => item.id === paymentId);
  if (!paymentId || !payment) return;
  if (!confirm(`Cancelar esta mensalidade de ${formatCurrency(payment.valor)}? O histórico será preservado.`)) return;
  cancelPaymentButton.disabled = true;
  try {
    const { error } = await supabase.rpc('fsfit_cancelar_mensalidade', { p_mensalidade_id: paymentId });
    if (error) throw error;
    await refreshFinancialUi();
    show('Mensalidade cancelada. O histórico foi preservado.');
  } catch (error) {
    console.error(error);
    show(error.message || 'Não foi possível cancelar a mensalidade.', 'error');
  } finally {
    cancelPaymentButton.disabled = false;
  }
}

async function load() {
  if (!session) return;
  await setGreeting(session);
  const [profileResult, studentsResult] = await Promise.all([
    supabase.from('perfis').select('id,nome,pix_tipo,pix_chave,pix_nome_recebedor,pix_cidade').eq('id', session.user.id).single(),
    supabase.from('alunos').select('id,nome,status,mensalidade_valor,mensalidade_dia_vencimento,mensalidade_ativa').eq('status', 'ativo').order('nome')
  ]);
  if (profileResult.error) throw profileResult.error;
  if (studentsResult.error) throw studentsResult.error;
  profile = profileResult.data;
  students = studentsResult.data || [];
  await fetchPayments();
  await generateCurrentCharges();
  fillPixForm();
  renderSummary();
  renderConfirmations();
  renderStudents();
}

ensureStudentStatusFilter();
ensureCancelButton();

pixForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = document.querySelector('#save-pix-button');
  const payload = {
    pix_tipo: String(pixForm.pix_tipo.value || '').trim() || null,
    pix_chave: String(pixForm.pix_chave.value || '').trim() || null,
    pix_nome_recebedor: String(pixForm.pix_nome_recebedor.value || '').trim() || null,
    pix_cidade: String(pixForm.pix_cidade.value || '').trim() || null
  };
  if (payload.pix_chave && (!payload.pix_tipo || !payload.pix_nome_recebedor || !payload.pix_cidade)) return show('Preencha todos os dados do Pix.', 'error');
  button.disabled = true;
  try {
    const { error } = await supabase.from('perfis').update(payload).eq('id', session.user.id);
    if (error) throw error;
    profile = { ...profile, ...payload };
    show(payload.pix_chave ? 'Configuração Pix salva.' : 'Configuração Pix removida.');
  } catch (error) {
    show(error.message || 'Não foi possível salvar o Pix.', 'error');
  } finally {
    button.disabled = false;
  }
});

studentsList?.addEventListener('click', event => {
  const row = event.target.closest('[data-student-row]');
  if (row) openStudentModal(row.dataset.studentRow);
});
studentsList?.addEventListener('keydown', event => {
  if (!['Enter', ' '].includes(event.key)) return;
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
studentModalSave?.addEventListener('click', saveStudentConfig);
studentModalMarkPaid?.addEventListener('click', () => confirmPayment(studentModalMarkPaid.dataset.paymentId, studentModalMarkPaid));
confirmationsList?.addEventListener('click', event => {
  const button = event.target.closest('[data-confirm-payment]');
  if (button) void confirmPayment(button.dataset.confirmPayment, button);
});

load().catch(error => {
  console.error('Erro ao carregar financeiro:', error);
  show('Não foi possível carregar o Financeiro. Atualize a página e tente novamente.', 'error');
  if (studentsList) studentsList.innerHTML = '<tr><td colspan="2" class="finance-empty">Não foi possível carregar os dados financeiros.</td></tr>';
});
