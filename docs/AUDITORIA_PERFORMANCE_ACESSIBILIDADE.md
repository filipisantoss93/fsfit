# Auditoria de performance, acessibilidade e estados de interface

## Objetivo

Impedir regressões estruturais que prejudiquem carregamento, navegação por teclado, leitura por tecnologia assistiva e previsibilidade dos fluxos assíncronos do FS Fit.

## Critérios bloqueantes

- imagens precisam possuir `alt`, inclusive quando decorativas (`alt=""`);
- iframes precisam possuir `title`;
- elementos com `role="dialog"` precisam possuir `aria-modal="true"` e nome acessível;
- modais criados por JavaScript seguem os mesmos contratos;
- a auditoria deve executar sem dependências externas e sem build da aplicação.

## Critérios acompanhados como aviso

- scripts locais potencialmente bloqueantes sem `defer`, `async` ou `type="module"`;
- imagens e iframes sem carregamento tardio quando não prioritários;
- inputs sem label associado detectável;
- timers e observers sem cleanup detectável;
- submits sem bloqueio explícito contra ação duplicada;
- modais sem gestão detectável de foco, tecla Escape ou navegação por teclado;
- loading sem estado complementar de erro, vazio ou sucesso.

Avisos não bloqueiam o PR porque parte da árvore utiliza componentes montados dinamicamente e padrões legados. Eles formam a fila objetiva de refinamento do lote e passam a impedir novas regressões quando convertidos em regras bloqueantes.

## Execução local

```bash
node --check scripts/audit-performance-accessibility.mjs
node scripts/audit-performance-accessibility.mjs
```

## Integração contínua

O workflow `Performance and accessibility audit` roda apenas quando arquivos HTML, JavaScript, o auditor ou o próprio workflow são alterados. Ele não instala dependências, não compila a aplicação e não aciona deploy da Vercel por conta própria.

## Estados de interface esperados

Fluxos assíncronos críticos devem contemplar:

1. estado inicial;
2. carregamento com ação principal temporariamente bloqueada;
3. sucesso com atualização local da interface;
4. erro recuperável com mensagem clara;
5. estado vazio quando não houver dados;
6. cleanup de timers, observers e listeners ao encerrar o contexto.

## Modal acessível mínimo

- `role="dialog"`;
- `aria-modal="true"`;
- `aria-labelledby` ou `aria-label`;
- fechamento por botão e tecla Escape;
- foco movido para o modal ao abrir;
- foco devolvido ao elemento acionador ao fechar;
- conteúdo de fundo não deve receber interação enquanto o modal estiver aberto.
