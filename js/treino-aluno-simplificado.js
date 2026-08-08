import { supabase } from './supabase.js';
import { requireSession } from './layout.js';

const alunoId = new URLSearchParams(location.search).get('id');
const dayNames = { 1: 'Segunda-feira', 2: 'Terça-feira', 3: 'Quarta-feira', 4: 'Quinta-feira', 5: 'Sexta-feira', 6: 'Sábado', 7: 'Domingo' };
const dayShortNames = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 7: 'Dom' };

if (alunoId && !globalThis.__FSFIT_SIMPLE_WORKOUTS__) {
  globalThis.__FSFIT_SIMPLE_WORKOUTS__ = true;

  const session = await requireSession();
  if (!session) throw new Error('Sessão inválida');

  let currentView = 'week';
  let selectedDay = currentWeekDay();
  let templates = [];
  let templateItems = [];
  let activeWorkouts = [];
  let activeItems = [];
  let exerciseLibrary = [];
  let selectedTemplateId = null;
  let modalCleanup = null;

  injectStyles();
  const app = createApp();
  const modal = createModal();
  enforceSimplifiedMode();
  bindAppEvents();
  await refreshAll();

  function currentWeekDay() {
    const day = new Date().getDay();
    return day === 0 ? 7 : day;
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

  function injectStyles() {
    if (document.querySelector('link[data-fsfit-bundle]')) return;
    if (document.querySelector('link[data-simple-workout-styles]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/treino-aluno-simplificado.css?v=20260725-simple1';
    link.dataset.simpleWorkoutStyles = 'true';
    document.head.appendChild(link);
  }

  function createApp() {
    document.body.classList.add('workout-simple-enabled');
    const host = document.createElement('section');
    host.id = 'simple-workout-app';
    host.className = 'simple-workout-app';
    host.innerHTML = `
      <nav class="simple-workout-main-tabs" aria-label="Treinos do aluno">
        <button class="active" type="button" data-simple-view="week" aria-pressed="true">Semana<small>Rotina do aluno</small></button>
        <button type="button" data-simple-view="saved" aria-pressed="false">Treinos salvos<small>Listas de exercícios</small></button>
      </nav>
      <div id="simple-workout-message" class="simple-workout-message" hidden></div>
      <div id="simple-workout-content"></div>`;
    const message = document.querySelector('#workout-message');
    message?.insertAdjacentElement('afterend', host);
    return host;
  }

  function createModal() {
    const element = document.createElement('div');
    element.id = 'simple-workout-modal';
    element.className = 'simple-workout-modal';
    element.setAttribute('aria-hidden', 'true');
    element.innerHTML = `
      <div class="simple-workout-modal-backdrop" data-simple-modal-close></div>
      <section class="simple-workout-modal-card" role="dialog" aria-modal="true" aria-labelledby="simple-workout-modal-title">
        <div class="simple-workout-modal-head">
          <div><small id="simple-workout-modal-kicker">TREINO</small><h2 id="simple-workout-modal-title">Treino</h2></div>
          <button type="button" class="simple-workout-modal-close" data-simple-modal-close aria-label="Fechar">×</button>
        </div>
        <div id="simple-workout-modal-body"></div>
      </section>`;
    document.body.appendChild(element);
    element.addEventListener('click', event => {
      if (event.target.closest('[data-simple-modal-close]')) closeModal();
    });
    return element;
  }

  function enforceSimplifiedMode() {
    const observer = new MutationObserver(() => {
      document.body.classList.add('workout-simple-enabled');
    });
    observer.observe(document.body, { childList: true, subtree: false });
    const headerCopy = document.querySelector('.page-header p');
    if (headerCopy) headerCopy.textContent = 'Monte listas de exercícios e aplique cada treino no dia que preferir.';
    const badge = document.querySelector('.page-header .hero-badge');
    if (badge) badge.textContent = 'TREINOS';
  }

  function showMessage(text, type = 'success') {
    const box = app.querySelector('#simple-workout-message');
    box.textContent = text;
    box.className = `simple-workout-message ${type}`;
    box.hidden = false;
    clearTimeout(showMessage.timer);
    showMessage.timer = window.setTimeout(() => { box.hidden = true; }, 4500);
  }

  function setBusy(button, busy, label = 'Salvando...') {
    if (!button) return;
    if (busy) {
      button.dataset.originalLabel = button.textContent;
      button.textContent = label;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalLabel || button.textContent;
      button.disabled = false;
    }
  }

  async function refreshAll() {
    await Promise.all([loadTemplates(), loadActiveWeek(), loadExerciseLibrary()]);
    render();
  }

  async function loadTemplates() {
    const { data, error } = await supabase
      .from('treinos')
      .select('id,nome,descricao,dias_semana,status,modelo,updated_at')
      .eq('personal_id', session.user.id)
      .eq('modelo', true)
      .is('aluno_id', null)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    templates = data || [];

    const ids = templates.map(item => item.id);
    if (!ids.length) {
      templateItems = [];
      return;
    }
    const { data: rows, error: rowError } = await supabase
      .from('treino_exercicios')
      .select('id,treino_id,exercicio_id,dia_semana,ordem,series,repeticoes,duracao_minutos,distancia_km,carga,descanso_segundos,observacoes,exercicio_nome_snapshot,grupo_muscular_snapshot,equipamento_snapshot,tipo_prescricao_snapshot,exercicios(nome,grupo_muscular,equipamento,tipo_prescricao)')
      .in('treino_id', ids)
      .order('ordem');
    if (rowError) throw rowError;
    templateItems = rows || [];
  }

  async function loadActiveWeek() {
    const { data, error } = await supabase
      .from('treinos')
      .select('id,nome,descricao,dias_semana,status,modelo,data_inicio,updated_at')
      .eq('personal_id', session.user.id)
      .eq('aluno_id', alunoId)
      .eq('status', 'ativo')
      .eq('modelo', false)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    activeWorkouts = data || [];

    const ids = activeWorkouts.map(item => item.id);
    if (!ids.length) {
      activeItems = [];
      return;
    }
    const { data: rows, error: rowError } = await supabase
      .from('treino_exercicios')
      .select('id,treino_id,exercicio_id,dia_semana,ordem,series,repeticoes,duracao_minutos,distancia_km,carga,descanso_segundos,observacoes,exercicio_nome_snapshot,grupo_muscular_snapshot,equipamento_snapshot,tipo_prescricao_snapshot,exercicios(nome,grupo_muscular,equipamento,tipo_prescricao)')
      .in('treino_id', ids)
      .order('ordem');
    if (rowError) throw rowError;
    activeItems = rows || [];
  }

  async function loadExerciseLibrary() {
    const { data, error } = await supabase
      .from('exercicios')
      .select('id,nome,grupo_muscular,equipamento,tipo_prescricao')
      .or(`global.eq.true,personal_id.eq.${session.user.id}`)
      .order('nome');
    if (error) throw error;
    exerciseLibrary = data || [];
  }

  function effectiveExercise(row = {}) {
    const exercise = row.exercicios || {};
    return {
      nome: row.exercicio_nome_snapshot || exercise.nome || 'Exercício',
      grupo: row.grupo_muscular_snapshot || exercise.grupo_muscular || '',
      equipamento: row.equipamento_snapshot || exercise.equipamento || '',
      tipo: row.tipo_prescricao_snapshot || exercise.tipo_prescricao || 'repeticoes'
    };
  }

  function uniqueTemplateRows(templateId) {
    const seen = new Set();
    return templateItems
      .filter(row => row.treino_id === templateId)
      .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
      .filter(row => {
        const key = [row.exercicio_id, row.series, row.repeticoes, row.duracao_minutos, row.distancia_km, row.carga, row.descanso_segundos, row.observacoes].join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function prescriptionSummary(row) {
    const exercise = effectiveExercise(row);
    const parts = [];
    if (row.series) parts.push(`${row.series} séries`);
    if (exercise.tipo === 'tempo' && row.duracao_minutos) parts.push(`${row.duracao_minutos} min`);
    else if (exercise.tipo === 'distancia' && row.distancia_km) parts.push(`${row.distancia_km} km`);
    else if (row.repeticoes) parts.push(`${row.repeticoes} rep.`);
    if (row.carga) parts.push(row.carga);
    if (row.descanso_segundos) parts.push(`${row.descanso_segundos}s`);
    return parts.join(' · ') || 'Sem configuração';
  }

  function render() {
    app.querySelectorAll('[data-simple-view]').forEach(button => {
      const active = button.dataset.simpleView === currentView;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    const content = app.querySelector('#simple-workout-content');
    content.innerHTML = currentView === 'saved' ? renderSavedView() : renderWeekView();
  }

  function renderDayTabs() {
    return `<div class="simple-weekday-tabs" role="tablist" aria-label="Dias da semana">
      ${Object.keys(dayNames).map(value => {
        const day = Number(value);
        const active = day === selectedDay;
        return `<button type="button" role="tab" class="${active ? 'active' : ''}" data-simple-day="${day}" aria-selected="${String(active)}"><span>${dayShortNames[day]}</span></button>`;
      }).join('')}
    </div>`;
  }

  function renderWeekView() {
    const workouts = activeWorkouts.filter(workout => (workout.dias_semana || []).map(Number).includes(selectedDay));
    const cards = workouts.map(workout => {
      const rows = activeItems
        .filter(row => row.treino_id === workout.id && Number(row.dia_semana) === selectedDay)
        .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
      return `<article class="simple-assignment-card">
        <button class="simple-assignment-main" type="button" data-view-assignment="${workout.id}">
          <span><strong>${esc(workout.nome || 'Treino')}</strong><small>${rows.length} ${rows.length === 1 ? 'exercício' : 'exercícios'}</small></span>
          <span class="simple-row-arrow">›</span>
        </button>
        <button class="simple-card-menu" type="button" data-remove-assignment="${workout.id}" aria-label="Remover treino de ${dayNames[selectedDay]}">Remover</button>
      </article>`;
    }).join('');

    return `<section class="simple-week-panel">
      ${renderDayTabs()}
      <div class="simple-section-head">
        <div><small>ROTINA SEMANAL</small><h2>${dayNames[selectedDay]}</h2><p>${workouts.length ? `${workouts.length} ${workouts.length === 1 ? 'treino aplicado' : 'treinos aplicados'}` : 'Dia livre, sem treino aplicado'}</p></div>
        <button class="btn btn-primary simple-add-day-button" type="button" data-open-apply-modal>+ Adicionar treino</button>
      </div>
      <div class="simple-assignment-list">${cards || `<div class="simple-empty-state"><strong>Nenhum treino neste dia</strong><span>Adicione uma lista salva com um toque.</span><button class="btn btn-outline" type="button" data-open-apply-modal>Adicionar treino</button></div>`}</div>
    </section>`;
  }

  function renderSavedView() {
    const cards = templates.map(template => {
      const rows = uniqueTemplateRows(template.id);
      return `<article class="simple-saved-card">
        <button class="simple-saved-main" type="button" data-open-template="${template.id}">
          <span><strong>${esc(template.nome || 'Treino')}</strong><small>${rows.length} ${rows.length === 1 ? 'exercício' : 'exercícios'}${template.descricao ? ` · ${esc(template.descricao)}` : ''}</small></span>
          <span class="simple-row-arrow">›</span>
        </button>
        <div class="simple-saved-actions">
          <button type="button" data-apply-template="${template.id}">Adicionar à semana</button>
          <button type="button" data-edit-template="${template.id}">Editar</button>
          <button class="danger" type="button" data-delete-template="${template.id}">Excluir</button>
        </div>
      </article>`;
    }).join('');

    return `<section class="simple-saved-panel">
      <div class="simple-section-head">
        <div><small>BIBLIOTECA</small><h2>Treinos salvos</h2><p>Crie apenas a lista de exercícios. O dia é escolhido somente ao aplicar.</p></div>
        <button class="btn btn-primary" type="button" data-new-template>+ Criar treino</button>
      </div>
      <div class="simple-saved-list">${cards || `<div class="simple-empty-state"><strong>Nenhum treino salvo</strong><span>Crie uma lista de exercícios para reutilizar em qualquer dia.</span><button class="btn btn-outline" type="button" data-new-template>Criar primeiro treino</button></div>`}</div>
    </section>`;
  }

  function bindAppEvents() {
    app.addEventListener('click', event => {
      const view = event.target.closest('[data-simple-view]');
      if (view) {
        currentView = view.dataset.simpleView;
        render();
        return;
      }
      const day = event.target.closest('[data-simple-day]');
      if (day) {
        selectedDay = Number(day.dataset.simpleDay) || currentWeekDay();
        render();
        return;
      }
      if (event.target.closest('[data-new-template]')) return openTemplateForm();
      if (event.target.closest('[data-open-apply-modal]')) return openApplyModal();

      const openTemplate = event.target.closest('[data-open-template]');
      if (openTemplate) return openTemplateDetails(openTemplate.dataset.openTemplate);
      const editTemplate = event.target.closest('[data-edit-template]');
      if (editTemplate) return openTemplateForm(editTemplate.dataset.editTemplate);
      const applyTemplate = event.target.closest('[data-apply-template]');
      if (applyTemplate) return openApplyModal(applyTemplate.dataset.applyTemplate);
      const deleteTemplateButton = event.target.closest('[data-delete-template]');
      if (deleteTemplateButton) return deleteTemplate(deleteTemplateButton.dataset.deleteTemplate);
      const removeAssignment = event.target.closest('[data-remove-assignment]');
      if (removeAssignment) return removeAssignmentFromDay(removeAssignment.dataset.removeAssignment);
      const viewAssignment = event.target.closest('[data-view-assignment]');
      if (viewAssignment) return openAssignmentDetails(viewAssignment.dataset.viewAssignment);
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });
  }

  function openModal({ kicker = 'TREINO', title, body, onMount }) {
    modalCleanup?.();
    modalCleanup = null;
    modal.querySelector('#simple-workout-modal-kicker').textContent = kicker;
    modal.querySelector('#simple-workout-modal-title').textContent = title;
    const bodyHost = modal.querySelector('#simple-workout-modal-body');
    bodyHost.innerHTML = body;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('simple-workout-modal-open');
    modalCleanup = onMount?.(bodyHost) || null;
  }

  function closeModal() {
    modalCleanup?.();
    modalCleanup = null;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('simple-workout-modal-open');
  }

  function openTemplateForm(templateId = null) {
    const template = templates.find(item => item.id === templateId) || null;
    openModal({
      kicker: template ? 'EDITAR TREINO' : 'NOVO TREINO',
      title: template ? 'Informações do treino' : 'Criar treino salvo',
      body: `<form id="simple-template-form" class="simple-form">
        <div class="form-group"><label>Nome do treino *</label><input name="nome" maxlength="120" value="${esc(template?.nome || '')}" placeholder="Ex.: Peito e tríceps" required></div>
        <div class="form-group"><label>Descrição <span>opcional</span></label><textarea name="descricao" placeholder="Objetivo ou observação curta">${esc(template?.descricao || '')}</textarea></div>
        <div class="simple-info-box">Os dias da semana não são definidos aqui. Primeiro salve a lista; depois aplique no dia desejado.</div>
        <div class="simple-modal-actions"><button class="btn btn-primary" type="submit">${template ? 'Salvar alterações' : 'Criar treino'}</button><button class="btn btn-neutral" type="button" data-simple-modal-close>Cancelar</button></div>
      </form>`,
      onMount(bodyHost) {
        const form = bodyHost.querySelector('#simple-template-form');
        const handler = async event => {
          event.preventDefault();
          const submit = form.querySelector('[type="submit"]');
          const payload = {
            nome: form.nome.value.trim(),
            descricao: form.descricao.value.trim() || null,
            dias_semana: [],
            status: 'inativo',
            modelo: true
          };
          if (!payload.nome) return;
          setBusy(submit, true);
          try {
            if (template) {
              const { error } = await supabase.from('treinos').update({ nome: payload.nome, descricao: payload.descricao }).eq('id', template.id).eq('personal_id', session.user.id);
              if (error) throw error;
              showMessage('Treino atualizado.');
              closeModal();
              await loadTemplates();
              render();
            } else {
              const { data, error } = await supabase.from('treinos').insert({ ...payload, personal_id: session.user.id, aluno_id: null }).select('id').single();
              if (error) throw error;
              closeModal();
              await loadTemplates();
              render();
              showMessage('Treino criado. Agora adicione os exercícios.');
              openTemplateDetails(data.id, true);
            }
          } catch (error) {
            console.error(error);
            showMessage(error.message || 'Não foi possível salvar o treino.', 'error');
            setBusy(submit, false);
          }
        };
        form.addEventListener('submit', handler);
        setTimeout(() => form.nome.focus(), 0);
        return () => form.removeEventListener('submit', handler);
      }
    });
  }

  function openTemplateDetails(templateId, openPicker = false) {
    const template = templates.find(item => item.id === templateId);
    if (!template) return;
    selectedTemplateId = template.id;
    const rows = uniqueTemplateRows(template.id);
    const list = rows.map((row, index) => {
      const exercise = effectiveExercise(row);
      return `<article class="simple-exercise-card">
        <span class="simple-exercise-order">${index + 1}</span>
        <button type="button" class="simple-exercise-main" data-edit-template-exercise="${row.id}"><strong>${esc(exercise.nome)}</strong><small>${esc(prescriptionSummary(row))}</small></button>
        <button type="button" class="simple-exercise-remove" data-remove-template-exercise="${row.id}" aria-label="Remover ${esc(exercise.nome)}">×</button>
      </article>`;
    }).join('');

    openModal({
      kicker: 'TREINO SALVO',
      title: template.nome,
      body: `<div class="simple-template-detail">
        ${template.descricao ? `<p class="simple-template-description">${esc(template.descricao)}</p>` : ''}
        <div class="simple-detail-actions"><button class="btn btn-primary" type="button" data-add-template-exercises>+ Adicionar exercícios</button><button class="btn btn-outline" type="button" data-detail-apply>Adicionar à semana</button></div>
        <div class="simple-exercise-list">${list || '<div class="simple-empty-inline">Nenhum exercício nesta lista.</div>'}</div>
      </div>`,
      onMount(bodyHost) {
        const clickHandler = event => {
          if (event.target.closest('[data-add-template-exercises]')) return openExercisePicker(template.id);
          if (event.target.closest('[data-detail-apply]')) return openApplyModal(template.id);
          const edit = event.target.closest('[data-edit-template-exercise]');
          if (edit) return openExerciseEditor(edit.dataset.editTemplateExercise, template.id);
          const remove = event.target.closest('[data-remove-template-exercise]');
          if (remove) return removeTemplateExercise(remove.dataset.removeTemplateExercise, template.id);
        };
        bodyHost.addEventListener('click', clickHandler);
        if (openPicker) setTimeout(() => openExercisePicker(template.id), 80);
        return () => bodyHost.removeEventListener('click', clickHandler);
      }
    });
  }

  function openExercisePicker(templateId) {
    const template = templates.find(item => item.id === templateId);
    if (!template) return;
    const existingIds = new Set(uniqueTemplateRows(templateId).map(row => row.exercicio_id));
    let selected = new Set();
    let search = '';

    const renderOptions = host => {
      const normalized = search.trim().toLocaleLowerCase('pt-BR');
      const filtered = exerciseLibrary.filter(item => !existingIds.has(item.id) && (!normalized || [item.nome, item.grupo_muscular, item.equipamento].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(normalized)));
      host.innerHTML = filtered.map(item => `<label class="simple-picker-option ${selected.has(item.id) ? 'selected' : ''}">
        <input type="checkbox" value="${item.id}" ${selected.has(item.id) ? 'checked' : ''}>
        <span><strong>${esc(item.nome)}</strong><small>${esc([item.grupo_muscular, item.equipamento].filter(Boolean).join(' · ') || 'Exercício')}</small></span>
      </label>`).join('') || '<div class="simple-empty-inline">Nenhum exercício encontrado.</div>';
    };

    openModal({
      kicker: 'ADICIONAR EXERCÍCIOS',
      title: template.nome,
      body: `<div class="simple-picker">
        <div class="form-group simple-search-field"><label>Buscar exercício</label><input id="simple-exercise-search" type="search" placeholder="Nome, grupo muscular ou equipamento"></div>
        <div id="simple-picker-list" class="simple-picker-list"></div>
        <div class="simple-modal-actions sticky"><button id="simple-picker-save" class="btn btn-primary" type="button">Adicionar exercícios</button><button class="btn btn-neutral" type="button" data-simple-modal-close>Cancelar</button></div>
      </div>`,
      onMount(bodyHost) {
        const searchInput = bodyHost.querySelector('#simple-exercise-search');
        const list = bodyHost.querySelector('#simple-picker-list');
        const save = bodyHost.querySelector('#simple-picker-save');
        renderOptions(list);
        const inputHandler = () => { search = searchInput.value; renderOptions(list); };
        const changeHandler = event => {
          const input = event.target.closest('input[type="checkbox"]');
          if (!input) return;
          if (input.checked) selected.add(input.value); else selected.delete(input.value);
          input.closest('.simple-picker-option')?.classList.toggle('selected', input.checked);
          save.textContent = selected.size ? `Adicionar ${selected.size} ${selected.size === 1 ? 'exercício' : 'exercícios'}` : 'Adicionar exercícios';
        };
        const saveHandler = async () => {
          if (!selected.size) return showMessage('Selecione pelo menos um exercício.', 'error');
          setBusy(save, true, 'Adicionando...');
          try {
            const current = uniqueTemplateRows(templateId);
            const startOrder = current.reduce((max, row) => Math.max(max, Number(row.ordem || 0)), 0) + 1;
            const rows = [...selected].map((exerciseId, index) => {
              const exercise = exerciseLibrary.find(item => item.id === exerciseId);
              const type = exercise?.tipo_prescricao || 'repeticoes';
              return {
                treino_id: templateId,
                exercicio_id: exerciseId,
                dia_semana: 1,
                ordem: startOrder + index,
                series: type === 'repeticoes' ? 4 : 1,
                repeticoes: type === 'repeticoes' ? '12' : null,
                duracao_minutos: type === 'tempo' ? 30 : null,
                distancia_km: type === 'distancia' ? 1 : null,
                descanso_segundos: 60
              };
            });
            const { error } = await supabase.from('treino_exercicios').insert(rows);
            if (error) throw error;
            await loadTemplates();
            showMessage(`${rows.length} ${rows.length === 1 ? 'exercício adicionado' : 'exercícios adicionados'}.`);
            openTemplateDetails(templateId);
            render();
          } catch (error) {
            console.error(error);
            showMessage(error.message || 'Não foi possível adicionar os exercícios.', 'error');
            setBusy(save, false);
          }
        };
        searchInput.addEventListener('input', inputHandler);
        list.addEventListener('change', changeHandler);
        save.addEventListener('click', saveHandler);
        setTimeout(() => searchInput.focus(), 0);
        return () => {
          searchInput.removeEventListener('input', inputHandler);
          list.removeEventListener('change', changeHandler);
          save.removeEventListener('click', saveHandler);
        };
      }
    });
  }

  function openExerciseEditor(rowId, templateId) {
    const row = templateItems.find(item => item.id === rowId);
    if (!row) return;
    const exercise = effectiveExercise(row);
    const prescriptionField = exercise.tipo === 'tempo'
      ? `<div class="form-group"><label>Duração (minutos)</label><input name="duracao_minutos" type="number" min="0" step="0.5" value="${esc(row.duracao_minutos ?? '')}"></div>`
      : exercise.tipo === 'distancia'
        ? `<div class="form-group"><label>Distância (km)</label><input name="distancia_km" type="number" min="0" step="0.1" value="${esc(row.distancia_km ?? '')}"></div>`
        : `<div class="form-group"><label>Repetições</label><input name="repeticoes" value="${esc(row.repeticoes || '')}" placeholder="12"></div>`;

    openModal({
      kicker: 'CONFIGURAR EXERCÍCIO',
      title: exercise.nome,
      body: `<form id="simple-exercise-editor" class="simple-form">
        <div class="simple-form-grid"><div class="form-group"><label>Séries</label><input name="series" type="number" min="1" max="20" value="${esc(row.series ?? '')}"></div>${prescriptionField}<div class="form-group"><label>Carga</label><input name="carga" value="${esc(row.carga || '')}" placeholder="Opcional"></div><div class="form-group"><label>Descanso (s)</label><input name="descanso_segundos" type="number" min="0" step="5" value="${esc(row.descanso_segundos ?? '')}"></div></div>
        <div class="form-group"><label>Observações</label><textarea name="observacoes" placeholder="Técnica, intensidade, cadência...">${esc(row.observacoes || '')}</textarea></div>
        <div class="simple-modal-actions"><button class="btn btn-primary" type="submit">Salvar</button><button class="btn btn-neutral" type="button" data-simple-modal-close>Cancelar</button></div>
      </form>`,
      onMount(bodyHost) {
        const form = bodyHost.querySelector('#simple-exercise-editor');
        const handler = async event => {
          event.preventDefault();
          const submit = form.querySelector('[type="submit"]');
          setBusy(submit, true);
          const payload = {
            series: form.series.value ? Number(form.series.value) : null,
            repeticoes: exercise.tipo === 'repeticoes' ? (form.repeticoes?.value.trim() || null) : null,
            duracao_minutos: exercise.tipo === 'tempo' && form.duracao_minutos?.value ? Number(form.duracao_minutos.value) : null,
            distancia_km: exercise.tipo === 'distancia' && form.distancia_km?.value ? Number(form.distancia_km.value) : null,
            carga: form.carga.value.trim() || null,
            descanso_segundos: form.descanso_segundos.value ? Number(form.descanso_segundos.value) : null,
            observacoes: form.observacoes.value.trim() || null
          };
          try {
            const { error } = await supabase.from('treino_exercicios').update(payload).eq('id', row.id).eq('treino_id', templateId);
            if (error) throw error;
            await loadTemplates();
            showMessage('Exercício atualizado.');
            openTemplateDetails(templateId);
          } catch (error) {
            console.error(error);
            showMessage(error.message || 'Não foi possível atualizar o exercício.', 'error');
            setBusy(submit, false);
          }
        };
        form.addEventListener('submit', handler);
        return () => form.removeEventListener('submit', handler);
      }
    });
  }

  async function removeTemplateExercise(rowId, templateId) {
    const row = templateItems.find(item => item.id === rowId);
    if (!row || !confirm(`Remover “${effectiveExercise(row).nome}” desta lista?`)) return;
    const { error } = await supabase.from('treino_exercicios').delete().eq('id', rowId).eq('treino_id', templateId);
    if (error) return showMessage('Não foi possível remover o exercício.', 'error');
    await loadTemplates();
    showMessage('Exercício removido.');
    openTemplateDetails(templateId);
    render();
  }

  function openApplyModal(preselectedTemplateId = null) {
    let chosenTemplateId = preselectedTemplateId || selectedTemplateId || templates[0]?.id || '';
    let chosenDay = selectedDay;
    const options = templates.map(template => {
      const count = uniqueTemplateRows(template.id).length;
      return `<button class="simple-apply-option ${template.id === chosenTemplateId ? 'selected' : ''}" type="button" data-choose-template="${template.id}"><span><strong>${esc(template.nome)}</strong><small>${count} ${count === 1 ? 'exercício' : 'exercícios'}</small></span><span>✓</span></button>`;
    }).join('');

    openModal({
      kicker: 'ADICIONAR À SEMANA',
      title: 'Escolha o treino e o dia',
      body: templates.length ? `<div class="simple-apply-flow">
        <div class="simple-flow-step"><small>1</small><div><strong>Treino salvo</strong><span>Escolha a lista completa.</span></div></div>
        <div id="simple-apply-options" class="simple-apply-options">${options}</div>
        <div class="simple-flow-step"><small>2</small><div><strong>Dia da semana</strong><span>O treino será aplicado somente no dia escolhido.</span></div></div>
        <div id="simple-apply-days" class="simple-weekday-tabs modal-days">${Object.keys(dayNames).map(value => { const day = Number(value); return `<button class="${day === chosenDay ? 'active' : ''}" type="button" data-choose-day="${day}">${dayShortNames[day]}</button>`; }).join('')}</div>
        <div class="simple-modal-actions"><button id="simple-apply-save" class="btn btn-primary" type="button">Adicionar em ${dayNames[chosenDay]}</button><button class="btn btn-neutral" type="button" data-simple-modal-close>Cancelar</button></div>
      </div>` : `<div class="simple-empty-state"><strong>Nenhum treino salvo</strong><span>Crie uma lista de exercícios antes de adicionar à semana.</span><button class="btn btn-primary" type="button" data-create-from-apply>Criar treino</button></div>`,
      onMount(bodyHost) {
        if (!templates.length) {
          const create = () => openTemplateForm();
          bodyHost.querySelector('[data-create-from-apply]')?.addEventListener('click', create);
          return () => bodyHost.querySelector('[data-create-from-apply]')?.removeEventListener('click', create);
        }
        const save = bodyHost.querySelector('#simple-apply-save');
        const clickHandler = event => {
          const templateButton = event.target.closest('[data-choose-template]');
          if (templateButton) {
            chosenTemplateId = templateButton.dataset.chooseTemplate;
            bodyHost.querySelectorAll('[data-choose-template]').forEach(button => button.classList.toggle('selected', button.dataset.chooseTemplate === chosenTemplateId));
            return;
          }
          const dayButton = event.target.closest('[data-choose-day]');
          if (dayButton) {
            chosenDay = Number(dayButton.dataset.chooseDay);
            bodyHost.querySelectorAll('[data-choose-day]').forEach(button => button.classList.toggle('active', Number(button.dataset.chooseDay) === chosenDay));
            save.textContent = `Adicionar em ${dayNames[chosenDay]}`;
          }
        };
        const saveHandler = () => applyTemplateToDay(chosenTemplateId, chosenDay, save);
        bodyHost.addEventListener('click', clickHandler);
        save.addEventListener('click', saveHandler);
        return () => {
          bodyHost.removeEventListener('click', clickHandler);
          save.removeEventListener('click', saveHandler);
        };
      }
    });
  }

  async function applyTemplateToDay(templateId, day, button) {
    const template = templates.find(item => item.id === templateId);
    const sourceRows = uniqueTemplateRows(templateId);
    if (!template) return showMessage('Selecione um treino salvo.', 'error');
    if (!sourceRows.length) return showMessage('Adicione exercícios ao treino antes de aplicá-lo.', 'error');

    const conflicts = activeWorkouts.filter(workout => (workout.dias_semana || []).map(Number).includes(Number(day)));
    if (conflicts.length && !confirm(`${dayNames[day]} já possui ${conflicts.length === 1 ? `o treino “${conflicts[0].nome}”` : 'treinos aplicados'}. Substituir pelo treino “${template.nome}”?`)) return;

    setBusy(button, true, 'Adicionando...');
    let createdWorkoutId = null;
    try {
      for (const workout of conflicts) {
        const remainingDays = (workout.dias_semana || []).map(Number).filter(value => value !== Number(day));
        const { error } = await supabase.from('treinos').update({ dias_semana: remainingDays, status: remainingDays.length ? 'ativo' : 'inativo' }).eq('id', workout.id).eq('personal_id', session.user.id).eq('aluno_id', alunoId);
        if (error) throw error;
      }

      const { data: created, error: createError } = await supabase.from('treinos').insert({
        personal_id: session.user.id,
        aluno_id: alunoId,
        nome: template.nome,
        descricao: template.descricao,
        dias_semana: [Number(day)],
        data_inicio: todayIso(),
        data_fim: null,
        status: 'ativo',
        modelo: false
      }).select('id').single();
      if (createError) throw createError;
      createdWorkoutId = created.id;

      const rows = sourceRows.map((row, index) => ({
        treino_id: createdWorkoutId,
        exercicio_id: row.exercicio_id,
        dia_semana: Number(day),
        ordem: index + 1,
        series: row.series,
        repeticoes: row.repeticoes,
        duracao_minutos: row.duracao_minutos,
        distancia_km: row.distancia_km,
        carga: row.carga,
        descanso_segundos: row.descanso_segundos,
        observacoes: row.observacoes
      }));
      const { error: itemError } = await supabase.from('treino_exercicios').insert(rows);
      if (itemError) throw itemError;

      selectedDay = Number(day);
      currentView = 'week';
      closeModal();
      await loadActiveWeek();
      render();
      showMessage(`Treino “${template.nome}” adicionado em ${dayNames[day]}.`);
    } catch (error) {
      console.error(error);
      if (createdWorkoutId) await supabase.from('treinos').delete().eq('id', createdWorkoutId);
      showMessage(error.message || 'Não foi possível adicionar o treino ao dia.', 'error');
      setBusy(button, false);
    }
  }

  function openAssignmentDetails(workoutId) {
    const workout = activeWorkouts.find(item => item.id === workoutId);
    if (!workout) return;
    const rows = activeItems
      .filter(row => row.treino_id === workoutId && Number(row.dia_semana) === selectedDay)
      .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
    openModal({
      kicker: dayNames[selectedDay].toUpperCase(),
      title: workout.nome,
      body: `<div class="simple-assignment-detail"><div class="simple-exercise-list">${rows.map((row, index) => { const exercise = effectiveExercise(row); return `<article class="simple-exercise-card readonly"><span class="simple-exercise-order">${index + 1}</span><span class="simple-exercise-main"><strong>${esc(exercise.nome)}</strong><small>${esc(prescriptionSummary(row))}</small></span></article>`; }).join('') || '<div class="simple-empty-inline">Nenhum exercício.</div>'}</div><div class="simple-modal-actions"><button class="btn btn-danger" type="button" data-remove-assignment-modal>Remover deste dia</button><button class="btn btn-neutral" type="button" data-simple-modal-close>Fechar</button></div></div>`,
      onMount(bodyHost) {
        const handler = () => removeAssignmentFromDay(workoutId);
        bodyHost.querySelector('[data-remove-assignment-modal]')?.addEventListener('click', handler);
        return () => bodyHost.querySelector('[data-remove-assignment-modal]')?.removeEventListener('click', handler);
      }
    });
  }

  async function removeAssignmentFromDay(workoutId) {
    const workout = activeWorkouts.find(item => item.id === workoutId);
    if (!workout || !confirm(`Remover “${workout.nome}” de ${dayNames[selectedDay]}? O treino salvo continuará disponível.`)) return;
    const remainingDays = (workout.dias_semana || []).map(Number).filter(day => day !== selectedDay);
    const { error } = await supabase.from('treinos').update({ dias_semana: remainingDays, status: remainingDays.length ? 'ativo' : 'inativo' }).eq('id', workoutId).eq('personal_id', session.user.id).eq('aluno_id', alunoId);
    if (error) return showMessage('Não foi possível remover o treino deste dia.', 'error');
    closeModal();
    await loadActiveWeek();
    render();
    showMessage('Treino removido do dia.');
  }

  async function deleteTemplate(templateId) {
    const template = templates.find(item => item.id === templateId);
    if (!template || !confirm(`Excluir o treino salvo “${template.nome}”? Os treinos já aplicados na semana não serão alterados.`)) return;
    const { error } = await supabase.from('treinos').delete().eq('id', templateId).eq('personal_id', session.user.id).eq('modelo', true);
    if (error) return showMessage('Não foi possível excluir o treino salvo.', 'error');
    await loadTemplates();
    render();
    showMessage('Treino salvo excluído.');
  }
}
