let initialized = false;
let chatObserver = null;

function injectStyles() {
  if (document.querySelector('style[data-student-main-tabs]')) return;

  const style = document.createElement('style');
  style.dataset.studentMainTabs = 'true';
  style.textContent = `
    .student-main-tabs {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
      margin: 12px 0 12px;
      padding: 5px;
      border: 1px solid var(--border);
      border-radius: 14px;
      background: rgba(255,255,255,.025);
    }
    .student-main-tab {
      min-width: 0;
      min-height: 44px;
      padding: 8px 6px;
      border: 0;
      border-radius: 10px;
      background: transparent;
      color: var(--muted);
      font: inherit;
      font-weight: 850;
      font-size: .86rem;
      cursor: pointer;
      transition: .2s ease;
    }
    .student-main-tab.active {
      background: var(--primary);
      color: #07120a;
    }
    .student-main-panel { display: none; }
    .student-main-panel.active { display: block; }
    [data-student-main-agenda-content].student-main-agenda-hidden { display: none !important; }
    .student-main-panel > .live-class-card,
    .student-main-panel > .live-chat-card { margin-top: 0; }
    .student-main-empty {
      margin: 0;
      text-align: center;
      color: var(--muted);
    }
    .student-main-empty h2 {
      margin: 0 0 8px;
      color: var(--text);
    }
    .student-main-empty p { margin: 0; }
    @media (max-width: 520px) {
      .student-main-tabs { gap: 5px; padding: 5px; margin: 10px 0 10px; }
      .student-main-tab { min-height: 42px; font-size: .8rem; padding: 7px 4px; }
    }
  `;
  document.head.appendChild(style);
}

function renderChatEmpty(chatPanel) {
  if (!chatPanel || chatPanel.querySelector('.live-chat-card') || chatPanel.querySelector('[data-student-chat-empty]')) return;
  chatPanel.innerHTML = `
    <section class="card student-main-empty" data-student-chat-empty>
      <h2>Chat da aula</h2>
      <p>O chat fica disponível enquanto uma aula estiver em andamento.</p>
    </section>`;
}

function routeChatCard(root, chatPanel) {
  const directChatCard = [...root.children].find(element => element.classList?.contains('live-chat-card'));
  if (directChatCard) {
    chatPanel.innerHTML = '';
    chatPanel.appendChild(directChatCard);
    return;
  }
  renderChatEmpty(chatPanel);
}

function activateTab(root, target) {
  root.querySelectorAll('[data-student-main-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.studentMainTab === target);
  });

  root.querySelectorAll('[data-student-main-panel]').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.studentMainPanel === target);
  });

  root.querySelectorAll('[data-student-main-agenda-content]').forEach(element => {
    element.classList.toggle('student-main-agenda-hidden', target !== 'agenda');
  });
}

export function ensureStudentPortalMainTabs() {
  const root = document.querySelector('#student-content');
  if (!root) return null;

  const existingLive = root.querySelector('#student-main-live');
  const existingChat = root.querySelector('#student-main-chat');
  const existingNav = root.querySelector('.student-main-tabs');
  if (initialized && existingLive && existingChat && existingNav) {
    return { live: existingLive, agenda: root, chat: existingChat };
  }

  const planTabs = root.querySelector('.student-plan-tabs');
  if (!planTabs) return null;

  injectStyles();

  const planPanels = [...root.querySelectorAll(':scope > .student-tab-panel')];
  planTabs.dataset.studentMainAgendaContent = 'true';
  planPanels.forEach(panel => { panel.dataset.studentMainAgendaContent = 'true'; });

  const nav = document.createElement('nav');
  nav.className = 'student-main-tabs';
  nav.setAttribute('aria-label', 'Áreas do portal do aluno');
  nav.innerHTML = `
    <button class="student-main-tab active" type="button" data-student-main-tab="live" data-live-state="today">Hoje</button>
    <button class="student-main-tab" type="button" data-student-main-tab="agenda">Agenda</button>
    <button class="student-main-tab" type="button" data-student-main-tab="chat">Chat</button>
  `;

  const livePanel = document.createElement('section');
  livePanel.id = 'student-main-live';
  livePanel.className = 'student-main-panel active';
  livePanel.dataset.studentMainPanel = 'live';

  const chatPanel = document.createElement('section');
  chatPanel.id = 'student-main-chat';
  chatPanel.className = 'student-main-panel';
  chatPanel.dataset.studentMainPanel = 'chat';

  root.insertBefore(nav, planTabs);
  root.insertBefore(livePanel, planTabs);
  root.insertBefore(chatPanel, planTabs);
  renderChatEmpty(chatPanel);

  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-student-main-tab]');
    if (!button) return;
    activateTab(root, button.dataset.studentMainTab);
  });

  chatObserver?.disconnect();
  chatObserver = new MutationObserver(() => routeChatCard(root, chatPanel));
  chatObserver.observe(root, { childList: true, subtree: true });
  routeChatCard(root, chatPanel);

  activateTab(root, 'live');
  initialized = true;
  return { live: livePanel, agenda: root, chat: chatPanel };
}

export function showStudentPortalTab(target) {
  const root = document.querySelector('#student-content');
  if (!root) return;
  ensureStudentPortalMainTabs();
  activateTab(root, target);
}
