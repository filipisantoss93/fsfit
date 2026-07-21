import { supabase } from './supabase.js';
import { ensureStudentPortalMainTabs } from './portal-aluno-tabs.js';

const token = localStorage.getItem('fsfit_aluno_token');
const root = document.querySelector('#student-content');
if (!token || !root) throw new Error('Sessão do aluno indisponível');

const portalTabs = ensureStudentPortalMainTabs();
const liveHost = portalTabs?.live || root;

let accessToken = null;
let sessionState = null;

const box = document.createElement('section');
box.className = 'card live-class-card';
box.innerHTML = '<div class="live-class-loading">Carregando status da aula...</div>';
liveHost.appendChild(box);

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function formatElapsed(value) {
  if (!value) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
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

function render() {
  const state = sessionState;
  if (!state?.sessao_id) {
    box.innerHTML = `
      <div class="live-class-header"><div><small>TREINO DE HOJE</small><h2>Pronto para treinar?</h2></div><span class="live-status idle">AGUARDANDO</span></div>
      <p>Faça seu check-in. Seu personal receberá a solicitação e confirmará o início da aula.</p>
      <button id="start-live-class" class="btn btn-primary" type="button">Fazer check-in</button>`;
    box.querySelector('#start-live-class')?.addEventListener('click', startSession);
    return;
  }

  if (state.status === 'aguardando_confirmacao') {
    box.innerHTML = `
      <div class="live-class-header"><div><small>CHECK-IN REALIZADO</small><h2>Aguardando seu personal</h2></div><span class="live-status idle">AGUARDANDO CONFIRMAÇÃO</span></div>
      <p>Seu check-in foi enviado. O treino será liberado assim que o personal confirmar o início da aula.</p>
      <div class="live-class-meta"><span>Check-in feito há ${esc(formatElapsed(state.checkin_at))}</span><strong>Aguardando liberação</strong></div>
      <div class="actions"><button id="cancel-live-checkin" class="btn btn-outline" type="button">Cancelar check-in</button></div>`;
    box.querySelector('#cancel-live-checkin')?.addEventListener('click', cancelCheckin);
    return;
  }

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
        <small>EM AULA</small>
        <h2>${esc(state.treino_nome || 'Treino em andamento')}</h2>
        <p>Iniciado há ${esc(formatElapsed(state.iniciado_at || state.checkin_at))}</p>
      </div>
    </div>
    <div class="live-progress-summary">
      <strong>${done} de ${total} concluídos</strong>
      <span>${percent}%</span>
    </div>
    <div class="live-progress" aria-label="Progresso do treino"><span style="width:${percent}%"></span></div>
    ${completed ? '<div class="live-complete-message">Treino concluído 🎉</div>' : ''}
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
      }).join('') : '<p>Nenhum exercício programado para hoje.</p>'}
    </div>
    <button id="finish-live-class" class="btn btn-secondary" type="button">Finalizar treino</button>`;

  box.querySelectorAll('[data-session-exercise]').forEach(input => input.addEventListener('change', toggleExercise));
  box.querySelectorAll('[data-live-exercise-detail]').forEach(button => button.addEventListener('click', () => openExerciseDetail(button.dataset.liveExerciseDetail)));
  box.querySelector('#finish-live-class')?.addEventListener('click', finishSession);
}

async function startSession() {
  const button = box.querySelector('#start-live-class');
  if (button) button.disabled = true;
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
    if (button) button.disabled = false;
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
  if (button) button.disabled = true;
  try {
    await rpc('finalizar_aluno_sessao_treino', { p_access_token: accessToken });
    sessionState = null;
    render();
  } catch (error) {
    console.error(error);
    alert('Não foi possível finalizar o treino.');
    if (button) button.disabled = false;
  }
}

try {
  await resolveAccessToken();
  await loadSession();
  setInterval(() => { if (sessionState?.sessao_id) loadSession().catch(console.error); }, 10000);
} catch (error) {
  console.error(error);
  box.remove();
}
