# Homologação final — Assinatura FS Fit + Efí Bank

## Estado técnico verificado

- [x] Deploy de produção concluído na Vercel
- [x] Página `/admin-assinaturas.html` responde HTTP 200
- [x] Sem erros de runtime registrados após o deploy
- [x] Reconciliação automática PIX ativa
- [x] Reconciliação automática de cartão ativa
- [x] Rate limiting aplicado às operações financeiras
- [x] CORS restrito nas Edge Functions financeiras
- [x] Webhooks com idempotência e trilha de eventos
- [x] Compensação para cobranças remotas não persistidas localmente
- [x] Registro de incidentes financeiros
- [x] Diagnóstico administrativo da assinatura
- [x] Realtime financeiro habilitado

## Testes PIX obrigatórios

- [ ] Criar uma cobrança PIX real de valor controlado
- [ ] Confirmar QR Code e copia-e-cola
- [ ] Pagar a cobrança
- [ ] Confirmar webhook Efí recebido
- [ ] Confirmar cobrança alterada para `paga`
- [ ] Confirmar assinatura e acesso Premium atualizados
- [ ] Confirmar atualização automática da página
- [ ] Reenviar o mesmo webhook e confirmar idempotência
- [ ] Criar PIX e cancelar antes do pagamento
- [ ] Deixar um PIX expirar e confirmar reconciliação

## Testes de cartão obrigatórios

- [ ] Criar assinatura com cartão de homologação/aprovado
- [ ] Confirmar primeira cobrança aprovada
- [ ] Confirmar assinatura `ativa`
- [ ] Testar cartão recusado
- [ ] Testar troca de cartão
- [ ] Testar alteração de plano
- [ ] Cancelar renovação e preservar acesso até o fim do período
- [ ] Confirmar webhook repetido sem duplicidade
- [ ] Confirmar reconciliação de status Efí ↔ Supabase
- [ ] Validar uma renovação recorrente completa

## Validação administrativa

- [ ] Abrir `/admin.html` com uma conta administradora
- [ ] Confirmar card de saúde da assinatura
- [ ] Abrir `/admin-assinaturas.html`
- [ ] Confirmar crons PIX e cartão como ativos
- [ ] Confirmar zero incidentes sem resolução
- [ ] Confirmar zero PIX expirados ainda pendentes
- [ ] Confirmar zero assinaturas de cartão travadas
- [ ] Confirmar data da última reconciliação

## Critério de liberação

A assinatura pode ser liberada amplamente quando:

1. todos os testes PIX estiverem aprovados;
2. todos os testes de cartão estiverem aprovados;
3. uma renovação real de cartão tiver sido confirmada;
4. não houver incidentes financeiros abertos;
5. os dois crons estiverem executando normalmente;
6. o painel administrativo indicar estado `saudavel`;
7. os valores da Efí coincidirem com Supabase e painel administrativo.

## Procedimento em caso de divergência

1. bloquear nova cobrança para o usuário afetado;
2. consultar `incidentes_financeiros`;
3. consultar `eventos_financeiros`;
4. comparar o identificador externo na Efí;
5. executar ou aguardar a reconciliação automática;
6. somente corrigir manualmente após confirmar o estado remoto;
7. registrar a resolução do incidente.
