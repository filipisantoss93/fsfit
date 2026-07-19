import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting } from './layout.js';

renderHeader('painel');
const session = await requireSession();

if (session) {
  await setGreeting(session);

  const access = session.fsfitAccess;
  const freeMode = !access?.acesso_premium;
  const card = document.querySelector('#public-link-card');
  const linkText = document.querySelector('#dashboard-public-link');
  const description = document.querySelector('#public-link-description');
  const openLink = document.querySelector('#open-dashboard-public-link');
  const copyButton = document.querySelector('#copy-dashboard-public-link');
  const configureLink = document.querySelector('#configure-dashboard-public-link');

  const { data: publicProfile, error: publicProfileError } = await supabase
    .from('perfis_publicos')
    .select('slug')
    .eq('personal_id', session.user.id)
    .maybeSingle();

  if (!publicProfileError && publicProfile?.slug) {
    const url = `https://fsfit.com.br/p/${encodeURIComponent(publicProfile.slug)}`;
    linkText.textContent = url;
    linkText.title = url;
    openLink.href = url;

    copyButton.addEventListener('click', async () => {
      const originalText = copyButton.textContent;
      try {
        await navigator.clipboard.writeText(url);
        copyButton.textContent = 'Link copiado!';
        setTimeout(() => { copyButton.textContent = originalText; }, 1800);
      } catch {
        copyButton.textContent = 'Não foi possível copiar';
        setTimeout(() => { copyButton.textContent = originalText; }, 2200);
      }
    });
  } else {
    card.classList.add('public-link-unconfigured');
    description.textContent = 'Configure sua página profissional para ter um link único e compartilhar com seus alunos.';
    linkText.textContent = 'Sua página pública ainda não está configurada.';
    copyButton.classList.add('hidden');
    openLink.classList.add('hidden');
    configureLink.classList.remove('hidden');
  }

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

  await loadDashboardData(freeMode);
}

async function loadDashboardData(freeMode) {
  const [studentsResult, workoutsResult] = await Promise.all([
    supabase
      .from('alunos')
      .select('id,nome,created_at')
      .order('created_at', { ascending: false }),
    supabase
      .from('treinos')
      .select('id,nome,dias_semana,status,aluno_id,alunos!inner(id,nome,periodo_aula,horario_aula,local_aula)')
      .eq('personal_id', session.user.id)
      .eq('status', 'ativo')
      .order('updated_at', { ascending: false })
  ]);

  const alunos = studentsResult.data || [];
  const treinos = workoutsResult.data || [];

  if (studentsResult.error) console.error('Erro ao carregar alunos do painel:', studentsResult.error);
  if (workoutsResult.error) console.error('Erro ao carregar treinos do painel:', workoutsResult.error);

  renderStudents(alunos, treinos, freeMode);
  renderTodayAgenda(treinos, freeMode);
}

function renderStudents(alunos, treinos, freeMode) {
  const activeStudentIds = new Set(
    treinos
      .map(treino => treino.aluno_id || treino.alunos?.id)
      .filter(Boolean)
  );
  const noWorkoutCount = alunos.filter(aluno => !activeStudentIds.has(aluno.id)).length;

  setText('#total-alunos', alunos.length);
  setText('#sem-treino', noWorkoutCount);
  setText('#attention-no-workout', noWorkoutCount);

  const list = document.querySelector('#recent-list');
  if (!list) return;

  list.innerHTML = alunos.length
    ? alunos.slice(0, 5).map(aluno => `
        <tr>
          <td>${escapeHtml(aluno.nome)}</td>
          <td>${new Date(aluno.created_at).toLocaleDateString('pt-BR')}</td>
          <td>${freeMode
            ? '<span style="color:var(--muted);font-weight:700">Bloqueado</span>'
            : `<a class="btn btn-outline" href="alunos.html?editar=${encodeURIComponent(aluno.id)}">Abrir</a>`}
          </td>
        </tr>`).join('')
    : '<tr><td colspan="3" class="empty">Nenhum aluno cadastrado.</td></tr>';
}

function renderTodayAgenda(treinos, freeMode) {
  const today = new Date();
  const todayDay = today.getDay();
  const entries = [];
  const seen = new Set();

  treinos.forEach(treino => {
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

  setText('#alunos-hoje', entries.length);
  setText('#attention-today', entries.length);
  setText('#today-count', entries.length);

  const dateLabel = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  }).format(today);
  setText('#today-date', capitalize(dateLabel));

  const list = document.querySelector('#today-list');
  if (!list) return;

  if (!entries.length) {
    list.innerHTML = '<p class="dashboard-empty">Nenhum aluno programado para hoje. Sua agenda está livre.</p>';
    return;
  }

  list.innerHTML = entries.map(entry => {
    const time = entry.horario ? String(entry.horario).slice(0, 5) : '—';
    const period = periodLabel(entry.periodo);
    const details = [period, entry.local || 'Local não informado'].filter(Boolean).join(' · ');
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
      : `<a class="today-entry" href="ficha-aluno.html?id=${encodeURIComponent(entry.id)}">${content}</a>`;
  }).join('');
}

function periodLabel(value) {
  return ({ manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' })[value] || 'Período não informado';
}

function capitalize(value = '') {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
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
