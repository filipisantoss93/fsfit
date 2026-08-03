import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const cssPath = path.join(root, 'css', 'inline-cleanup.css');
const budgetPath = path.join(root, 'config', 'css-audit-budget.json');
const markerStart = '/* AUTO-GENERATED INLINE MIGRATION:START */';
const markerEnd = '/* AUTO-GENERATED INLINE MIGRATION:END */';

function hash(value) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function normalize(style) {
  return style
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => item.endsWith(';') ? item : `${item};`)
    .join('');
}

const htmlFiles = fs.readdirSync(root)
  .filter(file => file.endsWith('.html'))
  .sort();
const rules = new Map();
let migrated = 0;
let changedFiles = 0;

for (const file of htmlFiles) {
  const fullPath = path.join(root, file);
  const original = fs.readFileSync(fullPath, 'utf8');
  let changed = false;
  let html = original.replace(/<([a-z][^<>]*?)\sstyle=(['"])(.*?)\2([^<>]*?)>/gis, (tag, before, quote, rawStyle, after) => {
    const declarations = normalize(rawStyle);
    if (!declarations) return tag;
    const className = `u-inline-${hash(declarations)}`;
    rules.set(className, declarations);
    migrated += 1;
    changed = true;

    const attributes = `${before}${after}`;
    if (/\sclass=(['"])/i.test(attributes)) {
      return `<${attributes.replace(/\sclass=(['"])(.*?)\1/i, (_match, classQuote, classes) => ` class=${classQuote}${classes} ${className}${classQuote}`)}>`;
    }
    return `<${before} class="${className}"${after}>`;
  });

  if (changed && !/css\/inline-cleanup\.css/i.test(html)) {
    html = html.replace(/<\/head>/i, '  <link rel="stylesheet" href="/css/inline-cleanup.css?v=20260803-inline-final1">\n</head>');
  }

  if (html !== original) {
    fs.writeFileSync(fullPath, html);
    changedFiles += 1;
  }
}

let css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8').trimEnd() : '';
const markerPattern = new RegExp(`${markerStart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${markerEnd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
css = css.replace(markerPattern, '').trimEnd();
const generated = [...rules.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([className, declarations]) => `.${className}{${declarations}}`)
  .join('\n');
fs.writeFileSync(cssPath, `${css}\n\n${markerStart}\n${generated}\n${markerEnd}\n`);

const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
budget.maxInlineStyles = 0;
fs.writeFileSync(budgetPath, `${JSON.stringify(budget, null, 2)}\n`);

console.log(`Arquivos HTML alterados: ${changedFiles}`);
console.log(`Estilos inline migrados: ${migrated}`);
console.log(`Classes utilitárias geradas: ${rules.size}`);
