-- Auditoria P0: endurecer baixa PIX por webhook.
-- Não aplicar diretamente em produção sem teste em ambiente separado.

create unique index if not exists cobrancas_pix_e2e_id_unique
  on public.cobrancas_pix (e2e_id)
  where e2e_id is not null;

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
as $function$
declare
  v_ok boolean := false;
  v_token text;
begin
  select cron_secret
    into v_token
    from public.app_runtime_secrets
   where id = 1;

  if v_token is null or p_token is distinct from v_token then
    return false;
  end if;

  if p_txid is null or btrim(p_txid) = '' then
    return false;
  end if;

  update public.cobrancas_pix
     set status = 'paga',
         pago_em = coalesce(p_pago_em, now()),
         e2e_id = coalesce(nullif(btrim(p_e2e_id), ''), e2e_id),
         updated_at = now()
   where txid = btrim(p_txid)
     and processada_em is null
     and status in ('pendente', 'expirada', 'paga')
     and (
       p_e2e_id is null
       or btrim(p_e2e_id) = ''
       or e2e_id is null
       or e2e_id = btrim(p_e2e_id)
     );

  v_ok := found;
  return v_ok;
end;
$function$;

revoke all on function public.fsfit_baixar_pix_webhook(text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.fsfit_baixar_pix_webhook(text, text, timestamptz, text) to service_role;

comment on function public.fsfit_baixar_pix_webhook(text, text, timestamptz, text)
is 'Baixa idempotente de PIX por webhook, restrita ao service_role e protegida por txid, estado e e2e_id.';
