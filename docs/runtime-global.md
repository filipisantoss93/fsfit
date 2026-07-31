# Runtime global do FS Fit

## Entrada única

Todas as páginas protegidas carregam `js/inactive-account-guard.js`, que importa somente `js/global-runtime-bootstrap.js`.

O bootstrap centraliza:

- lifecycle de página e PWA;
- pausa e retomada de timers e intervals;
- pausa e retomada de `MutationObserver`;
- lifecycle do canal Realtime `fsfit-mobile-badges-*`;
- shared mutation runtime;
- diagnóstico em `globalRuntime.status()`.

## Eventos

- `fsfit:global-runtime-ready`: emitido uma única vez após a inicialização global;
- `fsfit:lifecycle-realtime-resumed`: emitido após retomada dos canais mobile.

## Regras de manutenção

1. Não importar runtimes antigos removidos.
2. Não adicionar novos listeners globais de `pagehide`, `pageshow`, `visibilitychange` ou `focus` sem integrar ao `appLifecycle`.
3. Não criar outro patch global para timers, observers ou canais mobile.
4. Atualizar a versão no bootstrap quando o contrato global mudar.
5. Executar `node scripts/audit-global-runtime.mjs` antes de publicar alterações nesses arquivos.

## Arquivos removidos

- `resource-lifecycle-autowire.js`;
- `realtime-lifecycle-autowire.js`;
- `mobile-lifecycle-runtime.js`.

A auditoria do GitHub Actions bloqueia novas referências a esses arquivos.
