import { supabase } from './supabase.js';

export async function ensurePersonalProfile(session) {
  if (!session?.user?.id) throw new Error('Sessão inválida.');

  const { data: existing, error: selectError } = await supabase
    .from('perfis')
    .select('id,nome,tipo,ativo')
    .eq('id', session.user.id)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing;

  const fallbackName = session.user.user_metadata?.full_name?.trim()
    || session.user.email?.split('@')[0]
    || 'Personal';

  const { data, error } = await supabase
    .from('perfis')
    .insert({
      id: session.user.id,
      tipo: 'personal',
      nome: fallbackName,
      plano: 'gratis',
      ativo: true
    })
    .select('id,nome,tipo,ativo')
    .single();

  if (error) throw error;
  return data;
}

export async function requireSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    window.location.replace('index.html?login=1');
    return null;
  }

  try {
    await ensurePersonalProfile(session);
  } catch (profileError) {
    console.error('Não foi possível preparar o perfil do personal:', profileError);
    throw new Error('Não foi possível preparar seu perfil. Atualize a página e tente novamente.');
  }

  return session;
}

export function renderHeader(active = '') {
  const host = document.querySelector('#header-container');
  if (!host) return;
  host.innerHTML = `
    <header class="main-header">
      <nav class="nav-container">
        <a class="logo-nav" href="painel.html"><strong>FS</strong><span>Fit</span></a>
        <span id="user-greeting" class="user-greeting"></span>
        <ul id="nav-menu" class="nav-menu">
          <li><a data-page="painel" href="painel.html">Início</a></li>
          <li><a data-page="alunos" href="alunos.html">Alunos</a></li>
          <li><a data-page="exercicios" href="biblioteca-exercicios.html">Exercícios</a></li>
          <li><a data-page="agenda" href="agenda.html">Agenda</a></li>
          <li><a data-page="perfil" href="perfil.html">Meu perfil</a></li>
          <li><button id="logout-button" class="logout" type="button">SAIR</button></li>
        </ul>
        <button id="menu-button" class="menu-mobile-btn" type="button" aria-label="Abrir menu">☰</button>
      </nav>
    </header>`;
  host.querySelector(`[data-page="${active}"]`)?.classList.add('active');
  host.querySelector('#menu-button')?.addEventListener('click', () => host.querySelector('#nav-menu')?.classList.toggle('active'));
  host.querySelector('#logout-button')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    window.location.replace('index.html');
  });
}

export async function setGreeting(session) {
  const target = document.querySelector('#user-greeting');
  if (!target || !session) return;
  const { data } = await supabase.from('perfis').select('nome').eq('id', session.user.id).maybeSingle();
  const name = data?.nome?.trim() || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'Personal';
  target.textContent = `Olá, ${name}`;
}

export function showMessage(element, text, type = 'success') {
  if (!element) return;
  element.textContent = text;
  element.className = `message show ${type}`;
}
