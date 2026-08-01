import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ignoredDirectories = new Set(['.git', 'node_modules', '.vercel', 'dist', 'build', 'coverage']);
const auditFile = 'scripts/audit-no-forced-reloads.mjs';
const forbiddenPatterns = [
  { label: 'location.reload()', pattern: /(?:window\s*\.\s*)?location\s*\.\s*reload\s*\(/g },
  { label: 'history.go(0)', pattern: /(?:window\s*\.\s*)?history\s*\.\s*go\s*\(\s*0\s*\)/g }
];
const failures = [];
let filesChecked = 0;

function walk(directory, files = []) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) walk(fullPath, files);
    else if (['.js', '.mjs', '.html'].includes(extname(fullPath).toLowerCase())) files.push(fullPath);
  }
  return files;
}

function lineNumber(content, index) {
  return content.slice(0, index).split('\n').length;
}

for (const file of walk(root)) {
  const relativePath = relative(root, file);
  if (relativePath === auditFile) continue;
  filesChecked += 1;
  const content = readFileSync(file, 'utf8');

  for (const { label, pattern } of forbiddenPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content))) {
      failures.push(`${relativePath}:${lineNumber(content, match.index)} usa ${label}`);
    }
  }
}

if (failures.length) {
  console.error('\nRecargas forçadas encontradas:\n');
  failures.forEach(failure => console.error(`- ${failure}`));
  console.error('\nUse atualização local de estado/DOM ou navegação explícita para outra página.');
  process.exit(1);
}

console.log(`Auditoria concluída: ${filesChecked} arquivos sem recargas forçadas.`);
