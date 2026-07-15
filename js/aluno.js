import { supabase } from './supabase.js';

const loading = document.querySelector('#loading-state');
const errorState = document.querySelector('#error-state');
const content = document.querySelector('#student-content');

function renderText(element, value, fallback) {
  element.textContent = value?.trim() || fallback;
}

async function load() {
  const sessionToken = localStorage.getItem('fsfit_aluno_token');
  if (!sessionToken) {
    window.location.replace('acesso-aluno.html');
    return;
  }

  const { data: accessToken, error: sessionError } = await supabase.rpc('get_aluno_portal_token', { p_session_token: sessionToken });
  if (sessionError || !accessToken) {
    localStorage.removeItem('fsfit_aluno_token');
    localStorage.removeItem('fsfit_aluno_token_expira_em');
    throw new Error('Sua sessão expirou. Entre novamente com WhatsApp e PIN.');
  }

  const { data, error } = await supabase.rpc('get_aluno_portal', { p_access_token: accessToken });
  if (error) throw new Error('Não foi possível acessar este plano.');

  const portal = Array.isArray(data) ? data[0] : data;
  if (!portal) throw new Error('Plano não encontrado ou indisponível.');

  document.querySelector('#student-name').textContent = portal.aluno_nome;
  document.querySelector('#trainer-name').textContent = portal.personal_nome || 'Seu personal trainer';
  renderText(document.querySelector('#workout-content'), portal.treino, 'Nenhum treino publicado ainda.');
  renderText(document.querySelector('#diet-content'), portal.dieta, 'Nenhuma orientação publicada ainda.');

  if (portal.plano_atualizado_em) {
    document.querySelector('#updated-at').textContent = `Atualizado em ${new Date(portal.plano_atualizado_em).toLocaleString('pt-BR')}`;
  }

  const phone = String(portal.personal_whatsapp || '').replace(/\D/g, '');
  if (phone.length >= 10) {
    const message = encodeURIComponent(`Olá, ${portal.personal_nome || 'Personal'}! Sou ${portal.aluno_nome} e tenho uma dúvida sobre meu plano.`);
    const button = document.querySelector('#whatsapp-button');
    button.href = `https://wa.me/${phone}?text=${message}`;
    button.classList.remove('hidden');
  }

  loading.classList.add('hidden');
  content.classList.remove('hidden');
}

load().catch(error => {
  loading.classList.add('hidden');
  errorState.innerHTML = `${error.message}<div class="actions" style="justify-content:center;margin-top:16px"><a class="btn btn-primary" href="acesso-aluno.html">Entrar novamente</a></div>`;
  errorState.classList.remove('hidden');
});