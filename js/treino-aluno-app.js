const loading = document.querySelector('#simple-workout-loading');

const legacySelectors = [
  '.workout-plans-card',
  '#active-workout-workspace',
  '.workout-active-card',
  '#workout-editor-view-nav',
  '#workout-week-card'
];

function hideLegacyInterface() {
  legacySelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(element => {
      if (element.id === 'simple-workout-app' || element.closest('#simple-workout-app')) return;
      element.hidden = true;
      element.setAttribute('aria-hidden', 'true');
      element.style.setProperty('display', 'none', 'important');
    });
  });
}

function revealSimplifiedPage() {
  hideLegacyInterface();
  loading?.remove();
  document.documentElement.classList.remove('workout-simple-preload');
  document.body.classList.add('workout-simple-enabled');
  document.body.classList.add('workout-simple-ready');
}

function restoreLegacyFallback(message) {
  loading?.remove();
  document.documentElement.classList.remove('workout-simple-preload');
  document.body.classList.remove('workout-simple-enabled');
  document.body.classList.add('workout-simple-fallback');
  const box = document.querySelector('#workout-message');
  if (box) {
    box.textContent = message;
    box.className = 'message show error';
  }
}

try {
  document.body.classList.add('workout-simple-enabled');
  hideLegacyInterface();

  const legacyObserver = new MutationObserver(hideLegacyInterface);
  legacyObserver.observe(document.body, { childList: true, subtree: true });

  // A página simplificada possui o fluxo completo de semana, treinos salvos,
  // exercícios e aplicação. O módulo provisório `treino-modelo-livre` não deve
  // ser carregado junto, pois ele reativa a interface antiga e duplica a
  // navegação e os estados vazios.
  await import('./treino-aluno-simplificado.js?v=20260726-simple2');
  await import('./treino-aluno-empty-state-guard.js?v=20260725-empty-guard2');
  await import('./treino-aluno-exercicios-avulsos.js?v=20260725-day-exercises2');

  revealSimplifiedPage();
} catch (error) {
  console.error('Falha ao inicializar a página simplificada de treinos:', error);
  restoreLegacyFallback('Não foi possível carregar a experiência simplificada. A versão anterior foi restaurada.');
}