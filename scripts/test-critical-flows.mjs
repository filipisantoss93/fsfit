import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const failures = [];
const warnings = [];
const passed = [];

const read = path => readFileSync(join(root, path), 'utf8');
const exists = path => existsSync(join(root, path));
const pass = message => passed.push(message);
const fail = message => failures.push(message);

function requireFile(path, label = path) {
  if (!exists(path)) {
    fail(`${label}: arquivo obrigatório ausente (${path})`);
    return false;
  }
  pass(`${label}: arquivo presente`);
  return true;
}

function requireAny(paths, label) {
  const found = paths.filter(exists);
  if (!found.length) {
    fail(`${label}: nenhum arquivo candidato encontrado (${paths.join(', ')})`);
    return [];
  }
  pass(`${label}: ${found.join(', ')}`);
  return found;
}

function requireTokens(path, tokens, label = path) {
  if (!exists(path)) return;
  const content = read(path);
  const missing = tokens.filter(token => !content.includes(token));
  if (missing.length) fail(`${label}: contrato incompleto; ausente ${missing.join(', ')}`);
  else pass(`${label}: contrato validado`);
}

function requireFlowToken(files, tokens, label) {
  const sources = files.filter(exists);
  if (!sources.length) return;
  const found = sources.filter(file => tokens.some(token => read(file).includes(token)));
  if (!found.length) fail(`${label}: operação esperada ausente no conjunto (${tokens.join(' | ')})`);
  else pass(`${label}: contrato localizado em ${found.join(', ')}`);
}

function requireOneToken(path, tokens, label = path) {
  if (!exists(path)) return;
  if (!tokens.some(token => read(path).includes(token))) fail(`${label}: nenhuma operação esperada encontrada (${tokens.join(' | ')})`);
  else pass(`${label}: operação principal detectada`);
}

function walk(directory, files = []) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory)) {
    if (['.git', 'node_modules', '.vercel', 'dist', 'build', 'coverage'].includes(entry)) continue;
    const full = join(directory, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

function testHtmlReferences() {
  for (const file of walk(root).filter(file => extname(file).toLowerCase() === '.html')) {
    const html = readFileSync(file, 'utf8');
    const rel = relative(root, file).replaceAll('\\', '/');
    const refs = [...html.matchAll(/<(?:script|link)\b[^>]+(?:src|href)=["']([^"'#?]+)["']/gi)].map(match => match[1]);
    for (const ref of refs.filter(ref => !/^(?:https?:|data:|mailto:|tel:|\/\/)/i.test(ref))) {
      const normalized = ref.replace(/^\.\//, '').replace(/^\//, '');
      if (!exists(normalized)) fail(`${rel}: referência local inexistente ${ref}`);
    }
  }
  pass('HTML: referências locais verificadas');
}

function testEventContracts() {
  const required = new Map([
    ['fsfit:workout-updated', ['js/treino-modelo-livre.js', 'js/treino-dia-personalizacao.js', 'js/treino-aluno-exercicios-avulsos.js']],
    ['fsfit:subscription-updated', ['js/assinatura-gerenciamento.js', 'js/renovacao-plano.js']]
  ]);
  const optional = new Map([
    ['fsfit:diet-updated', ['js/dieta.js', 'js/dieta-aluno.js', 'js/plano-alimentar.js']],
    ['fsfit:financial-updated', ['js/financeiro-transicoes-seguras.js', 'js/financeiro.js', 'js/mensalidades.js']]
  ]);

  for (const [eventName, candidates] of required) {
    const files = candidates.filter(exists);
    const producers = files.filter(file => read(file).includes(eventName));
    if (!producers.length) fail(`${eventName}: nenhum produtor encontrado em ${files.join(', ') || 'módulos ausentes'}`);
    else pass(`${eventName}: produzido por ${producers.join(', ')}`);
  }

  for (const [eventName, candidates] of optional) {
    const files = candidates.filter(exists);
    if (!files.length) continue;
    const producers = files.filter(file => read(file).includes(eventName));
    if (!producers.length) warnings.push(`${eventName}: evento ainda não padronizado nos módulos atuais`);
    else pass(`${eventName}: produzido por ${producers.join(', ')}`);
  }
}

function testInitializationGuards() {
  const jsFiles = walk(join(root, 'js')).filter(file => extname(file) === '.js');
  let inspected = 0;
  for (const file of jsFiles) {
    const content = readFileSync(file, 'utf8');
    if (!/addEventListener\(\s*['"](?:DOMContentLoaded|load)['"]/.test(content)) continue;
    inspected += 1;
    const rel = relative(root, file).replaceAll('\\', '/');
    if (!/__FSFIT_|dataset\.|once\s*:\s*true|globalThis\./.test(content)) warnings.push(`${rel}: inicialização global sem guarda explícita detectável`);
  }
  pass(`Inicialização: ${inspected} módulo(s) com listeners globais inspecionados`);
}

requireFile('index.html', 'Entrada pública');
requireFile('painel.html', 'Painel do personal');
requireFile('treino-aluno.html', 'Editor de treino do aluno');
const manifests = requireAny(['manifest.json', 'manifest.webmanifest', 'site.webmanifest', 'app.webmanifest'], 'Manifesto PWA');
requireAny(['sw.js', 'service-worker.js'], 'Service Worker');
requireFile('js/supabase.js', 'Cliente Supabase');

const authFiles = requireAny(['js/auth.js', 'js/layout.js', 'js/supabase.js'], 'Autenticação e sessão');
requireFlowToken(authFiles, ['getSession(', 'onAuthStateChange(', 'requireSession'], 'Autenticação e proteção de sessão');

const studentFiles = requireAny(['js/alunos.js', 'js/aluno.js', 'js/ficha-aluno.js', 'js/painel.js'], 'Fluxo de alunos');
requireFlowToken(studentFiles, ["from('alunos')", 'from("alunos")', '.from(`alunos`)'], 'Cadastro e edição de alunos');

for (const file of ['js/treino-modelo-livre.js', 'js/treino-dia-personalizacao.js', 'js/treino-aluno-exercicios-avulsos.js']) {
  if (requireFile(file)) {
    requireOneToken(file, ["from('treinos')", "from('treino_exercicios')", 'fsfit_ativar_treino_aluno'], file);
    if (/location\s*\.\s*reload\s*\(/.test(read(file))) fail(`${file}: recarga forçada reintroduzida`);
  }
}

const scheduleFiles = requireAny(['js/agenda.js', 'js/aula.js', 'js/sessao-treino.js', 'js/aluno-sessao-controles.js'], 'Agenda e aula');
requireFlowToken(scheduleFiles, ["from('agenda')", "from('agendamentos')", "from('sessoes_treino')", 'sincronizar_exercicios_sessao', '.rpc('], 'Agenda e sessões de aula');

const financeFiles = requireAny(['js/financeiro-transicoes-seguras.js', 'js/financeiro.js', 'js/mensalidades.js'], 'Financeiro');
requireFlowToken(financeFiles, ["from('mensalidades')", "from('pagamentos')", '.rpc(', '.functions.invoke('], 'Mensalidades e transições financeiras');

for (const file of ['js/assinatura-gerenciamento.js', 'js/renovacao-plano.js']) {
  if (requireFile(file)) {
    requireTokens(file, ['supabase', 'fsfit:subscription-updated'], file);
    requireOneToken(file, ['functions.invoke(', '.rpc('], file);
    if (/location\s*\.\s*reload\s*\(/.test(read(file))) fail(`${file}: recarga forçada reintroduzida`);
  }
}

const portalFiles = requireAny(['js/aluno-sessao-controles.js', 'js/portal-aluno.js', 'js/aluno.js', 'js/auth.js', 'js/layout.js'], 'Portal do aluno');
requireFlowToken(portalFiles, ['getSession(', 'requireSession', "from('sessoes_treino')", 'onAuthStateChange('], 'Sessão protegida do portal do aluno');
for (const manifest of manifests) requireTokens(manifest, ['name', 'start_url', 'display'], manifest);

testHtmlReferences();
testEventContracts();
testInitializationGuards();

console.log('\nMatriz de testes dos fluxos críticos\n');
passed.forEach(item => console.log(`✓ ${item}`));
warnings.forEach(item => console.warn(`⚠ ${item}`));

if (failures.length) {
  console.error('\nFalhas encontradas:\n');
  failures.forEach(item => console.error(`✗ ${item}`));
  process.exit(1);
}

console.log(`\nResultado: ${passed.length} verificações aprovadas; ${warnings.length} aviso(s); nenhuma falha.`);
