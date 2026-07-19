create or replace function public.fsfit_admin_previsao_financeira()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month_start timestamptz := (date_trunc('month', timezone('America/Sao_Paulo', now())) at time zone 'America/Sao_Paulo');
  v_month_end timestamptz := ((date_trunc('month', timezone('America/Sao_Paulo', now())) + interval '1 month') at time zone 'America/Sao_Paulo');
  v_now timestamptz := now();
  v_received bigint := 0;
  v_pending_month bigint := 0;
  v_overdue bigint := 0;
  v_overdue_customers integer := 0;
  v_expected_renewals_month bigint := 0;
  v_expected_renewals_month_count integer := 0;
  v_renewals_30d bigint := 0;
  v_renewals_30d_count integer := 0;
  v_forecast bigint := 0;
  v_delinquency_rate numeric := 0;
begin
  if (select auth.uid()) is null or not public.fsfit_is_admin((select auth.uid())) then
    raise exception 'Acesso administrativo negado';
  end if;

  select coalesce(sum(cp.valor_centavos), 0)::bigint
    into v_received
  from public.cobrancas_pix cp
  where lower(coalesce(cp.status, '')) in ('paga','pago','paid','concluida','concluido')
    and cp.pago_em >= v_month_start
    and cp.pago_em < v_month_end;

  select coalesce(sum(cp.valor_centavos), 0)::bigint
    into v_pending_month
  from public.cobrancas_pix cp
  where lower(coalesce(cp.status, '')) in ('pendente','pending')
    and cp.vence_em >= v_now
    and cp.vence_em < v_month_end;

  select coalesce(sum(cp.valor_centavos), 0)::bigint,
         count(distinct cp.personal_id)::integer
    into v_overdue, v_overdue_customers
  from public.cobrancas_pix cp
  where lower(coalesce(cp.status, '')) in ('pendente','pending','expirada','expirado')
    and cp.vence_em is not null
    and cp.vence_em < v_now;

  with renewals as (
    select distinct on (a.personal_id)
      a.personal_id,
      a.preco_contratado_centavos,
      a.proxima_cobranca_em
    from public.assinaturas a
    where a.status = 'ativa'
      and a.proxima_cobranca_em >= v_now
      and a.proxima_cobranca_em < v_month_end
      and not exists (
        select 1
        from public.cobrancas_pix cp
        where cp.personal_id = a.personal_id
          and cp.vence_em is not null
          and abs(extract(epoch from (cp.vence_em - a.proxima_cobranca_em))) <= 259200
          and lower(coalesce(cp.status, '')) in ('pendente','pending','paga','pago','paid','concluida','concluido')
      )
    order by a.personal_id, a.proxima_cobranca_em asc
  )
  select coalesce(sum(preco_contratado_centavos), 0)::bigint, count(*)::integer
    into v_expected_renewals_month, v_expected_renewals_month_count
  from renewals;

  with renewals as (
    select distinct on (a.personal_id)
      a.personal_id,
      a.preco_contratado_centavos,
      a.proxima_cobranca_em
    from public.assinaturas a
    where a.status = 'ativa'
      and a.proxima_cobranca_em >= v_now
      and a.proxima_cobranca_em < v_now + interval '30 days'
    order by a.personal_id, a.proxima_cobranca_em asc
  )
  select coalesce(sum(preco_contratado_centavos), 0)::bigint, count(*)::integer
    into v_renewals_30d, v_renewals_30d_count
  from renewals;

  v_forecast := v_received + v_pending_month + v_expected_renewals_month;
  if (v_received + v_overdue) > 0 then
    v_delinquency_rate := round((v_overdue::numeric / (v_received + v_overdue)::numeric) * 100, 1);
  end if;

  return jsonb_build_object(
    'periodo_inicio', v_month_start,
    'periodo_fim', v_month_end,
    'recebido_mes_centavos', v_received,
    'a_receber_mes_centavos', v_pending_month + v_expected_renewals_month,
    'cobrancas_pendentes_mes_centavos', v_pending_month,
    'renovacoes_previstas_mes_centavos', v_expected_renewals_month,
    'renovacoes_previstas_mes', v_expected_renewals_month_count,
    'receita_prevista_mes_centavos', v_forecast,
    'inadimplencia_centavos', v_overdue,
    'clientes_inadimplentes', v_overdue_customers,
    'taxa_inadimplencia_pct', v_delinquency_rate,
    'renovacoes_30d_centavos', v_renewals_30d,
    'renovacoes_30d', v_renewals_30d_count
  );
end;
$$;

revoke execute on function public.fsfit_admin_previsao_financeira() from public;
revoke execute on function public.fsfit_admin_previsao_financeira() from anon;
grant execute on function public.fsfit_admin_previsao_financeira() to authenticated;
