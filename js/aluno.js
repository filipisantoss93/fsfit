import { supabase } from './supabase.js';

const loading = document.querySelector('#loading-state');
const errorState = document.querySelector('#error-state');
const content = document.querySelector('#student-content');
const notificationStatus = document.querySelector('#notification-status');
const enableNotifications = document.querySelector('#enable-notifications');
const disableNotifications = document.querySelector('#disable-notifications');
const installButton = document.querySelector('#install-app');
const workoutContent = document.querySelector('#workout-content');
const dietContent = document.querySelector('#diet-content');
const workoutPlanName = document.querySelector('#workout-plan-name');
const dietPlanName = document.querySelector('#diet-plan-name');
const studentMediaSection = document.querySelector('#student-media-section');
const studentMediaList = document.querySelector('#student-media-list');
const detailModal = document.querySelector('#student-detail-modal');
const detailTitle = document.querySelector('#student-detail-title');
const detailBody = document.querySelector('#student-detail-body');

const dayNames = { 1: 'Segunda-feira', 2: 'Terça-feira', 3: 'Quarta-feira', 4: 'Quinta-feira', 5: 'Sexta-feira', 6: 'Sábado', 7: 'Domingo' };
const dayShortNames = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 7: 'Dom' };

let installPrompt = null;
let serviceWorkerRegistration = null;
let vapidPublicKey = null;
let selectedWorkoutDay = currentWeekDay();
let selectedDietDay = currentWeekDay();
let workoutItems = [];
let mealItems = [];

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function sessionToken() {
  return localStorage.getItem('fsfit_aluno_token');
}

function currentWeekDay() {
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

function parseStructured(value) {
  if (value && typeof value === 'object') return value;
  const raw = String(value || '').trim();
  if (!raw || (!raw.startsWith('{') && !raw.startsWith('['))) return null;
  try { return JSON.parse(raw); } catch { return null; }
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
  } catch { return null; }
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
  return [item.series != null ? `${item.series} séries` : null, item.repeticoes ? `${item.repeticoes} repetições` : null].filter(Boolean).join(' • ') || 'Ver detalhes';
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
  const rows = mealItems.filter(item => (item.dias_semana || []).map(Number).includes(selectedDietDay)).sort((a, b) => String(a.horario || '').localeCompare(String(b.horario || '')) || Number(a.ordem || 0) - Number(b.ordem || 0));
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

function normalizeWorkout(value) {
  const data = parseStructured(value);
  if (!data) return { name: '', items: [], description: String(value || '').trim() };
  if (Array.isArray(data)) return { name: '', items: data, description: '' };
  return { name: data.nome || data.titulo || '', items: Array.isArray(data.exercicios) ? data.exercicios : [], description: data.descricao || '' };
}

function normalizeDiet(value) {
  const data = parseStructured(value);
  if (!data) return { name: '', items: [], observations: String(value || '').trim() };
  if (Array.isArray(data)) return { name: '', items: data, observations: '' };
  return { name: data.titulo || data.nome || '', items: Array.isArray(data.refeicoes) ? data.refeicoes : [], observations: data.orientacoes || data.observacoes || '' };
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
    if (item.tipo === 'foto') preview = `<div class="student-portal-media-preview"><img src="${esc(item.url)}" alt="${esc(item.titulo || 'Foto compartilhada pelo personal')}" loading="lazy"></div>`;
    else if (item.tipo === 'video') preview = `<div class="student-portal-media-preview"><video src="${esc(item.url)}" controls preload="metadata"></video></div>`;
    else if (item.tipo === 'youtube') {
      const embed = youtubeEmbedUrl(item.url);
      preview = embed ? `<div class="student-portal-media-preview"><iframe src="${esc(embed)}" title="${esc(item.titulo || 'Vídeo do YouTube')}" loading="lazy" allowfullscreen></iframe></div>` : `<a class="student-portal-media-preview student-portal-media-preview-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><div><strong>Abrir no YouTube</strong><span>Assistir vídeo →</span></div></a>`;
    } else preview = `<a class="student-portal-media-preview student-portal-media-preview-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><div><strong>Abrir no Instagram</strong><span>Ver publicação →</span></div></a>`;
    return `<article class="student-portal-media-card">${preview}<div class="student-portal-media-body"><span class="student-portal-media-type">${mediaTypeLabel(item.tipo)}</span><h3 class="student-portal-media-title">${esc(item.titulo || mediaTypeLabel(item.tipo))}</h3></div></article>`;
  }).join('');
  studentMediaSection.classList.remove('hidden');
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from([...atob(base64)].map(char => char.charCodeAt(0)));
}

async function invokePush(body) {
  const { data, error } = await supabase.functions.invoke('aluno-push', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

async function configureNotifications() {
  if (!notificationStatus) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    notificationStatus.textContent = 'Este navegador não oferece suporte a notificações push.';
    return;
  }
  try {
    serviceWorkerRegistration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    const config = await invokePush({ action: 'config' });
    if (!config?.enabled || !config.public_key) {
      notificationStatus.textContent = 'As notificações ainda não foram habilitadas pelo sistema.';
      return;
    }
    vapidPublicKey = config.public_key;
    const subscription = await serviceWorkerRegistration.pushManager.getSubscription();
    if (subscription && Notification.permission === 'granted') {
      notificationStatus.textContent = 'Notificações ativas neste aparelho.';
      disableNotifications.classList.remove('hidden');
      return;
    }
    if (Notification.permission === 'denied') {
      notificationStatus.textContent = 'As notificações estão bloqueadas nas configurações do navegador.';
      return;
    }
    notificationStatus.textContent = 'Ative as notificações para receber lembretes do seu personal no celular.';
    enableNotifications.classList.remove('hidden');
  } catch (error) {
    console.error(error);
    notificationStatus.textContent = 'Não foi possível preparar as notificações neste momento.';
  }
}

async function subscribePush() {
  const token = sessionToken();
  if (!token || !serviceWorkerRegistration || !vapidPublicKey) return;
  enableNotifications.disabled = true;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
    let subscription = await serviceWorkerRegistration.pushManager.getSubscription();
    if (!subscription) subscription = await serviceWorkerRegistration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
    await invokePush({ action: 'subscribe', token, subscription: subscription.toJSON() });
    notificationStatus.textContent = 'Notificações ativas neste aparelho.';
    enableNotifications.classList.add('hidden');
    disableNotifications.classList.remove('hidden');
  } catch (error) {
    console.error(error);
    notificationStatus.textContent = 'Não foi possível ativar as notificações.';
  } finally { enableNotifications.disabled = false; }
}

async function unsubscribePush() {
  const token = sessionToken();
  if (!token || !serviceWorkerRegistration) return;
  disableNotifications.disabled = true;
  try {
    const subscription = await serviceWorkerRegistration.pushManager.getSubscription();
    if (subscription) {
      await invokePush({ action: 'unsubscribe', token, endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
    notificationStatus.textContent = 'Notificações desativadas neste aparelho.';
    disableNotifications.classList.add('hidden');
    if (Notification.permission !== 'denied' && vapidPublicKey) enableNotifications.classList.remove('hidden');
  } catch (error) {
    console.error(error);
    notificationStatus.textContent = 'Não foi possível desativar as notificações.';
  } finally { disableNotifications.disabled = false; }
}

window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; installButton?.classList.remove('hidden'); });
window.addEventListener('appinstalled', () => { installPrompt = null; installButton?.classList.add('hidden'); });
installButton?.addEventListener('click', async () => { if (!installPrompt) return; await installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; installButton.classList.add('hidden'); });
enableNotifications?.addEventListener('click', subscribePush);
disableNotifications?.addEventListener('click', unsubscribePush);

workoutContent?.addEventListener('click', event => {
  const dayButton = event.target.closest('[data-select-workout-day]');
  if (dayButton) { selectedWorkoutDay = Number(dayButton.dataset.selectWorkoutDay); renderWorkoutAgenda(); return; }
  const itemButton = event.target.closest('[data-workout-item]');
  if (itemButton) openWorkoutItem(itemButton.dataset.workoutItem);
});

dietContent?.addEventListener('click', event => {
  const dayButton = event.target.closest('[data-select-diet-day]');
  if (dayButton) { selectedDietDay = Number(dayButton.dataset.selectDietDay); renderDietAgenda(); return; }
  const itemButton = event.target.closest('[data-meal-item]');
  if (itemButton) openMealItem(itemButton.dataset.mealItem);
});

document.querySelectorAll('[data-close-student-detail]').forEach(button => button.addEventListener('click', closeDetail));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDetail(); });

async function load() {
  const token = sessionToken();
  if (!token) { window.location.replace('acesso-aluno.html'); return; }

  const { data: accessToken, error: sessionError } = await supabase.rpc('get_aluno_portal_token', { p_session_token: token });
  if (sessionError || !accessToken) {
    localStorage.removeItem('fsfit_aluno_token');
    localStorage.removeItem('fsfit_aluno_token_expira_em');
    throw new Error('Sua sessão expirou. Entre novamente com WhatsApp e PIN.');
  }

  const { data, error } = await supabase.rpc('get_aluno_portal', { p_access_token: accessToken });
  if (error) throw new Error('Não foi possível acessar este plano.');
  const portal = Array.isArray(data) ? data[0] : data;
  if (!portal) throw new Error('Plano não encontrado ou indisponível.');

  document.querySelector('#student-name').textContent = portal.aluno_nome || 'Aluno';
  document.querySelector('#trainer-name').textContent = portal.personal_nome || 'Seu personal trainer';

  const workout = normalizeWorkout(portal.treino);
  workoutPlanName.textContent = workout.name || '';
  workoutItems = workout.items;
  renderWorkoutAgenda();

  const diet = normalizeDiet(portal.dieta);
  dietPlanName.textContent = diet.name || '';
  mealItems = diet.items;
  renderDietAgenda();

  document.querySelector('#student-observations').textContent = String(portal.observacoes || workout.description || diet.observations || '').trim() || 'Nenhuma observação publicada ainda.';
  renderStudentMedia(portal.midias || []);

  const personalSlug = String(portal.personal_slug || localStorage.getItem('fsfit_personal_slug') || '').trim().toLowerCase();
  if (personalSlug) {
    const personalPageButton = document.querySelector('#personal-page-button');
    personalPageButton.href = `/p/${encodeURIComponent(personalSlug)}`;
    personalPageButton.classList.remove('hidden');
  }

  if (portal.plano_atualizado_em) document.querySelector('#updated-at').textContent = `Atualizado em ${new Date(portal.plano_atualizado_em).toLocaleString('pt-BR')}`;

  const phone = String(portal.personal_whatsapp || '').replace(/\D/g, '');
  if (phone.length >= 10) {
    const message = encodeURIComponent(`Olá, ${portal.personal_nome || 'Personal'}! Sou ${portal.aluno_nome} e tenho uma dúvida sobre meu plano.`);
    const button = document.querySelector('#whatsapp-button');
    button.href = `https://wa.me/${phone}?text=${message}`;
    button.classList.remove('hidden');
  }

  setupTabs();
  loading.classList.add('hidden');
  content.classList.remove('hidden');
  configureNotifications();
}

load().catch(error => {
  console.error(error);
  loading.classList.add('hidden');
  errorState.innerHTML = `${esc(error.message || 'Não foi possível carregar seu plano.')}<div class="actions" style="justify-content:center;margin-top:16px"><a class="btn btn-primary" href="acesso-aluno.html">Entrar novamente</a></div>`;
  errorState.classList.remove('hidden');
});