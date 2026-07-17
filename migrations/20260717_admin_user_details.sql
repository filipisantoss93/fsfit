-- Dados completos de usuários para o modal administrativo e auditoria de recuperação de senha.

create or replace function public.fsfit_admin_listar_usuarios_detalhes()
returns table(
  id uuid,
  nome text,
  email text,
  nome_empresa text,
  telefone text,
  avatar_url text,
  plano text,
  ativo boolean,
  trial_inicio timestamptz,
  trial_fim timestamptz,
  vencimento_plano timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  assinatura_id uuid,
  assinatura_status text,
  assinatura_plano_nome text,
  assinatura_plano_codigo text,
  periodicidade_meses integer,
  acesso_valido_ate timestamptz,
  proxima_cobranca_em timestamptz,
  preco_contratado_centavos integer,
  meio_pagamento text,
  renovacao_automatica boolean,
  ultima_cobranca_status text,
  ultimo_pagamento_em timestamptz,
  ultimo_pagamento_valor_centavos integer,
  ultimo_pagamento_status text,
  ultimo_pagamento_txid text
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
    p.id,
    p.nome::text,
    u.email::text,
    p.nome_empresa::text,
    p.telefone::text,
    p.avatar_url::text,
    case
      when a.status = 'ativa' and a.acesso_valido_ate > now() then 'premium'
      when p.trial_fim > now() then 'trial'
      else 'free'
    end::text,
    p.ativo,
    p.trial_inicio,
    p.trial_fim,
    case
      when a.status = 'ativa' and a.acesso_valido_ate > now() then a.acesso_valido_ate
      when p.trial_fim > now() then p.trial_fim
      else null
    end,
    u.created_at,
    p.updated_at,
    a.id,
    a.status::text,
    a.plano_nome::text,
    a.plano_codigo::text,
    a.periodicidade_meses,
    a.acesso_valido_ate,
    a.proxima_cobranca_em,
    a.preco_contratado_centavos,
    a.meio_pagamento::text,
    a.renovacao_automatica,
    a.ultima_cobranca_status::text,
    cp.pago_em,
    cp.valor_centavos,
    cp.status::text,
    cp.txid::text
  from public.perfis p
  left join auth.users u on u.id = p.id
  left join lateral (
    select
      s.id,
      s.status,
      s.periodicidade_meses,
      s.acesso_valido_ate,
      s.proxima_cobranca_em,
      s.preco_contratado_centavos,
      s.meio_pagamento,
      s.renovacao_automatica,
      s.ultima_cobranca_status,
      pa.nome as plano_nome,
      pa.codigo as plano_codigo
    from public.assinaturas s
    left join public.planos_assinatura pa on pa.id = s.plano_id
    where s.personal_id = p.id
    order by
      case when s.status = 'ativa' and s.acesso_valido_ate > now() then 0 else 1 end,
      s.acesso_valido_ate desc nulls last,
      s.updated_at desc nulls last,
      s.created_at desc
    limit 1
  ) a on true
  left join lateral (
    select c.pago_em, c.valor_centavos, c.status, c.txid
    from public.cobrancas_pix c
    where c.personal_id = p.id
      and c.status = 'paga'
    order by c.pago_em desc nulls last, c.created_at desc
    limit 1
  ) cp on true
  where not exists (select 1 from public.platform_admins pa where pa.user_id = p.id)
  order by u.created_at desc nulls last, p.nome;
end;
$$;

revoke all on function public.fsfit_admin_listar_usuarios_detalhes() from public;
revoke all on function public.fsfit_admin_listar_usuarios_detalhes() from anon;
grant execute on function public.fsfit_admin_listar_usuarios_detalhes() to authenticated;

create or replace function public.fsfit_admin_registrar_recuperacao_senha(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.fsfit_is_admin(auth.uid()) then
    raise exception 'Acesso administrativo negado';
  end if;

  if not exists (select 1 from public.perfis p where p.id = p_user_id) then
    raise exception 'Usuário não encontrado';
  end if;

  insert into public.admin_auditoria(admin_id, user_id, acao, valor_novo)
  values(
    auth.uid(),
    p_user_id,
    'recuperacao_senha',
    jsonb_build_object('enviado_em', now())
  );
end;
$$;

revoke all on function public.fsfit_admin_registrar_recuperacao_senha(uuid) from public;
revoke all on function public.fsfit_admin_registrar_recuperacao_senha(uuid) from anon;
grant execute on function public.fsfit_admin_registrar_recuperacao_senha(uuid) to authenticated;

notify pgrst, 'reload schema';
