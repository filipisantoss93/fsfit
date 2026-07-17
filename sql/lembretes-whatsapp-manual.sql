-- FS Fit — lembretes gratuitos por WhatsApp via envio manual do personal
-- O aluno não recebe mensagem automática pela API do WhatsApp.
-- No horário do lembrete, o personal recebe uma notificação interna com atalho
-- para abrir o WhatsApp e a mensagem já preenchida.

alter type public.status_lembrete add value if not exists 'processando_whatsapp';
alter type public.status_lembrete add value if not exists 'whatsapp_pendente';
alter type public.status_lembrete add value if not exists 'whatsapp_aberto';
alter type public.status_lembrete add value if not exists 'falhou_parcial';

create or replace function public.registrar_notificacao_whatsapp_ambos()
returns trigger
language plpgsql
as $$
declare
  v_aluno_nome text;
begin
  if new.status = 'processando'
     and old.status is distinct from new.status
     and new.canal = 'ambos' then
    select nome into v_aluno_nome
    from public.alunos
    where id = new.aluno_id;

    insert into public.notificacoes(
      destinatario_id,
      destinatario_tipo,
      remetente_id,
      remetente_tipo,
      tipo,
      titulo,
      mensagem,
      link,
      lida
    ) values (
      new.personal_id,
      'personal',
      new.aluno_id,
      'aluno',
      'lembrete_whatsapp',
      'WhatsApp para ' || coalesce(v_aluno_nome, 'aluno'),
      'Lembrete pronto para envio pelo WhatsApp. Toque para abrir a mensagem.',
      '/abrir-whatsapp-lembrete.html?id=' || new.id::text,
      false
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notificacao_whatsapp_ambos on public.lembretes;
create trigger trg_notificacao_whatsapp_ambos
after update of status on public.lembretes
for each row
execute function public.registrar_notificacao_whatsapp_ambos();

create or replace function public.marcar_whatsapp_pendente_apos_push()
returns trigger
language plpgsql
as $$
begin
  if new.canal = 'ambos'
     and new.status = 'enviado'
     and old.status = 'processando' then
    update public.lembretes
    set status = 'whatsapp_pendente'
    where id = new.id
      and status = 'enviado';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_marcar_whatsapp_pendente_apos_push on public.lembretes;
create trigger trg_marcar_whatsapp_pendente_apos_push
after update of status on public.lembretes
for each row
execute function public.marcar_whatsapp_pendente_apos_push();

create or replace function public.processar_lembretes_whatsapp()
returns integer
language plpgsql
as $$
declare
  r record;
  v_next timestamptz;
  v_phone text;
  v_processed integer := 0;
begin
  for r in
    select
      l.id,
      l.personal_id,
      l.aluno_id,
      l.titulo,
      l.agendado_para,
      l.recorrencia_rrule,
      l.tentativas,
      a.nome as aluno_nome,
      a.telefone
    from public.lembretes l
    join public.alunos a
      on a.id = l.aluno_id
     and a.personal_id = l.personal_id
    where l.status = 'agendado'
      and l.canal = 'whatsapp'
      and l.agendado_para <= now()
    order by l.agendado_para
    limit 100
    for update of l skip locked
  loop
    v_processed := v_processed + 1;

    -- Status separado para não acionar a notificação interna do aluno,
    -- que deve ocorrer apenas nos canais Push e Ambos.
    update public.lembretes
    set status = 'processando_whatsapp', erro = null
    where id = r.id;

    v_phone := regexp_replace(coalesce(r.telefone, ''), '[^0-9]', '', 'g');

    if not (
      char_length(v_phone) in (10, 11)
      or (v_phone like '55%' and char_length(v_phone) in (12, 13))
    ) then
      update public.lembretes
      set status = 'falhou',
          tentativas = coalesce(r.tentativas, 0) + 1,
          erro = 'Aluno sem WhatsApp válido cadastrado.'
      where id = r.id;
      continue;
    end if;

    insert into public.notificacoes(
      destinatario_id,
      destinatario_tipo,
      remetente_id,
      remetente_tipo,
      tipo,
      titulo,
      mensagem,
      link,
      lida
    ) values (
      r.personal_id,
      'personal',
      r.aluno_id,
      'aluno',
      'lembrete_whatsapp',
      'WhatsApp para ' || coalesce(r.aluno_nome, 'aluno'),
      'É hora de enviar “' || coalesce(r.titulo, 'Lembrete') || '”. Toque para abrir o WhatsApp com a mensagem pronta.',
      '/abrir-whatsapp-lembrete.html?id=' || r.id::text,
      false
    );

    v_next := null;

    if r.recorrencia_rrule = 'FREQ=DAILY' then
      v_next := r.agendado_para + interval '1 day';
    elsif r.recorrencia_rrule = 'FREQ=WEEKLY' then
      v_next := r.agendado_para + interval '7 days';
    elsif r.recorrencia_rrule = 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' then
      v_next := r.agendado_para + interval '1 day';
      while extract(isodow from v_next) in (6, 7) loop
        v_next := v_next + interval '1 day';
      end loop;
    end if;

    if v_next is not null then
      update public.lembretes
      set status = 'agendado',
          agendado_para = v_next,
          enviado_em = now(),
          tentativas = 0,
          erro = null
      where id = r.id;
    else
      update public.lembretes
      set status = 'whatsapp_pendente',
          enviado_em = now(),
          tentativas = 0,
          erro = null
      where id = r.id;
    end if;
  end loop;

  return v_processed;
end;
$$;

-- Executar uma vez em produção para criar/atualizar o job:
-- do $$
-- declare v_jobid bigint;
-- begin
--   select jobid into v_jobid
--   from cron.job
--   where jobname = 'fsfit-processar-lembretes-whatsapp'
--   limit 1;
--   if v_jobid is not null then
--     perform cron.unschedule(v_jobid);
--   end if;
-- end;
-- $$;
--
-- select cron.schedule(
--   'fsfit-processar-lembretes-whatsapp',
--   '* * * * *',
--   'select public.processar_lembretes_whatsapp();'
-- );
