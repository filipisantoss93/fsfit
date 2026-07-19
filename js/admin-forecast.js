import { supabase } from './supabase.js';
import { requireSession } from './layout.js';

const session = await requireSession();
if (!session) throw new Error('Sessão inválida');

const receivedEl = document.querySelector('#forecast-received');
const receivableEl = document.querySelector('#forecast-receivable');
const projectedEl = document.querySelector('#forecast-projected');
const overdueEl = document.querySelector('#forecast-overdue');
const receivableNoteEl = document.querySelector('#forecast-receivable-note');
const overdueNoteEl = document.querySelector('#forecast-overdue-note');
const renewalsEl = document.querySelector('#forecast-renewals-30d');
const periodEl = document.querySelector('#forecast-period');

function moneyFromCents(value) {
  return (Number(value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function monthLabel(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

async function loadForecast() {
  const { data, error } = await supabase.rpc('fsfit_admin_previsao_financeira');
  if (error) {
    console.error('Erro ao carregar previsão financeira:', error);
    return;
  }

  if (receivedEl) receivedEl.textContent = moneyFromCents(data?.recebido_mes_centavos);
  if (receivableEl) receivableEl.textContent = moneyFromCents(data?.a_receber_mes_centavos);
  if (projectedEl) projectedEl.textContent = moneyFromCents(data?.receita_prevista_mes_centavos);
  if (overdueEl) overdueEl.textContent = moneyFromCents(data?.inadimplencia_centavos);

  if (receivableNoteEl) {
    const pending = moneyFromCents(data?.cobrancas_pendentes_mes_centavos);
    const renewals = moneyFromCents(data?.renovacoes_previstas_mes_centavos);
    receivableNoteEl.textContent = `Cobranças emitidas: ${pending} · Renovações previstas: ${renewals}`;
  }

  if (overdueNoteEl) {
    const clients = Number(data?.clientes_inadimplentes || 0);
    const rate = Number(data?.taxa_inadimplencia_pct || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    overdueNoteEl.textContent = `${clients} cliente${clients === 1 ? '' : 's'} · Taxa estimada: ${rate}%`;
    overdueEl?.closest('.admin-forecast-card')?.classList.toggle('danger', Number(data?.inadimplencia_centavos || 0) > 0);
  }

  if (renewalsEl) {
    const count = Number(data?.renovacoes_30d || 0);
    renewalsEl.innerHTML = `<strong>${count}</strong> renovaç${count === 1 ? 'ão' : 'ões'} prevista${count === 1 ? '' : 's'} nos próximos 30 dias · <strong>${moneyFromCents(data?.renovacoes_30d_centavos)}</strong>`;
  }

  if (periodEl) periodEl.textContent = monthLabel(data?.periodo_inicio);
}

await loadForecast();
setInterval(() => {
  if (!document.hidden) loadForecast().catch(console.warn);
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadForecast().catch(console.warn);
});
