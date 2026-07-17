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
const userModal = document.querySelector('#admin-user-modal');
const userModalContent = document.querySelector('#admin-user-modal-content');
const userModalClose = document.querySelector('#admin-user-modal-close');
const usersPrev = document.querySelector('#admin-users-prev');
const usersNext = document.querySelector('#admin-users-next');
const usersPageInfo = document.querySelector('#admin-users-page-info');
const financeSearch = document.querySelector('#admin-finance-search');
const financeStatus = document.querySelector('#admin-finance-status');
const financeStart = document.querySelector('#admin-finance-start');
const financeEnd = document.querySelector('#admin-finance-end');
const financePrev = document.querySelector('#admin-finance-prev');
const financeNext = document.querySelector('#admin-finance-next');
const financePageInfo = document.querySelector('#admin-finance-page-info');
const revenueTrend = document.querySelector('#admin-revenue-trend');

const VALID_PLANS = ['trial', 'free', 'premium'];
const PLAN_LABELS = { trial: 'Trial', free: 'Free', premium: 'Premium' };
const PAGE_SIZE = 25;
let users = [];
let payments = [];
let openUserId = null;
let userPage = 1;
let userPages = 1;
let userTotal = 0;
let financePage = 1;
let financePages = 1;
let financeTotal = 0;
let userSearchTimer = null;
let financeSearchTimer = null;

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

function planLabel(value = '') {
  return PLAN_LABELS[normalizePlan(value)] || 'Free';
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatMoneyCents(value) {
  return formatMoney(Number(value || 0) / 100);
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

function formatBoolean(value, yes = 'Sim', no = 'Não') {
  if (value === null || value === undefined) return '—';
  return value ? yes : no;
}

function formatExpiry(user) {
  const plan = normalizePlan(user.plano);
  if (plan === 'free') return { date: 'Sem vencimento', detail: 'Acesso gratuito' };
  if (!user.vencimento_plano) return { date: 'Não informado', detail: plan === 'trial' ? 'Trial' : 'Premium' };
  return { date: formatDate(user.vencimento_plano), detail: plan === 'trial' ? 'Fim do trial' : 'Fim do acesso' };
}

function initials(name = '') {
  const parts = String(name || 'U').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map(part => part[0]?.toUpperCase()).join('') || 'U';
}

function safeImageUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value), window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function monthLabel(value) {
  if (!/^\d{4}-\d{2}$/.test(String(value || ''))) return value || '—';
  const date = new Date(`${value}-01T12:00:00`);
  return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
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

function applyManagementMetrics(metrics = {}) {
  document.querySelector('#metric-revenue-30').textContent = formatMoney(metrics.receita_30d);
  document.querySelector('#metric-revenue-periods').textContent = `7d: ${formatMoney(metrics.receita_7d)} · 90d: ${formatMoney(metrics.receita_90d)}`;
  document.querySelector('#metric-mrr').textContent = formatMoney(metrics.mrr);
  document.querySelector('#metric-active-subscriptions').textContent = Number(metrics.assinaturas_ativas || 0);
  document.querySelector('#metric-new-subscribers').textContent = Number(metrics.novos_assinantes_30d || 0);
  document.querySelector('#metric-cancellations').textContent = Number(metrics.cancelamentos_30d || 0);
  document.querySelector('#metric-conversion').textContent = formatPercent(metrics.conversao_trial_premium);
  document.querySelector('#metric-revenue-per-customer').textContent = `Receita média/cliente: ${formatMoney(metrics.receita_media_cliente)}`;
  renderRevenueTrend(metrics.tendencia_mensal || []);
}

function renderRevenueTrend(items) {
  if (!Array.isArray(items) || !items.length) {
    revenueTrend.innerHTML = '<p class="admin-empty">Ainda não há dados financeiros suficientes para exibir a evolução.</p>';
    return;
  }
  const max = Math.max(...items.map(item => Number(item.valor || 0)), 1);
  revenueTrend.innerHTML = items.map(item => {
    const value = Number(item.valor || 0);
    const height = value > 0 ? Math.max(8, Math.round((value / max) * 100)) : 2;
    return `<div class="admin-trend-item" title="${esc(monthLabel(item.mes))}: ${esc(formatMoney(value))}">
      <strong>${esc(formatMoney(value))}</strong>
      <div class="admin-trend-track"><div class="admin-trend-bar" style="height:${height}%"></div></div>
      <span>${esc(monthLabel(item.mes))}</span>
    </div>`;
  }).join('');
}

function renderUsers() {
  usersList.innerHTML = users.length ? users.map(user => {
    const currentPlan = normalizePlan(user.plano);
    const expiry = formatExpiry(user);
    return `
    <tr>
      <td><div class="admin-user-meta"><strong>${esc(user.nome || 'Usuário')}</strong><small>${esc(user.email || 'E-mail não disponível')}</small>${user.nome_empresa ? `<small>${esc(user.nome_empresa)}</small>` : ''}</div></td>
      <td><span class="admin-badge ${currentPlan}">${esc(planLabel(currentPlan))}</span></td>
      <td><div class="admin-expiry"><strong>${esc(expiry.date)}</strong><small>${esc(expiry.detail)}</small></div></td>
      <td><span class="admin-badge ${user.ativo === false ? 'inactive' : 'active'}">${user.ativo === false ? 'Inativa' : 'Ativa'}</span></td>
      <td><div class="admin-actions">
        <button class="btn btn-outline" type="button" data-open-user="${esc(user.id)}">Detalhes</button>
        <button class="btn btn-secondary" type="button" data-open-plan="${esc(user.id)}">Alterar plano</button>
        <button class="btn btn-secondary" type="button" data-toggle-user="${esc(user.id)}" data-next-active="${user.ativo === false ? 'true' : 'false'}">${user.ativo === false ? 'Ativar' : 'Desativar'}</button>
        <button class="btn btn-secondary" type="button" data-reset-password="${esc(user.id)}" ${user.email ? '' : 'disabled'}>Recuperar senha</button>
      </div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" class="admin-empty">Nenhuma conta encontrada.</td></tr>';

  usersPageInfo.textContent = `Página ${userPage} de ${userPages} · ${userTotal} ${userTotal === 1 ? 'usuário' : 'usuários'}`;
  usersPrev.disabled = userPage <= 1;
  usersNext.disabled = userPage >= userPages;
}

function renderPayments() {
  financeList.innerHTML = payments.length ? payments.map(item => `
    <tr>
      <td>${formatDate(item.paid_at || item.created_at)}</td>
      <td><div class="admin-user-meta"><strong>${esc(item.nome || 'Usuário')}</strong><small>${esc(item.email || item.user_id || '—')}</small></div></td>
      <td>${esc(item.plano ? planLabel(item.plano) : '—')}</td>
      <td>${formatMoney(item.valor)}</td>
      <td><span class="admin-badge">${esc(item.status || '—')}</span></td>
      <td><div class="admin-user-meta"><strong>${esc(item.txid || '—')}</strong>${item.e2e_id ? `<small>E2E: ${esc(item.e2e_id)}</small>` : ''}</div></td>
    </tr>`).join('') : '<tr><td colspan="6" class="admin-empty">Nenhuma movimentação financeira encontrada.</td></tr>';

  financePageInfo.textContent = `Página ${financePage} de ${financePages} · ${financeTotal} ${financeTotal === 1 ? 'movimentação' : 'movimentações'}`;
  financePrev.disabled = financePage <= 1;
  financeNext.disabled = financePage >= financePages;
}

function detailItem(label, value) {
  return `<div class="admin-detail-item"><span>${esc(label)}</span><strong>${esc(value ?? '—')}</strong></div>`;
}

function closeUserModal() {
  openUserId = null;
  userModal.classList.add('hidden');
  document.body.classList.remove('admin-modal-open');
  userModalContent.innerHTML = '';
}

function openUserModal(userId, { focusPlan = false } = {}) {
  const user = users.find(item => item.id === userId);
  if (!user) throw new Error('Usuário não encontrado nesta página.');
  openUserId = userId;
  const currentPlan = normalizePlan(user.plano);
  const expiry = formatExpiry(user);
  const avatarUrl = safeImageUrl(user.avatar_url);
  const avatar = avatarUrl
    ? `<img class="admin-user-avatar" src="${esc(avatarUrl)}" alt="Foto de ${esc(user.nome || 'usuário')}">`
    : `<div class="admin-user-avatar admin-user-avatar-placeholder" aria-hidden="true">${esc(initials(user.nome))}</div>`;

  userModalContent.innerHTML = `
    <div class="admin-user-hero">
      ${avatar}
      <div class="admin-user-hero-copy">
        <h3>${esc(user.nome || 'Usuário')}</h3>
        <p>${esc(user.email || 'E-mail não disponível')}</p>
        <div class="admin-user-hero-badges">
          <span class="admin-badge ${currentPlan}">${esc(planLabel(currentPlan))}</span>
          <span class="admin-badge ${user.ativo === false ? 'inactive' : 'active'}">${user.ativo === false ? 'Conta inativa' : 'Conta ativa'}</span>
        </div>
      </div>
    </div>

    <div class="admin-detail-grid">
      <section class="admin-detail-section">
        <small>CADASTRO</small><h3>Informações do usuário</h3>
        <div class="admin-detail-list">
          ${detailItem('ID', user.id)}
          ${detailItem('Nome', user.nome || '—')}
          ${detailItem('E-mail', user.email || '—')}
          ${detailItem('Telefone', user.telefone || '—')}
          ${detailItem('Empresa / local', user.nome_empresa || '—')}
          ${detailItem('Cadastro em', formatDateTime(user.created_at))}
          ${detailItem('Última atualização', formatDateTime(user.updated_at))}
        </div>
      </section>

      <section class="admin-detail-section">
        <small>ACESSO</small><h3>Plano e vencimento</h3>
        <div class="admin-detail-list">
          ${detailItem('Plano atual', planLabel(currentPlan))}
          ${detailItem('Vencimento', expiry.date)}
          ${detailItem('Início do trial', formatDateTime(user.trial_inicio))}
          ${detailItem('Fim do trial', formatDateTime(user.trial_fim))}
          ${detailItem('Conta ativa', user.ativo === false ? 'Não' : 'Sim')}
        </div>
      </section>

      <section class="admin-detail-section">
        <small>ASSINATURA</small><h3>Dados da assinatura</h3>
        <div class="admin-detail-list">
          ${detailItem('Plano contratado', user.assinatura_plano_nome || '—')}
          ${detailItem('Código do plano', user.assinatura_plano_codigo || '—')}
          ${detailItem('Status', user.assinatura_status || '—')}
          ${detailItem('Periodicidade', user.periodicidade_meses ? `${user.periodicidade_meses} ${Number(user.periodicidade_meses) === 1 ? 'mês' : 'meses'}` : '—')}
          ${detailItem('Acesso válido até', formatDateTime(user.acesso_valido_ate))}
          ${detailItem('Próxima cobrança', formatDateTime(user.proxima_cobranca_em))}
          ${detailItem('Preço contratado', user.preco_contratado_centavos !== null && user.preco_contratado_centavos !== undefined ? formatMoneyCents(user.preco_contratado_centavos) : '—')}
          ${detailItem('Meio de pagamento', user.meio_pagamento || '—')}
          ${detailItem('Renovação automática', formatBoolean(user.renovacao_automatica))}
          ${detailItem('Última cobrança', user.ultima_cobranca_status || '—')}
        </div>
      </section>

      <section class="admin-detail-section">
        <small>FINANCEIRO</small><h3>Último pagamento PIX</h3>
        <div class="admin-detail-list">
          ${detailItem('Status', user.ultimo_pagamento_status || '—')}
          ${detailItem('Pago em', formatDateTime(user.ultimo_pagamento_em))}
          ${detailItem('Valor', user.ultimo_pagamento_valor_centavos !== null && user.ultimo_pagamento_valor_centavos !== undefined ? formatMoneyCents(user.ultimo_pagamento_valor_centavos) : '—')}
          ${detailItem('TXID', user.ultimo_pagamento_txid || '—')}
        </div>
      </section>

      <section class="admin-detail-section full">
        <small>ADMINISTRAÇÃO</small><h3>Alterar plano</h3>
        <div class="admin-modal-plan-row">
          <div class="form-group">
            <label for="admin-modal-plan-select">Plano</label>
            <select id="admin-modal-plan-select" data-plan-user="${esc(user.id)}">
              ${VALID_PLANS.map(planName => `<option value="${planName}" ${currentPlan === planName ? 'selected' : ''}>${PLAN_LABELS[planName]}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-primary" type="button" data-save-plan="${esc(user.id)}">Salvar plano</button>
        </div>
        <div class="admin-modal-actions">
          <button class="btn btn-secondary" type="button" data-toggle-user="${esc(user.id)}" data-next-active="${user.ativo === false ? 'true' : 'false'}">${user.ativo === false ? 'Ativar conta' : 'Desativar conta'}</button>
          <button class="btn btn-outline" type="button" data-reset-password="${esc(user.id)}" ${user.email ? '' : 'disabled'}>Enviar recuperação de senha</button>
        </div>
      </section>
    </div>`;

  userModal.classList.remove('hidden');
  document.body.classList.add('admin-modal-open');
  if (focusPlan) setTimeout(() => userModalContent.querySelector('#admin-modal-plan-select')?.focus(), 0);
}

async function loadSummary() {
  const { data, error } = await supabase.rpc('fsfit_admin_resumo');
  if (error) throw error;
  applySummary(data || {});
}

async function loadManagementMetrics() {
  const { data, error } = await supabase.rpc('fsfit_admin_metricas_gestao');
  if (error) throw error;
  applyManagementMetrics(data || {});
}

async function loadUsers() {
  const { data, error } = await supabase.rpc('fsfit_admin_listar_usuarios_paginado', {
    p_busca: searchInput.value.trim() || null,
    p_plano: planFilter.value || null,
    p_pagina: userPage,
    p_limite: PAGE_SIZE
  });
  if (error) throw error;
  const result = data || {};
  users = Array.isArray(result.itens) ? result.itens.map(user => ({ ...user, plano: normalizePlan(user.plano) })) : [];
  userPage = Number(result.pagina || 1);
  userPages = Number(result.paginas || 1);
  userTotal = Number(result.total || 0);
  renderUsers();
  if (openUserId) {
    if (users.some(user => user.id === openUserId)) openUserModal(openUserId);
    else closeUserModal();
  }
}

async function loadPayments() {
  const sourceNote = document.querySelector('#finance-source-note');
  const { data, error } = await supabase.rpc('fsfit_admin_listar_pagamentos_paginado', {
    p_busca: financeSearch.value.trim() || null,
    p_status: financeStatus.value || null,
    p_data_inicio: financeStart.value || null,
    p_data_fim: financeEnd.value || null,
    p_pagina: financePage,
    p_limite: PAGE_SIZE
  });
  if (error) {
    console.warn('Relatório financeiro indisponível:', error.message);
    payments = [];
    financePage = 1;
    financePages = 1;
    financeTotal = 0;
    renderPayments();
    if (sourceNote) sourceNote.textContent = 'Não foi possível carregar as cobranças PIX registradas. Atualize a página ou verifique a integração financeira.';
    return;
  }
  const result = data || {};
  payments = Array.isArray(result.itens) ? result.itens : [];
  financePage = Number(result.pagina || 1);
  financePages = Number(result.paginas || 1);
  financeTotal = Number(result.total || 0);
  if (sourceNote) sourceNote.textContent = 'Valores calculados a partir das cobranças PIX reais registradas e confirmadas pela integração Efí.';
  renderPayments();
}

async function updatePlan(userId) {
  const select = document.querySelector(`[data-plan-user="${CSS.escape(userId)}"]`);
  if (!select) throw new Error('Seletor de plano não encontrado.');
  const plan = normalizePlan(select.value);
  if (!VALID_PLANS.includes(plan)) throw new Error('Plano inválido. Use Trial, Free ou Premium.');
  const user = users.find(item => item.id === userId);
  if (!window.confirm(`Alterar o plano de ${user?.nome || 'este usuário'} para ${planLabel(plan)}?`)) return;
  const { error } = await supabase.rpc('fsfit_admin_atualizar_plano', { p_user_id: userId, p_plano: plan });
  if (error) throw error;
  showMessage(message, plan === 'premium'
    ? 'Plano Premium aplicado ao acesso real da conta.'
    : plan === 'trial'
      ? 'Novo período Trial de 7 dias aplicado com sucesso.'
      : 'Conta alterada para o plano Free e acessos pagos/trial encerrados.');
  await Promise.all([loadUsers(), loadSummary(), loadManagementMetrics()]);
}

async function toggleUser(userId, active) {
  const user = users.find(item => item.id === userId);
  const action = active ? 'ativar' : 'desativar';
  if (!window.confirm(`Deseja ${action} a conta de ${user?.nome || 'este usuário'}?`)) return;
  const { error } = await supabase.rpc('fsfit_admin_definir_conta_ativa', { p_user_id: userId, p_ativo: active });
  if (error) throw error;
  showMessage(message, active ? 'Conta ativada com sucesso.' : 'Conta desativada. O acesso à plataforma será bloqueado.');
  await Promise.all([loadUsers(), loadSummary(), loadManagementMetrics()]);
}

async function sendPasswordReset(userId) {
  const user = users.find(item => item.id === userId);
  if (!user?.email) throw new Error('Esta conta não possui e-mail disponível para recuperação.');
  if (!window.confirm(`Enviar um e-mail de recuperação de senha para ${user.email}?`)) return;
  const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${window.location.origin}/nova-senha.html`
  });
  if (error) throw error;
  const { error: auditError } = await supabase.rpc('fsfit_admin_registrar_recuperacao_senha', { p_user_id: userId });
  if (auditError) console.warn('Não foi possível registrar a recuperação de senha na auditoria:', auditError.message);
  showMessage(message, `E-mail de recuperação enviado para ${user.email}.`);
}

async function exportFinanceCsv() {
  const originalText = exportButton.textContent;
  exportButton.disabled = true;
  exportButton.textContent = 'Gerando CSV...';
  try {
    const { data, error } = await supabase.rpc('fsfit_admin_exportar_pagamentos', {
      p_busca: financeSearch.value.trim() || null,
      p_status: financeStatus.value || null,
      p_data_inicio: financeStart.value || null,
      p_data_fim: financeEnd.value || null
    });
    if (error) throw error;
    const rowsData = Array.isArray(data) ? data : [];
    if (!rowsData.length) {
      showMessage(message, 'Não há movimentações financeiras para exportar com os filtros atuais.', 'error');
      return;
    }
    const rows = [['Data','Usuário','E-mail','Plano','Valor','Status','TXID','E2E','Vencimento da cobrança'], ...rowsData.map(item => [
      formatDateTime(item.data),
      item.nome || '',
      item.email || '',
      item.plano ? planLabel(item.plano) : '',
      Number(item.valor || 0).toFixed(2).replace('.', ','),
      item.status || '',
      item.txid || '',
      item.e2e_id || '',
      formatDateTime(item.vence_em)
    ])];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(';')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fsfit-financeiro-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error(error);
    showMessage(message, error.message || 'Não foi possível exportar o relatório financeiro.', 'error');
  } finally {
    exportButton.disabled = false;
    exportButton.textContent = originalText;
  }
}

function scheduleUserSearch() {
  clearTimeout(userSearchTimer);
  userSearchTimer = setTimeout(async () => {
    userPage = 1;
    try {
      await loadUsers();
    } catch (error) {
      console.error(error);
      showMessage(message, 'Não foi possível filtrar os usuários.', 'error');
    }
  }, 280);
}

function scheduleFinanceSearch() {
  clearTimeout(financeSearchTimer);
  financeSearchTimer = setTimeout(async () => {
    financePage = 1;
    try {
      await loadPayments();
    } catch (error) {
      console.error(error);
      showMessage(message, 'Não foi possível filtrar as movimentações financeiras.', 'error');
    }
  }, 280);
}

searchInput.addEventListener('input', scheduleUserSearch);
planFilter.addEventListener('change', async () => {
  userPage = 1;
  try { await loadUsers(); } catch (error) { console.error(error); showMessage(message, 'Não foi possível filtrar os usuários.', 'error'); }
});
exportButton.addEventListener('click', exportFinanceCsv);
userModalClose.addEventListener('click', closeUserModal);
userModal.addEventListener('click', event => { if (event.target === userModal) closeUserModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !userModal.classList.contains('hidden')) closeUserModal(); });

usersPrev.addEventListener('click', async () => {
  if (userPage <= 1) return;
  userPage -= 1;
  try { await loadUsers(); } catch (error) { console.error(error); showMessage(message, 'Não foi possível carregar a página anterior.', 'error'); }
});
usersNext.addEventListener('click', async () => {
  if (userPage >= userPages) return;
  userPage += 1;
  try { await loadUsers(); } catch (error) { console.error(error); showMessage(message, 'Não foi possível carregar a próxima página.', 'error'); }
});

financeSearch.addEventListener('input', scheduleFinanceSearch);
financeStatus.addEventListener('change', scheduleFinanceSearch);
financeStart.addEventListener('change', scheduleFinanceSearch);
financeEnd.addEventListener('change', scheduleFinanceSearch);
financePrev.addEventListener('click', async () => {
  if (financePage <= 1) return;
  financePage -= 1;
  try { await loadPayments(); } catch (error) { console.error(error); showMessage(message, 'Não foi possível carregar a página anterior.', 'error'); }
});
financeNext.addEventListener('click', async () => {
  if (financePage >= financePages) return;
  financePage += 1;
  try { await loadPayments(); } catch (error) { console.error(error); showMessage(message, 'Não foi possível carregar a próxima página.', 'error'); }
});

document.addEventListener('click', async event => {
  const openButton = event.target.closest('[data-open-user]');
  const openPlanButton = event.target.closest('[data-open-plan]');
  const savePlanButton = event.target.closest('[data-save-plan]');
  const toggleButton = event.target.closest('[data-toggle-user]');
  const resetButton = event.target.closest('[data-reset-password]');
  try {
    if (openButton) return openUserModal(openButton.dataset.openUser);
    if (openPlanButton) return openUserModal(openPlanButton.dataset.openPlan, { focusPlan: true });
    if (savePlanButton) await updatePlan(savePlanButton.dataset.savePlan);
    if (toggleButton) await toggleUser(toggleButton.dataset.toggleUser, toggleButton.dataset.nextActive === 'true');
    if (resetButton) await sendPasswordReset(resetButton.dataset.resetPassword);
  } catch (error) {
    console.error(error);
    showMessage(message, error.message || 'Não foi possível concluir a operação.', 'error');
  }
});

await requireAdmin();
await Promise.all([loadUsers(), loadPayments(), loadSummary(), loadManagementMetrics()]);
