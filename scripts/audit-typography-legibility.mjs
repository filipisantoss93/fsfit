import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'css/bundles/manifest.json'), 'utf8'));
const excluded = new Set(['css/landing-ads.css', 'css/landing-home.css']);
const sources = [...new Set(Object.values(manifest.bundles).flatMap(bundle => bundle.sources || []))]
  .filter(path => path.endsWith('.css') && !excluded.has(path))
  .sort();
const failures = [];

for (const path of sources) {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) continue;
  const lines = readFileSync(fullPath, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/font-size\s*:\s*(0?\.\d+)rem/gi)) {
      const size = Number(match[1]);
      if (size > 0 && size < 0.75) failures.push(`${path}:${index + 1} usa ${match[1]}rem`);
    }
    for (const match of line.matchAll(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi)) {
      const size = Number(match[1]);
      if (size > 0 && size < 12) failures.push(`${path}:${index + 1} usa ${match[1]}px`);
    }
  });
}

if (failures.length) {
  console.error(`Tipografia funcional abaixo do piso de leitura (12px / .75rem): ${failures.length} ocorrência(s).`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`Tipografia funcional validada em ${sources.length} arquivos CSS ativos.`);
