revoke execute on function public.criar_notificacao_checkin_personal() from public, anon, authenticated;
revoke execute on function public.reagendar_lembrete_intervalo_push() from public, anon, authenticated;
revoke execute on function public.registrar_notificacao_chat_aluno() from public, anon, authenticated;
revoke execute on function public.registrar_notificacao_lembrete_aluno() from public, anon, authenticated;

revoke execute on function public.fsfit_admin_resumo() from public, anon;
grant execute on function public.fsfit_admin_resumo() to authenticated;

revoke execute on function public.get_aluno_portal_preview(uuid) from public, anon;
grant execute on function public.get_aluno_portal_preview(uuid) to authenticated;

revoke execute on function public.finalizar_sessao_personal(uuid) from public, anon;
grant execute on function public.finalizar_sessao_personal(uuid) to authenticated;

revoke execute on function public.listar_sessoes_em_aula_personal() from public, anon;
grant execute on function public.listar_sessoes_em_aula_personal() to authenticated;

revoke execute on function public.sincronizar_exercicios_sessao(uuid) from public, anon;
grant execute on function public.sincronizar_exercicios_sessao(uuid) to authenticated;

revoke execute on function public.get_aluno_portal(uuid) from public;
grant execute on function public.get_aluno_portal(uuid) to anon, authenticated;
