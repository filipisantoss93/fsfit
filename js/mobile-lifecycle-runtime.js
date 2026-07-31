import { appLifecycle } from './app-lifecycle-runtime.js';

export function registerObserver(observer) {
  if (!observer?.disconnect) return observer;
  appLifecycle.registerCleanup(() => observer.disconnect());
  return observer;
}

export function registerTimeout(timeoutId) {
  appLifecycle.registerCleanup(() => window.clearTimeout(timeoutId));
  return timeoutId;
}

export function registerRealtimeChannel(supabase, getChannel, restart) {
  const remove = () => {
    const channel = getChannel?.();
    if (channel) supabase.removeChannel(channel);
  };

  appLifecycle.registerCleanup(remove);
  appLifecycle.onPause(remove);
  if (typeof restart === 'function') appLifecycle.onResume(restart);
}

export function refreshOnResume(callback) {
  if (typeof callback !== 'function') return;
  appLifecycle.onResume(callback);
}
