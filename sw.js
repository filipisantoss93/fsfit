const CACHE_NAME = 'fsfit-shell-v14';
const APP_SHELL = [
  '/',
  '/painel.html',
  '/alunos.html',
  '/agenda.html',
  '/financeiro.html',
  '/perfil.html',
  '/biblioteca-exercicios.html',
  '/biblioteca-alimentar.html',
  '/acesso-aluno.html',
  '/selecionar-personal.html',
  '/aluno.html',
  '/css/style.css',
  '/css/header-menu.css',
  '/css/mobile-navigation.css',
  '/css/financeiro.css',
  '/css/aluno-midias.css',
  '/css/aluno-notificacoes.css',
  '/css/aluno-financeiro.css',
  '/css/aluno-perfil.css',
  '/js/supabase.js',
  '/js/layout-core.js',
  '/js/layout.js',
  '/js/ui-cache.js',
  '/js/page-data-cache.js',
  '/js/painel-ui-cache.js',
  '/js/painel-dashboard.js',
  '/js/painel-visao-geral.js',
  '/js/pwa-install.js',
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
  '/js/aluno-financeiro.js',
  '/manifest.webmanifest',
  '/manifest-personal.webmanifest',
  '/assets/icons/02-pwa/icon-192x192.png',
  '/assets/icons/02-pwa/icon-512x512.png',
  '/assets/icons/02-pwa/icon-maskable-512x512.png'
];
const APP_SHELL_PATHS = new Set(APP_SHELL.map(path => new URL(path, self.location.origin).pathname));
const SWR_DESTINATIONS = new Set(['style', 'image', 'font', 'manifest']);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname === '/sw.js') return;

  // HTML: prioriza a rede para nunca prender o usuário em uma versão antiga,
  // mantendo a última cópia apenas como fallback de navegação/offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event.request, url.pathname));
    return;
  }

  // JavaScript da aplicação também precisa priorizar a rede. Servir módulos antigos
  // junto de HTML/DOM novos pode causar estados incompatíveis, como modal invisível
  // com o scroll bloqueado. O cache continua sendo usado como fallback offline.
  if (event.request.destination === 'script') {
    event.respondWith(networkFirstAsset(event.request, url.pathname));
    return;
  }

  // CSS, imagens, fontes e manifests podem abrir do cache e revalidar em background.
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
    const response = await fetch(request);
    if (response?.ok) cache.put(request, response.clone()).catch(() => undefined);
    return response;
  } catch {
    return (await cache.match(request))
      || (await cache.match(pathname))
      || Response.error();
  }
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
