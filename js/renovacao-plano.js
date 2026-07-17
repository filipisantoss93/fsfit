import { supabase } from './supabase.js';

const PLAY_DISTRIBUTION_KEY = 'fsfit_distribution';
const PLAY_DISTRIBUTION_VALUE = 'google-play';
const isGooglePlayDistribution = localStorage.getItem(PLAY_DISTRIBUTION_KEY) === PLAY_DISTRIBUTION_VALUE
  || sessionStorage.getItem(PLAY_DISTRIBUTION_KEY) === PLAY_DISTRIBUTION_VALUE;

const DAY_MS = 24 * 60 * 60 * 1000;
let pollTimer = null;

function injectStyles() {
  if (document.querySelector('#fsfit-renewal-styles')) return;
  const style = document.createElement('style');
  style.id = 'fsfit-renewal-styles';
  style.textContent = `
    .plan-renewal-card{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:0 0 20px;padding:18px 20px;border:1px solid rgba(255,193,7,.32);border-radius:16px;background:rgba(255,193,7,.08)}
    .plan-renewal-card.urgent{border-color:rgba(255,87,87,.42);background:rgba(255,87,87,.09)}
    .plan-renewal-card.expired{border-color:rgba(255,87,87,.5);background:rgba(255,87,87,.11)}
    .plan-renewal-card.trial{border-color:rgba(50,215,75,.35);background:rgba(50,215,75,.08)}
    .plan-renewal-copy{min-width:0}.plan-renewal-copy small{display:block;margin-bottom:4px;font-size:.72rem;font-weight:900;letter-spacing:.08em;color:var(--muted)}
    .plan-renewal-copy strong{display:block;font-size:1rem}.plan-renewal-copy span{display:block;margin-top:4px;color:var(--muted);font-size:.86rem}
    .plan-renewal-actions{display:flex;gap:10px;flex:0 0 auto}
    .plan-modal-backdrop{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.72);backdrop-filter:blur(4px)}
    .plan-modal{width:min(560px,100%);max-height:calc(100vh - 36px);overflow:auto;padding:22px;border:1px solid var(--border);border-radius:18px;background:var(--surface,#171a20);box-shadow:0 24px 70px rgba(0,0,0,.45)}
    .plan-modal-header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:18px}.plan-modal-header h2{margin:0}.plan-modal-header p{margin:5px 0 0;color:var(--muted);font-size:.88rem}
    .plan-modal-close{border:0;background:transparent;color:inherit;font-size:1.5rem;cursor:pointer}
    .plan-options{display:grid;gap:10px}.plan-option{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--surface-light);cursor:pointer;text-align:left;color:inherit}
    .plan-option:hover{border-color:var(--primary)}.plan-option strong,.plan-option span{display:block}.plan-option span{margin-top:3px;color:var(--muted);font-size:.8rem}.plan-option-price{font-weight:900;white-space:nowrap}
    .pix-box{text-align:center}.pix-box img{display:block;width:min(280px,100%);margin:14px auto;border-radius:14px;background:#fff}.pix-code{width:100%;min-height:92px;resize:none}.pix-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:12px}.pix-status{margin-top:14px;color:var(--muted);font-size:.88rem}
    @media(max-width:620px){.plan-renewal-card{align-items:flex-start;flex-direction:column}.plan-renewal-actions{width:100%}.plan-renewal-actions .btn{width:100%}.plan-modal{padding:18px}}
  `;
  document.head.appendChild(style);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
}

function daysRemaining(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / DAY_MS);
}

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function removeExistingCard() {
  document.querySelector('#plan-renewal-card')?.remove();
}

function renderGooglePlayAccessCard(access) {
  removeExistingCard();
  if (access?.admin) return;

  const main = document.querySelector('main.container');
  const header = main?.querySelector('.page-header');
  if (!main || !header) return;

  const type = access?.tipo_acesso || (access?.plano === 'free' ? 'free' : null);
  const remaining = daysRemaining(access?.acesso_valido_ate);

  let visible = false;
  let className = '';
  let label = '';
  let title = '';
  let detail = '';

  if (type === 'pago' && remaining !== null && remaining <= 7) {
    visible = true;
    className = remaining <= 3 ? 'urgent' : '';
    label = remaining <= 3 ? 'VENCIMENTO PRÓXIMO' : 'ASSINATURA';
    title = remaining > 0
      ? `Seu plano vence em ${remaining} ${remaining === 1 ? 'dia' : 'dias'}`
      : 'Seu plano vence hoje';
    detail = `Seu acesso profissional permanece válido até ${formatDate(access.acesso_valido_ate)}.`;
  } else if (type === 'trial' && remaining !== null && remaining <= 7) {
    visible = true;
    className = remaining <= 3 ? 'urgent trial' : 'trial';
    label = 'PERÍODO GRATUITO';
    title = remaining > 0
      ? `Seu período gratuito termina em ${remaining} ${remaining === 1 ? 'dia' : 'dias'}`
      : 'Seu período gratuito termina hoje';
    detail = `Seu acesso atual permanece válido até ${formatDate(access.acesso_valido_ate)}.`;
  } else if (type === 'free') {
    visible = true;
    className = 'expired';
    label = 'STATUS DA CONTA';
    title = 'Seu acesso premium não está ativo';
    detail = 'Entre em contato com o suporte para informações sobre o status da sua conta.';
  }

  if (!visible) return;

  const card = document.createElement('section');
  card.id = 'plan-renewal-card';
  card.className = `plan-renewal-card ${className}`.trim();
  card.innerHTML = `
    <div class="plan-renewal-copy">
      <small>${label}</small>
      <strong>${title}</strong>
      <span>${detail}</span>
    </div>`;

  header.insertAdjacentElement('afterend', card);
}

function renderRenewalCard(access) {
  removeExistingCard();
  if (access?.admin) return;

  const main = document.querySelector('main.container');
  const header = main?.querySelector('.page-header');
  if (!main || !header) return;

  const type = access?.tipo_acesso || (access?.plano === 'free' ? 'free' : null);
  const remaining = daysRemaining(access?.acesso_valido_ate);

  let visible = false;
  let className = '';
  let label = '';
  let title = '';
  let detail = '';
  let buttonText = 'Renovar plano';

  if (type === 'pago' && remaining !== null && remaining <= 7) {
    visible = true;
    className = remaining <= 3 ? 'urgent' : '';
    label = remaining <= 3 ? 'VENCIMENTO PRÓXIMO' : 'ASSINATURA';
    title = remaining > 0
      ? `Seu plano vence em ${remaining} ${remaining === 1 ? 'dia' : 'dias'}`
      : 'Seu plano vence hoje';
    detail = `Acesso profissional válido até ${formatDate(access.acesso_valido_ate)}. Renove agora para manter o acesso sem interrupção.`;
  } else if (type === 'trial' && remaining !== null && remaining <= 7) {
    visible = true;
    className = remaining <= 3 ? 'urgent trial' : 'trial';
    label = 'PERÍODO GRATUITO';
    title = remaining > 0
      ? `Seu trial termina em ${remaining} ${remaining === 1 ? 'dia' : 'dias'}`
      : 'Seu trial termina hoje';
    detail = `Teste gratuito válido até ${formatDate(access.acesso_valido_ate)}. Ative um plano para continuar usando todos os recursos.`;
    buttonText = 'Assinar plano';
  } else if (type === 'free') {
    visible = true;
    className = 'expired';
    label = 'PLANO FREE';
    title = 'Ative seu acesso profissional';
    detail = 'Seu acesso premium não está ativo. Assine ou renove um plano para liberar alunos, agenda, exercícios e demais áreas de gestão.';
    buttonText = 'Ativar plano';
  }

  if (!visible) return;

  const card = document.createElement('section');
  card.id = 'plan-renewal-card';
  card.className = `plan-renewal-card ${className}`.trim();
  card.innerHTML = `
    <div class="plan-renewal-copy">
      <small>${label}</small>
      <strong>${title}</strong>
      <span>${detail}</span>
    </div>
    <div class="plan-renewal-actions">
      <button id="renew-plan-button" class="btn btn-primary" type="button">${buttonText}</button>
    </div>`;

  header.insertAdjacentElement('afterend', card);
  card.querySelector('#renew-plan-button')?.addEventListener('click', openPlanModal);
}

function closeModal() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  document.querySelector('#plan-modal-backdrop')?.remove();
}

async function openPlanModal() {
  if (isGooglePlayDistribution) return;
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.id = 'plan-modal-backdrop';
  backdrop.className = 'plan-modal-backdrop';
  backdrop.innerHTML = `
    <section class="plan-modal" role="dialog" aria-modal="true" aria-labelledby="plan-modal-title">
      <div class="plan-modal-header">
        <div><h2 id="plan-modal-title">Escolha seu plano</h2><p>O pagamento é feito por PIX e a liberação ocorre automaticamente após a confirmação.</p></div>
        <button class="plan-modal-close" type="button" aria-label="Fechar">×</button>
      </div>
      <div id="plan-modal-content"><p>Carregando planos...</p></div>
    </section>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector('.plan-modal-close')?.addEventListener('click', closeModal);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(); });

  const content = backdrop.querySelector('#plan-modal-content');
  try {
    const { data, error } = await supabase
      .from('planos_assinatura')
      .select('id,nome,valor_centavos,intervalo_meses,desconto_percentual')
      .eq('ativo', true)
      .eq('meio_pagamento', 'pix')
      .order('intervalo_meses', { ascending: true });
    if (error) throw error;

    const plans = Array.isArray(data) ? data : [];
    if (!plans.length) throw new Error('Nenhum plano PIX disponível no momento.');

    content.innerHTML = `<div class="plan-options">${plans.map(plan => `
      <button class="plan-option" type="button" data-plan-id="${plan.id}">
        <span><strong>${plan.nome}</strong><span>${plan.intervalo_meses} ${plan.intervalo_meses === 1 ? 'mês' : 'meses'}${Number(plan.desconto_percentual) > 0 ? ` · ${Number(plan.desconto_percentual)}% de desconto` : ''}</span></span>
        <span class="plan-option-price">${money(plan.valor_centavos)}</span>
      </button>`).join('')}</div>`;

    content.querySelectorAll('[data-plan-id]').forEach(button => {
      button.addEventListener('click', () => createPix(button.dataset.planId, content));
    });
  } catch (error) {
    console.error('Erro ao carregar planos:', error);
    content.innerHTML = `<div class="message show error">${error.message || 'Não foi possível carregar os planos.'}</div>`;
  }
}

async function createPix(planId, content) {
  if (isGooglePlayDistribution) return;
  content.innerHTML = '<p>Gerando sua cobrança PIX...</p>';
  try {
    const { data, error } = await supabase.functions.invoke('criar-pix-fsfit', {
      body: { plano_id: planId }
    });
    if (error) throw error;
    if (data?.erro) throw new Error(data.erro);

    const charge = data?.cobranca;
    if (!charge?.id) throw new Error('A cobrança foi criada sem identificador válido.');

    content.innerHTML = `
      <div class="pix-box">
        <h3>Escaneie o QR Code</h3>
        <p>Após o pagamento, o FS Fit confirmará automaticamente a renovação.</p>
        ${charge.qr_code_url ? `<img src="${charge.qr_code_url}" alt="QR Code PIX">` : ''}
        <textarea id="pix-copy-code" class="pix-code" readonly>${charge.pix_copia_cola || ''}</textarea>
        <div class="pix-actions">
          <button id="copy-pix-button" class="btn btn-secondary" type="button">Copiar código PIX</button>
          <button id="check-pix-button" class="btn btn-outline" type="button">Já paguei, verificar</button>
        </div>
        <div id="pix-payment-status" class="pix-status">Aguardando confirmação do pagamento...</div>
      </div>`;

    content.querySelector('#copy-pix-button')?.addEventListener('click', async event => {
      try {
        await navigator.clipboard.writeText(charge.pix_copia_cola || '');
        event.currentTarget.textContent = 'Código copiado!';
      } catch {
        event.currentTarget.textContent = 'Copie o código acima';
      }
    });

    const verify = () => verifyPix(charge.id, content);
    content.querySelector('#check-pix-button')?.addEventListener('click', verify);
    pollTimer = setInterval(verify, 5000);
  } catch (error) {
    console.error('Erro ao criar PIX:', error);
    content.innerHTML = `<div class="message show error">${error.message || 'Não foi possível gerar a cobrança PIX.'}</div><button id="retry-plan-button" class="btn btn-secondary" type="button" style="margin-top:12px">Voltar aos planos</button>`;
    content.querySelector('#retry-plan-button')?.addEventListener('click', openPlanModal);
  }
}

async function verifyPix(chargeId, content) {
  const status = content.querySelector('#pix-payment-status');
  try {
    const { data, error } = await supabase.functions.invoke('verificar-pix-fsfit', {
      body: { id: chargeId }
    });
    if (error) throw error;
    if (data?.erro) throw new Error(data.erro);

    if (data?.cobranca?.status === 'paga' || data?.cobranca?.processada_em) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      if (status) status.textContent = '✅ Pagamento confirmado. Seu acesso foi renovado com sucesso.';
      setTimeout(() => window.location.reload(), 1400);
    } else if (status) {
      status.textContent = 'Aguardando confirmação do pagamento...';
    }
  } catch (error) {
    console.error('Erro ao verificar PIX:', error);
    if (status) status.textContent = 'Não foi possível verificar agora. Tentaremos novamente automaticamente.';
  }
}

async function init() {
  injectStyles();
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data, error } = await supabase.rpc('fsfit_sincronizar_meu_acesso');
    if (error) throw error;
    if (isGooglePlayDistribution) {
      renderGooglePlayAccessCard(data);
      return;
    }
    renderRenewalCard(data);
  } catch (error) {
    console.error('Não foi possível carregar o status de renovação:', error);
  }
}

window.addEventListener('beforeunload', () => {
  if (pollTimer) clearInterval(pollTimer);
});

init();
