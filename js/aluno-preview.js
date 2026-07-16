import { supabase } from './supabase.js';

const loading = document.querySelector('#loading-state');
const errorState = document.querySelector('#error-state');
const content = document.querySelector('#student-content');
const studentMediaSection = document.querySelector('#student-media-section');
const studentMediaList = document.querySelector('#student-media-list');
const alunoId = new URLSearchParams(location.search).get('id');

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function renderText(element, value, fallback) {
  element.textContent = String(value || '').trim() || fallback;
}

function youtubeEmbedUrl(url) {
  try {
    const parsed = new URL(url);
    let id = '';
    if (parsed.hostname.includes('youtu.be')) id = parsed.pathname.split('/').filter(Boolean)[0] || '';
    if (parsed.hostname.includes('youtube.com')) {
      id = parsed.searchParams.get('v') || '';
      if (!id && parsed.pathname.startsWith('/shorts/')) id = parsed.pathname.split('/')[2] || '';
      if (!id && parsed.pathname.startsWith('/embed/')) id = parsed.pathname.split('/')[2] || '';
    }
    return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null;
  } catch {
    return null;
  }
}

function mediaTypeLabel(type) {
  return { foto: 'Foto', video: 'Vídeo', youtube: 'YouTube', instagram: 'Instagram' }[type] || 'Mídia';
}

function renderStudentMedia(items) {
  if (!studentMediaSection || !studentMediaList || !Array.isArray(items) || !items.length) return;
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

  const { data, error } = await supabase.rpc('get_aluno_portal_preview', { p_aluno_id: alunoId });
  if (error) throw error;
  const portal = Array.isArray(data) ? data[0] : data;
  if (!portal) throw new Error('Aluno não encontrado ou sem permissão para visualização.');

  document.querySelector('#student-name').textContent = portal.aluno_nome || 'Aluno';
  document.querySelector('#trainer-name').textContent = portal.personal_nome || 'Seu personal trainer';
  renderText(document.querySelector('#workout-content'), portal.treino, 'Nenhum treino publicado ainda.');
  renderText(document.querySelector('#diet-content'), portal.dieta, 'Nenhuma orientação publicada ainda.');
  renderStudentMedia(portal.midias || []);

  if (portal.plano_atualizado_em) {
    document.querySelector('#updated-at').textContent = `Atualizado em ${new Date(portal.plano_atualizado_em).toLocaleString('pt-BR')}`;
  }

  loading.classList.add('hidden');
  content.classList.remove('hidden');
}

load().catch(error => {
  console.error(error);
  loading.classList.add('hidden');
  errorState.textContent = error.message || 'Não foi possível carregar a pré-visualização.';
  errorState.classList.remove('hidden');
});
