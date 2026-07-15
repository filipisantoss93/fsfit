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
let editingId = null;

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function phone(value = '') {
  return String(value).replace(/\D/g, '').slice(0, 11);
}

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function dbSexo(value) {
  return { Masculino: 'masculino', Feminino: 'feminino', Outro: 'outro', 'Prefiro não informar': 'nao_informado' }[value] || 'nao_informado';
}

function formSexo(value) {
  return { masculino: 'Masculino', feminino: 'Feminino', outro: 'Outro', nao_informado: 'Prefiro não informar' }[value] || 'Prefiro não informar';
}

function age(date) {
  if (!date) return null;
  const birth = new Date(`${date}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const beforeBirthday = today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) years--;
  return years >= 0 ? years : null;
}

function updateAge() {
  const years = age(form.data_nascimento.value);
  form.idade.value = years == null ? '' : `${years} anos`;
}

async function loadStudents() {
  const { data, error } = await supabase
    .from('alunos')
    .select('id,nome,sexo,telefone,data_nascimento,altura_cm,peso_inicial_kg,percentual_gordura_inicial,status')
    .eq('personal_id', session.user.id)
    .order('nome');

  if (error) return showMessage(message, 'Não foi possível carregar os alunos.', 'error');

  list.innerHTML = data?.length ? data.map(student => {
    const years = age(student.data_nascimento);
    const physical = [
      student.peso_inicial_kg ? `${student.peso_inicial_kg} kg` : null,
      student.altura_cm ? `${student.altura_cm} cm` : null,
      student.percentual_gordura_inicial ? `${student.percentual_gordura_inicial}% gordura` : null
    ].filter(Boolean).join(' · ') || 'Não informado';

    return `<tr>
      <td data-label="Aluno"><strong>${esc(student.nome)}</strong><br><small>${esc(student.telefone || '')}</small></td>
      <td data-label="Idade">${years == null ? '—' : `${years} anos`}</td>
      <td data-label="Dados físicos">${esc(physical)}</td>
      <td data-label="Ações" class="student-actions-cell"><div class="actions">
        <a class="btn btn-primary" href="ficha-aluno.html?id=${student.id}">Abrir ficha</a>
        <button class="btn btn-outline" data-edit="${student.id}">Editar cadastro</button>
        <button class="btn btn-danger" data-delete="${student.id}" data-name="${esc(student.nome)}">Excluir</button>
      </div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="4" class="empty">Nenhum aluno cadastrado.</td></tr>';

  document.querySelector('#student-count').textContent = data?.length || 0;
}

async function editStudent(id) {
  const { data, error } = await supabase.from('alunos')
    .select('id,nome,sexo,telefone,data_nascimento,altura_cm,peso_inicial_kg,percentual_gordura_inicial,objetivo,restricoes,observacoes')
    .eq('id', id).eq('personal_id', session.user.id).single();

  if (error) return showMessage(message, 'Não foi possível abrir o cadastro.', 'error');
  editingId = id;
  formTitle.textContent = `Editar ${data.nome}`;
  form.nome.value = data.nome || '';
  form.whatsapp.value = data.telefone || '';
  form.sexo.value = formSexo(data.sexo);
  form.data_nascimento.value = data.data_nascimento || '';
  form.altura_cm.value = data.altura_cm ?? '';
  form.peso_inicial_kg.value = data.peso_inicial_kg ?? '';
  form.percentual_gordura_inicial.value = data.percentual_gordura_inicial ?? '';
  form.objetivo.value = data.objetivo || '';
  form.restricoes.value = data.restricoes || '';
  form.observacoes.value = data.observacoes || '';
  updateAge();
  document.querySelector('#cancel-edit').classList.remove('hidden');
  form.closest('.student-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetForm() {
  editingId = null;
  form.reset();
  form.idade.value = '';
  formTitle.textContent = 'Cadastrar novo aluno';
  document.querySelector('#cancel-edit').classList.add('hidden');
}

form.data_nascimento.addEventListener('change', updateAge);
form.whatsapp.addEventListener('input', () => { form.whatsapp.value = phone(form.whatsapp.value); });
document.querySelector('#cancel-edit').addEventListener('click', resetForm);

document.addEventListener('click', async event => {
  const edit = event.target.closest('[data-edit]');
  if (edit) return editStudent(edit.dataset.edit);

  const remove = event.target.closest('[data-delete]');
  if (remove && confirm(`Excluir ${remove.dataset.name}? Todos os dados vinculados também serão removidos.`)) {
    const { error } = await supabase.from('alunos').delete().eq('id', remove.dataset.delete).eq('personal_id', session.user.id);
    if (error) showMessage(message, error.message, 'error');
    else { showMessage(message, 'Aluno excluído.'); await loadStudents(); }
  }
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const wasEditing = Boolean(editingId);
  const payload = {
    personal_id: session.user.id,
    nome: form.nome.value.trim(),
    telefone: phone(form.whatsapp.value),
    sexo: dbSexo(form.sexo.value),
    data_nascimento: form.data_nascimento.value || null,
    altura_cm: numberOrNull(form.altura_cm.value),
    peso_inicial_kg: numberOrNull(form.peso_inicial_kg.value),
    percentual_gordura_inicial: numberOrNull(form.percentual_gordura_inicial.value),
    objetivo: form.objetivo.value.trim() || null,
    restricoes: form.restricoes.value.trim() || null,
    observacoes: form.observacoes.value.trim() || null
  };

  if (payload.nome.length < 2) return showMessage(message, 'Informe o nome do aluno.', 'error');
  if (payload.telefone.length !== 11) return showMessage(message, 'O WhatsApp deve ter 11 números: DDD + número.', 'error');

  const button = form.querySelector('[type=submit]');
  button.disabled = true;
  try {
    const query = editingId
      ? supabase.from('alunos').update(payload).eq('id', editingId).eq('personal_id', session.user.id)
      : supabase.from('alunos').insert(payload);
    const { data, error } = await query.select('id').single();
    if (error) throw error;
    showMessage(message, wasEditing ? 'Cadastro atualizado com sucesso.' : 'Aluno cadastrado com sucesso.');
    resetForm();
    await loadStudents();
    if (!wasEditing && data?.id) window.location.href = `ficha-aluno.html?id=${data.id}`;
  } catch (error) {
    console.error(error);
    showMessage(message, error.message || 'Não foi possível salvar.', 'error');
  } finally {
    button.disabled = false;
  }
});

await loadStudents();
const requested = new URLSearchParams(location.search).get('editar');
if (requested) editStudent(requested);