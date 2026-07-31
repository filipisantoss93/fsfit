import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ignoredDirectories = new Set(['.git', 'node_modules', '.vercel', 'dist', 'build', 'coverage']);
const forbiddenRuntimeFiles = new Set([
  'resource-lifecycle-autowire.js',
  'realtime-lifecycle-autowire.js',
  'mobile-lifecycle-runtime.js'
]);
const failures = [];
const stats = {
  htmlFiles: 0,
  scriptTags: 0,
  javascriptFiles: 0,
  localImports: 0
};

function fail(message) {
  failures.push(message);
}

function walk(directory, predicate, files = []) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) walk(fullPath, predicate, files);
    else if (predicate(fullPath)) files.push(fullPath);
  }
  return files;
}

function cleanReference(value) {
  return String(value || '').trim().split('#')[0].split('?')[0];
}

function isExternalReference(value) {
  return /^(?:[a-z]+:)?\/\//i.test(value)
    || /^(?:data|blob|mailto|tel|javascript):/i.test(value);
}

function resolveLocalReference(fromFile, reference) {
  const clean = cleanReference(reference);
  if (!clean || isExternalReference(clean)) return null;
  if (clean.startsWith('/')) return normalize(join(root, clean.slice(1)));
  return normalize(resolve(dirname(fromFile), clean));
}

function assertInsideRepository(target, source, reference) {
  const relativeTarget = relative(root, target);
  if (relativeTarget.startsWith('..') || relativeTarget === '') {
    if (relativeTarget.startsWith('..')) {
      fail(`${relative(root, source)} referencia caminho fora do repositório: ${reference}`);
    }
    return false;
  }
  return true;
}

function validateLocalFile(source, reference, context) {
  const target = resolveLocalReference(source, reference);
  if (!target) return;
  if (!assertInsideRepository(target, source, reference)) return;
  if (!existsSync(target) || !statSync(target).isFile()) {
    fail(`${relative(root, source)} possui ${context} inexistente: ${reference}`);
  }
}

function parseScriptAttributes(tag) {
  const attributes = {};
  const pattern = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match;
  while ((match = pattern.exec(tag))) {
    const name = match[1].toLowerCase();
    if (name === 'script') continue;
    attributes[name] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attributes;
}

function auditHtml(file) {
  stats.htmlFiles += 1;
  const content = readFileSync(file, 'utf8');
  const scripts = [];
  const scriptPattern = /<script\b[^>]*>/gi;
  let match;

  while ((match = scriptPattern.exec(content))) {
    const attributes = parseScriptAttributes(match[0]);
    if (!attributes.src) continue;
    stats.scriptTags += 1;
    const cleanSrc = cleanReference(attributes.src);
    const type = String(attributes.type || '').toLowerCase() === 'module' ? 'module' : 'classic';
    scripts.push({ src: attributes.src, cleanSrc, type });
    validateLocalFile(file, attributes.src, 'script');
  }

  const grouped = new Map();
  for (const script of scripts) {
    if (!script.cleanSrc || isExternalReference(script.cleanSrc)) continue;
    const key = script.cleanSrc.replace(/^\.\//, '');
    const entries = grouped.get(key) || [];
    entries.push(script);
    grouped.set(key, entries);
  }

  for (const [src, entries] of grouped) {
    if (entries.length > 1) {
      fail(`${relative(root, file)} carrega o mesmo script mais de uma vez: ${src}`);
    }
    const types = new Set(entries.map(entry => entry.type));
    if (types.size > 1) {
      fail(`${relative(root, file)} mistura script clássico e module para: ${src}`);
    }
  }

  for (const forbidden of forbiddenRuntimeFiles) {
    if (content.includes(forbidden)) {
      fail(`${relative(root, file)} referencia runtime removido: ${forbidden}`);
    }
  }
}

function auditJavascript(file) {
  stats.javascriptFiles += 1;
  const content = readFileSync(file, 'utf8');
  const references = [];
  const patterns = [
    /\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content))) references.push(match[1]);
  }

  for (const reference of references) {
    const clean = cleanReference(reference);
    if (!clean || isExternalReference(clean)) continue;
    if (!clean.startsWith('.') && !clean.startsWith('/')) continue;
    stats.localImports += 1;
    validateLocalFile(file, reference, 'import local');
  }

  for (const forbidden of forbiddenRuntimeFiles) {
    if (content.includes(forbidden)) {
      fail(`${relative(root, file)} referencia runtime removido: ${forbidden}`);
    }
  }
}

const htmlFiles = walk(root, file => extname(file).toLowerCase() === '.html');
const javascriptFiles = walk(root, file => ['.js', '.mjs'].includes(extname(file).toLowerCase()));

htmlFiles.forEach(auditHtml);
javascriptFiles.forEach(auditJavascript);

if (!htmlFiles.length) fail('Nenhuma página HTML foi encontrada para auditoria.');
if (!javascriptFiles.length) fail('Nenhum arquivo JavaScript foi encontrado para auditoria.');

if (failures.length) {
  console.error('\nAuditoria de carregamento falhou:\n');
  failures.forEach(item => console.error(`- ${item}`));
  console.error(`\nTotal de falhas: ${failures.length}`);
  process.exit(1);
}

console.log('Auditoria de carregamento concluída.');
console.log(`HTML: ${stats.htmlFiles}`);
console.log(`Scripts locais/externos declarados: ${stats.scriptTags}`);
console.log(`Arquivos JavaScript: ${stats.javascriptFiles}`);
console.log(`Imports locais validados: ${stats.localImports}`);
