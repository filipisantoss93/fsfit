-- FS Fit — permite ao personal encerrar uma sessão de treino em andamento
-- A migração equivalente já foi aplicada no Supabase de produção.

create or replace function public.finalizar_sessao_personal(p_sessao_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.sessoes_treino
  set status = 'finalizada',
      finalizada_at = now(),
      updated_at = now()
  where id = p_sessao_id
    and personal_id = auth.uid()
    and status = 'em_aula';

  return found;
end;
$$;

revoke all on function public.finalizar_sessao_personal(uuid) from public;
grant execute on function public.finalizar_sessao_personal(uuid) to authenticated;

notify pgrst, 'reload schema';
