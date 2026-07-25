const params = new URLSearchParams(window.location.search);
const embedded = params.get('embed') === '1';
const backLink = document.querySelector('#back-link');

if (embedded && window.parent !== window && backLink) {
  backLink.href = '#';
  backLink.textContent = '← Voltar';
  backLink.addEventListener('click', event => {
    event.preventDefault();
    window.parent.postMessage({ type: 'fsfit-close-workout-modal' }, window.location.origin);
  });
}

function injectStructuredWorkoutActionBarStyles() {
  if (document.querySelector('#structured-workout-action-bar-styles')) return;
  const style = document.createElement('style');
  style.id = 'structured-workout-action-bar-styles';
  style.textContent = `
    .workout-active-summary-compact .workout-active-compact-heading #active-workout-details{display:none!important}
    .workout-active-summary-compact .workout-compact-actions{
      display:grid!important;
      grid-template-columns:repeat(2,minmax(0,1fr))!important;
      gap:8px!important;
      margin-top:12px!important;
    }
    .workout-active-summary-compact .workout-compact-actions.has-apply{
      grid-template-columns:repeat(3,minmax(0,1fr))!important;
    }
    .workout-active-summary-compact .workout-compact-actions .btn{
      width:100%!important;
      min-width:0!important;
      min-height:42px!important;
      padding:9px 8px!important;
      margin:0!important;
      white-space:nowrap;
      font-size:.82rem;
    }
    .workout-plan-row.selected:not(.active){
      border-color:rgba(59,130,246,.62)!important;
      box-shadow:inset 5px 0 0 var(--secondary);
      background:linear-gradient(90deg,rgba(59,130,246,.09),rgba(59,130,246,.025));
    }
    .workout-plan-row-title em.draft{
      border:1px solid rgba(59,130,246,.25);
      background:rgba(59,130,246,.1);
      color:#aecdff;
    }
    .workout-plan-row.selected .workout-row-arrow{color:var(--secondary)}
    .workout-editor-context{
      display:flex;
      align-items:center;
      gap:7px;
      margin-top:4px;
      color:var(--muted);
      font-size:.7rem;
      font-weight:800;
    }
    .workout-editor-context-badge{
      display:inline-flex;
      align-items:center;
      min-height:20px;
      padding:2px 7px;
      border:1px solid rgba(59,130,246,.24);
      border-radius:999px;
      color:#aecdff;
      background:rgba(59,130,246,.08);
      font-size:.6rem;
      font-weight:900;
      letter-spacing:.05em;
    }
    .workout-editor-context-badge.active{
      border-color:rgba(50,215,75,.28);
      color:var(--primary);
      background:rgba(50,215,75,.08);
    }
    @media(max-width:640px){
      .workout-active-summary-compact .workout-compact-actions{
        grid-template-columns:repeat(2,minmax(0,1fr))!important;
        gap:6px!important;
        margin-top:9px!important;
      }
      .workout-active-summary-compact .workout-compact-actions.has-apply{
        grid-template-columns:repeat(3,minmax(0,1fr))!important;
      }
      .workout-active-summary-compact .workout-compact-actions .btn{
        min-height:40px!important;
        padding:8px 5px!important;
        font-size:.7rem!important;
      }
    }
  `;
  document.head.appendChild(style);
}

function compactWorkoutPage() {
  injectStructuredWorkoutActionBarStyles();

  if (!document.querySelector('link[data-fsfit-workout-compact]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/treino-aluno-compact.css?v=20260720-actionsbar1';
    link.dataset.fsfitWorkoutCompact = 'true';
    document.head.appendChild(link);
  }

  const pageHeader = document.querySelector('.workout-page > .page-header');
  if (pageHeader) {
    pageHeader.classList.add('workout-page-header');
    pageHeader.querySelector('p')?.remove();
    pageHeader.querySelector('.hero-badge')?.remove();
  }

  const plansCard = document.querySelector('.workout-plans-card');
  const workoutList = document.querySelector('#workout-list');
  const newWorkoutButton = document.querySelector('#new-workout-button');
  if (plansCard && workoutList && newWorkoutButton && !plansCard.querySelector('.workout-plans-toolbar')) {
    plansCard.querySelector('.workout-plans-heading')?.remove();
    const toolbar = document.createElement('div');
    toolbar.className = 'workout-plans-toolbar';
    toolbar.innerHTML = '<h2>Planos</h2>';
    toolbar.appendChild(newWorkoutButton);
    plansCard.insertBefore(toolbar, workoutList);
  }

  const workspace = document.querySelector('#active-workout-workspace');
  workspace?.classList.add('workout-workspace-compact');

  const activeCard = document.querySelector('.workout-active-summary-card');
  const activeHeading = activeCard?.querySelector('.workout-summary-heading');
  const detailsButton = document.querySelector('#active-workout-details');
  if (activeCard) activeCard.classList.add('workout-active-summary-compact');
  if (activeHeading) {
    activeHeading.classList.add('workout-active-compact-heading');
    activeHeading.querySelector('small')?.remove();
    if (!activeHeading.querySelector('.workout-editor-context')) {
      const context = document.createElement('div');
      context.className = 'workout-editor-context';
      context.innerHTML = '<span class="workout-editor-context-badge">RASCUNHO</span><span>Selecionado para edição</span>';
      activeHeading.querySelector('div')?.appendChild(context);
    }
  }
  if (detailsButton) detailsButton.textContent = 'Editar plano';

  const addCard = document.querySelector('.workout-add-card');
  const openExerciseButton = document.querySelector('#open-exercise-modal');
  if (activeCard && addCard && !activeCard.querySelector('.workout-compact-actions')) {
    const actions = document.createElement('div');
    actions.className = 'workout-compact-actions';

    if (detailsButton) actions.appendChild(detailsButton);

    if (openExerciseButton) {
      openExerciseButton.textContent = '+ Exercícios';
      actions.appendChild(openExerciseButton);
    }

    const applyButton = document.createElement('button');
    applyButton.id = 'apply-workout-button';
    applyButton.className = 'btn btn-primary hidden';
    applyButton.type = 'button';
    applyButton.textContent = 'Aplicar ao aluno';
    actions.appendChild(applyButton);

    activeCard.appendChild(actions);
    addCard.remove();
  }

  const daysCard = document.querySelector('.workout-active-card');
  if (daysCard) {
    daysCard.classList.add('workout-days-card-compact');
    daysCard.querySelector('.workout-active-heading')?.remove();
  }
}

compactWorkoutPage();

import('./exercicio-drag-order-structured-sync.js?v=20260720-dnd-sync1').catch(error => {
  console.error('Falha ao sincronizar ordem do editor estruturado:', error);
});

import('./treino-sticky-exercise-save.js?v=20260720-sticky-save1').catch(error => {
  console.error('Falha ao carregar botão fixo de adicionar exercícios:', error);
});

import('./treino-exercise-picker-sheet.js?v=20260721-picker-sheet1').catch(error => {
  console.error('Falha ao carregar seletor de exercícios do treino estruturado:', error);
});

import('./treino-aluno-simplificado.js?v=20260725-simple1').catch(error => {
  console.error('Falha ao carregar o editor simplificado de treinos:', error);
});
