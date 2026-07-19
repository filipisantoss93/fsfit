create or replace function public.fsfit_admin_funil_comercial()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null or not public.fsfit_is_admin((select auth.uid())) then
    raise exception 'Acesso administrativo negado';
  end if;

  with usuarios as (
    select p.id, p.created_at, p.trial_inicio, p.trial_fim
    from public.perfis p
    where not exists (
      select 1 from public.platform_admins pa where pa.user_id = p.id
    )
  ),
  pagamentos as (
    select x.personal_id, min(x.pago_em) as primeiro_pagamento
    from (
      select cp.personal_id, cp.pago_em
      from public.cobrancas_pix cp
      where cp.pago_em is not null
        and lower(coalesce(cp.status, '')) in ('paga','pago','paid','concluida','concluido','approved','aprovada','aprovado','settled')
      union all
      select cc.personal_id, cc.pago_em
      from public.cobrancas_cartao cc
      where cc.pago_em is not null
        and lower(coalesce(cc.status, '')) in ('paga','pago','paid','concluida','concluido','approved','aprovada','aprovado','settled')
    ) x
    group by x.personal_id
  ),
  assinaturas_ativas as (
    select distinct a.personal_id
    from public.assinaturas a
    where a.status = 'ativa'
      and a.acesso_valido_ate > now()
  ),
  cancelamentos as (
    select a.personal_id, min(a.cancelada_em) as primeira_cancelada_em, max(a.cancelada_em) as ultima_cancelada_em
    from public.assinaturas a
    where a.cancelada_em is not null
    group by a.personal_id
  ),
  base as (
    select
      u.*,
      pg.primeiro_pagamento,
      (aa.personal_id is not null) as possui_assinatura_ativa,
      c.primeira_cancelada_em,
      c.ultima_cancelada_em
    from usuarios u
    left join pagamentos pg on pg.personal_id = u.id
    left join assinaturas_ativas aa on aa.personal_id = u.id
    left join cancelamentos c on c.personal_id = u.id
  ),
  totais as (
    select
      count(*)::int as cadastros_total,
      count(*) filter (where trial_inicio is not null)::int as trials_total,
      count(*) filter (where primeiro_pagamento is not null)::int as converteram_total,
      count(*) filter (where primeiro_pagamento is not null and possui_assinatura_ativa)::int as pagos_ativos,
      count(*) filter (where possui_assinatura_ativa)::int as premium_ativos_total,
      count(*) filter (where possui_assinatura_ativa and primeiro_pagamento is null)::int as premium_cortesia_ativos,
      count(*) filter (where ultima_cancelada_em is not null)::int as cancelados_total,
      count(*) filter (where trial_fim is not null and trial_fim < now() and primeiro_pagamento is null)::int as trial_sem_conversao
    from base
  ),
  recentes as (
    select
      count(*) filter (where created_at >= now() - interval '30 days')::int as cadastros_30d,
      count(*) filter (where trial_inicio >= now() - interval '30 days')::int as trials_30d,
      count(*) filter (where primeiro_pagamento >= now() - interval '30 days')::int as conversoes_30d,
      count(*) filter (where ultima_cancelada_em >= now() - interval '30 days')::int as cancelamentos_30d
    from base
  ),
  meses as (
    select generate_series(
      date_trunc('month', timezone('America/Sao_Paulo', now())) - interval '5 months',
      date_trunc('month', timezone('America/Sao_Paulo', now())),
      interval '1 month'
    ) as mes_local
  ),
  tendencia as (
    select jsonb_agg(
      jsonb_build_object(
        'mes', to_char(m.mes_local, 'YYYY-MM'),
        'cadastros', (
          select count(*)
          from base b
          where timezone('America/Sao_Paulo', b.created_at) >= m.mes_local
            and timezone('America/Sao_Paulo', b.created_at) < m.mes_local + interval '1 month'
        ),
        'conversoes', (
          select count(*)
          from base b
          where b.primeiro_pagamento is not null
            and timezone('America/Sao_Paulo', b.primeiro_pagamento) >= m.mes_local
            and timezone('America/Sao_Paulo', b.primeiro_pagamento) < m.mes_local + interval '1 month'
        )
      ) order by m.mes_local
    ) as dados
    from meses m
  )
  select jsonb_build_object(
    'historico', jsonb_build_object(
      'cadastros', t.cadastros_total,
      'trials', t.trials_total,
      'conversoes_pagas', t.converteram_total,
      'assinantes_pagos_ativos', t.pagos_ativos,
      'premium_ativos_total', t.premium_ativos_total,
      'premium_cortesia_ativos', t.premium_cortesia_ativos,
      'cancelados', t.cancelados_total,
      'trial_sem_conversao', t.trial_sem_conversao
    ),
    'taxas', jsonb_build_object(
      'cadastro_trial_pct', case when t.cadastros_total > 0 then round((t.trials_total::numeric / t.cadastros_total) * 100, 1) else 0 end,
      'trial_conversao_pct', case when t.trials_total > 0 then round((t.converteram_total::numeric / t.trials_total) * 100, 1) else 0 end,
      'retencao_pagantes_pct', case when t.converteram_total > 0 then round((t.pagos_ativos::numeric / t.converteram_total) * 100, 1) else 0 end
    ),
    'ultimos_30_dias', jsonb_build_object(
      'cadastros', r.cadastros_30d,
      'trials', r.trials_30d,
      'conversoes', r.conversoes_30d,
      'cancelamentos', r.cancelamentos_30d
    ),
    'tendencia_6_meses', coalesce(te.dados, '[]'::jsonb)
  ) into v_result
  from totais t cross join recentes r cross join tendencia te;

  return v_result;
end;
$$;

revoke execute on function public.fsfit_admin_funil_comercial() from public;
revoke execute on function public.fsfit_admin_funil_comercial() from anon;
grant execute on function public.fsfit_admin_funil_comercial() to authenticated;
