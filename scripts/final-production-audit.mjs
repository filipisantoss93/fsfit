import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const failures = [];
const passed = [];

const exists = path => existsSync(join(root, path));
const read = path => readFileSync(join(root, path), 'utf8');
const pass = message => passed.push(message);
const fail = message => failures.push(message);

function requireFile(path, label = path) {
  if (!exists(path)) {
    fail(`${label}: arquivo ausente (${path})`);
    return false;
  }
  pass(`${label}: presente`);
  return true;
}

function runAudit(path, label) {
  if (!requireFile(path, label)) return;
  const result = spawnSync(process.execPath, [path], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe'
  });

  if (result.status !== 0) {
    fail(`${label}: falhou\n${result.stdout || ''}${result.stderr || ''}`.trim());
    return;
  }

  pass(`${label}: aprovado`);
}

// Arquivos essenciais e rotas principais.
[
  ['index.html', 'Entrada pública'],
  ['painel.html', 'Painel do personal'],
  ['alunos.html', 'Gestão de alunos'],
  ['agenda.html', 'Agenda'],
  ['financeiro.html', 'Financeiro'],
  ['assinatura.html', 'Assinatura'],
  ['aluno.html', 'Portal do aluno'],
  ['treino-aluno.html', 'Editor de treino'],
  ['sw.js', 'Service Worker'],
  ['js/supabase.js', 'Cliente Supabase'],
  ['docs/SMOKE_TEST_PRODUCAO.md', 'Checklist de smoke test'],
  ['docs/DEPLOY_ROLLBACK_PRODUCAO.md', 'Procedimento de deploy e rollback'],
  ['docs/RISCOS_RESIDUAIS_PRODUCAO.md', 'Registro de riscos residuais']
].forEach(([path, label]) => requireFile(path, label));

// PWA: aceita os nomes já usados no projeto.
const manifestPath = ['manifest.webmanifest', 'manifest.json'].find(exists);
if (!manifestPath) {
  fail('Manifesto PWA: nenhum manifesto encontrado');
} else {
  const manifest = read(manifestPath);
  for (const token of ['name', 'start_url', 'display']) {
    if (!manifest.includes(token)) fail(`Manifesto PWA: campo ${token} não detectado`);
  }
  pass(`Manifesto PWA: ${manifestPath}`);
}

// Proteções mínimas de produção.
if (exists('js/supabase.js')) {
  const source = read('js/supabase.js');
  if (/service_role|SUPABASE_SERVICE_ROLE/i.test(source)) {
    fail('Configuração: possível chave service_role exposta no cliente');
  } else {
    pass('Configuração: nenhuma referência service_role detectada no cliente Supabase');
  }
}

const sensitivePatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /sk_live_[A-Za-z0-9]+/,
  /efi_client_secret\s*[:=]\s*["'][^"']+/i
];
for (const path of ['config.js', 'js/config.js', 'js/supabase.js']) {
  if (!exists(path)) continue;
  const source = read(path);
  if (sensitivePatterns.some(pattern => pattern.test(source))) {
    fail(`Configuração: possível segredo sensível exposto em ${path}`);
  }
}
pass('Configuração: verificação estática de segredos concluída');

// Executa a matriz consolidada criada nos lotes anteriores.
runAudit('scripts/audit-page-scripts.mjs', 'Auditoria de scripts das páginas');
runAudit('scripts/audit-runtime.mjs', 'Auditoria de runtime');
runAudit('scripts/audit-reloads.mjs', 'Auditoria de recargas');
runAudit('scripts/test-critical-flows.mjs', 'Contratos dos fluxos críticos');
runAudit('scripts/audit-performance-accessibility.mjs', 'Performance e acessibilidade');

console.log('\nAuditoria final de produção do FS Fit\n');
passed.forEach(item => console.log(`✓ ${item}`));

if (failures.length) {
  console.error('\nFalhas bloqueantes:\n');
  failures.forEach(item => console.error(`✗ ${item}`));
  process.exit(1);
}

console.log(`\nResultado: ${passed.length} verificações aprovadas; nenhuma falha bloqueante.`);
