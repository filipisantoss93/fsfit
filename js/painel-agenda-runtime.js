import { loadRuntimeSequence } from './page-module-loader.js';

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
