import './inactive-account-guard.js?v=20260730-inactive-account1';
import { loadPageModules } from './page-module-loader.js?v=20260730-page-loader1';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://jjpijncxlkwutbnkpsaw.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_eU3QNbS5L0EqnK8H39XUgw_B2efuOvo';
const DATA_CACHE_PREFIX = 'fsfit:data-cache:v1:';
const GLOBAL_CLIENT_KEY = '__FSFIT_SUPABASE_CLIENT__';
const SCHEDULE_NORMALIZER_KEY = '__FSFIT_SCHEDULE_NORMALIZER__';

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

try {
  if (localStorage.getItem('fsfit:data-cache-cleanup:v2') !== '1') {
    clearFsFitDataCache();
    localStorage.setItem('fsfit:data-cache-cleanup:v2', '1');
  }
} catch {
  // Sem impacto funcional.
}

if (!globalThis[GLOBAL_CLIENT_KEY]) {
  globalThis[GLOBAL_CLIENT_KEY] = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
}

export const supabase = globalThis[GLOBAL_CLIENT_KEY];

function currentPage() {
  return window.location.pathname.split('/').pop() || 'index.html';
}

function normalizeScheduleResult(result) {
  if (!result || result.error || !result.data) return result;
  const normalizeRow = row => {
    if (!row || !Array.isArray(row.dias_semana)) return row;
    return { ...row, dias_semana: row.dias_semana.map(day => Number(day) === 7 ? 0 : Number(day)) };
  };
  return {
    ...result,
    data: Array.isArray(result.data) ? result.data.map(normalizeRow) : normalizeRow(result.data)
  };
}

function wrapTreinosBuilder(builder, cache = new WeakMap()) {
  if (!builder || (typeof builder !== 'object' && typeof builder !== 'function')) return builder;
  if (cache.has(builder)) return cache.get(builder);

  const proxy = new Proxy(builder, {
    get(target, property, receiver) {
      if (property === 'then') {
        return (onFulfilled, onRejected) => target.then(
          result => {
            const normalized = normalizeScheduleResult(result);
            return typeof onFulfilled === 'function' ? onFulfilled(normalized) : normalized;
          },
          onRejected
        );
      }

      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') return value;
      return (...args) => wrapTreinosBuilder(value.apply(target, args), cache);
    }
  });

  cache.set(builder, proxy);
  return proxy;
}

// Compatibilidade localizada: o cadastro de treinos usa 1=segunda ... 7=domingo,
// enquanto Date.getDay() usa 0=domingo. Apenas agenda e painel consomem os dias
// diretamente como getDay(), portanto normalizamos 7→0 somente nessas páginas.
if (!globalThis[SCHEDULE_NORMALIZER_KEY] && ['agenda.html', 'painel.html'].includes(currentPage())) {
  globalThis[SCHEDULE_NORMALIZER_KEY] = true;
  const originalFrom = supabase.from.bind(supabase);
  supabase.from = table => {
    const builder = originalFrom(table);
    return table === 'treinos' ? wrapTreinosBuilder(builder) : builder;
  };
}

loadPageModules(currentPage());

// O portal do aluno usa somente o token temporário de aluno_sessoes.
// Esta camada mantém compatibilidade com módulos antigos sem devolver access_token persistente ao navegador.
if (!globalThis.__FSFIT_STUDENT_SESSION_RPC_ADAPTER__) {
  globalThis.__FSFIT_STUDENT_SESSION_RPC_ADAPTER__ = true;
  const originalRpc = supabase.rpc.bind(supabase);
  const studentRpcMap = {
    get_aluno_portal: ['get_aluno_portal_sessao', {}],
    get_aluno_sessao_treino: ['get_aluno_sessao_treino_sessao', {}],
    get_aluno_chat_sessao: ['get_aluno_chat_sessao_token', {}],
    iniciar_aluno_sessao_treino: ['iniciar_aluno_sessao_treino_token', {}],
    cancelar_checkin_aluno_sessao: ['cancelar_checkin_aluno_sessao_token', {}],
    finalizar_aluno_sessao_treino: ['finalizar_aluno_sessao_treino_token', {}],
    marcar_aluno_exercicio_sessao: ['marcar_aluno_exercicio_sessao_token', {}],
    enviar_aluno_mensagem_sessao: ['enviar_aluno_mensagem_sessao_token', {}]
  };

  supabase.rpc = async (name, params = {}, options) => {
    if (name === 'get_aluno_portal_token') {
      const sessionToken = params?.p_session_token;
      const result = await originalRpc('fsfit_validar_sessao_aluno', { p_session_token: sessionToken }, options);
      return result.error || result.data !== true
        ? { ...result, data: null }
        : { ...result, data: sessionToken };
    }

    const mapped = studentRpcMap[name];
    if (!mapped || !Object.prototype.hasOwnProperty.call(params || {}, 'p_access_token')) {
      return originalRpc(name, params, options);
    }

    const [safeName] = mapped;
    const safeParams = { ...params, p_session_token: params.p_access_token };
    delete safeParams.p_access_token;
    return originalRpc(safeName, safeParams, options);
  };
}
