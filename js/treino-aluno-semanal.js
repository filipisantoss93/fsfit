import { supabase } from './supabase.js';

const alunoId = new URLSearchParams(location.search).get('id');
const dayNames = {
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
  7: 'Domingo'
};
const dayShortNames = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 7: 'Dom' };

let selectedDay = currentWeekDay();
let currentView = 'plans';
let activeWorkoutsCache = [];
let weeklyExercisesCache = [];
let enhanceFrame = 0;
let weekRefreshTimer = 0;
let enhancingDays = false;

function currentWeekDay() {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function waitFor(getter, timeout = 10000, interval = 80) {
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

function effectiveExercise(row = {}) {
  const exercise = row.exercicios || {};
  return {
    nome: row.exercicio_nome_snapshot ?? exercise.nome ?? '',
    grupo_muscular: row.grupo_muscular_snapshot ?? exercise.grupo_muscular ?? '',
    equipamento: row.equipamento_snapshot ?? exercise.equipamento ?? ''
  };
}

function injectEditorStyles() {
  if (document.querySelector('link[data-workout-editor-ux]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/treino-editor-ux.css?v=20260725-editor-ux1';
  link.dataset.workoutEditorUx = 'true';
  document.head.appendChild(link);
}

function setupEditorViews() {
  const message = document.querySelector('#workout-message');
  const plansCard = document.querySelector('.workout-plans-card');
  const workspace = document.querySelector('#active-workout-workspace');
  const daysCard = document.querySelector('.workout-active-card');
  if (!message || !plansCard || !workspace || !daysCard) return null;

  let nav = document.querySelector('#workout-editor-view-nav');
  if (!nav) {
    nav = document.createElement('nav');
    nav.id = 'workout-editor-view-nav';
    nav.className = 'workout-editor-view-nav';
    nav.setAttribute('aria-label', 'Modo do editor de treinos');
    nav.innerHTML = `
      <button class="workout-editor-view-button active" type="button" data-workout-view-button="plans" aria-pressed="true">Planos<small>Adicionar e editar</small></button>
      <button class="workout-editor-view-button" type="button" data-workout-view-button="week" aria-pressed="false">Semana<small>Conferir rotina</small></button>`;
    message.insertAdjacentElement('afterend', nav);
  }

  plansCard.dataset.workoutEditorView = 'plans';
  workspace.dataset.workoutEditorView = 'plans';
  daysCard.dataset.workoutEditorView = 'plans';

  let weekCard = document.querySelector('#workout-week-card');
  if (!weekCard) {
    weekCard = document.createElement('section');
    weekCard.id = 'workout-week-card';
    weekCard.className = 'card workout-week-card';
    weekCard.dataset.workoutEditorView = 'week';
    weekCard.hidden = true;
    weekCard.innerHTML = `
      <div class="workout-week-heading">
        <div><small>ROTINA COMPLETA</small><h2>Semana do aluno</h2><p>Confira todos os planos aplicados. Para alterar exercícios, abra o plano correspondente.</p></div>
      </div>
      <div id="workout-week-content"><p class="workout-week-empty">Carregando semana...</p></div>`;
    daysCard.insertAdjacentElement('afterend', weekCard);
  }

  nav.addEventListener('click', event => {
    const button = event.target.closest('[data-workout-view-button]');
    if (!button) return;
    setEditorView(button.dataset.workoutViewButton);
  });

  window.fsfitSetWorkoutEditorView = setEditorView;
  setEditorView('plans');
  return { nav, plansCard, workspace, daysCard, weekCard };
}

function setEditorView(view) {
  currentView = view === 'week' ? 'week' : 'plans';
  document.querySelectorAll('[data-workout-editor-view]').forEach(section => {
    section.hidden = section.dataset.workoutEditorView !== currentView;
  });
  document.querySelectorAll('[data-workout-view-button]').forEach(button => {
    const active = button.dataset.workoutViewButton === currentView;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (currentView === 'week') scheduleWeekRefresh(0);
}

function normalizePlanMeta(row) {
  const days = row.querySelector('.workout-plan-row-meta');
  if (days && days.dataset.normalized !== 'true') {
    const values = days.textContent.split(',').map(value => value.trim()).filter(Boolean);
    if (values.length > 1) days.textContent = `${values.slice(0, -1).join(', ')} e ${values.at(-1)}`;
    days.dataset.normalized = 'true';
  }
  const note = row.querySelector('.workout-plan-row-note');
  if (note && note.dataset.normalized !== 'true') {
    const normalized = note.textContent
      .replace(/ · (\d{2}\/\d{2}\/\d{4}) → Não informada$/, ' · Desde $1 · Sem término')
      .replace(/ · (\d{2}\/\d{2}\/\d{4}) → (\d{2}\/\d{2}\/\d{4})$/, ' · $1 a $2');
    if (normalized !== note.textContent) note.textContent = normalized;
    note.dataset.normalized = 'true';
  }
}

function enhancePlanList() {
  const list = document.querySelector('#workout-list');
  if (!list) return;

  const newButton = document.querySelector('#new-workout-button');
  if (newButton) {
    newButton.classList.remove('btn-primary');
    newButton.classList.add('btn-outline');
    newButton.textContent = '+ Criar plano';
  }

  const guidance = document.querySelector('.workout-draft-guidance');
  if (guidance) guidance.textContent = 'O plano permanece como rascunho até ter exercícios em todos os dias e ser aplicado ao aluno.';

  list.querySelectorAll('.workout-plan-inline-actions').forEach(actions => {
    const row = actions.previousElementSibling;
    if (!row?.matches('.workout-plan-row.selected') || actions.dataset.workoutId !== row.dataset.selectWorkout) actions.remove();
  });
  list.querySelectorAll('.workout-plan-row').forEach(row => {
    normalizePlanMeta(row);
    const selected = row.classList.contains('selected');
    const title = row.querySelector('.workout-plan-row-title');
    const arrow = row.querySelector('.workout-row-arrow');
    if (selected && title) {
      if (!title.querySelector('.workout-plan-selected-label')) {
        const label = document.createElement('span');
        label.className = 'workout-plan-selected-label';
        label.textContent = 'SELECIONADO';
        title.appendChild(label);
      }
      if (arrow && arrow.textContent !== '✓') arrow.textContent = '✓';

      const id = row.dataset.selectWorkout;
      const currentActions = row.nextElementSibling;
      if (!currentActions?.matches('.workout-plan-inline-actions') || currentActions.dataset.workoutId !== id) {
        const actions = document.createElement('div');
        actions.className = 'workout-plan-inline-actions';
        actions.dataset.workoutId = id;
        actions.innerHTML = `
          <button type="button" data-quick-plan-edit="${esc(id)}">Editar informações</button>
          <button class="is-danger" type="button" data-quick-plan-delete="${esc(id)}">Excluir plano</button>`;
        row.insertAdjacentElement('afterend', actions);
      }
    } else {
      row.querySelector('.workout-selected-label')?.remove();
      if (arrow && arrow.textContent !== '›') arrow.textContent = '›';
    }
  });

  const contextCopy = document.querySelector('.workout-editor-context span:last-child');
  if (contextCopy) contextCopy.textContent = 'Plano selecionado para edição';
}

function parseDayFromSection(section) {
  const explicit = Number(section.dataset.editorDay);
  if (explicit) return explicit;
  const text = section.querySelector('.workout-day-header small')?.textContent || '';
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function createEmptyDaySection(day) {
  const section = document.createElement('section');
  section.className = 'workout-day-section workout-day-placeholder';
  section.dataset.editorDay = String(day);
  section.innerHTML = `
    <div class="workout-day-header"><div><small>DIA ${day}</small><strong>${dayNames[day]}</strong></div><span>0 exercícios</span></div>
    <div class="workout-exercise-list"></div>
    <p class="workout-day-empty-message">Nenhum exercício neste dia.</p>`;
  return section;
}

function enhanceExerciseRows(section) {
  const list = section.querySelector('.workout-exercise-list');
  if (!list) return;
  list.querySelectorAll('.workout-exercise-inline-actions').forEach(actions => {
    const row = actions.previousElementSibling;
    if (!row?.matches('.workout-exercise-row[data-open-exercise-detail]') || actions.dataset.exerciseId !== row.dataset.openExerciseDetail) actions.remove();
  });
  const rows = [...list.querySelectorAll(':scope > .workout-exercise-row[data-open-exercise-detail]')];
  rows.forEach(row => {
    const id = row.dataset.openExerciseDetail;
    const currentActions = row.nextElementSibling;
    if (currentActions?.matches('.workout-exercise-inline-actions') && currentActions.dataset.exerciseId === id) return;
    const actions = document.createElement('div');
    actions.className = 'workout-exercise-inline-actions';
    actions.dataset.exerciseId = id;
    actions.innerHTML = `
      <button type="button" data-quick-exercise-edit="${esc(id)}">Editar</button>
      <button class="is-danger" type="button" data-quick-exercise-delete="${esc(id)}">Remover</button>`;
    row.insertAdjacentElement('afterend', actions);
  });

  let empty = section.querySelector('.workout-day-empty-message');
  if (rows.length) empty?.remove();
  else if (!empty) {
    empty = document.createElement('p');
    empty.className = 'workout-day-empty-message';
    empty.textContent = 'Nenhum exercício neste dia.';
    list.insertAdjacentElement('afterend', empty);
  }
}

function enhancePlanDays() {
  const root = document.querySelector('#workout-days');
  const workspace = document.querySelector('#active-workout-workspace');
  if (!root || !workspace || enhancingDays) return;
  const workoutId = workspace.dataset.workoutId;
  if (!workoutId) return;

  let allowedDays = [];
  try {
    allowedDays = JSON.parse(workspace.dataset.workoutDays || '[]').map(Number).filter(day => dayNames[day]);
  } catch {
    allowedDays = [];
  }
  if (!allowedDays.length) return;

  enhancingDays = true;
  try {
    const sections = new Map();
    root.querySelectorAll(':scope > .workout-day-section').forEach(section => {
      const day = parseDayFromSection(section);
      if (day) {
        section.dataset.editorDay = String(day);
        sections.set(day, section);
      }
    });

    const orderedDays = [...new Set(allowedDays)].sort((a, b) => a - b);
    const currentDirectChildren = [...root.children];
    const currentDays = currentDirectChildren.filter(child => child.matches?.('.workout-day-section')).map(parseDayFromSection);
    const needsRebuild = currentDirectChildren.length !== orderedDays.length || currentDays.some((day, index) => day !== orderedDays[index]);
    const fragment = document.createDocumentFragment();
    orderedDays.forEach(day => {
      const section = sections.get(day) || createEmptyDaySection(day);
      const header = section.querySelector('.workout-day-header');
      const count = section.querySelectorAll('.workout-exercise-row[data-open-exercise-detail]').length;
      let controls = header?.querySelector('.workout-day-controls');
      if (!controls && header) {
        controls = document.createElement('div');
        controls.className = 'workout-day-controls';
        const countElement = header.querySelector(':scope > span');
        if (countElement) controls.appendChild(countElement);
        header.appendChild(controls);
      }
      const countElement = controls?.querySelector('span');
      if (countElement) countElement.textContent = `${count} ${count === 1 ? 'exercício' : 'exercícios'}`;
      if (controls && !controls.querySelector('[data-add-exercise-day]')) {
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'workout-day-add-button';
        add.dataset.addExerciseDay = String(day);
        add.textContent = '+ Adicionar';
        controls.appendChild(add);
      }
      enhanceExerciseRows(section);
      fragment.appendChild(section);
    });

    if (needsRebuild) root.replaceChildren(fragment);
  } finally {
    window.setTimeout(() => { enhancingDays = false; }, 0);
  }
}

function scheduleEnhance() {
  if (enhanceFrame) return;
  enhanceFrame = requestAnimationFrame(() => {
    enhanceFrame = 0;
    enhancePlanList();
    enhancePlanDays();
  });
}

function createDaySelector() {
  return `<div class="workout-weekday-nav" role="tablist" aria-label="Dias da semana">
    ${Object.keys(dayNames).map(day => {
      const number = Number(day);
      const active = number === selectedDay;
      return `<button class="workout-weekday-button ${active ? 'active' : ''}" type="button" role="tab" data-workout-weekday="${number}" aria-selected="${String(active)}">${dayShortNames[number]}</button>`;
    }).join('')}
  </div>`;
}

function renderWeeklyExercise(row) {
  const exercise = effectiveExercise(row);
  const details = [
    row.series ? `${row.series} séries` : null,
    row.repeticoes ? `${row.repeticoes} rep.` : null,
    row.carga,
    row.descanso_segundos ? `${row.descanso_segundos}s` : null
  ].filter(Boolean).join(' • ');
  return `<div class="workout-week-exercise-row">
    <span class="workout-week-exercise-order">${row.ordem || '—'}</span>
    <span class="workout-week-exercise-copy"><strong>${esc(exercise.nome || 'Exercício')}</strong><span>${esc(details || [exercise.grupo_muscular, exercise.equipamento].filter(Boolean).join(' • ') || 'Sem configuração adicional')}</span></span>
  </div>`;
}

function renderSelectedWeekDay() {
  const host = document.querySelector('#workout-week-content');
  if (!host) return;
  const workoutsForDay = activeWorkoutsCache.filter(workout => (workout.dias_semana || []).map(Number).includes(selectedDay));
  const totalExercises = workoutsForDay.reduce((total, workout) => total + weeklyExercisesCache.filter(row => row.treino_id === workout.id && Number(row.dia_semana) === selectedDay).length, 0);

  const plans = workoutsForDay.length ? workoutsForDay.map(workout => {
    const exercises = weeklyExercisesCache
      .filter(row => row.treino_id === workout.id && Number(row.dia_semana) === selectedDay)
      .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
    return `<article class="workout-week-plan">
      <div class="workout-week-plan-head">
        <div><strong>${esc(workout.nome || 'Plano de treino')}</strong><small>${exercises.length} ${exercises.length === 1 ? 'exercício' : 'exercícios'} neste dia</small></div>
        <button class="workout-week-open-button" type="button" data-weekly-open-workout="${esc(workout.id)}">Abrir plano</button>
      </div>
      ${exercises.length ? `<div class="workout-week-exercise-list">${exercises.map(renderWeeklyExercise).join('')}</div>` : '<p class="workout-week-empty">Este plano ainda não possui exercícios neste dia.</p>'}
    </article>`;
  }).join('') : '<p class="workout-week-empty">Dia de descanso. Nenhum plano aplicado.</p>';

  host.innerHTML = `${createDaySelector()}
    <section class="workout-week-day-card">
      <div class="workout-week-day-head"><h3>${dayNames[selectedDay]}</h3><span>${workoutsForDay.length} ${workoutsForDay.length === 1 ? 'plano' : 'planos'} · ${totalExercises} ${totalExercises === 1 ? 'exercício' : 'exercícios'}</span></div>
      <div class="workout-week-plan-list">${plans}</div>
    </section>`;
}

async function loadActiveWeek() {
  if (!alunoId || !document.querySelector('#workout-week-content')) return;
  const { data: workouts, error: workoutError } = await supabase
    .from('treinos')
    .select('id,nome,dias_semana,data_inicio,data_fim,status,modelo,updated_at')
    .eq('aluno_id', alunoId)
    .eq('status', 'ativo')
    .eq('modelo', false)
    .order('updated_at', { ascending: false });
  if (workoutError) throw workoutError;

  activeWorkoutsCache = workouts || [];
  const ids = activeWorkoutsCache.map(workout => workout.id);
  if (!ids.length) {
    weeklyExercisesCache = [];
    renderSelectedWeekDay();
    return;
  }

  const { data: exercises, error: exerciseError } = await supabase
    .from('treino_exercicios')
    .select('id,treino_id,exercicio_id,dia_semana,ordem,series,repeticoes,carga,descanso_segundos,observacoes,exercicio_nome_snapshot,grupo_muscular_snapshot,equipamento_snapshot,exercicios(nome,grupo_muscular,equipamento)')
    .in('treino_id', ids)
    .order('dia_semana')
    .order('ordem');
  if (exerciseError) throw exerciseError;
  weeklyExercisesCache = exercises || [];
  renderSelectedWeekDay();
}

function scheduleWeekRefresh(delay = 80) {
  clearTimeout(weekRefreshTimer);
  weekRefreshTimer = window.setTimeout(() => {
    loadActiveWeek().catch(error => console.error('Não foi possível carregar a semana de treinos ativos:', error));
  }, delay);
}

async function selectExerciseDay(day) {
  setEditorView('plans');
  document.querySelector('#open-exercise-modal')?.click();
  const modal = await waitFor(() => document.querySelector('#exercise-modal.open'), 3000);
  if (!modal) return;
  window.setTimeout(() => {
    const options = [...document.querySelectorAll('#exercise-weekday-options input')];
    options.forEach(input => { input.checked = Number(input.value) === Number(day); });
    const target = options.find(input => input.checked);
    target?.dispatchEvent(new Event('change', { bubbles: true }));
  }, 100);
}

function openPlanAction(id, action) {
  setEditorView('plans');
  const row = document.querySelector(`[data-select-workout="${CSS.escape(id)}"]`);
  row?.click();
  window.setTimeout(() => {
    document.querySelector('#active-workout-details')?.click();
    window.setTimeout(() => document.querySelector(action === 'delete' ? '#workout-modal-delete' : '#workout-modal-edit')?.click(), 0);
  }, 80);
}

function openExerciseAction(id, action) {
  const row = document.querySelector(`[data-open-exercise-detail="${CSS.escape(id)}"]`);
  row?.click();
  window.setTimeout(() => document.querySelector(action === 'delete' ? '#exercise-detail-delete' : '#exercise-detail-edit')?.click(), 0);
}

function bindEditorActions() {
  document.addEventListener('click', event => {
    const dayButton = event.target.closest('[data-workout-weekday]');
    if (dayButton && dayButton.closest('#workout-week-content')) {
      selectedDay = Number(dayButton.dataset.workoutWeekday) || currentWeekDay();
      renderSelectedWeekDay();
      return;
    }

    const addDay = event.target.closest('[data-add-exercise-day]');
    if (addDay) {
      event.preventDefault();
      event.stopPropagation();
      void selectExerciseDay(Number(addDay.dataset.addExerciseDay));
      return;
    }

    const editPlan = event.target.closest('[data-quick-plan-edit]');
    if (editPlan) {
      event.preventDefault();
      openPlanAction(editPlan.dataset.quickPlanEdit, 'edit');
      return;
    }

    const deletePlan = event.target.closest('[data-quick-plan-delete]');
    if (deletePlan) {
      event.preventDefault();
      openPlanAction(deletePlan.dataset.quickPlanDelete, 'delete');
      return;
    }

    const editExercise = event.target.closest('[data-quick-exercise-edit]');
    if (editExercise) {
      event.preventDefault();
      openExerciseAction(editExercise.dataset.quickExerciseEdit, 'edit');
      return;
    }

    const deleteExercise = event.target.closest('[data-quick-exercise-delete]');
    if (deleteExercise) {
      event.preventDefault();
      openExerciseAction(deleteExercise.dataset.quickExerciseDelete, 'delete');
      return;
    }

    const openWeekly = event.target.closest('[data-weekly-open-workout]');
    if (openWeekly) {
      setEditorView('plans');
      const row = document.querySelector(`[data-select-workout="${CSS.escape(openWeekly.dataset.weeklyOpenWorkout)}"]`);
      row?.click();
      window.setTimeout(() => document.querySelector('.workout-active-summary-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }, true);
}

function observeEditor() {
  const list = document.querySelector('#workout-list');
  const days = document.querySelector('#workout-days');
  if (list) new MutationObserver(scheduleEnhance).observe(list, { childList: true, subtree: true });
  if (days) new MutationObserver(scheduleEnhance).observe(days, { childList: true, subtree: true });

  window.addEventListener('fsfit-workout-selection-changed', () => {
    scheduleEnhance();
    scheduleWeekRefresh();
  });
  window.addEventListener('fsfit-workout-exercises-updated', () => {
    scheduleEnhance();
    scheduleWeekRefresh();
  });
  window.addEventListener('fsfit-exercise-order-updated', () => scheduleWeekRefresh());
  window.addEventListener('focus', () => scheduleWeekRefresh());
}

async function boot() {
  if (!alunoId) return;
  await waitFor(() => document.querySelector('#active-workout-workspace'));
  injectEditorStyles();
  setupEditorViews();
  bindEditorActions();
  observeEditor();
  scheduleEnhance();
  scheduleWeekRefresh(0);
}

boot().catch(error => console.error('Não foi possível iniciar o editor aprimorado de treinos:', error));
