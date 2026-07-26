create schema if not exists fsfit_internal;

alter table public.app_runtime_secrets
  add column if not exists efi_webhook_secret text;

create unique index if not exists cobrancas_pix_e2e_id_unique
  on public.cobrancas_pix (e2e_id)
  where e2e_id is not null
    and btrim(e2e_id) <> '';

create or replace function fsfit_internal.marcar_cobranca_pix_paga(
  p_cobranca_id uuid,
  p_txid text,
  p_personal_id uuid default null,
  p_pago_em timestamptz default now(),
  p_e2e_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_processada boolean := false;
begin
  if p_cobranca_id is null or nullif(btrim(p_txid), '') is null then
    return false;
  end if;

  update public.cobrancas_pix
     set status = 'paga',
         pago_em = coalesce(p_pago_em, pago_em, now()),
         e2e_id = coalesce(nullif(btrim(p_e2e_id), ''), e2e_id),
         updated_at = now()
   where id = p_cobranca_id
     and txid = p_txid
     and (p_personal_id is null or personal_id = p_personal_id)
     and processada_em is null
     and status in ('pendente', 'expirada', 'paga');

  v_processada := found;
  return v_processada;
end;
$$;

revoke all on function fsfit_internal.marcar_cobranca_pix_paga(uuid, text, uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function fsfit_internal.marcar_cobranca_pix_paga(uuid, text, uuid, timestamptz, text) to service_role;

create or replace function public.fsfit_baixar_pix_webhook(
  p_token text,
  p_txid text,
  p_pago_em timestamptz default now(),
  p_e2e_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_cobranca_id uuid;
begin
  select efi_webhook_secret
    into v_token
    from public.app_runtime_secrets
   where id = 1;

  if v_token is null or p_token is distinct from v_token then
    return false;
  end if;

  select id
    into v_cobranca_id
    from public.cobrancas_pix
   where txid = p_txid;

  if v_cobranca_id is null then
    return false;
  end if;

  return fsfit_internal.marcar_cobranca_pix_paga(
    v_cobranca_id,
    p_txid,
    null,
    p_pago_em,
    p_e2e_id
  );
end;
$$;

revoke all on function public.fsfit_baixar_pix_webhook(text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.fsfit_baixar_pix_webhook(text, text, timestamptz, text) to service_role;

create or replace function public.fsfit_baixar_pix_verificacao(
  p_cobranca_id uuid,
  p_txid text,
  p_personal_id uuid,
  p_pago_em timestamptz default now(),
  p_e2e_id text default null
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select fsfit_internal.marcar_cobranca_pix_paga(
    p_cobranca_id,
    p_txid,
    p_personal_id,
    p_pago_em,
    p_e2e_id
  );
$$;

revoke all on function public.fsfit_baixar_pix_verificacao(uuid, text, uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.fsfit_baixar_pix_verificacao(uuid, text, uuid, timestamptz, text) to service_role;