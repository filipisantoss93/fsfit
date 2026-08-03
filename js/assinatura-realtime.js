import { supabase } from './supabase.js';

const CHANNEL_NAME = 'fsfit-assinatura-realtime';
const REFRESH_DELAY_MS = 450;
let channel = null;
let refreshTimer = null;
let userId = null;

function scheduleRefresh() {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('fsfit:assinatura-atualizada'));
  }, REFRESH_DELAY_MS);
}

async function startRealtime() {
  const { data: { session } } = await supabase.auth.getSession();
  userId = session?.user?.id || null;
  if (!userId || channel) return;

  channel = supabase
    .channel(CHANNEL_NAME)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'cobrancas_pix', filter: `personal_id=eq.${userId}`
    }, scheduleRefresh)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'cobrancas_cartao', filter: `personal_id=eq.${userId}`
    }, scheduleRefresh)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'assinaturas', filter: `personal_id=eq.${userId}`
    }, scheduleRefresh)
    .subscribe();
}

window.addEventListener('fsfit:assinatura-atualizada', () => {
  const activeElement = document.activeElement;
  const modalOpen = document.querySelector('#subscription-management-modal');
  if (modalOpen || activeElement?.matches('input, select, textarea')) return;
  window.location.reload();
});

window.addEventListener('pagehide', () => {
  window.clearTimeout(refreshTimer);
  if (channel) supabase.removeChannel(channel);
  channel = null;
});

startRealtime().catch(error => console.warn('Realtime da assinatura indisponível:', error));
