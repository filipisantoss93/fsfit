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
- Não foi localizada estrutura `supabase/` nem a migration mais recente na `main` do GitHub pelos caminhos convencionais.

## Achados confirmados

### 1. RPC administrativa com grant indevido para anon

A sobrecarga paginada de `public.fsfit_admin_historico_financeiro` possui `EXECUTE` para `anon`, `authenticated` e `service_role`.

O corpo da função bloqueia chamadas sem `auth.uid()` e exige registro em `public.platform_admins`, portanto não foi confirmada exposição de dados por chamada anônima. Mesmo assim, o grant para `anon` é indevido e aumenta desnecessariamente a superfície pública.

Correção proposta: revogar `EXECUTE` de `anon` e manter somente os papéis estritamente necessários.

### 2. RPCs administrativas validam administrador internamente

As funções administrativas inspecionadas, incluindo `fsfit_admin_atualizar_plano`, `fsfit_admin_executar_geracao_mensalidades_agora` e `fsfit_admin_historico_financeiro`, validam `auth.uid()` e a associação em `platform_admins` antes das operações privilegiadas.

O grant para `authenticated` é compatível com o frontend atual, desde que toda RPC administrativa mantenha essa validação interna. Ainda é necessário concluir a inspeção de todas as funções `fsfit_admin_*`.

### 3. RPCs financeiras do personal possuem validação de propriedade

As funções inspecionadas:

- `fsfit_configurar_mensalidade_aluno`;
- `fsfit_confirmar_pagamento_mensalidade`;
- `fsfit_cancelar_mensalidade`;
- `fsfit_gerar_mensalidades_mes`;

validam autenticação e restringem operações pelo `personal_id = auth.uid()` ou pela propriedade do aluno. Não foi encontrada, nessas funções, alteração arbitrária de mensalidade pertencente a outro personal.

### 4. RLS financeira principal está coerente

As políticas de `mensalidades_alunos` restringem SELECT, INSERT, UPDATE e DELETE ao `personal_id = auth.uid()`. INSERT e UPDATE também validam que o aluno pertence ao mesmo personal.

As tabelas `assinaturas`, `cobrancas_pix` e `cobrancas_cartao` possuem leitura restrita ao próprio personal.

### 5. Tabelas internas sem políticas

`app_runtime_secrets`, `edge_rate_limits` e `webhook_eventos_efi` permanecem com RLS habilitada e sem políticas. Esse desenho pode ser intencional para negar acesso direto e permitir somente operações via funções privilegiadas ou `service_role`.

`aluno_sessoes` também não possui políticas e é acessada por funções baseadas em token. O modelo precisa ser mantido fechado para acesso direto e validado pela segurança das RPCs.

### 6. Automação financeira e operacional existente

Foram encontrados os seguintes cron jobs ativos:

- limpeza diária de sessões expiradas;
- limpeza diária de rate limits;
- limpeza diária de eventos de webhook Efí;
- processamento de lembretes por Edge Function a cada 2 minutos;
- processamento de lembretes de WhatsApp a cada 2 minutos;
- geração automática de mensalidades no dia 1 de cada mês;
- limpeza diária do histórico de monitoramento.

A geração mensal automática executa `fsfit_internal.gerar_mensalidades_automaticamente()`.

### 7. Triggers financeiros relevantes

A tabela `mensalidades_alunos` possui triggers para:

- auditoria de INSERT e UPDATE;
- definição e bloqueio do `personal_id`;
- validação da relação personal–aluno;
- proteção de transições de status;
- proteção de operações premium.

A tabela `cobrancas_pix` possui trigger para aplicação automática de pagamento após INSERT ou UPDATE.

## Divergência crítica de versionamento

O Supabase registra um histórico extenso de migrations, incluindo diversas migrations P0 aplicadas em 26/07/2026. Entretanto, os caminhos convencionais abaixo não foram encontrados na `main`:

- `supabase/config.toml`;
- `supabase/migrations/20260726173018_auditar_alteracoes_financeiras_sensiveis.sql`.

Isso indica forte probabilidade de que o banco de produção esteja à frente do repositório ou que as migrations estejam armazenadas em outro caminho ainda não identificado.

Esse é atualmente o principal risco de paridade: o estado operacional do Supabase pode não ser reconstruível pelo GitHub.

## Edge Functions encontradas

- `criar-aluno`
- `personal-aluno-pin`
- `aluno-auth`
- `aluno-push`
- `processar-lembretes`
- `verificar-pix-fsfit`
- `webhook-efi-pix`
- `criar-pix-fsfit`
- `chat-push`
- `configurar-webhook-efi`
- `config-assinatura-cartao-fsfit`
- `criar-assinatura-cartao-fsfit`
- `cancelar-assinatura-cartao-fsfit`
- `webhook-efi-cobrancas`
- `atualizar-assinatura-cartao-fsfit`
- `cancelar-pix-fsfit`

## Próximas etapas

1. Concluir inspeção interna de todas as RPCs administrativas.
2. Extrair grants completos das funções baseadas em token do aluno.
3. Comparar cada Edge Function implantada com o GitHub.
4. localizar o caminho real das migrations, caso exista fora de `supabase/migrations`.
5. reconstruir e versionar as migrations ausentes.
6. preparar migration corretiva para grants administrativos indevidos.
7. executar novamente os advisors de segurança e desempenho.
8. validar o banco reconstruído em ambiente separado antes de qualquer mudança em produção.

## Regra desta auditoria

Nenhuma correção será aplicada diretamente em produção antes de:

- identificar o impacto;
- registrar a divergência;
- criar migration versionada;
- testar a alteração;
- revisar permissões e compatibilidade com o frontend.