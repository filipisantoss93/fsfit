let initialized = false;
let chatObserver = null;
let liveLabelObserver = null;

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

function normalizeLiveTabLabel(nav) {
  const liveButton = nav?.querySelector('[data-student-main-tab="live"]');
  if (!liveButton) return;
  const state = liveButton.dataset.liveState || 'today';
  const label = state === 'active' ? 'Em aula' : state === 'waiting' ? 'Check-in' : 'Aula';
  if (liveButton.textContent.trim() !== label) liveButton.textContent = label;
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
    normalizeLiveTabLabel(existingNav);
    return { live: existingLive, agenda: root, chat: existingChat };
  }

  const planTabs = root.querySelector('.student-plan-tabs');
  if (!planTabs) return null;

  const planPanels = [...root.querySelectorAll(':scope > .student-tab-panel')];
  planTabs.dataset.studentMainAgendaContent = 'true';
  planPanels.forEach(panel => { panel.dataset.studentMainAgendaContent = 'true'; });

  const nav = document.createElement('nav');
  nav.className = 'student-main-tabs';
  nav.setAttribute('aria-label', 'Áreas do portal do aluno');
  nav.innerHTML = `
    <button class="student-main-tab active" type="button" data-student-main-tab="agenda">Início</button>
    <button class="student-main-tab" type="button" data-student-main-tab="live" data-live-state="today">Aula</button>
    <button class="student-main-tab" type="button" data-student-main-tab="chat">Chat</button>
  `;

  const livePanel = document.createElement('section');
  livePanel.id = 'student-main-live';
  livePanel.className = 'student-main-panel';
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

  liveLabelObserver?.disconnect();
  liveLabelObserver = new MutationObserver(() => normalizeLiveTabLabel(nav));
  liveLabelObserver.observe(nav, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['data-live-state']
  });
  normalizeLiveTabLabel(nav);

  chatObserver?.disconnect();
  chatObserver = new MutationObserver(() => routeChatCard(root, chatPanel));
  chatObserver.observe(root, { childList: true, subtree: true });
  routeChatCard(root, chatPanel);

  activateTab(root, 'agenda');
  initialized = true;
  return { live: livePanel, agenda: root, chat: chatPanel };
}

export function showStudentPortalTab(target) {
  const root = document.querySelector('#student-content');
  if (!root) return;
  ensureStudentPortalMainTabs();
  activateTab(root, target);
}
