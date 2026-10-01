// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { supabase } from './supabase.js';
// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { requireSession } from './layout.js';

const session = await requireSession();
if (!session) throw new Error('Sessão inválida');

const dashboard = document.querySelector('#students-dashboard');
if (!dashboard) throw new Error('Dashboard de alunos não encontrado');

const totalNode = document.querySelector('#students-dashboard-total');
const liveNode = document.querySelector('#students-dashboard-live');
const activeNode = document.querySelector('#students-dashboard-active-workout');
const noWorkoutNode = document.querySelector('#students-dashboard-no-workout');
const newNode = document.querySelector('#students-dashboard-new');
const attentionList = document.querySelector('#students-dashboard-attention-list');
const attentionCount = document.querySelector('#students-dashboard-attention-count');
const donut = document.querySelector('#students-dashboard-donut');
const donutTotal = document.querySelector('#students-dashboard-donut-total');
const legendActive = document.querySelector('#students-dashboard-legend-active');
const legendLive = document.querySelector('#students-dashboard-legend-live');
const legendNoWorkout = document.querySelector('#students-dashboard-legend-no-workout');

type Student = { id: string; nome: string; created_at: string | null; foto_perfil_url?: string | null; status?: string };
type LiveSessionRow = { status: string; aluno_id: string | null };
type WorkoutRow = { aluno_id: string | null };
const requiredNodes = [totalNode, liveNode, activeNode, noWorkoutNode, newNode, attentionList, attentionCount, donut, donutTotal, legendActive, legendLive, legendNoWorkout];
if (requiredNodes.some(node => !node)) throw new Error('Elementos do dashboard de alunos incompletos');

let refreshTimer: number | null = null;

function esc(value: unknown = '') {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function initials(value = '') {
  const parts = String(value).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A';
  return `${parts[0]?.[0] || ''}${parts.length > 1 ? parts.at(-1)?.[0] || '' : ''}`.toUpperCase();
}

function isNew(createdAt: string | null) {
  const time = new Date(createdAt || 0).getTime();
  return Number.isFinite(time) && time >= Date.now() - (30 * 24 * 60 * 60 * 1000);
}

function avatar(student: Student) {
  const photo = String(student.foto_perfil_url || '').trim();
  return `<span class="fs-dashboard-avatar" aria-hidden="true">${photo ? `<img src="${esc(photo)}" alt="" loading="lazy">` : esc(initials(student.nome))}</span>`;
}

function renderAttention(students: Student[]) {
  const count = attentionCount as HTMLElement;
  const list = attentionList as HTMLElement;
  count.textContent = String(students.length);
  list.innerHTML = students.length
    ? students.slice(0, 8).map(student => `
      <a class="fs-dashboard-attention-item" href="ficha-aluno.html?id=${encodeURIComponent(student.id)}">
        ${avatar(student)}
        <span class="fs-dashboard-attention-copy">
          <strong>${esc(student.nome)}</strong>
          <small>${student.created_at ? `Cadastrado em ${new Date(student.created_at).toLocaleDateString('pt-BR')}` : 'Treino ainda não configurado'}</small>
        </span>
        <span class="fs-dashboard-status">Sem treino</span>
      </a>`).join('')
    : '<div class="fs-dashboard-empty">Todos os alunos possuem treino ativo.</div>';
}

async function loadDashboard() {
  const [studentsResult, sessionsResult, workoutsResult] = await Promise.all([
    supabase
      .from('alunos')
      .select('id,nome,created_at,foto_perfil_url,status')
      .eq('personal_id', session.user.id)
      .eq('status', 'ativo')
      .order('created_at', { ascending: false }),
    supabase.rpc('listar_sessoes_em_aula_personal'),
    supabase
      .from('treinos')
      .select('aluno_id')
      .eq('personal_id', session.user.id)
      .eq('status', 'ativo')
  ]);

  if (studentsResult.error) throw studentsResult.error;
  if (sessionsResult.error) console.warn('Não foi possível carregar sessões em aula:', sessionsResult.error);
  if (workoutsResult.error) console.warn('Não foi possível carregar treinos ativos:', workoutsResult.error);

  const students = (studentsResult.data || []) as Student[];
  const liveIds = new Set(((sessionsResult.data || []) as LiveSessionRow[])
    .filter(item => item.status === 'em_aula')
    .map(item => String(item.aluno_id || ''))
    .filter(Boolean));
  const workoutIds = new Set(((workoutsResult.data || []) as WorkoutRow[])
    .map(item => String(item.aluno_id || ''))
    .filter(Boolean));

  const total = students.length;
  const live = students.filter(student => liveIds.has(String(student.id))).length;
  const activeWorkout = students.filter(student => workoutIds.has(String(student.id))).length;
  const noWorkoutStudents = students.filter(student => !workoutIds.has(String(student.id)));
  const newStudents = students.filter(student => isNew(student.created_at)).length;

  (totalNode as HTMLElement).textContent = String(total);
  (liveNode as HTMLElement).textContent = String(live);
  (activeNode as HTMLElement).textContent = String(activeWorkout);
  (noWorkoutNode as HTMLElement).textContent = String(noWorkoutStudents.length);
  (newNode as HTMLElement).textContent = String(newStudents);
  (donutTotal as HTMLElement).textContent = String(total);
  (legendActive as HTMLElement).textContent = String(activeWorkout);
  (legendLive as HTMLElement).textContent = String(live);
  (legendNoWorkout as HTMLElement).textContent = String(noWorkoutStudents.length);

  const activePercent = total ? Math.round((activeWorkout / total) * 100) : 0;
  const livePercent = total ? Math.round((live / total) * 100) : 0;
  (donut as HTMLElement).style.setProperty('--dashboard-active', `${activePercent}%`);
  (donut as HTMLElement).style.setProperty('--dashboard-live', `${Math.min(activePercent + livePercent, 100)}%`);

  renderAttention(noWorkoutStudents);
}

async function refresh() {
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  try {
    await loadDashboard();
  } catch (error) {
    console.error('Erro ao carregar dashboard de alunos:', error);
    (attentionList as HTMLElement).innerHTML = '<div class="fs-dashboard-empty">Não foi possível carregar o resumo dos alunos.</div>';
  }
}

await refresh();
setInterval(() => {
  if (!document.hidden) refresh();
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh();
});
