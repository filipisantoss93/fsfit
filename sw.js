const CACHE_PREFIX = 'fsfit-shell-';
const CACHE_NAME = `${CACHE_PREFIX}v17`;

const CORE_SHELL = [
  '/',
  '/css/landing-ads.css?v=20260808-css-guard1',
  '/css/landing-home.css?v=20260808-css-guard1',
  '/css/inline-cleanup.css?v=20260808-css-guard1',
  '/css/fsfit-design-system.css?v=20260728-tokens2',
  '/css/style-base.css?v=20260728-tokens2',
  '/css/style-dashboard.css?v=20260728-tokens2',
  '/css/style-brand.css?v=20260728-components1',
  '/css/app-shell.css?v=20260728-notifications1',
  '/css/image-cropper.css?v=20260728-static1',
  '/css/pwa-install.css?v=20260728-static1',
  '/css/painel-day-summary.css?v=20260728-static1',
  '/css/painel-home-avatar.css?v=20260728-static1',
  '/css/painel-home-desktop-carousel.css?v=20260728-static1',
  '/css/biblioteca-treinos.css?v=20260728-static1',
  '/css/assinatura-gerenciamento.css?v=20260728-static1',
  '/css/portal-aluno-tabs.css?v=20260728-static1',
  '/css/treino-exercise-picker-sheet.css?v=20260728-static1',
  '/css/biblioteca-treinos-multiselect.css?v=20260728-static1',
  '/css/biblioteca-treinos-layout.css?v=20260728-static1',
  '/css/mobile-more-swipe.css?v=20260728-static1',
  '/css/treino-aluno-retorno.css?v=20260728-static1',
  '/css/painel-plano-free-ui.css?v=20260728-static1',
  '/css/aulas-painel-quick-actions.css?v=20260728-static1',
  '/css/aulas-painel-delete-controls.css?v=20260728-static1',
  '/css/aulas-painel-exercise-controls.css?v=20260728-static1',
  '/css/treino-multidias-compact-config.css?v=20260728-static1',
  '/css/renovacao-plano.css?v=20260728-static1',
  '/css/biblioteca-refeicoes-enhancements.css?v=20260728-static1',
  '/css/treino-dia-personalizacao.css?v=20260728-static1',
  '/css/treino-plan-day-tabs.css?v=20260729-static1',
  '/css/ficha-treinos-salvos.css?v=20260729-static1',
  '/css/aulas-painel-exercise-categories.css?v=20260729-static1',
  '/css/aulas-painel-editor.css?v=20260729-static1',
  '/css/aulas-painel-delete-layout-fix.css?v=20260729-static1',
  '/css/exercicio-drag-order.css?v=20260729-static1',
  '/css/treino-busca-exercicios.css?v=20260729-static1',
  '/css/treino-modelo-livre.css?v=20260729-static1',
  '/css/treino-sticky-exercise-save.css?v=20260729-static1',
  '/css/financeiro-avatar-fix.css?v=20260729-avatar1',
  '/css/painel.css?v=20260730-painel-bundle1',
  '/css/agenda-bundle.css?v=20260730-bundle1',
  '/css/dashboard-desktop.css?v=20260727-dashboard1',
  '/css/alunos.css?v=20260727-dashboard1',
  '/css/alunos-lista-compacta.css?v=20260726-ux1',
  '/css/financeiro.css?v=20260730-consolidado1',
  '/css/acesso-aluno.css?v=20260730-runtime1',
  '/css/aluno.css?v=20260730-bundle1',
  '/css/perfil-padronizacao.css?v=20260727-desktop-unified1',
  '/css/biblioteca-exercicios.css?v=20260730-consolidated1',
  '/css/biblioteca-alimentar.css?v=20260730-consolidated1',
  '/acesso-aluno.html',
  '/aluno.html',
  '/css/style.css',
  '/css/header-menu.css',
  '/css/mobile-navigation.css',
  '/js/supabase.js',
  '/js/layout-core.js',
  '/js/layout.js',
  '/js/pwa-install.js',
  '/manifest.webmanifest',
  '/manifest-personal.webmanifest',
  '/assets/icons/02-pwa/icon-192x192.png',
  '/assets/icons/02-pwa/icon-512x512.png',
  '/assets/icons/02-pwa/icon-maskable-512x512.png'
];

const OPTIONAL_SHELL = [
  '/painel.html',
  '/alunos.html',
  '/agenda.html',
  '/financeiro.html',
  '/perfil.html',
  '/biblioteca-exercicios.html',
  '/biblioteca-alimentar.html',
  '/selecionar-personal.html',
  '/css/financeiro.css',
  '/css/aluno-midias.css',
  '/css/aluno-notificacoes.css',
  '/css/aluno-financeiro.css',
  '/css/aluno-perfil.css',
  '/js/ui-cache.js',
  '/js/page-data-cache.js',
  '/js/painel-ui-cache.js',
  '/js/painel-dashboard.js',
  '/js/painel-visao-geral.js',
  '/js/painel-agenda-modal.js',
  '/js/painel-agenda-modal-hotfix.js',
  '/js/painel-agenda-modal-avatar.js',
  '/js/alunos.js',
  '/js/agenda.js',
  '/js/financeiro.js',
  '/js/biblioteca-exercicios.js',
  '/js/biblioteca-alimentar.js',
  '/js/acesso-aluno.js',
  '/js/selecionar-personal.js',
  '/js/aluno.js',
  '/js/aluno-perfil.js',
  '/js/aluno-notificacoes.js',
  '/js/aluno-financeiro.js'
];

const APP_SHELL = [...new Set([...CORE_SHELL, ...OPTIONAL_SHELL])];
const APP_SHELL_PATHS = new Set(APP_SHELL.map(path => new URL(path, self.location.origin).pathname));
const SWR_DESTINATIONS = new Set(['style', 'image', 'font', 'manifest']);

self.addEventListener('install', event => {
  event.waitUntil(installShell());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(cleanupOldShellCaches());
  self.clients.claim();
});

async function installShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(CORE_SHELL);

  const results = await Promise.allSettled(
    OPTIONAL_SHELL.map(path => cache.add(path))
  );

  const failed = results.reduce((total, result) => total + (result.status === 'rejected' ? 1 : 0), 0);
  if (failed > 0) console.info(`FS Fit PWA: ${failed} recurso(s) opcional(is) não foram pré-armazenados.`);
}

async function cleanupOldShellCaches() {
  const keys = await caches.keys();
  const obsoleteKeys = keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME);
  await Promise.all(obsoleteKeys.map(key => caches.delete(key)));
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname === '/sw.js') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event.request, url.pathname));
    return;
  }

  if (event.request.destination === 'script' || event.request.destination === 'style') {
    event.respondWith(networkFirstAsset(event.request, url.pathname));
    return;
  }

  if (SWR_DESTINATIONS.has(event.request.destination) || APP_SHELL_PATHS.has(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event.request, url.pathname));
  }
});

async function networkFirstNavigation(request, pathname) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response?.ok) cache.put(request, response.clone()).catch(() => undefined);
    return response;
  } catch {
    return (await cache.match(request))
      || (await cache.match(pathname))
      || (await cache.match('/'));
  }
}

async function networkFirstAsset(request, pathname) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (!(await isValidAssetResponse(request, response))) throw new Error('invalid-asset-response');
    cache.put(request, response.clone()).catch(() => undefined);
    return response;
  } catch {
    return (await cache.match(request))
      || (await cache.match(pathname))
      || Response.error();
  }
}

async function isValidAssetResponse(request, response) {
  if (!response?.ok) return false;
  if (request.destination !== 'style') return true;

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('text/css')) return false;

  const body = await response.clone().text();
  return body.trim().length > 0;
}

async function staleWhileRevalidate(request, pathname) {
  const cache = await caches.open(CACHE_NAME);
  const cached = (await cache.match(request)) || (await cache.match(pathname));
  const networkPromise = fetch(request)
    .then(response => {
      if (response?.ok) cache.put(request, response.clone()).catch(() => undefined);
      return response;
    })
    .catch(() => null);

  if (cached) {
    networkPromise.catch(() => undefined);
    return cached;
  }

  return (await networkPromise) || Response.error();
}

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() || 'Você recebeu um novo lembrete do seu personal.' };
  }

  const title = payload.title || 'FS Fit';
  const options = {
    body: payload.body || payload.message || 'Você recebeu um novo lembrete do seu personal.',
    icon: '/assets/icons/02-pwa/icon-192x192.png',
    badge: '/assets/icons/02-pwa/icon-192x192.png',
    data: { url: payload.url || '/aluno.html' },
    tag: payload.tag || 'fsfit-lembrete',
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/aluno.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      const existing = windowClients.find(client => new URL(client.url).pathname === new URL(targetUrl, self.location.origin).pathname);
      if (existing) {
        existing.focus();
        existing.navigate(targetUrl);
        return;
      }
      return clients.openWindow(targetUrl);
    })
  );
});