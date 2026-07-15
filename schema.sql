-- Migração de compatibilidade do MVP com o schema real do FS Fit.
-- Este arquivo NÃO cria tabelas paralelas como profiles ou planos.
-- Ele pressupõe as tabelas oficiais: perfis, alunos, treinos e planos_alimentares.

create extension if not exists pgcrypto;

alter table public.alunos
  add column if not exists access_token uuid default gen_random_uuid(),
  add column if not exists link_ativo boolean not null default true;

update public.alunos
set access_token = gen_random_uuid()
where access_token is null;

alter table public.alunos
  alter column access_token set not null;

create unique index if not exists alunos_access_token_uidx
  on public.alunos(access_token);

alter table public.alunos
  drop constraint if exists alunos_telefone_formato_chk;

alter table public.alunos
  add constraint alunos_telefone_formato_chk
  check (telefone is null or telefone ~ '^[0-9]{11}$');

create or replace function public.handle_new_personal_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfis (id, tipo, nome, telefone, plano, ativo)
  values (
    new.id,
    'personal'::public.tipo_perfil,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(coalesce(new.email, ''), '@', 1),
      'Personal'
    ),
    null,
    'gratis',
    true
  )
  on conflict (id) do update
    set nome = case
      when nullif(trim(public.perfis.nome), '') is null then excluded.nome
      else public.perfis.nome
    end,
    ativo = true;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_fsfit on auth.users;
create trigger on_auth_user_created_fsfit
after insert on auth.users
for each row execute function public.handle_new_personal_user();

insert into public.perfis (id, tipo, nome, telefone, plano, ativo)
select
  u.id,
  'personal'::public.tipo_perfil,
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
    split_part(coalesce(u.email, ''), '@', 1),
    'Personal'
  ),
  null,
  'gratis',
  true
from auth.users u
where not exists (
  select 1 from public.perfis p where p.id = u.id
)
on conflict (id) do nothing;

create or replace function public.get_aluno_portal(p_access_token uuid)
returns table(
  aluno_nome text,
  aluno_sexo text,
  treino text,
  dieta text,
  personal_nome text,
  personal_whatsapp text,
  plano_atualizado_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.nome,
    a.sexo::text,
    coalesce(t.descricao, ''),
    coalesce(pa.orientacoes, ''),
    p.nome,
    p.telefone,
    greatest(t.updated_at, pa.updated_at)
  from public.alunos a
  join public.perfis p on p.id = a.personal_id
  left join lateral (
    select tr.descricao, tr.updated_at
    from public.treinos tr
    where tr.aluno_id = a.id
    order by (tr.status = 'ativo') desc, tr.updated_at desc
    limit 1
  ) t on true
  left join lateral (
    select pl.orientacoes, pl.updated_at
    from public.planos_alimentares pl
    where pl.aluno_id = a.id
    order by pl.ativo desc, pl.updated_at desc
    limit 1
  ) pa on true
  where a.access_token = p_access_token
    and a.link_ativo = true
  limit 1;
$$;

revoke all on function public.get_aluno_portal(uuid) from public;
grant execute on function public.get_aluno_portal(uuid) to anon, authenticated;

notify pgrst, 'reload schema';