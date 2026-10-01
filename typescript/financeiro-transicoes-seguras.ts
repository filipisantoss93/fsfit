// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { supabase } from './supabase.js';

interface PaymentRow {
  id: string | number;
  aluno_id?: string | number | null;
  competencia?: string | null;
  vencimento?: string | null;
  valor?: number | string | null;
  status?: string | null;
  informado_em?: string | null;
  confirmado_em?: string | null;
}

const RUNTIME_KEY = '__FSFIT_FINANCE_SAFE_TRANSITIONS__';
const runtime = globalThis as typeof globalThis & Record<string, unknown>;

if (!runtime[RUNTIME_KEY]) {
  runtime[RUNTIME_KEY] = true;

  const modal = document.querySelector<HTMLElement>('#student-finance-modal');
  const modalActions = modal?.querySelector<HTMLElement>('.finance-modal-actions');
  const markPaidButton = document.querySelector<HTMLButtonElement>('#student-finance-mark-paid');
  const message = document.querySelector<HTMLElement>('#finance-message');
  let cancelButton: HTMLButtonElement | null = null;
  let selectedPayment: PaymentRow | null = null;
  let showTimer: number | null = null;

  function show(text: string, type = 'success'): void {
    if (!message) return;
    message.textContent = text;
    message.className = `message show ${type}`;
    if (showTimer !== null) window.clearTimeout(showTimer);
    showTimer = window.setTimeout(() => {
      message.textContent = '';
      message.className = 'message';
      showTimer = null;
    }, 4500);
  }

  function formatCurrency(value: unknown): string {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function todayIso(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function currentCompetence(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }

  function setText(selector: string, value: string): void {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) element.textContent = value;
  }

  async function fetchPayments(): Promise<PaymentRow[]> {
    const { data, error } = await supabase
      .from('mensalidades_alunos')
      .select('id,aluno_id,competencia,vencimento,valor,status,informado_em,confirmado_em')
      .order('vencimento', { ascending: false });
    if (error) throw error;
    return (Array.isArray(data) ? data : []) as PaymentRow[];
  }

  async function refreshSummary(): Promise<void> {
    const payments = await fetchPayments();
    const competence = currentCompetence();
    const monthPayments = payments.filter(item => item.competencia === competence && item.status !== 'cancelada');
    const received = monthPayments.filter(item => item.status === 'pago');
    const waiting = monthPayments.filter(item => item.status === 'informado');
    const overdue = payments.filter(item => item.status === 'pendente' && String(item.vencimento || '') < todayIso());
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

  function ensureCancelButton(): void {
    if (!modalActions || cancelButton) return;
    cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'btn btn-danger hidden';
    cancelButton.textContent = 'Cancelar mensalidade';
    cancelButton.dataset.cancelMonthlyCharge = 'true';
    modalActions.insertBefore(cancelButton, markPaidButton || modalActions.lastElementChild);
  }

  function closeModal(): void {
    modal?.classList.add('hidden');
    modal?.setAttribute('aria-hidden', 'true');
    selectedPayment = null;
    cancelButton?.classList.add('hidden');
  }

  function updatePaymentDom(paymentId: string | number, status: string): void {
    const escapedId = CSS.escape(String(paymentId));
    document.querySelectorAll<HTMLElement>(`[data-payment-id="${escapedId}"],[data-confirm-payment="${escapedId}"]`)
      .forEach(element => {
        element.dataset.status = status;
        if (element instanceof HTMLButtonElement) element.disabled = !['pendente', 'informado'].includes(status);
      });

    window.dispatchEvent(new CustomEvent('fsfit:finance-updated', {
      detail: { paymentId, status }
    }));
  }

  async function syncModalPayment(): Promise<void> {
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

    selectedPayment = data as PaymentRow;
    cancelButton?.classList.toggle('hidden', !['pendente', 'informado'].includes(String(selectedPayment.status || '')));
  }

  async function confirmPaymentSafely(button: HTMLButtonElement): Promise<void> {
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
      show(error instanceof Error ? error.message : 'Não foi possível confirmar o pagamento.', 'error');
      button.disabled = false;
    } finally {
      delete button.dataset.processing;
    }
  }

  async function cancelPaymentSafely(): Promise<void> {
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
      show(error instanceof Error ? error.message : 'Não foi possível cancelar a mensalidade.', 'error');
      cancelButton.disabled = false;
    } finally {
      delete cancelButton.dataset.processing;
    }
  }

  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const confirmButton = event.target.closest<HTMLButtonElement>('#student-finance-mark-paid,[data-confirm-payment]');
    if (!confirmButton) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void confirmPaymentSafely(confirmButton);
  }, true);

  modal?.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-cancel-monthly-charge]')) return;
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
