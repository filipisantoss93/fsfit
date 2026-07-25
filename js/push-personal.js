import { supabase } from './supabase.js';

const homePanel = document.querySelector('#dashboard-home-panel');
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const supportsPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

let registration = null;
let subscription = null;
let publicKey = '';
let loadingState = false;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from([...atob(base64)].map(char => char.charCodeAt(0)));
}

function injectStyles() {
  if (document.querySelector('#personal-push-styles')) return;
  const style = document.createElement('style');
  style.id = 'personal-push-styles';
  style.textContent = `
    .personal-push-card{display:grid;grid-template-columns:44px minmax(0,1fr);gap:12px;padding:14px;border-color:rgba(177,255,0,.25);background:linear-gradient(120deg,rgba(177,255,0,.075),rgba(18,28,31,.84) 52%,rgba(9,22,31,.92));box-shadow:none}
    .personal-push-card[data-state="active"]{border-color:rgba(50,215,75,.32)}
    .personal-push-card[data-state="blocked"]{border-color:rgba(255,90,95,.4);background:linear-gradient(120deg,rgba(255,90,95,.08),rgba(18,28,31,.88) 58%)}
    .personal-push-card[data-state="install"]{border-color:rgba(59,130,246,.38);background:linear-gradient(120deg,rgba(59,130,246,.09),rgba(18,28,31,.88) 58%)}
    .personal-push-icon{display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:rgba(177,255,0,.12);color:var(--primary);font-size:1.25rem}
    .personal-push-card[data-state="blocked"] .personal-push-icon{background:rgba(255,90,95,.12);color:#ff858a}
    .personal-push-card[data-state="install"] .personal-push-icon{background:rgba(59,130,246,.12);color:#79aaff}
    .personal-push-copy{min-width:0}
    .personal-push-copy small{display:block;margin-bottom:3px;color:var(--primary);font-size:.61rem;font-weight:950;letter-spacing:.08em}
    .personal-push-card[data-state="blocked"] .personal-push-copy small{color:#ff858a}
    .personal-push-card[data-state="install"] .personal-push-copy small{color:#79aaff}
    .personal-push-copy h2{margin:0;font-size:.93rem;line-height:1.2}
    .personal-push-copy p{margin:5px 0 0;color:var(--muted);font-size:.7rem;line-height:1.45}
    .personal-push-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:11px}
    .personal-push-actions .btn{min-height:40px;padding-inline:12px;font-size:.72rem}
    .personal-push-feedback{display:block;min-height:17px;margin-top:8px;color:var(--muted);font-size:.65rem}
    .personal-push-feedback.success{color:#75e98a}.personal-push-feedback.error{color:#ff9ca0}
    @media(max-width:520px){.personal-push-card{grid-template-columns:40px minmax(0,1fr);gap:10px;padding:13px}.personal-push-icon{width:40px;height:40px;border-radius:13px}.personal-push-actions{display:grid;grid-template-columns:1fr}.personal-push-actions .btn{width:100%}}
  `;
  document.head.appendChild(style);
}

function ensureCard() {
  if (!homePanel) return null;
  let card = document.querySelector('#personal-push-card');
  if (card) return card;

  injectStyles();
  card = document.createElement('article');
  card.id = 'personal-push-card';
  card.className = 'card personal-push-card';
  card.setAttribute('aria-live', 'polite');
  homePanel.prepend(card);
  return card;
}

function renderCard({ state, kicker, title, description, actions = '', feedback = '' }) {
  const card = ensureCard();
  if (!card) return;
  card.dataset.state = state;
  card.innerHTML = `
    <div class="personal-push-icon" aria-hidden="true">🔔</div>
    <div class="personal-push-copy">
      <small>${kicker}</small>
      <h2>${title}</h2>
      <p>${description}</p>
      ${actions ? `<div class="personal-push-actions">${actions}</div>` : ''}
      <span class="personal-push-feedback">${feedback}</span>
    </div>`;
}

function setFeedback(message, type = '') {
  const feedback = document.querySelector('#personal-push-card .personal-push-feedback');
  if (!feedback) return;
  feedback.textContent = message;
  feedback.className = `personal-push-feedback ${type}`.trim();
}

async function invokePush(body) {
  const { data, error } = await supabase.functions.invoke('chat-push', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

async function getRegistration() {
  if (registration) return registration;
  registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  return registration;
}

async function getPublicKey() {
  if (publicKey) return publicKey;
  const data = await invokePush({ action: 'config' });
  if (!data?.public_key) throw new Error('Configuração de notificações indisponível.');
  publicKey = data.public_key;
  return publicKey;
}

async function syncCurrentSubscription(currentSubscription) {
  if (!currentSubscription) return;
  await invokePush({
    action: 'subscribe_personal',
    subscription: currentSubscription.toJSON()
  });
}

async function ensureLocalSubscription() {
  const currentRegistration = await getRegistration();
  let currentSubscription = await currentRegistration.pushManager.getSubscription();
  if (!currentSubscription) {
    const key = await getPublicKey();
    currentSubscription = await currentRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key)
    });
  }
  await syncCurrentSubscription(currentSubscription);
  subscription = currentSubscription;
  return currentSubscription;
}

function bindInstallActions() {
  document.querySelector('#personal-push-refresh')?.addEventListener('click', loadState);
}

function bindActivationActions() {
  document.querySelector('#personal-push-enable')?.addEventListener('click', activateNotifications);
  document.querySelector('#personal-push-refresh')?.addEventListener('click', loadState);
}

function bindActiveActions() {
  document.querySelector('#personal-push-test')?.addEventListener('click', sendTestNotification);
  document.querySelector('#personal-push-refresh')?.addEventListener('click', loadState);
}

function renderInstallRequired() {
  renderCard({
    state: 'install',
    kicker: 'NOTIFICAÇÕES NO IPHONE',
    title: 'Abra o FS Fit pelo ícone instalado',
    description: 'No iPhone, notificações funcionam somente no PWA adicionado à Tela de Início. No Safari, toque em Compartilhar → Adicionar à Tela de Início.',
    actions: '<button id="personal-push-refresh" class="btn btn-outline" type="button">Já instalei, verificar</button>'
  });
  bindInstallActions();
}

function renderActivationRequired() {
  renderCard({
    state: 'ready',
    kicker: 'NÃO PERCA CHECK-INS',
    title: 'Ative as notificações neste aparelho',
    description: 'Receba check-ins e mensagens dos alunos mesmo com o FS Fit fechado.',
    actions: '<button id="personal-push-enable" class="btn btn-primary" type="button">Ativar notificações</button><button id="personal-push-refresh" class="btn btn-outline" type="button">Verificar novamente</button>'
  });
  bindActivationActions();
}

function renderBlocked() {
  renderCard({
    state: 'blocked',
    kicker: 'NOTIFICAÇÕES BLOQUEADAS',
    title: 'O iPhone está impedindo os avisos',
    description: 'Abra Ajustes do iPhone → Notificações → FS Fit e ative “Permitir Notificações”. Depois volte ao app e verifique novamente.',
    actions: '<button id="personal-push-refresh" class="btn btn-outline" type="button">Verificar novamente</button>'
  });
  bindInstallActions();
}

function renderActive() {
  renderCard({
    state: 'active',
    kicker: 'NOTIFICAÇÕES ATIVAS',
    title: 'Este aparelho está conectado',
    description: 'O FS Fit está pronto para avisar sobre check-ins e mensagens dos alunos.',
    actions: '<button id="personal-push-test" class="btn btn-primary" type="button">Enviar notificação de teste</button><button id="personal-push-refresh" class="btn btn-outline" type="button">Verificar</button>'
  });
  bindActiveActions();
}

async function activateNotifications() {
  const button = document.querySelector('#personal-push-enable');
  if (button) {
    button.disabled = true;
    button.textContent = 'Ativando...';
  }
  setFeedback('Confirme a permissão quando o sistema solicitar.');

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      if (permission === 'denied') renderBlocked();
      else renderActivationRequired();
      return;
    }
    await ensureLocalSubscription();
    renderActive();
    setFeedback('Notificações ativadas com sucesso.', 'success');
  } catch (error) {
    console.error('Falha ao ativar notificações do personal:', error);
    renderActivationRequired();
    setFeedback(error?.message || 'Não foi possível ativar as notificações.', 'error');
  }
}

async function sendTestNotification() {
  const button = document.querySelector('#personal-push-test');
  if (button) {
    button.disabled = true;
    button.textContent = 'Enviando...';
  }
  setFeedback('Enviando um aviso para este aparelho...');

  try {
    const currentSubscription = subscription || await ensureLocalSubscription();
    const data = await invokePush({
      action: 'test_personal',
      endpoint: currentSubscription.endpoint
    });
    if (!Number(data?.delivered || 0)) throw new Error('O servidor não confirmou a entrega para este aparelho.');
    setFeedback('Teste enviado. A notificação deve aparecer em alguns segundos.', 'success');
  } catch (error) {
    console.error('Falha no teste de notificação:', error);
    setFeedback(error?.message || 'Não foi possível enviar o teste.', 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Enviar notificação de teste';
    }
  }
}

async function loadState() {
  if (loadingState || !homePanel) return;
  loadingState = true;

  try {
    if (!supportsPush()) {
      renderCard({
        state: 'blocked',
        kicker: 'RECURSO INDISPONÍVEL',
        title: 'Este navegador não oferece notificações',
        description: 'Use o FS Fit instalado como aplicativo em um iPhone ou Android compatível.'
      });
      return;
    }

    if (isIos() && !isStandalone()) {
      renderInstallRequired();
      return;
    }

    await getRegistration();

    if (Notification.permission === 'denied') {
      renderBlocked();
      return;
    }

    subscription = await registration.pushManager.getSubscription();

    if (Notification.permission === 'granted') {
      try {
        subscription = subscription || await ensureLocalSubscription();
        await syncCurrentSubscription(subscription);
        renderActive();
      } catch (error) {
        console.error('Falha ao sincronizar notificações do personal:', error);
        renderActivationRequired();
        setFeedback('A permissão existe, mas este aparelho precisa ser reconectado.', 'error');
      }
      return;
    }

    renderActivationRequired();
  } catch (error) {
    console.error('Falha ao verificar notificações do personal:', error);
    renderActivationRequired();
    setFeedback('Não foi possível verificar o estado agora.', 'error');
  } finally {
    loadingState = false;
  }
}

loadState();
window.addEventListener('focus', () => loadState());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadState();
});
