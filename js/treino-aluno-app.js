const loading = document.querySelector('#simple-workout-loading');

function revealSimplifiedPage() {
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

  // O nome do aluno já é carregado pelo fluxo principal da página. Evitamos
  // uma segunda consulta direta à tabela `alunos`, que pode ser bloqueada por
  // RLS e exibir uma mensagem técnica desnecessária ao usuário.
  await import('./treino-aluno-simplificado.js?v=20260725-simple1');
  await import('./treino-aluno-empty-state-guard.js?v=20260725-empty-guard2');
  await import('./treino-aluno-exercicios-avulsos.js?v=20260725-day-exercises2');
  await import('./treino-modelo-livre.js?v=20260726-modelo-livre1');

  revealSimplifiedPage();
} catch (error) {
  console.error('Falha ao inicializar a página simplificada de treinos:', error);
  restoreLegacyFallback('Não foi possível carregar a experiência simplificada. A versão anterior foi restaurada.');
}
