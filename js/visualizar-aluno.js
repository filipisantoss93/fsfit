import { supabase } from './supabase.js';
import { requireSession } from './layout.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const alunoId = new URLSearchParams(location.search).get('id');
const loading = $('#loading-state');
const errorState = $('#error-state');
const content = $('#student-content');
const bottomNav = $('#student-bottom-nav');
const detailModal = $('#student-detail-modal');
const detailTitle = $('#student-detail-title');
const detailBody = $('#student-detail-body');

const dayNames = { 1: 'Segunda-feira', 2: 'Terça-feira', 3: 'Quarta-feira', 4: 'Quinta-feira', 5: 'Sexta-feira', 6: 'Sábado', 7: 'Domingo' };
const dayShortNames = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 7: 'Dom' };

let selectedWorkoutDay = currentWeekDay();
let selectedDietDay = currentWeekDay();
let workoutItems = [];
let mealItems = [];
let activeWorkout = null;
let activeDiet = null;
let currentStudent = null;

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function initials(value = '') {
  return String(value).trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'FS';
}

function firstName(value = '') {
  return String(value).trim().split(/\s+/)[0] || 'Aluno';
}

function currentWeekDay(date = new Date()) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function formatDate(date) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'long' }).format(date).replace('.', '');
}

function estimateDuration(items) {
  if (!items.length) return null;
  const seconds = items.reduce((total, item) => {
    const series = Math.max(1, Number(item.series) || 3);
    const rest = Math.max(30, Number(item.descanso_segundos) || 60);
    return total + (series * 45) + Math.max(0, series - 1) * rest + 90;
  }, 0);
  return Math.max(10, Math.round(seconds / 300) * 5);
}

function workoutSummary(item) {
  return [
    item.series != null ? `${item.series} séries` : null,
    item.repeticoes ? `${item.repeticoes} repetições` : null,
    item.carga ? item.carga : null
  ].filter(Boolean).join(' • ') || 'Ver detalhes';
}

function openDetail(title, html) {
  detailTitle.textContent = title;
  detailBody.innerHTML = html;
  detailModal.classList.add('open');
  detailModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('student-detail-open');
}

function closeDetail() {
  detailModal.classList.remove('open');
  detailModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('student-detail-open');
}

function youtubeEmbedUrl(url) {
  try {
    const parsed = new URL(String(url || '').trim());
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    let id = '';
    if (host === 'youtu.be') id = parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (['youtube.com', 'm.youtube.com'].includes(host)) {
      id = parsed.searchParams.get('v') || '';
      if (!id && /^\/(shorts|embed|live)\//.test(parsed.pathname)) id = parsed.pathname.split('/')[2] || '';
    }
    return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0` : null;
  } catch {
    return null;
  }
}

function setView(view) {
  const target = document.querySelector(`[data-student-panel="${CSS.escape(view)}"]`) ? view : 'home';
  $$('[data-student-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.studentPanel === target));
  $$('[data-student-view]').forEach(button => {
    const navView = button.dataset.studentView;
    button.classList.toggle('active', navView === target || (target === 'diet' && navView === 'more'));
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setupNavigation() {
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-student-view]');
    if (!trigger) return;
    event.preventDefault();
    setView(trigger.dataset.studentView);
  });

  $('#view-exercises')?.addEventListener('click', () => setView('workout'));
  $('#start-workout')?.addEventListener('click', () => {
    if (!workoutItems.some(item => Number(item.dia_semana) === currentWeekDay())) {
      setView('workout');
      return;
    }
    setView('workout');
  });

  $$('[data-dashboard-action]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.dashboardAction;
    openDetail(action === 'notifications' ? 'Notificações' : 'Configurações', `<div class="student-detail-block"><p>${action === 'notifications' ? 'Nenhuma notificação pendente neste momento.' : 'As configurações do portal serão disponibilizadas conforme os recursos da conta.'}</p></div>`);
  }));
}

function daySelector(selectedDay, type) {
  const today = currentWeekDay();
  return `<div class="student-day-selector" role="tablist" aria-label="Dias da semana">
    ${Object.keys(dayNames).map(day => {
      const number = Number(day);
      return `<button class="student-day-button ${number === selectedDay ? 'active' : ''}" type="button" data-select-${type}-day="${number}"><span>${dayShortNames[number]}</span>${number === today ? '<small>HOJE</small>' : ''}</button>`;
    }).join('')}
  </div>`;
}

function renderWorkoutAgenda() {
  const rows = workoutItems.filter(item => Number(item.dia_semana) === selectedWorkoutDay);
  $('#workout-content').innerHTML = `${daySelector(selectedWorkoutDay, 'workout')}
    <section class="student-agenda-day selected">
      <div class="student-agenda-day-header"><strong>${dayNames[selectedWorkoutDay]}</strong><span>${rows.length ? `${rows.length} ${rows.length === 1 ? 'exercício' : 'exercícios'}` : 'Descanso'}</span></div>
      <div class="student-agenda-list">${rows.length ? rows.map(item => `<button class="student-compact-row" type="button" data-workout-item="${esc(item.id || item.ordem)}"><span class="student-compact-order">${esc(item.ordem || '—')}</span><span class="student-compact-main"><strong>${esc(item.exercicios?.nome || item.nome || 'Exercício')}</strong><span>${esc(workoutSummary(item))}</span></span><span class="student-compact-arrow">›</span></button>`).join('') : '<p class="student-agenda-empty">Nenhum treino programado para este dia.</p>'}</div>
    </section>`;
}

function renderDietAgenda() {
  const rows = mealItems.filter(item => (item.dias_semana || []).map(Number).includes(selectedDietDay)).sort((a, b) => String(a.horario || '').localeCompare(String(b.horario || '')) || Number(a.ordem || 0) - Number(b.ordem || 0));
  $('#diet-content').innerHTML = `${daySelector(selectedDietDay, 'diet')}
    <section class="student-agenda-day selected">
      <div class="student-agenda-day-header"><strong>${dayNames[selectedDietDay]}</strong><span>${rows.length ? `${rows.length} ${rows.length === 1 ? 'refeição' : 'refeições'}` : 'Sem refeições'}</span></div>
      <div class="student-agenda-list">${rows.length ? rows.map(item => `<button class="student-compact-row" type="button" data-meal-item="${esc(item.id || item.ordem)}"><span class="student-compact-time">${esc(item.horario ? String(item.horario).slice(0, 5) : '—')}</span><span class="student-compact-main"><strong>${esc(item.nome || 'Refeição')}</strong><span>${esc(item.descricao || 'Ver detalhes')}</span></span><span class="student-compact-arrow">›</span></button>`).join('') : '<p class="student-agenda-empty">Nenhuma refeição programada para este dia.</p>'}</div>
    </section>`;
}

function openWorkoutItem(id) {
  const item = workoutItems.find(row => String(row.id || row.ordem || '') === String(id));
  if (!item) return;
  const exercise = item.exercicios || item;
  const embed = youtubeEmbedUrl(exercise.video_url);
  openDetail(exercise.nome || 'Exercício', `<div class="student-detail-grid"><div><small>Dia</small><strong>${esc(dayNames[item.dia_semana] || 'Não informado')}</strong></div><div><small>Séries</small><strong>${esc(String(item.series ?? '—'))}</strong></div><div><small>Repetições</small><strong>${esc(item.repeticoes || '—')}</strong></div><div><small>Carga</small><strong>${esc(item.carga || '—')}</strong></div><div><small>Descanso</small><strong>${item.descanso_segundos != null ? `${esc(String(item.descanso_segundos))}s` : '—'}</strong></div><div><small>Grupo muscular</small><strong>${esc(exercise.grupo_muscular || '—')}</strong></div></div>${exercise.equipamento ? `<div class="student-detail-block"><small>Equipamento</small><p>${esc(exercise.equipamento)}</p></div>` : ''}${exercise.instrucoes ? `<div class="student-detail-block"><small>Instruções</small><p>${esc(exercise.instrucoes)}</p></div>` : ''}${item.observacoes ? `<div class="student-detail-block"><small>Observações</small><p>${esc(item.observacoes)}</p></div>` : ''}${embed ? `<div class="student-detail-video"><iframe src="${esc(embed)}" title="Vídeo demonstrativo" loading="lazy" allowfullscreen></iframe></div>` : ''}`);
}

function openMealItem(id) {
  const item = mealItems.find(row => String(row.id || row.ordem || '') === String(id));
  if (!item) return;
  const days = (item.dias_semana || []).map(day => dayNames[Number(day)]).filter(Boolean).join(', ');
  openDetail(item.nome || 'Refeição', `<div class="student-detail-grid"><div><small>Horário</small><strong>${esc(item.horario ? String(item.horario).slice(0, 5) : '—')}</strong></div><div><small>Ordem</small><strong>${esc(String(item.ordem || '—'))}</strong></div></div><div class="student-detail-block"><small>Dias da semana</small><p>${esc(days || 'Não informado')}</p></div><div class="student-detail-block"><small>Descrição</small><p>${esc(item.descricao || 'Nenhuma descrição informada.')}</p></div>${item.substituicoes ? `<div class="student-detail-block"><small>Substituições</small><p>${esc(item.substituicoes)}</p></div>` : ''}`);
}

function renderUpcoming() {
  const list = $('#upcoming-list');
  const scheduledDays = [...new Set(workoutItems.map(item => Number(item.dia_semana)).filter(Boolean))];
  const now = new Date();
  const upcoming = [];
  for (let offset = 0; offset < 14 && upcoming.length < 3; offset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    const weekDay = currentWeekDay(date);
    const count = workoutItems.filter(item => Number(item.dia_semana) === weekDay).length;
    if (!scheduledDays.includes(weekDay) || !count) continue;
    upcoming.push({ date, count, name: activeWorkout?.nome || 'Treino programado' });
  }
  list.innerHTML = upcoming.length ? upcoming.map((item, index) => `<button class="student-upcoming-row" type="button" data-student-view="workout"><span class="student-upcoming-icon">♜</span><span><strong>${esc(item.name)}</strong><span>${item.count} ${item.count === 1 ? 'exercício' : 'exercícios'}</span></span><time>${index === 0 && item.date.toDateString() === now.toDateString() ? 'Hoje' : formatDate(item.date)}</time><b>›</b></button>`).join('') : '<p class="student-empty-inline">Nenhum treino programado nos próximos dias.</p>';
}

function renderStudentMedia(items) {
  const section = $('#student-media-section');
  const list = $('#student-media-list');
  if (!Array.isArray(items) || !items.length) {
    section.classList.add('hidden');
    return;
  }
  list.innerHTML = items.map(item => {
    let preview = '';
    if (item.tipo === 'foto') preview = `<div class="student-portal-media-preview"><img src="${esc(item.url)}" alt="${esc(item.titulo || 'Foto compartilhada pelo personal')}" loading="lazy"></div>`;
    else if (item.tipo === 'video') preview = `<div class="student-portal-media-preview"><video src="${esc(item.url)}" controls preload="metadata"></video></div>`;
    else {
      const embed = item.tipo === 'youtube' ? youtubeEmbedUrl(item.url) : null;
      preview = embed ? `<div class="student-portal-media-preview"><iframe src="${esc(embed)}" title="${esc(item.titulo || 'Vídeo')}" loading="lazy" allowfullscreen></iframe></div>` : `<a class="student-portal-media-preview student-portal-media-preview-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><div><strong>Abrir conteúdo</strong><span>Visualizar →</span></div></a>`;
    }
    return `<article class="student-portal-media-card">${preview}<div class="student-portal-media-body"><h3 class="student-portal-media-title">${esc(item.titulo || 'Conteúdo do personal')}</h3></div></article>`;
  }).join('');
  section.classList.remove('hidden');
}

function fillDashboard(student, profile, publicProfile, media) {
  const today = currentWeekDay();
  const todayWorkout = workoutItems.filter(item => Number(item.dia_semana) === today);
  const todayMeals = mealItems.filter(item => (item.dias_semana || []).map(Number).includes(today));
  const duration = estimateDuration(todayWorkout);
  const guidance = String(student.observacoes || activeWorkout?.descricao || activeDiet?.orientacoes || '').trim();

  $('#student-first-name').textContent = firstName(student.nome);
  $('#student-avatar').textContent = initials(student.nome);
  $('#trainer-name').textContent = profile.nome || 'Seu personal';
  $('#trainer-avatar').textContent = initials(profile.nome || 'Personal');
  $('#tip-trainer-avatar').textContent = initials(profile.nome || 'Personal');
  $('#today-label').textContent = formatDate(new Date());
  $('#today-workout-title').textContent = todayWorkout.length ? (activeWorkout?.nome || 'Treino de hoje') : 'Dia de recuperação';
  $('#today-exercise-count').textContent = `${todayWorkout.length} ${todayWorkout.length === 1 ? 'exercício' : 'exercícios'}`;
  $('#today-duration').textContent = duration ? `aprox. ${duration} min` : 'Sem treino programado';
  $('#start-workout').textContent = todayWorkout.length ? 'Iniciar treino ▷' : 'Ver agenda semanal';
  $('#today-meal-count').textContent = todayMeals.length ? `${todayMeals.length} ${todayMeals.length === 1 ? 'refeição' : 'refeições'}` : 'Sem refeições';
  $('#personal-tip-text').textContent = guidance || 'Seu personal ainda não publicou uma orientação.';
  $('#student-observations').textContent = guidance || 'Nenhuma observação publicada ainda.';
  $('#workout-plan-name').textContent = activeWorkout?.nome || '';
  $('#diet-plan-name').textContent = activeDiet?.titulo || '';
  $('#back-to-record').href = `ficha-aluno.html?id=${encodeURIComponent(student.id)}`;

  const personalSlug = String(publicProfile.slug || '').trim().toLowerCase();
  if (personalSlug) {
    const button = $('#personal-page-button');
    button.href = `/p/${encodeURIComponent(personalSlug)}`;
    button.classList.remove('hidden');
  }

  const phone = String(profile.telefone || '').replace(/\D/g, '');
  if (phone.length >= 10) {
    const message = encodeURIComponent(`Olá, ${profile.nome || 'Personal'}! Sou ${student.nome} e tenho uma dúvida sobre meu plano.`);
    const button = $('#whatsapp-button');
    button.href = `https://wa.me/${phone}?text=${message}`;
    button.classList.remove('hidden');
  }

  renderWorkoutAgenda();
  renderDietAgenda();
  renderUpcoming();
  renderStudentMedia(media);
}

async function load() {
  if (!alunoId) throw new Error('Aluno não informado.');
  const session = await requireSession();
  if (!session) return;

  const { data: student, error: studentError } = await supabase.from('alunos').select('id,nome,observacoes,status,personal_id').eq('id', alunoId).eq('personal_id', session.user.id).single();
  if (studentError || !student) throw new Error('Aluno não encontrado ou sem permissão para visualização.');
  currentStudent = student;

  const [profileResult, publicProfileResult, workoutsResult, dietsResult, mediaResult] = await Promise.all([
    supabase.from('perfis').select('nome,telefone').eq('id', session.user.id).maybeSingle(),
    supabase.from('perfis_publicos').select('slug').eq('personal_id', session.user.id).maybeSingle(),
    supabase.from('treinos').select('id,nome,descricao,updated_at').eq('aluno_id', alunoId).eq('personal_id', session.user.id).eq('status', 'ativo').order('updated_at', { ascending: false }).limit(1),
    supabase.from('planos_alimentares').select('id,titulo,orientacoes,updated_at').eq('aluno_id', alunoId).eq('personal_id', session.user.id).eq('ativo', true).order('updated_at', { ascending: false }).limit(1),
    supabase.from('aluno_midias').select('id,tipo,titulo,url,created_at').eq('aluno_id', alunoId).eq('personal_id', session.user.id).order('created_at', { ascending: false })
  ]);

  const firstError = [profileResult.error, publicProfileResult.error, workoutsResult.error, dietsResult.error, mediaResult.error].find(Boolean);
  if (firstError) throw firstError;

  const profile = profileResult.data || {};
  const publicProfile = publicProfileResult.data || {};
  activeWorkout = workoutsResult.data?.[0] || null;
  activeDiet = dietsResult.data?.[0] || null;

  if (activeWorkout?.id) {
    const { data, error } = await supabase.from('treino_exercicios').select('id,treino_id,exercicio_id,dia_semana,ordem,series,repeticoes,carga,descanso_segundos,observacoes,exercicios(nome,grupo_muscular,equipamento,instrucoes,video_url)').eq('treino_id', activeWorkout.id).order('dia_semana').order('ordem');
    if (error) throw error;
    workoutItems = data || [];
  }

  if (activeDiet?.id) {
    const { data, error } = await supabase.from('refeicoes').select('id,nome,horario,descricao,substituicoes,ordem,dias_semana').eq('plano_alimentar_id', activeDiet.id).order('ordem', { ascending: true }).order('horario', { ascending: true });
    if (error) throw error;
    mealItems = data || [];
  }

  fillDashboard(student, profile, publicProfile, mediaResult.data || []);
  loading.classList.add('hidden');
  content.classList.remove('hidden');
  bottomNav.classList.remove('hidden');
}

$('#workout-content')?.addEventListener('click', event => {
  const dayButton = event.target.closest('[data-select-workout-day]');
  if (dayButton) { selectedWorkoutDay = Number(dayButton.dataset.selectWorkoutDay); renderWorkoutAgenda(); return; }
  const itemButton = event.target.closest('[data-workout-item]');
  if (itemButton) openWorkoutItem(itemButton.dataset.workoutItem);
});

$('#diet-content')?.addEventListener('click', event => {
  const dayButton = event.target.closest('[data-select-diet-day]');
  if (dayButton) { selectedDietDay = Number(dayButton.dataset.selectDietDay); renderDietAgenda(); return; }
  const itemButton = event.target.closest('[data-meal-item]');
  if (itemButton) openMealItem(itemButton.dataset.mealItem);
});

$$('[data-close-student-detail]').forEach(button => button.addEventListener('click', closeDetail));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDetail(); });

setupNavigation();
load().catch(error => {
  console.error(error);
  loading.classList.add('hidden');
  errorState.innerHTML = `${esc(error.message || 'Não foi possível carregar a visão do aluno.')}<div><a class="btn btn-primary" href="alunos.html">Voltar para alunos</a></div>`;
  errorState.classList.remove('hidden');
});
