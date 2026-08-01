import './shared-components.js';

const content = document.querySelector('#student-content');
const studentName = document.querySelector('#student-name');
const trainerName = document.querySelector('#trainer-name');
const workoutContent = document.querySelector('#workout-content');
const dietContent = document.querySelector('#diet-content');
const observations = document.querySelector('#student-observations');
const homeTitle = document.querySelector('#student-home-title');
const homeDate = document.querySelector('#student-home-date');
const homeSubtitle = document.querySelector('#student-home-subtitle');
const workoutStatus = document.querySelector('#student-home-workout-status');
const workoutDetail = document.querySelector('#student-home-workout-detail');
const dietStatus = document.querySelector('#student-home-diet-status');
const dietDetail = document.querySelector('#student-home-diet-detail');
const homeObservation = document.querySelector('#student-home-observation');
const homeObservationText = document.querySelector('#student-home-observation-text');
const homeWhatsapp = document.querySelector('#student-home-whatsapp');
const settingsWhatsapp = document.querySelector('#whatsapp-button');
const primaryWorkoutButton = document.querySelector('#student-home-open-workout');

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function setClass(node, className, enabled) {
  node?.classList.toggle(className, Boolean(enabled));
}

function firstName(value = '') {
  return String(value).trim().split(/\s+/)[0] || 'Aluno';
}

function initials(value = '') {
  return String(value).trim().split(/\s+/).filter(Boolean).slice(0, 2).map(item => item[0]).join('').toUpperCase() || 'PT';
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function formattedToday() {
  const text = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function removeDuplicateMenus() {
  document.querySelectorAll('.student-dashboard-nav').forEach(node => node.remove());

  document.querySelectorAll('nav').forEach(nav => {
    if (nav.classList.contains('student-dashboard-bottom-nav')) return;
    if (nav.classList.contains('student-plan-tabs')) return;

    const labels = [...nav.querySelectorAll('button, a')]
      .map(item => item.textContent.trim().toLowerCase())
      .filter(Boolean);

    const isStudentDuplicate = labels.includes('início') && labels.includes('aula') && labels.includes('chat');
    if (isStudentDuplicate) nav.remove();
  });
}

function syncBottomActive(target) {
  document.querySelectorAll('.student-dashboard-bottom-nav button').forEach(button => {
    const buttonTarget = button.dataset.dashboardTarget || button.dataset.dashboardAction;
    button.classList.toggle('active', buttonTarget === target);
  });
}

function activateTab(target) {
  const tab = document.querySelector(`[data-student-tab="${target}"]`);
  if (!tab) return false;
  tab.click();
  syncBottomActive(target);
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  return true;
}

function agendaSummary(host, singular, plural, emptyText) {
  const rows = host?.querySelectorAll('.student-compact-row').length || 0;
  const headerText = host?.querySelector('.student-agenda-day-header span')?.textContent?.trim() || '';
  if (!rows) return { title: emptyText, detail: headerText || 'Nada programado para hoje', rows: 0 };
  return {
    title: `${rows} ${rows === 1 ? singular : plural}`,
    detail: headerText || 'Programado para hoje',
    rows,
  };
}

function syncWhatsapp() {
  if (!homeWhatsapp || !settingsWhatsapp) return;
  const href = settingsWhatsapp.getAttribute('href') || '';
  if (href) {
    homeWhatsapp.setAttribute('href', href);
    setClass(homeWhatsapp, 'visible', true);
  } else {
    homeWhatsapp.removeAttribute('href');
    setClass(homeWhatsapp, 'visible', false);
  }
}

function openChat() {
  const chatTrigger = document.querySelector('[data-student-tab="chat"], #student-chat-button, [data-open-student-chat], [data-aula-chat-trigger]');
  if (chatTrigger) {
    chatTrigger.click();
    syncBottomActive('chat');
    return;
  }

  const href = homeWhatsapp?.getAttribute('href') || settingsWhatsapp?.getAttribute('href');
  if (href) window.open(href, '_blank', 'noopener');
}

function ensureDashboardChrome() {
  if (!content) return;

  removeDuplicateMenus();

  const profile = document.querySelector('.student-profile-summary');
  if (profile && !profile.querySelector('.student-trainer-dashboard-chip')) {
    const trainerChip = document.createElement('a');
    trainerChip.className = 'student-trainer-dashboard-chip';
    trainerChip.href = '#student-home-observation';
    trainerChip.innerHTML = '<span class="student-trainer-dashboard-avatar">PT</span><span><small>Seu personal</small><strong>Personal</strong></span><b aria-hidden="true">◉</b>';
    profile.appendChild(trainerChip);
  }

  if (!document.querySelector('.student-dashboard-summary')) {
    const summary = document.createElement('section');
    summary.className = 'student-dashboard-summary';
    summary.innerHTML = '<div><span class="student-dashboard-summary-icon">◒</span><p><strong id="student-dashboard-exercises">0</strong><small>exercícios hoje</small></p></div><div><span class="student-dashboard-summary-icon">◎</span><p><strong id="student-dashboard-progress">0%</strong><small>Meta semanal</small></p></div><button type="button" data-dashboard-target="dieta"><span class="student-dashboard-summary-icon">♨</span><p><strong id="student-dashboard-meals">0</strong><small>refeições hoje</small></p></button>';
    document.querySelector('.student-today-grid')?.insertAdjacentElement('afterend', summary);
  }

  if (!document.querySelector('#student-dashboard-upcoming')) {
    const upcoming = document.createElement('section');
    upcoming.className = 'student-dashboard-section';
    upcoming.innerHTML = '<header>PRÓXIMOS COMPROMISSOS</header><div id="student-dashboard-upcoming" class="student-dashboard-upcoming"></div>';
    homeObservation?.insertAdjacentElement('beforebegin', upcoming);
  }

  if (!document.querySelector('.student-dashboard-quick-grid')) {
    const quick = document.createElement('section');
    quick.className = 'student-dashboard-section';
    quick.innerHTML = '<header>ACESSOS RÁPIDOS</header><div class="student-dashboard-quick-grid"><button type="button" data-dashboard-target="treino"><span>⌁</span>Meu progresso</button><button type="button" data-dashboard-action="settings"><span>◉</span>Medidas</button><button type="button" data-dashboard-action="settings"><span>☑</span>Avaliações</button><button type="button" data-dashboard-target="observacoes"><span>▤</span>Anotações</button></div>';
    homeObservation?.insertAdjacentElement('afterend', quick);
  }

  if (!document.querySelector('.student-dashboard-bottom-nav')) {
    const bottom = document.createElement('nav');
    bottom.className = 'student-dashboard-bottom-nav';
    bottom.setAttribute('aria-label', 'Navegação inferior');
    bottom.innerHTML = '<button class="active" type="button" data-dashboard-target="inicio"><span>⌂</span>Início</button><button type="button" data-dashboard-target="treino"><span>♜</span>Aula</button><button type="button" data-dashboard-action="chat"><span>◌</span>Chat</button><button type="button" data-dashboard-action="more"><span>⠿</span>Mais</button>';
    document.body.appendChild(bottom);
  }
}

function handleDashboardNavigation(event) {
  const button = event.target.closest('.student-dashboard-bottom-nav button, [data-dashboard-target], [data-dashboard-action]');
  if (!button) return;

  const target = button.dataset.dashboardTarget;
  const action = button.dataset.dashboardAction;

  if (target) {
    event.preventDefault();
    activateTab(target);
    return;
  }

  if (action === 'chat') {
    event.preventDefault();
    openChat();
    return;
  }

  if (action === 'settings' || action === 'more') {
    event.preventDefault();
    document.querySelector('#student-settings-button')?.click();
    syncBottomActive('more');
  }
}

document.addEventListener('click', handleDashboardNavigation);

document.querySelectorAll('[data-student-tab]').forEach(tab => {
  tab.addEventListener('click', () => syncBottomActive(tab.dataset.studentTab));
});

function renderUpcoming() {
  const host = document.querySelector('#student-dashboard-upcoming');
  if (!host) return;
  const rows = [...(workoutContent?.querySelectorAll('.student-compact-row') || [])].slice(0, 3);

  if (!rows.length) {
    host.innerHTML = '<p class="student-empty-inline">Nenhum compromisso programado.</p>';
    return;
  }

  host.innerHTML = rows.map((row, index) => {
    const title = row.querySelector('strong')?.textContent?.trim() || `Treino ${index + 1}`;
    const detail = row.querySelector('.student-compact-main span')?.textContent?.trim() || 'Programação disponível';
    return `<button class="student-dashboard-upcoming-row" type="button" data-upcoming-index="${index}"><span>♜</span><div><strong>${title}</strong><small>${detail}</small></div><b>›</b></button>`;
  }).join('');

  host.querySelectorAll('[data-upcoming-index]').forEach((button, index) => {
    button.addEventListener('click', () => rows[index]?.click());
  });
}

function syncHome() {
  if (!content || content.classList.contains('hidden')) return;
  ensureDashboardChrome();

  const name = studentName?.textContent?.trim() || 'Aluno';
  const trainer = trainerName?.textContent?.trim() || 'seu personal';
  setText(homeTitle, `${greeting()}, ${firstName(name)}`);
  setText(homeDate, formattedToday());
  setText(homeSubtitle, `Veja o que ${trainer} preparou para você hoje.`);

  const trainerChip = document.querySelector('.student-trainer-dashboard-chip');
  if (trainerChip) {
    setText(trainerChip.querySelector('strong'), trainer);
    setText(trainerChip.querySelector('.student-trainer-dashboard-avatar'), initials(trainer));
  }

  const workout = agendaSummary(workoutContent, 'exercício', 'exercícios', 'Dia de descanso');
  setText(workoutStatus, workout.title);
  setText(workoutDetail, workout.rows ? 'Abrir treino de hoje' : 'Consulte os próximos dias');
  setText(primaryWorkoutButton, workout.rows ? 'Iniciar treino de hoje' : 'Ver agenda de treinos');
  setText(document.querySelector('#student-dashboard-exercises'), String(workout.rows));

  const diet = agendaSummary(dietContent, 'refeição', 'refeições', 'Sem refeições hoje');
  setText(dietStatus, diet.title);
  setText(dietDetail, diet.rows ? 'Ver alimentação de hoje' : 'Consulte o plano alimentar');
  setText(document.querySelector('#student-dashboard-meals'), String(diet.rows));

  const observationText = observations?.textContent?.trim() || '';
  if (homeObservation && homeObservationText) {
    const hasObservation = Boolean(observationText && !/Nenhuma (observação|orientação)/i.test(observationText));
    setClass(homeObservation, 'hidden', !hasObservation);
    if (hasObservation) setText(homeObservationText, observationText);
  }

  renderUpcoming();
  syncWhatsapp();
  removeDuplicateMenus();
}

document.querySelectorAll('[data-student-home-target]').forEach(button => {
  button.addEventListener('click', () => activateTab(button.dataset.studentHomeTarget));
});
primaryWorkoutButton?.addEventListener('click', () => activateTab('treino'));

let syncScheduled = false;
function scheduleSync() {
  if (syncScheduled) return;
  syncScheduled = true;
  requestAnimationFrame(() => {
    syncScheduled = false;
    syncHome();
  });
}

const observer = new MutationObserver(scheduleSync);
if (content) observer.observe(content, { subtree: true, childList: true, attributes: true, characterData: true });
if (settingsWhatsapp) observer.observe(settingsWhatsapp, { attributes: true, attributeFilter: ['href', 'class'] });

window.addEventListener('load', scheduleSync);
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(); });
setTimeout(scheduleSync, 250);
setTimeout(scheduleSync, 900);
