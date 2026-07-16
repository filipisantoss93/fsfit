-- FS Fit — sincroniza alterações do treino com sessões em aula
-- Adicionar, editar ou remover exercícios no treino ativo passa a refletir na sessão em andamento.

create unique index if not exists sessao_exercicios_sessao_treino_exercicio_uidx
  on public.sessao_exercicios(sessao_id, treino_exercicio_id)
  where treino_exercicio_id is not null;

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
      and s.status = 'em_aula';
    return old;
  end if;

  if tg_op = 'UPDATE' then
    delete from public.sessao_exercicios se
    using public.sessoes_treino s
    where se.sessao_id = s.id
      and se.treino_exercicio_id = old.id
      and s.status = 'em_aula'
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
      and s.status = 'em_aula'
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

drop trigger if exists trg_fsfit_sincronizar_exercicio_sessao_ativa on public.treino_exercicios;
create trigger trg_fsfit_sincronizar_exercicio_sessao_ativa
after insert or update or delete on public.treino_exercicios
for each row execute function public.fsfit_sincronizar_exercicio_sessao_ativa();

notify pgrst, 'reload schema';