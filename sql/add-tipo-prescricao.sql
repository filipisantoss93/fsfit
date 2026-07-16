-- Tipos de prescrição dos exercícios: repetições, tempo ou distância.
-- Migração idempotente para o Supabase do FS Fit.

alter table public.exercicios
  add column if not exists tipo_prescricao text not null default 'repeticoes';

alter table public.exercicios
  drop constraint if exists exercicios_tipo_prescricao_check;

alter table public.exercicios
  add constraint exercicios_tipo_prescricao_check
  check (tipo_prescricao in ('repeticoes', 'tempo', 'distancia'));

alter table public.treino_exercicios
  add column if not exists duracao_minutos numeric(8,2),
  add column if not exists distancia_km numeric(10,3);

alter table public.treino_exercicios
  drop constraint if exists treino_exercicios_duracao_minutos_check;

alter table public.treino_exercicios
  add constraint treino_exercicios_duracao_minutos_check
  check (duracao_minutos is null or duracao_minutos >= 0);

alter table public.treino_exercicios
  drop constraint if exists treino_exercicios_distancia_km_check;

alter table public.treino_exercicios
  add constraint treino_exercicios_distancia_km_check
  check (distancia_km is null or distancia_km >= 0);

comment on column public.exercicios.tipo_prescricao is 'repeticoes, tempo ou distancia';
comment on column public.treino_exercicios.duracao_minutos is 'Duração prescrita em minutos para exercícios por tempo';
comment on column public.treino_exercicios.distancia_km is 'Distância prescrita em quilômetros para exercícios por distância';
