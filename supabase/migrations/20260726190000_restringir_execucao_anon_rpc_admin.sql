begin;

revoke execute on function public.fsfit_admin_historico_financeiro(
  integer,
  integer,
  date,
  date,
  uuid,
  uuid,
  text,
  uuid,
  text
) from anon;

grant execute on function public.fsfit_admin_historico_financeiro(
  integer,
  integer,
  date,
  date,
  uuid,
  uuid,
  text,
  uuid,
  text
) to authenticated, service_role;

commit;
