from pathlib import Path

js_path = Path('js/aulas-painel-editor.js')
text = js_path.read_text(encoding='utf-8')

text = text.replace(
"let workoutsRequest = 0;",
"let workoutsRequest = 0;\nlet currentExerciseId = '';\nlet currentExercises = new Map();"
)

text = text.replace(
"    .live-session-exercise-row{display:grid;grid-template-columns:26px minmax(0,1fr);gap:9px;align-items:start;padding:8px 9px;border:1px solid rgba(255,255,255,.07);border-radius:7px;background:rgba(255,255,255,.02)}",
"    .live-session-exercise-row{width:100%;display:grid;grid-template-columns:26px minmax(0,1fr) auto;gap:9px;align-items:center;padding:8px 9px;border:1px solid rgba(255,255,255,.07);border-radius:7px;background:rgba(255,255,255,.02);color:inherit;text-align:left;cursor:pointer;transition:background .18s ease,border-color .18s ease}\n    .live-session-exercise-row:hover,.live-session-exercise-row:focus-visible{background:rgba(59,130,246,.06);border-color:rgba(59,130,246,.35);outline:none}\n    .live-session-exercise-arrow{color:var(--secondary);font-size:1.2rem;line-height:1}"
)

text = text.replace(
"    .live-session-edit-workout{width:100%;margin-bottom:4px}\n    .live-session-tab-panel[data-live-tab-panel=\"chat\"] .live-session-chat-title{margin-top:2px}",
"    .live-session-edit-workout{width:100%;margin-bottom:4px}\n    .live-exercise-edit-modal{position:absolute;inset:0;z-index:8;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(4,7,10,.78);backdrop-filter:blur(5px)}\n    .live-exercise-edit-modal.open{display:flex}\n    .live-exercise-edit-dialog{width:min(430px,100%);padding:18px;border:1px solid var(--border);border-radius:10px;background:#171c22;box-shadow:0 20px 55px rgba(0,0,0,.45)}\n    .live-exercise-edit-dialog h3{margin:0 0 4px;font-size:1rem}\n    .live-exercise-edit-dialog p{margin:0 0 15px;color:var(--muted);font-size:.74rem}\n    .live-exercise-edit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}\n    .live-exercise-edit-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}\n    .live-session-tab-panel[data-live-tab-panel=\"chat\"] .live-session-chat-title{margin-top:2px}"
)

text = text.replace(
"    <div id=\"live-session-workouts-list\" class=\"live-session-workouts-list\"><div class=\"live-session-workout-empty\">Carregando treinos...</div></div>\n    <button id=\"live-session-edit-workout\" class=\"btn btn-outline btn-action-tile live-session-edit-workout\" type=\"button\">\n      <span class=\"btn-action-icon\" aria-hidden=\"true\">✎</span>\n      <span class=\"btn-action-copy\"><span class=\"btn-action-title\">Editar treino</span><span class=\"btn-action-description\">Ajustar planos, dias e exercícios deste aluno</span></span>\n    </button>`;",
"    <div id=\"live-session-workouts-list\" class=\"live-session-workouts-list\"><div class=\"live-session-workout-empty\">Carregando treino de hoje...</div></div>`;"
)

text = text.replace(
"  document.querySelector('#live-session-edit-workout')?.addEventListener('click', () => {\n    const studentId = currentStudent || currentStudentId();\n    if (studentId) openEditor(studentId);\n  });",
"  ensureExerciseEditor();\n  ensureEditActionButton();"
)

marker = "function setActiveTab(tab = 'workouts') {"
insert = r'''
function ensureEditActionButton() {
  if (!modalActions || modalActions.querySelector('[data-live-edit-workout]')) return;
  const recordLink = modalActions.querySelector('a[href*="ficha-aluno.html?id="]');
  const studentId = currentStudent || currentStudentId();
  if (!recordLink || !studentId) return;

  const button = document.createElement('button');
  button.className = 'btn btn-outline btn-action-tile';
  button.type = 'button';
  button.dataset.liveEditWorkout = studentId;
  button.innerHTML = `
    <span class="btn-action-icon" aria-hidden="true">✎</span>
    <span class="btn-action-copy"><span class="btn-action-title">Editar treino</span><span class="btn-action-description">Ajustar planos, dias e exercícios</span></span>`;
  recordLink.before(button);
}

function todayWorkoutDay() {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

function ensureExerciseEditor() {
  if (!sessionModal || document.querySelector('#live-exercise-edit-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'live-exercise-edit-modal';
  modal.className = 'live-exercise-edit-modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <section class="live-exercise-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="live-exercise-edit-title">
      <h3 id="live-exercise-edit-title">Ajustar exercício</h3>
      <p id="live-exercise-edit-subtitle">Altere séries e repetições para este aluno.</p>
      <form id="live-exercise-edit-form">
        <div class="live-exercise-edit-grid">
          <div class="form-group"><label for="live-exercise-series">Séries</label><input id="live-exercise-series" name="series" type="number" min="1" max="20" step="1"></div>
          <div class="form-group"><label for="live-exercise-repetitions">Repetições</label><input id="live-exercise-repetitions" name="repeticoes" type="text" maxlength="50" placeholder="Ex.: 12 ou 15–20"></div>
        </div>
        <div class="live-exercise-edit-actions">
          <button class="btn btn-neutral" type="button" data-close-live-exercise-edit>Cancelar</button>
          <button class="btn btn-primary" type="submit">Salvar</button>
        </div>
      </form>
    </section>`;
  sessionModal.appendChild(modal);

  modal.addEventListener('click', event => {
    if (event.target === modal || event.target.closest('[data-close-live-exercise-edit]')) closeExerciseEditor();
  });
  modal.querySelector('#live-exercise-edit-form')?.addEventListener('submit', saveExerciseAdjustments);
}

function openExerciseEditor(exerciseId) {
  const row = currentExercises.get(exerciseId);
  const modal = document.querySelector('#live-exercise-edit-modal');
  if (!row || !modal) return;
  currentExerciseId = exerciseId;
  modal.querySelector('#live-exercise-edit-title').textContent = row.exercicios?.nome || 'Ajustar exercício';
  modal.querySelector('#live-exercise-series').value = row.series ?? '';
  modal.querySelector('#live-exercise-repetitions').value = row.repeticoes ?? '';
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeExerciseEditor() {
  const modal = document.querySelector('#live-exercise-edit-modal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  currentExerciseId = '';
}

async function saveExerciseAdjustments(event) {
  event.preventDefault();
  const row = currentExercises.get(currentExerciseId);
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  if (!row || !currentExerciseId || !submit) return;

  const seriesRaw = String(form.series.value || '').trim();
  const repetitions = String(form.repeticoes.value || '').trim();
  const series = seriesRaw ? Number(seriesRaw) : null;
  if (series != null && (!Number.isInteger(series) || series < 1 || series > 20)) return;

  submit.disabled = true;
  const originalText = submit.textContent;
  submit.textContent = 'Salvando...';
  try {
    const { error } = await supabase
      .from('treino_exercicios')
      .update({ series, repeticoes: repetitions || null })
      .eq('id', currentExerciseId)
      .eq('treino_id', row.treino_id);
    if (error) throw error;
    row.series = series;
    row.repeticoes = repetitions || null;
    closeExerciseEditor();
    if (currentStudent) await loadStudentWorkouts(currentStudent);
  } catch (error) {
    console.error('Erro ao atualizar exercício no acompanhamento:', error);
    alert('Não foi possível atualizar séries e repetições deste exercício.');
  } finally {
    submit.disabled = false;
    submit.textContent = originalText;
  }
}

'''
if marker not in text:
    raise SystemExit('Marcador setActiveTab não encontrado')
text = text.replace(marker, insert + marker)

text = text.replace(
"              <div class=\"live-session-exercise-row\">\n                <span class=\"live-session-exercise-order\">${escapeHtml(String(row.ordem || index + 1))}</span>\n                <span class=\"live-session-exercise-copy\">\n                  <strong>${escapeHtml(row.exercicios?.nome || 'Exercício')}</strong>\n                  <span>${escapeHtml(exerciseMeta(row))}</span>\n                </span>\n              </div>",
"              <button class=\"live-session-exercise-row\" type=\"button\" data-live-exercise-id=\"${escapeHtml(row.id)}\">\n                <span class=\"live-session-exercise-order\">${escapeHtml(String(row.ordem || index + 1))}</span>\n                <span class=\"live-session-exercise-copy\">\n                  <strong>${escapeHtml(row.exercicios?.nome || 'Exercício')}</strong>\n                  <span>${escapeHtml(exerciseMeta(row))}</span>\n                </span>\n                <span class=\"live-session-exercise-arrow\" aria-hidden=\"true\">›</span>\n              </button>"
)

old_render = r'''    const exercisesByWorkout = (exerciseData || []).reduce((acc, row) => {
      (acc[row.treino_id] ||= []).push(row);
      return acc;
    }, {});

    host.innerHTML = workouts.map(workout => {
      const days = (workout.dias_semana || [])
        .map(Number)
        .map(day => DAY_NAMES[day])
        .filter(Boolean)
        .join(', ') || 'Dias não definidos';
      const start = formatDate(workout.data_inicio);
      const end = formatDate(workout.data_fim);
      const period = [start, end].filter(Boolean).join(' → ');
      const workoutExercises = exercisesByWorkout[workout.id] || [];

      return `
        <article class="live-session-workout-card">
          <div class="live-session-workout-header">
            <div class="live-session-workout-main">
              <div class="live-session-workout-title">
                <strong>${escapeHtml(workout.nome || 'Plano de treino')}</strong>
                ${workout.status === 'ativo' ? '<span class="live-session-workout-badge">ATIVO</span>' : ''}
              </div>
              <span class="live-session-workout-meta">${escapeHtml(days)}</span>
              ${period ? `<span class="live-session-workout-period">${escapeHtml(period)}</span>` : ''}
            </div>
            <span class="live-session-workout-count">${workoutExercises.length} ${workoutExercises.length === 1 ? 'exercício' : 'exercícios'}</span>
          </div>
          <div class="live-session-workout-exercises">${renderWorkoutExercises(workout, workoutExercises)}</div>
        </article>`;
    }).join('');'''

new_render = r'''    const todayDay = todayWorkoutDay();
    const todayName = DAY_NAMES[todayDay] || 'Hoje';
    currentExercises = new Map((exerciseData || []).map(row => [row.id, row]));

    const exercisesByWorkout = (exerciseData || []).reduce((acc, row) => {
      if (Number(row.dia_semana) === todayDay) (acc[row.treino_id] ||= []).push(row);
      return acc;
    }, {});

    let visibleWorkouts = workouts.filter(workout => workout.status === 'ativo' && (exercisesByWorkout[workout.id] || []).length);
    if (!visibleWorkouts.length) {
      visibleWorkouts = workouts.filter(workout => (exercisesByWorkout[workout.id] || []).length);
    }

    if (!visibleWorkouts.length) {
      host.innerHTML = `<div class="live-session-workout-empty">Nenhum exercício agendado para hoje (${escapeHtml(todayName)}).</div>`;
      ensureEditActionButton();
      return;
    }

    host.innerHTML = visibleWorkouts.map(workout => {
      const start = formatDate(workout.data_inicio);
      const end = formatDate(workout.data_fim);
      const period = [start, end].filter(Boolean).join(' → ');
      const workoutExercises = exercisesByWorkout[workout.id] || [];

      return `
        <article class="live-session-workout-card">
          <div class="live-session-workout-header">
            <div class="live-session-workout-main">
              <div class="live-session-workout-title">
                <strong>${escapeHtml(workout.nome || 'Plano de treino')}</strong>
                ${workout.status === 'ativo' ? '<span class="live-session-workout-badge">ATIVO</span>' : ''}
              </div>
              <span class="live-session-workout-meta">Hoje · ${escapeHtml(todayName)}</span>
              ${period ? `<span class="live-session-workout-period">${escapeHtml(period)}</span>` : ''}
            </div>
            <span class="live-session-workout-count">${workoutExercises.length} ${workoutExercises.length === 1 ? 'exercício' : 'exercícios'}</span>
          </div>
          <div class="live-session-workout-exercises">${renderWorkoutExercises(workout, workoutExercises)}</div>
        </article>`;
    }).join('');
    ensureEditActionButton();'''

if old_render not in text:
    raise SystemExit('Bloco de renderização dos treinos não encontrado')
text = text.replace(old_render, new_render)

text = text.replace(
"  tabs.addEventListener('click', event => {",
"  workoutsPanel.addEventListener('click', event => {\n    const exercise = event.target.closest('[data-live-exercise-id]');\n    if (exercise) openExerciseEditor(exercise.dataset.liveExerciseId);\n  });\n\n  tabs.addEventListener('click', event => {"
)

text = text.replace(
"  const observer = new MutationObserver(() => {\n    if (!sessionModal?.classList.contains('open')) return;\n    const studentId = currentStudentId();\n    if (studentId && studentId !== currentStudent) loadStudentWorkouts(studentId).catch(console.error);\n  });",
"  const observer = new MutationObserver(() => {\n    if (!sessionModal?.classList.contains('open')) return;\n    ensureEditActionButton();\n    const studentId = currentStudentId();\n    if (studentId && studentId !== currentStudent) loadStudentWorkouts(studentId).catch(console.error);\n  });"
)

text = text.replace(
"editorClose?.addEventListener('click', closeEditor);",
"modalActions?.addEventListener('click', event => {\n  const editButton = event.target.closest('[data-live-edit-workout]');\n  if (!editButton) return;\n  openEditor(editButton.dataset.liveEditWorkout || currentStudent || currentStudentId());\n});\n\neditorClose?.addEventListener('click', closeEditor);"
)

js_path.write_text(text, encoding='utf-8')

panel = Path('painel.html')
panel_text = panel.read_text(encoding='utf-8')
panel_text = panel_text.replace('js/aulas-painel-editor.js?v=20260720-live-tabs2', 'js/aulas-painel-editor.js?v=20260720-live-tabs3')
panel_text = panel_text.replace('js/aulas-painel-editor.js?v=20260720-live-tabs1', 'js/aulas-painel-editor.js?v=20260720-live-tabs3')
panel.write_text(panel_text, encoding='utf-8')

print('Ajustes aplicados ao acompanhamento ao vivo.')
