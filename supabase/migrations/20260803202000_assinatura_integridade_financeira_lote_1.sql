-- Lote 1: integridade financeira da assinatura FS Fit

create table if not exists public.incidentes_financeiros (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid,
  origem text not null,
  tipo text not null,
  referencia_externa text,
  status text not null default 'pendente' check (status in ('pendente','em_analise','resolvido','ignorado')),
  codigo_erro text,
  mensagem text not null,
  contexto jsonb not null default '{}'::jsonb,
  tentativas integer not null default 0,
  ultima_tentativa_em timestamptz,
  resolvido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_incidentes_financeiros_status on public.incidentes_financeiros(status, created_at);
create index if not exists idx_incidentes_financeiros_personal on public.incidentes_financeiros(personal_id, status);
create unique index if not exists ux_incidente_pix_orfao_pendente
  on public.incidentes_financeiros(personal_id, referencia_externa, tipo)
  where status in ('pendente','em_analise') and referencia_externa is not null;

alter table public.incidentes_financeiros enable row level security;
revoke all on table public.incidentes_financeiros from anon, authenticated;
grant all on table public.incidentes_financeiros to service_role;

create table if not exists public.eventos_financeiros (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid,
  origem text not null,
  tipo_evento text not null,
  referencia_externa text,
  cobranca_id uuid,
  assinatura_id uuid,
  status_anterior text,
  status_novo text,
  sucesso boolean not null default true,
  codigo_erro text,
  mensagem_resumida text,
  metadados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_eventos_financeiros_personal on public.eventos_financeiros(personal_id, created_at desc);
create index if not exists idx_eventos_financeiros_referencia on public.eventos_financeiros(referencia_externa, created_at desc);
create index if not exists idx_eventos_financeiros_tipo on public.eventos_financeiros(tipo_evento, created_at desc);

alter table public.eventos_financeiros enable row level security;
revoke all on table public.eventos_financeiros from anon, authenticated;
grant all on table public.eventos_financeiros to service_role;

create or replace function public.fsfit_touch_incidente_financeiro()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status = 'resolvido' and old.status is distinct from 'resolvido' then
    new.resolvido_em := coalesce(new.resolvido_em, now());
  end if;
  return new;
end;
$$;

revoke all on function public.fsfit_touch_incidente_financeiro() from public, anon, authenticated;
grant execute on function public.fsfit_touch_incidente_financeiro() to service_role;

drop trigger if exists trg_fsfit_touch_incidente_financeiro on public.incidentes_financeiros;
create trigger trg_fsfit_touch_incidente_financeiro
before update on public.incidentes_financeiros
for each row execute function public.fsfit_touch_incidente_financeiro();

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'fsfit-reconciliar-pagamentos') then
    perform cron.schedule(
      'fsfit-reconciliar-pagamentos',
      '*/10 * * * *',
      $cron$
      select net.http_post(
        url := 'https://jjpijncxlkwutbnkpsaw.supabase.co/functions/v1/reconciliar-pagamentos-fsfit',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-cron-secret',(select cron_secret from public.app_runtime_secrets where id=1)
        ),
        body := jsonb_build_object('triggered_at',now())
      );
      $cron$
    );
  end if;
end
$$;