import { supabase } from './supabase.js';
import { renderHeader, requireSession, setGreeting, showMessage } from './layout.js';

renderHeader('perfil');
const session = await requireSession();
if (!session) throw new Error('Sessão inválida');
await setGreeting(session);

const form = document.querySelector('#profile-form');
const message = document.querySelector('#profile-message');

const { data, error } = await supabase
  .from('perfis')
  .select('nome,telefone')
  .eq('id', session.user.id)
  .maybeSingle();

if (error) {
  showMessage(message, error.message, 'error');
} else {
  form.full_name.value = data?.nome || session.user.user_metadata?.full_name || '';
  form.whatsapp.value = data?.telefone || '';
  form.email.value = session.user.email || '';
}

form.whatsapp.addEventListener('input', () => {
  form.whatsapp.value = form.whatsapp.value.replace(/\D/g, '').slice(0, 15);
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const payload = {
    id: session.user.id,
    nome: form.full_name.value.trim(),
    telefone: form.whatsapp.value.replace(/\D/g, ''),
    tipo: 'personal'
  };

  if (payload.nome.length < 2) {
    return showMessage(message, 'Informe seu nome.', 'error');
  }

  const { error } = await supabase.from('perfis').upsert(payload, { onConflict: 'id' });
  if (error) showMessage(message, error.message, 'error');
  else {
    showMessage(message, 'Perfil atualizado com sucesso.');
    await setGreeting(session);
  }
});