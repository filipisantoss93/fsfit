import { supabase } from './supabase.js';
import { readUiCache, writeUiCache } from './ui-cache.js';

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

const { data: { session } } = await supabase.auth.getSession();
const userId = session?.user?.id;

if (userId) {
  hydrate();
  observeAndPersist();
}

function hydrate() {
  const cached = readUiCache(userId, SCOPE, { maxAgeMs: MAX_AGE_MS });
  const snapshot = cached?.value;
  if (!snapshot || typeof snapshot !== 'object') return;

  const sameDay = snapshot.dayKey === localDateKey();

  Object.entries(snapshot.text || {}).forEach(([id, value]) => {
    if (!sameDay && isDaySpecific(id)) return;
    const element = document.getElementById(id);
    if (element && isUsefulValue(value)) element.textContent = value;
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

  const attentionCard = document.querySelector('.attention-card');
  if (attentionCard && typeof snapshot.attentionCardHidden === 'boolean') {
    attentionCard.hidden = snapshot.attentionCardHidden;
  }

  document.documentElement.classList.add('fsfit-cache-hydrated');
}

function observeAndPersist() {
  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(persist, 180);
  };

  const targets = [
    ...TEXT_IDS.map(id => document.getElementById(id)),
    ...HTML_IDS.map(id => document.getElementById(id)),
    ...ATTENTION_IDS.map(id => document.getElementById(id)),
    document.querySelector('.attention-card')
  ].filter(Boolean);

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

function persist() {
  const text = {};
  TEXT_IDS.forEach(id => {
    const value = document.getElementById(id)?.textContent?.trim();
    if (isUsefulValue(value)) text[id] = value;
  });

  const html = {};
  HTML_IDS.forEach(id => {
    const element = document.getElementById(id);
    if (!element) return;
    const value = element.innerHTML?.trim();
    if (!value || /carregando/i.test(element.textContent || '')) return;
    html[id] = value;
  });

  const hidden = {};
  ATTENTION_IDS.forEach(id => {
    const element = document.getElementById(id);
    if (element) hidden[id] = element.hidden;
  });

  writeUiCache(userId, SCOPE, {
    dayKey: localDateKey(),
    text,
    html,
    hidden,
    attentionCardHidden: Boolean(document.querySelector('.attention-card')?.hidden)
  });
}

function isUsefulValue(value) {
  const text = String(value ?? '').trim();
  if (!text || text === '—') return false;
  if (/^carregando/i.test(text)) return false;
  return true;
}

function isDaySpecific(id) {
  return new Set([
    'summary-today-appointments',
    'dashboard-agenda-tab-count',
    'today-count',
    'today-date',
    'overview-next-appointment',
    'overview-next-appointment-detail'
  ]).has(id);
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
