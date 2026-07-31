import { appLifecycle } from './app-lifecycle-runtime.js?v=20260731-global-runtime4';

const BOOTSTRAP_KEY = '__FSFIT_GLOBAL_RUNTIME_BOOTSTRAP__';
const RESOURCE_AUTOWIRE_KEY = '__FSFIT_RESOURCE_LIFECYCLE_AUTOWIRE__';
const REALTIME_AUTOWIRE_KEY = '__FSFIT_REALTIME_LIFECYCLE_AUTOWIRE__';
const SHARED_MUTATION_KEY = '__FSFIT_SHARED_MUTATION_RUNTIME__';
const SUPABASE_CLIENT_KEY = '__FSFIT_SUPABASE_CLIENT__';
const MOBILE_CHANNEL_PREFIX = 'fsfit-mobile-badges-';
const VERSION = '20260731-global-runtime4';

function installSharedMutationRuntime() {
  if (globalThis[SHARED_MUTATION_KEY] || typeof MutationObserver !== 'function') return;

  const NativeMutationObserver = globalThis.MutationObserver;
  const subscriptions = new Set();
  let sharedObserver = null;
  let sharedTarget = null;
  let pendingRecords = [];
  let deliveryFrame = 0;

  const matchesOptions = (record, options) => {
    if (record.type === 'childList') return options.childList === true;
    if (record.type === 'characterData') return options.characterData === true;
    if (record.type !== 'attributes' || options.attributes !== true) return false;
    return !Array.isArray(options.attributeFilter)
      || options.attributeFilter.length === 0
      || options.attributeFilter.includes(record.attributeName);
  };

  const deliver = () => {
    deliveryFrame = 0;
    const records = pendingRecords;
    pendingRecords = [];
    if (!records.length) return;
    subscriptions.forEach(subscription => {
      if (!subscription.active) return;
      const filtered = records.filter(record => matchesOptions(record, subscription.options));
      if (!filtered.length) return;
      try {
        subscription.callback(filtered, subscription.facade);
      } catch (error) {
        window.setTimeout(() => { throw error; }, 0);
      }
    });
  };

  const queueDelivery = records => {
    pendingRecords.push(...records);
    if (!deliveryFrame) deliveryFrame = window.requestAnimationFrame(deliver);
  };

  const ensureSharedObserver = target => {
    if (sharedObserver && sharedTarget === target) return;
    sharedObserver?.disconnect();
    sharedTarget = target;
    sharedObserver = new NativeMutationObserver(queueDelivery);
    sharedObserver.observe(target, { childList: true, subtree: true, characterData: true, attributes: true });
  };

  const releaseSharedObserverIfIdle = () => {
    if (subscriptions.size > 0) return;
    sharedObserver?.disconnect();
    sharedObserver = null;
    sharedTarget = null;
    pendingRecords = [];
    if (deliveryFrame) window.cancelAnimationFrame(deliveryFrame);
    deliveryFrame = 0;
  };

  class SharedMutationObserver {
    constructor(callback) {
      if (typeof callback !== 'function') throw new TypeError('MutationObserver callback must be a function.');
      this.callback = callback;
      this.nativeObserver = null;
      this.sharedSubscription = null;
    }

    observe(target, options = {}) {
      const canShare = target === document.body
        && options.subtree === true
        && options.attributeOldValue !== true
        && options.characterDataOldValue !== true;

      if (!canShare) {
        if (!this.nativeObserver) this.nativeObserver = new NativeMutationObserver(this.callback);
        this.nativeObserver.observe(target, options);
        return;
      }

      if (this.sharedSubscription) {
        this.sharedSubscription.active = false;
        subscriptions.delete(this.sharedSubscription);
      }

      this.sharedSubscription = { callback: this.callback, facade: this, options: { ...options }, active: true };
      subscriptions.add(this.sharedSubscription);
      ensureSharedObserver(target);
    }

    disconnect() {
      this.nativeObserver?.disconnect();
      if (this.sharedSubscription) {
        this.sharedSubscription.active = false;
        subscriptions.delete(this.sharedSubscription);
        this.sharedSubscription = null;
      }
      releaseSharedObserverIfIdle();
    }

    takeRecords() {
      return this.nativeObserver?.takeRecords() || [];
    }
  }

  globalThis.MutationObserver = SharedMutationObserver;
  globalThis[SHARED_MUTATION_KEY] = {
    native: NativeMutationObserver,
    subscriptions,
    disconnect() {
      sharedObserver?.disconnect();
      sharedObserver = null;
      sharedTarget = null;
      pendingRecords = [];
      subscriptions.forEach(subscription => { subscription.active = false; });
      subscriptions.clear();
      if (deliveryFrame) window.cancelAnimationFrame(deliveryFrame);
      deliveryFrame = 0;
    }
  };

  appLifecycle.registerCleanup(() => globalThis[SHARED_MUTATION_KEY]?.disconnect());
}

function installResourceLifecycle() {
  if (globalThis[RESOURCE_AUTOWIRE_KEY]) return;
  globalThis[RESOURCE_AUTOWIRE_KEY] = true;
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
      constructor(callback) { super(callback); this.__fsfitObservedTargets = []; observers.add(this); }
      observe(target, options) {
        const current = this.__fsfitObservedTargets.find(item => item.target === target);
        if (current) current.options = options;
        else this.__fsfitObservedTargets.push({ target, options });
        return super.observe(target, options);
      }
      disconnect() { observers.delete(this); this.__fsfitObservedTargets = []; return super.disconnect(); }
      __fsfitPause() { super.disconnect(); }
      __fsfitResume() {
        this.__fsfitObservedTargets.forEach(({ target, options }) => {
          if (target?.isConnected || target === document || target === document.body || target === document.documentElement) super.observe(target, options);
        });
      }
    };
  }

  globalThis.setTimeout = (callback, delay = 0, ...args) => {
    const createdAt = Date.now();
    const record = { callback, delay: Number(delay) || 0, args, createdAt, remaining: Number(delay) || 0, id: null };
    const invoke = () => { timers.delete(record.id); callback(...args); };
    record.id = nativeSetTimeout(invoke, record.delay);
    timers.set(record.id, record);
    return record.id;
  };
  globalThis.clearTimeout = id => { timers.delete(id); return nativeClearTimeout(id); };
  globalThis.setInterval = (callback, delay = 0, ...args) => {
    const record = { callback, delay: Number(delay) || 0, args, id: null };
    record.id = nativeSetInterval(callback, record.delay, ...args);
    intervals.set(record.id, record);
    return record.id;
  };
  globalThis.clearInterval = id => { intervals.delete(id); return nativeClearInterval(id); };

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
      const invoke = () => { timers.delete(record.id); record.callback(...record.args); };
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
    observers.clear(); timers.clear(); intervals.clear();
  });
}

function installRealtimeLifecycle(client) {
  if (!client || client[REALTIME_AUTOWIRE_KEY]) return Boolean(client);
  const tracked = new Set();
  const originalChannel = client.channel.bind(client);
  const originalRemoveChannel = client.removeChannel.bind(client);

  client.channel = (topic, options) => {
    const channel = originalChannel(topic, options);
    if (!String(topic || '').startsWith(MOBILE_CHANNEL_PREFIX)) return channel;
    const originalSubscribe = channel.subscribe.bind(channel);
    const originalUnsubscribe = channel.unsubscribe.bind(channel);
    let subscribed = false;
    let pausedByLifecycle = false;

    channel.subscribe = (...args) => { subscribed = true; pausedByLifecycle = false; tracked.add(channel); return originalSubscribe(...args); };
    channel.unsubscribe = (...args) => { subscribed = false; pausedByLifecycle = false; tracked.delete(channel); return originalUnsubscribe(...args); };
    channel.__fsfitPauseRealtime = async () => {
      if (!subscribed || pausedByLifecycle) return;
      pausedByLifecycle = true;
      await originalUnsubscribe().catch(() => undefined);
    };
    channel.__fsfitResumeRealtime = () => {
      if (!pausedByLifecycle) return;
      pausedByLifecycle = false; subscribed = true; tracked.add(channel); originalSubscribe();
    };
    return channel;
  };

  client.removeChannel = channel => { tracked.delete(channel); return originalRemoveChannel(channel); };
  appLifecycle.onPause(() => tracked.forEach(channel => channel.__fsfitPauseRealtime?.()));
  appLifecycle.onResume(() => {
    tracked.forEach(channel => channel.__fsfitResumeRealtime?.());
    window.dispatchEvent(new CustomEvent('fsfit:lifecycle-realtime-resumed'));
  });
  appLifecycle.registerCleanup(() => { tracked.forEach(channel => originalRemoveChannel(channel)); tracked.clear(); });
  client[REALTIME_AUTOWIRE_KEY] = true;
  return true;
}

function waitForSupabaseClient(attempt = 0) {
  if (installRealtimeLifecycle(globalThis[SUPABASE_CLIENT_KEY])) return;
  if (attempt >= 40 || appLifecycle.isDisposed()) return;
  window.setTimeout(() => waitForSupabaseClient(attempt + 1), 25);
}

function createRuntime() {
  const startedAt = Date.now();
  let readyDispatched = false;
  return {
    version: VERSION,
    startedAt,
    lifecycle: appLifecycle,
    loadCount: 1,
    markReload() { this.loadCount += 1; return this.loadCount; },
    status() {
      return {
        version: this.version,
        startedAt: this.startedAt,
        uptimeMs: Date.now() - this.startedAt,
        loadCount: this.loadCount,
        suspended: appLifecycle.isSuspended(),
        disposed: appLifecycle.isDisposed(),
        supabaseReady: Boolean(globalThis[SUPABASE_CLIENT_KEY]),
        resourceAutowire: Boolean(globalThis[RESOURCE_AUTOWIRE_KEY]),
        realtimeAutowire: Boolean(globalThis[SUPABASE_CLIENT_KEY]?.[REALTIME_AUTOWIRE_KEY]),
        mutationRuntime: Boolean(globalThis[SHARED_MUTATION_KEY])
      };
    },
    dispatchReady() {
      if (readyDispatched || appLifecycle.isDisposed()) return false;
      readyDispatched = true;
      window.dispatchEvent(new CustomEvent('fsfit:global-runtime-ready', { detail: this.status() }));
      return true;
    }
  };
}

installSharedMutationRuntime();
installResourceLifecycle();
queueMicrotask(() => waitForSupabaseClient());

if (!globalThis[BOOTSTRAP_KEY]) {
  globalThis[BOOTSTRAP_KEY] = createRuntime();
  queueMicrotask(() => globalThis[BOOTSTRAP_KEY].dispatchReady());
} else {
  globalThis[BOOTSTRAP_KEY].markReload?.();
}

export const globalRuntime = globalThis[BOOTSTRAP_KEY];
