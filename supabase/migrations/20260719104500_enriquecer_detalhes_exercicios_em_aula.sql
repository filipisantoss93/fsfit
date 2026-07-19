create or replace function public.get_aluno_sessao_treino(p_access_token uuid)
returns table(
  sessao_id uuid,
  treino_id uuid,
  treino_nome text,
  status text,
  checkin_at timestamptz,
  iniciado_at timestamptz,
  exercicios jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_sessao_id uuid;
begin
  select s.id into v_sessao_id
  from public.alunos a
  join public.sessoes_treino s on s.aluno_id = a.id
    and s.status in ('aguardando_confirmacao','em_aula')
  where a.access_token = p_access_token
    and a.link_ativo = true
  order by s.created_at desc
  limit 1;

  if v_sessao_id is null then
    return;
  end if;

  perform public.sincronizar_exercicios_sessao(v_sessao_id);

  return query
  select
    s.id,
    s.treino_id,
    t.nome,
    s.status,
    s.checkin_at,
    s.iniciado_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', se.id,
          'treino_exercicio_id', se.treino_exercicio_id,
          'exercicio_id', se.exercicio_id,
          'nome', se.nome,
          'ordem', se.ordem,
          'series', se.series,
          'repeticoes', se.repeticoes,
          'carga', se.carga,
          'descanso_segundos', se.descanso_segundos,
          'observacoes', se.observacoes,
          'duracao_minutos', te.duracao_minutos,
          'distancia_km', te.distancia_km,
          'grupo_muscular', e.grupo_muscular,
          'equipamento', e.equipamento,
          'instrucoes', e.instrucoes,
          'video_url', e.video_url,
          'imagem_url', e.imagem_url,
          'concluido', se.concluido,
          'concluido_at', se.concluido_at
        ) order by se.ordem
      ) filter (where se.id is not null),
      '[]'::jsonb
    )
  from public.sessoes_treino s
  join public.treinos t on t.id = s.treino_id
  left join public.sessao_exercicios se on se.sessao_id = s.id
  left join public.treino_exercicios te on te.id = se.treino_exercicio_id
  left join public.exercicios e on e.id = coalesce(se.exercicio_id, te.exercicio_id)
  where s.id = v_sessao_id
  group by s.id, s.treino_id, t.nome, s.status, s.checkin_at, s.iniciado_at;
end;
$function$;
