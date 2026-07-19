create or replace function public.fsfit_admin_retencao_churn()
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

  with pagamentos as (
    select cp.personal_id, cp.valor_centavos, cp.pago_em
    from public.cobrancas_pix cp
    where lower(coalesce(cp.status, '')) in ('paga','pago','paid','concluida','concluido')
      and cp.pago_em is not null
    union all
    select cc.personal_id, cc.valor_centavos, cc.pago_em
    from public.cobrancas_cartao cc
    where lower(coalesce(cc.status, '')) in ('paga','pago','paid','concluida','concluido','approved','aprovada','aprovado')
      and cc.pago_em is not null
  ),
  pagantes as (
    select p.personal_id,min(p.pago_em) as primeiro_pagamento,max(p.pago_em) as ultimo_pagamento,sum(p.valor_centavos)::bigint as receita_total_centavos
    from pagamentos p
    where not exists (select 1 from public.platform_admins pa where pa.user_id = p.personal_id)
    group by p.personal_id
  ),
  assinatura_atual as (
    select distinct on (a.personal_id)
      a.personal_id,a.id as assinatura_id,a.status,a.preco_contratado_centavos,
      greatest(coalesce(a.periodicidade_meses, 1), 1) as periodicidade_meses,
      a.acesso_valido_ate,a.proxima_cobranca_em,a.cancelada_em,a.cancelamento_solicitado_em,a.ultima_cobranca_status
    from public.assinaturas a
    where a.status = 'ativa' and a.acesso_valido_ate > now()
    order by a.personal_id, a.acesso_valido_ate desc nulls last, a.updated_at desc
  ),
  cancelados_30d as (
    select distinct a.personal_id
    from public.assinaturas a
    join pagantes p on p.personal_id = a.personal_id
    where a.cancelada_em >= now() - interval '30 days'
      and not exists (select 1 from assinatura_atual aa where aa.personal_id = a.personal_id)
  ),
  coorte_30d as (
    select p.personal_id from pagantes p where p.primeiro_pagamento <= now() - interval '30 days'
  ),
  fim_relacionamento as (
    select p.personal_id,
      case when aa.personal_id is not null then now()
      else greatest(
        p.ultimo_pagamento,
        coalesce((select max(a.cancelada_em) from public.assinaturas a where a.personal_id = p.personal_id), p.ultimo_pagamento),
        coalesce((select max(a.acesso_valido_ate) from public.assinaturas a where a.personal_id = p.personal_id and a.acesso_valido_ate <= now()), p.ultimo_pagamento)
      ) end as fim_em
    from pagantes p
    left join assinatura_atual aa on aa.personal_id = p.personal_id
  ),
  ultimo_pagamento_aberto as (
    select distinct on (x.personal_id) x.personal_id,x.status,x.vence_em
    from (
      select cp.personal_id,cp.status,cp.vence_em,cp.created_at
      from public.cobrancas_pix cp
      where lower(coalesce(cp.status,'')) in ('pendente','pending','expirada','expirado')
      union all
      select cc.personal_id,cc.status,null::timestamptz as vence_em,cc.created_at
      from public.cobrancas_cartao cc
      where lower(coalesce(cc.status,'')) in ('pendente','pending','expirada','expirado','failed','falha','recusada','recusado')
    ) x
    order by x.personal_id,x.created_at desc
  ),
  risco as (
    select aa.personal_id as user_id,pf.nome,au.email,aa.preco_contratado_centavos as valor_centavos,
      coalesce(upa.vence_em,aa.proxima_cobranca_em,aa.acesso_valido_ate) as data_referencia,
      case
        when aa.cancelamento_solicitado_em is not null then 'Cancelamento já solicitado'
        when upa.personal_id is not null and lower(coalesce(upa.status,'')) in ('expirada','expirado','failed','falha','recusada','recusado') then 'Última cobrança falhou ou expirou'
        when upa.personal_id is not null and lower(coalesce(upa.status,'')) in ('pendente','pending') then 'Cobrança pendente'
        when aa.acesso_valido_ate <= now() + interval '7 days' then 'Acesso vence nos próximos 7 dias'
        when aa.proxima_cobranca_em is not null and aa.proxima_cobranca_em <= now() + interval '7 days' then 'Renovação prevista nos próximos 7 dias'
        else 'Revisar assinatura'
      end as motivo
    from assinatura_atual aa
    join pagantes p on p.personal_id = aa.personal_id
    left join public.perfis pf on pf.id = aa.personal_id
    left join auth.users au on au.id = aa.personal_id
    left join ultimo_pagamento_aberto upa on upa.personal_id = aa.personal_id
    where aa.cancelamento_solicitado_em is not null
       or upa.personal_id is not null
       or aa.acesso_valido_ate <= now() + interval '7 days'
       or (aa.proxima_cobranca_em is not null and aa.proxima_cobranca_em <= now() + interval '7 days')
  ),
  metricas as (
    select
      (select count(*)::int from pagantes) as pagantes_historicos,
      (select count(*)::int from pagantes p join assinatura_atual aa on aa.personal_id = p.personal_id) as pagantes_ativos,
      (select count(*)::int from cancelados_30d) as cancelamentos_30d,
      (select count(*)::int from coorte_30d) as elegiveis_retencao_30d,
      (select count(*)::int from coorte_30d c join assinatura_atual aa on aa.personal_id = c.personal_id) as retidos_30d,
      (select coalesce(avg(greatest(extract(epoch from (fr.fim_em - p.primeiro_pagamento)) / 2629800.0, 0)),0) from pagantes p join fim_relacionamento fr on fr.personal_id = p.personal_id) as tempo_medio_meses,
      (select coalesce(sum(p.receita_total_centavos),0)::bigint from pagantes p) as receita_total_centavos,
      (select coalesce(sum(aa.preco_contratado_centavos::numeric / greatest(aa.periodicidade_meses,1)),0) from assinatura_atual aa join pagantes p on p.personal_id = aa.personal_id) as mrr_pago_centavos,
      (select count(*)::int from risco) as clientes_em_risco,
      (select coalesce(sum(r.valor_centavos),0)::bigint from risco r) as receita_em_risco_centavos
  )
  select jsonb_build_object(
    'pagantes_historicos', m.pagantes_historicos,
    'pagantes_ativos', m.pagantes_ativos,
    'cancelamentos_30d', m.cancelamentos_30d,
    'churn_30d_pct', case when (m.pagantes_ativos + m.cancelamentos_30d) > 0 then round((m.cancelamentos_30d::numeric / (m.pagantes_ativos + m.cancelamentos_30d)) * 100, 1) else 0 end,
    'retencao_30d_pct', case when m.elegiveis_retencao_30d > 0 then round((m.retidos_30d::numeric / m.elegiveis_retencao_30d) * 100, 1) else null end,
    'elegiveis_retencao_30d', m.elegiveis_retencao_30d,
    'tempo_medio_meses', round(m.tempo_medio_meses::numeric, 1),
    'receita_media_cliente_centavos', case when m.pagantes_historicos > 0 then round(m.receita_total_centavos::numeric / m.pagantes_historicos)::bigint else 0 end,
    'arpu_mensal_centavos', case when m.pagantes_ativos > 0 then round(m.mrr_pago_centavos / m.pagantes_ativos)::bigint else 0 end,
    'ltv_estimado_centavos', case when m.pagantes_ativos > 0 and m.cancelamentos_30d > 0 then round((m.mrr_pago_centavos / m.pagantes_ativos) / (m.cancelamentos_30d::numeric / (m.pagantes_ativos + m.cancelamentos_30d)))::bigint else null end,
    'clientes_em_risco', m.clientes_em_risco,
    'receita_em_risco_centavos', m.receita_em_risco_centavos,
    'risco_itens', coalesce((select jsonb_agg(jsonb_build_object('user_id',r.user_id,'nome',r.nome,'email',r.email,'motivo',r.motivo,'data_referencia',r.data_referencia,'valor_centavos',r.valor_centavos) order by r.data_referencia asc nulls last,r.nome asc) from risco r), '[]'::jsonb)
  ) into v_result
  from metricas m;

  return v_result;
end;
$$;

revoke execute on function public.fsfit_admin_retencao_churn() from public;
revoke execute on function public.fsfit_admin_retencao_churn() from anon;
grant execute on function public.fsfit_admin_retencao_churn() to authenticated;
