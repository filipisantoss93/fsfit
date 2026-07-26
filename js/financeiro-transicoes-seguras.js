import { supabase } from './supabase.js';

const modal = document.querySelector('#student-finance-modal');
const modalActions = modal?.querySelector('.finance-modal-actions');
const markPaidButton = document.querySelector('#student-finance-mark-paid');
const saveButton = document.querySelector('#student-finance-save');
const valueInput = document.querySelector('#student-finance-value');
const dayInput = document.querySelector('#student-finance-day');
const activeInput = document.querySelector('#student-finance-active');
const studentsList = document.querySelector('#finance-students-list');
const message = document.querySelector('#finance-message');
let cancelButton = null;
let selectedPayment = null;
let selectedStudentId = null;

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

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function currentCompetence() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

async function fetchPayments() {
  const { data, error } = await supabase
    .from('mensalidades_alunos')
    .select('id,aluno_id,competencia,vencimento,valor,status,informado_em,confirmado_em')
    .order('vencimento', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function refreshSummary() {
  const payments = await fetchPayments();
  const competence = currentCompetence();
  const monthPayments = payments.filter(item => item.competencia === competence && item.status !== 'cancelada');
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

function ensureCancelButton() {
  if (!modalActions || cancelButton) return;
  cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = 'btn btn-danger hidden';
  cancelButton.textContent = 'Cancelar mensalidade';
  cancelButton.dataset.cancelMonthlyCharge = 'true';
  modalActions.insertBefore(cancelButton, markPaidButton || modalActions.lastElementChild);
}

async function syncModalPayment() {
  ensureCancelButton();
  const paymentId = markPaidButton?.dataset.paymentId;
  if (!paymentId) {
    selectedPayment = null;
    cancelButton?.classList.add('hidden');
    return;
  }

  const { data, error } = await supabase
    .from('mensalidades_alunos')
    .select('id,status,valor,vencimento')
    .eq('id', paymentId)
    .maybeSingle();
  if (error || !data) {
    selectedPayment = null;
    cancelButton?.classList.add('hidden');
    return;
  }

  selectedPayment = data;
  cancelButton?.classList.toggle('hidden', !['pendente', 'informado'].includes(data.status));
}

async function configureMonthlyChargeSafely(button) {
  if (!selectedStudentId) {
    show('Não foi possível identificar o aluno selecionado.', 'error');
    return;
  }

  const active = Boolean(activeInput?.checked);
  const value = Number(valueInput?.value || 0);
  const day = Number(dayInput?.value || 0);

  if (active && (!(value > 0) || day < 1 || day > 31)) {
    show('Para ativar a mensalidade, informe um valor maior que zero e um dia de vencimento entre 1 e 31.', 'error');
    return;
  }

  button.disabled = true;
  try {
    const { error } = await supabase.rpc('fsfit_configurar_mensalidade_aluno', {
      p_aluno_id: selectedStudentId,
      p_valor: active ? value : null,
      p_dia_vencimento: active ? day : null,
      p_ativa: active
    });
    if (error) throw error;

    show(active
      ? 'Mensalidade atualizada e cobrança do mês sincronizada.'
      : 'Mensalidade desativada. Cobranças pendentes do mês foram canceladas.');
    await refreshSummary();
    window.setTimeout(() => window.location.reload(), 350);
  } catch (error) {
    console.error(error);
    show(error.message || 'Não foi possível atualizar a mensalidade deste aluno.', 'error');
    button.disabled = false;
  }
}

async function confirmPaymentSafely(button) {
  const paymentId = button.dataset.paymentId || button.dataset.confirmPayment;
  if (!paymentId) return;
  button.disabled = true;
  try {
    const { error } = await supabase.rpc('fsfit_confirmar_pagamento_mensalidade', { p_mensalidade_id: paymentId });
    if (error) throw error;
    show('Pagamento confirmado com sucesso.');
    await refreshSummary();
    window.setTimeout(() => window.location.reload(), 350);
  } catch (error) {
    console.error(error);
    show(error.message || 'Não foi possível confirmar o pagamento.', 'error');
    button.disabled = false;
  }
}

async function cancelPaymentSafely() {
  if (!selectedPayment?.id || !cancelButton) return;
  const confirmed = window.confirm(`Cancelar esta mensalidade de ${formatCurrency(selectedPayment.valor)}? O registro continuará no histórico e deixará de compor os totais.`);
  if (!confirmed) return;
  cancelButton.disabled = true;
  try {
    const { error } = await supabase.rpc('fsfit_cancelar_mensalidade', { p_mensalidade_id: selectedPayment.id });
    if (error) throw error;
    show('Mensalidade cancelada. O histórico foi preservado.');
    await refreshSummary();
    window.setTimeout(() => window.location.reload(), 350);
  } catch (error) {
    console.error(error);
    show(error.message || 'Não foi possível cancelar a mensalidade.', 'error');
    cancelButton.disabled = false;
  }
}

studentsList?.addEventListener('click', event => {
  const row = event.target.closest('[data-student-row]');
  if (row) selectedStudentId = row.dataset.studentRow || null;
}, true);

studentsList?.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const row = event.target.closest('[data-student-row]');
  if (row) selectedStudentId = row.dataset.studentRow || null;
}, true);

document.addEventListener('click', event => {
  const configButton = event.target.closest('#student-finance-save');
  if (configButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void configureMonthlyChargeSafely(configButton);
    return;
  }

  const confirmButton = event.target.closest('#student-finance-mark-paid,[data-confirm-payment]');
  if (!confirmButton) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void confirmPaymentSafely(confirmButton);
}, true);

modal?.addEventListener('click', event => {
  if (!event.target.closest('[data-cancel-monthly-charge]')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void cancelPaymentSafely();
}, true);

if (modal) {
  new MutationObserver(() => {
    if (!modal.classList.contains('hidden')) void syncModalPayment();
  }).observe(modal, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true });
}

ensureCancelButton();
void refreshSummary().catch(error => console.warn('Resumo financeiro seguro indisponível:', error));
