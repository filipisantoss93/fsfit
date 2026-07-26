import { supabase } from './supabase.js';

const alunoId = new URLSearchParams(window.location.search).get('id');
const loading = document.querySelector('#simple-workout-loading');
const title = document.querySelector('#student-name');

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

async function resolveStudentTitle() {
  if (!alunoId || !title) return;

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.user?.id) return;

  const { data, error } = await supabase
    .from('alunos')
    .select('nome')
    .eq('id', alunoId)
    .eq('personal_id', session.user.id)
    .maybeSingle();

  if (!error && data?.nome) title.textContent = `Treino · ${data.nome}`;
}

try {
  document.body.classList.add('workout-simple-enabled');

  const titlePromise = resolveStudentTitle().catch(error => {
    console.warn('Não foi possível antecipar o nome do aluno:', error);
  });

  // A proteção do estado vazio é registrada antes do módulo que adiciona as
  // ações avulsas. Assim, remover o último treino de um dia não cria um ciclo
  // infinito de MutationObserver nem bloqueia a interface.
  await import('./treino-aluno-simplificado.js?v=20260725-simple1');
  await import('./treino-aluno-empty-state-guard.js?v=20260725-empty-guard1');
  await import('./treino-aluno-exercicios-avulsos.js?v=20260725-day-exercises2');
  await titlePromise;

  revealSimplifiedPage();
} catch (error) {
  console.error('Falha ao inicializar a página simplificada de treinos:', error);
  restoreLegacyFallback('Não foi possível carregar a experiência simplificada. A versão anterior foi restaurada.');
}
