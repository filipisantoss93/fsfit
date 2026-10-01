// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { supabase } from './supabase.js';
// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { requireSession, showMessage } from './layout-core.js';

interface StudentAccessState {
  primeiro_acesso_concluido?: boolean | null;
  pin_hash?: string | null;
  codigo_ativacao_expira_em?: string | null;
}

interface ActivationCodeResult {
  activation_code?: string | number | null;
  expires_at?: string | null;
  error?: string | null;
}

const alunoId = new URLSearchParams(location.search).get('id');
const overviewPanel = document.querySelector<HTMLElement>('[data-record-panel="overview"]');
const message = document.querySelector<HTMLElement>('#record-message');

function compactMobileTabs(): void {
  if (!window.matchMedia('(max-width: 700px)').matches) return;
  const labels: Record<string, string> = {
    overview: 'Geral',
    planning: 'Plano',
    evolution: 'Evolução',
    history: 'Histórico',
    access: 'Acesso'
  };
  document.querySelectorAll<HTMLElement>('[data-record-tab]').forEach(tab => {
    const key = tab.dataset.recordTab || '';
    const label = labels[key];
    if (label) tab.textContent = label;
  });
  document.querySelector('.record-tabs')?.classList.add('record-tabs-compact');
}

function setupStickyTabsState(): void {
  const tabs = document.querySelector<HTMLElement>('.record-tabs');
  if (!tabs) return;

  let frame = 0;
  const sync = (): void => {
    frame = 0;
    if (!window.matchMedia('(max-width: 700px)').matches) {
      tabs.classList.remove('is-stuck');
      return;
    }

    const stickyTop = Number.parseFloat(getComputedStyle(tabs).top) || 0;
    const stuck = window.scrollY > 0 && tabs.getBoundingClientRect().top <= stickyTop + 1;
    tabs.classList.toggle('is-stuck', stuck);
  };

  const requestSync = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(sync);
  };

  window.addEventListener('scroll', requestSync, { passive: true });
  window.addEventListener('resize', requestSync, { passive: true });
  window.addEventListener('orientationchange', requestSync, { passive: true });
  window.visualViewport?.addEventListener('resize', requestSync, { passive: true });
  requestSync();
}

compactMobileTabs();
setupStickyTabsState();

if (alunoId && overviewPanel && !document.querySelector('#student-activation-code-card')) {
  const session = await requireSession();
  if (session) {
    let accessState: StudentAccessState | null = null;
    try {
      const { data, error } = await supabase
        .from('alunos')
        .select('primeiro_acesso_concluido,pin_hash,codigo_ativacao_expira_em')
        .eq('id', alunoId)
        .eq('personal_id', session.user.id)
        .maybeSingle();
      if (error) throw error;
      accessState = (data || null) as StudentAccessState | null;
    } catch (error) {
      console.warn('Não foi possível consultar o estado do primeiro acesso do aluno:', error);
    }

    const firstAccessDone = Boolean(accessState?.primeiro_acesso_concluido && accessState?.pin_hash);
    if (!firstAccessDone) {
      const card = document.createElement('article');
      card.id = 'student-activation-code-card';
      card.className = 'card student-activation-overview-card';

      const existingExpiry = accessState?.codigo_ativacao_expira_em ? new Date(accessState.codigo_ativacao_expira_em) : null;
      const existingCodeIsValid = Boolean(existingExpiry && !Number.isNaN(existingExpiry.getTime()) && existingExpiry > new Date());

      card.innerHTML = `
        <div class="student-activation-heading">
          <div>
            <small>ACESSO DO ALUNO</small>
            <h2>Primeiro acesso pendente</h2>
          </div>
          <span class="student-activation-status">PENDENTE</span>
        </div>
        <p class="student-activation-intro">Gere o código de 6 números que o aluno usará apenas no primeiro acesso para criar o PIN pessoal.</p>
        ${existingCodeIsValid && existingExpiry ? `<p class="student-activation-existing">Já existe um código válido até ${existingExpiry.toLocaleString('pt-BR')}. Gere outro somente se precisar substituir o anterior.</p>` : ''}
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

      const generateButton = card.querySelector<HTMLButtonElement>('#generate-student-activation-code');
      const copyButton = card.querySelector<HTMLButtonElement>('#copy-student-activation-code');
      const result = card.querySelector<HTMLElement>('#student-activation-code-result');
      const valueHost = card.querySelector<HTMLElement>('#student-activation-code-value');
      const expiryHost = card.querySelector<HTMLElement>('#student-activation-code-expiry');
      let currentCode = '';

      async function invokeGenerateCode(): Promise<ActivationCodeResult> {
        const { data, error } = await supabase.functions.invoke('personal-aluno-pin', {
          body: { action: 'generate_activation_code', aluno_id: alunoId }
        });
        if (error) {
          let detail = error.message;
          try {
            const payload = await error.context?.json?.();
            detail = payload?.error || detail;
          } catch {}
          throw new Error(detail || 'Não foi possível gerar o código de ativação.');
        }
        if (data?.error) throw new Error(data.error);
        return (data || {}) as ActivationCodeResult;
      }

      generateButton?.addEventListener('click', async () => {
        generateButton.disabled = true;
        const originalText = generateButton.textContent;
        generateButton.textContent = 'Gerando...';
        try {
          const data = await invokeGenerateCode();
          currentCode = String(data.activation_code || '');
          if (!/^\d{6}$/.test(currentCode)) throw new Error('Código de ativação inválido retornado pelo servidor.');
          if (valueHost) valueHost.textContent = currentCode;
          if (expiryHost) {
            expiryHost.textContent = data.expires_at
              ? `Válido até ${new Date(data.expires_at).toLocaleString('pt-BR')}`
              : 'Código temporário';
          }
          result?.classList.remove('hidden');
          copyButton?.classList.remove('hidden');
          generateButton.textContent = 'Gerar novo código';
          showMessage(message, 'Código gerado. Envie os 6 números ao aluno por um canal de confiança.');
        } catch (error) {
          console.error(error);
          generateButton.textContent = originalText;
          showMessage(message, error instanceof Error ? error.message : 'Não foi possível gerar o código de ativação.', 'error');
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
