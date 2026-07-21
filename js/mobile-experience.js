import { supabase } from './supabase.js';

const MOBILE_MEDIA = '(max-width: 860px)';
const MAIN_ROUTES = ['painel.html', 'alunos.html', 'agenda.html', 'financeiro.html', 'perfil.html', 'biblioteca-exercicios.html'];
let installPrompt = null;
let badgeChannel = null;
let refreshBadgesTimer = null;

function currentPage() {
  return window.location.pathname.split('/').pop() || 'index.html';
}

function ensureStyles() {
  if (document.querySelector('link[data-fsfit-mobile-experience]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/mobile-experience.css?v=20260721-mobile-polish1';
  link.dataset.fsfitMobileExperience = 'true';
  document.head.appendChild(link);
}

function compactCount(value) {
  const count = Number(value || 0);
  return count > 99 ? '99+' : String(count);
}

function setBottomBadge(page, count, { dot = false, warning = false } = {}) {
  const target = document.querySelector(`.fsfit-bottom-nav [data-bottom-page="${page}"]`);
  if (!target) return false;

  let badge = target.querySelector('.fsfit-nav-badge');
  const numericCount = Number(count || 0);
  if (numericCount <= 0) {
    badge?.remove();
    return true;
  }

  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'fsfit-nav-badge';
    badge.setAttribute('aria-hidden', 'true');
    target.appendChild(badge);
  }

  badge.classList.toggle('is-dot', dot);
  badge.classList.toggle('is-warning', warning);
  badge.textContent = dot ? '' : compactCount(numericCount);
  return true;
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function refreshBottomBadges() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) return;

  try {
    const [overdueResult, supportResult] = await Promise.all([
      supabase
        .from('mensalidades_alunos')
        .select('id', { count: 'exact', head: true })
        .eq('personal_id', session.user.id)
        .eq('status', 'pendente')
        .lt('vencimento', todayIso()),
      supabase
        .from('notificacoes')
        .select('id', { count: 'exact', head: true })
        .eq('destinatario_id', session.user.id)
        .eq('lida', false)
        .in('tipo', ['suporte_resposta', 'suporte_novo'])
    ]);

    if (!overdueResult.error) setBottomBadge('financeiro', overdueResult.count || 0, { warning: true });
    if (!supportResult.error) setBottomBadge('mais', supportResult.count || 0, { dot: true });
  } catch (error) {
    console.info('Badges rápidos indisponíveis:', error?.message || error);
  }
}

function scheduleBadgeRefresh() {
  window.clearTimeout(refreshBadgesTimer);
  refreshBadgesTimer = window.setTimeout(() => refreshBottomBadges(), 140);
}

async function setupBadgeRealtime() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id || badgeChannel) return;

  badgeChannel = supabase
    .channel(`fsfit-mobile-badges-${session.user.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notificacoes', filter: `destinatario_id=eq.${session.user.id}` }, scheduleBadgeRefresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mensalidades_alunos', filter: `personal_id=eq.${session.user.id}` }, scheduleBadgeRefresh)
    .subscribe();

  window.addEventListener('beforeunload', () => {
    if (badgeChannel) supabase.removeChannel(badgeChannel);
  }, { once: true });
}

function syncLoadingPlaceholders(root = document) {
  const candidates = root.querySelectorAll?.('p, td, .empty, .dashboard-empty, [data-loading]') || [];
  candidates.forEach(element => {
    const text = element.textContent?.trim() || '';
    const loading = /^(carregando|aguarde)(\.{0,3}|\s.+)?$/i.test(text) && text.length < 80;
    element.classList.toggle('fsfit-loading-placeholder', loading);
  });
}

function setupSkeletons() {
  syncLoadingPlaceholders();
  const observer = new MutationObserver(records => {
    records.forEach(record => {
      if (record.target instanceof Element) syncLoadingPlaceholders(record.target.closest('body') ? record.target : document);
      record.addedNodes.forEach(node => {
        if (node instanceof Element) syncLoadingPlaceholders(node);
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

function syncBusyButton(button) {
  if (!(button instanceof HTMLButtonElement)) return;
  const busy = button.disabled && !button.matches('.fsfit-more-close,.student-edit-close,.admin-ticket-modal-close');
  button.classList.toggle('fsfit-button-busy', busy);
  if (busy) button.setAttribute('aria-busy', 'true');
  else button.removeAttribute('aria-busy');
}

function setupBusyButtons() {
  document.querySelectorAll('button').forEach(syncBusyButton);

  const observer = new MutationObserver(records => {
    records.forEach(record => syncBusyButton(record.target));
  });
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['disabled'] });

  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const button = form.querySelector('button[type="submit"],input[type="submit"]');
    if (!(button instanceof HTMLButtonElement)) return;
    button.classList.add('fsfit-button-busy');
    button.setAttribute('aria-busy', 'true');
    window.setTimeout(() => {
      if (!button.disabled) {
        button.classList.remove('fsfit-button-busy');
        button.removeAttribute('aria-busy');
      }
    }, 9000);
  }, true);
}

function prefetchRoute(href) {
  if (!href || document.querySelector(`link[data-fsfit-prefetch="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = href;
  link.as = 'document';
  link.dataset.fsfitPrefetch = href;
  document.head.appendChild(link);
}

function setupPrefetch() {
  const run = () => MAIN_ROUTES.filter(route => route !== currentPage()).forEach(prefetchRoute);
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1800 });
  else window.setTimeout(run, 700);

  document.addEventListener('pointerdown', event => {
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    try {
      const url = new URL(link.href, location.href);
      if (url.origin === location.origin && /\.html(?:$|\?)/.test(`${url.pathname}${url.search}`)) {
        prefetchRoute(`${url.pathname}${url.search}`);
      }
    } catch {
      // Link inválido não deve afetar a navegação.
    }
  }, { passive: true });
}

function setupPullToRefresh() {
  if (!window.matchMedia(MOBILE_MEDIA).matches || document.querySelector('.fsfit-pull-refresh')) return;

  const indicator = document.createElement('div');
  indicator.className = 'fsfit-pull-refresh';
  indicator.textContent = 'Puxe para atualizar';
  document.body.appendChild(indicator);

  let startY = 0;
  let distance = 0;
  let tracking = false;

  const blockedTarget = target => target?.closest?.('input,textarea,select,[contenteditable="true"],.fsfit-more-panel,.student-edit-dialog,.admin-ticket-modal-panel,[role="dialog"]');

  document.addEventListener('touchstart', event => {
    if (window.scrollY > 0 || blockedTarget(event.target) || document.documentElement.classList.contains('fsfit-sheet-open')) return;
    startY = event.touches[0]?.clientY || 0;
    distance = 0;
    tracking = true;
  }, { passive: true });

  document.addEventListener('touchmove', event => {
    if (!tracking) return;
    const y = event.touches[0]?.clientY || startY;
    distance = Math.max(0, Math.min(130, y - startY));
    if (distance < 12) return;
    const visual = Math.min(52, distance * .42);
    indicator.classList.add('is-visible');
    indicator.classList.toggle('is-ready', distance >= 82);
    indicator.textContent = distance >= 82 ? 'Solte para atualizar' : 'Puxe para atualizar';
    indicator.style.transform = `translate(-50%, ${visual - 48}px)`;
  }, { passive: true });

  document.addEventListener('touchend', () => {
    if (!tracking) return;
    tracking = false;
    if (distance >= 82) {
      indicator.classList.add('is-visible', 'is-refreshing');
      indicator.classList.remove('is-ready');
      indicator.textContent = 'Atualizando…';
      indicator.style.transform = 'translate(-50%, 0)';
      window.setTimeout(() => window.location.reload(), 120);
      return;
    }
    indicator.classList.remove('is-visible', 'is-ready');
    indicator.style.transform = 'translate(-50%, -58px)';
  }, { passive: true });
}

function normalizeWhatsapp(phone = '') {
  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) digits = `55${digits}`;
  return digits.length >= 12 ? digits : '';
}

function ensureStudentQuickActions() {
  if (currentPage() !== 'ficha-aluno.html' || document.querySelector('.fsfit-student-quick-actions')) return;
  const header = document.querySelector('.student-record-header');
  if (!header) return;

  const studentId = new URLSearchParams(location.search).get('id');
  if (!studentId) return;

  const actions = document.createElement('nav');
  actions.className = 'fsfit-student-quick-actions';
  actions.setAttribute('aria-label', 'Ações rápidas do aluno');
  actions.innerHTML = `
    <button class="fsfit-student-quick-action is-primary" type="button" data-student-quick="workout"><strong>▶</strong><span>Treino</span></button>
    <a class="fsfit-student-quick-action" href="financeiro.html?aluno=${encodeURIComponent(studentId)}"><strong>$</strong><span>Pagamento</span></a>
    <a class="fsfit-student-quick-action" href="agenda.html?aluno=${encodeURIComponent(studentId)}"><strong>▦</strong><span>Agendar</span></a>
    <a class="fsfit-student-quick-action" data-student-quick="whatsapp" href="#" target="_blank" rel="noopener" hidden><strong>WA</strong><span>WhatsApp</span></a>`;

  header.insertAdjacentElement('afterend', actions);

  const workoutProxy = actions.querySelector('[data-student-quick="workout"]');
  const whatsapp = actions.querySelector('[data-student-quick="whatsapp"]');

  const bindWorkout = () => {
    const original = document.querySelector('#start-workout-personal');
    if (!original) return false;
    original.classList.add('fsfit-original-workout-action');
    workoutProxy.disabled = original.disabled;
    workoutProxy.title = original.title || '';
    const text = original.textContent?.toLowerCase() || '';
    workoutProxy.querySelector('span').textContent = text.includes('andamento') ? 'Em aula' : 'Treino';
    workoutProxy.onclick = () => original.click();

    const observer = new MutationObserver(bindWorkout);
    observer.observe(original, { attributes: true, childList: true, subtree: true, characterData: true });
    return true;
  };

  if (!bindWorkout()) {
    const observer = new MutationObserver(() => {
      if (bindWorkout()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (!session?.user?.id) return;
    const { data } = await supabase
      .from('alunos')
      .select('telefone')
      .eq('id', studentId)
      .eq('personal_id', session.user.id)
      .maybeSingle();
    const phone = normalizeWhatsapp(data?.telefone);
    if (!phone || !whatsapp) return;
    whatsapp.href = `https://wa.me/${phone}`;
    whatsapp.hidden = false;
  }).catch(() => undefined);
}

function autoOpenFinanceStudent() {
  if (currentPage() !== 'financeiro.html') return;
  const studentId = new URLSearchParams(location.search).get('aluno');
  if (!studentId) return;

  const tryOpen = () => {
    const row = document.querySelector(`[data-student-row="${CSS.escape(studentId)}"]`);
    if (!row) return false;
    window.setTimeout(() => row.click(), 80);
    return true;
  };

  if (tryOpen()) return;
  const observer = new MutationObserver(() => {
    if (tryOpen()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 12000);
}

function toast(text) {
  const node = document.createElement('div');
  node.className = 'message show success';
  node.setAttribute('role', 'status');
  node.textContent = text;
  Object.assign(node.style, {
    position: 'fixed',
    zIndex: '10001',
    top: 'calc(88px + env(safe-area-inset-top,0px))',
    left: '50%',
    width: 'min(460px,calc(100vw - 28px))',
    margin: '0',
    transform: 'translateX(-50%)',
    background: 'rgba(24,66,35,.97)',
    border: '1px solid rgba(50,215,75,.5)',
    color: '#d7ffdd',
    boxShadow: '0 18px 50px rgba(0,0,0,.42)'
  });
  document.body.appendChild(node);
  window.setTimeout(() => node.remove(), 3200);
}

function injectInstallAction() {
  if (!installPrompt || document.querySelector('[data-fsfit-install-app]')) return;
  const list = document.querySelector('.fsfit-more-list');
  if (!list) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fsfit-more-item fsfit-install-item';
  button.dataset.fsfitInstallApp = 'true';
  button.innerHTML = `
    <span class="fsfit-more-item-icon" aria-hidden="true">↓</span>
    <span class="fsfit-more-item-copy"><strong>Instalar FS Fit</strong><small>Abra mais rápido pela tela inicial</small></span>
    <span class="fsfit-more-item-chevron" aria-hidden="true">›</span>`;
  list.insertBefore(button, list.lastElementChild);

  button.addEventListener('click', async () => {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    await prompt.prompt();
    await prompt.userChoice.catch(() => undefined);
    button.remove();
  });
}

function setupInstallPrompt() {
  if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
    document.documentElement.classList.add('fsfit-standalone');
    return;
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    injectInstallAction();
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    document.querySelector('[data-fsfit-install-app]')?.remove();
    toast('FS Fit instalado com sucesso.');
  });
}

function setupDomWatcher() {
  const observer = new MutationObserver(() => {
    if (document.querySelector('.fsfit-bottom-nav')) scheduleBadgeRefresh();
    if (installPrompt) injectInstallAction();
    if (currentPage() === 'ficha-aluno.html') ensureStudentQuickActions();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

async function init() {
  ensureStyles();
  setupSkeletons();
  setupBusyButtons();
  setupPrefetch();
  setupPullToRefresh();
  setupInstallPrompt();
  setupDomWatcher();
  ensureStudentQuickActions();
  autoOpenFinanceStudent();
  await refreshBottomBadges();
  await setupBadgeRealtime();

  window.addEventListener('focus', scheduleBadgeRefresh);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleBadgeRefresh();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
else init();
