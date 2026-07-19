create or replace function public.iniciar_sessao_personal_sem_checkin(p_aluno_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_treino_id uuid;
  v_sessao_id uuid;
  v_status text;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not exists (
    select 1
    from public.alunos a
    where a.id = p_aluno_id
      and a.personal_id = v_uid
  ) then
    raise exception 'Aluno não encontrado ou sem permissão.';
  end if;

  select s.id, s.status
    into v_sessao_id, v_status
  from public.sessoes_treino s
  where s.personal_id = v_uid
    and s.aluno_id = p_aluno_id
    and s.status in ('aguardando_confirmacao', 'em_aula')
  order by s.created_at desc
  limit 1;

  if v_sessao_id is not null then
    perform public.sincronizar_exercicios_sessao(v_sessao_id);

    if v_status = 'aguardando_confirmacao' then
      update public.sessoes_treino
         set status = 'em_aula',
             iniciado_at = now(),
             updated_at = now()
       where id = v_sessao_id
         and personal_id = v_uid;
    end if;

    return v_sessao_id;
  end if;

  select t.id
    into v_treino_id
  from public.treinos t
  where t.personal_id = v_uid
    and t.aluno_id = p_aluno_id
    and t.status = 'ativo'
    and coalesce(t.modelo, false) = false
  order by t.updated_at desc
  limit 1;

  if v_treino_id is null then
    raise exception 'Nenhum treino ativo encontrado para este aluno.';
  end if;

  insert into public.sessoes_treino (
    personal_id,
    aluno_id,
    treino_id,
    status,
    checkin_at,
    iniciado_at
  ) values (
    v_uid,
    p_aluno_id,
    v_treino_id,
    'em_aula',
    now(),
    now()
  )
  returning id into v_sessao_id;

  perform public.sincronizar_exercicios_sessao(v_sessao_id);

  return v_sessao_id;
end;
$$;

revoke execute on function public.iniciar_sessao_personal_sem_checkin(uuid) from public;
revoke execute on function public.iniciar_sessao_personal_sem_checkin(uuid) from anon;
grant execute on function public.iniciar_sessao_personal_sem_checkin(uuid) to authenticated;
