-- Operações administrativas de plano e status de conta.
-- Impede alterações em contas administradoras e mantém auditoria das ações.

create or replace function public.fsfit_admin_atualizar_plano(p_user_id uuid, p_plano text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anterior text;
  v_plano text := lower(trim(coalesce(p_plano, '')));
  v_plano_pago public.planos_assinatura%rowtype;
  v_assinatura public.assinaturas%rowtype;
  v_validade timestamptz;
begin
  if not public.fsfit_is_admin(auth.uid()) then
    raise exception 'Acesso administrativo negado';
  end if;

  if exists (select 1 from public.platform_admins pa where pa.user_id = p_user_id) then
    raise exception 'Não é permitido alterar o plano de uma conta administradora';
  end if;

  if v_plano not in ('trial', 'free', 'premium') then
    raise exception 'Plano inválido. Use trial, free ou premium';
  end if;

  select p.plano into v_anterior
  from public.perfis p
  where p.id = p_user_id
  for update;

  if not found then
    raise exception 'Usuário não encontrado';
  end if;

  if v_plano = 'premium' then
    select pa.* into v_plano_pago
    from public.planos_assinatura pa
    where pa.ativo = true and pa.meio_pagamento = 'pix'
    order by case when pa.intervalo_meses = 1 then 0 else 1 end, pa.intervalo_meses
    limit 1;

    if not found then
      raise exception 'Nenhum plano de assinatura ativo encontrado';
    end if;

    select a.* into v_assinatura
    from public.assinaturas a
    where a.personal_id = p_user_id
    order by
      case when a.status = 'ativa' and a.acesso_valido_ate > now() then 0 else 1 end,
      a.updated_at desc nulls last,
      a.created_at desc
    limit 1
    for update;

    if found and v_assinatura.status = 'ativa' and v_assinatura.acesso_valido_ate > now() then
      v_validade := v_assinatura.acesso_valido_ate;
      update public.assinaturas
      set status = 'ativa', cancelada_em = null, updated_at = now()
      where id = v_assinatura.id;
    elsif found then
      v_validade := now() + make_interval(months => v_plano_pago.intervalo_meses);
      update public.assinaturas
      set plano_id = v_plano_pago.id,
          provedor = 'efi',
          preco_contratado_centavos = v_plano_pago.valor_centavos,
          status = 'ativa',
          ultima_cobranca_status = 'concessao_admin',
          data_inicio = coalesce(data_inicio, now()),
          proxima_cobranca_em = v_validade,
          periodicidade_meses = v_plano_pago.intervalo_meses,
          acesso_valido_ate = v_validade,
          renovacao_automatica = false,
          meio_pagamento = 'pix',
          cancelada_em = null,
          updated_at = now()
      where id = v_assinatura.id;
    else
      v_validade := now() + make_interval(months => v_plano_pago.intervalo_meses);
      insert into public.assinaturas(
        personal_id, plano_id, provedor, preco_contratado_centavos, status,
        ultima_cobranca_status, data_inicio, proxima_cobranca_em,
        periodicidade_meses, acesso_valido_ate, renovacao_automatica,
        meio_pagamento, updated_at
      ) values (
        p_user_id, v_plano_pago.id, 'efi', v_plano_pago.valor_centavos, 'ativa',
        'concessao_admin', now(), v_validade,
        v_plano_pago.intervalo_meses, v_validade, false,
        'pix', now()
      )
      returning * into v_assinatura;
    end if;

    update public.assinaturas
    set status = 'cancelada', proxima_cobranca_em = null, cancelada_em = now(), updated_at = now()
    where personal_id = p_user_id
      and id <> v_assinatura.id
      and status = 'ativa';

    update public.perfis
    set plano = 'premium', updated_at = now()
    where id = p_user_id;

  elsif v_plano = 'trial' then
    v_validade := now() + interval '7 days';

    update public.assinaturas
    set status = 'cancelada',
        acesso_valido_ate = least(coalesce(acesso_valido_ate, now()), now()),
        proxima_cobranca_em = null,
        cancelada_em = now(),
        updated_at = now()
    where personal_id = p_user_id;

    update public.perfis
    set plano = 'trial', trial_inicio = now(), trial_fim = v_validade, updated_at = now()
    where id = p_user_id;

  else
    v_validade := null;

    update public.assinaturas
    set status = 'cancelada',
        acesso_valido_ate = least(coalesce(acesso_valido_ate, now()), now()),
        proxima_cobranca_em = null,
        cancelada_em = now(),
        updated_at = now()
    where personal_id = p_user_id;

    update public.perfis
    set plano = 'free',
        trial_fim = case when trial_fim > now() then now() else trial_fim end,
        updated_at = now()
    where id = p_user_id;
  end if;

  insert into public.admin_auditoria(admin_id, user_id, acao, valor_anterior, valor_novo)
  values(
    auth.uid(), p_user_id, 'alterar_plano',
    jsonb_build_object('plano', v_anterior),
    jsonb_build_object('plano', v_plano, 'acesso_valido_ate', v_validade)
  );
end;
$$;

revoke all on function public.fsfit_admin_atualizar_plano(uuid, text) from public;
revoke all on function public.fsfit_admin_atualizar_plano(uuid, text) from anon;
grant execute on function public.fsfit_admin_atualizar_plano(uuid, text) to authenticated;

create or replace function public.fsfit_admin_definir_conta_ativa(p_user_id uuid, p_ativo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anterior boolean;
begin
  if not public.fsfit_is_admin(auth.uid()) then
    raise exception 'Acesso administrativo negado';
  end if;

  if p_ativo is null then
    raise exception 'Status da conta inválido';
  end if;

  if exists (select 1 from public.platform_admins pa where pa.user_id = p_user_id) then
    raise exception 'Não é permitido alterar o status de uma conta administradora';
  end if;

  select p.ativo into v_anterior
  from public.perfis p
  where p.id = p_user_id
  for update;

  if not found then
    raise exception 'Usuário não encontrado';
  end if;

  update public.perfis
  set ativo = p_ativo, updated_at = now()
  where id = p_user_id;

  insert into public.admin_auditoria(admin_id, user_id, acao, valor_anterior, valor_novo)
  values(
    auth.uid(), p_user_id, 'alterar_status_conta',
    jsonb_build_object('ativo', v_anterior),
    jsonb_build_object('ativo', p_ativo)
  );
end;
$$;

revoke all on function public.fsfit_admin_definir_conta_ativa(uuid, boolean) from public;
revoke all on function public.fsfit_admin_definir_conta_ativa(uuid, boolean) from anon;
grant execute on function public.fsfit_admin_definir_conta_ativa(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
