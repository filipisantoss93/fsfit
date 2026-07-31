import { loadRuntimeGroup, loadRuntimeSequence } from './page-module-loader.js';

loadRuntimeGroup([
  {
    id: 'aulas-painel-exercise-controls',
    source: './aulas-painel-exercise-controls.js?v=20260720-live-exercise-controls1',
    errorMessage: 'Falha ao carregar controles de exercício em aula:'
  },
  {
    id: 'exercicio-drag-order',
    source: './exercicio-drag-order.js?v=20260722-dnd2',
    errorMessage: 'Falha ao carregar reordenação de exercícios em aula:'
  }
]);

loadRuntimeSequence([
  {
    id: 'aulas-painel-quick-actions',
    source: './aulas-painel-quick-actions.js?v=20260724-live-actions1',
    errorMessage: 'Falha ao carregar ações rápidas da aula:'
  },
  {
    id: 'aulas-painel-exercise-categories',
    source: './aulas-painel-exercise-categories.js?v=20260724-exercise-categories1',
    errorMessage: 'Falha ao carregar categorias de exercícios em aula:'
  }
]);

loadRuntimeSequence([
  {
    id: 'aulas-painel-delete-controls',
    source: './aulas-painel-delete-controls.js?v=20260724-live-delete1',
    errorMessage: 'Falha ao carregar exclusão de exercícios em aula:'
  },
  {
    id: 'aulas-painel-delete-layout-fix',
    source: './aulas-painel-delete-layout-fix.js?v=20260724-live-delete-layout1',
    errorMessage: 'Falha ao carregar layout da exclusão de exercícios em aula:'
  }
]);
