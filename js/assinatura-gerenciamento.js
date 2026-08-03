import { supabase } from './supabase.js';

let pollTimer = null;
let currentAccess = null;

const money = cents => (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const digits = value => String(value || '').replace(/\D/g, '');
const formatDate = value => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
};
const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');


function closeModal() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
  document.querySelector('#subscription-management-modal')?.remove();
}

function createModal(title, description) {
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.id = 'subscription-management-modal';
  backdrop.className = 'subscription-modal-backdrop';
  backdrop.innerHTML = `
    <section class="subscription-modal" role="dialog" aria-modal="true" aria-labelledby="subscription-management-modal-title">
      <div class="subscription-modal-header">
        <div><h2 id="subscription-management-modal-title">${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div>
        <button class="subscription-modal-close" type="button" aria-label="Fechar">×</button>
      </div>
      <div id="subscription-management-modal-content"></div>
    </section>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector('.subscription-modal-close')?.addEventListener('click', closeModal);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModal(); });
  return backdrop.querySelector('#subscription-management-modal-content');
}

async function loadPlans() {
  const { data, error } = await supabase
    .from('planos_assinatura')
    .select('id,nome,valor_centavos,intervalo_meses,desconto_percentual,meio_pagamento')
    .eq('ativo', true)
    .order('intervalo_meses', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function isActiveRecurringCard(access) {
  return access?.meio_pagamento === 'cartao' && Boolean(access?.renovacao_automatica) && Boolean(access?.assinatura_id);
}

async function cancelCardSubscription(access, { removeCard = false, content = null } = {}) {
  const target = content || createModal(
    removeCard ? 'Remover cartão da recorrência' : 'Cancelar assinatura',
    removeCard
      ? 'A recorrência será cancelada e a referência mascarada do cartão será removida do FS Fit. O período já pago continua válido.'
      : 'A renovação automática será interrompida, mas seu acesso continua até o fim do período já pago.'
  );

  target.innerHTML = `
    <div class="subscription-management-note">
      <strong>${removeCard ? 'O cartão deixará de aparecer na sua assinatura.' : 'Seu acesso não será encerrado imediatamente.'}</strong><br>
      Acesso atual válido até ${formatDate(access?.acesso_valido_ate)}.
    </div>
    <div id="subscription-cancel-error" class="subscription-error subscription-error-spaced" hidden></div>
    <div class="subscription-modal-actions subscription-modal-actions-spaced">
      <button class="btn btn-neutral" type="button" data-close-subscription-modal>Voltar</button>
      <button id="subscription-confirm-cancel" class="btn btn-danger" type="button">${removeCard ? 'Remover cartão e cancelar recorrência' : 'Confirmar cancelamento'}</button>
    </div>`;

  target.querySelector('[data-close-subscription-modal]')?.addEventListener('click', closeModal);
  target.querySelector('#subscription-confirm-cancel')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const errorBox = target.querySelector('#subscription-cancel-error');
    button.disabled = true;
    button.textContent = removeCard ? 'Removendo...' : 'Cancelando...';
    if (errorBox) errorBox.hidden = true;
    try {
      const { data, error } = await supabase.functions.invoke('cancelar-assinatura-cartao-fsfit', {
        body: { assinatura_id: access.assinatura_id, remover_cartao: removeCard }
      });
      if (data?.erro) throw new Error(data.erro);
      if (error) throw error;
      target.innerHTML = `<div class="subscription-success"><strong>✅ ${removeCard ? 'Cartão removido da recorrência' : 'Renovação automática cancelada'}</strong><span>Seu acesso permanece válido até ${formatDate(data?.acesso_valido_ate || access?.acesso_valido_ate)}.</span></div>`;
      setTimeout(() => { refreshSubscriptionManagement(); }, 1600);
    } catch (error) {
      if (errorBox) {
        errorBox.hidden = false;
        errorBox.textContent = error?.message || 'Não foi possível concluir a operação.';
      }
      button.disabled = false;
      button.textContent = removeCard ? 'Remover cartão e cancelar recorrência' : 'Confirmar cancelamento';
    }
  });
}

async function tokenizeCard(formRoot) {
  if (!window.EfiPay?.CreditCard) throw new Error('Não foi possível carregar o módulo seguro de cartão da Efí. Recarregue a página e tente novamente.');
  const number = digits(formRoot.querySelector('#manage-card-number')?.value);
  const holderName = String(formRoot.querySelector('#manage-card-holder')?.value || '').trim();
  const holderDocument = digits(formRoot.querySelector('#manage-card-cpf')?.value);
  const cvv = digits(formRoot.querySelector('#manage-card-cvv')?.value);
  const expiration = String(formRoot.querySelector('#manage-card-expiration')?.value || '').trim().split('/');
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
  if (isBlocked) throw new Error('O módulo antifraude da Efí foi bloqueado pelo navegador. Desative o bloqueador de conteúdo e tente novamente.');
  const brand = await window.EfiPay.CreditCard.setCardNumber(number).verifyCardBrand();
  if (!brand || brand === 'undefined' || brand === 'unsupported') throw new Error('Bandeira do cartão não suportada ou número inválido.');
  const tokenResult = await window.EfiPay.CreditCard
    .setAccount(config.payee_code)
    .setEnvironment(config.environment)
    .setCreditCardData({ brand, number, cvv, expirationMonth, expirationYear, holderName, holderDocument, reuse: true })
    .getPaymentToken();
  if (!tokenResult?.payment_token) throw new Error('Não foi possível tokenizar o cartão.');
  return { tokenResult, holderName, holderDocument };
}

async function openCardForm({ access = null, plan = null, mode = 'subscribe' } = {}) {
  const isReplace = mode === 'replace';
  const title = isReplace ? 'Trocar cartão' : 'Assinar com cartão';
  const description = isReplace
    ? 'O novo cartão substituirá o cartão usado nas próximas cobranças automáticas.'
    : 'Cadastre o cartão para ativar a renovação automática do FS Fit.';
  const content = createModal(title, description);
  const { data: { session } } = await supabase.auth.getSession();
  const email = session?.user?.email || '';

  content.innerHTML = `
    <form id="subscription-card-management-form" class="subscription-card-form" novalidate>
      <div class="subscription-management-note">${isReplace ? `Cartão atual: ${escapeHtml(access?.cartao_mascara || 'não informado')}. O número completo e o CVV não são armazenados pelo FS Fit.` : `${escapeHtml(plan?.nome || 'FS Fit recorrente')} · ${money(plan?.valor_centavos || 2990)}/mês.`}</div>
      <div class="subscription-card-grid">
        <div class="subscription-card-field full"><label for="manage-card-number">Número do cartão</label><input id="manage-card-number" inputmode="numeric" autocomplete="cc-number" maxlength="23" required></div>
        <div class="subscription-card-field full"><label for="manage-card-holder">Nome impresso no cartão</label><input id="manage-card-holder" autocomplete="cc-name" required></div>
        <div class="subscription-card-field"><label for="manage-card-expiration">Validade (MM/AAAA)</label><input id="manage-card-expiration" inputmode="numeric" autocomplete="cc-exp" placeholder="08/2030" maxlength="7" required></div>
        <div class="subscription-card-field"><label for="manage-card-cvv">CVV</label><input id="manage-card-cvv" inputmode="numeric" autocomplete="cc-csc" maxlength="4" required></div>
        <div class="subscription-card-field"><label for="manage-card-cpf">CPF do titular</label><input id="manage-card-cpf" inputmode="numeric" maxlength="14" required></div>
        ${isReplace ? '' : '<div class="subscription-card-field"><label for="manage-card-birth">Data de nascimento</label><input id="manage-card-birth" type="date" required></div>'}
      </div>
      ${isReplace ? '' : `
      <div class="subscription-card-grid">
        <div class="subscription-card-field full"><label for="manage-card-email">E-mail</label><input id="manage-card-email" type="email" value="${escapeHtml(email)}" required></div>
        <div class="subscription-card-field full"><label for="manage-card-phone">Telefone com DDD</label><input id="manage-card-phone" inputmode="tel" required></div>
        <div class="subscription-card-field full"><label for="manage-billing-street">Rua / Avenida</label><input id="manage-billing-street" required></div>
        <div class="subscription-card-field"><label for="manage-billing-number">Número</label><input id="manage-billing-number" required></div>
        <div class="subscription-card-field"><label for="manage-billing-complement">Complemento</label><input id="manage-billing-complement"></div>
        <div class="subscription-card-field"><label for="manage-billing-neighborhood">Bairro</label><input id="manage-billing-neighborhood" required></div>
        <div class="subscription-card-field"><label for="manage-billing-zipcode">CEP</label><input id="manage-billing-zipcode" inputmode="numeric" maxlength="9" required></div>
        <div class="subscription-card-field"><label for="manage-billing-city">Cidade</label><input id="manage-billing-city" required></div>
        <div class="subscription-card-field"><label for="manage-billing-state">UF</label><input id="manage-billing-state" maxlength="2" placeholder="SP" required></div>
      </div>`}
      <div id="subscription-card-management-error" class="subscription-error" hidden></div>
      <div class="subscription-modal-actions"><button class="btn btn-neutral" type="button" data-close-subscription-modal>Voltar</button><button id="subscription-card-management-submit" class="btn btn-primary" type="submit">${isReplace ? 'Atualizar cartão' : `Assinar por ${money(plan?.valor_centavos || 2990)}/mês`}</button></div>
    </form>`;

  content.querySelector('[data-close-subscription-modal]')?.addEventListener('click', closeModal);
  content.querySelector('#subscription-card-management-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = content.querySelector('#subscription-card-management-submit');
    const errorBox = content.querySelector('#subscription-card-management-error');
    button.disabled = true;
    button.textContent = isReplace ? 'Atualizando...' : 'Processando...';
    if (errorBox) errorBox.hidden = true;
    try {
      const { tokenResult, holderName, holderDocument } = await tokenizeCard(content);
      if (isReplace) {
        const { data, error } = await supabase.functions.invoke('atualizar-assinatura-cartao-fsfit', {
          body: { assinatura_id: access.assinatura_id, payment_token: tokenResult.payment_token, cartao_mascara: tokenResult.card_mask || null }
        });
        if (data?.erro) throw new Error(data.erro);
        if (error) throw error;
        content.innerHTML = '<div class="subscription-success"><strong>✅ Cartão atualizado</strong><span>As próximas cobranças automáticas usarão o novo cartão.</span></div>';
      } else {
        const payload = {
          plano_id: plan.id,
          payment_token: tokenResult.payment_token,
          cartao_mascara: tokenResult.card_mask || null,
          customer: {
            name: holderName,
            cpf: holderDocument,
            email: String(content.querySelector('#manage-card-email')?.value || '').trim(),
            birth: String(content.querySelector('#manage-card-birth')?.value || '').trim(),
            phone_number: digits(content.querySelector('#manage-card-phone')?.value),
          },
          billing_address: {
            street: String(content.querySelector('#manage-billing-street')?.value || '').trim(),
            number: String(content.querySelector('#manage-billing-number')?.value || '').trim(),
            neighborhood: String(content.querySelector('#manage-billing-neighborhood')?.value || '').trim(),
            zipcode: digits(content.querySelector('#manage-billing-zipcode')?.value),
            city: String(content.querySelector('#manage-billing-city')?.value || '').trim(),
            complement: String(content.querySelector('#manage-billing-complement')?.value || '').trim(),
            state: String(content.querySelector('#manage-billing-state')?.value || '').trim().toUpperCase(),
          }
        };
        const { data, error } = await supabase.functions.invoke('criar-assinatura-cartao-fsfit', { body: payload });
        if (data?.erro) throw new Error(data.erro);
        if (error) throw error;
        content.innerHTML = '<div class="subscription-success"><strong>✅ Assinatura criada</strong><span>O cartão foi enviado para processamento. O acesso será atualizado após a confirmação da cobrança.</span></div>';
      }
      setTimeout(() => { refreshSubscriptionManagement(); }, 1800);
    } catch (error) {
      if (errorBox) {
        errorBox.hidden = false;
        errorBox.textContent = error?.message || 'Não foi possível processar o cartão.';
      }
      button.disabled = false;
      button.textContent = isReplace ? 'Atualizar cartão' : `Assinar por ${money(plan?.valor_centavos || 2990)}/mês`;
    }
  });
}

async function updateCardPlan(access, plan, content) {
  content.innerHTML = '<p>Atualizando seu plano recorrente...</p>';
  try {
    const { data, error } = await supabase.functions.invoke('atualizar-assinatura-cartao-fsfit', {
      body: { assinatura_id: access.assinatura_id, plano_id: plan.id }
    });
    if (data?.erro) throw new Error(data.erro);
    if (error) throw error;
    content.innerHTML = `<div class="subscription-success"><strong>✅ Plano atualizado</strong><span>Sua recorrência foi alterada para ${escapeHtml(plan.nome)}. As próximas cobranças seguirão o novo plano.</span></div>`;
    setTimeout(() => { refreshSubscriptionManagement(); }, 1700);
  } catch (error) {
    content.innerHTML = `<div class="subscription-error">${escapeHtml(error?.message || 'Não foi possível alterar o plano.')}</div>`;
  }
}

async function createPix(plan, content, { cancelRecurringAfterPaid = false } = {}) {
  content.innerHTML = '<p>Gerando sua cobrança PIX...</p>';
  try {
    const { data, error } = await supabase.functions.invoke('criar-pix-fsfit', { body: { plano_id: plan.id } });
    if (data?.erro) throw new Error(data.erro);
    if (error) throw error;
    const charge = data?.cobranca;
    if (!charge?.id) throw new Error('A cobrança foi criada sem identificador válido.');
    content.innerHTML = `
      <div class="subscription-pix">
        <h3>PIX gerado</h3>
        <p>${cancelRecurringAfterPaid ? 'Após a confirmação do PIX, a renovação automática do cartão será cancelada.' : 'Após o pagamento, seu acesso será atualizado automaticamente.'}</p>
        ${charge.qr_code_url ? `<img src="${escapeHtml(charge.qr_code_url)}" alt="QR Code PIX">` : ''}
        <textarea id="subscription-pix-code" readonly>${escapeHtml(charge.pix_copia_cola || '')}</textarea>
        <div class="subscription-modal-actions subscription-modal-actions-centered"><button id="subscription-copy-pix" class="btn btn-primary" type="button">Copiar código PIX</button><button id="subscription-check-pix" class="btn btn-outline" type="button">Já paguei, verificar</button></div>
        <div id="subscription-pix-status" class="subscription-pix-status">Aguardando confirmação do pagamento...</div>
      </div>`;
    content.querySelector('#subscription-copy-pix')?.addEventListener('click', async event => {
      try { await navigator.clipboard.writeText(charge.pix_copia_cola || ''); event.currentTarget.textContent = 'Código copiado!'; }
      catch { event.currentTarget.textContent = 'Copie o código acima'; }
    });
    const verify = async () => {
      const status = content.querySelector('#subscription-pix-status');
      try {
        const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verificar-pix-fsfit', { body: { id: charge.id } });
        if (verifyData?.erro) throw new Error(verifyData.erro);
        if (verifyError) throw verifyError;
        if (verifyData?.cobranca?.status === 'paga' || verifyData?.cobranca?.processada_em) {
          if (pollTimer) clearInterval(pollTimer);
          pollTimer = null;
          if (cancelRecurringAfterPaid && currentAccess?.assinatura_id) {
            if (status) status.textContent = 'PIX confirmado. Cancelando renovação automática do cartão...';
            const { data: cancelData, error: cancelError } = await supabase.functions.invoke('cancelar-assinatura-cartao-fsfit', { body: { assinatura_id: currentAccess.assinatura_id } });
            if (cancelData?.erro || cancelError) {
              if (status) status.textContent = '⚠️ PIX confirmado, mas não foi possível cancelar a recorrência do cartão automaticamente. Use o botão Cancelar assinatura nesta página.';
              return;
            }
          }
          if (status) status.textContent = '✅ Pagamento confirmado. Seu plano foi atualizado com sucesso.';
          setTimeout(() => { refreshSubscriptionManagement(); }, 1500);
        } else if (status) status.textContent = 'Aguardando confirmação do pagamento...';
      } catch {
        if (status) status.textContent = 'Não foi possível verificar agora. Tentaremos novamente automaticamente.';
      }
    };
    content.querySelector('#subscription-check-pix')?.addEventListener('click', verify);
    pollTimer = setInterval(verify, 5000);
  } catch (error) {
    content.innerHTML = `<div class="subscription-error">${escapeHtml(error?.message || 'Não foi possível gerar a cobrança PIX.')}</div>`;
  }
}

async function openPlanChooser(access, { only = null } = {}) {
  const activeCard = isActiveRecurringCard(access);
  const content = createModal(
    only === 'pix' ? 'Pagar ou renovar com PIX' : only === 'card' ? 'Assinar com cartão' : 'Alterar plano ou forma de pagamento',
    activeCard && only !== 'card'
      ? 'Você pode manter a recorrência no cartão, alterar o plano recorrente ou migrar para PIX. Na migração para PIX, a recorrência do cartão só será cancelada depois da confirmação do pagamento.'
      : 'Escolha a opção de pagamento e o período desejado.'
  );
  try {
    const plans = await loadPlans();
    const cardPlans = plans.filter(plan => plan.meio_pagamento === 'cartao');
    const pixPlans = plans.filter(plan => plan.meio_pagamento === 'pix');
    content.innerHTML = '';

    if (only !== 'pix' && cardPlans.length) {
      content.insertAdjacentHTML('beforeend', '<div class="subscription-method-title"><h3>💳 Cartão de crédito</h3><small>Renovação automática</small></div><div id="subscription-card-plan-list" class="subscription-option-list"></div>');
      const list = content.querySelector('#subscription-card-plan-list');
      cardPlans.forEach(plan => {
        const button = document.createElement('button');
        button.className = 'subscription-option';
        button.type = 'button';
        button.innerHTML = `<span><strong>${escapeHtml(plan.nome)}</strong><span>Cobrança automática a cada ${plan.intervalo_meses} ${plan.intervalo_meses === 1 ? 'mês' : 'meses'}</span></span><span class="subscription-option-price">${money(plan.valor_centavos)}</span>`;
        button.addEventListener('click', () => activeCard ? updateCardPlan(access, plan, content) : openCardForm({ access, plan, mode: 'subscribe' }));
        list.appendChild(button);
      });
    }

    if (only !== 'card' && pixPlans.length) {
      content.insertAdjacentHTML('beforeend', '<div class="subscription-method-title"><h3>⚡ PIX</h3><small>Pagamento antecipado</small></div><div id="subscription-pix-plan-list" class="subscription-option-list"></div>');
      const list = content.querySelector('#subscription-pix-plan-list');
      pixPlans.forEach(plan => {
        const button = document.createElement('button');
        button.className = 'subscription-option';
        button.type = 'button';
        button.innerHTML = `<span><strong>${escapeHtml(plan.nome)}</strong><span>${plan.intervalo_meses} ${plan.intervalo_meses === 1 ? 'mês' : 'meses'}${Number(plan.desconto_percentual) > 0 ? ` · ${Number(plan.desconto_percentual)}% de desconto` : ''}</span></span><span class="subscription-option-price">${money(plan.valor_centavos)}</span>`;
        button.addEventListener('click', () => createPix(plan, content, { cancelRecurringAfterPaid: activeCard }));
        list.appendChild(button);
      });
    }
  } catch (error) {
    content.innerHTML = `<div class="subscription-error">${escapeHtml(error?.message || 'Não foi possível carregar os planos.')}</div>`;
  }
}

function renderManagement(access) {
  const host = document.querySelector('#subscription-management-actions');
  if (!host) return;
  if (access?.admin) {
    host.innerHTML = '<div class="subscription-management-note subscription-management-note-full"><strong>Conta administrativa</strong><br>Seu acesso administrativo não depende de uma assinatura paga. A central permanece disponível para consulta do histórico.</div>';
    return;
  }

  const activeCard = isActiveRecurringCard(access);
  const canceledCard = access?.meio_pagamento === 'cartao' && !access?.renovacao_automatica && access?.assinatura_id;
  const actions = [];

  if (activeCard) {
    actions.push(['Alterar plano', 'Mude o plano recorrente ou migre para um período pago por PIX.', 'Alterar', () => openPlanChooser(access)]);
    actions.push(['Alterar forma de pagamento', 'Troque entre recorrência no cartão e pagamento antecipado via PIX.', 'Alterar', () => openPlanChooser(access)]);
    actions.push(['Trocar cartão', `Substitua ${access?.cartao_mascara ? `o cartão ${access.cartao_mascara}` : 'o cartão atual'} usado nas próximas cobranças.`, 'Trocar cartão', () => openCardForm({ access, mode: 'replace' })]);
    actions.push(['Pagar ou renovar com PIX', 'Gere um PIX. Se estiver migrando do cartão, a recorrência será cancelada somente após o pagamento.', 'Pagar com PIX', () => openPlanChooser(access, { only: 'pix' })]);
    actions.push(['Cancelar assinatura', 'Interrompa as próximas cobranças sem perder o período que já foi pago.', 'Cancelar', () => cancelCardSubscription(access)]);
    actions.push(['Remover cartão da recorrência', 'Cancela a renovação e remove a referência mascarada do cartão do FS Fit.', 'Remover cartão', () => cancelCardSubscription(access, { removeCard: true })]);
  } else {
    actions.push(['Assinar com cartão', canceledCard ? 'Reative a renovação automática cadastrando um cartão para uma nova recorrência.' : 'Cadastre um cartão e ative a renovação automática mensal.', canceledCard ? 'Reativar com cartão' : 'Assinar com cartão', () => openPlanChooser(access, { only: 'card' })]);
    actions.push(['Pagar ou renovar com PIX', 'Escolha o período e pague via PIX sem renovação automática.', 'Pagar com PIX', () => openPlanChooser(access, { only: 'pix' })]);
    actions.push(['Alterar plano', 'Escolha entre cartão recorrente e os períodos disponíveis via PIX.', 'Ver planos', () => openPlanChooser(access)]);
    if (canceledCard && access?.cartao_mascara) {
      actions.push(['Excluir referência do cartão', `Remova ${access.cartao_mascara} da visualização do FS Fit. A recorrência já está cancelada.`, 'Excluir cartão', () => cancelCardSubscription(access, { removeCard: true })]);
    }
  }

  host.innerHTML = '';
  actions.forEach(([title, description, buttonText, handler]) => {
    const article = document.createElement('article');
    const destructive = /cancel|remov|exclu/i.test(`${title} ${buttonText}`);
    const buttonClass = destructive ? 'btn btn-danger' : 'btn btn-outline';
    article.className = 'subscription-management-action';
    article.innerHTML = `<div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div><button class="${buttonClass}" type="button">${escapeHtml(buttonText)}</button>`;
    article.querySelector('button')?.addEventListener('click', handler);
    host.appendChild(article);
  });
}


async function refreshSubscriptionManagement(source = 'subscription-management') {
  closeModal();
  await init();
  window.dispatchEvent(new CustomEvent('fsfit:subscription-updated', {
    detail: { source, access: currentAccess }
  }));
}

async function init() {
  const host = document.querySelector('#subscription-management-actions');
  if (!host) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data, error } = await supabase.rpc('fsfit_sincronizar_meu_acesso');
    if (error) throw error;
    currentAccess = data;
    renderManagement(data);
  } catch (error) {
    host.innerHTML = `<div class="subscription-management-note subscription-management-note-full">Não foi possível carregar as opções de gerenciamento agora: ${escapeHtml(error?.message || 'erro desconhecido')}.</div>`;
  }
}

window.addEventListener('beforeunload', () => { if (pollTimer) clearInterval(pollTimer); });
init();
