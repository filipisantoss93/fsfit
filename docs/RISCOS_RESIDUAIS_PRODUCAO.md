# Riscos residuais e critérios de produção — FS Fit

## Riscos não bloqueantes conhecidos

- Scripts locais ainda podem gerar avisos de carregamento potencialmente bloqueante.
- Existem inputs legados cuja associação de label deve continuar sendo aprimorada.
- Alguns timers e observers antigos não possuem cleanup detectável estaticamente.
- Determinados modais dinâmicos ainda exigem revisão manual de foco e teclado.
- Imagens e iframes legados podem não utilizar carregamento tardio.
- A auditoria estática não substitui testes reais de Supabase, webhooks, PIX, cartão e PWA.

Esses pontos devem permanecer visíveis nos relatórios de auditoria e ser tratados em lotes futuros, sem enfraquecer os bloqueios já estabelecidos.

## Critérios de pronto para produção

- Todos os workflows obrigatórios estão verdes.
- Não existem imports ou referências locais quebradas.
- Não existem recargas funcionais proibidas.
- Contratos críticos de autenticação, alunos, treinos, agenda, financeiro e assinatura estão presentes.
- Não há segredo privilegiado detectável no código cliente.
- Manifesto e service worker estão presentes.
- Smoke test manual foi concluído sem falha P0/P1.
- Deploy e rollback têm responsável e procedimento definidos.

## Limites da auditoria automática

A auditoria valida estrutura, contratos e padrões detectáveis no repositório. Ela não comprova:

- disponibilidade externa do Supabase, Efí, Resend ou Vercel;
- comportamento de políticas RLS com todos os perfis;
- entrega efetiva de e-mails e notificações push;
- liquidação financeira real;
- compatibilidade com todos os navegadores e dispositivos;
- ausência absoluta de regressões visuais.

## Continuidade recomendada

Após o encerramento dos seis lotes, novas mudanças devem seguir o mesmo modelo: lote consolidado, PR revisável, checks verdes, smoke test proporcional ao risco e registro explícito de rollback.