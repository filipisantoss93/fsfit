// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { supabase } from './supabase.js';

const silhouette = '<svg class="profile-avatar-silhouette" style="display:block;width:58%;height:58%;fill:currentColor;color:var(--muted);pointer-events:none" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0v1h-15z"/></svg>';

function renderFallback(avatar: HTMLElement) {
  avatar.replaceChildren();
  avatar.innerHTML = silhouette;
  avatar.classList.remove('has-image');
  avatar.style.removeProperty('background-image');
}

function renderPhoto(avatar: HTMLElement, url: string, name: string) {
  const img = document.createElement('img');
  img.alt = `Foto de ${name || 'Personal'}`;
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('load', () => avatar.classList.add('has-image'), { once: true });
  img.addEventListener('error', () => renderFallback(avatar), { once: true });
  avatar.replaceChildren(img);
  avatar.style.removeProperty('background-image');
  img.src = url;
}

async function initializeSidebarProfilePhoto() {
  const avatars = Array.from(document.querySelectorAll<HTMLElement>('#sidebar-profile-avatar, #fsfit-header-avatar'));
  const nameElement = document.querySelector<HTMLElement>('#sidebar-profile-name');
  if (!avatars.length) return;

  const name = nameElement?.textContent?.trim() || 'Personal';
  avatars.forEach(avatar => renderFallback(avatar));

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
    if (data?.foto_url?.trim()) avatars.forEach(avatar => renderPhoto(avatar, data.foto_url.trim(), resolvedName));
    else avatars.forEach(avatar => renderFallback(avatar));
  } catch (error) {
    console.warn('Não foi possível carregar a foto do personal na sidebar:', error);
    avatars.forEach(avatar => renderFallback(avatar));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSidebarProfilePhoto, { once: true });
} else {
  initializeSidebarProfilePhoto();
}
