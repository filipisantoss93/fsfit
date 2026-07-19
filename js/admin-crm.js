import { supabase } from './supabase.js';
import { requireSession } from './layout.js';

const session = await requireSession();
if (!session) throw new Error('Sessão inválida');

const summaryEl = document.querySelector('#admin-crm-overview');
const filtersEl = document.querySelector('#admin-crm-filters');
const listEl = document.querySelector('#admin-crm-list');
const searchEl = document.querySelector('#admin-crm-search');
const userSearch = document.querySelector('#admin-user-search');
const planFilter = document.querySelector('#admin-plan-filter');

const SEGMENTS = [
  { key: 'all', label: 'Todos' },
  { key: 'novos', label: 'Novos' },
  { key: 'engajados', label: 'Engajados' },
  { key: 'em_risco', label: 'Em risco' },
  { key: 'recuperaveis', label: 'Recuperáveis' },
  { key: 'churnados', label: 'Churnados' }
];

const LABELS = {
  novos: 'Novos',
  engajados: 'Engajados',
  em_risco: 'Em risco',
  recuperaveis: 'Recuperáveis',
  churnados: 'Churnados'
};

let activeSegment = 'all';
let items = [];
let summary = {};

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function moneyCents(value) {
  return (Number(value || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sem data' : date.toLocaleDateString('pt-BR');
}

function normalizedSearch() {
  return String(searchEl?.value || '').trim().toLocaleLowerCase('pt-BR');
}

function matchesSearch(item) {
  const query = normalizedSearch();
  if (!query) return true;
  return [item.nome, item.email, item.telefone, item.motivo]
    .filter(Boolean)
    .some(value => String(value).toLocaleLowerCase('pt-BR').includes(query));
}

function visibleItems() {
  return items.filter(item => (activeSegment === 'all' || item.segmento === activeSegment) && matchesSearch(item));
}

function renderOverview() {
  if (!summaryEl) return;
  const cards = [
    ['novos', 'Novos'],
    ['engajados', 'Engajados'],
    ['em_risco', 'Em risco'],
    ['recuperaveis', 'Recuperáveis'],
    ['churnados', 'Churnados']
  ];
  summaryEl.innerHTML = cards.map(([key, label]) => `<div class="admin-crm-overview-card"><span>${esc(label)}</span><strong>${Number(summary[key] || 0)}</strong></div>`).join('');
}

function renderFilters() {
  if (!filtersEl) return;
  const total = items.length;
  filtersEl.innerHTML = SEGMENTS.map(segment => {
    const count = segment.key === 'all' ? total : Number(summary[segment.key] || 0);
    return `<button class="admin-crm-filter${activeSegment === segment.key ? ' active' : ''}" type="button" data-crm-segment="${segment.key}" aria-pressed="${activeSegment === segment.key}">${esc(segment.label)} <strong>${count}</strong></button>`;
  }).join('');
}

function renderList() {
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
    return `<button class="admin-crm-row" type="button" data-crm-user="${esc(item.user_id)}" data-crm-email="${esc(item.email || '')}" data-crm-name="${esc(item.nome || '')}">
      <div class="admin-crm-main">
        <div class="admin-crm-title"><span class="admin-crm-badge ${esc(item.segmento)}">${esc(LABELS[item.segmento] || item.segmento)}</span><strong>${esc(item.nome || 'Usuário')}</strong></div>
        <small>${esc(item.motivo || 'Sem observações')}</small>
      </div>
      <div class="admin-crm-meta"><strong>${esc(metaPrimary)}</strong><small>${esc(formatDate(item.data_referencia))}</small></div>
      <span class="admin-crm-arrow" aria-hidden="true">›</span>
    </button>`;
  }).join('');
}

function renderAll() {
  renderOverview();
  renderFilters();
  renderList();
}

function waitForUserAndOpen(userId, attempt = 0) {
  const directButton = document.querySelector(`[data-open-user="${CSS.escape(userId)}"]`);
  if (directButton) return directButton.click();
  const compactRow = document.querySelector(`tr[data-admin-user-id="${CSS.escape(userId)}"]`);
  if (compactRow) return compactRow.click();
  if (attempt >= 30) return;
  setTimeout(() => waitForUserAndOpen(userId, attempt + 1), 100);
}

function openUser(item) {
  if (!item?.user_id) return;
  window.fsfitAdminTabs?.open?.('clientes');
  if (planFilter) planFilter.value = '';
  if (userSearch) {
    userSearch.value = item.email || item.nome || '';
    userSearch.dispatchEvent(new Event('input', { bubbles: true }));
  }
  setTimeout(() => waitForUserAndOpen(item.user_id), 340);
}

async function loadCrm() {
  if (!listEl) return;
  const { data, error } = await supabase.rpc('fsfit_admin_segmentacao_clientes');
  if (error) {
    console.error('Erro ao carregar segmentação CRM:', error);
    listEl.innerHTML = '<div class="admin-crm-empty">Não foi possível carregar a segmentação agora.</div>';
    return;
  }
  summary = data?.resumo || {};
  items = Array.isArray(data?.itens) ? data.itens : [];
  renderAll();
}

filtersEl?.addEventListener('click', event => {
  const button = event.target.closest('[data-crm-segment]');
  if (!button) return;
  activeSegment = button.dataset.crmSegment || 'all';
  renderFilters();
  renderList();
});

searchEl?.addEventListener('input', renderList);

listEl?.addEventListener('click', event => {
  const row = event.target.closest('[data-crm-user]');
  if (!row) return;
  const item = items.find(entry => entry.user_id === row.dataset.crmUser);
  if (item) openUser(item);
});

await loadCrm();
setInterval(() => {
  if (!document.hidden) loadCrm().catch(console.warn);
}, 90000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadCrm().catch(console.warn);
});
