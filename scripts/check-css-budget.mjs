import fs from 'node:fs';

const reportPath = 'artifacts/css-audit-report.json';
const runtimeReportPath = 'artifacts/css-runtime-report.json';
const budgetPath = 'config/css-audit-budget.json';

if (!fs.existsSync(reportPath)) {
  console.error(`Relatório ausente: ${reportPath}`);
  process.exit(1);
}

if (!fs.existsSync(budgetPath)) {
  console.error(`Orçamento ausente: ${budgetPath}`);
  process.exit(1);
}

if (!fs.existsSync(runtimeReportPath)) {
  console.error(`Relatório ausente: ${runtimeReportPath}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const runtimeReport = JSON.parse(fs.readFileSync(runtimeReportPath, 'utf8'));
const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
const inlineStyles = report.metrics.inlineStyleBlocks + report.metrics.inlineStyleAttributes;
const runtimeStylesheetsPerPage = runtimeReport.metrics.configuredPages
  ? runtimeReport.metrics.runtimeStylesheetLinks / runtimeReport.metrics.configuredPages
  : Number.POSITIVE_INFINITY;

const checks = [
  ['Arquivos CSS', report.metrics.cssFiles, budget.maxCssFiles],
  ['CSS órfãos', report.orphanCss.length, budget.maxOrphanCss],
  ['Estilos inline', inlineStyles, budget.maxInlineStyles],
  ['Declarações !important', report.metrics.importantDeclarations, budget.maxImportantDeclarations],
  ['Regras vazias', report.metrics.emptyRules, budget.maxEmptyRules],
  ['Stylesheets por página em runtime', runtimeStylesheetsPerPage, budget.maxRuntimeStylesheetsPerPage],
  ['@import em runtime', runtimeReport.metrics.runtimeImports, budget.maxRuntimeImports],
  ['Fontes duplicadas em bundles', runtimeReport.metrics.duplicateBundleSources, budget.maxDuplicateBundleSources],
  ['CSS criado por JavaScript', runtimeReport.metrics.javascriptStyleBlocks, budget.maxJavascriptStyleBlocks]
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
if (runtimeReport.failures.length) {
  console.error(`- Falhas no contrato de runtime: ${runtimeReport.failures.length}`);
  failed = true;
}

if (failed) {
  console.error('\nO orçamento do CSS regrediu. Reduza os indicadores ou atualize o baseline somente com justificativa explícita.');
  process.exit(1);
}

console.log('\nOrçamento do CSS preservado.');
