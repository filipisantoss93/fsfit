import { supabase } from './supabase.js';

const alertCard = document.querySelector('#student-payment-alert');
const alertTitle = document.querySelector('#student-payment-title');
const alertText = document.querySelector('#student-payment-text');
const alertValue = document.querySelector('#student-payment-value');
const openPixButton = document.querySelector('#student-open-pix');
const paidButton = document.querySelector('#student-paid-button');
const paymentNote = document.querySelector('#student-payment-note');
const modal = document.querySelector('#student-pix-modal');
const qrHost = document.querySelector('#student-pix-qr');
const pixCodeField = document.querySelector('#student-pix-code');
const pixAmount = document.querySelector('#student-pix-amount');
const pixDueDate = document.querySelector('#student-pix-due-date');
const copyButton = document.querySelector('#student-copy-pix');
const modalPaidButton = document.querySelector('#student-modal-paid-button');

let payment = null;
let pixPayload = '';

function sessionToken() {
  return String(localStorage.getItem('fsfit_aluno_token') || '').trim();
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

function daysUntil(value) {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const dueUtc = Date.UTC(year, month - 1, day);
  return Math.round((dueUtc - todayUtc) / 86400000);
}

function emv(id, value) {
  const text = String(value ?? '');
  return `${id}${String(text.length).padStart(2, '0')}${text}`;
}

function normalizePixText(value, maxLength) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 $%*+\-./:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, maxLength);
}

function crc16(payload) {
  let result = 0xffff;
  for (let offset = 0; offset < payload.length; offset += 1) {
    result ^= payload.charCodeAt(offset) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      result = (result & 0x8000) ? ((result << 1) ^ 0x1021) : (result << 1);
      result &= 0xffff;
    }
  }
  return result.toString(16).toUpperCase().padStart(4, '0');
}

function buildPixPayload(data) {
  const key = String(data.pix_chave || '').trim();
  const merchantName = normalizePixText(data.pix_nome_recebedor || data.personal_nome, 25);
  const merchantCity = normalizePixText(data.pix_cidade, 15);
  const amount = Number(data.valor || 0).toFixed(2);

  if (!key || !merchantName || !merchantCity || !(Number(data.valor) > 0)) return '';

  const merchantAccount = emv('00', 'BR.GOV.BCB.PIX') + emv('01', key) + emv('02', 'MENSALIDADE FS FIT');
  const additionalData = emv('05', '***');
  const body = [
    emv('00', '01'),
    emv('01', '11'),
    emv('26', merchantAccount),
    emv('52', '0000'),
    emv('53', '986'),
    emv('54', amount),
    emv('58', 'BR'),
    emv('59', merchantName),
    emv('60', merchantCity),
    emv('62', additionalData),
    '6304'
  ].join('');

  return `${body}${crc16(body)}`;
}

function setModalOpen(open) {
  if (!modal) return;
  modal.classList.toggle('open', open);
  modal.setAttribute('aria-hidden', String(!open));
  document.body.classList.toggle('student-pix-open', open);
}

function canGeneratePix(data) {
  return Boolean(data?.pix_chave && (data?.pix_nome_recebedor || data?.personal_nome) && data?.pix_cidade && Number(data?.valor) > 0);
}

function renderPayment() {
  if (!payment?.ativa || !payment.id || payment.status === 'pago') {
    alertCard?.classList.add('hidden');
    return;
  }

  const remainingDays = daysUntil(payment.vencimento);
  const waitingConfirmation = payment.status === 'informado';
  const shouldShow = waitingConfirmation || remainingDays == null || remainingDays <= 7;

  if (!shouldShow) {
    alertCard?.classList.add('hidden');
    return;
  }

  alertCard.classList.remove('hidden', 'overdue', 'waiting');
  alertValue.textContent = formatCurrency(payment.valor);

  if (waitingConfirmation) {
    alertCard.classList.add('waiting');
    alertTitle.textContent = 'Pagamento informado';
    alertText.textContent = 'Seu personal recebeu seu aviso e fará a confirmação após conferir o Pix na conta.';
    paidButton.classList.add('hidden');
    modalPaidButton?.classList.add('hidden');
  } else {
    paidButton.classList.remove('hidden');
    modalPaidButton?.classList.remove('hidden');
    if (remainingDays < 0) {
      alertCard.classList.add('overdue');
      const days = Math.abs(remainingDays);
      alertTitle.textContent = 'Mensalidade vencida';
      alertText.textContent = `Vencimento em ${formatDate(payment.vencimento)} · ${days} ${days === 1 ? 'dia' : 'dias'} em atraso.`;
    } else if (remainingDays === 0) {
      alertTitle.textContent = 'Sua mensalidade vence hoje';
      alertText.textContent = `Vencimento em ${formatDate(payment.vencimento)}. Gere o Pix para pagar diretamente ao seu personal.`;
    } else {
      alertTitle.textContent = 'Próximo vencimento';
      alertText.textContent = `Sua mensalidade vence em ${remainingDays} ${remainingDays === 1 ? 'dia' : 'dias'}, em ${formatDate(payment.vencimento)}.`;
    }
  }

  const pixAvailable = canGeneratePix(payment);
  openPixButton.disabled = !pixAvailable;
  openPixButton.textContent = pixAvailable ? 'Gerar QR Code Pix' : 'Pix ainda não configurado';
  paymentNote.textContent = pixAvailable
    ? 'O pagamento é feito diretamente para a chave Pix do seu personal. O FS Fit não recebe nem intermedeia o valor.'
    : 'Seu personal ainda não configurou uma chave Pix para recebimento no FS Fit.';
}

function renderPixModal() {
  pixPayload = buildPixPayload(payment);
  if (!pixPayload) return;

  pixAmount.textContent = formatCurrency(payment.valor);
  pixDueDate.textContent = formatDate(payment.vencimento);
  pixCodeField.value = pixPayload;
  qrHost.innerHTML = '';

  try {
    if (window.QRCode) {
      new window.QRCode(qrHost, {
        text: pixPayload,
        width: 230,
        height: 230,
        correctLevel: window.QRCode.CorrectLevel?.M
      });
    } else {
      qrHost.innerHTML = '<p style="color:#111;text-align:center">QR Code indisponível. Use o Pix Copia e Cola abaixo.</p>';
    }
  } catch (error) {
    console.error('Não foi possível renderizar o QR Code:', error);
    qrHost.innerHTML = '<p style="color:#111;text-align:center">QR Code indisponível. Use o Pix Copia e Cola abaixo.</p>';
  }
}

async function copyPixCode() {
  if (!pixPayload) return;
  const original = copyButton.textContent;
  try {
    await navigator.clipboard.writeText(pixPayload);
    copyButton.textContent = 'Código copiado!';
  } catch {
    pixCodeField.focus();
    pixCodeField.select();
    document.execCommand('copy');
    copyButton.textContent = 'Código copiado!';
  }
  window.setTimeout(() => { copyButton.textContent = original; }, 1800);
}

async function informPaid(button) {
  const token = sessionToken();
  if (!token || !payment?.id || payment.status === 'informado' || payment.status === 'pago') return;

  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Enviando aviso...';

  try {
    const { data, error } = await supabase.rpc('fsfit_aluno_informar_pagamento', {
      p_session_token: token,
      p_mensalidade_id: payment.id
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.erro || 'Não foi possível informar o pagamento.');

    payment.status = data.status || 'informado';
    payment.informado_em = data.informado_em || new Date().toISOString();
    setModalOpen(false);
    renderPayment();
  } catch (error) {
    console.error(error);
    button.textContent = 'Tentar novamente';
    window.setTimeout(() => { button.textContent = original; }, 2200);
  } finally {
    button.disabled = false;
  }
}

openPixButton?.addEventListener('click', () => {
  if (!canGeneratePix(payment)) return;
  renderPixModal();
  setModalOpen(true);
});

copyButton?.addEventListener('click', copyPixCode);
paidButton?.addEventListener('click', () => informPaid(paidButton));
modalPaidButton?.addEventListener('click', () => informPaid(modalPaidButton));
document.querySelectorAll('[data-close-student-pix]').forEach(button => button.addEventListener('click', () => setModalOpen(false)));
document.addEventListener('keydown', event => { if (event.key === 'Escape') setModalOpen(false); });

async function loadPayment() {
  const token = sessionToken();
  if (!token || !alertCard) return;

  try {
    const { data, error } = await supabase.rpc('fsfit_obter_mensalidade_aluno', { p_session_token: token });
    if (error) throw error;
    if (!data || data.erro === 'sessao_invalida') return;
    payment = data;
    renderPayment();
  } catch (error) {
    console.error('Não foi possível carregar a mensalidade do aluno:', error);
  }
}

loadPayment();
