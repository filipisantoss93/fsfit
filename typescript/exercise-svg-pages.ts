/* FS Fit — integração compartilhada dos SVGs fora do editor de treino */
// @ts-ignore The browser resolves this versioned generated module.
import { makeSvg } from './exercise-svg-icons.js?v=20261001-ts2';
// @ts-ignore The browser resolves this versioned side-effect module.
import './exercise-svg-specific.js?v=20261001-ts1';
// @ts-ignore The browser resolves this versioned side-effect module.
import './exercise-svg-extended.js?v=20261001-ts1';
// @ts-ignore The browser resolves this versioned side-effect module.
import './exercise-svg-complete.js?v=20261001-ts2';

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

function exerciseName(row: HTMLElement): string {
  const explicit = row.dataset.exerciseName || row.getAttribute('aria-label') || '';
  if (explicit) return explicit.replace(/^.*?:\s*/, '').trim();
  return row.querySelector('.student-compact-main strong, .student-exercise-main strong, .exercise-library-item-title h3, .exercise-name, h3, strong')?.textContent?.trim() || '';
}

function createIcon(name: string, compact = false): HTMLSpanElement {
  const wrapper = document.createElement('span');
  wrapper.className = `exercise-svg-icon exercise-svg-page-icon${compact ? ' compact' : ''}`;
  wrapper.dataset.exerciseSvg = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.appendChild(makeSvg(name));
  return wrapper;
}

function enhance(root: ParentNode = document): void {
  const rows: HTMLElement[] = [];
  if (root instanceof HTMLElement && root.matches(SELECTORS)) rows.push(root);
  root.querySelectorAll<HTMLElement>(SELECTORS).forEach(row => rows.push(row));

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

function start(): void {
  document.documentElement.classList.add(PAGE_SCOPE);
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
