const CACHE_PREFIX = 'fsfit-shell-';
const CACHE_VERSION = 21;
const CACHE_NAME = `${CACHE_PREFIX}v${CACHE_VERSION}`;
const BUNDLE_MANIFEST_URL = '/css/bundles/manifest.json';

const CORE_SHELL = [
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

const APP_SHELL = [...new Set([...CORE_SHELL, ...OPTIONAL_SHELL, BUNDLE_MANIFEST_URL])];
const APP_SHELL_PATHS = new Set(APP_SHELL.map(path => new URL(path, self.location.origin).pathname));
const SWR_DESTINATIONS = new Set(['style', 'image', 'font', 'manifest']);

self.addEventListener('install', event => {
  event.waitUntil(installShell());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([cleanupOldShellCaches(), self.clients.claim()]));
});

async function openShellCache() {
  try {
    return await caches.open(CACHE_NAME);
  } catch (error) {
    console.warn('FS Fit PWA: Cache Storage indisponível; seguindo pela rede.', error);
    return null;
  }
}

async function putInCache(cache, request, response) {
  if (!cache || !response) return false;
  try {
    await cache.put(request, response);
    return true;
  } catch (error) {
    console.warn('FS Fit PWA: falha ao gravar cache; recurso continuará disponível pela rede.', error);
    return false;
  }
}

async function matchCache(cache, request) {
  if (!cache) return null;
  try {
    return await cache.match(request);
  } catch {
    return null;
  }
}

async function installShell() {
  const { manifest, response: manifestResponse } = await fetchBundleManifest();
  const coreResources = [...new Set([
    ...CORE_SHELL,
    ...manifest.criticalPages,
    ...manifest.criticalBundles
  ])];
  const prepared = await Promise.all(coreResources.map(fetchValidatedResource));

  for (const page of manifest.criticalPages) {
    const resource = prepared.find(item => item.pathname === page);
    if (!resource) throw new Error(`critical-page-missing:${page}`);
    const bundle = extractBundleHref(await resource.response.clone().text());
    if (!bundle || new URL(bundle, self.location.origin).pathname !== manifest.pages[page]) {
      throw new Error(`critical-page-bundle-mismatch:${page}`);
    }
  }

  const cache = await openShellCache();
  if (!cache) return;

  await putInCache(
    cache,
    new Request(new URL(BUNDLE_MANIFEST_URL, self.location.origin)),
    manifestResponse.clone()
  );
  await Promise.allSettled(
    prepared.map(item => putInCache(cache, item.request, item.response.clone()))
  );

  const results = await Promise.allSettled(
    OPTIONAL_SHELL.map(async resource => {
      const preparedResource = await fetchValidatedResource(resource);
      await putInCache(cache, preparedResource.request, preparedResource.response);
    })
  );

  const failed = results.reduce((total, result) => total + (result.status === 'rejected' ? 1 : 0), 0);
  if (failed > 0) console.info(`FS Fit PWA: ${failed} recurso(s) opcional(is) não foram pré-armazenados.`);
}

async function cleanupOldShellCaches() {
  try {
    const keys = await caches.keys();
    const minimumVersion = Math.max(18, CACHE_VERSION - 1);
    const obsoleteKeys = keys.filter(key => {
      if (!key.startsWith(CACHE_PREFIX) || key === CACHE_NAME) return false;
      const version = Number(key.slice(CACHE_PREFIX.length).replace(/^v/, ''));
      return !Number.isFinite(version) || version < minimumVersion;
    });
    await Promise.allSettled(obsoleteKeys.map(key => caches.delete(key)));
  } catch (error) {
    console.warn('FS Fit PWA: não foi possível limpar caches antigos.', error);
  }
}

async function fetchBundleManifest() {
  const request = new Request(new URL(BUNDLE_MANIFEST_URL, self.location.origin), { cache: 'no-store' });
  const response = await fetch(request);
  if (!response?.ok) throw new Error('bundle-manifest-unavailable');
  const manifest = await response.clone().json();
  const valid = manifest?.version === 1
    && manifest.pages && typeof manifest.pages === 'object'
    && Array.isArray(manifest.criticalPages)
    && Array.isArray(manifest.criticalBundles)
    && manifest.criticalPages.every(page => typeof manifest.pages[page] === 'string')
    && manifest.criticalBundles.every(isHashedBundlePath);
  if (!valid) throw new Error('bundle-manifest-invalid');
  return { manifest, response };
}

async function fetchValidatedResource(resource) {
  const request = new Request(new URL(resource, self.location.origin), { cache: 'no-store' });
  const response = await fetch(request);
  if (!response?.ok) throw new Error(`shell-resource-unavailable:${resource}`);
  if (request.url.endsWith('.css') && !(await isValidCssResponse(request.url, response))) {
    throw new Error(`shell-css-invalid:${resource}`);
  }
  return { request, response, pathname: new URL(request.url).pathname };
}

function isHashedBundlePath(value) {
  return /^\/css\/bundles\/fsfit\.[a-f0-9]{16}\.css$/.test(String(value || ''));
}

function extractBundleHref(html) {
  const tags = String(html || '').match(/<link\b[^>]*>/gi) || [];
  const bundle = tags.find(tag => /\bdata-fsfit-bundle\b/i.test(tag));
  return bundle?.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2] || '';
}

function hasStylesheet(html) {
  return (String(html || '').match(/<link\b[^>]*>/gi) || [])
    .some(tag => /\brel\s*=\s*(["'])[^"']*stylesheet[^"']*\1/i.test(tag));
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname === '/sw.js') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event.request, url.pathname));
    return;
  }

  if (event.request.destination === 'style' && isHashedBundlePath(url.pathname)) {
    event.respondWith(cacheFirstBundle(event.request));
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
  const cache = await openShellCache();
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (!response?.ok) throw new Error('navigation-response-invalid');
    await validateAndCacheNavigation(cache, request, pathname, response);
    return response;
  } catch {
    const cached = await getValidCachedNavigation(cache, request, pathname);
    return cached || recoveryResponse(pathname);
  }
}

async function validateAndCacheNavigation(cache, request, pathname, response) {
  const html = await response.clone().text();
  const bundleHref = extractBundleHref(html);
  if (hasStylesheet(html) && !bundleHref) throw new Error('navigation-without-bundle');

  if (bundleHref) {
    const bundleUrl = new URL(bundleHref, request.url);
    if (!isHashedBundlePath(bundleUrl.pathname)) throw new Error('navigation-bundle-not-versioned');
    await ensureBundleCached(cache, bundleUrl);
  }

  if (cache) {
    await Promise.allSettled([
      putInCache(cache, request, response.clone()),
      putInCache(cache, new Request(new URL(pathname, self.location.origin)), response.clone())
    ]);
  }
}

async function ensureBundleCached(cache, bundleUrl) {
  const request = new Request(bundleUrl, { cache: 'no-store' });
  try {
    const response = await fetch(request);
    if (!(await isValidCssResponse(request.url, response))) throw new Error('bundle-response-invalid');
    await putInCache(cache, request, response.clone());
    return response;
  } catch {
    const cached = await matchAnyShellCache(request);
    if (!(await isValidCssResponse(request.url, cached))) throw new Error('bundle-unavailable');
    await putInCache(cache, request, cached.clone());
    return cached;
  }
}

async function getValidCachedNavigation(cache, request, pathname) {
  if (!cache) return null;
  const candidates = [
    await matchCache(cache, request),
    await matchCache(cache, new Request(new URL(pathname, self.location.origin)))
  ].filter(Boolean);
  for (const response of candidates) {
    const html = await response.clone().text();
    const bundleHref = extractBundleHref(html);
    if (!hasStylesheet(html)) return response;
    if (!bundleHref) continue;
    const bundleUrl = new URL(bundleHref, request.url);
    if (!isHashedBundlePath(bundleUrl.pathname)) continue;
    const bundle = await matchAnyShellCache(new Request(bundleUrl));
    if (await isValidCssResponse(bundleUrl.href, bundle)) return response;
  }
  return null;
}

function recoveryResponse(pathname) {
  const safePath = String(pathname || '/').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  return new Response(`<!doctype html><html lang="pt-br"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atualizando o FS Fit</title><style>html{color-scheme:dark}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:#0f1115;color:#f4f7f9;font:16px/1.5 system-ui,sans-serif}.box{max-width:480px;padding:28px;border:1px solid #30363d;border-radius:18px;background:#171b21;text-align:center}.brand{color:#b8e51c;font-weight:900}a{display:inline-block;margin-top:16px;padding:12px 18px;border-radius:10px;background:#b8e51c;color:#10130d;font-weight:800;text-decoration:none}</style><body><main class="box"><p class="brand">FS FIT</p><h1>Atualização em andamento</h1><p>Os arquivos visuais ainda não chegaram completos. A versão anterior foi preservada e nenhuma tela incompleta será exibida.</p><a href="${safePath}">Tentar novamente</a><script>if('serviceWorker'in navigator){navigator.serviceWorker.getRegistration().then(function(r){if(r)return r.update()}).catch(function(){})}</script></main></body></html>`, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

async function cacheFirstBundle(request) {
  const cached = await matchAnyShellCache(request);
  if (await isValidCssResponse(request.url, cached)) return cached;
  const cache = await openShellCache();
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (!(await isValidCssResponse(request.url, response))) throw new Error('bundle-response-invalid');
    await putInCache(cache, request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

async function networkFirstAsset(request, pathname) {
  const cache = await openShellCache();
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (!(await isValidAssetResponse(request, response))) throw new Error('invalid-asset-response');
    putInCache(cache, request, response.clone()).catch(() => undefined);
    return response;
  } catch {
    return (await matchAnyShellCache(request))
      || (await matchAnyShellCache(pathname))
      || Response.error();
  }
}

async function isValidAssetResponse(request, response) {
  if (!response?.ok) return false;
  if (request.destination !== 'style') return true;
  return isValidCssResponse(request.url, response);
}

async function isValidCssResponse(url, response) {
  if (!response?.ok || !String(url || '').includes('.css')) return false;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.toLowerCase().startsWith('text/css')) return false;
  const body = await response.clone().text();
  const executableCss = body.replace(/\/\*[\s\S]*?\*\//g, '');
  return body.trim().length > 0 && !/^\s*@import\b/m.test(executableCss);
}

async function matchAnyShellCache(request) {
  try {
    const cacheKey = request instanceof Request
      ? request
      : new Request(new URL(request, self.location.origin));
    const keys = (await caches.keys())
      .filter(key => key.startsWith(CACHE_PREFIX))
      .sort((a, b) => (a === CACHE_NAME ? -1 : b === CACHE_NAME ? 1 : b.localeCompare(a)));
    for (const key of keys) {
      const cache = await caches.open(key);
      const match = await cache.match(cacheKey);
      if (match) return match;
    }
  } catch {
    return null;
  }
  return null;
}

async function staleWhileRevalidate(request, pathname) {
  const cache = await openShellCache();
  const cached = cache
    ? (await matchCache(cache, request)) || (await matchCache(cache, pathname))
    : null;
  const networkPromise = fetch(request)
    .then(response => {
      if (response?.ok) putInCache(cache, request, response.clone()).catch(() => undefined);
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
