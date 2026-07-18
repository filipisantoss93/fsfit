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
  let editingTemplateId = null;
  let editingItemIndex = null;
  let draftItems = [];

  const style = document.createElement('style');
  style.textContent = `
    .workout-library-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:20px 0 0;padding:6px;border:1px solid var(--border);border-radius:16px;background:rgba(26,29,35,.94)}
    .workout-library-tab{display:flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 14px;border:0;border-radius:11px;background:transparent;color:var(--muted);font-weight:850;cursor:pointer}
    .workout-library-tab.active{background:var(--surface-light);color:var(--text)}
    .workout-library-tab .view-count{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:rgba(59,130,246,.14);color:var(--secondary);font-size:.7rem;font-weight:900}
    .workout-library-tab.active .view-count{background:rgba(50,215,75,.13);color:var(--primary)}
    .workout-library-hidden{display:none!important}
    .saved-workout-section{margin-top:20px}
    .saved-workout-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}
    .saved-workout-list{display:grid;gap:10px}
    .saved-workout-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;padding:14px;border:1px solid var(--border);border-radius:15px;background:var(--surface-light)}
    .saved-workout-card h3{margin:0 0 5px;font-size:1rem}.saved-workout-card p{margin:0;color:var(--muted);font-size:.82rem;line-height:1.4}
    .saved-workout-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.saved-workout-meta span{padding:4px 7px;border:1px solid var(--border);border-radius:999px;color:var(--muted);font-size:.68rem;font-weight:800}
    .saved-workout-actions{display:flex;gap:7px;flex-wrap:wrap}.saved-workout-actions .btn{min-height:38px;padding:0 11px;font-size:.78rem}
    .saved-workout-modal{position:fixed;inset:0;z-index:22000;display:none;align-items:flex-end;justify-content:center;padding:14px;background:rgba(4,7,10,.78);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
    .saved-workout-modal.open{display:flex}.saved-workout-dialog{width:min(820px,100%);max-height:92dvh;overflow:auto;padding:20px;border:1px solid var(--border);border-radius:22px;background:#171b21;box-shadow:0 28px 80px rgba(0,0,0,.58)}
    .saved-workout-modal-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:16px}.saved-workout-modal-head h2{margin:0}.saved-workout-close{width:40px;height:40px;border:1px solid var(--border);border-radius:50%;background:var(--surface-light);color:var(--text);font-size:1.4rem}
    .saved-workout-days{display:flex;gap:7px;flex-wrap:wrap}.saved-workout-days label{margin:0}.saved-workout-days input{position:absolute;opacity:0;pointer-events:none}.saved-workout-days span{display:inline-grid;place-items:center;min-width:46px;min-height:38px;padding:0 9px;border:1px solid var(--border);border-radius:10px;color:var(--muted);font-size:.78rem;font-weight:800}.saved-workout-days input:checked+span{border-color:var(--primary);color:var(--primary);background:rgba(50,215,75,.1)}
    .saved-workout-item-form{margin-top:18px;padding:14px;border:1px solid var(--border);border-radius:15px;background:rgba(255,255,255,.025)}
    .saved-workout-item-grid{display:grid;grid-template-columns:1fr 2fr repeat(4,minmax(95px,1fr));gap:10px}.saved-workout-item-grid .form-group{margin:0}.saved-workout-item-grid .wide{grid-column:1/-1}
    .saved-workout-draft{display:grid;gap:8px;margin-top:14px}.saved-workout-draft-row{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--surface-light)}
    .saved-workout-draft-row>span{display:grid;place-items:center;width:38px;height:38px;border-radius:10px;background:rgba(50,215,75,.1);color:var(--primary);font-size:.72rem;font-weight:900}.saved-workout-draft-row strong{display:block;font-size:.9rem}.saved-workout-draft-row small{display:block;margin-top:3px;color:var(--muted);font-size:.72rem}.saved-workout-draft-actions{display:flex;gap:6px}.saved-workout-draft-actions button{min-height:34px;padding:0 9px;font-size:.72rem}
    .saved-workout-modal-actions{display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px}
    @media(max-width:720px){.workout-library-tabs{position:sticky;top:calc(82px + var(--safe-area-top));z-index:18}.saved-workout-card{grid-template-columns:1fr}.saved-workout-actions{width:100%}.saved-workout-actions .btn{flex:1}.saved-workout-item-grid{grid-template-columns:1fr 1fr}.saved-workout-item-grid .exercise-field,.saved-workout-item-grid .wide{grid-column:1/-1}.saved-workout-dialog{padding:16px}.saved-workout-modal{padding:8px}.saved-workout-draft-row{grid-template-columns:38px minmax(0,1fr)}.saved-workout-draft-actions{grid-column:1/-1}.saved-workout-draft-actions button{flex:1}}
  `;
  document.head.appendChild(style);

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
      <div><small>TREINOS SALVOS</small><h2 style="margin:4px 0 0">Minha biblioteca de treinos</h2></div>
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
        <div class="form-group"><label>Dias do treino *</label><div class="saved-workout-days">${[1,2,3,4,5,6,7].map(day => `<label><input type="checkbox" name="dias" value="${day}"><span>${dayNames[day]}</span></label>`).join('')}</div></div>
        <section class="saved-workout-item-form">
          <div class="saved-workout-item-grid">
            <div class="form-group"><label>Dia</label><select id="saved-item-day"></select></div>
            <div class="form-group exercise-field"><label>Exercício</label><select id="saved-item-exercise"></select></div>
            <div class="form-group"><label>Séries</label><input id="saved-item-series" type="number" min="1" max="20"></div>
            <div class="form-group"><label>Repetições</label><input id="saved-item-reps" maxlength="30" placeholder="10-12"></div>
            <div class="form-group"><label>Carga</label><input id="saved-item-load" maxlength="40" placeholder="Opcional"></div>
            <div class="form-group"><label>Descanso</label><input id="saved-item-rest" type="number" min="0" step="1" placeholder="seg"></div>
            <div class="form-group wide"><label>Observações</label><input id="saved-item-notes" maxlength="240" placeholder="Orientação opcional"></div>
          </div>
          <div class="actions" style="margin-top:12px"><button id="saved-item-add" class="btn btn-outline" type="button">+ Adicionar exercício</button><button id="saved-item-cancel-edit" class="btn btn-outline hidden" type="button">Cancelar edição</button></div>
        </section>
        <div id="saved-workout-draft" class="saved-workout-draft"></div>
        <div class="saved-workout-modal-actions"><button class="btn btn-outline" type="button" data-close-saved-workout>Cancelar</button><button id="save-saved-workout" class="btn btn-primary" type="submit">Salvar treino</button></div>
      </form>
    </section>`;
  document.body.appendChild(modal);

  const form = modal.querySelector('#saved-workout-form');
  const title = modal.querySelector('#saved-workout-title');
  const saveButton = modal.querySelector('#save-saved-workout');
  const daySelect = modal.querySelector('#saved-item-day');
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

  function updateDaySelect() {
    const days = selectedDays();
    const current = Number(daySelect.value);
    daySelect.innerHTML = days.length ? days.map(day => `<option value="${day}">${dayNames[day]}</option>`).join('') : '<option value="">Selecione os dias acima</option>';
    daySelect.disabled = !days.length;
    if (days.includes(current)) daySelect.value = String(current);
  }

  function resetItemEditor() {
    editingItemIndex = null;
    exerciseSelect.value = '';
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
    draft.innerHTML = draftItems.map((item, index) => {
      const detail = [item.series ? `${item.series} séries` : null, item.repeticoes, item.carga, item.descanso_segundos ? `${item.descanso_segundos}s` : null].filter(Boolean).join(' • ');
      return `<div class="saved-workout-draft-row"><span>${dayNames[item.dia_semana]}</span><div><strong>${esc(item.exercicio_nome)}</strong><small>${esc(detail || 'Sem prescrição detalhada')}</small></div><div class="saved-workout-draft-actions"><button class="btn btn-outline" type="button" data-edit-saved-item="${index}">Editar</button><button class="btn btn-danger" type="button" data-remove-saved-item="${index}">Remover</button></div></div>`;
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
      draftItems = templateItems.filter(item => item.treino_id === templateId).map(item => ({
        exercicio_id: item.exercicio_id,
        exercicio_nome: item.exercicios?.nome || 'Exercício',
        dia_semana: Number(item.dia_semana),
        series: item.series ?? '',
        repeticoes: item.repeticoes || '',
        carga: item.carga || '',
        descanso_segundos: item.descanso_segundos ?? '',
        observacoes: item.observacoes || '',
        duracao_minutos: item.duracao_minutos ?? '',
        distancia_km: item.distancia_km ?? ''
      }));
    }

    updateDaySelect();
    resetItemEditor();
    renderDraft();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    editingTemplateId = null;
    resetItemEditor();
  }

  async function loadExercises() {
    const { data, error } = await supabase.from('exercicios').select('id,nome,grupo_muscular,equipamento').or(`global.eq.true,personal_id.eq.${userId}`).order('nome');
    if (error) throw error;
    exercises = data || [];
    exerciseSelect.innerHTML = '<option value="">Selecione</option>' + exercises.map(item => `<option value="${item.id}">${esc(item.nome)}${item.grupo_muscular ? ` — ${esc(item.grupo_muscular)}` : ''}</option>`).join('');
  }

  async function loadTemplates() {
    if (!userId) return;
    const { data, error } = await supabase.from('treinos').select('id,nome,descricao,dias_semana,updated_at').eq('personal_id', userId).eq('modelo', true).is('aluno_id', null).order('updated_at', { ascending: false });
    if (error) throw error;
    templates = data || [];
    const ids = templates.map(item => item.id);
    if (ids.length) {
      const { data: items, error: itemsError } = await supabase.from('treino_exercicios').select('id,treino_id,exercicio_id,dia_semana,ordem,series,repeticoes,carga,descanso_segundos,observacoes,duracao_minutos,distancia_km,exercicios(nome,grupo_muscular,equipamento)').in('treino_id', ids).order('dia_semana').order('ordem');
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
      const days = (template.dias_semana || []).map(Number).map(day => dayNames[day]).filter(Boolean).join(', ');
      return `<article class="saved-workout-card"><div><h3>${esc(template.nome)}</h3><p>${esc(template.descricao || 'Sem descrição')}</p><div class="saved-workout-meta"><span>${items.length} ${items.length === 1 ? 'exercício' : 'exercícios'}</span><span>${esc(days || 'Dias não definidos')}</span></div></div><div class="saved-workout-actions"><button class="btn btn-outline" type="button" data-edit-saved-workout="${template.id}">Editar</button><button class="btn btn-danger" type="button" data-delete-saved-workout="${template.id}" data-name="${esc(template.nome)}">Excluir</button></div></article>`;
    }).join('');
  }

  tabs.addEventListener('click', event => {
    const button = event.target.closest('[data-workout-library-view]');
    if (button) setView(button.dataset.workoutLibraryView, { focus: true });
  });

  form.querySelectorAll('input[name="dias"]').forEach(input => input.addEventListener('change', updateDaySelect));

  addItemButton.addEventListener('click', () => {
    const exerciseId = exerciseSelect.value;
    const day = Number(daySelect.value);
    const exercise = exercises.find(item => item.id === exerciseId);
    if (!exerciseId || !day || !exercise) return showMessage(message, 'Selecione o dia e o exercício.', 'error');
    const item = {
      exercicio_id: exerciseId,
      exercicio_nome: exercise.nome,
      dia_semana: day,
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
    if (draftItems.some(item => !days.includes(Number(item.dia_semana)))) return showMessage(message, 'Há exercícios vinculados a dias que foram desmarcados.', 'error');

    const counters = {};
    const items = draftItems.map(item => {
      const day = Number(item.dia_semana);
      counters[day] = (counters[day] || 0) + 1;
      const { exercicio_nome, ...payloadItem } = item;
      return { ...payloadItem, ordem: counters[day] };
    });

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
      daySelect.value = String(item.dia_semana);
      exerciseSelect.value = item.exercicio_id;
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
