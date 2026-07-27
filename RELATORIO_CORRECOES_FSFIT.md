# Relatório Mestre de Correções – FS Fit

Este documento é a referência oficial para a evolução do FS Fit.

## Diretrizes
- Manter o novo padrão visual da landing e da plataforma.
- Preservar o tema grafite com os novos tons de verde e azul.
- Utilizar componentes menos arredondados.
- Padronizar cards, botões, inputs, modais e cabeçalhos.
- Evitar duplicidade de funcionalidades.
- Priorizar experiência mobile.
- Buscar consistência, legibilidade e percepção de produto SaaS profissional.

## Ordem de execução
1. Design System global
2. Componentes compartilhados
3. Painel
4. Alunos
5. Ficha do aluno
6. Treinos
7. Agenda
8. Financeiro
9. Mensalidades
10. Chat
11. Perfil
12. Página pública
13. Administração
14. Refinamentos finais

## Sprint de Polimento

### Fase 1 — Consistência visual
- [x] Consolidar tokens de cor oficiais.
- [x] Reduzir os raios dos componentes.
- [x] Padronizar escala de espaçamento.
- [x] Padronizar alturas de controles.
- [x] Padronizar cabeçalhos.
- [x] Padronizar cards e painéis.
- [x] Padronizar botões e estados desabilitados.
- [x] Padronizar inputs, selects e textareas.
- [x] Padronizar abas, filtros e controles segmentados.
- [x] Padronizar modais e rodapés de ação.
- [x] Padronizar badges e estados semânticos.
- [x] Padronizar tabelas e listas.
- [x] Criar estados visuais de vazio, erro e carregamento.
- [x] Adicionar skeleton global.
- [x] Adicionar suporte a movimento reduzido.
- [x] Refinar comportamento mobile.

**Status:** concluída em `css/fsfit-design-system.css`.

### Fase 2 — Componentes compartilhados
- [ ] Aplicar o Design System aos componentes compartilhados reais.
- [ ] Unificar navegação superior e inferior.
- [ ] Unificar cabeçalhos utilizados pelas páginas.
- [ ] Unificar modais e bloqueio de rolagem.
- [ ] Unificar toasts, loaders e estados vazios.

## Checklist geral
- [x] Base visual global padronizada
- [ ] Componentes compartilhados padronizados
- [ ] Navegação unificada
- [ ] UX mobile refinada em todas as páginas
- [ ] Estados de loading/erro/vazio aplicados
- [ ] Performance percebida revisada
- [ ] Microinterações revisadas
- [ ] Auditoria final
