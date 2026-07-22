import { supabase } from './supabase.js';
import { requireSession, showMessage } from './layout-core.js';

const alunoId = new URLSearchParams(location.search).get('id');
const overviewPanel = document.querySelector('[data-record-panel="overview"]');
const message = document.querySelector('#record-message');

function compactMobileTabs() {
  if (!window.matchMedia('(max-width: 700px)').matches) return;
  const labels = {
    overview: 'Geral',
    planning: 'Plano',
    evolution: 'Evolução',
    history: 'Histórico',
    access: 'Acesso'
  };
  document.querySelectorAll('[data-record-tab]').forEach(tab => {
    const label = labels[tab.dataset.recordTab];
    if (label) tab.textContent = label;
  });
  document.querySelector('.record-tabs')?.classList.add('record-tabs-compact');
}

function setupStickySafeArea() {
  const tabs = document.querySelector('.record-tabs');
  if (!tabs || document.querySelector('.record-tabs-safe-cover')) return;

  const cover = document.createElement('div');
  cover.className = 'record-tabs-safe-cover';
  cover.setAttribute('aria-hidden', 'true');
  document.body.appendChild(cover);

  let frame = 0;
  const sync = () => {
    frame = 0;
    if (!window.matchMedia('(max-width: 700px)').matches) {
      cover.classList.remove('is-visible');
      return;
    }

    const stickyTop = Number.parseFloat(getComputedStyle(tabs).top) || 0;
    const stuck = window.scrollY > 0 && tabs.getBoundingClientRect().top <= stickyTop + 1;
    cover.classList.toggle('is-visible', stuck);
  };

  const requestSync = () => {
    if (frame) return;
    frame = requestAnimationFrame(sync);
  };

  window.addEventListener('scroll', requestSync, { passive: true });
  window.addEventListener('resize', requestSync, { passive: true });
  window.addEventListener('orientationchange', requestSync, { passive: true });
  requestSync();
}

compactMobileTabs();
setupStickySafeArea();

if (alunoId && overviewPanel && !document.querySelector('#student-activation-code-card')) {
  const session = await requireSession();
  if (session) {
    let accessState = null;
    try {
      const { data, error } = await supabase
        .from('alunos')
        .select('primeiro_acesso_concluido,pin_hash,codigo_ativacao_expira_em')
        .eq('id', alunoId)
        .eq('personal_id', session.user.id)
        .maybeSingle();
      if (error) throw error;
      accessState = data;
    } catch (error) {
      console.warn('Não foi possível consultar o estado do primeiro acesso do aluno:', error);
    }

    const firstAccessDone = Boolean(accessState?.primeiro_acesso_concluido && accessState?.pin_hash);
    if (!firstAccessDone) {
      const card = document.createElement('article');
      card.id = 'student-activation-code-card';
      card.className = 'card student-activation-overview-card';

      const existingExpiry = accessState?.codigo_ativacao_expira_em ? new Date(accessState.codigo_ativacao_expira_em) : null;
      const existingCodeIsValid = existingExpiry && !Number.isNaN(existingExpiry.getTime()) && existingExpiry > new Date();

      card.innerHTML = `
        <div class="student-activation-heading">
          <div>
            <small>ACESSO DO ALUNO</small>
            <h2>Primeiro acesso pendente</h2>
          </div>
          <span class="student-activation-status">PENDENTE</span>
        </div>
        <p class="student-activation-intro">Gere o código de 6 números que o aluno usará apenas no primeiro acesso para criar o PIN pessoal.</p>
        ${existingCodeIsValid ? `<p class="student-activation-existing">Já existe um código válido até ${existingExpiry.toLocaleString('pt-BR')}. Gere outro somente se precisar substituir o anterior.</p>` : ''}
        <div id="student-activation-code-result" class="student-activation-result hidden">
          <small>CÓDIGO DE ATIVAÇÃO</small>
          <strong id="student-activation-code-value"></strong>
          <span id="student-activation-code-expiry"></span>
        </div>
        <div class="student-activation-actions">
          <button id="generate-student-activation-code" class="btn btn-primary" type="button">${existingCodeIsValid ? 'Gerar novo código' : 'Gerar código de ativação'}</button>
          <button id="copy-student-activation-code" class="btn btn-outline hidden" type="button">Copiar código</button>
        </div>`;

      overviewPanel.prepend(card);

      const generateButton = card.querySelector('#generate-student-activation-code');
      const copyButton = card.querySelector('#copy-student-activation-code');
      const result = card.querySelector('#student-activation-code-result');
      const valueHost = card.querySelector('#student-activation-code-value');
      const expiryHost = card.querySelector('#student-activation-code-expiry');
      let currentCode = '';

      async function invokeGenerateCode() {
        const { data, error } = await supabase.functions.invoke('personal-aluno-pin', {
          body: { action: 'generate_activation_code', aluno_id: alunoId }
        });
        if (error) {
          let detail = error.message;
          try {
            const payload = await error.context?.json?.();
            detail = payload?.error || detail;
          } catch (_) {}
          throw new Error(detail || 'Não foi possível gerar o código de ativação.');
        }
        if (data?.error) throw new Error(data.error);
        return data;
      }

      generateButton?.addEventListener('click', async () => {
        generateButton.disabled = true;
        const originalText = generateButton.textContent;
        generateButton.textContent = 'Gerando...';
        try {
          const data = await invokeGenerateCode();
          currentCode = String(data.activation_code || '');
          if (!/^\d{6}$/.test(currentCode)) throw new Error('Código de ativação inválido retornado pelo servidor.');
          valueHost.textContent = currentCode;
          expiryHost.textContent = data.expires_at
            ? `Válido até ${new Date(data.expires_at).toLocaleString('pt-BR')}`
            : 'Código temporário';
          result.classList.remove('hidden');
          copyButton.classList.remove('hidden');
          generateButton.textContent = 'Gerar novo código';
          showMessage(message, 'Código gerado. Envie os 6 números ao aluno por um canal de confiança.');
        } catch (error) {
          console.error(error);
          generateButton.textContent = originalText;
          showMessage(message, error.message || 'Não foi possível gerar o código de ativação.', 'error');
        } finally {
          generateButton.disabled = false;
        }
      });

      copyButton?.addEventListener('click', async () => {
        if (!currentCode) return;
        try {
          await navigator.clipboard.writeText(currentCode);
          showMessage(message, 'Código de ativação copiado.');
        } catch {
          showMessage(message, `Código de ativação: ${currentCode}`);
        }
      });
    }
  }
}
