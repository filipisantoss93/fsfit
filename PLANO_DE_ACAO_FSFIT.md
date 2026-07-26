# Plano de Ação Oficial — FS Fit

Este documento consolida as conclusões da auditoria do FS Fit e deve ser utilizado como referência principal para priorização, execução e acompanhamento das melhorias do produto.

## Objetivo estratégico

O FS Fit já possui funcionalidades suficientes para ser comercializado. O foco deste plano não é aumentar rapidamente a quantidade de recursos, mas elevar a qualidade, a segurança, a simplicidade, a estabilidade e a percepção de valor da plataforma.

A ordem oficial de execução é:

1. Estabilidade e segurança
2. Simplificação da experiência
3. Padronização visual
4. Performance
5. Marketing e conversão
6. Inteligência e diferenciação

---

# Fase 1 — Estabilidade e segurança

**Prioridade:** P0

**Objetivo:** eliminar riscos técnicos e tornar a plataforma confiável antes de ampliar a base de usuários.

## Segurança do Supabase

- [ ] Auditar todas as tabelas e confirmar que o RLS está habilitado onde necessário.
- [ ] Corrigir a tabela `public.aluno_sessoes`, atualmente indicada com RLS habilitado sem política adequada.
- [ ] Revisar todas as políticas RLS por perfil de acesso: personal, aluno e administrador.
- [ ] Auditar o corpo de todas as funções `SECURITY DEFINER`.
- [ ] Confirmar validações de `auth.uid()`, propriedade dos registros, papel administrativo e tokens.
- [ ] Revisar especialmente as RPCs administrativas e financeiras.
- [ ] Remover permissões públicas ou excessivas de funções que não precisem ser chamadas diretamente pelo cliente.
- [ ] Ativar a proteção contra senhas comprometidas no Supabase Auth.
- [ ] Revisar autenticação, recuperação de senha, sessões e expiração de acesso.
- [ ] Auditar uploads, tipos de arquivo, limites, nomes, caminhos e políticas dos buckets.
- [ ] Revisar exposição de segredos, variáveis de ambiente, APIs e Edge Functions.

## Arquitetura crítica

- [ ] Consolidar o módulo de treinos e remover controladores concorrentes ou duplicados.
- [ ] Definir formalmente o ciclo de vida de modelos, treinos aplicados, ativos, concluídos e sessões.
- [ ] Remover o `Proxy` global aplicado ao cliente Supabase.
- [ ] Manter o arquivo de inicialização do Supabase responsável apenas pela criação e configuração do cliente.
- [ ] Mover normalizações e regras de negócio para funções explícitas e módulos próprios.
- [ ] Padronizar dias da semana no banco e nas regras de negócio usando ISO 1–7.
- [ ] Converter `Date.getDay()` somente nas fronteiras da aplicação.
- [ ] Transformar hotfixes permanentes em implementações definitivas.
- [ ] Remover arquivos obsoletos, código morto e inicializações múltiplas.

## PWA e compatibilidade

- [ ] Completar os manifests com ícones 192x192 e 512x512.
- [ ] Adicionar ícones `maskable`.
- [ ] Separar corretamente os ativos do personal e do aluno.
- [ ] Revisar a lista de arquivos do Service Worker.
- [ ] Definir uma estratégia de versionamento e invalidação do cache.
- [ ] Evitar cache persistente de HTML e JavaScript crítico quando houver risco de servir versões incompatíveis.
- [ ] Remover `maximum-scale=1`, `user-scalable=no` e mecanismos artificiais de bloqueio de zoom.
- [ ] Revisar safe areas, modais, scroll lock, sticky headers e navegação no Safari/iPhone.

## Deploy e produção

- [ ] Confirmar qual projeto da Vercel está conectado ao repositório e à branch `main`.
- [ ] Corrigir a divergência entre o código da landing page no GitHub e a versão publicada.
- [ ] Definir `www.fsfit.com.br` como domínio canônico principal.
- [ ] Aplicar redirecionamento 301 do domínio secundário.
- [ ] Revisar canonical, sitemap, Search Console e consistência do Service Worker entre domínios.
- [ ] Criar checklist obrigatório de deploy e rollback.

## Qualidade mínima obrigatória

- [ ] Criar testes de fumaça para login, cadastro, aluno, treino, agenda, portal do aluno, financeiro e assinatura.
- [ ] Validar os principais fluxos em iPhone, Android e desktop.
- [ ] Implantar registro estruturado de erros e monitoramento de exceções.
- [ ] Criar mensagens de erro compreensíveis, estados vazios e ações de tentar novamente.

**Resultado esperado:** plataforma segura, previsível, testável e pronta para receber usuários pagantes.

---

# Fase 2 — Simplificação da experiência

**Prioridade:** P1

**Objetivo:** reduzir a curva de aprendizado e facilitar o primeiro uso.

## Onboarding

- [ ] Transformar a aba `Início` no ponto de entrada principal do personal.
- [ ] Manter a `Visão geral` disponível sem abrir diretamente nela.
- [ ] Criar uma sequência guiada para novos usuários:
  - [ ] completar perfil;
  - [ ] cadastrar primeiro aluno;
  - [ ] criar primeiro modelo de treino;
  - [ ] adicionar treino ao aluno;
  - [ ] compartilhar acesso;
  - [ ] agendar primeira aula.
- [ ] Exibir progresso do onboarding sem bloquear o uso livre da plataforma.
- [ ] Celebrar marcos importantes de forma discreta.

## Navegação e hierarquia

- [ ] Eliminar atalhos duplicados que levam ao mesmo local.
- [ ] Manter uma navegação principal e, quando necessário, um único atalho contextual.
- [ ] Revisar a hierarquia dos cards em todas as páginas.
- [ ] Exibir primeiro a informação mais relevante para a decisão do usuário.
- [ ] Reduzir conteúdo simultâneo em telas como painel, perfil, assinatura e ficha do aluno.
- [ ] Tornar páginas longas mais compactas por meio de abas, seções e conteúdo progressivo.

## Linguagem do produto

- [ ] Substituir termos excessivamente técnicos ou formais por linguagem natural.
- [ ] Padronizar nomes de botões, títulos, mensagens e ações.
- [ ] Usar `Início` em vez de `Painel de Controle` quando representar a entrada da plataforma.
- [ ] Preferir verbos orientados à ação e ao resultado.
- [ ] Revisar todo o texto do personal e do aluno para consistência.

## Treinos

- [ ] Separar claramente modelo de treino e agenda semanal do aluno.
- [ ] Permitir criar um modelo apenas com nome, objetivo e lista de exercícios.
- [ ] Aplicar o modelo posteriormente em qualquer dia escolhido.
- [ ] Permitir múltiplos treinos ativos quando não houver conflito de dias.
- [ ] Organizar os dias da semana em abas compactas.
- [ ] Reduzir o número de etapas para criar, salvar e aplicar treinos.

**Resultado esperado:** o usuário entende rapidamente o que fazer, aprende a plataforma com menos esforço e conclui as primeiras ações com menos cliques.

---

# Fase 3 — Padronização visual e design system

**Prioridade:** P1

**Objetivo:** consolidar a identidade do FS Fit e reduzir inconsistências de implementação.

## Fundamentos

- [ ] Documentar cores semânticas, tipografia, raios, sombras, espaçamentos e níveis de elevação.
- [ ] Manter o tema oficial:
  - fundo preto grafite;
  - cards chumbo;
  - textos em cinza quase branco;
  - verde para ações e progresso;
  - azul para informação e ações secundárias;
  - amarelo para destaques.
- [ ] Definir tokens CSS reutilizáveis.
- [ ] Consolidar estilos no arquivo oficial, evitando CSS inline e regras de override dispersas.

## Componentes

- [ ] Padronizar botões primários, secundários, destrutivos, ícones e estados desabilitados.
- [ ] Padronizar cards, cabeçalhos, tabs, filtros, listas, formulários, badges e estados vazios.
- [ ] Criar um padrão único de modal com scroll lock, safe area e comportamento móvel.
- [ ] Padronizar feedback de carregamento, sucesso, aviso e erro.
- [ ] Criar componentes ou utilitários reutilizáveis para comportamentos recorrentes.

## Acessibilidade

- [ ] Garantir contraste adequado.
- [ ] Garantir áreas de toque apropriadas.
- [ ] Preservar zoom e escalabilidade do navegador.
- [ ] Adicionar labels, foco visível e navegação por teclado onde aplicável.

**Resultado esperado:** aparência premium, comportamento consistente e menor custo de manutenção visual.

---

# Fase 4 — Performance e escalabilidade

**Prioridade:** P2

**Objetivo:** acelerar o carregamento e preparar o produto para crescimento de uso e dados.

## Front-end

- [ ] Mapear scripts carregados por página.
- [ ] Remover dependências e módulos que não sejam usados no contexto atual.
- [ ] Evitar múltiplos listeners e inicializações concorrentes.
- [ ] Aplicar carregamento sob demanda em módulos pesados.
- [ ] Versionar arquivos CSS e JavaScript de forma consistente.
- [ ] Medir Core Web Vitals e tempos reais no mobile.

## Banco de dados

- [ ] Identificar consultas mais frequentes e mais lentas.
- [ ] Revisar índices em alunos, treinos, sessões, agenda, mensagens, notificações e mensalidades.
- [ ] Evitar consultas excessivas em sequência e padrões N+1.
- [ ] Revisar RPCs e Edge Functions com maior volume.
- [ ] Definir paginação para listas crescentes.
- [ ] Medir consumo do banco, funções e storage.

## Observabilidade

- [ ] Criar métricas de tempo de carregamento e falhas.
- [ ] Criar alertas para erros críticos e indisponibilidade.
- [ ] Registrar operações financeiras e administrativas com rastreabilidade.

**Resultado esperado:** navegação fluida, consultas eficientes e capacidade de crescer sem degradação perceptível.

---

# Fase 5 — Marketing, aquisição e conversão

**Prioridade:** P2

**Objetivo:** comunicar o valor real do produto e aumentar a conversão em teste e assinatura.

## Posicionamento

- [ ] Comunicar primeiro os resultados para o personal:
  - economizar tempo;
  - organizar alunos;
  - reduzir dependência do WhatsApp;
  - oferecer experiência profissional;
  - acompanhar alunos de qualquer lugar;
  - receber mensalidades com mais organização.
- [ ] Usar funcionalidades como prova desses benefícios, não como mensagem principal.

## Landing page

- [ ] Garantir que a nova landing esteja publicada em produção.
- [ ] Destacar preço de lançamento de R$ 29,90 por mês.
- [ ] Destacar 7 dias grátis e alunos ilimitados.
- [ ] Dar mais destaque ao Portal do Aluno.
- [ ] Dar mais destaque à Página Pública Profissional.
- [ ] Mostrar telas reais da plataforma.
- [ ] Adicionar demonstração curta e clara do fluxo.
- [ ] Adicionar prova social assim que houver clientes e resultados verificáveis.

## Conteúdo

- [ ] Criar calendário editorial para Instagram, Reels, Shorts e conteúdos educativos.
- [ ] Produzir vídeos curtos com telas reais do FS Fit.
- [ ] Criar conteúdos que comparem gestão pelo WhatsApp com gestão profissional.
- [ ] Trabalhar SEO para termos usados por personal trainers no Brasil.
- [ ] Medir origem dos cadastros e conversão por canal.

**Resultado esperado:** aumento da compreensão do produto, dos cadastros de teste e da conversão para assinatura.

---

# Fase 6 — Inteligência, retenção e diferenciação

**Prioridade:** P3

**Objetivo:** aumentar retenção e criar diferenciais difíceis de copiar.

## Métricas do produto

- [ ] Medir tempo até o primeiro aluno cadastrado.
- [ ] Medir tempo até o primeiro treino criado e aplicado.
- [ ] Medir conclusão do onboarding.
- [ ] Medir retenção em 7, 30 e 90 dias.
- [ ] Medir frequência de uso do Portal do Aluno.
- [ ] Identificar recursos mais utilizados e abandonados.

## Engajamento

- [ ] Exibir marcos relevantes do personal.
- [ ] Criar indicadores úteis de evolução e atividade.
- [ ] Alertar sobre alunos inativos, mensalidades atrasadas e treinos sem acompanhamento.
- [ ] Evitar gamificação superficial ou excesso de notificações.

## Inteligência artificial

- [ ] Usar IA apenas quando resolver problemas reais.
- [ ] Avaliar sugestões de divisão e organização de treino.
- [ ] Resumir evolução e frequência dos alunos.
- [ ] Identificar alunos em risco de abandono.
- [ ] Auxiliar na comunicação entre personal e aluno.
- [ ] Gerar relatórios e insights, sempre com revisão humana.

**Resultado esperado:** maior retenção, produtividade e diferenciação competitiva.

---

# Regras de execução

## Ordem obrigatória

Nenhuma funcionalidade de P3 deve ser priorizada enquanto existirem pendências críticas de P0.

## Critério para novas funcionalidades

Antes de implementar qualquer novo recurso, responder:

1. Resolve um problema frequente?
2. Aumenta conversão?
3. Melhora retenção?
4. Reduz suporte ou trabalho manual?
5. Reforça o posicionamento do FS Fit?
6. Pode ser mantido e testado com segurança?

Recursos que não atendam a critérios relevantes devem ser adiados.

## Definição de concluído

Uma tarefa somente pode ser considerada concluída quando:

- [ ] o código foi revisado;
- [ ] o fluxo principal foi testado;
- [ ] o comportamento móvel foi validado;
- [ ] erros e estados vazios foram considerados;
- [ ] não foi introduzida duplicação desnecessária;
- [ ] a documentação relacionada foi atualizada;
- [ ] o deploy foi verificado em produção.

---

# Acompanhamento

Este arquivo deve permanecer atualizado durante a execução do projeto.

Ao concluir uma tarefa:

1. marcar o item correspondente;
2. registrar o commit ou pull request relacionado;
3. documentar decisões arquiteturais relevantes;
4. revisar se a alteração criou novas dependências ou pendências.

## Status geral inicial

- Fase 1 — Não iniciada
- Fase 2 — Parcialmente iniciada
- Fase 3 — Parcialmente iniciada
- Fase 4 — Não iniciada
- Fase 5 — Parcialmente iniciada
- Fase 6 — Não iniciada

---

**Última consolidação:** 26 de julho de 2026.
