const CACHE_PREFIX = 'fsfit:ui-cache:v1';
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000;

function cacheKey(userId: string | null | undefined, scope: string) {
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

export function readUiCache<T = unknown>(userId: string | null | undefined, scope: string, { maxAgeMs = DEFAULT_MAX_AGE_MS }: { maxAgeMs?: number } = {}): { value: T; savedAt: number; ageMs: number; stale: false } | null {
  const key = cacheKey(userId, scope);
  if (!key) return null;

  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) || 'null') as { version?: unknown; savedAt?: unknown; value?: T } | null;
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
      value: parsed.value as T,
      savedAt: parsed.savedAt,
      ageMs,
      stale: false
    };
  } catch {
    try { sessionStorage.removeItem(key); } catch {}
    return null;
  }
}

export function writeUiCache(userId: string | null | undefined, scope: string, value: unknown): boolean {
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

export function patchUiCache(userId: string | null | undefined, scope: string, patch: Record<string, unknown>): boolean {
  const current = readUiCache(userId, scope)?.value;
  const base: Record<string, unknown> = current && typeof current === 'object' && !Array.isArray(current) ? current as Record<string, unknown> : {};
  return writeUiCache(userId, scope, { ...base, ...patch });
}

export function removeUiCache(userId: string | null | undefined, scope: string): void {
  const key = cacheKey(userId, scope);
  if (!key) return;
  try { sessionStorage.removeItem(key); } catch {}
}

// O painel importa este módulo antes de aguardar perfil, plano e notificações.
// O último estado da aba é restaurado brevemente enquanto a rede revalida os dados.
if (window.location.pathname.endsWith('/painel.html')) {
  Promise.resolve()
    // @ts-ignore The browser runtime resolves this existing JavaScript module.
    .then(() => import('./painel-ui-cache.js?v=20261001-ts-ui-cache1'))
    .catch(error => console.info('Cache visual do painel indisponível:', error?.message || error));
}
