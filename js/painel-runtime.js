import { loadRuntimeGroup } from './page-module-loader.js';

const hasDashboard = document.querySelector('#today-list') || document.querySelector('#live-students-list');

if (hasDashboard) {
  loadRuntimeGroup([
    {
      id: 'painel-home-runtime',
      source: './painel-home-runtime.js?v=20260730-runtime1',
      errorMessage: 'Falha ao carregar runtime inicial do painel:'
    },
    {
      id: 'painel-aula-runtime',
      source: './painel-aula-runtime.js?v=20260730-runtime1',
      errorMessage: 'Falha ao carregar runtime de aulas do painel:'
    },
    {
      id: 'painel-agenda-runtime',
      source: './painel-agenda-runtime.js?v=20260730-runtime1',
      errorMessage: 'Falha ao carregar runtime da agenda do painel:'
    }
  ]);
}
