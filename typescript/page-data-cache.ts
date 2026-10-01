// O cache estrutural de páginas foi desativado intencionalmente.
//
// A implementação anterior armazenava e restaurava blocos completos de innerHTML
// de alunos, agenda, financeiro e bibliotecas. Ao restaurar esses fragmentos, os
// elementos eram recriados sem os listeners registrados pelos módulos das páginas,
// causando interfaces visualmente preenchidas, mas com ações potencialmente inativas.
//
// O carregamento e a revalidação dos dados permanecem sob responsabilidade dos
// módulos específicos de cada página. O cache leve e não estrutural pode ser
// reintroduzido futuramente usando dados serializados e funções oficiais de render,
// sem copiar HTML do DOM.

export {};
