import { appLifecycle } from './app-lifecycle-runtime.js?v=20260731-global-runtime1';
import './resource-lifecycle-autowire.js?v=20260731-global-runtime1';
import './realtime-lifecycle-autowire.js?v=20260731-global-runtime1';
import './shared-mutation-runtime.js?v=20260731-global-runtime1';

const BOOTSTRAP_KEY = '__FSFIT_GLOBAL_RUNTIME_BOOTSTRAP__';

if (!globalThis[BOOTSTRAP_KEY]) {
  globalThis[BOOTSTRAP_KEY] = Object.freeze({
    version: '20260731-global-runtime1',
    startedAt: Date.now(),
    lifecycle: appLifecycle,
    status() {
      return {
        suspended: appLifecycle.isSuspended(),
        disposed: appLifecycle.isDisposed(),
        supabaseReady: Boolean(globalThis.__FSFIT_SUPABASE_CLIENT__),
        resourceAutowire: Boolean(globalThis.__FSFIT_RESOURCE_LIFECYCLE_AUTOWIRE__),
        realtimeAutowire: Boolean(globalThis.__FSFIT_SUPABASE_CLIENT__?.__FSFIT_REALTIME_LIFECYCLE_AUTOWIRE__)
      };
    }
  });
}

export const globalRuntime = globalThis[BOOTSTRAP_KEY];
