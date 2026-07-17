import { supabase } from './supabase.js';

const message = document.querySelector('#access-message');
const loginForm = document.querySelector('#login-form');
const activationForm = document.querySelector('#activation-form');

function getStoredStudentToken() {
  const token = String(localStorage.getItem('fsfit_aluno_token') || '').trim();
  const expiresAt = String(localStorage.getItem('fsfit_aluno_token_expira_em') || '').trim();
  if (!token) return '';

  if (expiresAt) {
    const expires = new Date(expiresAt);
    if (!Number.isNaN(expires.getTime()) && expires <= new Date()) {
      localStorage.removeItem('fsfit_aluno_token');
      localStorage.removeItem('fsfit_aluno_token_expira_em');
      return '';
    }
  }

  return token;
}

async function redirectPersonalPreview() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;

  try {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    const isStudentRecord = referrer?.origin === location.origin && referrer.pathname.endsWith('/ficha-aluno.html');
    const alunoId = isStudentRecord ? referrer.searchParams.get('id') : null;
    if (!alunoId) return false;

    window.location.replace(`aluno-preview.html?id=${encodeURIComponent(alunoId)}`);
    return true;
  } catch {
    return false;
  }
}

if (!(await redirectPersonalPreview())) {
  if (getStoredStudentToken()) {
    window.location.replace('aluno.html');
  } else {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('u') || localStorage.getItem('fsfit_personal_slug');

    if (slug) {
      window.location.replace(`personal.html?u=${encodeURIComponent(slug)}`);
    } else {
      loginForm?.classList.add('hidden');
      activationForm?.classList.add('hidden');
      message.textContent = 'Para acessar sua área, abra o link público enviado pelo seu personal trainer e informe seu WhatsApp cadastrado.';
      message.className = 'message show success';
    }
  }
}