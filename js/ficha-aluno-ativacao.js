import { supabase } from './supabase.js';
import { requireSession, showMessage } from './layout.js';

const alunoId = new URLSearchParams(location.search).get('id');
const accessPanel = document.querySelector('[data-record-panel="access"] .record-section-card');
const message = document.querySelector('#record-message');

if (alunoId && accessPanel && !document.querySelector('#student-activation-code-card')) {
  const session = await requireSession();
  if (session) {
    const card = document.createElement('article');
    card.id = 'student-activation-code-card';
    card.className = 'sub-card';
    card.innerHTML = `
      <h3>Primeiro acesso seguro</h3>
      <p>Gere um código temporário de 6 números e envie ao aluno. O código é exigido apenas para criar o primeiro PIN e expira em 7 dias.</p>
      <div id="student-activation-code-result" class="hidden" style="margin:14px 0;padding:14px;border:1px solid rgba(50,215,75,.35);border-radius:14px;background:rgba(50,215,75,.08)">
        <small style="display:block;color:var(--muted);margin-bottom:6px">CÓDIGO DE ATIVAÇÃO</small>
        <strong id="student-activation-code-value" style="font-size:1.65rem;letter-spacing:.16em"></strong>
        <small id="student-activation-code-expiry" style="display:block;color:var(--muted);margin-top:6px"></small>
      </div>
      <div class="actions">
        <button id="generate-student-activation-code" class="btn btn-primary" type="button">Gerar código de ativação</button>
        <button id="copy-student-activation-code" class="btn btn-outline hidden" type="button">Copiar código</button>
      </div>`;

    const accessGrid = accessPanel.querySelector('.access-grid');
    if (accessGrid) accessGrid.appendChild(card);
    else accessPanel.appendChild(card);

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
        showMessage(message, 'Código de ativação gerado. Envie os 6 números ao aluno por um canal de confiança.');
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