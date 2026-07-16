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
  if (plan === 'pago' || plan === 'pro') return 'premium';
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

function updateUserStats() {
  document.querySelector('#stat-accounts').textContent = users.length;
  document.querySelector('#stat-subscribers').textContent = users.filter(user => normalizePlan(user.plano) === 'premium' && user.ativo !== false).length;
  document.querySelector('#stat-trial').textContent = users.filter(user => normalizePlan(user.plano) === 'trial').length;
  document.querySelector('#stat-inactive').textContent = users.filter(user => user.ativo === false).length;
}

function updateFinanceStats() {
  const approved = payments.filter(item => ['approved', 'aprovado', 'paid', 'pago'].includes((item.status || '').toLowerCase()));
  const pending = payments.filter(item => ['pending', 'pendente', 'waiting', 'aguardando'].includes((item.status || '').toLowerCase()));
  const cancelled = payments.filter(item => ['cancelled', 'canceled', 'cancelado', 'refunded', 'estornado'].includes((item.status || '').toLowerCase()));
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

async function loadUsers() {
  const { data, error } = await supabase.rpc('fsfit_admin_listar_usuarios');
  if (error) throw error;
  users = (data || []).map(user => ({ ...user, plano: normalizePlan(user.plano) }));
  updateUserStats();
  renderUsers();
}

async function loadPayments() {
  const { data, error } = await supabase.rpc('fsfit_admin_listar_pagamentos');
  if (error) {
    console.warn('Relatório financeiro indisponível:', error.message);
    payments = [];
    document.querySelector('#finance-source-note').textContent = 'Ainda não há uma fonte financeira compatível configurada. O painel não estima faturamento; ele exibirá somente pagamentos reais registrados.';
  } else {
    payments = data || [];
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
  showMessage(message, 'Plano atualizado com sucesso.');
  await loadUsers();
}

async function toggleUser(userId, active) {
  const { error } = await supabase.rpc('fsfit_admin_definir_conta_ativa', { p_user_id: userId, p_ativo: active });
  if (error) throw error;
  showMessage(message, active ? 'Conta ativada com sucesso.' : 'Conta desativada com sucesso.');
  await loadUsers();
}

async function sendPasswordReset(userId) {
  const user = users.find(item => item.id === userId);
  if (!user?.email) throw new Error('Esta conta não possui e-mail disponível para recuperação.');
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${window.location.origin}/redefinir-senha.html`
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
await Promise.all([loadUsers(), loadPayments()]);