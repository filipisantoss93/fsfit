import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ignoredDirectories = new Set(['.git', 'node_modules', '.vercel', 'dist', 'build', 'coverage']);
const auditFile = 'scripts/audit-no-forced-reloads.mjs';
const failures = [];
const recoveryOnly = [];
const recoveryFiles = new Set([
  'js/aluno-sessao-controles.js',
  'js/mobile-experience.js',
  'js/shared-components.js',
  'js/supabase.js'
]);

function walk(directory, files = []) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) walk(fullPath, files);
    else if (['.js', '.mjs'].includes(extname(fullPath).toLowerCase())) files.push(fullPath);
  }
  return files;
}

const patterns = [
  { name: 'location.reload()', regex: /(?:window\s*\.\s*)?location\s*\.\s*reload\s*\(/g },
  { name: 'history.go(0)', regex: /(?:window\s*\.\s*)?history\s*\.\s*go\s*\(\s*0\s*\)/g }
];

for (const file of walk(root)) {
  const relativePath = relative(root, file).replaceAll('\\', '/');
  if (relativePath === auditFile) continue;
  const content = readFileSync(file, 'utf8');

  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(content))) {
      const line = content.slice(0, match.index).split('\n').length;
      const finding = `${relativePath}:${line} usa ${pattern.name}`;
      if (recoveryFiles.has(relativePath)) recoveryOnly.push(finding);
      else failures.push(finding);
    }
  }
}

if (recoveryOnly.length) {
  console.warn('\nRecargas restritas a recuperação/ação explícita encontradas:\n');
  recoveryOnly.forEach(item => console.warn(`- ${item}`));
}

if (failures.length) {
  console.error('\nRecargas forçadas em fluxos funcionais encontradas:\n');
  failures.forEach(item => console.error(`- ${item}`));
  console.error('\nSubstitua por atualização local de estado/DOM ou navegação explícita para outra página.');
  process.exit(1);
}

console.log(`Auditoria concluída: ${recoveryOnly.length} recarga(s) restrita(s) a recuperação e nenhuma em fluxo funcional.`);
