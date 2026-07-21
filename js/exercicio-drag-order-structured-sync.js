let selectedStructuredExerciseId = '';

// Mantém o campo oculto de ordem alinhado ao drag-and-drop sem recarregar a página.
// Isso evita que uma edição posterior de séries/repetições restaure uma ordem antiga
// mantida no cache da tela de treino.
document.addEventListener('click', event => {
  const row = event.target.closest('.workout-exercise-row[data-open-exercise-detail]');
  if (row) selectedStructuredExerciseId = row.dataset.openExerciseDetail || '';

  if (!event.target.closest('#exercise-detail-edit') || !selectedStructuredExerciseId) return;

  window.setTimeout(() => {
    const rows = [...document.querySelectorAll('.workout-exercise-list .workout-exercise-row[data-open-exercise-detail]')];
    const index = rows.findIndex(item => item.dataset.openExerciseDetail === selectedStructuredExerciseId);
    const orderInput = document.querySelector('#workout-exercise-form [name="ordem"]');
    if (index >= 0 && orderInput) orderInput.value = String(index + 1);
  }, 0);
}, true);
