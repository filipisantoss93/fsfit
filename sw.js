const CACHE_NAME = 'fsfit-shell-v10';
const APP_SHELL = [
  '/',
  '/acesso-aluno.html',
  '/selecionar-personal.html',
  '/aluno.html',
  '/css/style.css',
  '/css/aluno-midias.css',
  '/css/aluno-notificacoes.css',
  '/css/aluno-financeiro.css',
  '/css/aluno-perfil.css',
  '/js/supabase.js',
  '/js/acesso-aluno.js',
  '/js/selecionar-personal.js',
  '/js/aluno.js',
  '/js/aluno-perfil.js',
  '/js/aluno-notificacoes.js',
  '/js/aluno-financeiro.js',
  '/manifest.webmanifest',
  '/assets/icons/02-pwa/icon-192x192.png',
  '/assets/icons/02-pwa/icon-512x512.png',
  '/assets/icons/02-pwa/icon-maskable-512x512.png'
];
const APP_SHELL_PATHS = new Set(APP_SHELL.map(path => new URL(path, self.location.origin).pathname));

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
  if (url.origin !== self.location.origin) return;

  // O service worker pertence ao portal/PWA do aluno. Não armazenar páginas e scripts
  // administrativos do personal, evitando servir versões antigas da biblioteca e painel.
  if (!APP_SHELL_PATHS.has(url.pathname)) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => undefined);
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('/acesso-aluno.html')))
  );
});

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
