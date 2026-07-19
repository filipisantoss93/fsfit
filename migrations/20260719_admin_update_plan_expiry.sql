create or replace function public.fsfit_admin_atualizar_vencimento_plano(p_user_id uuid, p_vencimento timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_plano text;
  v_assinatura_id uuid;
  v_anterior timestamptz;
begin
  if v_admin_id is null or not public.fsfit_is_admin(v_admin_id) then
    raise exception 'Acesso administrativo negado';
  end if;

  if exists (select 1 from public.platform_admins where user_id = p_user_id) then
    raise exception 'Não é permitido alterar o vencimento de uma conta administradora';
  end if;

  select case
    when exists (
      select 1
      from public.assinaturas a
      where a.personal_id = p_user_id
        and a.status = 'ativa'
        and (a.acesso_valido_ate is null or a.acesso_valido_ate > now())
    ) then 'premium'
    when p.trial_fim is not null and p.trial_fim > now() then 'trial'
    else coalesce(nullif(lower(p.plano), ''), 'free')
  end into v_plano
  from public.perfis p
  where p.id = p_user_id
  for update;

  if not found then
    raise exception 'Usuário não encontrado';
  end if;

  if v_plano = 'premium' then
    select a.id, a.acesso_valido_ate
      into v_assinatura_id, v_anterior
    from public.assinaturas a
    where a.personal_id = p_user_id
      and a.status = 'ativa'
    order by a.acesso_valido_ate desc nulls first, a.updated_at desc nulls last, a.created_at desc
    limit 1
    for update;

    if v_assinatura_id is null then
      raise exception 'Assinatura Premium ativa não encontrada';
    end if;

    update public.assinaturas
       set acesso_valido_ate = p_vencimento,
           updated_at = now()
     where id = v_assinatura_id;

  elsif v_plano = 'trial' then
    select trial_fim into v_anterior
    from public.perfis
    where id = p_user_id;

    update public.perfis
       set trial_fim = p_vencimento,
           updated_at = now()
     where id = p_user_id;

  else
    raise exception 'Plano Free não possui data de vencimento';
  end if;

  insert into public.admin_auditoria(admin_id, user_id, acao, valor_anterior, valor_novo)
  values (
    v_admin_id,
    p_user_id,
    'alteracao_vencimento_plano',
    jsonb_build_object('vencimento', v_anterior),
    jsonb_build_object('vencimento', p_vencimento, 'plano', v_plano)
  );
end;
$$;

revoke all on function public.fsfit_admin_atualizar_vencimento_plano(uuid, timestamptz) from public;
revoke all on function public.fsfit_admin_atualizar_vencimento_plano(uuid, timestamptz) from anon;
grant execute on function public.fsfit_admin_atualizar_vencimento_plano(uuid, timestamptz) to authenticated;
