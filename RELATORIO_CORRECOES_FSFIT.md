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
- [x] Aplicar o Design System aos componentes compartilhados reais.
- [x] Unificar navegação superior e inferior.
- [x] Unificar cabeçalhos utilizados pelas páginas.
- [x] Unificar modais e bloqueio de rolagem.
- [x] Unificar toasts, loaders e estados vazios.

**Status:** concluída em `css/shared-components.css`, `js/shared-components.js` e integração em `js/layout.js`.

### Fase 3 — Painel
- [x] Ativar o Design System global no shell carregado pelo layout.
- [x] Atualizar o cache das folhas de estilo compartilhadas.
- [x] Reduzir raios das abas, indicadores e ações do painel.
- [x] Remover gradientes decorativos dos cards principais.
- [x] Uniformizar superfícies e bordas dos cards de atenção.
- [x] Reduzir o peso visual dos indicadores e barras de progresso.
- [x] Padronizar espaçamentos dos blocos de agenda e atividade.

**Status:** concluída para `painel.html` por meio dos componentes globais compartilhados.

### Fase 4 — Alunos
- [x] Alinhar cabeçalho, resumo e área de busca ao Design System.
- [x] Reduzir raios e remover gradientes decorativos dos cards.
- [x] Padronizar filtros e estados ativos.
- [x] Refinar a lista compacta e os estados semânticos dos alunos.
- [x] Padronizar avatar, menu de ações e estado vazio.
- [x] Refinar modal de cadastro e edição.
- [x] Preservar safe area, bloqueio de rolagem e comportamento mobile.
- [x] Melhorar leitura e densidade da página em telas pequenas.

**Status:** concluída em `css/alunos.css` e `css/alunos-lista-compacta.css`.

### Fase 5 — Ficha do aluno
- [x] Alinhar cabeçalho, status e ação de visualização ao Design System.
- [x] Padronizar abas sticky e reduzir o peso visual do estado ativo.
- [x] Unificar cards de resumo físico, perfil, planejamento e evolução.
- [x] Padronizar superfícies de métricas, formulários, mídias e histórico.
- [x] Remover gradientes e sombras decorativas desnecessárias.
- [x] Refinar histórico de peso e treinos para leitura responsiva.
- [x] Preservar fluxo mobile, safe area e densidade compacta.

**Status:** concluída em `css/ficha-aluno-padronizacao.css`.

## Checklist geral
- [x] Base visual global padronizada
- [x] Componentes compartilhados padronizados
- [x] Navegação unificada
- [ ] UX mobile refinada em todas as páginas
- [x] Estados de loading/erro/vazio aplicados
- [ ] Performance percebida revisada
- [ ] Microinterações revisadas
- [ ] Auditoria final