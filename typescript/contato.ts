// @ts-ignore Existing browser JavaScript module.
import { supabase } from './supabase.js';
// @ts-ignore Existing browser JavaScript module.
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

interface SupportTicket {
  id: string;
  assunto: string;
  categoria: string;
  mensagem: string;
  status: string;
  created_at: string;
}

interface SupportReply {
  contato_id: string;
  autor_tipo: string;
  mensagem: string;
  created_at: string;
}

interface SupportPayload {
  user_id: string;
  categoria: string;
  assunto: string;
  mensagem: string;
}

renderHeader('contato');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const form = document.querySelector<HTMLFormElement>('#support-form')!;
const message = document.querySelector<HTMLElement>('#support-message');
const list = document.querySelector<HTMLElement>('#support-list')!;
const categoryInput = form.elements.namedItem('categoria') as HTMLSelectElement;
const subjectInput = form.elements.namedItem('assunto') as HTMLInputElement;
const supportMessageInput = form.elements.namedItem('mensagem') as HTMLTextAreaElement;

const categoryLabels: Record<string, string> = {
  duvida: 'Dúvida',
  problema_tecnico: 'Problema técnico',
  sugestao: 'Sugestão',
  financeiro: 'Financeiro',
  outro: 'Outro'
};

const supportVisualStatus: Record<string, { label: string; className: string }> = {
  novo: { label: 'Enviado', className: 'enviado' },
  em_atendimento: { label: 'Enviado', className: 'enviado' },
  respondido: { label: 'Respondido', className: 'respondido' },
  resolvido: { label: 'Fechado', className: 'fechado' }
};

function prefillFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const categoria = params.get('categoria');
  const assunto = params.get('assunto');
  const mensagemInicial = params.get('mensagem');

  if (categoria && categoryLabels[categoria]) categoryInput.value = categoria;
  if (assunto) subjectInput.value = assunto.slice(0, 160);
  if (mensagemInicial) supportMessageInput.value = mensagemInicial.slice(0, 5000);

  if (assunto || mensagemInicial) {
    subjectInput.focus();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function esc(value: unknown = ''): string {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString('pt-BR');
}

function validateSupportForm(): SupportPayload | null {
  const assunto = subjectInput.value.trim();
  const mensagemTexto = supportMessageInput.value.trim();

  if (assunto.length < 3) {
    subjectInput.focus();
    showMessage(message, 'O assunto deve ter pelo menos 3 caracteres.', 'error');
    return null;
  }

  if (mensagemTexto.length < 5) {
    supportMessageInput.focus();
    showMessage(message, 'A mensagem deve ter pelo menos 5 caracteres.', 'error');
    return null;
  }

  return {
    user_id: session.user.id,
    categoria: categoryInput.value,
    assunto,
    mensagem: mensagemTexto
  };
}

function getFriendlySupportError(error: unknown): string {
  const raw = error instanceof Error ? error.message : '';

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

function getVisualStatus(status: string): { label: string; className: string } {
  return supportVisualStatus[status] || { label: 'Enviado', className: 'enviado' };
}

async function loadTickets(): Promise<void> {
  const { data: tickets, error } = await supabase
    .from('contatos_suporte')
    .select('id,assunto,categoria,mensagem,status,prioridade,created_at,updated_at')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    list.innerHTML = '<p class="support-empty">Não foi possível carregar suas mensagens.</p>';
    return;
  }

  const ticketItems = (tickets || []) as SupportTicket[];

  if (!ticketItems.length) {
    list.innerHTML = '<p class="support-empty">Você ainda não enviou nenhuma mensagem para o suporte.</p>';
    return;
  }

  const ids = ticketItems.map(ticket => ticket.id);
  const { data: replies } = await supabase
    .from('contatos_suporte_respostas')
    .select('id,contato_id,autor_tipo,mensagem,created_at')
    .in('contato_id', ids)
    .order('created_at');

  const replyItems = (replies || []) as SupportReply[];
  const grouped = replyItems.reduce<Record<string, SupportReply[]>>((acc, reply) => {
    (acc[reply.contato_id] ||= []).push(reply);
    return acc;
  }, {});

  list.innerHTML = `
    <div class="support-list-summary">${ticketItems.length} ${ticketItems.length === 1 ? 'atendimento' : 'atendimentos'}</div>
    <div class="support-ticket-list">
      ${ticketItems.map(ticket => {
        const thread = grouped[ticket.id] || [];
        const canReply = ticket.status !== 'resolvido';
        const visualStatus = getVisualStatus(ticket.status);
        const detailsId = `support-details-${ticket.id}`;

        return `<article class="support-ticket" data-ticket="${ticket.id}">
          <button class="support-ticket-row" type="button" data-ticket-toggle="${ticket.id}" aria-expanded="false" aria-controls="${detailsId}">
            <span class="support-ticket-main">
              <strong>${esc(ticket.assunto)}</strong>
              <small>${esc(categoryLabels[ticket.categoria] || ticket.categoria)} · ${formatDate(ticket.created_at)}</small>
            </span>
            <span class="support-status ${visualStatus.className}">${visualStatus.label}</span>
            <span class="support-ticket-chevron" aria-hidden="true">⌄</span>
          </button>
          <div class="support-ticket-details" id="${detailsId}" hidden>
            <div class="support-thread">
              <div class="support-reply"><small>Você · ${formatDate(ticket.created_at)}</small>${esc(ticket.mensagem)}</div>
              ${thread.map(reply => `<div class="support-reply ${reply.autor_tipo === 'admin' ? 'admin' : ''}"><small>${reply.autor_tipo === 'admin' ? 'Equipe FS Fit' : 'Você'} · ${formatDate(reply.created_at)}</small>${esc(reply.mensagem)}</div>`).join('')}
            </div>
            ${canReply ? `<form class="support-followup" data-followup="${ticket.id}">
              <div class="form-group"><textarea name="mensagem" maxlength="5000" placeholder="Adicionar uma nova mensagem ao atendimento" required></textarea></div>
              <button class="btn btn-outline" type="submit">Enviar complemento</button>
            </form>` : '<p class="support-closed-note">Este atendimento foi fechado.</p>'}
          </div>
        </article>`;
      }).join('')}
    </div>`;
}

function toggleTicket(button: HTMLButtonElement): void {
  const ticketId = button.dataset.ticketToggle;
  const ticket = button.closest<HTMLElement>('.support-ticket');
  const details = ticket?.querySelector<HTMLElement>('.support-ticket-details');
  if (!ticket || !details) return;

  const willOpen = button.getAttribute('aria-expanded') !== 'true';

  document.querySelectorAll<HTMLElement>('.support-ticket.is-open').forEach(openTicket => {
    if (openTicket === ticket) return;
    openTicket.classList.remove('is-open');
    const openButton = openTicket.querySelector<HTMLButtonElement>('[data-ticket-toggle]');
    const openDetails = openTicket.querySelector<HTMLElement>('.support-ticket-details');
    openButton?.setAttribute('aria-expanded', 'false');
    if (openDetails) openDetails.hidden = true;
  });

  ticket.classList.toggle('is-open', willOpen);
  button.setAttribute('aria-expanded', String(willOpen));
  details.hidden = !willOpen;

  if (willOpen && ticketId) {
    requestAnimationFrame(() => ticket.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const payload = validateSupportForm();
  if (!payload) return;

  const button = form.querySelector<HTMLButtonElement>('[type=submit]')!;
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

document.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  const ticketButton = event.target.closest<HTMLButtonElement>('[data-ticket-toggle]');
  if (!ticketButton) return;
  toggleTicket(ticketButton);
});

document.addEventListener('submit', async event => {
  if (!(event.target instanceof Element)) return;
  const followup = event.target.closest<HTMLFormElement>('[data-followup]');
  if (!followup) return;
  event.preventDefault();

  const followupMessage = followup.elements.namedItem('mensagem') as HTMLTextAreaElement;
  const mensagemTexto = followupMessage.value.trim();
  if (!mensagemTexto) {
    followupMessage.focus();
    showMessage(message, 'Digite uma mensagem antes de enviar o complemento.', 'error');
    return;
  }

  const button = followup.querySelector<HTMLButtonElement>('[type=submit]')!;
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
