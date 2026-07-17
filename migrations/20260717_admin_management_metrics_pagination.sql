-- Métricas gerenciais, paginação de usuários e filtros financeiros do painel administrativo.

create or replace function public.fsfit_admin_metricas_gestao()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receita_7d numeric;
  v_receita_30d numeric;
  v_receita_90d numeric;
  v_mrr numeric;
  v_ativas integer;
  v_novos_30d integer;
  v_cancelamentos_30d integer;
  v_conversao numeric;
  v_receita_media_cliente numeric;
  v_tendencia jsonb;
begin
  if not public.fsfit_is_admin(auth.uid()) then
    raise exception 'Acesso administrativo negado';
  end if;

  select coalesce(sum(cp.valor_centavos)::numeric / 100.0, 0) into v_receita_7d
  from public.cobrancas_pix cp
  where cp.status = 'paga' and cp.pago_em >= now() - interval '7 days';

  select coalesce(sum(cp.valor_centavos)::numeric / 100.0, 0) into v_receita_30d
  from public.cobrancas_pix cp
  where cp.status = 'paga' and cp.pago_em >= now() - interval '30 days';

  select coalesce(sum(cp.valor_centavos)::numeric / 100.0, 0) into v_receita_90d
  from public.cobrancas_pix cp
  where cp.status = 'paga' and cp.pago_em >= now() - interval '90 days';

  with ativas as (
    select distinct on (a.personal_id)
      a.personal_id,
      a.preco_contratado_centavos,
      greatest(coalesce(a.periodicidade_meses, 1), 1) as periodicidade_meses
    from public.assinaturas a
    where a.status = 'ativa' and a.acesso_valido_ate > now()
    order by a.personal_id, a.acesso_valido_ate desc, a.updated_at desc nulls last
  )
  select count(*)::int,
         coalesce(sum(preco_contratado_centavos::numeric / periodicidade_meses) / 100.0, 0)
    into v_ativas, v_mrr
  from ativas;

  with primeiro_pagamento as (
    select cp.personal_id, min(cp.pago_em) as primeiro_pago_em
    from public.cobrancas_pix cp
    where cp.status = 'paga' and cp.pago_em is not null
    group by cp.personal_id
  )
  select count(*)::int into v_novos_30d
  from primeiro_pagamento
  where primeiro_pago_em >= now() - interval '30 days';

  select count(distinct a.personal_id)::int into v_cancelamentos_30d
  from public.assinaturas a
  where a.cancelada_em >= now() - interval '30 days';

  with elegiveis as (
    select p.id
    from public.perfis p
    where p.trial_inicio is not null
      and not exists (select 1 from public.platform_admins pa where pa.user_id = p.id)
  ), convertidos as (
    select distinct e.id
    from elegiveis e
    join public.cobrancas_pix cp on cp.personal_id = e.id and cp.status = 'paga'
  )
  select case when (select count(*) from elegiveis) = 0 then 0
              else round(((select count(*) from convertidos)::numeric / (select count(*) from elegiveis)::numeric) * 100, 2)
         end
    into v_conversao;

  select case when count(distinct cp.personal_id) = 0 then 0
              else (sum(cp.valor_centavos)::numeric / 100.0) / count(distinct cp.personal_id)::numeric
         end
    into v_receita_media_cliente
  from public.cobrancas_pix cp
  where cp.status = 'paga';

  with meses as (
    select generate_series(
      date_trunc('month', now()) - interval '5 months',
      date_trunc('month', now()),
      interval '1 month'
    ) as mes
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'mes', to_char(m.mes, 'YYYY-MM'),
    'valor', coalesce((
      select sum(cp.valor_centavos)::numeric / 100.0
      from public.cobrancas_pix cp
      where cp.status = 'paga'
        and cp.pago_em >= m.mes
        and cp.pago_em < m.mes + interval '1 month'
    ), 0)
  ) order by m.mes), '[]'::jsonb)
  into v_tendencia
  from meses m;

  return jsonb_build_object(
    'receita_7d', v_receita_7d,
    'receita_30d', v_receita_30d,
    'receita_90d', v_receita_90d,
    'mrr', v_mrr,
    'assinaturas_ativas', v_ativas,
    'novos_assinantes_30d', v_novos_30d,
    'cancelamentos_30d', v_cancelamentos_30d,
    'conversao_trial_premium', v_conversao,
    'receita_media_cliente', coalesce(v_receita_media_cliente, 0),
    'tendencia_mensal', v_tendencia
  );
end;
$$;

revoke all on function public.fsfit_admin_metricas_gestao() from public;
revoke all on function public.fsfit_admin_metricas_gestao() from anon;
grant execute on function public.fsfit_admin_metricas_gestao() to authenticated;

create or replace function public.fsfit_admin_listar_usuarios_paginado(
  p_busca text default null,
  p_plano text default null,
  p_pagina integer default 1,
  p_limite integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pagina integer := greatest(coalesce(p_pagina, 1), 1);
  v_limite integer := least(greatest(coalesce(p_limite, 25), 10), 100);
  v_offset integer;
  v_total integer;
  v_itens jsonb;
  v_busca text := lower(trim(coalesce(p_busca, '')));
  v_plano text := lower(trim(coalesce(p_plano, '')));
begin
  if not public.fsfit_is_admin(auth.uid()) then
    raise exception 'Acesso administrativo negado';
  end if;

  v_offset := (v_pagina - 1) * v_limite;

  with filtrados as (
    select *
    from public.fsfit_admin_listar_usuarios_detalhes() u
    where (v_busca = '' or lower(concat_ws(' ', u.nome, u.email, u.nome_empresa, u.telefone)) like '%' || v_busca || '%')
      and (v_plano = '' or lower(u.plano) = v_plano)
  )
  select count(*)::int into v_total from filtrados;

  with filtrados as (
    select *
    from public.fsfit_admin_listar_usuarios_detalhes() u
    where (v_busca = '' or lower(concat_ws(' ', u.nome, u.email, u.nome_empresa, u.telefone)) like '%' || v_busca || '%')
      and (v_plano = '' or lower(u.plano) = v_plano)
  ), pagina as (
    select * from filtrados
    order by created_at desc nulls last, nome
    limit v_limite offset v_offset
  )
  select coalesce(jsonb_agg(to_jsonb(pagina)), '[]'::jsonb) into v_itens from pagina;

  return jsonb_build_object(
    'total', v_total,
    'pagina', v_pagina,
    'limite', v_limite,
    'paginas', greatest(ceil(v_total::numeric / v_limite)::int, 1),
    'itens', v_itens
  );
end;
$$;

revoke all on function public.fsfit_admin_listar_usuarios_paginado(text, text, integer, integer) from public;
revoke all on function public.fsfit_admin_listar_usuarios_paginado(text, text, integer, integer) from anon;
grant execute on function public.fsfit_admin_listar_usuarios_paginado(text, text, integer, integer) to authenticated;

create or replace function public.fsfit_admin_listar_pagamentos_paginado(
  p_busca text default null,
  p_status text default null,
  p_data_inicio date default null,
  p_data_fim date default null,
  p_pagina integer default 1,
  p_limite integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pagina integer := greatest(coalesce(p_pagina, 1), 1);
  v_limite integer := least(greatest(coalesce(p_limite, 25), 10), 100);
  v_offset integer;
  v_total integer;
  v_itens jsonb;
  v_busca text := lower(trim(coalesce(p_busca, '')));
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if not public.fsfit_is_admin(auth.uid()) then
    raise exception 'Acesso administrativo negado';
  end if;

  v_offset := (v_pagina - 1) * v_limite;

  with base as (
    select
      cp.id::text as id,
      cp.personal_id::text as user_id,
      p.nome::text as nome,
      u.email::text as email,
      case when cp.status = 'paga' then 'premium' else coalesce(p.plano::text, 'free') end as plano,
      (cp.valor_centavos::numeric / 100.0)::numeric as valor,
      case cp.status when 'paga' then 'pago' when 'pendente' then 'pendente' when 'cancelada' then 'cancelado' when 'devolvida' then 'estornado' when 'expirada' then 'expirado' else cp.status end::text as status,
      cp.pago_em as paid_at,
      cp.created_at,
      cp.vence_em,
      cp.txid::text as txid,
      cp.e2e_id::text as e2e_id
    from public.cobrancas_pix cp
    left join public.perfis p on p.id = cp.personal_id
    left join auth.users u on u.id = cp.personal_id
  ), filtrados as (
    select * from base b
    where (v_busca = '' or lower(concat_ws(' ', b.nome, b.email, b.txid, b.e2e_id)) like '%' || v_busca || '%')
      and (v_status = '' or lower(b.status) = v_status)
      and (p_data_inicio is null or coalesce(b.paid_at, b.created_at)::date >= p_data_inicio)
      and (p_data_fim is null or coalesce(b.paid_at, b.created_at)::date <= p_data_fim)
  )
  select count(*)::int into v_total from filtrados;

  with base as (
    select
      cp.id::text as id,
      cp.personal_id::text as user_id,
      p.nome::text as nome,
      u.email::text as email,
      case when cp.status = 'paga' then 'premium' else coalesce(p.plano::text, 'free') end as plano,
      (cp.valor_centavos::numeric / 100.0)::numeric as valor,
      case cp.status when 'paga' then 'pago' when 'pendente' then 'pendente' when 'cancelada' then 'cancelado' when 'devolvida' then 'estornado' when 'expirada' then 'expirado' else cp.status end::text as status,
      cp.pago_em as paid_at,
      cp.created_at,
      cp.vence_em,
      cp.txid::text as txid,
      cp.e2e_id::text as e2e_id
    from public.cobrancas_pix cp
    left join public.perfis p on p.id = cp.personal_id
    left join auth.users u on u.id = cp.personal_id
  ), filtrados as (
    select * from base b
    where (v_busca = '' or lower(concat_ws(' ', b.nome, b.email, b.txid, b.e2e_id)) like '%' || v_busca || '%')
      and (v_status = '' or lower(b.status) = v_status)
      and (p_data_inicio is null or coalesce(b.paid_at, b.created_at)::date >= p_data_inicio)
      and (p_data_fim is null or coalesce(b.paid_at, b.created_at)::date <= p_data_fim)
  ), pagina as (
    select * from filtrados
    order by coalesce(paid_at, created_at) desc
    limit v_limite offset v_offset
  )
  select coalesce(jsonb_agg(to_jsonb(pagina)), '[]'::jsonb) into v_itens from pagina;

  return jsonb_build_object(
    'total', v_total,
    'pagina', v_pagina,
    'limite', v_limite,
    'paginas', greatest(ceil(v_total::numeric / v_limite)::int, 1),
    'itens', v_itens
  );
end;
$$;

revoke all on function public.fsfit_admin_listar_pagamentos_paginado(text, text, date, date, integer, integer) from public;
revoke all on function public.fsfit_admin_listar_pagamentos_paginado(text, text, date, date, integer, integer) from anon;
grant execute on function public.fsfit_admin_listar_pagamentos_paginado(text, text, date, date, integer, integer) to authenticated;

create or replace function public.fsfit_admin_exportar_pagamentos(
  p_busca text default null,
  p_status text default null,
  p_data_inicio date default null,
  p_data_fim date default null
)
returns table(data timestamptz, nome text, email text, plano text, valor numeric, status text, txid text, e2e_id text, vence_em timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_busca text := lower(trim(coalesce(p_busca, '')));
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if not public.fsfit_is_admin(auth.uid()) then
    raise exception 'Acesso administrativo negado';
  end if;

  return query
  with base as (
    select
      coalesce(cp.pago_em, cp.created_at) as data,
      p.nome::text as nome,
      u.email::text as email,
      case when cp.status = 'paga' then 'premium' else coalesce(p.plano::text, 'free') end as plano,
      (cp.valor_centavos::numeric / 100.0)::numeric as valor,
      case cp.status when 'paga' then 'pago' when 'pendente' then 'pendente' when 'cancelada' then 'cancelado' when 'devolvida' then 'estornado' when 'expirada' then 'expirado' else cp.status end::text as status,
      cp.txid::text as txid,
      cp.e2e_id::text as e2e_id,
      cp.vence_em
    from public.cobrancas_pix cp
    left join public.perfis p on p.id = cp.personal_id
    left join auth.users u on u.id = cp.personal_id
  )
  select b.data, b.nome, b.email, b.plano, b.valor, b.status, b.txid, b.e2e_id, b.vence_em
  from base b
  where (v_busca = '' or lower(concat_ws(' ', b.nome, b.email, b.txid, b.e2e_id)) like '%' || v_busca || '%')
    and (v_status = '' or lower(b.status) = v_status)
    and (p_data_inicio is null or b.data::date >= p_data_inicio)
    and (p_data_fim is null or b.data::date <= p_data_fim)
  order by b.data desc;
end;
$$;

revoke all on function public.fsfit_admin_exportar_pagamentos(text, text, date, date) from public;
revoke all on function public.fsfit_admin_exportar_pagamentos(text, text, date, date) from anon;
grant execute on function public.fsfit_admin_exportar_pagamentos(text, text, date, date) to authenticated;

notify pgrst, 'reload schema';
