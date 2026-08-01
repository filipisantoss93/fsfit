/* FS Fit — integração compartilhada dos SVGs fora do editor de treino */
import { makeSvg } from './exercise-svg-icons.js?v=20260801-svg2';
import './exercise-svg-specific.js?v=20260801-specific1';
import './exercise-svg-extended.js?v=20260801-extended1';
import './exercise-svg-complete.js?v=20260801-complete1';

const PAGE_SCOPE = 'fsfit-exercise-svg-page';
const SELECTORS = [
  '.student-compact-row',
  '.student-dashboard-upcoming-row',
  '.student-workout-exercise',
  '.student-exercise-row',
  '.exercise-library-row',
  '.exercise-library-item',
  '.exercise-card',
  '.library-exercise-row',
  '[data-exercise-id]'
].join(',');

function exerciseName(row) {
  const explicit = row.dataset.exerciseName || row.getAttribute('aria-label') || '';
  if (explicit) return explicit.replace(/^.*?:\s*/, '').trim();
  return row.querySelector('.student-compact-main strong, .student-exercise-main strong, .exercise-library-item-title h3, .exercise-name, h3, strong')?.textContent?.trim() || '';
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
    if (row.querySelector(':scope > .exercise-svg-page-icon, :scope .exercise-svg-page-icon')) return;
    const name = exerciseName(row);
    if (!name || /treino|agenda|refei|orienta|descanso/i.test(name)) return;

    const compact = row.classList.contains('student-dashboard-upcoming-row');
    const icon = createIcon(name, compact);
    const anchor = row.querySelector('.student-compact-main, .student-exercise-main, .exercise-library-item-content, .exercise-card-content, .library-row-main');
    if (anchor) row.insertBefore(icon, anchor);
    else row.prepend(icon);
  });
}

function installStyles() {
  if (document.querySelector('#exercise-svg-page-styles')) return;
  document.documentElement.classList.add(PAGE_SCOPE);

  const style = document.createElement('style');
  style.id = 'exercise-svg-page-styles';
  style.textContent = `
    html.${PAGE_SCOPE} .exercise-svg-page-icon{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      width:46px;
      height:46px;
      min-width:46px;
      flex:0 0 46px;
      border-radius:12px;
      background:rgba(139,198,63,.11);
      color:#8bc63f;
      border:1px solid rgba(139,198,63,.2);
      overflow:hidden;
      box-sizing:border-box;
    }
    html.${PAGE_SCOPE} .exercise-svg-page-icon svg{width:38px;height:38px}
    html.${PAGE_SCOPE} .exercise-svg-page-icon.compact{width:36px;height:36px;min-width:36px;flex-basis:36px;border-radius:50%}
    html.${PAGE_SCOPE} .exercise-svg-page-icon.compact svg{width:30px;height:30px}

    html.${PAGE_SCOPE} .student-compact-row > .exercise-svg-page-icon,
    html.${PAGE_SCOPE} .student-exercise-row > .exercise-svg-page-icon,
    html.${PAGE_SCOPE} .exercise-library-row > .exercise-svg-page-icon,
    html.${PAGE_SCOPE} .library-exercise-row > .exercise-svg-page-icon,
    html.${PAGE_SCOPE} .exercise-card > .exercise-svg-page-icon{
      align-self:center;
    }

    html.${PAGE_SCOPE} .exercise-library-item > .exercise-svg-page-icon{
      position:absolute;
      left:16px;
      top:50%;
      transform:translateY(-50%);
      z-index:1;
    }
    html.${PAGE_SCOPE} .exercise-library-item:has(> .exercise-svg-page-icon){position:relative}
    html.${PAGE_SCOPE} .exercise-library-item > .exercise-library-item-content{min-width:0}
    html.${PAGE_SCOPE} .exercise-library-item:has(> .exercise-svg-page-icon) > .exercise-library-item-content{padding-left:62px}

    @media(max-width:430px){
      html.${PAGE_SCOPE} .exercise-svg-page-icon{width:40px;height:40px;min-width:40px;flex-basis:40px;border-radius:11px}
      html.${PAGE_SCOPE} .exercise-svg-page-icon svg{width:33px;height:33px}
      html.${PAGE_SCOPE} .exercise-library-item > .exercise-svg-page-icon{left:14px}
      html.${PAGE_SCOPE} .exercise-library-item:has(> .exercise-svg-page-icon) > .exercise-library-item-content{padding-left:56px}
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
