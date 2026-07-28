import { supabase } from './supabase.js';
import { requireSession } from './layout.js';

setupDashboardStickyTabs();
setupHomeDashboard();

const session = await requireSession();

if (session) {
  await loadOverview();
}

function setupHomeDashboard() {
  const tabs = document.querySelector('.dashboard-tabs');
  const overviewTab = document.querySelector('[data-dashboard-tab="overview"]');
  const overviewPanel = document.querySelector('#dashboard-overview-panel');
  if (!tabs || !overviewTab || !overviewPanel || document.querySelector('#dashboard-home-panel')) return;

  document.documentElement.classList.add('dashboard-legacy-home');


  const pageHeader = document.querySelector('.page-header');
  const greeting = document.querySelector('#dashboard-user-greeting');
  if (pageHeader) {
    pageHeader.classList.add('dashboard-home-header');
    pageHeader.querySelector('h1')?.remove();
    const subtitle = pageHeader.querySelector('div > p:not(#dashboard-user-greeting)');
    subtitle?.remove();
    if (!pageHeader.querySelector('.dashboard-welcome-line')) {
      const welcome = document.createElement('p');
      welcome.className = 'dashboard-welcome-line';
      welcome.textContent = 'Vamos começar seu dia.';
      greeting?.after(welcome);
    }
  }

  const homeTab = document.createElement('button');
  homeTab.id = 'dashboard-tab-home';
  homeTab.className = 'dashboard-tab';
  homeTab.type = 'button';
  homeTab.setAttribute('role', 'tab');
  homeTab.setAttribute('aria-selected', 'false');
  homeTab.setAttribute('aria-controls', 'dashboard-home-panel');
  homeTab.tabIndex = -1;
  homeTab.innerHTML = '<span aria-hidden="true">⌂</span><span>Início</span>';
  tabs.insertBefore(homeTab, overviewTab);

  const homePanel = document.createElement('section');
  homePanel.id = 'dashboard-home-panel';
  homePanel.className = 'dashboard-home-panel dashboard-tab-panel';
  homePanel.setAttribute('role', 'tabpanel');
  homePanel.setAttribute('aria-labelledby', 'dashboard-tab-home');
  homePanel.hidden = true;
  homePanel.innerHTML = `
    <article class="card home-ready-card">
      <span class="home-ready-icon" aria-hidden="true">✓</span>
      <div class="home-ready-copy">
        <strong id="home-ready-title">Tudo pronto para hoje</strong>
        <span id="home-ready-copy">Carregando seu resumo do dia...</span>
      </div>
    </article>

    <article class="card home-next-card">
      <small class="home-card-kicker">Próximo atendimento</small>
      <div class="home-next-main">
        <div class="home-next-info">
          <div class="home-next-line"><strong id="home-next-time" class="home-next-time">—</strong><span class="home-next-dot">•</span><strong id="home-next-name" class="home-next-name">Carregando...</strong></div>
          <span id="home-next-workout" class="home-next-workout">Consultando agenda de hoje</span>
        </div>
        <span id="home-next-avatar" class="home-next-avatar" aria-hidden="true">FS</span>
      </div>
      <div class="home-next-actions">
        <a id="home-next-student-link" class="home-mini-action" href="alunos.html">Ver aluno</a>
        <a class="home-mini-action secondary" href="agenda.html">Abrir agenda</a>
      </div>
    </article>

    <section class="home-quick-grid" aria-label="Atalhos rápidos">
      <a class="card home-quick-action" href="alunos.html" data-premium-link><span class="home-quick-icon" aria-hidden="true">＋</span><strong>Novo aluno</strong><small>Cadastrar aluno</small></a>
      <a class="card home-quick-action" href="alunos.html" data-premium-link><span class="home-quick-icon" aria-hidden="true">◇</span><strong>Criar treino</strong><small>Escolher aluno</small></a>
      <a class="card home-quick-action" href="agenda.html" data-premium-link><span class="home-quick-icon" aria-hidden="true">▦</span><strong>Agendar</strong><small>Novo atendimento</small></a>
    </section>

    <section class="home-summary-grid" aria-label="Resumo rápido">
      <article class="card home-summary-card"><span class="home-summary-icon" aria-hidden="true">👥</span><div class="home-summary-copy"><strong id="home-summary-active">—</strong><span>alunos ativos</span></div></article>
      <article class="card home-summary-card"><span class="home-summary-icon" aria-hidden="true">R$</span><div class="home-summary-copy"><strong id="home-summary-received">—</strong><span>recebidos no mês</span></div></article>
    </section>

    <button id="home-review-card" class="card home-review-card" type="button">
      <div class="home-review-copy"><strong id="home-review-title">Itens para revisar</strong><span id="home-review-detail">Carregando pendências...</span><small>Ver na visão geral</small></div>
      <span class="home-review-arrow" aria-hidden="true">›</span>
    </button>
  `;
  overviewPanel.before(homePanel);

  const legacyTabs = Array.from(tabs.querySelectorAll('[data-dashboard-tab]'));
  const legacyPanels = ['dashboard-overview-panel', 'dashboard-agenda-panel', 'dashboard-live-panel']
    .map(id => document.getElementById(id))
    .filter(Boolean);

  const activateHome = (shouldFocus = false) => {
    legacyTabs.forEach(tab => {
      tab.setAttribute('aria-selected', 'false');
      tab.tabIndex = -1;
    });
    legacyPanels.forEach(panel => { panel.hidden = true; });
    homeTab.setAttribute('aria-selected', 'true');
    homeTab.tabIndex = 0;
    homePanel.hidden = false;
    if (shouldFocus) homeTab.focus();
  };

  homeTab.addEventListener('click', () => activateHome());
  homeTab.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight' || event.key === 'End') {
      event.preventDefault();
      overviewTab.click();
      overviewTab.focus();
    }
  });

  legacyTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      homeTab.setAttribute('aria-selected', 'false');
      homeTab.tabIndex = -1;
      homePanel.hidden = true;
    });
  });

  document.querySelector('#home-review-card')?.addEventListener('click', () => {
    overviewTab.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  overviewPanel.querySelector('.dashboard-day-snapshot')?.setAttribute('aria-hidden', 'true');
  overviewPanel.querySelector('.quick-actions')?.setAttribute('aria-hidden', 'true');

  const syncHome = () => {
    const todayRaw = document.querySelector('#dashboard-agenda-tab-count')?.textContent?.trim() || '—';
    const liveRaw = document.querySelector('#dashboard-live-tab-count')?.textContent?.trim() || '0';
    const activeRaw = document.querySelector('#summary-active-students')?.textContent?.trim() || '—';
    const receivedRaw = document.querySelector('#summary-month-received')?.textContent?.trim() || '—';
    const attentionRaw = document.querySelector('#attention-total-count')?.textContent?.trim() || '0';
    const live = Number(liveRaw);

    setHomeText('#home-summary-active', activeRaw);
    setHomeText('#home-summary-received', receivedRaw);

    if (Number.isFinite(live) && live > 0) {
      setHomeText('#home-ready-title', live === 1 ? 'Você tem uma aula em andamento' : 'Você tem aulas em andamento');
      setHomeText('#home-ready-copy', `${live} aluno${live === 1 ? '' : 's'} em acompanhamento agora. ${todayRaw} atendimento${todayRaw === '1' ? '' : 's'} programado${todayRaw === '1' ? '' : 's'} hoje.`);
    } else {
      setHomeText('#home-ready-title', 'Tudo pronto para hoje');
      setHomeText('#home-ready-copy', `${todayRaw} atendimento${todayRaw === '1' ? '' : 's'} programado${todayRaw === '1' ? '' : 's'} e nenhum aluno em aula agora.`);
    }

    const attention = Number(attentionRaw);
    setHomeText('#home-review-title', Number.isFinite(attention) && attention > 0 ? `${attention} ${attention === 1 ? 'item' : 'itens'} para revisar` : 'Tudo em dia');

    const attentionParts = [];
    const noWorkout = document.querySelector('#attention-no-workout-item');
    const overdue = document.querySelector('#attention-overdue-item');
    const waiting = document.querySelector('#attention-waiting-item');
    if (noWorkout && !noWorkout.hidden) attentionParts.push(`${document.querySelector('#attention-no-workout')?.textContent || '0'} sem treino`);
    if (overdue && !overdue.hidden) attentionParts.push(`${document.querySelector('#attention-overdue')?.textContent || '0'} mensalidades vencidas`);
    if (waiting && !waiting.hidden) attentionParts.push(`${document.querySelector('#attention-waiting')?.textContent || '0'} pagamentos para confirmar`);
    setHomeText('#home-review-detail', attentionParts.length ? attentionParts.slice(0, 2).join(' • ') : 'Nenhuma pendência importante agora.');

    syncHomeNextAppointment();
  };

  const syncHomeNextAppointment = () => {
    const list = document.querySelector('#today-list');
    const rows = Array.from(list?.querySelectorAll('.today-entry') || []);
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const parseMinutes = value => {
      const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
      return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    };
    const nextRow = rows.find(row => {
      const minutes = parseMinutes(row.querySelector('.today-time')?.textContent);
      return minutes !== null && minutes >= nowMinutes;
    });

    if (!nextRow) {
      setHomeText('#home-next-time', '—');
      setHomeText('#home-next-name', rows.length ? 'Agenda concluída' : 'Agenda livre');
      setHomeText('#home-next-workout', rows.length ? 'Nenhum atendimento restante hoje' : 'Nenhum atendimento programado para hoje');
      setHomeText('#home-next-avatar', '✓');
      const studentLink = document.querySelector('#home-next-student-link');
      if (studentLink) {
        studentLink.href = 'alunos.html';
        studentLink.textContent = 'Ver alunos';
      }
      return;
    }

    const time = nextRow.querySelector('.today-time')?.textContent?.trim() || '—';
    const name = nextRow.querySelector('.today-entry-main strong')?.textContent?.trim() || 'Aluno';
    const workout = nextRow.querySelector('.today-entry-main span')?.textContent?.trim() || 'Treino ativo';
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase() || 'A';
    setHomeText('#home-next-time', time);
    setHomeText('#home-next-name', name);
    setHomeText('#home-next-workout', workout);
    setHomeText('#home-next-avatar', initials);

    const studentLink = document.querySelector('#home-next-student-link');
    if (studentLink) {
      studentLink.textContent = 'Ver aluno';
      studentLink.href = nextRow.tagName === 'A' && nextRow.getAttribute('href') ? nextRow.getAttribute('href') : 'alunos.html';
    }
  };

  const observe = selector => {
    const element = document.querySelector(selector);
    if (element) new MutationObserver(syncHome).observe(element, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['hidden'] });
  };

  ['#dashboard-agenda-tab-count','#dashboard-live-tab-count','#summary-active-students','#summary-month-received','#attention-total-count','#today-list','#attention-no-workout-item','#attention-overdue-item','#attention-waiting-item'].forEach(observe);
  syncHome();
  activateHome();
}

function setHomeText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function setupDashboardStickyTabs() {
  const tabs = document.querySelector('.dashboard-tabs');
  if (!tabs || tabs.dataset.stickyTabsReady === '1') return;

  tabs.dataset.stickyTabsReady = '1';


  let topCover = document.querySelector('.dashboard-tabs-top-cover');
  if (!topCover) {
    topCover = document.createElement('div');
    topCover.className = 'dashboard-tabs-top-cover';
    topCover.setAttribute('aria-hidden', 'true');
    document.body.appendChild(topCover);
  }

  const mobileQuery = window.matchMedia('(max-width: 720px)');
  let frame = 0;

  const sync = () => {
    frame = 0;

    if (!mobileQuery.matches) {
      tabs.classList.remove('is-stuck');
      topCover.classList.remove('is-visible');
      topCover.style.height = '0px';
      return;
    }

    const stickyTop = Number.parseFloat(getComputedStyle(tabs).top) || 0;
    const rect = tabs.getBoundingClientRect();
    const stuck = window.scrollY > 0 && rect.top <= stickyTop + 1;

    tabs.classList.toggle('is-stuck', stuck);
    topCover.classList.toggle('is-visible', stuck);
    topCover.style.height = stuck ? `${Math.max(0, Math.ceil(rect.top))}px` : '0px';
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
  window.visualViewport?.addEventListener('scroll', requestSync, { passive: true });

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
