(() => {
  const ATTRIBUTION_KEY = 'fsfit_attribution';
  const TRACKED_PARAMS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','gbraid','wbraid'];
  const MOBILE_FIXES_URL = '/css/landing-ads-mobile-fixes.css?v=20260725-mobile2';
  const url = new URL(window.location.href);
  const current = {};

  const requestedAuthMode = url.searchParams.get('modo');
  if (requestedAuthMode === 'login' || requestedAuthMode === 'entrar') {
    document.body.dataset.authDefault = 'login';
  }

  const mobileFixes = document.createElement('link');
  mobileFixes.rel = 'stylesheet';
  mobileFixes.href = MOBILE_FIXES_URL;
  document.head.appendChild(mobileFixes);

  TRACKED_PARAMS.forEach(key => {
    const value = url.searchParams.get(key);
    if (value) current[key] = value.slice(0, 300);
  });

  current.landing_page = url.pathname;
  current.first_seen_at = new Date().toISOString();

  try {
    const existing = JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || '{}');
    const merged = {
      ...current,
      ...existing,
      last_landing_page: url.pathname,
      last_seen_at: new Date().toISOString()
    };
    TRACKED_PARAMS.forEach(key => {
      if (current[key]) merged[key] = current[key];
    });
    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(merged));
  } catch (error) {
    console.warn('Não foi possível salvar a atribuição da campanha:', error);
  }

  function track(eventName, detail = {}) {
    const payload = { event: eventName, page: url.pathname, ...detail };
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
    window.dispatchEvent(new CustomEvent(`fsfit:${eventName}`, { detail: payload }));
  }

  document.querySelectorAll('[data-track-cta]').forEach(element => {
    element.addEventListener('click', () => {
      track('landing_cta_click', {
        cta: element.dataset.trackCta || element.textContent.trim(),
        destination: element.getAttribute('href') || '#cadastro'
      });
    });
  });

  const signupSection = document.querySelector('#cadastro');
  if (signupSection && 'IntersectionObserver' in window) {
    let tracked = false;
    const observer = new IntersectionObserver(entries => {
      if (!tracked && entries.some(entry => entry.isIntersecting)) {
        tracked = true;
        track('landing_signup_view');
        observer.disconnect();
      }
    }, { threshold: .35 });
    observer.observe(signupSection);
  }

  document.querySelectorAll('.lp-faq details').forEach(detail => {
    detail.addEventListener('toggle', () => {
      if (detail.open) track('landing_faq_open', { question: detail.querySelector('summary')?.textContent?.trim() || '' });
    });
  });

  function configureStickyCta() {
    const sticky = document.querySelector('.lp-sticky-cta');
    if (!sticky) return;

    sticky.hidden = true;

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'lp-sticky-close';
    closeButton.setAttribute('aria-label', 'Fechar chamada para cadastro');
    closeButton.textContent = '×';
    sticky.prepend(closeButton);

    const sections = {
      hero: document.querySelector('.lp-hero'),
      signup: document.querySelector('#cadastro'),
      final: document.querySelector('.lp-final'),
      footer: document.querySelector('.lp-footer')
    };

    const visibility = {
      hero: true,
      signup: false,
      final: false,
      footer: false
    };

    let dismissed = sessionStorage.getItem('fsfit_landing_sticky_dismissed') === '1';
    let updateQueued = false;

    function updateStickyVisibility() {
      updateQueued = false;
      const mobile = window.matchMedia('(max-width: 720px)').matches;
      const blockedSectionVisible = visibility.hero || visibility.signup || visibility.final || visibility.footer;
      const shouldShow = mobile && !dismissed && !blockedSectionVisible && window.scrollY > 420;
      sticky.classList.toggle('is-visible', shouldShow);
      sticky.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    }

    function queueVisibilityUpdate() {
      if (updateQueued) return;
      updateQueued = true;
      requestAnimationFrame(updateStickyVisibility);
    }

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const key = entry.target.dataset.stickyWatch;
          if (!key) return;
          visibility[key] = entry.isIntersecting && entry.intersectionRatio > .04;
        });
        queueVisibilityUpdate();
      }, { threshold: [0, .04, .15] });

      Object.entries(sections).forEach(([key, section]) => {
        if (!section) return;
        section.dataset.stickyWatch = key;
        observer.observe(section);
      });
    } else {
      visibility.hero = false;
    }

    closeButton.addEventListener('click', () => {
      dismissed = true;
      sessionStorage.setItem('fsfit_landing_sticky_dismissed', '1');
      sticky.classList.remove('is-visible');
      sticky.setAttribute('aria-hidden', 'true');
      track('landing_sticky_close');
    });

    sticky.querySelector('a[href="#cadastro"]')?.addEventListener('click', () => {
      sticky.classList.remove('is-visible');
      sticky.setAttribute('aria-hidden', 'true');
    });

    window.addEventListener('scroll', queueVisibilityUpdate, { passive: true });
    window.addEventListener('resize', queueVisibilityUpdate, { passive: true });
    window.visualViewport?.addEventListener('resize', queueVisibilityUpdate, { passive: true });

    const revealAfterStyles = () => {
      sticky.hidden = false;
      updateStickyVisibility();
    };

    if (mobileFixes.sheet) {
      revealAfterStyles();
    } else {
      mobileFixes.addEventListener('load', revealAfterStyles, { once: true });
      mobileFixes.addEventListener('error', () => { sticky.hidden = true; }, { once: true });
    }
  }

  configureStickyCta();

  const year = document.querySelector('[data-current-year]');
  if (year) year.textContent = String(new Date().getFullYear());
})();