import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const message = document.querySelector('#admin-support-message');
const list = document.querySelector('#admin-ticket-list');
const detail = document.querySelector('#admin-ticket-detail');
const search = document.querySelector('#admin-support-search');
const filter = document.querySelector('#admin-support-filter');
let tickets = [];
let profiles = new Map();
let selectedId = null;

const statusLabels = {
  novo: 'Novo',
  em_atendimento: 'Em atendimento',
  respondido: 'Respondido',
  resolvido: 'Resolvido'
};
const categoryLabels = {
  duvida: 'Dúvida',
  problema_tecnico: 'Problema técnico',
  sugestao: 'Sugestão',
  financeiro: 'Financeiro',
  outro: 'Outro'
};

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function formatDate(value) {
  return new Date(value).toLocaleString('pt-BR');
}

function requestedTicketId() {
  return new URLSearchParams(window.location.search).get('id');
}

async function requireAdmin() {
  const { data, error } = await supabase.from('platform_admins').select('user_id').eq('user_id', session.user.id).maybeSingle();
  if (error || !data) {
    document.body.innerHTML = '<main class="container"><section class="card" style="margin-top:40px;text-align:center"><h1>Acesso restrito</h1><p>Esta área é exclusiva da administração da plataforma.</p><a class="btn btn-primary" href="painel.html">Voltar ao painel</a></section></main>';
    throw new Error('Acesso administrativo negado');
  }
}

function updateStats() {
  const count = status => tickets.filter(ticket => ticket.status === status).length;
  document.querySelector('#stat-new').textContent = count('novo');
  document.querySelector('#stat-progress').textContent = count('em_atendimento');
  document.querySelector('#stat-answered').textContent = count('respondido');
  document.querySelector('#stat-resolved').textContent = count('resolvido');
}

function renderList() {
  const term = search.value.trim().toLowerCase();
  const status = filter.value;
  const filtered = tickets.filter(ticket => {
    const profile = profiles.get(ticket.user_id);
    const haystack = [profile?.nome, ticket.assunto, ticket.mensagem, ticket.categoria].filter(Boolean).join(' ').toLowerCase();
    return (!term || haystack.includes(term)) && (!status || ticket.status === status);
  });

  if (!filtered.length) {
    list.innerHTML = '<p class="admin-empty-detail">Nenhum contato encontrado.</p>';
    return;
  }

  list.innerHTML = filtered.map(ticket => {
    const profile = profiles.get(ticket.user_id);
    return `<button class="admin-ticket-item ${selectedId === ticket.id ? 'active' : ''}" type="button" data-open-ticket="${ticket.id}">
      <div class="admin-ticket-row">
        <div>
          <h3>${esc(ticket.assunto)}</h3>
          <p>${esc(profile?.nome || 'Usuário')} · ${esc(categoryLabels[ticket.categoria] || ticket.categoria)}</p>
        </div>
        <span class="admin-ticket-badge">${esc(statusLabels[ticket.status] || ticket.status)}</span>
      </div>
      <p style="margin-top:7px">${formatDate(ticket.created_at)}</p>
    </button>`;
  }).join('');
}

async function loadTickets() {
  const { data, error } = await supabase
    .from('contatos_suporte')
    .select('id,user_id,assunto,categoria,mensagem,status,prioridade,created_at,updated_at,respondido_em')
    .order('created_at', { ascending: false });
  if (error) throw error;
  tickets = data || [];

  const userIds = [...new Set(tickets.map(ticket => ticket.user_id))];
  if (userIds.length) {
    const { data: profileRows } = await supabase.from('perfis').select('id,nome').in('id', userIds);
    profiles = new Map((profileRows || []).map(profile => [profile.id, profile]));
  }

  updateStats();
  renderList();
}

async function markTicketNotificationsRead(id) {
  try {
    const { error } = await supabase
      .from('notificacoes')
      .update({ lida: true, lida_em: new Date().toISOString() })
      .eq('destinatario_id', session.user.id)
      .eq('lida', false)
      .eq('link', `admin-contatos.html?id=${id}`)
      .in('tipo', ['suporte_novo', 'suporte_resposta']);
    if (error) throw error;
  } catch (error) {
    console.error('Não foi possível marcar os alertas deste atendimento como lidos:', error);
  }
}

async function openTicket(id, { updateUrl = true } = {}) {
  selectedId = id;
  renderList();
  const ticket = tickets.find(item => item.id === id);
  if (!ticket) return;
  const profile = profiles.get(ticket.user_id);

  await markTicketNotificationsRead(id);

  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.set('id', id);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  const { data: replies, error } = await supabase
    .from('contatos_suporte_respostas')
    .select('id,autor_tipo,mensagem,created_at')
    .eq('contato_id', id)
    .order('created_at');
  if (error) throw error;

  detail.innerHTML = `
    <div class="section-heading"><div><small>${esc(categoryLabels[ticket.categoria] || ticket.categoria)}</small><h2>${esc(ticket.assunto)}</h2></div></div>
    <p><strong>Usuário:</strong> ${esc(profile?.nome || 'Usuário')}</p>
    <p><strong>Enviado em:</strong> ${formatDate(ticket.created_at)}</p>
    <div class="admin-ticket-thread">
      <div class="admin-thread-message"><small>Usuário · ${formatDate(ticket.created_at)}</small>${esc(ticket.mensagem)}</div>
      ${(replies || []).map(reply => `<div class="admin-thread-message ${reply.autor_tipo === 'admin' ? 'admin' : ''}"><small>${reply.autor_tipo === 'admin' ? 'Equipe FS Fit' : 'Usuário'} · ${formatDate(reply.created_at)}</small>${esc(reply.mensagem)}</div>`).join('')}
    </div>
    <form id="admin-ticket-form">
      <div class="admin-ticket-controls">
        <div class="form-group"><label>Status</label><select name="status"><option value="novo">Novo</option><option value="em_atendimento">Em atendimento</option><option value="respondido">Respondido</option><option value="resolvido">Resolvido</option></select></div>
        <div class="form-group"><label>Prioridade</label><select name="prioridade"><option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></div>
      </div>
      <div class="form-group"><label>Resposta</label><textarea name="resposta" maxlength="5000" placeholder="Escreva uma resposta para o usuário"></textarea></div>
      <div class="actions"><button class="btn btn-primary" type="submit">Salvar atendimento</button></div>
    </form>`;

  const form = detail.querySelector('#admin-ticket-form');
  form.status.value = ticket.status;
  form.prioridade.value = ticket.prioridade;
  form.addEventListener('submit', event => saveTicket(event, ticket));
}

async function saveTicket(event, ticket) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type=submit]');
  button.disabled = true;
  try {
    const responseText = form.resposta.value.trim();
    const newStatus = responseText && form.status.value === 'novo' ? 'respondido' : form.status.value;

    if (responseText) {
      const { error: replyError } = await supabase.from('contatos_suporte_respostas').insert({
        contato_id: ticket.id,
        autor_id: session.user.id,
        autor_tipo: 'admin',
        mensagem: responseText
      });
      if (replyError) throw replyError;
    }

    const updatePayload = {
      status: newStatus,
      prioridade: form.prioridade.value,
      respondido_em: responseText ? new Date().toISOString() : ticket.respondido_em
    };
    const { error: updateError } = await supabase.from('contatos_suporte').update(updatePayload).eq('id', ticket.id);
    if (updateError) throw updateError;

    showMessage(message, 'Atendimento atualizado com sucesso.');
    await loadTickets();
    await openTicket(ticket.id);
  } catch (error) {
    console.error(error);
    showMessage(message, error.message || 'Não foi possível atualizar o atendimento.', 'error');
  } finally {
    button.disabled = false;
  }
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-open-ticket]');
  if (!button) return;
  try {
    await openTicket(button.dataset.openTicket);
  } catch (error) {
    console.error(error);
    showMessage(message, 'Não foi possível abrir o atendimento.', 'error');
  }
});

search.addEventListener('input', renderList);
filter.addEventListener('change', renderList);

await requireAdmin();
await loadTickets();

const initialTicketId = requestedTicketId();
if (initialTicketId && tickets.some(ticket => ticket.id === initialTicketId)) {
  await openTicket(initialTicketId, { updateUrl: false });
}
