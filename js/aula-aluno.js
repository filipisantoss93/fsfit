import { supabase } from './supabase.js';
import { ensureStudentPortalMainTabs, showStudentPortalTab } from './portal-aluno-tabs.js';

const token = localStorage.getItem('fsfit_aluno_token');
const root = document.querySelector('#student-content');
if (!token || !root) throw new Error('Sessão do aluno indisponível');

function ensureContextStyles() {
  if (document.querySelector('link[data-student-live-context]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/aluno-aula-contexto.css?v=20260725-student-live2';
  link.dataset.studentLiveContext = 'true';
  document.head.appendChild(link);
}

ensureContextStyles();

const portalTabs = ensureStudentPortalMainTabs();
const liveHost = portalTabs?.live || root;
const liveTabButton = root.querySelector('[data-student-main-tab="live"]');

let accessToken = null;
let sessionState = null;
let contextRenderScheduled = false;

const box = document.createElement('section');
box.className = 'card live-class-card';
box.innerHTML = '<div class="live-class-loading">Carregando status da aula...</div>';
liveHost.appendChild(box);

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function digits(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function formatElapsed(value) {
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

function formatToday() {
  const value = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  }).format(new Date());
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function sameLocalDay(value, reference = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === reference.getFullYear()
    && date.getMonth() === reference.getMonth()
    && date.getDate() === reference.getDate();
}

function recentCompletion() {
  const value = sessionStorage.getItem('fsfit_aluno_treino_concluido_em');
  return value && sameLocalDay(value) ? value : '';
}

function youtubeEmbedUrl(url) {
  try {
    const parsed = new URL(String(url || '').trim());
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    let id = '';
    if (host === 'youtu.be') id = parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      id = parsed.searchParams.get('v') || '';
      if (!id && parsed.pathname.startsWith('/shorts/')) id = parsed.pathname.split('/')[2] || '';
      if (!id && parsed.pathname.startsWith('/embed/')) id = parsed.pathname.split('/')[2] || '';
      if (!id && parsed.pathname.startsWith('/live/')) id = parsed.pathname.split('/')[2] || '';
    }
    return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0` : null;
  } catch {
    return null;
  }
}

function setLiveTab(label, state = 'today') {
  if (!liveTabButton) return;
  if (liveTabButton.textContent !== label) liveTabButton.textContent = label;
  liveTabButton.dataset.liveState = state;
}

function openPlanSection(target = 'inicio') {
  showStudentPortalTab('agenda');
  requestAnimationFrame(() => {
    const targetTab = root.querySelector(`[data-student-tab="${target}"]`);
    targetTab?.click();
    root.querySelector('.student-plan-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function getDaySnapshot() {
  const ready = !root.classList.contains('hidden');
  const workoutContent = document.querySelector('#workout-content');
  const dietContent = document.querySelector('#diet-content');
  const workoutRows = workoutContent?.querySelectorAll('.student-compact-row').length || 0;
  const dietRows = dietContent?.querySelectorAll('.student-compact-row').length || 0;
  const workoutHeader = workoutContent?.querySelector('.student-agenda-day-header span')?.textContent?.trim() || '';
  const dietHeader = dietContent?.querySelector('.student-agenda-day-header span')?.textContent?.trim() || '';
  const workoutName = document.querySelector('#workout-plan-name')?.textContent?.trim() || '';
  const observation = document.querySelector('#student-observations')?.textContent?.trim() || '';
  const settingsWhatsapp = document.querySelector('#whatsapp-button');
  const whatsappHref = settingsWhatsapp?.getAttribute('href') || '';

  return {
    ready,
    workoutRows,
    dietRows,
    workoutHeader,
    dietHeader,
    workoutName,
    observation: observation === 'Nenhuma observação publicada ainda.' ? '' : observation,
    whatsappHref
  };
}

function dayOverviewHtml() {
  const day = getDaySnapshot();
  const workoutTitle = day.ready
    ? (day.workoutRows ? `${day.workoutRows} ${day.workoutRows === 1 ? 'exercício' : 'exercícios'}` : 'Dia de descanso')
    : 'Carregando treino';
  const workoutDetail = day.workoutName || day.workoutHeader || 'Veja sua programação completa';
  const dietTitle = day.ready
    ? (day.dietRows ? `${day.dietRows} ${day.dietRows === 1 ? 'refeição' : 'refeições'}` : 'Sem refeições hoje')
    : 'Carregando alimentação';
  const dietDetail = day.dietHeader || 'Consulte seu plano alimentar';

  return `<section class="live-day-overview">
    <div class="live-day-overview-heading">
      <div><small>SEU DIA</small><h3>Continue sua rotina</h3></div>
      <span>${esc(formatToday())}</span>
    </div>
    <div class="live-day-grid">
      <button class="live-day-card" type="button" data-live-go="treino">
        <small>TREINO</small>
        <strong>${esc(workoutTitle)}</strong>
        <span>${esc(workoutDetail)}</span>
        <b>VER TREINO →</b>
      </button>
      <button class="live-day-card" type="button" data-live-go="dieta">
        <small>ALIMENTAÇÃO</small>
        <strong>${esc(dietTitle)}</strong>
        <span>${esc(dietDetail)}</span>
        <b>VER ALIMENTAÇÃO →</b>
      </button>
    </div>
    ${day.observation ? `<button class="live-day-guidance" type="button" data-live-go="observacoes"><small>ORIENTAÇÃO DO PERSONAL</small><p>${esc(day.observation)}</p><span>VER ORIENTAÇÕES →</span></button>` : ''}
  </section>`;
}

function optionalSessionContext(state = {}) {
  const items = [];
  const workoutName = String(state.treino_nome || '').trim();
  const scheduledAt = state.agendado_para || state.horario_agendado || state.inicio_previsto || '';
  const location = String(state.local || state.local_treino || state.modalidade || '').trim();
  const exercises = Array.isArray(state.exercicios) ? state.exercicios.length : 0;

  if (workoutName) items.push(['TREINO', workoutName]);
  if (scheduledAt) {
    const date = new Date(scheduledAt);
    const value = Number.isNaN(date.getTime())
      ? String(scheduledAt)
      : date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    items.push(['HORÁRIO', value]);
  }
  if (location) items.push(['LOCAL / MODALIDADE', location]);
  if (exercises) items.push(['PROGRAMAÇÃO', `${exercises} ${exercises === 1 ? 'exercício' : 'exercícios'}`]);

  if (!items.length) return '';
  return `<div class="live-context-grid">${items.map(([label, value]) => `<div class="live-context-item"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join('')}</div>`;
}

function personalLinkHtml() {
  const href = getDaySnapshot().whatsappHref;
  if (!href) return '';
  return `<a class="btn btn-outline live-personal-link visible" href="${esc(href)}" target="_blank" rel="noopener">Falar com meu personal</a>`;
}

function bindRenderedActions() {
  box.querySelectorAll('[data-live-go]').forEach(button => {
    button.addEventListener('click', () => openPlanSection(button.dataset.liveGo || 'inicio'));
  });
  box.querySelector('#start-live-class')?.addEventListener('click', startSession);
  box.querySelector('#cancel-live-checkin')?.addEventListener('click', cancelCheckin);
  box.querySelectorAll('[data-session-exercise]').forEach(input => input.addEventListener('change', toggleExercise));
  box.querySelectorAll('[data-live-exercise-detail]').forEach(button => button.addEventListener('click', () => openExerciseDetail(button.dataset.liveExerciseDetail)));
  box.querySelector('#finish-live-class')?.addEventListener('click', finishSession);
}

function openExerciseDetail(id) {
  const items = Array.isArray(sessionState?.exercicios) ? sessionState.exercicios : [];
  const item = items.find(row => String(row.id || '') === String(id));
  if (!item) return;

  const ex = item.exercicios || item;
  const modal = document.querySelector('#student-detail-modal');
  const title = document.querySelector('#student-detail-title');
  const body = document.querySelector('#student-detail-body');
  if (!modal || !title || !body) return;

  const embed = youtubeEmbedUrl(ex.video_url || item.video_url);
  title.textContent = ex.nome || item.nome || 'Exercício';
  body.innerHTML = `<div class="student-detail-grid">
    <div><small>Séries</small><strong>${esc(String(item.series ?? ex.series ?? '—'))}</strong></div>
    <div><small>Repetições</small><strong>${esc(item.repeticoes || ex.repeticoes || '—')}</strong></div>
    <div><small>Carga</small><strong>${esc(item.carga || ex.carga || '—')}</strong></div>
    <div><small>Descanso</small><strong>${item.descanso_segundos != null || ex.descanso_segundos != null ? `${esc(String(item.descanso_segundos ?? ex.descanso_segundos))}s` : '—'}</strong></div>
    <div><small>Grupo muscular</small><strong>${esc(ex.grupo_muscular || item.grupo_muscular || '—')}</strong></div>
  </div>
  ${(ex.equipamento || item.equipamento) ? `<div class="student-detail-block"><small>Equipamento</small><p>${esc(ex.equipamento || item.equipamento)}</p></div>` : ''}
  ${(ex.instrucoes || item.instrucoes) ? `<div class="student-detail-block"><small>Instruções</small><p>${esc(ex.instrucoes || item.instrucoes)}</p></div>` : ''}
  ${(item.observacoes || ex.observacoes) ? `<div class="student-detail-block"><small>Observações</small><p>${esc(item.observacoes || ex.observacoes)}</p></div>` : ''}
  ${embed ? `<div class="student-detail-video"><iframe src="${esc(embed)}" title="Vídeo demonstrativo" loading="lazy" allowfullscreen></iframe></div>` : ''}`;

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('student-detail-open');
}

async function rpc(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

async function resolveAccessToken() {
  accessToken = await rpc('get_aluno_portal_token', { p_session_token: token });
  if (!accessToken) throw new Error('Sessão expirada');
}

async function loadSession() {
  const data = await rpc('get_aluno_sessao_treino', { p_access_token: accessToken });
  sessionState = Array.isArray(data) ? data[0] : data;
  render();
}

async function notifyPersonalCheckin() {
  const { data, error } = await supabase.functions.invoke('chat-push', {
    body: { action: 'notify_checkin', token }
  });
  if (error) throw error;
  return data;
}

function exerciseSummary(item) {
  const parts = [];
  if (item.series) parts.push(`${item.series} séries`);
  if (item.repeticoes) parts.push(`${item.repeticoes} rep.`);
  if (item.descanso_segundos != null) parts.push(`${item.descanso_segundos}s descanso`);
  if (item.carga) parts.push(item.carga);
  return parts.join(' · ') || 'Ver detalhes';
}

function renderIdle(state = {}) {
  setLiveTab('Aula', 'today');
  const completion = recentCompletion();
  box.innerHTML = `
    ${completion ? '<div class="live-completed-banner"><strong>Treino concluído hoje</strong><span>Seu progresso foi salvo. Você pode consultar a agenda ou iniciar outra sessão quando necessário.</span></div>' : ''}
    <div class="live-class-header">
      <div><span class="live-class-date">${esc(formatToday())}</span><h2>Pronto para treinar?</h2></div>
      <span class="live-status idle">CHECK-IN PENDENTE</span>
    </div>
    <div class="live-session-state">Aguardando seu check-in</div>
    <p class="live-class-intro">Faça seu check-in. Seu personal receberá a solicitação e confirmará o início da aula.</p>
    ${optionalSessionContext(state)}
    <div class="live-class-actions ${personalLinkHtml() ? '' : 'single'}">
      <button id="start-live-class" class="btn btn-primary" type="button">Fazer check-in</button>
      ${personalLinkHtml()}
    </div>`;
  bindRenderedActions();
}

function renderWaiting(state) {
  setLiveTab('Check-in', 'waiting');
  showStudentPortalTab('live');
  const elapsed = formatElapsed(state.checkin_at);
  box.innerHTML = `
    <div class="live-class-header">
      <div><small>CHECK-IN REALIZADO</small><h2>Check-in enviado</h2></div>
      <span class="live-status pending">AGUARDANDO PERSONAL</span>
    </div>
    <div class="live-session-state pending">Aguardando confirmação do personal</div>
    <p class="live-class-intro">Seu personal recebeu a solicitação. O treino será liberado assim que ele confirmar o início da aula.</p>
    ${optionalSessionContext(state)}
    ${elapsed ? `<div class="live-class-meta"><span>Check-in feito há ${esc(elapsed)}</span><strong>Aguardando liberação</strong></div>` : ''}
    <div class="live-class-actions ${personalLinkHtml() ? '' : 'single'}">
      <button id="cancel-live-checkin" class="btn btn-outline" type="button">Cancelar check-in</button>
      ${personalLinkHtml()}
    </div>`;
  bindRenderedActions();
}

function renderCompleted(state = {}) {
  setLiveTab('Aula', 'today');
  showStudentPortalTab('agenda');
  box.innerHTML = `
    <div class="live-class-header">
      <div><small>TREINO FINALIZADO</small><h2>Treino concluído 🎉</h2></div>
      <span class="live-status complete">CONCLUÍDO</span>
    </div>
    <p class="live-class-intro">Seu progresso foi salvo. Continue acompanhando o treino, a alimentação e as orientações do seu personal.</p>
    ${optionalSessionContext(state)}
    <div class="live-class-actions ${personalLinkHtml() ? '' : 'single'}">
      <button class="btn btn-primary" type="button" data-live-go="inicio">Voltar para meu dia</button>
      ${personalLinkHtml()}
    </div>`;
  bindRenderedActions();
}

function renderActive(state) {
  setLiveTab('Em aula', 'active');
  showStudentPortalTab('live');
  const items = Array.isArray(state.exercicios) ? state.exercicios : [];
  const done = items.filter(item => item.concluido).length;
  const total = items.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const remaining = items.filter(item => !item.concluido);
  const currentId = remaining[0]?.id ? String(remaining[0].id) : '';
  const nextId = remaining[1]?.id ? String(remaining[1].id) : '';
  const completed = total > 0 && done === total;

  box.innerHTML = `
    <div class="live-class-header live-class-header-compact">
      <div>
        <small>AULA EM ANDAMENTO</small>
        <h2>${esc(state.treino_nome || 'Treino em andamento')}</h2>
        <p>Iniciado há ${esc(formatElapsed(state.iniciado_at || state.checkin_at))}</p>
      </div>
      <span class="live-status active">EM AULA</span>
    </div>
    <div class="live-session-state active">Aula em andamento com seu personal</div>
    ${optionalSessionContext(state)}
    <div class="live-progress-summary">
      <strong>${done} de ${total} concluídos</strong>
      <span>${percent}%</span>
    </div>
    <div class="live-progress" aria-label="Progresso do treino"><span style="width:${percent}%"></span></div>
    ${completed ? '<div class="live-complete-message">Todos os exercícios foram concluídos 🎉</div>' : ''}
    <div class="live-exercise-list">
      ${items.length ? items.map(item => {
        const id = String(item.id || '');
        const isCurrent = !item.concluido && id === currentId;
        const isNext = !item.concluido && id === nextId;
        const rowClass = ['live-exercise', item.concluido ? 'done' : '', isCurrent ? 'current' : '', isNext ? 'next' : ''].filter(Boolean).join(' ');
        const badge = isCurrent
          ? '<span class="live-exercise-status current">AGORA</span>'
          : isNext
            ? '<span class="live-exercise-status next">PRÓXIMO</span>'
            : '';
        return `<div class="${rowClass}">
          <input type="checkbox" aria-label="Marcar ${esc(item.nome || 'exercício')} como concluído" data-session-exercise="${esc(item.id)}" ${item.concluido ? 'checked' : ''}>
          <button class="live-exercise-detail" type="button" data-live-exercise-detail="${esc(item.id)}" aria-label="Ver detalhes de ${esc(item.nome || 'exercício')}">
            <span class="live-exercise-main">
              <span class="live-exercise-title-row"><strong>${esc(item.nome || 'Exercício')}</strong>${badge}</span>
              <small>${esc(exerciseSummary(item))}</small>
            </span>
            <span class="live-exercise-arrow" aria-hidden="true">›</span>
          </button>
        </div>`;
      }).join('') : '<p>Nenhum exercício programado para esta aula.</p>'}
    </div>
    <button id="finish-live-class" class="btn btn-secondary" type="button">Finalizar treino</button>`;

  bindRenderedActions();
}

function render() {
  const state = sessionState || {};
  if (state.status === 'finalizada' || state.status === 'concluida') {
    renderCompleted(state);
    return;
  }
  if (!state.sessao_id) {
    renderIdle(state);
    return;
  }
  if (state.status === 'aguardando_confirmacao') {
    renderWaiting(state);
    return;
  }
  renderActive(state);
}

function scheduleContextRender() {
  if (contextRenderScheduled) return;
  contextRenderScheduled = true;
  requestAnimationFrame(() => {
    contextRenderScheduled = false;
    if (!sessionState?.sessao_id || sessionState?.status === 'aguardando_confirmacao') render();
  });
}

function observeDayContext() {
  const targets = [
    root,
    document.querySelector('#workout-content'),
    document.querySelector('#diet-content'),
    document.querySelector('#workout-plan-name'),
    document.querySelector('#student-observations'),
    document.querySelector('#whatsapp-button')
  ].filter(Boolean);

  const observer = new MutationObserver(scheduleContextRender);
  targets.forEach(target => {
    const options = target === root
      ? { attributes: true, attributeFilter: ['class'] }
      : { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'class'] };
    observer.observe(target, options);
  });
}

async function startSession() {
  const button = box.querySelector('#start-live-class');
  if (button) {
    button.disabled = true;
    button.textContent = 'Enviando check-in...';
  }
  try {
    await rpc('iniciar_aluno_sessao_treino', { p_access_token: accessToken });
    try {
      await notifyPersonalCheckin();
    } catch (pushError) {
      console.warn('Check-in realizado, mas o Push do personal não pôde ser enviado:', pushError);
    }
    await loadSession();
  } catch (error) {
    console.error(error);
    alert(error.message || 'Não foi possível realizar o check-in.');
    if (button) {
      button.disabled = false;
      button.textContent = 'Fazer check-in';
    }
  }
}

async function cancelCheckin() {
  if (!confirm('Cancelar seu check-in? Você poderá fazer um novo check-in depois.')) return;
  const button = box.querySelector('#cancel-live-checkin');
  if (button) button.disabled = true;
  try {
    const cancelled = await rpc('cancelar_checkin_aluno_sessao', { p_access_token: accessToken });
    if (cancelled !== true) throw new Error('O check-in não está mais aguardando confirmação.');
    sessionState = null;
    render();
    showStudentPortalTab('agenda');
  } catch (error) {
    console.error(error);
    await loadSession().catch(console.error);
    alert(error.message || 'Não foi possível cancelar o check-in.');
  }
}

async function toggleExercise(event) {
  const input = event.currentTarget;
  input.disabled = true;
  try {
    await rpc('marcar_aluno_exercicio_sessao', {
      p_access_token: accessToken,
      p_sessao_exercicio_id: input.dataset.sessionExercise,
      p_concluido: input.checked
    });
    await loadSession();
  } catch (error) {
    console.error(error);
    input.checked = !input.checked;
    input.disabled = false;
    alert('Não foi possível atualizar o exercício.');
  }
}

async function finishSession() {
  if (!confirm('Finalizar o treino de hoje?')) return;
  const button = box.querySelector('#finish-live-class');
  if (button) {
    button.disabled = true;
    button.textContent = 'Finalizando...';
  }
  try {
    await rpc('finalizar_aluno_sessao_treino', { p_access_token: accessToken });
    sessionStorage.setItem('fsfit_aluno_treino_concluido_em', new Date().toISOString());
    sessionState = { ...sessionState, status: 'finalizada' };
    render();
  } catch (error) {
    console.error(error);
    alert('Não foi possível finalizar o treino.');
    if (button) {
      button.disabled = false;
      button.textContent = 'Finalizar treino';
    }
  }
}

try {
  observeDayContext();
  await resolveAccessToken();
  await loadSession();
  setInterval(() => {
    if (sessionState?.sessao_id && sessionState.status !== 'finalizada') loadSession().catch(console.error);
  }, 10000);
} catch (error) {
  console.error(error);
  box.remove();
}
