-- FS Fit — Chat vinculado à sessão de aula
-- O chat existe somente enquanto a sessão estiver com status em_aula.
-- Ao finalizar a aula, a sessão deixa de ser retornada pelas RPCs do chat.

create table if not exists public.sessao_mensagens (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.sessoes_treino(id) on delete cascade,
  autor_tipo text not null check (autor_tipo in ('aluno','personal')),
  autor_id uuid,
  mensagem text not null check (char_length(trim(mensagem)) between 1 and 3000),
  created_at timestamptz not null default now()
);

create index if not exists sessao_mensagens_sessao_created_idx
  on public.sessao_mensagens(sessao_id, created_at);

alter table public.sessao_mensagens enable row level security;

drop policy if exists sessao_mensagens_personal_select on public.sessao_mensagens;
create policy sessao_mensagens_personal_select on public.sessao_mensagens
for select to authenticated
using (exists (
  select 1 from public.sessoes_treino s
  where s.id = sessao_id and s.personal_id = auth.uid()
));

drop policy if exists sessao_mensagens_personal_insert on public.sessao_mensagens;
create policy sessao_mensagens_personal_insert on public.sessao_mensagens
for insert to authenticated
with check (autor_tipo = 'personal' and autor_id = auth.uid() and exists (
  select 1 from public.sessoes_treino s
  where s.id = sessao_id and s.personal_id = auth.uid() and s.status = 'em_aula'
));

-- O portal do aluno acessa o chat pelas RPCs get_aluno_chat_sessao e
-- enviar_aluno_mensagem_sessao, validadas pelo token individual do aluno.
-- Ambas aceitam somente sessões em_aula. O encerramento da aula fecha
-- automaticamente a conversa para novas mensagens.