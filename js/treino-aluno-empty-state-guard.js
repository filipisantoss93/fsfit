const app = document.querySelector('#simple-workout-app');

if (app && !globalThis.__FSFIT_WORKOUT_EMPTY_STATE_GUARD__) {
  globalThis.__FSFIT_WORKOUT_EMPTY_STATE_GUARD__ = true;

  const emptyCopy = 'Adicione um treino salvo ou monte este dia com exercícios individuais.';
  let scheduled = false;

  function normalizeEmptyState() {
    scheduled = false;
    const empty = app.querySelector('.simple-week-panel .simple-empty-state');
    if (!empty) return;

    // O módulo de exercícios avulsos antigo alterava textContent em toda mutação.
    // Em um dia vazio isso realimentava o MutationObserver indefinidamente e
    // congelava a página após remover o último treino daquele dia.
    const legacyCopy = empty.querySelector(':scope > span');
    if (legacyCopy) {
      const copy = document.createElement('p');
      copy.className = 'simple-empty-state-copy';
      copy.textContent = emptyCopy;
      legacyCopy.replaceWith(copy);
    }

    const duplicateAction = empty.querySelector('[data-open-apply-modal]');
    if (duplicateAction) duplicateAction.remove();
  }

  function scheduleNormalization() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(normalizeEmptyState);
  }

  const style = document.createElement('style');
  style.dataset.workoutEmptyStateGuard = 'true';
  style.textContent = '.simple-empty-state-copy{margin:0;color:var(--muted);font-size:.74rem;line-height:1.4;text-align:center}';
  document.head.appendChild(style);

  normalizeEmptyState();
  const observer = new MutationObserver(scheduleNormalization);
  observer.observe(app, { childList: true, subtree: true });
}
