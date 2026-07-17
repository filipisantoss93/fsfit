-- FS Fit — central de notificações do portal do aluno

create index if not exists notificacoes_aluno_feed_idx
  on public.notificacoes(destinatario_tipo, destinatario_id, created_at desc);

create index if not exists notificacoes_aluno_unread_idx
  on public.notificacoes(destinatario_id, lida)
  where destinatario_tipo = 'aluno';

create or replace function public.get_aluno_id_sessao(p_session_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.id
  from public.alunos a
  where a.access_token = public.get_aluno_portal_token(p_session_token)
    and a.status = 'ativo'
  limit 1;
$$;

create or replace function public.listar_notificacoes_aluno(p_session_token text)
returns table(
  id uuid,
  tipo text,
  titulo text,
  mensagem text,
  link text,
  lida boolean,
  created_at timestamptz,
  lida_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.tipo, n.titulo, n.mensagem, n.link, n.lida, n.created_at, n.lida_em
  from public.notificacoes n
  where n.destinatario_id = public.get_aluno_id_sessao(p_session_token)
    and n.destinatario_tipo = 'aluno'
  order by n.created_at desc
  limit 30;
$$;

create or replace function public.contar_notificacoes_nao_lidas_aluno(p_session_token text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from public.notificacoes n
  where n.destinatario_id = public.get_aluno_id_sessao(p_session_token)
    and n.destinatario_tipo = 'aluno'
    and n.lida = false;
$$;

create or replace function public.marcar_notificacao_aluno_lida(p_session_token text, p_notificacao_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notificacoes
  set lida = true,
      lida_em = coalesce(lida_em, now())
  where id = p_notificacao_id
    and destinatario_id = public.get_aluno_id_sessao(p_session_token)
    and destinatario_tipo = 'aluno';
  return found;
end;
$$;

create or replace function public.marcar_todas_notificacoes_aluno_lidas(p_session_token text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  update public.notificacoes
  set lida = true,
      lida_em = coalesce(lida_em, now())
  where destinatario_id = public.get_aluno_id_sessao(p_session_token)
    and destinatario_tipo = 'aluno'
    and lida = false;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.limpar_notificacoes_aluno(p_session_token text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count bigint;
begin
  delete from public.notificacoes
  where destinatario_id = public.get_aluno_id_sessao(p_session_token)
    and destinatario_tipo = 'aluno';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.get_aluno_id_sessao(text) from public;
revoke all on function public.listar_notificacoes_aluno(text) from public;
revoke all on function public.contar_notificacoes_nao_lidas_aluno(text) from public;
revoke all on function public.marcar_notificacao_aluno_lida(text, uuid) from public;
revoke all on function public.marcar_todas_notificacoes_aluno_lidas(text) from public;
revoke all on function public.limpar_notificacoes_aluno(text) from public;

grant execute on function public.listar_notificacoes_aluno(text) to anon, authenticated;
grant execute on function public.contar_notificacoes_nao_lidas_aluno(text) to anon, authenticated;
grant execute on function public.marcar_notificacao_aluno_lida(text, uuid) to anon, authenticated;
grant execute on function public.marcar_todas_notificacoes_aluno_lidas(text) to anon, authenticated;
grant execute on function public.limpar_notificacoes_aluno(text) to anon, authenticated;

create or replace function public.registrar_notificacao_lembrete_aluno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'processando' and old.status is distinct from new.status then
    insert into public.notificacoes(
      destinatario_id, destinatario_tipo, remetente_id, remetente_tipo,
      tipo, titulo, mensagem, link, lida
    ) values (
      new.aluno_id, 'aluno', new.personal_id, 'personal',
      'lembrete', coalesce(new.titulo, 'Lembrete do seu personal'),
      coalesce(new.mensagem, ''), '/aluno.html', false
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notificacao_lembrete_aluno on public.lembretes;
create trigger trg_notificacao_lembrete_aluno
after update of status on public.lembretes
for each row
execute function public.registrar_notificacao_lembrete_aluno();

create or replace function public.registrar_notificacao_chat_aluno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aluno_id uuid;
  v_personal_id uuid;
begin
  if new.autor_tipo <> 'personal' then
    return new;
  end if;

  select s.aluno_id, s.personal_id
    into v_aluno_id, v_personal_id
  from public.sessoes_treino s
  where s.id = new.sessao_id
  limit 1;

  if v_aluno_id is not null then
    insert into public.notificacoes(
      destinatario_id, destinatario_tipo, remetente_id, remetente_tipo,
      tipo, titulo, mensagem, link, lida
    ) values (
      v_aluno_id, 'aluno', v_personal_id, 'personal',
      'chat', 'Nova mensagem do seu personal',
      left(coalesce(new.mensagem, ''), 240), '/aluno.html', false
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notificacao_chat_aluno on public.sessao_mensagens;
create trigger trg_notificacao_chat_aluno
after insert on public.sessao_mensagens
for each row
execute function public.registrar_notificacao_chat_aluno();

notify pgrst, 'reload schema';
