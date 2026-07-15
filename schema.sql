create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  whatsapp text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alunos (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references public.profiles(id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 120),
  sexo text not null check (sexo in ('Masculino','Feminino','Outro','Prefiro não informar')),
  whatsapp text not null check (whatsapp ~ '^[0-9]{10,15}$'),
  access_token uuid not null unique default gen_random_uuid(),
  link_ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.planos (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references public.profiles(id) on delete cascade,
  aluno_id uuid not null unique references public.alunos(id) on delete cascade,
  treino text not null default '',
  dieta text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists alunos_personal_id_idx on public.alunos(personal_id);
create index if not exists alunos_access_token_idx on public.alunos(access_token);
create index if not exists planos_personal_id_idx on public.planos(personal_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists alunos_set_updated_at on public.alunos;
create trigger alunos_set_updated_at before update on public.alunos for each row execute function public.set_updated_at();
drop trigger if exists planos_set_updated_at on public.planos;
create trigger planos_set_updated_at before update on public.planos for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, full_name)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict(id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.alunos enable row level security;
alter table public.planos enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using(auth.uid() = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using(auth.uid() = id) with check(auth.uid() = id);
drop policy if exists alunos_select_own on public.alunos;
create policy alunos_select_own on public.alunos for select to authenticated using(auth.uid() = personal_id);
drop policy if exists alunos_insert_own on public.alunos;
create policy alunos_insert_own on public.alunos for insert to authenticated with check(auth.uid() = personal_id);
drop policy if exists alunos_update_own on public.alunos;
create policy alunos_update_own on public.alunos for update to authenticated using(auth.uid() = personal_id) with check(auth.uid() = personal_id);
drop policy if exists alunos_delete_own on public.alunos;
create policy alunos_delete_own on public.alunos for delete to authenticated using(auth.uid() = personal_id);
drop policy if exists planos_select_own on public.planos;
create policy planos_select_own on public.planos for select to authenticated using(auth.uid() = personal_id);
drop policy if exists planos_insert_own on public.planos;
create policy planos_insert_own on public.planos for insert to authenticated with check(auth.uid() = personal_id and exists(select 1 from public.alunos a where a.id = aluno_id and a.personal_id = auth.uid()));
drop policy if exists planos_update_own on public.planos;
create policy planos_update_own on public.planos for update to authenticated using(auth.uid() = personal_id) with check(auth.uid() = personal_id and exists(select 1 from public.alunos a where a.id = aluno_id and a.personal_id = auth.uid()));
drop policy if exists planos_delete_own on public.planos;
create policy planos_delete_own on public.planos for delete to authenticated using(auth.uid() = personal_id);

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
  select a.nome, a.sexo, coalesce(pl.treino, ''), coalesce(pl.dieta, ''), pr.full_name, pr.whatsapp, pl.updated_at
  from public.alunos a
  join public.profiles pr on pr.id = a.personal_id
  left join public.planos pl on pl.aluno_id = a.id
  where a.access_token = p_access_token and a.link_ativo = true
  limit 1;
$$;

revoke all on function public.get_aluno_portal(uuid) from public;
grant execute on function public.get_aluno_portal(uuid) to anon, authenticated;
revoke all on public.profiles, public.alunos, public.planos from anon;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.alunos, public.planos to authenticated;
