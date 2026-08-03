import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const cssDir = path.join(root, 'css');
const files = fs.readdirSync(cssDir).filter(file => file.endsWith('.css')).sort();
let changedFiles = 0;
let removedDeclarations = 0;

for (const file of files) {
  const fullPath = path.join(cssDir, file);
  const original = fs.readFileSync(fullPath, 'utf8');
  const updated = original.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, selector, body) => {
    const declarations = body.split(';').map(item => item.trim()).filter(Boolean);
    if (declarations.length < 2) return rule;

    const seen = new Set();
    const kept = [];
    for (let index = declarations.length - 1; index >= 0; index -= 1) {
      const declaration = declarations[index];
      const colon = declaration.indexOf(':');
      if (colon < 1) {
        kept.push(declaration);
        continue;
      }
      const property = declaration.slice(0, colon).trim().toLowerCase();
      if (property.startsWith('--')) {
        kept.push(declaration);
        continue;
      }
      if (seen.has(property)) {
        removedDeclarations += 1;
        continue;
      }
      seen.add(property);
      kept.push(declaration);
    }

    kept.reverse();
    if (kept.length === declarations.length) return rule;
    const compact = kept.map(item => `${item};`).join('');
    return `${selector}{${compact}}`;
  });

  if (updated !== original) {
    fs.writeFileSync(fullPath, updated);
    changedFiles += 1;
  }
}

console.log(`Arquivos CSS alterados: ${changedFiles}`);
console.log(`Declarações redundantes removidas: ${removedDeclarations}`);
