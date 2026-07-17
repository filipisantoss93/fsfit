create or replace function public.fsfit_proximo_agendamento(
  p_current timestamptz,
  p_rrule text,
  p_reference timestamptz default now()
)
returns timestamptz
language plpgsql
stable
set search_path = public
as $$
declare
  v_next timestamptz;
  v_interval integer;
  v_step interval;
  v_step_seconds numeric;
  v_elapsed_seconds numeric;
  v_jumps bigint;
begin
  if p_current is null or p_rrule is null or btrim(p_rrule) = '' then
    return null;
  end if;

  if p_rrule = 'FREQ=DAILY' then
    v_step := interval '1 day';
  elsif p_rrule = 'FREQ=WEEKLY' then
    v_step := interval '7 days';
  elsif p_rrule = 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' then
    v_next := p_current;
    loop
      v_next := v_next + interval '1 day';
      while extract(isodow from v_next) in (6, 7) loop
        v_next := v_next + interval '1 day';
      end loop;
      exit when v_next > p_reference;
    end loop;
    return v_next;
  elsif p_rrule ~ '^FREQ=(MINUTELY|HOURLY|DAILY);INTERVAL=[1-9][0-9]{0,2}$' then
    v_interval := split_part(p_rrule, 'INTERVAL=', 2)::integer;

    if p_rrule like 'FREQ=MINUTELY;%' then
      v_step := make_interval(mins => v_interval);
    elsif p_rrule like 'FREQ=HOURLY;%' then
      v_step := make_interval(hours => v_interval);
    elsif p_rrule like 'FREQ=DAILY;%' then
      v_step := make_interval(days => v_interval);
    end if;
  else
    return null;
  end if;

  v_step_seconds := extract(epoch from v_step);
  if v_step_seconds <= 0 then
    return null;
  end if;

  v_elapsed_seconds := greatest(0, extract(epoch from (p_reference - p_current)));
  v_jumps := floor(v_elapsed_seconds / v_step_seconds)::bigint + 1;
  return p_current + (v_step * v_jumps::double precision);
end;
$$;

create or replace function public.reagendar_lembrete_intervalo_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next timestamptz;
begin
  if new.status = 'enviado'
     and old.status = 'processando'
     and new.canal in ('push', 'ambos')
     and new.recorrencia_rrule ~ '^FREQ=(MINUTELY|HOURLY|DAILY);INTERVAL=[1-9][0-9]{0,2}$' then
    v_next := public.fsfit_proximo_agendamento(new.agendado_para, new.recorrencia_rrule, now());

    if v_next is not null then
      update public.lembretes
      set status = 'agendado',
          agendado_para = v_next,
          tentativas = 0,
          erro = null
      where id = new.id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reagendar_lembrete_intervalo_push on public.lembretes;
create trigger trg_reagendar_lembrete_intervalo_push
after update of status on public.lembretes
for each row
execute function public.reagendar_lembrete_intervalo_push();

create or replace function public.processar_lembretes_whatsapp()
returns integer
language plpgsql
set search_path = public
as $$
declare
  r record;
  v_next timestamptz;
  v_phone text;
  v_processed integer := 0;
begin
  for r in
    select l.id, l.personal_id, l.aluno_id, l.titulo, l.agendado_para, l.recorrencia_rrule, l.tentativas,
           a.nome as aluno_nome, a.telefone
    from public.lembretes l
    join public.alunos a on a.id = l.aluno_id and a.personal_id = l.personal_id
    where l.status = 'agendado'
      and l.canal = 'whatsapp'
      and l.agendado_para <= now()
    order by l.agendado_para
    limit 100
    for update of l skip locked
  loop
    v_processed := v_processed + 1;

    update public.lembretes
    set status = 'processando_whatsapp', erro = null
    where id = r.id;

    v_phone := regexp_replace(coalesce(r.telefone, ''), '[^0-9]', '', 'g');

    if not (char_length(v_phone) in (10,11) or (v_phone like '55%' and char_length(v_phone) in (12,13))) then
      update public.lembretes
      set status = 'falhou',
          tentativas = coalesce(r.tentativas,0) + 1,
          erro = 'Aluno sem WhatsApp válido cadastrado.'
      where id = r.id;
      continue;
    end if;

    insert into public.notificacoes(
      destinatario_id,destinatario_tipo,remetente_id,remetente_tipo,tipo,titulo,mensagem,link,lida
    ) values (
      r.personal_id,
      'personal',
      r.aluno_id,
      'aluno',
      'lembrete_whatsapp',
      'WhatsApp para ' || coalesce(r.aluno_nome,'aluno'),
      'É hora de enviar “' || coalesce(r.titulo,'Lembrete') || '”. Toque para abrir o WhatsApp com a mensagem pronta.',
      '/abrir-whatsapp-lembrete.html?id=' || r.id::text,
      false
    );

    v_next := public.fsfit_proximo_agendamento(r.agendado_para, r.recorrencia_rrule, now());

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