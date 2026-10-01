// @ts-ignore Existing browser JavaScript module.
import { supabase } from './supabase.js';
// @ts-ignore Generated browser JavaScript module.
import { readUiCache, writeUiCache } from './ui-cache.js?v=20261001-ts-ui-cache1';

const SCOPE = 'painel-ui-snapshot';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const TEXT_IDS = [
  'summary-active-students',
  'summary-today-appointments',
  'summary-month-received',
  'summary-finance-pending',
  'attention-total-count',
  'attention-no-workout',
  'attention-overdue',
  'attention-waiting',
  'attention-due-today',
  'dashboard-agenda-tab-count',
  'today-count',
  'today-date',
  'overview-next-appointment',
  'overview-next-appointment-detail'
];
const HTML_IDS = ['today-list', 'dashboard-activity-list'];
const ATTENTION_IDS = [
  'attention-no-workout-item',
  'attention-overdue-item',
  'attention-waiting-item',
  'attention-due-today-item',
  'attention-loading',
  'attention-empty'
];

type PanelSnapshot = {
  dayKey?: string;
  text?: Record<string, unknown>;
  html?: Record<string, unknown>;
  hidden?: Record<string, unknown>;
  attentionCardHidden?: boolean;
};

const { data: { session } } = await supabase.auth.getSession();
const userId: string | undefined = session?.user?.id;

if (userId) {
  hydrate();
  observeAndPersist();
}

function hydrate(): void {
  const cached = readUiCache(userId, SCOPE, { maxAgeMs: MAX_AGE_MS }) as { value?: PanelSnapshot } | null;
  const snapshot = cached?.value;
  if (!snapshot || typeof snapshot !== 'object') return;

  const sameDay = snapshot.dayKey === localDateKey();

  Object.entries(snapshot.text || {}).forEach(([id, value]) => {
    if (!sameDay && isDaySpecific(id)) return;
    const element = document.getElementById(id);
    if (element && isUsefulValue(value)) element.textContent = String(value);
  });

  Object.entries(snapshot.html || {}).forEach(([id, value]) => {
    if (!sameDay && id === 'today-list') return;
    const element = document.getElementById(id);
    if (element && typeof value === 'string' && value.trim()) element.innerHTML = value;
  });

  Object.entries(snapshot.hidden || {}).forEach(([id, hidden]) => {
    const element = document.getElementById(id);
    if (element) element.hidden = Boolean(hidden);
  });

  const attentionCard = document.querySelector<HTMLElement>('.attention-card');
  if (attentionCard && typeof snapshot.attentionCardHidden === 'boolean') {
    attentionCard.hidden = snapshot.attentionCardHidden;
  }

  document.documentElement.classList.add('fsfit-cache-hydrated');
}

function observeAndPersist(): void {
  let timer = 0;
  const schedule = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(persist, 180);
  };

  const targets = [
    ...TEXT_IDS.map(id => document.getElementById(id)),
    ...HTML_IDS.map(id => document.getElementById(id)),
    ...ATTENTION_IDS.map(id => document.getElementById(id)),
    document.querySelector<HTMLElement>('.attention-card')
  ].filter((target): target is HTMLElement => target instanceof HTMLElement);

  const observer = new MutationObserver(schedule);
  targets.forEach(target => observer.observe(target, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'href', 'class']
  }));

  window.addEventListener('pagehide', persist, { passive: true });
  window.addEventListener('beforeunload', persist, { passive: true });
}

function persist(): void {
  if (!userId) return;
  const text: Record<string, string> = {};
  TEXT_IDS.forEach(id => {
    const value = document.getElementById(id)?.textContent?.trim();
    if (isUsefulValue(value)) text[id] = String(value);
  });

  const html: Record<string, string> = {};
  HTML_IDS.forEach(id => {
    const element = document.getElementById(id);
    if (!element) return;
    const value = element.innerHTML?.trim();
    if (!value || /carregando/i.test(element.textContent || '')) return;
    html[id] = value;
  });

  const hidden: Record<string, boolean> = {};
  ATTENTION_IDS.forEach(id => {
    const element = document.getElementById(id);
    if (element) hidden[id] = Boolean(element.hidden);
  });

  writeUiCache(userId, SCOPE, {
    dayKey: localDateKey(),
    text,
    html,
    hidden,
    attentionCardHidden: Boolean(document.querySelector<HTMLElement>('.attention-card')?.hidden)
  });
}

function isUsefulValue(value: unknown): boolean {
  const text = String(value ?? '').trim();
  if (!text || text === '—') return false;
  if (/^carregando/i.test(text)) return false;
  return true;
}

function isDaySpecific(id: string): boolean {
  return new Set([
    'summary-today-appointments',
    'dashboard-agenda-tab-count',
    'today-count',
    'today-date',
    'overview-next-appointment',
    'overview-next-appointment-detail'
  ]).has(id);
}

function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
