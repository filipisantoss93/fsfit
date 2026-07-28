const workoutButton = document.querySelector('#new-saved-workout');
const pageActions = document.querySelector('.exercise-library-page .exercise-action-bar');
const savedToolbar = document.querySelector('.saved-workout-toolbar');

if (workoutButton && pageActions) {
  workoutButton.textContent = '+ Treino';
  workoutButton.classList.add('exercise-action-button');
  pageActions.appendChild(workoutButton);
}

if (savedToolbar && !savedToolbar.children.length) {
  savedToolbar.remove();
}
