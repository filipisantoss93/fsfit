(() => {
  type ThemePreference = 'auto' | 'light' | 'dark';
  type ThemeRuntime = {
    getPreference: () => ThemePreference;
    getResolvedTheme: () => 'light' | 'dark';
    setPreference: (value: ThemePreference) => void;
    apply: () => void;
  };

  const STORAGE_KEY = 'fsfit:theme-preference';
  const DARK_QUERY = '(prefers-color-scheme: dark)';
  const LIGHT_THEME_COLOR = '#f5f7f8';
  const DARK_THEME_COLOR = '#0b0f14';
  const allowed = new Set<ThemePreference>(['auto', 'light', 'dark']);
  const media = window.matchMedia(DARK_QUERY);

  function readPreference(): ThemePreference {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
      return saved && allowed.has(saved) ? saved : 'auto';
    } catch {
      return 'auto';
    }
  }

  function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
    if (preference === 'light' || preference === 'dark') return preference;
    return media.matches ? 'dark' : 'light';
  }

  function syncThemeColor(resolved: 'light' | 'dark'): void {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = resolved === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;

    const appleStatus = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (appleStatus) appleStatus.content = resolved === 'dark' ? 'black-translucent' : 'default';
  }

  function syncControls(preference: ThemePreference): void {
    document.querySelectorAll<HTMLElement>('[data-fsfit-theme-choice]').forEach(control => {
      const choice = control.dataset.fsfitThemeChoice as ThemePreference | undefined;
      const active = choice === preference;
      control.classList.toggle('is-active', active);
      control.setAttribute('aria-pressed', String(active));
    });
  }

  function applyTheme(): void {
    const preference = readPreference();
    const resolved = resolveTheme(preference);
    const root = document.documentElement;

    root.dataset.fsfitThemePreference = preference;
    root.dataset.fsfitTheme = resolved;
    root.style.colorScheme = resolved;

    syncThemeColor(resolved);
    syncControls(preference);

    window.dispatchEvent(new CustomEvent('fsfit:theme-change', {
      detail: { preference, resolved }
    }));
  }

  function setPreference(value: ThemePreference): void {
    const preference = allowed.has(value) ? value : 'auto';
    try {
      if (preference === 'auto') localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, preference);
    } catch {}
    applyTheme();
  }

  const runtime: ThemeRuntime = {
    getPreference: readPreference,
    getResolvedTheme: () => resolveTheme(readPreference()),
    setPreference,
    apply: applyTheme
  };

  (globalThis as typeof globalThis & { FSFitTheme?: ThemeRuntime }).FSFitTheme = runtime;

  document.addEventListener('click', event => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-fsfit-theme-choice]')
      : null;
    if (!target) return;
    const choice = target.dataset.fsfitThemeChoice as ThemePreference | undefined;
    if (!choice || !allowed.has(choice)) return;
    setPreference(choice);
  });

  media.addEventListener?.('change', () => {
    if (readPreference() === 'auto') applyTheme();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => syncControls(readPreference()), { once: true });
  }

  applyTheme();
})();