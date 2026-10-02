// @ts-ignore Existing browser JavaScript module.
import { supabase } from './supabase.js';
// @ts-ignore Existing browser JavaScript module.
import { requireSession } from './layout.js';

interface StudentMeta { id: string; created_at?: string; foto_perfil_url?: string; status?: string; }

const session = await requireSession();
if (!session) throw new Error('Sessão inválida');

const list = document.querySelector<HTMLTableSectionElement>('#students-list')!;
const filterNav = document.querySelector<HTMLElement>('#student-filter-nav');

let activeFilter = 'all';
let studentMeta = new Map<string, StudentMeta>();
let inClassIds = new Set<string>();
let activeWorkoutIds = new Set<string>();
let filterDataLoaded = false;

function esc(value: unknown = ''): string {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function initials(value: unknown = ''): string {
  const parts = String(value).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A';
  return `${parts[0]?.[0] || ''}${parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : ''}`.toUpperCase();
}

function getStudentId(row: HTMLTableRowElement): string {
  if (row.dataset.studentId) return row.dataset.studentId;
  const link = row.querySelector<HTMLAnchorElement>('a[href*="ficha-aluno.html?id="]');
  if (!link) return '';
  try {
    return new URL(link.href, location.origin).searchParams.get('id') || '';
  } catch {
    return '';
  }
}

function isNewStudent(student: StudentMeta | undefined): boolean {
  if (!student?.created_at) return false;
  const created = new Date(student.created_at).getTime();
  return Number.isFinite(created) && created >= Date.now() - (30 * 24 * 60 * 60 * 1000);
}

function avatarMarkup(studentId: string, name: string): string {
  const meta = studentMeta.get(studentId);
  const photoUrl = String(meta?.foto_perfil_url || '').trim();
  return `<span class="student-list-avatar" data-student-avatar="${esc(studentId)}" aria-hidden="true">
    <span class="student-list-avatar-fallback">${esc(initials(name))}</span>
    ${photoUrl ? `<img src="${esc(photoUrl)}" alt="" loading="lazy">` : ''}
  </span>`;
}

function statusMarkup(studentId: string): string {
  const meta = studentMeta.get(studentId);
  const chips: string[] = [];
  if (inClassIds.has(studentId)) chips.push('<span class="student-status-chip is-live">Em aula</span>');
  if (!activeWorkoutIds.has(studentId)) chips.push('<span class="student-status-chip is-alert">Sem treino</span>');
  if (isNewStudent(meta)) chips.push('<span class="student-status-chip is-new">Novo</span>');
  if (!chips.length) chips.push('<span class="student-status-chip">Acompanhamento ativo</span>');
  return chips.join('');
}

function actionsMarkup(studentId: string, name: string): string {
  return `<div class="student-row-actions">
    <button class="student-actions-trigger" type="button" data-student-menu-trigger aria-label="Mais ações para ${esc(name)}" aria-haspopup="menu" aria-expanded="false">•••</button>
    <div class="student-actions-menu" role="menu" hidden>
      <button type="button" role="menuitem" data-edit="${esc(studentId)}">Editar cadastro</button>
      <button type="button" role="menuitem" data-reset-pin="${esc(studentId)}" data-name="${esc(name)}">Alterar PIN</button>
      <button class="is-danger" type="button" role="menuitem" data-delete="${esc(studentId)}" data-name="${esc(name)}">Excluir aluno</button>
    </div>
  </div>`;
}

function closeActionMenus(except: Element | null = null): void {
  list?.querySelectorAll('.student-row-actions.is-open').forEach(host => {
    if (host === except) return;
    host.classList.remove('is-open');
    const trigger = host.querySelector('[data-student-menu-trigger]');
    const menu = host.querySelector<HTMLElement>('.student-actions-menu');
    trigger?.setAttribute('aria-expanded', 'false');
    if (menu) menu.hidden = true;
  });
}

function updateSummary(): void {
  if (!filterDataLoaded) return;
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

function syncStudentPresentation(): void {
  if (!list) return;
  list.querySelectorAll<HTMLTableRowElement>('tr[data-student-id]').forEach(row => {
    const id = row.dataset.studentId || '';
    const name = row.dataset.studentName || 'Aluno';
    const host = row.querySelector<HTMLElement>('[data-student-avatar]');
    const metaHost = row.querySelector<HTMLElement>('[data-student-meta]');
    const meta = studentMeta.get(id);
    const photoUrl = String(meta?.foto_perfil_url || '').trim();

    if (host) {
      const fallback = host.querySelector<HTMLElement>('.student-list-avatar-fallback');
      if (fallback) fallback.textContent = initials(name);
      let image = host.querySelector<HTMLImageElement>('img');
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
          image.onerror = () => image?.remove();
        }
      }
    }

    if (metaHost) metaHost.innerHTML = statusMarkup(id);
  });
  updateSummary();
}

function transformRows(): void {
  if (!list) return;
  const table = list.closest<HTMLTableElement>('table');
  const header = table?.querySelector<HTMLTableRowElement>('thead tr');
  if (header && !header.dataset.compactStudents) {
    header.innerHTML = '<th>Aluno</th><th aria-label="Ações"></th>';
    header.dataset.compactStudents = 'true';
  }

  list.querySelectorAll('tr').forEach(row => {
    if (row.dataset.compactStudentReady) return;
    const cells = [...row.children] as HTMLTableCellElement[];
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
      <td class="student-compact-actions-cell">${actionsMarkup(studentId, name)}<span class="student-compact-arrow" aria-hidden="true">›</span></td>`;
  });

  syncStudentPresentation();
  applyFilter();
}

function appendRowsInOrder(sorted: HTMLTableRowElement[]): void {
  const fragment = document.createDocumentFragment();
  sorted.forEach(row => fragment.appendChild(row));
  list.appendChild(fragment);
}

function sortRows(rows: HTMLTableRowElement[]): void {
  const sorted = [...rows].sort((a, b) => {
    if (activeFilter === 'new') {
      const aTime = new Date(studentMeta.get(a.dataset.studentId || '')?.created_at || 0).getTime();
      const bTime = new Date(studentMeta.get(b.dataset.studentId || '')?.created_at || 0).getTime();
      if (bTime !== aTime) return bTime - aTime;
    }
    return String(a.dataset.studentName || '').localeCompare(String(b.dataset.studentName || ''), 'pt-BR', { sensitivity: 'base' });
  });
  const currentIds = rows.map(row => row.dataset.studentId).join('|');
  const sortedIds = sorted.map(row => row.dataset.studentId).join('|');
  if (currentIds !== sortedIds) appendRowsInOrder(sorted);
}

function applyFilter(): void {
  if (!list) return;
  closeActionMenus();
  const rows = [...list.querySelectorAll<HTMLTableRowElement>('tr[data-student-id]')];
  rows.forEach(row => {
    const id = row.dataset.studentId || '';
    const meta = studentMeta.get(id);
    let visible = true;
    if (activeFilter === 'in_class') visible = inClassIds.has(id);
    if (activeFilter === 'new') visible = isNewStudent(meta);
    if (activeFilter === 'no_workout') visible = !activeWorkoutIds.has(id);
    row.hidden = !visible;
  });

  sortRows(rows);
  const visibleRows = rows.filter(row => !row.hidden);
  let empty = list.querySelector<HTMLTableRowElement>('.student-filter-empty-row');
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

async function refreshFilterData(): Promise<void> {
  const [studentsResult, sessionsResult, workoutsResult] = await Promise.all([
    supabase.from('alunos').select('id,created_at,status,foto_perfil_url').eq('personal_id', session.user.id),
    supabase.rpc('listar_sessoes_em_aula_personal'),
    supabase.from('treinos').select('aluno_id').eq('personal_id', session.user.id).eq('status', 'ativo')
  ]);

  if (!studentsResult.error) {
    studentMeta = new Map<string, StudentMeta>(((studentsResult.data || []) as StudentMeta[]).map(item => [item.id, item]));
    filterDataLoaded = true;
  }
  if (!sessionsResult.error) inClassIds = new Set<string>(((sessionsResult.data || []) as Array<{ status: string; aluno_id: string }>).filter(item => item.status === 'em_aula').map(item => item.aluno_id));
  if (!workoutsResult.error) activeWorkoutIds = new Set<string>(((workoutsResult.data || []) as Array<{ aluno_id?: string }>).map(item => item.aluno_id).filter((id): id is string => Boolean(id)));

  syncStudentPresentation();
  applyFilter();
}

transformRows();

const observer = new MutationObserver(() => queueMicrotask(transformRows));
if (list) observer.observe(list, { childList: true });

filterNav?.addEventListener('click', event => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>('[data-student-filter]');
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
  if (!(event.target instanceof Element)) return;
  const trigger = event.target.closest<HTMLButtonElement>('[data-student-menu-trigger]');
  if (trigger) {
    event.preventDefault();
    event.stopPropagation();
    const host = trigger.closest('.student-row-actions');
    const menu = host?.querySelector<HTMLElement>('.student-actions-menu');
    const opening = !host?.classList.contains('is-open');
    closeActionMenus(host);
    host?.classList.toggle('is-open', opening);
    trigger.setAttribute('aria-expanded', String(opening));
    if (menu) menu.hidden = !opening;
    if (opening) menu?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return;
  }

  if (event.target.closest('.student-actions-menu')) {
    closeActionMenus();
    return;
  }

  const row = event.target.closest<HTMLTableRowElement>('tr[data-student-id]');
  if (row) location.href = `ficha-aluno.html?id=${encodeURIComponent(row.dataset.studentId || '')}`;
});

list?.addEventListener('keydown', event => {
  if (!(event.target instanceof Element)) return;
  if (event.key === 'Escape') {
    const openHost = event.target.closest('.student-row-actions.is-open');
    if (openHost) {
      event.preventDefault();
      const trigger = openHost.querySelector<HTMLButtonElement>('[data-student-menu-trigger]');
      closeActionMenus();
      trigger?.focus();
    }
    return;
  }

  if (event.target.closest('.student-row-actions')) return;
  const row = event.target.closest<HTMLTableRowElement>('tr[data-student-id]');
  if (!row || (event.key !== 'Enter' && event.key !== ' ')) return;
  event.preventDefault();
  location.href = `ficha-aluno.html?id=${encodeURIComponent(row.dataset.studentId || '')}`;
});

document.addEventListener('click', event => {
  if (!(event.target instanceof Element) || !event.target.closest('.student-row-actions')) closeActionMenus();
});

await refreshFilterData();
setInterval(() => {
  if (!document.hidden) refreshFilterData().catch(console.warn);
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshFilterData().catch(console.warn);
});
