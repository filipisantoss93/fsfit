do $$
begin
  if exists (select 1 from cron.job where jobname = 'fsfit-reconciliar-assinaturas-cartao') then
    perform cron.unschedule('fsfit-reconciliar-assinaturas-cartao');
  end if;
end $$;

select cron.schedule(
  'fsfit-reconciliar-assinaturas-cartao',
  '*/15 * * * *',
  $cron$
    select net.http_post(
      url := 'https://jjpijncxlkwutbnkpsaw.supabase.co/functions/v1/reconciliar-assinaturas-cartao-fsfit',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-cron-secret',(select cron_secret from public.app_runtime_secrets where id=1)
      ),
      body := jsonb_build_object('triggered_at',now())
    );
  $cron$
);