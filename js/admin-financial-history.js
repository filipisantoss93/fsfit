import { supabase } from './supabase.js';

const panel = document.querySelector('[data-admin-tab-panel="historico-financeiro"]');
const timeline = document.querySelector('#admin-financial-history-list');
const message = document.querySelector('#admin-financial-history-message');
const pageInfo = document.querySelector('#admin-financial-history-page-info');
const prevButton = document.querySelector('#admin-financial-history-prev');
const nextButton = document.querySelector('#admin-financial-history-next');
const searchInput = document.querySelector('#admin-financial-history-search');
const startInput = document.querySelector('#admin-financial-history-start');
const endInput = document.querySelector('#admin-financial-history-end');
const studentSelect = document.querySelector('#admin-financial-history-student');
const trainerSelect = document.querySelector('#admin-financial-history-trainer');
const actionSelect = document.querySelector('#admin-financial-history-action');
const actorSelect = document.querySelector('#admin-financial-history-actor');
const exportCsvButton = document.querySelector('#admin-financial-history-csv');
const exportPdfButton = document.querySelector('#admin-financial-history-pdf');

const PAGE_SIZE = 20;
const EXPORT_LIMIT = 100;
let page = 1;
let pages = 1;
let total = 0;
let latestEvents = [];
let searchTimer = null;
let loaded = false;

const actionLabels = {
  criacao: 'Criação',
  alteracao: 'Alteração',
  pagamento_informado: 'Pagamento informado',
  pagamento_confirmado: 'Pagamento confirmado',
  cancelamento: 'Cancelamento'
};

function escapeHtml(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

function formatCompetence(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function formatMoney(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—';
}

function normalizeValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function changedFields(before = {}, after = {}) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter(key => normalizeValue(before?.[key]) !== normalizeValue(after?.[key]));
}

function changedJson(source = {}, changed = []) {
  const result = {};
  changed.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(source || {}, key)) result[key] = source[key];
  });
  return result;
}

function actionLabel(action) {
  return actionLabels[action] || String(action || 'Alteração').replaceAll('_', ' ');
}

function transition(label, before, after, formatter = value => value || '—') {
  const oldValue = formatter(before);
  const newValue = formatter(after);
  if (oldValue === newValue) return '';
  return `<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(oldValue)} <span aria-hidden="true">→</span> ${escapeHtml(newValue)}</strong></div>`;
}

function renderEvent(event) {
  const before = event.antes || {};
  const after = event.depois || {};
  const changed = changedFields(before, after);
  const beforeChanged = changedJson(before, changed);
  const afterChanged = changedJson(after, changed);
  const actor = event.ator_nome || event.ator_email || event.ator_id || 'Sistema';

  return `
    <article class="admin-financial-history-event">
      <span class="admin-financial-history-dot" aria-hidden="true"></span>
      <details>
        <summary>
          <div class="admin-financial-history-summary-main">
            <span class="admin-financial-history-action">${escapeHtml(actionLabel(event.acao))}</span>
            <strong>${escapeHtml(event.aluno_nome || 'Aluno não identificado')}</strong>
            <small>${escapeHtml(formatDateTime(event.ocorrido_em))}</small>
          </div>
          <div class="admin-financial-history-summary-meta">
            <span>${escapeHtml(event.personal_nome || 'Personal não identificado')}</span>
            <span>${escapeHtml(actor)}</span>
            <span>${escapeHtml(formatCompetence(event.competencia))}</span>
          </div>
          <span class="btn btn-outline admin-financial-history-detail">Ver detalhes</span>
        </summary>
        <div class="admin-financial-history-expanded">
          <div class="admin-financial-history-transitions">
            ${transition('Status', before.status, after.status)}
            ${transition('Valor', before.valor, after.valor, formatMoney)}
            ${transition('Vencimento', before.data_vencimento, after.data_vencimento, formatDate)}
          </div>
          <div class="admin-financial-history-json-grid">
            <section><small>JSON ANTERIOR · CAMPOS ALTERADOS</small><pre>${escapeHtml(JSON.stringify(beforeChanged, null, 2))}</pre></section>
            <section><small>JSON POSTERIOR · CAMPOS ALTERADOS</small><pre>${escapeHtml(JSON.stringify(afterChanged, null, 2))}</pre></section>
          </div>
        </div>
      </details>
    </article>`;
}

function render(events = []) {
  latestEvents = events;
  if (!timeline) return;
  timeline.innerHTML = events.length
    ? events.map(renderEvent).join('')
    : '<div class="admin-financial-history-empty">Nenhum evento encontrado com os filtros atuais.</div>';
  if (pageInfo) pageInfo.textContent = `Página ${page} de ${pages} · ${total} registro${total === 1 ? '' : 's'}`;
  if (prevButton) prevButton.disabled = page <= 1;
  if (nextButton) nextButton.disabled = page >= pages;
}

function setMessage(text = '', type = '') {
  if (!message) return;
  message.textContent = text;
  message.className = `message${text ? ` show ${type || 'error'}` : ''}`;
}

function params(limit = PAGE_SIZE, requestedPage = page) {
  return {
    p_limite: limit,
    p_pagina: requestedPage,
    p_inicio: startInput?.value || null,
    p_fim: endInput?.value || null,
    p_aluno: studentSelect?.value || null,
    p_personal: trainerSelect?.value || null,
    p_acao: actionSelect?.value || null,
    p_ator: actorSelect?.value || null,
    p_busca: searchInput?.value.trim() || null
  };
}

async function fetchHistory(limit = PAGE_SIZE, requestedPage = page) {
  const { data, error } = await supabase.rpc('fsfit_admin_historico_financeiro', params(limit, requestedPage));
  if (error) throw error;
  return data || {};
}

function fillSelect(select, entries, placeholder) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>${entries
    .map(([id, label]) => `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`)
    .join('')}`;
  if ([...select.options].some(option => option.value === current)) select.value = current;
}

function buildFilterOptions(events = []) {
  const students = new Map();
  const trainers = new Map();
  const actors = new Map();
  events.forEach(event => {
    if (event.aluno_id) students.set(event.aluno_id, event.aluno_nome || event.aluno_id);
    if (event.personal_id) trainers.set(event.personal_id, event.personal_nome || event.personal_id);
    if (event.ator_id) actors.set(event.ator_id, event.ator_nome || event.ator_email || event.ator_id);
  });
  const sortEntries = map => [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  fillSelect(studentSelect, sortEntries(students), 'Todos os alunos');
  fillSelect(trainerSelect, sortEntries(trainers), 'Todos os personais');
  fillSelect(actorSelect, sortEntries(actors), 'Todos os usuários');
}

async function load(resetPage = false) {
  if (!panel || !timeline) return;
  if (resetPage) page = 1;
  timeline.innerHTML = '<div class="admin-financial-history-empty">Carregando histórico...</div>';
  setMessage('');
  try {
    const data = await fetchHistory();
    total = Number(data.total || 0);
    pages = Math.max(Number(data.paginas || 1), 1);
    page = Math.min(Number(data.pagina || page), pages);
    render(data.eventos || []);
    loaded = true;
  } catch (error) {
    console.error('Erro ao carregar histórico financeiro:', error);
    timeline.innerHTML = '<div class="admin-financial-history-empty">Não foi possível carregar o histórico.</div>';
    setMessage(error.message || 'Falha ao consultar o histórico financeiro.', 'error');
  }
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportCsv() {
  exportCsvButton.disabled = true;
  try {
    const data = await fetchHistory(EXPORT_LIMIT, 1);
    const rows = data.eventos || [];
    const header = ['Data/hora', 'Ação', 'Aluno', 'Personal', 'Usuário', 'Competência', 'Status anterior', 'Novo status', 'Valor anterior', 'Novo valor', 'Vencimento anterior', 'Novo vencimento'];
    const lines = rows.map(event => {
      const before = event.antes || {};
      const after = event.depois || {};
      return [formatDateTime(event.ocorrido_em), actionLabel(event.acao), event.aluno_nome, event.personal_nome, event.ator_nome || event.ator_email || event.ator_id || 'Sistema', formatCompetence(event.competencia), before.status, after.status, before.valor, after.valor, before.data_vencimento, after.data_vencimento].map(csvCell).join(';');
    });
    download(`historico-financeiro-${new Date().toISOString().slice(0, 10)}.csv`, `\uFEFF${header.map(csvCell).join(';')}\n${lines.join('\n')}`, 'text/csv;charset=utf-8');
  } catch (error) {
    setMessage(error.message || 'Não foi possível exportar o CSV.', 'error');
  } finally {
    exportCsvButton.disabled = false;
  }
}

async function exportPdf() {
  exportPdfButton.disabled = true;
  try {
    const data = await fetchHistory(EXPORT_LIMIT, 1);
    const rows = data.eventos || [];
    const report = window.open('', '_blank', 'noopener,noreferrer');
    if (!report) throw new Error('Permita pop-ups para gerar o PDF.');
    report.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Histórico Financeiro — FS Fit</title><style>body{font-family:Arial,sans-serif;color:#111;padding:28px}h1{margin:0 0 6px}p{color:#555}.event{padding:14px 0;border-bottom:1px solid #ddd}.event h2{font-size:16px;margin:0 0 6px}.meta{font-size:12px;color:#555}.changes{margin-top:8px;font-size:13px}@media print{button{display:none}}</style></head><body><h1>Histórico Financeiro</h1><p>FS Fit · ${escapeHtml(formatDateTime(new Date()))} · ${Number(data.total || rows.length)} registros encontrados</p>${rows.map(event => { const before = event.antes || {}; const after = event.depois || {}; return `<div class="event"><h2>${escapeHtml(actionLabel(event.acao))} · ${escapeHtml(event.aluno_nome || 'Aluno não identificado')}</h2><div class="meta">${escapeHtml(formatDateTime(event.ocorrido_em))} · Personal: ${escapeHtml(event.personal_nome || '—')} · Usuário: ${escapeHtml(event.ator_nome || event.ator_email || event.ator_id || 'Sistema')} · Competência: ${escapeHtml(formatCompetence(event.competencia))}</div><div class="changes">Status: ${escapeHtml(before.status || '—')} → ${escapeHtml(after.status || '—')} · Valor: ${escapeHtml(formatMoney(before.valor))} → ${escapeHtml(formatMoney(after.valor))} · Vencimento: ${escapeHtml(formatDate(before.data_vencimento))} → ${escapeHtml(formatDate(after.data_vencimento))}</div></div>`; }).join('')}<script>window.onload=()=>window.print()<\/script></body></html>`);
    report.document.close();
  } catch (error) {
    setMessage(error.message || 'Não foi possível gerar o PDF.', 'error');
  } finally {
    exportPdfButton.disabled = false;
  }
}

[studentSelect, trainerSelect, actionSelect, actorSelect, startInput, endInput].forEach(control => {
  control?.addEventListener('change', () => load(true));
});

searchInput?.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => load(true), 350);
});

prevButton?.addEventListener('click', () => {
  if (page <= 1) return;
  page -= 1;
  load();
});

nextButton?.addEventListener('click', () => {
  if (page >= pages) return;
  page += 1;
  load();
});

exportCsvButton?.addEventListener('click', exportCsv);
exportPdfButton?.addEventListener('click', exportPdf);

window.addEventListener('fsfit:admin-tab-change', async event => {
  if (event.detail?.tab !== 'historico-financeiro') return;
  if (!loaded) {
    try {
      const optionsData = await fetchHistory(EXPORT_LIMIT, 1);
      buildFilterOptions(optionsData.eventos || []);
    } catch (error) {
      console.error('Erro ao preparar filtros do histórico:', error);
    }
    load();
  }
});

if (!panel?.hidden) {
  fetchHistory(EXPORT_LIMIT, 1)
    .then(data => buildFilterOptions(data.eventos || []))
    .finally(() => load());
}
