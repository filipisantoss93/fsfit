const LOADER_STATE_KEY = '__FSFIT_PAGE_MODULE_LOADER_STATE__';

type RuntimeModule = { id: string; pages: '*' | string[]; source: string; errorMessage: string };
type LoaderState = { loaded: Set<string>; pending: Map<string, Promise<boolean>> };
type GlobalWithLoader = typeof globalThis & { __FSFIT_PAGE_MODULE_LOADER_STATE__?: LoaderState };

const MODULES: RuntimeModule[] = [
  { id: 'student-workflow-enhancements', pages: ['treino-aluno.html', 'ficha-aluno.html', 'financeiro.html', 'agenda.html'], source: './student-workflow-improvements.js?v=20260725-student-workflow1', errorMessage: 'Melhorias integradas do aluno indisponíveis:' },
  { id: 'student-record-hierarchy', pages: ['ficha-aluno.html'], source: './ficha-aluno-hierarquia.js?v=20261001-ts4', errorMessage: 'Hierarquia otimizada da ficha do aluno indisponível:' },
  { id: 'day-workout-customizer', pages: ['treino-aluno.html'], source: './treino-dia-personalizacao.js?v=20260725-day-custom1', errorMessage: 'Personalização do treino aplicado indisponível:' },
  { id: 'exercise-category-filter', pages: ['treino-aluno.html'], source: './treino-exercicio-categorias.js?v=20261001-ts5', errorMessage: 'Categorias do seletor de exercícios indisponíveis:' },
  { id: 'student-session-controls', pages: ['aluno.html'], source: './aluno-sessao-controles.js?v=20261001-ts7', errorMessage: 'Controles de sessão do aluno indisponíveis:' },
  { id: 'exercise-svg-pages', pages: ['biblioteca-exercicios.html', 'aluno.html', 'visualizar-aluno.html'], source: './exercise-svg-pages.js?v=20260801-pages4', errorMessage: 'Ilustrações dos exercícios indisponíveis:' }
];

function currentPage() {
  return window.location.pathname.split('/').pop() || 'index.html';
}

function getState() {
  const scope = globalThis as GlobalWithLoader;
  if (!scope[LOADER_STATE_KEY]) {
    scope[LOADER_STATE_KEY] = { loaded: new Set<string>(), pending: new Map<string, Promise<boolean>>() };
  }
  return scope[LOADER_STATE_KEY] as LoaderState;
}

function matchesPage(module: RuntimeModule, page: string) {
  return module.pages === '*' || module.pages.includes(page);
}

export function loadRuntimeModule(module: RuntimeModule) {
  const state = getState();
  if (!module?.id || !module?.source) return Promise.resolve(false);
  if (state.loaded.has(module.id)) return Promise.resolve(true);
  if (state.pending.has(module.id)) return state.pending.get(module.id);

  const pending = import(module.source)
    .then(() => {
      state.loaded.add(module.id);
      return true;
    })
    .catch(error => {
      console.warn(module.errorMessage || `Falha ao carregar ${module.id}:`, error);
      return false;
    })
    .finally(() => state.pending.delete(module.id));

  state.pending.set(module.id, pending);
  return pending;
}

export function loadRuntimeGroup(modules: RuntimeModule[] = []) {
  return Promise.all(modules.map(loadRuntimeModule));
}

export async function loadRuntimeSequence(modules: RuntimeModule[] = []) {
  for (const module of modules) {
    const loaded = await loadRuntimeModule(module);
    if (!loaded) return false;
  }
  return true;
}

export function loadPageModules(page: string = currentPage()) {
  const modules = MODULES.filter(module => matchesPage(module, page));
  queueMicrotask(() => loadRuntimeGroup(modules));
}
