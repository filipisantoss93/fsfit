import { supabase } from './supabase.js';
import { requireSession } from './layout.js';

const session = await requireSession();
if (!session) throw new Error('Sessão inválida');

const summaryEl = document.querySelector('#admin-attention-summary');
const listEl = document.querySelector('#admin-attention-list');
const totalEl = document.querySelector('#admin-attention-total');
const userSearch = document.querySelector('#admin-user-search');
const planFilter = document.querySelector('#admin-plan-filter');
const usersSection = document.querySelector('#admin-users-section');

let activeFilter = 'all';
let attentionItems = [];
let attentionSummary = {};

const FILTERS = [
  { key: 'all', label: 'Todos', countKey: 'total' },
  { key: 'vencendo_7d', label: 'Vencendo 7d', countKey: 'vencendo_7d' },
  { key: 'vencido', label: 'Vencidos', countKey: 'vencidos' },
  { key: 'pix', label: 'PIX pendente', countKey: 'pix_pendentes' },
  { key: 'trial_terminando', label: 'Trial 3d', countKey: 'trials_3d' },
  { key: 'conta_inativa', label: 'Inativas', countKey: 'inativas' },
  { key: 'trial_sem_conversao', label: 'Trial sem conversão', countKey: 'trial_sem_conversao' }
];

const TYPE_LABELS = {
  vencendo_7d: 'Vencendo',
  vencido: 'Vencido',
  pix_vencido: 'PIX vencido',
  pix_pendente: 'PIX pendente',
  trial_terminando: 'Trial',
  conta_inativa: 'Inativa',
  trial_sem_conversao: 'Sem conversão'
};

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function formatDate(value) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sem data' : date.toLocaleDateString('pt-BR');
}

function formatMoneyCents(value) {
  if (value === null || value === undefined) return '';
  return (Number(value) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function typeTone(type) {
  if (type === 'vencido' || type === 'pix_vencido') return 'urgent';
  if (type === 'vencendo_7d' || type === 'pix_pendente' || type === 'trial_terminando') return 'warning';
  return 'neutral';
}

function itemMatchesFilter(item) {
  if (activeFilter === 'all') return true;
  if (activeFilter === 'pix') return item.tipo === 'pix_pendente' || item.tipo === 'pix_vencido';
  return item.tipo === activeFilter;
}

function renderSummary() {
  if (!summaryEl) return;
  if (totalEl) totalEl.textContent = String(Number(attentionSummary.total || 0));
  summaryEl.innerHTML = FILTERS.map(filter => {
    const count = Number(attentionSummary[filter.countKey] || 0);
    return `<button class="admin-attention-filter${activeFilter === filter.key ? ' active' : ''}" type="button" data-attention-filter="${esc(filter.key)}" aria-pressed="${activeFilter === filter.key}">
      <span>${esc(filter.label)}</span><strong>${count}</strong>
    </button>`;
  }).join('');
}

function renderList() {
  if (!listEl) return;
  const visible = attentionItems.filter(itemMatchesFilter);
  if (!visible.length) {
    listEl.innerHTML = '<div class="admin-attention-empty">Nenhuma pendência neste filtro.</div>';
    return;
  }

  listEl.innerHTML = visible.map(item => {
    const money = formatMoneyCents(item.valor_centavos);
    const detail = [item.detalhe, money ? `Valor: ${money}` : null].filter(Boolean).join(' · ');
    return `<button class="admin-attention-row" type="button" data-attention-user="${esc(item.user_id)}" data-attention-email="${esc(item.email || '')}" data-attention-name="${esc(item.nome || '')}">
      <div class="admin-attention-main">
        <div class="admin-attention-title"><span class="admin-attention-type ${typeTone(item.tipo)}">${esc(TYPE_LABELS[item.tipo] || 'Atenção')}</span><strong>${esc(item.nome || 'Usuário')}</strong></div>
        <small>${esc(detail || 'Revisar situação da conta.')}</small>
      </div>
      <div class="admin-attention-meta"><strong>${esc(formatDate(item.data_referencia))}</strong><small>${esc(item.email || '')}</small></div>
      <span class="admin-attention-arrow" aria-hidden="true">›</span>
    </button>`;
  }).join('');
}

async function loadAttention() {
  if (!listEl) return;
  const { data, error } = await supabase.rpc('fsfit_admin_alertas_gestao');
  if (error) {
    console.error('Erro ao carregar alertas de gestão:', error);
    listEl.innerHTML = '<div class="admin-attention-empty">Não foi possível carregar as pendências agora.</div>';
    return;
  }
  attentionSummary = data?.resumo || {};
  attentionItems = Array.isArray(data?.itens) ? data.itens : [];
  renderSummary();
  renderList();
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

function openUserFromAttention(userId, email, name) {
  if (!userId || !userSearch) return;
  if (planFilter) planFilter.value = '';
  userSearch.value = email || name || '';
  userSearch.dispatchEvent(new Event('input', { bubbles: true }));
  usersSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => waitForUserAndOpen(userId), 340);
}

summaryEl?.addEventListener('click', event => {
  const button = event.target.closest('[data-attention-filter]');
  if (!button) return;
  activeFilter = button.dataset.attentionFilter || 'all';
  renderSummary();
  renderList();
});

listEl?.addEventListener('click', event => {
  const row = event.target.closest('[data-attention-user]');
  if (!row) return;
  openUserFromAttention(row.dataset.attentionUser, row.dataset.attentionEmail, row.dataset.attentionName);
});

await loadAttention();
setInterval(() => {
  if (!document.hidden) loadAttention().catch(console.warn);
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadAttention().catch(console.warn);
});
