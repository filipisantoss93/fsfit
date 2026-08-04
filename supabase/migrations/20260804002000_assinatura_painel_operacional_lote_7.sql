create or replace function public.fsfit_admin_diagnostico_assinatura()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_incidentes integer := 0;
  v_falhas integer := 0;
  v_pix_expirados integer := 0;
  v_cartoes_antigos integer := 0;
  v_pix_ultimo timestamptz;
  v_cartao_ultimo timestamptz;
  v_cron_pix boolean := false;
  v_cron_cartao boolean := false;
  v_status text := 'saudavel';
begin
  if v_uid is null or not exists (select 1 from public.platform_admins pa where pa.user_id = v_uid) then
    raise exception 'Acesso administrativo negado.';
  end if;
  select count(*) into v_incidentes from public.incidentes_financeiros where status in ('pendente','em_analise');
  select count(*) into v_falhas from public.eventos_financeiros where sucesso = false and created_at >= now() - interval '1 hour';
  select count(*) into v_pix_expirados from public.cobrancas_pix where status = 'pendente' and vence_em < now();
  select count(*) into v_cartoes_antigos from public.assinaturas where meio_pagamento = 'cartao' and status = 'pendente' and updated_at < now() - interval '30 minutes';
  select max(created_at) into v_pix_ultimo from public.eventos_financeiros where tipo_evento in ('ciclo_reconciliacao_concluido','ciclo_reconciliacao_falhou');
  select max(created_at) into v_cartao_ultimo from public.eventos_financeiros where tipo_evento in ('ciclo_reconciliacao_cartao_concluido','falha_reconciliacao_cartao');
  select exists(select 1 from cron.job where jobname = 'fsfit-reconciliar-pagamentos' and active) into v_cron_pix;
  select exists(select 1 from cron.job where jobname = 'fsfit-reconciliar-assinaturas-cartao' and active) into v_cron_cartao;
  if v_incidentes > 0 or v_falhas > 0 or v_pix_expirados > 0 or v_cartoes_antigos > 0 or not v_cron_pix or not v_cron_cartao then v_status := 'atencao'; end if;
  return jsonb_build_object('status',v_status,'verificado_em',now(),'incidentes_abertos',v_incidentes,'falhas_ultima_hora',v_falhas,'pix_pendentes_expirados',v_pix_expirados,'cartoes_pendentes_antigos',v_cartoes_antigos,'cron_pix_ativo',v_cron_pix,'cron_cartao_ativo',v_cron_cartao,'ultima_reconciliacao_pix',v_pix_ultimo,'ultima_reconciliacao_cartao',v_cartao_ultimo);
end;
$$;
revoke all on function public.fsfit_admin_diagnostico_assinatura() from public, anon;
grant execute on function public.fsfit_admin_diagnostico_assinatura() to authenticated, service_role;
