const content = document.querySelector('#student-content');
const studentName = document.querySelector('#student-name');
const trainerName = document.querySelector('#trainer-name');
const workoutContent = document.querySelector('#workout-content');
const dietContent = document.querySelector('#diet-content');
const observations = document.querySelector('#student-observations');
const homeTitle = document.querySelector('#student-home-title');
const homeDate = document.querySelector('#student-home-date');
const homeSubtitle = document.querySelector('#student-home-subtitle');
const workoutStatus = document.querySelector('#student-home-workout-status');
const workoutDetail = document.querySelector('#student-home-workout-detail');
const dietStatus = document.querySelector('#student-home-diet-status');
const dietDetail = document.querySelector('#student-home-diet-detail');
const homeObservation = document.querySelector('#student-home-observation');
const homeObservationText = document.querySelector('#student-home-observation-text');
const homeWhatsapp = document.querySelector('#student-home-whatsapp');
const settingsWhatsapp = document.querySelector('#whatsapp-button');
const primaryWorkoutButton = document.querySelector('#student-home-open-workout');

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function firstName(value = '') {
  return String(value).trim().split(/\s+/)[0] || 'Aluno';
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function formattedToday() {
  const text = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function activateTab(target) {
  const tab = document.querySelector(`[data-student-tab="${target}"]`);
  if (!tab) return;
  tab.click();
  requestAnimationFrame(() => {
    document.querySelector('.student-plan-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function agendaSummary(host, singular, plural, emptyText) {
  const rows = host?.querySelectorAll('.student-compact-row').length || 0;
  const headerText = host?.querySelector('.student-agenda-day-header span')?.textContent?.trim() || '';
  if (!rows) return { title: emptyText, detail: headerText || 'Nada programado para hoje', rows: 0 };
  return {
    title: `${rows} ${rows === 1 ? singular : plural}`,
    detail: headerText || 'Programado para hoje',
    rows,
  };
}

function syncWhatsapp() {
  if (!homeWhatsapp || !settingsWhatsapp) return;
  const href = settingsWhatsapp.getAttribute('href') || '';
  if (href) {
    homeWhatsapp.setAttribute('href', href);
    homeWhatsapp.classList.add('visible');
  } else {
    homeWhatsapp.removeAttribute('href');
    homeWhatsapp.classList.remove('visible');
  }
}

function syncHome() {
  if (!content || content.classList.contains('hidden')) return;

  const name = studentName?.textContent?.trim() || 'Aluno';
  const trainer = trainerName?.textContent?.trim() || 'seu personal';
  setText(homeTitle, `${greeting()}, ${firstName(name)}`);
  setText(homeDate, formattedToday());
  setText(homeSubtitle, `Veja o que ${trainer} preparou para você hoje.`);

  const workout = agendaSummary(workoutContent, 'exercício', 'exercícios', 'Dia de descanso');
  setText(workoutStatus, workout.title);
  setText(workoutDetail, workout.rows ? 'Abrir treino de hoje' : 'Consulte os próximos dias');
  if (primaryWorkoutButton) {
    primaryWorkoutButton.textContent = workout.rows ? 'Abrir treino de hoje' : 'Ver agenda de treinos';
  }

  const diet = agendaSummary(dietContent, 'refeição', 'refeições', 'Sem refeições hoje');
  setText(dietStatus, diet.title);
  setText(dietDetail, diet.rows ? 'Ver alimentação de hoje' : 'Consulte o plano alimentar');

  const observationText = observations?.textContent?.trim() || '';
  if (homeObservation && homeObservationText) {
    const hasObservation = observationText && observationText !== 'Nenhuma observação publicada ainda.';
    homeObservation.classList.toggle('hidden', !hasObservation);
    if (hasObservation) setText(homeObservationText, observationText);
  }

  syncWhatsapp();
}

document.querySelectorAll('[data-student-home-target]').forEach(button => {
  button.addEventListener('click', () => activateTab(button.dataset.studentHomeTarget));
});

primaryWorkoutButton?.addEventListener('click', () => activateTab('treino'));

const observer = new MutationObserver(syncHome);
if (content) observer.observe(content, { subtree: true, childList: true, attributes: true, characterData: true });
if (settingsWhatsapp) observer.observe(settingsWhatsapp, { attributes: true, attributeFilter: ['href', 'class'] });

window.addEventListener('load', syncHome);
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncHome(); });
setTimeout(syncHome, 250);
setTimeout(syncHome, 900);
