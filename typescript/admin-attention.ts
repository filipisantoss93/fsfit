// @ts-ignore Existing browser JavaScript module.
import { supabase } from './supabase.js';
// @ts-ignore Existing browser JavaScript module.
import { requireSession } from './layout.js';
// @ts-ignore Existing browser JavaScript module.
import './admin-cron-monitor.js?v=20260726-cron-monitor1';

type AttentionItem = {
  tipo?: string;
  valor_centavos?: unknown;
  detalhe?: string;
  user_id?: string;
  email?: string;
  nome?: string;
  data_referencia?: string | number | Date | null;
};
type AttentionData = { resumo?: Record<string, unknown>; itens?: AttentionItem[] };

const session = await requireSession();
if (!session) throw new Error('Sessão inválida');

const summaryEl = document.querySelector<HTMLElement>('#admin-attention-summary');
const listEl = document.querySelector<HTMLElement>('#admin-attention-list');
const totalEl = document.querySelector<HTMLElement>('#admin-attention-total');
const userSearch = document.querySelector<HTMLInputElement>('#admin-user-search');
const planFilter = document.querySelector<HTMLSelectElement>('#admin-plan-filter');
const usersSection = document.querySelector<HTMLElement>('#admin-users-section');

let activeFilter = 'all';
let attentionItems: AttentionItem[] = [];
let attentionSummary: Record<string, unknown> = {};

const FILTERS = [
  { key: 'all', label: 'Todos', countKey: 'total' },
  { key: 'vencendo_7d', label: 'Vencendo 7d', countKey: 'vencendo_7d' },
  { key: 'vencido', label: 'Vencidos', countKey: 'vencidos' },
  { key: 'pix', label: 'PIX pendente', countKey: 'pix_pendentes' },
  { key: 'trial_terminando', label: 'Trial 3d', countKey: 'trials_3d' },
  { key: 'conta_inativa', label: 'Inativas', countKey: 'inativas' },
  { key: 'trial_sem_conversao', label: 'Trial sem conversão', countKey: 'trial_sem_conversao' }
];
const TYPE_LABELS: Record<string, string> = {
  vencendo_7d: 'Vencendo', vencido: 'Vencido', pix_vencido: 'PIX vencido',
  pix_pendente: 'PIX pendente', trial_terminando: 'Trial', conta_inativa: 'Inativa',
  trial_sem_conversao: 'Sem conversão'
};

function esc(value: unknown = ''): string {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}
function formatDate(value: string | number | Date | null | undefined): string {
  if (!value) return 'Sem data';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sem data' : date.toLocaleDateString('pt-BR');
}
function formatMoneyCents(value: unknown): string {
  if (value === null || value === undefined) return '';
  return (Number(value) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function typeTone(type?: string): string {
  if (type === 'vencido' || type === 'pix_vencido') return 'urgent';
  if (type === 'vencendo_7d' || type === 'pix_pendente' || type === 'trial_terminando') return 'warning';
  return 'neutral';
}
function itemMatchesFilter(item: AttentionItem): boolean {
  if (activeFilter === 'all') return true;
  if (activeFilter === 'pix') return item.tipo === 'pix_pendente' || item.tipo === 'pix_vencido';
  return item.tipo === activeFilter;
}
function renderSummary(): void {
  if (!summaryEl) return;
  if (totalEl) totalEl.textContent = String(Number(attentionSummary.total || 0));
  summaryEl.innerHTML = FILTERS.map(filter => {
    const count = Number(attentionSummary[filter.countKey] || 0);
    return `<button class="admin-attention-filter${activeFilter === filter.key ? ' active' : ''}" type="button" data-attention-filter="${esc(filter.key)}" aria-pressed="${activeFilter === filter.key}"><span>${esc(filter.label)}</span><strong>${count}</strong></button>`;
  }).join('');
}
function renderList(): void {
  if (!listEl) return;
  const visible = attentionItems.filter(itemMatchesFilter);
  if (!visible.length) {
    listEl.innerHTML = '<div class="admin-attention-empty">Nenhuma pendência neste filtro.</div>';
    return;
  }
  listEl.innerHTML = visible.map(item => {
    const money = formatMoneyCents(item.valor_centavos);
    const detail = [item.detalhe, money ? `Valor: ${money}` : null].filter(Boolean).join(' · ');
    const type = item.tipo || '';
    return `<button class="admin-attention-row" type="button" data-attention-user="${esc(item.user_id)}" data-attention-email="${esc(item.email || '')}" data-attention-name="${esc(item.nome || '')}">
      <div class="admin-attention-main"><div class="admin-attention-title"><span class="admin-attention-type ${typeTone(type)}">${esc(TYPE_LABELS[type] || 'Atenção')}</span><strong>${esc(item.nome || 'Usuário')}</strong></div><small>${esc(detail || 'Revisar situação da conta.')}</small></div>
      <div class="admin-attention-meta"><strong>${esc(formatDate(item.data_referencia))}</strong><small>${esc(item.email || '')}</small></div><span class="admin-attention-arrow" aria-hidden="true">›</span>
    </button>`;
  }).join('');
}
async function loadAttention(): Promise<void> {
  if (!listEl) return;
  const { data, error } = await supabase.rpc('fsfit_admin_alertas_gestao');
  if (error) {
    console.error('Erro ao carregar alertas de gestão:', error);
    listEl.innerHTML = '<div class="admin-attention-empty">Não foi possível carregar as pendências agora.</div>';
    return;
  }
  const payload = (data || {}) as AttentionData;
  attentionSummary = payload.resumo || {};
  attentionItems = Array.isArray(payload.itens) ? payload.itens : [];
  renderSummary(); renderList();
}
function waitForUserAndOpen(userId: string, attempt = 0): void {
  const directButton = document.querySelector<HTMLElement>(`[data-open-user="${userId}"]`);
  if (directButton) { directButton.click(); return; }
  const compactRow = document.querySelector<HTMLElement>(`tr[data-admin-user-id="${userId}"]`);
  if (compactRow) { compactRow.click(); return; }
  if (attempt >= 25) return;
  window.setTimeout(() => waitForUserAndOpen(userId, attempt + 1), 100);
}
function openUserFromAttention(userId?: string, email?: string, name?: string): void {
  if (!userId || !userSearch) return;
  if (planFilter) planFilter.value = '';
  userSearch.value = email || name || '';
  userSearch.dispatchEvent(new Event('input', { bubbles: true }));
  usersSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => waitForUserAndOpen(userId), 340);
}
summaryEl?.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest<HTMLElement>('[data-attention-filter]');
  if (!button) return;
  activeFilter = button.dataset.attentionFilter || 'all';
  renderSummary(); renderList();
});
listEl?.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  const row = target?.closest<HTMLElement>('[data-attention-user]');
  if (!row) return;
  openUserFromAttention(row.dataset.attentionUser, row.dataset.attentionEmail, row.dataset.attentionName);
});
await loadAttention();
window.setInterval(() => { if (!document.hidden) void loadAttention().catch(console.warn); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void loadAttention().catch(console.warn); });
