import { appLifecycle } from './app-lifecycle-runtime.js?v=20260731-global-runtime2';
import './resource-lifecycle-autowire.js?v=20260731-global-runtime2';
import './realtime-lifecycle-autowire.js?v=20260731-global-runtime2';
import './shared-mutation-runtime.js?v=20260731-global-runtime2';

const BOOTSTRAP_KEY = '__FSFIT_GLOBAL_RUNTIME_BOOTSTRAP__';
const VERSION = '20260731-global-runtime2';

function createRuntime() {
  const startedAt = Date.now();
  let readyDispatched = false;

  const runtime = {
    version: VERSION,
    startedAt,
    lifecycle: appLifecycle,
    loadCount: 1,
    markReload() {
      this.loadCount += 1;
      return this.loadCount;
    },
    status() {
      return {
        version: this.version,
        startedAt: this.startedAt,
        uptimeMs: Date.now() - this.startedAt,
        loadCount: this.loadCount,
        suspended: appLifecycle.isSuspended(),
        disposed: appLifecycle.isDisposed(),
        supabaseReady: Boolean(globalThis.__FSFIT_SUPABASE_CLIENT__),
        resourceAutowire: Boolean(globalThis.__FSFIT_RESOURCE_LIFECYCLE_AUTOWIRE__),
        realtimeAutowire: Boolean(globalThis.__FSFIT_SUPABASE_CLIENT__?.__FSFIT_REALTIME_LIFECYCLE_AUTOWIRE__),
        mutationRuntime: Boolean(globalThis.__FSFIT_SHARED_MUTATION_RUNTIME__)
      };
    },
    dispatchReady() {
      if (readyDispatched || appLifecycle.isDisposed()) return false;
      readyDispatched = true;
      window.dispatchEvent(new CustomEvent('fsfit:global-runtime-ready', {
        detail: this.status()
      }));
      return true;
    }
  };

  return runtime;
}

if (!globalThis[BOOTSTRAP_KEY]) {
  globalThis[BOOTSTRAP_KEY] = createRuntime();
  queueMicrotask(() => globalThis[BOOTSTRAP_KEY].dispatchReady());
} else {
  globalThis[BOOTSTRAP_KEY].markReload?.();
}

export const globalRuntime = globalThis[BOOTSTRAP_KEY];
