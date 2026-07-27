import { supabase } from './supabase.js';

const TOKEN_KEY = 'fsfit_aluno_token';
const EXPIRES_KEY = 'fsfit_aluno_token_expira_em';
const PERSONAL_KEY = 'fsfit_personal_slug';
const LOADING_TIMEOUT_MS = 15000;

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

function mountLoadingWatchdog() {
  const loading = document.querySelector('#loading-state');
  const errorState = document.querySelector('#error-state');
  const content = document.querySelector('#student-content');
  if (!loading || !errorState || !content) return;

  window.setTimeout(() => {
    const stillLoading = !loading.classList.contains('hidden') && content.classList.contains('hidden');
    if (!stillLoading) return;

    console.error('Tempo limite excedido ao carregar o portal do aluno.');
    loading.classList.add('hidden');
    errorState.innerHTML = `
      <strong>Não foi possível carregar sua área.</strong>
      <p style="margin:10px 0 0">A conexão demorou mais que o esperado. Verifique a internet e tente novamente.</p>
      <div class="actions" style="justify-content:center;margin-top:16px">
        <button id="student-retry-load" class="btn btn-primary" type="button">Tentar novamente</button>
        <a class="btn btn-outline" href="acesso-aluno.html">Entrar novamente</a>
      </div>`;
    errorState.classList.remove('hidden');

    errorState.querySelector('#student-retry-load')?.addEventListener('click', () => {
      window.location.reload();
    });
  }, LOADING_TIMEOUT_MS);
}

function initializeStudentSessionControls() {
  mountLogoutButton();
  mountLoadingWatchdog();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeStudentSessionControls, { once: true });
} else {
  initializeStudentSessionControls();
}
