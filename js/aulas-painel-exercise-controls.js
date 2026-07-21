import { supabase } from './supabase.js';

const sessionModal = document.querySelector('#live-session-modal');
const progress = document.querySelector('#live-session-modal-progress');

let selectedExerciseId = '';
let selectedExerciseRow = null;
let loadRequest = 0;
let lastDetails = null;

if (sessionModal) {
  injectStyles();
  ensureExtraFields();
  bindExerciseRows();
  bindSaveOverride();
}

function injectStyles() {
  if (document.querySelector('#live-exercise-personal-controls-styles')) return;
  const style = document.createElement('style');
  style.id = 'live-exercise-personal-controls-styles';
  style.textContent = `
    .live-exercise-rest-field{grid-column:1/-1}
    .live-exercise-completion{display:flex;align-items:center;gap:11px;margin-top:12px;padding:12px 13px;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,.025);cursor:pointer}
    .live-exercise-completion input{width:22px;height:22px;margin:0;accent-color:var(--warning,#ffcc33);flex:0 0 auto}
    .live-exercise-completion-copy{min-width:0}
    .live-exercise-completion-copy strong{display:block;font-size:.82rem}
    .live-exercise-completion-copy small{display:block;margin-top:3px;color:var(--muted);font-size:.68rem;line-height:1.35}
    .live-session-exercise-row.is-completed{border-color:rgba(50,215,75,.34);background:rgba(50,215,75,.055)}
    .live-session-exercise-row.is-completed .live-session-exercise-order{background:rgba(50,215,75,.13);color:var(--primary)}
    .live-session-exercise-copy .live-session-exercise-title-line{display:flex;align-items:center;gap:7px;min-width:0;flex-wrap:wrap;margin-top:0;color:inherit;font-size:inherit;line-height:normal}
    .live-session-exercise-title-line strong{min-width:0}
    .live-session-exercise-copy .live-exercise-completed-badge{display:inline-flex;align-items:center;min-height:19px;margin-top:0;padding:0 6px;border:1px solid rgba(50,215,75,.35);border-radius:999px;background:rgba(50,215,75,.08);color:var(--primary);font-size:.52rem!important;font-weight:900;letter-spacing:.045em;line-height:1}
    @media(max-width:520px){.live-exercise-completion{padding:11px 12px}.live-exercise-rest-field{grid-column:1/-1}}
  `;
  document.head.appendChild(style);
}

function ensureExtraFields() {
  const form = document.querySelector('#live-exercise-edit-form');
  const grid = form?.querySelector('.live-exercise-edit-grid');
  if (!form || !grid || form.querySelector('#live-exercise-rest')) return;

  const restGroup = document.createElement('div');
  restGroup.className = 'form-group live-exercise-rest-field';
  restGroup.innerHTML = '<label for="live-exercise-rest">Descanso (segundos)</label><input id="live-exercise-rest" name="descanso_segundos" type="number" min="0" max="3600" step="1" placeholder="Ex.: 60">';
  grid.appendChild(restGroup);

  const completion = document.createElement('label');
  completion.className = 'live-exercise-completion';
  completion.innerHTML = `
    <input id="live-exercise-completed" name="concluido" type="checkbox">
    <span class="live-exercise-completion-copy">
      <strong>Marcar exercício como concluído</strong>
      <small>Atualiza imediatamente o progresso desta aula.</small>
    </span>`;
  grid.after(completion);

  const subtitle = document.querySelector('#live-exercise-edit-subtitle');
  if (subtitle) subtitle.textContent = 'Edite séries, repetições e descanso ou marque este exercício como concluído.';
}

function currentSessionId() {
  return sessionModal?.getAttribute('data-current-session-id') || '';
}

function bindExerciseRows() {
  document.addEventListener('click', event => {
    const row = event.target.closest('.live-session-exercise-row[data-live-exercise-id]');
    if (!row || !sessionModal.contains(row)) return;

    selectedExerciseId = row.dataset.liveExerciseId || '';
    selectedExerciseRow = row;
    ensureExtraFields();

    const requestId = ++loadRequest;
    window.setTimeout(() => loadExerciseState(requestId), 0);
  });
}

async function loadExerciseState(requestId) {
  const sessionId = currentSessionId();
  if (!sessionId || !selectedExerciseId) return;

  const { data, error } = await supabase.rpc('obter_exercicio_sessao_personal', {
    p_sessao_id: sessionId,
    p_treino_exercicio_id: selectedExerciseId
  });

  if (requestId !== loadRequest || !selectedExerciseId) return;
  if (error) {
    console.error('Erro ao carregar estado do exercício em aula:', error);
    return;
  }

  const details = Array.isArray(data) ? data[0] : data;
  if (!details) return;
  lastDetails = details;

  const modal = document.querySelector('#live-exercise-edit-modal');
  if (!modal?.classList.contains('open')) return;

  const series = modal.querySelector('#live-exercise-series');
  const repetitions = modal.querySelector('#live-exercise-repetitions');
  const rest = modal.querySelector('#live-exercise-rest');
  const completed = modal.querySelector('#live-exercise-completed');

  if (series) series.value = details.series ?? '';
  if (repetitions) repetitions.value = details.repeticoes ?? '';
  if (rest) rest.value = details.descanso_segundos ?? '';
  if (completed) completed.checked = Boolean(details.concluido);

  updateExerciseRow(Boolean(details.concluido), details);
}

function bindSaveOverride() {
  document.addEventListener('submit', event => {
    const form = event.target.closest('#live-exercise-edit-form');
    if (!form) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    saveExercise(form).catch(error => {
      console.error('Erro ao salvar exercício durante a aula:', error);
      alert(error?.message || 'Não foi possível atualizar este exercício.');
    });
  }, true);
}

async function saveExercise(form) {
  const sessionId = currentSessionId();
  if (!sessionId || !selectedExerciseId) throw new Error('Exercício ou aula não identificados.');

  const submit = form.querySelector('button[type="submit"]');
  const seriesRaw = String(form.series?.value || '').trim();
  const repetitions = String(form.repeticoes?.value || '').trim();
  const restRaw = String(form.descanso_segundos?.value || '').trim();
  const completed = Boolean(form.concluido?.checked);
  const series = seriesRaw ? Number(seriesRaw) : null;
  const rest = restRaw ? Number(restRaw) : null;

  if (series != null && (!Number.isInteger(series) || series < 1 || series > 20)) {
    throw new Error('Informe uma quantidade de séries entre 1 e 20.');
  }
  if (rest != null && (!Number.isInteger(rest) || rest < 0 || rest > 3600)) {
    throw new Error('Informe o descanso em segundos entre 0 e 3600.');
  }

  const originalText = submit?.textContent || 'Salvar';
  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Salvando...';
  }

  try {
    const { data, error } = await supabase.rpc('atualizar_exercicio_sessao_personal', {
      p_sessao_id: sessionId,
      p_treino_exercicio_id: selectedExerciseId,
      p_series: series,
      p_repeticoes: repetitions || null,
      p_descanso_segundos: rest,
      p_concluido: completed
    });
    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;
    const details = {
      ...(lastDetails || {}),
      series,
      repeticoes: repetitions || null,
      descanso_segundos: rest,
      concluido: completed
    };
    lastDetails = details;
    updateExerciseRow(completed, details);
    updateProgress(result);
    closeExerciseModal();
  } finally {
    if (submit) {
      submit.disabled = false;
      submit.textContent = originalText;
    }
  }
}

function updateProgress(result) {
  if (!progress || !result) return;
  const total = Number(result.total_exercicios ?? 0);
  const done = Number(result.exercicios_concluidos ?? 0);
  progress.textContent = `${done}/${total} concluídos`;
}

function updateExerciseRow(completed, details = {}) {
  const row = selectedExerciseRow;
  if (!row) return;

  row.classList.toggle('is-completed', completed);
  const copy = row.querySelector('.live-session-exercise-copy');
  if (!copy) return;

  const strong = copy.querySelector('strong');
  if (strong && !strong.parentElement?.classList.contains('live-session-exercise-title-line')) {
    const line = document.createElement('span');
    line.className = 'live-session-exercise-title-line';
    strong.before(line);
    line.appendChild(strong);
  }

  const line = copy.querySelector('.live-session-exercise-title-line');
  line?.querySelector('.live-exercise-completed-badge')?.remove();
  if (completed && line) {
    const badge = document.createElement('span');
    badge.className = 'live-exercise-completed-badge';
    badge.textContent = 'CONCLUÍDO';
    line.appendChild(badge);
  }

  const meta = copy.querySelector(':scope > span:not(.live-session-exercise-title-line)');
  if (meta) {
    meta.textContent = [
      details.series ? `${details.series} séries` : null,
      details.repeticoes ? `${details.repeticoes} rep.` : null,
      details.carga || null,
      details.descanso_segundos != null ? `${details.descanso_segundos}s descanso` : null
    ].filter(Boolean).join(' • ') || 'Sem prescrição detalhada';
  }
}

function closeExerciseModal() {
  const modal = document.querySelector('#live-exercise-edit-modal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}
