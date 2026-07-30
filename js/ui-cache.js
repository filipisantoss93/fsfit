const CACHE_PREFIX = 'fsfit:ui-cache:v1';
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

function cacheKey(userId, scope) {
  const safeUserId = String(userId || '').trim();
  const safeScope = String(scope || '').trim();
  if (!safeUserId || !safeScope) return '';
  return `${CACHE_PREFIX}:${safeUserId}:${safeScope}`;
}

function removeLegacyPersistentCache() {
  try {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(`${CACHE_PREFIX}:`)) keys.push(key);
    }
    keys.forEach(key => localStorage.removeItem(key));
  } catch {
    // Falhas de armazenamento não devem bloquear a aplicação.
  }
}

removeLegacyPersistentCache();

export function readUiCache(userId, scope, { maxAgeMs = DEFAULT_MAX_AGE_MS } = {}) {
  const key = cacheKey(userId, scope);
  if (!key) return null;

  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (!parsed || parsed.version !== 1 || typeof parsed.savedAt !== 'number') {
      sessionStorage.removeItem(key);
      return null;
    }

    const ageMs = Math.max(0, Date.now() - parsed.savedAt);
    if (ageMs > maxAgeMs) {
      sessionStorage.removeItem(key);
      return null;
    }

    return {
      value: parsed.value,
      savedAt: parsed.savedAt,
      ageMs,
      stale: false
    };
  } catch {
    try { sessionStorage.removeItem(key); } catch {}
    return null;
  }
}

export function writeUiCache(userId, scope, value) {
  const key = cacheKey(userId, scope);
  if (!key) return false;

  try {
    sessionStorage.setItem(key, JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      value
    }));
    return true;
  } catch {
    return false;
  }
}

export function patchUiCache(userId, scope, patch) {
  const current = readUiCache(userId, scope)?.value;
  const base = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  return writeUiCache(userId, scope, { ...base, ...patch });
}

export function removeUiCache(userId, scope) {
  const key = cacheKey(userId, scope);
  if (!key) return;
  try { sessionStorage.removeItem(key); } catch {}
}

// O painel importa este módulo antes de aguardar perfil, plano e notificações.
// O último estado da aba é restaurado brevemente enquanto a rede revalida os dados.
if (window.location.pathname.endsWith('/painel.html')) {
  Promise.resolve()
    .then(() => import('./painel-ui-cache.js?v=20260723-swr1'))
    .catch(error => console.info('Cache visual do painel indisponível:', error?.message || error));
}
