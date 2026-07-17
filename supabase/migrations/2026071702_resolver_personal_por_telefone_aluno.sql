create or replace function public.fsfit_resolver_personal_aluno(p_telefone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tel text;
  v_slug text;
begin
  v_tel := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  if length(v_tel) = 13 and left(v_tel, 2) = '55' then
    v_tel := substr(v_tel, 3);
  end if;

  if v_tel !~ '^[0-9]{11}$' then
    return null;
  end if;

  select pp.slug
    into v_slug
  from public.alunos a
  join public.perfis_publicos pp on pp.personal_id = a.personal_id
  where a.status = 'ativo'
    and pp.publicado = true
    and regexp_replace(a.telefone, '\D', '', 'g') = v_tel
  limit 1;

  return v_slug;
end;
$$;

revoke all on function public.fsfit_resolver_personal_aluno(text) from public;
grant execute on function public.fsfit_resolver_personal_aluno(text) to anon, authenticated;
