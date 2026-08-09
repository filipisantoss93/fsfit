-- A consulta de status do Pix passa exclusivamente pela Edge Function,
-- que valida a sessão do aluno e aplica rate limiting antes de chamar a RPC.

revoke all on function public.fsfit_obter_status_mensalidade_aluno(text,uuid)
  from public, anon, authenticated;
grant execute on function public.fsfit_obter_status_mensalidade_aluno(text,uuid)
  to service_role;
