# Design System FS Fit

Este documento define o padrão visual e comportamental obrigatório para as interfaces do FS Fit.

## 1. Princípios

- Mobile first, com prioridade para iPhone e PWA.
- Uma ação primária evidente por contexto.
- Evitar atalhos duplicados e componentes que levam ao mesmo lugar.
- Informações compactas, sem sacrificar legibilidade.
- Componentes reutilizáveis e consistentes entre páginas.
- Verde-lima identifica ações e progresso.
- Azul é reservado a informação, contexto e estados secundários.
- Amarelo é reservado a alertas e pendências.
- Vermelho é reservado a ações destrutivas e erros.

## 2. Estrutura de página

### Cabeçalho

- Título principal curto.
- Botão Voltar compacto quando necessário.
- Subtítulo apenas quando acrescentar contexto real.
- Não repetir o nome da área em cards logo abaixo.

### Conteúdo

- Largura controlada pelo container global.
- Espaçamento vertical entre blocos: 12 a 20 px no mobile.
- Navegação inferior nunca deve cobrir conteúdo ou menus.
- Padding inferior deve considerar `env(safe-area-inset-bottom)`.

## 3. Cards

### Card padrão

- Fundo grafite/chumbo.
- Borda discreta.
- Raio entre 16 e 20 px.
- Padding mobile entre 14 e 18 px.
- Sombra leve, sem brilho excessivo.

### Card de informação

- Título, valor e legenda em hierarquia clara.
- Evitar alturas mínimas excessivas.
- Não usar cards vazios apenas para preencher espaço.

### Estado vazio

- Uma mensagem curta.
- Uma explicação de uma linha.
- No máximo uma ação principal.
- Não repetir o estado vazio em mais de um card na mesma tela.

## 4. Títulos e hierarquia

- Kicker opcional em caixa alta, pequeno e espaçado.
- Título de seção entre 1rem e 1.25rem no mobile.
- Texto auxiliar em cor muted.
- Evitar títulos formais como “Gerenciamento”, “Administração” ou “Configuração” quando uma palavra simples funcionar.

## 5. Botões

### Primário

- Verde-lima preenchido.
- Uma ação principal por bloco.
- Texto direto: “Criar treino”, “Adicionar aluno”, “Salvar”.

### Secundário

- Contorno verde-lima ou estilo neutro, conforme contexto.
- Não competir visualmente com o primário.

### Destrutivo

- Vermelho.
- Preferencialmente dentro de menu contextual ou confirmação.
- Nunca ao lado do primário com o mesmo peso visual.

### Tamanho

- Altura mínima padrão: 44 px.
- Em ações compactas: 38 a 42 px.
- Botões de largura total somente quando a ação realmente exigir destaque.

## 6. Abas

- Usar uma única linha de navegação por nível.
- Não criar duas barras com opções equivalentes.
- Aba ativa com fundo verde translúcido e texto verde-lima.
- No mobile, manter rótulos curtos.
- Abas sticky devem preencher a área superior para impedir conteúdo vazando por trás.

## 7. Menus contextuais

- Botão de três pontos separado de badges e títulos.
- Popover compacto, ancorado ao botão.
- Largura aproximada: 220 a 260 px.
- Deve permanecer acima da navegação inferior.
- Fechar ao tocar fora ou pressionar Escape.
- Ação destrutiva sempre por último e em vermelho.

## 8. Modais

- Fora do fluxo da página quando fechados.
- `display: none` e `aria-hidden="true"` no estado fechado.
- Bloquear rolagem da página somente enquanto abertos.
- Respeitar safe areas do iPhone.
- Conteúdo interno rolável, sem rolar a página por trás.
- Botão fechar sempre dentro do modal.

## 9. Página de treinos

Estrutura oficial:

1. Cabeçalho com nome do aluno.
2. Navegação única:
   - Semana
   - Treinos salvos
3. Semana:
   - abrir no dia atual;
   - abas dos sete dias;
   - exibir treinos aplicados;
   - permitir mais de um treino quando não houver conflito;
   - estado “Dia livre” compacto.
4. Treinos salvos:
   - criar lista sem escolher dia;
   - adicionar e ordenar exercícios;
   - aplicar posteriormente em um ou vários dias;
   - edição do modelo não altera automaticamente cópias já aplicadas.

## 10. Ficha do aluno

- Cabeçalho compacto com foto/iniciais, nome, idade e status.
- Menu contextual separado do badge de status.
- Uma única barra de abas.
- Cards internos com densidade consistente.
- Acesso, resumo físico, planejamento e evolução devem seguir o mesmo padrão de título e espaçamento.

## 11. Ordem de aplicação

1. Treinos.
2. Ficha do aluno.
3. Lista de alunos.
4. Início e visão geral.
5. Agenda.
6. Financeiro e mensalidades.
7. Assinatura.
8. Perfil e configurações.

## 12. Critério de aceite

Uma página está padronizada quando:

- não possui navegação duplicada;
- não possui ações equivalentes repetidas;
- usa os mesmos padrões de card, botão, aba, modal e estado vazio;
- funciona sem sobreposição no iPhone;
- respeita safe areas;
- mantém rolagem correta;
- parece parte do mesmo produto que as demais páginas.