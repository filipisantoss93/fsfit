import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('alunos');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const alunoId = new URLSearchParams(location.search).get('id');
const message = document.querySelector('#record-message');
const weightForm = document.querySelector('#weight-form');
const assessmentForm = document.querySelector('#assessment-form');
const pinForm = document.querySelector('#pin-form');
const mediaUploadForm = document.querySelector('#media-upload-form');
const mediaLinkForm = document.querySelector('#media-link-form');
const mediaList = document.querySelector('#media-list');
const mediaCount = document.querySelector('#media-count');
let student = null;

if (!alunoId) {
  showMessage(message, 'Aluno não informado.', 'error');
  throw new Error('Aluno não informado');
}

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function valueOrNull(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(value) {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';
}

function calculateAge(value) {
  if (!value) return null;
  const birth = new Date(`${value}T12:00:00`);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) years--;
  return years;
}

function calculateBmi(weight, heightCm) {
  if (!weight || !heightCm) return null;
  const height = Number(heightCm) / 100;
  return (Number(weight) / (height * height)).toFixed(1).replace('.', ',');
}

function setupTabs() {
  const tabs = [...document.querySelectorAll('[data-record-tab]')];
  const panels = [...document.querySelectorAll('[data-record-panel]')];

  function activate(name) {
    tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.recordTab === name));
    panels.forEach(panel => panel.classList.toggle('active', panel.dataset.recordPanel === name));
    history.replaceState(null, '', `#${name}`);
  }

  tabs.forEach(tab => tab.addEventListener('click', () => activate(tab.dataset.recordTab)));

  const requested = location.hash.replace('#', '');
  if (tabs.some(tab => tab.dataset.recordTab === requested)) activate(requested);
}

function mediaTypeLabel(type) {
  return { foto: 'Foto', video: 'Vídeo', youtube: 'YouTube', instagram: 'Instagram' }[type] || 'Mídia';
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

function isValidSocialUrl(type, url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (type === 'youtube') return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
    if (type === 'instagram') return host === 'instagram.com' || host.endsWith('.instagram.com');
    return false;
  } catch {
    return false;
  }
}

function mediaPreview(item) {
  if (item.tipo === 'foto') {
    return `<div class="student-media-preview"><img src="${esc(item.url)}" alt="${esc(item.titulo || 'Foto do aluno')}" loading="lazy"></div>`;
  }
  if (item.tipo === 'video') {
    return `<div class="student-media-preview"><video src="${esc(item.url)}" controls preload="metadata"></video></div>`;
  }
  if (item.tipo === 'youtube') {
    const embed = youtubeEmbedUrl(item.url);
    if (embed) return `<div class="student-media-preview"><iframe src="${esc(embed)}" title="${esc(item.titulo || 'Vídeo do YouTube')}" loading="lazy" allowfullscreen></iframe></div>`;
  }
  const network = item.tipo === 'instagram' ? 'Instagram' : 'conteúdo';
  return `<a class="student-media-preview student-media-preview-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><div><strong>Abrir no ${network}</strong><span>Ver publicação externa →</span></div></a>`;
}

async function loadMedia() {
  if (!mediaList) return;
  const { data, error } = await supabase
    .from('aluno_midias')
    .select('id,tipo,titulo,url,storage_path,created_at')
    .eq('aluno_id', alunoId)
    .eq('personal_id', session.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    mediaList.innerHTML = '<p class="empty">Não foi possível carregar as mídias.</p>';
    return;
  }

  const items = data || [];
  mediaCount.textContent = `${items.length} ${items.length === 1 ? 'item' : 'itens'}`;
  mediaList.innerHTML = items.length ? items.map(item => `
    <article class="student-media-card">
      ${mediaPreview(item)}
      <div class="student-media-body">
        <span class="student-media-type">${mediaTypeLabel(item.tipo)}</span>
        <h4 class="student-media-title">${esc(item.titulo || mediaTypeLabel(item.tipo))}</h4>
        <div class="student-media-actions">
          <a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Abrir conteúdo</a>
          <button class="btn btn-danger" type="button" data-delete-media="${item.id}" data-storage-path="${esc(item.storage_path || '')}">Excluir</button>
        </div>
      </div>
    </article>`).join('') : '<p class="empty">Nenhuma mídia adicionada para este aluno.</p>';
}

async function loadStudent() {
  const { data, error } = await supabase.from('alunos')
    .select('id,nome,telefone,sexo,data_nascimento,altura_cm,peso_inicial_kg,percentual_gordura_inicial,objetivo,restricoes,observacoes,status')
    .eq('id', alunoId).eq('personal_id', session.user.id).single();

  if (error) {
    showMessage(message, 'Aluno não encontrado ou sem permissão.', 'error');
    throw error;
  }

  student = data;
  const age = calculateAge(data.data_nascimento);
  document.querySelector('#student-name').textContent = data.nome;
  document.querySelector('#student-summary').textContent = age != null ? `${age} anos` : 'Cadastro individual';
  document.querySelector('#student-status').textContent = String(data.status || 'ativo').toUpperCase();
  document.querySelector('#edit-registration').href = `alunos.html?editar=${data.id}`;
  document.querySelector('#workout-editor-link').href = `treino-aluno.html?id=${data.id}`;
  document.querySelector('#diet-editor-link').href = `dieta-aluno.html?id=${data.id}`;
  document.querySelector('#reminders-link').href = `lembretes-aluno.html?id=${data.id}`;
  document.querySelector('#student-height').textContent = data.altura_cm ? `${data.altura_cm} cm` : '—';
  document.querySelector('#profile-data').innerHTML = `
    <p><strong>WhatsApp:</strong> ${esc(data.telefone || 'Não informado')}</p>
    <p><strong>Nascimento:</strong> ${formatDate(data.data_nascimento)}${age != null ? ` (${age} anos)` : ''}</p>
    <p><strong>Objetivo:</strong> ${esc(data.objetivo || 'Não informado')}</p>
    <p><strong>Restrições:</strong> ${esc(data.restricoes || 'Nenhuma informada')}</p>
    <p><strong>Observações:</strong> ${esc(data.observacoes || 'Nenhuma')}</p>`;
}

async function loadEvolution() {
  const [{ data: weights, error: weightError }, { data: assessments, error: assessmentError }] = await Promise.all([
    supabase.from('historico_peso').select('id,peso_kg,data_registro,observacoes').eq('aluno_id', alunoId).eq('personal_id', session.user.id).order('data_registro', { ascending: false }),
    supabase.from('avaliacoes').select('percentual_gordura,data_avaliacao').eq('aluno_id', alunoId).eq('personal_id', session.user.id).order('data_avaliacao', { ascending: false }).limit(1)
  ]);

  if (weightError || assessmentError) {
    showMessage(message, 'Não foi possível carregar toda a evolução física.', 'error');
    return;
  }

  const latestWeight = weights?.[0]?.peso_kg ?? student?.peso_inicial_kg;
  const latestFat = assessments?.[0]?.percentual_gordura ?? student?.percentual_gordura_inicial;
  document.querySelector('#current-weight').textContent = latestWeight ? `${latestWeight} kg` : '—';
  document.querySelector('#weight-date').textContent = weights?.[0]?.data_registro ? formatDate(weights[0].data_registro) : 'Peso do cadastro';
  document.querySelector('#current-fat').textContent = latestFat ? `${latestFat}%` : '—';
  document.querySelector('#student-bmi').textContent = calculateBmi(latestWeight, student?.altura_cm) || '—';

  const chronological = [...(weights || [])].reverse();
  document.querySelector('#weight-history').innerHTML = weights?.length
    ? weights.map(row => {
      const index = chronological.findIndex(item => item.id === row.id);
      const previous = index > 0 ? Number(chronological[index - 1].peso_kg) : null;
      const diff = previous == null ? null : Number(row.peso_kg) - previous;
      const variation = diff == null ? 'Inicial' : `${diff > 0 ? '+' : ''}${diff.toFixed(1).replace('.', ',')} kg`;
      return `<tr>
        <td data-label="Data">${formatDate(row.data_registro)}</td>
        <td data-label="Peso"><strong>${row.peso_kg} kg</strong></td>
        <td data-label="Variação">${variation}</td>
        <td data-label="Observações">${esc(row.observacoes || '—')}</td>
      </tr>`;
    }).join('')
    : '<tr><td colspan="4" class="empty">Nenhum peso registrado.</td></tr>';
}

setupTabs();
weightForm.data_registro.value = new Date().toISOString().slice(0, 10);
assessmentForm.data_avaliacao.value = new Date().toISOString().slice(0, 10);

mediaUploadForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const file = mediaUploadForm.arquivo.files?.[0];
  if (!file) return;

  const allowed = ['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'];
  if (!allowed.includes(file.type)) return showMessage(message, 'Formato de arquivo não permitido.', 'error');
  if (file.size > 50 * 1024 * 1024) return showMessage(message, 'O arquivo deve ter no máximo 50 MB.', 'error');

  const button = mediaUploadForm.querySelector('[type=submit]');
  button.disabled = true;
  let storagePath = null;
  try {
    const ext = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '') || (file.type.startsWith('image/') ? 'jpg' : 'mp4');
    storagePath = `${session.user.id}/${alunoId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('aluno-midias').upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage.from('aluno-midias').getPublicUrl(storagePath);
    const tipo = file.type.startsWith('image/') ? 'foto' : 'video';
    const { error: insertError } = await supabase.from('aluno_midias').insert({
      personal_id: session.user.id,
      aluno_id: alunoId,
      tipo,
      titulo: mediaUploadForm.titulo.value.trim() || null,
      url: publicData.publicUrl,
      storage_path: storagePath
    });
    if (insertError) throw insertError;

    mediaUploadForm.reset();
    showMessage(message, 'Mídia enviada com sucesso.');
    await loadMedia();
  } catch (error) {
    if (storagePath) await supabase.storage.from('aluno-midias').remove([storagePath]);
    showMessage(message, error.message || 'Não foi possível enviar a mídia.', 'error');
  } finally {
    button.disabled = false;
  }
});

mediaLinkForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const tipo = mediaLinkForm.tipo.value;
  const url = mediaLinkForm.url.value.trim();
  if (!isValidSocialUrl(tipo, url)) {
    return showMessage(message, tipo === 'youtube' ? 'Informe um link válido do YouTube.' : 'Informe um link válido do Instagram.', 'error');
  }

  const button = mediaLinkForm.querySelector('[type=submit]');
  button.disabled = true;
  try {
    const { error } = await supabase.from('aluno_midias').insert({
      personal_id: session.user.id,
      aluno_id: alunoId,
      tipo,
      titulo: mediaLinkForm.titulo.value.trim() || null,
      url
    });
    if (error) throw error;
    mediaLinkForm.reset();
    mediaLinkForm.tipo.value = 'youtube';
    showMessage(message, 'Link adicionado com sucesso.');
    await loadMedia();
  } catch (error) {
    showMessage(message, error.message || 'Não foi possível adicionar o link.', 'error');
  } finally {
    button.disabled = false;
  }
});

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-delete-media]');
  if (!button) return;
  if (!confirm('Excluir esta mídia do aluno?')) return;

  button.disabled = true;
  try {
    const id = button.dataset.deleteMedia;
    const storagePath = button.dataset.storagePath;
    const { error } = await supabase.from('aluno_midias').delete().eq('id', id).eq('personal_id', session.user.id);
    if (error) throw error;
    if (storagePath) await supabase.storage.from('aluno-midias').remove([storagePath]);
    showMessage(message, 'Mídia excluída.');
    await loadMedia();
  } catch (error) {
    showMessage(message, error.message || 'Não foi possível excluir a mídia.', 'error');
    button.disabled = false;
  }
});

weightForm.addEventListener('submit', async event => {
  event.preventDefault();
  const payload = {
    personal_id: session.user.id,
    aluno_id: alunoId,
    peso_kg: valueOrNull(weightForm.peso_kg.value),
    data_registro: weightForm.data_registro.value,
    origem: 'personal',
    observacoes: weightForm.observacoes.value.trim() || null
  };
  const { error } = await supabase.from('historico_peso').insert(payload);
  if (error) return showMessage(message, error.message, 'error');
  showMessage(message, 'Peso registrado com sucesso.');
  weightForm.reset();
  weightForm.data_registro.value = new Date().toISOString().slice(0, 10);
  await loadEvolution();
});

assessmentForm.addEventListener('submit', async event => {
  event.preventDefault();
  const payload = {
    personal_id: session.user.id,
    aluno_id: alunoId,
    data_avaliacao: assessmentForm.data_avaliacao.value,
    percentual_gordura: valueOrNull(assessmentForm.percentual_gordura.value),
    cintura_cm: valueOrNull(assessmentForm.cintura_cm.value),
    quadril_cm: valueOrNull(assessmentForm.quadril_cm.value),
    braco_cm: valueOrNull(assessmentForm.braco_cm.value),
    coxa_cm: valueOrNull(assessmentForm.coxa_cm.value),
    observacoes: assessmentForm.observacoes.value.trim() || null
  };
  const { error } = await supabase.from('avaliacoes').insert(payload);
  if (error) return showMessage(message, error.message, 'error');
  showMessage(message, 'Avaliação física salva com sucesso.');
  assessmentForm.reset();
  assessmentForm.data_avaliacao.value = new Date().toISOString().slice(0, 10);
  await loadEvolution();
});

pinForm.pin.addEventListener('input', () => {
  pinForm.pin.value = pinForm.pin.value.replace(/\D/g, '').slice(0, 4);
});

pinForm.addEventListener('submit', async event => {
  event.preventDefault();
  const pin = pinForm.pin.value.replace(/\D/g, '');
  if (pin.length !== 4) return showMessage(message, 'O PIN deve ter exatamente 4 números.', 'error');
  const { data, error } = await supabase.functions.invoke('personal-aluno-pin', { body: { action: 'set_pin', aluno_id: alunoId, pin } });
  if (error || !data?.success) return showMessage(message, data?.error || 'Não foi possível redefinir o PIN.', 'error');
  pinForm.reset();
  showMessage(message, 'PIN do aluno atualizado. Sessões anteriores foram encerradas.');
});

await loadStudent();
await Promise.all([loadEvolution(), loadMedia()]);
