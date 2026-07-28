globalThis.__FSFIT_WORKOUT_PUBLICATION_GUARD__ = true;

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

function compactWorkoutPage() {
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

import('./treino-aluno-app.js?v=20260725-simple-boot2').catch(error => {
  console.error('Falha ao carregar a página simplificada de treinos:', error);
  document.body?.classList.add('workout-simple-fallback');
});
