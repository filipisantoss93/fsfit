let initialized = false;

function injectStyles() {
  if (document.querySelector('style[data-student-main-tabs]')) return;

  const style = document.createElement('style');
  style.dataset.studentMainTabs = 'true';
  style.textContent = `
    .student-main-tabs {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin: 18px 0 16px;
      padding: 8px;
      border: 1px solid var(--border);
      border-radius: 16px;
      background: rgba(255,255,255,.025);
    }
    .student-main-tab {
      min-width: 0;
      min-height: 52px;
      padding: 10px 8px;
      border: 0;
      border-radius: 12px;
      background: transparent;
      color: var(--muted);
      font: inherit;
      font-weight: 850;
      font-size: .92rem;
      cursor: pointer;
      transition: .2s ease;
    }
    .student-main-tab.active {
      background: var(--primary);
      color: #07120a;
    }
    .student-main-panel { display: none; }
    .student-main-panel.active { display: block; }
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
      .student-main-tabs { gap: 6px; padding: 6px; }
      .student-main-tab { min-height: 48px; font-size: .84rem; padding: 8px 5px; }
    }
  `;
  document.head.appendChild(style);
}

function activateTab(root, target) {
  root.querySelectorAll('[data-student-main-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.studentMainTab === target);
  });
  root.querySelectorAll('[data-student-main-panel]').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.studentMainPanel === target);
  });
}

export function ensureStudentPortalMainTabs() {
  const root = document.querySelector('#student-content');
  if (!root) return null;

  const existingLive = root.querySelector('#student-main-live');
  const existingAgenda = root.querySelector('#student-main-agenda');
  const existingChat = root.querySelector('#student-main-chat');
  if (initialized && existingLive && existingAgenda && existingChat) {
    return { live: existingLive, agenda: existingAgenda, chat: existingChat };
  }

  const planTabs = root.querySelector('.student-plan-tabs');
  if (!planTabs) return null;

  injectStyles();

  const nav = document.createElement('nav');
  nav.className = 'student-main-tabs';
  nav.setAttribute('aria-label', 'Áreas do portal do aluno');
  nav.innerHTML = `
    <button class="student-main-tab active" type="button" data-student-main-tab="live">Em aula</button>
    <button class="student-main-tab" type="button" data-student-main-tab="agenda">Agenda</button>
    <button class="student-main-tab" type="button" data-student-main-tab="chat">Chat</button>
  `;

  const livePanel = document.createElement('section');
  livePanel.id = 'student-main-live';
  livePanel.className = 'student-main-panel active';
  livePanel.dataset.studentMainPanel = 'live';

  const agendaPanel = document.createElement('section');
  agendaPanel.id = 'student-main-agenda';
  agendaPanel.className = 'student-main-panel';
  agendaPanel.dataset.studentMainPanel = 'agenda';

  const chatPanel = document.createElement('section');
  chatPanel.id = 'student-main-chat';
  chatPanel.className = 'student-main-panel';
  chatPanel.dataset.studentMainPanel = 'chat';
  chatPanel.innerHTML = `
    <section class="card student-main-empty" data-student-chat-empty>
      <h2>Chat da aula</h2>
      <p>O chat fica disponível enquanto uma aula estiver em andamento.</p>
    </section>
  `;

  const planPanels = [...root.querySelectorAll(':scope > .student-tab-panel')];
  root.insertBefore(nav, planTabs);
  root.insertBefore(livePanel, planTabs);
  root.insertBefore(agendaPanel, planTabs);
  root.insertBefore(chatPanel, planTabs);

  agendaPanel.appendChild(planTabs);
  planPanels.forEach(panel => agendaPanel.appendChild(panel));

  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-student-main-tab]');
    if (!button) return;
    activateTab(root, button.dataset.studentMainTab);
  });

  initialized = true;
  return { live: livePanel, agenda: agendaPanel, chat: chatPanel };
}

export function showStudentPortalTab(target) {
  const root = document.querySelector('#student-content');
  if (!root) return;
  ensureStudentPortalMainTabs();
  activateTab(root, target);
}
