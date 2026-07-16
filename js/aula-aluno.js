import { supabase } from './supabase.js';

const token = localStorage.getItem('fsfit_aluno_token');
const root = document.querySelector('#student-content');
if (!token || !root) throw new Error('Sessão do aluno indisponível');

let accessToken = null;
let sessionState = null;

const box = document.createElement('section');
box.className = 'card live-class-card';
box.innerHTML = '<div class="live-class-loading">Carregando status da aula...</div>';
root.insertBefore(box, root.querySelector('.student-plan-tabs'));

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
      <div class="live-class-meta"><span>Check-in feito há ${esc(formatElapsed(state.checkin_at))}</span><strong>Aguardando liberação</strong></div>`;
    return;
  }

  const items = Array.isArray(state.exercicios) ? state.exercicios : [];
  const done = items.filter(item => item.concluido).length;
  const total = items.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  box.innerHTML = `
    <div class="live-class-header"><div><small>EM AULA</small><h2>${esc(state.treino_nome || 'Treino em andamento')}</h2></div><span class="live-status active">EM AULA</span></div>
    <div class="live-class-meta"><span>Iniciado há ${esc(formatElapsed(state.iniciado_at || state.checkin_at))}</span><strong>${done}/${total} exercícios</strong></div>
    <div class="live-progress"><span style="width:${percent}%"></span></div>
    <div class="live-exercise-list">
      ${items.length ? items.map(item => `<label class="live-exercise ${item.concluido ? 'done' : ''}">
        <input type="checkbox" data-session-exercise="${esc(item.id)}" ${item.concluido ? 'checked' : ''}>
        <span><strong>${esc(item.nome || 'Exercício')}</strong><small>${esc([item.series ? `${item.series} séries` : '', item.repeticoes || '', item.carga || ''].filter(Boolean).join(' • '))}</small></span>
      </label>`).join('') : '<p>Nenhum exercício programado para hoje.</p>'}
    </div>
    <button id="finish-live-class" class="btn btn-secondary" type="button">Finalizar treino</button>`;

  box.querySelectorAll('[data-session-exercise]').forEach(input => input.addEventListener('change', toggleExercise));
  box.querySelector('#finish-live-class')?.addEventListener('click', finishSession);
}

async function startSession() {
  const button = box.querySelector('#start-live-class');
  if (button) button.disabled = true;
  try {
    await rpc('iniciar_aluno_sessao_treino', { p_access_token: accessToken });
    await loadSession();
  } catch (error) {
    console.error(error);
    alert(error.message || 'Não foi possível realizar o check-in.');
    if (button) button.disabled = false;
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
