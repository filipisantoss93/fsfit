const STATE_KEY = '__FSFIT_APP_LIFECYCLE__';

type LifecycleHandler = () => void;
type LifecycleUnsubscribe = () => boolean | undefined;

type AppLifecycle = {
  registerCleanup(cleanup: LifecycleHandler): LifecycleUnsubscribe;
  onPause(handler: LifecycleHandler): LifecycleUnsubscribe;
  onResume(handler: LifecycleHandler): LifecycleUnsubscribe;
  isSuspended(): boolean;
  isDisposed(): boolean;
  dispose(): void;
};

type GlobalWithLifecycle = typeof globalThis & {
  __FSFIT_APP_LIFECYCLE__?: AppLifecycle;
};

function createState(): AppLifecycle {
  const cleanups = new Set<LifecycleHandler>();
  const pauseHandlers = new Set<LifecycleHandler>();
  const resumeHandlers = new Set<LifecycleHandler>();
  let suspended = false;
  let disposed = false;

  const runHandlers = (handlers: Set<LifecycleHandler>): void => {
    handlers.forEach(handler => {
      try {
        handler();
      } catch (error) {
        console.warn('Falha em handler do lifecycle FS Fit:', error);
      }
    });
  };

  const pause = (): void => {
    if (suspended || disposed) return;
    suspended = true;
    runHandlers(pauseHandlers);
  };

  const resume = (): void => {
    if (!suspended || disposed) return;
    suspended = false;
    runHandlers(resumeHandlers);
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    cleanups.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        console.warn('Falha ao limpar recurso do lifecycle FS Fit:', error);
      }
    });
    cleanups.clear();
    pauseHandlers.clear();
    resumeHandlers.clear();
  };

  window.addEventListener('pagehide', event => event.persisted ? pause() : dispose());
  window.addEventListener('pageshow', event => { if (event.persisted) resume(); });
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' ? pause() : resume());
  window.addEventListener('focus', resume, { passive: true });

  return {
    registerCleanup(cleanup: LifecycleHandler): LifecycleUnsubscribe {
      if (typeof cleanup !== 'function' || disposed) return () => undefined;
      cleanups.add(cleanup);
      return () => cleanups.delete(cleanup);
    },
    onPause(handler: LifecycleHandler): LifecycleUnsubscribe {
      if (typeof handler !== 'function' || disposed) return () => undefined;
      pauseHandlers.add(handler);
      return () => pauseHandlers.delete(handler);
    },
    onResume(handler: LifecycleHandler): LifecycleUnsubscribe {
      if (typeof handler !== 'function' || disposed) return () => undefined;
      resumeHandlers.add(handler);
      return () => resumeHandlers.delete(handler);
    },
    isSuspended: () => suspended,
    isDisposed: () => disposed,
    dispose
  };
}

const lifecycleScope = globalThis as GlobalWithLifecycle;
if (!lifecycleScope[STATE_KEY]) lifecycleScope[STATE_KEY] = createState();

export const appLifecycle = lifecycleScope[STATE_KEY] as AppLifecycle;
