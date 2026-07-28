import { supabase } from './supabase.js';
import { requireSession } from './layout.js';

if (window.matchMedia('(min-width: 1100px)').matches) {
  const session = await requireSession();
  if (session) {
    initializeGeneralOverview(session.user.id);
    loadSidebarPersonalProfile(session.user.id);
  }
}

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function initials(value = '') {
  const parts = String(value).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A';
  return `${parts[0]?.[0] || ''}${parts.length > 1 ? parts.at(-1)?.[0] || '' : ''}`.toUpperCase();
}

function currency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function localDate(value) {
  if (!value) return 'Data não informada';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? 'Data não informada' : date.toLocaleDateString('pt-BR');
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function recentMonths() {
  const now = new Date();
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    return { key: monthKey(date), label: date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') };
  });
}

function avatar(student) {
  const photo = String(student.foto_perfil_url || '').trim();
  return `<span class="dashboard-general-avatar" aria-hidden="true">${photo ? `<img src="${esc(photo)}" alt="" loading="lazy">` : esc(initials(student.nome))}</span>`;
}

async function loadSidebarPersonalProfile(userId) {
  const avatarHost = document.querySelector('#sidebar-profile-avatar');
  const nameHost = document.querySelector('#sidebar-profile-name');
  if (!avatarHost && !nameHost) return;

  try {
    const [{ data: profile }, { data: publicProfile }] = await Promise.all([
      supabase.from('perfis').select('nome').eq('id', userId).maybeSingle(),
      supabase.from('perfis_publicos').select('nome_publico,foto_url').eq('personal_id', userId).maybeSingle()
    ]);

    const name = String(publicProfile?.nome_publico || profile?.nome || 'Personal').trim() || 'Personal';
    const photo = String(publicProfile?.foto_url || '').trim();
    if (nameHost) nameHost.textContent = name;
    if (!avatarHost) return;

    avatarHost.style.backgroundImage = '';
    avatarHost.classList.remove('has-image');
    avatarHost.replaceChildren();

    if (photo) {
      const image = document.createElement('img');
      image.src = photo;
      image.alt = '';
      image.loading = 'lazy';
      image.addEventListener('error', () => {
        avatarHost.replaceChildren();
        avatarHost.textContent = initials(name);
        avatarHost.classList.remove('has-image');
      }, { once: true });
      avatarHost.appendChild(image);
      avatarHost.classList.add('has-image');
    } else {
      avatarHost.textContent = initials(name);
    }
  } catch (error) {
    console.info('Foto do personal indisponível no menu:', error?.message || error);
  }
}

function waitForHomePanel() {
  return new Promise(resolve => {
    const existing = document.querySelector('#dashboard-home-panel');
    if (existing) return resolve(existing);
    const observer = new MutationObserver(() => {
      const panel = document.querySelector('#dashboard-home-panel');
      if (!panel) return;
      observer.disconnect();
      resolve(panel);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

async function initializeGeneralOverview(userId) {
  const homePanel = await waitForHomePanel();
  if (homePanel.querySelector('.dashboard-general-overview')) return;

  const section = document.createElement('section');
  section.className = 'dashboard-general-overview';
  section.setAttribute('aria-label', 'Resumo geral da consultoria');
  section.innerHTML = `
    <article class="dashboard-general-card">
      <div class="dashboard-general-heading">
        <div><small>HISTÓRICO FINANCEIRO</small><h2>Receita dos últimos 6 meses</h2><p>Valores confirmados nas mensalidades dos alunos.</p></div>
        <a class="home-section-link" href="financeiro.html">Ver financeiro</a>
      </div>
      <div id="dashboard-general-revenue" class="dashboard-revenue-chart"><div class="dashboard-general-empty">Carregando histórico financeiro...</div></div>
    </article>
    <div class="dashboard-general-side">
      <article class="dashboard-general-card">
        <div class="dashboard-general-heading"><div><small>ALUNOS</small><h2>Últimos cadastrados</h2><p>Cadastros mais recentes da sua carteira.</p></div><a class="home-section-link" href="alunos.html">Ver todos</a></div>
        <div id="dashboard-general-students" class="dashboard-general-list"><div class="dashboard-general-empty">Carregando alunos...</div></div>
      </article>
      <article class="dashboard-general-card">
        <div class="dashboard-general-heading"><div><small>PRÓXIMOS RECEBIMENTOS</small><h2>Vencimentos</h2><p>Mensalidades pendentes com vencimento mais próximo.</p></div><a class="home-section-link" href="financeiro.html">Ver todos</a></div>
        <div id="dashboard-general-due" class="dashboard-general-list"><div class="dashboard-general-empty">Carregando vencimentos...</div></div>
      </article>
    </div>`;

  homePanel.appendChild(section);
  await loadGeneralData(userId, section);
}

async function loadGeneralData(userId, section) {
  const months = recentMonths();
  const firstMonth = `${months[0].key}-01`;
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const [paymentsResult, studentsResult, dueResult] = await Promise.all([
    supabase.from('mensalidades_alunos').select('competencia,valor,status,confirmado_em').eq('personal_id', userId).eq('status', 'pago').gte('competencia', firstMonth),
    supabase.from('alunos').select('id,nome,created_at,foto_perfil_url').eq('personal_id', userId).eq('status', 'ativo').order('created_at', { ascending: false }).limit(4),
    supabase.from('mensalidades_alunos').select('id,aluno_id,vencimento,valor,status,alunos(nome,foto_perfil_url)').eq('personal_id', userId).in('status', ['pendente', 'informado']).gte('vencimento', todayIso).order('vencimento', { ascending: true }).limit(4)
  ]);

  renderRevenue(section.querySelector('#dashboard-general-revenue'), months, paymentsResult.data || [], paymentsResult.error);
  renderStudents(section.querySelector('#dashboard-general-students'), studentsResult.data || [], studentsResult.error);
  renderDue(section.querySelector('#dashboard-general-due'), dueResult.data || [], dueResult.error);
}

function renderRevenue(host, months, payments, error) {
  if (!host) return;
  if (error) {
    host.innerHTML = '<div class="dashboard-general-empty">Não foi possível carregar o histórico financeiro.</div>';
    return;
  }
  const totals = new Map(months.map(month => [month.key, 0]));
  payments.forEach(payment => {
    const key = String(payment.competencia || payment.confirmado_em || '').slice(0, 7);
    if (totals.has(key)) totals.set(key, totals.get(key) + Number(payment.valor || 0));
  });
  const max = Math.max(...totals.values(), 1);
  host.innerHTML = months.map(month => {
    const total = totals.get(month.key) || 0;
    const height = total ? Math.max(6, Math.round((total / max) * 100)) : 3;
    return `<div class="dashboard-revenue-column"><span class="dashboard-revenue-value">${esc(currency(total))}</span><div class="dashboard-revenue-bar-wrap"><span class="dashboard-revenue-bar" style="height:${height}%"></span></div><span class="dashboard-revenue-month">${esc(month.label)}</span></div>`;
  }).join('');
}

function renderStudents(host, students, error) {
  if (!host) return;
  if (error) return void (host.innerHTML = '<div class="dashboard-general-empty">Não foi possível carregar os alunos recentes.</div>');
  if (!students.length) return void (host.innerHTML = '<div class="dashboard-general-empty">Nenhum aluno cadastrado ainda.</div>');
  host.innerHTML = students.map(student => `<a class="dashboard-general-item" href="ficha-aluno.html?id=${encodeURIComponent(student.id)}">${avatar(student)}<span class="dashboard-general-copy"><strong>${esc(student.nome)}</strong><small>Cadastrado em ${esc(localDate(student.created_at))}</small></span><span class="dashboard-general-status">Abrir</span></a>`).join('');
}

function renderDue(host, payments, error) {
  if (!host) return;
  if (error) return void (host.innerHTML = '<div class="dashboard-general-empty">Não foi possível carregar os próximos vencimentos.</div>');
  if (!payments.length) return void (host.innerHTML = '<div class="dashboard-general-empty">Nenhum vencimento pendente encontrado.</div>');
  host.innerHTML = payments.map(payment => {
    const student = payment.alunos || {};
    return `<a class="dashboard-general-item" href="financeiro.html">${avatar(student)}<span class="dashboard-general-copy"><strong>${esc(student.nome || 'Aluno')}</strong><small>Vence em ${esc(localDate(payment.vencimento))} · ${esc(currency(payment.valor))}</small></span><span class="dashboard-general-status">${payment.status === 'informado' ? 'Confirmar' : 'Pendente'}</span></a>`;
  }).join('');
}
