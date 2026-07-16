-- FS Fit — Corrige sessões em aula que aparecem 0/0 mesmo com exercícios programados
-- A confirmação do personal passa a sincronizar os exercícios atuais do treino para o dia local do Brasil.

create or replace function public.confirmar_inicio_sessao_personal(p_sessao_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessao public.sessoes_treino%rowtype;
  v_dia integer := extract(isodow from (now() at time zone 'America/Sao_Paulo'))::integer;
begin
  -- Garante que somente o personal dono da sessão possa iniciar a aula.
  select * into v_sessao
  from public.sessoes_treino
  where id = p_sessao_id
    and personal_id = auth.uid()
    and status = 'aguardando_confirmacao'
  for update;

  if v_sessao.id is null then
    return false;
  end if;

  -- Sincroniza o snapshot da sessão com os exercícios atualmente programados
  -- para o treino e para o dia da semana. O ON CONFLICT evita duplicações.
  insert into public.sessao_exercicios (
    sessao_id,
    treino_exercicio_id,
    exercicio_id,
    ordem,
    nome,
    series,
    repeticoes,
    carga,
    descanso_segundos,
    observacoes
  )
  select
    v_sessao.id,
    te.id,
    te.exercicio_id,
    te.ordem,
    coalesce(e.nome, 'Exercício'),
    te.series,
    te.repeticoes,
    te.carga,
    te.descanso_segundos,
    te.observacoes
  from public.treino_exercicios te
  left join public.exercicios e on e.id = te.exercicio_id
  where te.treino_id = v_sessao.treino_id
    and te.dia_semana = v_dia
    and not exists (
      select 1
      from public.sessao_exercicios se
      where se.sessao_id = v_sessao.id
        and se.treino_exercicio_id = te.id
    )
  order by te.ordem;

  update public.sessoes_treino
  set status = 'em_aula',
      iniciado_at = now(),
      updated_at = now()
  where id = v_sessao.id
    and personal_id = auth.uid();

  return found;
end;
$$;

revoke all on function public.confirmar_inicio_sessao_personal(uuid) from public;
revoke execute on function public.confirmar_inicio_sessao_personal(uuid) from anon;
grant execute on function public.confirmar_inicio_sessao_personal(uuid) to authenticated;

-- Também corrige a criação de novas sessões para considerar o dia local do Brasil.
create or replace function public.iniciar_aluno_sessao_treino(p_access_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aluno public.alunos%rowtype;
  v_treino public.treinos%rowtype;
  v_sessao_id uuid;
  v_dia integer := extract(isodow from (now() at time zone 'America/Sao_Paulo'))::integer;
begin
  select * into v_aluno
  from public.alunos
  where access_token = p_access_token
    and link_ativo = true
  limit 1;

  if v_aluno.id is null then
    raise exception 'Acesso do aluno inválido';
  end if;

  select id into v_sessao_id
  from public.sessoes_treino
  where aluno_id = v_aluno.id
    and status in ('aguardando_confirmacao', 'em_aula')
  order by checkin_at desc
  limit 1;

  if v_sessao_id is not null then
    return v_sessao_id;
  end if;

  select * into v_treino
  from public.treinos
  where aluno_id = v_aluno.id
    and personal_id = v_aluno.personal_id
    and status = 'ativo'
  order by updated_at desc
  limit 1;

  if v_treino.id is null then
    raise exception 'Nenhum treino ativo encontrado';
  end if;

  insert into public.sessoes_treino (
    personal_id,
    aluno_id,
    treino_id,
    status,
    checkin_at
  )
  values (
    v_aluno.personal_id,
    v_aluno.id,
    v_treino.id,
    'aguardando_confirmacao',
    now()
  )
  returning id into v_sessao_id;

  -- Mantém uma cópia inicial para compatibilidade. A confirmação do personal
  -- sincroniza novamente e adiciona qualquer exercício que estiver faltando.
  insert into public.sessao_exercicios (
    sessao_id,
    treino_exercicio_id,
    exercicio_id,
    ordem,
    nome,
    series,
    repeticoes,
    carga,
    descanso_segundos,
    observacoes
  )
  select
    v_sessao_id,
    te.id,
    te.exercicio_id,
    te.ordem,
    coalesce(e.nome, 'Exercício'),
    te.series,
    te.repeticoes,
    te.carga,
    te.descanso_segundos,
    te.observacoes
  from public.treino_exercicios te
  left join public.exercicios e on e.id = te.exercicio_id
  where te.treino_id = v_treino.id
    and te.dia_semana = v_dia
  order by te.ordem;

  return v_sessao_id;
end;
$$;

revoke all on function public.iniciar_aluno_sessao_treino(uuid) from public;
grant execute on function public.iniciar_aluno_sessao_treino(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
