const workoutDays = document.querySelector('#workout-days');

const dayNames = {
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
  7: 'Domingo'
};

const dayShortNames = {
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
  7: 'Dom'
};

function currentWeekDay() {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

let selectedDay = currentWeekDay();
let observer = null;

function getSectionDay(section) {
  const label = section.querySelector('.workout-day-header small')?.textContent || '';
  const match = label.match(/DIA\s+(\d)/i);
  return match ? Number(match[1]) : Number(section.dataset.weekday || 0);
}

function createDaySelector() {
  const nav = document.createElement('div');
  nav.className = 'workout-weekday-nav';
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Dias da semana');
  nav.innerHTML = Object.keys(dayNames).map(day => {
    const number = Number(day);
    return `<button class="workout-weekday-button" type="button" role="tab" data-workout-weekday="${number}" aria-selected="false">${dayShortNames[number]}</button>`;
  }).join('');
  return nav;
}

function createEmptyDay(day) {
  const section = document.createElement('section');
  section.className = 'workout-day-section workout-day-placeholder';
  section.dataset.weekdayPlaceholder = String(day);
  section.dataset.weekday = String(day);
  section.innerHTML = `
    <div class="workout-day-header">
      <div><small>${day === currentWeekDay() ? 'HOJE' : `DIA ${day}`}</small><strong>${dayNames[day]}</strong></div>
      <span>Descanso</span>
    </div>
    <p class="empty workout-day-empty-message">Nenhum exercício programado para este dia.</p>`;
  return section;
}

function applySelectedDay(day) {
  selectedDay = Number(day) || currentWeekDay();

  workoutDays.querySelectorAll('.workout-weekday-button').forEach(button => {
    const active = Number(button.dataset.workoutWeekday) === selectedDay;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });

  workoutDays.querySelectorAll('.workout-day-placeholder').forEach(item => item.remove());

  let hasSelectedSection = false;
  workoutDays.querySelectorAll(':scope > .workout-day-section').forEach(section => {
    const sectionDay = getSectionDay(section);
    const active = sectionDay === selectedDay;
    section.classList.toggle('workout-day-selected', active);
    section.hidden = !active;
    if (active) {
      hasSelectedSection = true;
      const small = section.querySelector('.workout-day-header small');
      if (small) small.textContent = selectedDay === currentWeekDay() ? 'HOJE' : `DIA ${selectedDay}`;
    }
  });

  if (!hasSelectedSection) {
    workoutDays.appendChild(createEmptyDay(selectedDay));
  }
}

function enhanceWeeklyView() {
  if (!workoutDays) return;

  const realSections = [...workoutDays.querySelectorAll(':scope > .workout-day-section')]
    .filter(section => !section.classList.contains('workout-day-placeholder'));

  if (!realSections.length) return;

  if (!workoutDays.querySelector('.workout-weekday-nav')) {
    workoutDays.prepend(createDaySelector());
  }

  applySelectedDay(selectedDay);
}

if (workoutDays) {
  workoutDays.addEventListener('click', event => {
    const button = event.target.closest('[data-workout-weekday]');
    if (!button) return;
    applySelectedDay(Number(button.dataset.workoutWeekday));
  });

  observer = new MutationObserver(() => {
    if (workoutDays.querySelector('.workout-weekday-nav')) return;
    queueMicrotask(enhanceWeeklyView);
  });

  observer.observe(workoutDays, { childList: true });
  enhanceWeeklyView();
}
