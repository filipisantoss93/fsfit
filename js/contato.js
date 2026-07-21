import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('contato');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const form = document.querySelector('#support-form');
const message = document.querySelector('#support-message');
const list = document.querySelector('#support-list');

const categoryLabels = {
  duvida: 'Dúvida',
  problema_tecnico: 'Problema técnico',
  sugestao: 'Sugestão',
  financeiro: 'Financeiro',
  outro: 'Outro'
};
const statusLabels = {
  novo: 'Novo',
  em_atendimento: 'Em atendimento',
  respondido: 'Respondido',
  resolvido: 'Resolvido'
};

function prefillFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const categoria = params.get('categoria');
  const assunto = params.get('assunto');
  const mensagemInicial = params.get('mensagem');

  if (categoria && categoryLabels[categoria]) form.categoria.value = categoria;
  if (assunto) form.assunto.value = assunto.slice(0, 160);
  if (mensagemInicial) form.mensagem.value = mensagemInicial.slice(0, 5000);

  if (assunto || mensagemInicial) {
    form.assunto.focus();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function formatDate(value) {
  return new Date(value).toLocaleString('pt-BR');
}

function validateSupportForm() {
  const assunto = form.assunto.value.trim();
  const mensagemTexto = form.mensagem.value.trim();

  if (assunto.length < 3) {
    form.assunto.focus();
    showMessage(message, 'O assunto deve ter pelo menos 3 caracteres.', 'error');
    return null;
  }

  if (mensagemTexto.length < 5) {
    form.mensagem.focus();
    showMessage(message, 'A mensagem deve ter pelo menos 5 caracteres.', 'error');
    return null;
  }

  return {
    user_id: session.user.id,
    categoria: form.categoria.value,
    assunto,
    mensagem: mensagemTexto
  };
}

function getFriendlySupportError(error) {
  const raw = String(error?.message || '');

  if (raw.includes('contatos_suporte_mensagem_check')) {
    return 'A mensagem deve ter entre 5 e 5000 caracteres.';
  }

  if (raw.includes('contatos_suporte_assunto_check')) {
    return 'O assunto deve ter entre 3 e 160 caracteres.';
  }

  if (raw.includes('contatos_suporte_categoria_check')) {
    return 'Selecione uma categoria válida.';
  }

  return 'Não foi possível enviar sua mensagem. Tente novamente em instantes.';
}

async function loadTickets() {
  const { data: tickets, error } = await supabase
    .from('contatos_suporte')
    .select('id,assunto,categoria,mensagem,status,prioridade,created_at,updated_at')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    list.innerHTML = '<p class="support-empty">Não foi possível carregar suas mensagens.</p>';
    return;
  }

  if (!tickets?.length) {
    list.innerHTML = '<p class="support-empty">Você ainda não enviou nenhuma mensagem para o suporte.</p>';
    return;
  }

  const ids = tickets.map(ticket => ticket.id);
  const { data: replies } = await supabase
    .from('contatos_suporte_respostas')
    .select('id,contato_id,autor_tipo,mensagem,created_at')
    .in('contato_id', ids)
    .order('created_at');

  const grouped = (replies || []).reduce((acc, reply) => {
    (acc[reply.contato_id] ||= []).push(reply);
    return acc;
  }, {});

  list.innerHTML = tickets.map(ticket => {
    const thread = grouped[ticket.id] || [];
    const canReply = ticket.status !== 'resolvido';
    return `<article class="support-ticket">
      <div class="support-ticket-head">
        <div>
          <h3>${esc(ticket.assunto)}</h3>
          <div class="support-ticket-meta">${esc(categoryLabels[ticket.categoria] || ticket.categoria)} · ${formatDate(ticket.created_at)}</div>
        </div>
        <span class="support-status ${ticket.status}">${esc(statusLabels[ticket.status] || ticket.status)}</span>
      </div>
      <div class="support-thread">
        <div class="support-reply"><small>Você · ${formatDate(ticket.created_at)}</small>${esc(ticket.mensagem)}</div>
        ${thread.map(reply => `<div class="support-reply ${reply.autor_tipo === 'admin' ? 'admin' : ''}"><small>${reply.autor_tipo === 'admin' ? 'Equipe FS Fit' : 'Você'} · ${formatDate(reply.created_at)}</small>${esc(reply.mensagem)}</div>`).join('')}
      </div>
      ${canReply ? `<form class="support-followup" data-followup="${ticket.id}">
        <div class="form-group"><textarea name="mensagem" maxlength="5000" placeholder="Adicionar uma nova mensagem ao atendimento" required></textarea></div>
        <button class="btn btn-outline" type="submit">Enviar complemento</button>
      </form>` : ''}
    </article>`;
  }).join('');
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const payload = validateSupportForm();
  if (!payload) return;

  const button = form.querySelector('[type=submit]');
  button.disabled = true;
  try {
    const { error } = await supabase.from('contatos_suporte').insert(payload);
    if (error) throw error;
    form.reset();
    window.history.replaceState({}, '', 'contato.html');
    showMessage(message, 'Mensagem enviada. Você pode acompanhar a resposta nesta página.');
    await loadTickets();
  } catch (error) {
    console.error(error);
    showMessage(message, getFriendlySupportError(error), 'error');
  } finally {
    button.disabled = false;
  }
});

document.addEventListener('submit', async event => {
  const followup = event.target.closest('[data-followup]');
  if (!followup) return;
  event.preventDefault();

  const mensagemTexto = followup.mensagem.value.trim();
  if (!mensagemTexto) {
    followup.mensagem.focus();
    showMessage(message, 'Digite uma mensagem antes de enviar o complemento.', 'error');
    return;
  }

  const button = followup.querySelector('[type=submit]');
  button.disabled = true;
  try {
    const { error } = await supabase.from('contatos_suporte_respostas').insert({
      contato_id: followup.dataset.followup,
      autor_id: session.user.id,
      autor_tipo: 'usuario',
      mensagem: mensagemTexto
    });
    if (error) throw error;
    followup.reset();
    showMessage(message, 'Mensagem adicionada ao atendimento.');
    await loadTickets();
  } catch (error) {
    console.error(error);
    showMessage(message, 'Não foi possível enviar o complemento. Tente novamente em instantes.', 'error');
  } finally {
    button.disabled = false;
  }
});

prefillFromUrl();
await loadTickets();