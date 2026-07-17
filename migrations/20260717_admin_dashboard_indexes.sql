-- Índices de apoio às consultas e auditoria do painel administrativo.

create index if not exists admin_auditoria_admin_id_idx
  on public.admin_auditoria(admin_id);

create index if not exists admin_auditoria_user_id_idx
  on public.admin_auditoria(user_id);

create index if not exists assinaturas_plano_id_idx
  on public.assinaturas(plano_id);

create index if not exists assinaturas_status_acesso_idx
  on public.assinaturas(status, acesso_valido_ate desc);

create index if not exists cobrancas_pix_plano_id_idx
  on public.cobrancas_pix(plano_id);

create index if not exists cobrancas_pix_status_pago_em_idx
  on public.cobrancas_pix(status, pago_em desc);

create index if not exists cobrancas_pix_personal_status_pago_em_idx
  on public.cobrancas_pix(personal_id, status, pago_em desc);
