import { appLifecycle } from './app-lifecycle-runtime.js';

const AUTOWIRE_KEY = '__FSFIT_RESOURCE_LIFECYCLE_AUTOWIRE__';

if (!globalThis[AUTOWIRE_KEY]) {
  globalThis[AUTOWIRE_KEY] = true;

  const NativeMutationObserver = globalThis.MutationObserver;
  const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
  const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis);
  const nativeSetInterval = globalThis.setInterval.bind(globalThis);
  const nativeClearInterval = globalThis.clearInterval.bind(globalThis);

  const observers = new Set();
  const timers = new Map();
  const intervals = new Map();

  if (typeof NativeMutationObserver === 'function') {
    globalThis.MutationObserver = class FsFitLifecycleMutationObserver extends NativeMutationObserver {
      constructor(callback) {
        super(callback);
        this.__fsfitObservedTargets = [];
        observers.add(this);
      }

      observe(target, options) {
        const current = this.__fsfitObservedTargets.find(item => item.target === target);
        if (current) current.options = options;
        else this.__fsfitObservedTargets.push({ target, options });
        return super.observe(target, options);
      }

      disconnect() {
        observers.delete(this);
        this.__fsfitObservedTargets = [];
        return super.disconnect();
      }

      __fsfitPause() {
        super.disconnect();
      }

      __fsfitResume() {
        this.__fsfitObservedTargets.forEach(({ target, options }) => {
          if (target?.isConnected || target === document || target === document.body || target === document.documentElement) {
            super.observe(target, options);
          }
        });
      }
    };
  }

  globalThis.setTimeout = (callback, delay = 0, ...args) => {
    const createdAt = Date.now();
    const record = { callback, delay: Number(delay) || 0, args, createdAt, remaining: Number(delay) || 0, id: null };
    const invoke = () => {
      timers.delete(record.id);
      callback(...args);
    };
    record.id = nativeSetTimeout(invoke, record.delay);
    timers.set(record.id, record);
    return record.id;
  };

  globalThis.clearTimeout = id => {
    timers.delete(id);
    return nativeClearTimeout(id);
  };

  globalThis.setInterval = (callback, delay = 0, ...args) => {
    const record = { callback, delay: Number(delay) || 0, args, id: null };
    record.id = nativeSetInterval(callback, record.delay, ...args);
    intervals.set(record.id, record);
    return record.id;
  };

  globalThis.clearInterval = id => {
    intervals.delete(id);
    return nativeClearInterval(id);
  };

  appLifecycle.onPause(() => {
    observers.forEach(observer => observer.__fsfitPause?.());
    timers.forEach((record, id) => {
      nativeClearTimeout(id);
      record.remaining = Math.max(0, record.delay - (Date.now() - record.createdAt));
    });
    intervals.forEach((record, id) => nativeClearInterval(id));
  });

  appLifecycle.onResume(() => {
    observers.forEach(observer => observer.__fsfitResume?.());

    const pendingTimers = [...timers.values()];
    timers.clear();
    pendingTimers.forEach(record => {
      record.createdAt = Date.now();
      record.delay = record.remaining;
      const invoke = () => {
        timers.delete(record.id);
        record.callback(...record.args);
      };
      record.id = nativeSetTimeout(invoke, record.remaining);
      timers.set(record.id, record);
    });

    const pendingIntervals = [...intervals.values()];
    intervals.clear();
    pendingIntervals.forEach(record => {
      record.id = nativeSetInterval(record.callback, record.delay, ...record.args);
      intervals.set(record.id, record);
    });
  });

  appLifecycle.registerCleanup(() => {
    observers.forEach(observer => observer.disconnect());
    timers.forEach((_, id) => nativeClearTimeout(id));
    intervals.forEach((_, id) => nativeClearInterval(id));
    observers.clear();
    timers.clear();
    intervals.clear();
  });
}
