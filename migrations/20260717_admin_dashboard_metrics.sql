-- Fonte única de métricas do painel administrativo FS Fit.
-- Os cards financeiros devem consumir fsfit_admin_resumo; a listagem de pagamentos
-- serve apenas para a tabela e exportação.

create or replace function public.fsfit_admin_resumo()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contas integer;
  v_assinantes integer;
  v_trial integer;
  v_inativas integer;
  v_aprovados integer;
  v_pendentes integer;
  v_cancelados integer;
  v_receita_mes numeric;
  v_receita_total numeric;
  v_ticket numeric;
begin
  if not public.fsfit_is_admin(auth.uid()) then
    raise exception 'Acesso administrativo negado';
  end if;

  select count(*)::int into v_contas
  from public.perfis p
  where not exists (select 1 from public.platform_admins pa where pa.user_id = p.id);

  select count(*)::int into v_assinantes
  from public.perfis p
  where p.ativo = true
    and not exists (select 1 from public.platform_admins pa where pa.user_id = p.id)
    and exists (
      select 1 from public.assinaturas a
      where a.personal_id = p.id
        and a.status = 'ativa'
        and a.acesso_valido_ate > now()
    );

  select count(*)::int into v_trial
  from public.perfis p
  where p.ativo = true
    and not exists (select 1 from public.platform_admins pa where pa.user_id = p.id)
    and p.trial_fim > now()
    and not exists (
      select 1 from public.assinaturas a
      where a.personal_id = p.id
        and a.status = 'ativa'
        and a.acesso_valido_ate > now()
    );

  select count(*)::int into v_inativas
  from public.perfis p
  where p.ativo = false
    and not exists (select 1 from public.platform_admins pa where pa.user_id = p.id);

  select count(*)::int,
         coalesce(sum(cp.valor_centavos)::numeric / 100.0, 0),
         coalesce(avg(cp.valor_centavos)::numeric / 100.0, 0)
    into v_aprovados, v_receita_total, v_ticket
  from public.cobrancas_pix cp
  where cp.status = 'paga';

  select count(*)::int into v_pendentes
  from public.cobrancas_pix cp
  where cp.status = 'pendente';

  select count(*)::int into v_cancelados
  from public.cobrancas_pix cp
  where cp.status in ('cancelada', 'devolvida');

  select coalesce(sum(cp.valor_centavos)::numeric / 100.0, 0)
    into v_receita_mes
  from public.cobrancas_pix cp
  where cp.status = 'paga'
    and cp.pago_em >= date_trunc('month', now())
    and cp.pago_em < date_trunc('month', now()) + interval '1 month';

  return jsonb_build_object(
    'contas', v_contas,
    'assinantes', v_assinantes,
    'trial', v_trial,
    'inativas', v_inativas,
    'pagamentos_aprovados', v_aprovados,
    'pendentes', v_pendentes,
    'cancelados_estornados', v_cancelados,
    'faturamento_mes', v_receita_mes,
    'faturamento_total', v_receita_total,
    'ticket_medio', v_ticket
  );
end;
$$;

revoke all on function public.fsfit_admin_resumo() from public;
revoke all on function public.fsfit_admin_resumo() from anon;
grant execute on function public.fsfit_admin_resumo() to authenticated;

create or replace function public.fsfit_admin_listar_pagamentos()
returns table(
  id text,
  user_id text,
  nome text,
  email text,
  plano text,
  valor numeric,
  amount numeric,
  status text,
  paid_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.fsfit_is_admin(auth.uid()) then
    raise exception 'Acesso administrativo negado';
  end if;

  return query
  select
    cp.id::text,
    cp.personal_id::text,
    p.nome::text,
    u.email::text,
    case when cp.status = 'paga' then 'premium' else coalesce(p.plano::text, 'free') end,
    (cp.valor_centavos::numeric / 100.0)::numeric,
    (cp.valor_centavos::numeric / 100.0)::numeric,
    case cp.status
      when 'paga' then 'pago'
      when 'pendente' then 'pendente'
      when 'cancelada' then 'cancelado'
      when 'devolvida' then 'estornado'
      when 'expirada' then 'expirado'
      else cp.status
    end::text,
    cp.pago_em,
    cp.created_at
  from public.cobrancas_pix cp
  left join public.perfis p on p.id = cp.personal_id
  left join auth.users u on u.id = cp.personal_id
  order by coalesce(cp.pago_em, cp.created_at) desc;
end;
$$;

revoke all on function public.fsfit_admin_listar_pagamentos() from public;
revoke all on function public.fsfit_admin_listar_pagamentos() from anon;
grant execute on function public.fsfit_admin_listar_pagamentos() to authenticated;

notify pgrst, 'reload schema';
