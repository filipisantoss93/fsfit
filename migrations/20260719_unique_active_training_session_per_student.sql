create unique index if not exists sessoes_treino_uma_ativa_por_aluno_idx
on public.sessoes_treino (personal_id, aluno_id)
where status in ('aguardando_confirmacao', 'em_aula');
