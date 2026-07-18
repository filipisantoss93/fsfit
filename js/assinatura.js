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

function planLabel(access) {
  if (access?.admin) return 'Administrador';
  if (access?.tipo_acesso === 'trial') return 'Trial de 7 dias';
  if (access?.tipo_acesso === 'free') return 'Free';
  if (access?.preco_contratado_centavos) return `Premium · ${money(access.preco_contratado_centavos)}`;
  if (access?.tipo_acesso === 'pago') return 'Premium';
  return '—';
}

function validityLabel(access) {
  if (access?.admin) return 'Sem vencimento';
  if (access?.acesso_valido_ate) return `Até ${formatDate(access.acesso_valido_ate)}`;
  return 'Sem período ativo';
}

function renewalLabel(access) {
  if (access?.meio_pagamento !== 'cartao') return paymentLabel(access?.meio_pagamento);
  if (access?.renovacao_automatica) {
    const nextDate = access?.proxima_cobranca_em || access?.acesso_valido_ate;
    return `Cartão · próxima cobrança ${formatDate(nextDate)}`;
  }
  if (access?.acesso_premium) return 'Cartão · renovação cancelada';
  return 'Cartão · sem renovação';
}

function renderSummary(access) {
  const grid = document.querySelector('#subscription-summary-grid');
  if (!grid) return;

  grid.innerHTML = `
    <div class="subscription-summary-item">
      <small>Status</small>
      <strong>${subscriptionStatus(access)}</strong>
    </div>
    <div class="subscription-summary-item">
      <small>Plano</small>
      <strong>${planLabel(access)}</strong>
    </div>
    <div class="subscription-summary-item">
      <small>Pagamento</small>
      <strong>${renewalLabel(access)}</strong>
    </div>
    <div class="subscription-summary-item">
      <small>Validade</small>
      <strong>${validityLabel(access)}</strong>
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
  const body = document.querySelector('#subscription-history-body');
  if (!body) return;

  if (!items.length) {
    body.innerHTML = '<tr><td colspan="4" class="subscription-empty">Nenhuma cobrança registrada ainda.</td></tr>';
    return;
  }

  body.innerHTML = items.map(item => {
    const status = normalizeStatus(item.status);
    const date = item.pago_em || item.created_at;
    return `
      <tr>
        <td><strong>${item.method === 'cartao' ? '💳 Cartão de crédito' : '⚡ PIX'}</strong></td>
        <td>${formatDate(date, true)}</td>
        <td>${money(item.valor_centavos)}</td>
        <td><span class="subscription-status-badge ${status.className}">${status.label}</span></td>
      </tr>`;
  }).join('');
}

async function loadHistory(userId) {
  const body = document.querySelector('#subscription-history-body');

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
    if (body) body.innerHTML = '<tr><td colspan="4" class="subscription-empty">Não foi possível carregar o histórico agora.</td></tr>';
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
    await loadHistory(session.user.id);
  } catch (loadError) {
    console.error('Não foi possível carregar a página de assinatura:', loadError);
    const grid = document.querySelector('#subscription-summary-grid');
    if (grid) grid.innerHTML = '<div class="subscription-summary-item" style="grid-column:1/-1"><small>Erro</small><strong>Não foi possível carregar os dados da assinatura. Atualize a página e tente novamente.</strong></div>';
  }
}

init();
