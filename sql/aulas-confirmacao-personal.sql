-- FS Fit — confirmação do personal após check-in do aluno

alter table public.sessoes_treino
  add column if not exists iniciado_at timestamptz;

alter table public.sessoes_treino
  drop constraint if exists sessoes_treino_status_check;

alter table public.sessoes_treino
  alter column status set default 'aguardando_confirmacao';

alter table public.sessoes_treino
  add constraint sessoes_treino_status_check
  check (status in ('aguardando_confirmacao','em_aula','finalizada','cancelada'));

drop index if exists public.sessoes_treino_aluno_em_aula_uidx;
create unique index if not exists sessoes_treino_aluno_sessao_aberta_uidx
  on public.sessoes_treino(aluno_id)
  where status in ('aguardando_confirmacao','em_aula');

drop function if exists public.get_aluno_sessao_treino(uuid);
drop function if exists public.listar_sessoes_em_aula_personal();

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
  v_dia integer := extract(isodow from now())::integer;
begin
  select * into v_aluno
  from public.alunos
  where access_token = p_access_token and link_ativo = true
  limit 1;

  if v_aluno.id is null then
    raise exception 'Acesso do aluno inválido';
  end if;

  select id into v_sessao_id
  from public.sessoes_treino
  where aluno_id = v_aluno.id
    and status in ('aguardando_confirmacao','em_aula')
  order by created_at desc
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

  insert into public.sessoes_treino(personal_id, aluno_id, treino_id, status, checkin_at)
  values (v_aluno.personal_id, v_aluno.id, v_treino.id, 'aguardando_confirmacao', now())
  returning id into v_sessao_id;

  insert into public.sessao_exercicios(
    sessao_id, treino_exercicio_id, exercicio_id, ordem, nome,
    series, repeticoes, carga, descanso_segundos, observacoes
  )
  select
    v_sessao_id, te.id, te.exercicio_id, te.ordem,
    coalesce(e.nome, 'Exercício'), te.series, te.repeticoes,
    te.carga, te.descanso_segundos, te.observacoes
  from public.treino_exercicios te
  left join public.exercicios e on e.id = te.exercicio_id
  where te.treino_id = v_treino.id
    and te.dia_semana = v_dia
  order by te.ordem;

  return v_sessao_id;
end;
$$;

create function public.get_aluno_sessao_treino(p_access_token uuid)
returns table(
  sessao_id uuid,
  treino_id uuid,
  treino_nome text,
  status text,
  checkin_at timestamptz,
  iniciado_at timestamptz,
  exercicios jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.treino_id,
    t.nome,
    s.status,
    s.checkin_at,
    s.iniciado_at,
    coalesce(jsonb_agg(jsonb_build_object(
      'id', se.id,
      'nome', se.nome,
      'ordem', se.ordem,
      'series', se.series,
      'repeticoes', se.repeticoes,
      'carga', se.carga,
      'descanso_segundos', se.descanso_segundos,
      'observacoes', se.observacoes,
      'concluido', se.concluido,
      'concluido_at', se.concluido_at
    ) order by se.ordem) filter (where se.id is not null), '[]'::jsonb)
  from public.alunos a
  join public.sessoes_treino s on s.aluno_id = a.id
    and s.status in ('aguardando_confirmacao','em_aula')
  join public.treinos t on t.id = s.treino_id
  left join public.sessao_exercicios se on se.sessao_id = s.id
  where a.access_token = p_access_token
    and a.link_ativo = true
  group by s.id, s.treino_id, t.nome, s.status, s.checkin_at, s.iniciado_at
  order by s.created_at desc
  limit 1;
$$;

create or replace function public.confirmar_inicio_sessao_personal(p_sessao_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return false; end if;

  update public.sessoes_treino
  set status = 'em_aula', iniciado_at = now(), updated_at = now()
  where id = p_sessao_id
    and personal_id = auth.uid()
    and status = 'aguardando_confirmacao';

  return found;
end;
$$;

create function public.listar_sessoes_em_aula_personal()
returns table(
  sessao_id uuid,
  aluno_id uuid,
  aluno_nome text,
  treino_id uuid,
  treino_nome text,
  status text,
  checkin_at timestamptz,
  iniciado_at timestamptz,
  total_exercicios bigint,
  exercicios_concluidos bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id, a.id, a.nome, t.id, t.nome, s.status, s.checkin_at, s.iniciado_at,
    count(se.id), count(se.id) filter (where se.concluido)
  from public.sessoes_treino s
  join public.alunos a on a.id = s.aluno_id
  join public.treinos t on t.id = s.treino_id
  left join public.sessao_exercicios se on se.sessao_id = s.id
  where s.personal_id = auth.uid()
    and s.status in ('aguardando_confirmacao','em_aula')
  group by s.id, a.id, a.nome, t.id, t.nome, s.status, s.checkin_at, s.iniciado_at
  order by case when s.status = 'aguardando_confirmacao' then 0 else 1 end, s.checkin_at desc;
$$;

revoke all on function public.get_aluno_sessao_treino(uuid) from public;
revoke all on function public.confirmar_inicio_sessao_personal(uuid) from public;
revoke all on function public.listar_sessoes_em_aula_personal() from public;
grant execute on function public.get_aluno_sessao_treino(uuid) to anon, authenticated;
grant execute on function public.confirmar_inicio_sessao_personal(uuid) to authenticated;
grant execute on function public.listar_sessoes_em_aula_personal() to authenticated;

notify pgrst, 'reload schema';
