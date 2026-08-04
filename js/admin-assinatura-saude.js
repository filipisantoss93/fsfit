(() => {
  const $ = id => document.getElementById(id);
  const client = () => window._supabase || window.supabaseClient || window.sb;
  const formatDate = value => value ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)) : 'Ainda não executado';
  const setText = (id, value) => { const node=$(id); if(node) node.textContent=String(value); };

  async function loadHealth() {
    const button=$('subscription-health-refresh');
    if(button) button.disabled=true;
    try {
      const supabase=client();
      if(!supabase) throw new Error('Cliente Supabase indisponível.');
      const { data:{ session } } = await supabase.auth.getSession();
      if(!session){ location.href='index.html'; return; }
      const { data, error } = await supabase.rpc('fsfit_admin_diagnostico_assinatura');
      if(error) throw error;
      const status=data?.status || 'atencao';
      const title=$('subscription-health-title');
      if(title){ title.dataset.status=status; title.textContent=status==='saudavel'?'Sistema saudável':'Sistema exige atenção'; }
      setText('subscription-health-checked', `Atualizado em ${formatDate(data?.verificado_em)}`);
      setText('subscription-health-summary', status==='saudavel'?'Nenhuma divergência financeira operacional foi detectada.':'Há pendências que precisam ser verificadas antes de ampliar o uso da assinatura.');
      setText('health-incidents', data?.incidentes_abertos ?? 0);
      setText('health-failures', data?.falhas_ultima_hora ?? 0);
      setText('health-pix-expired', data?.pix_pendentes_expirados ?? 0);
      setText('health-card-stuck', data?.cartoes_pendentes_antigos ?? 0);
      setText('health-cron-pix', data?.cron_pix_ativo ? 'Ativo' : 'Parado');
      setText('health-cron-card', data?.cron_cartao_ativo ? 'Ativo' : 'Parado');
      setText('health-last-pix', formatDate(data?.ultima_reconciliacao_pix));
      setText('health-last-card', formatDate(data?.ultima_reconciliacao_cartao));
    } catch (error) {
      const message=$('subscription-health-message');
      if(message){ message.textContent=error?.message || 'Falha ao carregar diagnóstico.'; message.classList.add('error'); }
    } finally {
      if(button) button.disabled=false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('subscription-health-refresh')?.addEventListener('click', loadHealth);
    loadHealth();
  });
})();
