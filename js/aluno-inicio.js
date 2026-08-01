import './shared-components.js';
import { ensureStudentPortalMainTabs, showStudentPortalTab } from './portal-aluno-tabs.js';

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

let syncScheduled = false;
let upcomingSignature = '';
let upcomingRows = [];

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
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
  const text = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function syncBottomActive(target) {
  document.querySelectorAll('.student-dashboard-bottom-nav button').forEach(button => {
    const value = button.dataset.dashboardMain;
    button.classList.toggle('active', value === target);
    button.setAttribute('aria-current', value === target ? 'page' : 'false');
  });
}

function activatePlanTab(target) {
  const tab = document.querySelector(`[data-student-tab="${target}"]`);
  const panel = document.querySelector(`[data-student-panel="${target}"]`);
  if (!tab || !panel) return false;

  document.querySelectorAll('[data-student-tab]').forEach(item => item.classList.toggle('active', item === tab));
  document.querySelectorAll('[data-student-panel]').forEach(item => item.classList.toggle('active', item === panel));
  showStudentPortalTab('agenda');
  syncBottomActive('inicio');
  requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  return true;
}

function activateMain(target) {
  if (target === 'inicio') {
    showStudentPortalTab('agenda');
    activatePlanTab('inicio');
  } else if (target === 'live') {
    showStudentPortalTab('live');
    syncBottomActive('live');
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  } else if (target === 'chat') {
    showStudentPortalTab('chat');
    syncBottomActive('chat');
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }
}

function agendaSummary(host, singular, plural, emptyText) {
  const rows = host?.querySelectorAll('.student-compact-row').length || 0;
  const headerText = host?.querySelector('.student-agenda-day-header span')?.textContent?.trim() || '';
  if (!rows) return { title: emptyText, detail: headerText || 'Nada programado para hoje', rows: 0 };
  return { title: `${rows} ${rows === 1 ? singular : plural}`, detail: headerText || 'Programado para hoje', rows };
}

function syncWhatsapp() {
  if (!homeWhatsapp || !settingsWhatsapp) return;
  const href = settingsWhatsapp.getAttribute('href') || '';
  if (href) {
    homeWhatsapp.href = href;
    homeWhatsapp.classList.add('visible');
  } else {
    homeWhatsapp.removeAttribute('href');
    homeWhatsapp.classList.remove('visible');
  }
}

function ensureDashboardChrome() {
  if (!content) return;
  ensureStudentPortalMainTabs();

  const profile = document.querySelector('.student-profile-summary');
  if (profile && !profile.querySelector('.student-trainer-dashboard-chip')) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'student-trainer-dashboard-chip';
    chip.dataset.dashboardAction = 'personal';
    chip.innerHTML = '<span class="student-trainer-dashboard-avatar">PT</span><span><small>Seu personal</small><strong>Personal</strong></span><b aria-hidden="true">◉</b>';
    profile.appendChild(chip);
  }

  if (!document.querySelector('.student-dashboard-summary')) {
    const summary = document.createElement('section');
    summary.className = 'student-dashboard-summary';
    summary.innerHTML = '<div><span class="student-dashboard-summary-icon">◒</span><p><strong id="student-dashboard-exercises">0</strong><small>exercícios hoje</small></p></div><div><span class="student-dashboard-summary-icon">◎</span><p><strong id="student-dashboard-progress">0%</strong><small>Meta semanal</small></p></div><button type="button" data-plan-target="dieta"><span class="student-dashboard-summary-icon">♨</span><p><strong id="student-dashboard-meals">0</strong><small>refeições hoje</small></p></button>';
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
    quick.innerHTML = '<header>ACESSOS RÁPIDOS</header><div class="student-dashboard-quick-grid"><button type="button" data-plan-target="treino"><span>⌁</span>Treinos</button><button type="button" data-dashboard-action="settings"><span>◉</span>Meu perfil</button><button type="button" data-plan-target="dieta"><span>☑</span>Alimentação</button><button type="button" data-plan-target="observacoes"><span>▤</span>Orientações</button></div>';
    homeObservation?.insertAdjacentElement('afterend', quick);
  }

  if (!document.querySelector('.student-dashboard-bottom-nav')) {
    const bottom = document.createElement('nav');
    bottom.className = 'student-dashboard-bottom-nav';
    bottom.setAttribute('aria-label', 'Navegação principal');
    bottom.innerHTML = '<button class="active" type="button" data-dashboard-main="inicio" aria-current="page"><span>⌂</span>Início</button><button type="button" data-dashboard-main="live" aria-current="false"><span>♜</span>Aula</button><button type="button" data-dashboard-main="chat" aria-current="false"><span>◌</span>Chat</button><button type="button" data-dashboard-action="more" aria-current="false"><span>⠿</span>Mais</button>';
    document.body.appendChild(bottom);
  }
}

function handleNavigation(event) {
  const control = event.target.closest('[data-dashboard-main], [data-dashboard-action], [data-plan-target], [data-student-home-target], #student-home-open-workout, [data-upcoming-index]');
  if (!control) return;

  const isDashboardControl = control.matches('[data-dashboard-main], [data-dashboard-action], [data-plan-target], [data-upcoming-index]');
  if (isDashboardControl) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  if (control.dataset.dashboardMain) {
    activateMain(control.dataset.dashboardMain);
    return;
  }

  const planTarget = control.dataset.planTarget || control.dataset.studentHomeTarget;
  if (planTarget) {
    event.preventDefault();
    activatePlanTab(planTarget);
    return;
  }

  if (control.id === 'student-home-open-workout') {
    event.preventDefault();
    activateMain('live');
    return;
  }

  if (control.dataset.upcomingIndex != null) {
    const source = upcomingRows[Number(control.dataset.upcomingIndex)];
    activatePlanTab('treino');
    requestAnimationFrame(() => source?.click());
    return;
  }

  const action = control.dataset.dashboardAction;
  if (action === 'settings' || action === 'more') {
    document.querySelector('#student-settings-button')?.click();
    syncBottomActive('more');
  } else if (action === 'personal') {
    if (settingsWhatsapp?.href) window.open(settingsWhatsapp.href, '_blank', 'noopener');
    else document.querySelector('#student-settings-button')?.click();
  }
}

document.addEventListener('click', handleNavigation, true);

document.addEventListener('student-main-tab-change', event => {
  const target = event.detail?.target;
  if (target === 'agenda') syncBottomActive('inicio');
  if (target === 'live') syncBottomActive('live');
  if (target === 'chat') syncBottomActive('chat');
});

function renderUpcoming() {
  const host = document.querySelector('#student-dashboard-upcoming');
  if (!host) return;

  upcomingRows = [...(workoutContent?.querySelectorAll('.student-compact-row') || [])].slice(0, 3);
  const signature = upcomingRows.map(row => row.textContent.trim()).join('|');
  if (signature === upcomingSignature) return;
  upcomingSignature = signature;

  if (!upcomingRows.length) {
    host.innerHTML = '<p class="student-empty-inline">Nenhum compromisso programado.</p>';
    return;
  }

  host.innerHTML = upcomingRows.map((row, index) => {
    const title = row.querySelector('strong')?.textContent?.trim() || `Treino ${index + 1}`;
    const detail = row.querySelector('.student-compact-main span')?.textContent?.trim() || 'Programação disponível';
    return `<button class="student-dashboard-upcoming-row" type="button" data-upcoming-index="${index}"><span>♜</span><div><strong>${title}</strong><small>${detail}</small></div><b>›</b></button>`;
  }).join('');
}

function syncHome() {
  if (!content || content.classList.contains('hidden')) return;
  ensureDashboardChrome();

  const name = studentName?.textContent?.trim() || 'Aluno';
  const trainer = trainerName?.textContent?.trim() || 'seu personal';
  setText(homeTitle, `${greeting()}, ${firstName(name)}`);
  setText(homeDate, formattedToday());
  setText(homeSubtitle, `Veja o que ${trainer} preparou para você hoje.`);

  const chip = document.querySelector('.student-trainer-dashboard-chip');
  if (chip) {
    setText(chip.querySelector('strong'), trainer);
    setText(chip.querySelector('.student-trainer-dashboard-avatar'), initials(trainer));
  }

  const workout = agendaSummary(workoutContent, 'exercício', 'exercícios', 'Dia de descanso');
  setText(workoutStatus, workout.title);
  setText(workoutDetail, workout.rows ? 'Abrir treino de hoje' : 'Consulte os próximos dias');
  setText(primaryWorkoutButton, workout.rows ? 'Iniciar treino de hoje' : 'Ver área de aula');
  setText(document.querySelector('#student-dashboard-exercises'), String(workout.rows));

  const diet = agendaSummary(dietContent, 'refeição', 'refeições', 'Sem refeições hoje');
  setText(dietStatus, diet.title);
  setText(dietDetail, diet.rows ? 'Ver alimentação de hoje' : 'Consulte o plano alimentar');
  setText(document.querySelector('#student-dashboard-meals'), String(diet.rows));

  const observationText = observations?.textContent?.trim() || '';
  const hasObservation = Boolean(observationText && !/Nenhuma (observação|orientação)/i.test(observationText));
  homeObservation?.classList.toggle('hidden', !hasObservation);
  if (hasObservation) setText(homeObservationText, observationText);

  renderUpcoming();
  syncWhatsapp();
}

function scheduleSync() {
  if (syncScheduled) return;
  syncScheduled = true;
  requestAnimationFrame(() => {
    syncScheduled = false;
    syncHome();
  });
}

const dataObserver = new MutationObserver(scheduleSync);
if (workoutContent) dataObserver.observe(workoutContent, { childList: true, subtree: true });
if (dietContent) dataObserver.observe(dietContent, { childList: true, subtree: true });
if (observations) dataObserver.observe(observations, { childList: true, characterData: true, subtree: true });
if (settingsWhatsapp) dataObserver.observe(settingsWhatsapp, { attributes: true, attributeFilter: ['href'] });

ensureDashboardChrome();
window.addEventListener('load', scheduleSync, { once: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(); });
setTimeout(scheduleSync, 150);
setTimeout(scheduleSync, 700);
