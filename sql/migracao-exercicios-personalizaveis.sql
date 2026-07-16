-- FS Fit — permite ao personal criar uma versão própria de um exercício global
-- Esta migração já pode ser aplicada com segurança mais de uma vez.

alter table public.exercicios
  add column if not exists origem_global_id uuid null references public.exercicios(id) on delete set null;

create unique index if not exists exercicios_personal_origem_global_unique
  on public.exercicios (personal_id, origem_global_id)
  where origem_global_id is not null and global = false;

comment on column public.exercicios.origem_global_id is
  'Referencia o exercicio global original quando o personal cria uma versao personalizada.';
