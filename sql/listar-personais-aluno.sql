-- FS Fit — resolve todos os personais vinculados a um WhatsApp de aluno ativo.
-- Usado pela Área do aluno oficial para decidir entre acesso direto ou seleção de acompanhamento.

create or replace function public.fsfit_listar_personais_aluno(p_telefone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tel text;
  v_result jsonb;
begin
  v_tel := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  if length(v_tel) = 13 and left(v_tel, 2) = '55' then
    v_tel := substr(v_tel, 3);
  end if;

  if v_tel !~ '^[0-9]{11}$' then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'personal_id', x.personal_id,
        'slug', x.slug,
        'nome', x.nome,
        'foto_url', x.foto_url,
        'descricao', x.descricao,
        'local_trabalho', x.local_trabalho,
        'cidade', x.cidade
      ) order by x.nome
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select distinct on (a.personal_id)
      a.personal_id,
      pp.slug,
      coalesce(nullif(pp.nome_publico, ''), nullif(p.nome, ''), 'Personal trainer') as nome,
      coalesce(nullif(pp.foto_url, ''), nullif(p.avatar_url, '')) as foto_url,
      nullif(pp.bio, '') as descricao,
      nullif(pp.local_trabalho, '') as local_trabalho,
      nullif(pp.cidade, '') as cidade
    from public.alunos a
    join public.perfis p on p.id = a.personal_id
    join public.perfis_publicos pp on pp.personal_id = a.personal_id
    where a.status = 'ativo'
      and p.ativo = true
      and pp.publicado = true
      and regexp_replace(coalesce(a.telefone, ''), '\D', '', 'g') = v_tel
    order by a.personal_id, pp.updated_at desc nulls last
  ) x;

  return v_result;
end;
$$;

revoke all on function public.fsfit_listar_personais_aluno(text) from public;
grant execute on function public.fsfit_listar_personais_aluno(text) to anon, authenticated;

notify pgrst, 'reload schema';