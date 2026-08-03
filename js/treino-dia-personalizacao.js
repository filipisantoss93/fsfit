import { supabase } from './supabase.js';
import { requireSession } from './layout.js';

const alunoId = new URLSearchParams(location.search).get('id');
const DAY_NAMES = { 1: 'Segunda-feira', 2: 'Terça-feira', 3: 'Quarta-feira', 4: 'Quinta-feira', 5: 'Sexta-feira', 6: 'Sábado', 7: 'Domingo' };

if (alunoId && !globalThis.__FSFIT_DAY_WORKOUT_CUSTOMIZER__) {
  globalThis.__FSFIT_DAY_WORKOUT_CUSTOMIZER__ = true;

  const session = await requireSession();
  if (!session) throw new Error('Sessão inválida');

  const app = await waitFor(() => document.querySelector('#simple-workout-app'));
  const modal = await waitFor(() => document.querySelector('#simple-workout-modal'));
  const modalBody = modal?.querySelector('#simple-workout-modal-body');
  if (!app || !modal || !modalBody) throw new Error('Editor simplificado não encontrado');

  let workoutId = '';
  let workoutName = '';
  let selectedDay = 0;
  let rows = [];
  let library = [];
  let dirty = false;
  let rendering = false;

  bindContextCapture();
  bindActions();
  observeModal();

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

  function esc(value = '') {
    const element = document.createElement('div');
    element.textContent = value ?? '';
    return element.innerHTML;
  }

  function prescriptionType(row = {}) {
    return row.tipo_prescricao_snapshot || row.exercicios?.tipo_prescricao || 'repeticoes';
  }

  function exerciseName(row = {}) {
    return row.exercicio_nome_snapshot || row.exercicios?.nome || 'Exercício';
  }

  function summary(row = {}) {
    const type = prescriptionType(row);
    const parts = [];
    if (row.series) parts.push(`${row.series} séries`);
    if (type === 'tempo' && row.duracao_minutos) parts.push(`${row.duracao_minutos} min`);
    else if (type === 'distancia' && row.distancia_km) parts.push(`${row.distancia_km} km`);
    else if (row.repeticoes) parts.push(`${row.repeticoes} rep.`);
    if (row.carga) parts.push(row.carga);
    if (row.descanso_segundos != null) parts.push(`${row.descanso_segundos}s`);
    return parts.join(' · ') || 'Sem configuração';
  }

  function activeDay() {
    return Number(app.querySelector('[data-simple-day].active')?.dataset.simpleDay || 0);
  }

  function bindContextCapture() {
    app.addEventListener('click', event => {
      const trigger = event.target.closest('[data-view-assignment]');
      if (!trigger) return;
      workoutId = trigger.dataset.viewAssignment || '';
      workoutName = trigger.querySelector('strong')?.textContent?.trim() || 'Treino';
      selectedDay = activeDay();
      dirty = false;
    }, true);
  }

  function observeModal() {
    const observer = new MutationObserver(() => {
      if (rendering || !workoutId || !selectedDay || !modal.classList.contains('open')) return;
      const legacyDetail = modalBody.querySelector('.simple-assignment-detail:not([data-day-customized])');
      if (!legacyDetail) return;
      legacyDetail.dataset.dayCustomized = 'loading';
      legacyDetail.innerHTML = '<div class="day-custom-loading">Carregando exercícios...</div>';
      loadAndRender().catch(handleError);
    });
    observer.observe(modalBody, { childList: true, subtree: true });
  }

  function finalizeLocalUpdate() {
    if (!dirty) return;
    dirty = false;
    updateWeekCardCount();
    window.dispatchEvent(new CustomEvent('fsfit:workout-updated', {
      detail: { alunoId, workoutId, day: selectedDay, exerciseCount: rows.length, source: 'day-customization' }
    }));
  }

  function bindActions() {
    modal.addEventListener('click', event => {
      if (event.target.closest('[data-day-add-exercise]')) {
        event.preventDefault();
        openExercisePicker().catch(handleError);
        return;
      }
      const edit = event.target.closest('[data-day-edit-exercise]');
      if (edit) {
        event.preventDefault();
        openExerciseEditor(edit.dataset.dayEditExercise);
        return;
      }
      const remove = event.target.closest('[data-day-remove-exercise]');
      if (remove) {
        event.preventDefault();
        removeExercise(remove.dataset.dayRemoveExercise).catch(handleError);
        return;
      }
      if (event.target.closest('[data-day-editor-back]')) {
        event.preventDefault();
        loadAndRender().catch(handleError);
      }
    }, true);

    modal.addEventListener('click', event => {
      if (!event.target.closest('[data-simple-modal-close]')) return;
      finalizeLocalUpdate();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modal.classList.contains('open')) finalizeLocalUpdate();
    });
  }

  async function validateWorkout() {
    const { data, error } = await supabase
      .from('treinos')
      .select('id,nome,modelo,aluno_id,personal_id,status,dias_semana')
      .eq('id', workoutId)
      .eq('personal_id', session.user.id)
      .eq('aluno_id', alunoId)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.modelo) throw new Error('O treino aplicado não foi encontrado.');
    if (!(data.dias_semana || []).map(Number).includes(Number(selectedDay))) throw new Error('Este treino não está mais aplicado neste dia.');
    workoutName = data.nome || workoutName;
    return data;
  }

  async function loadRows() {
    await validateWorkout();
    const { data, error } = await supabase
      .from('treino_exercicios')
      .select('id,treino_id,exercicio_id,dia_semana,ordem,series,repeticoes,duracao_minutos,distancia_km,carga,descanso_segundos,observacoes,exercicio_nome_snapshot,grupo_muscular_snapshot,equipamento_snapshot,tipo_prescricao_snapshot,exercicios(nome,grupo_muscular,equipamento,tipo_prescricao)')
      .eq('treino_id', workoutId)
      .eq('dia_semana', selectedDay)
      .order('ordem');
    if (error) throw error;
    rows = data || [];
  }

  async function loadAndRender() {
    await loadRows();
    renderAssignment();
    updateWeekCardCount();
  }

  function renderAssignment() {
    rendering = true;
    const list = rows.map((row, index) => `
      <article class="simple-exercise-card day-custom-exercise">
        <span class="simple-exercise-order">${index + 1}</span>
        <button class="simple-exercise-main" type="button" data-day-edit-exercise="${esc(row.id)}">
          <strong>${esc(exerciseName(row))}</strong>
          <small>${esc(summary(row))}</small>
        </button>
        <button class="simple-exercise-remove" type="button" data-day-remove-exercise="${esc(row.id)}" aria-label="Excluir ${esc(exerciseName(row))}">×</button>
      </article>`).join('');

    modalBody.innerHTML = `<div class="simple-assignment-detail" data-day-customized="true">
      <div class="day-custom-toolbar">
        <div><small>PERSONALIZAÇÃO DE ${esc(DAY_NAMES[selectedDay] || 'DIA')}</small><strong>${rows.length} ${rows.length === 1 ? 'exercício' : 'exercícios'}</strong></div>
        <button class="btn btn-primary" type="button" data-day-add-exercise>+ Adicionar exercício</button>
      </div>
      <p class="day-custom-note">As alterações afetam somente este aluno e este dia. O treino salvo permanece intacto.</p>
      <div class="simple-exercise-list">${list || '<div class="simple-empty-inline">Nenhum exercício neste dia.</div>'}</div>
      <div class="simple-modal-actions">
        <button class="btn btn-danger" type="button" data-remove-assignment-modal>Remover treino deste dia</button>
        <button class="btn btn-neutral" type="button" data-simple-modal-close>Fechar</button>
      </div>
    </div>`;
    rendering = false;
  }

  async function loadLibrary() {
    if (library.length) return;
    const { data, error } = await supabase
      .from('exercicios')
      .select('id,nome,grupo_muscular,equipamento,instrucoes,video_url,imagem_url,tipo_prescricao')
      .or(`global.eq.true,personal_id.eq.${session.user.id}`)
      .order('nome');
    if (error) throw error;
    library = data || [];
  }

  async function openExercisePicker() {
    await loadLibrary();
    const existingIds = new Set(rows.map(row => String(row.exercicio_id || '')));
    let selected = new Set();
    let search = '';

    const renderOptions = () => {
      const host = modalBody.querySelector('#day-custom-picker-list');
      const save = modalBody.querySelector('#day-custom-picker-save');
      if (!host || !save) return;
      const query = search.trim().toLocaleLowerCase('pt-BR');
      const filtered = library.filter(item => !existingIds.has(String(item.id)) && (!query || [item.nome, item.grupo_muscular, item.equipamento].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(query)));
      host.innerHTML = filtered.map(item => `<label class="simple-picker-option ${selected.has(item.id) ? 'selected' : ''}">
        <input type="checkbox" value="${esc(item.id)}" ${selected.has(item.id) ? 'checked' : ''}>
        <span><strong>${esc(item.nome)}</strong><small>${esc([item.grupo_muscular, item.equipamento].filter(Boolean).join(' · ') || 'Exercício')}</small></span>
      </label>`).join('') || '<div class="simple-empty-inline">Nenhum exercício disponível.</div>';
      save.textContent = selected.size ? `Adicionar ${selected.size} ${selected.size === 1 ? 'exercício' : 'exercícios'}` : 'Adicionar exercícios';
    };

    rendering = true;
    modalBody.innerHTML = `<div class="simple-picker day-custom-picker">
      <div class="form-group simple-search-field"><label>Buscar exercício</label><input id="day-custom-search" type="search" placeholder="Nome, grupo muscular ou equipamento"></div>
      <div id="day-custom-picker-list" class="simple-picker-list"></div>
      <div class="simple-modal-actions sticky"><button id="day-custom-picker-save" class="btn btn-primary" type="button">Adicionar exercícios</button><button class="btn btn-neutral" type="button" data-day-editor-back>Voltar</button></div>
    </div>`;
    rendering = false;
    renderOptions();

    const searchInput = modalBody.querySelector('#day-custom-search');
    const list = modalBody.querySelector('#day-custom-picker-list');
    const save = modalBody.querySelector('#day-custom-picker-save');
    searchInput.addEventListener('input', () => { search = searchInput.value; renderOptions(); });
    list.addEventListener('change', event => {
      const input = event.target.closest('input[type="checkbox"]');
      if (!input) return;
      if (input.checked) selected.add(input.value); else selected.delete(input.value);
      renderOptions();
    });
    save.addEventListener('click', async () => {
      if (!selected.size) return showMessage('Selecione pelo menos um exercício.', 'error');
      setBusy(save, true, 'Adicionando...');
      try {
        const maxOrder = rows.reduce((max, row) => Math.max(max, Number(row.ordem || 0)), 0);
        const payload = [...selected].map((exerciseId, index) => {
          const exercise = library.find(item => String(item.id) === String(exerciseId));
          const type = exercise?.tipo_prescricao || 'repeticoes';
          return {
            treino_id: workoutId,
            exercicio_id: exerciseId,
            dia_semana: selectedDay,
            ordem: maxOrder + index + 1,
            series: type === 'repeticoes' ? 4 : 1,
            repeticoes: type === 'repeticoes' ? '12' : null,
            duracao_minutos: type === 'tempo' ? 30 : null,
            distancia_km: type === 'distancia' ? 1 : null,
            descanso_segundos: 60,
            exercicio_nome_snapshot: exercise?.nome || null,
            grupo_muscular_snapshot: exercise?.grupo_muscular || null,
            equipamento_snapshot: exercise?.equipamento || null,
            instrucoes_snapshot: exercise?.instrucoes || null,
            video_url_snapshot: exercise?.video_url || null,
            imagem_url_snapshot: exercise?.imagem_url || null,
            tipo_prescricao_snapshot: type
          };
        });
        const { error } = await supabase.from('treino_exercicios').insert(payload);
        if (error) throw error;
        dirty = true;
        await syncOpenSessions();
        showMessage(`${payload.length} ${payload.length === 1 ? 'exercício adicionado' : 'exercícios adicionados'} somente neste dia.`);
        await loadAndRender();
      } catch (error) {
        handleError(error);
        setBusy(save, false);
      }
    });
    window.setTimeout(() => searchInput.focus(), 0);
  }

  function openExerciseEditor(rowId) {
    const row = rows.find(item => String(item.id) === String(rowId));
    if (!row) return;
    const type = prescriptionType(row);
    const specificField = type === 'tempo'
      ? `<div class="form-group"><label>Duração (min)</label><input name="duracao_minutos" type="number" min="0" step="0.5" value="${esc(row.duracao_minutos ?? '')}"></div>`
      : type === 'distancia'
        ? `<div class="form-group"><label>Distância (km)</label><input name="distancia_km" type="number" min="0" step="0.1" value="${esc(row.distancia_km ?? '')}"></div>`
        : `<div class="form-group"><label>Repetições</label><input name="repeticoes" value="${esc(row.repeticoes || '')}"></div>`;

    rendering = true;
    modalBody.innerHTML = `<form id="day-custom-editor" class="simple-form">
      <div class="day-custom-editor-title"><small>EDITAR SOMENTE ESTE DIA</small><strong>${esc(exerciseName(row))}</strong></div>
      <div class="simple-form-grid"><div class="form-group"><label>Séries</label><input name="series" type="number" min="1" max="20" value="${esc(row.series ?? '')}"></div>${specificField}<div class="form-group"><label>Carga</label><input name="carga" value="${esc(row.carga || '')}"></div><div class="form-group"><label>Descanso (s)</label><input name="descanso_segundos" type="number" min="0" max="3600" value="${esc(row.descanso_segundos ?? '')}"></div></div>
      <div class="form-group"><label>Observações</label><textarea name="observacoes">${esc(row.observacoes || '')}</textarea></div>
      <div class="simple-modal-actions"><button class="btn btn-primary" type="submit">Salvar alteração</button><button class="btn btn-neutral" type="button" data-day-editor-back>Voltar</button></div>
    </form>`;
    rendering = false;

    const form = modalBody.querySelector('#day-custom-editor');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submit = form.querySelector('[type="submit"]');
      setBusy(submit, true);
      const payload = {
        series: form.series.value ? Number(form.series.value) : null,
        repeticoes: type === 'repeticoes' ? (form.repeticoes?.value.trim() || null) : null,
        duracao_minutos: type === 'tempo' && form.duracao_minutos?.value ? Number(form.duracao_minutos.value) : null,
        distancia_km: type === 'distancia' && form.distancia_km?.value ? Number(form.distancia_km.value) : null,
        carga: form.carga.value.trim() || null,
        descanso_segundos: form.descanso_segundos.value ? Number(form.descanso_segundos.value) : null,
        observacoes: form.observacoes.value.trim() || null
      };
      try {
        const { error } = await supabase.from('treino_exercicios').update(payload).eq('id', row.id).eq('treino_id', workoutId).eq('dia_semana', selectedDay);
        if (error) throw error;
        dirty = true;
        await syncOpenSessions();
        showMessage('Exercício personalizado somente neste dia.');
        await loadAndRender();
      } catch (error) {
        handleError(error);
        setBusy(submit, false);
      }
    });
  }

  async function removeExercise(rowId) {
    const row = rows.find(item => String(item.id) === String(rowId));
    if (!row || !confirm(`Excluir “${exerciseName(row)}” somente de ${DAY_NAMES[selectedDay]}?`)) return;
    const { error } = await supabase.from('treino_exercicios').delete().eq('id', row.id).eq('treino_id', workoutId).eq('dia_semana', selectedDay);
    if (error) throw error;
    dirty = true;
    await reorderRows();
    await syncOpenSessions();
    showMessage('Exercício excluído somente deste dia.');
    await loadAndRender();
  }

  async function reorderRows() {
    const { data, error } = await supabase.from('treino_exercicios').select('id').eq('treino_id', workoutId).eq('dia_semana', selectedDay).order('ordem');
    if (error) throw error;
    for (const [index, row] of (data || []).entries()) {
      const { error: updateError } = await supabase.from('treino_exercicios').update({ ordem: index + 1 }).eq('id', row.id).eq('treino_id', workoutId);
      if (updateError) throw updateError;
    }
  }

  async function syncOpenSessions() {
    const { data, error } = await supabase
      .from('sessoes_treino')
      .select('id')
      .eq('treino_id', workoutId)
      .in('status', ['aguardando_confirmacao', 'em_aula']);
    if (error) throw error;
    for (const item of data || []) {
      const { error: syncError } = await supabase.rpc('sincronizar_exercicios_sessao', { p_sessao_id: item.id });
      if (syncError) throw syncError;
    }
  }

  function updateWeekCardCount() {
    const selector = `[data-view-assignment="${String(workoutId).replaceAll('"', '\\"')}"]`;
    const trigger = app.querySelector(selector);
    const count = trigger?.querySelector('small');
    if (count) count.textContent = `${rows.length} ${rows.length === 1 ? 'exercício' : 'exercícios'}`;
  }

  function showMessage(text, type = 'success') {
    const box = app.querySelector('#simple-workout-message');
    if (!box) return;
    box.textContent = text;
    box.className = `simple-workout-message ${type}`;
    box.hidden = false;
    clearTimeout(showMessage.timer);
    showMessage.timer = window.setTimeout(() => { box.hidden = true; }, 4500);
  }

  function setBusy(button, busy, label = 'Salvando...') {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.textContent = label;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  }

  function handleError(error) {
    console.error('Erro ao personalizar treino do dia:', error);
    showMessage(error?.message || 'Não foi possível personalizar o treino deste dia.', 'error');
    if (!modalBody.querySelector('.simple-assignment-detail')) {
      modalBody.innerHTML = `<div class="simple-empty-state"><strong>Não foi possível carregar o treino</strong><span>${esc(error?.message || 'Tente novamente.')}</span><button class="btn btn-outline" type="button" data-day-editor-back>Voltar</button></div>`;
    }
  }

}
