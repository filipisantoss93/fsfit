create or replace function public.fsfit_status_assinatura_operacional()
returns jsonb
language sql
security definer
set search_path = public, cron
as $$
  with dados as (
    select
      (select count(*) from public.incidentes_financeiros where status in ('pendente','em_analise')) as incidentes_abertos,
      (select count(*) from public.cobrancas_pix where status = 'pendente' and vence_em < now()) as pix_pendentes_expirados,
      (select count(*) from public.assinaturas where meio_pagamento = 'cartao' and status = 'pendente' and updated_at < now() - interval '30 minutes') as cartoes_pendentes_antigos,
      (select count(*) from public.eventos_financeiros where sucesso = false and created_at >= now() - interval '1 hour') as falhas_ultima_hora,
      (select max(created_at) from public.eventos_financeiros where tipo_evento = 'ciclo_reconciliacao_concluido') as ultima_reconciliacao_pix,
      (select max(created_at) from public.eventos_financeiros where tipo_evento = 'ciclo_reconciliacao_cartao_concluido') as ultima_reconciliacao_cartao,
      exists(select 1 from cron.job where jobname = 'fsfit-reconciliar-pagamentos' and active) as cron_pix_ativo,
      exists(select 1 from cron.job where jobname = 'fsfit-reconciliar-assinaturas-cartao' and active) as cron_cartao_ativo
  )
  select jsonb_build_object(
    'status', case when incidentes_abertos = 0 and pix_pendentes_expirados = 0 and cartoes_pendentes_antigos = 0 and falhas_ultima_hora = 0 and cron_pix_ativo and cron_cartao_ativo then 'saudavel' else 'atencao' end,
    'verificado_em', now(),
    'incidentes_abertos', incidentes_abertos,
    'pix_pendentes_expirados', pix_pendentes_expirados,
    'cartoes_pendentes_antigos', cartoes_pendentes_antigos,
    'falhas_ultima_hora', falhas_ultima_hora,
    'ultima_reconciliacao_pix', ultima_reconciliacao_pix,
    'ultima_reconciliacao_cartao', ultima_reconciliacao_cartao,
    'cron_pix_ativo', cron_pix_ativo,
    'cron_cartao_ativo', cron_cartao_ativo
  ) from dados;
$$;

revoke all on function public.fsfit_status_assinatura_operacional() from public, anon, authenticated;
grant execute on function public.fsfit_status_assinatura_operacional() to service_role;
