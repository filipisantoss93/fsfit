import { supabase } from './supabase.js';
import { requireSession } from './layout.js';

const alunoId = new URLSearchParams(location.search).get('id');
const list = document.querySelector('#workout-history-list');
const summary = document.querySelector('#workout-history-summary');
const deleteStudentButton = document.querySelector('#delete-student');

if (!alunoId || !list) {
  // A página pode ser carregada sem a aba de histórico em versões antigas.
} else {
  const session = await requireSession();

  function esc(value = '') {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
  }

  function formatDateTime(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function formatDuration(start, end) {
    if (!start || !end) return '—';
    const minutes = Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return hours ? `${hours}h ${rest}min` : `${rest} min`;
  }

  async function deleteStudent() {
    if (!deleteStudentButton) return;

    const studentName = document.querySelector('#student-name')?.textContent?.trim() || 'este aluno';
    const confirmed = window.confirm(
      `Excluir ${studentName}?\n\nTodos os dados vinculados ao aluno serão removidos permanentemente. Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;

    const originalText = deleteStudentButton.textContent;
    deleteStudentButton.disabled = true;
    deleteStudentButton.textContent = 'Excluindo...';

    try {
      const { data: mediaRows, error: mediaError } = await supabase
        .from('aluno_midias')
        .select('storage_path')
        .eq('aluno_id', alunoId)
        .eq('personal_id', session.user.id);

      if (mediaError) console.warn('Não foi possível listar as mídias antes da exclusão:', mediaError);

      const { data: deleted, error } = await supabase
        .from('alunos')
        .delete()
        .eq('id', alunoId)
        .eq('personal_id', session.user.id)
        .select('id');

      if (error) throw error;
      if (!deleted?.length) throw new Error('Aluno não encontrado ou sem permissão para exclusão.');

      const storagePaths = (mediaRows || []).map(item => item.storage_path).filter(Boolean);
      if (storagePaths.length) {
        const { error: storageError } = await supabase.storage.from('aluno-midias').remove(storagePaths);
        if (storageError) console.warn('Aluno excluído, mas algumas mídias não puderam ser removidas do armazenamento:', storageError);
      }

      window.location.replace('alunos.html');
    } catch (error) {
      console.error('Erro ao excluir aluno:', error);
      alert(error.message || 'Não foi possível excluir o aluno.');
      deleteStudentButton.disabled = false;
      deleteStudentButton.textContent = originalText;
    }
  }

  async function loadWorkoutHistory() {
    const { data, error } = await supabase
      .from('sessoes_treino')
      .select('id,treino_id,checkin_at,iniciado_at,finalizada_at,treinos(nome),sessao_exercicios(id,concluido)')
      .eq('aluno_id', alunoId)
      .eq('personal_id', session.user.id)
      .eq('status', 'finalizada')
      .order('finalizada_at', { ascending: false });

    if (error) {
      console.error('Erro ao carregar histórico de treinos:', error);
      list.innerHTML = '<p class="empty">Não foi possível carregar o histórico de treinos.</p>';
      return;
    }

    const items = data || [];
    if (summary) summary.textContent = `${items.length} ${items.length === 1 ? 'treino finalizado' : 'treinos finalizados'}`;

    if (!items.length) {
      list.innerHTML = '<p class="empty">Nenhum treino finalizado registrado para este aluno.</p>';
      return;
    }

    list.innerHTML = items.map(item => {
      const exercises = item.sessao_exercicios || [];
      const total = exercises.length;
      const completed = exercises.filter(exercise => exercise.concluido).length;
      const percent = total ? Math.round((completed / total) * 100) : 0;
      const workoutName = item.treinos?.nome || 'Plano de treino';

      return `<article class="workout-history-item">
        <div class="workout-history-head">
          <div>
            <small>${esc(formatDateTime(item.finalizada_at || item.iniciado_at || item.checkin_at))}</small>
            <h3>${esc(workoutName)}</h3>
          </div>
          <span class="workout-history-status">FINALIZADO</span>
        </div>
        <div class="workout-history-metrics">
          <div><span>Duração</span><strong>${esc(formatDuration(item.iniciado_at, item.finalizada_at))}</strong></div>
          <div><span>Exercícios</span><strong>${completed}/${total}</strong></div>
          <div><span>Conclusão</span><strong>${percent}%</strong></div>
        </div>
        <div class="workout-history-progress" aria-label="${percent}% concluído"><span style="width:${percent}%"></span></div>
        <div class="workout-history-times">
          <span>Início: ${esc(formatDateTime(item.iniciado_at || item.checkin_at))}</span>
          <span>Fim: ${esc(formatDateTime(item.finalizada_at))}</span>
        </div>
      </article>`;
    }).join('');
  }

  deleteStudentButton?.addEventListener('click', deleteStudent);
  loadWorkoutHistory();
}
