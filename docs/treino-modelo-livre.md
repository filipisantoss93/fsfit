# Treino como modelo livre

## Fluxo

1. O personal cria o treino sem escolher os dias da semana.
2. O treino é salvo como modelo inativo.
3. Os exercícios são montados em uma sequência-base.
4. Ao aplicar, o personal escolhe um ou mais dias.
5. A sequência-base é distribuída pelos dias escolhidos.
6. O plano é ativado pelo fluxo existente de conflito e compatibilidade.

## Compatibilidade

A implementação mantém a tabela atual e usa temporariamente o dia 1 como sequência-base interna enquanto o treino permanece como modelo. Antes de ativar, os exercícios são duplicados para os dias selecionados e o plano deixa de ser modelo.

## Escopo desta etapa

- separação visual entre criar e aplicar;
- remoção da escolha de dias no cadastro;
- aplicação posterior em múltiplos dias;
- preservação da RPC existente;
- sem migração destrutiva de banco.
