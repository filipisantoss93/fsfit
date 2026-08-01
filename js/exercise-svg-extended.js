/* FS Fit — terceira camada de SVGs específicos para exercícios */

const normalize = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase();

const rules = [
  ['ab-bike', /abdominal bicicleta/],
  ['crunch-floor', /abdominal tradicional/],
  ['crunch-machine', /abdominal supra na maquina/],
  ['crunch-cable', /crunch na polia/],
  ['russian-twist', /russian twist/],
  ['hanging-raise', /elevacao de pernas suspenso/],
  ['glute-bridge', /elevacao pelvica no solo/],
  ['glute-bridge-one', /elevacao pelvica unilateral/],
  ['hip-abduction-band', /abducao.*miniband/],
  ['hip-abduction-cable', /abducao de quadril na polia/],
  ['hip-adduction-cable', /aducao de quadril na polia/],
  ['calf-standing', /panturrilha em pe/],
  ['calf-seated', /panturrilha sentad/],
  ['calf-legpress', /panturrilha no leg press/],
  ['wrist-curl', /rosca de punho(?! reversa)/],
  ['wrist-reverse', /rosca de punho reversa|rosca inversa/],
  ['farmer-walk', /farmer.?s? walk/],
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
  ['roman-extension', /extensao lombar|hiperextensao lombar/],
  ['bird-dog', /bird dog/],
  ['superman', /superman/],
  ['shoulder-stretch', /alongamento de ombros/],
  ['chest-stretch', /alongamento de peitoral/],
  ['hamstring-stretch', /alongamento de posterior/],
  ['quad-stretch', /alongamento de quadriceps/],
  ['hip-mobility', /mobilidade de quadril/],
  ['ankle-mobility', /mobilidade de tornozelo/],
  ['thoracic-mobility', /mobilidade toracica/]
];

const drawings = {
  'ab-bike':'<path d="M7 49h50"/><circle cx="17" cy="40" r="4"/><path d="M21 40l12-8 10 7M33 32l-6 15M43 39l10 8M27 47l-11-7M42 39l-8 8"/>',
  'crunch-floor':'<path d="M7 49h50"/><circle cx="17" cy="40" r="4"/><path d="M21 40l12-8 10 7M33 32l-6 15M43 39l8 8M27 47H14"/>',
  'crunch-machine':'<path d="M10 9v46M54 9v46M17 50h30M22 44V27h20v17"/><circle cx="32" cy="22" r="4"/><path d="M32 26l-5 12M27 38l8 5M32 28l9 8M41 36h8"/>',
  'crunch-cable':'<path d="M52 8v47M42 10h10"/><circle cx="28" cy="19" r="4"/><path d="M28 23l-5 14M23 37l8 8M28 26l14-10M42 16l8 8M31 45l-9 8M31 45l10 8"/>',
  'russian-twist':'<path d="M7 50h50"/><circle cx="25" cy="31" r="4"/><path d="M29 33l10 7M39 40l11-5M39 40l9 8M29 34l-8 12M21 46H12M47 32l5 5-5 5"/>',
  'hanging-raise':'<path d="M10 8h44M7 5v6M57 5v6"/><circle cx="32" cy="18" r="4"/><path d="M32 22v15M32 24L18 10M32 24l14-14M32 37l-13 4M32 37l13 4M19 41l8 10M45 41l-8 10"/>',
  'glute-bridge':'<path d="M7 49h50"/><circle cx="17" cy="41" r="4"/><path d="M21 41l13-9 13 8M34 32l7 15M47 40l8 9M26 38l-7 11"/>',
  'glute-bridge-one':'<path d="M7 49h50"/><circle cx="17" cy="41" r="4"/><path d="M21 41l13-9 12 8M34 32l7 15M46 40l9-12M26 38l-7 11"/>',
  'hip-abduction-band':'<circle cx="31" cy="11" r="4"/><path d="M31 15v21M31 22l-9 8M31 22l9 8M31 36l-13 15M31 36l13 15M18 45h26"/>',
  'hip-abduction-cable':'<path d="M54 8v47M48 12h6"/><circle cx="28" cy="11" r="4"/><path d="M28 15v21M28 22l-9 8M28 22l9 8M28 36l-8 16M28 36l17 7M45 43l7-7"/>',
  'hip-adduction-cable':'<path d="M54 8v47M48 12h6"/><circle cx="28" cy="11" r="4"/><path d="M28 15v21M28 22l-9 8M28 22l9 8M28 36l-8 16M28 36l10 15M20 44l18 7M38 51l12-14"/>',
  'calf-standing':'<circle cx="31" cy="10" r="4"/><path d="M31 14v22M31 21l-8 8M31 21l8 8M31 36l-6 14M31 36l10 12M23 52h9M39 50h10M44 46l3 6"/>',
  'calf-seated':'<path d="M12 46h40M18 42h20M38 42v8"/><circle cx="27" cy="21" r="4"/><path d="M27 25v14M27 29l-8 8M27 29l8 8M27 39l12 7M39 46l8-1M19 39l-5 7"/>',
  'calf-legpress':'<path d="M10 53h44M14 49l17-25M31 24h17M48 15v30"/><circle cx="27" cy="20" r="4"/><path d="M27 24l-7 12M20 36l12 8M32 44l13-17M45 27l4-4M18 36l-6 13"/>',
  'wrist-curl':'<path d="M10 45h44M15 41h34"/><circle cx="24" cy="20" r="4"/><path d="M24 24v14M24 28l10 9M34 37h10M44 37l3 5M24 38l-8 7"/>',
  'wrist-reverse':'<path d="M10 45h44M15 41h34"/><circle cx="24" cy="20" r="4"/><path d="M24 24v14M24 28l10 9M34 37h10M44 37l3-5M24 38l-8 7"/>',
  'farmer-walk':'<circle cx="32" cy="10" r="4"/><path d="M32 14v21M32 21l-10 10M32 21l10 10M32 35l-9 17M32 35l9 17M17 31v12M47 31v12M14 43h6M44 43h6"/>',
  'battle-rope':'<circle cx="28" cy="11" r="4"/><path d="M28 15v20M28 22l-12 9M28 22l12 9M28 35l-9 17M28 35l9 17M16 31c8 3 11 8 18 8s11-5 18-2M40 31c8 3 11 8 18 8"/>',
  'box-jump':'<path d="M40 39h18v15H40z"/><circle cx="24" cy="12" r="4"/><path d="M24 16l5 17M29 33l11 6M29 33l-12 7M24 22l-9 8M24 22l10 6"/>',
  burpee:'<path d="M7 50h50"/><circle cx="18" cy="36" r="4"/><path d="M22 37l15 2 11 8M37 39l-8 11M48 47l7 3M29 50H14M25 33l7-10M32 23l8-8"/>',
  'kettlebell-swing':'<circle cx="31" cy="10" r="4"/><path d="M31 14v21M31 21l-9 8M31 21l9 8M31 35l-9 17M31 35l9 17M40 29l8-10M45 16h7M45 16a4 4 0 0 1 7 0"/>',
  'mountain-climber':'<path d="M7 50h50"/><circle cx="17" cy="36" r="4"/><path d="M21 37l18 2 11 8M39 39l-11 3M28 42l-8 8M50 47l6 3M31 50H14"/>',
  'jumping-jack':'<circle cx="32" cy="9" r="4"/><path d="M32 13v20M32 19L14 9M32 19l18-10M32 33L16 52M32 33l16 19M10 7l6 5M54 7l-6 5"/>',
  'sled-push':'<path d="M45 31h13v17H45M42 48h18M45 31l-8-8"/><circle cx="23" cy="12" r="4"/><path d="M23 16l8 17M31 33l10-10M31 33l-7 19M31 33l12 15M20 21l17 2"/>',
  elliptical:'<path d="M12 50h40M18 46l8-25h14l8 25M26 21l-8-9M40 21l8-9"/><circle cx="31" cy="12" r="4"/><path d="M31 16l-5 15M26 31l8 8M34 39l10 7M26 31l-8 15M31 22l12-8"/>',
  stair:'<path d="M10 52h12V42h12V32h12V22h10"/><circle cx="30" cy="12" r="4"/><path d="M30 16v19M30 22l-8 8M30 22l8 8M30 35l-8 12M30 35l10 7"/>',
  'recumbent-bike':'<circle cx="18" cy="45" r="9"/><circle cx="48" cy="45" r="9"/><path d="M15 32h20l13 13M35 32l-17 13M35 32l8-10M43 22h9"/><circle cx="28" cy="20" r="4"/><path d="M28 24l7 8"/>',
  'roman-extension':'<path d="M12 50h40M22 46l8-19h19M30 27h19"/><circle cx="24" cy="17" r="4"/><path d="M28 20l13 8M41 28l6 18M28 22l-7 13M21 35l-7 15"/>',
  'bird-dog':'<path d="M7 50h50"/><circle cx="22" cy="31" r="4"/><path d="M26 32l14 6M40 38l13-8M40 38l8 12M27 34l-12 8M27 34l-4 16"/>',
  superman:'<path d="M7 50h50"/><circle cx="20" cy="40" r="4"/><path d="M24 40l16-6M40 34l14-8M40 34l13 9M25 41l-12 6"/>',
  'shoulder-stretch':'<circle cx="31" cy="10" r="4"/><path d="M31 14v21M31 21l-16 5M31 21l12 6M43 27l-8 5M31 35l-8 17M31 35l8 17"/>',
  'chest-stretch':'<path d="M54 8v47"/><circle cx="30" cy="10" r="4"/><path d="M30 14v21M30 21l18-4M30 21l-9 8M48 17l6 7M30 35l-8 17M30 35l8 17"/>',
  'hamstring-stretch':'<circle cx="28" cy="11" r="4"/><path d="M28 15l7 17M35 32l14 14M35 32l-12 18M28 22l-12 13M16 35l-8 15"/>',
  'quad-stretch':'<circle cx="30" cy="10" r="4"/><path d="M30 14v21M30 21l-9 8M30 21l9 8M30 35l-7 17M30 35l12 8M42 43l-5 9M39 28l5 15"/>',
  'hip-mobility':'<circle cx="30" cy="10" r="4"/><path d="M30 14v21M30 21l-9 8M30 21l9 8M30 35l-14 8M30 35l14 8M14 43c4-6 9-7 15-3M46 43c-4-6-9-7-15-3"/>',
  'ankle-mobility':'<path d="M10 50h44M18 46l12-14M30 32l12 14M18 46h18M42 46l8-7M47 36l5 3-3 5"/>',
  'thoracic-mobility':'<circle cx="31" cy="10" r="4"/><path d="M31 14v21M31 21l-13 8M31 21l13 8M31 35l-8 17M31 35l8 17M17 25c7-8 20-8 28 0M14 22l3 3-3 3M48 22l-3 3 3 3"/>'
};

function apply(root = document) {
  root.querySelectorAll('.exercise-svg-icon').forEach(wrapper => {
    const name = wrapper.dataset.exerciseSvg || '';
    const match = rules.find(([, regex]) => regex.test(name));
    if (!match || wrapper.dataset.svgExtended === match[0]) return;
    const svg = wrapper.querySelector('svg');
    if (!svg) return;
    svg.innerHTML = drawings[match[0]];
    wrapper.dataset.svgExtended = match[0];
  });
}

function start() {
  apply();
  const observer = new MutationObserver(() => apply());
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
