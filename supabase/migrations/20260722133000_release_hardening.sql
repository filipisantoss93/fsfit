-- FS Fit 1.0 release hardening
-- Consolida as correções aplicadas em produção em 22/07/2026.

create or replace function public.fsfit_tem_acesso_premium(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_user_id is null then false
    when exists (
      select 1 from public.platform_admins pa where pa.user_id = p_user_id
    ) then true
    else exists (
      select 1
      from public.perfis p
      where p.id = p_user_id
        and p.ativo = true
        and (
          (p.trial_fim is not null and p.trial_fim > now())
          or exists (
            select 1
            from public.assinaturas a
            where a.personal_id = p_user_id
              and a.status in ('ativa', 'cancelada')
              and a.acesso_valido_ate is not null
              and a.acesso_valido_ate > now()
          )
        )
    )
  end;
$$;

revoke all on function public.fsfit_tem_acesso_premium(uuid) from public, anon;
grant execute on function public.fsfit_tem_acesso_premium(uuid) to authenticated;

-- RLS restritiva para impedir bypass direto da interface em recursos Premium.
do $$
declare
  t text;
  tables text[] := array[
    'alunos','treinos','treino_exercicios','exercicios','planos_alimentares','refeicoes','refeicao_itens',
    'agenda_agendamentos','mensalidades_alunos','historico_peso','avaliacoes','aluno_midias','lembretes',
    'biblioteca_refeicoes','biblioteca_refeicao_itens','modelos_dieta','modelo_dieta_refeicoes','modelo_dieta_itens'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on public.%I', 'fsfit_premium_insert', t);
    execute format('drop policy if exists %I on public.%I', 'fsfit_premium_update', t);
    execute format('drop policy if exists %I on public.%I', 'fsfit_premium_delete', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.fsfit_tem_acesso_premium((select auth.uid())))', 'fsfit_premium_insert', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.fsfit_tem_acesso_premium((select auth.uid()))) with check (public.fsfit_tem_acesso_premium((select auth.uid())))', 'fsfit_premium_update', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.fsfit_tem_acesso_premium((select auth.uid())))', 'fsfit_premium_delete', t);
  end loop;
end $$;

-- Proteção em trigger também cobre RPCs SECURITY DEFINER chamadas por um personal autenticado.
create or replace function public.fsfit_guard_premium_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row jsonb;
  v_personal_id uuid;
begin
  if v_uid is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if public.fsfit_is_admin(v_uid) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  if nullif(v_row ->> 'personal_id', '') is not null then
    v_personal_id := (v_row ->> 'personal_id')::uuid;
  elsif tg_table_name = 'treino_exercicios' then
    select t.personal_id into v_personal_id from public.treinos t where t.id = (v_row ->> 'treino_id')::uuid;
  elsif tg_table_name = 'refeicoes' then
    select p.personal_id into v_personal_id from public.planos_alimentares p where p.id = (v_row ->> 'plano_alimentar_id')::uuid;
  elsif tg_table_name = 'refeicao_itens' then
    select p.personal_id into v_personal_id
    from public.refeicoes r
    join public.planos_alimentares p on p.id = r.plano_alimentar_id
    where r.id = (v_row ->> 'refeicao_id')::uuid;
  elsif tg_table_name = 'biblioteca_refeicao_itens' then
    select b.personal_id into v_personal_id from public.biblioteca_refeicoes b where b.id = (v_row ->> 'refeicao_biblioteca_id')::uuid;
  elsif tg_table_name = 'modelo_dieta_refeicoes' then
    select m.personal_id into v_personal_id from public.modelos_dieta m where m.id = (v_row ->> 'modelo_dieta_id')::uuid;
  elsif tg_table_name = 'modelo_dieta_itens' then
    select m.personal_id into v_personal_id
    from public.modelo_dieta_refeicoes mr
    join public.modelos_dieta m on m.id = mr.modelo_dieta_id
    where mr.id = (v_row ->> 'modelo_refeicao_id')::uuid;
  elsif tg_table_name in ('sessao_exercicios', 'sessao_mensagens') then
    select s.personal_id into v_personal_id from public.sessoes_treino s where s.id = (v_row ->> 'sessao_id')::uuid;
  elsif tg_table_name = 'mensagens' then
    select c.personal_id into v_personal_id from public.conversas c where c.id = (v_row ->> 'conversa_id')::uuid;
  end if;

  if v_personal_id = v_uid and not public.fsfit_tem_acesso_premium(v_uid) then
    raise exception 'Recurso disponível apenas durante o período de teste ou com assinatura ativa' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.fsfit_guard_premium_write() from public, anon, authenticated;

do $$
declare
  t text;
  tables text[] := array[
    'alunos','treinos','treino_exercicios','exercicios','planos_alimentares','refeicoes','refeicao_itens',
    'agenda_agendamentos','agenda_cancelamentos','mensalidades_alunos','historico_peso','avaliacoes','aluno_midias','lembretes',
    'biblioteca_refeicoes','biblioteca_refeicao_itens','modelos_dieta','modelo_dieta_refeicoes','modelo_dieta_itens',
    'sessoes_treino','sessao_exercicios','sessao_mensagens','conversas','mensagens'
  ];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists fsfit_guard_premium_write_trigger on public.%I', t);
    execute format('create trigger fsfit_guard_premium_write_trigger before insert or update or delete on public.%I for each row execute function public.fsfit_guard_premium_write()', t);
  end loop;
end $$;

-- Índices de cobertura para todas as FKs que estavam sem índice.
create index if not exists agenda_agendamentos_aluno_id_idx on public.agenda_agendamentos(aluno_id);
create index if not exists agenda_agendamentos_treino_id_idx on public.agenda_agendamentos(treino_id);
create index if not exists agenda_cancelamentos_aluno_id_idx on public.agenda_cancelamentos(aluno_id);
create index if not exists agenda_cancelamentos_treino_id_idx on public.agenda_cancelamentos(treino_id);
create index if not exists biblioteca_refeicao_itens_alimento_id_idx on public.biblioteca_refeicao_itens(alimento_id);
create index if not exists biblioteca_refeicoes_origem_global_id_idx on public.biblioteca_refeicoes(origem_global_id);
create index if not exists contatos_suporte_respostas_autor_id_idx on public.contatos_suporte_respostas(autor_id);
create index if not exists exercicios_origem_global_id_idx on public.exercicios(origem_global_id);
create index if not exists modelo_dieta_itens_alimento_id_idx on public.modelo_dieta_itens(alimento_id);
create index if not exists modelo_dieta_refeicoes_categoria_id_idx on public.modelo_dieta_refeicoes(categoria_id);
create index if not exists modelos_dieta_origem_global_id_idx on public.modelos_dieta(origem_global_id);
create index if not exists refeicao_itens_alimento_id_idx on public.refeicao_itens(alimento_id);
create index if not exists sessao_exercicios_exercicio_id_idx on public.sessao_exercicios(exercicio_id);
create index if not exists sessao_exercicios_treino_exercicio_id_idx on public.sessao_exercicios(treino_exercicio_id);
create index if not exists sessoes_treino_treino_id_idx on public.sessoes_treino(treino_id);

-- Reduz superfície de RPCs SECURITY DEFINER que não precisam ser públicas.
revoke all on function public.fsfit_admin_contar_alunos_usuarios(uuid[]) from public, anon;
grant execute on function public.fsfit_admin_contar_alunos_usuarios(uuid[]) to authenticated;
revoke all on function public.fsfit_baixar_pix_webhook(text, text, timestamp with time zone, text) from public, anon, authenticated;
grant execute on function public.fsfit_baixar_pix_webhook(text, text, timestamp with time zone, text) to service_role;
revoke all on function public.set_perfil_publico_whatsapp() from public, anon, authenticated;
revoke all on function public.sync_perfil_publico_whatsapp_on_perfil_update() from public, anon, authenticated;

-- Remove policies permissivas redundantes sem alterar a regra final de autorização.
drop policy if exists "admin responde contatos" on public.contatos_suporte_respostas;
drop policy if exists "usuario responde proprio contato" on public.contatos_suporte_respostas;
drop policy if exists "resposta suporte insert permitido" on public.contatos_suporte_respostas;
create policy "resposta suporte insert permitido"
on public.contatos_suporte_respostas
for insert to authenticated
with check (
  (autor_id = (select auth.uid()) and autor_tipo = 'admin' and exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid())))
  or
  (autor_id = (select auth.uid()) and autor_tipo = 'usuario' and exists (select 1 from public.contatos_suporte c where c.id = contatos_suporte_respostas.contato_id and c.user_id = (select auth.uid())))
);
drop policy if exists perfis_select_own on public.perfis;

-- Normaliza auth.uid() em policies críticas para evitar reavaliação por linha.
do $$
declare
  r record;
  roles_sql text;
  using_sql text;
  check_sql text;
  create_sql text;
begin
  for r in
    select * from pg_policies
    where schemaname = 'public'
      and (
        (tablename = 'contatos_suporte' and policyname in ('admin atualiza contatos','usuario cria contato proprio','usuario ve contatos proprios'))
        or (tablename = 'aluno_midias' and policyname = 'Personal gerencia midias dos proprios alunos')
        or (tablename = 'platform_admins' and policyname = 'admins podem ver proprio acesso')
        or (tablename = 'contatos_suporte_respostas' and policyname in ('usuario ve respostas do proprio contato','resposta suporte insert permitido'))
        or (tablename = 'perfis' and policyname = 'admin ve perfis para suporte')
        or (tablename = 'sessoes_treino' and policyname = 'sessoes_treino_personal_select')
        or (tablename = 'sessao_exercicios' and policyname in ('sessao_exercicios_personal_select','sessao_exercicios_personal_insert','sessao_exercicios_personal_update','sessao_exercicios_personal_delete'))
        or (tablename = 'sessao_mensagens' and policyname in ('sessao_mensagens_personal_select','sessao_mensagens_personal_insert'))
        or (tablename = 'agenda_cancelamentos' and policyname = 'agenda_cancelamentos_select_own')
        or (tablename = 'agenda_agendamentos' and policyname in ('agenda_agendamentos_select_own','agenda_agendamentos_insert_own','agenda_agendamentos_update_own','agenda_agendamentos_delete_own'))
      )
  loop
    select string_agg(quote_ident(role_name), ', ') into roles_sql from unnest(r.roles) as role_name;
    using_sql := case when r.qual is null then null else replace(r.qual, 'auth.uid()', '(select auth.uid())') end;
    check_sql := case when r.with_check is null then null else replace(r.with_check, 'auth.uid()', '(select auth.uid())') end;
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    create_sql := format('create policy %I on %I.%I as %s for %s to %s', r.policyname, r.schemaname, r.tablename, r.permissive, r.cmd, roles_sql);
    if using_sql is not null then create_sql := create_sql || ' using (' || using_sql || ')'; end if;
    if check_sql is not null then create_sql := create_sql || ' with check (' || check_sql || ')'; end if;
    execute create_sql;
  end loop;
end $$;