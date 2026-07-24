import { supabase } from './supabase.js';

const sessionModal = document.querySelector('#live-session-modal');
const modalActions = document.querySelector('#live-session-modal-actions');
const modalProgress = document.querySelector('#live-session-modal-progress');
const liveList = document.querySelector('#live-students-list');

let selectedExerciseId = '';
let selectedExerciseName = '';
let normalizationQueued = false;

if (sessionModal && modalActions) {
  injectStyles();
  bindEvents();
  queueNormalizeControls();

  const observer = new MutationObserver(queueNormalizeControls);
  observer.observe(sessionModal, { childList: true, subtree: true });
  sessionModal.addEventListener('fsfit-live-session-updated', queueNormalizeControls);
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function queueNormalizeControls() {
  if (normalizationQueued) return;
  normalizationQueued = true;
  queueMicrotask(() => {
    normalizationQueued = false;
    ensureClearAction();
    ensureExerciseDeleteButton();
  });
}

function ensureClearAction() {
  if (sessionModal?.dataset.sessionStatus !== 'em_aula') return;
  const finishButton = modalActions?.querySelector('[data-modal-finish-session]');
  if (!finishButton) return;

  const existingGroup = finishButton.closest('.live-session-end-actions');
  if (existingGroup?.querySelector('[data-live-clear-exercises]')) return;

  const group = document.createElement('div');
  group.className = 'live-session-end-actions';
  group.innerHTML = `
    <button class="btn btn-outline btn-action-tile live-session-clear-action" type="button" data-live-clear-exercises>
      <span class="btn-action-icon" aria-hidden="true">×</span>
      <span class="btn-action-copy"><span class="btn-action-title">LIMPAR</span><span class="btn-action-description">Excluir exercícios de hoje</span></span>
    </button>`;
  finishButton.before(group);
  group.append(finishButton);
}

function ensureExerciseDeleteButton() {
  const dialog = sessionModal?.querySelector('#live-exercise-edit-modal .live-exercise-edit-dialog');
  if (!dialog || dialog.querySelector('[data-delete-live-exercise]')) return;

  const button = document.createElement('button');
  button.className = 'live-exercise-delete-button';
  button.type = 'button';
  button.dataset.deleteLiveExercise = '';
  button.setAttribute('aria-label', 'Excluir exercício');
  button.title = 'Excluir exercício';
  button.textContent = '×';
  dialog.appendChild(button);
}

function bindEvents() {
  sessionModal.addEventListener('click', event => {
    const workoutOption = event.target.closest('[data-live-model-id][data-live-model-day]');
    const picker = document.querySelector('#live-quick-action-picker');
    if (workoutOption && picker?.classList.contains('open')) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      addSavedWorkoutToToday(
        workoutOption.dataset.liveModelId,
        Number(workoutOption.dataset.liveModelDay),
        workoutOption
      ).catch(error => handleActionError(error, true));
      return;
    }

    const exerciseRow = event.target.closest('.live-session-exercise-row[data-live-exercise-id]');
    if (exerciseRow) {
      selectedExerciseId = exerciseRow.dataset.liveExerciseId || '';
      selectedExerciseName = exerciseRow.querySelector('.live-session-exercise-copy strong')?.textContent?.trim() || 'este exercício';
      return;
    }

    const clearButton = event.target.closest('[data-live-clear-exercises]');
    if (clearButton) {
      event.preventDefault();
      clearTodayExercises(clearButton).catch(handleActionError);
      return;
    }

    const deleteButton = event.target.closest('[data-delete-live-exercise]');
    if (deleteButton) {
      event.preventDefault();
      deleteCurrentExercise(deleteButton).catch(handleActionError);
    }
  }, true);
}

async function currentLiveContext() {
  const sessionId = modalActions?.querySelector('[data-modal-finish-session]')?.dataset.modalFinishSession
    || sessionModal?.getAttribute('data-current-session-id')
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

async function clearTodayExercises(button) {
  if (!confirm('Limpar todos os exercícios do treino de hoje?\n\nEsta ação remove a sequência atual do aluno, mas mantém a aula em andamento.')) return;

  setTileBusy(button, true, 'Limpando...');
  try {
    const context = await currentLiveContext();
    const { data, error } = await supabase.rpc('limpar_exercicios_sessao_personal', {
      p_sessao_id: context.id
    });
    if (error) throw error;

    const result = firstResult(data);
    const removed = Math.max(0, Number(result.exercicios_removidos ?? 0));
    applyProgress(context.id, result);
    showToast(removed
      ? `${removed} ${removed === 1 ? 'exercício removido' : 'exercícios removidos'} do treino de hoje.`
      : 'O treino de hoje já estava vazio.');
  } finally {
    setTileBusy(button, false);
  }
}

async function deleteCurrentExercise(button) {
  if (!selectedExerciseId) throw new Error('O exercício não foi identificado. Feche o modal e abra-o novamente.');
  if (!confirm(`Excluir ${selectedExerciseName || 'este exercício'} do treino de hoje?`)) return;

  setDeleteBusy(button, true);
  try {
    const context = await currentLiveContext();
    const { data, error } = await supabase.rpc('excluir_exercicio_sessao_personal', {
      p_sessao_id: context.id,
      p_treino_exercicio_id: selectedExerciseId
    });
    if (error) throw error;

    const result = firstResult(data);
    closeExerciseEditor();
    applyProgress(context.id, result);
    showToast(`${selectedExerciseName || 'Exercício'} excluído do treino de hoje.`);
    selectedExerciseId = '';
    selectedExerciseName = '';
  } finally {
    setDeleteBusy(button, false);
  }
}

async function addSavedWorkoutToToday(modelId, sourceDay, button) {
  if (!modelId || !Number.isInteger(sourceDay)) return;
  setOptionBusy(button, true, 'Adicionando...');

  try {
    const context = await currentLiveContext();
    const targetDay = saoPauloIsoWeekday();
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

    const progressResult = await synchronizeAndReadProgress(context.id);
    closeQuickPicker();
    applyProgress(context.id, progressResult);
    showToast(`${rowsToAdd.length} ${rowsToAdd.length === 1 ? 'exercício aplicado' : 'exercícios aplicados'} no dia de hoje.`);
  } finally {
    setOptionBusy(button, false);
  }
}

function saoPauloIsoWeekday(date = new Date()) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'America/Sao_Paulo'
  }).format(date);
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[weekday] || 1;
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

  const currentDays = (data.dias_semana || []).map(Number);
  if (currentDays.includes(Number(day))) return;
  const days = [...new Set([...currentDays, Number(day)])]
    .filter(value => Number.isInteger(value) && value >= 1 && value <= 7)
    .sort((a, b) => a - b);

  const { error: updateError } = await supabase
    .from('treinos')
    .update({ dias_semana: days })
    .eq('id', workoutId);
  if (updateError) throw updateError;
}

async function synchronizeAndReadProgress(sessionId) {
  const { error } = await supabase.rpc('sincronizar_exercicios_sessao', {
    p_sessao_id: sessionId
  });
  if (error) throw error;

  const { data: rows, error: rowsError } = await supabase
    .from('sessao_exercicios')
    .select('concluido')
    .eq('sessao_id', sessionId);
  if (rowsError) throw rowsError;

  const exercises = Array.isArray(rows) ? rows : [];
  return {
    total_exercicios: exercises.length,
    exercicios_concluidos: exercises.filter(row => row.concluido).length
  };
}

function firstResult(data) {
  return (Array.isArray(data) ? data[0] : data) || {
    total_exercicios: 0,
    exercicios_concluidos: 0,
    exercicios_removidos: 0
  };
}

function applyProgress(sessionId, result = {}) {
  const total = Math.max(0, Number(result.total_exercicios ?? 0));
  const done = Math.max(0, Number(result.exercicios_concluidos ?? 0));

  if (modalProgress) modalProgress.textContent = `${done}/${total} exercícios`;
  sessionModal.dataset.progressDone = String(done);
  sessionModal.dataset.progressTotal = String(total);
  sessionModal.dataset.sessionStatus = 'em_aula';
  sessionModal.dispatchEvent(new CustomEvent('fsfit-live-session-updated', {
    detail: { sessionId, done, total, status: 'em_aula' }
  }));

  const liveRow = liveList?.querySelector(`[data-open-live-session="${CSS.escape(sessionId)}"]`);
  const progressText = liveRow?.querySelector('.live-student-progress > span');
  const progressBar = liveRow?.querySelector('.live-progress > span');
  if (progressText) progressText.textContent = `${done}/${total} concluídos`;
  if (progressBar) progressBar.style.width = `${total ? Math.round(done / total * 100) : 0}%`;
}

function closeExerciseEditor() {
  const modal = sessionModal?.querySelector('#live-exercise-edit-modal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function closeQuickPicker() {
  const picker = document.querySelector('#live-quick-action-picker');
  if (!picker) return;
  picker.classList.remove('open');
  picker.setAttribute('aria-hidden', 'true');
}

function setTileBusy(button, busy, text = '') {
  if (!button) return;
  if (busy) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="btn-action-copy"><span class="btn-action-title">${escapeHtml(text || 'Aguarde...')}</span></span>`;
    return;
  }
  button.disabled = false;
  if (button.dataset.originalHtml) {
    button.innerHTML = button.dataset.originalHtml;
    delete button.dataset.originalHtml;
  }
}

function setDeleteBusy(button, busy) {
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle('busy', busy);
  button.textContent = busy ? '…' : '×';
}

function setOptionBusy(button, busy, text = '') {
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
  const body = document.querySelector('#live-quick-action-body');
  body?.querySelector('.live-quick-message')?.remove();
  const message = document.createElement('div');
  message.className = `live-quick-message ${type}`;
  message.textContent = text;
  body?.prepend(message);
}

function showToast(text) {
  sessionModal?.querySelector('.live-delete-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'live-delete-toast';
  toast.textContent = text;
  sessionModal?.appendChild(toast);
  window.setTimeout(() => toast.classList.add('show'), 20);
  window.setTimeout(() => {
    toast.classList.remove('show');
    window.setTimeout(() => toast.remove(), 180);
  }, 2600);
}

function handleActionError(error, pickerError = false) {
  console.error('Erro ao alterar exercícios da aula:', error);
  const message = error?.message || 'Não foi possível concluir esta ação.';
  if (pickerError) showPickerMessage(message, 'error');
  else alert(message);
}

function injectStyles() {
  if (document.querySelector('#live-session-delete-controls-styles')) return;
  const style = document.createElement('style');
  style.id = 'live-session-delete-controls-styles';
  style.textContent = `
    .live-session-end-actions{display:grid;grid-template-columns:minmax(118px,.78fr) minmax(0,1.22fr);gap:8px;align-items:stretch}
    .live-session-end-actions>.btn{width:100%!important;min-width:0;margin:0!important}
    .live-session-clear-action{border-color:rgba(255,95,103,.58)!important;background:rgba(255,95,103,.045)!important;color:#ff9aa0!important}
    .live-session-clear-action:hover,.live-session-clear-action:focus-visible{border-color:#ff5f67!important;background:rgba(255,95,103,.1)!important;outline:none}
    .live-session-clear-action .btn-action-icon{color:#ff9aa0!important}
    .live-exercise-edit-dialog{position:relative}
    .live-exercise-edit-dialog>h3{padding-right:46px}
    .live-exercise-delete-button{position:absolute;top:12px;right:12px;display:grid;place-items:center;width:38px;height:38px;padding:0;border:1px solid rgba(255,95,103,.58);border-radius:50%;background:rgba(255,95,103,.08);color:#ff9aa0;font:inherit;font-size:1.55rem;font-weight:700;line-height:1;cursor:pointer;transition:background .16s ease,border-color .16s ease,transform .16s ease}
    .live-exercise-delete-button:hover,.live-exercise-delete-button:focus-visible{border-color:#ff5f67;background:rgba(255,95,103,.16);outline:none}
    .live-exercise-delete-button:active{transform:scale(.96)}
    .live-exercise-delete-button:disabled{opacity:.62;cursor:wait}
    .live-delete-toast{position:absolute;top:max(16px,env(safe-area-inset-top));left:50%;z-index:32;max-width:calc(100% - 32px);padding:10px 14px;border:1px solid rgba(177,255,0,.38);border-radius:999px;background:#182318;color:var(--primary);font-size:.72rem;font-weight:850;opacity:0;transform:translate(-50%,-8px);transition:.18s ease;box-shadow:0 12px 35px rgba(0,0,0,.38);pointer-events:none;text-align:center}
    .live-delete-toast.show{opacity:1;transform:translate(-50%,0)}
    @media(max-width:520px){
      .live-session-end-actions{grid-template-columns:minmax(108px,.76fr) minmax(0,1.24fr);gap:6px}
      .live-session-end-actions .btn-action-description{font-size:.62rem}
      .live-exercise-delete-button{top:10px;right:10px;width:36px;height:36px}
    }
  `;
  document.head.appendChild(style);
}
