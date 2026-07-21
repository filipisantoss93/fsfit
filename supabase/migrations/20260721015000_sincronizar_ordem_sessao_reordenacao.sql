create or replace function public.reordenar_exercicios_treino_personal(p_exercicio_ids uuid[])
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_treino_id uuid;
  v_dia_semana integer;
  v_input_count integer := coalesce(array_length(p_exercicio_ids, 1), 0);
  v_total_count integer;
  v_offset integer;
begin
  if v_uid is null or v_input_count < 1 then
    return false;
  end if;

  if (select count(distinct item_id) from unnest(p_exercicio_ids) as item_id) <> v_input_count then
    return false;
  end if;

  select te.treino_id, te.dia_semana
    into v_treino_id, v_dia_semana
  from public.treino_exercicios te
  join public.treinos t on t.id = te.treino_id
  where te.id = p_exercicio_ids[1]
    and t.personal_id = v_uid
  limit 1;

  if v_treino_id is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_treino_id::text || ':' || v_dia_semana::text, 0)
  );

  select count(*), coalesce(max(ordem), 0) + 100000
    into v_total_count, v_offset
  from public.treino_exercicios
  where treino_id = v_treino_id
    and dia_semana = v_dia_semana;

  if v_total_count <> v_input_count then
    return false;
  end if;

  if exists (
    select 1
    from unnest(p_exercicio_ids) as item_id
    left join public.treino_exercicios te
      on te.id = item_id
     and te.treino_id = v_treino_id
     and te.dia_semana = v_dia_semana
    where te.id is null
  ) then
    return false;
  end if;

  update public.treino_exercicios te
  set ordem = v_offset + src.posicao
  from (
    select item_id as id, ordinality::integer as posicao
    from unnest(p_exercicio_ids) with ordinality as u(item_id, ordinality)
  ) src
  where te.id = src.id;

  update public.treino_exercicios te
  set ordem = src.posicao
  from (
    select item_id as id, ordinality::integer as posicao
    from unnest(p_exercicio_ids) with ordinality as u(item_id, ordinality)
  ) src
  where te.id = src.id;

  update public.sessao_exercicios se
  set ordem = te.ordem
  from public.treino_exercicios te,
       public.sessoes_treino s
  where se.treino_exercicio_id = te.id
    and se.sessao_id = s.id
    and s.treino_id = v_treino_id
    and s.status in ('aguardando_confirmacao', 'em_aula')
    and te.treino_id = v_treino_id
    and te.dia_semana = v_dia_semana;

  return true;
end;
$$;

grant execute on function public.reordenar_exercicios_treino_personal(uuid[]) to authenticated;
