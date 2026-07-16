-- Corrige o cadastro de dispositivos push do personal.
-- Antes, dispositivos_push.aluno_id era NOT NULL, impedindo registrar
-- dispositivos vinculados somente ao usuário autenticado do personal.

alter table public.dispositivos_push
  alter column aluno_id drop not null;

alter table public.dispositivos_push
  drop constraint if exists dispositivos_push_destinatario_chk;

alter table public.dispositivos_push
  add constraint dispositivos_push_destinatario_chk
  check (aluno_id is not null or auth_user_id is not null);

create index if not exists dispositivos_push_auth_user_ativo_idx
  on public.dispositivos_push(auth_user_id)
  where auth_user_id is not null and ativo = true;
