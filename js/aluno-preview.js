import { supabase } from './supabase.js';

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

const dayNames = {
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
  7: 'Domingo'
};

let workoutItems = [];
let mealItems = [];

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
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

function workoutSummary(item) {
  return [
    item.series != null ? `${item.series} séries` : null,
    item.repeticoes ? `${item.repeticoes} repetições` : null
  ].filter(Boolean).join(' • ') || 'Ver detalhes';
}

function renderWorkoutAgenda(items) {
  workoutItems = items || [];
  workoutContent.innerHTML = Object.entries(dayNames).map(([day, label]) => {
    const rows = workoutItems.filter(item => Number(item.dia_semana) === Number(day));
    return `<section class="student-agenda-day">
      <div class="student-agenda-day-header">
        <strong>${label}</strong>
        <span>${rows.length ? `${rows.length} ${rows.length === 1 ? 'exercício' : 'exercícios'}` : 'Descanso'}</span>
      </div>
      <div class="student-agenda-list">
        ${rows.length ? rows.map(item => `<button class="student-compact-row" type="button" data-workout-item="${item.id}">
          <span class="student-compact-order">${item.ordem || '—'}</span>
          <span class="student-compact-main">
            <strong>${esc(item.exercicios?.nome || 'Exercício')}</strong>
            <span>${esc(workoutSummary(item))}</span>
          </span>
          <span class="student-compact-arrow">›</span>
        </button>`).join('') : '<p class="student-agenda-empty">Nenhum treino programado.</p>'}
      </div>
    </section>`;
  }).join('');
}

function renderDietAgenda(items) {
  mealItems = items || [];
  dietContent.innerHTML = Object.entries(dayNames).map(([day, label]) => {
    const rows = mealItems
      .filter(item => (item.dias_semana || []).map(Number).includes(Number(day)))
      .sort((a, b) => String(a.horario || '').localeCompare(String(b.horario || '')) || Number(a.ordem || 0) - Number(b.ordem || 0));
    return `<section class="student-agenda-day">
      <div class="student-agenda-day-header">
        <strong>${label}</strong>
        <span>${rows.length ? `${rows.length} ${rows.length === 1 ? 'refeição' : 'refeições'}` : 'Sem refeições'}</span>
      </div>
      <div class="student-agenda-list">
        ${rows.length ? rows.map(item => `<button class="student-compact-row" type="button" data-meal-item="${item.id}">
          <span class="student-compact-time">${esc(item.horario ? String(item.horario).slice(0, 5) : '—')}</span>
          <span class="student-compact-main"><strong>${esc(item.nome || 'Refeição')}</strong></span>
          <span class="student-compact-arrow">›</span>
        </button>`).join('') : '<p class="student-agenda-empty">Nenhuma refeição programada.</p>'}
      </div>
    </section>`;
  }).join('');
}

function openWorkoutItem(id) {
  const item = workoutItems.find(row => row.id === id);
  if (!item) return;
  const ex = item.exercicios || {};
  const embed = youtubeEmbedUrl(ex.video_url);
  openDetail(ex.nome || 'Exercício', `
    <div class="student-detail-grid">
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
    ${embed ? `<div class="student-detail-video"><iframe src="${esc(embed)}" title="Vídeo demonstrativo de ${esc(ex.nome || 'exercício')}" loading="lazy" allowfullscreen></iframe></div>` : ''}
  `);
}

function openMealItem(id) {
  const item = mealItems.find(row => row.id === id);
  if (!item) return;
  const days = (item.dias_semana || []).map(day => dayNames[Number(day)]).filter(Boolean).join(', ');
  openDetail(item.nome || 'Refeição', `
    <div class="student-detail-grid">
      <div><small>Horário</small><strong>${esc(item.horario ? String(item.horario).slice(0, 5) : '—')}</strong></div>
      <div><small>Ordem</small><strong>${esc(String(item.ordem || '—'))}</strong></div>
    </div>
    <div class="student-detail-block"><small>Dias da semana</small><p>${esc(days || 'Não informado')}</p></div>
    <div class="student-detail-block"><small>Descrição</small><p>${esc(item.descricao || 'Nenhuma descrição informada.')}</p></div>
    ${item.substituicoes ? `<div class="student-detail-block"><small>Substituições</small><p>${esc(item.substituicoes)}</p></div>` : ''}
  `);
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

async function load() {
  if (!alunoId) throw new Error('Aluno não informado.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Entre como personal trainer para visualizar este portal.');

  const [studentResult, portalResult, workoutResult, dietResult, mediaResult] = await Promise.all([
    supabase.from('alunos').select('id,nome,objetivo,observacoes').eq('id', alunoId).eq('personal_id', session.user.id).single(),
    supabase.rpc('get_aluno_portal_preview', { p_aluno_id: alunoId }),
    supabase.from('treinos').select('id,nome,descricao,dias_semana,updated_at').eq('aluno_id', alunoId).eq('personal_id', session.user.id).eq('status', 'ativo').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('planos_alimentares').select('id,titulo,orientacoes,agua_ml,data_inicio,data_fim,updated_at').eq('aluno_id', alunoId).eq('personal_id', session.user.id).eq('ativo', true).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('aluno_midias').select('id,tipo,titulo,url,created_at').eq('aluno_id', alunoId).eq('personal_id', session.user.id).order('created_at', { ascending: false })
  ]);

  if (studentResult.error) throw studentResult.error;
  if (portalResult.error) throw portalResult.error;
  if (workoutResult.error) throw workoutResult.error;
  if (dietResult.error) throw dietResult.error;

  const portal = Array.isArray(portalResult.data) ? portalResult.data[0] : portalResult.data;
  const student = studentResult.data;
  const workout = workoutResult.data;
  const diet = dietResult.data;

  document.querySelector('#student-name').textContent = student.nome || portal?.aluno_nome || 'Aluno';
  document.querySelector('#trainer-name').textContent = portal?.personal_nome || 'Seu personal trainer';
  document.querySelector('#student-observations').textContent = String(student.observacoes || '').trim() || 'Nenhuma observação publicada ainda.';

  let updatedAt = portal?.plano_atualizado_em || workout?.updated_at || diet?.updated_at;
  if (updatedAt) document.querySelector('#updated-at').textContent = `Atualizado em ${new Date(updatedAt).toLocaleString('pt-BR')}`;

  if (workout) {
    workoutPlanName.textContent = workout.nome || '';
    const { data: exercises, error } = await supabase
      .from('treino_exercicios')
      .select('id,dia_semana,ordem,series,repeticoes,carga,descanso_segundos,observacoes,exercicios(nome,grupo_muscular,equipamento,instrucoes,video_url)')
      .eq('treino_id', workout.id)
      .order('dia_semana')
      .order('ordem');
    if (error) throw error;
    renderWorkoutAgenda(exercises || []);
  } else {
    workoutPlanName.textContent = 'Nenhum plano ativo';
    renderWorkoutAgenda([]);
  }

  if (diet) {
    dietPlanName.textContent = diet.titulo || '';
    const { data: meals, error } = await supabase
      .from('refeicoes')
      .select('id,nome,horario,descricao,substituicoes,ordem,dias_semana')
      .eq('plano_alimentar_id', diet.id)
      .order('ordem')
      .order('horario');
    if (error) throw error;
    renderDietAgenda(meals || []);
  } else {
    dietPlanName.textContent = 'Nenhum plano ativo';
    renderDietAgenda([]);
  }

  renderStudentMedia(mediaResult.error ? [] : (mediaResult.data || []));
  setupTabs();

  loading.classList.add('hidden');
  content.classList.remove('hidden');
}

workoutContent?.addEventListener('click', event => {
  const button = event.target.closest('[data-workout-item]');
  if (button) openWorkoutItem(button.dataset.workoutItem);
});

dietContent?.addEventListener('click', event => {
  const button = event.target.closest('[data-meal-item]');
  if (button) openMealItem(button.dataset.mealItem);
});

document.querySelectorAll('[data-close-student-detail]').forEach(button => button.addEventListener('click', closeDetail));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDetail(); });

load().catch(error => {
  console.error(error);
  loading.classList.add('hidden');
  errorState.textContent = error.message || 'Não foi possível carregar a pré-visualização.';
  errorState.classList.remove('hidden');
});