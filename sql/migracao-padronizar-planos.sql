-- FS Fit — padronização definitiva dos planos
-- Planos válidos: trial, free e premium.

update public.perfis
set plano = case
  when lower(trim(coalesce(plano, ''))) = 'trial' then 'trial'
  when lower(trim(coalesce(plano, ''))) in ('free', 'gratis') then 'free'
  when lower(trim(coalesce(plano, ''))) in ('premium', 'pago', 'pro') then 'premium'
  else 'free'
end;

alter table public.perfis
  drop constraint if exists perfis_plano_fsfit_check;

alter table public.perfis
  add constraint perfis_plano_fsfit_check
  check (plano in ('trial', 'free', 'premium'));

create or replace function public.fsfit_admin_atualizar_plano(p_user_id uuid, p_plano text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_anterior text;
  v_plano text := lower(trim(coalesce(p_plano, '')));
begin
  if not public.fsfit_is_admin(auth.uid()) then
    raise exception 'Acesso administrativo negado';
  end if;

  if v_plano not in ('trial', 'free', 'premium') then
    raise exception 'Plano inválido. Use trial, free ou premium';
  end if;

  select plano::text into v_anterior
  from public.perfis
  where id = p_user_id;

  if not found then
    raise exception 'Usuário não encontrado';
  end if;

  update public.perfis
  set plano = v_plano
  where id = p_user_id;

  insert into public.admin_auditoria(admin_id, user_id, acao, valor_anterior, valor_novo)
  values(
    auth.uid(),
    p_user_id,
    'alterar_plano',
    jsonb_build_object('plano', v_anterior),
    jsonb_build_object('plano', v_plano)
  );
end;
$function$;
