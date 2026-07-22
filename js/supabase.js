import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://jjpijncxlkwutbnkpsaw.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_eU3QNbS5L0EqnK8H39XUgw_B2efuOvo';
const DATA_CACHE_PREFIX = 'fsfit:data-cache:v1:';
const GLOBAL_CLIENT_KEY = '__FSFIT_SUPABASE_CLIENT__';

/**
 * Remove o cache de dados legado criado pelo antigo interceptor global de fetch.
 * O cache stale-while-revalidate anterior podia devolver respostas antigas e
 * disparar window.location.reload() durante a navegação, especialmente no iOS/PWA.
 */
export function clearFsFitDataCache() {
  try {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(DATA_CACHE_PREFIX)) keys.push(key);
    }
    keys.forEach(key => localStorage.removeItem(key));
  } catch {
    // Falhas de armazenamento local nunca devem bloquear a aplicação.
  }
}

export function getFsFitDataCacheStats() {
  let entries = 0;
  let estimatedBytes = 0;
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(DATA_CACHE_PREFIX)) continue;
      entries += 1;
      estimatedBytes += (localStorage.getItem(key) || '').length * 2;
    }
  } catch {
    return { entries: 0, estimatedBytes: 0 };
  }
  return { entries, estimatedBytes };
}

// Limpa uma única vez os dados persistidos pelo mecanismo antigo.
try {
  if (localStorage.getItem('fsfit:data-cache-cleanup:v2') !== '1') {
    clearFsFitDataCache();
    localStorage.setItem('fsfit:data-cache-cleanup:v2', '1');
  }
} catch {
  // Sem impacto funcional.
}

// Garante um único cliente Supabase para todos os módulos locais da aplicação.
// Isso evita concorrência de Auth/refresh token e canais Realtime duplicados
// quando diferentes módulos importam este arquivo durante a mesma página.
if (!globalThis[GLOBAL_CLIENT_KEY]) {
  globalThis[GLOBAL_CLIENT_KEY] = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}

export const supabase = globalThis[GLOBAL_CLIENT_KEY];
