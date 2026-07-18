create index if not exists treinos_personal_modelo_updated_idx
on public.treinos (personal_id, modelo, updated_at desc);

create or replace function public.fsfit_salvar_modelo_treino(
  p_modelo_id uuid,
  p_nome text,
  p_descricao text,
  p_dias smallint[],
  p_itens jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_modelo_id uuid;
  v_item jsonb;
  v_exercicio_id uuid;
  v_dia smallint;
  v_ordem integer;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if nullif(btrim(p_nome), '') is null then
    raise exception 'Informe o nome do treino.';
  end if;

  if coalesce(array_length(p_dias, 1), 0) = 0 then
    raise exception 'Selecione pelo menos um dia da semana.';
  end if;

  if exists (select 1 from unnest(p_dias) d where d < 1 or d > 7) then
    raise exception 'Dia da semana inválido.';
  end if;

  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Adicione pelo menos um exercício ao treino.';
  end if;

  if p_modelo_id is null then
    insert into public.treinos (
      personal_id, aluno_id, nome, descricao, dias_semana,
      data_inicio, data_fim, status, modelo
    ) values (
      v_uid, null, btrim(p_nome), nullif(btrim(p_descricao), ''), p_dias,
      null, null, 'inativo'::public.status_treino, true
    ) returning id into v_modelo_id;
  else
    update public.treinos
       set nome = btrim(p_nome),
           descricao = nullif(btrim(p_descricao), ''),
           dias_semana = p_dias,
           aluno_id = null,
           modelo = true,
           status = 'inativo'::public.status_treino,
           data_inicio = null,
           data_fim = null,
           updated_at = now()
     where id = p_modelo_id
       and personal_id = v_uid
       and modelo = true
       and aluno_id is null
     returning id into v_modelo_id;

    if v_modelo_id is null then
      raise exception 'Treino salvo não encontrado ou sem permissão.';
    end if;

    delete from public.treino_exercicios where treino_id = v_modelo_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_itens)
  loop
    v_exercicio_id := nullif(v_item->>'exercicio_id', '')::uuid;
    v_dia := nullif(v_item->>'dia_semana', '')::smallint;
    v_ordem := nullif(v_item->>'ordem', '')::integer;

    if v_exercicio_id is null or v_dia is null or v_ordem is null or v_ordem < 1 then
      raise exception 'Exercício, dia e ordem são obrigatórios.';
    end if;

    if not (v_dia = any(p_dias)) then
      raise exception 'O exercício possui um dia que não está habilitado no treino.';
    end if;

    if not exists (
      select 1 from public.exercicios e
      where e.id = v_exercicio_id
        and (e.global = true or e.personal_id = v_uid)
    ) then
      raise exception 'Exercício não encontrado ou sem permissão.';
    end if;

    insert into public.treino_exercicios (
      treino_id, exercicio_id, dia_semana, ordem, series, repeticoes,
      carga, descanso_segundos, observacoes, duracao_minutos, distancia_km
    ) values (
      v_modelo_id,
      v_exercicio_id,
      v_dia,
      v_ordem,
      nullif(v_item->>'series', '')::integer,
      nullif(v_item->>'repeticoes', ''),
      nullif(v_item->>'carga', ''),
      nullif(v_item->>'descanso_segundos', '')::integer,
      nullif(v_item->>'observacoes', ''),
      nullif(v_item->>'duracao_minutos', '')::numeric,
      nullif(v_item->>'distancia_km', '')::numeric
    );
  end loop;

  return v_modelo_id;
end;
$$;

revoke all on function public.fsfit_salvar_modelo_treino(uuid,text,text,smallint[],jsonb) from public, anon;
grant execute on function public.fsfit_salvar_modelo_treino(uuid,text,text,smallint[],jsonb) to authenticated;

create or replace function public.fsfit_aplicar_modelo_treino(
  p_modelo_id uuid,
  p_aluno_id uuid,
  p_ativar boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_modelo public.treinos%rowtype;
  v_novo_id uuid;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select * into v_modelo
  from public.treinos
  where id = p_modelo_id
    and personal_id = v_uid
    and modelo = true
    and aluno_id is null;

  if not found then
    raise exception 'Treino salvo não encontrado ou sem permissão.';
  end if;

  if not exists (
    select 1 from public.alunos a
    where a.id = p_aluno_id and a.personal_id = v_uid
  ) then
    raise exception 'Aluno não encontrado ou sem permissão.';
  end if;

  if p_ativar then
    update public.treinos
       set status = 'inativo'::public.status_treino,
           updated_at = now()
     where personal_id = v_uid
       and aluno_id = p_aluno_id
       and modelo = false
       and status = 'ativo'::public.status_treino;
  end if;

  insert into public.treinos (
    personal_id, aluno_id, nome, descricao, dias_semana,
    data_inicio, data_fim, status, modelo
  ) values (
    v_uid,
    p_aluno_id,
    v_modelo.nome,
    v_modelo.descricao,
    v_modelo.dias_semana,
    current_date,
    null,
    case when p_ativar then 'ativo'::public.status_treino else 'inativo'::public.status_treino end,
    false
  ) returning id into v_novo_id;

  insert into public.treino_exercicios (
    treino_id, exercicio_id, dia_semana, ordem, series, repeticoes,
    carga, descanso_segundos, observacoes, duracao_minutos, distancia_km
  )
  select
    v_novo_id, exercicio_id, dia_semana, ordem, series, repeticoes,
    carga, descanso_segundos, observacoes, duracao_minutos, distancia_km
  from public.treino_exercicios
  where treino_id = p_modelo_id
  order by dia_semana, ordem;

  return v_novo_id;
end;
$$;

revoke all on function public.fsfit_aplicar_modelo_treino(uuid,uuid,boolean) from public, anon;
grant execute on function public.fsfit_aplicar_modelo_treino(uuid,uuid,boolean) to authenticated;
