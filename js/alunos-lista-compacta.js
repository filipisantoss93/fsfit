import { supabase } from './supabase.js';
import { requireSession } from './layout.js';

const session = await requireSession();
if (!session) throw new Error('Sessão inválida');

const list = document.querySelector('#students-list');
const filterNav = document.querySelector('#student-filter-nav');

let activeFilter = 'all';
let studentMeta = new Map();
let inClassIds = new Set();
let activeWorkoutIds = new Set();

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function initials(value = '') {
  const parts = String(value).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A';
  return `${parts[0]?.[0] || ''}${parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : ''}`.toUpperCase();
}

function getStudentId(row) {
  if (row.dataset.studentId) return row.dataset.studentId;
  const link = row.querySelector('a[href*="ficha-aluno.html?id="]');
  if (!link) return '';
  try {
    return new URL(link.href, location.origin).searchParams.get('id') || '';
  } catch {
    return '';
  }
}

function isNewStudent(student) {
  if (!student?.created_at) return false;
  const created = new Date(student.created_at).getTime();
  return Number.isFinite(created) && created >= Date.now() - (30 * 24 * 60 * 60 * 1000);
}

function avatarMarkup(studentId, name) {
  const meta = studentMeta.get(studentId);
  const photoUrl = String(meta?.foto_perfil_url || '').trim();
  return `<span class="student-list-avatar" data-student-avatar="${esc(studentId)}" aria-hidden="true">
    <span class="student-list-avatar-fallback">${esc(initials(name))}</span>
    ${photoUrl ? `<img src="${esc(photoUrl)}" alt="" loading="lazy">` : ''}
  </span>`;
}

function statusMarkup(studentId) {
  const meta = studentMeta.get(studentId);
  const chips = [];
  if (inClassIds.has(studentId)) chips.push('<span class="student-status-chip is-live">Em aula</span>');
  if (!activeWorkoutIds.has(studentId)) chips.push('<span class="student-status-chip is-alert">Sem treino</span>');
  if (isNewStudent(meta)) chips.push('<span class="student-status-chip is-new">Novo</span>');
  if (!chips.length) chips.push('<span class="student-status-chip">Acompanhamento ativo</span>');
  return chips.join('');
}

function updateSummary() {
  const total = studentMeta.size || list?.querySelectorAll('tr[data-student-id]').length || 0;
  const noWorkout = [...studentMeta.keys()].filter(id => !activeWorkoutIds.has(id)).length;
  const totalNode = document.querySelector('#student-count');
  const totalLabel = document.querySelector('#student-count-label');
  const liveNode = document.querySelector('#student-in-class-count');
  const noWorkoutNode = document.querySelector('#student-no-workout-count');

  if (totalNode) totalNode.textContent = String(total);
  if (totalLabel) totalLabel.textContent = total === 1 ? 'aluno cadastrado' : 'alunos cadastrados';
  if (liveNode) liveNode.textContent = String(inClassIds.size);
  if (noWorkoutNode) noWorkoutNode.textContent = String(noWorkout);
}

function syncStudentPresentation() {
  if (!list) return;
  list.querySelectorAll('tr[data-student-id]').forEach(row => {
    const id = row.dataset.studentId;
    const name = row.dataset.studentName || 'Aluno';
    const host = row.querySelector('[data-student-avatar]');
    const metaHost = row.querySelector('[data-student-meta]');
    const meta = studentMeta.get(id);
    const photoUrl = String(meta?.foto_perfil_url || '').trim();

    if (host) {
      host.querySelector('.student-list-avatar-fallback').textContent = initials(name);
      let image = host.querySelector('img');
      if (!photoUrl) image?.remove();
      else {
        if (!image) {
          image = document.createElement('img');
          image.alt = '';
          image.loading = 'lazy';
          host.appendChild(image);
        }
        if (image.dataset.source !== photoUrl) {
          image.dataset.source = photoUrl;
          image.src = photoUrl;
          image.onerror = () => image.remove();
        }
      }
    }

    if (metaHost) metaHost.innerHTML = statusMarkup(id);
  });
  updateSummary();
}

function transformRows() {
  if (!list) return;
  const table = list.closest('table');
  const header = table?.querySelector('thead tr');
  if (header && !header.dataset.compactStudents) {
    header.innerHTML = '<th>Aluno</th><th aria-label="Abrir ficha"></th>';
    header.dataset.compactStudents = 'true';
  }

  list.querySelectorAll('tr').forEach(row => {
    if (row.dataset.compactStudentReady) return;
    const cells = [...row.children];
    if (cells.length === 1) {
      cells[0].colSpan = 2;
      row.dataset.compactStudentReady = 'true';
      return;
    }

    const studentId = getStudentId(row);
    if (!studentId) return;
    const source = cells[0];
    const name = source.querySelector('strong')?.textContent?.trim() || 'Aluno';
    const phone = source.querySelector('small')?.textContent?.trim() || '';

    row.dataset.studentId = studentId;
    row.dataset.studentName = name;
    row.dataset.compactStudentReady = 'true';
    row.tabIndex = 0;
    row.setAttribute('role', 'link');
    row.setAttribute('aria-label', `Abrir ficha de ${name}`);
    row.className = 'student-compact-row';
    row.innerHTML = `
      <td class="student-compact-main">
        <div class="student-compact-identity">
          ${avatarMarkup(studentId, name)}
          <span class="student-compact-copy">
            <strong>${esc(name)}</strong>
            <small>${esc(phone || 'WhatsApp não informado')}</small>
            <span class="student-compact-meta" data-student-meta>${statusMarkup(studentId)}</span>
          </span>
        </div>
      </td>
      <td class="student-compact-arrow" aria-hidden="true">›</td>`;
  });

  syncStudentPresentation();
  applyFilter();
}

function appendRowsInOrder(sorted) {
  const fragment = document.createDocumentFragment();
  sorted.forEach(row => fragment.appendChild(row));
  list.appendChild(fragment);
}

function sortRows(rows) {
  const sorted = [...rows].sort((a, b) => {
    if (activeFilter === 'new') {
      const aTime = new Date(studentMeta.get(a.dataset.studentId)?.created_at || 0).getTime();
      const bTime = new Date(studentMeta.get(b.dataset.studentId)?.created_at || 0).getTime();
      if (bTime !== aTime) return bTime - aTime;
    }
    return String(a.dataset.studentName || '').localeCompare(String(b.dataset.studentName || ''), 'pt-BR', { sensitivity: 'base' });
  });
  const currentIds = rows.map(row => row.dataset.studentId).join('|');
  const sortedIds = sorted.map(row => row.dataset.studentId).join('|');
  if (currentIds !== sortedIds) appendRowsInOrder(sorted);
}

function applyFilter() {
  if (!list) return;
  const rows = [...list.querySelectorAll('tr[data-student-id]')];
  rows.forEach(row => {
    const id = row.dataset.studentId;
    const meta = studentMeta.get(id);
    let visible = true;
    if (activeFilter === 'in_class') visible = inClassIds.has(id);
    if (activeFilter === 'new') visible = isNewStudent(meta);
    if (activeFilter === 'no_workout') visible = !activeWorkoutIds.has(id);
    row.hidden = !visible;
  });

  sortRows(rows);
  const visibleRows = rows.filter(row => !row.hidden);
  let empty = list.querySelector('.student-filter-empty-row');
  if (!visibleRows.length && rows.length) {
    if (!empty) {
      empty = document.createElement('tr');
      empty.className = 'student-filter-empty-row';
      empty.dataset.compactStudentReady = 'true';
      empty.innerHTML = '<td colspan="2">Nenhum aluno corresponde a este filtro.</td>';
      list.appendChild(empty);
    }
    empty.hidden = false;
  } else if (empty) empty.hidden = true;
}

async function refreshFilterData() {
  const [studentsResult, sessionsResult, workoutsResult] = await Promise.all([
    supabase.from('alunos').select('id,created_at,status,foto_perfil_url').eq('personal_id', session.user.id),
    supabase.rpc('listar_sessoes_em_aula_personal'),
    supabase.from('treinos').select('aluno_id').eq('personal_id', session.user.id).eq('status', 'ativo')
  ]);

  if (!studentsResult.error) studentMeta = new Map((studentsResult.data || []).map(item => [item.id, item]));
  if (!sessionsResult.error) inClassIds = new Set((sessionsResult.data || []).filter(item => item.status === 'em_aula').map(item => item.aluno_id));
  if (!workoutsResult.error) activeWorkoutIds = new Set((workoutsResult.data || []).map(item => item.aluno_id).filter(Boolean));

  syncStudentPresentation();
  applyFilter();
}

transformRows();

const observer = new MutationObserver(() => queueMicrotask(transformRows));
if (list) observer.observe(list, { childList: true });

filterNav?.addEventListener('click', event => {
  const button = event.target.closest('[data-student-filter]');
  if (!button) return;
  activeFilter = button.dataset.studentFilter || 'all';
  filterNav.querySelectorAll('[data-student-filter]').forEach(item => {
    const active = item === button;
    item.classList.toggle('active', active);
    item.setAttribute('aria-pressed', String(active));
  });
  applyFilter();
});

list?.addEventListener('click', event => {
  const row = event.target.closest('tr[data-student-id]');
  if (row) location.href = `ficha-aluno.html?id=${encodeURIComponent(row.dataset.studentId)}`;
});

list?.addEventListener('keydown', event => {
  const row = event.target.closest('tr[data-student-id]');
  if (!row || (event.key !== 'Enter' && event.key !== ' ')) return;
  event.preventDefault();
  location.href = `ficha-aluno.html?id=${encodeURIComponent(row.dataset.studentId)}`;
});

await refreshFilterData();
setInterval(() => {
  if (!document.hidden) refreshFilterData().catch(console.warn);
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshFilterData().catch(console.warn);
});