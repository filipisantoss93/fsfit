# Auditoria JavaScript — Lote 2

## Arquivo principal

`js/layout-core.js`

## Achados críticos

### 1. Logout apaga todo o armazenamento do domínio

O arquivo executa `localStorage.clear()` tanto no logout principal quanto na tela de conta inativa.

**Risco:** apaga dados de outras aplicações ou integrações hospedadas no mesmo domínio/origem.

**Correção:** remover somente chaves com prefixo `fsfit:` e chaves legadas conhecidas.

### 2. Perfil trial é criado pelo frontend

`preparePersonalProfile()` cria diretamente um registro em `perfis` quando não encontra perfil para o usuário autenticado, incluindo plano, status e datas do trial.

**Risco:** regra comercial e autorização ficam dependentes do cliente; também pode gerar registros incompletos ou inconsistentes em falhas concorrentes.

**Correção:** o frontend deve apenas carregar o perfil. A criação deve ocorrer no backend, trigger ou RPC transacional.

### 3. Cache de acesso não está associado ao usuário

A chave `fsfit:access-status-cache` guarda o status sem registrar ou validar o `user_id`.

**Risco:** em troca de conta na mesma aba, um usuário pode receber temporariamente o estado de acesso armazenado para outro usuário.

**Correção:** salvar `userId`, validar na leitura e invalidar o cache em mudança de sessão ou logout.

### 4. Promessas globais mantêm estado entre sessões

`profilePromise`, `accessPromise`, `coreSessionPromise` e `lastProfile` são globais e não possuem uma rotina única de reset vinculada à mudança de usuário.

**Risco:** dados e promessas resolvidas da sessão anterior podem ser reutilizados após troca de conta sem recarregamento completo.

**Correção:** criar `resetCoreState()` e executá-la no logout e em `onAuthStateChange` quando o usuário mudar ou sair.

### 5. Realtime de notificações está incompleto

O canal acompanha `INSERT` e `UPDATE`, mas não `DELETE`. O identificador do usuário permanece definido mesmo após remoção do canal, e o listener de `beforeunload` é recriado conforme novas sessões.

**Risco:** notificações removidas podem continuar visíveis até recarga; reconexões podem ficar inconsistentes.

**Correção:** usar evento `*` ou incluir `DELETE`, limpar `notificationChannelUserId`, centralizar descarte e registrar somente um listener global de encerramento.

### 6. Falha no carregamento de notificações esconde estado real

Qualquer erro nas três consultas paralelas esconde todo o painel e zera também o badge administrativo.

**Risco:** uma falha apenas na contagem de suporte faz todas as notificações parecerem vazias.

**Correção:** separar a consulta administrativa da consulta principal ou usar resultados independentes com degradação parcial.

## Ordem recomendada de implementação

1. criar limpeza seletiva e reset central do estado;
2. vincular cache de acesso ao usuário;
3. remover criação de perfil/trial pelo frontend;
4. corrigir ciclo de vida do Realtime;
5. separar falhas da central de notificações;
6. validar login, troca de conta, logout, conta inativa e atualização de notificações.

## Escopo da branch

Branch: `auditoria-js-lote-2`

Nenhuma alteração funcional deve ser mesclada sem validação isolada do fluxo de autenticação e acesso.
