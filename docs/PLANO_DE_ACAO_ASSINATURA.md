# Plano de ação — Sistema de assinatura FS Fit

Data da auditoria: 03/08/2026  
Escopo: frontend, backend, Supabase, integração Efí Bank, segurança, observabilidade e organização da página de assinatura.

## 1. Objetivo

Concluir e homologar o sistema de assinatura do FS Fit para uso em produção, garantindo:

- consistência financeira entre Efí Bank e Supabase;
- segurança nas operações de PIX e cartão;
- rastreabilidade de cobranças e webhooks;
- experiência simples para o usuário;
- recuperação automática em falhas parciais;
- validação ponta a ponta dos fluxos críticos.

## 2. Diagnóstico resumido

A arquitetura atual está bem estruturada e já possui:

- autenticação por JWT nas ações do usuário;
- RLS nas tabelas financeiras;
- tokenização de cartão no frontend;
- Edge Functions separadas para PIX, cartão, cancelamentos e webhooks;
- webhooks com idempotência;
- histórico de cobranças;
- cancelamento de PIX pendente;
- gerenciamento de recorrência no cartão;
- página de assinatura com resumo, ações e histórico.

O principal risco atual é a inconsistência entre a Efí e o banco local quando uma operação externa é concluída, mas o registro no Supabase falha.

---

# 3. Prioridade P0 — Obrigatório antes de produção

## P0.1 — Compensação de falha na criação do PIX

### Problema

A cobrança é criada primeiro na Efí e depois salva em `cobrancas_pix`. Caso o `insert` falhe, a cobrança permanece ativa na Efí sem aparecer no FS Fit.

### Ações

- [ ] Alterar `criar-pix-fsfit` para cancelar a cobrança remota quando o salvamento local falhar.
- [ ] Registrar o erro de compensação quando o cancelamento remoto também falhar.
- [ ] Criar uma tabela de incidentes financeiros ou reconciliação.
- [ ] Armazenar `txid`, tipo de operação, erro, payload mínimo e data do incidente.
- [ ] Impedir uma nova cobrança enquanto existir incidente pendente para o mesmo usuário.

### Critério de aceite

- Se o `insert` local falhar, a cobrança deve ser removida na Efí.
- Caso a remoção falhe, o incidente deve ser registrado para reconciliação.
- Nenhuma cobrança órfã deve permanecer invisível ao administrador.

---

## P0.2 — Reconciliação automática Efí x Supabase

### Objetivo

Não depender exclusivamente dos webhooks para atualizar cobranças.

### Ações

- [ ] Criar uma Edge Function de reconciliação financeira.
- [ ] Consultar cobranças PIX locais com status `pendente`.
- [ ] Consultar o status real de cada cobrança na Efí.
- [ ] Atualizar cobranças concluídas, removidas ou expiradas.
- [ ] Reprocessar a ativação do acesso quando o PIX estiver pago.
- [ ] Consultar assinaturas de cartão em estado inconsistente.
- [ ] Registrar resultado de cada ciclo de reconciliação.
- [ ] Executar por cron em intervalo seguro.
- [ ] Evitar processamento duplicado usando idempotência.

### Critério de aceite

- Uma cobrança paga deve ser reconhecida mesmo se o webhook não chegar.
- Uma cobrança removida na Efí não pode continuar pendente no FS Fit.
- A reconciliação deve poder ser executada repetidamente sem efeitos duplicados.

---

## P0.3 — Validar webhook PIX em produção

### Ações

- [ ] Confirmar que `webhook-efi-pix` está registrado na conta de produção da Efí.
- [ ] Validar a URL exata registrada.
- [ ] Confirmar que o token secreto configurado corresponde ao hash esperado no banco.
- [ ] Enviar um PIX real de valor controlado.
- [ ] Confirmar recebimento do webhook.
- [ ] Confirmar baixa de `cobrancas_pix`.
- [ ] Confirmar atualização da assinatura e do acesso.
- [ ] Reenviar o mesmo evento e validar idempotência.

### Critério de aceite

- O pagamento deve ativar o acesso automaticamente.
- Eventos duplicados não podem duplicar período, cobrança ou assinatura.

---

## P0.4 — Teste ponta a ponta do PIX

### Cenários

- [ ] Criação de cobrança válida.
- [ ] Exibição do QR Code.
- [ ] Cópia do código PIX copia e cola.
- [ ] Pagamento real.
- [ ] Atualização automática do status.
- [ ] Expiração da cobrança.
- [ ] Cancelamento pelo usuário.
- [ ] Tentativa de criar uma nova cobrança com outra pendente.
- [ ] Cobrança anterior concluída aguardando sincronização.
- [ ] Webhook duplicado.
- [ ] Webhook fora de ordem.
- [ ] Falha de insert local após criação remota.
- [ ] Falha temporária da API da Efí.

### Critério de aceite

Todos os cenários devem produzir estado local e remoto coerentes.

---

## P0.5 — Teste ponta a ponta do cartão

### Cenários

- [ ] Tokenização válida.
- [ ] Cartão aprovado.
- [ ] Cartão recusado.
- [ ] Criação da assinatura recorrente.
- [ ] Primeira cobrança.
- [ ] Renovação mensal.
- [ ] Troca de cartão.
- [ ] Cartão expirado.
- [ ] Cancelamento da renovação.
- [ ] Manutenção do acesso até o fim do período pago.
- [ ] Remoção da referência mascarada do cartão.
- [ ] Alteração de plano.
- [ ] Webhook duplicado.
- [ ] Webhook fora de ordem.
- [ ] Falha da Efí depois da criação local.

### Critério de aceite

A assinatura, a cobrança e o acesso devem refletir o mesmo estado em todos os cenários.

---

# 4. Prioridade P1 — Segurança e confiabilidade

## P1.1 — Rate limiting

### Ações

- [ ] Limitar criação de PIX por usuário.
- [ ] Limitar verificação manual de PIX.
- [ ] Limitar troca de cartão.
- [ ] Limitar criação e cancelamento de assinatura.
- [ ] Registrar bloqueios por excesso de tentativas.
- [ ] Retornar mensagem amigável ao frontend.

### Sugestão inicial

- criação de PIX: uma tentativa a cada 15–30 segundos;
- verificação de PIX: uma tentativa a cada 5–10 segundos;
- troca de cartão: limite por minuto;
- cancelamentos: limite por minuto.

---

## P1.2 — Restringir CORS

### Ações

- [ ] Remover `Access-Control-Allow-Origin: *` das funções autenticadas.
- [ ] Permitir apenas `https://fit.fssolucoes.tech`.
- [ ] Incluir domínios oficiais de preview somente quando necessário.
- [ ] Tratar requisições sem origem de forma segura.

### Critério de aceite

As funções autenticadas devem aceitar chamadas apenas das origens autorizadas.

---

## P1.3 — Fortalecer proteção do webhook

### Ações

- [ ] Confirmar tamanho e entropia do token.
- [ ] Armazenar somente o hash do token no banco.
- [ ] Preparar rotação do token sem indisponibilidade.
- [ ] Evitar exposição desnecessária em query string quando a Efí permitir outra estratégia.
- [ ] Validar limites de payload e quantidade de eventos.
- [ ] Registrar tentativas inválidas sem armazenar o token recebido.

---

## P1.4 — CSP e script de tokenização

### Ações

- [ ] Confirmar a URL oficial e atual recomendada pela Efí.
- [ ] Fixar versão exata do script.
- [ ] Implementar Content Security Policy.
- [ ] Restringir `script-src`, `connect-src`, `img-src` e `frame-src`.
- [ ] Criar fallback visual quando o módulo da Efí não carregar.
- [ ] Não permitir envio do formulário sem tokenização concluída.

---

## P1.5 — Auditoria das políticas RLS

### Ações

- [ ] Revisar políticas de `assinaturas`.
- [ ] Revisar políticas de `cobrancas_pix`.
- [ ] Revisar políticas de `cobrancas_cartao`.
- [ ] Revisar políticas de `planos_assinatura`.
- [ ] Garantir que cada usuário leia apenas seus próprios registros.
- [ ] Garantir que o frontend não altere status financeiro diretamente.
- [ ] Garantir que planos ativos sejam apenas leitura no frontend.
- [ ] Executar Supabase Security Advisor.

---

# 5. Prioridade P1 — Observabilidade financeira

## P1.6 — Logs financeiros próprios

### Ações

- [ ] Criar tabela de eventos financeiros.
- [ ] Registrar criação, atualização, pagamento, cancelamento e falha.
- [ ] Registrar origem: frontend, webhook, reconciliação ou administrador.
- [ ] Registrar `txid`, ID de assinatura e ID de cobrança quando aplicável.
- [ ] Não armazenar dados sensíveis de cartão.
- [ ] Definir política de retenção.

### Campos sugeridos

- `id`;
- `personal_id`;
- `origem`;
- `tipo_evento`;
- `referencia_externa`;
- `status_anterior`;
- `status_novo`;
- `sucesso`;
- `codigo_erro`;
- `mensagem_resumida`;
- `created_at`.

---

## P1.7 — Alertas administrativos

### Ações

- [ ] Alertar falha de webhook.
- [ ] Alertar cobrança remota sem registro local.
- [ ] Alertar divergência encontrada pela reconciliação.
- [ ] Alertar sequência de falhas da Efí.
- [ ] Alertar assinatura ativa sem cobrança correspondente.
- [ ] Alertar pagamento confirmado sem acesso atualizado.

---

## P1.8 — Painel administrativo financeiro

### Ações

- [ ] Exibir assinantes ativos.
- [ ] Exibir usuários em trial.
- [ ] Exibir assinaturas canceladas com acesso ainda vigente.
- [ ] Exibir cobranças PIX pendentes.
- [ ] Exibir cobranças recusadas.
- [ ] Exibir incidentes de reconciliação.
- [ ] Permitir busca por usuário, e-mail, `txid` ou ID da assinatura.
- [ ] Não permitir alteração financeira manual sem trilha de auditoria.

---

# 6. Prioridade P2 — Organização e experiência da página

## P2.1 — Simplificar o topo

### Estrutura recomendada

Exibir um único card principal com:

- nome do plano;
- preço;
- status;
- forma de pagamento;
- validade do acesso;
- próxima cobrança;
- cartão mascarado quando aplicável.

### Exemplo

```text
FS Fit mensal
R$ 29,90/mês

Assinatura ativa
Próxima cobrança: 15/08/2026
Cartão final 1234
```

---

## P2.2 — Ação principal contextual

Exibir uma ação principal conforme o estado:

| Estado | Ação principal |
|---|---|
| Trial | Assinar o FS Fit |
| Free | Ativar plano completo |
| PIX pendente | Pagar cobrança PIX |
| Cartão ativo | Gerenciar renovação |
| Inadimplente | Regularizar pagamento |
| Cancelada com acesso válido | Reativar renovação |

Ações secundárias devem ficar em “Mais opções”.

---

## P2.3 — Histórico compacto

### Ações

- [ ] Exibir data, método, valor e status em uma linha compacta.
- [ ] Ocultar canceladas e expiradas por padrão.
- [ ] Adicionar “Exibir todos”.
- [ ] Manter apenas uma cobrança PIX pendente em destaque.
- [ ] Exibir detalhes em modal ou expansão.

---

## P2.4 — Cancelamento mais claro

### Ações

- [ ] Informar a data exata até quando o acesso continuará disponível.
- [ ] Diferenciar cancelamento de recorrência e encerramento imediato.
- [ ] Confirmar antes de cancelar.
- [ ] Exibir comprovante visual após o cancelamento.
- [ ] Atualizar a interface sem recarregar a página.

### Texto recomendado

> Você continuará usando o FS Fit até o fim do período já pago.

---

## P2.5 — Atualização em tempo real

### Ações

- [ ] Usar Supabase Realtime para mudanças em `cobrancas_pix` e `assinaturas`.
- [ ] Manter polling apenas como fallback.
- [ ] Encerrar polling após pagamento, cancelamento ou expiração.
- [ ] Evitar múltiplos timers ativos.

---

# 7. Organização técnica recomendada

## Frontend

Centralizar o estado da página em um único controlador:

```text
assinatura-runtime.js
  ├── autenticação
  ├── carregamento do acesso
  ├── carregamento de planos
  ├── carregamento do histórico
  ├── controle dos modais
  ├── atualização em tempo real
  └── renderização contextual
```

Evitar que vários módulos alterem o mesmo elemento sem coordenação.

## Backend

Separar responsabilidades:

```text
criar-pix-fsfit
verificar-pix-fsfit
cancelar-pix-fsfit
reconciliar-pagamentos-fsfit
webhook-efi-pix
configurar-webhook-efi

config-assinatura-cartao-fsfit
criar-assinatura-cartao-fsfit
atualizar-assinatura-cartao-fsfit
cancelar-assinatura-cartao-fsfit
webhook-efi-cobrancas
```

## Banco

Entidades principais:

```text
planos_assinatura
assinaturas
cobrancas_pix
cobrancas_cartao
eventos_financeiros
incidentes_financeiros
eventos_webhook_efi
```

---

# 8. Sequência recomendada de implementação

## Lote 1 — Integridade financeira

- [ ] Compensação de falha no PIX.
- [ ] Tabela de incidentes financeiros.
- [ ] Reconciliação automática.
- [ ] Logs financeiros.

## Lote 2 — Segurança

- [ ] Rate limiting.
- [ ] CORS restrito.
- [ ] CSP.
- [ ] Revisão do token do webhook.
- [ ] Auditoria RLS.

## Lote 3 — Homologação Efí

- [ ] Registrar e validar webhook PIX.
- [ ] Testar PIX real.
- [ ] Testar cartão real controlado.
- [ ] Testar renovação e cancelamento.
- [ ] Testar eventos duplicados e fora de ordem.

## Lote 4 — UX da assinatura

- [ ] Card principal de situação.
- [ ] Ação contextual.
- [ ] Histórico compacto.
- [ ] Cancelamento claro.
- [ ] Atualização por Realtime.

## Lote 5 — Administração

- [ ] Painel financeiro.
- [ ] Alertas.
- [ ] Busca e rastreabilidade.
- [ ] Relatório de incidentes.

---

# 9. Checklist de homologação

## Infraestrutura

- [ ] Projeto Supabase saudável.
- [ ] Segredos da Efí configurados.
- [ ] Certificado válido.
- [ ] Ambiente Efí correto: homologação ou produção.
- [ ] Webhooks registrados.
- [ ] Cron de reconciliação ativo.

## Segurança

- [ ] JWT obrigatório nas funções do usuário.
- [ ] Webhooks sem JWT, mas com autenticação própria.
- [ ] RLS habilitada.
- [ ] RPCs críticas restritas ao `service_role`.
- [ ] CORS restrito.
- [ ] Rate limiting ativo.
- [ ] CSP aplicada.
- [ ] Nenhum dado completo de cartão armazenado.

## PIX

- [ ] Criar cobrança.
- [ ] Exibir QR Code.
- [ ] Pagar.
- [ ] Receber webhook.
- [ ] Atualizar assinatura.
- [ ] Atualizar acesso.
- [ ] Cancelar cobrança.
- [ ] Expirar cobrança.
- [ ] Reconciliar cobrança perdida.

## Cartão

- [ ] Tokenizar cartão.
- [ ] Criar assinatura.
- [ ] Confirmar primeira cobrança.
- [ ] Processar renovação.
- [ ] Trocar cartão.
- [ ] Alterar plano.
- [ ] Cancelar renovação.
- [ ] Manter acesso até o fim do período.

## Frontend

- [ ] Estado correto ao abrir a página.
- [ ] Botões de acordo com o estado.
- [ ] Erros amigáveis.
- [ ] Sem recarregamento desnecessário.
- [ ] Histórico coerente.
- [ ] Atualização automática após pagamento.
- [ ] Layout funcional em desktop, mobile e PWA.

---

# 10. Critérios para considerar pronto para produção

O sistema somente deve ser considerado pronto quando:

- [ ] nenhum pagamento puder existir na Efí sem rastreabilidade local;
- [ ] webhooks perdidos forem recuperados pela reconciliação;
- [ ] eventos duplicados não gerarem duplicidade de acesso;
- [ ] todos os fluxos PIX forem testados com pagamento real;
- [ ] todos os fluxos de cartão forem testados em ambiente autorizado;
- [ ] o acesso sempre refletir o estado financeiro correto;
- [ ] falhas críticas gerarem registro e alerta;
- [ ] a página exibir apenas ações válidas para o estado atual;
- [ ] as políticas RLS e RPCs forem revisadas;
- [ ] houver evidência documentada da homologação ponta a ponta.

---

# 11. Status inicial

| Item | Status |
|---|---|
| Estrutura frontend | Implementada |
| Tabelas financeiras | Implementadas |
| RLS | Implementada, requer revisão final |
| PIX Efí | Implementado, requer homologação completa |
| Cartão Efí | Implementado, requer homologação completa |
| Webhook PIX | Implementado, requer validação em produção |
| Webhook cartão | Implementado, requer validação em produção |
| Idempotência | Implementada nos webhooks |
| Reconciliação | Pendente |
| Compensação de falha | Pendente |
| Rate limiting | Pendente |
| Observabilidade financeira | Parcial |
| UX final da página | Parcial |

## Parecer

A solução está adequada para homologação controlada. A liberação ampla para clientes pagantes depende principalmente da conclusão dos itens P0, da validação real dos webhooks e da reconciliação financeira automática.
