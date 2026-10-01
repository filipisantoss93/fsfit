(() => {
  const ATTRIBUTION_KEY = 'fsfit_attribution';
  const TRACKED_PARAMS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','gbraid','wbraid'];
  const url = new URL(window.location.href);
  const current: Record<string, string> = {};

  const requestedAuthMode = url.searchParams.get('modo');
  if (requestedAuthMode === 'login' || requestedAuthMode === 'entrar') {
    document.body.dataset.authDefault = 'login';
  }

  TRACKED_PARAMS.forEach(key => {
    const value = url.searchParams.get(key);
    if (value) current[key] = value.slice(0, 300);
  });

  current.landing_page = url.pathname;
  current.first_seen_at = new Date().toISOString();

  try {
    const existing = JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || '{}') as Record<string, unknown>;
    const merged: Record<string, unknown> = {
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

  function configureHeaderAccess(): void {
    const studentButton = document.querySelector<HTMLAnchorElement>('.lp-nav-actions .lp-student-entry');
    const personalButton = document.querySelector<HTMLAnchorElement>('.lp-nav-actions .lp-btn-primary');

    if (studentButton) {
      studentButton.href = '/acesso-aluno.html';
      studentButton.setAttribute('aria-label', 'Acessar portal do aluno');
      studentButton.dataset.trackCta = 'portal-aluno-topo';
    }

    if (personalButton) {
      personalButton.href = '/?modo=login#cadastro';
      personalButton.textContent = 'Personal';
      personalButton.setAttribute('aria-label', 'Entrar como personal trainer');
      personalButton.dataset.trackCta = 'login-personal-topo';
      personalButton.classList.add('lp-personal-entry');
    }
  }

  configureHeaderAccess();

  type DataLayerWindow = typeof window & { dataLayer?: Array<Record<string, unknown>> };
  function track(eventName: string, detail: Record<string, unknown> = {}): void {
    const payload = { event: eventName, page: url.pathname, ...detail };
    const trackingWindow = window as DataLayerWindow;
    trackingWindow.dataLayer = trackingWindow.dataLayer || [];
    trackingWindow.dataLayer.push(payload);
    window.dispatchEvent(new CustomEvent(`fsfit:${eventName}`, { detail: payload }));
  }

  document.querySelectorAll<HTMLElement>('[data-track-cta]').forEach(element => {
    element.addEventListener('click', () => {
      track('landing_cta_click', {
        cta: element.dataset.trackCta || element.textContent.trim(),
        destination: element.getAttribute('href') || '#cadastro'
      });
    });
  });

  const signupSection = document.querySelector<HTMLElement>('#cadastro');
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

  document.querySelectorAll<HTMLDetailsElement>('.lp-faq details').forEach(detail => {
    detail.addEventListener('toggle', () => {
      if (detail.open) track('landing_faq_open', { question: detail.querySelector('summary')?.textContent?.trim() || '' });
    });
  });

  type StickySection = 'hero' | 'signup' | 'final' | 'footer';
  function configureStickyCta(): void {
    const sticky = document.querySelector<HTMLElement>('.lp-sticky-cta');
    if (!sticky) return;

    sticky.hidden = false;
    sticky.setAttribute('aria-hidden', 'true');

    let closeButton = sticky.querySelector<HTMLButtonElement>('.lp-sticky-close');
    if (!closeButton) {
      closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'lp-sticky-close';
      closeButton.setAttribute('aria-label', 'Fechar chamada para cadastro');
      closeButton.textContent = '×';
      sticky.prepend(closeButton);
    }

    const sections: Record<StickySection, HTMLElement | null> = {
      hero: document.querySelector<HTMLElement>('.lp-hero'),
      signup: document.querySelector<HTMLElement>('#cadastro'),
      final: document.querySelector<HTMLElement>('.lp-final'),
      footer: document.querySelector<HTMLElement>('.lp-footer')
    };

    const visibility: Record<StickySection, boolean> = {
      hero: true,
      signup: false,
      final: false,
      footer: false
    };

    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem('fsfit_landing_sticky_dismissed') === '1';
    } catch (error) {
      console.warn('Não foi possível ler a preferência do CTA flutuante:', error);
    }

    let updateQueued = false;

    function hideSticky(): void {
      dismissed = true;
      sticky!.classList.remove('is-visible');
      sticky!.setAttribute('aria-hidden', 'true');
      sticky!.hidden = true;
      try {
        sessionStorage.setItem('fsfit_landing_sticky_dismissed', '1');
      } catch (error) {
        console.warn('Não foi possível salvar a preferência do CTA flutuante:', error);
      }
    }

    function updateStickyVisibility(): void {
      updateQueued = false;
      const mobile = window.matchMedia('(max-width: 720px)').matches;
      const blockedSectionVisible = visibility.hero || visibility.signup || visibility.final || visibility.footer;
      const shouldShow = mobile && !dismissed && !blockedSectionVisible && window.scrollY > 420;
      sticky!.hidden = !shouldShow;
      sticky!.classList.toggle('is-visible', shouldShow);
      sticky!.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    }

    function queueVisibilityUpdate(): void {
      if (updateQueued) return;
      updateQueued = true;
      requestAnimationFrame(updateStickyVisibility);
    }

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          const key = (entry.target as HTMLElement).dataset.stickyWatch as StickySection | undefined;
          if (!key || !(key in visibility)) return;
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

    const closeSticky = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
      hideSticky();
      track('landing_sticky_close');
    };

    closeButton!.addEventListener('click', closeSticky);
    closeButton.addEventListener('pointerup', event => {
      if (event.pointerType === 'touch') closeSticky(event);
    });

    sticky.querySelector('a[href="#cadastro"]')?.addEventListener('click', () => {
      sticky.classList.remove('is-visible');
      sticky.setAttribute('aria-hidden', 'true');
      sticky.hidden = true;
    });

    window.addEventListener('scroll', queueVisibilityUpdate, { passive: true });
    window.addEventListener('resize', queueVisibilityUpdate, { passive: true });
    window.visualViewport?.addEventListener('resize', queueVisibilityUpdate, { passive: true });

    updateStickyVisibility();
  }

  configureStickyCta();

  const year = document.querySelector<HTMLElement>('[data-current-year]');
  if (year) year.textContent = String(new Date().getFullYear());
})();
