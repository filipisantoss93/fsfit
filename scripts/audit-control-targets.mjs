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

function interactiveTarget(selector) {
  return selector.split(',').some(part => {
    const normalized = part
      .replace(/::?[a-z-]+(?:\([^)]*\))?/gi, '')
      .trim();
    const last = normalized.split(/\s+|>|\+|~/).filter(Boolean).at(-1) || '';
    return /^(?:button|input|select)(?:\b|[.#[:])|\.btn(?:\b|-)|\.[a-z0-9_-]*(?:button|btn|tab|pill|close)(?:\b|[-_:])/i.test(last);
  });
}

function isCompactNativeInput(selector) {
  return /input\s*\[\s*type\s*=\s*["']?(?:checkbox|radio|hidden|file)["']?\s*\]/i.test(selector);
}

for (const path of sources) {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) continue;
  const css = readFileSync(fullPath, 'utf8');
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  for (const match of css.matchAll(blockPattern)) {
    const selector = match[1].trim();
    const body = match[2];
    if (!interactiveTarget(selector) || isCompactNativeInput(selector)) continue;

    const minHeight = body.match(/min-height\s*:\s*(\d+(?:\.\d+)?)px/i);
    const fixedHeight = body.match(/(?:^|;)\s*height\s*:\s*(\d+(?:\.\d+)?)px/i);
    const fixedWidth = body.match(/(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)px/i);

    if (minHeight && Number(minHeight[1]) > 0 && Number(minHeight[1]) < 44) {
      failures.push(`${path}: ${selector.slice(0, 120)} tem min-height ${minHeight[1]}px`);
    }
    if (/close|icon-button|menu-mobile-btn|notification-button|gallery-action/i.test(selector)) {
      if (fixedHeight && Number(fixedHeight[1]) > 0 && Number(fixedHeight[1]) < 44) failures.push(`${path}: ${selector.slice(0, 120)} tem height ${fixedHeight[1]}px`);
      if (fixedWidth && Number(fixedWidth[1]) > 0 && Number(fixedWidth[1]) < 44) failures.push(`${path}: ${selector.slice(0, 120)} tem width ${fixedWidth[1]}px`);
    }
  }
}

if (failures.length) {
  console.error(`Controles abaixo de 44px: ${failures.length} ocorrência(s).`);
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`Alvos interativos validados em ${sources.length} arquivos CSS ativos.`);
