import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'css/bundles/manifest.json'), 'utf8'));
const sources = [...new Set(Object.values(manifest.bundles).flatMap(bundle => bundle.sources || []))]
  .filter(path => path.endsWith('.css'))
  .sort();

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

let filesChanged = 0;
let replacements = 0;

for (const path of sources) {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) continue;
  const original = readFileSync(fullPath, 'utf8');
  const content = original.replace(/([^{}]+)\{([^{}]*)\}/g, (whole, selector, body) => {
    if (!interactiveTarget(selector) || isCompactNativeInput(selector)) return whole;
    let next = body;
    next = next.replace(/min-height\s*:\s*(\d+(?:\.\d+)?)px/gi, (decl, raw) => {
      const size = Number(raw);
      if (!(size > 0 && size < 44)) return decl;
      replacements += 1;
      return 'min-height:44px';
    });

    if (/close|icon-button|menu-mobile-btn|notification-button|gallery-action/i.test(selector)) {
      next = next.replace(/(^|;)\s*height\s*:\s*(\d+(?:\.\d+)?)px/gi, (decl, prefix, raw) => {
        const size = Number(raw);
        if (!(size > 0 && size < 44)) return decl;
        replacements += 1;
        return `${prefix}height:44px`;
      });
      next = next.replace(/(^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)px/gi, (decl, prefix, raw) => {
        const size = Number(raw);
        if (!(size > 0 && size < 44)) return decl;
        replacements += 1;
        return `${prefix}width:44px`;
      });
    }
    return `${selector}{${next}}`;
  });

  if (content !== original) {
    writeFileSync(fullPath, content);
    filesChanged += 1;
    console.log(`Atualizado: ${path}`);
  }
}

console.log(`Controles normalizados: ${replacements} ajuste(s) em ${filesChanged} arquivo(s).`);
