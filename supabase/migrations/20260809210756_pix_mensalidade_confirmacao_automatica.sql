-- Pix dinâmico aluno -> personal com confirmação automática e reconciliação.
-- As credenciais Efí de cada personal são mantidas no Supabase Vault.

create table if not exists public.integracoes_pix_personal (
  personal_id uuid primary key references public.perfis(id) on delete cascade,
  provedor text not null default 'efi',
  ambiente text not null default 'producao',
  pix_chave text not null,
  vault_secret_id uuid,
  webhook_token_hash text,
  status text not null default 'pendente',
  validado_em timestamptz,
  webhook_configurado_em timestamptz,
  ultimo_erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integracoes_pix_personal_provedor_check
    check (provedor = 'efi'),
  constraint integracoes_pix_personal_ambiente_check
    check (ambiente in ('homologacao', 'producao')),
  constraint integracoes_pix_personal_status_check
    check (status in ('pendente', 'ativa', 'erro', 'desativada')),
  constraint integracoes_pix_personal_pix_chave_check
    check (char_length(btrim(pix_chave)) between 3 and 200),
  constraint integracoes_pix_personal_webhook_hash_check
    check (webhook_token_hash is null or webhook_token_hash ~ '^[a-f0-9]{64}$')
);

create unique index if not exists integracoes_pix_personal_webhook_token_uidx
  on public.integracoes_pix_personal(webhook_token_hash)
  where webhook_token_hash is not null;

create index if not exists integracoes_pix_personal_status_idx
  on public.integracoes_pix_personal(status, updated_at desc);

alter table public.integracoes_pix_personal enable row level security;
revoke all on table public.integracoes_pix_personal from public, anon, authenticated;
grant all on table public.integracoes_pix_personal to service_role;

create table if not exists public.cobrancas_pix_mensalidades (
  id uuid primary key default gen_random_uuid(),
  mensalidade_id uuid not null references public.mensalidades_alunos(id) on delete cascade,
  personal_id uuid not null references public.perfis(id) on delete cascade,
  aluno_id uuid not null references public.alunos(id) on delete cascade,
  provedor text not null default 'efi',
  txid text not null,
  status text not null default 'criando',
  valor numeric(12,2) not null,
  vence_em timestamptz not null,
  pix_copia_cola text,
  loc_id text,
  loc_url text,
  e2e_id text,
  pago_em timestamptz,
  payload_efi jsonb not null default '{}'::jsonb,
  ultimo_erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cobrancas_pix_mensalidades_provedor_check
    check (provedor = 'efi'),
  constraint cobrancas_pix_mensalidades_status_check
    check (status in ('criando', 'pendente', 'paga', 'expirada', 'cancelada', 'erro')),
  constraint cobrancas_pix_mensalidades_valor_check
    check (valor > 0),
  constraint cobrancas_pix_mensalidades_txid_check
    check (txid ~ '^[A-Za-z0-9]{26,35}$')
);

create unique index if not exists cobrancas_pix_mensalidades_txid_uidx
  on public.cobrancas_pix_mensalidades(txid);

create unique index if not exists cobrancas_pix_mensalidades_e2e_uidx
  on public.cobrancas_pix_mensalidades(e2e_id)
  where e2e_id is not null;

create unique index if not exists cobrancas_pix_mensalidades_ativa_uidx
  on public.cobrancas_pix_mensalidades(mensalidade_id)
  where status in ('criando', 'pendente');

create index if not exists cobrancas_pix_mensalidades_personal_status_idx
  on public.cobrancas_pix_mensalidades(personal_id, status, created_at desc);

create index if not exists cobrancas_pix_mensalidades_aluno_idx
  on public.cobrancas_pix_mensalidades(aluno_id, created_at desc);

create index if not exists cobrancas_pix_mensalidades_pendentes_idx
  on public.cobrancas_pix_mensalidades(vence_em, created_at)
  where status in ('criando', 'pendente');

alter table public.cobrancas_pix_mensalidades enable row level security;
revoke all on table public.cobrancas_pix_mensalidades from public, anon, authenticated;
grant all on table public.cobrancas_pix_mensalidades to service_role;

alter table public.mensalidades_alunos
  add column if not exists pago_em timestamptz,
  add column if not exists meio_pagamento text,
  add column if not exists confirmacao_origem text,
  add column if not exists pix_e2e_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'mensalidades_alunos_meio_pagamento_check'
      and conrelid = 'public.mensalidades_alunos'::regclass
  ) then
    alter table public.mensalidades_alunos
      add constraint mensalidades_alunos_meio_pagamento_check
      check (meio_pagamento is null or meio_pagamento in ('pix', 'manual'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'mensalidades_alunos_confirmacao_origem_check'
      and conrelid = 'public.mensalidades_alunos'::regclass
  ) then
    alter table public.mensalidades_alunos
      add constraint mensalidades_alunos_confirmacao_origem_check
      check (
        confirmacao_origem is null
        or confirmacao_origem in ('manual_personal', 'pix_webhook', 'pix_reconciliacao')
      );
  end if;
end
$$;

create unique index if not exists mensalidades_alunos_pix_e2e_uidx
  on public.mensalidades_alunos(pix_e2e_id)
  where pix_e2e_id is not null;

create or replace function public.fsfit_salvar_integracao_pix_personal(
  p_personal_id uuid,
  p_ambiente text,
  p_pix_chave text,
  p_segredo jsonb,
  p_webhook_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_secret_name text := 'fsfit_efi_pix_personal_' || p_personal_id::text;
begin
  if p_personal_id is null
     or p_ambiente not in ('homologacao', 'producao')
     or char_length(btrim(coalesce(p_pix_chave, ''))) not between 3 and 200
     or coalesce(p_webhook_token_hash, '') !~ '^[a-f0-9]{64}$' then
    raise exception 'Configuração Pix automática inválida.';
  end if;

  if not exists (
    select 1
    from public.perfis p
    where p.id = p_personal_id
      and p.tipo = 'personal'
  ) then
    raise exception 'Personal não encontrado.';
  end if;

  if p_segredo is null
     or jsonb_typeof(p_segredo) <> 'object'
     or char_length(coalesce(p_segredo ->> 'client_id', '')) < 8
     or char_length(coalesce(p_segredo ->> 'client_secret', '')) < 8
     or char_length(coalesce(p_segredo ->> 'certificado_pem', '')) < 100
     or octet_length(p_segredo::text) > 200000 then
    raise exception 'Credenciais Efí inválidas.';
  end if;

  select i.vault_secret_id
    into v_secret_id
  from public.integracoes_pix_personal i
  where i.personal_id = p_personal_id;

  if v_secret_id is null then
    select s.id
      into v_secret_id
    from vault.secrets s
    where s.name = v_secret_name
    limit 1;
  end if;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      p_segredo::text,
      v_secret_name,
      'Credenciais Efí Pix do personal ' || p_personal_id::text,
      null
    );
  else
    perform vault.update_secret(
      v_secret_id,
      p_segredo::text,
      v_secret_name,
      'Credenciais Efí Pix do personal ' || p_personal_id::text,
      null
    );
  end if;

  insert into public.integracoes_pix_personal (
    personal_id,
    ambiente,
    pix_chave,
    vault_secret_id,
    webhook_token_hash,
    status,
    ultimo_erro,
    updated_at
  ) values (
    p_personal_id,
    p_ambiente,
    btrim(p_pix_chave),
    v_secret_id,
    p_webhook_token_hash,
    'pendente',
    null,
    now()
  )
  on conflict (personal_id) do update
    set ambiente = excluded.ambiente,
        pix_chave = excluded.pix_chave,
        vault_secret_id = excluded.vault_secret_id,
        webhook_token_hash = excluded.webhook_token_hash,
        status = 'pendente',
        ultimo_erro = null,
        updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'personal_id', p_personal_id,
    'ambiente', p_ambiente,
    'status', 'pendente'
  );
end;
$$;

revoke all on function public.fsfit_salvar_integracao_pix_personal(uuid,text,text,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.fsfit_salvar_integracao_pix_personal(uuid,text,text,jsonb,text)
  to service_role;

create or replace function public.fsfit_obter_segredo_integracao_pix_personal(
  p_personal_id uuid,
  p_exigir_ativa boolean default true
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select (d.decrypted_secret::jsonb) || jsonb_build_object(
    'personal_id', i.personal_id,
    'ambiente', i.ambiente,
    'pix_chave', i.pix_chave,
    'status', i.status
  )
  from public.integracoes_pix_personal i
  join vault.decrypted_secrets d on d.id = i.vault_secret_id
  where i.personal_id = p_personal_id
    and (not coalesce(p_exigir_ativa, true) or i.status = 'ativa')
  limit 1;
$$;

revoke all on function public.fsfit_obter_segredo_integracao_pix_personal(uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.fsfit_obter_segredo_integracao_pix_personal(uuid,boolean)
  to service_role;

create or replace function public.fsfit_atualizar_status_integracao_pix_personal(
  p_personal_id uuid,
  p_status text,
  p_ultimo_erro text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('pendente', 'ativa', 'erro', 'desativada') then
    raise exception 'Status de integração inválido.';
  end if;

  update public.integracoes_pix_personal
     set status = p_status,
         validado_em = case when p_status = 'ativa' then now() else validado_em end,
         webhook_configurado_em = case when p_status = 'ativa' then now() else webhook_configurado_em end,
         ultimo_erro = case when p_status = 'ativa' then null else left(p_ultimo_erro, 1000) end,
         updated_at = now()
   where personal_id = p_personal_id;

  return found;
end;
$$;

revoke all on function public.fsfit_atualizar_status_integracao_pix_personal(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.fsfit_atualizar_status_integracao_pix_personal(uuid,text,text)
  to service_role;

create or replace function public.fsfit_desativar_integracao_pix_personal(
  p_personal_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  select i.vault_secret_id
    into v_secret_id
  from public.integracoes_pix_personal i
  where i.personal_id = p_personal_id
  for update;

  if not found then
    return true;
  end if;

  update public.integracoes_pix_personal
     set status = 'desativada',
         vault_secret_id = null,
         webhook_token_hash = null,
         ultimo_erro = null,
         updated_at = now()
   where personal_id = p_personal_id;

  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;

  return true;
end;
$$;

revoke all on function public.fsfit_desativar_integracao_pix_personal(uuid)
  from public, anon, authenticated;
grant execute on function public.fsfit_desativar_integracao_pix_personal(uuid)
  to service_role;

create or replace function public.fsfit_reservar_cobranca_pix_mensalidade(
  p_session_token text,
  p_mensalidade_id uuid,
  p_txid text,
  p_vence_em timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aluno public.alunos%rowtype;
  v_mensalidade public.mensalidades_alunos%rowtype;
  v_cobranca public.cobrancas_pix_mensalidades%rowtype;
  v_integracao public.integracoes_pix_personal%rowtype;
begin
  if coalesce(p_session_token, '') !~ '^[a-f0-9]{64}$'
     or p_mensalidade_id is null
     or coalesce(p_txid, '') !~ '^[A-Za-z0-9]{26,35}$'
     or p_vence_em <= now() + interval '5 minutes'
     or p_vence_em > now() + interval '2 days' then
    return jsonb_build_object('ok', false, 'erro', 'dados_invalidos');
  end if;

  select a.*
    into v_aluno
  from public.aluno_sessoes s
  join public.alunos a on a.id = s.aluno_id
  where s.token_hash = encode(
      extensions.digest(convert_to(p_session_token, 'UTF8'), 'sha256'),
      'hex'
    )
    and s.revogada_em is null
    and s.expira_em > now()
    and a.status = 'ativo'
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'sessao_invalida');
  end if;

  select m.*
    into v_mensalidade
  from public.mensalidades_alunos m
  where m.id = p_mensalidade_id
    and m.aluno_id = v_aluno.id
    and m.personal_id = v_aluno.personal_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'mensalidade_nao_encontrada');
  end if;

  if v_mensalidade.status = 'pago' then
    return jsonb_build_object('ok', true, 'pago', true, 'status', 'pago');
  end if;

  if v_mensalidade.status not in ('pendente', 'informado') then
    return jsonb_build_object('ok', false, 'erro', 'mensalidade_indisponivel');
  end if;

  select i.*
    into v_integracao
  from public.integracoes_pix_personal i
  where i.personal_id = v_mensalidade.personal_id
    and i.status = 'ativa'
    and i.vault_secret_id is not null
    and i.webhook_token_hash is not null;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'pix_automatico_nao_configurado');
  end if;

  update public.cobrancas_pix_mensalidades c
     set status = case when c.status = 'pendente' then 'expirada' else 'erro' end,
         ultimo_erro = case when c.status = 'criando' then 'Reserva de cobrança expirada.' else c.ultimo_erro end,
         updated_at = now()
   where c.mensalidade_id = v_mensalidade.id
     and (
       (c.status = 'pendente' and c.vence_em <= now())
       or (c.status = 'criando' and c.updated_at < now() - interval '15 minutes')
     );

  select c.*
    into v_cobranca
  from public.cobrancas_pix_mensalidades c
  where c.mensalidade_id = v_mensalidade.id
    and c.status in ('criando', 'pendente')
  order by c.created_at desc
  limit 1;

  if found then
    if v_cobranca.status = 'pendente' and v_cobranca.pix_copia_cola is not null then
      return jsonb_build_object(
        'ok', true,
        'reutilizada', true,
        'cobranca_id', v_cobranca.id,
        'txid', v_cobranca.txid,
        'status', v_cobranca.status,
        'valor', v_cobranca.valor,
        'vence_em', v_cobranca.vence_em,
        'pix_copia_cola', v_cobranca.pix_copia_cola,
        'loc_url', v_cobranca.loc_url
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'processando', true,
      'cobranca_id', v_cobranca.id,
      'status', v_cobranca.status
    );
  end if;

  insert into public.cobrancas_pix_mensalidades (
    mensalidade_id,
    personal_id,
    aluno_id,
    txid,
    status,
    valor,
    vence_em
  ) values (
    v_mensalidade.id,
    v_mensalidade.personal_id,
    v_mensalidade.aluno_id,
    p_txid,
    'criando',
    v_mensalidade.valor,
    p_vence_em
  )
  returning * into v_cobranca;

  return jsonb_build_object(
    'ok', true,
    'reutilizada', false,
    'cobranca_id', v_cobranca.id,
    'txid', v_cobranca.txid,
    'status', v_cobranca.status,
    'personal_id', v_cobranca.personal_id,
    'aluno_id', v_cobranca.aluno_id,
    'aluno_nome', v_aluno.nome,
    'competencia', v_mensalidade.competencia,
    'vencimento', v_mensalidade.vencimento,
    'valor', v_cobranca.valor,
    'vence_em', v_cobranca.vence_em,
    'pix_chave', v_integracao.pix_chave,
    'ambiente', v_integracao.ambiente
  );
end;
$$;

revoke all on function public.fsfit_reservar_cobranca_pix_mensalidade(text,uuid,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.fsfit_reservar_cobranca_pix_mensalidade(text,uuid,text,timestamptz)
  to service_role;

create or replace function public.fsfit_finalizar_cobranca_pix_mensalidade(
  p_cobranca_id uuid,
  p_txid text,
  p_pix_copia_cola text,
  p_loc_id text,
  p_loc_url text,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_personal_id uuid;
begin
  if char_length(coalesce(p_pix_copia_cola, '')) < 50 then
    raise exception 'Payload Pix inválido.';
  end if;

  update public.cobrancas_pix_mensalidades
     set status = 'pendente',
         pix_copia_cola = p_pix_copia_cola,
         loc_id = nullif(left(p_loc_id, 200), ''),
         loc_url = nullif(left(p_loc_url, 1000), ''),
         payload_efi = coalesce(p_payload, '{}'::jsonb),
         ultimo_erro = null,
         updated_at = now()
   where id = p_cobranca_id
     and txid = p_txid
     and status = 'criando'
  returning personal_id into v_personal_id;

  if not found then
    return exists (
      select 1
      from public.cobrancas_pix_mensalidades c
      where c.id = p_cobranca_id
        and c.txid = p_txid
        and c.status in ('pendente', 'paga')
    );
  end if;

  insert into public.eventos_financeiros (
    personal_id,
    origem,
    tipo_evento,
    referencia_externa,
    cobranca_id,
    status_anterior,
    status_novo,
    sucesso,
    metadados
  ) values (
    v_personal_id,
    'criar-pix-mensalidade-aluno',
    'pix_mensalidade_criado',
    p_txid,
    p_cobranca_id,
    'criando',
    'pendente',
    true,
    jsonb_build_object('loc_id', p_loc_id)
  );

  return true;
end;
$$;

revoke all on function public.fsfit_finalizar_cobranca_pix_mensalidade(uuid,text,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.fsfit_finalizar_cobranca_pix_mensalidade(uuid,text,text,text,text,jsonb)
  to service_role;

create or replace function public.fsfit_falhar_cobranca_pix_mensalidade(
  p_cobranca_id uuid,
  p_erro text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charge public.cobrancas_pix_mensalidades%rowtype;
begin
  update public.cobrancas_pix_mensalidades
     set status = 'erro',
         ultimo_erro = left(coalesce(p_erro, 'Erro ao criar cobrança Pix.'), 1000),
         updated_at = now()
   where id = p_cobranca_id
     and status = 'criando'
  returning * into v_charge;

  if found then
    insert into public.eventos_financeiros (
      personal_id, origem, tipo_evento, referencia_externa, cobranca_id,
      status_anterior, status_novo, sucesso, codigo_erro, mensagem_resumida
    ) values (
      v_charge.personal_id, 'criar-pix-mensalidade-aluno', 'falha_pix_mensalidade',
      v_charge.txid, v_charge.id, 'criando', 'erro', false,
      'CRIAR_PIX_MENSALIDADE', left(coalesce(p_erro, 'Erro desconhecido'), 500)
    );
  end if;

  return true;
end;
$$;

revoke all on function public.fsfit_falhar_cobranca_pix_mensalidade(uuid,text)
  from public, anon, authenticated;
grant execute on function public.fsfit_falhar_cobranca_pix_mensalidade(uuid,text)
  to service_role;

create or replace function public.fsfit_baixar_pix_mensalidade(
  p_txid text,
  p_pago_em timestamptz,
  p_e2e_id text,
  p_valor numeric,
  p_payload jsonb,
  p_origem text,
  p_webhook_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charge public.cobrancas_pix_mensalidades%rowtype;
  v_mensalidade_status text;
  v_pago_em timestamptz := coalesce(p_pago_em, now());
  v_e2e_id text := nullif(left(btrim(coalesce(p_e2e_id, '')), 120), '');
  v_token_hash text;
  v_origem_relatorio text;
begin
  if p_origem not in ('pix_webhook', 'pix_reconciliacao') then
    return jsonb_build_object('ok', false, 'erro', 'origem_invalida');
  end if;

  select c.*
    into v_charge
  from public.cobrancas_pix_mensalidades c
  where c.txid = p_txid
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'cobranca_nao_encontrada');
  end if;

  if p_origem = 'pix_webhook' then
    if char_length(coalesce(p_webhook_token, '')) < 24 then
      return jsonb_build_object('ok', false, 'erro', 'token_invalido');
    end if;

    v_token_hash := encode(
      extensions.digest(convert_to(p_webhook_token, 'UTF8'), 'sha256'),
      'hex'
    );

    if not exists (
      select 1
      from public.integracoes_pix_personal i
      where i.personal_id = v_charge.personal_id
        and i.status = 'ativa'
        and i.webhook_token_hash = v_token_hash
    ) then
      return jsonb_build_object('ok', false, 'erro', 'token_invalido');
    end if;
  end if;

  if v_charge.status = 'paga' then
    return jsonb_build_object('ok', true, 'duplicado', true, 'status', 'pago');
  end if;

  if v_charge.status not in ('criando', 'pendente', 'expirada') then
    return jsonb_build_object('ok', false, 'erro', 'estado_invalido');
  end if;

  if p_valor is null or abs(p_valor - v_charge.valor) >= 0.01 then
    insert into public.eventos_financeiros (
      personal_id, origem, tipo_evento, referencia_externa, cobranca_id,
      status_anterior, status_novo, sucesso, codigo_erro, mensagem_resumida,
      metadados
    ) values (
      v_charge.personal_id, p_origem, 'pix_mensalidade_valor_divergente',
      v_charge.txid, v_charge.id, v_charge.status, v_charge.status, false,
      'VALOR_DIVERGENTE', 'Valor recebido difere da mensalidade.',
      jsonb_build_object('esperado', v_charge.valor, 'recebido', p_valor)
    );

    return jsonb_build_object('ok', false, 'erro', 'valor_divergente');
  end if;

  if v_e2e_id is not null and exists (
    select 1
    from public.cobrancas_pix_mensalidades c
    where c.e2e_id = v_e2e_id
      and c.id <> v_charge.id
  ) then
    return jsonb_build_object('ok', false, 'erro', 'e2e_duplicado');
  end if;

  select m.status
    into v_mensalidade_status
  from public.mensalidades_alunos m
  where m.id = v_charge.mensalidade_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'mensalidade_nao_encontrada');
  end if;

  v_origem_relatorio := case
    when p_origem = 'pix_webhook' then 'pix_webhook'
    else 'pix_reconciliacao'
  end;

  update public.cobrancas_pix_mensalidades
     set status = 'paga',
         e2e_id = v_e2e_id,
         pago_em = v_pago_em,
         payload_efi = coalesce(p_payload, payload_efi),
         ultimo_erro = null,
         updated_at = now()
   where id = v_charge.id;

  update public.mensalidades_alunos
     set status = 'pago',
         confirmado_em = v_pago_em,
         pago_em = v_pago_em,
         meio_pagamento = 'pix',
         confirmacao_origem = v_origem_relatorio,
         pix_e2e_id = coalesce(v_e2e_id, pix_e2e_id),
         updated_at = now()
   where id = v_charge.mensalidade_id;

  if v_mensalidade_status <> 'pago' then
    insert into public.notificacoes (
      destinatario_id,
      destinatario_tipo,
      remetente_id,
      remetente_tipo,
      tipo,
      titulo,
      mensagem,
      link
    )
    select
      v_charge.personal_id,
      'personal',
      a.id,
      'aluno',
      'mensalidade_pix_confirmada',
      'Pix confirmado automaticamente',
      a.nome || ' pagou a mensalidade via Pix. O recebimento já foi lançado no Financeiro.',
      'financeiro.html'
    from public.alunos a
    where a.id = v_charge.aluno_id;
  end if;

  insert into public.eventos_financeiros (
    personal_id, origem, tipo_evento, referencia_externa, cobranca_id,
    status_anterior, status_novo, sucesso, metadados
  ) values (
    v_charge.personal_id, p_origem, 'pix_mensalidade_confirmado',
    v_charge.txid, v_charge.id, v_charge.status, 'paga', true,
    jsonb_build_object(
      'mensalidade_id', v_charge.mensalidade_id,
      'aluno_id', v_charge.aluno_id,
      'e2e_id', v_e2e_id,
      'valor', p_valor
    )
  );

  return jsonb_build_object(
    'ok', true,
    'duplicado', false,
    'status', 'pago',
    'mensalidade_id', v_charge.mensalidade_id,
    'personal_id', v_charge.personal_id
  );
end;
$$;

revoke all on function public.fsfit_baixar_pix_mensalidade(text,timestamptz,text,numeric,jsonb,text,text)
  from public, anon, authenticated;
grant execute on function public.fsfit_baixar_pix_mensalidade(text,timestamptz,text,numeric,jsonb,text,text)
  to service_role;

create or replace function public.fsfit_atualizar_estado_cobranca_pix_mensalidade(
  p_txid text,
  p_status text,
  p_payload jsonb default null,
  p_erro text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('pendente', 'expirada', 'cancelada', 'erro') then
    raise exception 'Status de cobrança inválido.';
  end if;

  update public.cobrancas_pix_mensalidades
     set status = p_status,
         payload_efi = coalesce(p_payload, payload_efi),
         ultimo_erro = left(p_erro, 1000),
         updated_at = now()
   where txid = p_txid
     and status <> 'paga';

  return found;
end;
$$;

revoke all on function public.fsfit_atualizar_estado_cobranca_pix_mensalidade(text,text,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.fsfit_atualizar_estado_cobranca_pix_mensalidade(text,text,jsonb,text)
  to service_role;

create or replace function public.fsfit_obter_status_mensalidade_aluno(
  p_session_token text,
  p_mensalidade_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'ok', true,
        'id', m.id,
        'status', m.status,
        'confirmado_em', m.confirmado_em,
        'pago_em', m.pago_em,
        'meio_pagamento', m.meio_pagamento,
        'confirmacao_origem', m.confirmacao_origem
      )
      from public.aluno_sessoes s
      join public.alunos a on a.id = s.aluno_id
      join public.mensalidades_alunos m
        on m.aluno_id = a.id
       and m.personal_id = a.personal_id
      where s.token_hash = encode(
          extensions.digest(convert_to(p_session_token, 'UTF8'), 'sha256'),
          'hex'
        )
        and s.revogada_em is null
        and s.expira_em > now()
        and a.status = 'ativo'
        and m.id = p_mensalidade_id
      limit 1
    ),
    jsonb_build_object('ok', false, 'erro', 'mensalidade_nao_encontrada')
  );
$$;

revoke all on function public.fsfit_obter_status_mensalidade_aluno(text,uuid)
  from public, authenticated;
grant execute on function public.fsfit_obter_status_mensalidade_aluno(text,uuid)
  to anon, service_role;

create or replace function public.fsfit_obter_mensalidade_aluno(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aluno public.alunos%rowtype;
  v_personal public.perfis%rowtype;
  v_cobranca public.mensalidades_alunos%rowtype;
  v_competencia date := date_trunc('month', current_date)::date;
  v_ultimo_dia integer;
  v_dia integer;
  v_vencimento date;
  v_pix_automatico boolean := false;
begin
  select a.*
    into v_aluno
  from public.aluno_sessoes s
  join public.alunos a on a.id = s.aluno_id
  where s.token_hash = encode(extensions.digest(convert_to(p_session_token, 'UTF8'), 'sha256'), 'hex')
    and s.revogada_em is null
    and s.expira_em > now()
    and a.status = 'ativo'
  limit 1;

  if not found then
    return jsonb_build_object('ativa', false, 'erro', 'sessao_invalida');
  end if;

  if not coalesce(v_aluno.mensalidade_ativa, false)
     or v_aluno.mensalidade_valor is null
     or v_aluno.mensalidade_valor <= 0
     or v_aluno.mensalidade_dia_vencimento is null then
    return jsonb_build_object('ativa', false);
  end if;

  select * into v_personal
  from public.perfis
  where id = v_aluno.personal_id;

  select exists (
    select 1
    from public.integracoes_pix_personal i
    where i.personal_id = v_aluno.personal_id
      and i.status = 'ativa'
      and i.vault_secret_id is not null
      and i.webhook_token_hash is not null
  ) into v_pix_automatico;

  v_ultimo_dia := extract(day from (v_competencia + interval '1 month - 1 day'))::integer;
  v_dia := least(greatest(v_aluno.mensalidade_dia_vencimento::integer, 1), v_ultimo_dia);
  v_vencimento := make_date(
    extract(year from v_competencia)::integer,
    extract(month from v_competencia)::integer,
    v_dia
  );

  insert into public.mensalidades_alunos (
    personal_id, aluno_id, competencia, vencimento, valor
  ) values (
    v_aluno.personal_id, v_aluno.id, v_competencia, v_vencimento, v_aluno.mensalidade_valor
  )
  on conflict (aluno_id, competencia) do nothing;

  select * into v_cobranca
  from public.mensalidades_alunos
  where aluno_id = v_aluno.id
    and status <> 'pago'
  order by vencimento asc, created_at asc
  limit 1;

  if not found then
    select * into v_cobranca
    from public.mensalidades_alunos
    where aluno_id = v_aluno.id
      and competencia = v_competencia
    limit 1;
  end if;

  return jsonb_build_object(
    'ativa', true,
    'id', v_cobranca.id,
    'valor', v_cobranca.valor,
    'competencia', v_cobranca.competencia,
    'vencimento', v_cobranca.vencimento,
    'status', v_cobranca.status,
    'informado_em', v_cobranca.informado_em,
    'confirmado_em', v_cobranca.confirmado_em,
    'pago_em', v_cobranca.pago_em,
    'meio_pagamento', v_cobranca.meio_pagamento,
    'confirmacao_origem', v_cobranca.confirmacao_origem,
    'pix_automatico', v_pix_automatico,
    'pix_tipo', v_personal.pix_tipo,
    'pix_chave', v_personal.pix_chave,
    'pix_nome_recebedor', v_personal.pix_nome_recebedor,
    'pix_cidade', v_personal.pix_cidade,
    'personal_nome', v_personal.nome
  );
end;
$$;

create or replace function public.fsfit_confirmar_pagamento_mensalidade(p_mensalidade_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.';
  end if;

  update public.mensalidades_alunos
     set status = 'pago',
         confirmado_em = now(),
         pago_em = now(),
         meio_pagamento = 'manual',
         confirmacao_origem = 'manual_personal',
         pix_e2e_id = null,
         updated_at = now()
   where id = p_mensalidade_id
     and personal_id = v_uid
     and status in ('pendente', 'informado');

  if not found then
    raise exception 'Mensalidade não encontrada, já paga ou sem permissão.';
  end if;

  return true;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mensalidades_alunos'
  ) then
    alter publication supabase_realtime add table public.mensalidades_alunos;
  end if;
end
$$;

do $$
declare
  v_job_id bigint;
begin
  select jobid
    into v_job_id
  from cron.job
  where jobname = 'fsfit-reconciliar-pix-mensalidades'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'fsfit-reconciliar-pix-mensalidades',
    '*/5 * * * *',
    $cron$
    select net.http_post(
      url := 'https://jjpijncxlkwutbnkpsaw.supabase.co/functions/v1/reconciliar-pix-mensalidades',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select cron_secret from public.app_runtime_secrets where id = 1)
      ),
      body := jsonb_build_object('triggered_at', now())
    );
    $cron$
  );
end
$$;
