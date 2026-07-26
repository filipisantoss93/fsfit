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

## Riscos P0 iniciais

### 1. Funções administrativas expostas ao papel authenticated

Diversas RPCs administrativas `fsfit_admin_*` aparecem como executáveis por usuários autenticados. A existência de validação interna de administrador ainda precisa ser verificada função por função. Até essa validação ser concluída, essas RPCs devem ser tratadas como risco crítico de autorização.

### 2. RPC administrativa executável por anon

A sobrecarga paginada de `fsfit_admin_historico_financeiro` foi sinalizada como executável por `anon`. Isso precisa ser corrigido ou comprovadamente protegido internamente antes da integração do frontend administrativo.

### 3. Funções de aluno baseadas em token público

Várias funções de portal do aluno são intencionalmente acessadas sem sessão Supabase e usam `session_token`. Elas não devem ser revogadas indiscriminadamente. Cada função precisa ser validada quanto a expiração, hash do token, escopo, rate limiting e ausência de enumeração.

### 4. Tabelas internas sem políticas

`app_runtime_secrets`, `edge_rate_limits` e `webhook_eventos_efi` aparentam ser tabelas exclusivamente internas. RLS sem políticas pode ser correto, desde que o acesso esteja restrito a funções privilegiadas e `service_role`. Isso será validado por grants e dependências.

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

1. Extrair grants das funções críticas.
2. Inspecionar o corpo das RPCs administrativas e financeiras.
3. Levantar políticas RLS completas.
4. Levantar triggers e cron jobs.
5. Comparar Edge Functions implantadas com os arquivos versionados.
6. Comparar migrations do repositório com o histórico real do banco.
7. Criar migrations corretivas somente após a conclusão do inventário.
8. Executar novamente os advisors de segurança e desempenho.

## Regra desta auditoria

Nenhuma correção será aplicada diretamente em produção antes de:

- identificar o impacto;
- registrar a divergência;
- criar migration versionada;
- testar a alteração;
- revisar permissões e compatibilidade com o frontend.
