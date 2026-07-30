# Consolidação de CSS do FS Fit

## Lote 1 — concluído
- Financeiro consolidado em `css/financeiro.css`.
- Remoção de `css/financeiro-inline.css`.
- Imports redundantes de navegação removidos.

## Lote 2 — Administração
- Consolidar `admin-cron-monitor.css`, `admin-users-compact.css`, `admin-attention.css`, `admin-forecast.css`, `admin-funnel.css`, `admin-retention.css`, `admin-tabs.css` e `admin-crm.css` em `admin.css`.
- Atualizar `admin.html` para carregar somente `style.css`, `header-menu.css` e `admin.css`.
- Remover arquivos incorporados somente após validação visual.

## Lote 3 — Bibliotecas
- Consolidar os estilos específicos das bibliotecas alimentar e de exercícios.
- Preservar `style.css` e `header-menu.css` como dependências globais.

## Regra de deploy
Cada lote deve ser entregue em um único pull request e integrado por squash merge, gerando somente um commit na `main`.
