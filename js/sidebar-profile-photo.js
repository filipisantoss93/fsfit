import { supabase } from './supabase.js';

function initials(name = '') {
  return String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'PF';
}

function renderFallback(avatar, name) {
  avatar.replaceChildren();
  avatar.textContent = initials(name);
  avatar.classList.remove('has-image');
  avatar.style.removeProperty('background-image');
}

function renderPhoto(avatar, url, name) {
  const img = document.createElement('img');
  img.src = url;
  img.alt = `Foto de ${name || 'Personal'}`;
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('load', () => avatar.classList.add('has-image'), { once: true });
  img.addEventListener('error', () => renderFallback(avatar, name), { once: true });
  avatar.replaceChildren(img);
  avatar.style.removeProperty('background-image');
}

async function initializeSidebarProfilePhoto() {
  const avatar = document.querySelector('#sidebar-profile-avatar');
  const nameElement = document.querySelector('#sidebar-profile-name');
  if (!avatar) return;

  const name = nameElement?.textContent?.trim() || 'Personal';
  renderFallback(avatar, name);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) return;

    const { data, error } = await supabase
      .from('perfis_publicos')
      .select('foto_url,nome_publico')
      .eq('personal_id', session.user.id)
      .maybeSingle();

    if (error) throw error;
    const resolvedName = data?.nome_publico?.trim() || name;
    if (nameElement && data?.nome_publico?.trim()) nameElement.textContent = data.nome_publico.trim();
    if (data?.foto_url?.trim()) renderPhoto(avatar, data.foto_url.trim(), resolvedName);
    else renderFallback(avatar, resolvedName);
  } catch (error) {
    console.warn('Não foi possível carregar a foto do personal na sidebar:', error);
    renderFallback(avatar, name);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSidebarProfilePhoto, { once: true });
} else {
  initializeSidebarProfilePhoto();
}
