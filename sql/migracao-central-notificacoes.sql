-- FS Fit — Central de notificações
-- Estrutura base para notificações entre personal, aluno e administração.
-- Execute no SQL Editor do Supabase antes de ativar os fluxos de geração de notificações.

create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null,
  destinatario_tipo text not null check (destinatario_tipo in ('personal', 'aluno', 'admin')),
  remetente_id uuid null,
  remetente_tipo text null check (remetente_tipo is null or remetente_tipo in ('personal', 'aluno', 'admin', 'suporte', 'sistema')),
  tipo text not null default 'geral',
  titulo text not null,
  mensagem text not null default '',
  link text null,
  lida boolean not null default false,
  created_at timestamptz not null default now(),
  lida_em timestamptz null
);

create index if not exists notificacoes_destinatario_created_idx
  on public.notificacoes (destinatario_id, created_at desc);

create index if not exists notificacoes_destinatario_nao_lidas_idx
  on public.notificacoes (destinatario_id, lida)
  where lida = false;

alter table public.notificacoes enable row level security;

drop policy if exists "usuario le proprias notificacoes" on public.notificacoes;
create policy "usuario le proprias notificacoes"
  on public.notificacoes
  for select
  to authenticated
  using (auth.uid() = destinatario_id);

drop policy if exists "usuario atualiza proprias notificacoes" on public.notificacoes;
create policy "usuario atualiza proprias notificacoes"
  on public.notificacoes
  for update
  to authenticated
  using (auth.uid() = destinatario_id)
  with check (auth.uid() = destinatario_id);

-- A criação de notificações deve ocorrer por funções security definer específicas
-- de cada fluxo (personal -> aluno, aluno -> personal, suporte -> admin), evitando
-- inserts diretos e impedindo falsificação de remetente pelo cliente.
