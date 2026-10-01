import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const config = JSON.parse(readFileSync(join(root, 'config/css-bundles.json'), 'utf8'));
const failures = [];

const expectedTitles = new Map([
  ['painel.html', 'Painel'],
  ['alunos.html', 'Alunos'],
  ['agenda.html', 'Agenda'],
  ['financeiro.html', 'Financeiro'],
  ['perfil.html', 'Meu Perfil'],
  ['assinatura.html', 'Minha assinatura'],
  ['biblioteca-exercicios.html', 'Biblioteca de exercícios'],
  ['biblioteca-alimentar.html', 'Biblioteca alimentar'],
  ['contato.html', 'Contato'],
  ['admin.html', 'Painel administrativo'],
  ['admin-contatos.html', 'Suporte interno'],
  ['admin-assinaturas.html', 'Saúde da assinatura']
]);

const uxPages = [
  'abrir-whatsapp-lembrete.html','acesso-aluno.html','admin-assinaturas.html','admin-contatos.html','admin.html',
  'agenda.html','aluno-preview.html','aluno.html','alunos.html','assinatura.html','biblioteca-alimentar.html',
  'biblioteca-exercicios.html','contato.html','dieta-aluno.html','ficha-aluno.html','financeiro.html',
  'lembretes-aluno.html','nova-senha.html','painel.html','perfil.html','recuperar-senha.html',
  'selecionar-personal.html','treino-aluno.html','visualizar-aluno.html'
];

for (const page of uxPages) {
  const full = join(root, page);
  if (!existsSync(full)) {
    failures.push(`${page}: arquivo ausente`);
    continue;
  }
  const html = readFileSync(full, 'utf8');
  if (!/<main\b/i.test(html)) failures.push(`${page}: sem elemento <main>`);
  if (!/<h1\b/i.test(html)) failures.push(`${page}: sem título H1`);
  const styles = config.pages?.[page]?.styles || [];
  if (!styles.includes('css/style.css')) failures.push(`${page}: sem style.css global no bundle`);
}

for (const [page, expected] of expectedTitles) {
  const html = readFileSync(join(root, page), 'utf8');
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!match) continue;
  const actual = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (actual !== expected) failures.push(`${page}: H1 esperado "${expected}", encontrado "${actual}"`);
}

for (const page of ['biblioteca-exercicios.html','biblioteca-alimentar.html']) {
  const html = readFileSync(join(root, page), 'utf8');
  if (/href="alunos\.html"[^>]*>\s*←\s*Voltar\s*</i.test(html)) failures.push(`${page}: retorno genérico deve nomear o destino Alunos`);
}

for (const page of ['dieta-aluno.html','lembretes-aluno.html']) {
  const html = readFileSync(join(root, page), 'utf8');
  if (!/id="back-link"/i.test(html)) failures.push(`${page}: link de retorno do aluno ausente`);
}

if (failures.length) {
  console.error(`Auditoria de consistência UX falhou com ${failures.length} ocorrência(s):`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`Consistência UX estrutural validada em ${uxPages.length} páginas internas.`);
