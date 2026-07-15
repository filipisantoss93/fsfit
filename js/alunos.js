import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('alunos');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const form = document.querySelector('#student-form');
const message = document.querySelector('#student-message');
const list = document.querySelector('#students-list');
const formTitle = document.querySelector('#form-title');
const tokenBase = `${window.location.origin}${window.location.pathname.replace('alunos.html', 'aluno.html')}?id=`;
let editingId = null;

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function phone(value = '') {
  return value.replace(/\D/g, '').slice(0, 15);
}

async function loadStudents() {
  const { data, error } = await supabase
    .from('alunos')
    .select('id,nome,sexo,whatsapp,access_token,created_at,planos(treino,dieta,updated_at)')
    .order('nome');

  if (error) return showMessage(message, error.message, 'error');

  list.innerHTML = data?.length
    ? data.map(student => `
      <tr>
        <td><strong>${esc(student.nome)}</strong><br><small>${esc(student.whatsapp)}</small></td>
        <td>${esc(student.sexo)}</td>
        <td><span class="badge">${student.planos?.length ? 'Plano publicado' : 'Sem plano'}</span></td>
        <td><div class="actions">
          <button class="btn btn-outline" data-edit="${student.id}">Editar</button>
          <button class="btn btn-secondary" data-copy="${student.access_token}">Copiar link</button>
          <button class="btn btn-danger" data-delete="${student.id}" data-name="${esc(student.nome)}">Excluir</button>
        </div></td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="empty">Nenhum aluno cadastrado.</td></tr>';

  document.querySelector('#student-count').textContent = data?.length || 0;
}

async function editStudent(id) {
  const { data, error } = await supabase
    .from('alunos')
    .select('id,nome,sexo,whatsapp,planos(treino,dieta)')
    .eq('id', id)
    .single();

  if (error) return showMessage(message, error.message, 'error');

  editingId = id;
  formTitle.textContent = `Editar ${data.nome}`;
  form.nome.value = data.nome;
  form.sexo.value = data.sexo;
  form.whatsapp.value = data.whatsapp;
  form.treino.value = data.planos?.[0]?.treino || '';
  form.dieta.value = data.planos?.[0]?.dieta || '';
  document.querySelector('#cancel-edit').classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth' });
}

function resetForm() {
  editingId = null;
  form.reset();
  formTitle.textContent = 'Cadastrar novo aluno';
  document.querySelector('#cancel-edit').classList.add('hidden');
}

document.addEventListener('click', async event => {
  const edit = event.target.closest('[data-edit]');
  if (edit) return editStudent(edit.dataset.edit);

  const copy = event.target.closest('[data-copy]');
  if (copy) {
    await navigator.clipboard.writeText(tokenBase + copy.dataset.copy);
    showMessage(message, 'Link copiado com sucesso.');
    return;
  }

  const remove = event.target.closest('[data-delete]');
  if (remove && confirm(`Excluir ${remove.dataset.name}? Essa ação também apagará o plano.`)) {
    const { error } = await supabase.from('alunos').delete().eq('id', remove.dataset.delete);
    if (error) showMessage(message, error.message, 'error');
    else {
      showMessage(message, 'Aluno excluído.');
      await loadStudents();
    }
  }
});

document.querySelector('#cancel-edit').addEventListener('click', resetForm);

form.addEventListener('submit', async event => {
  event.preventDefault();
  const payload = {
    personal_id: session.user.id,
    nome: form.nome.value.trim(),
    sexo: form.sexo.value,
    whatsapp: phone(form.whatsapp.value)
  };

  if (payload.nome.length < 2 || payload.whatsapp.length < 10) {
    return showMessage(message, 'Revise nome e WhatsApp.', 'error');
  }

  const button = form.querySelector('[type=submit]');
  button.disabled = true;

  try {
    let aluno;
    if (editingId) {
      const { data, error } = await supabase.from('alunos').update(payload).eq('id', editingId).select().single();
      if (error) throw error;
      aluno = data;
    } else {
      const { data, error } = await supabase.from('alunos').insert(payload).select().single();
      if (error) throw error;
      aluno = data;
    }

    const { error: planError } = await supabase.from('planos').upsert({
      personal_id: session.user.id,
      aluno_id: aluno.id,
      treino: form.treino.value.trim(),
      dieta: form.dieta.value.trim()
    }, { onConflict: 'aluno_id' });

    if (planError) throw planError;

    showMessage(message, editingId ? 'Aluno atualizado com sucesso.' : 'Aluno cadastrado com sucesso.');
    resetForm();
    await loadStudents();
  } catch (error) {
    showMessage(message, error.message || 'Não foi possível salvar.', 'error');
  } finally {
    button.disabled = false;
  }
});

form.whatsapp.addEventListener('input', () => {
  form.whatsapp.value = phone(form.whatsapp.value);
});

await loadStudents();
const requested = new URLSearchParams(location.search).get('editar');
if (requested) editStudent(requested);
