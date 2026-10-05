-- Mantém somente Pix direto ao personal, com confirmação manual no FS Fit.
begin;

-- Remove as credenciais Efí armazenadas no Vault e desativa integrações antigas.
delete from vault.secrets
where name like 'fsfit_efi_pix_personal_%';

update public.integracoes_pix_personal
set status = 'desativada',
    vault_secret_id = null,
    webhook_token_hash = null,
    ultimo_erro = null,
    updated_at = now()
where status <> 'desativada'
   or vault_secret_id is not null
   or webhook_token_hash is not null;

-- Mantém o histórico, mas invalida cobranças automáticas ainda abertas.
update public.cobrancas_pix_mensalidades
set status = 'cancelada',
    ultimo_erro = 'Cobrança automática desativada. Gere o Pix direto para a chave do personal.',
    updated_at = now()
where status in ('criando', 'pendente');

-- Remove a reconciliação periódica de cobranças Efí de mensalidade.
do $
declare
  v_job_id bigint;
begin
  if to_regclass('cron.job') is not null then
    execute 'select jobid from cron.job where jobname = $1 limit 1'
      into v_job_id
      using 'fsfit-reconciliar-pix-mensalidades';
    if v_job_id is not null then
      execute 'select cron.unschedule($1)' using v_job_id;
    end if;
  end if;
end
$;

commit;
