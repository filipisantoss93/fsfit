import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const configPath = path.join(root, 'config', 'css-bundles.json');
const bundlesDir = path.join(root, 'css', 'bundles');
const bundleManifestPath = path.join(bundlesDir, 'manifest.json');
const writeMode = process.argv.includes('--write') || process.argv.includes('--init');
const initMode = process.argv.includes('--init');
const failures = [];
const changed = [];
const expectedWrites = new Map();

const criticalPages = [
  'index.html',
  'painel.html',
  'agenda.html',
  'alunos.html',
  'financeiro.html',
  'acesso-aluno.html',
  'aluno.html'
];

function relative(file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

function stripQuery(value) {
  return value.split(/[?#]/, 1)[0].trim();
}

function isExternal(value) {
  return !value || /^(?:https?:)?\/\//i.test(value) || /^(?:data|blob):/i.test(value);
}

function insideRoot(file) {
  const result = path.relative(root, file);
  return result && !result.startsWith(`..${path.sep}`) && result !== '..' && !path.isAbsolute(result);
}

function resolveDocumentAsset(pageFile, value) {
  const clean = stripQuery(value);
  if (isExternal(clean)) return null;
  const resolved = clean.startsWith('/')
    ? path.join(root, clean.slice(1))
    : path.resolve(path.dirname(pageFile), clean);
  return insideRoot(resolved) ? resolved : null;
}

function readAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  return match?.[2] ?? '';
}

function stylesheetTags(html) {
  return [...html.matchAll(/<link\b[^>]*>/gi)]
    .map(match => match[0])
    .filter(tag => readAttribute(tag, 'rel').toLowerCase().split(/\s+/).includes('stylesheet'));
}

function localStylesForPage(pageFile, html) {
  return stylesheetTags(html)
    .map(tag => readAttribute(tag, 'href'))
    .map(href => resolveDocumentAsset(pageFile, href))
    .filter(Boolean)
    .map(relative);
}

function initializeConfig() {
  if (fs.existsSync(configPath)) {
    throw new Error(`${relative(configPath)} já existe; --init só pode ser usado na migração inicial.`);
  }

  const pages = {};
  for (const page of fs.readdirSync(root).filter(file => file.endsWith('.html')).sort()) {
    const pageFile = path.join(root, page);
    const styles = [...new Set(localStylesForPage(pageFile, fs.readFileSync(pageFile, 'utf8')))]
      .filter(file => !file.startsWith('css/bundles/'));
    if (styles.length) pages[page] = { styles };
  }

  const config = { version: 1, criticalPages, pages };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  changed.push(relative(configPath));
}

function resolveModuleAsset(moduleFile, value) {
  const clean = stripQuery(value);
  if (isExternal(clean) || !clean.endsWith('.js')) return null;
  const resolved = clean.startsWith('/')
    ? path.join(root, clean.slice(1))
    : clean.startsWith('.')
      ? path.resolve(path.dirname(moduleFile), clean)
      : path.join(root, clean);
  if (!insideRoot(resolved) || !resolved.startsWith(path.join(root, 'js'))) return null;
  return fs.existsSync(resolved) ? resolved : null;
}

function pageScriptEntries(pageFile, html) {
  const entries = [];
  for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) ?? []) {
    const source = readAttribute(tag, 'src') || readAttribute(tag, 'href');
    const resolved = resolveDocumentAsset(pageFile, source);
    if (resolved?.endsWith('.js') && fs.existsSync(resolved)) entries.push(resolved);
  }
  return entries;
}

function supportedModulePages(source) {
  const declaration = source.match(/\bconst\s+SUPPORTED_PAGES\s*=\s*new\s+Set\s*\(\s*\[([\s\S]*?)\]\s*\)/);
  if (!declaration) return null;
  return new Set([...declaration[1].matchAll(/["']([^"']+)["']/g)].map(match => match[1]));
}

function discoverScriptCss(pageFile, html) {
  const queue = pageScriptEntries(pageFile, html);
  const seen = new Set();
  const visited = new Set();
  const css = [];
  const pageName = path.basename(pageFile);

  while (queue.length) {
    const moduleFile = queue.shift();
    const moduleName = relative(moduleFile);
    if (seen.has(moduleName)) continue;
    seen.add(moduleName);

    let source = fs.readFileSync(moduleFile, 'utf8');
    const supportedPages = supportedModulePages(source);
    if (supportedPages && !supportedPages.has(pageName)) continue;
    visited.add(moduleName);

    const peerCss = path.join(root, 'css', `${path.basename(moduleFile, '.js')}.css`);
    if (fs.existsSync(peerCss)) css.push(peerCss);

    if (moduleName === 'js/layout.js') {
      source = source.replace(
        /if\s*\(\s*currentPage\(\)\s*===\s*['"]([^'"]+)['"]\s*\)\s*\{([\s\S]*?)^\}/gm,
        (block, targetPage) => targetPage === pageName ? block : ''
      );
    }
    let assets;
    if (moduleName === 'js/page-module-loader.js') {
      assets = [...source.matchAll(/\{[^{}]*?pages:\s*(?:'(\*)'|\[([^\]]*)\])[^{}]*?source:\s*['"]([^'"]+\.js[^'"]*)['"][^{}]*?\}/g)]
        .filter(match => match[1] === '*' || [...(match[2] || '').matchAll(/['"]([^'"]+)['"]/g)].some(page => page[1] === pageName))
        .map(match => match[3]);
    } else {
      assets = [...source.matchAll(/["'`]([^"'`]+?\.(?:js|css)(?:\?[^"'`]*)?)["'`]/g)]
        .map(match => match[1]);
    }

    for (const asset of assets) {
      if (stripQuery(asset).endsWith('.js')) {
        const resolvedModule = resolveModuleAsset(moduleFile, asset);
        if (resolvedModule) queue.push(resolvedModule);
        continue;
      }

      const resolvedCss = resolveDocumentAsset(pageFile, asset);
      if (resolvedCss?.startsWith(path.join(root, 'css')) && fs.existsSync(resolvedCss)) css.push(resolvedCss);
    }
  }

  return { css: css.map(relative), modules: [...visited].sort() };
}

function cssImportPattern() {
  return /^[\t ]*@import\s+(?:url\(\s*)?(?:(["'])(.*?)\1|([^'"\)\s;]+))\s*\)?\s*([^;]*);/gim;
}

function resolveCssImport(cssFile, target) {
  const clean = stripQuery(target);
  if (isExternal(clean)) throw new Error(`${relative(cssFile)} contém @import externo: ${target}`);
  const resolved = clean.startsWith('/')
    ? path.join(root, clean.slice(1))
    : path.resolve(path.dirname(cssFile), clean);
  if (!insideRoot(resolved) || !resolved.startsWith(path.join(root, 'css'))) {
    throw new Error(`${relative(cssFile)} contém @import fora de css/: ${target}`);
  }
  if (!fs.existsSync(resolved)) throw new Error(`${relative(cssFile)} importa arquivo ausente: ${target}`);
  return resolved;
}

function expandCss(cssFile, mediaStack = [], stack = []) {
  const fileName = relative(cssFile);
  if (stack.includes(fileName)) throw new Error(`Ciclo de @import: ${[...stack, fileName].join(' -> ')}`);

  const source = fs.readFileSync(cssFile, 'utf8').replace(/^\uFEFF/, '');
  const imports = [...source.matchAll(cssImportPattern())];
  const instances = [];

  for (const match of imports) {
    const target = match[2] || match[3];
    const media = (match[4] || '').trim();
    instances.push(...expandCss(
      resolveCssImport(cssFile, target),
      media ? [...mediaStack, media] : mediaStack,
      [...stack, fileName]
    ));
  }

  const body = source.replace(cssImportPattern(), '').trim();
  if (body) instances.push({ file: fileName, media: mediaStack, content: body });
  return instances;
}

function renderInstance(instance) {
  let content = `/* source: ${instance.file} */\n${instance.content}`;
  for (let index = instance.media.length - 1; index >= 0; index -= 1) {
    content = `@media ${instance.media[index]} {\n${content}\n}`;
  }
  return content;
}

function compileBundle(entries) {
  const occurrences = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry);
    if (!insideRoot(fullPath) || !fullPath.startsWith(path.join(root, 'css'))) {
      throw new Error(`Entrada CSS inválida: ${entry}`);
    }
    if (!fs.existsSync(fullPath)) throw new Error(`Entrada CSS ausente: ${entry}`);
    occurrences.push(...expandCss(fullPath));
  }

  const contextsByFile = new Map();
  for (const occurrence of occurrences) {
    const context = occurrence.media.join(' || ');
    const contexts = contextsByFile.get(occurrence.file) || new Set();
    contexts.add(context);
    contextsByFile.set(occurrence.file, contexts);
  }
  for (const [file, contexts] of contextsByFile) {
    if (contexts.size > 1) {
      throw new Error(`${file} aparece em contextos de mídia diferentes: ${[...contexts].join(' | ')}`);
    }
  }

  const lastOccurrence = new Map();
  occurrences.forEach((item, index) => lastOccurrence.set(`${item.file}\u0000${item.media.join('\u0000')}`, index));
  const unique = occurrences.filter((item, index) => (
    lastOccurrence.get(`${item.file}\u0000${item.media.join('\u0000')}`) === index
  ));

  const content = `${[
    '/* FS Fit — bundle gerado automaticamente. Não editar diretamente. */',
    ...unique.map(renderInstance)
  ].join('\n\n')}\n`;

  if (/^\s*@import\b/m.test(content)) throw new Error('O bundle compilado ainda contém @import.');
  return {
    content,
    sources: unique.map(item => item.file),
    duplicatesRemoved: occurrences.length - unique.length
  };
}

function bundleLink(url, sources) {
  const attributes = ['data-fsfit-bundle'];
  if (sources.includes('css/header-menu.css')) attributes.push('data-fsfit-header-styles');
  if (sources.includes('css/mobile-navigation.css')) attributes.push('data-fsfit-mobile-navigation');
  return `<link rel="stylesheet" href="${url}" ${attributes.join(' ')}>`;
}

function expectedHtml(pageFile, html, url, sources) {
  let inserted = false;
  const link = bundleLink(url, sources);
  const updated = html.replace(/<link\b[^>]*>/gi, tag => {
    const rel = readAttribute(tag, 'rel').toLowerCase().split(/\s+/);
    if (!rel.includes('stylesheet')) return tag;
    const href = readAttribute(tag, 'href');
    if (!resolveDocumentAsset(pageFile, href)) return tag;
    if (inserted) return '';
    inserted = true;
    return link;
  });
  if (!inserted) throw new Error(`${relative(pageFile)} não possui ponto de inserção para o bundle.`);
  return updated
    .replace(/^[\t ]+$/gm, '')
    .replace(/(<link\b[^>]*data-fsfit-bundle[^>]*>\r?\n)(?:\r?\n)+/i, '$1')
    .replace(/\r?\n(?:\r?\n)+([\t ]*<\/head>)/i, '\n$1');
}

function pageRoute(page) {
  return page === 'index.html' ? '/' : `/${page}`;
}

function queueExpected(file, expected) {
  expectedWrites.set(file, expected);
}

function applyExpectedWrites() {
  for (const [file, expected] of expectedWrites) {
    const exists = fs.existsSync(file);
    const current = exists ? fs.readFileSync(file, 'utf8') : null;
    if (current === expected) continue;
    if (!writeMode) {
      failures.push(`${relative(file)} está ausente ou desatualizado; execute node scripts/build-css-bundles.mjs --write`);
      continue;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, expected);
    changed.push(relative(file));
  }
}

if (initMode) initializeConfig();
if (!fs.existsSync(configPath)) throw new Error(`Configuração ausente: ${relative(configPath)}. Execute com --init.`);

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
if (config.version !== 1 || !config.pages || typeof config.pages !== 'object') {
  throw new Error(`${relative(configPath)} possui formato inválido.`);
}

const expectedBundles = new Map();
const manifest = { version: 1, pages: {}, criticalPages: [], criticalBundles: [], bundles: {} };
const configuredPages = new Set(Object.keys(config.pages));

for (const page of [...configuredPages].sort()) {
  const pageFile = path.join(root, page);
  if (!fs.existsSync(pageFile)) {
    failures.push(`${page}: página configurada não existe.`);
    continue;
  }

  const html = fs.readFileSync(pageFile, 'utf8');
  const configuredStyles = config.pages[page]?.styles;
  if (!Array.isArray(configuredStyles) || configuredStyles.length === 0) {
    failures.push(`${page}: lista de estilos vazia ou inválida.`);
    continue;
  }

  const { css: scriptCss, modules } = discoverScriptCss(pageFile, html);
  const configuredCompilation = compileBundle(configuredStyles);
  const configuredSources = new Set(configuredCompilation.sources);
  const entries = [
    ...configuredStyles,
    ...scriptCss.filter(source => !configuredSources.has(source))
  ];
  const compiled = compileBundle(entries);
  const digest = crypto.createHash('sha256').update(compiled.content).digest('hex');
  const bundleName = `fsfit.${digest.slice(0, 16)}.css`;
  const bundleFile = path.join(bundlesDir, bundleName);
  const bundleUrl = `/css/bundles/${bundleName}`;

  const previous = expectedBundles.get(bundleFile);
  if (previous && previous !== compiled.content) throw new Error(`Colisão de conteúdo em ${relative(bundleFile)}.`);
  expectedBundles.set(bundleFile, compiled.content);

  const route = pageRoute(page);
  manifest.pages[route] = bundleUrl;
  manifest.bundles[page] = {
    url: bundleUrl,
    sha256: digest,
    bytes: Buffer.byteLength(compiled.content),
    sourceCount: compiled.sources.length,
    duplicatesRemoved: compiled.duplicatesRemoved,
    sources: compiled.sources,
    modules
  };
  if ((config.criticalPages || []).includes(page)) {
    manifest.criticalPages.push(route);
    manifest.criticalBundles.push(bundleUrl);
  }

  queueExpected(pageFile, expectedHtml(pageFile, html, bundleUrl, compiled.sources));
}

manifest.criticalPages = [...new Set(manifest.criticalPages)].sort();
manifest.criticalBundles = [...new Set(manifest.criticalBundles)].sort();
manifest.pages = Object.fromEntries(Object.entries(manifest.pages).sort(([a], [b]) => a.localeCompare(b)));
manifest.bundles = Object.fromEntries(Object.entries(manifest.bundles).sort(([a], [b]) => a.localeCompare(b)));

for (const [file, content] of expectedBundles) queueExpected(file, content);
queueExpected(bundleManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

for (const page of fs.readdirSync(root).filter(file => file.endsWith('.html')).sort()) {
  const pageFile = path.join(root, page);
  const localStyles = localStylesForPage(pageFile, fs.readFileSync(pageFile, 'utf8'));
  if (localStyles.length && !configuredPages.has(page)) failures.push(`${page}: possui CSS local, mas não está em ${relative(configPath)}.`);
}

if (!failures.length) applyExpectedWrites();

if (failures.length) {
  console.error('Falhas na arquitetura de bundles CSS:');
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exit(1);
}

const totalBytes = Object.values(manifest.bundles).reduce((total, bundle) => total + bundle.bytes, 0);
const duplicateCount = Object.values(manifest.bundles).reduce((total, bundle) => total + bundle.duplicatesRemoved, 0);
console.log(`Páginas com bundle: ${Object.keys(manifest.bundles).length}`);
console.log(`Bundles de conteúdo únicos: ${expectedBundles.size}`);
console.log(`Inclusões CSS duplicadas removidas: ${duplicateCount}`);
console.log(`Bytes compilados por página: ${totalBytes}`);
console.log(`Arquivos alterados: ${changed.length}`);
if (changed.length) changed.forEach(file => console.log(`- ${file}`));
console.log(writeMode ? 'Bundles CSS atualizados.' : 'Bundles CSS íntegros e determinísticos.');
