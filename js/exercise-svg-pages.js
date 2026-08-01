/* FS Fit — integração compartilhada dos SVGs fora do editor de treino */
import { makeSvg } from './exercise-svg-icons.js?v=20260801-svg2';
import './exercise-svg-specific.js?v=20260801-specific1';
import './exercise-svg-extended.js?v=20260801-extended1';
import './exercise-svg-complete.js?v=20260801-complete1';

const SELECTORS = [
  '.student-compact-row',
  '.student-dashboard-upcoming-row',
  '.student-workout-exercise',
  '.student-exercise-row',
  '.exercise-library-item',
  '.exercise-library-row',
  '.exercise-card',
  '.library-exercise-row',
  '[data-exercise-id]'
].join(',');

function exerciseName(row) {
  const explicit = row.dataset.exerciseName || row.getAttribute('aria-label') || '';
  if (explicit) return explicit.replace(/^.*?:\s*/, '').trim();
  return row.querySelector(
    '.exercise-library-item-title h3, .student-compact-main strong, .student-exercise-main strong, .exercise-name, h3, strong'
  )?.textContent?.trim() || '';
}

function createIcon(name, compact = false) {
  const wrapper = document.createElement('span');
  wrapper.className = `exercise-svg-icon exercise-svg-page-icon${compact ? ' compact' : ''}`;
  wrapper.dataset.exerciseSvg = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.appendChild(makeSvg(name));
  return wrapper;
}

function enhance(root = document) {
  const rows = [];
  if (root instanceof Element && root.matches(SELECTORS)) rows.push(root);
  root.querySelectorAll?.(SELECTORS).forEach(row => rows.push(row));

  rows.forEach(row => {
    if (row.querySelector('.exercise-svg-page-icon')) return;
    const name = exerciseName(row);
    if (!name || /treino|agenda|refei|orienta|descanso/i.test(name)) return;

    const compact = row.classList.contains('student-dashboard-upcoming-row');
    const icon = createIcon(name, compact);
    const anchor = row.querySelector(
      '.exercise-library-item-content, .student-compact-main, .student-exercise-main, .exercise-card-content, .library-row-main'
    );

    if (anchor) row.insertBefore(icon, anchor);
    else row.prepend(icon);
  });
}

function installStyles() {
  if (document.querySelector('#exercise-svg-page-styles')) return;
  const style = document.createElement('style');
  style.id = 'exercise-svg-page-styles';
  style.textContent = `
    .exercise-svg-page-icon{display:inline-flex;align-items:center;justify-content:center;width:46px;height:46px;min-width:46px;border-radius:12px;background:rgba(139,198,63,.11);color:#8bc63f;border:1px solid rgba(139,198,63,.2);overflow:hidden}
    .exercise-svg-page-icon svg{width:38px;height:38px}
    .exercise-svg-page-icon.compact{width:36px;height:36px;min-width:36px;border-radius:50%}
    .exercise-svg-page-icon.compact svg{width:30px;height:30px}
    .exercise-library-item:has(>.exercise-svg-page-icon),
    .student-compact-row:has(>.exercise-svg-page-icon),
    .student-exercise-row:has(>.exercise-svg-page-icon),
    .exercise-library-row:has(>.exercise-svg-page-icon),
    .library-exercise-row:has(>.exercise-svg-page-icon),
    .exercise-card:has(>.exercise-svg-page-icon){display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px}
    .exercise-library-item>.exercise-svg-page-icon{align-self:center;margin-left:2px}
    .exercise-library-item-content{min-width:0}
    @media(max-width:430px){
      .exercise-svg-page-icon{width:44px;height:44px;min-width:44px;border-radius:11px}
      .exercise-svg-page-icon svg{width:36px;height:36px}
      .exercise-library-item:has(>.exercise-svg-page-icon){grid-template-columns:44px minmax(0,1fr) auto;column-gap:12px}
    }
  `;
  document.head.appendChild(style);
}

function start() {
  installStyles();
  enhance();
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
      if (node instanceof Element) enhance(node);
    }));
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
