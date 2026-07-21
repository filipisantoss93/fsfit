revoke execute on function public.atualizar_exercicio_sessao_personal(uuid, uuid, integer, text, integer, boolean) from public;
revoke execute on function public.atualizar_exercicio_sessao_personal(uuid, uuid, integer, text, integer, boolean) from anon;
grant execute on function public.atualizar_exercicio_sessao_personal(uuid, uuid, integer, text, integer, boolean) to authenticated;

revoke execute on function public.obter_exercicio_sessao_personal(uuid, uuid) from public;
revoke execute on function public.obter_exercicio_sessao_personal(uuid, uuid) from anon;
grant execute on function public.obter_exercicio_sessao_personal(uuid, uuid) to authenticated;
