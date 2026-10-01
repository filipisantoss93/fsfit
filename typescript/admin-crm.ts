// @ts-ignore Existing browser JavaScript module.
import { supabase } from './supabase.js';
// @ts-ignore Existing browser JavaScript module.
import { requireSession } from './layout.js';

type CrmItem = {
  user_id?: string;
  nome?: string;
  email?: string;
  telefone?: string;
  motivo?: string;
  segmento?: string;
  valor_mensal_centavos?: unknown;
  total_pago_centavos?: unknown;
  data_referencia?: string | number | Date | null;
};
type CrmData = { resumo?: Record<string, unknown>; itens?: CrmItem[] };
type AdminTabsWindow = Window & typeof globalThis & { fsfitAdminTabs?: { open?(tab: string): void } };

const session = await requireSession();
if (!session) throw new Error('Sessão inválida');

const summaryEl = document.querySelector<HTMLElement>('#admin-crm-overview');
const filtersEl = document.querySelector<HTMLElement>('#admin-crm-filters');
const listEl = document.querySelector<HTMLElement>('#admin-crm-list');
const searchEl = document.querySelector<HTMLInputElement>('#admin-crm-search');
const userSearch = document.querySelector<HTMLInputElement>('#admin-user-search');
const planFilter = document.querySelector<HTMLSelectElement>('#admin-plan-filter');

const SEGMENTS = [
  { key: 'all', label: 'Todos' }, { key: 'novos', label: 'Novos' },
  { key: 'engajados', label: 'Engajados' }, { key: 'em_risco', label: 'Em risco' },
  { key: 'recuperaveis', label: 'Recuperáveis' }, { key: 'churnados', label: 'Churnados' }
];
const LABELS: Record<string, string> = {
  novos: 'Novos', engajados: 'Engajados', em_risco: 'Em risco',
  recuperaveis: 'Recuperáveis', churnados: 'Churnados'
};

let activeSegment = 'all';
let items: CrmItem[] = [];
let summary: Record<string, unknown> = {};

function esc(value: unknown = ''): string {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}
function moneyCents(value: unknown): string {
  return (Number(value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function formatDate(value: string | number | Date | null | undefined): string {
  if (!value) return 'Sem data';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sem data' : date.toLocaleDateString('pt-BR');
}
function normalizedSearch(): string {
  return String(searchEl?.value || '').trim().toLocaleLowerCase('pt-BR');
}
function matchesSearch(item: CrmItem): boolean {
  const query = normalizedSearch();
  if (!query) return true;
  return [item.nome, item.email, item.telefone, item.motivo]
    .filter(Boolean)
    .some(value => String(value).toLocaleLowerCase('pt-BR').includes(query));
}
function visibleItems(): CrmItem[] {
  return items.filter(item => (activeSegment === 'all' || item.segmento === activeSegment) && matchesSearch(item));
}
function renderOverview(): void {
  if (!summaryEl) return;
  const cards: Array<[string, string]> = [
    ['novos', 'Novos'], ['engajados', 'Engajados'], ['em_risco', 'Em risco'],
    ['recuperaveis', 'Recuperáveis'], ['churnados', 'Churnados']
  ];
  summaryEl.innerHTML = cards.map(([key, label]) => `<div class="admin-crm-overview-card"><span>${esc(label)}</span><strong>${Number(summary[key] || 0)}</strong></div>`).join('');
}
function renderFilters(): void {
  if (!filtersEl) return;
  const total = items.length;
  filtersEl.innerHTML = SEGMENTS.map(segment => {
    const count = segment.key === 'all' ? total : Number(summary[segment.key] || 0);
    return `<button class="admin-crm-filter${activeSegment === segment.key ? ' active' : ''}" type="button" data-crm-segment="${segment.key}" aria-pressed="${activeSegment === segment.key}">${esc(segment.label)} <strong>${count}</strong></button>`;
  }).join('');
}
function renderList(): void {
  if (!listEl) return;
  const visible = visibleItems();
  if (!visible.length) {
    listEl.innerHTML = '<div class="admin-crm-empty">Nenhum cliente encontrado neste segmento.</div>';
    return;
  }
  listEl.innerHTML = visible.map(item => {
    const recurring = Number(item.valor_mensal_centavos || 0);
    const paid = Number(item.total_pago_centavos || 0);
    const metaPrimary = recurring > 0 ? `MRR: ${moneyCents(recurring)}` : `Pago: ${moneyCents(paid)}`;
    const segment = item.segmento || '';
    return `<button class="admin-crm-row" type="button" data-crm-user="${esc(item.user_id)}" data-crm-email="${esc(item.email || '')}" data-crm-name="${esc(item.nome || '')}">
      <div class="admin-crm-main"><div class="admin-crm-title"><span class="admin-crm-badge ${esc(segment)}">${esc(LABELS[segment] || segment)}</span><strong>${esc(item.nome || 'Usuário')}</strong></div><small>${esc(item.motivo || 'Sem observações')}</small></div>
      <div class="admin-crm-meta"><strong>${esc(metaPrimary)}</strong><small>${esc(formatDate(item.data_referencia))}</small></div><span class="admin-crm-arrow" aria-hidden="true">›</span>
    </button>`;
  }).join('');
}
function renderAll(): void { renderOverview(); renderFilters(); renderList(); }
function waitForUserAndOpen(userId: string, attempt = 0): void {
  const directButton = document.querySelector<HTMLElement>(`[data-open-user="${CSS.escape(userId)}"]`);
  if (directButton) { directButton.click(); return; }
  const compactRow = document.querySelector<HTMLElement>(`tr[data-admin-user-id="${CSS.escape(userId)}"]`);
  if (compactRow) { compactRow.click(); return; }
  if (attempt >= 30) return;
  window.setTimeout(() => waitForUserAndOpen(userId, attempt + 1), 100);
}
function openUser(item: CrmItem): void {
  if (!item.user_id) return;
  (window as AdminTabsWindow).fsfitAdminTabs?.open?.('clientes');
  if (planFilter) planFilter.value = '';
  if (userSearch) {
    userSearch.value = item.email || item.nome || '';
    userSearch.dispatchEvent(new Event('input', { bubbles: true }));
  }
  window.setTimeout(() => waitForUserAndOpen(item.user_id as string), 340);
}
async function loadCrm(): Promise<void> {
  if (!listEl) return;
  const { data, error } = await supabase.rpc('fsfit_admin_segmentacao_clientes');
  if (error) {
    console.error('Erro ao carregar segmentação CRM:', error);
    listEl.innerHTML = '<div class="admin-crm-empty">Não foi possível carregar a segmentação agora.</div>';
    return;
  }
  const payload = (data || {}) as CrmData;
  summary = payload.resumo || {};
  items = Array.isArray(payload.itens) ? payload.itens : [];
  renderAll();
}
filtersEl?.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest<HTMLElement>('[data-crm-segment]');
  if (!button) return;
  activeSegment = button.dataset.crmSegment || 'all';
  renderFilters(); renderList();
});
searchEl?.addEventListener('input', renderList);
listEl?.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  const row = target?.closest<HTMLElement>('[data-crm-user]');
  if (!row) return;
  const item = items.find(entry => entry.user_id === row.dataset.crmUser);
  if (item) openUser(item);
});
await loadCrm();
window.setInterval(() => { if (!document.hidden) void loadCrm().catch(console.warn); }, 90000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void loadCrm().catch(console.warn); });
