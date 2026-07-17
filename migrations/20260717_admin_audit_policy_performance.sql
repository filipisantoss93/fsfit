-- Evita reavaliar auth.uid() a cada linha na política de leitura da auditoria administrativa.

drop policy if exists "Admins podem ler auditoria" on public.admin_auditoria;

create policy "Admins podem ler auditoria"
on public.admin_auditoria
for select
to authenticated
using (public.fsfit_is_admin((select auth.uid())));
