type SubscriptionHealth = {
  status?: string | null;
  verificado_em?: string | null;
  incidentes_abertos?: number | null;
  falhas_ultima_hora?: number | null;
  pix_pendentes_expirados?: number | null;
  cartoes_pendentes_antigos?: number | null;
  cron_pix_ativo?: boolean | null;
  cron_cartao_ativo?: boolean | null;
  ultima_reconciliacao_pix?: string | null;
  ultima_reconciliacao_cartao?: string | null;
};

type HealthSupabaseClient = {
  auth: {
    getSession: () => Promise<{ data: { session: unknown | null } }>;
  };
  rpc: (name: 'fsfit_admin_diagnostico_assinatura') => Promise<{
    data: SubscriptionHealth | null;
    error: unknown | null;
  }>;
};

type WindowWithSupabaseClients = Window & {
  _supabase?: HealthSupabaseClient;
  supabaseClient?: HealthSupabaseClient;
  sb?: HealthSupabaseClient;
};

(() => {
  const getElement = (id: string): HTMLElement | null => document.getElementById(id);
  const client = (): HealthSupabaseClient | undefined => {
    const globals = window as WindowWithSupabaseClients;
    return globals._supabase || globals.supabaseClient || globals.sb;
  };
  const formatDate = (value?: string | null): string => value
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
    : 'Ainda não executado';
  const setText = (id: string, value: unknown): void => {
    const node = getElement(id);
    if (node) node.textContent = String(value);
  };
  const getErrorMessage = (error: unknown): string => {
    if (error && typeof error === 'object' && 'message' in error) return String(error.message);
    return 'Falha ao carregar diagnóstico.';
  };

  async function loadHealth(): Promise<void> {
    const button = document.getElementById('subscription-health-refresh') as HTMLButtonElement | null;
    if (button) button.disabled = true;
    try {
      const supabase = client();
      if (!supabase) throw new Error('Cliente Supabase indisponível.');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        location.href = 'index.html';
        return;
      }
      const { data, error } = await supabase.rpc('fsfit_admin_diagnostico_assinatura');
      if (error) throw error;
      const status = data?.status || 'atencao';
      const title = getElement('subscription-health-title');
      if (title) {
        title.dataset.status = status;
        title.textContent = status === 'saudavel' ? 'Sistema saudável' : 'Sistema exige atenção';
      }
      setText('subscription-health-checked', `Atualizado em ${formatDate(data?.verificado_em)}`);
      setText('subscription-health-summary', status === 'saudavel'
        ? 'Nenhuma divergência financeira operacional foi detectada.'
        : 'Há pendências que precisam ser verificadas antes de ampliar o uso da assinatura.');
      setText('health-incidents', data?.incidentes_abertos ?? 0);
      setText('health-failures', data?.falhas_ultima_hora ?? 0);
      setText('health-pix-expired', data?.pix_pendentes_expirados ?? 0);
      setText('health-card-stuck', data?.cartoes_pendentes_antigos ?? 0);
      setText('health-cron-pix', data?.cron_pix_ativo ? 'Ativo' : 'Parado');
      setText('health-cron-card', data?.cron_cartao_ativo ? 'Ativo' : 'Parado');
      setText('health-last-pix', formatDate(data?.ultima_reconciliacao_pix));
      setText('health-last-card', formatDate(data?.ultima_reconciliacao_cartao));
    } catch (error) {
      const message = getElement('subscription-health-message');
      if (message) {
        message.textContent = getErrorMessage(error);
        message.classList.add('error');
      }
    } finally {
      if (button) button.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    getElement('subscription-health-refresh')?.addEventListener('click', loadHealth);
    void loadHealth();
  });
})();
