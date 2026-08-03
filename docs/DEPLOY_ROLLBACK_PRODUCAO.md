# Deploy e rollback de produção — FS Fit

## Antes do merge

1. Confirmar que o PR representa um lote consolidado e revisável.
2. Confirmar todos os checks verdes.
3. Revisar alterações em autenticação, banco, assinatura e service worker.
4. Registrar o SHA atual da `main` como ponto de retorno.
5. Evitar merges paralelos até a validação do deploy.

## Deploy

1. Fazer merge do PR aprovado na `main`.
2. Aguardar a Vercel reconhecer o commit.
3. Confirmar que o deploy corresponde exatamente ao SHA mergeado.
4. Não disparar redeploy manual enquanto o deploy automático estiver em execução.
5. Abrir o domínio de produção sem cache e verificar status HTTP, console e recursos estáticos.
6. Executar o checklist `docs/SMOKE_TEST_PRODUCAO.md`.

## Verificação pós-deploy

- Página pública abre sem erro.
- Login e sessão funcionam.
- Painel protegido abre para usuário autenticado.
- Supabase responde sem erro de RLS inesperado.
- Service worker não mantém versão incompatível.
- Fluxos de aluno, treino, agenda e financeiro funcionam.
- Nenhum erro recorrente aparece no console.
- PIX/cartão somente são testados em ambiente ou cobrança controlada.

## Rollback

Use rollback quando houver falha P0 ou P1, perda de acesso, corrupção de dados, cobrança incorreta ou indisponibilidade ampla.

1. Suspender novos merges.
2. Identificar o último deploy estável e seu SHA.
3. Na Vercel, promover novamente o deploy estável ou reverter o commit problemático no GitHub.
4. Evitar `force push` na `main`.
5. Confirmar que banco e Edge Functions não exigem rollback separado.
6. Repetir o smoke test mínimo: página pública, login, painel, alunos, treino e assinatura.
7. Registrar causa, impacto, horário e ação corretiva.

## Alterações de banco e Edge Functions

- Migrações devem ser reversíveis ou possuir plano de correção progressiva.
- Não remover coluna ou função ainda usada pelo frontend publicado.
- Segredos ficam apenas no ambiente seguro do Supabase/Vercel.
- Webhooks devem manter idempotência e validação de origem.

## Classificação de incidentes

- **P0:** indisponibilidade total, perda de dados ou cobrança indevida. Rollback imediato.
- **P1:** autenticação ou fluxo principal quebrado para muitos usuários. Rollback prioritário.
- **P2:** falha parcial com alternativa operacional. Corrigir em lote controlado.
- **P3:** problema visual ou melhoria não bloqueante. Registrar no backlog.