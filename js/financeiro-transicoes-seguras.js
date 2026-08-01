import { supabase } from './supabase.js';

const RUNTIME_KEY = '__FSFIT_FINANCE_SAFE_TRANSITIONS__';

if (!globalThis[RUNTIME_KEY]) {
  globalThis[RUNTIME_KEY] = true;

  const modal = document.querySelector('#student-finance-modal');
  const modalActions = modal?.querySelector('.finance-modal-actions');
  const markPaidButton = document.querySelector('#student-finance-mark-paid');
  const message = document.querySelector('#finance-message');
  let cancelButton = null;
  let selectedPayment = null;

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

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
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

    setText('#summary-expected', formatCurrency(expected));
    setText('#summary-expected-count', `${monthPayments.length} ${monthPayments.length === 1 ? 'mensalidade' : 'mensalidades'}`);
    setText('#summary-received', formatCurrency(received.reduce((sum, item) => sum + Number(item.valor || 0), 0)));
    setText('#summary-received-count', `${received.length} ${received.length === 1 ? 'confirmada' : 'confirmadas'}`);
    setText('#summary-waiting', formatCurrency(waiting.reduce((sum, item) => sum + Number(item.valor || 0), 0)));
    setText('#summary-waiting-count', `${waiting.length} ${waiting.length === 1 ? 'pagamento informado' : 'pagamentos informados'}`);
    setText('#summary-overdue', formatCurrency(overdue.reduce((sum, item) => sum + Number(item.valor || 0), 0)));
    setText('#summary-overdue-count', `${overdue.length} ${overdue.length === 1 ? 'mensalidade' : 'mensalidades'}`);
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

  function closeModal() {
    modal?.classList.add('hidden');
    modal?.setAttribute('aria-hidden', 'true');
    selectedPayment = null;
    cancelButton?.classList.add('hidden');
  }

  function updatePaymentDom(paymentId, status) {
    const escapedId = CSS.escape(String(paymentId));
    document.querySelectorAll(`[data-payment-id="${escapedId}"],[data-confirm-payment="${escapedId}"]`)
      .forEach(element => {
        element.dataset.status = status;
        if (element.matches('button')) element.disabled = !['pendente', 'informado'].includes(status);
      });

    window.dispatchEvent(new CustomEvent('fsfit:finance-updated', {
      detail: { paymentId, status }
    }));
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

  async function confirmPaymentSafely(button) {
    const paymentId = button.dataset.paymentId || button.dataset.confirmPayment;
    if (!paymentId || button.dataset.processing === 'true') return;
    button.dataset.processing = 'true';
    button.disabled = true;
    try {
      const { error } = await supabase.rpc('fsfit_confirmar_pagamento_mensalidade', { p_mensalidade_id: paymentId });
      if (error) throw error;
      updatePaymentDom(paymentId, 'pago');
      await refreshSummary();
      closeModal();
      show('Pagamento confirmado com sucesso.');
    } catch (error) {
      console.error(error);
      show(error.message || 'Não foi possível confirmar o pagamento.', 'error');
      button.disabled = false;
    } finally {
      delete button.dataset.processing;
    }
  }

  async function cancelPaymentSafely() {
    if (!selectedPayment?.id || !cancelButton || cancelButton.dataset.processing === 'true') return;
    const confirmed = window.confirm(`Cancelar esta mensalidade de ${formatCurrency(selectedPayment.valor)}? O registro continuará no histórico e deixará de compor os totais.`);
    if (!confirmed) return;
    cancelButton.dataset.processing = 'true';
    cancelButton.disabled = true;
    try {
      const paymentId = selectedPayment.id;
      const { error } = await supabase.rpc('fsfit_cancelar_mensalidade', { p_mensalidade_id: paymentId });
      if (error) throw error;
      updatePaymentDom(paymentId, 'cancelada');
      await refreshSummary();
      closeModal();
      show('Mensalidade cancelada. O histórico foi preservado.');
    } catch (error) {
      console.error(error);
      show(error.message || 'Não foi possível cancelar a mensalidade.', 'error');
      cancelButton.disabled = false;
    } finally {
      delete cancelButton.dataset.processing;
    }
  }

  document.addEventListener('click', event => {
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
}
