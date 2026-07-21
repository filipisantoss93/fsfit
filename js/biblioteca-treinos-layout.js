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

injectSavedWorkoutStickyActions();

function injectSavedWorkoutStickyActions() {
  if (document.querySelector('#saved-workout-sticky-actions-styles')) return;

  const style = document.createElement('style');
  style.id = 'saved-workout-sticky-actions-styles';
  style.textContent = `
    .saved-workout-dialog{
      padding-bottom:110px!important;
    }

    .saved-workout-modal-actions{
      position:fixed!important;
      left:50%;
      bottom:max(14px,env(safe-area-inset-bottom));
      z-index:22020;
      display:grid!important;
      grid-template-columns:1fr 1.35fr;
      gap:9px!important;
      width:min(780px,calc(100vw - 56px));
      margin:0!important;
      padding:10px;
      transform:translateX(-50%);
      border:1px solid rgba(255,255,255,.10);
      border-radius:16px;
      background:rgba(23,27,33,.96);
      box-shadow:0 -10px 34px rgba(0,0,0,.38);
      backdrop-filter:blur(12px);
      -webkit-backdrop-filter:blur(12px);
    }

    .saved-workout-modal:not(.open) .saved-workout-modal-actions{
      display:none!important;
    }

    .saved-workout-modal-actions .btn{
      width:100%;
      min-width:0;
      min-height:46px;
      margin:0!important;
      white-space:nowrap;
    }

    @media(max-width:720px){
      .saved-workout-dialog{
        padding-bottom:118px!important;
      }

      .saved-workout-modal-actions{
        bottom:max(8px,env(safe-area-inset-bottom));
        width:calc(100vw - 28px);
        grid-template-columns:1fr 1.25fr;
        gap:7px!important;
        padding:8px;
        border-radius:14px;
      }

      .saved-workout-modal-actions .btn{
        min-height:48px;
        padding:9px 8px;
        font-size:.82rem;
      }
    }
  `;
  document.head.appendChild(style);
}
