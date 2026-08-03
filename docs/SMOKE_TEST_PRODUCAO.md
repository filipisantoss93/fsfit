# Smoke test de produção — FS Fit

Execute após o deploy em janela controlada. Registre data, responsável, commit implantado e resultado de cada etapa.

## 1. Acesso e autenticação

- Abrir a página pública em aba anônima.
- Cadastrar uma conta de teste e confirmar o e-mail.
- Entrar, sair e entrar novamente.
- Confirmar que páginas protegidas redirecionam usuários sem sessão.
- Testar recuperação e redefinição de senha.

## 2. Perfil e alunos

- Completar ou editar o perfil do personal.
- Cadastrar um aluno de teste.
- Editar dados, telefone, observações e foto.
- Arquivar e reativar o aluno.
- Abrir a visualização do aluno e confirmar isolamento entre contas.

## 3. Treinos

- Criar um treino livre com exercícios.
- Salvar como modelo e aplicar ao aluno.
- Personalizar um dia e incluir exercício avulso.
- Confirmar atualização da interface sem recarga forçada.
- Abrir o portal do aluno e validar séries, repetições, descanso e mídia.

## 4. Agenda e aula

- Criar compromisso em horário não arredondado.
- Editar e cancelar o compromisso.
- Iniciar uma aula e confirmar os controles do personal e do aluno.
- Finalizar a sessão e verificar histórico/estado final.

## 5. Financeiro

- Criar mensalidade de teste.
- Alterar vencimento e status.
- Registrar pagamento e confirmar atualização local dos cards.
- Validar filtros, totais e estados vazios.

## 6. Assinatura

- Abrir a página de assinatura.
- Iniciar fluxo PIX em ambiente de teste/controlado.
- Validar geração, consulta e cancelamento de cobrança pendente.
- Validar renovação e mensagens de erro sem duplicação de ação.
- Não executar cobrança real sem autorização explícita.

## 7. Portal do aluno e PWA

- Entrar como aluno e navegar pela tela inicial, treino, agenda, financeiro e chat.
- Validar instalação do PWA em dispositivo compatível.
- Confirmar ícone, nome, modo standalone e atualização do service worker.
- Testar rede lenta e indisponibilidade temporária.

## 8. Responsividade e acessibilidade

- Testar iPhone, Android e desktop.
- Navegar por teclado nos formulários e modais principais.
- Confirmar foco visível, fechamento por `Esc` quando aplicável e nomes acessíveis.
- Verificar loading, sucesso, erro e estado vazio nos fluxos críticos.

## Critério de aprovação

O deploy somente é aprovado quando não houver falha P0/P1, todos os workflows estiverem verdes e autenticação, aluno, treino, agenda, financeiro e assinatura tiverem sido verificados.