// @ts-ignore Existing browser JavaScript module.
import { supabase } from './supabase.js';
const form = document.querySelector('#password-form');
const message = document.querySelector('#password-message');
const status = document.querySelector('#recovery-status');
const fields = form
    ? [...form.querySelectorAll('input, button[type="submit"]')]
    : [];
let recoveryReady = false;
let validationFinished = false;
let validationTimer = null;
let authSubscription = null;
function show(text, type = 'error') {
    if (!message)
        return;
    message.textContent = text;
    message.className = `message show ${type}`;
    message.setAttribute('role', type === 'error' ? 'alert' : 'status');
    message.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    message.setAttribute('aria-atomic', 'true');
}
function showFieldError(text, field) {
    if (field) {
        field.setAttribute('aria-invalid', 'true');
        if (message?.id)
            field.setAttribute('aria-describedby', message.id);
    }
    show(text);
    field?.focus();
}
function clearMessage() {
    form?.querySelectorAll('[aria-invalid="true"]').forEach(field => {
        field.removeAttribute('aria-invalid');
        if (field.getAttribute('aria-describedby') === message?.id)
            field.removeAttribute('aria-describedby');
    });
    if (!message)
        return;
    message.textContent = '';
    message.className = 'message';
}
form?.addEventListener('input', event => {
    const field = event.target;
    if ((field instanceof Element && field.getAttribute('aria-invalid') === 'true') || message?.classList.contains('show')) {
        clearMessage();
    }
});
function setStatus(text, state = '') {
    if (!status)
        return;
    status.textContent = text;
    status.className = `password-reset-status${state ? ` ${state}` : ''}`;
}
function setFormEnabled(enabled) {
    fields.forEach(field => {
        field.disabled = !enabled;
    });
}
function stopRecoveryValidation() {
    if (validationTimer !== null) {
        window.clearTimeout(validationTimer);
        validationTimer = null;
    }
    authSubscription?.unsubscribe();
    authSubscription = null;
}
function removeRecoveryParamsFromUrl() {
    try {
        const url = new URL(window.location.href);
        ['code', 'type', 'token', 'token_hash', 'access_token', 'refresh_token'].forEach(key => url.searchParams.delete(key));
        url.hash = '';
        window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
    }
    catch {
        // A redefinição da URL é apenas uma medida de privacidade complementar.
    }
}
function markRecoveryReady() {
    if (recoveryReady)
        return;
    recoveryReady = true;
    validationFinished = true;
    stopRecoveryValidation();
    removeRecoveryParamsFromUrl();
    setStatus('Link validado. Agora você pode criar sua nova senha.', 'ready');
    setFormEnabled(true);
    document.querySelector('#new-password')?.focus();
}
function markRecoveryInvalid() {
    if (recoveryReady || validationFinished)
        return;
    validationFinished = true;
    stopRecoveryValidation();
    setStatus('Este link é inválido ou expirou. Solicite um novo link de recuperação.', 'invalid');
    setFormEnabled(false);
}
function errorMessage(error, fallback) {
    return error instanceof Error && error.message ? error.message : fallback;
}
setFormEnabled(false);
const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' && session?.user)
        markRecoveryReady();
});
authSubscription = authListener?.subscription || null;
const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
const queryParams = new URLSearchParams(window.location.search);
const recoveryFlow = hashParams.get('type') === 'recovery'
    || queryParams.get('type') === 'recovery'
    || queryParams.has('code');
try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error)
        throw error;
    if (session?.user && recoveryFlow) {
        markRecoveryReady();
    }
    else {
        validationTimer = window.setTimeout(markRecoveryInvalid, 5000);
    }
}
catch (error) {
    console.error(error);
    markRecoveryInvalid();
}
window.addEventListener('beforeunload', stopRecoveryValidation, { once: true });
if (form) {
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearMessage();
        const passwordField = form.elements.namedItem('password');
        const confirmPasswordField = form.elements.namedItem('confirm_password');
        if (!(passwordField instanceof HTMLInputElement) || !(confirmPasswordField instanceof HTMLInputElement)) {
            show('Os campos de senha estão indisponíveis. Atualize a página e tente novamente.');
            return;
        }
        const password = passwordField.value;
        const confirmPassword = confirmPasswordField.value;
        if (!validationFinished || !recoveryReady) {
            show('Este link de recuperação é inválido ou expirou. Solicite um novo link.');
            return;
        }
        if (password.length < 8)
            return showFieldError('A senha deve ter pelo menos 8 caracteres.', passwordField);
        if (!confirmPassword)
            return showFieldError('Confirme sua nova senha.', confirmPasswordField);
        if (password !== confirmPassword)
            return showFieldError('As senhas não coincidem.', confirmPasswordField);
        const button = form.querySelector('[type="submit"]');
        if (!button)
            return;
        button.disabled = true;
        button.textContent = 'Salvando...';
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error)
                throw error;
            await supabase.auth.signOut();
            setStatus('Senha atualizada com segurança.', 'ready');
            show('Senha alterada com sucesso. Redirecionando para o login...', 'success');
            form.querySelectorAll('input').forEach(input => {
                input.disabled = true;
                input.value = '';
            });
            window.setTimeout(() => window.location.replace('index.html?modo=login'), 1400);
        }
        catch (error) {
            console.error(error);
            show(errorMessage(error, 'Não foi possível atualizar sua senha. Solicite um novo link e tente novamente.'));
            button.disabled = false;
            button.textContent = 'Salvar nova senha';
        }
    });
}
