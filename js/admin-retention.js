import { supabase } from './supabase.js';
import { requireSession } from './layout.js';

const session = await requireSession();
if (!session) throw new Error('Sessão inválida');

const root = document.querySelector('#admin-retention-churn');
const userSearch = document.querySelector('#admin-user-search');
const planFilter = document.querySelector('#admin-plan-filter');
const usersSection = document.querySelector('#admin-users-section');

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function moneyCents(value) {
  if (value === null || value === undefined) return '—';
  return (Number(value) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function pct(value) {
  if (value === null || value === undefined) return 'Aguardando histórico';
  return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function formatDate(value) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sem data' : date.toLocaleDateString('pt-BR');
}

function waitForUserAndOpen(userId, attempt = 0) {
  const directButton = document.querySelector(`[data-open-user="${userId}"]`);
  if (directButton) {
    directButton.click();
    return;
  }
  const compactRow = document.querySelector(`tr[data-admin-user-id="${userId}"]`);
  if (compactRow) {
    compactRow.click();
    return;
  }
  if (attempt >= 25) return;
  setTimeout(() => waitForUserAndOpen(userId, attempt + 1), 100);
}

function openUser(userId, email, name) {
  if (!userId || !userSearch) return;
  if (planFilter) planFilter.value = '';
  userSearch.value = email || name || '';
  userSearch.dispatchEvent(new Event('input', { bubbles: true }));
  usersSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => waitForUserAndOpen(userId), 340);
}

function render(data) {
  if (!root) return;
  const riskItems = Array.isArray(data?.risco_itens) ? data.risco_itens : [];
  const retentionValue = data?.retencao_30d_pct;
  const ltvValue = data?.ltv_estimado_centavos;

  root.innerHTML = `
    <div class="admin-retention-grid">
      <div class="admin-retention-card">
        <span>Churn 30 dias</span>
        <strong>${esc(pct(data?.churn_30d_pct ?? 0))}</strong>
        <small>${Number(data?.cancelamentos_30d || 0)} cancelamento(s) de cliente pagante no período.</small>
      </div>
      <div class="admin-retention-card">
        <span>Retenção 30 dias</span>
        <strong class="${retentionValue === null || retentionValue === undefined ? 'admin-retention-pending' : 'admin-retention-good'}">${esc(pct(retentionValue))}</strong>
        <small>${Number(data?.elegiveis_retencao_30d || 0)} cliente(s) já possuem histórico suficiente para essa métrica.</small>
      </div>
      <div class="admin-retention-card">
        <span>Tempo médio como assinante</span>
        <strong>${Number(data?.tempo_medio_meses || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mês(es)</strong>
        <small>Tempo médio desde o primeiro pagamento confirmado.</small>
      </div>
      <div class="admin-retention-card">
        <span>LTV estimado</span>
        <strong>${ltvValue === null || ltvValue === undefined ? 'Aguardando churn' : esc(moneyCents(ltvValue))}</strong>
        <small>ARPU mensal atual: ${esc(moneyCents(data?.arpu_mensal_centavos || 0))} · Receita média histórica/cliente: ${esc(moneyCents(data?.receita_media_cliente_centavos || 0))}.</small>
      </div>
    </div>
    <div class="admin-retention-risk-head">
      <h3>Clientes em risco</h3>
      <span class="admin-retention-risk-total">${Number(data?.clientes_em_risco || 0)} cliente(s) · ${esc(moneyCents(data?.receita_em_risco_centavos || 0))} expostos</span>
    </div>
    <div class="admin-retention-risk-list">
      ${riskItems.length ? riskItems.map(item => `
        <button class="admin-retention-risk-row" type="button" data-retention-user="${esc(item.user_id)}" data-retention-email="${esc(item.email || '')}" data-retention-name="${esc(item.nome || '')}">
          <div class="admin-retention-risk-main">
            <strong>${esc(item.nome || 'Usuário')}</strong>
            <small>${esc(item.motivo || 'Revisar assinatura')}</small>
          </div>
          <div class="admin-retention-risk-meta">
            <strong>${esc(moneyCents(item.valor_centavos || 0))}</strong>
            <small>${esc(formatDate(item.data_referencia))}</small>
          </div>
          <span class="admin-retention-risk-arrow" aria-hidden="true">›</span>
        </button>`).join('') : '<div class="admin-retention-empty">Nenhum cliente pagante em risco neste momento.</div>'}
    </div>`;
}

async function loadRetention() {
  if (!root) return;
  const { data, error } = await supabase.rpc('fsfit_admin_retencao_churn');
  if (error) {
    console.error('Erro ao carregar retenção e churn:', error);
    root.innerHTML = '<div class="admin-retention-empty">Não foi possível carregar os indicadores de retenção agora.</div>';
    return;
  }
  render(data || {});
}

root?.addEventListener('click', event => {
  const row = event.target.closest('[data-retention-user]');
  if (!row) return;
  openUser(row.dataset.retentionUser, row.dataset.retentionEmail, row.dataset.retentionName);
});

await loadRetention();
setInterval(() => {
  if (!document.hidden) loadRetention().catch(console.warn);
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadRetention().catch(console.warn);
});
