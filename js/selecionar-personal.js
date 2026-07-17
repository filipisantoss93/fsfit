const list = document.querySelector('#personal-picker-list');
const message = document.querySelector('#personal-picker-message');
const backButton = document.querySelector('#personal-picker-back');

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function readPersonals() {
  try {
    const value = JSON.parse(sessionStorage.getItem('fsfit_student_personals_pending') || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function show(text) {
  if (!message) return;
  message.textContent = text;
  message.className = 'message show error';
}

function clearPending() {
  sessionStorage.removeItem('fsfit_student_phone_pending');
  sessionStorage.removeItem('fsfit_student_phone_prefill');
  sessionStorage.removeItem('fsfit_student_personals_pending');
}

function choosePersonal(personal) {
  const slug = String(personal?.slug || '').trim().toLowerCase();
  if (!slug) return show('Não foi possível selecionar este acompanhamento.');
  localStorage.setItem('fsfit_personal_slug', slug);
  window.location.replace(`acesso-aluno.html?u=${encodeURIComponent(slug)}&selected=1`);
}

const phone = String(sessionStorage.getItem('fsfit_student_phone_pending') || '').trim();
const personals = readPersonals();

if (!phone || !personals.length) {
  window.location.replace('acesso-aluno.html');
} else if (personals.length === 1) {
  choosePersonal(personals[0]);
} else {
  list.innerHTML = personals.map((personal, index) => {
    const name = personal?.nome || 'Personal trainer';
    const location = [personal?.local_trabalho, personal?.cidade].filter(Boolean).join(' · ');
    const avatar = personal?.foto_url
      ? `<img class="personal-picker-avatar" src="${esc(personal.foto_url)}" alt="Foto de ${esc(name)}">`
      : `<div class="personal-picker-avatar personal-picker-placeholder">${esc(name.charAt(0).toUpperCase())}</div>`;

    return `<article class="personal-picker-card">
      ${avatar}
      <div class="personal-picker-content">
        <h2>${esc(name)}</h2>
        ${location ? `<p class="personal-picker-location">${esc(location)}</p>` : ''}
        <p class="personal-picker-description">${esc(personal?.descricao || 'Acompanhamento de treino disponível para você no FS Fit.')}</p>
        <button class="btn btn-primary" type="button" data-personal-index="${index}">Acessar treinos deste personal</button>
      </div>
    </article>`;
  }).join('');

  list.querySelectorAll('[data-personal-index]').forEach(button => {
    button.addEventListener('click', () => choosePersonal(personals[Number(button.dataset.personalIndex)]));
  });
}

backButton?.addEventListener('click', () => {
  clearPending();
  localStorage.removeItem('fsfit_personal_slug');
  window.location.replace('acesso-aluno.html');
});