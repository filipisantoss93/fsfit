import { supabase } from './supabase.js';
import { showMessage } from './layout.js';

const alunoId = new URLSearchParams(location.search).get('id');
const planningActions = document.querySelector('.planning-actions');
const message = document.querySelector('#record-message');

if (alunoId && planningActions) {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id || null;
  const dayNames = { 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb', 7: 'Dom' };
  let templates = [];
  let items = [];

  const button = document.createElement('button');
  button.id = 'apply-saved-workout';
  button.className = 'btn btn-secondary';
  button.type = 'button';
  button.textContent = 'Aplicar treino salvo';
  planningActions.insertBefore(button, planningActions.firstChild?.nextSibling || null);

  const style = document.createElement('style');
  style.textContent = `
    .apply-workout-modal{position:fixed;inset:0;z-index:23000;display:none;align-items:flex-end;justify-content:center;padding:14px;background:rgba(4,7,10,.8);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
    .apply-workout-modal.open{display:flex}.apply-workout-dialog{width:min(760px,100%);max-height:88dvh;overflow:auto;padding:20px;border:1px solid var(--border);border-radius:22px;background:#171b21;box-shadow:0 28px 80px rgba(0,0,0,.58)}
    .apply-workout-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}.apply-workout-head h2{margin:0}.apply-workout-close{width:40px;height:40px;border:1px solid var(--border);border-radius:50%;background:var(--surface-light);color:var(--text);font-size:1.4rem}
    .apply-workout-note{margin:0 0 16px;color:var(--muted);font-size:.85rem;line-height:1.5}.apply-workout-list{display:grid;gap:9px}.apply-workout-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--surface-light)}
    .apply-workout-card h3{margin:0 0 5px;font-size:1rem}.apply-workout-card p{margin:0;color:var(--muted);font-size:.8rem;line-height:1.4}.apply-workout-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.apply-workout-meta span{padding:4px 7px;border:1px solid var(--border);border-radius:999px;color:var(--muted);font-size:.66rem;font-weight:800}.apply-workout-card .btn{min-height:40px;padding:0 12px;font-size:.78rem}
    @media(max-width:640px){.apply-workout-modal{padding:8px}.apply-workout-dialog{padding:16px}.apply-workout-card{grid-template-columns:1fr}.apply-workout-card .btn{width:100%}}
  `;
  document.head.appendChild(style);

  const modal = document.createElement('div');
  modal.className = 'apply-workout-modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <section class="apply-workout-dialog" role="dialog" aria-modal="true" aria-labelledby="apply-workout-title">
      <div class="apply-workout-head"><div><small>PLANEJAMENTO</small><h2 id="apply-workout-title">Aplicar treino salvo</h2></div><button class="apply-workout-close" type="button" data-close-apply-workout>×</button></div>
      <p class="apply-workout-note">Escolha um modelo da sua biblioteca. O FS Fit criará uma cópia independente para este aluno e a definirá como treino ativo. O treino ativo atual ficará inativo.</p>
      <div id="apply-workout-list" class="apply-workout-list"><p class="empty">Carregando treinos salvos...</p></div>
    </section>`;
  document.body.appendChild(modal);
  const list = modal.querySelector('#apply-workout-list');

  function esc(value = '') { const div = document.createElement('div'); div.textContent = value ?? ''; return div.innerHTML; }

  async function loadTemplates() {
    const { data, error } = await supabase.from('treinos').select('id,nome,descricao,dias_semana,updated_at').eq('personal_id', userId).eq('modelo', true).is('aluno_id', null).order('updated_at', { ascending: false });
    if (error) throw error;
    templates = data || [];
    const ids = templates.map(item => item.id);
    if (ids.length) {
      const { data: itemRows, error: itemError } = await supabase.from('treino_exercicios').select('treino_id,id').in('treino_id', ids);
      if (itemError) throw itemError;
      items = itemRows || [];
    } else items = [];
    render();
  }

  function render() {
    if (!templates.length) {
      list.innerHTML = '<div class="empty">Nenhum treino salvo encontrado. Crie modelos na Biblioteca de exercícios.</div>';
      return;
    }
    list.innerHTML = templates.map(template => {
      const count = items.filter(item => item.treino_id === template.id).length;
      const days = (template.dias_semana || []).map(Number).map(day => dayNames[day]).filter(Boolean).join(', ');
      return `<article class="apply-workout-card"><div><h3>${esc(template.nome)}</h3><p>${esc(template.descricao || 'Sem descrição')}</p><div class="apply-workout-meta"><span>${count} ${count === 1 ? 'exercício' : 'exercícios'}</span><span>${esc(days || 'Dias não definidos')}</span></div></div><button class="btn btn-primary" type="button" data-apply-workout-template="${template.id}">Aplicar e ativar</button></article>`;
    }).join('');
  }

  function openModal() {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    loadTemplates().catch(error => {
      console.error(error);
      list.innerHTML = '<p class="empty">Não foi possível carregar os treinos salvos.</p>';
    });
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  button.addEventListener('click', openModal);
  modal.addEventListener('click', event => { if (event.target === modal || event.target.closest('[data-close-apply-workout]')) closeModal(); });

  document.addEventListener('click', async event => {
    const applyButton = event.target.closest('[data-apply-workout-template]');
    if (!applyButton) return;
    const template = templates.find(item => item.id === applyButton.dataset.applyWorkoutTemplate);
    if (!template) return;
    if (!confirm(`Aplicar “${template.nome}” a este aluno e defini-lo como treino ativo?`)) return;
    applyButton.disabled = true;
    applyButton.textContent = 'Aplicando...';
    const { error } = await supabase.rpc('fsfit_aplicar_modelo_treino', {
      p_modelo_id: template.id,
      p_aluno_id: alunoId,
      p_ativar: true
    });
    if (error) {
      applyButton.disabled = false;
      applyButton.textContent = 'Aplicar e ativar';
      return showMessage(message, error.message || 'Não foi possível aplicar o treino salvo.', 'error');
    }
    closeModal();
    showMessage(message, `Treino “${template.nome}” aplicado e definido como ativo.`);
  });
}
