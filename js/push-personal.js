import { supabase } from './supabase.js';

const homePanel = document.querySelector('#dashboard-home-panel');
const userAgent = navigator.userAgent || '';

const isIos = () => /iphone|ipad|ipod/i.test(userAgent);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const supportsPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

let registration = null;
let subscription = null;
let publicKey = '';
let checking = false;
let lastView = null;
let activeOnThisDevice = false;

function getPlatformCopy() {
  if (isIos()) {
    return {
      blockedTitle: 'As notificações estão bloqueadas no iPhone',
      blockedDescription: 'Abra Ajustes do iPhone → Notificações → FS Fit e ative “Permitir Notificações”. Depois volte ao app e verifique novamente.',
      unsupportedDescription: 'No iPhone, use o FS Fit instalado pela Tela de Início em uma versão compatível do iOS.'
    };
  }

  return {
    blockedTitle: 'As notificações estão bloqueadas neste navegador',
    blockedDescription: 'Abra as configurações do navegador, localize as permissões deste site e permita notificações para o FS Fit. Depois recarregue a página.',
    unsupportedDescription: 'Este navegador ou dispositivo não oferece suporte às notificações do FS Fit. Use uma versão atualizada do Chrome, Edge, Safari ou o aplicativo instalado.'
  };
}

function getViews() {
  const platform = getPlatformCopy();
  return {
    install: {
      kicker: 'NOTIFICAÇÕES NO IPHONE',
      title: 'Abra o FS Fit pelo ícone instalado',
      description: 'No iPhone, notificações funcionam somente no PWA adicionado à Tela de Início. No Safari, toque em Compartilhar → Adicionar à Tela de Início.',
      actions: '<button id="personal-push-refresh" class="btn btn-outline" type="button">Já instalei, verificar</button>'
    },
    activate: {
      kicker: 'ATIVAR NOTIFICAÇÕES',
      title: 'Receba avisos importantes neste aparelho',
      description: 'Ative notificações para receber check-ins, mensagens e alertas dos alunos mesmo com o FS Fit fechado.',
      actions: '<button id="personal-push-enable" class="btn btn-primary" type="button">Ativar notificações</button><button id="personal-push-refresh" class="btn btn-outline" type="button">Verificar novamente</button>'
    },
    blocked: {
      kicker: 'NOTIFICAÇÕES BLOQUEADAS',
      title: platform.blockedTitle,
      description: platform.blockedDescription,
      actions: '<button id="personal-push-refresh" class="btn btn-outline" type="button">Verificar novamente</button>'
    },
    active: {
      kicker: 'NOTIFICAÇÕES ATIVAS',
      title: 'Este aparelho está conectado',
      description: 'O FS Fit está pronto para avisar sobre check-ins, mensagens e atualizações dos alunos.',
      actions: '<button id="personal-push-test" class="btn btn-primary" type="button">Enviar notificação de teste</button><button id="personal-push-refresh" class="btn btn-outline" type="button">Verificar</button>'
    },
    unsupported: {
      kicker: 'RECURSO INDISPONÍVEL',
      title: 'Notificações indisponíveis neste aparelho',
      description: platform.unsupportedDescription,
      actions: ''
    }
  };
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from([...atob(base64)].map(char => char.charCodeAt(0)));
}

function ensureCard() {
  if (!homePanel) return null;
  let card = document.querySelector('#personal-push-card');
  if (card) return card;
  card = document.createElement('article');
  card.id = 'personal-push-card';
  card.className = 'card personal-push-card';
  card.setAttribute('aria-live', 'polite');
  homePanel.prepend(card);
  return card;
}

function render(state, feedback = '', feedbackType = '') {
  const view = getViews()[state];
  if (!view) return;
  activeOnThisDevice = false;
  lastView = { state, feedback, feedbackType };
  const card = ensureCard();
  if (!card) return;
  card.dataset.state = state;
  card.innerHTML = `
    <div class="personal-push-icon" aria-hidden="true">🔔</div>
    <div class="personal-push-copy">
      <small>${view.kicker}</small>
      <h2>${view.title}</h2>
      <p>${view.description}</p>
      ${view.actions ? `<div class="personal-push-actions">${view.actions}</div>` : ''}
      <span class="personal-push-feedback ${feedbackType}">${feedback}</span>
    </div>`;
}

function hideCard() {
  activeOnThisDevice = true;
  lastView = null;
  document.querySelector('#personal-push-card')?.remove();
}

function setFeedback(message, type = '') {
  if (lastView) {
    lastView.feedback = message;
    lastView.feedbackType = type;
  }
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
  if (!registration) {
    registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  }
  return registration;
}

async function getPublicKey() {
  if (!publicKey) {
    const data = await invokePush({ action: 'config' });
    if (!data?.public_key) throw new Error('Configuração de notificações indisponível.');
    publicKey = data.public_key;
  }
  return publicKey;
}

async function syncSubscription(current) {
  if (!current) return;
  await invokePush({ action: 'subscribe_personal', subscription: current.toJSON() });
}

async function ensureSubscription() {
  const currentRegistration = await getRegistration();
  let current = await currentRegistration.pushManager.getSubscription();
  if (!current) {
    current = await currentRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(await getPublicKey())
    });
  }
  await syncSubscription(current);
  subscription = current;
  return current;
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
      render(permission === 'denied' ? 'blocked' : 'activate');
      return;
    }
    await ensureSubscription();
    hideCard();
  } catch (error) {
    console.error('Falha ao ativar notificações do personal:', error);
    render('activate', error?.message || 'Não foi possível ativar as notificações.', 'error');
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
    const current = subscription || await ensureSubscription();
    const data = await invokePush({ action: 'test_personal', endpoint: current.endpoint });
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
  if (checking || !homePanel) return;
  checking = true;
  try {
    if (!supportsPush()) {
      render('unsupported');
      return;
    }
    if (isIos() && !isStandalone()) {
      render('install');
      return;
    }
    await getRegistration();
    if (Notification.permission === 'denied') {
      render('blocked');
      return;
    }
    subscription = await registration.pushManager.getSubscription();
    if (Notification.permission === 'granted') {
      try {
        subscription = subscription || await ensureSubscription();
        await syncSubscription(subscription);
        hideCard();
      } catch (error) {
        console.error('Falha ao sincronizar notificações do personal:', error);
        render('activate', 'A permissão existe, mas este aparelho precisa ser reconectado.', 'error');
      }
      return;
    }
    render('activate');
  } catch (error) {
    console.error('Falha ao verificar notificações do personal:', error);
    render('activate', 'Não foi possível verificar o estado agora.', 'error');
  } finally {
    checking = false;
  }
}

document.addEventListener('click', event => {
  if (event.target.closest('#personal-push-enable')) activateNotifications();
  if (event.target.closest('#personal-push-test')) sendTestNotification();
  if (event.target.closest('#personal-push-refresh')) loadState();
});

if (homePanel) {
  new MutationObserver(() => {
    if (activeOnThisDevice || document.querySelector('#personal-push-card')) return;
    if (lastView) render(lastView.state, lastView.feedback, lastView.feedbackType);
    else loadState();
  }).observe(homePanel, { childList: true });
}

loadState();
window.addEventListener('focus', loadState);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadState();
});
