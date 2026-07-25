create or replace function public.handle_new_personal_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_nome text;
  v_email text;
begin
  v_nome := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'nome'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Personal'
  );
  v_email := nullif(trim(coalesce(new.email, '')), '');

  insert into public.perfis (
    id, tipo, nome, telefone, plano, ativo, trial_inicio, trial_fim
  ) values (
    new.id,
    'personal'::public.tipo_perfil,
    v_nome,
    null,
    'trial',
    true,
    now(),
    now() + interval '7 days'
  )
  on conflict (id) do update
    set nome = case
      when nullif(trim(public.perfis.nome), '') is null then excluded.nome
      else public.perfis.nome
    end,
    ativo = true;

  begin
    insert into public.notificacoes (
      destinatario_id,
      destinatario_tipo,
      remetente_id,
      remetente_tipo,
      tipo,
      titulo,
      mensagem,
      link,
      lida
    )
    select
      admin.user_id,
      'admin',
      new.id,
      'personal',
      'usuario_novo',
      'Novo usuário cadastrado',
      case
        when v_email is null then v_nome || ' criou uma conta no FS Fit.'
        else v_nome || ' (' || v_email || ') criou uma conta no FS Fit.'
      end,
      '/admin.html#clientes',
      false
    from public.platform_admins admin;
  exception
    when others then
      raise warning 'Não foi possível notificar os administradores sobre o novo usuário %: %', new.id, sqlerrm;
  end;

  return new;
end;
$function$;
