// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { supabase } from './supabase.js';
// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { requireSession } from './layout.js';
const session = await requireSession();
if (!session)
    throw new Error('Sessão inválida');
const dashboard = document.querySelector('#students-dashboard');
if (!dashboard)
    throw new Error('Dashboard de alunos não encontrado');
const totalNode = document.querySelector('#students-dashboard-total');
const liveNode = document.querySelector('#students-dashboard-live');
const activeNode = document.querySelector('#students-dashboard-active-workout');
const noWorkoutNode = document.querySelector('#students-dashboard-no-workout');
const newNode = document.querySelector('#students-dashboard-new');
const attentionList = document.querySelector('#students-dashboard-attention-list');
const attentionCount = document.querySelector('#students-dashboard-attention-count');
const donut = document.querySelector('#students-dashboard-donut');
const donutTotal = document.querySelector('#students-dashboard-donut-total');
const legendActive = document.querySelector('#students-dashboard-legend-active');
const legendLive = document.querySelector('#students-dashboard-legend-live');
const legendNoWorkout = document.querySelector('#students-dashboard-legend-no-workout');
const requiredNodes = [totalNode, liveNode, activeNode, noWorkoutNode, newNode, attentionList, attentionCount, donut, donutTotal, legendActive, legendLive, legendNoWorkout];
if (requiredNodes.some(node => !node))
    throw new Error('Elementos do dashboard de alunos incompletos');
let refreshTimer = null;
function esc(value = '') {
    const div = document.createElement('div');
    div.textContent = String(value ?? '');
    return div.innerHTML;
}
function initials(value = '') {
    const parts = String(value).trim().split(/\s+/).filter(Boolean);
    if (!parts.length)
        return 'A';
    return `${parts[0]?.[0] || ''}${parts.length > 1 ? parts.at(-1)?.[0] || '' : ''}`.toUpperCase();
}
function isNew(createdAt) {
    const time = new Date(createdAt || 0).getTime();
    return Number.isFinite(time) && time >= Date.now() - …979 tokens truncated…vel carregar o resumo dos alunos.</div>';
    }
}
await refresh();
setInterval(() => {
    if (!document.hidden)
        refresh();
}, 30000);
document.addEventListener('visibilitychange', () => {
    if (!document.hidden)
        refresh();
});
