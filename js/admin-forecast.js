// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { supabase } from './supabase.js';
// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { requireSession } from './layout.js';
const session = await requireSession();
if (!session)
    throw new Error('Sessão inválida');
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
    const forecast = data;
    if (receivedEl)
        receivedEl.textContent = moneyFromCents(forecast?.recebido_mes_centavos);
    if (receivableEl)
        receivableEl.textContent = moneyFromCents(forecast?.a_receber_mes_centavos);
    if (projectedEl)
        projectedEl.textContent = moneyFromCents(forecast?.receita_prevista_mes_centavos);
    if (overdueEl)
        overdueEl.textContent = moneyFromCents(forecast?.inadimplencia_centavos);
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
    if (periodEl)
        periodEl.textContent = monthLabel(forecast?.periodo_inicio);
}
await loadForecast();
window.setInterval(() => {
    if (!document.hidden)
        void loadForecast().catch(console.warn);
}, 60000);
document.addEventListener('visibilitychange', () => {
    if (!document.hidden)
        void loadForecast().catch(console.warn);
});
