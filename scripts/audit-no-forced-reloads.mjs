import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ignoredDirectories = new Set(['.git', 'node_modules', '.vercel', 'dist', 'build', 'coverage']);
const auditFile = 'scripts/audit-no-forced-reloads.mjs';
const failures = [];
const allowed = [];
const allowMarker = 'fsfit-allow-reload:';
const explicitExceptions = new Map([
  ['js/aluno-sessao-controles.js', 'Ação manual “Tentar novamente” após timeout do portal do aluno.'],
  ['js/mobile-experience.js', 'Gesto manual de pull-to-refresh solicitado pelo usuário.'],
  ['js/shared-components.js', 'Aplicação explícita de atualização do service worker/PWA.']
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

function maskNonExecutable(content) {
  const chars = [...content];
  let state = 'code';
  let quote = '';
  let escaped = false;

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    const next = chars[index + 1];

    if (state === 'line-comment') {
      if (char === '\n') state = 'code';
      else chars[index] = ' ';
      continue;
    }

    if (state === 'block-comment') {
      if (char === '*' && next === '/') {
        chars[index] = ' ';
        chars[index + 1] = ' ';
        index += 1;
        state = 'code';
      } else if (char !== '\n') chars[index] = ' ';
      continue;
    }

    if (state === 'string') {
      if (escaped) {
        escaped = false;
        if (char !== '\n') chars[index] = ' ';
        continue;
      }
      if (char === '\\') {
        escaped = true;
        chars[index] = ' ';
        continue;
      }
      if (char === quote) {
        chars[index] = ' ';
        state = 'code';
      } else if (char !== '\n') chars[index] = ' ';
      continue;
    }

    if (char === '/' && next === '/') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      index += 1;
      state = 'line-comment';
      continue;
    }

    if (char === '/' && next === '*') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      index += 1;
      state = 'block-comment';
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      chars[index] = ' ';
      state = 'string';
    }
  }

  return chars.join('');
}

const patterns = [
  { name: 'location.reload()', regex: /(?:window\s*\.\s*)?location\s*\.\s*reload\s*\(/g },
  { name: 'history.go(0)', regex: /(?:window\s*\.\s*)?history\s*\.\s*go\s*\(\s*0\s*\)/g }
];

for (const file of walk(root)) {
  const relativePath = relative(root, file).replaceAll('\\', '/');
  if (relativePath === auditFile) continue;
  const content = readFileSync(file, 'utf8');
  const executable = maskNonExecutable(content);
  const lines = content.split('\n');

  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(executable))) {
      const lineNumber = executable.slice(0, match.index).split('\n').length;
      const currentLine = lines[lineNumber - 1] || '';
      const previousLine = lines[lineNumber - 2] || '';
      const finding = `${relativePath}:${lineNumber} usa ${pattern.name}`;
      const inlineJustification = currentLine.includes(allowMarker) || previousLine.includes(allowMarker);
      const explicitReason = explicitExceptions.get(relativePath);

      if (inlineJustification || explicitReason) {
        allowed.push(`${finding}${explicitReason ? ` — ${explicitReason}` : ''}`);
      } else {
        failures.push(finding);
      }
    }
  }
}

if (allowed.length) {
  console.warn('\nExceções justificadas de recarga:\n');
  allowed.forEach(item => console.warn(`- ${item}`));
}

if (failures.length) {
  console.error('\nRecargas forçadas sem justificativa encontradas:\n');
  failures.forEach(item => console.error(`- ${item}`));
  console.error(`\nSubstitua por atualização local ou documente uma exceção real com "${allowMarker} motivo".`);
  process.exit(1);
}

console.log(`Auditoria concluída: nenhuma recarga sem justificativa; ${allowed.length} exceção(ões) documentada(s).`);
