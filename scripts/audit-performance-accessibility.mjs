import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const failures = [];
const warnings = [];
const passed = [];

const walk = (dir, files = []) => {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    if (['.git', 'node_modules', '.vercel', 'dist', 'build', 'coverage'].includes(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
};

const rel = file => relative(root, file).replaceAll('\\', '/');
const text = file => readFileSync(file, 'utf8');
const pass = message => passed.push(message);
const fail = message => failures.push(message);
const warn = message => warnings.push(message);

function auditHtml() {
  const htmlFiles = walk(root).filter(file => extname(file).toLowerCase() === '.html');
  for (const file of htmlFiles) {
    const source = text(file);
    const name = rel(file);

    for (const match of source.matchAll(/<script\b([^>]*)src=["']([^"']+)["']([^>]*)>/gi)) {
      const attrs = `${match[1]} ${match[3]}`;
      const src = match[2];
      if (/^(?:https?:)?\/\//i.test(src)) continue;
      if (!/\b(?:defer|async|type\s*=\s*["']module["'])\b/i.test(attrs)) warn(`${name}: script local potencialmente bloqueante (${src})`);
    }

    for (const match of source.matchAll(/<img\b([^>]*)>/gi)) {
      const attrs = match[1];
      if (!/\balt\s*=\s*["'][^"']*["']/i.test(attrs)) fail(`${name}: imagem sem atributo alt`);
      if (!/\bloading\s*=\s*["']lazy["']/i.test(attrs) && !/\b(?:logo|hero|avatar|above-fold)\b/i.test(attrs)) warn(`${name}: imagem sem loading="lazy"`);
    }

    for (const match of source.matchAll(/<iframe\b([^>]*)>/gi)) {
      const attrs = match[1];
      if (!/\btitle\s*=\s*["'][^"']+["']/i.test(attrs)) fail(`${name}: iframe sem title`);
      if (!/\bloading\s*=\s*["']lazy["']/i.test(attrs)) warn(`${name}: iframe sem loading="lazy"`);
    }

    for (const match of source.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)) {
      const attrs = match[1];
      const body = match[2].replace(/<[^>]+>/g, '').trim();
      if (!body && !/\baria-label\s*=\s*["'][^"']+["']/i.test(attrs) && !/\btitle\s*=\s*["'][^"']+["']/i.test(attrs)) fail(`${name}: botão sem nome acessível`);
    }

    for (const match of source.matchAll(/<input\b([^>]*)>/gi)) {
      const attrs = match[1];
      if (/\btype\s*=\s*["']hidden["']/i.test(attrs)) continue;
      const id = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
      const labelled = /\baria-label(?:ledby)?\s*=\s*["'][^"']+["']/i.test(attrs);
      if (id && new RegExp(`<label\\b[^>]*for=["']${id}["']`, 'i').test(source)) continue;
      if (!labelled) warn(`${name}: input sem label associado detectável${id ? ` (#${id})` : ''}`);
    }

    for (const match of source.matchAll(/<(?:div|section|article)\b([^>]*)role=["']dialog["']([^>]*)>/gi)) {
      const attrs = `${match[1]} ${match[2]}`;
      if (!/\baria-modal\s*=\s*["']true["']/i.test(attrs)) fail(`${name}: dialog sem aria-modal="true"`);
      if (!/\baria-label(?:ledby)?\s*=\s*["'][^"']+["']/i.test(attrs)) fail(`${name}: dialog sem nome acessível`);
    }
  }
  pass(`${htmlFiles.length} página(s) HTML inspecionadas`);
}

function auditJavaScript() {
  const jsFiles = walk(join(root, 'js')).filter(file => ['.js', '.mjs'].includes(extname(file).toLowerCase()));
  for (const file of jsFiles) {
    const source = text(file);
    const name = rel(file);

    const intervals = (source.match(/\bsetInterval\s*\(/g) || []).length;
    const clearIntervals = (source.match(/\bclearInterval\s*\(/g) || []).length;
    if (intervals > clearIntervals && !/fsfit-allow-persistent-interval:/i.test(source)) warn(`${name}: ${intervals} setInterval e ${clearIntervals} clearInterval`);

    const observers = (source.match(/new\s+(?:MutationObserver|IntersectionObserver|ResizeObserver)\s*\(/g) || []).length;
    const disconnects = (source.match(/\.disconnect\s*\(/g) || []).length;
    if (observers > disconnects && !/fsfit-allow-persistent-observer:/i.test(source)) warn(`${name}: observer sem cleanup detectável`);

    if (/addEventListener\(\s*["']submit["']/.test(source) && !/(?:disabled\s*=\s*true|setBusy\s*\(|aria-busy)/.test(source)) warn(`${name}: submit assíncrono sem bloqueio de ação duplicada detectável`);

    if (/innerHTML\s*=\s*[`"'][\s\S]*(?:Carregando|Aguarde|Processando)/i.test(source) && !/(?:erro|error|vazio|empty|sucesso|success)/i.test(source)) warn(`${name}: estado de loading sem estados complementares detectáveis`);

    const dynamicDialogMarkup = source.match(/<[^>]+role=["']dialog["'][^>]*>/gi) || [];
    for (const markup of dynamicDialogMarkup) {
      if (!/aria-modal=["']true["']/.test(markup)) fail(`${name}: modal dinâmico sem aria-modal`);
      if (!/aria-label(?:ledby)?=["'][^"']+["']/.test(markup)) fail(`${name}: modal dinâmico sem nome acessível`);
    }
    if (dynamicDialogMarkup.length && !/(?:Escape|keydown|focus\s*\(|tabindex)/.test(source)) warn(`${name}: modal dinâmico sem gestão de teclado/foco detectável`);
  }
  pass(`${jsFiles.length} módulo(s) JavaScript inspecionados`);
}

auditHtml();
auditJavaScript();

console.log('\nAuditoria de performance e acessibilidade\n');
passed.forEach(item => console.log(`✓ ${item}`));
warnings.forEach(item => console.warn(`⚠ ${item}`));

if (failures.length) {
  console.error('\nFalhas bloqueantes:\n');
  failures.forEach(item => console.error(`✗ ${item}`));
  process.exit(1);
}

console.log(`\nResultado: ${passed.length} grupos aprovados; ${warnings.length} aviso(s); nenhuma falha bloqueante.`);
