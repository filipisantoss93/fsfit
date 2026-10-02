"use strict";
(() => {
    const STORAGE_KEY = 'fsfit:theme-preference';
    const DARK_QUERY = '(prefers-color-scheme: dark)';
    const LIGHT_THEME_COLOR = '#f5f7f8';
    const DARK_THEME_COLOR = '#0b0f14';
    const allowed = new Set(['auto', 'light', 'dark']);
    const media = window.matchMedia(DARK_QUERY);
    function readPreference() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved && allowed.has(saved) ? saved : 'auto';
        }
        catch {
            return 'auto';
        }
    }
    function resolveTheme(preference) {
        if (preference === 'light' || preference === 'dark')
            return preference;
        return media.matches ? 'dark' : 'light';
    }
    function syncThemeColor(resolved) {
        let meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.name = 'theme-color';
            document.head.appendChild(meta);
        }
        meta.content = resolved === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR;
        const appleStatus = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
        if (appleStatus)
            appleStatus.content = resolved === 'dark' ? 'black-translucent' : 'default';
    }
    function applyTheme() {
        const preference = readPreference();
        const resolved = resolveTheme(preference);
        const root = document.documentElement;
        root.dataset.fsfitThemePreference = preference;
        root.dataset.fsfitTheme = resolved;
        root.style.colorScheme = resolved;
        syncThemeColor(resolved);
        window.dispatchEvent(new CustomEvent('fsfit:theme-change', {
            detail: { preference, resolved }
        }));
    }
    function setPreference(value) {
        const preference = allowed.has(value) ? value : 'auto';
        try {
            if (preference === 'auto')
                localStorage.removeItem(STORAGE_KEY);
            else
                localStorage.setItem(STORAGE_KEY, preference);
        }
        catch { }
        applyTheme();
    }
    const runtime = {
        getPreference: readPreference,
        getResolvedTheme: () => resolveTheme(readPreference()),
        setPreference,
        apply: applyTheme
    };
    globalThis.FSFitTheme = runtime;
    media.addEventListener?.('change', () => {
        if (readPreference() === 'auto')
            applyTheme();
    });
    applyTheme();
})();
