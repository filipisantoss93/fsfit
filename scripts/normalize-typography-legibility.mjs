import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'css/bundles/manifest.json'), 'utf8'));
const excluded = new Set(['css/landing-ads.css', 'css/landing-home.css']);
const sources = [...new Set(Object.values(manifest.bundles).flatMap(bundle => bundle.sources || []))]
  .filter(path => path.endsWith('.css') && !excluded.has(path))
  .sort();

let changedFiles = 0;
let replacements = 0;

for (const path of sources) {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) continue;
  const original = readFileSync(fullPath, 'utf8');
  let content = original;

  content = content.replace(/font-size\s*:\s*(0?\.\d+)rem/gi, (match, raw) => {
    const size = Number(raw);
    if (!(size > 0 && size < 0.75)) return match;
    replacements += 1;
    return 'font-size:var(--fs-font-xs,.75rem)';
  });

  content = content.replace(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi, (match, raw) => {
    const size = Number(raw);
    if (!(size > 0 && size < 12)) return match;
    replacements += 1;
    return 'font-size:var(--fs-font-xs,.75rem)';
  });

  if (content !== original) {
    writeFileSync(fullPath, content);
    changedFiles += 1;
    console.log(`Atualizado: ${path}`);
  }
}

console.log(`Tipografia normalizada: ${replacements} ocorrência(s) em ${changedFiles} arquivo(s).`);
