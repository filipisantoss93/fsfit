const planningActions = document.querySelector('.planning-actions');

if (planningActions && !globalThis.__FSFIT_STUDENT_PLAN_UX__) {
  globalThis.__FSFIT_STUDENT_PLAN_UX__ = true;

  const styleId = 'fsfit-student-plan-ux-styles';
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

  function injectStyles() {
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .student-plan-card{
        padding:20px;
        border-color:rgba(255,255,255,.1);
        background:linear-gradient(155deg,rgba(26,31,38,.98),rgba(18,22,28,.98));
        box-shadow:0 14px 38px rgba(0,0,0,.22);
      }
      .student-plan-card .section-heading{
        margin-bottom:7px;
      }
      .student-plan-card .section-heading small{
        color:var(--primary);
        letter-spacing:.11em;
      }
      .student-plan-card .section-heading h2{
        font-size:1.42rem;
        letter-spacing:-.035em;
      }
      .student-plan-intro{
        margin:0 0 17px!important;
        color:var(--muted)!important;
        font-size:.84rem!important;
        line-height:1.45!important;
      }
      .planning-actions.student-plan-list{
        display:grid!important;
        grid-template-columns:1fr!important;
        gap:0!important;
        overflow:hidden;
        border:1px solid rgba(255,255,255,.09);
        border-radius:16px;
        background:rgba(255,255,255,.018);
      }
      .student-plan-option{
        display:grid;
        grid-template-columns:40px minmax(0,1fr) 22px;
        align-items:center;
        gap:13px;
        width:100%;
        min-height:74px;
        padding:13px 15px;
        border:0;
        border-bottom:1px solid rgba(255,255,255,.075);
        border-radius:0;
        background:transparent;
        color:var(--text);
        text-align:left;
        text-decoration:none;
        transition:background .18s ease,transform .18s ease;
        -webkit-tap-highlight-color:transparent;
      }
      .student-plan-option:last-child{
        border-bottom:0;
      }
      .student-plan-option:hover{
        background:rgba(255,255,255,.04);
      }
      .student-plan-option:active{
        background:rgba(50,215,75,.07);
        transform:scale(.995);
      }
      .student-plan-option:focus-visible{
        position:relative;
        z-index:1;
        outline:3px solid rgba(50,215,75,.2);
        outline-offset:-3px;
      }
      .student-plan-option-icon{
        display:grid;
        place-items:center;
        width:40px;
        height:40px;
        border:1px solid rgba(50,215,75,.18);
        border-radius:12px;
        background:rgba(50,215,75,.09);
        color:var(--primary);
      }
      .student-plan-option-icon svg{
        width:21px;
        height:21px;
      }
      .student-plan-option-copy{
        display:grid;
        gap:3px;
        min-width:0;
      }
      .student-plan-option-copy strong{
        display:block;
        color:var(--text);
        font-size:.94rem;
        font-weight:850;
        line-height:1.2;
        letter-spacing:-.01em;
      }
      .student-plan-option-copy small{
        display:block;
        overflow:hidden;
        color:var(--muted);
        font-size:.75rem;
        font-weight:600;
        line-height:1.35;
        text-overflow:ellipsis;
      }
      .student-plan-option-arrow{
        color:rgba(181,189,200,.72);
        font-size:1.5rem;
        font-weight:400;
        line-height:1;
        text-align:right;
        transition:transform .18s ease,color .18s ease;
      }
      .student-plan-option:hover .student-plan-option-arrow{
        color:var(--primary);
        transform:translateX(2px);
      }
      #apply-saved-workout{
        display:none!important;
      }
      @media(max-width:620px){
        .student-plan-card{
          padding:17px;
        }
        .student-plan-card .section-heading h2{
          font-size:1.3rem;
        }
        .student-plan-intro{
          margin-bottom:14px!important;
          font-size:.79rem!important;
        }
        .student-plan-option{
          grid-template-columns:38px minmax(0,1fr) 20px;
          gap:11px;
          min-height:70px;
          padding:12px 13px;
        }
        .student-plan-option-icon{
          width:38px;
          height:38px;
          border-radius:11px;
        }
        .student-plan-option-copy strong{
          font-size:.91rem;
        }
        .student-plan-option-copy small{
          font-size:.71rem;
        }
      }
    `;
    document.head.appendChild(style);
  }

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

  injectStyles();
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
