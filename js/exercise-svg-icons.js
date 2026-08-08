/* FS Fit — biblioteca vetorial leve para exercícios
 * Gera ilustrações SVG por padrão de movimento, sem dependências externas.
 */

const NS = 'http://www.w3.org/2000/svg';

const normalize = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

function movementType(name = '') {
  const n = normalize(name);

  if (/agach|afundo|passada|bulgar|box jump|salto/.test(n)) return 'squat';
  if (/supino|flexao de bracos|peck deck|crucifixo|crossover/.test(n)) return 'press';
  if (/puxada|barra fixa|pulldown/.test(n)) return 'pulldown';
  if (/remada|remo ergometrico|remo por distancia/.test(n)) return 'row';
  if (/rosca|biceps/.test(n)) return 'curl';
  if (/triceps|mergulho|paralelas/.test(n)) return 'triceps';
  if (/desenvolvimento|elevacao lateral|elevacao frontal|face pull|encolhimento/.test(n)) return 'shoulder';
  if (/terra|stiff|romeno|good morning/.test(n)) return 'hinge';
  if (/elevacao pelvica|hip thrust|coice|gluteo/.test(n)) return 'hip';
  if (/abdominal|crunch|prancha|russian|mountain climber|bird dog|superman/.test(n)) return 'core';
  if (/panturrilha/.test(n)) return 'calf';
  if (/bicicleta|esteira|corrida|caminhada|eliptico|escada/.test(n)) return 'cardio';
  if (/cadeira extensora|cadeira flexora|mesa flexora|leg press|adutora|abdutora/.test(n)) return 'machine';
  if (/alongamento|mobilidade/.test(n)) return 'mobility';
  if (/burpee|polichinelo|battle rope|sled|farmer|kettlebell/.test(n)) return 'functional';
  return 'generic';
}

const drawings = {
  squat: `
    <circle cx="33" cy="11" r="5"/>
    <path d="M31 17l-5 14 10 7 9 14M26 31l-11 9-5 12M35 37l-12 15M20 21h25M17 18v6M48 18v6"/>`,
  press: `
    <path d="M10 45h44M16 42h30M22 42l5-13h18"/>
    <circle cx="32" cy="24" r="4"/>
    <path d="M28 28l-8 7M36 28l9 7M16 32h32M13 28v8M51 28v8M28 29l-4 11M36 29l5 11"/>`,
  pulldown: `
    <circle cx="32" cy="17" r="5"/>
    <path d="M32 22v17M32 25L18 14M32 25l14-11M15 11h34M12 8v6M52 8v6M32 39l-9 14M32 39l9 14"/>`,
  row: `
    <circle cx="24" cy="19" r="5"/>
    <path d="M28 23l9 8 13-2M36 31l-8 10M28 41H13M28 41l9 12M18 41l-5 12M49 25v9"/>`,
  curl: `
    <circle cx="31" cy="12" r="5"/>
    <path d="M31 17v20M31 23l-9 9 5 8M31 23l10 7-5 10M31 37l-8 16M31 37l8 16M21 40h8M34 40h8"/>`,
  triceps: `
    <circle cx="32" cy="12" r="5"/>
    <path d="M32 17v20M32 23l-8-5-2 17M32 23l8-5 2 17M20 35h5M39 35h5M32 37l-8 16M32 37l8 16"/>`,
  shoulder: `
    <circle cx="32" cy="12" r="5"/>
    <path d="M32 17v20M32 22L16 13M32 22l16-9M13 10l5 6M51 10l-5 6M32 37l-8 16M32 37l8 16"/>`,
  hinge: `
    <circle cx="24" cy="16" r="5"/>
    <path d="M27 20l14 13M41 33l-4 18M41 33l10 18M27 22l-9 17M15 39h12M12 36v6M30 36v6"/>`,
  hip: `
    <path d="M10 44h44M16 41h15M31 41l8-13"/>
    <circle cx="43" cy="23" r="4"/>
    <path d="M39 27l-13 7-10 7M26 34l9 8M35 42l10 10M25 34l-7 10"/>`,
  core: `
    <path d="M8 47h48"/>
    <circle cx="18" cy="39" r="4"/>
    <path d="M22 40l15-10 11 8M36 31l-7 15M48 38l7 8M29 46H14"/>`,
  calf: `
    <circle cx="31" cy="11" r="5"/>
    <path d="M31 16v22M31 23l-8 8M31 23l8 8M31 38l-6 12M31 38l9 10M23 52h8M38 50h10M43 46l3 6"/>`,
  cardio: `
    <circle cx="20" cy="43" r="10"/><circle cx="47" cy="43" r="10"/>
    <circle cx="31" cy="13" r="4"/>
    <path d="M30 17l-8 13 10 7 8-14M22 30h18M32 37l-12 6M32 37l15 6M38 23h10"/>`,
  machine: `
    <path d="M13 10v44M51 10v44M13 17h38M20 49h24M23 45V27h18v18"/>
    <circle cx="31" cy="23" r="4"/>
    <path d="M31 27v11M31 31l-7 8M31 31l8 8M24 39h15"/>`,
  mobility: `
    <circle cx="31" cy="12" r="5"/>
    <path d="M31 17v20M31 22L14 29M31 22l16-8M31 37L17 50M31 37l14 15M10 25l4 4-4 4M49 10l-2 5 5 2"/>`,
  functional: `
    <circle cx="31" cy="12" r="5"/>
    <path d="M31 17l-4 18M28 23L14 34M29 23l15 8M27 35L16 51M27 35l15 16M10 32l6 4M46 28l6 5"/>
    <circle cx="13" cy="38" r="4"/><circle cx="50" cy="36" r="4"/>`,
  generic: `
    <circle cx="32" cy="12" r="5"/>
    <path d="M32 17v21M32 23l-11 10M32 23l11 10M32 38l-9 15M32 38l9 15M17 30h8M39 30h8"/>`
};

function makeSvg(name) {
  const type = movementType(name);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Ilustração de ${name}`);
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('width', '42');
  svg.setAttribute('height', '42');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = drawings[type] || drawings.generic;
  return svg;
}

function createIcon(name) {
  const wrapper = document.createElement('span');
  wrapper.className = 'exercise-svg-icon';
  wrapper.dataset.exerciseSvg = normalize(name);
  wrapper.appendChild(makeSvg(name));
  return wrapper;
}

function enhanceWorkoutRows(root = document) {
  root.querySelectorAll('.workout-exercise-row').forEach(row => {
    if (row.querySelector('.exercise-svg-icon')) return;
    const main = row.querySelector('.workout-exercise-main');
    const title = main?.querySelector('strong')?.textContent?.trim();
    if (!main || !title) return;
    row.insertBefore(createIcon(title), main);
  });
}

function enhanceExerciseChoices(root = document) {
  root.querySelectorAll('#exercise-checkbox-list label, .exercise-checkbox-list label').forEach(label => {
    if (label.querySelector('.exercise-svg-icon')) return;
    const textNodes = [...label.childNodes].filter(node => node.nodeType === Node.TEXT_NODE);
    const fallback = label.querySelector('strong, span')?.textContent || '';
    const title = (textNodes.map(node => node.textContent).join(' ') || fallback).trim();
    if (!title) return;
    const icon = createIcon(title);
    icon.style.width = '40px';
    icon.style.height = '40px';
    icon.style.minWidth = '40px';
    icon.querySelector('svg')?.setAttribute('width', '34');
    icon.querySelector('svg')?.setAttribute('height', '34');
    label.insertBefore(icon, label.firstChild);
  });
}

function enhance(root = document) {
  enhanceWorkoutRows(root);
  enhanceExerciseChoices(root);
}

function start() {
  enhance();
  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (!(node instanceof Element)) return;
        enhance(node);
        if (node.matches?.('.workout-exercise-row')) enhance(node.parentElement || node);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}

export { makeSvg, movementType };
