# FS Fit MVP

Plataforma da FS Soluções para personal trainers administrarem alunos, treinos, orientações e acesso individual dos alunos.

## Configuração

1. Crie ou abra o projeto no Supabase.
2. Execute `schema.sql` no SQL Editor.
3. Em `js/supabase.js`, substitua a URL e a chave `anon` pelas credenciais do projeto.
4. No Supabase Authentication, configure a URL do site e as URLs de redirecionamento.
5. A Vercel publica automaticamente a branch `main` quando o projeto está conectado ao repositório.

## Páginas

- `index.html`: login e cadastro do personal.
- `painel.html`: resumo da consultoria.
- `alunos.html`: cadastro, edição, exclusão e publicação de planos.
- `perfil.html`: nome e WhatsApp do personal.
- `aluno.html?id=TOKEN`: portal público individual do aluno.

## Estrutura visual

Os estilos de origem permanecem modulares em `css/`, mas nunca são publicados
separadamente. `scripts/build-css-bundles.mjs` compila um único bundle com hash
de conteúdo para cada página, elimina `@import` e inclui cada fonte uma única
vez. Páginas com o mesmo conteúdo reutilizam o mesmo arquivo.

Antes de abrir um PR com alterações em HTML, CSS ou JavaScript, execute:

```bash
node scripts/build-css-bundles.mjs --write
node scripts/build-css-bundles.mjs
node scripts/audit-css-runtime.mjs
node scripts/audit-css-pages.mjs
node scripts/check-css-budget.mjs
```

Os bundles em `css/bundles/` são gerados; não devem ser editados manualmente.
O Service Worker valida a dupla HTML + bundle antes de armazenar ou entregar
uma navegação, impedindo que uma página incompleta substitua uma cópia íntegra.

## Migração gradual para TypeScript

O site segue estático: os arquivos HTML continuam carregando módulos de navegador
em `js/`. Os módulos migrados têm sua fonte em `typescript/` e são compilados para
o mesmo caminho em `js/`, preservando as URLs usadas pelas páginas.

```bash
npm ci
npm run typecheck
npm run build:typescript
```

O JavaScript compilado deve ser incluído no commit junto com sua fonte TypeScript.
O workflow `TypeScript migration checks` valida os tipos, a saída compilada e as
referências de scripts das páginas. A migração é incremental; módulos ainda não
migrados continuam funcionando em `js/`.

## Release candidate

Em 17 de julho de 2026, a auditoria pré-venda adicionou proteção do primeiro acesso do aluno, entrada pelo domínio oficial, documentos legais, aceite no cadastro, preço de lançamento explícito e redução da superfície pública de RPCs sensíveis. A contingência de consulta direta da cobrança PIX na Efí está versionada em `supabase/functions/verificar-pix-fsfit/index.ts` e requer publicação da Edge Function antes da liberação comercial definitiva.

## Observação

Não abra os arquivos diretamente por `file://`. Use a Vercel, Live Server ou outro servidor HTTP.
