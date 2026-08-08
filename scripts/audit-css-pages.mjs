import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportDir = path.join(root, 'artifacts');
const reportPath = path.join(reportDir, 'css-audit-report.json');
const ignoredDirs = new Set(['.git', 'node_modules', '.vercel', 'dist', 'build', 'artifacts', 'bundles']);
const failures = [];
const warnings = [];
const metrics = {
  htmlFiles: 0,
  cssFiles: 0,
  inlineStyleBlocks: 0,
  inlineStyleAttributes: 0,
  importantDeclarations: 0,
  emptyRules: 0,
  directCssReferences: 0,
  importedCssReferences: 0
};

function walk(dir, extension) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
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

function isExternal(value) {
  return !value || /^(?:https?:)?\/\//i.test(value) || value.startsWith('data:');
}

function resolveLocal(baseFile, target) {
  const clean = stripQuery(target).trim();
  if (isExternal(clean)) return null;
  const decoded = decodeURIComponent(clean);
  return decoded.startsWith('/')
    ? path.join(root, decoded.slice(1))
    : path.resolve(path.dirname(baseFile), decoded);
}

function getCssImports(cssFile, css) {
  const executableCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...executableCss.matchAll(/^[\t ]*@import\s+(?:url\()?\s*["']?([^"')\s;]+)["']?\s*\)?/gim)]
    .map(match => ({ target: match[1], resolved: resolveLocal(cssFile, match[1]) }));
}

const htmlFiles = walk(root, '.html');
const cssFiles = walk(path.join(root, 'css'), '.css');
const directUsage = new Map();
const importUsage = new Map();
const cssGraph = new Map();

metrics.htmlFiles = htmlFiles.length;
metrics.cssFiles = cssFiles.length;

const bundleManifestPath = path.join(root, 'css', 'bundles', 'manifest.json');
if (fs.existsSync(bundleManifestPath)) {
  const bundleManifest = JSON.parse(fs.readFileSync(bundleManifestPath, 'utf8'));
  for (const [page, bundle] of Object.entries(bundleManifest.bundles || {})) {
    for (const source of bundle.sources || []) {
      const users = directUsage.get(source) || new Set();
      users.add(page);
      directUsage.set(source, users);
    }
  }
}

for (const htmlFile of htmlFiles) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  const fileName = relative(htmlFile);
  const links = [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)]
    .map(match => match[1]);

  const normalized = links.map(stripQuery);
  const duplicates = normalized.filter((value, index) => normalized.indexOf(value) !== index);
  if (duplicates.length) failures.push(`${fileName}: CSS duplicado: ${[...new Set(duplicates)].join(', ')}`);

  for (const href of links) {
    const local = resolveLocal(htmlFile, href);
    if (!local) continue;
    metrics.directCssReferences += 1;
    const localRelative = relative(local);
    if (!fs.existsSync(local)) failures.push(`${fileName}: stylesheet ausente: ${href}`);
    const users = directUsage.get(localRelative) || new Set();
    users.add(fileName);
    directUsage.set(localRelative, users);
  }

  const inlineBlocks = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].length;
  const inlineAttributes = [...html.matchAll(/\sstyle=["'][^"']*["']/gi)].length;
  metrics.inlineStyleBlocks += inlineBlocks;
  metrics.inlineStyleAttributes += inlineAttributes;
  if (inlineBlocks) warnings.push(`${fileName}: ${inlineBlocks} bloco(s) <style> inline`);
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

for (const cssFile of cssFiles) {
  const fileName = relative(cssFile);
  const css = fs.readFileSync(cssFile, 'utf8');
  const imports = getCssImports(cssFile, css);
  cssGraph.set(fileName, imports.map(item => item.resolved ? relative(item.resolved) : item.target));

  for (const { target, resolved } of imports) {
    if (!resolved) continue;
    metrics.importedCssReferences += 1;
    const importedRelative = relative(resolved);
    if (!fs.existsSync(resolved)) failures.push(`${fileName}: @import ausente: ${target}`);
    const users = importUsage.get(importedRelative) || new Set();
    users.add(fileName);
    importUsage.set(importedRelative, users);
  }

  const importantCount = (css.match(/!important\b/g) || []).length;
  const emptyRules = [...css.matchAll(/([^{}]+)\{\s*\}/g)].length;
  metrics.importantDeclarations += importantCount;
  metrics.emptyRules += emptyRules;

  if (importantCount > 30) warnings.push(`${fileName}: uso elevado de !important (${importantCount})`);
  if (emptyRules) warnings.push(`${fileName}: ${emptyRules} regra(s) vazia(s)`);
}

const orphanCss = cssFiles
  .map(relative)
  .filter(fileName => !directUsage.has(fileName) && !importUsage.has(fileName));

for (const fileName of orphanCss) {
  warnings.push(`${fileName}: sem referência direta ou via @import; confirmar se é obsoleto`);
}

const report = {
  generatedAt: new Date().toISOString(),
  metrics,
  failures,
  warnings,
  orphanCss,
  directUsage: Object.fromEntries([...directUsage].map(([file, users]) => [file, [...users].sort()])),
  importUsage: Object.fromEntries([...importUsage].map(([file, users]) => [file, [...users].sort()])),
  cssGraph: Object.fromEntries([...cssGraph].sort(([a], [b]) => a.localeCompare(b)))
};

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`HTML analisados: ${metrics.htmlFiles}`);
console.log(`CSS analisados: ${metrics.cssFiles}`);
console.log(`Referências diretas: ${metrics.directCssReferences}`);
console.log(`Referências via @import: ${metrics.importedCssReferences}`);
console.log(`CSS potencialmente órfãos: ${orphanCss.length}`);
console.log(`Falhas: ${failures.length}`);
console.log(`Avisos: ${warnings.length}`);
console.log(`Relatório: ${relative(reportPath)}`);

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
