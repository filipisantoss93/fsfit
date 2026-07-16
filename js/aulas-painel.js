import { supabase } from './supabase.js';

const container = document.querySelector('#live-students-list');
if (!container) throw new Error('Área Em aula não encontrada');

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function elapsed(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

async function loadLiveStudents() {
  const { data, error } = await supabase.rpc('listar_sessoes_em_aula_personal');
  if (error) {
    console.error(error);
    container.innerHTML = '<p class="empty">Não foi possível carregar os alunos em aula.</p>';
    return;
  }
  const rows = data || [];
  const badge = document.querySelector('#live-students-count');
  if (badge) badge.textContent = String(rows.length);
  container.innerHTML = rows.length ? rows.map(row => {
    const total = Number(row.total_exercicios || 0);
    const done = Number(row.exercicios_concluidos || 0);
    const percent = total ? Math.round(done / total * 100) : 0;
    return `<article class="live-student-row">
      <div class="live-student-main"><span class="live-dot"></span><div><strong>${esc(row.aluno_nome)}</strong><small>${esc(row.treino_nome || 'Treino')} • ${elapsed(row.checkin_at)}</small></div></div>
      <div class="live-student-progress"><span>${done}/${total} concluídos</span><div class="live-progress"><span style="width:${percent}%"></span></div></div>
      <a class="btn btn-outline" href="ficha-aluno.html?id=${encodeURIComponent(row.aluno_id)}">Abrir ficha</a>
    </article>`;
  }).join('') : '<p class="empty">Nenhum aluno está em aula neste momento.</p>';
}

await loadLiveStudents();
setInterval(loadLiveStudents, 15000);
