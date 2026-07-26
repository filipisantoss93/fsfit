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
    .admin-cron-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:16px}
    .admin-cron-grid>div{padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface-light)}
    .admin-cron-grid small{display:block;margin-bottom:5px;color:var(--muted);font-size:.68rem;font-weight:900;letter-spacing:.04em}
    .admin-cron-grid strong{display:block;font-size:.88rem;word-break:break-word}
    .admin-cron-error{margin:12px 0 0;padding:10px 12px;border-radius:10px;background:rgba(255,82,82,.1);color:#ff9a9a;font-size:.8rem}
    .admin-cron-success{margin:12px 0 0;padding:10px 12px;border-radius:10px;background:rgba(50,215,75,.1);color:var(--primary);font-size:.8rem}
    .admin-cron-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}
    @media(max-width:760px){.admin-cron-monitor-head{display:grid}.admin-cron-status{justify-self:start}.admin-cron-grid{grid-template-columns:1fr 1fr}.admin-cron-actions{justify-content:stretch}.admin-cron-actions .btn{width:100%}}
    @media(max-width:460px){.admin-cron-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function ensureCard() {
  if (!overviewPanel || monitorCard) return monitorCard;
  ensureStyles();
  monitorCard = document.createElement('section');
  monitorCard.className = 'card admin-section-card admin-cron-monitor';
  monitorCard.innerHTML = '<div class="admin-cron-monitor-head"><div><small>AUTOMAÇÃO FINANCEIRA</small><h2>Geração mensal de cobranças</h2><p>Verificando execução automática...</p></div><span class="admin-cron-status">Carregando</span></div>';
  const attentionSection = overviewPanel.querySelector('.admin-attention-section');
  overviewPanel.insertBefore(monitorCard, attentionSection || overviewPanel.firstElementChild);
  return monitorCard;
}

function toneForState(state) {
  if (state === 'saudavel') return { className: 'is-healthy', label: '✓ Operacional' };
  if (state === 'aguardando') return { className: 'is-warning', label: 'Aguardando execução' };
  if (state === 'atrasado') return { className: 'is-error', label: 'Execução atrasada' };
  return { className: 'is-error', label: 'Atenção necessária' };
}

function canRunManually(data = {}) {
  return data.estado === 'atrasado' || data.estado === 'erro';
}

function render(data = {}, feedback = '', feedbackType = 'success') {
  const card = ensureCard();
  if (!card) return;
  currentStatus = data;
  const tone = toneForState(data.estado);
  card.className = `card admin-section-card admin-cron-monitor ${tone.className}`;
  const execution = data.execucao || {};
  const job = data.job || {};
  const cron = data.cron || {};
  const error = execution.erro || (cron.status && cron.status !== 'succeeded' ? cron.mensagem : '');
  const showManualAction = canRunManually(data);
  const feedbackClass = feedbackType === 'error' ? 'admin-cron-error' : 'admin-cron-success';

  card.innerHTML = `
    <div class="admin-cron-monitor-head">
      <div><small>AUTOMAÇÃO FINANCEIRA</small><h2>Geração mensal de cobranças</h2><p>${esc(data.mensagem || 'Status indisponível.')}</p></div>
      <span class="admin-cron-status">${esc(tone.label)}</span>
    </div>
    <div class="admin-cron-grid">
      <div><small>COMPETÊNCIA</small><strong>${esc(formatCompetence(data.competencia))}</strong></div>
      <div><small>JOB</small><strong>${job.ativo ? 'Ativo · dia 1 às 03:05' : 'Inativo'}</strong></div>
      <div><small>ÚLTIMA EXECUÇÃO</small><strong>${esc(formatDateTime(execution.finalizado_em || execution.iniciado_em || cron.fim || cron.inicio))}</strong></div>
      <div><small>COBRANÇAS CRIADAS</small><strong>${Number(execution.cobrancas_criadas || 0)}</strong></div>
    </div>
    ${error ? `<p class="admin-cron-error"><strong>Detalhe:</strong> ${esc(error)}</p>` : ''}
    ${feedback ? `<p class="${feedbackClass}">${esc(feedback)}</p>` : ''}
    ${showManualAction ? `<div class="admin-cron-actions"><button class="btn btn-primary" type="button" data-run-monthly-generation ${runningManually ? 'disabled' : ''}>${runningManually ? 'Executando...' : 'Executar geração agora'}</button></div>` : ''}`;
}

async function loadCronStatus(feedback = '', feedbackType = 'success') {
  const card = ensureCard();
  if (!card) return;
  const { data, error } = await supabase.rpc('fsfit_admin_status_geracao_mensalidades');
  if (error) {
    console.error('Erro ao carregar monitoramento do cron:', error);
    render({ estado: 'erro', mensagem: 'Não foi possível consultar o monitoramento da geração mensal.', execucao: { erro: error.message } });
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