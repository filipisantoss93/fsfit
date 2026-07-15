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
  div.textContent = value ?? '';
  return div.innerHTML;
}

function phone(value = '') {
  return String(value).replace(/\D/g, '').slice(0, 15);
}

function dbSexo(value) {
  return {
    Masculino: 'masculino',
    Feminino: 'feminino',
    Outro: 'outro',
    'Prefiro não informar': 'nao_informado'
  }[value] || 'nao_informado';
}

function formSexo(value) {
  return {
    masculino: 'Masculino',
    feminino: 'Feminino',
    outro: 'Outro',
    nao_informado: 'Prefiro não informar'
  }[value] || 'Prefiro não informar';
}

async function loadStudents() {
  const { data, error } = await supabase
    .from('alunos')
    .select('id,nome,sexo,telefone,access_token,created_at,treinos(id),planos_alimentares(id)')
    .eq('personal_id', session.user.id)
    .order('nome');

  if (error) return showMessage(message, 'Não foi possível carregar os alunos.', 'error');

  list.innerHTML = data?.length
    ? data.map(student => {
      const hasPlan = (student.treinos?.length || 0) > 0 || (student.planos_alimentares?.length || 0) > 0;
      return `
      <tr>
        <td><strong>${esc(student.nome)}</strong><br><small>${esc(student.telefone || '')}</small></td>
        <td>${esc(formSexo(student.sexo))}</td>
        <td><span class="badge">${hasPlan ? 'Plano publicado' : 'Sem plano'}</span></td>
        <td><div class="actions">
          <button class="btn btn-outline" data-edit="${student.id}">Editar</button>
          <button class="btn btn-secondary" data-copy="${student.access_token}">Copiar link</button>
          <button class="btn btn-danger" data-delete="${student.id}" data-name="${esc(student.nome)}">Excluir</button>
        </div></td>
      </tr>`;
    }).join('')
    : '<tr><td colspan="4" class="empty">Nenhum aluno cadastrado.</td></tr>';

  document.querySelector('#student-count').textContent = data?.length || 0;
}

async function editStudent(id) {
  const [{ data: student, error }, treinoResult, dietaResult] = await Promise.all([
    supabase.from('alunos').select('id,nome,sexo,telefone').eq('id', id).eq('personal_id', session.user.id).single(),
    supabase.from('treinos').select('descricao').eq('aluno_id', id).eq('personal_id', session.user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('planos_alimentares').select('orientacoes').eq('aluno_id', id).eq('personal_id', session.user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  ]);

  if (error) return showMessage(message, 'Não foi possível abrir o aluno.', 'error');

  editingId = id;
  formTitle.textContent = `Editar ${student.nome}`;
  form.nome.value = student.nome;
  form.sexo.value = formSexo(student.sexo);
  form.whatsapp.value = student.telefone || '';
  form.treino.value = treinoResult.data?.descricao || '';
  form.dieta.value = dietaResult.data?.orientacoes || '';
  document.querySelector('#cancel-edit').classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth' });
}

function resetForm() {
  editingId = null;
  form.reset();
  formTitle.textContent = 'Cadastrar novo aluno';
  document.querySelector('#cancel-edit').classList.add('hidden');
}

async function saveWorkout(alunoId, text) {
  const { data: existing } = await supabase
    .from('treinos')
    .select('id')
    .eq('aluno_id', alunoId)
    .eq('personal_id', session.user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = { personal_id: session.user.id, aluno_id: alunoId, nome: 'Plano de treino', descricao: text, status: 'ativo' };
  const result = existing
    ? await supabase.from('treinos').update(payload).eq('id', existing.id)
    : await supabase.from('treinos').insert(payload);
  if (result.error) throw result.error;
}

async function saveDiet(alunoId, text) {
  const { data: existing } = await supabase
    .from('planos_alimentares')
    .select('id')
    .eq('aluno_id', alunoId)
    .eq('personal_id', session.user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = { personal_id: session.user.id, aluno_id: alunoId, titulo: 'Orientações alimentares', orientacoes: text, ativo: true };
  const result = existing
    ? await supabase.from('planos_alimentares').update(payload).eq('id', existing.id)
    : await supabase.from('planos_alimentares').insert(payload);
  if (result.error) throw result.error;
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
  if (remove && confirm(`Excluir ${remove.dataset.name}? Essa ação também apagará os dados vinculados.`)) {
    const { error } = await supabase.from('alunos').delete().eq('id', remove.dataset.delete).eq('personal_id', session.user.id);
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
    sexo: dbSexo(form.sexo.value),
    telefone: phone(form.whatsapp.value)
  };

  if (payload.nome.length < 2 || payload.telefone.length < 10) {
    return showMessage(message, 'Revise nome e WhatsApp.', 'error');
  }

  const button = form.querySelector('[type=submit]');
  button.disabled = true;

  try {
    let aluno;
    if (editingId) {
      const { data, error } = await supabase.from('alunos').update(payload).eq('id', editingId).eq('personal_id', session.user.id).select().single();
      if (error) throw error;
      aluno = data;
    } else {
      const { data, error } = await supabase.from('alunos').insert(payload).select().single();
      if (error) throw error;
      aluno = data;
    }

    await Promise.all([
      saveWorkout(aluno.id, form.treino.value.trim()),
      saveDiet(aluno.id, form.dieta.value.trim())
    ]);

    showMessage(message, editingId ? 'Aluno atualizado com sucesso.' : 'Aluno cadastrado com sucesso.');
    resetForm();
    await loadStudents();
  } catch (error) {
    console.error(error);
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