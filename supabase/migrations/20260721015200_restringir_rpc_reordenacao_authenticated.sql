revoke execute on function public.reordenar_exercicios_treino_personal(uuid[]) from public;
revoke execute on function public.reordenar_exercicios_treino_personal(uuid[]) from anon;
grant execute on function public.reordenar_exercicios_treino_personal(uuid[]) to authenticated;
