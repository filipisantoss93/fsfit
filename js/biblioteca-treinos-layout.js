const workoutButton = document.querySelector('#new-saved-workout');
const pageActions = document.querySelector('.exercise-library-page .page-header .actions');
const savedToolbar = document.querySelector('.saved-workout-toolbar');

if (workoutButton && pageActions) {
  workoutButton.textContent = '+ Treino';
  pageActions.appendChild(workoutButton);
}

if (savedToolbar && !savedToolbar.children.length) {
  savedToolbar.remove();
}
