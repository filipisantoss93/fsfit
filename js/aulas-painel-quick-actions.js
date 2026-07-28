import { supabase } from './supabase.js';

const sessionModal = document.querySelector('#live-session-modal');
const modalActions = document.querySelector('#live-session-modal-actions');
const modalProgress = document.querySelector('#live-session-modal-progress');
const liveList = document.querySelector('#live-students-list');

const DAY_NAMES = {
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
  7: 'Domingo'
};

let picker = null;
let pickerTitle = null;
let pickerDescription = null;
let pickerBody = null;
let pickerMode = '';
let exerciseLibrary = [];
let normalizationQueued = false;
let normalizingActions = false;

if (sessionModal && modalActions) {
  ensurePicker();
  bindActions();

  const actionsObserver = new MutationObserver(queueNormalizeActions);
  actionsObserver.observe(modalActions, { childList: true, subtree: true });

  sessionModal.addEventListener('fsfit-live-session-updated', queueNormalizeActions);
  queueNormalizeActions();
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function isoWeekday(date = new Date()) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function normalizeSearch(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function queueNormalizeActions() {
  if (normalizationQueued) return;
  normalizationQueued = true;
  queueMicrotask(() => {
    normalizationQueued = false;
    normalizeActions();
  });
}

function normalizeActions() {
  if (!sessionModal || !modalActions || normalizingActions) return;
  if (sessionModal.dataset.sessionStatus !== 'em_aula') {
    delete modalActions.dataset.quickActionsSignature;
    return;
  }

  const finishButton = modalActions.querySelector('[data-modal-finish-session]');
  const existingRecordLink = modalActions.querySelector('a[href*="ficha-aluno.html?id="]');
  const sessionId = finishButton?.dataset.modalFinishSession
    || sessionModal.getAttribute('data-current-session-id')
    || '';
  const studentId = studentIdFromHref(existingRecordLink?.getAttribute('href') || '')
    || modalActions.querySelector('[data-live-quick-student-id]')?.dataset.liveQuickStudentId
    || '';

  if (!sessionId || !studentId) return;

  const recordHref = buildRecordHref(existingRecordLink?.getAttribute('href'), studentId, sessionId);
  const signature = `${sessionId}:${studentId}:${recordHref}`;
  const alreadyReady = modalActions.dataset.quickActionsSignature === signature
    && modalActions.querySelector('.live-session-quick-actions')
    && modalActions.querySelector(`[data-modal-finish-session="${CSS.escape(sessionId)}"]`);
  if (alreadyReady) return;

  normalizingActions = true;
  modalActions.classList.add('live-session-modal-actions-quick');
  modalActions.dataset.quickActionsSignature = signature;
  modalActions.innerHTML = `
    <span hidden aria-hidden="true" data-live-edit-workout="${escapeHtml(studentId)}" data-live-quick-student-id="${escapeHtml(studentId)}"></span>
    <div class="live-session-quick-actions" aria-label="Ações da aula">
      <button class="live-session-quick-action" type="button" data-live-add-saved-workout>
        <span>+Treino</span>
      </button>
      <button class="live-session-quick-action" type="button" data-live-add-exercise>
        <span>+Exercício</span>
      </button>
      <a class="live-session-quick-action" href="${escapeHtml(recordHref)}">
        <span>Ficha</span>
      </a>
    </div>
    <button class="btn btn-danger btn-action-tile live-session-finish-action" type="button" data-modal-finish-session="${escapeHtml(sessionId)}">
      <span class="btn-action-icon" aria-hidden="true">■</span>
      <span class="btn-action-copy"><span class="btn-action-title">Encerrar aula</span><span class="btn-action-description">Finalizar esta sessão do aluno</span></span>
    </button>`;
  normalizingActions = false;
}

function studentIdFromHref(href = '') {
  if (!href) return '';
  try {
    return new URL(href, window.location.origin).searchParams.get('id') || '';
  } catch {
    return '';
  }
}

function buildRecordHref(href, studentId, sessionId) {
  const url = new URL(href || `ficha-aluno.html?id=${encodeURIComponent(studentId)}`, window.location.origin);
  url.searchParams.set('id', studentId);
  url.searchParams.set('origem', 'aula');
  url.searchParams.set('sessao', sessionId);
  return `${url.pathname.replace(/^\//, '')}${url.search}`;
}

function bindActions() {
  modalActions.addEventListener('click', event => {
    const addWorkout = event.target.closest('[data-live-add-saved-workout]');
    if (addWorkout) {
      openPicker('workout').catch(handlePickerError);
      return;
    }

    const addExercise = event.target.closest('[data-live-add-exercise]');
    if (addExercise) {
      openPicker('exercise').catch(handlePickerError);
    }
  });

  sessionModal.addEventListener('click', event => {
    if (event.target.closest('[data-live-quick-close]')) {
      closePicker();
      return;
    }

    const workoutOption = event.target.closest('[data-live-model-id][data-live-model-day]');
    if (workoutOption && picker?.classList.contains('open')) {
      addSavedWorkoutDay(
        workoutOption.dataset.liveModelId,
        Number(workoutOption.dataset.liveModelDay),
        workoutOption
      ).catch(handlePickerError);
      return;
    }

    const exerciseOption = event.target.closest('[data-live-library-exercise]');
    if (exerciseOption && picker?.classList.contains('open')) {
      addLibraryExercise(exerciseOption.dataset.liveLibraryExercise, exerciseOption).catch(handlePickerError);
    }
  });

  sessionModal.addEventListener('input', event => {
    if (!event.target.matches('#live-quick-exercise-search')) return;
    renderExerciseResults(event.target.value);
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !picker?.classList.contains('open')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closePicker();
  }, true);
}

function ensurePicker() {
  picker = document.querySelector('#live-quick-action-picker');
  if (!picker) {
    picker = document.createElement('div');
    picker.id = 'live-quick-action-picker';
    picker.className = 'live-quick-action-picker';
    picker.setAttribute('aria-hidden', 'true');
    picker.innerHTML = `
      <div class="live-quick-action-backdrop" data-live-quick-close></div>
      <section class="live-quick-action-dialog" role="dialog" aria-modal="true" aria-labelledby="live-quick-action-title">
        <header class="live-quick-action-header">
          <div>
            <small>EM AULA</small>
            <h3 id="live-quick-action-title">Adicionar</h3>
            <p id="live-quick-action-description"></p>
          </div>
          <button class="live-quick-action-close" type="button" aria-label="Fechar" data-live-quick-close>×</button>
        </header>
        <div id="live-quick-action-body" class="live-quick-action-body"></div>
      </section>`;
    sessionModal.appendChild(picker);
  }

  pickerTitle = picker.querySelector('#live-quick-action-title');
  pickerDescription = picker.querySelector('#live-quick-action-description');
  pickerBody = picker.querySelector('#live-quick-action-body');
}

async function openPicker(mode) {
  pickerMode = mode;
  picker.classList.add('open');
  picker.setAttribute('aria-hidden', 'false');
  pickerTitle.textContent = mode === 'workout' ? 'Adicionar treino salvo' : 'Adicionar exercício';
  pickerDescription.textContent = mode === 'workout'
    ? 'Escolha um treino salvo e adicione a sequência ao treino de hoje.'
    : 'Escolha um exercício da biblioteca para incluir no treino de hoje.';
  pickerBody.innerHTML = '<div class="live-quick-loading">Carregando...</div>';

  if (mode === 'workout') await renderSavedWorkoutOptions();
  else await renderExercisePicker();
}

function closePicker() {
  if (!picker) return;
  picker.classList.remove('open');
  picker.setAttribute('aria-hidden', 'true');
  pickerMode = '';
}

async function renderSavedWorkoutOptions() {
  const userId = await currentUserId();
  const { data: models, error: modelsError } = await supabase
    .from('treinos')
    .select('id,nome,descricao,dias_semana')
    .eq('personal_id', userId)
    .eq('modelo', true)
    .order('nome');

  if (modelsError) throw modelsError;
  const modelRows = Array.isArray(models) ? models : [];
  if (!modelRows.length) {
    pickerBody.innerHTML = '<div class="live-quick-empty"><strong>Nenhum treino salvo.</strong><span>Salve modelos de treino para reutilizá-los durante as aulas.</span></div>';
    return;
  }

  const modelIds = modelRows.map(model => model.id);
  const { data: exercises, error: exercisesError } = await supabase
    .from('treino_exercicios')
    .select('id,treino_id,dia_semana,exercicio_id')
    .in('treino_id', modelIds)
    .order('dia_semana')
    .order('ordem');
  if (exercisesError) throw exercisesError;

  const counts = new Map();
  (exercises || []).forEach(row => {
    const key = `${row.treino_id}:${Number(row.dia_semana)}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const today = isoWeekday();
  const options = [];
  modelRows.forEach(model => {
    const configuredDays = new Set((model.dias_semana || []).map(Number));
    (exercises || []).forEach(row => {
      if (row.treino_id === model.id && row.dia_semana != null) configuredDays.add(Number(row.dia_semana));
    });
    [...configuredDays].sort((a, b) => a - b).forEach(day => {
      const count = counts.get(`${model.id}:${day}`) || 0;
      if (!count) return;
      options.push({ model, day, count, today: day === today });
    });
  });

  options.sort((a, b) => Number(b.today) - Number(a.today)
    || String(a.model.nome).localeCompare(String(b.model.nome), 'pt-BR')
    || a.day - b.day);

  pickerBody.innerHTML = options.length
    ? `<div class="live-quick-option-list">${options.map(option => `
        <button class="live-quick-option" type="button" data-live-model-id="${escapeHtml(option.model.id)}" data-live-model-day="${option.day}">
          <span class="live-quick-option-copy">
            <span class="live-quick-option-title"><strong>${escapeHtml(option.model.nome || 'Treino salvo')}</strong>${option.today ? '<em>HOJE</em>' : ''}</span>
            <small>${escapeHtml(DAY_NAMES[option.day] || 'Dia do treino')} • ${option.count} ${option.count === 1 ? 'exercício' : 'exercícios'}</small>
          </span>
          <span class="live-quick-option-arrow" aria-hidden="true">›</span>
        </button>`).join('')}</div>`
    : '<div class="live-quick-empty"><strong>Os treinos salvos ainda não possuem exercícios.</strong><span>Adicione exercícios aos modelos antes de utilizá-los em aula.</span></div>';
}

async function renderExercisePicker() {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('exercicios')
    .select('id,nome,grupo_muscular,equipamento,instrucoes,video_url,imagem_url,tipo_prescricao,global,personal_id')
    .or(`global.eq.true,personal_id.eq.${userId}`)
    .order('nome');
  if (error) throw error;

  exerciseLibrary = Array.isArray(data) ? data : [];
  pickerBody.innerHTML = `
    <label class="live-quick-search-wrap">
      <span aria-hidden="true">⌕</span>
      <input id="live-quick-exercise-search" type="search" placeholder="Pesquisar exercício" autocomplete="off">
    </label>
    <div id="live-quick-exercise-results" class="live-quick-option-list"></div>`;
  renderExerciseResults('');
  pickerBody.querySelector('#live-quick-exercise-search')?.focus();
}

function renderExerciseResults(query) {
  const host = pickerBody?.querySelector('#live-quick-exercise-results');
  if (!host) return;
  const search = normalizeSearch(query);
  const matches = exerciseLibrary
    .filter(exercise => !search || normalizeSearch([
      exercise.nome,
      exercise.grupo_muscular,
      exercise.equipamento
    ].filter(Boolean).join(' ')).includes(search))
    .slice(0, 80);

  host.innerHTML = matches.length
    ? matches.map(exercise => `
      <button class="live-quick-option" type="button" data-live-library-exercise="${escapeHtml(exercise.id)}">
        <span class="live-quick-option-copy">
          <strong>${escapeHtml(exercise.nome || 'Exercício')}</strong>
          <small>${escapeHtml([exercise.grupo_muscular, exercise.equipamento].filter(Boolean).join(' • ') || 'Biblioteca de exercícios')}</small>
        </span>
        <span class="live-quick-option-arrow" aria-hidden="true">＋</span>
      </button>`).join('')
    : '<div class="live-quick-empty compact"><strong>Nenhum exercício encontrado.</strong><span>Tente outro nome, grupo muscular ou equipamento.</span></div>';
}

async function addSavedWorkoutDay(modelId, sourceDay, button) {
  if (!modelId || !Number.isInteger(sourceDay)) return;
  setBusy(button, true, 'Adicionando...');
  try {
    const context = await currentLiveContext();
    const targetDay = isoWeekday();

    const { data: sourceRows, error: sourceError } = await supabase
      .from('treino_exercicios')
      .select('exercicio_id,ordem,series,repeticoes,carga,descanso_segundos,observacoes,duracao_minutos,distancia_km,exercicio_nome_snapshot,grupo_muscular_snapshot,equipamento_snapshot,instrucoes_snapshot,video_url_snapshot,imagem_url_snapshot,tipo_prescricao_snapshot')
      .eq('treino_id', modelId)
      .eq('dia_semana', sourceDay)
      .order('ordem');
    if (sourceError) throw sourceError;

    const source = Array.isArray(sourceRows) ? sourceRows : [];
    if (!source.length) throw new Error('Este treino salvo não possui exercícios no dia selecionado.');

    const existing = await targetDayExercises(context.treino_id, targetDay);
    const existingIds = new Set(existing.map(row => String(row.exercicio_id || '')).filter(Boolean));
    const rowsToAdd = source.filter(row => row.exercicio_id && !existingIds.has(String(row.exercicio_id)));

    if (!rowsToAdd.length) {
      showPickerMessage('Todos os exercícios deste treino já estão no treino de hoje.', 'warning');
      return;
    }

    await ensureWorkoutDay(context.treino_id, targetDay);
    const maxOrder = existing.reduce((max, row) => Math.max(max, Number(row.ordem || 0)), 0);
    const payload = rowsToAdd.map((row, index) => ({
      treino_id: context.treino_id,
      exercicio_id: row.exercicio_id,
      dia_semana: targetDay,
      ordem: maxOrder + index + 1,
      series: row.series,
      repeticoes: row.repeticoes,
      carga: row.carga,
      descanso_segundos: row.descanso_segundos,
      observacoes: row.observacoes,
      duracao_minutos: row.duracao_minutos,
      distancia_km: row.distancia_km,
      exercicio_nome_snapshot: row.exercicio_nome_snapshot,
      grupo_muscular_snapshot: row.grupo_muscular_snapshot,
      equipamento_snapshot: row.equipamento_snapshot,
      instrucoes_snapshot: row.instrucoes_snapshot,
      video_url_snapshot: row.video_url_snapshot,
      imagem_url_snapshot: row.imagem_url_snapshot,
      tipo_prescricao_snapshot: row.tipo_prescricao_snapshot
    }));

    const { error: insertError } = await supabase.from('treino_exercicios').insert(payload);
    if (insertError) throw insertError;

    await synchronizeSession(context);
    closePicker();
    showToast(`${rowsToAdd.length} ${rowsToAdd.length === 1 ? 'exercício adicionado' : 'exercícios adicionados'} ao treino de hoje.`);
  } finally {
    setBusy(button, false);
  }
}

async function addLibraryExercise(exerciseId, button) {
  const exercise = exerciseLibrary.find(item => String(item.id) === String(exerciseId));
  if (!exercise) return;

  setBusy(button, true, 'Adicionando...');
  try {
    const context = await currentLiveContext();
    const targetDay = isoWeekday();
    const existing = await targetDayExercises(context.treino_id, targetDay);

    if (existing.some(row => String(row.exercicio_id) === String(exercise.id))) {
      showPickerMessage('Este exercício já está no treino de hoje.', 'warning');
      return;
    }

    await ensureWorkoutDay(context.treino_id, targetDay);
    const maxOrder = existing.reduce((max, row) => Math.max(max, Number(row.ordem || 0)), 0);
    const { error } = await supabase.from('treino_exercicios').insert({
      treino_id: context.treino_id,
      exercicio_id: exercise.id,
      dia_semana: targetDay,
      ordem: maxOrder + 1,
      series: 4,
      repeticoes: '12',
      descanso_segundos: 60,
      exercicio_nome_snapshot: exercise.nome || null,
      grupo_muscular_snapshot: exercise.grupo_muscular || null,
      equipamento_snapshot: exercise.equipamento || null,
      instrucoes_snapshot: exercise.instrucoes || null,
      video_url_snapshot: exercise.video_url || null,
      imagem_url_snapshot: exercise.imagem_url || null,
      tipo_prescricao_snapshot: exercise.tipo_prescricao || null
    });
    if (error) throw error;

    await synchronizeSession(context);
    closePicker();
    showToast(`${exercise.nome || 'Exercício'} adicionado ao treino de hoje.`);
  } finally {
    setBusy(button, false);
  }
}

async function currentUserId() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.user?.id) throw error || new Error('Sessão inválida.');
  return session.user.id;
}

async function currentLiveContext() {
  const finish = modalActions.querySelector('[data-modal-finish-session]');
  const sessionId = finish?.dataset.modalFinishSession
    || sessionModal.getAttribute('data-current-session-id')
    || '';
  if (!sessionId) throw new Error('A aula atual não foi identificada.');

  const { data, error } = await supabase
    .from('sessoes_treino')
    .select('id,aluno_id,treino_id,status')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.status !== 'em_aula') throw new Error('Esta aula não está mais em andamento.');
  return data;
}

async function targetDayExercises(workoutId, day) {
  const { data, error } = await supabase
    .from('treino_exercicios')
    .select('id,exercicio_id,ordem')
    .eq('treino_id', workoutId)
    .eq('dia_semana', day)
    .order('ordem');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function ensureWorkoutDay(workoutId, day) {
  const { data, error } = await supabase
    .from('treinos')
    .select('dias_semana')
    .eq('id', workoutId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('O treino ativo não foi encontrado.');

  const days = [...new Set([...(data.dias_semana || []).map(Number), Number(day)])]
    .filter(value => Number.isInteger(value) && value >= 1 && value <= 7)
    .sort((a, b) => a - b);
  if ((data.dias_semana || []).map(Number).includes(Number(day))) return;

  const { error: updateError } = await supabase
    .from('treinos')
    .update({ dias_semana: days })
    .eq('id', workoutId);
  if (updateError) throw updateError;
}

async function synchronizeSession(context) {
  const { error } = await supabase.rpc('sincronizar_exercicios_sessao', {
    p_sessao_id: context.id
  });
  if (error) throw error;

  const { data: rows, error: rowsError } = await supabase
    .from('sessao_exercicios')
    .select('concluido')
    .eq('sessao_id', context.id);
  if (rowsError) throw rowsError;

  const exercises = Array.isArray(rows) ? rows : [];
  const total = exercises.length;
  const done = exercises.filter(row => row.concluido).length;

  if (modalProgress) modalProgress.textContent = `${done}/${total} exercícios`;
  sessionModal.dataset.progressDone = String(done);
  sessionModal.dataset.progressTotal = String(total);
  sessionModal.dataset.sessionStatus = 'em_aula';
  sessionModal.dispatchEvent(new CustomEvent('fsfit-live-session-updated', {
    detail: { sessionId: context.id, done, total, status: 'em_aula' }
  }));

  const liveRow = liveList?.querySelector(`[data-open-live-session="${CSS.escape(context.id)}"]`);
  const progressText = liveRow?.querySelector('.live-student-progress > span');
  const progressBar = liveRow?.querySelector('.live-progress > span');
  if (progressText) progressText.textContent = `${done}/${total} concluídos`;
  if (progressBar) progressBar.style.width = `${total ? Math.round(done / total * 100) : 0}%`;
}

function setBusy(button, busy, text = '') {
  if (!button) return;
  if (busy) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    if (text) button.innerHTML = `<span class="live-quick-option-copy"><strong>${escapeHtml(text)}</strong></span>`;
    return;
  }
  button.disabled = false;
  if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }
}

function showPickerMessage(text, type = 'error') {
  pickerBody?.querySelector('.live-quick-message')?.remove();
  const message = document.createElement('div');
  message.className = `live-quick-message ${type}`;
  message.textContent = text;
  pickerBody?.prepend(message);
}

function showToast(text) {
  sessionModal?.querySelector('.live-quick-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'live-quick-toast';
  toast.textContent = text;
  sessionModal?.appendChild(toast);
  window.setTimeout(() => toast.classList.add('show'), 20);
  window.setTimeout(() => {
    toast.classList.remove('show');
    window.setTimeout(() => toast.remove(), 180);
  }, 2600);
}

function handlePickerError(error) {
  console.error('Erro nas ações rápidas da aula:', error);
  showPickerMessage(error?.message || 'Não foi possível concluir esta ação.', 'error');
}
