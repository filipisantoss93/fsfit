const modal = document.querySelector('#exercise-modal');
const modalCard = modal?.querySelector('.workout-exercise-builder-modal');
const form = document.querySelector('#workout-exercise-form');
const saveButton = document.querySelector('#save-exercise-batch');
const batchSelector = document.querySelector('#batch-exercise-selector');
const selectedSection = document.querySelector('#selected-exercises-section');
const selectedBuilder = document.querySelector('#selected-exercises-builder');
const originalActions = saveButton?.closest('.workout-modal-actions');

if (modal && modalCard && form && saveButton && originalActions && selectedBuilder) {
  const stickyBar = document.createElement('div');
  stickyBar.className = 'exercise-sticky-save-bar';
  stickyBar.setAttribute('aria-hidden', 'true');
  modal.appendChild(stickyBar);

  function hasSelectedExercises() {
    return selectedBuilder.children.length > 0 &&
      !selectedSection?.classList.contains('hidden') &&
      !batchSelector?.classList.contains('hidden');
  }

  function restoreButton() {
    if (saveButton.parentElement === originalActions) return;
    originalActions.prepend(saveButton);
    saveButton.removeAttribute('form');
  }

  function moveButtonToStickyBar() {
    if (saveButton.parentElement === stickyBar) return;
    saveButton.setAttribute('form', form.id);
    stickyBar.appendChild(saveButton);
  }

  function syncStickyButton() {
    const shouldFix = modal.classList.contains('open') && hasSelectedExercises();

    modal.classList.toggle('has-fixed-exercise-save', shouldFix);
    modalCard.classList.toggle('has-fixed-exercise-save', shouldFix);
    stickyBar.classList.toggle('show', shouldFix);
    stickyBar.setAttribute('aria-hidden', shouldFix ? 'false' : 'true');

    if (shouldFix) moveButtonToStickyBar();
    else restoreButton();
  }

  const observer = new MutationObserver(syncStickyButton);
  observer.observe(selectedBuilder, { childList: true });
  if (selectedSection) observer.observe(selectedSection, { attributes: true, attributeFilter: ['class'] });
  if (batchSelector) observer.observe(batchSelector, { attributes: true, attributeFilter: ['class'] });
  observer.observe(modal, { attributes: true, attributeFilter: ['class'] });

  document.addEventListener('change', event => {
    if (event.target.closest('#exercise-checkbox-list')) queueMicrotask(syncStickyButton);
  });

  document.addEventListener('click', event => {
    if (event.target.closest('[data-remove-selected], [data-close-exercise-modal]')) {
      queueMicrotask(syncStickyButton);
    }
  });

  syncStickyButton();
}
