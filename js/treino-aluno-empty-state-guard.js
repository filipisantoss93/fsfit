const app = document.querySelector('#simple-workout-app');

if (app && !globalThis.__FSFIT_WORKOUT_EMPTY_STATE_GUARD__) {
  globalThis.__FSFIT_WORKOUT_EMPTY_STATE_GUARD__ = true;

  const emptyCopy = 'Adicione um treino salvo ou monte este dia com exercícios individuais.';
  let normalizing = false;

  function normalizeEmptyState() {
    if (normalizing) return;
    normalizing = true;

    try {
      const empty = app.querySelector('.simple-week-panel .simple-empty-state');
      if (!empty) return;

      // Esta proteção precisa executar dentro do próprio callback do observer.
      // Agendar com requestAnimationFrame permite que outro MutationObserver altere
      // repetidamente o mesmo span antes do próximo frame, congelando o navegador.
      const legacyCopy = empty.querySelector(':scope > span');
      if (legacyCopy) {
        const copy = document.createElement('p');
        copy.className = 'simple-empty-state-copy';
        copy.textContent = emptyCopy;
        legacyCopy.replaceWith(copy);
      }

      const duplicateAction = empty.querySelector('[data-open-apply-modal]');
      if (duplicateAction) duplicateAction.remove();
    } finally {
      normalizing = false;
    }
  }

  const style = document.createElement('style');
  style.dataset.workoutEmptyStateGuard = 'true';
  style.textContent = '.simple-empty-state-copy{margin:0;color:var(--muted);font-size:.74rem;line-height:1.4;text-align:center}';
  document.head.appendChild(style);

  normalizeEmptyState();

  // Registrado antes do módulo de exercícios avulsos. Quando a rotina é renderizada
  // novamente, o span problemático é substituído antes que o observer posterior o
  // encontre, impedindo a realimentação infinita de mutações.
  const observer = new MutationObserver(normalizeEmptyState);
  observer.observe(app, { childList: true, subtree: true });
}
