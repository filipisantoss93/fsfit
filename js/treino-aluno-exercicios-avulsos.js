import { supabase } from './supabase.js';

const pageName = window.location.pathname.split('/').pop() || '';
const alunoId = new URLSearchParams(window.location.search).get('id');

if (pageName === 'treino-aluno.html' && alunoId && !globalThis.__FSFIT_DAY_EXERCISES_READY__) {
  globalThis.__FSFIT_DAY_EXERCISES_READY__ = true;

  const dayNames = {
    1: 'Segunda-feira',
    2: 'Terça-feira',
    3: 'Quarta-feira',
    4: 'Quinta-feira',
    5: 'Sexta-feira',
    6: 'Sábado',
    7: 'Domingo'
  };

  const categoryDefinitions = [
    { id: 'peito', label: 'Peito', terms: ['peito', 'peitoral'] },
    { id: 'costas', label: 'Costas', terms: ['costas', 'dorsal', 'trapézio', 'trapezio'] },
    { id: 'ombros', label: 'Ombros', terms: ['ombro', 'deltoide'] },
    { id: 'biceps', label: 'Bíceps', terms: ['bíceps', 'biceps'] },
    { id: 'triceps', label: 'Tríceps', terms: ['tríceps', 'triceps'] },
    { id: 'pernas', label: 'Pernas', terms: ['perna', 'quadríceps', 'quadriceps', 'posterior', 'coxa', 'panturrilha', 'adutor', 'abdutor'] },
    { id: 'gluteos', label: 'Glúteos', terms: ['glúteo', 'gluteo'] },
    { id: 'core', label: 'Core', terms: ['abdômen', 'abdomen', 'abdominal', 'core', 'lombar'] },
    { id: 'cardio', label: 'Cardio', terms: ['cardio', 'aeróbico', 'aerobico'] },
    { id: 'mobilidade', label: 'Mobilidade', terms: ['mobilidade', 'alongamento'] },
    { id: 'funcional', label: 'Funcional', terms: ['funcional'] }
  ];

  let app = null;
  let picker = null;
  let exerciseLibrary = [];
  let dayWorkouts = [];
  let selectedExerciseIds = new Set();
  let activeCategory = 'todos';
  let searchText = '';
  let selectedDay = 1;
  let selectedWorkoutId = '';
  let decorating = false;

  injectStyles();
  app = await waitForElement('#simple-workout-app');
  if (!app) throw new Error('Área simplificada de treinos não encontrada.');

  await ensureSessionUserId();
  picker = createPicker();
  bindEvents();
  observeWeekView();
  decorateWeekView();
  restoreSelectedDay();

  function injectStyles() {
    if (document.querySelector('link[data-fsfit-bundle]')) return;
    if (document.querySelector('link[data-day-exercise-picker-styles]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/treino-aluno-exercicios-avulsos.css?v=20260725-day-exercises1';
    link.dataset.dayExercisePickerStyles = 'true';
    document.head.appendChild(link);
  }

  function waitForElement(selector, timeout = 10000) {
    const existing = document.querySelector(selector);
    if (existing) return Promise.resolve(existing);

    return new Promise(resolve => {
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (!element) return;
        observer.disconnect();
        clearTimeout(timer);
        resolve(element);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      const timer = window.setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  function normalize(value = '') {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR')
      .trim();
  }

  function esc(value = '') {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
  }

  function todayIso() {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
  }

  function selectedDayFromPage() {
    const active = app.querySelector('[data-simple-day].active');
    return Number(active?.dataset.simpleDay) || 1;
  }

  function selectedDayStorageKey() {
    return `fsfit:treino-dia:${alunoId}`;
  }

  function restoreSelectedDay() {
    const stored = Number(sessionStorage.getItem(selectedDayStorageKey()));
    if (!Number.isInteger(stored) || stored < 1 || stored > 7) return;
    sessionStorage.removeItem(selectedDayStorageKey());
    window.setTimeout(() => app.querySelector(`[data-simple-day="${stored}"]`)?.click(), 0);
  }

  function observeWeekView() {
    const observer = new MutationObserver(() => decorateWeekView());
    observer.observe(app, { childList: true, subtree: true });
  }

  function decorateWeekView() {
    if (decorating) return;
    const panel = app.querySelector('.simple-week-panel');
    if (!panel) return;

    decorating = true;
    try {
      const head = panel.querySelector('.simple-section-head');
      const addWorkout = head?.querySelector('[data-open-apply-modal]');
      if (head && addWorkout && !head.querySelector('.simple-day-actions')) {
        const actions = document.createElement('div');
        actions.className = 'simple-day-actions';
        addWorkout.classList.add('simple-day-action-primary');
        addWorkout.before(actions);
        actions.appendChild(addWorkout);

        const addExercises = document.createElement('button');
        addExercises.className = 'btn btn-outline simple-day-action-secondary';
        addExercises.type = 'button';
        addExercises.dataset.openDayExercisePicker = '';
        addExercises.textContent = '+ Adicionar exercícios';
        actions.appendChild(addExercises);
      }

      const empty = panel.querySelector('.simple-empty-state');
      if (empty) {
        const description = empty.querySelector('span');
        if (description) description.textContent = 'Adicione um treino salvo ou monte este dia com exercícios individuais.';
        empty.querySelector('[data-open-apply-modal]')?.remove();
      }
    } finally {
      decorating = false;
    }
  }

  function bindEvents() {
    app.addEventListener('click', event => {
      const button = event.target.closest('[data-open-day-exercise-picker]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      openPicker().catch(handleError);
    });

    picker.addEventListener('click', event => {
      if (event.target.closest('[data-day-picker-close]')) {
        closePicker();
        return;
      }

      const category = event.target.closest('[data-day-exercise-category]');
      if (category) {
        activeCategory = category.dataset.dayExerciseCategory || 'todos';
        renderCategories();
        renderExerciseList();
        return;
      }

      const exercise = event.target.closest('[data-day-exercise-id]');
      if (exercise) {
        const id = exercise.dataset.dayExerciseId;
        if (selectedExerciseIds.has(id)) selectedExerciseIds.delete(id);
        else selectedExerciseIds.add(id);
        renderExerciseList();
        updateSaveButton();
      }
    });

    picker.querySelector('#day-exercise-search')?.addEventListener('input', event => {
      searchText = event.currentTarget.value;
      renderExerciseList();
    });

    picker.querySelector('#day-exercise-save')?.addEventListener('click', event => {
      saveExercises(event.currentTarget).catch(handleError);
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && picker.classList.contains('open')) closePicker();
    });
  }

  function createPicker() {
    const element = document.createElement('div');
    element.id = 'day-exercise-picker';
    element.className = 'day-exercise-picker';
    element.setAttribute('aria-hidden', 'true');
    element.innerHTML = `
      <div class="day-exercise-picker-backdrop" data-day-picker-close></div>
      <section class="day-exercise-picker-card" role="dialog" aria-modal="true" aria-labelledby="day-exercise-picker-title">
        <header class="day-exercise-picker-head">
          <div><small id="day-exercise-picker-kicker">EXERCÍCIOS DO DIA</small><h2 id="day-exercise-picker-title">Adicionar exercícios</h2><p id="day-exercise-picker-subtitle"></p></div>
          <button type="button" class="day-exercise-picker-close" data-day-picker-close aria-label="Fechar">×</button>
        </header>
        <div class="day-exercise-picker-toolbar">
          <div id="day-exercise-target-wrap" class="day-exercise-target-wrap"></div>
          <label class="day-exercise-search-wrap" for="day-exercise-search">
            <span aria-hidden="true">⌕</span>
            <input id="day-exercise-search" type="search" placeholder="Buscar exercício" autocomplete="off">
          </label>
          <div id="day-exercise-categories" class="day-exercise-categories" aria-label="Categorias de exercícios"></div>
          <div id="day-exercise-message" class="day-exercise-message" hidden></div>
        </div>
        <div id="day-exercise-list" class="day-exercise-list"></div>
        <footer class="day-exercise-picker-footer">
          <span id="day-exercise-selection-count">Nenhum exercício selecionado</span>
          <button id="day-exercise-save" class="btn btn-primary" type="button" disabled>Adicionar exercícios</button>
        </footer>
      </section>`;
    document.body.appendChild(element);
    return element;
  }

  async function openPicker() {
    selectedDay = selectedDayFromPage();
    selectedExerciseIds = new Set();
    activeCategory = 'todos';
    searchText = '';
    selectedWorkoutId = '';
    clearPickerMessage();

    picker.classList.add('open');
    picker.setAttribute('aria-hidden', 'false');
    document.body.classList.add('day-exercise-picker-open');
    picker.querySelector('#day-exercise-picker-kicker').textContent = dayNames[selectedDay].toUpperCase();
    picker.querySelector('#day-exercise-picker-title').textContent = 'Adicionar exercícios';
    picker.querySelector('#day-exercise-picker-subtitle').textContent = 'Escolha exercícios individuais para este dia.';
    picker.querySelector('#day-exercise-search').value = '';
    picker.querySelector('#day-exercise-list').innerHTML = '<div class="day-exercise-loading">Carregando biblioteca...</div>';
    updateSaveButton();

    await Promise.all([loadExerciseLibrary(), loadDayWorkouts()]);
    renderTarget();
    renderCategories();
    renderExerciseList();
    window.setTimeout(() => picker.querySelector('#day-exercise-search')?.focus(), 60);
  }

  function closePicker() {
    picker.classList.remove('open');
    picker.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('day-exercise-picker-open');
  }

  async function loadExerciseLibrary() {
    const { data, error } = await supabase
      .from('exercicios')
      .select('id,nome,grupo_muscular,equipamento,tipo_prescricao')
      .or(`global.eq.true,personal_id.eq.${sessionUserId()}`)
      .order('nome');
    if (error) throw error;
    exerciseLibrary = data || [];
  }

  async function loadDayWorkouts() {
    const { data, error } = await supabase
      .from('treinos')
      .select('id,nome,dias_semana,updated_at')
      .eq('personal_id', sessionUserId())
      .eq('aluno_id', alunoId)
      .eq('status', 'ativo')
      .eq('modelo', false)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    dayWorkouts = (data || []).filter(workout => (workout.dias_semana || []).map(Number).includes(selectedDay));
    selectedWorkoutId = dayWorkouts[0]?.id || '';
  }

  function sessionUserId() {
    return globalThis.__FSFIT_AUTH_USER_ID__ || '';
  }

  async function ensureSessionUserId() {
    if (sessionUserId()) return sessionUserId();
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.user?.id) throw error || new Error('Sessão inválida.');
    globalThis.__FSFIT_AUTH_USER_ID__ = session.user.id;
    return session.user.id;
  }

  function renderTarget() {
    const wrap = picker.querySelector('#day-exercise-target-wrap');
    if (!wrap) return;

    if (!dayWorkouts.length) {
      wrap.innerHTML = `<div class="day-exercise-target-note"><small>NOVO TREINO</small><strong>Treino de ${esc(dayNames[selectedDay])}</strong><span>Será criado automaticamente para este aluno.</span></div>`;
      return;
    }

    if (dayWorkouts.length === 1) {
      wrap.innerHTML = `<div class="day-exercise-target-note"><small>ADICIONAR EM</small><strong>${esc(dayWorkouts[0].nome || 'Treino do dia')}</strong><span>O treino salvo original não será alterado.</span></div>`;
      return;
    }

    wrap.innerHTML = `<label class="day-exercise-target-select"><span>Adicionar em qual treino?</span><select id="day-exercise-target">${dayWorkouts.map(workout => `<option value="${esc(workout.id)}" ${workout.id === selectedWorkoutId ? 'selected' : ''}>${esc(workout.nome || 'Treino do dia')}</option>`).join('')}</select></label>`;
    wrap.querySelector('#day-exercise-target')?.addEventListener('change', event => {
      selectedWorkoutId = event.currentTarget.value;
    });
  }

  function categoryForExercise(exercise) {
    const group = normalize(exercise.grupo_muscular);
    return categoryDefinitions.find(category => category.terms.some(term => group.includes(normalize(term))))?.id || 'outros';
  }

  function availableCategories() {
    const found = new Set(exerciseLibrary.map(categoryForExercise));
    const categories = categoryDefinitions.filter(category => found.has(category.id));
    if (found.has('outros')) categories.push({ id: 'outros', label: 'Outros', terms: [] });
    return [{ id: 'todos', label: 'Todos', terms: [] }, ...categories];
  }

  function renderCategories() {
    const host = picker.querySelector('#day-exercise-categories');
    if (!host) return;
    host.innerHTML = availableCategories().map(category => `<button type="button" class="${category.id === activeCategory ? 'active' : ''}" data-day-exercise-category="${category.id}" aria-pressed="${category.id === activeCategory}">${esc(category.label)}</button>`).join('');
    host.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function filteredExercises() {
    const search = normalize(searchText);
    return exerciseLibrary.filter(exercise => {
      const categoryMatches = activeCategory === 'todos' || categoryForExercise(exercise) === activeCategory;
      if (!categoryMatches) return false;
      if (!search) return true;
      return normalize([exercise.nome, exercise.grupo_muscular, exercise.equipamento].filter(Boolean).join(' ')).includes(search);
    });
  }

  function renderExerciseList() {
    const host = picker.querySelector('#day-exercise-list');
    if (!host) return;
    const rows = filteredExercises();
    host.innerHTML = rows.length ? rows.map(exercise => {
      const selected = selectedExerciseIds.has(exercise.id);
      return `<button type="button" class="day-exercise-option ${selected ? 'selected' : ''}" data-day-exercise-id="${esc(exercise.id)}" aria-pressed="${selected}">
        <span class="day-exercise-option-copy"><strong>${esc(exercise.nome || 'Exercício')}</strong><small>${esc([exercise.grupo_muscular, exercise.equipamento].filter(Boolean).join(' · ') || 'Biblioteca de exercícios')}</small></span>
        <span class="day-exercise-option-action" aria-hidden="true">${selected ? '✓' : '+'}</span>
      </button>`;
    }).join('') : '<div class="day-exercise-empty"><strong>Nenhum exercício encontrado</strong><span>Tente outra categoria ou termo de busca.</span></div>';
  }

  function updateSaveButton() {
    const count = selectedExerciseIds.size;
    const label = picker.querySelector('#day-exercise-selection-count');
    const button = picker.querySelector('#day-exercise-save');
    if (label) label.textContent = count ? `${count} ${count === 1 ? 'exercício selecionado' : 'exercícios selecionados'}` : 'Nenhum exercício selecionado';
    if (button) {
      button.disabled = count === 0;
      button.textContent = count ? `Adicionar ${count}` : 'Adicionar exercícios';
    }
  }

  async function saveExercises(button) {
    if (!selectedExerciseIds.size) return;
    const userId = await ensureSessionUserId();
    setBusy(button, true, 'Adicionando...');
    clearPickerMessage();

    let workoutId = selectedWorkoutId;
    let createdWorkoutId = '';

    try {
      if (!workoutId) {
        const { data: created, error: createError } = await supabase.from('treinos').insert({
          personal_id: userId,
          aluno_id: alunoId,
          nome: `Treino de ${dayNames[selectedDay]}`,
          descricao: 'Treino montado com exercícios individuais.',
          dias_semana: [selectedDay],
          data_inicio: todayIso(),
          data_fim: null,
          status: 'ativo',
          modelo: false
        }).select('id').single();
        if (createError) throw createError;
        workoutId = created.id;
        createdWorkoutId = created.id;
      }

      const { data: existingRows, error: existingError } = await supabase
        .from('treino_exercicios')
        .select('exercicio_id,ordem')
        .eq('treino_id', workoutId)
        .eq('dia_semana', selectedDay)
        .order('ordem');
      if (existingError) throw existingError;

      const existingIds = new Set((existingRows || []).map(row => String(row.exercicio_id || '')));
      const exercises = [...selectedExerciseIds]
        .filter(id => !existingIds.has(String(id)))
        .map(id => exerciseLibrary.find(exercise => String(exercise.id) === String(id)))
        .filter(Boolean);

      if (!exercises.length) {
        showPickerMessage('Os exercícios selecionados já estão neste treino.', 'warning');
        setBusy(button, false);
        return;
      }

      const startOrder = (existingRows || []).reduce((max, row) => Math.max(max, Number(row.ordem || 0)), 0) + 1;
      const payload = exercises.map((exercise, index) => {
        const type = exercise.tipo_prescricao || 'repeticoes';
        return {
          treino_id: workoutId,
          exercicio_id: exercise.id,
          dia_semana: selectedDay,
          ordem: startOrder + index,
          series: type === 'repeticoes' ? 4 : 1,
          repeticoes: type === 'repeticoes' ? '12' : null,
          duracao_minutos: type === 'tempo' ? 30 : null,
          distancia_km: type === 'distancia' ? 1 : null,
          descanso_segundos: type === 'repeticoes' ? 60 : null,
          exercicio_nome_snapshot: exercise.nome || null,
          grupo_muscular_snapshot: exercise.grupo_muscular || null,
          equipamento_snapshot: exercise.equipamento || null,
          tipo_prescricao_snapshot: type
        };
      });

      const { error: insertError } = await supabase.from('treino_exercicios').insert(payload);
      if (insertError) throw insertError;

      await synchronizeOpenSession(workoutId);
      closePicker();
      showPageMessage(`${payload.length} ${payload.length === 1 ? 'exercício adicionado' : 'exercícios adicionados'} em ${dayNames[selectedDay]}.`);
      window.dispatchEvent(new CustomEvent('fsfit:workout-updated', { detail: { alunoId, workoutId, day: selectedDay, source: 'day-exercises' } }));
      app.querySelector(`[data-simple-day="${selectedDay}"]`)?.click();
    } catch (error) {
      if (createdWorkoutId) await supabase.from('treinos').delete().eq('id', createdWorkoutId);
      throw error;
    } finally {
      if (picker.classList.contains('open')) setBusy(button, false);
    }
  }

  async function synchronizeOpenSession(workoutId) {
    const { data, error } = await supabase
      .from('sessoes_treino')
      .select('id,treino_id,status')
      .eq('aluno_id', alunoId)
      .in('status', ['aguardando_confirmacao', 'em_aula'])
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) {
      console.warn('Não foi possível consultar a aula aberta:', error);
      return;
    }
    const openSession = data?.[0];
    if (!openSession || String(openSession.treino_id) !== String(workoutId)) return;
    const { error: syncError } = await supabase.rpc('sincronizar_exercicios_sessao', { p_sessao_id: openSession.id });
    if (syncError) console.warn('Não foi possível sincronizar a aula aberta:', syncError);
  }

  function setBusy(button, busy, text = '') {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.disabled = true;
      if (text) button.textContent = text;
      return;
    }
    button.disabled = selectedExerciseIds.size === 0;
    button.textContent = button.dataset.originalText || (selectedExerciseIds.size ? `Adicionar ${selectedExerciseIds.size}` : 'Adicionar exercícios');
    delete button.dataset.originalText;
  }

  function showPickerMessage(text, type = 'error') {
    const box = picker.querySelector('#day-exercise-message');
    if (!box) return;
    box.textContent = text;
    box.className = `day-exercise-message ${type}`;
    box.hidden = false;
  }

  function clearPickerMessage() {
    const box = picker?.querySelector('#day-exercise-message');
    if (!box) return;
    box.hidden = true;
    box.textContent = '';
    box.className = 'day-exercise-message';
  }

  function showPageMessage(text) {
    const box = app.querySelector('#simple-workout-message');
    if (!box) return;
    box.textContent = text;
    box.className = 'simple-workout-message';
    box.hidden = false;
  }

  function handleError(error) {
    console.error('Erro ao adicionar exercícios ao dia:', error);
    showPickerMessage(error?.message || 'Não foi possível adicionar os exercícios.', 'error');
    const button = picker.querySelector('#day-exercise-save');
    setBusy(button, false);
  }
}
