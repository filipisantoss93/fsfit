# Auditoria de paridade Supabase × GitHub

Data de início: 26/07/2026

Branch: `audit/supabase-paridade`

Projeto Supabase: `FSFit` (`jjpijncxlkwutbnkpsaw`)

## Objetivo

Garantir que o estado do banco, das funções, políticas, triggers, Edge Functions e rotinas operacionais do FS Fit esteja integralmente representado no repositório e possa ser reconstruído de forma reproduzível.

## Estado inicial confirmado

- Projeto Supabase ativo e saudável.
- PostgreSQL 17.6.
- Todas as tabelas do schema `public` encontradas no inventário inicial estão com RLS habilitada.
- Foram identificadas 16 Edge Functions ativas.
- Há grande quantidade de funções `SECURITY DEFINER` no schema `public`.
- O Supabase Security Advisor reporta funções privilegiadas executáveis por `anon` e `authenticated`.
- O Security Advisor também reporta quatro tabelas com RLS habilitada e sem políticas: `aluno_sessoes`, `app_runtime_secrets`, `edge_rate_limits` e `webhook_eventos_efi`.
- A proteção contra senhas vazadas está desativada no Supabase Auth.
- O histórico remoto do Supabase contém migrations até `20260726173018_auditar_alteracoes_financeiras_sensiveis`.

## Achados confirmados

### 1. RPC administrativa com grant indevido para anon

A sobrecarga paginada de `public.fsfit_admin_historico_financeiro` possui `EXECUTE` para `anon`, `authenticated` e `service_role`.

O corpo da função bloqueia chamadas sem `auth.uid()` e exige registro em `public.platform_admins`, portanto não foi confirmada exposição de dados por chamada anônima. Mesmo assim, o grant para `anon` é indevido.

Correção versionada em:

`supabase/migrations/20260726190000_restringir_execucao_anon_rpc_admin.sql`

A migration ainda não foi aplicada em produção.

### 2. RPCs administrativas validam administrador internamente

As funções administrativas inspecionadas, incluindo `fsfit_admin_atualizar_plano`, `fsfit_admin_executar_geracao_mensalidades_agora` e `fsfit_admin_historico_financeiro`, validam `auth.uid()` e a associação em `platform_admins` antes das operações privilegiadas.

### 3. RPCs financeiras do personal possuem validação de propriedade

As funções `fsfit_configurar_mensalidade_aluno`, `fsfit_confirmar_pagamento_mensalidade`, `fsfit_cancelar_mensalidade` e `fsfit_gerar_mensalidades_mes` restringem operações ao personal autenticado e aos seus próprios alunos.

### 4. RLS financeira principal está coerente

As políticas de `mensalidades_alunos` restringem SELECT, INSERT, UPDATE e DELETE ao `personal_id = auth.uid()`. INSERT e UPDATE também validam que o aluno pertence ao mesmo personal.

As tabelas `assinaturas`, `cobrancas_pix` e `cobrancas_cartao` possuem leitura restrita ao próprio personal.

### 5. Tabelas internas sem políticas

`app_runtime_secrets`, `edge_rate_limits` e `webhook_eventos_efi` permanecem com RLS habilitada e sem políticas. O desenho aparenta ser intencional para negar acesso direto e permitir somente funções privilegiadas ou `service_role`.

`aluno_sessoes` também permanece fechada para acesso direto e é utilizada por RPCs baseadas em token temporário.

### 6. Automação financeira e operacional existente

Foram encontrados cron jobs ativos para:

- limpeza de sessões expiradas;
- limpeza de rate limits;
- limpeza de eventos de webhook Efí;
- processamento de lembretes;
- processamento de lembretes de WhatsApp;
- geração automática de mensalidades no dia 1 de cada mês;
- limpeza do histórico de monitoramento.

### 7. Triggers financeiros relevantes

A tabela `mensalidades_alunos` possui triggers para auditoria, definição e bloqueio do `personal_id`, validação personal–aluno, proteção de transições e controle de operações premium.

A tabela `cobrancas_pix` possui trigger para aplicação automática de pagamento.

## Paridade das Edge Functions financeiras

### `criar-pix-fsfit`

O arquivo versionado e a versão implantada possuem o mesmo conteúdo funcional e a mesma dependência `@supabase/supabase-js@2.45.4`.

Status: paridade confirmada.

### `webhook-efi-pix`

A versão implantada estava à frente do arquivo do GitHub. Produção já possuía:

- limite de payload;
- validação de tamanho do token;
- validação de formato de `txid`;
- limite de 50 eventos por chamada;
- idempotência por hash do evento;
- registro de sucesso ou falha do processamento;
- headers de segurança adicionais.

O arquivo do GitHub foi atualizado para reproduzir exatamente a versão implantada.

Status: paridade restaurada na branch de auditoria.

### `verificar-pix-fsfit`

O arquivo do GitHub está à frente da versão implantada. O código versionado consulta a Efí quando a cobrança ainda não foi processada, identifica status `CONCLUIDA` e atualiza a cobrança local. A versão implantada apenas lê o registro local.

Status: divergência confirmada. O deploy não será feito até validar que a atualização direta mantém a idempotência e não conflita com o webhook.

## Estrutura Supabase criada na branch

Foi adicionado `supabase/config.toml` com a configuração de JWT das quatro Edge Functions PIX auditadas.

## Próximas etapas

1. Auditar `verificar-pix-fsfit` contra o trigger `fsfit_aplicar_pagamento_pix` e o webhook antes de decidir o deploy.
2. Comparar `configurar-webhook-efi` e `cancelar-pix-fsfit` entre GitHub e produção.
3. Comparar as Edge Functions de assinatura por cartão.
4. Reconstruir e versionar as migrations ausentes do banco.
5. Testar a migration de revogação em ambiente separado.
6. Executar novamente os advisors de segurança e desempenho.

## Regra desta auditoria

Nenhuma correção será aplicada diretamente em produção antes de:

- identificar o impacto;
- registrar a divergência;
- criar migration versionada;
- testar a alteração;
- revisar permissões e compatibilidade com o frontend.
