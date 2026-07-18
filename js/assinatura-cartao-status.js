import { supabase } from './supabase.js';

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
}

function closeModal() {
  document.querySelector('#card-status-modal-backdrop')?.remove();
}

function openCancelModal(access) {
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.id = 'card-status-modal-backdrop';
  backdrop.className = 'plan-modal-backdrop';
  backdrop.innerHTML = `
    <section class="plan-modal" role="dialog" aria-modal="true" aria-labelledby="card-status-modal-title">
      <div class="plan-modal-header">
        <div>
          <h2 id="card-status-modal-title">Cancelar assinatura do cartão</h2>
          <p>A renovação automática será interrompida na Efí.</p>
        </div>
        <button class="plan-modal-close" type="button" aria-label="Fechar">×</button>
      </div>
      <div class="cancel-summary">
        <div class="cancel-summary-box">
          <strong>${access?.assinatura_status === 'inadimplente' ? 'Pagamento não concluído' : 'Pagamento em processamento'}</strong>
          <span>Ao cancelar esta recorrência, você poderá iniciar uma nova assinatura com outro cartão. Caso já exista algum período pago, o acesso continuará válido até ${formatDate(access?.acesso_valido_ate)}.</span>
        </div>
        <div id="card-status-cancel-error" class="card-error" hidden></div>
        <div class="cancel-actions">
          <button id="card-status-keep" class="btn btn-secondary" type="button">Voltar</button>
          <button id="card-status-confirm-cancel" class="btn btn-outline" type="button">Confirmar cancelamento</button>
        </div>
      </div>
    </section>`;
  document.body.appendChild(backdrop);

  backdrop.querySelector('.plan-modal-close')?.addEventListener('click', closeModal);
  backdrop.querySelector('#card-status-keep')?.addEventListener('click', closeModal);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(); });
  backdrop.querySelector('#card-status-confirm-cancel')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const errorBox = backdrop.querySelector('#card-status-cancel-error');
    button.disabled = true;
    button.textContent = 'Cancelando...';
    if (errorBox) errorBox.hidden = true;

    try {
      const { data, error } = await supabase.functions.invoke('cancelar-assinatura-cartao-fsfit', {
        body: { assinatura_id: access?.assinatura_id },
      });
      if (data?.erro) throw new Error(data.erro);
      if (error) throw error;
      if (!data?.sucesso) throw new Error('O cancelamento não foi confirmado.');

      const container = backdrop.querySelector('.plan-modal');
      if (container) {
        container.innerHTML = `
          <div class="card-success">
            <strong>✅ Recorrência cancelada</strong>
            <span>Não haverá novas cobranças desta assinatura. Você já pode iniciar uma nova assinatura com outro cartão.</span>
          </div>`;
      }
      setTimeout(() => window.location.reload(), 1600);
    } catch (error) {
      console.error('Erro ao cancelar assinatura pendente:', error);
      if (errorBox) {
        errorBox.hidden = false;
        errorBox.textContent = error?.message || 'Não foi possível cancelar a assinatura.';
      }
      button.disabled = false;
      button.textContent = 'Confirmar cancelamento';
    }
  });
}

function renderPendingCard(access) {
  const status = access?.assinatura_status;
  if (access?.meio_pagamento !== 'cartao' || !access?.renovacao_automatica || !['pendente', 'inadimplente'].includes(status)) return;

  const main = document.querySelector('main.container');
  const header = main?.querySelector('.page-header');
  if (!main || !header) return;

  document.querySelector('#plan-renewal-card')?.remove();
  const card = document.createElement('section');
  card.id = 'plan-renewal-card';
  card.className = `plan-renewal-card ${status === 'inadimplente' ? 'urgent' : ''}`;
  card.innerHTML = `
    <div class="plan-renewal-copy">
      <small>${status === 'inadimplente' ? 'PAGAMENTO NÃO CONCLUÍDO' : 'CARTÃO EM PROCESSAMENTO'}</small>
      <strong>${status === 'inadimplente' ? 'A cobrança do cartão não foi confirmada' : 'Aguardando confirmação da primeira cobrança'}</strong>
      <span>${status === 'inadimplente'
        ? 'Cancele esta recorrência para tentar novamente com outro cartão. Nenhuma nova assinatura duplicada será criada enquanto esta estiver ativa.'
        : 'A Efí está processando o cartão. Assim que a cobrança for confirmada, o plano será ativado automaticamente.'}</span>
    </div>
    <div class="plan-renewal-actions">
      <button id="cancel-pending-card-subscription" class="btn btn-outline" type="button">${status === 'inadimplente' ? 'Cancelar e tentar outro cartão' : 'Cancelar assinatura'}</button>
    </div>`;

  header.insertAdjacentElement('afterend', card);
  card.querySelector('#cancel-pending-card-subscription')?.addEventListener('click', () => openCancelModal(access));
}

async function init() {
  try {
    const distribution = localStorage.getItem('fsfit_distribution') || sessionStorage.getItem('fsfit_distribution');
    if (distribution === 'google-play') return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data, error } = await supabase.rpc('fsfit_sincronizar_meu_acesso');
    if (error) throw error;
    renderPendingCard(data);
  } catch (error) {
    console.error('Não foi possível carregar o status da assinatura de cartão:', error);
  }
}

init();
