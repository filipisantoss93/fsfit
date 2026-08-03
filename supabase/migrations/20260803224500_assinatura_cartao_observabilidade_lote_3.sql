create or replace function public.fsfit_registrar_evento_financeiro(
  p_personal_id uuid,
  p_origem text,
  p_tipo_evento text,
  p_referencia_externa text default null,
  p_assinatura_id uuid default null,
  p_cobranca_id uuid default null,
  p_status_anterior text default null,
  p_status_novo text default null,
  p_sucesso boolean default true,
  p_codigo_erro text default null,
  p_mensagem_resumida text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.eventos_financeiros(
    personal_id, origem, tipo_evento, referencia_externa, assinatura_id,
    cobranca_id, status_anterior, status_novo, sucesso, codigo_erro,
    mensagem_resumida
  ) values (
    p_personal_id, left(coalesce(p_origem,'desconhecida'),80), left(coalesce(p_tipo_evento,'evento'),120),
    left(p_referencia_externa,200), p_assinatura_id, p_cobranca_id,
    left(p_status_anterior,60), left(p_status_novo,60), coalesce(p_sucesso,true),
    left(p_codigo_erro,100), left(p_mensagem_resumida,500)
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.fsfit_registrar_evento_financeiro(uuid,text,text,text,uuid,uuid,text,text,boolean,text,text) from public, anon, authenticated;
grant execute on function public.fsfit_registrar_evento_financeiro(uuid,text,text,text,uuid,uuid,text,text,boolean,text,text) to service_role;

create or replace function public.fsfit_registrar_incidente_financeiro(
  p_personal_id uuid,
  p_origem text,
  p_tipo text,
  p_referencia_externa text,
  p_codigo_erro text,
  p_mensagem text,
  p_contexto jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.incidentes_financeiros(
    personal_id, origem, tipo, referencia_externa, status, codigo_erro, mensagem, contexto
  ) values (
    p_personal_id, left(coalesce(p_origem,'desconhecida'),80), left(coalesce(p_tipo,'incidente'),120),
    left(p_referencia_externa,200), 'pendente', left(p_codigo_erro,100), left(p_mensagem,1000), coalesce(p_contexto,'{}'::jsonb)
  )
  on conflict (personal_id, referencia_externa, tipo)
  where status in ('pendente','em_analise') and referencia_externa is not null
  do update set
    tentativas = public.incidentes_financeiros.tentativas + 1,
    ultima_tentativa_em = now(),
    codigo_erro = excluded.codigo_erro,
    mensagem = excluded.mensagem,
    contexto = excluded.contexto,
    updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.fsfit_registrar_incidente_financeiro(uuid,text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.fsfit_registrar_incidente_financeiro(uuid,text,text,text,text,text,jsonb) to service_role;
