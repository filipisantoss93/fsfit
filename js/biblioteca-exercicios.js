import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('exercicios');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const form = document.querySelector('#exercise-library-form');
const message = document.querySelector('#library-message');
const list = document.querySelector('#exercise-library-list');
const search = document.querySelector('#exercise-search');
const formTitle = document.querySelector('#library-form-title');
const submitButton = document.querySelector('#library-submit');
const cancelButton = document.querySelector('#cancel-library-edit');
const modal = document.querySelector('#library-modal');
const openModalButton = document.querySelector('#open-library-modal');
let editingId = null;
let exercises = [];

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function resetForm() {
  editingId = null;
  form.reset();
  formTitle.textContent = 'Novo exercício';
  submitButton.textContent = 'Adicionar exercício';
}

function openModal() {
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('library-modal-open');
  setTimeout(() => form.nome.focus(), 0);
}

function closeModal() {
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('library-modal-open');
  resetForm();
}

function renderExercises() {
  const term = search.value.trim().toLowerCase();
  const filtered = exercises.filter(item => [item.nome, item.grupo_muscular, item.equipamento]
    .filter(Boolean)
    .some(value => String(value).toLowerCase().includes(term)));

  if (!filtered.length) {
    list.innerHTML = '<p class="empty">Nenhum exercício encontrado.</p>';
    return;
  }

  list.innerHTML = filtered.map(item => {
    const isGlobal = Boolean(item.global);
    return `<article class="exercise-library-item">
      <div class="exercise-library-item-content">
        <div class="exercise-library-item-title">
          <h3>${esc(item.nome)}</h3>
          ${isGlobal ? '<span class="library-badge">PADRÃO FS FIT</span>' : '<span class="library-badge personal">MEU EXERCÍCIO</span>'}
        </div>
        <p>${esc([item.grupo_muscular, item.equipamento].filter(Boolean).join(' • ') || 'Sem classificação')}</p>
        ${item.instrucoes ? `<p class="library-instructions">${esc(item.instrucoes)}</p>` : ''}
        ${item.video_url ? `<a class="record-secondary-link" href="${esc(item.video_url)}" target="_blank" rel="noopener">Abrir vídeo →</a>` : ''}
      </div>
      ${isGlobal ? '' : `<div class="actions library-item-actions">
        <button class="btn btn-outline" type="button" data-edit-exercise="${item.id}">Editar</button>
        <button class="btn btn-danger" type="button" data-delete-exercise="${item.id}" data-name="${esc(item.nome)}">Excluir</button>
      </div>`}
    </article>`;
  }).join('');
}

async function loadExercises() {
  const { data, error } = await supabase
    .from('exercicios')
    .select('id,nome,grupo_muscular,equipamento,instrucoes,video_url,global,personal_id')
    .or(`global.eq.true,personal_id.eq.${session.user.id}`)
    .order('global', { ascending: false })
    .order('nome');

  if (error) {
    showMessage(message, 'Não foi possível carregar a biblioteca.', 'error');
    throw error;
  }

  exercises = data || [];
  renderExercises();
}

function editExercise(id) {
  const item = exercises.find(exercise => exercise.id === id && !exercise.global && exercise.personal_id === session.user.id);
  if (!item) return;

  editingId = id;
  form.nome.value = item.nome || '';
  form.grupo_muscular.value = item.grupo_muscular || '';
  form.equipamento.value = item.equipamento || '';
  form.instrucoes.value = item.instrucoes || '';
  form.video_url.value = item.video_url || '';
  formTitle.textContent = `Editar ${item.nome}`;
  submitButton.textContent = 'Salvar alterações';
  openModal();
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const payload = {
    personal_id: session.user.id,
    nome: form.nome.value.trim(),
    grupo_muscular: form.grupo_muscular.value.trim() || null,
    equipamento: form.equipamento.value.trim() || null,
    instrucoes: form.instrucoes.value.trim() || null,
    video_url: form.video_url.value.trim() || null,
    global: false
  };

  if (payload.nome.length < 2) return showMessage(message, 'Informe o nome do exercício.', 'error');

  submitButton.disabled = true;
  try {
    const query = editingId
      ? supabase.from('exercicios').update(payload).eq('id', editingId).eq('personal_id', session.user.id).eq('global', false)
      : supabase.from('exercicios').insert(payload);
    const { error } = await query;
    if (error) throw error;
    showMessage(message, editingId ? 'Exercício atualizado com sucesso.' : 'Exercício adicionado à biblioteca.');
    closeModal();
    await loadExercises();
  } catch (error) {
    console.error(error);
    showMessage(message, error.message || 'Não foi possível salvar o exercício.', 'error');
  } finally {
    submitButton.disabled = false;
  }
});

openModalButton.addEventListener('click', () => {
  resetForm();
  openModal();
});
cancelButton.addEventListener('click', closeModal);
search.addEventListener('input', renderExercises);

document.addEventListener('click', async event => {
  if (event.target.closest('[data-close-library-modal]')) return closeModal();

  const editButton = event.target.closest('[data-edit-exercise]');
  if (editButton) return editExercise(editButton.dataset.editExercise);

  const deleteButton = event.target.closest('[data-delete-exercise]');
  if (!deleteButton) return;
  if (!confirm(`Excluir ${deleteButton.dataset.name} da biblioteca?`)) return;

  deleteButton.disabled = true;
  try {
    const { error } = await supabase.from('exercicios')
      .delete()
      .eq('id', deleteButton.dataset.deleteExercise)
      .eq('personal_id', session.user.id)
      .eq('global', false);
    if (error) throw error;
    if (editingId === deleteButton.dataset.deleteExercise) closeModal();
    showMessage(message, 'Exercício excluído da biblioteca.');
    await loadExercises();
  } catch (error) {
    console.error(error);
    showMessage(message, 'Não foi possível excluir. O exercício pode estar sendo usado em um treino.', 'error');
  } finally {
    deleteButton.disabled = false;
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && modal.classList.contains('open')) closeModal();
});

await loadExercises();