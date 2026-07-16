-- FS Fit — categorias de exercícios
-- Migração aplicada no Supabase de produção.

create table if not exists public.categorias_exercicios (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid null references public.perfis(id) on delete cascade,
  nome text not null,
  global boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categorias_exercicios_nome_check check (char_length(trim(nome)) between 2 and 80),
  constraint categorias_exercicios_escopo_check check (
    (global = true and personal_id is null) or
    (global = false and personal_id is not null)
  )
);

create unique index if not exists categorias_exercicios_global_nome_uidx
  on public.categorias_exercicios (lower(trim(nome)))
  where global = true;

create unique index if not exists categorias_exercicios_personal_nome_uidx
  on public.categorias_exercicios (personal_id, lower(trim(nome)))
  where global = false;

alter table public.categorias_exercicios enable row level security;

drop policy if exists "Categorias visiveis ao personal" on public.categorias_exercicios;
create policy "Categorias visiveis ao personal"
on public.categorias_exercicios for select to authenticated
using (global = true or personal_id = (select auth.uid()));

drop policy if exists "Personal cria suas categorias" on public.categorias_exercicios;
create policy "Personal cria suas categorias"
on public.categorias_exercicios for insert to authenticated
with check (global = false and personal_id = (select auth.uid()));

drop policy if exists "Personal edita suas categorias" on public.categorias_exercicios;
create policy "Personal edita suas categorias"
on public.categorias_exercicios for update to authenticated
using (global = false and personal_id = (select auth.uid()))
with check (global = false and personal_id = (select auth.uid()));

drop policy if exists "Personal exclui suas categorias" on public.categorias_exercicios;
create policy "Personal exclui suas categorias"
on public.categorias_exercicios for delete to authenticated
using (global = false and personal_id = (select auth.uid()));

grant select, insert, update, delete on public.categorias_exercicios to authenticated;

insert into public.categorias_exercicios (nome, global, personal_id)
select v.nome, true, null
from (values
  ('Peito'), ('Costas'), ('Bíceps'), ('Tríceps'),
  ('Ombro'), ('Trapézio'), ('Pernas'), ('Outros')
) as v(nome)
where not exists (
  select 1 from public.categorias_exercicios c
  where c.global = true and lower(trim(c.nome)) = lower(trim(v.nome))
);

insert into public.categorias_exercicios (nome, global, personal_id)
select distinct trim(e.grupo_muscular), false, e.personal_id
from public.exercicios e
where e.global = false
  and e.personal_id is not null
  and nullif(trim(coalesce(e.grupo_muscular, '')), '') is not null
  and not exists (
    select 1 from public.categorias_exercicios c
    where c.personal_id = e.personal_id
      and c.global = false
      and lower(trim(c.nome)) = lower(trim(e.grupo_muscular))
  )
  and not exists (
    select 1 from public.categorias_exercicios c
    where c.global = true
      and lower(trim(c.nome)) = lower(trim(e.grupo_muscular))
  );

alter table public.exercicios
  add column if not exists categoria_id uuid null
  references public.categorias_exercicios(id) on delete restrict;

update public.exercicios e
set categoria_id = c.id
from public.categorias_exercicios c
where e.categoria_id is null
  and c.global = true
  and lower(trim(c.nome)) = lower(trim(coalesce(e.grupo_muscular, '')));

update public.exercicios e
set categoria_id = c.id
from public.categorias_exercicios c
where e.categoria_id is null
  and e.personal_id is not null
  and c.global = false
  and c.personal_id = e.personal_id
  and lower(trim(c.nome)) = lower(trim(coalesce(e.grupo_muscular, '')));

update public.exercicios e
set categoria_id = c.id
from public.categorias_exercicios c
where e.categoria_id is null
  and c.global = true
  and c.nome = 'Outros';

alter table public.exercicios alter column categoria_id set not null;
create index if not exists exercicios_categoria_id_idx on public.exercicios(categoria_id);