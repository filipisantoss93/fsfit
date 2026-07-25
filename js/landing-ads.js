(() => {
  const ATTRIBUTION_KEY = 'fsfit_attribution';
  const TRACKED_PARAMS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','gbraid','wbraid'];
  const url = new URL(window.location.href);
  const current = {};

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

  const year = document.querySelector('[data-current-year]');
  if (year) year.textContent = String(new Date().getFullYear());
})();