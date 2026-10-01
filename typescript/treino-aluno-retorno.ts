export {};

type WorkoutRuntimeGlobal = typeof globalThis & { __FSFIT_WORKOUT_PUBLICATION_GUARD__?: boolean };
(globalThis as WorkoutRuntimeGlobal).__FSFIT_WORKOUT_PUBLICATION_GUARD__ = true;

const params = new URLSearchParams(window.location.search);
const embedded = params.get('embed') === '1';
const backLink = document.querySelector<HTMLAnchorElement>('#back-link');

if (embedded && window.parent !== window && backLink) {
  backLink.href = '#';
  backLink.textContent = '← Voltar';
  backLink.addEventListener('click', event => {
    event.preventDefault();
    window.parent.postMessage({ type: 'fsfit-close-workout-modal' }, window.location.origin);
  });
}

function compactWorkoutPage() {
  const pageHeader = document.querySelector<HTMLElement>('.workout-page > .page-header');
  if (pageHeader) {
    pageHeader.classList.add('workout-page-header');
    pageHeader.querySelector('p')?.remove();
    pageHeader.querySelector('.hero-badge')?.remove();
  }

  const plansCard = document.querySelector<HTMLElement>('.workout-plans-card');
  const workoutList = document.querySelector<HTMLElement>('#workout-list');
  const newWorkoutButton = document.querySelector<HTMLButtonElement>('#new-workout-button');
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

  const activeCard = document.querySelector<HTMLElement>('.workout-active-summary-card');
  const activeHeading = activeCard?.querySelector<HTMLElement>('.workout-summary-heading');
  const detailsButton = document.querySelector<HTMLButtonElement>('#active-workout-details');
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

  const addCard = document.querySelector<HTMLElement>('.workout-add-card');
  const openExerciseButton = document.querySelector<HTMLButtonElement>('#open-exercise-modal');
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

  const daysCard = document.querySelector<HTMLElement>('.workout-active-card');
  if (daysCard) {
    daysCard.classList.add('workout-days-card-compact');
    daysCard.querySelector('.workout-active-heading')?.remove();
  }
}

compactWorkoutPage();

// @ts-ignore The browser resolves this versioned module.
import('./exercicio-drag-order-structured-sync.js?v=20261001-ts1').catch(error => {
  console.error('Falha ao sincronizar ordem do editor estruturado:', error);
});

// @ts-ignore The browser resolves this versioned module.
import('./treino-sticky-exercise-save.js?v=20261001-ts1').catch(error => {
  console.error('Falha ao carregar botão fixo de adicionar exercícios:', error);
});

// @ts-ignore The browser resolves this versioned module.
import('./treino-exercise-picker-sheet.js?v=20260721-picker-sheet1').catch(error => {
  console.error('Falha ao carregar seletor de exercícios do treino estruturado:', error);
});

// @ts-ignore The browser resolves this versioned module.
import('./treino-aluno-app.js?v=20261001-ts-simple-app1').catch(error => {
  console.error('Falha ao carregar a página simplificada de treinos:', error);
  document.body?.classList.add('workout-simple-fallback');
});
