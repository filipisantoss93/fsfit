import { supabase } from './supabase.js';

const TOKEN_KEY = 'fsfit_aluno_token';
const EXPIRES_KEY = 'fsfit_aluno_token_expira_em';
const PERSONAL_KEY = 'fsfit_personal_slug';

function clearStudentSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRES_KEY);
  localStorage.removeItem(PERSONAL_KEY);
  sessionStorage.removeItem('fsfit_aluno_treino_concluido_em');
}

async function logout(button) {
  const token = String(localStorage.getItem(TOKEN_KEY) || '').trim();
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Saindo...';

  try {
    if (token) {
      const { error } = await supabase.rpc('fsfit_encerrar_sessao_aluno', {
        p_session_token: token
      });
      if (error) throw error;
    }
  } catch (error) {
    console.warn('Não foi possível confirmar a revogação remota da sessão:', error);
  } finally {
    clearStudentSession();
    button.textContent = originalText;
    window.location.replace('acesso-aluno.html');
  }
}

function mountLogoutButton() {
  if (document.querySelector('#student-logout-button')) return;

  const settingsBody = document.querySelector('.student-settings-body');
  if (!settingsBody) return;

  const section = document.createElement('section');
  section.className = 'student-settings-group';
  section.innerHTML = `
    <h3>Acesso</h3>
    <p>Encerre o acesso neste aparelho. Para entrar novamente, use seu WhatsApp e PIN.</p>
    <div class="actions">
      <button id="student-logout-button" class="btn btn-neutral" type="button">Sair deste aparelho</button>
    </div>`;

  settingsBody.appendChild(section);
  section.querySelector('#student-logout-button')?.addEventListener('click', event => {
    const button = event.currentTarget;
    if (!confirm('Sair da sua área neste aparelho?')) return;
    logout(button);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountLogoutButton, { once: true });
} else {
  mountLogoutButton();
}
