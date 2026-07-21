const modal = document.querySelector('#exercise-modal');
const modalCard = modal?.querySelector('.workout-exercise-builder-modal');
const form = document.querySelector('#workout-exercise-form');
const saveButton = document.querySelector('#save-exercise-batch');
const batchSelector = document.querySelector('#batch-exercise-selector');
const selectedSection = document.querySelector('#selected-exercises-section');
const selectedBuilder = document.querySelector('#selected-exercises-builder');
const originalActions = saveButton?.closest('.workout-modal-actions');

if (modal && modalCard && form && saveButton && originalActions && selectedBuilder) {
  injectStyles();

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

function injectStyles() {
  if (document.querySelector('#treino-sticky-exercise-save-styles')) return;

  const style = document.createElement('style');
  style.id = 'treino-sticky-exercise-save-styles';
  style.textContent = `
    #exercise-modal .exercise-sticky-save-bar {
      position: absolute;
      left: 50%;
      bottom: max(10px, env(safe-area-inset-bottom));
      z-index: 5;
      display: none;
      width: min(772px, calc(100vw - 52px));
      padding: 10px;
      transform: translateX(-50%);
      border: 1px solid rgba(255,255,255,.10);
      border-radius: 16px;
      background: rgba(23,27,33,.94);
      box-shadow: 0 -12px 32px rgba(0,0,0,.34);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }

    #exercise-modal .exercise-sticky-save-bar.show {
      display: block;
    }

    #exercise-modal .exercise-sticky-save-bar #save-exercise-batch {
      width: 100%;
      min-height: 48px;
      margin: 0;
    }

    #exercise-modal .workout-exercise-builder-modal.has-fixed-exercise-save {
      padding-bottom: calc(112px + env(safe-area-inset-bottom));
    }

    @media (max-width: 640px) {
      #exercise-modal .exercise-sticky-save-bar {
        bottom: max(8px, env(safe-area-inset-bottom));
        width: calc(100vw - 36px);
        padding: 8px;
        border-radius: 14px;
      }

      #exercise-modal .exercise-sticky-save-bar #save-exercise-batch {
        min-height: 50px;
      }

      #exercise-modal .workout-exercise-builder-modal.has-fixed-exercise-save {
        padding-bottom: calc(118px + env(safe-area-inset-bottom));
      }
    }
  `;
  document.head.appendChild(style);
}
