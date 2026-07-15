import { supabase } from './supabase.js';

export async function requireSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    window.location.replace('index.html?login=1');
    return null;
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
  const { data } = await supabase.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle();
  const name = data?.full_name?.trim() || session.user.email?.split('@')[0] || 'Personal';
  target.textContent = `Olá, ${name}`;
}

export function showMessage(element, text, type = 'success') {
  if (!element) return;
  element.textContent = text;
  element.className = `message show ${type}`;
}
