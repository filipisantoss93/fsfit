-- FS Fit — correções do fluxo Em aula
-- 1) Permite ao aluno cancelar o check-in enquanto aguarda confirmação.
-- 2) Mantém sessões aguardando/em aula sincronizadas com alterações de exercícios.
-- 3) Troca automaticamente o treino vinculado à sessão quando outro treino é ativado.

create or replace function public.cancelar_checkin_aluno_sessao(p_access_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aluno_id uuid;
  v_sessao_id uuid;
begin
  select a.id into v_aluno_id
  from public.alunos a
  where a.access_token = p_access_token
    and a.link_ativo = true
  limit 1;

  if v_aluno_id is null then
    raise exception 'Acesso do aluno inválido';
  end if;

  select s.id into v_sessao_id
  from public.sessoes_treino s
  where s.aluno_id = v_aluno_id
    and s.status = 'aguardando_confirmacao'
  order by s.checkin_at desc
  limit 1
  for update;

  if v_sessao_id is null then
    return false;
  end if;

  update public.sessoes_treino
  set status = 'cancelada',
      finalizada_at = now(),
      updated_at = now()
  where id = v_sessao_id
    and status = 'aguardando_confirmacao';

  if not found then
    return false;
  end if;

  delete from public.notificacoes
  where tipo = 'checkin'
    and link = '/painel.html?checkin=' || v_sessao_id::text;

  return true;
end;
$$;

revoke all on function public.cancelar_checkin_aluno_sessao(uuid) from public;
grant execute on function public.cancelar_checkin_aluno_sessao(uuid) to anon, authenticated;

create or replace function public.fsfit_sincronizar_exercicio_sessao_ativa()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_dia_atual integer := extract(isodow from (now() at time zone 'America/Sao_Paulo'))::integer;
begin
  if tg_op = 'DELETE' then
    delete from public.sessao_exercicios se
    using public.sessoes_treino s
    where se.sessao_id = s.id
      and se.treino_exercicio_id = old.id
      and s.status in ('aguardando_confirmacao', 'em_aula');
    return old;
  end if;

  if tg_op = 'UPDATE' then
    delete from public.sessao_exercicios se
    using public.sessoes_treino s
    where se.sessao_id = s.id
      and se.treino_exercicio_id = old.id
      and s.status in ('aguardando_confirmacao', 'em_aula')
      and (
        new.treino_id is distinct from old.treino_id
        or new.dia_semana <> v_dia_atual
      );
  end if;

  if new.dia_semana = v_dia_atual then
    insert into public.sessao_exercicios(
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
      s.id,
      new.id,
      new.exercicio_id,
      new.ordem,
      coalesce(e.nome, 'Exercício'),
      new.series,
      new.repeticoes,
      new.carga,
      new.descanso_segundos,
      new.observacoes
    from public.sessoes_treino s
    left join public.exercicios e on e.id = new.exercicio_id
    where s.treino_id = new.treino_id
      and s.status in ('aguardando_confirmacao', 'em_aula')
    on conflict (sessao_id, treino_exercicio_id)
    where treino_exercicio_id is not null
    do update set
      exercicio_id = excluded.exercicio_id,
      ordem = excluded.ordem,
      nome = excluded.nome,
      series = excluded.series,
      repeticoes = excluded.repeticoes,
      carga = excluded.carga,
      descanso_segundos = excluded.descanso_segundos,
      observacoes = excluded.observacoes;
  end if;

  return new;
end;
$$;

create or replace function public.fsfit_atualizar_sessao_ao_ativar_treino()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessao record;
begin
  if new.aluno_id is null
     or coalesce(new.modelo, false) = true
     or new.status::text <> 'ativo' then
    return new;
  end if;

  for v_sessao in
    select s.id
    from public.sessoes_treino s
    where s.personal_id = new.personal_id
      and s.aluno_id = new.aluno_id
      and s.status in ('aguardando_confirmacao', 'em_aula')
      and s.treino_id is distinct from new.id
  loop
    update public.sessoes_treino
    set treino_id = new.id,
        updated_at = now()
    where id = v_sessao.id;

    perform public.sincronizar_exercicios_sessao(v_sessao.id);
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_fsfit_atualizar_sessao_ao_ativar_treino on public.treinos;
create trigger trg_fsfit_atualizar_sessao_ao_ativar_treino
after insert or update of status on public.treinos
for each row execute function public.fsfit_atualizar_sessao_ao_ativar_treino();

notify pgrst, 'reload schema';
