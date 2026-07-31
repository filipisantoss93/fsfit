import { appLifecycle } from './app-lifecycle-runtime.js';

const CLIENT_KEY = '__FSFIT_SUPABASE_CLIENT__';
const AUTOWIRE_KEY = '__FSFIT_REALTIME_LIFECYCLE_AUTOWIRE__';
const MOBILE_CHANNEL_PREFIX = 'fsfit-mobile-badges-';

function install(client) {
  if (!client || client[AUTOWIRE_KEY]) return Boolean(client);

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

    channel.subscribe = (...args) => {
      subscribed = true;
      pausedByLifecycle = false;
      tracked.add(channel);
      return originalSubscribe(...args);
    };

    channel.unsubscribe = (...args) => {
      subscribed = false;
      pausedByLifecycle = false;
      tracked.delete(channel);
      return originalUnsubscribe(...args);
    };

    channel.__fsfitPauseRealtime = async () => {
      if (!subscribed || pausedByLifecycle) return;
      pausedByLifecycle = true;
      await originalUnsubscribe().catch(() => undefined);
    };

    channel.__fsfitResumeRealtime = () => {
      if (!pausedByLifecycle) return;
      pausedByLifecycle = false;
      subscribed = true;
      tracked.add(channel);
      originalSubscribe();
    };

    return channel;
  };

  client.removeChannel = channel => {
    tracked.delete(channel);
    return originalRemoveChannel(channel);
  };

  appLifecycle.onPause(() => {
    tracked.forEach(channel => channel.__fsfitPauseRealtime?.());
  });

  appLifecycle.onResume(() => {
    tracked.forEach(channel => channel.__fsfitResumeRealtime?.());
    window.dispatchEvent(new CustomEvent('fsfit:lifecycle-realtime-resumed'));
  });

  appLifecycle.registerCleanup(() => {
    tracked.forEach(channel => originalRemoveChannel(channel));
    tracked.clear();
  });

  client[AUTOWIRE_KEY] = true;
  return true;
}

function waitForClient(attempt = 0) {
  if (install(globalThis[CLIENT_KEY])) return;
  if (attempt >= 40 || appLifecycle.isDisposed()) return;
  window.setTimeout(() => waitForClient(attempt + 1), 25);
}

queueMicrotask(() => waitForClient());
