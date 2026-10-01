let initialized = false;
let chatObserver: MutationObserver | null = null;
let liveLabelObserver: MutationObserver | null = null;
type StudentPortalTab = 'agenda' | 'live' | 'chat';
let activeTarget: StudentPortalTab = 'agenda';

function renderChatEmpty(chatPanel: HTMLElement | null): void {
  if (!chatPanel || chatPanel.querySelector('.live-chat-card') || chatPanel.querySelector('[data-student-chat-empty]')) return;
  chatPanel.innerHTML = `
    <section class="card student-main-empty" data-student-chat-empty>
      <h2>Chat da aula</h2>
      <p>O chat fica disponível enquanto uma aula estiver em andamento.</p>
    </section>`;
}

function routeChatCard(root: HTMLElement | null, chatPanel: HTMLElement | null): void {
  if (!root || !chatPanel) return;
  const directChatCard = [...root.children].find(element => element.classList?.contains('live-chat-card'));
  if (directChatCard) {
    chatPanel.querySelector('[data-student-chat-empty]')?.remove();
    if (directChatCard.parentElement !== chatPanel) chatPanel.appendChild(directChatCard);
    return;
  }
  renderChatEmpty(chatPanel);
}

function normalizeLiveTabLabel(nav: HTMLElement | null): void {
  const liveButton = nav?.querySelector<HTMLElement>('[data-student-main-tab="live"]');
  if (!liveButton) return;
  const state = liveButton.dataset.liveState || 'today';
  const label = state === 'active' ? 'Em aula' : state === 'waiting' ? 'Check-in' : 'Aula';
  if (liveButton.textContent.trim() !== label) liveButton.textContent = label;
}

function activateTab(root: HTMLElement | null, target: string): boolean {
  if (!root || (target !== 'agenda' && target !== 'live' && target !== 'chat')) return false;
  activeTarget = target;

  root.querySelectorAll<HTMLElement>('[data-student-main-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.studentMainTab === target);
  });
  root.querySelectorAll<HTMLElement>('[data-student-main-panel]').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.studentMainPanel === target);
  });
  root.querySelectorAll<HTMLElement>('[data-student-main-agenda-content]').forEach(element => {
    element.classList.toggle('student-main-agenda-hidden', target !== 'agenda');
  });

  document.dispatchEvent(new CustomEvent('student-main-tab-change', { detail: { target } }));
  return true;
}

export function ensureStudentPortalMainTabs() {
  const root = document.querySelector<HTMLElement>('#student-content');
  if (!root) return null;

  const existingLive = root.querySelector<HTMLElement>('#student-main-live');
  const existingChat = root.querySelector<HTMLElement>('#student-main-chat');
  const existingNav = root.querySelector<HTMLElement>('.student-main-tabs');
  if (initialized && existingLive && existingChat && existingNav) {
    existingNav.hidden = true;
    existingNav.style.display = 'none';
    normalizeLiveTabLabel(existingNav);
    return { live: existingLive, agenda: root, chat: existingChat };
  }

  const planTabs = root.querySelector<HTMLElement>('.student-plan-tabs');
  if (!planTabs) return null;

  const planPanels = [...root.querySelectorAll<HTMLElement>(':scope > .student-tab-panel')];
  planTabs.dataset.studentMainAgendaContent = 'true';
  planPanels.forEach(panel => { panel.dataset.studentMainAgendaContent = 'true'; });

  const nav = existingNav || document.createElement('nav');
  nav.className = 'student-main-tabs';
  nav.hidden = true;
  nav.style.display = 'none';
  nav.setAttribute('aria-hidden', 'true');
  if (!existingNav) {
    nav.innerHTML = `
      <button class="student-main-tab active" type="button" data-student-main-tab="agenda">Início</button>
      <button class="student-main-tab" type="button" data-student-main-tab="live" data-live-state="today">Aula</button>
      <button class="student-main-tab" type="button" data-student-main-tab="chat">Chat</button>`;
    root.insertBefore(nav, planTabs);
  }

  const livePanel = existingLive || document.createElement('section');
  if (!existingLive) {
    livePanel.id = 'student-main-live';
    livePanel.className = 'student-main-panel';
    livePanel.dataset.studentMainPanel = 'live';
    root.insertBefore(livePanel, planTabs);
  }

  const chatPanel = existingChat || document.createElement('section');
  if (!existingChat) {
    chatPanel.id = 'student-main-chat';
    chatPanel.className = 'student-main-panel';
    chatPanel.dataset.studentMainPanel = 'chat';
    root.insertBefore(chatPanel, planTabs);
  }
  renderChatEmpty(chatPanel);

  liveLabelObserver?.disconnect();
  liveLabelObserver = new MutationObserver(() => normalizeLiveTabLabel(nav));
  const liveButton = nav.querySelector<HTMLElement>('[data-student-main-tab="live"]');
  if (liveButton) liveLabelObserver.observe(liveButton, { attributes: true, attributeFilter: ['data-live-state'], childList: true, characterData: true, subtree: true });
  normalizeLiveTabLabel(nav);

  chatObserver?.disconnect();
  chatObserver = new MutationObserver(mutations => {
    const relevant = mutations.some(mutation => [...mutation.addedNodes, ...mutation.removedNodes].some(node => node instanceof Element && (node.classList.contains('live-chat-card') || Boolean(node.querySelector('.live-chat-card')))));
    if (relevant) routeChatCard(root, chatPanel);
  });
  chatObserver.observe(root, { childList: true, subtree: false });
  routeChatCard(root, chatPanel);

  initialized = true;
  activateTab(root, activeTarget);
  return { live: livePanel, agenda: root, chat: chatPanel };
}

export function showStudentPortalTab(target: StudentPortalTab): boolean {
  const root = document.querySelector<HTMLElement>('#student-content');
  if (!root) return false;
  ensureStudentPortalMainTabs();
  return activateTab(root, target);
}

export function getStudentPortalTab(): StudentPortalTab {
  return activeTarget;
}
