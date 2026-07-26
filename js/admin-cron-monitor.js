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

function ensureStyles() {
  if (document.querySelector('#admin-cron-monitor-styles')) return;
  const style = document.createElement('style');
  style.id = 'admin-cron-monitor-styles';
  style.textContent = `
    .admin-cron-monitor{margin-bottom:18px;border:1px solid var(--border)}
    .admin-cron-monitor.is-healthy{border-color:rgba(50,215,75,.3)}
    .admin-cron-monitor.is-warning{border-color:rgba(255,193,7,.45)}
    .admin-cron-monitor.is-error{border-color:rgba(255,82,82,.5)}
    .admin-cron-monitor-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
    .admin-cron-monitor-head h2{margin:3px 0 6px}
    .admin-cron-monitor-head p{margin:0;color:var(--muted)}
    .admin-cron-status{display:inline-flex;align-items:center;min-height:30px;padding:0 11px;border-radius:999px;background:var(--surface-light);font-size:.72rem;font-weight:900;white-space:nowrap}
    .admin-cron-monitor.is-healthy .admin-cron-status{background:rgba(50,215,75,.12);color:var(--primary)}
    .admin-cron-monitor.is-warning .admin-cron-status{background:rgba(255,193,7,.13);color:var(--warning)}
    .admin-cron-monitor.is-error .admin-cron-status{background:rgba(255,82,82,.13);color:#ff7676}
    .admin-automation-list{display:grid;gap:12px;margin-top:16px}
    .admin-automation-item{padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--surface-light)}
    .admin-automation-title{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}
    .admin-automation-title strong{display:block;font-size:.92rem}
    .admin-automation-title small{display:block;margin-top:3px;color:var(--muted)}
    .admin-automation-state{font-size:.7rem;font-weight:900;white-space:nowrap}
    .admin-automation-state.is-healthy{color:var(--primary)}
    .admin-automation-state.is-warning{color:var(--warning)}
    .admin-automation-state.is-error{color:#ff7676}
    .admin-cron-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
    .admin-cron-grid>div{padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--surface)}
    .admin-cron-grid small{display:block;margin-bottom:5px;color:var(--muted);font-size:.66rem;font-weight:900;letter-spacing:.04em}
    .admin-cron-grid strong{display:block;font-size:.84rem;word-break:break-word}
    .admin-cron-error{margin:10px 0 0;padding:10px 12px;border-radius:10px;background:rgba(255,82,82,.1);color:#ff9a9a;font-size:.8rem}
    .admin-cron-success{margin:12px 0 0;padding:10px 12px;border-radius:10px;background:rgba(50,215,75,.1);color:var(--primary);font-size:.8rem}
    .admin-cron-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}
    @media(max-width:760px){.admin-cron-monitor-head,.admin-automation-title{display:grid}.admin-cron-status{justify-self:start}.admin-cron-grid{grid-template-columns:1fr 1fr}.admin-cron-actions{justify-content:stretch}.admin-cron-actions .btn{width:100%}}
    @media(max-width:460px){.admin-cron-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function ensureCard() {
  if (!overviewPanel || monitorCard) return monitorCard;
  ensureStyles();
  monitorCard = document.createElement('section');
  monitorCard.className = 'card admin-section-card admin-cron-monitor';
  monitorCard.innerHTML = '<div class="admin-cron-monitor-head"><div><small>AUTOMAÇÕES OPERACIONAIS</small><h2>Rotinas financeiras</h2><p>Verificando tarefas automáticas...</p></div><span class="admin-cron-status">Carregando</span></div>';
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

function overallState(generationState, cleanupState) {
  const states = [generationState, cleanupState];
  if (states.includes('erro') || states.includes('atrasado')) return 'erro';
  if (states.includes('aguardando')) return 'aguardando';
  return 'saudavel';
}

function canRunManually(data = {}) {
  return data.estado === 'atrasado' || data.estado === 'erro';
}

function render(data = {}, feedback = '', feedbackType = 'success') {
  const card = ensureCard();
  if (!card) return;
  currentStatus = data;

  const cleanup = data.limpeza || {};
  const overall = overallState(data.estado, cleanup.estado);
  const tone = toneForState(overall);
  const generationTone = toneForState(data.estado);
  const cleanupTone = toneForState(cleanup.estado);

  card.className = `card admin-section-card admin-cron-monitor ${tone.className}`;

  const execution = data.execucao || {};
  const job = data.job || {};
  const cron = data.cron || {};
  const generationError = execution.erro || (cron.status && cron.status !== 'succeeded' ? cron.mensagem : '');

  const cleanupExecution = cleanup.execucao || {};
  const cleanupJob = cleanup.job || {};
  const cleanupCron = cleanup.cron || {};
  const cleanupError = cleanupExecution.erro || (cleanupCron.status && cleanupCron.status !== 'succeeded' ? cleanupCron.mensagem : '');

  const showManualAction = canRunManually(data);
  const feedbackClass = feedbackType === 'error' ? 'admin-cron-error' : 'admin-cron-success';
  const headline = overall === 'saudavel'
    ? 'Geração mensal e limpeza automática funcionando normalmente.'
    : 'Uma ou mais rotinas automáticas precisam de atenção.';

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
    </div>
    ${feedback ? `<p class="${feedbackClass}">${esc(feedback)}</p>` : ''}
    ${showManualAction ? `<div class="admin-cron-actions"><button class="btn btn-primary" type="button" data-run-monthly-generation ${runningManually ? 'disabled' : ''}>${runningManually ? 'Executando...' : 'Executar geração agora'}</button></div>` : ''}`;
}

async function loadCronStatus(feedback = '', feedbackType = 'success') {
  const card = ensureCard();
  if (!card) return;
  const { data, error } = await supabase.rpc('fsfit_admin_status_geracao_mensalidades');
  if (error) {
    console.error('Erro ao carregar monitoramento do cron:', error);
    render({ estado: 'erro', mensagem: 'Não foi possível consultar o monitoramento das rotinas.', execucao: { erro: error.message }, limpeza: { estado: 'erro', mensagem: 'Status indisponível.' } });
    return;
  }
  render(data || {}, feedback, feedbackType);
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