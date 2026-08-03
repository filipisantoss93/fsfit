# Matriz de testes dos fluxos críticos

Este documento define a cobertura automatizada do Lote 4/6 da auditoria JavaScript do FS Fit.

## Objetivo

Detectar regressões estruturais e contratuais antes do merge, sem depender de credenciais reais, banco de produção, navegador externo ou deploy da Vercel.

## Cobertura

| Área | Contratos verificados |
|---|---|
| Entrada e navegação | páginas essenciais presentes; referências locais de scripts e estilos válidas |
| Autenticação | leitura de sessão, listener de autenticação ou proteção por `requireSession` |
| Alunos | presença dos módulos e acesso explícito à tabela `alunos` |
| Treinos | criação, aplicação e personalização; acesso a `treinos`/`treino_exercicios`; ausência de reload forçado |
| Agenda e aula | acesso a agenda ou `sessoes_treino`; sincronização de sessão quando aplicável |
| Financeiro | mensalidades, pagamentos, RPCs ou Edge Functions financeiras |
| Assinatura | PIX/cartão, renovação e cancelamento; evento `fsfit:subscription-updated`; ausência de reload forçado |
| Portal do aluno | sessão protegida e integração com sessões de treino |
| PWA | manifesto, `start_url`, modo de exibição e Service Worker |
| Eventos globais | produtores dos eventos de treino, assinatura, dieta e financeiro |
| Inicialização | inspeção de listeners globais e alertas para módulos sem guarda detectável |

## Níveis de resultado

- **Falha:** contrato obrigatório ausente, referência local quebrada, módulo essencial inexistente ou reload funcional reintroduzido.
- **Aviso:** contrato opcional ou módulo alternativo não presente na árvore atual; não bloqueia o merge.
- **Aprovado:** contrato estrutural localizado e validado.

## Execução local

```bash
node scripts/test-critical-flows.mjs
```

## Execução no GitHub Actions

O workflow `Critical flows audit` roda apenas quando arquivos relevantes de HTML, JavaScript, PWA, testes ou workflow são alterados. Ele não executa build nem deploy, evitando consumo desnecessário da Vercel.

## Limites

Esta camada não substitui testes ponta a ponta com usuário autenticado e banco de homologação. Ela protege os contratos estáticos e os principais pontos de integração do frontend, reduzindo regressões antes dos testes manuais e funcionais.