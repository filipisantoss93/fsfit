import { supabase } from './supabase.js';

const loading = document.querySelector('#loading-state');
const errorState = document.querySelector('#error-state');
const content = document.querySelector('#student-content');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function renderText(element, value, fallback) {
  element.textContent = value?.trim() || fallback;
}

async function load() {
  const token = new URLSearchParams(location.search).get('id');
  if (!token || !uuid.test(token)) throw new Error('Link de acesso inválido.');

  const { data, error } = await supabase.rpc('get_aluno_portal', { p_access_token: token });
  if (error) {
    console.error(error);
    throw new Error('Não foi possível acessar este plano.');
  }

  const portal = Array.isArray(data) ? data[0] : data;
  if (!portal) throw new Error('Aluno não encontrado ou link indisponível.');

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
  errorState.textContent = error.message;
  errorState.classList.remove('hidden');
});
