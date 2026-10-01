// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { supabase } from './supabase.js';
// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { requireSession } from './layout.js';

type ForecastData = {
  recebido_mes_centavos?: number | null;
  a_receber_mes_centavos?: number | null;
  receita_prevista_mes_centavos?: number | null;
  inadimplencia_centavos?: number | null;
  cobrancas_pendentes_mes_centavos?: number | null;
  renovacoes_previstas_mes_centavos?: number | null;
  clientes_inadimplentes?: number | null;
  taxa_inadimplencia_pct?: number | null;
  renovacoes_30d?: number | null;
  renovacoes_30d_centavos?: number | null;
  periodo_inicio?: string | null;
};

const session = await requireSession();
if (!session) throw new Error('Sessão inválida');

const receivedEl = document.querySelector<HTMLElement>('#forecast-received');
const receivableEl = document.querySelector<HTMLElement>('#forecast-receivable');
const projectedEl = document.querySelector<HTMLElement>('#forecast-projected');
const overdueEl = document.querySelector<HTMLElement>('#forecast-overdue');
const receivableNoteEl = document.querySelector<HTMLElement>('#forecast-receivable-note');
const overdueNoteEl = document.querySelector<HTMLElement>('#forecast-overdue-note');
const renewalsEl = document.querySelector<HTMLElement>('#forecast-renewals-30d');
const periodEl = document.querySelector<HTMLElement>('#forecast-period');

function moneyFromCents(value: number | null | undefined): string {
  return (Number(value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function monthLabel(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

async function loadForecast(): Promise<void> {
  const { data, error } = await supabase.rpc('fsfit_admin_previsao_financeira');
  if (error) {
    console.error('Erro ao carregar previsão financeira:', error);
    return;
  }

  const forecast = data as ForecastData | null;
  if (receivedEl) receivedEl.textContent = moneyFromCents(forecast?.recebido_mes_centavos);
  if (receivableEl) receivableEl.textContent = moneyFromCents(forecast?.a_receber_mes_centavos);
  if (projectedEl) projectedEl.textContent = moneyFromCents(forecast?.receita_prevista_mes_centavos);
  if (overdueEl) overdueEl.textContent = moneyFromCents(forecast?.inadimplencia_centavos);

  if (receivableNoteEl) {
    const pending = moneyFromCents(forecast?.cobrancas_pendentes_mes_centavos);
    const renewals = moneyFromCents(forecast?.renovacoes_previstas_mes_centavos);
    receivableNoteEl.textContent = `Cobranças emitidas: ${pending} · Renovações previstas: ${renewals}`;
  }

  if (overdueNoteEl) {
    const clients = Number(forecast?.clientes_inadimplentes || 0);
    const rate = Number(forecast?.taxa_inadimplencia_pct || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    overdueNoteEl.textContent = `${clients} cliente${clients === 1 ? '' : 's'} · Taxa estimada: ${rate}%`;
    overdueEl?.closest('.admin-forecast-card')?.classList.toggle('danger', Number(forecast?.inadimplencia_centavos || 0) > 0);
  }

  if (renewalsEl) {
    const count = Number(forecast?.renovacoes_30d || 0);
    renewalsEl.innerHTML = `<strong>${count}</strong> renovaç${count === 1 ? 'ão' : 'ões'} prevista${count === 1 ? '' : 's'} nos próximos 30 dias · <strong>${moneyFromCents(forecast?.renovacoes_30d_centavos)}</strong>`;
  }

  if (periodEl) periodEl.textContent = monthLabel(forecast?.periodo_inicio);
}

await loadForecast();
window.setInterval(() => {
  if (!document.hidden) void loadForecast().catch(console.warn);
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void loadForecast().catch(console.warn);
});
