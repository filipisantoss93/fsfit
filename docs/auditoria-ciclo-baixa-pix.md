# Auditoria do ciclo completo da baixa PIX

Data: 26/07/2026

Projeto Supabase: `jjpijncxlkwutbnkpsaw`

## Fluxo auditado

1. `webhook-efi-pix`
2. `fsfit_iniciar_evento_webhook_efi`
3. `fsfit_baixar_pix_webhook`
4. atualização de `cobrancas_pix`
5. trigger `trg_fsfit_aplicar_pagamento_pix`
6. `fsfit_aplicar_pagamento_pix`
7. upsert de `assinaturas`
8. vínculo em `cobrancas_pix.assinatura_id`
9. atualização de `perfis.plano`

## Controles existentes confirmados

- O webhook exige token de alta entropia, limita o payload e valida o formato do `txid`.
- Eventos recebidos usam hash e tabela interna para idempotência.
- As RPCs auxiliares do webhook são executáveis somente por `service_role`.
- `cobrancas_pix.txid` possui índice único.
- O trigger processa somente cobranças com status `paga`.
- A primeira atualização atômica define `processada_em` somente quando ainda é nulo.
- Chamadas concorrentes são serializadas pelo bloqueio da linha no `UPDATE`.
- Reentradas do trigger retornam sem reaplicar o benefício quando a cobrança já está processada.
- `assinaturas.personal_id` possui índice único e o pagamento usa `ON CONFLICT (personal_id)`.
- A validade é estendida a partir do maior valor entre a validade atual e `now()`.
- A transação inteira é revertida se plano, assinatura ou atualização do perfil falhar.

## Achados

### A1 — Falta de restrição de estado na baixa do webhook

A função implantada atualiza pelo `txid` sem exigir estado anterior específico. Uma cobrança marcada localmente como `cancelada`, `devolvida` ou `erro` pode voltar para `paga` caso o mesmo `txid` seja recebido.

Severidade: alta.

### A2 — `e2e_id` não possui unicidade

O `txid` é único, mas o identificador bancário `endToEndId` não possui índice único. Isso reduz a capacidade de detectar o mesmo pagamento associado incorretamente a cobranças diferentes.

Severidade: alta.

### A3 — Segredo do webhook reutiliza `cron_secret`

A RPC `fsfit_baixar_pix_webhook` compara o token recebido com `app_runtime_secrets.cron_secret`. O segredo do webhook deveria ser separado do segredo usado pelos agendadores, reduzindo o impacto de comprometimento de uma única credencial.

Severidade: média.

### A4 — Verificação manual e webhook estão divergentes

A versão do GitHub de `verificar-pix-fsfit` consulta a Efí e atualiza a cobrança. A versão implantada apenas consulta o banco local. A versão mais completa não deve ser implantada antes de usar a mesma RPC idempotente do webhook, evitando duas implementações diferentes de baixa.

Severidade: alta.

### A5 — Trigger executa também em atualizações internas

O trigger dispara em qualquer `UPDATE` da cobrança. A função possui guardas que impedem reaplicação, portanto não foi confirmado benefício duplicado. Como melhoria, o trigger pode ser limitado por condição ou colunas relevantes para reduzir invocações desnecessárias.

Severidade: baixa.

## Estado dos dados

Na inspeção realizada:

- cobranças pagas não processadas: 0;
- cobranças processadas com status diferente de pago: 0;
- cobranças pagas sem assinatura vinculada: 0;
- registros com `e2e_id`: 0.

Não foram encontradas inconsistências atuais, mas também não havia pagamentos com `e2e_id` para validar duplicidade histórica.

## Correção versionada

Migration preparada:

`supabase/migrations/20260726193000_endurecer_baixa_pix_webhook.sql`

A migration:

- cria índice único parcial para `e2e_id`;
- restringe os estados processáveis;
- exige `processada_em is null`;
- preserva idempotência;
- mantém execução somente para `service_role`.

A migration não foi aplicada em produção.

## Correção adicional recomendada

Criar segredo exclusivo `efi_webhook_secret` em armazenamento interno e atualizar:

- `configurar-webhook-efi`;
- `webhook-efi-pix`;
- `fsfit_baixar_pix_webhook`.

A verificação manual deve consultar a Efí e chamar a mesma RPC de baixa, em vez de atualizar diretamente `cobrancas_pix`.

## Garantias atuais

O fluxo atual protege adequadamente contra reprocessamento simultâneo do mesmo `txid` e contra dupla extensão da assinatura após `processada_em` ser definido.

As garantias ainda incompletas são:

- unicidade bancária por `e2e_id`;
- transição controlada de status;
- segredo exclusivo do webhook;
- caminho único de baixa para webhook e verificação manual.
