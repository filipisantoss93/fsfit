import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const htmlFiles = fs.readdirSync(root).filter(file => file.endsWith('.html')).sort();
const cssDir = path.join(root, 'css');
const cssFiles = fs.readdirSync(cssDir).filter(file => file.endsWith('.css')).sort();
const failures = [];
const warnings = [];

const inlineAttributePattern = /\sstyle=(['"])[\s\S]*?\1/gi;
const inlineBlockPattern = /<style(?:\s[^>]*)?>[\s\S]*?<\/style>/gi;
const stylesheetPattern = /<link\b[^>]*rel=(['"])stylesheet\1[^>]*href=(['"])(.*?)\2[^>]*>/gi;

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const inlineAttributes = html.match(inlineAttributePattern) ?? [];
  const inlineBlocks = html.match(inlineBlockPattern) ?? [];
  if (inlineAttributes.length) failures.push(`${file}: ${inlineAttributes.length} atributo(s) style inline`);
  if (inlineBlocks.length) failures.push(`${file}: ${inlineBlocks.length} bloco(s) <style>`);

  let match;
  while ((match = stylesheetPattern.exec(html))) {
    const href = match[3].split('?')[0].split('#')[0];
    if (/^(https?:)?\/\//i.test(href)) continue;
    const normalized = href.replace(/^\//, '');
    if (!fs.existsSync(path.join(root, normalized))) failures.push(`${file}: folha ausente ${href}`);
  }
}

for (const file of cssFiles) {
  const css = fs.readFileSync(path.join(cssDir, file), 'utf8');
  const emptyRules = css.match(/[^@{}][^{}]*\{\s*\}/g) ?? [];
  if (emptyRules.length) failures.push(`css/${file}: ${emptyRules.length} regra(s) vazia(s)`);

  const importantCount = (css.match(/!important\b/g) ?? []).length;
  if (importantCount >= 30) warnings.push(`css/${file}: ${importantCount} declarações !important`);
}

const budget = JSON.parse(fs.readFileSync(path.join(root, 'config', 'css-audit-budget.json'), 'utf8'));
if (budget.maxInlineStyles !== 0) failures.push(`baseline inline deve ser zero, encontrado ${budget.maxInlineStyles}`);
if (budget.maxOrphanCss !== 0) failures.push(`baseline de CSS órfão deve ser zero, encontrado ${budget.maxOrphanCss}`);
if (budget.maxEmptyRules !== 0) failures.push(`baseline de regras vazias deve ser zero, encontrado ${budget.maxEmptyRules}`);

console.log(`HTML analisados: ${htmlFiles.length}`);
console.log(`CSS analisados: ${cssFiles.length}`);
console.log(`Falhas: ${failures.length}`);
console.log(`Avisos: ${warnings.length}`);

if (warnings.length) {
  console.log('\nAVISOS');
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (failures.length) {
  console.error('\nFALHAS');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('\nConsolidação CSS validada com sucesso.');
