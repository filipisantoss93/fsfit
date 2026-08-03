import { supabase } from './supabase.js';

const PLAY_DISTRIBUTION_KEY = 'fsfit_distribution';
const PLAY_DISTRIBUTION_VALUE = 'google-play';
const isGooglePlayDistribution = localStorage.getItem(PLAY_DISTRIBUTION_KEY) === PLAY_DISTRIBUTION_VALUE
  || sessionStorage.getItem(PLAY_DISTRIBUTION_KEY) === PLAY_DISTRIBUTION_VALUE;

const DAY_MS = 24 * 60 * 60 * 1000;
let pollTimer = null;

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

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getErrorMessage(error, fallback) {
  if (error?.error_description) return String(error.error_description);
  if (typeof error?.message === 'string' && error.message) return error.message;
  return fallback;
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
  const isCard = access?.meio_pagamento === 'cartao';
  const isCanceledCard = type === 'pago' && isCard && !access?.renovacao_automatica;
  const isActiveCard = type === 'pago' && isCard && Boolean(access?.renovacao_automatica);

  let visible = false;
  let className = '';
  let label = '';
  let title = '';
  let detail = '';
  let buttonText = '';
  let action = null;

  if (isActiveCard) {
    visible = true;
    className = 'subscription-active';
    label = 'ASSINATURA ATIVA';
    title = `${money(access?.preco_contratado_centavos || 2990)} / mês no cartão`;
    const nextDate = access?.proxima_cobranca_em || access?.acesso_valido_ate;
    const cardInfo = access?.cartao_mascara ? ` · Cartão ${access.cartao_mascara}` : '';
    detail = `Renovação automática${cardInfo}. Próxima cobrança prevista para ${formatDate(nextDate)}. Você pode cancelar a qualquer momento.`;
    buttonText = 'Cancelar assinatura';
    action = () => openCancelSubscriptionModal(access);
  } else if (isCanceledCard) {
    visible = true;
    className = 'subscription-canceled';
    label = 'CANCELAMENTO AGENDADO';
    title = 'Renovação automática cancelada';
    detail = `Não haverá nova cobrança. Seu acesso ao FS Fit permanece ativo até ${formatDate(access?.acesso_valido_ate)}.`;
  } else if (type === 'pago' && remaining !== null && remaining <= 7) {
    visible = true;
    className = remaining <= 3 ? 'urgent' : '';
    label = remaining <= 3 ? 'VENCIMENTO PRÓXIMO' : 'ASSINATURA';
    title = remaining > 0
      ? `Seu plano vence em ${remaining} ${remaining === 1 ? 'dia' : 'dias'}`
      : 'Seu plano vence hoje';
    detail = `Acesso profissional válido até ${formatDate(access.acesso_valido_ate)}. Renove agora para manter o acesso sem interrupção.`;
    buttonText = 'Renovar plano';
    action = openPlanModal;
  } else if (type === 'trial' && remaining !== null && remaining <= 7) {
    visible = true;
    className = remaining <= 3 ? 'urgent trial' : 'trial';
    label = 'PERÍODO GRATUITO';
    title = remaining > 0
      ? `Seu trial termina em ${remaining} ${remaining === 1 ? 'dia' : 'dias'}`
      : 'Seu trial termina hoje';
    detail = `Teste gratuito válido até ${formatDate(access.acesso_valido_ate)}. Ative um plano para continuar usando todos os recursos.`;
    buttonText = 'Assinar plano';
    action = openPlanModal;
  } else if (type === 'free') {
    visible = true;
    className = 'expired';
    label = 'PLANO FREE';
    title = 'Ative seu acesso profissional';
    detail = 'Seu acesso premium não está ativo. Assine ou renove um plano para liberar alunos, agenda, exercícios e demais áreas de gestão.';
    buttonText = 'Ativar plano';
    action = openPlanModal;
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
    ${buttonText ? `<div class="plan-renewal-actions"><button id="plan-card-action" class="btn ${isActiveCard ? 'btn-outline' : 'btn-primary'}" type="button">${buttonText}</button></div>` : ''}`;

  header.insertAdjacentElement('afterend', card);
  if (action) card.querySelector('#plan-card-action')?.addEventListener('click', action);
}

function closeModal() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  document.querySelector('#plan-modal-backdrop')?.remove();
}

function createModal(title, description) {
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.id = 'plan-modal-backdrop';
  backdrop.className = 'plan-modal-backdrop';
  backdrop.innerHTML = `
    <section class="plan-modal" role="dialog" aria-modal="true" aria-labelledby="plan-modal-title">
      <div class="plan-modal-header">
        <div><h2 id="plan-modal-title">${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div>
        <button class="plan-modal-close" type="button" aria-label="Fechar">×</button>
      </div>
      <div id="plan-modal-content"><p>Carregando...</p></div>
    </section>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector('.plan-modal-close')?.addEventListener('click', closeModal);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(); });
  return backdrop.querySelector('#plan-modal-content');
}

async function openPlanModal() {
  if (isGooglePlayDistribution) return;
  const content = createModal('Escolha como pagar', 'Cartão para renovação automática ou PIX para pagamento antecipado do período.');

  try {
    const { data, error } = await supabase
      .from('planos_assinatura')
      .select('id,nome,valor_centavos,intervalo_meses,desconto_percentual,meio_pagamento')
      .eq('ativo', true)
      .order('intervalo_meses', { ascending: true });
    if (error) throw error;

    const plans = Array.isArray(data) ? data : [];
    const cardPlans = plans.filter(plan => plan.meio_pagamento === 'cartao');
    const pixPlans = plans.filter(plan => plan.meio_pagamento === 'pix');
    if (!cardPlans.length && !pixPlans.length) throw new Error('Nenhum plano disponível no momento.');

    content.innerHTML = '';

    if (cardPlans.length) {
      const section = document.createElement('section');
      section.className = 'payment-section';
      section.innerHTML = `
        <div class="payment-section-title"><h3>💳 Cartão de crédito</h3><small>Renovação automática</small></div>
        <div class="plan-options">${cardPlans.map(plan => `
          <button class="plan-option plan-option-featured" type="button" data-card-plan-id="${escapeHtml(plan.id)}">
            <span><strong>${escapeHtml(plan.nome)}</strong><span>Cobrança automática a cada ${plan.intervalo_meses} ${plan.intervalo_meses === 1 ? 'mês' : 'meses'} · cancele quando quiser</span></span>
            <span class="plan-option-price">${money(plan.valor_centavos)}/mês</span>
          </button>`).join('')}</div>`;
      content.appendChild(section);
      section.querySelectorAll('[data-card-plan-id]').forEach(button => {
        button.addEventListener('click', () => openCardCheckout(cardPlans.find(plan => plan.id === button.dataset.cardPlanId), content));
      });
    }

    if (pixPlans.length) {
      const section = document.createElement('section');
      section.className = 'payment-section';
      section.innerHTML = `
        <div class="payment-section-title"><h3>⚡ PIX</h3><small>Pagamento por período</small></div>
        <div class="plan-options">${pixPlans.map(plan => `
          <button class="plan-option" type="button" data-pix-plan-id="${escapeHtml(plan.id)}">
            <span><strong>${escapeHtml(plan.nome)}</strong><span>${plan.intervalo_meses} ${plan.intervalo_meses === 1 ? 'mês' : 'meses'}${Number(plan.desconto_percentual) > 0 ? ` · ${Number(plan.desconto_percentual)}% de desconto` : ''}</span></span>
            <span class="plan-option-price">${money(plan.valor_centavos)}</span>
          </button>`).join('')}</div>`;
      content.appendChild(section);
      section.querySelectorAll('[data-pix-plan-id]').forEach(button => {
        button.addEventListener('click', () => createPix(button.dataset.pixPlanId, content));
      });
    }
  } catch (error) {
    console.error('Erro ao carregar planos:', error);
    content.textContent = getErrorMessage(error, 'Não foi possível carregar os planos.');
  }
}

async function openCardCheckout(plan, content) {
  if (!plan) return;
  const { data: { session } } = await supabase.auth.getSession();
  const email = session?.user?.email || '';

  content.innerHTML = `
    <form id="card-subscription-form" class="card-checkout" novalidate>
      <div class="card-checkout-intro">
        <strong>${escapeHtml(plan.nome)} · ${money(plan.valor_centavos)}/mês</strong>
        <span>A cobrança será renovada automaticamente. Você poderá cancelar a qualquer momento e continuará com acesso até o fim do período já pago.</span>
      </div>

      <section class="card-form-section">
        <h3>Dados do cartão</h3>
        <div class="card-form-grid">
          <div class="card-field full"><label for="card-number">Número do cartão</label><input id="card-number" inputmode="numeric" autocomplete="cc-number" maxlength="23" required></div>
          <div class="card-field full"><label for="card-holder">Nome impresso no cartão</label><input id="card-holder" autocomplete="cc-name" required></div>
          <div class="card-field"><label for="card-expiration">Validade (MM/AAAA)</label><input id="card-expiration" inputmode="numeric" autocomplete="cc-exp" placeholder="08/2030" maxlength="7" required></div>
          <div class="card-field"><label for="card-cvv">CVV</label><input id="card-cvv" inputmode="numeric" autocomplete="cc-csc" maxlength="4" required></div>
          <div class="card-field"><label for="card-cpf">CPF do titular</label><input id="card-cpf" inputmode="numeric" autocomplete="off" maxlength="14" required></div>
          <div class="card-field"><label for="card-birth">Data de nascimento</label><input id="card-birth" type="date" required></div>
        </div>
      </section>

      <section class="card-form-section">
        <h3>Contato e endereço de cobrança</h3>
        <div class="card-form-grid">
          <div class="card-field full"><label for="card-email">E-mail</label><input id="card-email" type="email" autocomplete="email" value="${escapeHtml(email)}" required></div>
          <div class="card-field full"><label for="card-phone">Telefone com DDD</label><input id="card-phone" inputmode="tel" autocomplete="tel" required></div>
          <div class="card-field full"><label for="billing-street">Rua / Avenida</label><input id="billing-street" autocomplete="address-line1" required></div>
          <div class="card-field"><label for="billing-number">Número</label><input id="billing-number" required></div>
          <div class="card-field"><label for="billing-complement">Complemento</label><input id="billing-complement" autocomplete="address-line2"></div>
          <div class="card-field"><label for="billing-neighborhood">Bairro</label><input id="billing-neighborhood" required></div>
          <div class="card-field"><label for="billing-zipcode">CEP</label><input id="billing-zipcode" inputmode="numeric" autocomplete="postal-code" maxlength="9" required></div>
          <div class="card-field"><label for="billing-city">Cidade</label><input id="billing-city" autocomplete="address-level2" required></div>
          <div class="card-field"><label for="billing-state">UF</label><input id="billing-state" autocomplete="address-level1" maxlength="2" placeholder="SP" required></div>
        </div>
      </section>

      <p class="card-secure-note">🔒 Os dados completos do cartão são usados no navegador apenas para gerar um token seguro da Efí. O FS Fit não armazena o número do cartão nem o CVV.</p>
      <div id="card-form-error" class="card-error" hidden></div>
      <div class="card-submit-row">
        <button id="back-payment-methods" class="btn btn-secondary" type="button">Voltar</button>
        <button id="card-submit-button" class="btn btn-primary" type="submit">Assinar por ${money(plan.valor_centavos)}/mês</button>
      </div>
    </form>`;

  const form = content.querySelector('#card-subscription-form');
  content.querySelector('#back-payment-methods')?.addEventListener('click', openPlanModal);

  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = content.querySelector('#card-submit-button');
    const errorBox = content.querySelector('#card-form-error');
    if (errorBox) {
      errorBox.hidden = true;
      errorBox.textContent = '';
    }
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Processando cartão...';
    }

    try {
      if (!window.EfiPay?.CreditCard) throw new Error('Não foi possível carregar o módulo seguro de cartão da Efí. Recarregue a página e tente novamente.');

      const number = digits(content.querySelector('#card-number')?.value);
      const holderName = String(content.querySelector('#card-holder')?.value || '').trim();
      const holderDocument = digits(content.querySelector('#card-cpf')?.value);
      const cvv = digits(content.querySelector('#card-cvv')?.value);
      const expiration = String(content.querySelector('#card-expiration')?.value || '').trim().split('/');
      const expirationMonth = digits(expiration[0]);
      const expirationYear = digits(expiration[1]);

      if (number.length < 13) throw new Error('Número do cartão inválido.');
      if (!holderName) throw new Error('Informe o nome do titular do cartão.');
      if (holderDocument.length !== 11) throw new Error('Informe um CPF válido para o titular.');
      if (cvv.length < 3) throw new Error('CVV inválido.');
      if (expirationMonth.length !== 2 || expirationYear.length !== 4) throw new Error('Informe a validade no formato MM/AAAA.');

      const { data: config, error: configError } = await supabase.functions.invoke('config-assinatura-cartao-fsfit', { body: {} });
      if (config?.erro) throw new Error(config.erro);
      if (configError) throw configError;

      const isBlocked = await window.EfiPay.CreditCard.isScriptBlocked().catch(() => false);
      if (isBlocked) throw new Error('O módulo antifraude da Efí foi bloqueado pelo navegador. Desative o bloqueador de conteúdo para esta página e tente novamente.');

      const brand = await window.EfiPay.CreditCard.setCardNumber(number).verifyCardBrand();
      if (!brand || brand === 'undefined' || brand === 'unsupported') throw new Error('Bandeira do cartão não suportada ou número inválido.');

      const tokenResult = await window.EfiPay.CreditCard
        .setAccount(config.payee_code)
        .setEnvironment(config.environment)
        .setCreditCardData({
          brand,
          number,
          cvv,
          expirationMonth,
          expirationYear,
          holderName,
          holderDocument,
          reuse: true,
        })
        .getPaymentToken();

      if (!tokenResult?.payment_token) throw new Error('Não foi possível tokenizar o cartão.');

      const payload = {
        plano_id: plan.id,
        payment_token: tokenResult.payment_token,
        cartao_mascara: tokenResult.card_mask || null,
        customer: {
          name: holderName,
          cpf: holderDocument,
          email: String(content.querySelector('#card-email')?.value || '').trim(),
          birth: String(content.querySelector('#card-birth')?.value || '').trim(),
          phone_number: digits(content.querySelector('#card-phone')?.value),
        },
        billing_address: {
          street: String(content.querySelector('#billing-street')?.value || '').trim(),
          number: String(content.querySelector('#billing-number')?.value || '').trim(),
          neighborhood: String(content.querySelector('#billing-neighborhood')?.value || '').trim(),
          zipcode: digits(content.querySelector('#billing-zipcode')?.value),
          city: String(content.querySelector('#billing-city')?.value || '').trim(),
          complement: String(content.querySelector('#billing-complement')?.value || '').trim(),
          state: String(content.querySelector('#billing-state')?.value || '').trim().toUpperCase(),
        },
      };

      const { data, error } = await supabase.functions.invoke('criar-assinatura-cartao-fsfit', { body: payload });
      if (data?.erro) throw new Error(data.erro);
      if (error) throw error;
      if (!data?.sucesso) throw new Error('A assinatura não foi confirmada.');

      content.innerHTML = `
        <div class="card-success">
          <strong>✅ Assinatura criada com sucesso</strong>
          <span>O cartão foi enviado para processamento. Assim que a Efí confirmar a cobrança, seu acesso e a renovação automática serão atualizados.</span>
        </div>`;
      setTimeout(() => { refreshRenewalState(); }, 2200);
    } catch (error) {
      console.error('Erro ao assinar com cartão:', error);
      if (errorBox) {
        errorBox.hidden = false;
        errorBox.textContent = getErrorMessage(error, 'Não foi possível processar o cartão.');
      }
      if (submit) {
        submit.disabled = false;
        submit.textContent = `Assinar por ${money(plan.valor_centavos)}/mês`;
      }
    }
  });
}

function openCancelSubscriptionModal(access) {
  const content = createModal('Cancelar assinatura', 'Você pode interromper a renovação automática sem perder o período que já está pago.');
  content.innerHTML = `
    <div class="cancel-summary">
      <div class="cancel-summary-box">
        <strong>Seu acesso não será encerrado agora</strong>
        <span>Ao confirmar, novas cobranças serão canceladas. Você continuará usando o FS Fit normalmente até ${formatDate(access?.acesso_valido_ate)}.</span>
      </div>
      <div id="cancel-subscription-error" class="card-error" hidden></div>
      <div class="cancel-actions">
        <button id="keep-subscription-button" class="btn btn-secondary" type="button">Manter assinatura</button>
        <button id="confirm-cancel-subscription" class="btn btn-outline" type="button">Confirmar cancelamento</button>
      </div>
    </div>`;

  content.querySelector('#keep-subscription-button')?.addEventListener('click', closeModal);
  content.querySelector('#confirm-cancel-subscription')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const errorBox = content.querySelector('#cancel-subscription-error');
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

      content.innerHTML = `
        <div class="card-success">
          <strong>✅ Renovação automática cancelada</strong>
          <span>Não haverá nova cobrança. Seu acesso permanece ativo até ${formatDate(data?.acesso_valido_ate || access?.acesso_valido_ate)}.</span>
        </div>`;
      setTimeout(() => { refreshRenewalState(); }, 1800);
    } catch (error) {
      console.error('Erro ao cancelar assinatura:', error);
      if (errorBox) {
        errorBox.hidden = false;
        errorBox.textContent = getErrorMessage(error, 'Não foi possível cancelar a assinatura.');
      }
      button.disabled = false;
      button.textContent = 'Confirmar cancelamento';
    }
  });
}

async function createPix(planId, content) {
  if (isGooglePlayDistribution) return;
  content.innerHTML = '<p>Gerando sua cobrança PIX...</p>';
  try {
    const { data, error } = await supabase.functions.invoke('criar-pix-fsfit', {
      body: { plano_id: planId }
    });
    if (data?.erro) throw new Error(data.erro);
    if (error) throw error;

    const charge = data?.cobranca;
    if (!charge?.id) throw new Error('A cobrança foi criada sem identificador válido.');

    content.innerHTML = `
      <div class="pix-box">
        <h3>Escaneie o QR Code</h3>
        <p>Após o pagamento, o FS Fit confirmará automaticamente a renovação.</p>
        ${charge.qr_code_url ? `<img src="${escapeHtml(charge.qr_code_url)}" alt="QR Code PIX">` : ''}
        <textarea id="pix-copy-code" class="pix-code" readonly>${escapeHtml(charge.pix_copia_cola || '')}</textarea>
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
    content.innerHTML = `<div class="card-error">${escapeHtml(getErrorMessage(error, 'Não foi possível gerar a cobrança PIX.'))}</div><button id="retry-plan-button" class="btn btn-secondary plan-retry-action" type="button">Voltar aos planos</button>`;
    content.querySelector('#retry-plan-button')?.addEventListener('click', openPlanModal);
  }
}

async function verifyPix(chargeId, content) {
  const status = content.querySelector('#pix-payment-status');
  try {
    const { data, error } = await supabase.functions.invoke('verificar-pix-fsfit', {
      body: { id: chargeId }
    });
    if (data?.erro) throw new Error(data.erro);
    if (error) throw error;

    if (data?.cobranca?.status === 'paga' || data?.cobranca?.processada_em) {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
      if (status) status.textContent = '✅ Pagamento confirmado. Seu acesso foi renovado com sucesso.';
      setTimeout(() => { refreshRenewalState(); }, 1400);
    } else if (status) {
      status.textContent = 'Aguardando confirmação do pagamento...';
    }
  } catch (error) {
    console.error('Erro ao verificar PIX:', error);
    if (status) status.textContent = 'Não foi possível verificar agora. Tentaremos novamente automaticamente.';
  }
}


async function refreshRenewalState(source = 'plan-renewal') {
  closeModal();
  await init();
  window.dispatchEvent(new CustomEvent('fsfit:subscription-updated', { detail: { source } }));
}

async function init() {
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
