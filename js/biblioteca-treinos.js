import { supabase } from './supabase.js';
import { showMessage } from './layout.js';

const exerciseSection = document.querySelector('#library-exercises-section');
const message = document.querySelector('#library-message');

if (!exerciseSection) {
  console.warn('Biblioteca de treinos: seção de exercícios não encontrada.');
} else {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id || null;
  const dayNames = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 7: 'Dom' };
  let templates = [];
  let templateItems = [];
  let exercises = [];
  let categories = [];
  let editingTemplateId = null;
  let editingItemIndex = null;
  let draftItems = [];


  const tabs = document.createElement('nav');
  tabs.className = 'workout-library-tabs';
  tabs.innerHTML = `
    <button class="workout-library-tab active" type="button" data-workout-library-view="exercises">Exercícios</button>
    <button class="workout-library-tab" type="button" data-workout-library-view="templates">Treinos salvos <span class="view-count" id="saved-workout-count">0</span></button>`;
  exerciseSection.before(tabs);

  const savedSection = document.createElement('section');
  savedSection.className = 'card saved-workout-section workout-library-hidden';
  savedSection.innerHTML = `
    <div class="saved-workout-toolbar">
      <div><small>TREINOS SALVOS</small><h2 class="saved-workout-toolbar-title">Minha biblioteca de treinos</h2></div>
      <button id="new-saved-workout" class="btn btn-primary" type="button">+ Novo treino salvo</button>
    </div>
    <div id="saved-workout-list" class="saved-workout-list"><p class="empty">Carregando treinos salvos...</p></div>`;
  exerciseSection.after(savedSection);
  const savedList = savedSection.querySelector('#saved-workout-list');

  const modal = document.createElement('div');
  modal.className = 'saved-workout-modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <section class="saved-workout-dialog" role="dialog" aria-modal="true" aria-labelledby="saved-workout-title">
      <div class="saved-workout-modal-head"><div><small>MODELO DE TREINO</small><h2 id="saved-workout-title">Novo treino salvo</h2></div><button class="saved-workout-close" type="button" data-close-saved-workout>×</button></div>
      <form id="saved-workout-form">
        <div class="grid grid-2">
          <div class="form-group"><label>Nome *</label><input name="nome" maxlength="120" required placeholder="Ex.: Treino A — Hipertrofia"></div>
          <div class="form-group"><label>Descrição</label><input name="descricao" maxlength="240" placeholder="Ex.: Peito, ombro e tríceps"></div>
        </div>
        <div class="form-group"><label>Dias do treino *</label><div class="saved-workout-days">${[1,2,3,4,5,6,7].map(day => `<label><input type="checkbox" name="dias" value="${day}"><span>${dayNames[day]}</span></label>`).join('')}</div><p class="saved-workout-days-note">Os exercícios abaixo serão aplicados automaticamente a todos os dias selecionados.</p></div>
        <section class="saved-workout-item-form">
          <div class="saved-workout-item-grid">
            <div class="form-group exercise-search-field"><label>Buscar exercício</label><input id="saved-item-search" type="search" placeholder="Digite nome, categoria ou equipamento"></div>
            <div class="form-group category-field"><label>Categoria</label><select id="saved-item-category"><option value="">Todas as categorias</option></select></div>
            <div class="form-group exercise-field"><label>Exercício</label><select id="saved-item-exercise"></select></div>
            <div class="form-group"><label>Séries</label><input id="saved-item-series" type="number" min="1" max="20"></div>
            <div class="form-group"><label>Repetições</label><input id="saved-item-reps" maxlength="30" placeholder="10-12"></div>
            <div class="form-group"><label>Carga</label><input id="saved-item-load" maxlength="40" placeholder="Opcional"></div>
            <div class="form-group"><label>Descanso</label><input id="saved-item-rest" type="number" min="0" step="1" placeholder="seg"></div>
            <div class="form-group wide"><label>Observações</label><input id="saved-item-notes" maxlength="240" placeholder="Orientação opcional"></div>
          </div>
          <div class="actions saved-workout-item-actions"><button id="saved-item-add" class="btn btn-outline" type="button">+ Adicionar exercício</button><button id="saved-item-cancel-edit" class="btn btn-outline hidden" type="button">Cancelar edição</button></div>
        </section>
        <div id="saved-workout-draft" class="saved-workout-draft"></div>
        <div class="saved-workout-modal-actions"><button class="btn btn-outline" type="button" data-close-saved-workout>Cancelar</button><button id="save-saved-workout" class="btn btn-primary" type="submit">Salvar treino</button></div>
      </form>
    </section>`;
  document.body.appendChild(modal);

  const form = modal.querySelector('#saved-workout-form');
  const title = modal.querySelector('#saved-workout-title');
  const saveButton = modal.querySelector('#save-saved-workout');
  const exerciseSearch = modal.querySelector('#saved-item-search');
  const exerciseCategory = modal.querySelector('#saved-item-category');
  const exerciseSelect = modal.querySelector('#saved-item-exercise');
  const seriesInput = modal.querySelector('#saved-item-series');
  const repsInput = modal.querySelector('#saved-item-reps');
  const loadInput = modal.querySelector('#saved-item-load');
  const restInput = modal.querySelector('#saved-item-rest');
  const notesInput = modal.querySelector('#saved-item-notes');
  const addItemButton = modal.querySelector('#saved-item-add');
  const cancelItemEditButton = modal.querySelector('#saved-item-cancel-edit');
  const draft = modal.querySelector('#saved-workout-draft');

  function esc(value = '') { const div = document.createElement('div'); div.textContent = value ?? ''; return div.innerHTML; }
  function normalize(value = '') { return String(value || '').trim().toLocaleLowerCase('pt-BR'); }

  function setView(view, { focus = false } = {}) {
    const templatesActive = view === 'templates';
    exerciseSection.classList.toggle('workout-library-hidden', templatesActive);
    savedSection.classList.toggle('workout-library-hidden', !templatesActive);
    tabs.querySelectorAll('[data-workout-library-view]').forEach(button => {
      const active = button.dataset.workoutLibraryView === view;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    sessionStorage.setItem('fsfit-workout-library-view', view);
    if (focus) (templatesActive ? savedSection : exerciseSection).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function selectedDays() {
    return [...form.querySelectorAll('input[name="dias"]:checked')].map(input => Number(input.value));
  }

  function categoryNameFor(exercise) {
    return categories.find(category => category.id === exercise?.categoria_id)?.nome || exercise?.grupo_muscular || 'Outros';
  }

  function visibleExercises() {
    const customizedGlobalIds = new Set(
      exercises
        .filter(item => !item.global && item.personal_id === userId && item.origem_global_id)
        .map(item => item.origem_global_id)
    );
    return exercises.filter(item => !(item.global && customizedGlobalIds.has(item.id)));
  }

  function populateExerciseCategories(selectedId = '') {
    exerciseCategory.innerHTML = '<option value="">Todas as categorias</option>' + categories.map(category => `<option value="${category.id}">${esc(category.nome)}</option>`).join('');
    exerciseCategory.value = selectedId || '';
  }

  function renderExerciseOptions(selectedId = '') {
    const term = normalize(exerciseSearch.value);
    const categoryId = exerciseCategory.value;
    const filtered = visibleExercises().filter(item => {
      if (categoryId && item.categoria_id !== categoryId) return false;
      if (!term) return true;
      return [item.nome, item.equipamento, item.grupo_muscular, categoryNameFor(item)]
        .filter(Boolean)
        .some(value => normalize(value).includes(term));
    });

    if (!filtered.length) {
      exerciseSelect.innerHTML = '<option value="">Nenhum exercício encontrado</option>';
      exerciseSelect.disabled = true;
      return;
    }

    const grouped = new Map();
    filtered.forEach(item => {
      const categoryName = categoryNameFor(item);
      if (!grouped.has(categoryName)) grouped.set(categoryName, []);
      grouped.get(categoryName).push(item);
    });

    const groups = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    exerciseSelect.disabled = false;
    exerciseSelect.innerHTML = '<option value="">Selecione um exercício</option>' + groups.map(([categoryName, items]) => `
      <optgroup label="${esc(categoryName)}">
        ${items.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })).map(item => `<option value="${item.id}">${esc(item.nome)}${item.equipamento ? ` · ${esc(item.equipamento)}` : ''}</option>`).join('')}
      </optgroup>`).join('');

    if (selectedId && filtered.some(item => item.id === selectedId)) exerciseSelect.value = selectedId;
  }

  function resetItemEditor() {
    editingItemIndex = null;
    exerciseSearch.value = '';
    exerciseCategory.value = '';
    renderExerciseOptions();
    seriesInput.value = '';
    repsInput.value = '';
    loadInput.value = '';
    restInput.value = '';
    notesInput.value = '';
    addItemButton.textContent = '+ Adicionar exercício';
    cancelItemEditButton.classList.add('hidden');
  }

  function renderDraft() {
    if (!draftItems.length) {
      draft.innerHTML = '<p class="empty">Adicione os exercícios que compõem este treino.</p>';
      return;
    }
    const daysLabel = selectedDays().map(day => dayNames[day]).join(', ');
    draft.innerHTML = draftItems.map((item, index) => {
      const detail = [item.categoria_nome, item.series ? `${item.series} séries` : null, item.repeticoes, item.carga, item.descanso_segundos ? `${item.descanso_segundos}s` : null, daysLabel ? `Dias: ${daysLabel}` : null].filter(Boolean).join(' • ');
      return `<div class="saved-workout-draft-row"><span>${index + 1}</span><div><strong>${esc(item.exercicio_nome)}</strong><small>${esc(detail || 'Sem prescrição detalhada')}</small></div><div class="saved-workout-draft-actions"><button class="btn btn-outline" type="button" data-edit-saved-item="${index}">Editar</button><button class="btn btn-danger" type="button" data-remove-saved-item="${index}">Remover</button></div></div>`;
    }).join('');
  }

  function openModal(templateId = null) {
    editingTemplateId = templateId;
    editingItemIndex = null;
    form.reset();
    draftItems = [];
    title.textContent = templateId ? 'Editar treino salvo' : 'Novo treino salvo';
    saveButton.textContent = templateId ? 'Salvar alterações' : 'Salvar treino';

    if (templateId) {
      const template = templates.find(item => item.id === templateId);
      if (!template) return;
      form.nome.value = template.nome || '';
      form.descricao.value = template.descricao || '';
      const days = (template.dias_semana || []).map(Number);
      form.querySelectorAll('input[name="dias"]').forEach(input => { input.checked = days.includes(Number(input.value)); });

      const seenItems = new Set();
      draftItems = templateItems
        .filter(item => item.treino_id === templateId)
        .map(item => {
          const exercise = exercises.find(ex => ex.id === item.exercicio_id);
          return {
            exercicio_id: item.exercicio_id,
            exercicio_nome: item.exercicios?.nome || exercise?.nome || 'Exercício',
            categoria_nome: categoryNameFor(exercise || item.exercicios),
            ordem: Number(item.ordem) || 0,
            series: item.series ?? '',
            repeticoes: item.repeticoes || '',
            carga: item.carga || '',
            descanso_segundos: item.descanso_segundos ?? '',
            observacoes: item.observacoes || '',
            duracao_minutos: item.duracao_minutos ?? '',
            distancia_km: item.distancia_km ?? ''
          };
        })
        .sort((a, b) => a.ordem - b.ordem)
        .filter(item => {
          const key = [item.exercicio_id, item.ordem, item.series, item.repeticoes, item.carga, item.descanso_segundos, item.observacoes, item.duracao_minutos, item.distancia_km].join('|');
          if (seenItems.has(key)) return false;
          seenItems.add(key);
          return true;
        })
        .map(({ ordem, ...item }) => item);
    }

    resetItemEditor();
    renderDraft();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    editingTemplateId = null;
    resetItemEditor();
  }

  async function loadExercises() {
    const [{ data: categoryData, error: categoryError }, { data: exerciseData, error: exerciseError }] = await Promise.all([
      supabase.from('categorias_exercicios').select('id,nome,global,personal_id').or(`global.eq.true,personal_id.eq.${userId}`),
      supabase.from('exercicios').select('id,nome,grupo_muscular,equipamento,categoria_id,global,personal_id,origem_global_id').or(`global.eq.true,personal_id.eq.${userId}`).order('nome')
    ]);
    if (categoryError || exerciseError) throw categoryError || exerciseError;
    categories = (categoryData || []).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
    exercises = exerciseData || [];
    populateExerciseCategories();
    renderExerciseOptions();
  }

  async function loadTemplates() {
    if (!userId) return;
    const { data, error } = await supabase.from('treinos').select('id,nome,descricao,dias_semana,updated_at').eq('personal_id', userId).eq('modelo', true).is('aluno_id', null).order('updated_at', { ascending: false });
    if (error) throw error;
    templates = data || [];
    const ids = templates.map(item => item.id);
    if (ids.length) {
      const { data: items, error: itemsError } = await supabase.from('treino_exercicios').select('id,treino_id,exercicio_id,dia_semana,ordem,series,repeticoes,carga,descanso_segundos,observacoes,duracao_minutos,distancia_km,exercicios(nome,grupo_muscular,equipamento,categoria_id)').in('treino_id', ids).order('dia_semana').order('ordem');
      if (itemsError) throw itemsError;
      templateItems = items || [];
    } else {
      templateItems = [];
    }
    renderTemplates();
  }

  function renderTemplates() {
    const count = document.querySelector('#saved-workout-count');
    if (count) count.textContent = String(templates.length);
    if (!templates.length) {
      savedList.innerHTML = '<div class="empty"><strong>Nenhum treino salvo ainda.</strong><br>Crie modelos reutilizáveis para aplicar rapidamente aos seus alunos.</div>';
      return;
    }
    savedList.innerHTML = templates.map(template => {
      const items = templateItems.filter(item => item.treino_id === template.id);
      const uniqueExercises = new Set(items.map(item => item.exercicio_id)).size;
      const days = (template.dias_semana || []).map(Number).map(day => dayNames[day]).filter(Boolean).join(', ');
      return `<article class="saved-workout-card"><div><h3>${esc(template.nome)}</h3><p>${esc(template.descricao || 'Sem descrição')}</p><div class="saved-workout-meta"><span>${uniqueExercises} ${uniqueExercises === 1 ? 'exercício' : 'exercícios'}</span><span>${esc(days || 'Dias não definidos')}</span></div></div><div class="saved-workout-actions"><button class="btn btn-outline" type="button" data-edit-saved-workout="${template.id}">Editar</button><button class="btn btn-danger" type="button" data-delete-saved-workout="${template.id}" data-name="${esc(template.nome)}">Excluir</button></div></article>`;
    }).join('');
  }

  tabs.addEventListener('click', event => {
    const button = event.target.closest('[data-workout-library-view]');
    if (button) setView(button.dataset.workoutLibraryView, { focus: true });
  });

  form.querySelectorAll('input[name="dias"]').forEach(input => input.addEventListener('change', renderDraft));
  exerciseSearch.addEventListener('input', () => renderExerciseOptions());
  exerciseCategory.addEventListener('change', () => renderExerciseOptions());

  addItemButton.addEventListener('click', () => {
    const days = selectedDays();
    if (!days.length) return showMessage(message, 'Selecione pelo menos um dia do treino.', 'error');
    const exerciseId = exerciseSelect.value;
    const exercise = exercises.find(item => item.id === exerciseId);
    if (!exerciseId || !exercise) return showMessage(message, 'Selecione um exercício.', 'error');
    const item = {
      exercicio_id: exerciseId,
      exercicio_nome: exercise.nome,
      categoria_nome: categoryNameFor(exercise),
      series: seriesInput.value ? Number(seriesInput.value) : '',
      repeticoes: repsInput.value.trim(),
      carga: loadInput.value.trim(),
      descanso_segundos: restInput.value ? Number(restInput.value) : '',
      observacoes: notesInput.value.trim(),
      duracao_minutos: '',
      distancia_km: ''
    };
    if (editingItemIndex == null) draftItems.push(item);
    else draftItems[editingItemIndex] = item;
    resetItemEditor();
    renderDraft();
  });

  cancelItemEditButton.addEventListener('click', resetItemEditor);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const days = selectedDays();
    const name = form.nome.value.trim();
    const wasEditing = Boolean(editingTemplateId);
    if (!name) return showMessage(message, 'Informe o nome do treino.', 'error');
    if (!days.length) return showMessage(message, 'Selecione pelo menos um dia da semana.', 'error');
    if (!draftItems.length) return showMessage(message, 'Adicione pelo menos um exercício ao treino.', 'error');

    const items = days.flatMap(day => draftItems.map((item, index) => {
      const { exercicio_nome, categoria_nome, ...payloadItem } = item;
      return { ...payloadItem, dia_semana: day, ordem: index + 1 };
    }));

    saveButton.disabled = true;
    const { error } = await supabase.rpc('fsfit_salvar_modelo_treino', {
      p_modelo_id: editingTemplateId,
      p_nome: name,
      p_descricao: form.descricao.value.trim() || null,
      p_dias: days,
      p_itens: items
    });
    saveButton.disabled = false;
    if (error) return showMessage(message, error.message || 'Não foi possível salvar o treino.', 'error');
    closeModal();
    await loadTemplates();
    setView('templates');
    showMessage(message, wasEditing ? 'Treino salvo atualizado.' : 'Treino salvo criado com sucesso.');
  });

  document.addEventListener('click', async event => {
    if (event.target.closest('#new-saved-workout')) return openModal();
    if (event.target.closest('[data-close-saved-workout]')) return closeModal();

    const editItem = event.target.closest('[data-edit-saved-item]');
    if (editItem) {
      const index = Number(editItem.dataset.editSavedItem);
      const item = draftItems[index];
      if (!item) return;
      editingItemIndex = index;
      const exercise = exercises.find(entry => entry.id === item.exercicio_id);
      exerciseSearch.value = '';
      exerciseCategory.value = exercise?.categoria_id || '';
      renderExerciseOptions(item.exercicio_id);
      seriesInput.value = item.series ?? '';
      repsInput.value = item.repeticoes || '';
      loadInput.value = item.carga || '';
      restInput.value = item.descanso_segundos ?? '';
      notesInput.value = item.observacoes || '';
      addItemButton.textContent = 'Salvar exercício';
      cancelItemEditButton.classList.remove('hidden');
      return;
    }

    const removeItem = event.target.closest('[data-remove-saved-item]');
    if (removeItem) {
      draftItems.splice(Number(removeItem.dataset.removeSavedItem), 1);
      resetItemEditor();
      renderDraft();
      return;
    }

    const editTemplate = event.target.closest('[data-edit-saved-workout]');
    if (editTemplate) return openModal(editTemplate.dataset.editSavedWorkout);

    const deleteTemplate = event.target.closest('[data-delete-saved-workout]');
    if (deleteTemplate) {
      if (!confirm(`Excluir o treino salvo “${deleteTemplate.dataset.name}”?`)) return;
      const { error } = await supabase.from('treinos').delete().eq('id', deleteTemplate.dataset.deleteSavedWorkout).eq('personal_id', userId).eq('modelo', true).is('aluno_id', null);
      if (error) return showMessage(message, 'Não foi possível excluir o treino salvo.', 'error');
      await loadTemplates();
      showMessage(message, 'Treino salvo excluído.');
    }
  });

  modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });

  try {
    await Promise.all([loadExercises(), loadTemplates()]);
    const preferred = sessionStorage.getItem('fsfit-workout-library-view') || 'exercises';
    setView(preferred === 'templates' ? 'templates' : 'exercises');
  } catch (error) {
    console.error(error);
    showMessage(message, error.message || 'Não foi possível carregar os treinos salvos.', 'error');
  }
}
