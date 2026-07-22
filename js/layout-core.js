import './mobile-experience.js?v=20260721-mobile-polish1';
import './mobile-experience-fixes.js?v=20260721-mobile-polish2';
import * as legacyLayout from 'https://cdn.jsdelivr.net/gh/filipisantoss93/fsfit@9168e0e760f187b8f8d78a833122397c0a19b934/js/layout.js';

export * from 'https://cdn.jsdelivr.net/gh/filipisantoss93/fsfit@9168e0e760f187b8f8d78a833122397c0a19b934/js/layout.js';

export async function setGreeting(session) {
  if (!session) return;

  const headerGreeting = document.querySelector('#user-greeting');
  const dashboardGreeting = document.querySelector('#dashboard-user-greeting');
  const fallbackName = session.user?.user_metadata?.full_name?.trim()
    || session.user?.user_metadata?.nome?.trim()
    || session.user?.email?.split('@')[0]
    || 'Personal';
  const fallbackText = `Olá, ${fallbackName}`;

  if (headerGreeting && !headerGreeting.textContent.trim()) headerGreeting.textContent = fallbackText;
  if (dashboardGreeting && !dashboardGreeting.textContent.trim()) {
    dashboardGreeting.textContent = fallbackText;
    dashboardGreeting.classList.remove('hidden');
  }

  Promise.resolve()
    .then(() => legacyLayout.setGreeting(session))
    .then(() => {
      const resolvedText = document.querySelector('#user-greeting')?.textContent?.trim();
      const dashboard = document.querySelector('#dashboard-user-greeting');
      if (resolvedText && dashboard) {
        dashboard.textContent = resolvedText;
        dashboard.classList.remove('hidden');
      }
    })
    .catch(error => {
      console.warn('Não foi possível concluir o carregamento secundário do cabeçalho:', error);
    });
}