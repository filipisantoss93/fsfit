import { loadRuntimeGroup, loadRuntimeSequence } from './page-module-loader.js';

const hasDashboard = document.querySelector('#today-list') || document.querySelector('#live-students-list');

if (hasDashboard) {
  loadRuntimeSequence([
    {
      id: 'painel-home-redesign',
      source: './painel-home-redesign.js?v=20260723-home-redesign1',
      errorMessage: 'Falha ao carregar nova tela inicial do painel:'
    },
    {
      id: 'painel-day-summary',
      source: './painel-day-summary.js?v=20260724-day-summary1',
      errorMessage: 'Falha ao carregar o resumo diário do painel:'
    }
  ]);

  loadRuntimeGroup([
    {
      id: 'painel-home-desktop-carousel',
      source: './painel-home-desktop-carousel.js?v=20260724-desktop-carousel1',
      errorMessage: 'Falha ao carregar as setas do carrossel de alunos:'
    },
    {
      id: 'painel-home-avatar',
      source: './painel-home-avatar.js?v=20260724-home-avatar1',
      errorMessage: 'Falha ao carregar a foto do aluno no card Agora:'
    },
    {
      id: 'painel-compact-enhancements',
      source: './painel-compact-enhancements.js?v=20260720-dashboard-compact2',
      errorMessage: 'Falha ao carregar melhorias compactas do painel:'
    },
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

  loadRuntimeSequence([
    {
      id: 'painel-agenda-modal',
      source: './painel-agenda-modal.js?v=20260723-agenda-dashboard2',
      errorMessage: 'Falha ao carregar dashboard da agenda de hoje:'
    },
    {
      id: 'painel-agenda-modal-hotfix',
      source: './painel-agenda-modal-hotfix.js?v=20260723-agenda-modal-hotfix4',
      errorMessage: 'Falha ao carregar correção do modal da agenda de hoje:'
    },
    {
      id: 'painel-agenda-modal-avatar',
      source: './painel-agenda-modal-avatar.js?v=20260723-agenda-avatar3',
      errorMessage: 'Falha ao carregar a foto do aluno no modal da agenda de hoje:'
    }
  ]);

  if (window.matchMedia('(min-width: 1100px)').matches) {
    loadRuntimeGroup([
      {
        id: 'painel-resumo-geral',
        source: './painel-resumo-geral.js?v=20260727-general1',
        errorMessage: 'Falha ao carregar o resumo geral do painel:'
      }
    ]);
  }
}
