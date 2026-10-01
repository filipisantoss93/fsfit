const workoutButton = document.querySelector<HTMLElement>('#new-saved-workout');
const pageActions = document.querySelector<HTMLElement>('.exercise-library-page .exercise-action-bar');
const savedToolbar = document.querySelector<HTMLElement>('.saved-workout-toolbar');

if (workoutButton && pageActions) {
  workoutButton.textContent = '+ Treino';
  workoutButton.classList.add('exercise-action-button');
  pageActions.appendChild(workoutButton);
}

if (savedToolbar && savedToolbar.children.length === 0) {
  savedToolbar.remove();
}
