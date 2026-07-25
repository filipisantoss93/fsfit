import { supabase } from './supabase.js';

const PAGE = window.location.pathname.split('/').pop() || 'index.html';
const WORKOUT_GUARD_KEY = '__FSFIT_WORKOUT_PUBLICATION_GUARD__';
const STYLE_ID = 'fsfit-student-workflow-styles';

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value) {
  if (!value) return '—';
  const raw = String(value).slice(0, 10);
  const [year, month, day] = raw.split('-').map(Number);
  if (!year || !month || !day) return '—';
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : '';
}

function localIsoDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function currentCompetence() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function waitFor(getter, timeout = 10000, interval = 120) {
  return new Promise(resolve => {
    const startedAt = Date.now();
    const check = () => {
      const value = getter();
      if (value || Date.now() - startedAt >= timeout) return resolve(value || null);
      window.setTimeout(check, interval);
    };
    check();
  });
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .student-workflow-card{margin-bottom:20px;padding:20px;border-color:rgba(50,215,75,.24);background:linear-gradient(145deg,rgba(30,48,38,.42),rgba(22,26,32,.98))}
    .student-workflow-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:17px}
    .student-workflow-heading small{display:block;margin-bottom:5px;color:var(--primary);font-size:.72rem;font-weight:900;letter-spacing:.09em}
    .student-workflow-heading h2{margin:0}
    .student-workflow-progress{flex:0 0 auto;display:inline-flex;align-items:center;min-height:30px;padding:0 11px;border:1px solid rgba(50,215,75,.32);border-radius:999px;background:rgba(50,215,75,.1);color:var(--primary);font-size:.75rem;font-weight:900;white-space:nowrap}
    .student-workflow-summary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .student-workflow-summary{min-width:0;padding:15px;border:1px solid var(--border);border-radius:15px;background:rgba(255,255,255,.035)}
    .student-workflow-summary>small{display:block;margin-bottom:7px;color:var(--muted);font-size:.7rem;font-weight:900;letter-spacing:.07em}
    .student-workflow-summary strong{display:block;font-size:1rem;line-height:1.3}
    .student-workflow-summary span{display:block;margin-top:6px;color:var(--muted);font-size:.8rem;line-height:1.4}
    .student-workflow-summary .student-workflow-link{display:inline-flex;margin-top:11px;color:var(--primary);font-size:.8rem;font-weight:850;text-decoration:none}
    .student-workflow-checklist{display:grid;gap:8px;margin-top:16px}
    .student-workflow-step{display:flex;align-items:center;gap:11px;min-height:46px;padding:10px 12px;border:1px solid var(--border);border-radius:13px;background:rgba(255,255,255,.025)}
    .student-workflow-step-icon{flex:0 0 auto;display:grid;place-items:center;width:27px;height:27px;border-radius:50%;background:var(--surface-light);color:var(--muted);font-weight:900}
    .student-workflow-step.is-done .student-workflow-step-icon{background:rgba(50,215,75,.14);color:var(--primary)}
    .student-workflow-step-copy{min-width:0;flex:1}
    .student-workflow-step-copy strong{display:block;font-size:.88rem}
    .student-workflow-step-copy small{display:block;margin-top:2px;color:var(--muted);font-size:.74rem}
    .student-workflow-step a,.student-workflow-step button{flex:0 0 auto;border:0;background:transparent;color:var(--primary);font:inherit;font-size:.77rem;font-weight:850;cursor:pointer;text-decoration:none}
    .student-admin-actions{margin-top:14px;border:1px solid rgba(255,255,255,.09);border-radius:13px;background:rgba(255,255,255,.02)}
    .student-admin-actions summary{padding:12px 14px;color:var(--muted);font-size:.8rem;font-weight:800;cursor:pointer}
    .student-admin-actions-body{display:flex;gap:10px;padding:0 14px 14px}
    .student-admin-actions-body .btn{flex:1}
    .workout-draft-guidance{margin:12px 0 0;padding:11px 13px;border:1px solid rgba(255,198,52,.22);border-radius:12px;background:rgba(255,198,52,.06);color:var(--muted);font-size:.8rem;line-height:1.45}
    @media(max-width:760px){
      .student-workflow-card{padding:17px}
      .student-workflow-heading{align-items:center}
      .student-workflow-summary-grid{grid-template-columns:1fr}
      .student-workflow-step{align-items:flex-start}
      .student-workflow-step a,.student-workflow-step button{padding-top:4px}
      .student-admin-actions-body{display:grid}
    }
  `;
  document.head.appendChild(style);
}

function patchWorkoutPublicationFlow() {
  if (PAGE !== 'treino-aluno.html' || globalThis[WORKOUT_GUARD_KEY]) return;
  globalThis[WORKOUT_GUARD_KEY] = true;

  const originalFrom = supabase.from.bind(supabase);
  const originalRpc = supabase.rpc.bind(supabase);

  supabase.from = table => {
    const builder = originalFrom(table);
    if (table !== 'treinos') return builder;

    return new Proxy(builder, {
      get(target, property, receiver) {
        if (property === 'insert') {
          return (values, ...args) => {
            const normalize = row => row && typeof row === 'object'
              ? { ...row, status: row.status === 'ativo' ? 'inativo' : row.status }
              : row;
            const safeValues = Array.isArray(values) ? values.map(normalize) : normalize(values);
            return target.insert(safeValues, ...args);
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
  };

  supabase.rpc = async (functionName, args, options) => {
    if (functionName === 'fsfit_ativar_treino_aluno' && args?.p_treino_id) {
      const workoutId = args.p_treino_id;
      const [workoutResult, exerciseResult] = await Promise.all([
        originalFrom('treinos').select('id,nome,dias_semana').eq('id', workoutId).maybeSingle(),
        originalFrom('treino_exercicios').select('id,dia_semana').eq('treino_id', workoutId)
      ]);

      if (workoutResult.error) return workoutResult;
      if (exerciseResult.error) return exerciseResult;

      const exercises = exerciseResult.data || [];
      const workoutDays = (workoutResult.data?.dias_semana || []).map(Number);
      const configuredDays = new Set(exercises.map(item => Number(item.dia_semana)));
      const missingDays = workoutDays.filter(day => !configuredDays.has(day));

      if (!exercises.length) {
        return { data: null, error: { message: 'Conflito de treino: adicione pelo menos um exercício antes de aplicar o plano ao aluno.' } };
      }
      if (missingDays.length) {
        return { data: null, error: { message: 'Conflito de treino: todos os dias selecionados precisam ter pelo menos um exercício antes da aplicação.' } };
      }
    }
    return originalRpc(functionName, args, options);
  };

  const setupWorkoutFeedback = async () => {
    ensureStyles();
    const message = await waitFor(() => document.querySelector('#workout-message'));
    const newButton = document.querySelector('#new-workout-button');
    if (newButton && !document.querySelector('.workout-draft-guidance')) {
      const guidance = document.createElement('p');
      guidance.className = 'workout-draft-guidance';
      guidance.textContent = 'Novos planos são salvos como rascunho. Adicione os exercícios de todos os dias e aplique ao aluno somente quando estiver pronto.';
      newButton.insertAdjacentElement('afterend', guidance);
    }
    if (!message) return;
    const observer = new MutationObserver(() => {
      if (message.textContent.trim() === 'Plano criado e aplicado ao aluno.') {
        message.textContent = 'Plano criado como rascunho. Adicione os exercícios e aplique quando estiver pronto.';
      }
    });
    observer.observe(message, { childList: true, subtree: true, characterData: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupWorkoutFeedback, { once: true });
  else void setupWorkoutFeedback();
}

function nextRecurringAppointment(activeWorkouts, student) {
  const time = formatTime(student?.horario_aula);
  if (!time || !activeWorkouts.length) return null;
  const candidates = [];
  activeWorkouts.forEach(workout => {
    const days = new Set((workout.dias_semana || []).map(day => Number(day) === 7 ? 0 : Number(day)));
    for (let offset = 0; offset <= 14; offset += 1) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() + offset);
      if (!days.has(date.getDay())) continue;
      const [hours, minutes] = time.split(':').map(Number);
      date.setHours(hours || 0, minutes || 0, 0, 0);
      if (date < new Date()) continue;
      candidates.push({
        date,
        data: localIsoDate(date),
        horario: time,
        local: student.local_aula || null,
        titulo: workout.nome || 'Treino',
        manual: false
      });
      break;
    }
  });
  return candidates.sort((a, b) => a.date - b.date)[0] || null;
}

function paymentStatus(payment, student) {
  const configured = Boolean(student?.mensalidade_ativa && Number(student?.mensalidade_valor) > 0 && Number(student?.mensalidade_dia_vencimento) > 0);
  if (!configured) return { title: 'Não configurada', detail: 'Defina valor e vencimento', key: 'missing' };
  if (payment?.status === 'pago') return { title: 'Pagamento confirmado', detail: `${formatCurrency(payment.valor)} · ${formatDate(payment.vencimento)}`, key: 'done' };
  if (payment?.status === 'informado') return { title: 'Aguardando confirmação', detail: `${formatCurrency(payment.valor)} · informado pelo aluno`, key: 'waiting' };
  if (payment?.vencimento && payment.vencimento < localIsoDate()) return { title: 'Mensalidade atrasada', detail: `${formatCurrency(payment.valor)} · venceu em ${formatDate(payment.vencimento)}`, key: 'late' };
  return { title: `Vence dia ${student.mensalidade_dia_vencimento}`, detail: formatCurrency(payment?.valor ?? student.mensalidade_valor), key: 'pending' };
}

async function enhanceStudentRecord() {
  if (PAGE !== 'ficha-aluno.html') return;
  const studentId = new URLSearchParams(location.search).get('id');
  if (!studentId || document.querySelector('#student-workflow-card')) return;

  const overviewPanel = await waitFor(() => document.querySelector('[data-record-panel="overview"]'));
  if (!overviewPanel) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  ensureStyles();
  const today = localIsoDate();
  const [studentResult, workoutsResult, paymentResult, appointmentResult] = await Promise.all([
    supabase
      .from('alunos')
      .select('id,nome,status,horario_aula,local_aula,mensalidade_valor,mensalidade_dia_vencimento,mensalidade_ativa,primeiro_acesso_concluido,pin_hash')
      .eq('id', studentId)
      .eq('personal_id', session.user.id)
      .maybeSingle(),
    supabase
      .from('treinos')
      .select('id,nome,status,dias_semana,data_inicio,data_fim')
      .eq('aluno_id', studentId)
      .eq('personal_id', session.user.id)
      .order('updated_at', { ascending: false }),
    supabase
      .from('mensalidades_alunos')
      .select('id,status,valor,vencimento,competencia,informado_em,confirmado_em')
      .eq('aluno_id', studentId)
      .eq('personal_id', session.user.id)
      .eq('competencia', currentCompetence())
      .maybeSingle(),
    supabase
      .from('agenda_agendamentos')
      .select('id,data,horario,local,titulo,treinos(nome)')
      .eq('aluno_id', studentId)
      .eq('personal_id', session.user.id)
      .gte('data', today)
      .order('data', { ascending: true })
      .order('horario', { ascending: true })
      .limit(1)
      .maybeSingle()
  ]);

  if (studentResult.error || !studentResult.data) {
    console.warn('Resumo integrado da ficha indisponível:', studentResult.error);
    return;
  }

  const student = studentResult.data;
  const workouts = workoutsResult.error ? [] : (workoutsResult.data || []);
  const workoutIds = workouts.map(item => item.id);
  let exercises = [];
  if (workoutIds.length) {
    const exerciseResult = await supabase
      .from('treino_exercicios')
      .select('id,treino_id,dia_semana')
      .in('treino_id', workoutIds);
    if (!exerciseResult.error) exercises = exerciseResult.data || [];
  }

  const activeWorkouts = workouts.filter(item => item.status === 'ativo');
  const exerciseCount = exercises.length;
  const activeExerciseCount = exercises.filter(item => activeWorkouts.some(workout => workout.id === item.treino_id)).length;
  const activeDaysComplete = activeWorkouts.length > 0 && activeWorkouts.every(workout => {
    const configuredDays = new Set(exercises.filter(item => item.treino_id === workout.id).map(item => Number(item.dia_semana)));
    return (workout.dias_semana || []).every(day => configuredDays.has(Number(day)));
  });

  const manualRow = appointmentResult.error ? null : appointmentResult.data;
  const manualAppointment = manualRow ? {
    date: new Date(`${manualRow.data}T${formatTime(manualRow.horario) || '00:00'}:00`),
    data: manualRow.data,
    horario: formatTime(manualRow.horario),
    local: manualRow.local,
    titulo: manualRow.titulo || manualRow.treinos?.nome || 'Agendamento',
    manual: true
  } : null;
  const recurringAppointment = nextRecurringAppointment(activeWorkouts, student);
  const nextAppointment = [manualAppointment, recurringAppointment]
    .filter(Boolean)
    .sort((a, b) => a.date - b.date)[0] || null;

  const finance = paymentStatus(paymentResult.error ? null : paymentResult.data, student);
  const accessReady = Boolean(student.primeiro_acesso_concluido && student.pin_hash);
  const financeReady = Boolean(student.mensalidade_ativa && Number(student.mensalidade_valor) > 0 && Number(student.mensalidade_dia_vencimento) > 0);
  const scheduleReady = Boolean(nextAppointment || (student.horario_aula && activeWorkouts.length));
  const steps = [
    { label: 'Dados cadastrais', detail: 'Informações básicas do aluno', done: true, action: 'Editar', href: `alunos.html?editar=${encodeURIComponent(studentId)}` },
    { label: 'Agenda e horário', detail: scheduleReady ? 'Atendimento programado' : 'Defina quando o aluno será atendido', done: scheduleReady, action: scheduleReady ? 'Ver' : 'Configurar', href: `agenda.html?novo=1&aluno=${encodeURIComponent(studentId)}` },
    { label: 'Mensalidade', detail: financeReady ? `${formatCurrency(student.mensalidade_valor)} · dia ${student.mensalidade_dia_vencimento}` : 'Defina valor e vencimento', done: financeReady, action: financeReady ? 'Ver' : 'Configurar', href: `financeiro.html?aluno=${encodeURIComponent(studentId)}` },
    { label: 'Plano de treino', detail: workouts.length ? `${workouts.length} ${workouts.length === 1 ? 'plano criado' : 'planos criados'}` : 'Nenhum plano criado', done: workouts.length > 0, action: workouts.length ? 'Abrir' : 'Criar', href: `treino-aluno.html?id=${encodeURIComponent(studentId)}` },
    { label: 'Exercícios aplicados', detail: exerciseCount ? `${exerciseCount} ${exerciseCount === 1 ? 'exercício configurado' : 'exercícios configurados'}` : 'Adicione exercícios ao plano', done: exerciseCount > 0, action: 'Gerenciar', href: `treino-aluno.html?id=${encodeURIComponent(studentId)}` },
    { label: 'Plano aplicado', detail: activeWorkouts.length ? `${activeWorkouts.length} ${activeWorkouts.length === 1 ? 'plano ativo' : 'planos ativos'}` : 'O aluno ainda não recebeu um plano', done: activeWorkouts.length > 0 && activeDaysComplete && activeExerciseCount > 0, action: 'Revisar', href: `treino-aluno.html?id=${encodeURIComponent(studentId)}` },
    { label: 'Acesso do aluno', detail: accessReady ? 'Primeiro acesso concluído' : 'Ativação ou PIN pendente', done: accessReady, action: accessReady ? 'Gerenciar' : 'Liberar', tab: 'access' }
  ];
  const completed = steps.filter(step => step.done).length;

  const card = document.createElement('article');
  card.id = 'student-workflow-card';
  card.className = 'card student-workflow-card';
  card.innerHTML = `
    <div class="student-workflow-heading">
      <div><small>CENTRAL DO ALUNO</small><h2>Acompanhamento e configuração</h2></div>
      <span class="student-workflow-progress">${completed} de ${steps.length} concluídos</span>
    </div>
    <div class="student-workflow-summary-grid">
      <section class="student-workflow-summary">
        <small>PRÓXIMA AULA</small>
        <strong>${nextAppointment ? `${formatDate(nextAppointment.data)}${nextAppointment.horario ? ` · ${esc(nextAppointment.horario)}` : ''}` : 'Nenhuma aula programada'}</strong>
        <span>${nextAppointment ? esc([nextAppointment.titulo, nextAppointment.local].filter(Boolean).join(' · ') || 'Atendimento do aluno') : 'Configure a agenda para organizar o próximo atendimento.'}</span>
        <a class="student-workflow-link" href="agenda.html?novo=1&aluno=${encodeURIComponent(studentId)}">${nextAppointment ? 'Abrir agenda →' : 'Agendar aluno →'}</a>
      </section>
      <section class="student-workflow-summary">
        <small>TREINOS</small>
        <strong>${activeWorkouts.length ? `${activeWorkouts.length} ${activeWorkouts.length === 1 ? 'plano ativo' : 'planos ativos'}` : 'Nenhum plano aplicado'}</strong>
        <span>${activeExerciseCount ? `${activeExerciseCount} exercícios nos planos ativos` : (exerciseCount ? `${exerciseCount} exercícios em rascunhos` : 'Monte o primeiro plano do aluno.')}</span>
        <a class="student-workflow-link" href="treino-aluno.html?id=${encodeURIComponent(studentId)}">Gerenciar treinos →</a>
      </section>
      <section class="student-workflow-summary">
        <small>MENSALIDADE</small>
        <strong>${esc(finance.title)}</strong>
        <span>${esc(finance.detail)}</span>
        <a class="student-workflow-link" href="financeiro.html?aluno=${encodeURIComponent(studentId)}">Abrir mensalidade →</a>
      </section>
    </div>
    <div class="student-workflow-checklist" aria-label="Preparação do aluno">
      ${steps.map(step => `
        <div class="student-workflow-step ${step.done ? 'is-done' : ''}">
          <span class="student-workflow-step-icon" aria-hidden="true">${step.done ? '✓' : '!'}</span>
          <div class="student-workflow-step-copy"><strong>${esc(step.label)}</strong><small>${esc(step.detail)}</small></div>
          ${step.tab
            ? `<button type="button" data-open-record-tab="${esc(step.tab)}">${esc(step.action)}</button>`
            : `<a href="${esc(step.href)}">${esc(step.action)}</a>`}
        </div>`).join('')}
    </div>`;

  const overviewGrid = overviewPanel.querySelector('.record-overview-grid');
  overviewPanel.insertBefore(card, overviewGrid || overviewPanel.firstChild);

  card.querySelectorAll('[data-open-record-tab]').forEach(button => {
    button.addEventListener('click', () => {
      const tab = document.querySelector(`[data-record-tab="${button.dataset.openRecordTab}"]`);
      tab?.click();
      document.querySelector('.record-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  const deleteButton = document.querySelector('#delete-student');
  const editButton = document.querySelector('#edit-registration');
  const profileCard = document.querySelector('.profile-card');
  if (deleteButton && profileCard && !document.querySelector('.student-admin-actions')) {
    const originalActions = deleteButton.closest('.actions');
    const details = document.createElement('details');
    details.className = 'student-admin-actions';
    details.innerHTML = '<summary>Ações administrativas</summary><div class="student-admin-actions-body"></div>';
    const body = details.querySelector('.student-admin-actions-body');
    if (editButton) body.appendChild(editButton);
    body.appendChild(deleteButton);
    originalActions?.remove();
    profileCard.appendChild(details);
  }
}

async function openRequestedFinanceStudent() {
  if (PAGE !== 'financeiro.html') return;
  const studentId = new URLSearchParams(location.search).get('aluno');
  if (!studentId) return;
  const row = await waitFor(() => [...document.querySelectorAll('[data-student-row]')].find(item => item.dataset.studentRow === studentId), 12000);
  if (!row) return;
  row.click();
  const url = new URL(location.href);
  url.searchParams.delete('aluno');
  history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

async function openRequestedAgendaStudent() {
  if (PAGE !== 'agenda.html') return;
  const params = new URLSearchParams(location.search);
  const studentId = params.get('aluno');
  if (params.get('novo') !== '1' || !studentId) return;

  const openButton = await waitFor(() => document.querySelector('#open-schedule-modal'), 12000);
  const select = await waitFor(() => {
    const field = document.querySelector('#schedule-form [name="aluno_id"]');
    return field && [...field.options].some(option => option.value === studentId) ? field : null;
  }, 12000);
  if (!openButton || !select) return;

  openButton.click();
  select.value = studentId;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  const url = new URL(location.href);
  url.searchParams.delete('novo');
  url.searchParams.delete('aluno');
  history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

patchWorkoutPublicationFlow();

const boot = () => {
  enhanceStudentRecord().catch(error => console.warn('Melhorias da ficha do aluno indisponíveis:', error));
  openRequestedFinanceStudent().catch(error => console.warn('Não foi possível abrir a mensalidade solicitada:', error));
  openRequestedAgendaStudent().catch(error => console.warn('Não foi possível abrir o agendamento solicitado:', error));
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
