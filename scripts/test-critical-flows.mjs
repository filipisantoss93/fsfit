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

function requireOneToken(path, tokens, label = path) {
  if (!exists(path)) return;
  const content = read(path);
  if (!tokens.some(token => content.includes(token))) fail(`${label}: nenhuma operação esperada encontrada (${tokens.join(' | ')})`);
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
    const local = refs.filter(ref => !/^(?:https?:|data:|mailto:|tel:|\/\/)/i.test(ref));
    for (const ref of local) {
      const normalized = ref.replace(/^\.\//, '').replace(/^\//, '');
      if (!exists(normalized)) fail(`${rel}: referência local inexistente ${ref}`);
    }
  }
  pass('HTML: referências locais verificadas');
}

function testEventContracts() {
  const contracts = new Map([
    ['fsfit:workout-updated', ['js/treino-modelo-livre.js', 'js/treino-dia-personalizacao.js', 'js/treino-aluno-exercicios-avulsos.js']],
    ['fsfit:subscription-updated', ['js/assinatura-gerenciamento.js', 'js/renovacao-plano.js']],
    ['fsfit:diet-updated', ['js/dieta.js', 'js/dieta-aluno.js', 'js/plano-alimentar.js']],
    ['fsfit:financial-updated', ['js/financeiro-transicoes-seguras.js', 'js/financeiro.js', 'js/mensalidades.js']]
  ]);

  for (const [eventName, candidates] of contracts) {
    const files = candidates.filter(exists);
    if (!files.length) {
      warnings.push(`${eventName}: módulos candidatos não encontrados; contrato não aplicável nesta árvore`);
      continue;
    }
    const producers = files.filter(file => read(file).includes(eventName));
    if (!producers.length) fail(`${eventName}: nenhum produtor encontrado em ${files.join(', ')}`);
    else pass(`${eventName}: produzido por ${producers.join(', ')}`);
  }
}

function testInitializationGuards() {
  const jsFiles = walk(join(root, 'js')).filter(file => extname(file) === '.js');
  const globalListeners = [];
  for (const file of jsFiles) {
    const content = readFileSync(file, 'utf8');
    if (/addEventListener\(\s*['"](?:DOMContentLoaded|load)['"]/.test(content)) {
      const rel = relative(root, file).replaceAll('\\', '/');
      globalListeners.push(rel);
      if (!/__FSFIT_|dataset\.|once\s*:\s*true|globalThis\./.test(content)) {
        warnings.push(`${rel}: inicialização global sem guarda explícita detectável`);
      }
    }
  }
  pass(`Inicialização: ${globalListeners.length} módulo(s) com listeners globais inspecionados`);
}

// Estrutura mínima do produto.
requireFile('index.html', 'Entrada pública');
requireFile('painel.html', 'Painel do personal');
requireFile('treino-aluno.html', 'Editor de treino do aluno');
requireFile('manifest.json', 'Manifesto PWA');
requireAny(['sw.js', 'service-worker.js'], 'Service Worker');
requireFile('js/supabase.js', 'Cliente Supabase');

// Autenticação e proteção de sessão.
const authFiles = requireAny(['js/auth.js', 'js/layout.js', 'js/supabase.js'], 'Autenticação e sessão');
for (const file of authFiles) requireOneToken(file, ['getSession(', 'onAuthStateChange(', 'requireSession'], file);

// Cadastro e edição de alunos.
const studentFiles = requireAny(['js/alunos.js', 'js/aluno.js', 'js/ficha-aluno.js', 'js/painel.js'], 'Fluxo de alunos');
for (const file of studentFiles) requireOneToken(file, ["from('alunos')", 'from("alunos")', '.from(`alunos`)'], file);

// Treinos: salvar, aplicar e personalizar sem reload.
for (const file of ['js/treino-modelo-livre.js', 'js/treino-dia-personalizacao.js', 'js/treino-aluno-exercicios-avulsos.js']) {
  if (requireFile(file)) {
    requireOneToken(file, ["from('treinos')", "from('treino_exercicios')", 'fsfit_ativar_treino_aluno'], file);
    if (/location\s*\.\s*reload\s*\(/.test(read(file))) fail(`${file}: recarga forçada reintroduzida`);
  }
}

// Agenda e sessão de aula.
const scheduleFiles = requireAny(['js/agenda.js', 'js/aula.js', 'js/sessao-treino.js', 'js/aluno-sessao-controles.js'], 'Agenda e aula');
for (const file of scheduleFiles) requireOneToken(file, ["from('agenda')", "from('sessoes_treino')", 'sincronizar_exercicios_sessao'], file);

// Financeiro e mensalidades.
const financeFiles = requireAny(['js/financeiro-transicoes-seguras.js', 'js/financeiro.js', 'js/mensalidades.js'], 'Financeiro');
for (const file of financeFiles) requireOneToken(file, ["from('mensalidades')", "from('pagamentos')", '.rpc(', '.functions.invoke('], file);

// Assinatura PIX/cartão e renovação.
for (const file of ['js/assinatura-gerenciamento.js', 'js/renovacao-plano.js']) {
  if (requireFile(file)) {
    requireTokens(file, ['supabase', 'fsfit:subscription-updated'], file);
    requireOneToken(file, ['functions.invoke(', '.rpc('], file);
    if (/location\s*\.\s*reload\s*\(/.test(read(file))) fail(`${file}: recarga forçada reintroduzida`);
  }
}

// Portal do aluno e PWA.
const portalFiles = requireAny(['js/aluno-sessao-controles.js', 'js/portal-aluno.js', 'js/aluno.js'], 'Portal do aluno');
for (const file of portalFiles) requireOneToken(file, ['getSession(', 'requireSession', "from('sessoes_treino')"], file);
requireTokens('manifest.json', ['name', 'start_url', 'display'], 'Manifesto PWA');

// Contratos transversais.
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
