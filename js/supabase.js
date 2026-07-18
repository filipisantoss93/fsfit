import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://jjpijncxlkwutbnkpsaw.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_eU3QNbS5L0EqnK8H39XUgw_B2efuOvo';

const DATA_CACHE_PREFIX = 'fsfit:data-cache:v1:';
const DATA_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DATA_CACHE_REFRESH_AFTER_MS = 8 * 1000;
const DATA_CACHE_MAX_ENTRIES = 120;
const DATA_CACHE_MAX_BYTES = 4_500_000;
const DATA_CACHE_MAX_ENTRY_BYTES = 750_000;
const AUTO_REFRESH_COOLDOWN_MS = 12 * 1000;
const nativeFetch = globalThis.fetch.bind(globalThis);
const refreshInFlight = new Map();
let autoRefreshTimer = null;
let coldLoadingTimer = null;
let coldNetworkRequests = 0;
let userInteracted = false;

const SAFE_RPC_PREFIXES = [
  'get_',
  'listar_',
  'contar_',
  'buscar_',
  'obter_',
  'consultar_',
  'fsfit_listar_',
  'fsfit_resolver_',
  'fsfit_admin_listar_',
  'fsfit_admin_resumo',
  'fsfit_admin_metricas_'
];

const SAFE_RPC_EXACT = new Set([
  'fsfit_sincronizar_meu_acesso',
  'get_aluno_portal',
  'get_aluno_portal_preview',
  'get_aluno_portal_token',
  'get_aluno_chat_sessao',
  'get_aluno_sessao_treino',
  'listar_sessoes_em_aula_personal',
  'contar_notificacoes_nao_lidas_aluno',
  'listar_notificacoes_aluno'
]);

function markUserInteraction() {
  userInteracted = true;
}

if (typeof window !== 'undefined') {
  ['pointerdown', 'keydown', 'input', 'change'].forEach(type => {
    window.addEventListener(type, markUserInteraction, { once: true, capture: true });
  });
}

function ensureColdLoadingIndicator() {
  if (typeof document === 'undefined') return null;
  let indicator = document.querySelector('#fsfit-data-loading');
  if (indicator) return indicator;

  if (!document.querySelector('style[data-fsfit-data-loading]')) {
    const style = document.createElement('style');
    style.dataset.fsfitDataLoading = 'true';
    style.textContent = `
      #fsfit-data-loading{position:fixed;top:10px;left:50%;z-index:12000;transform:translate(-50%,-12px);display:flex;align-items:center;gap:8px;padding:7px 11px;border:1px solid var(--border,rgba(255,255,255,.12));border-radius:999px;background:var(--surface,#171a20);color:var(--muted,#a6adbb);font:700 11px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:.02em;box-shadow:0 8px 28px rgba(0,0,0,.22);opacity:0;pointer-events:none;transition:opacity .18s ease,transform .18s ease}
      #fsfit-data-loading.show{opacity:.96;transform:translate(-50%,0)}
      #fsfit-data-loading span{width:7px;height:7px;border-radius:50%;background:var(--primary,#6f8cff);animation:fsfitDataPulse .9s ease-in-out infinite alternate}
      @keyframes fsfitDataPulse{from{opacity:.35;transform:scale(.8)}to{opacity:1;transform:scale(1.15)}}
    `;
    document.head.appendChild(style);
  }

  indicator = document.createElement('div');
  indicator.id = 'fsfit-data-loading';
  indicator.setAttribute('role', 'status');
  indicator.setAttribute('aria-live', 'polite');
  indicator.innerHTML = '<span aria-hidden="true"></span>Sincronizando dados';
  document.body.appendChild(indicator);
  return indicator;
}

function beginColdNetworkRequest() {
  coldNetworkRequests += 1;
  if (coldLoadingTimer) return;
  coldLoadingTimer = setTimeout(() => {
    coldLoadingTimer = null;
    if (coldNetworkRequests > 0) ensureColdLoadingIndicator()?.classList.add('show');
  }, 140);
}

function endColdNetworkRequest() {
  coldNetworkRequests = Math.max(0, coldNetworkRequests - 1);
  if (coldNetworkRequests > 0) return;
  clearTimeout(coldLoadingTimer);
  coldLoadingTimer = null;
  ensureColdLoadingIndicator()?.classList.remove('show');
}

function getRequestUrl(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input?.url || '';
}

function mergeHeaders(input, init) {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  return headers;
}

function decodeJwtSubject(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return '';
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const json = decodeURIComponent(
      Array.from(atob(padded))
        .map(char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join('')
    );
    return JSON.parse(json)?.sub || '';
  } catch {
    return '';
  }
}

function getRequestScope(headers) {
  const authorization = headers.get('authorization') || '';
  const token = authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';
  const subject = token ? decodeJwtSubject(token) : '';
  return subject ? `user:${subject}` : 'anonymous';
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function getRpcName(url) {
  try {
    const pathname = new URL(url).pathname;
    const marker = '/rest/v1/rpc/';
    const index = pathname.indexOf(marker);
    return index >= 0 ? decodeURIComponent(pathname.slice(index + marker.length)) : '';
  } catch {
    return '';
  }
}

function isSafeReadRpc(name) {
  if (!name) return false;
  if (SAFE_RPC_EXACT.has(name)) return true;
  return SAFE_RPC_PREFIXES.some(prefix => name.startsWith(prefix));
}

function getRequestMeta(input, init = {}) {
  const url = getRequestUrl(input);
  const method = String(init.method || (input instanceof Request ? input.method : 'GET') || 'GET').toUpperCase();
  const headers = mergeHeaders(input, init);
  const body = typeof init.body === 'string' ? init.body : '';
  const isRest = url.includes('/rest/v1/');
  const rpcName = getRpcName(url);
  const isRpc = Boolean(rpcName);
  const cacheable = isRest && (
    method === 'GET'
    || method === 'HEAD'
    || (method === 'POST' && isRpc && isSafeReadRpc(rpcName))
  );
  const mutation = (
    (isRest && !cacheable && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method))
    || (url.includes('/functions/v1/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method))
  );
  const scope = getRequestScope(headers);
  const signatureHeaders = ['accept', 'accept-profile', 'content-profile', 'prefer', 'range', 'range-unit']
    .map(name => `${name}:${headers.get(name) || ''}`)
    .join('|');
  const signature = `${scope}|${method}|${url}|${signatureHeaders}|${body}`;
  const key = `${DATA_CACHE_PREFIX}${hashString(scope)}:${hashString(signature)}`;

  return { url, method, headers, body, isRest, rpcName, cacheable, mutation, scope, key };
}

function createResponseFromCache(entry) {
  const noBody = [204, 205, 304].includes(Number(entry.status));
  const headers = new Headers(entry.headers || []);
  headers.set('x-fsfit-cache', 'hit');
  return new Response(noBody ? null : (entry.body || ''), {
    status: Number(entry.status || 200),
    statusText: entry.statusText || '',
    headers
  });
}

function readCacheEntry(key, { allowExpired = false } = {}) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    const age = Date.now() - Number(entry.storedAt || 0);
    if (!allowExpired && age > DATA_CACHE_MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return { ...entry, age };
  } catch {
    return null;
  }
}

function listCacheEntries() {
  const entries = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(DATA_CACHE_PREFIX)) continue;
      const raw = localStorage.getItem(key) || '';
      let storedAt = 0;
      try { storedAt = Number(JSON.parse(raw)?.storedAt || 0); } catch { storedAt = 0; }
      entries.push({ key, storedAt, bytes: raw.length * 2 });
    }
  } catch {
    return [];
  }
  return entries;
}

function trimDataCache() {
  const entries = listCacheEntries().sort((a, b) => a.storedAt - b.storedAt);
  let totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  while (entries.length > DATA_CACHE_MAX_ENTRIES || totalBytes > DATA_CACHE_MAX_BYTES) {
    const oldest = entries.shift();
    if (!oldest) break;
    try { localStorage.removeItem(oldest.key); } catch { break; }
    totalBytes -= oldest.bytes;
  }
}

function clearScopeCache(scope) {
  const scopeHash = hashString(scope);
  const prefix = `${DATA_CACHE_PREFIX}${scopeHash}:`;
  try {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    keys.forEach(key => localStorage.removeItem(key));
  } catch {
    // Cache é apenas uma otimização; falhas de storage não podem bloquear a aplicação.
  }
}

async function serializeResponse(response) {
  const clone = response.clone();
  const body = await clone.text();
  const headers = Array.from(clone.headers.entries());
  return {
    storedAt: Date.now(),
    status: clone.status,
    statusText: clone.statusText,
    headers,
    body,
    fingerprint: `${body}|${clone.headers.get('content-range') || ''}`
  };
}

async function storeResponse(key, response) {
  if (!response?.ok) return null;
  try {
    const entry = await serializeResponse(response);
    const serialized = JSON.stringify(entry);
    if (serialized.length * 2 > DATA_CACHE_MAX_ENTRY_BYTES) return entry;
    try {
      localStorage.setItem(key, serialized);
    } catch {
      trimDataCache();
      localStorage.setItem(key, serialized);
    }
    trimDataCache();
    return entry;
  } catch {
    return null;
  }
}

function cloneFetchInput(input) {
  try {
    return input instanceof Request ? input.clone() : input;
  } catch {
    return input;
  }
}

function canAutoRefreshPage() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (userInteracted || document.visibilityState !== 'visible') return false;
  const active = document.activeElement;
  if (active?.matches?.('input,textarea,select,[contenteditable="true"]')) return false;
  if (document.querySelector('[role="dialog"]:not([hidden]), .modal.show, .modal:not(.hidden), .admin-modal-backdrop:not(.hidden)')) return false;
  return true;
}

function scheduleVisiblePageRefresh(detail) {
  if (detail?.path?.includes('/notificacoes') || detail?.rpc?.includes('notificacoes')) return;
  if (!canAutoRefreshPage()) return;
  const pageKey = `fsfit:swr-auto-refresh:${window.location.pathname}`;
  const lastRefresh = Number(sessionStorage.getItem(pageKey) || 0);
  if (Date.now() - lastRefresh < AUTO_REFRESH_COOLDOWN_MS) return;
  clearTimeout(autoRefreshTimer);
  autoRefreshTimer = setTimeout(() => {
    if (!canAutoRefreshPage()) return;
    sessionStorage.setItem(pageKey, String(Date.now()));
    window.dispatchEvent(new CustomEvent('fsfit:data-cache-applied', { detail }));
    window.location.reload();
  }, 350);
}

function emitCacheUpdated(meta, previous, next) {
  const previousFingerprint = previous?.fingerprint || `${previous?.body || ''}|${new Headers(previous?.headers || []).get('content-range') || ''}`;
  if (!previous || previousFingerprint === next?.fingerprint) return;
  const detail = {
    key: meta.key,
    rpc: meta.rpcName || null,
    path: (() => { try { return new URL(meta.url).pathname; } catch { return ''; } })(),
    updatedAt: next.storedAt
  };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('fsfit:data-cache-updated', { detail }));
    scheduleVisiblePageRefresh(detail);
  }
}

function revalidateInBackground(input, init, meta, previous) {
  if (refreshInFlight.has(meta.key) || globalThis.navigator?.onLine === false) return;
  const requestInput = cloneFetchInput(input);
  const promise = nativeFetch(requestInput, init)
    .then(async response => {
      if (!response.ok) return;
      const next = await storeResponse(meta.key, response.clone());
      if (next) emitCacheUpdated(meta, previous, next);
    })
    .catch(() => undefined)
    .finally(() => refreshInFlight.delete(meta.key));
  refreshInFlight.set(meta.key, promise);
}

async function fsFitFetch(input, init = {}) {
  const meta = getRequestMeta(input, init);

  if (meta.cacheable) {
    const cached = readCacheEntry(meta.key);
    if (cached) {
      if (cached.age >= DATA_CACHE_REFRESH_AFTER_MS) {
        revalidateInBackground(input, init, meta, cached);
      }
      return createResponseFromCache(cached);
    }

    beginColdNetworkRequest();
    try {
      const response = await nativeFetch(input, init);
      if (response.ok) void storeResponse(meta.key, response.clone());
      return response;
    } catch (error) {
      const stale = readCacheEntry(meta.key, { allowExpired: true });
      if (stale) return createResponseFromCache(stale);
      throw error;
    } finally {
      endColdNetworkRequest();
    }
  }

  const response = await nativeFetch(input, init);
  if (meta.mutation && response.ok) clearScopeCache(meta.scope);
  return response;
}

export function clearFsFitDataCache() {
  try {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(DATA_CACHE_PREFIX)) keys.push(key);
    }
    keys.forEach(key => localStorage.removeItem(key));
  } catch {
    // Sem impacto funcional.
  }
}

export function getFsFitDataCacheStats() {
  const entries = listCacheEntries();
  return {
    entries: entries.length,
    estimatedBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0)
  };
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: { fetch: fsFitFetch }
});
