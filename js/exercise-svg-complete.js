/* FS Fit — cobertura final de variações SVG */
const normalize = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const rules = [
  ['ab-bicycle', /abdominal bicicleta/],
  ['ab-machine', /abdominal supra na maquina/],
  ['ab-crunch', /abdominal tradicional/],
  ['ab-cable', /crunch na polia/],
  ['ab-hanging', /elevacao de pernas suspenso/],
  ['russian-twist', /russian twist/],
  ['bridge', /elevacao pelvica no solo/],
  ['bridge-single', /elevacao pelvica unilateral/],
  ['glute-machine', /gluteo maquina/],
  ['abduction-band', /abducao.*miniband/],
  ['abduction-cable', /abducao de quadril na polia/],
  ['adduction-cable', /aducao de quadril na polia/],
  ['calf-standing', /panturrilha em pe/],
  ['calf-seated', /panturrilha sentad/],
  ['calf-legpress', /panturrilha no leg press/],
  ['wrist-curl', /rosca de punho(?! reversa)/],
  ['wrist-reverse', /rosca de punho reversa|rosca inversa com barra/],
  ['farmer-walk', /farmer walk|farmers walk/],
  ['battle-rope', /battle rope/],
  ['box-jump', /box jump/],
  ['burpee', /burpee/],
  ['kettlebell-swing', /kettlebell swing/],
  ['mountain-climber', /mountain climber/],
  ['jumping-jack', /polichinelo/],
  ['sled-push', /sled push/],
  ['elliptical', /eliptico/],
  ['stair', /escada ergometrica/],
  ['recumbent-bike', /bicicleta horizontal/],
  ['bird-dog', /bird dog/],
  ['superman', /superman/],
  ['back-extension', /extensao lombar|hiperextensao lombar/],
  ['shoulder-stretch', /alongamento de ombros/],
  ['chest-stretch', /alongamento de peitoral/],
  ['hamstring-stretch', /alongamento de posterior/],
  ['quad-stretch', /alongamento de quadriceps/],
  ['hip-mobility', /mobilidade de quadril/],
  ['ankle-mobility', /mobilidade de tornozelo/],
  ['thoracic-mobility', /mobilidade toracica/],
  ['shrug-bar', /encolhimento com barra/],
  ['shrug-dumbbell', /encolhimento com halteres/],
  ['upright-row', /remada alta/],
  ['dip-bench', /mergulho no banco/],
  ['parallel-dip', /paralelas/],
  ['triceps-kickback', /triceps coice/],
  ['triceps-machine', /triceps maquina/],
  ['triceps-bar', /triceps pulley com barra/],
  ['skullcrusher', /triceps testa/],
  ['pullover', /pullover com halter/],
  ['straight-arm-pulldown', /pulldown com bracos estendidos/]
];

const drawings = {
  'ab-bicycle':'<path d="M7 49h50"/><circle cx="17" cy="40" r="4"/><path d="M21 40l12-9 11 7M33 31l-7 14M44 38l10 7M26 45l-11-3M36 33l8-10"/>',
  'ab-machine':'<path d="M11 10v44M53 10v44M17 49h30M22 44V25h20v19"/><circle cx="32" cy="21" r="4"/><path d="M32 25l-6 10 8 7M26 35l-7-4M34 42l9 5"/>',
  'ab-crunch':'<path d="M7 49h50"/><circle cx="18" cy="41" r="4"/><path d="M22 41l12-9 8 5M34 32l-5 13M42 37l9 8M29 45H15"/>',
  'ab-cable':'<path d="M52 7v49M42 8h10"/><circle cx="30" cy="18" r="4"/><path d="M30 22l-5 15 10 8M25 29l-8 9M25 29l14 5M39 34l10-20M35 45l-8 9M35 45l8 9"/>',
  'ab-hanging':'<path d="M10 8h44M7 5v6M57 5v6"/><circle cx="32" cy="19" r="4"/><path d="M32 23v16M32 25L20 11M32 25l12-14M32 39l-12 7M32 39l12 7M20 46h24"/>',
  'russian-twist':'<path d="M7 50h50"/><circle cx="26" cy="24" r="4"/><path d="M29 28l8 12M37 40l-12 8M37 40l13 8M29 31l15 2M44 33l7-5M44 33l7 5"/><circle cx="53" cy="28" r="3"/>',
  bridge:'<path d="M7 49h50"/><circle cx="15" cy="42" r="4"/><path d="M19 42l15-10 12 8M34 32l7 13M46 40l9 9M41 45H23"/>',
  'bridge-single':'<path d="M7 49h50"/><circle cx="15" cy="42" r="4"/><path d="M19 42l15-10 12 8M34 32l7 13M46 40l9 9M34 32l11-13M41 45H23"/>',
  'glute-machine':'<path d="M10 9v46M54 9v46M16 50h32"/><circle cx="28" cy="18" r="4"/><path d="M28 22v18M28 27l-9 8M28 27l9 8M28 40l-8 13M28 40l16 2M44 42l8-7"/>',
  'abduction-band':'<circle cx="31" cy="10" r="4"/><path d="M31 14v21M31 21l-9 8M31 21l9 8M31 35l-13 15M31 35l13 15M17 45c8 4 22 4 29 0"/>',
  'abduction-cable':'<path d="M55 8v48"/><circle cx="29" cy="10" r="4"/><path d="M29 14v21M29 21l-9 8M29 21l9 8M29 35l-9 17M29 35l17 8M46 43l9-20"/>',
  'adduction-cable':'<path d="M8 8v48"/><circle cx="34" cy="10" r="4"/><path d="M34 14v21M34 21l-9 8M34 21l9 8M34 35l-6 17M34 35l-12 10M22 45L8 23"/>',
  'calf-standing':'<circle cx="31" cy="10" r="4"/><path d="M31 14v23M31 21l-8 8M31 21l8 8M31 37l-6 12M31 37l9 10M22 52h10M38 49h11M44 46l3 5"/>',
  'calf-seated':'<path d="M10 49h44M18 45h22"/><circle cx="27" cy="19" r="4"/><path d="M27 23v17M27 28l-8 9M27 28l9 9M27 40l-10 8M27 40l15 5M42 45l6 5"/>',
  'calf-legpress':'<path d="M10 53h44M14 49l17-25M31 24h17M48 15v30"/><circle cx="27" cy="20" r="4"/><path d="M27 24l-7 12M20 36l12 8M32 44l13-17M45 27l5-5M18 36l-6 13"/>',
  'wrist-curl':'<path d="M9 42h46M15 38h25"/><circle cx="24" cy="17" r="4"/><path d="M24 21v15M24 26l10 8M34 34h13M47 34v8M24 36l-8 14M24 36l8 14"/>',
  'wrist-reverse':'<path d="M9 42h46M15 38h25"/><circle cx="24" cy="17" r="4"/><path d="M24 21v15M24 26l10 8M34 34h13M47 30v8M24 36l-8 14M24 36l8 14"/>',
  'farmer-walk':'<circle cx="32" cy="10" r="4"/><path d="M32 14v21M32 21l-10 9M32 21l10 9M32 35l-10 17M32 35l10 17M17 31h10M37 31h10M15 28v7M49 28v7"/>',
  'battle-rope':'<circle cx="31" cy="10" r="4"/><path d="M31 14v21M31 21l-12 10M31 21l12 10M31 35l-9 17M31 35l9 17M19 31c-7 3-8 8-2 11M43 31c7 3 8 8 2 11"/>',
  'box-jump':'<path d="M41 36h18v18H41z"/><circle cx="23" cy="12" r="4"/><path d="M23 16l4 15M26 22l-12 8M26 22l12 7M27 31l-12 13M27 31l14 5"/>',
  burpee:'<path d="M7 50h50"/><circle cx="16" cy="39" r="4"/><path d="M20 40l15-6 13 7M35 34l-7 16M48 41l8 9M28 50H13"/>',
  'kettlebell-swing':'<circle cx="31" cy="10" r="4"/><path d="M31 14l-4 18M28 22l-12 10M28 22l14 8M27 32l-10 20M27 32l15 20M42 30l7-9"/><path d="M46 17h7M48 17c-4 4-4 8 1 11 5-3 5-7 1-11"/>',
  'mountain-climber':'<path d="M7 50h50"/><circle cx="17" cy="35" r="4"/><path d="M21 36l17 4 12 7M38 40l-11 10M50 47h6M27 50l-11-1"/>',
  'jumping-jack':'<circle cx="32" cy="9" r="4"/><path d="M32 13v20M32 20L14 9M32 20l18-11M32 33L15 52M32 33l17 19"/>',
  'sled-push':'<path d="M43 35h14v15H43M40 50h20M45 54h4M55 54h4"/><circle cx="22" cy="14" r="4"/><path d="M25 18l12 12M37 30l8 5M26 20l-9 14M17 34l-7 16M37 30l-3 20"/>',
  elliptical:'<path d="M12 49h40M18 44c4-16 22-16 28 0M22 16v28M42 12v32"/><circle cx="31" cy="12" r="4"/><path d="M31 16l-5 15M26 23l-8 9M26 23l10 8M26 31l-6 13M26 31l10 13"/>',
  stair:'<path d="M9 52h10V42h10V32h10V22h16"/><circle cx="26" cy="10" r="4"/><path d="M26 14v19M26 21l-9 8M26 21l9 8M26 33l-7 9M26 33l12-1"/>',
  'recumbent-bike':'<circle cx="20" cy="45" r="9"/><circle cx="48" cy="45" r="9"/><path d="M13 30h18l8 10M31 30l-7 15M39 40l9 5M31 30l10-9"/><circle cx="43" cy="17" r="4"/>',
  'bird-dog':'<path d="M7 50h50"/><circle cx="22" cy="31" r="4"/><path d="M26 32l15 6M31 34l-10 16M41 38l12 1M26 32l-10-10M41 38l8 12"/>',
  superman:'<path d="M7 50h50"/><circle cx="16" cy="40" r="4"/><path d="M20 40l16-4 15 2M36 36l-8 12M36 36l9 12M20 40l-10-8"/>',
  'back-extension':'<path d="M9 49h46M18 45l9-19h20"/><circle cx="30" cy="19" r="4"/><path d="M33 22l11 10M44 32l8 12M33 23l-8 12M25 35l-7 10"/>',
  'shoulder-stretch':'<circle cx="32" cy="10" r="4"/><path d="M32 14v22M32 20l-14 6M18 26l17 2M32 36l-8 16M32 36l8 16"/>',
  'chest-stretch':'<path d="M54 8v48"/><circle cx="31" cy="11" r="4"/><path d="M31 15v21M31 21l-11 9M31 21l19-4M50 17l4 7M31 36l-8 16M31 36l8 16"/>',
  'hamstring-stretch':'<circle cx="25" cy="13" r="4"/><path d="M28 17l13 13M41 30l-6 22M41 30l12 22M28 20l-12 21M10 42h24"/>',
  'quad-stretch':'<circle cx="31" cy="10" r="4"/><path d="M31 14v21M31 21l-9 8M31 21l9 8M31 35l-8 17M31 35l13 7M44 42l-5 8M39 50l7 1"/>',
  'hip-mobility':'<circle cx="32" cy="10" r="4"/><path d="M32 14v21M32 21l-9 8M32 21l9 8M32 35l-13 14M32 35l13 14M15 43c5-7 10-7 15 0M49 43c-5-7-10-7-15 0"/>',
  'ankle-mobility':'<path d="M10 50h44"/><circle cx="31" cy="10" r="4"/><path d="M31 14v21M31 21l-9 8M31 21l9 8M31 35l-9 15M31 35l13 11M44 46l8-1"/>',
  'thoracic-mobility':'<circle cx="31" cy="10" r="4"/><path d="M31 14v21M31 21l-14 2M31 21l13-8M31 35l-8 17M31 35l8 17M13 19l4 4-4 4M46 9l-2 5 5 2"/>',
  'shrug-bar':'<circle cx="32" cy="10" r="4"/><path d="M32 14v22M32 21l-9 8M32 21l9 8M32 36l-8 16M32 36l8 16M16 29h32M13 26v6M51 26v6"/>',
  'shrug-dumbbell':'<circle cx="32" cy="10" r="4"/><path d="M32 14v22M32 21l-9 8M32 21l9 8M32 36l-8 16M32 36l8 16M18 29h9M37 29h9M16 26v6M48 26v6"/>',
  'upright-row':'<circle cx="32" cy="10" r="4"/><path d="M32 14v22M32 21l-9 10M32 21l9 10M23 31h18M20 28v7M44 28v7M32 36l-8 16M32 36l8 16"/>',
  'dip-bench':'<path d="M8 44h48M13 40h28"/><circle cx="41" cy="22" r="4"/><path d="M38 26l-10 8M28 34l-8 6M28 34l9 8M37 42l9 10M20 40l-5 12"/>',
  'parallel-dip':'<path d="M11 24h16M37 24h16M15 24v32M49 24v32"/><circle cx="32" cy="12" r="4"/><path d="M32 16v20M32 21l-10 8M32 21l10 8M32 36l-8 17M32 36l8 17"/>',
  'triceps-kickback':'<circle cx="24" cy="15" r="4"/><path d="M27 19l14 11M41 30l11-2M27 21l-8 15M19 36h12M31 36l8 16M19 36l-7 16"/>',
  'triceps-machine':'<path d="M10 10v45M54 10v45M16 50h32M22 44V27h20v17"/><circle cx="32" cy="23" r="4"/><path d="M32 27v12M32 31l-7 8M32 31l7 8M25 39h14M39 39l8-7"/>',
  'triceps-bar':'<path d="M52 7v49M42 8h10"/><circle cx="31" cy="16" r="4"/><path d="M31 20v19M31 25l9 7M40 32l-5 12M40 32l5 12M31 39l-8 14M31 39l8 14M35 44h10"/>',
  skullcrusher:'<path d="M8 45h48M15 41h34M22 41l5-14h19"/><circle cx="31" cy="23" r="4"/><path d="M28 27l5-8M34 27l-1-8M29 18h9M26 28l-4 12M36 28l5 12"/>',
  pullover:'<path d="M8 45h48M15 41h34M22 41l5-14h19"/><circle cx="31" cy="23" r="4"/><path d="M28 27l-10-9M18 18h8M16 15v6M28 28l-4 12M36 28l5 12"/>',
  'straight-arm-pulldown':'<path d="M54 7v49M44 8h10"/><circle cx="30" cy="13" r="4"/><path d="M30 17v21M30 22l12 8M42 30l8-17M30 38l-8 15M30 38l8 15"/>'
};

function typeFor(name) {
  const n = normalize(name);
  return rules.find(([, pattern]) => pattern.test(n))?.[0] || null;
}

function refine(root = document) {
  root.querySelectorAll('.exercise-svg-icon').forEach(icon => {
    const type = typeFor(icon.dataset.exerciseSvg || '');
    const svg = icon.querySelector('svg');
    if (!type || !svg || svg.dataset.completeType === type) return;
    svg.innerHTML = drawings[type];
    svg.dataset.completeType = type;
  });
}

function start() {
  refine();
  const observer = new MutationObserver(mutations => mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
    if (!(node instanceof Element)) return;
    refine(node.matches('.exercise-svg-icon') ? node.parentElement || node : node);
  })));
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
