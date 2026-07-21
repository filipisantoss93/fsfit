create table if not exists public.agenda_cancelamentos (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references auth.users(id) on delete cascade,
  aluno_id uuid not null references public.alunos(id) on delete cascade,
  treino_id uuid not null references public.treinos(id) on delete cascade,
  data date not null,
  created_at timestamptz not null default now(),
  unique (personal_id, aluno_id, treino_id, data)
);

alter table public.agenda_cancelamentos enable row level security;

drop policy if exists agenda_cancelamentos_select_own on public.agenda_cancelamentos;
create policy agenda_cancelamentos_select_own
on public.agenda_cancelamentos
for select
to authenticated
using (personal_id = auth.uid());

grant select on public.agenda_cancelamentos to authenticated;

create or replace function public.cancelar_agendamento_personal(
  p_aluno_id uuid,
  p_treino_id uuid,
  p_data date default current_date
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_day smallint := extract(dow from p_data)::smallint;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if not exists (
    select 1
    from public.treinos t
    where t.id = p_treino_id
      and t.aluno_id = p_aluno_id
      and t.personal_id = v_uid
      and t.status = 'ativo'
      and coalesce(t.modelo, false) = false
      and v_day = any(t.dias_semana)
  ) then
    raise exception 'Agendamento não encontrado ou sem permissão.';
  end if;

  insert into public.agenda_cancelamentos (personal_id, aluno_id, treino_id, data)
  values (v_uid, p_aluno_id, p_treino_id, p_data)
  on conflict (personal_id, aluno_id, treino_id, data) do nothing;

  return true;
end;
$$;

revoke execute on function public.cancelar_agendamento_personal(uuid, uuid, date) from public;
revoke execute on function public.cancelar_agendamento_personal(uuid, uuid, date) from anon;
grant execute on function public.cancelar_agendamento_personal(uuid, uuid, date) to authenticated;
