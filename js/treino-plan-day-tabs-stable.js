const PAGE = window.location.pathname.split('/').pop() || 'index.html';
const DAY_NAMES = {
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
  7: 'Domingo'
};
const DAY_SHORT_NAMES = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 7: 'Dom' };
const STYLE_ID = 'fsfit-plan-day-tabs-stable-styles';

let selectedPlanDay = null;
let selectedWorkoutId = null;
let requestedPlanDay = null;
let frame = 0;
let pointerActive = false;
let pendingApply = false;

function currentWeekDay() {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

function waitFor(getter, timeout = 12000, interval = 80) {
  return new Promise(resolve => {
    const startedAt = Date.now();
    const check = () => {
      const value = getter();
      if (value || Date.now() - startedAt >= timeout) return resolve(value || null);
      window.setTimeout(check, interval);
    };
    check();
  });
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .workout-plan-day-tabs{
      display:grid;
      grid-template-columns:repeat(var(--plan-day-count,7),minmax(0,1fr));
      gap:5px;
      margin:0 0 10px;
      padding:6px;
      border:1px solid var(--border);
      border-radius:15px;
      background:var(--surface);
      touch-action:manipulation;
    }
    .workout-plan-day-tab{
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:1px;
      min-width:0;
      min-height:44px;
      padding:5px 2px;
      border:0;
      border-radius:10px;
      background:transparent;
      color:var(--muted);
      font:inherit;
      font-size:.78rem;
      font-weight:850;
      cursor:pointer;
      touch-action:manipulation;
      -webkit-tap-highlight-color:transparent;
    }
    .workout-plan-day-tab small{font-size:.58rem;font-weight:800;opacity:.78;pointer-events:none}
    .workout-plan-day-tab span{pointer-events:none}
    .workout-plan-day-tab.active{background:var(--primary);color:#061008}
    .workout-plan-day-tab.active small{opacity:.85}
    .workout-plan-day-tab:focus-visible{outline:2px solid rgba(50,215,75,.55);outline-offset:2px}
    .workout-plan-day-panel[hidden]{display:none!important}
    .workout-plan-day-panel{margin-top:0!important}
    .workout-page button,.workout-page a{touch-action:manipulation}
    @media(max-width:640px){
      .workout-plan-day-tabs{gap:3px;padding:5px}
      .workout-plan-day-tab{min-height:40px;font-size:.7rem}
      .workout-plan-day-tab small{font-size:.54rem}
    }
  `;
  document.head.appendChild(style);
}

function parseAllowedDays(workspace) {
  try {
    return [...new Set(JSON.parse(workspace.dataset.workoutDays || '[]')
      .map(Number)
      .filter(day => DAY_NAMES[day]))]
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function sectionDay(section) {
  const explicit = Number(section.dataset.editorDay);
  if (explicit) return explicit;
  const text = section.querySelector('.workout-day-header small')?.textContent || '';
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function exerciseCount(section) {
  return section?.querySelectorAll('.workout-exercise-row[data-open-exercise-detail]').length || 0;
}

function chooseDay(days, sections) {
  const requested = requestedPlanDay;
  requestedPlanDay = null;
  if (requested && days.includes(requested)) return requested;
  const today = currentWeekDay();
  if (days.includes(today)) return today;
  const firstWithExercises = days.find(day => exerciseCount(sections.get(day)) > 0);
  return firstWithExercises || days[0] || null;
}

function ensureTabNav(root) {
  let nav = document.querySelector('#workout-plan-day-tabs');
  if (!nav) {
    nav = document.createElement('nav');
    nav.id = 'workout-plan-day-tabs';
    nav.className = 'workout-plan-day-tabs';
    nav.setAttribute('role', 'tablist');
    nav.setAttribute('aria-label', 'Dias do plano selecionado');
  }
  if (nav.parentElement !== root.parentElement || nav.nextElementSibling !== root) {
    root.insertAdjacentElement('beforebegin', nav);
  }
  return nav;
}

function removeTabNav() {
  document.querySelector('#workout-plan-day-tabs')?.remove();
}

function syncTabButtons(nav, days, sections) {
  const daysSignature = days.join(',');
  if (nav.dataset.daysSignature !== daysSignature) {
    nav.replaceChildren(...days.map(day => {
      const button = document.createElement('button');
      button.id = `workout-plan-day-tab-${day}`;
      button.className = 'workout-plan-day-tab';
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.dataset.planDayTab = String(day);
      button.setAttribute('aria-controls', `workout-plan-day-panel-${day}`);

      const label = document.createElement('span');
      label.textContent = DAY_SHORT_NAMES[day];
      const count = document.createElement('small');
      count.dataset.planDayCount = String(day);
      button.append(label, count);
      return button;
    }));
    nav.dataset.daysSignature = daysSignature;
  }

  nav.style.setProperty('--plan-day-count', String(days.length));
  days.forEach(day => {
    const button = nav.querySelector(`[data-plan-day-tab="${day}"]`);
    if (!button) return;
    const active = day === selectedPlanDay;
    const count = exerciseCount(sections.get(day));
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.setAttribute('aria-label', `${DAY_NAMES[day]}, ${count} ${count === 1 ? 'exercício' : 'exercícios'}`);
    const countElement = button.querySelector('[data-plan-day-count]');
    if (countElement && countElement.textContent !== String(count)) countElement.textContent = String(count);
  });
}

function applyPlanDayTabs() {
  const root = document.querySelector('#workout-days');
  const workspace = document.querySelector('#active-workout-workspace');
  if (!root || !workspace) return;

  const workoutId = workspace.dataset.workoutId || '';
  const days = parseAllowedDays(workspace);
  const sections = new Map();
  root.querySelectorAll(':scope > .workout-day-section').forEach(section => {
    const day = sectionDay(section);
    if (day) sections.set(day, section);
  });

  if (!workoutId || !days.length || !sections.size) {
    removeTabNav();
    selectedWorkoutId = workoutId || null;
    selectedPlanDay = null;
    return;
  }

  if (selectedWorkoutId !== workoutId || !days.includes(selectedPlanDay)) {
    selectedWorkoutId = workoutId;
    selectedPlanDay = chooseDay(days, sections);
  }

  const nav = ensureTabNav(root);
  syncTabButtons(nav, days, sections);

  sections.forEach((section, day) => {
    const visible = day === selectedPlanDay && days.includes(day);
    const panelId = `workout-plan-day-panel-${day}`;
    const labelledBy = `workout-plan-day-tab-${day}`;
    if (section.id !== panelId) section.id = panelId;
    section.classList.add('workout-plan-day-panel');
    if (section.getAttribute('role') !== 'tabpanel') section.setAttribute('role', 'tabpanel');
    if (section.getAttribute('aria-labelledby') !== labelledBy) section.setAttribute('aria-labelledby', labelledBy);
    if (section.hidden === visible) section.hidden = !visible;
  });
}

function scheduleApply() {
  if (pointerActive) {
    pendingApply = true;
    return;
  }
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    pendingApply = false;
    applyPlanDayTabs();
  });
}

function finishPointerInteraction() {
  pointerActive = false;
  if (pendingApply) scheduleApply();
}

function selectPlanDay(day) {
  const workspace = document.querySelector('#active-workout-workspace');
  const days = workspace ? parseAllowedDays(workspace) : [];
  if (!days.includes(day) || selectedPlanDay === day) return;
  selectedPlanDay = day;
  requestedPlanDay = null;
  applyPlanDayTabs();
}

function preselectDayInExerciseModal(day) {
  if (!day) return;
  window.setTimeout(async () => {
    const modal = await waitFor(() => document.querySelector('#exercise-modal.open'), 2500);
    if (!modal) return;
    const options = [...modal.querySelectorAll('#exercise-weekday-options input')];
    if (!options.length) return;
    options.forEach(input => { input.checked = Number(input.value) === Number(day); });
    options.find(input => input.checked)?.dispatchEvent(new Event('change', { bubbles: true }));
  }, 0);
}

function bindActions() {
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('.workout-page')) return;
    pointerActive = true;

    const weeklyOpen = event.target.closest('[data-weekly-open-workout]');
    if (weeklyOpen) {
      requestedPlanDay = Number(document.querySelector('#workout-week-content [data-workout-weekday].active')?.dataset.workoutWeekday) || null;
    }
  }, { capture: true, passive: true });

  document.addEventListener('pointerup', finishPointerInteraction, { capture: true, passive: true });
  document.addEventListener('pointercancel', finishPointerInteraction, { capture: true, passive: true });

  document.addEventListener('click', event => {
    const tab = event.target.closest('[data-plan-day-tab]');
    if (tab) {
      event.preventDefault();
      selectPlanDay(Number(tab.dataset.planDayTab));
      return;
    }

    const addForDay = event.target.closest('[data-add-exercise-day]');
    if (addForDay) {
      selectedPlanDay = Number(addForDay.dataset.addExerciseDay) || selectedPlanDay;
      return;
    }

    if (event.target.closest('#open-exercise-modal')) preselectDayInExerciseModal(selectedPlanDay);
  });
}

async function boot() {
  if (PAGE !== 'treino-aluno.html') return;
  const root = await waitFor(() => document.querySelector('#workout-days'));
  const workspace = await waitFor(() => document.querySelector('#active-workout-workspace'));
  if (!root || !workspace) return;

  injectStyles();
  bindActions();

  // O renderizador principal substitui as seções diretamente dentro de #workout-days.
  // Não observamos toda a subárvore para evitar ciclos e reconstruções durante toques.
  new MutationObserver(scheduleApply).observe(root, { childList: true, subtree: false });
  new MutationObserver(scheduleApply).observe(workspace, {
    attributes: true,
    attributeFilter: ['data-workout-id', 'data-workout-days']
  });

  window.addEventListener('fsfit-workout-selection-changed', scheduleApply);
  window.addEventListener('fsfit-workout-exercises-updated', scheduleApply);
  window.addEventListener('fsfit-exercise-order-updated', scheduleApply);
  scheduleApply();
}

boot().catch(error => console.warn('Abas estáveis dos dias do plano indisponíveis:', error));
