-- FS Fit — exclusão segura de exercícios durante uma aula em andamento.

create or replace function public.excluir_exercicio_sessao_personal(
  p_sessao_id uuid,
  p_treino_exercicio_id uuid
)
returns table(
  total_exercicios bigint,
  exercicios_concluidos bigint,
  exercicios_removidos bigint
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_treino_id uuid;
  v_dia integer;
  v_removidos bigint := 0;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  select
    s.treino_id,
    extract(isodow from (coalesce(s.iniciado_at, s.checkin_at, s.created_at) at time zone 'America/Sao_Paulo'))::integer
  into v_treino_id, v_dia
  from public.sessoes_treino s
  where s.id = p_sessao_id
    and s.personal_id = auth.uid()
    and s.status = 'em_aula'
  for update;

  if v_treino_id is null then
    raise exception 'Aula ativa não encontrada';
  end if;

  delete from public.sessao_exercicios se
  where se.sessao_id = p_sessao_id
    and se.treino_exercicio_id = p_treino_exercicio_id;

  delete from public.treino_exercicios te
  where te.id = p_treino_exercicio_id
    and te.treino_id = v_treino_id
    and te.dia_semana = v_dia;

  get diagnostics v_removidos = row_count;
  if v_removidos = 0 then
    raise exception 'Exercício não encontrado no treino de hoje';
  end if;

  with ordenados as (
    select
      te.id,
      row_number() over (order by te.ordem, te.id)::integer as nova_ordem
    from public.treino_exercicios te
    where te.treino_id = v_treino_id
      and te.dia_semana = v_dia
  )
  update public.treino_exercicios te
  set ordem = o.nova_ordem
  from ordenados o
  where te.id = o.id
    and te.ordem is distinct from o.nova_ordem;

  perform public.sincronizar_exercicios_sessao(p_sessao_id);

  return query
  select
    count(se.id),
    count(se.id) filter (where se.concluido),
    v_removidos
  from public.sessao_exercicios se
  where se.sessao_id = p_sessao_id;
end;
$function$;

create or replace function public.limpar_exercicios_sessao_personal(
  p_sessao_id uuid
)
returns table(
  total_exercicios bigint,
  exercicios_concluidos bigint,
  exercicios_removidos bigint
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_treino_id uuid;
  v_dia integer;
  v_removidos bigint := 0;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  select
    s.treino_id,
    extract(isodow from (coalesce(s.iniciado_at, s.checkin_at, s.created_at) at time zone 'America/Sao_Paulo'))::integer
  into v_treino_id, v_dia
  from public.sessoes_treino s
  where s.id = p_sessao_id
    and s.personal_id = auth.uid()
    and s.status = 'em_aula'
  for update;

  if v_treino_id is null then
    raise exception 'Aula ativa não encontrada';
  end if;

  delete from public.sessao_exercicios se
  where se.sessao_id = p_sessao_id;

  delete from public.treino_exercicios te
  where te.treino_id = v_treino_id
    and te.dia_semana = v_dia;

  get diagnostics v_removidos = row_count;
  perform public.sincronizar_exercicios_sessao(p_sessao_id);

  return query
  select
    count(se.id),
    count(se.id) filter (where se.concluido),
    v_removidos
  from public.sessao_exercicios se
  where se.sessao_id = p_sessao_id;
end;
$function$;

revoke all on function public.excluir_exercicio_sessao_personal(uuid, uuid) from public;
revoke execute on function public.excluir_exercicio_sessao_personal(uuid, uuid) from anon;
grant execute on function public.excluir_exercicio_sessao_personal(uuid, uuid) to authenticated;

revoke all on function public.limpar_exercicios_sessao_personal(uuid) from public;
revoke execute on function public.limpar_exercicios_sessao_personal(uuid) from anon;
grant execute on function public.limpar_exercicios_sessao_personal(uuid) to authenticated;

notify pgrst, 'reload schema';
