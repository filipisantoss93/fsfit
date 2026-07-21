create table if not exists public.agenda_agendamentos (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references auth.users(id) on delete cascade,
  aluno_id uuid not null references public.alunos(id) on delete cascade,
  treino_id uuid references public.treinos(id) on delete set null,
  data date not null,
  horario time,
  local text,
  titulo text,
  created_at timestamptz not null default now()
);

create index if not exists agenda_agendamentos_personal_data_idx
  on public.agenda_agendamentos (personal_id, data, horario);

alter table public.agenda_agendamentos enable row level security;

drop policy if exists agenda_agendamentos_select_own on public.agenda_agendamentos;
create policy agenda_agendamentos_select_own
on public.agenda_agendamentos
for select
to authenticated
using (personal_id = auth.uid());

drop policy if exists agenda_agendamentos_insert_own on public.agenda_agendamentos;
create policy agenda_agendamentos_insert_own
on public.agenda_agendamentos
for insert
to authenticated
with check (personal_id = auth.uid());

drop policy if exists agenda_agendamentos_update_own on public.agenda_agendamentos;
create policy agenda_agendamentos_update_own
on public.agenda_agendamentos
for update
to authenticated
using (personal_id = auth.uid())
with check (personal_id = auth.uid());

drop policy if exists agenda_agendamentos_delete_own on public.agenda_agendamentos;
create policy agenda_agendamentos_delete_own
on public.agenda_agendamentos
for delete
to authenticated
using (personal_id = auth.uid());

grant select, insert, update, delete on public.agenda_agendamentos to authenticated;
