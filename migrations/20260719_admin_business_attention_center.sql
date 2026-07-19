create or replace function public.fsfit_admin_alertas_gestao()
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
    select * from public.fsfit_admin_listar_usuarios_detalhes()
  ),
  pix_abertos as (
    select distinct on (cp.personal_id)
      cp.id,
      cp.personal_id,
      cp.status,
      cp.valor_centavos,
      cp.vence_em,
      cp.created_at,
      cp.txid
    from public.cobrancas_pix cp
    where lower(coalesce(cp.status, '')) in ('pendente', 'pending', 'expirada', 'expirado')
    order by cp.personal_id, cp.vence_em asc nulls last, cp.created_at desc
  ),
  alertas as (
    select 'vencendo_7d'::text as tipo, 2::int as prioridade, u.id as user_id, u.nome, u.email, 'premium'::text as plano,
      u.acesso_valido_ate as data_referencia, 'Acesso Premium vence nos próximos 7 dias.'::text as detalhe,
      null::integer as valor_centavos, null::text as status_referencia
    from usuarios u
    where u.assinatura_status = 'ativa'
      and u.acesso_valido_ate >= now()
      and u.acesso_valido_ate < now() + interval '7 days'

    union all

    select 'vencido'::text, 1, u.id, u.nome, u.email, 'premium'::text, u.acesso_valido_ate,
      'Acesso Premium vencido; revisar renovação ou bloqueio.'::text, null::integer, u.assinatura_status
    from usuarios u
    where u.assinatura_status = 'ativa'
      and u.acesso_valido_ate is not null
      and u.acesso_valido_ate < now()

    union all

    select case when p.vence_em is not null and p.vence_em < now() then 'pix_vencido' else 'pix_pendente' end,
      case when p.vence_em is not null and p.vence_em < now() then 1 else 2 end,
      u.id, u.nome, u.email, u.plano, coalesce(p.vence_em, p.created_at),
      case when p.vence_em is not null and p.vence_em < now()
        then 'Cobrança PIX vencida e ainda não confirmada.'
        else 'Cobrança PIX aguardando confirmação.'
      end,
      p.valor_centavos, p.status
    from pix_abertos p
    join usuarios u on u.id = p.personal_id

    union all

    select 'trial_terminando'::text, 2, u.id, u.nome, u.email, 'trial'::text, u.trial_fim,
      'Trial termina nos próximos 3 dias; oportunidade de conversão.'::text, null::integer, null::text
    from usuarios u
    where u.plano = 'trial'
      and u.trial_fim >= now()
      and u.trial_fim < now() + interval '3 days'

    union all

    select 'conta_inativa'::text, 3, u.id, u.nome, u.email, u.plano, u.updated_at,
      'Conta desativada; revisar se o bloqueio continua necessário.'::text, null::integer, null::text
    from usuarios u
    where u.ativo = false

    union all

    select 'trial_sem_conversao'::text, 3, u.id, u.nome, u.email, 'free'::text, u.trial_fim,
      'Trial encerrado sem pagamento confirmado; possível recuperação comercial.'::text, null::integer, null::text
    from usuarios u
    where u.trial_inicio is not null
      and u.trial_fim is not null
      and u.trial_fim < now()
      and not exists (
        select 1 from public.cobrancas_pix cp
        where cp.personal_id = u.id
          and lower(coalesce(cp.status, '')) in ('paga', 'pago', 'paid', 'concluida', 'concluido')
      )
      and not exists (
        select 1 from public.assinaturas a
        where a.personal_id = u.id
          and a.status = 'ativa'
          and a.acesso_valido_ate > now()
      )
  )
  select jsonb_build_object(
    'resumo', jsonb_build_object(
      'total', (select count(*) from alertas),
      'vencendo_7d', (select count(*) from alertas where tipo = 'vencendo_7d'),
      'vencidos', (select count(*) from alertas where tipo = 'vencido'),
      'pix_pendentes', (select count(*) from alertas where tipo in ('pix_pendente', 'pix_vencido')),
      'trials_3d', (select count(*) from alertas where tipo = 'trial_terminando'),
      'inativas', (select count(*) from alertas where tipo = 'conta_inativa'),
      'trial_sem_conversao', (select count(*) from alertas where tipo = 'trial_sem_conversao')
    ),
    'itens', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'tipo', tipo,
          'prioridade', prioridade,
          'user_id', user_id,
          'nome', nome,
          'email', email,
          'plano', plano,
          'data_referencia', data_referencia,
          'detalhe', detalhe,
          'valor_centavos', valor_centavos,
          'status_referencia', status_referencia
        )
        order by prioridade asc, data_referencia asc nulls last, nome asc
      ) from alertas
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.fsfit_admin_alertas_gestao() from public;
revoke execute on function public.fsfit_admin_alertas_gestao() from anon;
grant execute on function public.fsfit_admin_alertas_gestao() to authenticated;
