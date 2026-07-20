import { supabase } from './supabase.js';
import { renderHeader, ensurePersonalProfile, getAccessStatus, setGreeting } from './layout.js';

function formatDate(value, includeTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return includeTime
    ? date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : date.toLocaleDateString('pt-BR');
}

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function paymentLabel(value) {
  if (value === 'cartao') return 'Cartão de crédito';
  if (value === 'pix') return 'PIX';
  return 'Não definido';
}

function subscriptionStatus(access) {
  if (access?.admin) return 'Acesso administrativo';
  if (access?.assinatura_status === 'cancelada' && access?.acesso_premium) return 'Cancelada · acesso vigente';
  if (access?.assinatura_status === 'inadimplente') return 'Pagamento pendente';
  if (access?.assinatura_status === 'pendente') return 'Em processamento';
  if (access?.tipo_acesso === 'pago') return 'Ativa';
  if (access?.tipo_acesso === 'trial') return 'Período gratuito';
  if (access?.tipo_acesso === 'free') return 'Plano Free';
  return access?.assinatura_status || 'Sem assinatura ativa';
}

function statusClass(access) {
  if (access?.assinatura_status === 'inadimplente' || access?.assinatura_status === 'cancelada') return 'failed';
  if (access?.assinatura_status === 'pendente' || access?.tipo_acesso === 'trial') return 'pending';
  if (access?.tipo_acesso === 'pago' || access?.acesso_premium) return 'paid';
  return '';
}

function planLabel(access) {
  if (access?.tipo_acesso === 'trial') return 'FS Fit · 7 dias grátis';
  if (access?.tipo_acesso === 'free') return 'FS Fit Free';
  if (access?.tipo_acesso === 'pago') return 'FS Fit';
  return 'FS Fit';
}

function priceLabel(access) {
  if (!access?.preco_contratado_centavos) return '';
  const suffix = access?.meio_pagamento === 'cartao' ? '/mês' : '';
  return `${money(access.preco_contratado_centavos)}${suffix}`;
}

function validityLabel(access) {
  if (access?.acesso_valido_ate) return formatDate(access.acesso_valido_ate);
  if (access?.tipo_acesso === 'free') return 'Sem vencimento';
  return 'Sem período ativo';
}

function renewalLabel(access) {
  if (access?.meio_pagamento === 'cartao') {
    if (access?.renovacao_automatica) return 'Automática';
    if (access?.acesso_premium) return 'Cancelada';
    return 'Desativada';
  }
  if (access?.meio_pagamento === 'pix') return 'Manual via PIX';
  return '—';
}

function nextChargeLabel(access) {
  if (access?.meio_pagamento !== 'cartao' || !access?.renovacao_automatica) return null;
  const nextDate = access?.proxima_cobranca_em || access?.acesso_valido_ate;
  return nextDate ? formatDate(nextDate) : 'A definir';
}

function setAdminLayout() {
  const title = document.querySelector('#subscription-page-title');
  const description = document.querySelector('#subscription-page-description');
  const overviewTitle = document.querySelector('#subscription-overview-title');
  const management = document.querySelector('#subscription-management-section');
  const history = document.querySelector('#subscription-history-section');
  const help = document.querySelector('#subscription-help-section');

  if (title) title.textContent = 'Minha conta';
  if (description) description.textContent = 'Consulte as informações do seu acesso ao FS Fit.';
  if (overviewTitle) overviewTitle.textContent = 'Acesso administrativo';
  if (management) management.hidden = true;
  if (history) history.hidden = true;
  if (help) help.hidden = true;
}

function renderSummary(access) {
  const host = document.querySelector('#subscription-summary-grid');
  if (!host) return;

  if (access?.admin) {
    setAdminLayout();
    host.innerHTML = `
      <div class="subscription-admin-card">
        <div class="subscription-admin-icon" aria-hidden="true">✓</div>
        <div>
          <h2>Conta administrativa</h2>
          <p>Acesso permanente ao FS Fit, sem cobrança e sem vencimento.</p>
        </div>
      </div>`;
    return;
  }

  const status = subscriptionStatus(access);
  const statusTone = statusClass(access);
  const price = priceLabel(access);
  const nextCharge = nextChargeLabel(access);
  const cardInfo = access?.meio_pagamento === 'cartao' && access?.cartao_mascara
    ? ` · ${access.cartao_mascara}`
    : '';

  host.innerHTML = `
    <div class="subscription-overview-card">
      <div class="subscription-overview-top">
        <div>
          <span class="subscription-plan-kicker">Plano</span>
          <h3 class="subscription-plan-title">${planLabel(access)}</h3>
          ${price ? `<div class="subscription-plan-price">${price}</div>` : ''}
        </div>
        <span class="subscription-status-badge ${statusTone}">${status}</span>
      </div>
      <div class="subscription-overview-rows">
        <div class="subscription-overview-row"><span>Pagamento</span><strong>${paymentLabel(access?.meio_pagamento)}${cardInfo}</strong></div>
        <div class="subscription-overview-row"><span>Validade do acesso</span><strong>${validityLabel(access)}</strong></div>
        <div class="subscription-overview-row"><span>Renovação</span><strong>${renewalLabel(access)}</strong></div>
        ${nextCharge ? `<div class="subscription-overview-row"><span>Próxima cobrança</span><strong>${nextCharge}</strong></div>` : ''}
      </div>
    </div>`;
}

function normalizeStatus(status) {
  const value = String(status || '').toLowerCase();
  if (['paid', 'paga', 'pago', 'approved', 'settled'].includes(value)) {
    return { label: 'Pago', className: 'paid' };
  }
  if (['pending', 'pendente', 'waiting', 'new', 'active'].includes(value)) {
    return { label: 'Pendente', className: 'pending' };
  }
  if (['unpaid', 'failed', 'recusada', 'recusado', 'canceled', 'cancelada', 'expired'].includes(value)) {
    return { label: value.includes('cancel') ? 'Cancelada' : 'Não pago', className: 'failed' };
  }
  return { label: status || '—', className: '' };
}

function renderHistory(items) {
  const host = document.querySelector('#subscription-history-list');
  if (!host) return;

  if (!items.length) {
    host.innerHTML = '<div class="subscription-empty"><strong>Nenhuma cobrança registrada ainda.</strong>Seu histórico aparecerá aqui após o primeiro pagamento.</div>';
    return;
  }

  host.innerHTML = items.map(item => {
    const status = normalizeStatus(item.status);
    const date = item.pago_em || item.created_at;
    const method = item.method === 'cartao' ? 'Cartão de crédito' : 'PIX';
    return `
      <article class="subscription-history-item">
        <div class="subscription-history-main"><strong>${method}</strong><span>${formatDate(date, true)}</span></div>
        <div class="subscription-history-date">${formatDate(date)}</div>
        <div class="subscription-history-value">${money(item.valor_centavos)}</div>
        <span class="subscription-status-badge ${status.className}">${status.label}</span>
      </article>`;
  }).join('');
}

async function loadHistory(userId) {
  const host = document.querySelector('#subscription-history-list');

  try {
    const [cardResult, pixResult] = await Promise.all([
      supabase
        .from('cobrancas_cartao')
        .select('id,status,valor_centavos,pago_em,created_at')
        .eq('personal_id', userId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('cobrancas_pix')
        .select('id,status,valor_centavos,pago_em,created_at')
        .eq('personal_id', userId)
        .order('created_at', { ascending: false })
        .limit(20)
    ]);

    if (cardResult.error) throw cardResult.error;
    if (pixResult.error) throw pixResult.error;

    const card = (cardResult.data || []).map(item => ({ ...item, method: 'cartao' }));
    const pix = (pixResult.data || []).map(item => ({ ...item, method: 'pix' }));
    const items = [...card, ...pix]
      .sort((a, b) => new Date(b.pago_em || b.created_at).getTime() - new Date(a.pago_em || a.created_at).getTime())
      .slice(0, 30);

    renderHistory(items);
  } catch (error) {
    console.error('Não foi possível carregar o histórico de cobranças:', error);
    if (host) host.innerHTML = '<div class="subscription-empty">Não foi possível carregar o histórico agora.</div>';
  }
}

function addSubscriptionMenuItem() {
  const profileLink = document.querySelector('[data-page="perfil"]');
  const profileItem = profileLink?.closest('li');
  if (!profileItem || document.querySelector('[data-page="assinatura"]')) return;

  const item = document.createElement('li');
  item.innerHTML = '<a data-page="assinatura" class="active" href="assinatura.html">Minha assinatura</a>';
  profileItem.insertAdjacentElement('beforebegin', item);
}

async function init() {
  renderHeader('');
  addSubscriptionMenuItem();

  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    window.location.replace('index.html?login=1');
    return;
  }

  try {
    await ensurePersonalProfile(session);
    const access = await getAccessStatus();

    if (access?.tipo_acesso === 'inativo' && !access?.admin) {
      window.location.replace('painel.html');
      return;
    }

    session.fsfitAccess = access;
    await setGreeting(session);
    renderSummary(access);
    if (!access?.admin) await loadHistory(session.user.id);
  } catch (loadError) {
    console.error('Não foi possível carregar a página de assinatura:', loadError);
    const host = document.querySelector('#subscription-summary-grid');
    if (host) host.innerHTML = '<div class="subscription-overview-card"><strong>Não foi possível carregar os dados da assinatura. Atualize a página e tente novamente.</strong></div>';
  }
}

init();
