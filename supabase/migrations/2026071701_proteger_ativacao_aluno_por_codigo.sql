alter table public.alunos
  add column if not exists ativacao_validada_ate timestamptz;

create or replace function public.fsfit_normalizar_telefone_aluno()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tel text;
begin
  v_tel := regexp_replace(coalesce(new.telefone, ''), '\D', '', 'g');
  if length(v_tel) = 13 and left(v_tel, 2) = '55' then
    v_tel := substr(v_tel, 3);
  end if;
  new.telefone := v_tel;
  return new;
end;
$$;

drop trigger if exists alunos_normalizar_telefone on public.alunos;
create trigger alunos_normalizar_telefone
before insert or update of telefone on public.alunos
for each row execute function public.fsfit_normalizar_telefone_aluno();

update public.alunos
set telefone = regexp_replace(telefone, '\D', '', 'g')
where telefone is not null;

update public.alunos
set telefone = substr(telefone, 3)
where telefone ~ '^55[0-9]{11}$';

create or replace function public.fsfit_validar_codigo_ativacao_aluno(
  p_personal_slug text,
  p_telefone text,
  p_codigo text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tel text;
  v_aluno_id uuid;
  v_hash text;
  v_expira timestamptz;
  v_concluido boolean;
begin
  v_tel := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  if length(v_tel) = 13 and left(v_tel, 2) = '55' then
    v_tel := substr(v_tel, 3);
  end if;

  if v_tel !~ '^[0-9]{11}$' or coalesce(p_codigo, '') !~ '^[0-9]{6}$' then
    return false;
  end if;

  select a.id, a.codigo_ativacao_hash, a.codigo_ativacao_expira_em, a.primeiro_acesso_concluido
    into v_aluno_id, v_hash, v_expira, v_concluido
  from public.alunos a
  join public.perfis_publicos pp on pp.personal_id = a.personal_id
  where pp.slug = lower(trim(coalesce(p_personal_slug, '')))
    and pp.publicado = true
    and a.status = 'ativo'
    and regexp_replace(a.telefone, '\D', '', 'g') = v_tel
  limit 1;

  if v_aluno_id is null
     or coalesce(v_concluido, false)
     or v_hash is null
     or v_expira is null
     or v_expira <= now()
     or encode(extensions.digest(p_codigo, 'sha256'), 'hex') is distinct from v_hash then
    return false;
  end if;

  update public.alunos
  set ativacao_validada_ate = now() + interval '2 minutes'
  where id = v_aluno_id;

  return true;
end;
$$;

revoke all on function public.fsfit_validar_codigo_ativacao_aluno(text, text, text) from public;
grant execute on function public.fsfit_validar_codigo_ativacao_aluno(text, text, text) to anon, authenticated;

create or replace function public.fsfit_proteger_primeiro_acesso_aluno()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(old.primeiro_acesso_concluido, false) = false
     and coalesce(new.primeiro_acesso_concluido, false) = true
     and old.codigo_ativacao_hash is not null
     and new.codigo_ativacao_hash is null then
    if old.ativacao_validada_ate is null or old.ativacao_validada_ate <= now() then
      raise exception 'Código de ativação não validado ou expirado';
    end if;
    new.ativacao_validada_ate := null;
  end if;
  return new;
end;
$$;

drop trigger if exists alunos_proteger_primeiro_acesso on public.alunos;
create trigger alunos_proteger_primeiro_acesso
before update on public.alunos
for each row execute function public.fsfit_proteger_primeiro_acesso_aluno();
