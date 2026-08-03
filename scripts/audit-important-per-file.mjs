import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const cssDir = path.join(root, 'css');
const reportPath = path.join(root, 'reports', 'important-per-file.json');

const files = fs.readdirSync(cssDir)
  .filter(file => file.endsWith('.css'))
  .sort();

const rows = files.map(file => {
  const content = fs.readFileSync(path.join(cssDir, file), 'utf8');
  const count = (content.match(/!important\b/g) || []).length;
  return { file: `css/${file}`, count };
}).filter(item => item.count > 0)
  .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));

const total = rows.reduce((sum, item) => sum + item.count, 0);
const report = {
  generatedAt: new Date().toISOString(),
  totalImportantDeclarations: total,
  filesWithImportant: rows.length,
  topFiles: rows.slice(0, 25),
  allFiles: rows
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const summary = [
  '## Auditoria de `!important`',
  '',
  `- Total: **${total}**`,
  `- Arquivos afetados: **${rows.length}**`,
  '',
  '| Arquivo | Quantidade |',
  '|---|---:|',
  ...rows.slice(0, 15).map(item => `| \`${item.file}\` | ${item.count} |`)
].join('\n');

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

console.log(summary);
