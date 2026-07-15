import { supabase } from './supabase.js';

const loading = document.querySelector('#loading-state');
const errorState = document.querySelector('#error-state');
const content = document.querySelector('#student-content');
const notificationStatus = document.querySelector('#notification-status');
const enableNotifications = document.querySelector('#enable-notifications');
const disableNotifications = document.querySelector('#disable-notifications');
const installButton = document.querySelector('#install-app');
let installPrompt = null;
let serviceWorkerRegistration = null;
let vapidPublicKey = null;

function renderText(element, value, fallback) {
  element.textContent = value?.trim() || fallback;
}

function sessionToken() {
  return localStorage.getItem('fsfit_aluno_token');
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

async function invokePush(body) {
  const { data, error } = await supabase.functions.invoke('aluno-push', { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

async function configureNotifications() {
  if (!notificationStatus) return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    notificationStatus.textContent = 'Este navegador não oferece suporte a notificações push.';
    return;
  }

  try {
    serviceWorkerRegistration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const config = await invokePush({ action: 'config' });
    if (!config?.enabled || !config.public_key) {
      notificationStatus.textContent = 'As notificações ainda não foram habilitadas pelo sistema.';
      return;
    }
    vapidPublicKey = config.public_key;

    const subscription = await serviceWorkerRegistration.pushManager.getSubscription();
    if (subscription && Notification.permission === 'granted') {
      notificationStatus.textContent = 'Notificações ativas neste aparelho.';
      disableNotifications.classList.remove('hidden');
      return;
    }

    if (Notification.permission === 'denied') {
      notificationStatus.textContent = 'As notificações estão bloqueadas nas configurações do navegador.';
      return;
    }

    notificationStatus.textContent = 'Ative as notificações para receber lembretes do seu personal no celular.';
    enableNotifications.classList.remove('hidden');
  } catch (error) {
    console.error(error);
    notificationStatus.textContent = 'Não foi possível preparar as notificações neste momento.';
  }
}

async function subscribePush() {
  const token = sessionToken();
  if (!token || !serviceWorkerRegistration || !vapidPublicKey) return;
  enableNotifications.disabled = true;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      notificationStatus.textContent = 'Permissão de notificações não concedida.';
      return;
    }

    let subscription = await serviceWorkerRegistration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await serviceWorkerRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
      });
    }

    await invokePush({ action: 'subscribe', token, subscription: subscription.toJSON() });
    notificationStatus.textContent = 'Notificações ativas neste aparelho.';
    enableNotifications.classList.add('hidden');
    disableNotifications.classList.remove('hidden');
  } catch (error) {
    console.error(error);
    notificationStatus.textContent = 'Não foi possível ativar as notificações.';
  } finally {
    enableNotifications.disabled = false;
  }
}

async function unsubscribePush() {
  const token = sessionToken();
  if (!token || !serviceWorkerRegistration) return;
  disableNotifications.disabled = true;
  try {
    const subscription = await serviceWorkerRegistration.pushManager.getSubscription();
    if (subscription) {
      await invokePush({ action: 'unsubscribe', token, endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
    notificationStatus.textContent = 'Notificações desativadas neste aparelho.';
    disableNotifications.classList.add('hidden');
    if (Notification.permission !== 'denied' && vapidPublicKey) enableNotifications.classList.remove('hidden');
  } catch (error) {
    console.error(error);
    notificationStatus.textContent = 'Não foi possível desativar as notificações.';
  } finally {
    disableNotifications.disabled = false;
  }
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  installButton?.classList.remove('hidden');
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  installButton?.classList.add('hidden');
});

installButton?.addEventListener('click', async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installButton.classList.add('hidden');
});

enableNotifications?.addEventListener('click', subscribePush);
disableNotifications?.addEventListener('click', unsubscribePush);

async function load() {
  const token = sessionToken();
  if (!token) {
    window.location.replace('acesso-aluno.html');
    return;
  }

  const { data: accessToken, error: sessionError } = await supabase.rpc('get_aluno_portal_token', { p_session_token: token });
  if (sessionError || !accessToken) {
    localStorage.removeItem('fsfit_aluno_token');
    localStorage.removeItem('fsfit_aluno_token_expira_em');
    throw new Error('Sua sessão expirou. Entre novamente com WhatsApp e PIN.');
  }

  const { data, error } = await supabase.rpc('get_aluno_portal', { p_access_token: accessToken });
  if (error) throw new Error('Não foi possível acessar este plano.');

  const portal = Array.isArray(data) ? data[0] : data;
  if (!portal) throw new Error('Plano não encontrado ou indisponível.');

  document.querySelector('#student-name').textContent = portal.aluno_nome;
  document.querySelector('#trainer-name').textContent = portal.personal_nome || 'Seu personal trainer';
  renderText(document.querySelector('#workout-content'), portal.treino, 'Nenhum treino publicado ainda.');
  renderText(document.querySelector('#diet-content'), portal.dieta, 'Nenhuma orientação publicada ainda.');

  if (portal.plano_atualizado_em) {
    document.querySelector('#updated-at').textContent = `Atualizado em ${new Date(portal.plano_atualizado_em).toLocaleString('pt-BR')}`;
  }

  const phone = String(portal.personal_whatsapp || '').replace(/\D/g, '');
  if (phone.length >= 10) {
    const message = encodeURIComponent(`Olá, ${portal.personal_nome || 'Personal'}! Sou ${portal.aluno_nome} e tenho uma dúvida sobre meu plano.`);
    const button = document.querySelector('#whatsapp-button');
    button.href = `https://wa.me/${phone}?text=${message}`;
    button.classList.remove('hidden');
  }

  loading.classList.add('hidden');
  content.classList.remove('hidden');
  configureNotifications();
}

load().catch(error => {
  loading.classList.add('hidden');
  errorState.innerHTML = `${error.message}<div class="actions" style="justify-content:center;margin-top:16px"><a class="btn btn-primary" href="acesso-aluno.html">Entrar novamente</a></div>`;
  errorState.classList.remove('hidden');
});