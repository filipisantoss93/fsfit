import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'css-bundles.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'css', 'bundles', 'manifest.json'), 'utf8'));
const failures = [];
const warnings = [];
const metrics = {
  configuredPages: Object.keys(config.pages || {}).length,
  uniqueBundles: new Set(),
  runtimeStylesheetLinks: 0,
  runtimeImports: 0,
  duplicateBundleSources: 0,
  javascriptStyleBlocks: 0,
  dynamicStylesheetLoaders: 0
};

function stripQuery(value) {
  return value.split(/[?#]/, 1)[0].trim();
}

function readAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2] ?? '';
}

function localStylesheetTags(html) {
  return [...html.matchAll(/<link\b[^>]*>/gi)]
    .map(match => match[0])
    .filter(tag => readAttribute(tag, 'rel').toLowerCase().split(/\s+/).includes('stylesheet'))
    .filter(tag => !/^(?:https?:)?\/\//i.test(readAttribute(tag, 'href')));
}

function pageRoute(page) {
  return page === 'index.html' ? '/' : `/${page}`;
}

function withoutComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function balancedBraces(css) {
  let depth = 0;
  let quote = '';
  let comment = false;
  let escaped = false;

  for (let index = 0; index < css.length; index += 1) {
    const current = css[index];
    const next = css[index + 1];
    if (comment) {
      if (current === '*' && next === '/') { comment = false; index += 1; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (current === '\\') { escaped = true; continue; }
      if (current === quote) quote = '';
      continue;
    }
    if (current === '/' && next === '*') { comment = true; index += 1; continue; }
    if (current === '"' || current === "'") { quote = current; continue; }
    if (current === '{') depth += 1;
    if (current === '}') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0 && !quote && !comment;
}

for (const page of Object.keys(config.pages || {}).sort()) {
  const htmlPath = path.join(root, page);
  if (!fs.existsSync(htmlPath)) {
    failures.push(`${page}: página configurada ausente.`);
    continue;
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  const stylesheets = localStylesheetTags(html);
  metrics.runtimeStylesheetLinks += stylesheets.length;
  if (stylesheets.length !== 1) {
    failures.push(`${page}: deve publicar exatamente um stylesheet local; encontrado ${stylesheets.length}.`);
    continue;
  }

  const tag = stylesheets[0];
  const href = readAttribute(tag, 'href');
  const route = pageRoute(page);
  const expected = manifest.bundles?.[page]?.url;
  if (!/\bdata-fsfit-bundle\b/i.test(tag)) failures.push(`${page}: stylesheet sem data-fsfit-bundle.`);
  if (!/^\/css\/bundles\/fsfit\.[a-f0-9]{16}\.css$/.test(href)) failures.push(`${page}: bundle sem hash de conteúdo: ${href}`);
  if (!expected || href !== expected || manifest.pages?.[route] !== expected) {
    failures.push(`${page}: HTML e manifest apontam para bundles diferentes.`);
    continue;
  }

  metrics.uniqueBundles.add(expected);
  const bundlePath = path.join(root, stripQuery(expected).replace(/^\//, ''));
  if (!fs.existsSync(bundlePath)) {
    failures.push(`${page}: bundle ausente: ${expected}`);
    continue;
  }

  const css = fs.readFileSync(bundlePath, 'utf8');
  const executableCss = withoutComments(css);
  const imports = executableCss.match(/^\s*@import\b/gm) || [];
  metrics.runtimeImports += imports.length;
  if (imports.length) failures.push(`${page}: bundle contém ${imports.length} @import em runtime.`);
  if (!balancedBraces(css)) failures.push(`${page}: bundle possui chaves, comentários ou strings sem fechamento.`);

  const sourceMarkers = [...css.matchAll(/\/\* source: ([^*]+?) \*\//g)].map(match => match[1].trim());
  const duplicateSources = sourceMarkers.filter((source, index) => sourceMarkers.indexOf(source) !== index);
  metrics.duplicateBundleSources += duplicateSources.length;
  if (duplicateSources.length) failures.push(`${page}: fontes repetidas no bundle: ${[...new Set(duplicateSources)].join(', ')}`);
  if (sourceMarkers.length !== manifest.bundles[page].sourceCount) failures.push(`${page}: contagem de fontes diverge do manifest.`);

  const digest = crypto.createHash('sha256').update(css).digest('hex');
  if (manifest.bundles[page].sha256 !== digest || !expected.includes(digest.slice(0, 16))) {
    failures.push(`${page}: hash do bundle não corresponde ao conteúdo.`);
  }
}

const sourceHashes = new Map();
for (const file of fs.readdirSync(path.join(root, 'css')).filter(file => file.endsWith('.css')).sort()) {
  const content = fs.readFileSync(path.join(root, 'css', file), 'utf8');
  const digest = crypto.createHash('sha256').update(content).digest('hex');
  const previous = sourceHashes.get(digest);
  if (previous) failures.push(`CSS de origem idêntico: css/${file} e css/${previous}.`);
  else sourceHashes.set(digest, file);
}

for (const file of fs.readdirSync(path.join(root, 'js')).filter(file => file.endsWith('.js')).sort()) {
  const source = fs.readFileSync(path.join(root, 'js', file), 'utf8');
  const runtimeStylePatterns = [
    /createElement\s*\(\s*['"]style['"]\s*\)/g,
    /\.style\.cssText\s*=/g,
    /\.insertRule\s*\(/g
  ];
  const occurrences = runtimeStylePatterns.reduce((total, pattern) => total + [...source.matchAll(pattern)].length, 0);
  metrics.javascriptStyleBlocks += occurrences;
  if (occurrences) failures.push(`js/${file}: cria ${occurrences} bloco(s) CSS em runtime.`);

  const dynamicStylesheet = /\.rel\s*=\s*['"]stylesheet['"]|setAttribute\s*\(\s*['"]rel['"]\s*,\s*['"]stylesheet['"]/i.test(source);
  if (dynamicStylesheet) {
    metrics.dynamicStylesheetLoaders += 1;
    if (!source.includes('link[data-fsfit-bundle]')) {
      failures.push(`js/${file}: carregador dinâmico de CSS não respeita o bundle compilado.`);
    }
  }
}

const manifestUrls = Object.values(manifest.pages || {});
if (new Set(manifestUrls).size !== metrics.uniqueBundles.size) failures.push('Manifest contém bundle sem página HTML validada.');
for (const page of config.criticalPages || []) {
  const route = pageRoute(page);
  const bundle = manifest.pages?.[route];
  if (!manifest.criticalPages?.includes(route) || !manifest.criticalBundles?.includes(bundle)) {
    failures.push(`${page}: página crítica ausente da instalação atômica.`);
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  metrics: { ...metrics, uniqueBundles: metrics.uniqueBundles.size },
  failures,
  warnings
};
fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(root, 'artifacts', 'css-runtime-report.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log(`Páginas compiladas: ${metrics.configuredPages}`);
console.log(`Bundles únicos: ${metrics.uniqueBundles.size}`);
console.log(`Stylesheets locais em runtime: ${metrics.runtimeStylesheetLinks}`);
console.log(`@import em runtime: ${metrics.runtimeImports}`);
console.log(`Fontes duplicadas em bundles: ${metrics.duplicateBundleSources}`);
console.log(`CSS criado por JavaScript: ${metrics.javascriptStyleBlocks}`);
console.log(`Falhas: ${failures.length}`);

if (failures.length) {
  console.error('\nFALHAS');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('\nContrato de CSS estável validado.');
