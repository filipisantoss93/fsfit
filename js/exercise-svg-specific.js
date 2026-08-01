/* FS Fit — refinamento visual dos SVGs de exercícios */

const normalize = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const rules = [
  ['bench-incline', /supino inclinado/],
  ['bench-decline', /supino declinado/],
  ['bench-dumbbell', /supino reto com halteres/],
  ['bench-close', /supino fechado/],
  ['pushup', /flexao de bracos/],
  ['fly', /crucifixo|peck deck/],
  ['crossover', /crossover/],
  ['squat-smith', /agachamento no smith/],
  ['squat-front', /agachamento frontal/],
  ['squat-bulgarian', /agachamento bulgaro/],
  ['lunge', /afundo|passada/],
  ['leg-press', /leg press/],
  ['leg-extension', /cadeira extensora/],
  ['leg-curl', /cadeira flexora|mesa flexora/],
  ['hip-machine', /cadeira abdutora|cadeira adutora/],
  ['pullup', /barra fixa/],
  ['pulldown-wide', /puxada frontal aberta/],
  ['pulldown-close', /puxada frontal fechada|puxada neutra/],
  ['row-one-arm', /remada unilateral/],
  ['row-bent', /remada curvada/],
  ['row-seated', /remada baixa/],
  ['deadlift', /levantamento terra$/],
  ['rdl', /romeno|stiff/],
  ['curl-scott', /rosca scott/],
  ['curl-hammer', /rosca martelo/],
  ['triceps-rope', /triceps corda/],
  ['triceps-overhead', /triceps frances/],
  ['shoulder-press', /desenvolvimento/],
  ['lateral-raise', /elevacao lateral/],
  ['face-pull', /face pull/],
  ['hip-thrust', /hip thrust|elevacao pelvica/],
  ['kickback', /coice|gluteo na polia/],
  ['plank', /prancha frontal/],
  ['side-plank', /prancha lateral/],
  ['leg-raise', /elevacao de pernas|abdominal infra/],
  ['bike', /bicicleta/],
  ['treadmill', /esteira/],
  ['run', /corrida ao ar livre/],
  ['rower', /remo ergometrico|remo por distancia/]
];

const drawings = {
  'bench-incline': '<path d="M8 49h48M16 45l27-18M23 40l6-14h18"/><circle cx="34" cy="22" r="4"/><path d="M31 26l-9 5M38 26l10 1M17 28h35M14 25v7M55 24v7M31 28l-5 12M39 28l4 8"/>',
  'bench-decline': '<path d="M8 48h48M16 42l31 5M24 42l6-15h18"/><circle cx="34" cy="25" r="4"/><path d="M30 29l-9 6M38 29l10 6M17 32h35M14 28v8M55 28v8M30 30l-5 11M39 30l5 13"/>',
  'bench-dumbbell': '<path d="M8 45h48M15 41h34M22 41l5-14h19"/><circle cx="31" cy="23" r="4"/><path d="M27 27l-8 7M35 27l9 7M15 31h8M41 31h8M13 28v6M25 28v6M39 28v6M51 28v6M28 28l-4 12M36 28l5 12"/>',
  'bench-close': '<path d="M8 45h48M15 41h34M22 41l5-14h19"/><circle cx="31" cy="23" r="4"/><path d="M28 27l-3 7M34 27l3 7M23 31h16M20 28v7M42 28v7M28 28l-4 12M36 28l5 12"/>',
  pushup: '<path d="M7 49h50"/><circle cx="17" cy="34" r="4"/><path d="M21 35l17 2 12 8M38 37l-9 12M50 45l6 4M29 49H14"/>',
  fly: '<path d="M8 45h48M16 41h32M23 41l5-14h18"/><circle cx="32" cy="23" r="4"/><path d="M28 27l-14 4M36 27l14 4M11 28v6M53 28v6M29 28l-5 12M36 28l5 12"/>',
  crossover: '<path d="M8 9v47M56 9v47M8 14h10M46 14h10"/><circle cx="32" cy="12" r="4"/><path d="M32 16v21M32 22L13 18M32 22l19-4M13 18l14 17M51 18L37 35M32 37l-8 16M32 37l8 16"/>',
  'squat-smith': '<path d="M12 7v50M52 7v50M12 12h40M17 20h30"/><circle cx="33" cy="16" r="4"/><path d="M32 20l-5 14 10 7 8 12M27 34l-10 8-5 11M37 41l-11 12"/>',
  'squat-front': '<circle cx="33" cy="10" r="4"/><path d="M32 14l-4 15 11 8 7 15M28 29l-11 9-5 14M39 37l-12 15M20 20h27M22 17v6M45 17v6M28 18l4 4 4-4"/>',
  'squat-bulgarian': '<path d="M43 42h14M48 42v8"/><circle cx="27" cy="11" r="4"/><path d="M27 15v18M27 22l-9 8M27 22l9 8M27 33l-11 19M27 33l18 9"/>',
  lunge: '<circle cx="31" cy="9" r="4"/><path d="M31 13v19M31 20l-9 8M31 20l9 8M31 32l-16 15M31 32l17 7M15 47H8M48 39l7 13"/>',
  'leg-press': '<path d="M10 53h44M14 49l17-25M31 24h17M48 15v30"/><circle cx="27" cy="20" r="4"/><path d="M27 24l-7 12M20 36l12 8M32 44l13-17M18 36l-6 13"/>',
  'leg-extension': '<path d="M10 10v45M54 10v45M16 50h32M22 44V27h20v17"/><circle cx="32" cy="23" r="4"/><path d="M32 27v12M32 31l-8 8M32 31l8 8M24 39h16M40 39l10 8"/>',
  'leg-curl': '<path d="M8 49h48M14 45h34"/><circle cx="18" cy="37" r="4"/><path d="M22 37h18M40 37l10 7M50 44l-4 7M27 37l-8 8"/>',
  'hip-machine': '<path d="M10 10v45M54 10v45M16 50h32"/><circle cx="32" cy="20" r="4"/><path d="M32 24v15M32 28l-9 8M32 28l9 8M32 39l-12 8M32 39l12 8M18 43v8M46 43v8"/>',
  pullup: '<path d="M10 9h44M7 6v6M57 6v6"/><circle cx="32" cy="20" r="4"/><path d="M32 24v16M32 27L18 12M32 27l14-15M32 40l-8 13M32 40l8 13"/>',
  'pulldown-wide': '<path d="M11 9h42M8 6v6M56 6v6"/><circle cx="32" cy="20" r="4"/><path d="M32 24v16M32 27L17 13M32 27l15-14M32 40l-8 13M32 40l8 13M22 45h20"/>',
  'pulldown-close': '<path d="M21 9h22M18 6v6M46 6v6"/><circle cx="32" cy="20" r="4"/><path d="M32 24v16M32 27L24 13M32 27l8-14M32 40l-8 13M32 40l8 13M22 45h20"/>',
  'row-one-arm': '<path d="M8 45h30M14 41h22"/><circle cx="25" cy="18" r="4"/><path d="M28 22l10 8 14-3M38 30l-8 11M30 41l8 12M21 41l-7 12M49 23v9"/>',
  'row-bent': '<circle cx="24" cy="16" r="4"/><path d="M27 20l15 12M42 32l-5 20M42 32l10 20M28 23l-9 11M15 35h24M12 32v6M42 32v6"/>',
  'row-seated': '<path d="M8 48h48M12 44h20"/><circle cx="28" cy="19" r="4"/><path d="M28 23v17M28 28l16 8M44 36h10M28 40l-10 9M28 40l12 9M52 18v26"/>',
  deadlift: '<circle cx="25" cy="14" r="4"/><path d="M28 18l14 14M42 32l-5 20M42 32l10 20M28 20l-9 18M14 39h32M11 35v8M49 35v8"/>',
  rdl: '<circle cx="25" cy="14" r="4"/><path d="M28 18l14 13M42 31l-3 21M42 31l9 21M28 20l-8 16M15 37h29M12 34v7M47 34v7"/>',
  'curl-scott': '<path d="M10 50h44M20 45l9-18h20M29 27h20"/><circle cx="25" cy="17" r="4"/><path d="M25 21v15M25 25l8 10M33 35h12M25 36l-8 14M25 36l8 14"/>',
  'curl-hammer': '<circle cx="32" cy="10" r="4"/><path d="M32 14v20M32 20l-10 10 5 10M32 20l10 10-5 10M32 34l-8 18M32 34l8 18M23 37v7M41 37v7"/>',
  'triceps-rope': '<circle cx="32" cy="10" r="4"/><path d="M32 14v20M32 20l8 8M40 28l-5 13M40 28l5 13M32 34l-8 18M32 34l8 18M32 8h22M52 8v45"/>',
  'triceps-overhead': '<circle cx="32" cy="14" r="4"/><path d="M32 18v20M32 23l-9-11M32 23l9-11M29 8h6M32 38l-8 15M32 38l8 15"/>',
  'shoulder-press': '<circle cx="32" cy="14" r="4"/><path d="M32 18v20M32 23l-10-12M32 23l10-12M17 8h9M38 8h9M14 5v6M29 5v6M35 5v6M50 5v6M32 38l-8 15M32 38l8 15"/>',
  'lateral-raise': '<circle cx="32" cy="10" r="4"/><path d="M32 14v20M32 20L15 14M32 20l17-6M11 11l6 6M53 11l-6 6M32 34l-8 18M32 34l8 18"/>',
  'face-pull': '<circle cx="32" cy="18" r="4"/><path d="M32 22v18M32 27l9-8M32 27l9 8M41 19h12M41 35h12M53 19l5 8-5 8M32 40l-8 13M32 40l8 13"/>',
  'hip-thrust': '<path d="M8 45h48M12 41h20M32 41l8-14"/><circle cx="44" cy="23" r="4"/><path d="M40 27l-14 7-10 7M26 34l9 8M35 42l10 10M25 34l-7 10M22 31h18"/>',
  kickback: '<circle cx="28" cy="13" r="4"/><path d="M28 17v18M28 22l-10 9M28 22l10 9M28 35l-10 17M28 35l18 5M46 40l8-8"/>',
  plank: '<path d="M7 49h50"/><circle cx="17" cy="37" r="4"/><path d="M21 38l18 2 11 7M39 40l-8 9M50 47l6 2M31 49H14"/>',
  'side-plank': '<path d="M7 50h50"/><circle cx="18" cy="36" r="4"/><path d="M22 37l18 4 10 7M40 41l-6 9M50 48h6M24 39l-5 11"/>',
  'leg-raise': '<path d="M7 49h50"/><circle cx="16" cy="42" r="4"/><path d="M20 42h17M37 42l12-14M37 42l15 3M26 42l-8 7"/>',
  bike: '<circle cx="19" cy="44" r="10"/><circle cx="47" cy="44" r="10"/><circle cx="31" cy="14" r="4"/><path d="M30 18l-8 13 10 7 8-14M22 31h18M32 38l-13 6M32 38l15 6M38 24h10"/>',
  treadmill: '<path d="M8 51h48M13 46h36l7 5M49 12v34M49 15h8"/><circle cx="29" cy="15" r="4"/><path d="M29 19l-4 16M25 25l-9 9M25 25l9 8M25 35l-10 11M25 35l13 11"/>',
  run: '<circle cx="31" cy="11" r="4"/><path d="M31 15l-5 16M27 22l-12 7M27 22l13 5M26 31l-13 14M26 31l16 8M42 39l9 11M13 45l-7 5"/>',
  rower: '<path d="M8 50h48M12 46h30M42 46l10-18"/><circle cx="28" cy="22" r="4"/><path d="M28 26v15M28 30l16 7M44 37l8-9M28 41l-10 9M28 41l12 9"/>'
};

function specificType(name) {
  const normalized = normalize(name);
  return rules.find(([, pattern]) => pattern.test(normalized))?.[0] || null;
}

function refine(root = document) {
  root.querySelectorAll('.exercise-svg-icon').forEach(icon => {
    const name = icon.dataset.exerciseSvg || '';
    const type = specificType(name);
    const svg = icon.querySelector('svg');
    if (!type || !svg || svg.dataset.specificType === type) return;
    svg.innerHTML = drawings[type];
    svg.dataset.specificType = type;
  });
}

function start() {
  refine();
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
      if (!(node instanceof Element)) return;
      refine(node.matches('.exercise-svg-icon') ? node.parentElement || node : node);
    }));
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
