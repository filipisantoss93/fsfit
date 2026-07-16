import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('admin');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const message = document.querySelector('#admin-message');
const usersList = document.querySelector('#admin-users-list');
const financeList = document.querySelector('#admin-finance-list');
const searchInput = document.querySelector('#admin-user-search');
const planFilter = document.querySelector('#admin-plan-filter');
const exportButton = document.querySelector('#export-finance');

const VALID_PLANS = ['trial', 'free', 'premium'];
let users = [];
let payments = [];

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function normalizePlan(value = '') {
  const plan = String(value || '').trim().toLowerCase();
  if (plan === 'gratis') return 'free';
  if (plan === 'pago' || plan === 'pro' || plan === 'profissional') return 'premium';
  return VALID_PLANS.includes(plan) ? plan : 'free';
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR');
}

async function requireAdmin() {
  const { data, error } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error || !data) {
    document.body.innerHTML = '<main class="container"><section class="card" style="margin-top:40px;text-align:center"><h1>Acesso restrito</h1><p>Esta área é exclusiva da administração da plataforma.</p><a class="btn btn-primary" href="painel.html">Voltar ao painel</a></section></main>';
    throw new Error('Acesso administrativo negado');
  }
}

function applySummary(summary = {}) {
  document.querySelector('#stat-accounts').textContent = Number(summary.contas || 0);
  document.querySelector('#stat-subscribers').textContent = Number(summary.assinantes || 0);
  document.querySelector('#stat-trial').textContent = Number(summary.trial || 0);
  document.querySelector('#stat-inactive').textContent = Number(summary.inativas || 0);
  document.querySelector('#stat-revenue-month').textContent = formatMoney(summary.faturamento_mes);
  document.querySelector('#stat-revenue-total').textContent = formatMoney(summary.faturamento_total);
  document.querySelector('#finance-approved').textContent = Number(summary.pagamentos_aprovados || 0);
  document.querySelector('#finance-pending').textContent = Number(summary.pendentes || 0);
  document.querySelector('#finance-cancelled').textContent = Number(summary.cancelados_estornados || 0);
  document.querySelector('#finance-ticket').textContent = formatMoney(summary.ticket_medio);
}

function updateFinanceStats() {
  const approved = payments.filter(item => ['approved', 'aprovado', 'paid', 'pago', 'paga'].includes((item.status || '').toLowerCase()));
  const pending = payments.filter(item => ['pending', 'pendente', 'waiting', 'aguardando'].includes((item.status || '').toLowerCase()));
  const cancelled = payments.filter(item => ['cancelled', 'canceled', 'cancelado', 'cancelada', 'refunded', 'estornado', 'devolvida'].includes((item.status || '').toLowerCase()));
  const now = new Date();
  const monthApproved = approved.filter(item => {
    const date = new Date(item.paid_at || item.created_at);
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  });
  const total = approved.reduce((sum, item) => sum + Number(item.valor || item.amount || 0), 0);
  const monthTotal = monthApproved.reduce((sum, item) => sum + Number(item.valor || item.amount || 0), 0);

  document.querySelector('#stat-revenue-month').textContent = formatMoney(monthTotal);
  document.querySelector('#stat-revenue-total').textContent = formatMoney(total);
  document.querySelector('#finance-approved').textContent = approved.length;
  document.querySelector('#finance-pending').textContent = pending.length;
  document.querySelector('#finance-cancelled').textContent = cancelled.length;
  document.querySelector('#finance-ticket').textContent = formatMoney(approved.length ? total / approved.length : 0);
}

function renderUsers() {
  const term = searchInput.value.trim().toLowerCase();
  const plan = planFilter.value;
  const filtered = users.filter(user => {
    const haystack = `${user.nome || ''} ${user.email || ''}`.toLowerCase();
    return (!term || haystack.includes(term)) && (!plan || normalizePlan(user.plano) === plan);
  });

  usersList.innerHTML = filtered.length ? filtered.map(user => {
    const currentPlan = normalizePlan(user.plano);
    return `
    <tr>
      <td><div class="admin-user-meta"><strong>${esc(user.nome || 'Usuário')}</strong><small>${esc(user.email || 'E-mail não disponível')}</small></div></td>
      <td>
        <select class="admin-inline-select" data-plan-user="${esc(user.id)}">
          ${VALID_PLANS.map(planName => `<option value="${planName}" ${currentPlan === planName ? 'selected' : ''}>${planName}</option>`).join('')}
        </select>
      </td>
      <td><span class="admin-badge ${user.ativo === false ? 'inactive' : 'active'}">${user.ativo === false ? 'Inativa' : 'Ativa'}</span></td>
      <td>${formatDate(user.trial_fim)}</td>
      <td><div class="admin-actions">
        <button class="btn btn-outline" type="button" data-save-plan="${esc(user.id)}">Salvar plano</button>
        <button class="btn btn-secondary" type="button" data-toggle-user="${esc(user.id)}" data-next-active="${user.ativo === false ? 'true' : 'false'}">${user.ativo === false ? 'Ativar' : 'Desativar'}</button>
        <button class="btn btn-secondary" type="button" data-reset-password="${esc(user.id)}" ${user.email ? '' : 'disabled'}>Recuperar senha</button>
      </div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" class="admin-empty">Nenhuma conta encontrada.</td></tr>';
}

function renderPayments() {
  financeList.innerHTML = payments.length ? payments.map(item => `
    <tr>
      <td>${formatDate(item.paid_at || item.created_at)}</td>
      <td>${esc(item.nome || item.email || item.user_id || '—')}</td>
      <td>${esc(item.plano ? normalizePlan(item.plano) : '—')}</td>
      <td>${formatMoney(item.valor || item.amount)}</td>
      <td>${esc(item.status || '—')}</td>
    </tr>`).join('') : '<tr><td colspan="5" class="admin-empty">Nenhuma movimentação financeira registrada.</td></tr>';
}

async function loadSummary() {
  const { data, error } = await supabase.rpc('fsfit_admin_resumo');
  if (error) throw error;
  applySummary(data || {});
}

async function loadUsers() {
  const { data, error } = await supabase.rpc('fsfit_admin_listar_usuarios');
  if (error) throw error;
  users = (data || []).map(user => ({ ...user, plano: normalizePlan(user.plano) }));
  renderUsers();
}

async function loadPayments() {
  const { data, error } = await supabase.rpc('fsfit_admin_listar_pagamentos');
  const sourceNote = document.querySelector('#finance-source-note');
  if (error) {
    console.warn('Relatório financeiro indisponível:', error.message);
    payments = [];
    if (sourceNote) sourceNote.textContent = 'Não foi possível carregar as cobranças PIX registradas. Atualize a página ou verifique a integração financeira.';
  } else {
    payments = data || [];
    if (sourceNote) sourceNote.textContent = 'Valores calculados a partir das cobranças PIX reais registradas e confirmadas pela integração Efí.';
  }
  updateFinanceStats();
  renderPayments();
}

async function updatePlan(userId) {
  const select = document.querySelector(`[data-plan-user="${CSS.escape(userId)}"]`);
  const plan = normalizePlan(select.value);
  if (!VALID_PLANS.includes(plan)) throw new Error('Plano inválido. Use Trial, Free ou Premium.');
  const { error } = await supabase.rpc('fsfit_admin_atualizar_plano', { p_user_id: userId, p_plano: plan });
  if (error) throw error;
  showMessage(message, plan === 'premium'
    ? 'Plano Premium aplicado ao acesso real da conta.'
    : plan === 'trial'
      ? 'Novo período Trial de 7 dias aplicado com sucesso.'
      : 'Conta alterada para o plano Free e acessos pagos/trial encerrados.');
  await Promise.all([loadUsers(), loadSummary()]);
}

async function toggleUser(userId, active) {
  const { error } = await supabase.rpc('fsfit_admin_definir_conta_ativa', { p_user_id: userId, p_ativo: active });
  if (error) throw error;
  showMessage(message, active ? 'Conta ativada com sucesso.' : 'Conta desativada. O acesso à plataforma será bloqueado.');
  await Promise.all([loadUsers(), loadSummary()]);
}

async function sendPasswordReset(userId) {
  const user = users.find(item => item.id === userId);
  if (!user?.email) throw new Error('Esta conta não possui e-mail disponível para recuperação.');
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${window.location.origin}/nova-senha.html`
  });
  if (error) throw error;
  showMessage(message, `E-mail de recuperação enviado para ${user.email}.`);
}

function exportFinanceCsv() {
  if (!payments.length) {
    showMessage(message, 'Não há movimentações financeiras para exportar.', 'error');
    return;
  }
  const rows = [['Data','Usuário','Plano','Valor','Status'], ...payments.map(item => [
    formatDate(item.paid_at || item.created_at),
    item.nome || item.email || item.user_id || '',
    item.plano ? normalizePlan(item.plano) : '',
    Number(item.valor || item.amount || 0).toFixed(2).replace('.', ','),
    item.status || ''
  ])];
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(';')).join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `fsfit-financeiro-${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

searchInput.addEventListener('input', renderUsers);
planFilter.addEventListener('change', renderUsers);
exportButton.addEventListener('click', exportFinanceCsv);

document.addEventListener('click', async event => {
  const savePlanButton = event.target.closest('[data-save-plan]');
  const toggleButton = event.target.closest('[data-toggle-user]');
  const resetButton = event.target.closest('[data-reset-password]');
  try {
    if (savePlanButton) await updatePlan(savePlanButton.dataset.savePlan);
    if (toggleButton) await toggleUser(toggleButton.dataset.toggleUser, toggleButton.dataset.nextActive === 'true');
    if (resetButton) await sendPasswordReset(resetButton.dataset.resetPassword);
  } catch (error) {
    console.error(error);
    showMessage(message, error.message || 'Não foi possível concluir a operação.', 'error');
  }
});

await requireAdmin();
await Promise.all([loadUsers(), loadPayments(), loadSummary()]);