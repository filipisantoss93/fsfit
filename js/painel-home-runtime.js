import { loadRuntimeGroup, loadRuntimeSequence } from './page-module-loader.js';

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
