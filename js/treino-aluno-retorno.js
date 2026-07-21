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
      grid-template-columns:repeat(3,minmax(0,1fr))!important;
      gap:8px!important;
      margin-top:12px!important;
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
    @media(max-width:640px){
      .workout-active-summary-compact .workout-compact-actions{
        grid-template-columns:repeat(3,minmax(0,1fr))!important;
        gap:6px!important;
        margin-top:9px!important;
      }
      .workout-active-summary-compact .workout-compact-actions .btn{
        min-height:38px!important;
        padding:8px 5px!important;
        font-size:.72rem!important;
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
  }
  if (detailsButton) detailsButton.textContent = 'Detalhes';

  const addCard = document.querySelector('.workout-add-card');
  const openExerciseButton = document.querySelector('#open-exercise-modal');
  if (activeCard && addCard && !activeCard.querySelector('.workout-compact-actions')) {
    const actions = document.createElement('div');
    actions.className = 'workout-compact-actions';

    const libraryLink = addCard.querySelector('a[href*="biblioteca-exercicios"]');
    if (libraryLink) {
      libraryLink.textContent = 'Biblioteca';
      actions.appendChild(libraryLink);
    }

    if (openExerciseButton) {
      openExerciseButton.textContent = '+ Exercícios';
      actions.appendChild(openExerciseButton);
    }

    if (detailsButton) {
      actions.appendChild(detailsButton);
    }

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
