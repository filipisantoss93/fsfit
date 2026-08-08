# Arquitetura de CSS do FS Fit

## Contrato de produção

- Cada página carrega exatamente um stylesheet local.
- O arquivo publicado possui hash SHA-256 no nome.
- Nenhum bundle contém `@import`.
- Cada arquivo de origem aparece no máximo uma vez por bundle.
- CSS não é criado ou anexado por JavaScript quando o bundle está presente.
- HTML e bundle são validados juntos antes de entrarem no cache do PWA.

## Fluxo de alteração

1. Edite somente os arquivos de origem em `css/`.
2. Se uma página precisar de uma nova entrada explícita, atualize
   `config/css-bundles.json`.
3. Execute `node scripts/build-css-bundles.mjs --write`.
4. Execute as auditorias de runtime e orçamento.
5. Inclua HTML, manifest e bundles gerados no mesmo commit.

Os arquivos em `css/bundles/` são artefatos imutáveis. Versões já publicadas
podem permanecer no repositório para que um HTML antigo continue encontrando o
CSS correspondente durante a troca de deployment.

## Dívida controlada

Os arquivos de origem ainda contêm regras históricas com `!important`. O limite
fica congelado em `config/css-audit-budget.json`: um PR pode reduzir a dívida,
mas o CI bloqueia qualquer aumento. Essa dívida não cria requisições paralelas
em produção porque o compilador resolve a ordem uma única vez.
