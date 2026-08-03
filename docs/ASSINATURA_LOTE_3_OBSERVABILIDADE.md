# Lote 3 — Observabilidade financeira

Aplicado em 03/08/2026.

## Concluído

- RPC interna para registrar eventos financeiros.
- RPC interna para registrar incidentes financeiros.
- Execução restrita ao `service_role`.
- `webhook-efi-pix` atualizado para versão 16.
- `webhook-efi-cobrancas` atualizado para versão 3.
- Registro de confirmações, cancelamentos e falhas de webhook.
- Preservação da idempotência existente.
- Limites de payload e quantidade de eventos mantidos.

## Estado encontrado

- Cobranças PIX registradas: 2.
- Cobranças PIX pagas: 1.
- Cobranças PIX pendentes: 0.
- Assinaturas de cartão abertas: 0.
- Incidentes financeiros abertos: 0.

## Próximo lote

- Robustez da criação, alteração e cancelamento da assinatura por cartão.
- Compensação de divergências Efí x Supabase no cartão.
- Organização da página de assinatura e atualização em tempo real.
