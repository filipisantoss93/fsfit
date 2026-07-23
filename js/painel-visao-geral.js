import { supabase } from './supabase.js';
import { requireSession } from './layout.js';

setupDashboardStickyTabs();

const session = await requireSession();

if (session) {
  await loadOverview();
}

function setupDashboardStickyTabs() {
  const tabs = document.querySelector('.dashboard-tabs');
  if (!tabs || tabs.dataset.stickyTabsReady === '1') return;

  tabs.dataset.stickyTabsReady = '1';

  if (!document.querySelector('style[data-dashboard-sticky-tabs]')) {
    const style = document.createElement('style');
    style.dataset.dashboardStickyTabs = 'true';
    style.textContent = `
      @media (max-width: 720px) {
        .dashboard-tabs {
          position: -webkit-sticky !important;
          position: sticky !important;
          top: var(--safe-area-top) !important;
          z-index: 90 !important;
          width: 100% !important;
          margin-bottom: 16px !important;
          border-color: rgba(255,255,255,.09) !important;
          background: #14171d !important;
          box-shadow: 0 10px 28px rgba(0,0,0,.28) !important;
          backdrop-filter: none !important;
          -webkit-backdrop-filter: none !important;
        }

        .dashboard-tabs.is-stuck::before {
          content: '';
          position: absolute;
          left: 50%;
          bottom: 100%;
          width: 100vw;
          height: calc(var(--safe-area-top) + 1px);
          transform: translateX(-50%);
          pointer-events: none;
          background: #14171d;
        }
      }
    `;
    document.head.appendChild(style);
  }

  const mobileQuery = window.matchMedia('(max-width: 720px)');
  let frame = 0;

  const sync = () => {
    frame = 0;

    if (!mobileQuery.matches) {
      tabs.classList.remove('is-stuck');
      return;
    }

    const stickyTop = Number.parseFloat(getComputedStyle(tabs).top) || 0;
    const stuck = window.scrollY > 0 && tabs.getBoundingClientRect().top <= stickyTop + 1;
    tabs.classList.toggle('is-stuck', stuck);
  };

  const requestSync = () => {
    if (frame) return;
    frame = requestAnimationFrame(sync);
  };

  window.addEventListener('scroll', requestSync, { passive: true });
  window.addEventListener('resize', requestSync, { passive: true });
  window.addEventListener('orientationchange', requestSync, { passive: true });
  window.addEventListener('pageshow', requestSync, { passive: true });
  window.visualViewport?.addEventListener('resize', requestSync, { passive: true });

  if (typeof mobileQuery.addEventListener === 'function') {
    mobileQuery.addEventListener('change', requestSync);
  } else if (typeof mobileQuery.addListener === 'function') {
    mobileQuery.addListener(requestSync);
  }

  requestSync();
}

async function loadOverview() {
  try {
    const { data: students, error: studentsError } = await supabase
      .from('alunos')
      .select('id,nome,status,created_at,mensalidade_valor,mensalidade_dia_vencimento,mensalidade_ativa')
      .order('created_at', { ascending: false });

    if (studentsError) throw studentsError;

    const allStudents = Array.isArray(students) ? students : [];
    const activeStudents = allStudents.filter(student => student.status === 'ativo');

    setText('#summary-active-students', activeStudents.length);

    await Promise.all([
      loadWorkoutAttention(activeStudents),
      loadFinancialOverview(activeStudents, allStudents)
    ]);

    finalizeAttention();
  } catch (error) {
    console.error('Erro ao carregar visão geral do painel:', error);
    setText('#summary-active-students', '—');
    setText('#summary-month-received', '—');
    setText('#summary-finance-pending', '—');
    const loading = document.querySelector('#attention-loading');
    if (loading) loading.textContent = 'Não foi possível carregar todas as pendências.';
  }
}

async function loadWorkoutAttention(activeStudents) {
  try {
    const { data, error } = await supabase
      .from('treinos')
      .select('alunos!inner(id)')
      .eq('personal_id', session.user.id)
      .eq('status', 'ativo');

    if (error) throw error;

    const activeWorkoutStudentIds = new Set(
      (Array.isArray(data) ? data : [])
        .map(workout => workout.alunos?.id)
        .filter(Boolean)
    );

    const count = activeStudents.filter(student => !activeWorkoutStudentIds.has(student.id)).length;
    setText('#attention-no-workout', count);
    toggleAttentionItem('#attention-no-workout-item', count > 0);
  } catch (error) {
    console.error('Erro ao carregar pendências de treino:', error);
  }
}

async function loadFinancialOverview(activeStudents, allStudents) {
  try {
    await ensureCurrentCharges(activeStudents);

    const { data, error } = await supabase
      .from('mensalidades_alunos')
      .select('id,aluno_id,competencia,vencimento,valor,status,informado_em,confirmado_em,created_at,updated_at')
      .eq('personal_id', session.user.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const payments = Array.isArray(data) ? data : [];
    const competence = currentCompetence();
    const today = todayIso();
    const monthPayments = payments.filter(item => item.competencia === competence);
    const received = monthPayments.filter(item => item.status === 'pago');
    const overdue = payments.filter(item => item.status === 'pendente' && item.vencimento < today);
    const waiting = payments.filter(item => item.status === 'informado');
    const dueToday = payments.filter(item => item.status === 'pendente' && item.vencimento === today);

    setText('#summary-month-received', formatCurrency(received.reduce((sum, item) => sum + Number(item.valor || 0), 0)));
    setText('#summary-finance-pending', overdue.length + waiting.length);

    setText('#attention-overdue', overdue.length);
    setText('#attention-waiting', waiting.length);
    setText('#attention-due-today', dueToday.length);

    toggleAttentionItem('#attention-overdue-item', overdue.length > 0);
    toggleAttentionItem('#attention-waiting-item', waiting.length > 0);
    toggleAttentionItem('#attention-due-today-item', dueToday.length > 0);

    renderRecentActivity(allStudents, payments);
  } catch (error) {
    console.error('Erro ao carregar resumo financeiro do painel:', error);
    setText('#summary-month-received', '—');
    setText('#summary-finance-pending', '—');
    renderRecentActivity(allStudents, []);
  }
}

async function ensureCurrentCharges(activeStudents) {
  const competence = currentCompetence();
  const eligibleStudents = activeStudents.filter(student =>
    student.mensalidade_ativa &&
    Number(student.mensalidade_valor) > 0 &&
    Number(student.mensalidade_dia_vencimento) > 0
  );

  if (!eligibleStudents.length) return;

  const { data: existing, error: existingError } = await supabase
    .from('mensalidades_alunos')
    .select('aluno_id')
    .eq('personal_id', session.user.id)
    .eq('competencia', competence);

  if (existingError) throw existingError;

  const existingIds = new Set((existing || []).map(item => item.aluno_id));
  const rows = eligibleStudents
    .filter(student => !existingIds.has(student.id))
    .map(student => ({
      personal_id: session.user.id,
      aluno_id: student.id,
      competencia: competence,
      vencimento: dueDateForDay(student.mensalidade_dia_vencimento, competence),
      valor: Number(student.mensalidade_valor),
      status: 'pendente'
    }));

  if (!rows.length) return;

  const { error } = await supabase
    .from('mensalidades_alunos')
    .upsert(rows, { onConflict: 'aluno_id,competencia', ignoreDuplicates: true });

  if (error) throw error;
}

function renderRecentActivity(students, payments) {
  const container = document.querySelector('#dashboard-activity-list');
  if (!container) return;

  const studentMap = new Map(students.map(student => [student.id, student]));
  const events = [];

  students.forEach(student => {
    if (!student.created_at) return;
    events.push({
      type: 'student',
      icon: '👤',
      title: 'Novo aluno cadastrado',
      detail: student.nome || 'Aluno',
      at: student.created_at
    });
  });

  payments.forEach(payment => {
    const studentName = studentMap.get(payment.aluno_id)?.nome || 'Aluno';

    if (payment.confirmado_em) {
      events.push({
        type: 'payment',
        icon: '✓',
        title: 'Pagamento confirmado',
        detail: `${studentName} · ${formatCurrency(payment.valor)}`,
        at: payment.confirmado_em
      });
      return;
    }

    if (payment.status === 'informado' && payment.informado_em) {
      events.push({
        type: 'payment',
        icon: '💰',
        title: 'Pagamento informado',
        detail: `${studentName} · ${formatCurrency(payment.valor)}`,
        at: payment.informado_em
      });
    }
  });

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const recent = events.slice(0, 6);

  container.innerHTML = recent.length
    ? recent.map(event => `
        <div class="dashboard-activity-item">
          <span class="dashboard-activity-icon" aria-hidden="true">${escapeHtml(event.icon)}</span>
          <div class="dashboard-activity-copy">
            <strong>${escapeHtml(event.title)}</strong>
            <span>${escapeHtml(event.detail)}</span>
          </div>
          <time datetime="${escapeHtml(event.at)}">${escapeHtml(formatRelativeTime(event.at))}</time>
        </div>`).join('')
    : '<p class="dashboard-empty">As atividades recentes aparecerão aqui.</p>';
}

function finalizeAttention() {
  const card = document.querySelector('.attention-card');
  const loading = document.querySelector('#attention-loading');
  const empty = document.querySelector('#attention-empty');
  const items = Array.from(document.querySelectorAll('[data-attention-item]'));
  const hasVisibleItems = items.some(item => !item.hidden);

  if (loading) loading.hidden = true;
  if (empty) empty.hidden = true;
  if (card) card.hidden = !hasVisibleItems;
}

function toggleAttentionItem(selector, visible) {
  const element = document.querySelector(selector);
  if (element) element.hidden = !visible;
}

function currentCompetence() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function dueDateForDay(day, competence = currentCompetence()) {
  const [year, month] = competence.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(Math.max(Number(day || 1), 1), lastDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2
  });
}

function formatRelativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return 'Agora';
  if (diffMinutes < 60) return `${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `${diffDays} dias`;

  return date.toLocaleDateString('pt-BR');
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function escapeHtml(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}
