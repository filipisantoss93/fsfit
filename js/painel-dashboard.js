import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting } from './layout.js';
import { patchUiCache, readUiCache } from './ui-cache.js';

const PANEL_RETURN_SCROLL_KEY = 'fsfit:panel:return-scroll';
const PANEL_RESTORE_SCROLL_KEY = 'fsfit:panel:restore-scroll';
const PANEL_CACHE_SCOPE = 'painel-operacional';
const PANEL_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let session = null;
let hasCachedStudents = false;
let hasCachedTodayAgenda = false;

function savePanelReturnPosition() {
  try {
    sessionStorage.setItem(PANEL_RETURN_SCROLL_KEY, JSON.stringify({
      y: window.scrollY,
      savedAt: Date.now()
    }));
  } catch {
    // Ignora indisponibilidade do storage sem bloquear a navegação.
  }
}

function restorePanelReturnPosition() {
  try {
    if (sessionStorage.getItem(PANEL_RESTORE_SCROLL_KEY) !== '1') return;
    const saved = JSON.parse(sessionStorage.getItem(PANEL_RETURN_SCROLL_KEY) || 'null');
    sessionStorage.removeItem(PANEL_RESTORE_SCROLL_KEY);
    if (!saved || !Number.isFinite(Number(saved.y))) return;

    const targetY = Number(saved.y);
    [0, 60, 180].forEach(delay => {
      setTimeout(() => window.scrollTo({ top: targetY, behavior: 'auto' }), delay);
    });
  } catch {
    // Sem restauração explícita, o navegador ainda pode restaurar a rolagem pelo histórico.
  }
}

window.addEventListener('pageshow', restorePanelReturnPosition);
restorePanelReturnPosition();

renderHeader('painel');
session = await requireSession();

if (session) {
  const access = session.fsfitAccess;
  const freeMode = !access?.acesso_premium;
  const cached = readUiCache(session.user.id, PANEL_CACHE_SCOPE, { maxAgeMs: PANEL_CACHE_MAX_AGE_MS });

  if (cached?.value) hydrateOperationalCache(cached.value, freeMode);

  // Saudação, notificações e verificação administrativa não devem bloquear os dados do painel.
  setGreeting(session).catch(error => console.info('Saudação/notificações indisponíveis temporariamente:', error?.message || error));

  if (freeMode) {
    const notice = document.querySelector('#access-notice');
    if (notice) {
      notice.style.display = 'block';
      notice.className = 'message show error';
      notice.textContent = 'Seu período gratuito de 7 dias terminou e sua conta voltou para o plano Free. As áreas de gestão de alunos, exercícios e agenda ficam bloqueadas até a ativação de um plano pago.';
    }

    document.querySelectorAll('[data-premium-link]').forEach(link => {
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
      link.setAttribute('title', 'Disponível em um plano pago');
      link.classList.add('premium-locked');
    });
  }

  // Stale-while-revalidate: o cache já foi exibido; agora sincroniza tudo em paralelo.
  await Promise.allSettled([
    loadPublicProfile(),
    loadStudents(freeMode),
    loadTodayAgenda(freeMode)
  ]);
}

function hydrateOperationalCache(cache, freeMode) {
  if (cache.publicConfigured === true && cache.publicUrl) applyPublicProfileUrl(cache.publicUrl);
  if (cache.publicConfigured === false) applyPublicProfileUnconfigured();

  if (Array.isArray(cache.students)) {
    hasCachedStudents = true;
    renderRecentStudents(cache.students, freeMode);
  }

  if (Number.isFinite(Number(cache.noWorkoutCount))) {
    const count = Number(cache.noWorkoutCount);
    setText('#sem-treino', count);
    setText('#attention-no-workout', count);
  }

  if (cache.todayKey === localDateKey() && Array.isArray(cache.todayEntries)) {
    hasCachedTodayAgenda = true;
    renderTodayEntries(cache.todayEntries, freeMode);
  }
}

async function loadPublicProfile() {
  try {
    const { data: publicProfile, error: publicProfileError } = await supabase
      .from('perfis_publicos')
      .select('slug')
      .eq('personal_id', session.user.id)
      .maybeSingle();

    if (publicProfileError) throw publicProfileError;

    if (publicProfile?.slug) {
      const url = `https://fsfit.com.br/p/${encodeURIComponent(publicProfile.slug)}`;
      applyPublicProfileUrl(url);
      patchUiCache(session.user.id, PANEL_CACHE_SCOPE, { publicConfigured: true, publicUrl: url });
      return;
    }

    applyPublicProfileUnconfigured();
    patchUiCache(session.user.id, PANEL_CACHE_SCOPE, { publicConfigured: false, publicUrl: '' });
  } catch (error) {
    console.error('Erro ao carregar link público:', error);
  }
}

function applyPublicProfileUrl(url) {
  const card = document.querySelector('#public-link-card');
  const linkText = document.querySelector('#dashboard-public-link');
  const description = document.querySelector('#public-link-description');
  const openLink = document.querySelector('#open-dashboard-public-link');
  const copyButton = document.querySelector('#copy-dashboard-public-link');
  const configureLink = document.querySelector('#configure-dashboard-public-link');

  card?.classList.remove('public-link-unconfigured');
  if (description) description.textContent = 'Página pública configurada e pronta para compartilhar.';
  if (linkText) {
    linkText.textContent = url;
    linkText.title = url;
  }
  if (openLink) {
    openLink.href = url;
    openLink.classList.remove('hidden');
  }
  copyButton?.classList.remove('hidden');
  configureLink?.classList.add('hidden');

  if (copyButton && copyButton.dataset.copyBound !== url) {
    copyButton.dataset.copyBound = url;
    copyButton.onclick = async () => {
      const originalText = copyButton.textContent;
      try {
        await navigator.clipboard.writeText(url);
        copyButton.textContent = 'Link copiado!';
        setTimeout(() => { copyButton.textContent = originalText; }, 1800);
      } catch {
        copyButton.textContent = 'Não foi possível copiar';
        setTimeout(() => { copyButton.textContent = originalText; }, 2200);
      }
    };
  }
}

function applyPublicProfileUnconfigured() {
  const card = document.querySelector('#public-link-card');
  const linkText = document.querySelector('#dashboard-public-link');
  const description = document.querySelector('#public-link-description');
  const openLink = document.querySelector('#open-dashboard-public-link');
  const copyButton = document.querySelector('#copy-dashboard-public-link');
  const configureLink = document.querySelector('#configure-dashboard-public-link');

  card?.classList.add('public-link-unconfigured');
  if (description) description.textContent = 'Configure sua página profissional para ter um link único e compartilhar com seus alunos.';
  if (linkText) linkText.textContent = 'Sua página pública ainda não está configurada.';
  copyButton?.classList.add('hidden');
  openLink?.classList.add('hidden');
  configureLink?.classList.remove('hidden');
}

function bindRecentStudentRows() {
  const list = document.querySelector('#recent-list');
  if (!list || list.dataset.rowNavigationBound === '1') return;
  list.dataset.rowNavigationBound = '1';

  const openRow = row => {
    const href = row?.dataset.studentHref;
    if (href) window.location.href = href;
  };

  list.addEventListener('click', event => {
    const row = event.target.closest('[data-student-href]');
    if (row) openRow(row);
  });

  list.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('[data-student-href]');
    if (!row) return;
    event.preventDefault();
    openRow(row);
  });
}

function bindTodayAgendaReturn() {
  const list = document.querySelector('#today-list');
  if (!list || list.dataset.panelReturnBound === '1') return;
  list.dataset.panelReturnBound = '1';
  list.addEventListener('click', event => {
    const link = event.target.closest('a.today-entry[data-panel-return]');
    if (link) savePanelReturnPosition();
  });
}

bindRecentStudentRows();
bindTodayAgendaReturn();

async function loadStudents(freeMode) {
  try {
    const { data, error } = await supabase
      .from('alunos')
      .select('id,nome,created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    const alunos = Array.isArray(data) ? data : [];

    renderRecentStudents(alunos, freeMode);
    patchUiCache(session.user.id, PANEL_CACHE_SCOPE, { students: alunos });
    hasCachedStudents = true;

    await loadStudentsWithoutWorkout(alunos);
  } catch (error) {
    console.error('Erro ao carregar alunos do painel:', error);
    if (hasCachedStudents) return;
    setText('#total-alunos', '—');
    setText('#sem-treino', '—');
    setText('#attention-no-workout', '—');
    const list = document.querySelector('#recent-list');
    if (list) list.innerHTML = '<tr><td colspan="3" class="empty">Não foi possível carregar os alunos recentes.</td></tr>';
  }
}

function renderRecentStudents(alunos, freeMode) {
  const list = document.querySelector('#recent-list');
  setText('#total-alunos', alunos.length);

  if (!list) return;
  list.innerHTML = alunos.length
    ? alunos.slice(0, 5).map(aluno => {
        const href = `ficha-aluno.html?id=${encodeURIComponent(aluno.id)}`;
        const rowAttrs = freeMode
          ? 'class="recent-student-row is-locked" aria-disabled="true" title="Disponível em um plano pago"'
          : `class="recent-student-row" data-student-href="${href}" tabindex="0" role="link" aria-label="Abrir ficha de ${escapeHtml(aluno.nome)}"`;
        return `
          <tr ${rowAttrs}>
            <td><span class="recent-student-person"><span class="recent-student-avatar" aria-hidden="true">${escapeHtml(initials(aluno.nome))}</span><strong>${escapeHtml(aluno.nome)}</strong></span></td>
            <td>${formatDate(aluno.created_at)}</td>
            <td class="recent-student-chevron" aria-hidden="true">${freeMode ? '·' : '›'}</td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="3" class="empty">Nenhum aluno cadastrado.</td></tr>';
}

async function loadStudentsWithoutWorkout(alunos) {
  try {
    const { data, error } = await supabase
      .from('treinos')
      .select('alunos!inner(id)')
      .eq('personal_id', session.user.id)
      .eq('status', 'ativo');

    if (error) throw error;
    const treinos = Array.isArray(data) ? data : [];
    const activeStudentIds = new Set(treinos.map(treino => treino.alunos?.id).filter(Boolean));
    const noWorkoutCount = alunos.filter(aluno => !activeStudentIds.has(aluno.id)).length;

    setText('#sem-treino', noWorkoutCount);
    setText('#attention-no-workout', noWorkoutCount);
    patchUiCache(session.user.id, PANEL_CACHE_SCOPE, { noWorkoutCount });
  } catch (error) {
    console.error('Erro ao calcular alunos sem treino ativo:', error);
    const cached = readUiCache(session.user.id, PANEL_CACHE_SCOPE)?.value;
    if (Number.isFinite(Number(cached?.noWorkoutCount))) return;
    setText('#sem-treino', '—');
    setText('#attention-no-workout', '—');
  }
}

async function loadTodayAgenda(freeMode) {
  const today = new Date();
  const todayDay = today.getDay();

  try {
    const { data, error } = await supabase
      .from('treinos')
      .select('id,nome,dias_semana,status,alunos!inner(id,nome,periodo_aula,horario_aula,local_aula)')
      .eq('personal_id', session.user.id)
      .eq('status', 'ativo')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const entries = [];
    const seen = new Set();

    (Array.isArray(data) ? data : []).forEach(treino => {
      const student = treino.alunos;
      if (!student?.id || !Array.isArray(treino.dias_semana)) return;
      if (!treino.dias_semana.map(Number).includes(todayDay)) return;
      if (seen.has(student.id)) return;
      seen.add(student.id);

      entries.push({
        id: student.id,
        nome: student.nome,
        horario: student.horario_aula,
        periodo: student.periodo_aula,
        local: student.local_aula,
        treino: treino.nome
      });
    });

    entries.sort((a, b) => {
      if (!a.horario && !b.horario) return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
      if (!a.horario) return 1;
      if (!b.horario) return -1;
      return String(a.horario).localeCompare(String(b.horario));
    });

    renderTodayEntries(entries, freeMode);
    patchUiCache(session.user.id, PANEL_CACHE_SCOPE, { todayKey: localDateKey(), todayEntries: entries });
    hasCachedTodayAgenda = true;
  } catch (error) {
    console.error('Erro ao carregar agenda de hoje:', error);
    if (hasCachedTodayAgenda) return;
    setText('#alunos-hoje', '—');
    setText('#attention-today', '—');
    setText('#today-count', '—');
    const list = document.querySelector('#today-list');
    if (list) list.innerHTML = '<p class="dashboard-empty">Não foi possível carregar a agenda de hoje.</p>';
  }
}

function renderTodayEntries(entries, freeMode) {
  const today = new Date();
  const dateLabel = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  }).format(today);

  setText('#today-date', capitalize(dateLabel));
  setText('#alunos-hoje', entries.length);
  setText('#attention-today', entries.length);
  setText('#today-count', entries.length);

  const list = document.querySelector('#today-list');
  if (!list) return;
  if (!entries.length) {
    list.innerHTML = '<p class="dashboard-empty">Nenhum aluno programado para hoje. Sua agenda está livre.</p>';
    return;
  }

  list.innerHTML = entries.map(entry => {
    const time = entry.horario ? String(entry.horario).slice(0, 5) : '—';
    const details = [periodLabel(entry.periodo), entry.local || 'Local não informado'].join(' · ');
    const content = `
      <div class="today-time">${escapeHtml(time)}</div>
      <div class="today-entry-main">
        <strong>${escapeHtml(entry.nome)}</strong>
        <span>${escapeHtml(entry.treino || 'Treino ativo')}</span>
        <small>${escapeHtml(details)}</small>
      </div>
      <span class="today-open">${freeMode ? 'Bloqueado' : 'Abrir ficha →'}</span>`;

    return freeMode
      ? `<div class="today-entry locked" aria-disabled="true" title="Disponível em um plano pago">${content}</div>`
      : `<a class="today-entry" data-panel-return href="ficha-aluno.html?id=${encodeURIComponent(entry.id)}&origem=painel">${content}</a>`;
  }).join('');
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function periodLabel(value) {
  return ({ manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' })[value] || 'Período não informado';
}

function capitalize(value = '') {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

function initials(value = '') {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map(part => part.charAt(0)).join('') || 'A').toUpperCase();
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
