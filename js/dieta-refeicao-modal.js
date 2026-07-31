const modal = document.querySelector('#meal-form-modal');
const title = document.querySelector('#meal-form-modal-title');
const form = document.querySelector('#meal-form');
const openButton = document.querySelector('#new-meal-button');

if (modal && title && form) {
  const openModal = (editing = false) => {
    title.textContent = editing ? 'Editar refeição' : 'Nova refeição';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('diet-modal-open');
    setTimeout(() => form.querySelector('input[name="nome"]')?.focus(), 0);
  };

  const closeModal = () => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.diet-modal.open')) document.body.classList.remove('diet-modal-open');
  };

  openButton?.addEventListener('click', () => {
    form.reset();
    if (form.ordem) form.ordem.value = '1';
    form.querySelectorAll('#meal-days input').forEach(input => { input.checked = false; });
    form.querySelector('[type="submit"]')?.replaceChildren(document.createTextNode('Adicionar refeição'));
    openModal(false);
  });

  document.addEventListener('click', event => {
    if (event.target.closest('[data-close-meal-form-modal]')) closeModal();
    if (event.target.closest('#meal-modal-edit')) setTimeout(() => openModal(true), 0);
  });

  form.addEventListener('submit', () => {
    setTimeout(() => {
      if (!document.querySelector('#diet-message.message.error.show')) closeModal();
    }, 500);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal.classList.contains('open')) closeModal();
  });
}
