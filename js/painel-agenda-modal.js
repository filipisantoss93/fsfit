import { supabase } from './supabase.js';

const todayList = document.querySelector('#today-list');
const todayCount = document.querySelector('#today-count');
const totalToday = document.querySelector('#alunos-hoje');
const attentionToday = document.querySelector('#attention-today');

if (todayList) {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    let currentEntry = null;
    let currentWorkout = null;
    let cancelledStudentIds = new Set();

    const modal = ensureModal();
    const body = modal.querySelector('#today-workout-dashboard-body');
    const title = modal.querySelector('#today-workout-dashboard-title');
    const subtitle = modal.querySelector('#today-workout-dashboard-subtitle');
    const startButton = modal.querySelector('#today-workout-start');
    const editButton = modal.querySelector('#today-workout-edit');
    const cancelButton = modal.querySelector('#today-workout-cancel');

    await loadCancelledStudents();
    prepareRows();

    const observer = new MutationObserver(() => prepareRows());
    observer.observe(todayList, { childList: true, subtree: false });

    todayList.addEventListener('click', event => {
      const row = event.target.closest('.today-entry');
      if (!row || row.classList.contains('locked') || row.classList.contains('is-in-class')) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openDashboard(row).catch(error => {
        console.error('Erro ao abrir dashboard do treino de hoje:', error);
        alert('Não foi possível abrir o treino de hoje.');
      });
    }, true);

    todayList.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target.closest('.today-entry');
      if (!row || row.classList.contains('locked') || row.classList.contains('is-in-class')) return;
      event.preventDefault();
      openDashboard(row).catch(console.error);
    });

    modal.addEventListener('click', event => {
      if (event.target === modal || event.target.closest('[data-close-today-workout-dashboard]')) closeDashboard();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modal.classList.contains('open')) closeDashboard();
    });

    startButton.addEventListener('click', startWorkout);
    editButton.addEventListener('click', editWorkout);
    cancelButton.addEventListener('click', cancelAppointment);

    async function loadCancelledStudents() {
      const date = localDateValue(new Date());
      const { data, error } = await supabase
        .from('agenda_cancelamentos')
        .select('aluno_id')
        .eq('personal_id', session.user.id)
        .eq('data', date);

      if (error) {
        console.error('Não foi possível carregar cancelamentos da agenda:', error);
        return;
      }

      cancelledStudentIds = new Set((data || []).map(row => String(row.aluno_id || '')).filter(Boolean));
    }

    function prepareRows() {
      [...todayList.querySelectorAll('.today-entry')].forEach(row => {
        const studentId = getStudentId(row);
        if (!studentId) return;

        row.dataset.studentId = studentId;
        if (cancelledStudentIds.has(studentId)) {
          row.remove();
          return;
        }

        if (row.tagName === 'A') row.removeAttribute('href');
        if (!row.classList.contains('locked')) {
          row.setAttribute('role', 'button');
          row.setAttribute('tabindex', '0');
          const name = getStudentName(row);
          row.setAttribute('aria-label', `Abrir treino de hoje de ${name}`);
        }
      });

      syncCounts();
    }

    async function openDashboard(row) {
      const studentId = getStudentId(row);
      if (!studentId) return;

      currentEntry = {
        row,
        studentId,
        name: getStudentName(row),
        time: row.querySelector('.today-time')?.textContent?.trim() || '—',
        location: getLocation(row),
        workoutLabel: getWorkoutLabel(row)
      };

      title.textContent = currentEntry.name;
      subtitle.textContent = 'Carregando treino de hoje...';
      body.innerHTML = '<div class="today-workout-loading">Carregando planejamento...</div>';
      setActionsDisabled(true);
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('today-workout-dashboard-open');

      const { data: workouts, error: workoutError } = await supabase
        .from('treinos')
        .select('id,nome,descricao,dias_semana,data_inicio,data_fim,status,updated_at')
        .eq('personal_id', session.user.id)
        .eq('aluno_id', studentId)
        .eq('status', 'ativo')
        .eq('modelo', false)
        .order('updated_at', { ascending: false });

      if (workoutError) throw workoutError;

      const todayDay = new Date().getDay();
      currentWorkout = (workouts || []).find(workout => Array.isArray(workout.dias_semana) && workout.dias_semana.map(Number).includes(todayDay)) || workouts?.[0] || null;

      if (!currentWorkout) {
        subtitle.textContent = currentEntry.workoutLabel || 'Sem treino ativo';
        body.innerHTML = '<div class="today-workout-empty">Nenhum treino ativo foi encontrado para este aluno.</div>';
        startButton.disabled = true;
        editButton.disabled = false;
        cancelButton.disabled = true;
        return;
      }

      subtitle.textContent = currentWorkout.nome || currentEntry.workoutLabel || 'Treino de hoje';

      const exerciseDay = todayDay === 0 ? 7 : todayDay;
      const { data: exercises, error: exerciseError } = await supabase
        .from('treino_exercicios')
        .select('id,ordem,series,repeticoes,carga,descanso_segundos,exercicios(nome)')
        .eq('treino_id', currentWorkout.id)
        .eq('dia_semana', exerciseDay)
        .order('ordem');

      if (exerciseError) throw exerciseError;

      renderDashboard(exercises || []);
      setActionsDisabled(false);
    }

    function renderDashboard(exercises) {
      const count = exercises.length;
      body.innerHTML = `
        <div class="today-workout-metrics">
          <div><small>HORÁRIO</small><strong>${escapeHtml(currentEntry.time)}</strong></div>
          <div><small>LOCAL</small><strong>${escapeHtml(currentEntry.location || 'Não informado')}</strong></div>
          <div><small>EXERCÍCIOS</small><strong>${count}</strong></div>
        </div>
        <section class="today-workout-plan-card">
          <div class="today-workout-plan-heading">
            <div><small>PLANO DE HOJE</small><h3>${escapeHtml(currentWorkout.nome || 'Treino')}</h3></div>
            <span>${count} ${count === 1 ? 'exercício' : 'exercícios'}</span>
          </div>
          ${currentWorkout.descricao ? `<p class="today-workout-description">${escapeHtml(currentWorkout.descricao)}</p>` : ''}
          <div class="today-workout-exercises">
            ${count ? exercises.map((exercise, index) => {
              const meta = [
                exercise.series ? `${exercise.series} séries` : '',
                exercise.repeticoes ? `${exercise.repeticoes} rep.` : '',
                exercise.descanso_segundos != null ? `${exercise.descanso_segundos}s descanso` : ''
              ].filter(Boolean).join(' · ');
              return `<div class="today-workout-exercise-row">
                <span class="today-workout-exercise-order">${index + 1}</span>
                <div><strong>${escapeHtml(exercise.exercicios?.nome || 'Exercício')}</strong><small>${escapeHtml(meta || 'Sem detalhes')}</small></div>
              </div>`;
            }).join('') : '<div class="today-workout-empty">Nenhum exercício configurado para hoje.</div>'}
          </div>
        </section>`;
    }

    async function startWorkout() {
      if (!currentEntry?.studentId) return;
      startButton.disabled = true;
      const original = startButton.textContent;
      startButton.textContent = 'Iniciando...';

      try {
        const { data: sessionId, error } = await supabase.rpc('iniciar_sessao_personal_sem_checkin', {
          p_aluno_id: currentEntry.studentId
        });
        if (error || !sessionId) throw error || new Error('Sessão não iniciada.');

        closeDashboard();
        window.dispatchEvent(new Event('focus'));
        await openLiveSessionWhenReady(String(sessionId));
      } catch (error) {
        console.error('Erro ao iniciar treino:', error);
        alert(error?.message || 'Não foi possível iniciar o treino.');
      } finally {
        startButton.disabled = false;
        startButton.textContent = original;
      }
    }

    async function openLiveSessionWhenReady(sessionId) {
      for (let attempt = 0; attempt < 35; attempt += 1) {
        const row = document.querySelector(`[data-open-live-session="${cssEscape(sessionId)}"]`);
        if (row) {
          row.click();
          return;
        }
        if (attempt === 10 || attempt === 20) window.dispatchEvent(new Event('focus'));
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      document.querySelector('[data-dashboard-tab="live"]')?.click();
    }

    function editWorkout() {
      if (!currentEntry?.studentId) return;
      const editorModal = document.querySelector('#live-workout-editor-modal');
      const editorFrame = document.querySelector('#live-workout-editor-frame');
      if (!editorModal || !editorFrame) return;

      closeDashboard();
      editorFrame.src = `treino-aluno.html?id=${encodeURIComponent(currentEntry.studentId)}&embed=1`;
      editorModal.classList.add('open');
      editorModal.setAttribute('aria-hidden', 'false');
    }

    async function cancelAppointment() {
      if (!currentEntry?.studentId || !currentWorkout?.id) return;
      const confirmed = confirm(`Cancelar o agendamento de hoje de ${currentEntry.name}?\n\nEsta ação cancela somente o atendimento de hoje. Os próximos dias do treino continuam normalmente.`);
      if (!confirmed) return;

      cancelButton.disabled = true;
      const original = cancelButton.textContent;
      cancelButton.textContent = 'Cancelando...';

      try {
        const date = localDateValue(new Date());
        const { data, error } = await supabase.rpc('cancelar_agendamento_personal', {
          p_aluno_id: currentEntry.studentId,
          p_treino_id: currentWorkout.id,
          p_data: date
        });
        if (error || data !== true) throw error || new Error('Agendamento não cancelado.');

        cancelledStudentIds.add(currentEntry.studentId);
        currentEntry.row?.remove();
        syncCounts();
        closeDashboard();
      } catch (error) {
        console.error('Erro ao cancelar agendamento:', error);
        alert(error?.message || 'Não foi possível cancelar o agendamento.');
      } finally {
        cancelButton.disabled = false;
        cancelButton.textContent = original;
      }
    }

    function closeDashboard() {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('today-workout-dashboard-open');
      currentEntry = null;
      currentWorkout = null;
    }

    function setActionsDisabled(disabled) {
      startButton.disabled = disabled;
      editButton.disabled = disabled;
      cancelButton.disabled = disabled;
    }

    function syncCounts() {
      const count = todayList.querySelectorAll('.today-entry:not(.locked)').length;
      if (todayCount) todayCount.textContent = String(count);
      if (totalToday) totalToday.textContent = String(count);
      if (attentionToday) attentionToday.textContent = String(count);
      if (!count && !todayList.querySelector('.dashboard-empty')) {
        todayList.innerHTML = '<p class="dashboard-empty">Nenhum aluno programado para hoje. Sua agenda está livre.</p>';
      }
    }
  }
}

function getStudentId(row) {
  if (row?.dataset?.studentId) return row.dataset.studentId;
  const href = row?.getAttribute?.('href');
  if (!href) return '';
  try {
    return new URL(href, location.href).searchParams.get('id') || '';
  } catch {
    return '';
  }
}

function getStudentName(row) {
  return row?.querySelector('.today-entry-main strong')?.textContent?.trim() || 'Aluno';
}

function getWorkoutLabel(row) {
  const main = row?.querySelector('.today-entry-main');
  return main?.dataset?.workout || main?.querySelector(':scope > span:not(.today-status)')?.textContent?.trim() || 'Treino de hoje';
}

function getLocation(row) {
  const main = row?.querySelector('.today-entry-main');
  const raw = main?.dataset?.details || main?.querySelector('small')?.textContent?.trim() || '';
  return raw.includes('·') ? raw.split('·').pop().trim() : raw;
}

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function cssEscape(value) {
  return window.CSS?.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function ensureModal() {
  const existing = document.querySelector('#today-workout-dashboard-modal');
  if (existing) return existing;

  const modal = document.createElement('div');
  modal.id = 'today-workout-dashboard-modal';
  modal.className = 'today-workout-dashboard-modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <section class="today-workout-dashboard-dialog" role="dialog" aria-modal="true" aria-labelledby="today-workout-dashboard-title">
      <header class="today-workout-dashboard-header">
        <div><small>TREINO DE HOJE</small><h2 id="today-workout-dashboard-title">Aluno</h2><p id="today-workout-dashboard-subtitle">Treino de hoje</p></div>
        <button class="today-workout-dashboard-close" type="button" data-close-today-workout-dashboard aria-label="Fechar">×</button>
      </header>
      <div id="today-workout-dashboard-body" class="today-workout-dashboard-body"></div>
      <footer class="today-workout-dashboard-actions">
        <button id="today-workout-start" class="btn btn-primary" type="button">Iniciar treino</button>
        <button id="today-workout-edit" class="btn btn-outline" type="button">Editar treino</button>
        <button id="today-workout-cancel" class="btn btn-danger" type="button">Cancelar agendamento</button>
      </footer>
    </section>`;
  document.body.appendChild(modal);
  return modal;
}
