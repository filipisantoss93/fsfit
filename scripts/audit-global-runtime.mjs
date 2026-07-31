import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const requiredFiles = [
  'js/global-runtime-bootstrap.js',
  'js/app-lifecycle-runtime.js',
  'js/shared-mutation-runtime.js',
  'js/inactive-account-guard.js'
];
const forbiddenReferences = [
  'resource-lifecycle-autowire.js',
  'realtime-lifecycle-autowire.js',
  'mobile-lifecycle-runtime.js'
];
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(path) {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) {
    fail(`Arquivo obrigatório ausente: ${path}`);
    return '';
  }
  return readFileSync(fullPath, 'utf8');
}

function walk(directory, files = []) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory)) {
    if (entry === '.git' || entry === 'node_modules') continue;
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) walk(fullPath, files);
    else if (['.js', '.mjs', '.html'].includes(extname(fullPath))) files.push(fullPath);
  }
  return files;
}

requiredFiles.forEach(read);

const bootstrap = read('js/global-runtime-bootstrap.js');
const guard = read('js/inactive-account-guard.js');
const lifecycle = read('js/app-lifecycle-runtime.js');

const bootstrapRequirements = [
  '__FSFIT_GLOBAL_RUNTIME_BOOTSTRAP__',
  '__FSFIT_RESOURCE_LIFECYCLE_AUTOWIRE__',
  '__FSFIT_REALTIME_LIFECYCLE_AUTOWIRE__',
  'fsfit:global-runtime-ready',
  'fsfit:lifecycle-realtime-resumed',
  'installResourceLifecycle',
  'installRealtimeLifecycle',
  'status()'
];

for (const token of bootstrapRequirements) {
  if (!bootstrap.includes(token)) fail(`Contrato ausente no bootstrap: ${token}`);
}

if (!guard.includes("./global-runtime-bootstrap.js")) {
  fail('inactive-account-guard.js não carrega a entrada global consolidada.');
}

if (/resource-lifecycle-autowire|realtime-lifecycle-autowire|mobile-lifecycle-runtime/.test(guard)) {
  fail('inactive-account-guard.js ainda referencia runtimes obsoletos.');
}

for (const eventName of ['pagehide', 'pageshow', 'visibilitychange', 'focus']) {
  if (!lifecycle.includes(eventName)) fail(`Evento de lifecycle ausente: ${eventName}`);
}

for (const file of walk(root)) {
  const relativePath = relative(root, file);
  if (relativePath === 'scripts/audit-global-runtime.mjs') continue;
  const content = readFileSync(file, 'utf8');
  for (const forbidden of forbiddenReferences) {
    if (content.includes(forbidden)) fail(`Referência obsoleta em ${relativePath}: ${forbidden}`);
  }
}

if (failures.length) {
  console.error('\nAuditoria do runtime global falhou:\n');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Runtime global validado: entrada única, lifecycle, Realtime, timers, observers e referências obsoletas.');
