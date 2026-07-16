-- FS Fit — MVP do modo Em aula
-- Executar no SQL Editor do Supabase.

create extension if not exists pgcrypto;

create table if not exists public.sessoes_treino (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references public.perfis(id) on delete cascade,
  aluno_id uuid not null references public.alunos(id) on delete cascade,
  treino_id uuid not null references public.treinos(id) on delete restrict,
  status text not null default 'em_aula' check (status in ('em_aula','finalizada','cancelada')),
  checkin_at timestamptz not null default now(),
  finalizada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sessoes_treino_aluno_em_aula_uidx
  on public.sessoes_treino(aluno_id)
  where status = 'em_aula';

create index if not exists sessoes_treino_personal_status_idx
  on public.sessoes_treino(personal_id, status, checkin_at desc);

create table if not exists public.sessao_exercicios (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.sessoes_treino(id) on delete cascade,
  treino_exercicio_id uuid references public.treino_exercicios(id) on delete set null,
  exercicio_id uuid references public.exercicios(id) on delete set null,
  ordem integer,
  nome text not null,
  series integer,
  repeticoes text,
  carga text,
  descanso_segundos integer,
  observacoes text,
  concluido boolean not null default false,
  concluido_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sessao_exercicios_sessao_idx
  on public.sessao_exercicios(sessao_id, ordem);

alter table public.sessoes_treino enable row level security;
alter table public.sessao_exercicios enable row level security;

-- O personal autenticado pode consultar somente suas próprias sessões.
drop policy if exists sessoes_treino_personal_select on public.sessoes_treino;
create policy sessoes_treino_personal_select on public.sessoes_treino
for select to authenticated
using (personal_id = auth.uid());

drop policy if exists sessao_exercicios_personal_select on public.sessao_exercicios;
create policy sessao_exercicios_personal_select on public.sessao_exercicios
for select to authenticated
using (exists (
  select 1 from public.sessoes_treino s
  where s.id = sessao_id and s.personal_id = auth.uid()
));

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
  where aluno_id = v_aluno.id and status = 'em_aula'
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

  insert into public.sessoes_treino(personal_id, aluno_id, treino_id)
  values (v_aluno.personal_id, v_aluno.id, v_treino.id)
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

create or replace function public.get_aluno_sessao_treino(p_access_token uuid)
returns table(
  sessao_id uuid,
  treino_id uuid,
  treino_nome text,
  checkin_at timestamptz,
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
    s.checkin_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
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
        ) order by se.ordem
      ) filter (where se.id is not null),
      '[]'::jsonb
    )
  from public.alunos a
  join public.sessoes_treino s on s.aluno_id = a.id and s.status = 'em_aula'
  join public.treinos t on t.id = s.treino_id
  left join public.sessao_exercicios se on se.sessao_id = s.id
  where a.access_token = p_access_token
    and a.link_ativo = true
  group by s.id, s.treino_id, t.nome, s.checkin_at
  limit 1;
$$;

create or replace function public.marcar_aluno_exercicio_sessao(
  p_access_token uuid,
  p_sessao_exercicio_id uuid,
  p_concluido boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sessao_exercicios se
  set concluido = p_concluido,
      concluido_at = case when p_concluido then now() else null end
  from public.sessoes_treino s
  join public.alunos a on a.id = s.aluno_id
  where se.id = p_sessao_exercicio_id
    and se.sessao_id = s.id
    and s.status = 'em_aula'
    and a.access_token = p_access_token
    and a.link_ativo = true;

  return found;
end;
$$;

create or replace function public.finalizar_aluno_sessao_treino(p_access_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sessoes_treino s
  set status = 'finalizada', finalizada_at = now(), updated_at = now()
  from public.alunos a
  where s.aluno_id = a.id
    and s.status = 'em_aula'
    and a.access_token = p_access_token
    and a.link_ativo = true;

  return found;
end;
$$;

create or replace function public.listar_sessoes_em_aula_personal()
returns table(
  sessao_id uuid,
  aluno_id uuid,
  aluno_nome text,
  treino_id uuid,
  treino_nome text,
  checkin_at timestamptz,
  total_exercicios bigint,
  exercicios_concluidos bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    a.id,
    a.nome,
    t.id,
    t.nome,
    s.checkin_at,
    count(se.id),
    count(se.id) filter (where se.concluido)
  from public.sessoes_treino s
  join public.alunos a on a.id = s.aluno_id
  join public.treinos t on t.id = s.treino_id
  left join public.sessao_exercicios se on se.sessao_id = s.id
  where s.personal_id = auth.uid()
    and s.status = 'em_aula'
  group by s.id, a.id, a.nome, t.id, t.nome, s.checkin_at
  order by s.checkin_at desc;
$$;

revoke all on function public.iniciar_aluno_sessao_treino(uuid) from public;
revoke all on function public.get_aluno_sessao_treino(uuid) from public;
revoke all on function public.marcar_aluno_exercicio_sessao(uuid,uuid,boolean) from public;
revoke all on function public.finalizar_aluno_sessao_treino(uuid) from public;
revoke all on function public.listar_sessoes_em_aula_personal() from public;

grant execute on function public.iniciar_aluno_sessao_treino(uuid) to anon, authenticated;
grant execute on function public.get_aluno_sessao_treino(uuid) to anon, authenticated;
grant execute on function public.marcar_aluno_exercicio_sessao(uuid,uuid,boolean) to anon, authenticated;
grant execute on function public.finalizar_aluno_sessao_treino(uuid) to anon, authenticated;
grant execute on function public.listar_sessoes_em_aula_personal() to authenticated;

notify pgrst, 'reload schema';
