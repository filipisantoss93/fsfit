-- Lote 2: segurança financeira da assinatura

create table if not exists public.assinatura_rate_limits (
  escopo text not null,
  sujeito text not null,
  janela_inicio timestamptz not null,
  tentativas integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (escopo, sujeito)
);

alter table public.assinatura_rate_limits enable row level security;
revoke all on table public.assinatura_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.assinatura_rate_limits to service_role;

create or replace function public.fsfit_consumir_rate_limit_assinatura(
  p_escopo text,
  p_sujeito text,
  p_limite integer,
  p_janela_segundos integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agora timestamptz := now();
  v_linha public.assinatura_rate_limits%rowtype;
begin
  if coalesce(length(trim(p_escopo)), 0) = 0
     or coalesce(length(trim(p_sujeito)), 0) = 0
     or p_limite < 1
     or p_janela_segundos < 1 then
    return false;
  end if;

  insert into public.assinatura_rate_limits (escopo, sujeito, janela_inicio, tentativas, updated_at)
  values (left(trim(p_escopo), 80), left(trim(p_sujeito), 160), v_agora, 1, v_agora)
  on conflict (escopo, sujeito) do update set
    janela_inicio = case
      when public.assinatura_rate_limits.janela_inicio <= v_agora - make_interval(secs => p_janela_segundos)
        then v_agora
      else public.assinatura_rate_limits.janela_inicio
    end,
    tentativas = case
      when public.assinatura_rate_limits.janela_inicio <= v_agora - make_interval(secs => p_janela_segundos)
        then 1
      else public.assinatura_rate_limits.tentativas + 1
    end,
    updated_at = v_agora
  returning * into v_linha;

  return v_linha.tentativas <= p_limite;
end;
$$;

revoke all on function public.fsfit_consumir_rate_limit_assinatura(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.fsfit_consumir_rate_limit_assinatura(text,text,integer,integer) to service_role;

create or replace function public.fsfit_limpar_rate_limits_assinatura()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
begin
  delete from public.assinatura_rate_limits where updated_at < now() - interval '2 days';
  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

revoke all on function public.fsfit_limpar_rate_limits_assinatura() from public, anon, authenticated;
grant execute on function public.fsfit_limpar_rate_limits_assinatura() to service_role;

revoke all on function public.fsfit_aplicar_pagamento_pix() from public, anon, authenticated;
revoke all on function public.fsfit_baixar_pix_webhook(text,text,timestamptz,text) from public, anon, authenticated;
revoke all on function public.fsfit_iniciar_evento_webhook_efi(text,text) from public, anon, authenticated;
revoke all on function public.fsfit_finalizar_evento_webhook_efi(text,text,boolean,text) from public, anon, authenticated;
grant execute on function public.fsfit_baixar_pix_webhook(text,text,timestamptz,text) to service_role;
grant execute on function public.fsfit_iniciar_evento_webhook_efi(text,text) to service_role;
grant execute on function public.fsfit_finalizar_evento_webhook_efi(text,text,boolean,text) to service_role;

revoke insert, update, delete on public.assinaturas from anon, authenticated;
revoke insert, update, delete on public.cobrancas_pix from anon, authenticated;
revoke insert, update, delete on public.cobrancas_cartao from anon, authenticated;
revoke insert, update, delete on public.planos_assinatura from anon, authenticated;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'fsfit-limpar-rate-limits-assinatura') then
    perform cron.schedule('fsfit-limpar-rate-limits-assinatura', '37 4 * * *', 'select public.fsfit_limpar_rate_limits_assinatura();');
  end if;
end $$;
