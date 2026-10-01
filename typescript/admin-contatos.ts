// @ts-ignore Existing browser JavaScript module.
import { supabase } from './supabase.js';
// @ts-ignore Existing browser JavaScript module.
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

interface SupportTicket { id: string; user_id: string; assunto: string; categoria: string; mensagem: string; status: string; prioridade: string; created_at: string; respondido_em?: string | null; }
interface SupportProfile { id: string; nome?: string; }
interface SupportReply { autor_tipo: string; mensagem: string; created_at: string; }

renderHeader('');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const message = document.querySelector<HTMLElement>('#admin-support-message');
const list = document.querySelector<HTMLElement>('#admin-ticket-list')!;
const detail = document.querySelector<HTMLElement>('#admin-ticket-detail')!;
const search = document.querySelector<HTMLInputElement>('#admin-support-search')!;
const filter = document.querySelector<HTMLSelectElement>('#admin-support-filter')!;
const ticketCount = document.querySelector<HTMLElement>('#admin-ticket-count')!;
const modal = document.querySelector<HTMLElement>('#admin-ticket-modal')!;
const modalCategory = document.querySelector<HTMLElement>('#admin-ticket-modal-category')!;
const modalTitle = document.querySelector<HTMLElement>('#admin-ticket-modal-title')!;
const modalMeta = document.querySelector<HTMLElement>('#admin-ticket-modal-meta')!;
const modalClose = document.querySelector<HTMLButtonElement>('.admin-ticket-modal-close');

let tickets: SupportTicket[] = [];
let profiles = new Map<string, SupportProfile>();
let selectedId: string | null = null;
let lastTrigger: HTMLElement | null = null;

const statusLabels: Record<string, string> = {
  novo: 'Novo',
  em_atendimento: 'Em atendimento',
  respondido: 'Respondido',
  resolvido: 'Fechado'
};

const categoryLabels: Record<string, string> = {
  duvida: 'Dúvida',
  problema_tecnico: 'Problema técnico',
  sugestao: 'Sugestão',
  financeiro: 'Financeiro',
  outro: 'Outro'
};

function esc(value: unknown = ''): string {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('pt-BR');
}

function requestedTicketId(): string | null {
  return new URLSearchParams(window.location.search).get('id');
}

async function requireAdmin(): Promise<void> {
  const { data, error } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error || !data) {
    document.body.innerHTML = '<main class="container"><section class="card" style="margin-top:40px;text-align:center"><h1>Acesso restrito</h1><p>Esta área é exclusiva da administração da plataforma.</p><a class="btn btn-primary" href="painel.html">Voltar ao painel</a></section></main>';
    throw new Error('Acesso administrativo negado');
  }
}

function updateStats(): void {
  const count = (status: string): number => tickets.filter(ticket => ticket.status === status).length;
  document.querySelector<HTMLElement>('#stat-new')!.textContent = String(count('novo'));
  document.querySelector<HTMLElement>('#stat-progress')!.textContent = String(count('em_atendimento'));
  document.querySelector<HTMLElement>('#stat-answered')!.textContent = String(count('respondido'));
  document.querySelector<HTMLElement>('#stat-resolved')!.textContent = String(count('resolvido'));
}

function getFilteredTickets(): SupportTicket[] {
  const term = search.value.trim().toLowerCase();
  const status = filter.value;

  return tickets.filter(ticket => {
    const profile = profiles.get(ticket.user_id);
    const haystack = [profile?.nome, ticket.assunto, ticket.mensagem, ticket.categoria]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return (!term || haystack.includes(term)) && (!status || ticket.status === status);
  });
}

function renderList(): void {
  const filtered = getFilteredTickets();
  ticketCount.textContent = String(filtered.length);

  if (!filtered.length) {
    list.innerHTML = '<p class="admin-empty-detail">Nenhum atendimento encontrado.</p>';
    return;
  }

  list.innerHTML = filtered.map(ticket => {
    const profile = profiles.get(ticket.user_id);
    const statusLabel = statusLabels[ticket.status] || ticket.status;

    return `<button class="admin-ticket-item" type="button" data-open-ticket="${ticket.id}" aria-label="Abrir atendimento ${esc(ticket.assunto)}">
      <div class="admin-ticket-main">
        <div class="admin-ticket-topline">
          <h3>${esc(ticket.assunto)}</h3>
        </div>
        <p>${esc(profile?.nome || 'Usuário')} · ${esc(categoryLabels[ticket.categoria] || ticket.categoria)} · ${formatDate(ticket.created_at)}</p>
      </div>
      <div class="admin-ticket-side">
        <span class="admin-ticket-badge ${ticket.status}">${esc(statusLabel)}</span>
        <span class="admin-ticket-chevron" aria-hidden="true">›</span>
      </div>
    </button>`;
  }).join('');
}

async function loadTickets(): Promise<void> {
  const { data, error } = await supabase
    .from('contatos_suporte')
    .select('id,user_id,assunto,categoria,mensagem,status,prioridade,created_at,updated_at,respondido_em')
    .order('created_at', { ascending: false });

  if (error) throw error;
  tickets = (data || []) as SupportTicket[];

  const userIds = [...new Set(tickets.map(ticket => ticket.user_id))];
  if (userIds.length) {
    const { data: profileRows } = await supabase
      .from('perfis')
      .select('id,nome')
      .in('id', userIds);

    profiles = new Map<string, SupportProfile>(((profileRows || []) as SupportProfile[]).map(profile => [profile.id, profile]));
  } else {
    profiles = new Map();
  }

  updateStats();
  renderList();
}

async function markTicketNotificationsRead(id: string): Promise<void> {
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

function showTicketModal(): void {
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.documentElement.classList.add('admin-ticket-modal-open');
  requestAnimationFrame(() => modalClose?.focus());
}

function closeTicketModal({ updateUrl = true }: { updateUrl?: boolean } = {}): void {
  if (modal.classList.contains('hidden')) return;

  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.documentElement.classList.remove('admin-ticket-modal-open');
  selectedId = null;

  if (updateUrl) {
    const url = new URL(window.location.href);
    url.searchParams.delete('id');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  lastTrigger?.focus();
}

async function openTicket(id: string, { updateUrl = true }: { updateUrl?: boolean } = {}): Promise<void> {
  const ticket = tickets.find(item => item.id === id);
  if (!ticket) return;

  selectedId = id;
  const profile = profiles.get(ticket.user_id);

  modalCategory.textContent = categoryLabels[ticket.categoria] || ticket.categoria;
  modalTitle.textContent = ticket.assunto;
  modalMeta.textContent = `${profile?.nome || 'Usuário'} · ${formatDate(ticket.created_at)} · ${statusLabels[ticket.status] || ticket.status}`;
  detail.innerHTML = '<p class="admin-empty-detail">Carregando atendimento...</p>';
  showTicketModal();

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
    <div class="admin-ticket-thread">
      <div class="admin-thread-message"><small>Usuário · ${formatDate(ticket.created_at)}</small>${esc(ticket.mensagem)}</div>
      ${((replies || []) as SupportReply[]).map(reply => `<div class="admin-thread-message ${reply.autor_tipo === 'admin' ? 'admin' : ''}"><small>${reply.autor_tipo === 'admin' ? 'Equipe FS Fit' : 'Usuário'} · ${formatDate(reply.created_at)}</small>${esc(reply.mensagem)}</div>`).join('')}
    </div>
    <form id="admin-ticket-form">
      <div class="admin-ticket-controls">
        <div class="form-group">
          <label>Status</label>
          <select name="status">
            <option value="novo">Novo</option>
            <option value="em_atendimento">Em atendimento</option>
            <option value="respondido">Respondido</option>
            <option value="resolvido">Fechado</option>
          </select>
        </div>
        <div class="form-group">
          <label>Prioridade</label>
          <select name="prioridade">
            <option value="baixa">Baixa</option>
            <option value="normal">Normal</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Resposta</label>
        <textarea name="resposta" maxlength="5000" placeholder="Escreva uma resposta para o usuário"></textarea>
      </div>
      <div class="actions"><button class="btn btn-primary" type="submit">Salvar atendimento</button></div>
    </form>`;

  const form = detail.querySelector<HTMLFormElement>('#admin-ticket-form')!;
  const statusInput = form.elements.namedItem('status') as HTMLSelectElement;
  const priorityInput = form.elements.namedItem('prioridade') as HTMLSelectElement;
  statusInput.value = ticket.status;
  priorityInput.value = ticket.prioridade;
  form.addEventListener('submit', event => saveTicket(event, ticket));
}

async function saveTicket(event: Event, ticket: SupportTicket): Promise<void> {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const button = form.querySelector<HTMLButtonElement>('[type=submit]')!;
  const responseInput = form.elements.namedItem('resposta') as HTMLTextAreaElement;
  const statusInput = form.elements.namedItem('status') as HTMLSelectElement;
  const priorityInput = form.elements.namedItem('prioridade') as HTMLSelectElement;
  button.disabled = true;

  try {
    const responseText = responseInput.value.trim();
    const newStatus = responseText && statusInput.value === 'novo' ? 'respondido' : statusInput.value;

    if (responseText) {
      const { error: replyError } = await supabase
        .from('contatos_suporte_respostas')
        .insert({
          contato_id: ticket.id,
          autor_id: session.user.id,
          autor_tipo: 'admin',
          mensagem: responseText
        });

      if (replyError) throw replyError;
    }

    const updatePayload = {
      status: newStatus,
      prioridade: priorityInput.value,
      respondido_em: responseText ? new Date().toISOString() : ticket.respondido_em
    };

    const { error: updateError } = await supabase
      .from('contatos_suporte')
      .update(updatePayload)
      .eq('id', ticket.id);

    if (updateError) throw updateError;

    showMessage(message, 'Atendimento atualizado com sucesso.');
    await loadTickets();
    await openTicket(ticket.id, { updateUrl: false });
  } catch (error) {
    console.error(error);
    showMessage(message, 'Não foi possível atualizar o atendimento. Tente novamente.', 'error');
  } finally {
    button.disabled = false;
  }
}

document.addEventListener('click', async event => {
  if (!(event.target instanceof Element)) return;
  const openButton = event.target.closest<HTMLButtonElement>('[data-open-ticket]');
  if (openButton) {
    lastTrigger = openButton;
    try {
      if (openButton.dataset.openTicket) await openTicket(openButton.dataset.openTicket);
    } catch (error) {
      console.error(error);
      closeTicketModal();
      showMessage(message, 'Não foi possível abrir o atendimento.', 'error');
    }
    return;
  }

  if (event.target.closest('[data-close-ticket-modal]')) {
    closeTicketModal();
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
    closeTicketModal();
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
