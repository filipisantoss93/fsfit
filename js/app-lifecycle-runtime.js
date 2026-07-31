const STATE_KEY = '__FSFIT_APP_LIFECYCLE__';

function createState() {
  const cleanups = new Set();
  const pauseHandlers = new Set();
  const resumeHandlers = new Set();
  let suspended = false;
  let disposed = false;

  const runHandlers = handlers => {
    handlers.forEach(handler => {
      try {
        handler();
      } catch (error) {
        console.warn('Falha em handler do lifecycle FS Fit:', error);
      }
    });
  };

  const pause = () => {
    if (suspended || disposed) return;
    suspended = true;
    runHandlers(pauseHandlers);
  };

  const resume = () => {
    if (!suspended || disposed) return;
    suspended = false;
    runHandlers(resumeHandlers);
  };

  const dispose = () => {
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

  window.addEventListener('pagehide', event => {
    if (event.persisted) pause();
    else dispose();
  });

  window.addEventListener('pageshow', event => {
    if (event.persisted) resume();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pause();
    else resume();
  });

  window.addEventListener('focus', resume, { passive: true });

  return {
    registerCleanup(cleanup) {
      if (typeof cleanup !== 'function' || disposed) return () => undefined;
      cleanups.add(cleanup);
      return () => cleanups.delete(cleanup);
    },
    onPause(handler) {
      if (typeof handler !== 'function' || disposed) return () => undefined;
      pauseHandlers.add(handler);
      return () => pauseHandlers.delete(handler);
    },
    onResume(handler) {
      if (typeof handler !== 'function' || disposed) return () => undefined;
      resumeHandlers.add(handler);
      return () => resumeHandlers.delete(handler);
    },
    isSuspended: () => suspended,
    isDisposed: () => disposed,
    dispose
  };
}

if (!globalThis[STATE_KEY]) globalThis[STATE_KEY] = createState();

export const appLifecycle = globalThis[STATE_KEY];
