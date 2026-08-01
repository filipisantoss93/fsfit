import fs from 'node:fs';

const reportPath = 'artifacts/css-audit-report.json';
const budgetPath = 'config/css-audit-budget.json';

if (!fs.existsSync(reportPath)) {
  console.error(`Relatório ausente: ${reportPath}`);
  process.exit(1);
}

if (!fs.existsSync(budgetPath)) {
  console.error(`Orçamento ausente: ${budgetPath}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
const inlineStyles = report.metrics.inlineStyleBlocks + report.metrics.inlineStyleAttributes;

const checks = [
  ['Arquivos CSS', report.metrics.cssFiles, budget.maxCssFiles],
  ['CSS órfãos', report.orphanCss.length, budget.maxOrphanCss],
  ['Estilos inline', inlineStyles, budget.maxInlineStyles],
  ['Declarações !important', report.metrics.importantDeclarations, budget.maxImportantDeclarations],
  ['Regras vazias', report.metrics.emptyRules, budget.maxEmptyRules]
];

let failed = false;
console.log('Orçamento estrutural do CSS');
for (const [label, current, maximum] of checks) {
  const valid = current <= maximum;
  console.log(`- ${label}: ${current}/${maximum} ${valid ? 'OK' : 'EXCEDEU'}`);
  if (!valid) failed = true;
}

if (report.failures.length) {
  console.error(`- Falhas estruturais: ${report.failures.length}`);
  failed = true;
}

if (failed) {
  console.error('\nO orçamento do CSS regrediu. Reduza os indicadores ou atualize o baseline somente com justificativa explícita.');
  process.exit(1);
}

console.log('\nOrçamento do CSS preservado.');
