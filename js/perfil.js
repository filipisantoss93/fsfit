import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('perfil');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const form = document.querySelector('#profile-form');
const message = document.querySelector('#profile-message');
const publicLinkBox = document.querySelector('#public-link-box');

function digits(value = '') {
  return String(value).replace(/\D/g, '').slice(0, 11);
}

function slugify(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function publicUrl(slug) {
  const url = new URL('personal.html', window.location.href);
  url.searchParams.set('u', slug);
  return url.toString();
}

function renderPublicLink(slug, published = true) {
  if (!slug) {
    publicLinkBox.className = 'message';
    publicLinkBox.textContent = '';
    return;
  }

  const url = publicUrl(slug);
  publicLinkBox.className = 'message show success';
  publicLinkBox.innerHTML = `${published ? 'Seu link público:' : 'Link configurado, mas a página está desativada:'}<br><a href="${url}" target="_blank" rel="noopener">${url}</a>`;
}

const [{ data: profile, error: profileError }, { data: publicProfile, error: publicError }] = await Promise.all([
  supabase.from('perfis').select('nome,telefone,nome_empresa,plano,ativo').eq('id', session.user.id).single(),
  supabase.from('perfis_publicos').select('slug,nome_publico,foto_url,local_trabalho,cidade,bio,especialidades,instagram,publicado').eq('personal_id', session.user.id).maybeSingle()
]);

if (profileError || publicError) {
  console.error(profileError || publicError);
  showMessage(message, 'Não foi possível carregar seu perfil.', 'error');
} else {
  form.full_name.value = profile.nome || session.user.user_metadata?.full_name || '';
  form.whatsapp.value = profile.telefone || '';
  form.email.value = session.user.email || '';

  const defaultSlug = slugify(publicProfile?.slug || profile.nome || session.user.user_metadata?.full_name || 'personal');
  form.slug.value = defaultSlug;
  form.foto_url.value = publicProfile?.foto_url || '';
  form.local_trabalho.value = publicProfile?.local_trabalho || '';
  form.cidade.value = publicProfile?.cidade || '';
  form.especialidades.value = publicProfile?.especialidades || '';
  form.bio.value = publicProfile?.bio || '';
  form.instagram.value = publicProfile?.instagram || '';
  form.publicado.checked = publicProfile?.publicado ?? true;
  renderPublicLink(defaultSlug, form.publicado.checked);
}

form.whatsapp.addEventListener('input', () => {
  form.whatsapp.value = digits(form.whatsapp.value);
});

form.slug.addEventListener('input', () => {
  const caretAtEnd = form.slug.selectionStart === form.slug.value.length;
  form.slug.value = slugify(form.slug.value);
  if (caretAtEnd) form.slug.setSelectionRange(form.slug.value.length, form.slug.value.length);
});

form.addEventListener('submit', async event => {
  event.preventDefault();

  const telefone = digits(form.whatsapp.value);
  const nome = form.full_name.value.trim();
  const slug = slugify(form.slug.value);

  if (nome.length < 2) return showMessage(message, 'Informe seu nome.', 'error');
  if (telefone && telefone.length !== 11) return showMessage(message, 'O WhatsApp deve conter DDD e número, totalizando 11 dígitos.', 'error');
  if (slug.length < 3) return showMessage(message, 'Defina um endereço público com pelo menos 3 caracteres.', 'error');

  const button = form.querySelector('[type="submit"]');
  button.disabled = true;

  try {
    const { error: updateError } = await supabase
      .from('perfis')
      .update({ nome, telefone: telefone || null })
      .eq('id', session.user.id);
    if (updateError) throw updateError;

    const publicPayload = {
      personal_id: session.user.id,
      slug,
      nome_publico: nome,
      foto_url: form.foto_url.value.trim() || null,
      local_trabalho: form.local_trabalho.value.trim() || null,
      cidade: form.cidade.value.trim() || null,
      especialidades: form.especialidades.value.trim() || null,
      bio: form.bio.value.trim() || null,
      instagram: form.instagram.value.trim() || null,
      publicado: form.publicado.checked,
      updated_at: new Date().toISOString()
    };

    const { error: publicSaveError } = await supabase
      .from('perfis_publicos')
      .upsert(publicPayload, { onConflict: 'personal_id' });
    if (publicSaveError) {
      if (publicSaveError.code === '23505') throw new Error('Esse endereço público já está sendo usado por outro personal. Escolha outro.');
      throw publicSaveError;
    }

    await supabase.auth.updateUser({ data: { full_name: nome, tipo: 'personal' } });
    showMessage(message, 'Perfil e página pública atualizados com sucesso.');
    renderPublicLink(slug, form.publicado.checked);
    await setGreeting(session);
  } catch (saveError) {
    console.error(saveError);
    showMessage(message, saveError.message || 'Não foi possível atualizar seu perfil.', 'error');
  } finally {
    button.disabled = false;
  }
});