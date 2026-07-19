import { supabase } from './supabase.js';
import { requireSession } from './layout.js';

const session = await requireSession();
if (!session) throw new Error('Sessão inválida');

const root = document.querySelector('#admin-commercial-funnel');
if (!root) throw new Error('Container do funil comercial não encontrado');

function pct(value) {
  return `${Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function number(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function monthLabel(value) {
  if (!/^\d{4}-\d{2}$/.test(value || '')) return value || '';
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(new Date(year, month - 1, 1)).replace('.', '');
}

function render(data) {
  const history = data?.historico || {};
  const rates = data?.taxas || {};
  const recent = data?.ultimos_30_dias || {};
  const trend = Array.isArray(data?.tendencia_6_meses) ? data.tendencia_6_meses : [];

  const stages = [
    { label: 'Cadastros', value: Number(history.cadastros || 0), note: 'Contas comerciais criadas' },
    { label: 'Trial iniciado', value: Number(history.trials || 0), note: 'Usuários que iniciaram o período grátis' },
    { label: 'Conversões pagas', value: Number(history.conversoes_pagas || 0), note: 'Usuários com primeiro pagamento confirmado' },
    { label: 'Pagantes ativos', value: Number(history.assinantes_pagos_ativos || 0), note: 'Convertidos que permanecem com acesso ativo' }
  ];

  const maxStage = Math.max(stages[0].value, 1);
  const maxTrend = Math.max(1, ...trend.flatMap(item => [Number(item.cadastros || 0), Number(item.conversoes || 0)]));

  root.innerHTML = `
    <div class="admin-funnel-layout">
      <div class="admin-funnel-stages">
        ${stages.map(stage => `
          <div class="admin-funnel-stage" style="--funnel-width:${Math.max(4, Math.min(100, (stage.value / maxStage) * 100))}%">
            <div><span>${esc(stage.label)}</span><small>${esc(stage.note)}</small></div>
            <strong>${number(stage.value)}</strong>
          </div>
        `).join('')}
      </div>
      <div>
        <div class="admin-funnel-rates">
          <div class="admin-funnel-rate"><span>Cadastro → Trial</span><strong>${pct(rates.cadastro_trial_pct)}</strong></div>
          <div class="admin-funnel-rate"><span>Trial → Pagamento</span><strong>${pct(rates.trial_conversao_pct)}</strong></div>
          <div class="admin-funnel-rate"><span>Retenção dos pagantes</span><strong>${pct(rates.retencao_pagantes_pct)}</strong></div>
        </div>
        <div class="admin-funnel-note">
          Premium ativos: <strong>${number(history.premium_ativos_total)}</strong> · Pagos: <strong>${number(history.assinantes_pagos_ativos)}</strong> · Cortesia/admin: <strong>${number(history.premium_cortesia_ativos)}</strong> · Trials encerrados sem conversão: <strong>${number(history.trial_sem_conversao)}</strong>.
        </div>
      </div>
    </div>
    <div class="admin-funnel-30d">
      <div><span>Cadastros 30d</span><strong>${number(recent.cadastros)}</strong></div>
      <div><span>Trials 30d</span><strong>${number(recent.trials)}</strong></div>
      <div><span>Conversões 30d</span><strong>${number(recent.conversoes)}</strong></div>
      <div><span>Cancelamentos 30d</span><strong>${number(recent.cancelamentos)}</strong></div>
    </div>
    <div class="admin-funnel-trend-title">Aquisição e conversão · últimos 6 meses</div>
    <div class="admin-funnel-trend" aria-label="Cadastros e conversões dos últimos seis meses">
      ${trend.map(item => {
        const signups = Number(item.cadastros || 0);
        const conversions = Number(item.conversoes || 0);
        const signupHeight = Math.max(3, (signups / maxTrend) * 100);
        const conversionHeight = Math.max(conversions > 0 ? 3 : 0, (conversions / maxTrend) * 100);
        return `<div class="admin-funnel-month" title="${esc(monthLabel(item.mes))}: ${signups} cadastros, ${conversions} conversões">
          <div class="admin-funnel-bars">
            <span class="admin-funnel-bar signups" style="height:${signupHeight}%"></span>
            <span class="admin-funnel-bar conversions" style="height:${conversionHeight}%"></span>
          </div>
          <span class="admin-funnel-month-label">${esc(monthLabel(item.mes))}</span>
        </div>`;
      }).join('')}
    </div>
    <div class="admin-funnel-legend"><span class="signups">Cadastros</span><span class="conversions">Conversões</span></div>
  `;
}

async function loadFunnel() {
  const { data, error } = await supabase.rpc('fsfit_admin_funil_comercial');
  if (error) {
    console.error('Erro ao carregar funil comercial:', error);
    root.innerHTML = '<div class="admin-funnel-error">Não foi possível carregar o funil comercial agora.</div>';
    return;
  }
  render(data || {});
}

await loadFunnel();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadFunnel().catch(console.warn);
});
