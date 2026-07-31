const hasDashboard = document.querySelector('#today-list') || document.querySelector('#live-students-list');

if (hasDashboard) {
  import('./painel-home-redesign.js?v=20260723-home-redesign1')
    .then(() => import('./painel-day-summary.js?v=20260724-day-summary1').catch(error => {
      console.error('Falha ao carregar o resumo diário do painel:', error);
    }))
    .catch(error => {
      console.error('Falha ao carregar nova tela inicial do painel:', error);
    });

  const modules = [
    ['./painel-home-desktop-carousel.js?v=20260724-desktop-carousel1', 'Falha ao carregar as setas do carrossel de alunos:'],
    ['./painel-home-avatar.js?v=20260724-home-avatar1', 'Falha ao carregar a foto do aluno no card Agora:'],
    ['./painel-compact-enhancements.js?v=20260720-dashboard-compact2', 'Falha ao carregar melhorias compactas do painel:'],
    ['./aulas-painel-exercise-controls.js?v=20260720-live-exercise-controls1', 'Falha ao carregar controles de exercício em aula:'],
    ['./exercicio-drag-order.js?v=20260722-dnd2', 'Falha ao carregar reordenação de exercícios em aula:'],
    ['./painel-agenda-modal.js?v=20260723-agenda-dashboard2', 'Falha ao carregar dashboard da agenda de hoje:'],
    ['./painel-agenda-modal-hotfix.js?v=20260723-agenda-modal-hotfix4', 'Falha ao carregar correção do modal da agenda de hoje:'],
    ['./painel-agenda-modal-avatar.js?v=20260723-agenda-avatar3', 'Falha ao carregar a foto do aluno no modal da agenda de hoje:']
  ];

  modules.forEach(([path, message]) => import(path).catch(error => console.error(message, error)));

  import('./aulas-painel-quick-actions.js?v=20260724-live-actions1')
    .then(() => import('./aulas-painel-exercise-categories.js?v=20260724-exercise-categories1'))
    .catch(error => console.error('Falha ao carregar ações rápidas da aula:', error));

  import('./aulas-painel-delete-controls.js?v=20260724-live-delete1')
    .then(() => import('./aulas-painel-delete-layout-fix.js?v=20260724-live-delete-layout1'))
    .catch(error => console.error('Falha ao carregar exclusão de exercícios em aula:', error));

  if (window.matchMedia('(min-width: 1100px)').matches) {
    import('./painel-resumo-geral.js?v=20260727-general1')
      .catch(error => console.error('Falha ao carregar o resumo geral do painel:', error));
  }
}
