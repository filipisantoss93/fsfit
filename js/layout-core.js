import './mobile-experience.js?v=20260721-mobile-polish1';
import './mobile-experience-fixes.js?v=20260721-mobile-polish2';
import { supabase } from './supabase.js';

const LEGACY_LAYOUT_URL = 'https://cdn.jsdelivr.net/gh/filipisantoss93/fsfit@9168e0e760f187b8f8d78a833122397c0a19b934/js/layout.js';
const ACCESS_CACHE_KEY = 'fsfit:access-status-cache';
const FREE_ALLOWED_PAGES = new Set([
  'painel.html',
  'perfil.html',
  'contato.html',
  'assinatura.html',
  'admin.html',
  'admin-contatos.html'
]);
const messageTimers = new WeakMap();
let legacyLayoutPromise = null;
let lastProfile = null;

function currentPage() {
  const page = window.location.pathname.split('/').pop();
  return page || 'index.html';
}

function loadLegacyLayout() {
  if (!legacyLayoutPromise) {
    legacyLayoutPromise = import(LEGACY_LAYOUT_URL).catch(error => {
      legacyLayoutPromise = null;
      throw error;
    });
  }
  return legacyLayoutPromise;
}

function withTimeout(promise, ms, label) {
  let timer = null;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(`${label} excedeu o tempo limite.`)), ms);
    })
  ]).finally(() => {
    if (timer) window.clearTimeout(timer);
  });
}

function ensureHeaderStyles() {
  if (document.querySelector('link[data-fsfit-header-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/header-menu.css?v=20260717-support2';
  link.dataset.fsfitHeaderStyles = 'true';
  document.head.appendChild(link);
}

export function renderHeader(active = '') {
  ensureHeaderStyles();
  const host = document.querySelector('#header-container');
  if (!host) return;

  host.innerHTML = `
    <header class="main-header">
      <nav class="nav-container" aria-label="Navegação principal">
        <a class="logo-nav" href="painel.html" aria-label="FS Fit — Início"><strong>FS</strong><span>Fit</span></a>
        <span id="user-greeting" class="user-greeting"></span>

        <ul id="nav-menu" class="nav-menu" aria-label="Menu principal">
          <li><a data-page="painel" href="painel.html">Início</a></li>
          <li><a data-page="alunos" href="alunos.html">Alunos</a></li>
          <li><a data-page="exercicios" href="biblioteca-exercicios.html">Exercícios</a></li>
          <li><a data-page="alimentacao" href="biblioteca-alimentar.html">Alimentação</a></li>
          <li><a data-page="agenda" href="agenda.html">Agenda</a></li>
          <li><a data-page="financeiro" href="financeiro.html">Financeiro</a></li>
          <li class="nav-divider" aria-hidden="true"></li>
          <li><a data-page="perfil" href="perfil.html">Meu perfil</a></li>
          <li><a data-page="contato" href="contato.html">Contato</a></li>
          <li id="admin-nav" class="hidden nav-admin-item">
            <a data-page="admin" href="admin.html">
              <span aria-hidden="true">⚙</span>
              <span>Administração</span>
              <span class="admin-support-nav-badge hidden" data-admin-support-badge aria-label="0 notificações de suporte">0</span>
            </a>
          </li>
          <li class="nav-divider" aria-hidden="true"></li>
          <li><button id="logout-button" class="logout" type="button">SAIR</button></li>
        </ul>

        <div class="nav-header-actions">
          <div class="notification-shell">
            <button id="notification-button" class="notification-button" type="button" aria-label="Abrir notificações" aria-expanded="false" aria-controls="notification-panel">
              <span class="notification-bell" aria-hidden="true">🔔</span>
              <span id="notification-badge" class="notification-badge hidden">0</span>
            </button>
            <section id="notification-panel" class="notification-panel" aria-label="Notificações" hidden>
              <div class="notification-panel-header">
                <div><small>CENTRAL</small><strong>Notificações</strong></div>
                <div class="notification-panel-actions">
                  <button id="notification-mark-all" type="button" class="notification-mark-all hidden">Marcar todas como lidas</button>
                  <button id="notification-clear-all" type="button" class="notification-clear-all hidden">Limpar notificações</button>
                </div>
              </div>
              <div id="notification-list" class="notification-list">
                <p class="notification-empty">Nenhuma notificação.</p>
              </div>
            </section>
          </div>
          <button id="menu-button" class="menu-mobile-btn" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="nav-menu">☰</button>
        </div>
      </nav>
    </header>`;

  const menu = host.querySelector('#nav-menu');
  const menuButton = host.querySelector('#menu-button');
  const notificationButton = host.querySelector('#notification-button');
  const notificationPanel = host.querySelector('#notification-panel');

  host.querySelector(`[data-page="${active}"]`)?.classList.add('active');

  const setMenuOpen = open => {
    menu?.classList.toggle('active', open);
    menuButton?.setAttribute('aria-expanded', String(open));
    if (menuButton) menuButton.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    document.body.classList.toggle('nav-menu-open', open && window.matchMedia('(max-width: 860px)').matches);
  };

  const setNotificationsOpen = open => {
    if (!notificationPanel || !notificationButton) return;
    notificationPanel.hidden = !open;
    notificationButton.setAttribute('aria-expanded', String(open));
  };

  menuButton?.addEventListener('click', event => {
    event.stopPropagation();
    setNotificationsOpen(false);
    setMenuOpen(!menu?.classList.contains('active'));
  });

  notificationButton?.addEventListener('click', event => {
    event.stopPropagation();
    setMenuOpen(false);
    setNotificationsOpen(notificationPanel?.hidden ?? true);
  });

  menu?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenuOpen(false)));

  document.addEventListener('click', event => {
    if (!host.contains(event.target)) {
      setMenuOpen(false);
      setNotificationsOpen(false);
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    setMenuOpen(false);
    setNotificationsOpen(false);
  });

  window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width: 860px)').matches) {
      setMenuOpen(false);
      document.body.classList.remove('nav-menu-open');
    }
  });

  host.querySelector('#logout-button')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    window.location.replace('index.html');
  });
}

export async function ensurePersonalProfile(session) {
  if (!session?.user?.id) throw new Error('Sessão inválida.');

  try {
    const result = await withTimeout(
      supabase
        .from('perfis')
        .select('id,nome,tipo,ativo,plano,trial_inicio,trial_fim')
        .eq('id', session.user.id)
        .maybeSingle(),
      3500,
      'Carregamento do perfil'
    );

    if (result?.error) throw result.error;
    if (result?.data) {
      lastProfile = result.data;
      return result.data;
    }

    const fallbackName = session.user.user_metadata?.full_name?.trim()
      || session.user.user_metadata?.nome?.trim()
      || session.user.email?.split('@')[0]
      || 'Personal';
    const trialInicio = new Date();
    const trialFim = new Date(trialInicio.getTime() + 7 * 24 * 60 * 60 * 1000);

    const insertResult = await withTimeout(
      supabase
        .from('perfis')
        .insert({
          id: session.user.id,
          tipo: 'personal',
          nome: fallbackName,
          plano: 'trial',
          ativo: true,
          trial_inicio: trialInicio.toISOString(),
          trial_fim: trialFim.toISOString()
        })
        .select('id,nome,tipo,ativo,plano,trial_inicio,trial_fim')
        .single(),
      3500,
      'Criação do perfil'
    );

    if (insertResult?.error) throw insertResult.error;
    lastProfile = insertResult?.data || null;
    return lastProfile;
  } catch (error) {
    console.warn('Perfil secundário indisponível; seguindo com a sessão autenticada:', error);
    return lastProfile;
  }
}

export async function getAccessStatus() {
  try {
    const result = await withTimeout(
      supabase.rpc('fsfit_sincronizar_meu_acesso'),
      3500,
      'Verificação de acesso'
    );
    if (result?.error) throw result.error;
    const access = result?.data || null;
    if (access) {
      try {
        sessionStorage.setItem(ACCESS_CACHE_KEY, JSON.stringify({ value: access, savedAt: Date.now() }));
      } catch {}
    }
    return access;
  } catch (error) {
    console.warn('Verificação de acesso demorou ou falhou; usando estado conhecido para não bloquear a interface:', error);

    try {
      const cached = JSON.parse(sessionStorage.getItem(ACCESS_CACHE_KEY) || 'null');
      if (cached?.value && Date.now() - Number(cached.savedAt || 0) < 6 * 60 * 60 * 1000) return cached.value;
    } catch {}

    if (lastProfile?.ativo === false) {
      return { tipo_acesso: 'inativo', acesso_premium: false, admin: false, fallback: true };
    }

    return { tipo_acesso: 'temporario', acesso_premium: true, admin: false, fallback: true };
  }
}

export async function requireSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    window.location.replace('index.html?login=1');
    return null;
  }

  await ensurePersonalProfile(session);
  const access = await getAccessStatus();
  if (access?.tipo_acesso === 'inativo' && !access?.admin) return null;
  if (!access?.acesso_premium && !FREE_ALLOWED_PAGES.has(currentPage())) {
    window.location.replace('painel.html?acesso=free');
    return null;
  }
  session.fsfitAccess = access;
  return session;
}

export async function setGreeting(session) {
  if (!session) return;

  const headerGreeting = document.querySelector('#user-greeting');
  const dashboardGreeting = document.querySelector('#dashboard-user-greeting');
  const fallbackName = session.user?.user_metadata?.full_name?.trim()
    || session.user?.user_metadata?.nome?.trim()
    || session.user?.email?.split('@')[0]
    || 'Personal';
  const fallbackText = `Olá, ${fallbackName}`;

  if (headerGreeting && !headerGreeting.textContent.trim()) headerGreeting.textContent = fallbackText;
  if (dashboardGreeting && !dashboardGreeting.textContent.trim()) {
    dashboardGreeting.textContent = fallbackText;
    dashboardGreeting.classList.remove('hidden');
  }

  loadLegacyLayout()
    .then(legacyLayout => legacyLayout.setGreeting(session))
    .then(() => {
      const resolvedText = document.querySelector('#user-greeting')?.textContent?.trim();
      const dashboard = document.querySelector('#dashboard-user-greeting');
      if (resolvedText && dashboard) {
        dashboard.textContent = resolvedText;
        dashboard.classList.remove('hidden');
      }
    })
    .catch(error => {
      console.warn('Não foi possível concluir o carregamento secundário do cabeçalho:', error);
    });
}

export function showMessage(element, text, type = 'success') {
  if (!element || !text) return;

  const previousTimer = messageTimers.get(element);
  if (previousTimer) clearTimeout(previousTimer);

  const isError = type === 'error';
  element.textContent = text;
  element.className = `message show ${type}`;
  element.setAttribute('role', isError ? 'alert' : 'status');
  element.setAttribute('aria-live', isError ? 'assertive' : 'polite');

  Object.assign(element.style, {
    position: 'fixed',
    top: 'calc(92px + env(safe-area-inset-top, 0px))',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    zIndex: '10000',
    width: 'min(520px, calc(100vw - 32px))',
    maxWidth: 'calc(100vw - 32px)',
    margin: '0',
    padding: '14px 18px',
    borderRadius: '14px',
    transform: 'translate(-50%, 0)',
    boxShadow: '0 18px 50px rgba(0, 0, 0, .45)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    cursor: 'pointer',
    opacity: '1',
    transition: 'opacity .22s ease, transform .22s ease',
    background: isError ? 'rgba(68, 30, 34, .96)' : 'rgba(24, 66, 35, .96)',
    border: isError ? '1px solid rgba(255, 90, 95, .62)' : '1px solid rgba(50, 215, 75, .58)',
    color: isError ? '#ffd1d3' : '#d7ffdd'
  });

  const hide = () => {
    const activeTimer = messageTimers.get(element);
    if (activeTimer) clearTimeout(activeTimer);
    messageTimers.delete(element);
    element.style.opacity = '0';
    element.style.transform = 'translate(-50%, -10px)';
    setTimeout(() => {
      element.classList.remove('show');
      element.textContent = '';
    }, 230);
  };

  element.onclick = hide;
  const timer = setTimeout(hide, isError ? 6000 : 4000);
  messageTimers.set(element, timer);
}

function escapeHtml(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

function calculateAge(value) {
  if (!value) return null;
  const birth = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) years--;
  return years;
}

function calculateBmi(weight, heightCm) {
  const weightValue = Number(weight);
  const heightValue = Number(heightCm) / 100;
  if (!weightValue || !heightValue) return '—';
  return (weightValue / (heightValue * heightValue)).toFixed(1).replace('.', ',');
}

function bindFastRecordTabs() {
  document.querySelectorAll('[data-record-tab]').forEach(tab => {
    if (tab.dataset.fastRecordBound === '1') return;
    tab.dataset.fastRecordBound = '1';
    tab.addEventListener('click', () => {
      const name = tab.dataset.recordTab;
      document.querySelectorAll('[data-record-tab]').forEach(item => item.classList.toggle('active', item.dataset.recordTab === name));
      document.querySelectorAll('[data-record-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.recordPanel === name));
      try { history.replaceState(null, '', `#${name}`); } catch {}
    });
  });
}

async function bootstrapStudentRecordCritical() {
  if (!window.location.pathname.endsWith('/ficha-aluno.html') && !window.location.pathname.endsWith('ficha-aluno.html')) return;

  bindFastRecordTabs();
  const alunoId = new URLSearchParams(window.location.search).get('id');
  if (!alunoId) return;

  try {
    const authResult = await withTimeout(supabase.auth.getSession(), 2500, 'Sessão');
    const session = authResult?.data?.session;
    if (!session?.user?.id) return;

    const studentResult = await withTimeout(
      supabase
        .from('alunos')
        .select('id,nome,telefone,sexo,data_nascimento,altura_cm,peso_inicial_kg,percentual_gordura_inicial,objetivo,restricoes,observacoes,status')
        .eq('id', alunoId)
        .eq('personal_id', session.user.id)
        .single(),
      4000,
      'Ficha do aluno'
    );

    if (studentResult?.error || !studentResult?.data) throw studentResult?.error || new Error('Aluno não encontrado.');
    const student = studentResult.data;
    const age = calculateAge(student.data_nascimento);

    const name = document.querySelector('#student-name');
    const summary = document.querySelector('#student-summary');
    const status = document.querySelector('#student-status');
    const profile = document.querySelector('#profile-data');
    if (name) name.textContent = student.nome || 'Aluno';
    if (summary) summary.textContent = age != null ? `${age} anos` : 'Cadastro individual';
    if (status) status.textContent = String(student.status || 'ativo').toUpperCase();
    if (document.querySelector('#student-height')) document.querySelector('#student-height').textContent = student.altura_cm ? `${student.altura_cm} cm` : '—';
    if (profile) {
      profile.innerHTML = `
        <p><strong>WhatsApp:</strong> ${escapeHtml(student.telefone || 'Não informado')}</p>
        <p><strong>Nascimento:</strong> ${formatDate(student.data_nascimento)}${age != null ? ` (${age} anos)` : ''}</p>
        <p><strong>Objetivo:</strong> ${escapeHtml(student.objetivo || 'Não informado')}</p>
        <p><strong>Restrições:</strong> ${escapeHtml(student.restricoes || 'Nenhuma informada')}</p>
        <p><strong>Observações:</strong> ${escapeHtml(student.observacoes || 'Nenhuma')}</p>`;
    }

    const links = {
      '#edit-registration': `alunos.html?editar=${student.id}`,
      '#workout-editor-link': `treino-aluno.html?id=${student.id}`,
      '#diet-editor-link': `dieta-aluno.html?id=${student.id}`,
      '#reminders-link': `lembretes-aluno.html?id=${student.id}`,
      '#student-preview-link': `visualizar-aluno.html?id=${student.id}`
    };
    Object.entries(links).forEach(([selector, href]) => {
      const element = document.querySelector(selector);
      if (element) element.href = href;
    });

    Promise.all([
      supabase.from('historico_peso').select('id,peso_kg,data_registro,observacoes').eq('aluno_id', alunoId).eq('personal_id', session.user.id).order('data_registro', { ascending: false }),
      supabase.from('avaliacoes').select('percentual_gordura,data_avaliacao').eq('aluno_id', alunoId).eq('personal_id', session.user.id).order('data_avaliacao', { ascending: false }).limit(1)
    ]).then(([weightsResult, assessmentsResult]) => {
      if (weightsResult.error || assessmentsResult.error) return;
      const weights = weightsResult.data || [];
      const assessments = assessmentsResult.data || [];
      const latestWeight = weights[0]?.peso_kg ?? student.peso_inicial_kg;
      const latestFat = assessments[0]?.percentual_gordura ?? student.percentual_gordura_inicial;
      const weightEl = document.querySelector('#current-weight');
      const weightDate = document.querySelector('#weight-date');
      const fatEl = document.querySelector('#current-fat');
      const bmiEl = document.querySelector('#student-bmi');
      if (weightEl) weightEl.textContent = latestWeight ? `${latestWeight} kg` : '—';
      if (weightDate) weightDate.textContent = weights[0]?.data_registro ? formatDate(weights[0].data_registro) : 'Peso do cadastro';
      if (fatEl) fatEl.textContent = latestFat ? `${latestFat}%` : '—';
      if (bmiEl) bmiEl.textContent = calculateBmi(latestWeight, student.altura_cm);
    }).catch(error => console.warn('Evolução rápida da ficha indisponível:', error));
  } catch (error) {
    console.warn('Bootstrap rápido da ficha não concluiu:', error);
    const summary = document.querySelector('#student-summary');
    if (summary?.textContent?.includes('Carregando')) summary.textContent = 'Não foi possível carregar agora. Toque em voltar e abra novamente.';
  }
}

void bootstrapStudentRecordCritical();