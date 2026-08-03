do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'assinaturas'
  ) then
    alter publication supabase_realtime add table public.assinaturas;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cobrancas_pix'
  ) then
    alter publication supabase_realtime add table public.cobrancas_pix;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cobrancas_cartao'
  ) then
    alter publication supabase_realtime add table public.cobrancas_cartao;
  end if;
end $$;
