import { supabase } from './supabase.js';

const container = document.querySelector('#live-students-list');
if (!container) throw new Error('Área Em aula não encontrada');

let openSessionId = null;

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function notifyAluno(sessionId) {
  const { error } = await supabase.functions.invoke('chat-push', {
    body: { action: 'notify_from_personal', session_id: sessionId }
  });
  if (error) console.error('Falha ao notificar aluno:', error);
}

async function openChat(sessionId) {
  openSessionId = sessionId;
  container.dataset.openChatSession = sessionId;
  const host = container.querySelector(`[data-chat-host="${CSS.escape(sessionId)}"]`);
  if (!host) return;
  host.classList.remove('hidden');

  const { data: session, error: sessionError } = await supabase
    .from('sessoes_treino')
    .select('id,status')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError || !session || session.status !== 'em_aula') {
    host.innerHTML = '<p class="empty">O chat é encerrado automaticamente quando a aula termina.</p>';
    return;
  }

  const { data: messages, error } = await supabase
    .from('sessao_mensagens')
    .select('id,autor_tipo,mensagem,created_at')
    .eq('sessao_id', sessionId)
    .order('created_at');

  if (error) {
    console.error(error);
    host.innerHTML = '<p class="empty">Não foi possível carregar o chat.</p>';
    return;
  }

  host.innerHTML = `
    <div class="live-chat-thread">
      ${(messages || []).length ? messages.map(message => `<div class="live-chat-message ${message.autor_tipo === 'personal' ? 'mine' : ''}"><small>${message.autor_tipo === 'personal' ? 'Você' : 'Aluno'} · ${formatTime(message.created_at)}</small><p>${esc(message.mensagem)}</p></div>`).join('') : '<p class="empty">Nenhuma mensagem ainda.</p>'}
    </div>
    <form class="live-chat-form" data-personal-chat-form="${esc(sessionId)}">
      <textarea name="mensagem" maxlength="3000" placeholder="Escreva uma orientação para o aluno" required></textarea>
      <button class="btn btn-primary" type="submit">Enviar</button>
    </form>`;

  const thread = host.querySelector('.live-chat-thread');
  if (thread) thread.scrollTop = thread.scrollHeight;
  host.querySelector('[data-personal-chat-form]')?.addEventListener('submit', sendMessage);
}

async function sendMessage(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const sessionId = form.dataset.personalChatForm;
  const message = form.mensagem.value.trim();
  if (!message) return;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sessão inválida');
    const { error } = await supabase.from('sessao_mensagens').insert({
      sessao_id: sessionId,
      autor_tipo: 'personal',
      autor_id: session.user.id,
      mensagem: message
    });
    if (error) throw error;
    await notifyAluno(sessionId);
    form.reset();
    await openChat(sessionId);
  } catch (error) {
    console.error(error);
    alert('Não foi possível enviar a mensagem.');
    button.disabled = false;
  }
}

container.addEventListener('click', event => {
  const button = event.target.closest('[data-open-session-chat]');
  if (!button) return;
  const sessionId = button.dataset.openSessionChat;
  const host = container.querySelector(`[data-chat-host="${CSS.escape(sessionId)}"]`);
  if (!host) return;
  const willOpen = host.classList.contains('hidden');
  container.querySelectorAll('[data-chat-host]').forEach(item => item.classList.add('hidden'));
  if (!willOpen) {
    openSessionId = null;
    delete container.dataset.openChatSession;
    return;
  }
  openChat(sessionId).catch(console.error);
});

setInterval(() => {
  const sessionId = container.dataset.openChatSession || openSessionId;
  if (sessionId) openChat(sessionId).catch(console.error);
}, 5000);
