-- FS Fit — Portal do aluno com exercícios estruturados e vídeos
-- A migração equivalente já foi aplicada no Supabase de produção.

create or replace function public.get_aluno_portal(p_access_token uuid)
returns table(aluno_nome text, aluno_sexo text, treino text, dieta text, personal_nome text, personal_whatsapp text, plano_atualizado_em timestamp with time zone, midias jsonb)
language sql
stable security definer
set search_path to 'public'
as $function$
  select
    a.nome,
    a.sexo::text,
    coalesce((
      select jsonb_build_object(
        'descricao', coalesce(tr.descricao, ''),
        'exercicios', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', te.id,
            'ordem', te.ordem,
            'dia_semana', te.dia_semana,
            'series', te.series,
            'repeticoes', te.repeticoes,
            'carga', te.carga,
            'descanso_segundos', te.descanso_segundos,
            'observacoes', te.observacoes,
            'nome', e.nome,
            'grupo_muscular', e.grupo_muscular,
            'equipamento', e.equipamento,
            'instrucoes', e.instrucoes,
            'video_url', e.video_url
          ) order by coalesce(te.dia_semana, 99), te.ordem, e.nome)
          from public.treino_exercicios te
          join public.exercicios e on e.id = te.exercicio_id
          where te.treino_id = tr.id
        ), '[]'::jsonb)
      )::text
      from public.treinos tr
      where tr.aluno_id = a.id
      order by (tr.status = 'ativo') desc, tr.updated_at desc
      limit 1
    ), '{"descricao":"","exercicios":[]}'::text),
    coalesce(pa.orientacoes, ''),
    p.nome,
    p.telefone,
    greatest(
      coalesce((select max(tr2.updated_at) from public.treinos tr2 where tr2.aluno_id = a.id), a.updated_at),
      coalesce(pa.updated_at, a.updated_at)
    ),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'tipo', m.tipo,
        'titulo', m.titulo,
        'url', m.url,
        'created_at', m.created_at
      ) order by m.created_at desc)
      from public.aluno_midias m
      where m.aluno_id = a.id
    ), '[]'::jsonb)
  from public.alunos a
  join public.perfis p on p.id = a.personal_id
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
$function$;