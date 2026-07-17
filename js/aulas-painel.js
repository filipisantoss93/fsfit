import { supabase } from './supabase.js';

const container = document.querySelector('#live-students-list');
if (!container) throw new Error('Área Em aula não encontrada');

let loadingLiveStudents = false;

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function elapsed(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

async function confirmStart(sessionId, button) {
  if (!confirm('Confirmar o início desta aula?')) return;
  button.disabled = true;
  const { data, error } = await supabase.rpc('confirmar_inicio_sessao_personal', { p_sessao_id: sessionId });
  if (error || data !== true) {
    console.error(error || 'Sessão não confirmada');
    alert('Não foi possível confirmar o início da aula.');
    button.disabled = false;
    return;
  }
  await loadLiveStudents();
}

async function finishSession(sessionId, studentName, button) {
  if (!confirm(`Encerrar o treino de ${studentName}?\n\nUse esta opção quando o aluno esquecer de finalizar o treino. A sessão será marcada como finalizada.`)) return;

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = 'Encerrando...';

  try {
    const { data, error } = await supabase.rpc('finalizar_sessao_personal', { p_sessao_id: sessionId });
    if (error) throw error;
    if (data !== true) throw new Error('A sessão não está mais em andamento ou não pertence a este personal.');

    if (container.dataset.openChatSession === sessionId) {
      delete container.dataset.openChatSession;
    }

    await loadLiveStudents();
  } catch (error) {
    console.error(error);
    alert(error.message || 'Não foi possível encerrar o treino.');
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function loadLiveStudents() {
  if (loadingLiveStudents) return;
  loadingLiveStudents = true;

  try {
    const { data, error } = await supabase.rpc('listar_sessoes_em_aula_personal');
    if (error) {
      console.error(error);
      if (!container.querySelector('.live-student-row')) {
        container.innerHTML = '<p class="empty">Não foi possível carregar os alunos em aula.</p>';
      }
      return;
    }

    const rows = data || [];
    const openChatSession = container.dataset.openChatSession || '';
    const preservedChatHost = openChatSession
      ? container.querySelector(`[data-chat-host="${CSS.escape(openChatSession)}"]`)
      : null;

    const badge = document.querySelector('#live-students-count');
    if (badge) badge.textContent = String(rows.length);

    container.innerHTML = rows.length ? rows.map(row => {
      const pending = row.status === 'aguardando_confirmacao';
      const total = Number(row.total_exercicios || 0);
      const done = Number(row.exercicios_concluidos || 0);
      const percent = total ? Math.round(done / total * 100) : 0;
      const chatOpen = openChatSession === row.sessao_id;
      return `<article class="live-student-row ${pending ? 'pending' : ''}">
        <div class="live-student-main"><span class="live-dot"></span><div><strong>${esc(row.aluno_nome)}</strong><small>${esc(row.treino_nome || 'Treino')} • ${pending ? `check-in há ${elapsed(row.checkin_at)}` : `em aula há ${elapsed(row.iniciado_at || row.checkin_at)}`}</small></div></div>
        <div class="live-student-progress">
          ${pending ? '<span>Aguardando confirmação</span>' : `<span>${done}/${total} concluídos</span><div class="live-progress"><span style="width:${percent}%"></span></div>`}
        </div>
        <div class="actions">
          ${pending
            ? `<button class="btn btn-primary" type="button" data-confirm-session="${esc(row.sessao_id)}">Confirmar início</button>`
            : `<button class="btn btn-secondary" type="button" data-open-session-chat="${esc(row.sessao_id)}">${chatOpen ? 'Fechar chat' : 'Abrir chat'}</button><button class="btn btn-danger" type="button" data-finish-session="${esc(row.sessao_id)}" data-student-name="${esc(row.aluno_nome)}">Encerrar treino</button>`}
          <a class="btn btn-outline" href="ficha-aluno.html?id=${encodeURIComponent(row.aluno_id)}">Abrir ficha</a>
        </div>
        ${pending ? '' : `<div class="live-chat-inline ${chatOpen ? '' : 'hidden'}" data-chat-host="${esc(row.sessao_id)}"></div>`}
      </article>`;
    }).join('') : '<p class="empty">Nenhum aluno aguardando confirmação ou em aula neste momento.</p>';

    const openSessionStillActive = openChatSession
      && rows.some(row => row.sessao_id === openChatSession && row.status === 'em_aula');

    if (openSessionStillActive && preservedChatHost) {
      const placeholder = container.querySelector(`[data-chat-host="${CSS.escape(openChatSession)}"]`);
      if (placeholder) {
        preservedChatHost.classList.remove('hidden');
        placeholder.replaceWith(preservedChatHost);
      }
    } else if (openChatSession && !openSessionStillActive) {
      delete container.dataset.openChatSession;
    }

    container.querySelectorAll('[data-confirm-session]').forEach(button => {
      button.addEventListener('click', () => confirmStart(button.dataset.confirmSession, button));
    });

    container.querySelectorAll('[data-finish-session]').forEach(button => {
      button.addEventListener('click', () => finishSession(
        button.dataset.finishSession,
        button.dataset.studentName || 'este aluno',
        button
      ));
    });
  } finally {
    loadingLiveStudents = false;
  }
}

await loadLiveStudents();
setInterval(loadLiveStudents, 10000);
