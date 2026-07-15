import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting } from './layout.js';

renderHeader('painel');
const session = await requireSession();

if (session) {
  await setGreeting(session);

  const access = session.fsfitAccess;
  const freeMode = !access?.acesso_premium;

  if (freeMode) {
    const notice = document.querySelector('#access-notice');
    if (notice) {
      notice.style.display = 'block';
      notice.className = 'message show error';
      notice.textContent = 'Seu período gratuito de 7 dias terminou e sua conta voltou para o plano Free. As áreas de gestão de alunos, exercícios e agenda ficam bloqueadas até a ativação de um plano pago.';
    }

    const newStudentButton = document.querySelector('#new-student-button');
    const viewAllStudents = document.querySelector('#view-all-students');

    [newStudentButton, viewAllStudents].forEach(link => {
      if (!link) return;
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
      link.style.opacity = '.5';
      link.style.pointerEvents = 'none';
    });
  }

  const { data: alunos, error } = await supabase.from('alunos').select('id,nome,created_at').order('created_at', { ascending: false });
  if (!error) {
    document.querySelector('#total-alunos').textContent = alunos?.length || 0;
    document.querySelector('#novos-alunos').textContent = (alunos || []).filter(a => Date.now() - new Date(a.created_at).getTime() <= 30 * 86400000).length;
    document.querySelector('#ultimo-aluno').textContent = alunos?.[0]?.nome || 'Nenhum';
    const list = document.querySelector('#recent-list');
    list.innerHTML = alunos?.length
      ? alunos.slice(0, 5).map(a => `<tr><td>${escapeHtml(a.nome)}</td><td>${new Date(a.created_at).toLocaleDateString('pt-BR')}</td><td>${freeMode ? '<span style="color:var(--muted);font-weight:700">Bloqueado</span>' : `<a class="btn btn-outline" href="alunos.html?editar=${a.id}">Abrir</a>`}</td></tr>`).join('')
      : '<tr><td colspan="3" class="empty">Nenhum aluno cadastrado.</td></tr>';
  }
}

function escapeHtml(value = '') {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}
