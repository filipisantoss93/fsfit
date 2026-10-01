import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(`${root}/css/fsfit-design-system.css`, 'utf8');
const failures = [];

function extractBlock(selector) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Bloco CSS não encontrado: ${selector}`);
  const bodyStart = css.indexOf('{', start) + 1;
  let depth = 1;
  for (let index = bodyStart; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') depth -= 1;
    if (depth === 0) return css.slice(bodyStart, index);
  }
  throw new Error(`Bloco CSS sem fechamento: ${selector}`);
}

function tokenMap(source) {
  const map = new Map();
  for (const match of source.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gi)) {
    map.set(match[1], match[2].toLowerCase());
  }
  return map;
}

function channel(value) {
  value /= 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const value = hex.slice(1);
  const rgb = [0, 2, 4].map(index => parseInt(value.slice(index, index + 2), 16));
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

function contrast(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function resolve(map, token) {
  const value = map.get(token);
  if (!value) failures.push(`Token hexadecimal ausente: --${token}`);
  return value;
}

function check(theme, map, foreground, background, minimum = 4.5) {
  const fg = resolve(map, foreground);
  const bg = resolve(map, background);
  if (!fg || !bg) return;
  const ratio = contrast(fg, bg);
  if (ratio + 1e-9 < minimum) {
    failures.push(`${theme}: --${foreground} sobre --${background} = ${ratio.toFixed(2)}:1; mínimo ${minimum}:1`);
  } else {
    console.log(`✓ ${theme}: --${foreground} / --${background} = ${ratio.toFixed(2)}:1`);
  }
}

const dark = tokenMap(extractBlock(':root'));
const light = tokenMap(extractBlock('html[data-fsfit-theme="light"]'));

for (const [name, map] of [['dark', dark], ['light', light]]) {
  check(name, map, 'fs-text', 'fs-bg');
  check(name, map, 'fs-text-muted', 'fs-bg');
  check(name, map, 'fs-text-subtle', 'fs-bg');
  check(name, map, 'fs-text', 'fs-surface');
  check(name, map, 'fs-text-muted', 'fs-surface');
  check(name, map, 'fs-text-subtle', 'fs-surface');
  check(name, map, 'fs-text-on-primary', 'fs-primary');
  check(name, map, 'fs-info-text', 'fs-surface');
  check(name, map, 'fs-warning-text', 'fs-surface');
  check(name, map, 'fs-danger-text', 'fs-surface');
  check(name, map, 'fs-success-text', 'fs-surface');
}

if (!css.includes('html[data-fsfit-theme="dark"]')) failures.push('Seletor explícito do tema escuro ausente.');
if (!css.includes('html[data-fsfit-theme="light"]')) failures.push('Seletor explícito do tema claro ausente.');

if (failures.length) {
  console.error('\nAuditoria de contraste dos temas falhou:\n');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log('\nContraste semântico validado para temas claro e escuro.');
