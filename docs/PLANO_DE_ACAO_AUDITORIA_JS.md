# Plano de Ação — Auditoria JavaScript (FS Fit)

## Prioridade 1
- Corrigir ciclo de vida dos listeners globais.
- Substituir `localStorage.clear()` por remoção seletiva.
- Vincular cache de acesso ao usuário autenticado.

## Prioridade 2
- Consolidar módulos duplicados de abas de treino.
- Mover criação de perfil/trial para RPC/Edge Function no Supabase.
- Revisar carregamento condicional de módulos.

## Prioridade 3
- Melhorar Realtime das notificações (DELETE, reconexão e tratamento de erros).
- Corrigir fluxo de marcação de notificações lidas.
- Evitar substituição completa do `document.body`.
- Implementar focus trap no menu 'Mais'.

## Validação
1. Testes desktop.
2. Testes Android.
3. Testes iPhone.
4. Auditoria de memória.
5. Auditoria de performance.
6. Revisão final de código.

Objetivo: eliminar duplicidades, aumentar estabilidade, melhorar segurança do frontend e preparar a base para evolução do FS Fit.