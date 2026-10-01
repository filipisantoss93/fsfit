export {};

const PAGE = window.location.pathname.split('/').pop() || 'index.html';
const STYLE_SELECTOR = 'link[data-student-record-hierarchy-styles]';
type HierarchyGlobal = typeof globalThis & { __FSFIT_STUDENT_RECORD_HIERARCHY__?: boolean };
const hierarchyGlobal = globalThis as HierarchyGlobal;

if (PAGE === 'ficha-aluno.html' && !hierarchyGlobal.__FSFIT_STUDENT_RECORD_HIERARCHY__) {
  hierarchyGlobal.__FSFIT_STUDENT_RECORD_HIERARCHY__ = true;

  const tabLabels: Record<string, string> = {
    overview: 'Geral',
    planning: 'Treino',
    evolution: 'Evolução',
    history: 'Histórico',
    access: 'Acesso'
  };

  function waitFor<T extends Element>(getter: () => T | null, timeout = 12000, interval = 100): Promise<T | null> {
    return new Promise(resolve => {
      const startedAt = Date.now();
      const check = () => {
        const value = getter();
        if (value || Date.now() - startedAt >= timeout) return resolve(value || null);
        window.setTimeout(check, interval);
      };
      check();
    });
  }

  function ensureStyles(): void {
    if (document.querySelector('link[data-fsfit-bundle]')) return;
    if (document.querySelector(STYLE_SELECTOR)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/ficha-aluno-hierarquia.css?v=20260725-hierarchy1';
    link.dataset.studentRecordHierarchyStyles = 'true';
    document.head.appendChild(link);
  }

  function applyTabLabels(): void {
    document.querySelectorAll<HTMLElement>('[data-record-tab]').forEach(tab => {
      const tabKey = tab.dataset.recordTab;
      const label = tabKey ? tabLabels[tabKey] : undefined;
      if (label && tab.textContent.trim() !== label) tab.textContent = label;
    });
  }

  function setupTabLabels(): void {
    applyTabLabels();
    const tabs = document.querySelector<HTMLElement>('.record-tabs');
    if (!tabs || tabs.dataset.hierarchyLabelsReady === 'true') return;
    tabs.dataset.hierarchyLabelsReady = 'true';
    const observer = new MutationObserver(applyTabLabels);
    observer.observe(tabs, { childList: true, subtree: true, characterData: true });
  }

  function firstStudentName(): string {
    const fullName = document.querySelector('#student-name')?.textContent?.trim() || '';
    if (!fullName || fullName === 'Ficha do aluno' || fullName === 'Carregando dados...') return '';
    return fullName.split(/\s+/)[0];
  }

  function refineStepCopy(step: HTMLElement): void {
    const title = step.querySelector<HTMLElement>('.student-workflow-step-copy strong');
    const detail = step.querySelector<HTMLElement>('.student-workflow-step-copy small');
    if (!title) return;

    const current = title.textContent.trim();
    const replacements: Record<string, string> = {
      'Agenda e horário': 'Agenda',
      'Plano de treino': 'Treino',
      'Exercícios aplicados': 'Completar treino',
      'Plano aplicado': 'Publicar treino',
      'Acesso do aluno': 'Acesso do aluno'
    };
    if (replacements[current]) title.textContent = replacements[current];

    if (current === 'Exercícios aplicados' && !step.classList.contains('is-done') && detail) {
      detail.textContent = 'Adicione os exercícios que o aluno realizará';
    }
    if (current === 'Plano aplicado' && !step.classList.contains('is-done') && detail) {
      detail.textContent = 'Revise e deixe o treino disponível para o aluno';
    }
  }

  function createSetupDetails(completedSteps: HTMLElement[], total: number): HTMLDetailsElement {
    const details = document.createElement('details');
    details.className = 'student-setup-details';
    details.innerHTML = `
      <summary>
        <span>Ver configuração do aluno</span>
        <small>${completedSteps.length} de ${total} concluídos</small>
      </summary>
      <div class="student-setup-details-body"></div>`;
    const body = details.querySelector<HTMLElement>('.student-setup-details-body');
    completedSteps.forEach(step => body?.appendChild(step));
    return details;
  }

  function enhanceWorkflowCard(card: HTMLElement | null): void {
    if (!card || card.dataset.priorityHierarchyReady === 'true') return;
    const heading = card.querySelector('.student-workflow-heading');
    const kicker = heading?.querySelector('small');
    const title = heading?.querySelector('h2');
    const progress = heading?.querySelector('.student-workflow-progress');
    const checklist = card.querySelector('.student-workflow-checklist');
    if (!heading || !title || !progress || !checklist) return;

    card.dataset.priorityHierarchyReady = 'true';
    card.classList.add('student-workflow-priority');
    if (kicker) kicker.textContent = 'GERAL';

    const allSteps = [...checklist.querySelectorAll<HTMLElement>('.student-workflow-step')];
    allSteps.forEach(refineStepCopy);
    const pendingSteps = allSteps.filter(step => !step.classList.contains('is-done'));
    const completedSteps = allSteps.filter(step => step.classList.contains('is-done'));
    const total = allSteps.length;

    if (pendingSteps.length) {
      title.textContent = 'Atenção agora';
      progress.textContent = `${pendingSteps.length} ${pendingSteps.length === 1 ? 'pendência' : 'pendências'}`;
      progress.classList.add('has-pending');
      checklist.classList.add('student-attention-list');
      checklist.replaceChildren(...pendingSteps);
    } else {
      const studentName = firstStudentName();
      title.textContent = studentName ? `Tudo certo com ${studentName}` : 'Tudo certo com o aluno';
      progress.textContent = 'Tudo certo';
      progress.classList.add('is-complete');
      checklist.classList.add('student-attention-list', 'is-complete');
      checklist.innerHTML = `
        <div class="student-all-set">
          <span aria-hidden="true">✓</span>
          <div><strong>Aluno pronto para acompanhamento</strong><small>Treino, agenda, mensalidade e acesso estão configurados.</small></div>
        </div>`;
    }

    if (completedSteps.length) card.appendChild(createSetupDetails(completedSteps, total));
  }

  async function setupWorkflowHierarchy(): Promise<void> {
    const card = await waitFor(() => document.querySelector<HTMLElement>('#student-workflow-card'));
    enhanceWorkflowCard(card);
  }

  function enhanceEvolutionHierarchy(): void {
    const panel = document.querySelector<HTMLElement>('[data-record-panel="evolution"]');
    if (!panel || panel.dataset.evolutionHierarchyReady === 'true') return;
    const entryGrid = panel.querySelector('.evolution-entry-grid');
    const historyCard = panel.querySelector('.weight-history-card');
    if (!entryGrid || !historyCard) return;

    panel.dataset.evolutionHierarchyReady = 'true';
    panel.classList.add('evolution-priority-panel');
    const historyTitle = historyCard.querySelector('.section-heading h2');
    if (historyTitle) historyTitle.textContent = 'Evolução de peso';
    panel.insertBefore(historyCard, entryGrid);

    const heading = document.createElement('div');
    heading.className = 'evolution-entry-heading';
    heading.innerHTML = '<small>ATUALIZAR</small><h2>Registrar nova medição</h2><p>Adicione peso ou uma avaliação física quando houver novos dados.</p>';
    panel.insertBefore(heading, entryGrid);
  }

  function boot(): void {
    ensureStyles();
    setupTabLabels();
    enhanceEvolutionHierarchy();
    void setupWorkflowHierarchy();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
