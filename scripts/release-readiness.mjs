import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const reportDir = path.join(root, 'reports');
const failures = [];
const warnings = [];
const pages = fs.readdirSync(root).filter(file => file.endsWith('.html')).sort();
const localRefs = new Set();

function cleanRef(value) {
  return value.split('#')[0].split('?')[0].trim();
}

function isLocal(value) {
  return value && !/^(?:https?:|mailto:|tel:|data:|javascript:|#)/i.test(value);
}

for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const refs = [...html.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);

  if (!/<title>[^<]+<\/title>/i.test(html)) warnings.push(`${page}: título ausente ou vazio`);
  if (!/<meta\s+name=["']viewport["']/i.test(html)) warnings.push(`${page}: meta viewport ausente`);

  for (const rawRef of refs) {
    if (!isLocal(rawRef)) continue;
    const ref = cleanRef(rawRef);
    if (!ref || ref === '/') continue;
    const relative = ref.replace(/^\//, '');
    if (!relative) continue;
    localRefs.add(relative);
    if (!fs.existsSync(path.join(root, relative))) failures.push(`${page}: referência local ausente -> ${rawRef}`);
  }
}

const requiredFiles = [
  'manifest.json',
  'service-worker.js',
  'css/style.css',
  'js/config.js'
];
for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`arquivo essencial ausente: ${file}`);
}

const report = {
  generatedAt: new Date().toISOString(),
  htmlPages: pages.length,
  localReferences: localRefs.size,
  failures,
  warnings,
  status: failures.length ? 'failed' : 'ready'
};

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'release-readiness.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log(`Páginas HTML: ${pages.length}`);
console.log(`Referências locais verificadas: ${localRefs.size}`);
console.log(`Falhas: ${failures.length}`);
console.log(`Avisos: ${warnings.length}`);
for (const warning of warnings) console.log(`AVISO: ${warning}`);
for (const failure of failures) console.error(`ERRO: ${failure}`);

if (failures.length) process.exit(1);
console.log('FS Fit pronto para validação final de produção.');
