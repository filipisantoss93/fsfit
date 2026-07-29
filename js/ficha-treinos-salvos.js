const planningActions = document.querySelector('.planning-actions');

if (planningActions && !globalThis.__FSFIT_STUDENT_PLAN_UX__) {
  globalThis.__FSFIT_STUDENT_PLAN_UX__ = true;

  const planCard = planningActions.closest('.record-section-card');
  const heading = planCard?.querySelector('.section-heading');
  const headingKicker = heading?.querySelector('small');
  const headingTitle = heading?.querySelector('h2');
  const studentName = document.querySelector('#student-name');

  const icons = {
    workout: `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 9v6M18 9v6M3.5 10.5v3M20.5 10.5v3M6 12h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>`,
    food: `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 3v7M4.5 3v4.5A2.5 2.5 0 0 0 7 10v11M9.5 3v4.5A2.5 2.5 0 0 1 7 10M16 3v18M16 3c2.2 1.3 3.5 3.4 3.5 5.7 0 2.1-1.1 3.8-3.5 4.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    reminder: `
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8ZM9.5 21h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`
  };

  const options = [
    {
      id: 'workout-editor-link',
      title: 'Treino',
      description: 'Monte a rotina semanal e organize os exercícios',
      icon: icons.workout
    },
    {
      id: 'diet-editor-link',
      title: 'Alimentação',
      description: 'Organize refeições, horários e orientações',
      icon: icons.food
    },
    {
      id: 'reminders-link',
      title: 'Lembretes',
      description: 'Programe alertas importantes para o aluno',
      icon: icons.reminder
    }
  ];

  function updateTitle() {
    if (!headingTitle) return;
    const fullName = studentName?.textContent?.trim() || '';
    const isReady = fullName && fullName !== 'Ficha do aluno' && fullName !== 'Carregando dados...';
    const firstName = isReady ? fullName.split(/\s+/)[0] : '';
    headingTitle.textContent = firstName ? `Plano de ${firstName}` : 'Plano do aluno';
  }

  function enhanceOption(option) {
    const link = document.getElementById(option.id);
    if (!link) return;
    link.className = 'student-plan-option';
    link.setAttribute('aria-label', `${option.title}: ${option.description}`);
    link.innerHTML = `
      <span class="student-plan-option-icon">${option.icon}</span>
      <span class="student-plan-option-copy">
        <strong>${option.title}</strong>
        <small>${option.description}</small>
      </span>
      <span class="student-plan-option-arrow" aria-hidden="true">›</span>`;
  }

  document.getElementById('apply-saved-workout')?.remove();
  planCard?.classList.add('student-plan-card');
  planningActions.classList.add('student-plan-list');

  if (headingKicker) headingKicker.textContent = 'PLANO';
  updateTitle();

  if (heading && !planCard?.querySelector('.student-plan-intro')) {
    const intro = document.createElement('p');
    intro.className = 'student-plan-intro';
    intro.textContent = 'Organize a rotina e o acompanhamento em um só lugar.';
    heading.insertAdjacentElement('afterend', intro);
  }

  options.forEach(enhanceOption);

  if (studentName) {
    const observer = new MutationObserver(updateTitle);
    observer.observe(studentName, { childList: true, subtree: true, characterData: true });
  }
}
