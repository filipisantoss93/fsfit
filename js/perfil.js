import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('perfil');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const form = document.querySelector('#profile-form');
const message = document.querySelector('#profile-message');

function digits(value = '') {
  return String(value).replace(/\D/g, '').slice(0, 11);
}

const { data, error } = await supabase
  .from('perfis')
  .select('nome,telefone,nome_empresa,plano,ativo')
  .eq('id', session.user.id)
  .single();

if (error) {
  console.error(error);
  showMessage(message, 'Não foi possível carregar seu perfil.', 'error');
} else {
  form.full_name.value = data.nome || session.user.user_metadata?.full_name || '';
  form.whatsapp.value = data.telefone || '';
  form.email.value = session.user.email || '';
}

form.whatsapp.addEventListener('input', () => {
  form.whatsapp.value = digits(form.whatsapp.value);
});

form.addEventListener('submit', async event => {
  event.preventDefault();

  const telefone = digits(form.whatsapp.value);
  const nome = form.full_name.value.trim();

  if (nome.length < 2) {
    return showMessage(message, 'Informe seu nome.', 'error');
  }

  if (telefone && telefone.length !== 11) {
    return showMessage(message, 'O WhatsApp deve conter DDD e número, totalizando 11 dígitos.', 'error');
  }

  const button = form.querySelector('[type="submit"]');
  button.disabled = true;

  try {
    const { error: updateError } = await supabase
      .from('perfis')
      .update({ nome, telefone: telefone || null })
      .eq('id', session.user.id);

    if (updateError) throw updateError;

    await supabase.auth.updateUser({ data: { full_name: nome, tipo: 'personal' } });
    showMessage(message, 'Perfil atualizado com sucesso.');
    await setGreeting(session);
  } catch (saveError) {
    console.error(saveError);
    showMessage(message, 'Não foi possível atualizar seu perfil.', 'error');
  } finally {
    button.disabled = false;
  }
});