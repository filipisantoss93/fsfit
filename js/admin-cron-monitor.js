import { supabase } from './supabase.js';

const overviewPanel = document.querySelector('[data-admin-tab-panel="visao-geral"]');
let monitorCard = null;
let currentStatus = null;
let runningManually = false;

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

function formatCompetence(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function ensureCard() {
  if (!overviewPanel || monitorCard) return monitorCard;
  monitorCard = document.createElement('section');
  monitorCard.className = 'card admin-section-card admin-cron-monitor';
  monitorCard.innerHTML = '<div class="admin-cron-monitor-head"><div><small>AUTOMAÇÕES OPERACIONAIS</small><h2>Rotinas financeiras</h2><p>Verificando tarefas automáticas e integridade dos dados...</p></div><span class="admin-cron-status">Carregando</span></div>';
  const attentionSection = overviewPanel.querySelector('.admin-attention-section');
  overviewPanel.insertBefore(monitorCard, attentionSection || overviewPanel.firstElementChild);
  return monitorCard;
}

function toneForState(state) {
  if (state === 'saudavel') return { className: 'is-healthy', label: '✓ Operacional' };
  if (state === 'aguardando') return { className: 'is-warning', label: 'Aguardando' };
  if (state === 'atrasado') return { className: 'is-error', label: 'Atrasado' };
  return { className: 'is-error', label: 'Atenção' };
}

function overallState(...states) {
  if (states.includes('erro') || states.includes('atrasado')) return 'erro';
  if (states.includes('aguardando')) return 'aguardando';
  return 'saudavel';
}

function canRunManually(data = {}) {
  return data.estado === 'atrasado' || data.estado === 'erro';
}

function sumProblems(problems = {}) {
  return Object.values(problems).reduce((sum, value) => sum + Number(value || 0), 0);
}

function render(data = {}, diagnostic = {}, feedback = '', feedbackType = 'success') {
  const card = ensureCard();
  if (!card) return;
  currentStatus = data;

  const cleanup = data.limpeza || {};
  const diagnosticState = diagnostic.estado || 'erro';
  const overall = overallState(data.estado, cleanup.estado, diagnosticState);
  const tone = toneForState(overall);
  const generationTone = toneForState(data.estado);
  const cleanupTone = toneForState(cleanup.estado);
  const diagnosticTone = toneForState(diagnosticState);

  card.className = `card admin-section-card admin-cron-monitor ${tone.className}`;

  const execution = data.execucao || {};
  const job = data.job || {};
  const cron = data.cron || {};
  const generationError = execution.erro || (cron.status && cron.status !== 'succeeded' ? cron.mensagem : '');

  const cleanupExecution = cleanup.execucao || {};
  const cleanupJob = cleanup.job || {};
  const cleanupCron = cleanup.cron || {};
  const cleanupError = cleanupExecution.erro || (cleanupCron.status && cleanupCron.status !== 'succeeded' ? cleanupCron.mensagem : '');

  const problems = diagnostic.problemas || {};
  const problemCount = sumProblems(problems);
  const showManualAction = canRunManually(data);
  const feedbackClass = feedbackType === 'error' ? 'admin-cron-error' : 'admin-cron-success';
  const headline = overall === 'saudavel'
    ? 'Rotinas automáticas e dados financeiros funcionando normalmente.'
    : 'Uma ou mais verificações financeiras precisam de atenção.';

  card.innerHTML = `
    <div class="admin-cron-monitor-head">
      <div><small>AUTOMAÇÕES OPERACIONAIS</small><h2>Rotinas financeiras</h2><p>${esc(headline)}</p></div>
      <span class="admin-cron-status">${esc(tone.label)}</span>
    </div>
    <div class="admin-automation-list">
      <div class="admin-automation-item">
        <div class="admin-automation-title">
          <div><strong>Geração mensal de cobranças</strong><small>${esc(data.mensagem || 'Status indisponível.')}</small></div>
          <span class="admin-automation-state ${generationTone.className}">${esc(generationTone.label)}</span>
        </div>
        <div class="admin-cron-grid">
          <div><small>COMPETÊNCIA</small><strong>${esc(formatCompetence(data.competencia))}</strong></div>
          <div><small>JOB</small><strong>${job.ativo ? 'Ativo · dia 1 às 03:05' : 'Inativo'}</strong></div>
          <div><small>ÚLTIMA EXECUÇÃO</small><strong>${esc(formatDateTime(execution.finalizado_em || execution.iniciado_em || cron.fim || cron.inicio))}</strong></div>
          <div><small>COBRANÇAS CRIADAS</small><strong>${Number(execution.cobrancas_criadas || 0)}</strong></div>
        </div>
        ${generationError ? `<p class="admin-cron-error"><strong>Detalhe:</strong> ${esc(generationError)}</p>` : ''}
      </div>
      <div class="admin-automation-item">
        <div class="admin-automation-title">
          <div><strong>Limpeza dos históricos</strong><small>${esc(cleanup.mensagem || 'Status indisponível.')}</small></div>
          <span class="admin-automation-state ${cleanupTone.className}">${esc(cleanupTone.label)}</span>
        </div>
        <div class="admin-cron-grid">
          <div><small>JOB</small><strong>${cleanupJob.ativo ? 'Ativo · diariamente às 04:20' : 'Inativo'}</strong></div>
          <div><small>ÚLTIMA EXECUÇÃO</small><strong>${esc(formatDateTime(cleanupExecution.finalizado_em || cleanupExecution.iniciado_em || cleanupCron.fim || cleanupCron.inicio))}</strong></div>
          <div><small>LOGS DO CRON REMOVIDOS</small><strong>${Number(cleanupExecution.registros_cron_removidos || 0)}</strong></div>
          <div><small>HISTÓRICOS REMOVIDOS</small><strong>${Number(cleanupExecution.registros_financeiros_removidos || 0)}</strong></div>
        </div>
        ${cleanupError ? `<p class="admin-cron-error"><strong>Detalhe:</strong> ${esc(cleanupError)}</p>` : ''}
      </div>
      <div class="admin-automation-item">
        <div class="admin-automation-title">
          <div><strong>Integridade dos dados financeiros</strong><small>${problemCount ? `${problemCount} inconsistência${problemCount === 1 ? '' : 's'} encontrada${problemCount === 1 ? '' : 's'}.` : 'Nenhuma inconsistência encontrada nas mensalidades.'}</small></div>
          <span class="admin-automation-state ${diagnosticTone.className}">${esc(diagnosticTone.label)}</span>
        </div>
        <div class="admin-cron-grid">
          <div><small>TOTAL DE MENSALIDADES</small><strong>${Number(diagnostic.total_mensalidades || 0)}</strong></div>
          <div><small>DUPLICIDADES</small><strong>${Number(problems.duplicidades_aluno_competencia || 0)}</strong></div>
          <div><small>DADOS INVÁLIDOS</small><strong>${Number(problems.valores_invalidos || 0) + Number(problems.sem_vencimento || 0) + Number(problems.sem_competencia || 0) + Number(problems.status_invalidos || 0)}</strong></div>
          <div><small>VÍNCULOS INCONSISTENTES</small><strong>${Number(problems.sem_aluno || 0) + Number(problems.personal_divergente || 0) + Number(problems.pagos_sem_confirmacao || 0) + Number(problems.nao_pagos_com_confirmacao || 0)}</strong></div>
        </div>
        ${problemCount ? `<p class="admin-cron-error"><strong>Atenção:</strong> existem inconsistências financeiras que precisam ser investigadas.</p>` : ''}
      </div>
    </div>
    ${feedback ? `<p class="${feedbackClass}">${esc(feedback)}</p>` : ''}
    ${showManualAction ? `<div class="admin-cron-actions"><button class="btn btn-primary" type="button" data-run-monthly-generation ${runningManually ? 'disabled' : ''}>${runningManually ? 'Executando...' : 'Executar geração agora'}</button></div>` : ''}`;
}

async function loadCronStatus(feedback = '', feedbackType = 'success') {
  const card = ensureCard();
  if (!card) return;

  const [statusResult, diagnosticResult] = await Promise.all([
    supabase.rpc('fsfit_admin_status_geracao_mensalidades'),
    supabase.rpc('fsfit_admin_diagnostico_financeiro')
  ]);

  if (statusResult.error || diagnosticResult.error) {
    const error = statusResult.error || diagnosticResult.error;
    console.error('Erro ao carregar monitoramento financeiro:', error);
    render(
      { estado: 'erro', mensagem: 'Não foi possível consultar o monitoramento das rotinas.', execucao: { erro: error.message }, limpeza: { estado: 'erro', mensagem: 'Status indisponível.' } },
      { estado: 'erro', problemas: {} }
    );
    return;
  }

  render(statusResult.data || {}, diagnosticResult.data || {}, feedback, feedbackType);
}

async function runGenerationNow(button) {
  if (runningManually) return;
  const competence = formatCompetence(currentStatus?.competencia);
  const confirmed = window.confirm(`Executar agora a geração de mensalidades de ${competence}? A operação é segura e não duplicará cobranças já existentes.`);
  if (!confirmed) return;

  runningManually = true;
  button.disabled = true;
  button.textContent = 'Executando...';

  try {
    const { data, error } = await supabase.rpc('fsfit_admin_executar_geracao_mensalidades_agora');
    if (error) throw error;

    if (data?.success === false) {
      await loadCronStatus(data.erro || 'A geração foi interrompida e a falha ficou registrada.', 'error');
      return;
    }

    const created = Number(data?.cobrancas_criadas || 0);
    const message = created === 1
      ? 'Execução manual concluída. 1 cobrança foi criada.'
      : `Execução manual concluída. ${created} cobranças foram criadas.`;
    await loadCronStatus(message);
  } catch (error) {
    console.error('Erro ao executar geração manual:', error);
    await loadCronStatus(error.message || 'Não foi possível executar a geração manual.', 'error');
  } finally {
    runningManually = false;
  }
}

ensureCard()?.addEventListener('click', event => {
  const button = event.target.closest('[data-run-monthly-generation]');
  if (!button) return;
  void runGenerationNow(button);
});

await loadCronStatus();
setInterval(() => {
  if (!document.hidden && !runningManually) loadCronStatus().catch(console.warn);
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !runningManually) loadCronStatus().catch(console.warn);
});

let subscriptionHealthCard = null;

function ensureSubscriptionHealthCard() {
  if (!overviewPanel || subscriptionHealthCard) return subscriptionHealthCard;
  subscriptionHealthCard = document.createElement('section');
  subscriptionHealthCard.className = 'card admin-section-card admin-cron-monitor';
  subscriptionHealthCard.innerHTML = '<div class="admin-cron-monitor-head"><div><small>ASSINATURA FS FIT</small><h2>Integração Efí Bank</h2><p>Consultando pagamentos, reconciliação e incidentes...</p></div><span class="admin-cron-status">Carregando</span></div>';
  const attentionSection = overviewPanel.querySelector('.admin-attention-section');
  overviewPanel.insertBefore(subscriptionHealthCard, attentionSection || null);
  return subscriptionHealthCard;
}

async function loadSubscriptionHealth() {
  const card = ensureSubscriptionHealthCard();
  if (!card) return;

  const { data, error } = await supabase.rpc('fsfit_admin_diagnostico_assinatura');
  if (error) {
    console.error('Erro ao carregar saúde da assinatura:', error);
    card.className = 'card admin-section-card admin-cron-monitor is-error';
    card.innerHTML = `<div class="admin-cron-monitor-head"><div><small>ASSINATURA FS FIT</small><h2>Integração Efí Bank</h2><p>${esc(error.message || 'Diagnóstico indisponível.')}</p></div><span class="admin-cron-status">Atenção</span></div><div class="admin-cron-actions"><a class="btn btn-outline" href="admin-assinaturas.html">Abrir diagnóstico</a></div>`;
    return;
  }

  const healthy = data?.status === 'saudavel';
  const tone = healthy ? toneForState('saudavel') : toneForState('erro');
  card.className = `card admin-section-card admin-cron-monitor ${tone.className}`;
  card.innerHTML = `
    <div class="admin-cron-monitor-head">
      <div><small>ASSINATURA FS FIT</small><h2>Integração Efí Bank</h2><p>${healthy ? 'Pagamentos e reconciliações funcionando normalmente.' : 'Existem pendências na operação da assinatura.'}</p></div>
      <span class="admin-cron-status">${esc(tone.label)}</span>
    </div>
    <div class="admin-cron-grid">
      <div><small>INCIDENTES ABERTOS</small><strong>${Number(data?.incidentes_abertos || 0)}</strong></div>
      <div><small>FALHAS NA ÚLTIMA HORA</small><strong>${Number(data?.falhas_ultima_hora || 0)}</strong></div>
      <div><small>CRON PIX</small><strong>${data?.cron_pix_ativo ? 'Ativo' : 'Parado'}</strong></div>
      <div><small>CRON CARTÃO</small><strong>${data?.cron_cartao_ativo ? 'Ativo' : 'Parado'}</strong></div>
    </div>
    <div class="admin-cron-actions"><a class="btn btn-outline" href="admin-assinaturas.html">Ver diagnóstico completo</a></div>`;
}

await loadSubscriptionHealth();
setInterval(() => {
  if (!document.hidden) loadSubscriptionHealth().catch(console.warn);
}, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadSubscriptionHealth().catch(console.warn);
});