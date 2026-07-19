create or replace function public.fsfit_admin_segmentacao_clientes()
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
    select cp.personal_id,
      min(cp.pago_em) filter (where lower(coalesce(cp.status,'')) in ('paga','pago','paid','concluida','concluido')) as primeiro_pagamento,
      max(cp.pago_em) filter (where lower(coalesce(cp.status,'')) in ('paga','pago','paid','concluida','concluido')) as ultimo_pagamento,
      coalesce(sum(cp.valor_centavos) filter (where lower(coalesce(cp.status,'')) in ('paga','pago','paid','concluida','concluido')),0)::bigint as total_pago_centavos
    from public.cobrancas_pix cp
    group by cp.personal_id
  ),
  assinatura_ativa as (
    select distinct on (a.personal_id)
      a.personal_id, a.id as assinatura_id, a.status, a.preco_contratado_centavos,
      greatest(coalesce(a.periodicidade_meses,1),1) as periodicidade_meses,
      a.acesso_valido_ate, a.proxima_cobranca_em, a.cancelamento_solicitado_em,
      a.cancelada_em, a.ultima_cobranca_status, a.meio_pagamento
    from public.assinaturas a
    where a.status = 'ativa' and a.acesso_valido_ate > now()
    order by a.personal_id, a.acesso_valido_ate desc nulls last, a.updated_at desc
  ),
  ultima_assinatura as (
    select distinct on (a.personal_id)
      a.personal_id, a.status, a.acesso_valido_ate, a.cancelada_em,
      a.cancelamento_solicitado_em, a.updated_at
    from public.assinaturas a
    order by a.personal_id, coalesce(a.cancelada_em,a.acesso_valido_ate,a.updated_at) desc nulls last
  ),
  pix_aberto as (
    select distinct on (cp.personal_id)
      cp.personal_id, cp.status, cp.vence_em, cp.valor_centavos
    from public.cobrancas_pix cp
    where lower(coalesce(cp.status,'')) in ('pendente','pending','expirada','expirado')
    order by cp.personal_id, cp.vence_em asc nulls last, cp.created_at desc
  ),
  base as (
    select p.id as user_id, p.nome, u.email, p.telefone, p.plano, p.ativo, p.created_at,
      p.trial_inicio, p.trial_fim, pg.primeiro_pagamento, pg.ultimo_pagamento,
      coalesce(pg.total_pago_centavos,0) as total_pago_centavos,
      aa.assinatura_id, aa.acesso_valido_ate, aa.proxima_cobranca_em,
      aa.cancelamento_solicitado_em, aa.ultima_cobranca_status, aa.meio_pagamento,
      case when aa.assinatura_id is not null then round(aa.preco_contratado_centavos::numeric / aa.periodicidade_meses)::bigint else 0::bigint end as valor_mensal_centavos,
      ua.status as ultimo_status_assinatura, ua.acesso_valido_ate as ultimo_acesso_valido_ate,
      ua.cancelada_em, pa.status as pix_status, pa.vence_em as pix_vence_em,
      pa.valor_centavos as pix_valor_centavos
    from public.perfis p
    join auth.users u on u.id = p.id
    left join pagamentos pg on pg.personal_id = p.id
    left join assinatura_ativa aa on aa.personal_id = p.id
    left join ultima_assinatura ua on ua.personal_id = p.id
    left join pix_aberto pa on pa.personal_id = p.id
    where coalesce(p.tipo,'personal') <> 'admin'
      and not exists (select 1 from public.platform_admins adm where adm.user_id = p.id)
  ),
  classificados as (
    select b.*,
      case
        when b.primeiro_pagamento is not null and b.assinatura_id is not null and (
          b.cancelamento_solicitado_em is not null or b.pix_status is not null
          or b.acesso_valido_ate <= now() + interval '7 days'
          or (b.proxima_cobranca_em is not null and b.proxima_cobranca_em <= now() + interval '7 days')
        ) then 'em_risco'
        when b.primeiro_pagamento is not null and b.assinatura_id is not null and b.primeiro_pagamento >= now() - interval '30 days' then 'novos'
        when b.primeiro_pagamento is not null and b.assinatura_id is not null then 'engajados'
        when b.primeiro_pagamento is not null and b.assinatura_id is null then 'churnados'
        when b.primeiro_pagamento is null and b.trial_fim is not null and b.trial_fim < now() and b.trial_fim >= now() - interval '90 days' then 'recuperaveis'
        else null
      end as segmento,
      case
        when b.cancelamento_solicitado_em is not null then 'Cancelamento solicitado'
        when b.pix_status is not null and b.pix_vence_em is not null and b.pix_vence_em < now() then 'Cobrança vencida'
        when b.pix_status is not null then 'Cobrança pendente'
        when b.acesso_valido_ate is not null and b.acesso_valido_ate <= now() + interval '7 days' then 'Acesso vence em até 7 dias'
        when b.proxima_cobranca_em is not null and b.proxima_cobranca_em <= now() + interval '7 days' then 'Renovação próxima'
        when b.primeiro_pagamento is not null and b.assinatura_id is null then 'Cliente pagante sem assinatura ativa'
        when b.primeiro_pagamento is null and b.trial_fim is not null and b.trial_fim < now() then 'Trial encerrado sem conversão'
        when b.primeiro_pagamento is not null and b.primeiro_pagamento >= now() - interval '30 days' then 'Primeiro pagamento nos últimos 30 dias'
        else 'Assinante ativo sem sinais de risco'
      end as motivo,
      case
        when b.cancelamento_solicitado_em is not null then b.cancelamento_solicitado_em
        when b.pix_status is not null then coalesce(b.pix_vence_em,b.proxima_cobranca_em)
        when b.assinatura_id is not null then coalesce(b.acesso_valido_ate,b.proxima_cobranca_em,b.primeiro_pagamento)
        when b.primeiro_pagamento is not null then coalesce(b.cancelada_em,b.ultimo_acesso_valido_ate,b.ultimo_pagamento)
        else b.trial_fim
      end as data_referencia
    from base b
  ),
  itens as (select * from classificados where segmento is not null)
  select jsonb_build_object(
    'resumo', jsonb_build_object(
      'novos', (select count(*) from itens where segmento = 'novos'),
      'engajados', (select count(*) from itens where segmento = 'engajados'),
      'em_risco', (select count(*) from itens where segmento = 'em_risco'),
      'recuperaveis', (select count(*) from itens where segmento = 'recuperaveis'),
      'churnados', (select count(*) from itens where segmento = 'churnados'),
      'receita_em_risco_centavos', coalesce((select sum(valor_mensal_centavos) from itens where segmento = 'em_risco'),0)
    ),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', user_id, 'nome', nome, 'email', email, 'telefone', telefone,
        'plano', plano, 'segmento', segmento, 'motivo', motivo,
        'data_referencia', data_referencia, 'primeiro_pagamento', primeiro_pagamento,
        'ultimo_pagamento', ultimo_pagamento, 'total_pago_centavos', total_pago_centavos,
        'valor_mensal_centavos', valor_mensal_centavos, 'acesso_valido_ate', acesso_valido_ate,
        'proxima_cobranca_em', proxima_cobranca_em, 'trial_fim', trial_fim
      ) order by case segmento when 'em_risco' then 1 when 'novos' then 2 when 'engajados' then 3 when 'recuperaveis' then 4 when 'churnados' then 5 else 9 end,
      data_referencia desc nulls last, nome asc) from itens
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.fsfit_admin_segmentacao_clientes() from public;
revoke execute on function public.fsfit_admin_segmentacao_clientes() from anon;
grant execute on function public.fsfit_admin_segmentacao_clientes() to authenticated;
