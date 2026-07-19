-- Permite ao personal cancelar somente check-ins ainda aguardando confirmação.
-- A RPC valida auth.uid(), restringe a sessão ao próprio personal e remove
-- a notificação pendente associada ao check-in cancelado.

create or replace function public.cancelar_checkin_personal(p_sessao_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cancelada boolean := false;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.';
  end if;

  update public.sessoes_treino
     set status = 'cancelada',
         finalizada_at = now(),
         updated_at = now()
   where id = p_sessao_id
     and personal_id = v_uid
     and status = 'aguardando_confirmacao';

  v_cancelada := found;

  if not v_cancelada then
    return false;
  end if;

  delete from public.notificacoes
   where destinatario_id = v_uid
     and tipo = 'checkin'
     and link = '/painel.html?checkin=' || p_sessao_id::text;

  return true;
end;
$$;

revoke all on function public.cancelar_checkin_personal(uuid) from public;
revoke all on function public.cancelar_checkin_personal(uuid) from anon;
grant execute on function public.cancelar_checkin_personal(uuid) to authenticated;

notify pgrst, 'reload schema';
