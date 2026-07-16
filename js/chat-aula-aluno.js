import { supabase } from './supabase.js';

const root = document.querySelector('#student-content');
const sessionToken = localStorage.getItem('fsfit_aluno_token');
if (!root || !sessionToken) throw new Error('Portal do aluno indisponível');

let accessToken = null;
let chatBox = null;

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function rpc(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

function ensureBox() {
  if (chatBox) return chatBox;
  chatBox = document.createElement('section');
  chatBox.className = 'card live-chat-card';
  const tabs = root.querySelector('.student-plan-tabs');
  root.insertBefore(chatBox, tabs);
  return chatBox;
}

function removeBox() {
  chatBox?.remove();
  chatBox = null;
}

async function loadChat() {
  const data = await rpc('get_aluno_chat_sessao', { p_access_token: accessToken });
  const state = Array.isArray(data) ? data[0] : data;
  if (!state?.sessao_id || state.status !== 'em_aula') {
    removeBox();
    return;
  }

  const box = ensureBox();
  const messages = Array.isArray(state.mensagens) ? state.mensagens : [];
  box.innerHTML = `
    <div class="live-chat-heading"><div><small>CHAT DA AULA</small><h2>Fale com seu personal</h2></div><span class="live-status active">ATIVO</span></div>
    <div class="live-chat-thread">
      ${messages.length ? messages.map(message => `<div class="live-chat-message ${message.autor_tipo === 'aluno' ? 'mine' : ''}"><small>${message.autor_tipo === 'aluno' ? 'Você' : 'Personal'} · ${formatTime(message.created_at)}</small><p>${esc(message.mensagem)}</p></div>`).join('') : '<p class="empty">Nenhuma mensagem ainda.</p>'}
    </div>
    <form id="student-live-chat-form" class="live-chat-form">
      <textarea name="mensagem" maxlength="3000" placeholder="Escreva uma mensagem para seu personal" required></textarea>
      <button class="btn btn-primary" type="submit">Enviar</button>
    </form>`;

  const thread = box.querySelector('.live-chat-thread');
  if (thread) thread.scrollTop = thread.scrollHeight;
  box.querySelector('#student-live-chat-form')?.addEventListener('submit', sendMessage);
}

async function sendMessage(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = form.mensagem.value.trim();
  if (!message) return;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    await rpc('enviar_aluno_mensagem_sessao', { p_access_token: accessToken, p_mensagem: message });
    form.reset();
    await loadChat();
  } catch (error) {
    console.error(error);
    alert('Não foi possível enviar a mensagem.');
    button.disabled = false;
  }
}

try {
  accessToken = await rpc('get_aluno_portal_token', { p_session_token: sessionToken });
  if (accessToken) {
    await loadChat();
    setInterval(() => loadChat().catch(console.error), 5000);
  }
} catch (error) {
  console.error(error);
  removeBox();
}