const CACHE_PREFIX = 'fsfit:ui-cache:v1';

function cacheKey(userId, scope) {
  const safeUserId = String(userId || '').trim();
  const safeScope = String(scope || '').trim();
  if (!safeUserId || !safeScope) return '';
  return `${CACHE_PREFIX}:${safeUserId}:${safeScope}`;
}

export function readUiCache(userId, scope, { maxAgeMs = Infinity } = {}) {
  const key = cacheKey(userId, scope);
  if (!key) return null;

  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    if (!parsed || parsed.version !== 1 || typeof parsed.savedAt !== 'number') return null;
    const ageMs = Math.max(0, Date.now() - parsed.savedAt);
    return {
      value: parsed.value,
      savedAt: parsed.savedAt,
      ageMs,
      stale: ageMs > maxAgeMs
    };
  } catch {
    return null;
  }
}

export function writeUiCache(userId, scope, value) {
  const key = cacheKey(userId, scope);
  if (!key) return false;

  try {
    localStorage.setItem(key, JSON.stringify({
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
  try { localStorage.removeItem(key); } catch {}
}
