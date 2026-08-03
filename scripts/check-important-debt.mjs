import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const cssDir = path.join(root, 'css');
const budgetPath = path.join(root, 'config', 'important-debt-budget.json');
const reportDir = path.join(root, 'reports');
const reportPath = path.join(reportDir, 'important-debt-report.json');

const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
const files = fs.readdirSync(cssDir).filter(file => file.endsWith('.css')).sort();
const counts = {};
let total = 0;

for (const file of files) {
  const relative = `css/${file}`;
  const content = fs.readFileSync(path.join(cssDir, file), 'utf8');
  const count = (content.match(/!important\b/g) || []).length;
  counts[relative] = count;
  total += count;
}

const regressions = [];
for (const [file, max] of Object.entries(budget.files || {})) {
  const current = counts[file] ?? 0;
  if (current > max) regressions.push(`${file}: ${current}/${max}`);
}
if (total > budget.maxTotal) regressions.push(`Total: ${total}/${budget.maxTotal}`);

const monitored = Object.entries(budget.files || {})
  .map(([file, max]) => ({ file, current: counts[file] ?? 0, max, delta: (counts[file] ?? 0) - max }))
  .sort((a, b) => b.current - a.current || a.file.localeCompare(b.file));

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), total, maxTotal: budget.maxTotal, monitored, regressions }, null, 2)}\n`);

console.log('Controle de dívida de !important');
console.log(`- Total: ${total}/${budget.maxTotal}`);
for (const item of monitored) console.log(`- ${item.file}: ${item.current}/${item.max}`);

if (regressions.length) {
  console.error('\nA dívida de !important aumentou:');
  for (const regression of regressions) console.error(`- ${regression}`);
  process.exit(1);
}

console.log('\nNenhuma regressão de !important detectada.');
