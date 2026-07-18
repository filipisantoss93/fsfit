import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('alunos');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const form = document.querySelector('#student-form');
const formCard = document.querySelector('#student-form-card');
const message = document.querySelector('#student-message');
const list = document.querySelector('#students-list');
const formTitle = document.querySelector('#form-title');
const studentSearch = document.querySelector('#student-search');
const toggleStudentForm = document.querySelector('#toggle-student-form');
const closeStudentForm = document.querySelector('#close-student-form');
let editingId = null;
let students = [];

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function phone(value = '') {
  return String(value).replace(/\D/g, '').slice(0, 11);
}

function formatPhone(value = '') {
  const digits = phone(value);
  if (digits.length !== 11) return digits;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function isHalfHourSlot(value) {
  if (!value) return true;
  const [hour, minute] = String(value).slice(0, 5).split(':').map(Number);
  return Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && (minute === 0 || minute === 30);
}

function dbSexo(value) {
  return { Masculino: 'masculino', Feminino: 'feminino', Outro: 'outro', 'Prefiro não informar': 'nao_informado' }[value] || 'nao_informado';
}

function formSexo(value) {
  return { masculino: 'Masculino', feminino: 'Feminino', outro: 'Outro', nao_informado: 'Prefiro não informar' }[value] || 'Prefiro não informar';
}

function formatBirthDateInput(value = '') {
  const digits = String(value).replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function isoToBirthDate(value = '') {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function birthDateToIso(value = '') {
  const match = String(value).trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0);

  const valid = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  if (!valid) return null;

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
  const isoDate = birthDateToIso(form.data_nascimento.value);
  const years = isoDate ? age(isoDate) : null;
  form.idade.value = years == null ? '' : `${years} anos`;
}

function openForm() {
  formCard.classList.remove('hidden');
  requestAnimationFrame(() => formCard.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function closeForm() {
  if (editingId) resetForm();
  formCard.classList.add('hidden');
}

function updateStudentCount(total) {
  document.querySelector('#student-count').textContent = total;
  document.querySelector('#student-count-label').textContent = total === 1 ? 'ALUNO' : 'ALUNOS';
}

function renderStudents(data) {
  list.innerHTML = data.length ? data.map(student => {
    const years = age(student.data_nascimento);
    const physical = [
      student.peso_inicial_kg ? `${student.peso_inicial_kg} kg` : null,
      student.altura_cm ? `${student.altura_cm} cm` : null,
      student.percentual_gordura_inicial ? `${student.percentual_gordura_inicial}% gordura` : null
    ].filter(Boolean).join(' · ') || 'Não informado';

    return `<tr>
      <td data-label="Aluno"><strong>${esc(student.nome)}</strong><br><small>${esc(formatPhone(student.telefone || ''))}</small></td>
      <td data-label="Idade">${years == null ? '—' : `${years} anos`}</td>
      <td data-label="Dados físicos">${esc(physical)}</td>
      <td data-label="Ações" class="student-actions-cell"><div class="actions">
        <a class="btn btn-primary" href="ficha-aluno.html?id=${student.id}">Abrir ficha</a>
        <button class="btn btn-outline" data-edit="${student.id}">Editar cadastro</button>
        <button class="btn btn-outline" data-reset-pin="${student.id}" data-name="${esc(student.nome)}">Alterar PIN</button>
        <button class="btn btn-danger" data-delete="${student.id}" data-name="${esc(student.nome)}">Excluir aluno</button>
      </div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="4" class="empty">Nenhum aluno encontrado.</td></tr>';
}

function filterStudents() {
  const query = String(studentSearch?.value || '').trim().toLowerCase().replace(/\D/g, match => match);
  if (!query) return renderStudents(students);

  const normalizedQuery = query.replace(/\D/g, '');
  const filtered = students.filter(student => {
    const nameMatch = String(student.nome || '').toLowerCase().includes(query);
    const phoneMatch = normalizedQuery && phone(student.telefone || '').includes(normalizedQuery);
    return nameMatch || phoneMatch;
  });
  renderStudents(filtered);
}

async function loadStudents() {
  const { data, error } = await supabase
    .from('alunos')
    .select('id,nome,sexo,telefone,data_nascimento,altura_cm,peso_inicial_kg,percentual_gordura_inicial,status')
    .eq('personal_id', session.user.id)
    .order('nome');

  if (error) return showMessage(message, 'Não foi possível carregar os alunos.', 'error');

  students = data || [];
  updateStudentCount(students.length);
  filterStudents();
}

async function editStudent(id) {
  const { data, error } = await supabase.from('alunos')
    .select('id,nome,sexo,telefone,data_nascimento,altura_cm,peso_inicial_kg,percentual_gordura_inicial,objetivo,restricoes,observacoes,periodo_aula,horario_aula,local_aula,status')
    .eq('id', id).eq('personal_id', session.user.id).single();

  if (error) return showMessage(message, 'Não foi possível abrir o cadastro.', 'error');
  editingId = id;
  formTitle.textContent = `Editar ${data.nome}`;
  form.nome.value = data.nome || '';
  form.whatsapp.value = data.telefone || '';
  form.sexo.value = formSexo(data.sexo);
  form.data_nascimento.value = isoToBirthDate(data.data_nascimento || '');
  form.altura_cm.value = data.altura_cm ?? '';
  form.peso_inicial_kg.value = data.peso_inicial_kg ?? '';
  form.percentual_gordura_inicial.value = data.percentual_gordura_inicial ?? '';
  form.objetivo.value = data.objetivo || '';
  form.restricoes.value = data.restricoes || '';
  form.observacoes.value = data.observacoes || '';
  form.periodo_aula.value = data.periodo_aula || '';
  form.horario_aula.value = data.horario_aula ? String(data.horario_aula).slice(0, 5) : '';
  form.local_aula.value = data.local_aula || '';
  updateAge();
  document.querySelector('#cancel-edit').classList.remove('hidden');
  openForm();
}

function resetForm() {
  editingId = null;
  form.reset();
  form.idade.value = '';
  formTitle.textContent = 'Cadastrar novo aluno';
  document.querySelector('#cancel-edit').classList.add('hidden');
}

form.data_nascimento.addEventListener('input', () => {
  form.data_nascimento.value = formatBirthDateInput(form.data_nascimento.value);
  updateAge();
});
form.data_nascimento.addEventListener('blur', () => {
  if (!form.data_nascimento.value) return;
  if (!birthDateToIso(form.data_nascimento.value)) {
    showMessage(message, 'Informe uma data de nascimento válida no formato DD/MM/AAAA.', 'error');
  }
});
form.whatsapp.addEventListener('input', () => { form.whatsapp.value = phone(form.whatsapp.value); });
form.horario_aula.addEventListener('change', () => {
  if (form.horario_aula.value && !isHalfHourSlot(form.horario_aula.value)) {
    showMessage(message, 'Escolha um horário em intervalos de 30 minutos, como 08:00, 08:30, 09:00 ou 09:30.', 'error');
    form.horario_aula.value = '';
    form.horario_aula.focus();
  }
});
document.querySelector('#cancel-edit').addEventListener('click', resetForm);
toggleStudentForm?.addEventListener('click', () => {
  resetForm();
  openForm();
});
closeStudentForm?.addEventListener('click', closeForm);
studentSearch?.addEventListener('input', filterStudents);

document.addEventListener('click', async event => {
  const edit = event.target.closest('[data-edit]');
  if (edit) return editStudent(edit.dataset.edit);

  const resetPin = event.target.closest('[data-reset-pin]');
  if (resetPin) {
    const first = prompt(`Digite o novo PIN de 4 números para ${resetPin.dataset.name}:`);
    if (first == null) return;
    const pin = String(first).replace(/\D/g, '').slice(0, 4);
    if (pin.length !== 4) return showMessage(message, 'O PIN deve ter exatamente 4 números.', 'error');
    const confirmation = prompt('Confirme o novo PIN de 4 números:');
    if (confirmation == null) return;
    const pinConfirm = String(confirmation).replace(/\D/g, '').slice(0, 4);
    if (pin !== pinConfirm) return showMessage(message, 'Os PINs informados não coincidem.', 'error');

    resetPin.disabled = true;
    try {
      const { data, error } = await supabase.functions.invoke('aluno-auth', {
        body: { action: 'personal_reset_pin', aluno_id: resetPin.dataset.resetPin, pin }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      showMessage(message, `PIN de ${resetPin.dataset.name} alterado com sucesso. As sessões anteriores foram encerradas.`);
    } catch (error) {
      console.error(error);
      showMessage(message, error.message || 'Não foi possível alterar o PIN.', 'error');
    } finally {
      resetPin.disabled = false;
    }
    return;
  }

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
  const birthDateText = form.data_nascimento.value.trim();
  const birthDateIso = birthDateText ? birthDateToIso(birthDateText) : null;

  if (birthDateText && !birthDateIso) {
    return showMessage(message, 'Informe uma data de nascimento válida no formato DD/MM/AAAA.', 'error');
  }

  if (birthDateIso) {
    const birth = new Date(`${birthDateIso}T12:00:00`);
    const today = new Date();
    if (birth > today) return showMessage(message, 'A data de nascimento não pode estar no futuro.', 'error');
  }

  const payload = {
    personal_id: session.user.id,
    nome: form.nome.value.trim(),
    telefone: phone(form.whatsapp.value),
    sexo: dbSexo(form.sexo.value),
    data_nascimento: birthDateIso,
    periodo_aula: form.periodo_aula.value || null,
    horario_aula: form.horario_aula.value || null,
    local_aula: form.local_aula.value.trim() || null,
    altura_cm: numberOrNull(form.altura_cm.value),
    peso_inicial_kg: numberOrNull(form.peso_inicial_kg.value),
    percentual_gordura_inicial: numberOrNull(form.percentual_gordura_inicial.value),
    objetivo: form.objetivo.value.trim() || null,
    restricoes: form.restricoes.value.trim() || null,
    observacoes: form.observacoes.value.trim() || null,
    status: 'ativo'
  };

  if (payload.nome.length < 2) return showMessage(message, 'Informe o nome do aluno.', 'error');
  if (payload.telefone.length !== 11) return showMessage(message, 'O WhatsApp deve ter 11 números: DDD + número.', 'error');
  if (!isHalfHourSlot(payload.horario_aula)) return showMessage(message, 'O horário deve estar em intervalos de 30 minutos.', 'error');
  if ((payload.periodo_aula || payload.horario_aula || payload.local_aula) && !(payload.periodo_aula && payload.horario_aula && payload.local_aula)) {
    return showMessage(message, 'Para programar a agenda, informe período, horário e local. Os dias são definidos pelo treino ativo.', 'error');
  }

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
    else closeForm();
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