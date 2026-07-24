import { supabase } from './supabase.js';
import { requireSession } from './layout.js';

const homePanel = await waitForElement('#dashboard-home-panel');

if (homePanel) {
  const session = await requireSession();
  if (session) initializeHome(session);
}

async function initializeHome(session) {
  injectStyles();
  renderHomeShell();
  updateGreetingDate();

  let scheduleEntries = [];
  let selectedLiveIndex = 0;
  let selectedLiveSessionId = '';
  let touchStartX = null;
  let touchStartY = null;

  const liveList = document.querySelector('#live-students-list');
  const nowCard = document.querySelector('#home-now-card');
  const nowAction = document.querySelector('#home-now-action');
  const reviewCard = document.querySelector('#home-review-card');
  const overviewTab = document.querySelector('[data-dashboard-tab="overview"]');

  const normalizeName = value => String(value || '').trim().toLocaleLowerCase('pt-BR');

  function getLiveStudents() {
    return [...document.querySelectorAll('#live-students-list [data-open-live-session]')].map(row => ({
      sessionId: row.dataset.openLiveSession || '',
      name: row.querySelector('.live-student-main strong')?.textContent?.trim() || 'Aluno',
      meta: row.querySelector('.live-student-main small')?.textContent?.trim() || 'Aula em acompanhamento',
      pending: row.classList.contains('pending'),
      row
    }));
  }

  function currentUpcomingEntries() {
    const now = new Date();
    return scheduleEntries
      .filter(entry => {
        if (!entry.date) return false;
        const date = parseDateValue(entry.date);
        const minutes = timeToMinutes(entry.time);
        if (!isSameDate(date, now)) return date > startOfDay(now);
        if (minutes == null) return true;
        return minutes >= now.getHours() * 60 + now.getMinutes();
      })
      .sort(compareScheduleEntries);
  }

  function renderHero() {
    const liveStudents = getLiveStudents();
    const title = document.querySelector('#home-now-title');
    const status = document.querySelector('#home-now-status');
    const personRow = document.querySelector('.home-now-person');
    const person = document.querySelector('#home-now-person-text');
    const meta = document.querySelector('#home-now-meta');
    const icon = document.querySelector('#home-now-icon');
    const indicators = document.querySelector('#home-now-indicators');
    const swipeHint = document.querySelector('#home-now-swipe-hint');

    if (!title || !status || !person || !meta || !icon || !nowAction || !indicators || !swipeHint) return;

    if (liveStudents.length) {
      if (selectedLiveSessionId) {
        const retainedIndex = liveStudents.findIndex(item => item.sessionId === selectedLiveSessionId);
        if (retainedIndex >= 0) selectedLiveIndex = retainedIndex;
      }

      selectedLiveIndex = Math.min(Math.max(selectedLiveIndex, 0), liveStudents.length - 1);
      const student = liveStudents[selectedLiveIndex];
      selectedLiveSessionId = student.sessionId;

      icon.textContent = student.pending ? '!' : '⌁';
      title.textContent = student.name;
      status.textContent = liveStudents.length === 1
        ? (student.pending ? '1 aluno aguardando confirmação agora' : '1 aluno em acompanhamento agora')
        : `${liveStudents.length} alunos em acompanhamento agora`;
      if (personRow) personRow.hidden = true;
      person.textContent = '';
      meta.textContent = student.meta;
      nowAction.hidden = false;
      nowAction.textContent = student.pending ? 'Revisar solicitação  →' : 'Acompanhar aula  →';
      nowAction.dataset.mode = 'live';
      nowAction.dataset.sessionId = student.sessionId;

      indicators.innerHTML = liveStudents.length > 1
        ? liveStudents.map((_, index) => `<span class="home-now-dot${index === selectedLiveIndex ? ' active' : ''}"></span>`).join('')
        : '';
      indicators.hidden = liveStudents.length <= 1;
      swipeHint.hidden = liveStudents.length <= 1;
      swipeHint.textContent = `${selectedLiveIndex + 1} de ${liveStudents.length} · arraste para o lado para trocar de aluno`;
      return;
    }

    selectedLiveIndex = 0;
    selectedLiveSessionId = '';
    indicators.hidden = true;
    indicators.innerHTML = '';
    swipeHint.hidden = true;

    const next = currentUpcomingEntries()[0];
    if (next) {
      icon.textContent = '◷';
      title.textContent = next.name;
      status.textContent = `${relativeDayLabel(next.date)}${next.time ? ` às ${formatTime(next.time)}` : ''}`;
      if (personRow) personRow.hidden = false;
      person.textContent = 'Próximo atendimento';
      meta.textContent = next.workout || 'Atendimento agendado';
      nowAction.hidden = false;
      nowAction.textContent = 'Ver atendimento  →';
      nowAction.dataset.mode = 'appointment';
      nowAction.dataset.href = next.href;
      delete nowAction.dataset.sessionId;
      return;
    }

    icon.textContent = '✓';
    title.textContent = 'Tudo em dia por agora';
    status.textContent = 'Nenhum atendimento próximo na agenda.';
    if (personRow) personRow.hidden = false;
    person.textContent = 'Sua agenda está livre';
    meta.textContent = 'Os próximos compromissos aparecerão aqui automaticamente.';
    nowAction.hidden = true;
    delete nowAction.dataset.mode;
    delete nowAction.dataset.sessionId;
    delete nowAction.dataset.href;
  }

  function renderUpcoming() {
    const list = document.querySelector('#home-upcoming-list');
    if (!list) return;

    const upcoming = currentUpcomingEntries().slice(0, 3);
    if (!upcoming.length) {
      list.innerHTML = '<p class="home-upcoming-empty">Nenhum atendimento próximo na agenda.</p>';
      return;
    }

    list.innerHTML = upcoming.map(entry => `
      <a class="home-upcoming-item" href="${escapeHtml(entry.href)}">
        <div class="home-upcoming-time">
          <small>${escapeHtml(relativeDayLabel(entry.date))}</small>
          <strong>${escapeHtml(formatTime(entry.time))}</strong>
        </div>
        <div class="home-upcoming-main">
          <strong>${escapeHtml(entry.name)}</strong>
          <span>${escapeHtml(entry.workout || 'Atendimento agendado')}</span>
        </div>
        <span class="home-upcoming-arrow" aria-hidden="true">›</span>
      </a>`).join('');
  }

  function syncDaySummary() {
    const today = new Date();
    const todayKey = formatDateValue(today);
    const todayEntries = scheduleEntries.filter(entry => entry.date === todayKey);
    const liveStudents = getLiveStudents();
    const liveNames = new Set(liveStudents.filter(item => !item.pending).map(item => normalizeName(item.name)));
    const nowMinutes = today.getHours() * 60 + today.getMinutes();

    const completed = todayEntries.filter(entry => {
      const minutes = timeToMinutes(entry.time);
      return minutes != null && minutes < nowMinutes && !liveNames.has(normalizeName(entry.name));
    }).length;

    const live = liveStudents.filter(item => !item.pending).length;
    const total = Math.max(todayEntries.length, completed + live);

    setText('#home-day-completed', String(completed));
    setText('#home-day-live', String(live));
    setText('#home-day-total', String(total));

    const completedPercent = total ? Math.min(100, completed / total * 100) : 0;
    const livePercent = total ? Math.min(100 - completedPercent, live / total * 100) : 0;
    const completedBar = document.querySelector('#home-day-progress-done');
    const liveBar = document.querySelector('#home-day-progress-live');
    if (completedBar) completedBar.style.width = `${completedPercent}%`;
    if (liveBar) liveBar.style.width = `${livePercent}%`;
  }

  function syncReviewAndSummary() {
    const active = document.querySelector('#summary-active-students')?.textContent?.trim() || '—';
    const received = document.querySelector('#summary-month-received')?.textContent?.trim() || '—';
    const attention = Number(document.querySelector('#attention-total-count')?.textContent?.trim() || 0);

    setText('#home-summary-active', active);
    setText('#home-summary-received', received);
    setText('#home-review-title', Number.isFinite(attention) && attention > 0
      ? `${attention} ${attention === 1 ? 'item' : 'itens'} para revisar`
      : 'Tudo em dia');

    const parts = [];
    const attentionItems = [
      ['#attention-no-workout-item', '#attention-no-workout', 'sem treino'],
      ['#attention-overdue-item', '#attention-overdue', 'mensalidades vencidas'],
      ['#attention-waiting-item', '#attention-waiting', 'pagamentos para confirmar'],
      ['#attention-due-today-item', '#attention-due-today', 'mensalidades vencendo hoje']
    ];

    attentionItems.forEach(([itemSelector, valueSelector, label]) => {
      const item = document.querySelector(itemSelector);
      if (!item || item.hidden) return;
      const value = document.querySelector(valueSelector)?.textContent?.trim() || '0';
      parts.push(`${value} ${label}`);
    });

    setText('#home-review-detail', parts.length ? parts.slice(0, 2).join(' • ') : 'Nenhuma pendência importante agora.');
  }

  function syncAll() {
    renderHero();
    renderUpcoming();
    syncDaySummary();
    syncReviewAndSummary();
  }

  async function reloadAgenda() {
    scheduleEntries = await loadUpcomingAgenda(session.user.id);
    syncAll();
  }

  nowAction?.addEventListener('click', () => {
    if (nowAction.dataset.mode === 'live') {
      const sessionId = nowAction.dataset.sessionId;
      const liveRow = [...document.querySelectorAll('#live-students-list [data-open-live-session]')]
        .find(row => row.dataset.openLiveSession === sessionId);
      liveRow?.click();
      return;
    }

    if (nowAction.dataset.mode === 'appointment' && nowAction.dataset.href) {
      window.location.href = nowAction.dataset.href;
    }
  });

  reviewCard?.addEventListener('click', () => {
    overviewTab?.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  nowCard?.addEventListener('touchstart', event => {
    if (getLiveStudents().length <= 1) return;
    const touch = event.touches[0];
    touchStartX = touch?.clientX ?? null;
    touchStartY = touch?.clientY ?? null;
  }, { passive: true });

  nowCard?.addEventListener('touchend', event => {
    const liveStudents = getLiveStudents();
    if (liveStudents.length <= 1 || touchStartX == null || touchStartY == null) return;

    const touch = event.changedTouches[0];
    const endX = touch?.clientX ?? touchStartX;
    const endY = touch?.clientY ?? touchStartY;
    const deltaX = endX - touchStartX;
    const deltaY = endY - touchStartY;
    touchStartX = null;
    touchStartY = null;

    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) <= Math.abs(deltaY)) return;

    selectedLiveIndex = deltaX < 0
      ? (selectedLiveIndex + 1) % liveStudents.length
      : (selectedLiveIndex - 1 + liveStudents.length) % liveStudents.length;
    selectedLiveSessionId = liveStudents[selectedLiveIndex]?.sessionId || '';

    nowCard.classList.remove('is-swipe-changing');
    void nowCard.offsetWidth;
    nowCard.classList.add('is-swipe-changing');
    window.setTimeout(() => nowCard.classList.remove('is-swipe-changing'), 180);
    renderHero();
  }, { passive: true });

  const observedSelectors = [
    '#summary-active-students',
    '#summary-month-received',
    '#attention-total-count',
    '#attention-no-workout-item',
    '#attention-overdue-item',
    '#attention-waiting-item',
    '#attention-due-today-item'
  ];

  observedSelectors.forEach(selector => {
    const element = document.querySelector(selector);
    if (!element) return;
    new MutationObserver(syncReviewAndSummary).observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['hidden']
    });
  });

  if (liveList) {
    new MutationObserver(() => {
      const liveStudents = getLiveStudents();
      if (selectedLiveSessionId && !liveStudents.some(item => item.sessionId === selectedLiveSessionId)) {
        selectedLiveIndex = 0;
        selectedLiveSessionId = '';
      }
      renderHero();
      syncDaySummary();
    }).observe(liveList, { childList: true, subtree: true });
  }

  await reloadAgenda();
  syncAll();

  window.setInterval(syncAll, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reloadAgenda().catch(console.error);
  });
}

function renderHomeShell() {
  if (!homePanel) return;
  homePanel.classList.add('home-redesign');
  homePanel.innerHTML = `
    <article id="home-now-card" class="card home-now-card" aria-live="polite">
      <div class="home-now-content">
        <span id="home-now-icon" class="home-now-icon" aria-hidden="true">⌁</span>
        <div class="home-now-copy">
          <small class="home-card-kicker">AGORA</small>
          <h2 id="home-now-title">Carregando seu dia...</h2>
          <p id="home-now-status" class="home-now-status">Consultando agenda e aulas em andamento.</p>
          <div class="home-now-person"><span aria-hidden="true">♙</span><span id="home-now-person-text">FS Fit</span></div>
          <span id="home-now-meta" class="home-now-meta">Sincronizando informações</span>
          <div id="home-now-indicators" class="home-now-indicators" hidden></div>
          <small id="home-now-swipe-hint" class="home-now-swipe-hint" hidden></small>
        </div>
      </div>
      <button id="home-now-action" class="home-now-action" type="button">Acompanhar aula →</button>
    </article>

    <article class="card home-day-card">
      <h2 class="home-section-title">Seu dia</h2>
      <div class="home-day-summary">
        <span><i class="home-day-dot done"></i><strong id="home-day-completed">0</strong> concluídos</span>
        <span><i class="home-day-dot live"></i><strong id="home-day-live">0</strong> em andamento</span>
        <span><i class="home-day-dot"></i><strong id="home-day-total">0</strong> atendimentos</span>
      </div>
      <div class="home-day-progress" aria-hidden="true">
        <span id="home-day-progress-done" class="home-day-progress-done"></span>
        <span id="home-day-progress-live" class="home-day-progress-live"></span>
      </div>
    </article>

    <article class="card home-upcoming-card">
      <h2 class="home-section-title">Próximos da agenda</h2>
      <div id="home-upcoming-list" class="home-upcoming-list"><p class="home-upcoming-empty">Carregando próximos atendimentos...</p></div>
    </article>

    <button id="home-review-card" class="card home-review-card" type="button">
      <span class="home-review-leading">
        <span class="home-review-icon" aria-hidden="true">▣</span>
        <span class="home-review-copy">
          <strong id="home-review-title">Itens para revisar</strong>
          <span id="home-review-detail">Carregando pendências...</span>
        </span>
      </span>
      <span class="home-review-link">Ver detalhes ›</span>
    </button>

    <article class="card home-summary-strip" aria-label="Resumo rápido">
      <div class="home-summary-item">
        <span class="home-summary-icon" aria-hidden="true">♟♟</span>
        <div class="home-summary-copy"><strong id="home-summary-active">—</strong><span>alunos ativos</span></div>
      </div>
      <div class="home-summary-item">
        <span class="home-summary-icon" aria-hidden="true">R$</span>
        <div class="home-summary-copy"><strong id="home-summary-received">—</strong><span>recebidos no mês</span></div>
      </div>
    </article>`;
}

async function loadUpcomingAgenda(personalId) {
  const today = startOfDay(new Date());
  const end = new Date(today);
  end.setDate(end.getDate() + 14);
  const startValue = formatDateValue(today);
  const endValue = formatDateValue(end);

  try {
    const [workoutsResult, appointmentsResult, cancellationsResult] = await Promise.all([
      supabase
        .from('treinos')
        .select('id,nome,dias_semana,status,updated_at,alunos!inner(id,nome,periodo_aula,horario_aula,local_aula)')
        .eq('personal_id', personalId)
        .eq('status', 'ativo')
        .order('updated_at', { ascending: false }),
      supabase
        .from('agenda_agendamentos')
        .select('id,aluno_id,treino_id,data,horario,local,titulo,alunos(id,nome),treinos(id,nome)')
        .eq('personal_id', personalId)
        .gte('data', startValue)
        .lte('data', endValue)
        .order('data')
        .order('horario'),
      supabase
        .from('agenda_cancelamentos')
        .select('aluno_id,data')
        .eq('personal_id', personalId)
        .gte('data', startValue)
        .lte('data', endValue)
    ]);

    if (workoutsResult.error) throw workoutsResult.error;
    if (appointmentsResult.error) console.error('Erro ao carregar agendamentos manuais do início:', appointmentsResult.error);
    if (cancellationsResult.error) console.error('Erro ao carregar cancelamentos do início:', cancellationsResult.error);

    const recurring = [];
    const seen = new Set();
    (workoutsResult.data || []).forEach(workout => {
      const student = workout.alunos;
      if (!student?.id || !Array.isArray(workout.dias_semana)) return;
      workout.dias_semana.forEach(day => {
        const dayNumber = Number(day);
        if (!Number.isInteger(dayNumber) || dayNumber < 0 || dayNumber > 6) return;
        const key = `${student.id}:${dayNumber}`;
        if (seen.has(key)) return;
        seen.add(key);
        recurring.push({
          day: dayNumber,
          studentId: String(student.id),
          name: student.nome || 'Aluno',
          time: student.horario_aula,
          workout: workout.nome || 'Treino ativo',
          location: student.local_aula || '',
          manual: false
        });
      });
    });

    const manualByDate = new Map();
    (appointmentsResult.data || []).forEach(row => {
      if (!manualByDate.has(row.data)) manualByDate.set(row.data, []);
      manualByDate.get(row.data).push({
        date: row.data,
        studentId: String(row.aluno_id || ''),
        name: row.alunos?.nome || 'Aluno',
        time: row.horario,
        workout: row.titulo || row.treinos?.nome || 'Agendamento',
        location: row.local || '',
        manual: true
      });
    });

    const cancellations = new Set((cancellationsResult.data || []).map(row => `${row.data}:${String(row.aluno_id || '')}`));
    const result = [];

    for (let cursor = new Date(today); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const dateValue = formatDateValue(cursor);
      const manualEntries = manualByDate.get(dateValue) || [];
      const manualStudentIds = new Set(manualEntries.map(entry => entry.studentId));

      recurring.forEach(entry => {
        if (entry.day !== cursor.getDay()) return;
        if (cancellations.has(`${dateValue}:${entry.studentId}`)) return;
        if (manualStudentIds.has(entry.studentId)) return;
        result.push(toConcreteScheduleEntry(entry, dateValue));
      });

      manualEntries.forEach(entry => result.push(toConcreteScheduleEntry(entry, dateValue)));
    }

    return result.sort(compareScheduleEntries);
  } catch (error) {
    console.error('Erro ao carregar próximos atendimentos do início:', error);
    return [];
  }
}

function toConcreteScheduleEntry(entry, date) {
  return {
    ...entry,
    date,
    href: `ficha-aluno.html?id=${encodeURIComponent(entry.studentId)}&origem=agenda&data=${encodeURIComponent(date)}`
  };
}

function compareScheduleEntries(a, b) {
  const dateCompare = String(a.date).localeCompare(String(b.date));
  if (dateCompare) return dateCompare;
  const aMinutes = timeToMinutes(a.time);
  const bMinutes = timeToMinutes(b.time);
  if (aMinutes == null && bMinutes == null) return String(a.name).localeCompare(String(b.name), 'pt-BR');
  if (aMinutes == null) return 1;
  if (bMinutes == null) return -1;
  return aMinutes - bMinutes || String(a.name).localeCompare(String(b.name), 'pt-BR');
}

function updateGreetingDate() {
  const line = document.querySelector('.dashboard-welcome-line');
  if (!line) return;
  const label = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(new Date());
  line.textContent = capitalize(label);
}

function relativeDayLabel(value) {
  const date = parseDateValue(value);
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (isSameDate(date, today)) return 'Hoje';
  if (isSameDate(date, tomorrow)) return 'Amanhã';

  return capitalize(new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit'
  }).format(date).replace(',', ''));
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : '—';
}

function timeToMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function formatDateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDateValue(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDate(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function capitalize(value = '') {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function waitForElement(selector, timeout = 5000) {
  const existing = document.querySelector(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise(resolve => {
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (!element) return;
      observer.disconnect();
      resolve(element);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector(selector));
    }, timeout);
  });
}

function injectStyles() {
  if (document.querySelector('#painel-home-redesign-styles')) return;
  const style = document.createElement('style');
  style.id = 'painel-home-redesign-styles';
  style.textContent = `
    #dashboard-home-panel.home-redesign{display:grid;gap:14px}
    #dashboard-home-panel.home-redesign[hidden]{display:none!important}
    .dashboard-home-header{margin-bottom:16px!important}
    .dashboard-home-header .dashboard-user-greeting{margin:0!important;color:var(--text)!important;font-size:1.55rem!important;font-weight:950!important;letter-spacing:-.035em!important;line-height:1.12!important}
    .dashboard-welcome-line{margin:7px 0 0!important;color:var(--muted)!important;font-size:.9rem!important}

    .home-now-card{position:relative;overflow:hidden;padding:22px!important;border-left:4px solid var(--primary)!important;background:linear-gradient(120deg,rgba(177,255,0,.1),rgba(18,28,31,.82) 48%,rgba(9,22,31,.94))!important;touch-action:pan-y}
    .home-now-card::after{content:"";position:absolute;right:-70px;bottom:-90px;width:280px;height:220px;border-radius:50%;border:1px solid rgba(177,255,0,.12);box-shadow:0 0 0 18px rgba(177,255,0,.025),0 0 0 38px rgba(177,255,0,.02),0 0 0 60px rgba(177,255,0,.015);pointer-events:none}
    .home-now-card.is-swipe-changing .home-now-copy{animation:homeSwipeFade .18s ease}
    @keyframes homeSwipeFade{0%{opacity:.45;transform:translateX(10px)}100%{opacity:1;transform:translateX(0)}}
    .home-now-content{position:relative;z-index:1;display:grid;grid-template-columns:54px minmax(0,1fr);gap:16px;align-items:start}
    .home-now-icon{display:grid;place-items:center;width:54px;height:54px;border-radius:50%;background:rgba(177,255,0,.12);color:var(--primary);font-size:1.35rem;font-weight:950;box-shadow:inset 0 0 0 1px rgba(177,255,0,.12)}
    .home-now-copy{min-width:0}
    .home-card-kicker{display:block;margin-bottom:5px;color:var(--primary);font-size:.67rem;font-weight:950;letter-spacing:.08em;text-transform:uppercase}
    .home-now-copy h2{margin:0;color:var(--text);font-size:1.55rem;font-weight:950;line-height:1.1;letter-spacing:-.03em}
    .home-now-status{margin:5px 0 0;color:var(--muted);font-size:.82rem;line-height:1.4}
    .home-now-person{display:flex;align-items:center;gap:8px;min-width:0;margin-top:13px;color:var(--text);font-size:.85rem}
    .home-now-person[hidden]{display:none!important}
    .home-now-person span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .home-now-meta{display:block;overflow:hidden;margin-top:5px;color:var(--muted);font-size:.76rem;text-overflow:ellipsis;white-space:nowrap}
    .home-now-indicators{display:flex;gap:5px;margin-top:12px}
    .home-now-indicators[hidden]{display:none!important}
    .home-now-dot{width:6px;height:6px;border-radius:999px;background:rgba(255,255,255,.25);transition:width .2s ease,background .2s ease}
    .home-now-dot.active{width:18px;background:var(--primary)}
    .home-now-swipe-hint{display:block;margin-top:6px;color:var(--muted);font-size:.62rem}
    .home-now-swipe-hint[hidden]{display:none!important}
    .home-now-action{position:relative;z-index:1;width:100%;min-height:48px;margin-top:18px;border:0;border-radius:13px;background:var(--primary);color:#07120a;font:inherit;font-size:.85rem;font-weight:950;cursor:pointer}
    .home-now-action[hidden]{display:none!important}

    .home-day-card{padding:17px 18px!important}
    .home-section-title{margin:0 0 12px;color:var(--text);font-size:1rem;font-weight:950}
    .home-day-summary{display:flex;flex-wrap:wrap;gap:8px 14px;color:var(--muted);font-size:.76rem}
    .home-day-summary span{display:inline-flex;align-items:center;gap:6px}
    .home-day-summary strong{color:inherit;font-weight:850}
    .home-day-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#77808d}
    .home-day-dot.done{background:var(--primary)}
    .home-day-dot.live{background:var(--secondary)}
    .home-day-progress{display:flex;width:100%;height:8px;margin-top:14px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.09)}
    .home-day-progress span{display:block;height:100%;transition:width .25s ease}
    .home-day-progress-done{background:var(--primary)}
    .home-day-progress-live{background:var(--secondary)}

    .home-upcoming-card{padding:18px 20px 6px!important}
    .home-upcoming-list{display:grid}
    .home-upcoming-item{display:grid;grid-template-columns:94px minmax(0,1fr) auto;gap:14px;align-items:center;min-height:70px;padding:12px 0;border-top:1px solid var(--border);color:inherit;text-decoration:none}
    .home-upcoming-item:first-child{border-top:0}
    .home-upcoming-time{min-width:0}
    .home-upcoming-time small{display:block;margin-bottom:2px;color:var(--muted);font-size:.66rem}
    .home-upcoming-time strong{display:block;color:var(--text);font-size:1rem;font-weight:950;font-variant-numeric:tabular-nums}
    .home-upcoming-main{min-width:0;padding-left:14px;border-left:1px solid var(--border)}
    .home-upcoming-main strong,.home-upcoming-main span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .home-upcoming-main strong{color:var(--text);font-size:.84rem;font-weight:900}
    .home-upcoming-main span{margin-top:3px;color:var(--muted);font-size:.7rem}
    .home-upcoming-arrow{color:var(--primary);font-size:1.2rem}
    .home-upcoming-empty{margin:0;padding:12px 0 20px;color:var(--muted);font-size:.78rem}

    .home-review-card{display:flex!important;align-items:center;justify-content:space-between;gap:14px;width:100%;padding:15px 18px!important;border-left:4px solid var(--warning)!important;background:linear-gradient(110deg,rgba(255,204,51,.07),rgba(255,204,51,.015) 55%,var(--surface))!important;cursor:pointer;text-align:left}
    .home-review-leading{display:flex;align-items:center;gap:13px;min-width:0}
    .home-review-icon{flex:0 0 auto;display:grid;place-items:center;width:42px;height:42px;border-radius:50%;background:rgba(255,204,51,.11);color:var(--warning);font-size:.95rem;font-weight:950}
    .home-review-copy{min-width:0}
    .home-review-copy strong{display:block;color:var(--text);font-size:.86rem;font-weight:950}
    .home-review-copy span{display:block;overflow:hidden;margin-top:4px;color:var(--muted);font-size:.7rem;text-overflow:ellipsis;white-space:nowrap}
    .home-review-link{flex:0 0 auto;color:var(--warning);font-size:.72rem;font-weight:900;white-space:nowrap}

    .home-summary-strip{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));padding:14px 16px!important}
    .home-summary-item{display:flex;align-items:center;gap:11px;min-width:0}
    .home-summary-item+.home-summary-item{padding-left:18px;border-left:1px solid var(--border)}
    .home-summary-icon{flex:0 0 auto;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:var(--primary-soft);color:var(--primary);font-size:.76rem;font-weight:950}
    .home-summary-copy{min-width:0}
    .home-summary-copy strong{display:block;overflow:hidden;color:var(--text);font-size:1.08rem;font-weight:950;text-overflow:ellipsis;white-space:nowrap}
    .home-summary-copy span{display:block;overflow:hidden;margin-top:2px;color:var(--muted);font-size:.66rem;text-overflow:ellipsis;white-space:nowrap}

    @media(max-width:620px){
      #dashboard-home-panel.home-redesign{gap:10px}
      .dashboard-home-header{margin-bottom:12px!important}
      .dashboard-home-header .dashboard-user-greeting{font-size:1.34rem!important}
      .dashboard-welcome-line{margin-top:5px!important;font-size:.78rem!important}
      .home-now-card{padding:16px!important}
      .home-now-content{grid-template-columns:46px minmax(0,1fr);gap:12px}
      .home-now-icon{width:46px;height:46px;font-size:1.15rem}
      .home-now-copy h2{font-size:1.28rem}
      .home-now-status{font-size:.74rem}
      .home-now-person{margin-top:10px;font-size:.78rem}
      .home-now-meta{font-size:.69rem}
      .home-now-action{min-height:44px;margin-top:14px;font-size:.78rem}
      .home-day-card{padding:14px!important}
      .home-section-title{margin-bottom:10px;font-size:.92rem}
      .home-day-summary{gap:7px 10px;font-size:.68rem}
      .home-day-progress{height:7px;margin-top:12px}
      .home-upcoming-card{padding:15px 14px 4px!important}
      .home-upcoming-item{grid-template-columns:72px minmax(0,1fr) auto;gap:10px;min-height:62px;padding:10px 0}
      .home-upcoming-time strong{font-size:.92rem}
      .home-upcoming-main{padding-left:10px}
      .home-upcoming-main strong{font-size:.78rem}
      .home-upcoming-main span{font-size:.64rem}
      .home-review-card{padding:13px 14px!important}
      .home-review-icon{width:36px;height:36px}
      .home-review-copy strong{font-size:.78rem}
      .home-review-copy span{font-size:.64rem}
      .home-review-link{font-size:.66rem}
      .home-summary-strip{padding:12px!important}
      .home-summary-item{gap:9px}
      .home-summary-item+.home-summary-item{padding-left:12px}
      .home-summary-icon{width:34px;height:34px;font-size:.67rem}
      .home-summary-copy strong{font-size:.94rem}
      .home-summary-copy span{font-size:.6rem}
    }
  `;
  document.head.appendChild(style);
}
