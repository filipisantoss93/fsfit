import './biblioteca-treinos.js';

const savedWorkoutSection = document.querySelector('.saved-workout-section');
const savedWorkoutToolbar = savedWorkoutSection?.querySelector('.saved-workout-toolbar');
const savedWorkoutTitle = savedWorkoutToolbar?.querySelector('h2');
const newSavedWorkoutButton = savedWorkoutSection?.querySelector('#new-saved-workout');

savedWorkoutTitle?.remove();
if (newSavedWorkoutButton) newSavedWorkoutButton.textContent = '+ Novo treino';
