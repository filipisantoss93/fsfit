import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const ignoredDirs = new Set(['.git', 'node_modules', '.vercel', 'dist', 'build']);
const failures = [];
const warnings = [];

function walk(dir, extension) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, extension));
    else if (entry.isFile() && full.endsWith(extension)) files.push(full);
  }
  return files;
}

function relative(file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

function stripQuery(value) {
  return value.split(/[?#]/, 1)[0];
}

function localPathFromHtml(htmlFile, href) {
  const clean = stripQuery(href).trim();
  if (!clean || /^(?:https?:)?\/\//i.test(clean) || clean.startsWith('data:')) return null;
  const decoded = decodeURIComponent(clean);
  return decoded.startsWith('/')
    ? path.join(root, decoded.slice(1))
    : path.resolve(path.dirname(htmlFile), decoded);
}

function localPathFromCss(cssFile, target) {
  const clean = stripQuery(target).trim();
  if (!clean || /^(?:https?:)?\/\//i.test(clean) || clean.startsWith('data:')) return null;
  const decoded = decodeURIComponent(clean);
  return decoded.startsWith('/')
    ? path.join(root, decoded.slice(1))
    : path.resolve(path.dirname(cssFile), decoded);
}

const htmlFiles = walk(root, '.html');
const cssUsage = new Map();

for (const htmlFile of htmlFiles) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  const fileName = relative(htmlFile);
  const links = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)]
    .map(match => match[1]);

  const normalized = links.map(stripQuery);
  const duplicates = normalized.filter((value, index) => normalized.indexOf(value) !== index);
  if (duplicates.length) failures.push(`${fileName}: CSS duplicado: ${[...new Set(duplicates)].join(', ')}`);

  for (const href of links) {
    const local = localPathFromHtml(htmlFile, href);
    if (!local) continue;
    const localRelative = relative(local);
    if (!fs.existsSync(local)) failures.push(`${fileName}: stylesheet ausente: ${href}`);
    const users = cssUsage.get(localRelative) || new Set();
    users.add(fileName);
    cssUsage.set(localRelative, users);
  }

  const inlineBlocks = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
  if (inlineBlocks.length) warnings.push(`${fileName}: ${inlineBlocks.length} bloco(s) <style> inline`);

  const inlineAttributes = [...html.matchAll(/\sstyle=["'][^"']*["']/gi)].length;
  if (inlineAttributes) warnings.push(`${fileName}: ${inlineAttributes} atributo(s) style inline`);

  const pageSpecific = normalized.filter(value => value.startsWith('css/') && ![
    'css/style.css',
    'css/header-menu.css',
    'css/legal.css'
  ].includes(value));
  if (pageSpecific.length > 2) {
    warnings.push(`${fileName}: ${pageSpecific.length} folhas específicas carregadas diretamente (${pageSpecific.join(', ')})`);
  }
}

const cssFiles = walk(path.join(root, 'css'), '.css');
for (const cssFile of cssFiles) {
  const fileName = relative(cssFile);
  const css = fs.readFileSync(cssFile, 'utf8');

  if (!cssUsage.has(fileName) && !/@import\s+/i.test(css)) {
    warnings.push(`${fileName}: sem referência direta em HTML; confirmar se é importado ou obsoleto`);
  }

  const imports = [...css.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)["']?\s*\)?/gi)]
    .map(match => match[1]);
  for (const target of imports) {
    const imported = localPathFromCss(cssFile, target);
    if (!imported) continue;
    if (!fs.existsSync(imported)) failures.push(`${fileName}: @import ausente: ${target}`);
  }

  const importantCount = (css.match(/!important\b/g) || []).length;
  if (importantCount > 30) warnings.push(`${fileName}: uso elevado de !important (${importantCount})`);

  const emptyRules = [...css.matchAll(/([^{}]+)\{\s*\}/g)].length;
  if (emptyRules) warnings.push(`${fileName}: ${emptyRules} regra(s) vazia(s)`);
}

console.log(`HTML analisados: ${htmlFiles.length}`);
console.log(`CSS analisados: ${cssFiles.length}`);
console.log(`Falhas: ${failures.length}`);
console.log(`Avisos: ${warnings.length}`);

if (warnings.length) {
  console.log('\nAVISOS');
  warnings.forEach(item => console.log(`- ${item}`));
}

if (failures.length) {
  console.error('\nFALHAS');
  failures.forEach(item => console.error(`- ${item}`));
  process.exitCode = 1;
} else {
  console.log('\nAuditoria estrutural de CSS concluída sem falhas bloqueantes.');
}
