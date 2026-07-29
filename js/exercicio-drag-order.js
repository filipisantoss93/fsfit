import { supabase } from './supabase.js';

const LIST_SELECTOR = '.workout-exercise-list, .live-session-exercise-list';
const ROW_SELECTOR = '.workout-exercise-row, .live-session-exercise-row';
const HANDLE_CLASS = 'exercise-drag-handle';

let dragState = null;
let suppressClickUntil = 0;
let enhanceQueued = false;

enhanceLists();
observeExerciseLists();
bindPointerEvents();
bindClickSuppression();

function observeExerciseLists() {
  const roots = [
    document.querySelector('#workout-days'),
    document.querySelector('#live-session-modal')
  ].filter(Boolean);

  if (!roots.length) return;
  const observer = new MutationObserver(() => queueEnhance());
  roots.forEach(root => observer.observe(root, { childList: true, subtree: true }));
}

function queueEnhance() {
  if (enhanceQueued) return;
  enhanceQueued = true;
  queueMicrotask(() => {
    enhanceQueued = false;
    enhanceLists();
  });
}

function enhanceLists() {
  document.querySelectorAll(LIST_SELECTOR).forEach(list => {
    const rows = getRows(list);
    if (!rows.length) return;

    list.classList.add('exercise-dnd-list');
    rows.forEach(row => {
      if (row.querySelector(`:scope > .${HANDLE_CLASS}`)) return;
      const handle = document.createElement('span');
      handle.className = HANDLE_CLASS;
      handle.setAttribute('aria-hidden', 'true');
      handle.title = 'Arraste para reordenar';
      row.prepend(handle);
    });
  });
}

function bindPointerEvents() {
  document.addEventListener('pointerdown', event => {
    const handle = event.target.closest(`.${HANDLE_CLASS}`);
    if (!handle) return;

    const row = handle.closest(ROW_SELECTOR);
    const list = row?.parentElement;
    if (!row || !list?.matches(LIST_SELECTOR) || getRows(list).length < 2) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    const originalIds = getRows(list).map(getExerciseId);
    if (originalIds.some(id => !id)) return;

    dragState = {
      pointerId: event.pointerId,
      handle,
      row,
      list,
      originalIds,
      changed: false,
      scrollParent: findScrollParent(list)
    };

    try { handle.setPointerCapture(event.pointerId); } catch {}
    row.classList.add('is-dragging');
    list.classList.add('is-reordering');
    document.body.classList.add('exercise-dnd-active');
  }, { capture: true });

  document.addEventListener('pointermove', event => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    event.preventDefault();

    autoScroll(dragState.scrollParent, event.clientY);

    const element = document.elementFromPoint(event.clientX, event.clientY);
    const targetRow = element?.closest?.(ROW_SELECTOR);
    if (!targetRow || targetRow === dragState.row || targetRow.parentElement !== dragState.list) return;

    const rect = targetRow.getBoundingClientRect();
    const insertBefore = event.clientY < rect.top + rect.height / 2;
    const reference = insertBefore ? targetRow : targetRow.nextElementSibling;

    if (reference === dragState.row || (!reference && dragState.row === dragState.list.lastElementChild)) return;

    dragState.list.insertBefore(dragState.row, reference);
    dragState.changed = true;
    renumberList(dragState.list);
  }, { capture: true, passive: false });

  document.addEventListener('pointerup', event => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    finishDrag(true).catch(console.error);
  }, { capture: true });

  document.addEventListener('pointercancel', event => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    finishDrag(false).catch(console.error);
  }, { capture: true });
}

function bindClickSuppression() {
  document.addEventListener('click', event => {
    if (Date.now() > suppressClickUntil) return;
    if (!event.target.closest(ROW_SELECTOR)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }, true);
}

async function finishDrag(shouldSave) {
  const state = dragState;
  if (!state) return;
  dragState = null;

  try { state.handle.releasePointerCapture(state.pointerId); } catch {}
  state.row.classList.remove('is-dragging');
  state.list.classList.remove('is-reordering');
  document.body.classList.remove('exercise-dnd-active');
  suppressClickUntil = Date.now() + 450;

  if (!state.changed) return;

  if (!shouldSave) {
    restoreOrder(state.list, state.originalIds);
    return;
  }

  const ids = getRows(state.list).map(getExerciseId);
  if (ids.some(id => !id)) {
    restoreOrder(state.list, state.originalIds);
    return;
  }

  state.list.classList.add('is-saving');
  try {
    const { data, error } = await supabase.rpc('reordenar_exercicios_treino_personal', {
      p_exercicio_ids: ids
    });

    if (error || data !== true) throw error || new Error('A nova ordem não pôde ser salva.');
    renumberList(state.list);
    window.dispatchEvent(new CustomEvent('fsfit-exercise-order-updated', {
      detail: { exerciseIds: ids }
    }));
  } catch (error) {
    console.error('Erro ao reordenar exercícios:', error);
    restoreOrder(state.list, state.originalIds);
    alert('Não foi possível salvar a nova ordem dos exercícios.');
  } finally {
    state.list.classList.remove('is-saving');
  }
}

function getRows(list) {
  return [...list.children].filter(child => child.matches?.(ROW_SELECTOR));
}

function getExerciseId(row) {
  return row?.dataset?.liveExerciseId || row?.dataset?.openExerciseDetail || '';
}

function renumberList(list) {
  getRows(list).forEach((row, index) => {
    const order = row.querySelector('.workout-exercise-order, .live-session-exercise-order');
    if (order) order.textContent = String(index + 1);
  });
}

function restoreOrder(list, ids) {
  const rows = new Map(getRows(list).map(row => [getExerciseId(row), row]));
  ids.forEach(id => {
    const row = rows.get(id);
    if (row) list.appendChild(row);
  });
  renumberList(list);
}

function findScrollParent(element) {
  let parent = element.parentElement;
  while (parent && parent !== document.body) {
    const style = getComputedStyle(parent);
    if (/(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight) return parent;
    parent = parent.parentElement;
  }
  return window;
}

function autoScroll(scrollParent, clientY) {
  const edge = 72;
  const speed = 14;

  if (scrollParent === window) {
    if (clientY < edge) window.scrollBy(0, -speed);
    else if (clientY > window.innerHeight - edge) window.scrollBy(0, speed);
    return;
  }

  const rect = scrollParent.getBoundingClientRect();
  if (clientY < rect.top + edge) scrollParent.scrollBy(0, -speed);
  else if (clientY > rect.bottom - edge) scrollParent.scrollBy(0, speed);
}
