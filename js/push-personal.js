import { supabase } from './supabase.js';

const heading = document.querySelector('.live-students-heading');
if (!heading || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
  // Navegador sem suporte a Web Push.
} else {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-outline';
  button.id = 'enable-personal-chat-notifications';
  button.textContent = 'Ativar notificações';
  heading.appendChild(button);

  const urlBase64ToUint8Array = base64String => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from([...atob(base64)].map(char => char.charCodeAt(0)));
  };

  async function hasActiveServerSubscription() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return false;

      const { count, error } = await supabase
        .from('dispositivos_push')
        .select('id', { count: 'exact', head: true })
        .eq('auth_user_id', session.user.id)
        .eq('ativo', true)
        .eq('user_agent', navigator.userAgent);

      if (error) {
        console.warn('Não foi possível consultar o estado das notificações no servidor:', error);
        return false;
      }

      return Number(count || 0) > 0;
    } catch (error) {
      console.warn('Falha ao verificar assinatura push no servidor:', error);
      return false;
    }
  }

  async function refreshState() {
    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const subscription = await registration.pushManager.getSubscription();
    const hasLocalSubscription = Boolean(subscription);
    const hasServerSubscription = await hasActiveServerSubscription();
    const notificationsActive = Notification.permission === 'granted' && (hasLocalSubscription || hasServerSubscription);

    if (notificationsActive) {
      button.hidden = true;
      button.disabled = true;
      return;
    }

    button.textContent = 'Ativar notificações';
    button.disabled = false;
    button.hidden = false;
  }

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Permissão de notificações não concedida.');

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const { data, error } = await supabase.functions.invoke('chat-push', { body: { action: 'config' } });
      if (error || !data?.public_key) throw error || new Error('Configuração push indisponível.');

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.public_key)
        });
      }

      const { error: subscribeError } = await supabase.functions.invoke('chat-push', {
        body: { action: 'subscribe_personal', subscription: subscription.toJSON() }
      });
      if (subscribeError) throw subscribeError;

      await refreshState();
    } catch (error) {
      console.error(error);
      button.textContent = 'Ativar notificações';
      button.disabled = false;
      button.hidden = false;
      alert(error?.message || 'Não foi possível ativar as notificações.');
    }
  });

  refreshState().catch(error => {
    console.error(error);
    button.hidden = false;
    button.disabled = false;
  });
}