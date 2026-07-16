import { supabase } from './supabase.js';
import { requireSession } from './layout.js';

const loading = document.querySelector('#loading-state');
const errorState = document.querySelector('#error-state');
const content = document.querySelector('#student-content');
const workoutContent = document.querySelector('#workout-content');
const dietContent = document.querySelector('#diet-content');
const workoutPlanName = document.querySelector('#workout-plan-name');
const dietPlanName = document.querySelector('#diet-plan-name');
const studentMediaSection = document.querySelector('#student-media-section');
const studentMediaList = document.querySelector('#student-media-list');
const detailModal = document.querySelector('#student-detail-modal');
const detailTitle = document.querySelector('#student-detail-title');
const detailBody = document.querySelector('#student-detail-body');
const alunoId = new URLSearchParams(location.search).get('id');

const dayNames = { 1: 'Segunda-feira', 2: 'Terça-feira', 3: 'Quarta-feira', 4: 'Quinta-feira', 5: 'Sexta-feira', 6: 'Sábado', 7: 'Domingo' };
const dayShortNames = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 7: 'Dom' };

let selectedWorkoutDay = currentWeekDay();
let selectedDietDay = currentWeekDay();
let workoutItems = [];
let mealItems = [];

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function currentWeekDay() {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

function setupTabs() {
  const tabs = [...document.querySelectorAll('[data-student-tab]')];
  const panels = [...document.querySelectorAll('[data-student-panel]')];
  tabs.forEach(tab => tab.addEventListener('click', () => {
    const target = tab.dataset.studentTab;
    tabs.forEach(item => item.classList.toggle('active', item === tab));
    panels.forEach(panel => panel.classList.toggle('active', panel.dataset.studentPanel === target));
  }));
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
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      id = parsed.searchParams.get('v') || '';
      if (!id && parsed.pathname.startsWith('/shorts/')) id = parsed.pathname.split('/')[2] || '';
      if (!id && parsed.pathname.startsWith('/embed/')) id = parsed.pathname.split('/')[2] || '';
      if (!id && parsed.pathname.startsWith('/live/')) id = parsed.pathname.split('/')[2] || '';
    }
    return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0` : null;
  } catch {
    return null;
  }
}

function daySelector(selectedDay, type) {
  const today = currentWeekDay();
  return `<div class="student-day-selector" role="tablist" aria-label="Dias da semana">
    ${Object.keys(dayNames).map(day => {
      const number = Number(day);
      return `<button class="student-day-button ${number === selectedDay ? 'active' : ''}" type="button" data-select-${type}-day="${number}">
        <span>${dayShortNames[number]}</span>${number === today ? '<small>HOJE</small>' : ''}
      </button>`;
    }).join('')}
  </div>`;
}

function workoutSummary(item) {
  return [
    item.series != null ? `${item.series} séries` : null,
    item.repeticoes ? `${item.repeticoes} repetições` : null
  ].filter(Boolean).join(' • ') || 'Ver detalhes';
}

function renderWorkoutAgenda() {
  const rows = workoutItems.filter(item => Number(item.dia_semana) === selectedWorkoutDay);
  workoutContent.innerHTML = `${daySelector(selectedWorkoutDay, 'workout')}
    <section class="student-agenda-day selected">
      <div class="student-agenda-day-header">
        <strong>${dayNames[selectedWorkoutDay]}</strong>
        <span>${rows.length ? `${rows.length} ${rows.length === 1 ? 'exercício' : 'exercícios'}` : 'Descanso'}</span>
      </div>
      <div class="student-agenda-list">
        ${rows.length ? rows.map(item => `<button class="student-compact-row" type="button" data-workout-item="${esc(item.id || String(item.ordem || ''))}">
          <span class="student-compact-order">${esc(item.ordem || '—')}</span>
          <span class="student-compact-main"><strong>${esc(item.exercicios?.nome || item.nome || 'Exercício')}</strong><span>${esc(workoutSummary(item))}</span></span>
          <span class="student-compact-arrow">›</span>
        </button>`).join('') : '<p class="student-agenda-empty">Nenhum treino programado para este dia.</p>'}
      </div>
    </section>`;
}

function renderDietAgenda() {
  const rows = mealItems
    .filter(item => (item.dias_semana || []).map(Number).includes(selectedDietDay))
    .sort((a, b) => String(a.horario || '').localeCompare(String(b.horario || '')) || Number(a.ordem || 0) - Number(b.ordem || 0));

  dietContent.innerHTML = `${daySelector(selectedDietDay, 'diet')}
    <section class="student-agenda-day selected">
      <div class="student-agenda-day-header">
        <strong>${dayNames[selectedDietDay]}</strong>
        <span>${rows.length ? `${rows.length} ${rows.length === 1 ? 'refeição' : 'refeições'}` : 'Sem refeições'}</span>
      </div>
      <div class="student-agenda-list">
        ${rows.length ? rows.map(item => `<button class="student-compact-row" type="button" data-meal-item="${esc(item.id || String(item.ordem || ''))}">
          <span class="student-compact-time">${esc(item.horario ? String(item.horario).slice(0, 5) : '—')}</span>
          <span class="student-compact-main"><strong>${esc(item.nome || 'Refeição')}</strong></span>
          <span class="student-compact-arrow">›</span>
        </button>`).join('') : '<p class="student-agenda-empty">Nenhuma refeição programada para este dia.</p>'}
      </div>
    </section>`;
}

function openWorkoutItem(id) {
  const item = workoutItems.find(row => String(row.id || row.ordem || '') === String(id));
  if (!item) return;
  const ex = item.exercicios || item;
  const embed = youtubeEmbedUrl(ex.video_url);

  openDetail(ex.nome || 'Exercício', `<div class="student-detail-grid">
    <div><small>Dia</small><strong>${esc(dayNames[item.dia_semana] || 'Não informado')}</strong></div>
    <div><small>Séries</small><strong>${esc(String(item.series ?? '—'))}</strong></div>
    <div><small>Repetições</small><strong>${esc(item.repeticoes || '—')}</strong></div>
    <div><small>Carga</small><strong>${esc(item.carga || '—')}</strong></div>
    <div><small>Descanso</small><strong>${item.descanso_segundos != null ? `${esc(String(item.descanso_segundos))}s` : '—'}</strong></div>
    <div><small>Grupo muscular</small><strong>${esc(ex.grupo_muscular || '—')}</strong></div>
  </div>
  ${ex.equipamento ? `<div class="student-detail-block"><small>Equipamento</small><p>${esc(ex.equipamento)}</p></div>` : ''}
  ${ex.instrucoes ? `<div class="student-detail-block"><small>Instruções</small><p>${esc(ex.instrucoes)}</p></div>` : ''}
  ${item.observacoes ? `<div class="student-detail-block"><small>Observações</small><p>${esc(item.observacoes)}</p></div>` : ''}
  ${embed ? `<div class="student-detail-video"><iframe src="${esc(embed)}" title="Vídeo demonstrativo" loading="lazy" allowfullscreen></iframe></div>` : ''}`);
}

function openMealItem(id) {
  const item = mealItems.find(row => String(row.id || row.ordem || '') === String(id));
  if (!item) return;
  const days = (item.dias_semana || []).map(day => dayNames[Number(day)]).filter(Boolean).join(', ');

  openDetail(item.nome || 'Refeição', `<div class="student-detail-grid">
    <div><small>Horário</small><strong>${esc(item.horario ? String(item.horario).slice(0, 5) : '—')}</strong></div>
    <div><small>Ordem</small><strong>${esc(String(item.ordem || '—'))}</strong></div>
  </div>
  <div class="student-detail-block"><small>Dias da semana</small><p>${esc(days || 'Não informado')}</p></div>
  <div class="student-detail-block"><small>Descrição</small><p>${esc(item.descricao || 'Nenhuma descrição informada.')}</p></div>
  ${item.substituicoes ? `<div class="student-detail-block"><small>Substituições</small><p>${esc(item.substituicoes)}</p></div>` : ''}`);
}

function mediaTypeLabel(type) {
  return { foto: 'Foto', video: 'Vídeo', youtube: 'YouTube', instagram: 'Instagram' }[type] || 'Mídia';
}

function renderStudentMedia(items) {
  if (!Array.isArray(items) || !items.length) {
    studentMediaSection.classList.add('hidden');
    return;
  }

  studentMediaList.innerHTML = items.map(item => {
    let preview = '';
    if (item.tipo === 'foto') {
      preview = `<div class="student-portal-media-preview"><img src="${esc(item.url)}" alt="${esc(item.titulo || 'Foto compartilhada pelo personal')}" loading="lazy"></div>`;
    } else if (item.tipo === 'video') {
      preview = `<div class="student-portal-media-preview"><video src="${esc(item.url)}" controls preload="metadata"></video></div>`;
    } else if (item.tipo === 'youtube') {
      const embed = youtubeEmbedUrl(item.url);
      preview = embed
        ? `<div class="student-portal-media-preview"><iframe src="${esc(embed)}" title="${esc(item.titulo || 'Vídeo do YouTube')}" loading="lazy" allowfullscreen></iframe></div>`
        : `<a class="student-portal-media-preview student-portal-media-preview-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><div><strong>Abrir no YouTube</strong><span>Assistir vídeo →</span></div></a>`;
    } else {
      preview = `<a class="student-portal-media-preview student-portal-media-preview-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><div><strong>Abrir no Instagram</strong><span>Ver publicação →</span></div></a>`;
    }
    return `<article class="student-portal-media-card">${preview}<div class="student-portal-media-body"><span class="student-portal-media-type">${mediaTypeLabel(item.tipo)}</span><h3 class="student-portal-media-title">${esc(item.titulo || mediaTypeLabel(item.tipo))}</h3></div></article>`;
  }).join('');

  studentMediaSection.classList.remove('hidden');
}

function latestDate(values) {
  const valid = values.map(value => value ? new Date(value) : null).filter(date => date && !Number.isNaN(date.getTime()));
  if (!valid.length) return null;
  return new Date(Math.max(...valid.map(date => date.getTime())));
}

async function load() {
  if (!alunoId) throw new Error('Aluno não informado.');

  const session = await requireSession();
  if (!session) return;

  const { data: student, error: studentError } = await supabase
    .from('alunos')
    .select('id,nome,observacoes,status,personal_id')
    .eq('id', alunoId)
    .eq('personal_id', session.user.id)
    .single();

  if (studentError || !student) throw new Error('Aluno não encontrado ou sem permissão para visualização.');

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
  const workout = workoutsResult.data?.[0] || null;
  const diet = dietsResult.data?.[0] || null;
  const media = mediaResult.data || [];

  let workoutExercises = [];
  if (workout?.id) {
    const { data, error } = await supabase
      .from('treino_exercicios')
      .select('id,treino_id,exercicio_id,dia_semana,ordem,series,repeticoes,carga,descanso_segundos,observacoes,exercicios(nome,grupo_muscular,equipamento,instrucoes,video_url)')
      .eq('treino_id', workout.id)
      .order('dia_semana')
      .order('ordem');
    if (error) throw error;
    workoutExercises = data || [];
  }

  let meals = [];
  if (diet?.id) {
    const { data, error } = await supabase
      .from('refeicoes')
      .select('id,nome,horario,descricao,substituicoes,ordem,dias_semana')
      .eq('plano_alimentar_id', diet.id)
      .order('ordem', { ascending: true })
      .order('horario', { ascending: true });
    if (error) throw error;
    meals = data || [];
  }

  document.querySelector('#student-name').textContent = student.nome || 'Aluno';
  document.querySelector('#trainer-name').textContent = profile.nome || 'Seu personal trainer';
  document.querySelector('#back-to-record').href = `ficha-aluno.html?id=${encodeURIComponent(student.id)}`;

  workoutPlanName.textContent = workout?.nome || '';
  workoutItems = workoutExercises;
  renderWorkoutAgenda();

  dietPlanName.textContent = diet?.titulo || '';
  mealItems = meals;
  renderDietAgenda();

  document.querySelector('#student-observations').textContent = String(student.observacoes || workout?.descricao || diet?.orientacoes || '').trim() || 'Nenhuma observação publicada ainda.';
  renderStudentMedia(media);

  const personalSlug = String(publicProfile.slug || '').trim().toLowerCase();
  if (personalSlug) {
    const personalPageButton = document.querySelector('#personal-page-button');
    personalPageButton.href = `/p/${encodeURIComponent(personalSlug)}`;
    personalPageButton.classList.remove('hidden');
  }

  const updatedAt = latestDate([workout?.updated_at, diet?.updated_at, media?.[0]?.created_at]);
  if (updatedAt) document.querySelector('#updated-at').textContent = `Atualizado em ${updatedAt.toLocaleString('pt-BR')}`;

  const phone = String(profile.telefone || '').replace(/\D/g, '');
  if (phone.length >= 10) {
    const message = encodeURIComponent(`Olá, ${profile.nome || 'Personal'}! Sou ${student.nome} e tenho uma dúvida sobre meu plano.`);
    const button = document.querySelector('#whatsapp-button');
    button.href = `https://wa.me/${phone}?text=${message}`;
    button.classList.remove('hidden');
  }

  setupTabs();
  loading.classList.add('hidden');
  content.classList.remove('hidden');
}

workoutContent?.addEventListener('click', event => {
  const dayButton = event.target.closest('[data-select-workout-day]');
  if (dayButton) {
    selectedWorkoutDay = Number(dayButton.dataset.selectWorkoutDay);
    renderWorkoutAgenda();
    return;
  }
  const itemButton = event.target.closest('[data-workout-item]');
  if (itemButton) openWorkoutItem(itemButton.dataset.workoutItem);
});

dietContent?.addEventListener('click', event => {
  const dayButton = event.target.closest('[data-select-diet-day]');
  if (dayButton) {
    selectedDietDay = Number(dayButton.dataset.selectDietDay);
    renderDietAgenda();
    return;
  }
  const itemButton = event.target.closest('[data-meal-item]');
  if (itemButton) openMealItem(itemButton.dataset.mealItem);
});

document.querySelectorAll('[data-close-student-detail]').forEach(button => button.addEventListener('click', closeDetail));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDetail(); });

load().catch(error => {
  console.error(error);
  loading.classList.add('hidden');
  errorState.innerHTML = `${esc(error.message || 'Não foi possível carregar a visão do aluno.')}<div class="actions" style="justify-content:center;margin-top:16px"><a class="btn btn-primary" href="alunos.html">Voltar para alunos</a></div>`;
  errorState.classList.remove('hidden');
});