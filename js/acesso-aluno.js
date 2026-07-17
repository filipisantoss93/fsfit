import { supabase } from './supabase.js';

const message = document.querySelector('#access-message');
const resolverForm = document.querySelector('#student-resolver-form');

function digits(value = '', max = 11) {
  return String(value).replace(/\D/g, '').slice(0, max);
}

function show(text, type = 'error') {
  if (!message) return;
  message.textContent = text;
  message.className = `message show ${type}`;
}

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

async function init() {
  if (await redirectPersonalPreview()) return;

  if (getStoredStudentToken()) {
    window.location.replace('aluno.html');
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const slug = params.get('u') || localStorage.getItem('fsfit_personal_slug');
  if (slug) {
    window.location.replace(`personal.html?u=${encodeURIComponent(slug)}`);
    return;
  }

  resolverForm?.telefone?.addEventListener('input', () => {
    resolverForm.telefone.value = digits(resolverForm.telefone.value);
  });

  resolverForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const telefone = digits(resolverForm.telefone.value);
    if (telefone.length !== 11) return show('Informe seu WhatsApp com DDD e número, totalizando 11 dígitos.');

    const button = resolverForm.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Localizando...';

    try {
      const { data: personalSlug, error } = await supabase.rpc('fsfit_resolver_personal_aluno', {
        p_telefone: telefone
      });
      if (error) throw error;
      if (!personalSlug) throw new Error('Não encontramos um aluno ativo com este WhatsApp. Confira o número ou fale com seu personal.');

      sessionStorage.setItem('fsfit_student_phone_prefill', telefone);
      localStorage.setItem('fsfit_personal_slug', personalSlug);
      window.location.replace(`personal.html?u=${encodeURIComponent(personalSlug)}`);
    } catch (error) {
      console.error(error);
      show(error.message || 'Não foi possível localizar seu acesso agora.');
      button.disabled = false;
      button.textContent = 'Continuar para minha área';
    }
  });
}

init();
