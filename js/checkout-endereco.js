const cepRequests = new WeakMap();

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatExpiration(value) {
  const numbers = onlyDigits(value).slice(0, 6);
  if (numbers.length <= 2) return numbers;
  return `${numbers.slice(0, 2)}/${numbers.slice(2)}`;
}

function formatCep(value) {
  const numbers = onlyDigits(value).slice(0, 8);
  if (numbers.length <= 5) return numbers;
  return `${numbers.slice(0, 5)}-${numbers.slice(5)}`;
}

function setField(form, selector, value) {
  const field = form?.querySelector(selector);
  if (!field) return;
  field.value = String(value || '');
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

function setCepError(form, message = '') {
  const errorBox = form?.querySelector('#card-form-error');
  if (!errorBox) return;

  if (!message) {
    if (errorBox.dataset.source === 'cep') {
      errorBox.hidden = true;
      errorBox.textContent = '';
      delete errorBox.dataset.source;
    }
    return;
  }

  errorBox.dataset.source = 'cep';
  errorBox.hidden = false;
  errorBox.textContent = message;
}

async function lookupCep(input, cep) {
  if (!input || cep.length !== 8 || input.dataset.loadedCep === cep) return;

  const form = input.closest('form');
  const previous = cepRequests.get(input);
  if (previous) previous.abort();

  const controller = new AbortController();
  cepRequests.set(input, controller);
  input.setAttribute('aria-busy', 'true');
  input.setCustomValidity('');
  setCepError(form);

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) throw new Error('Não foi possível consultar o CEP.');

    const address = await response.json();
    if (address?.erro) throw new Error('CEP não encontrado.');

    input.dataset.loadedCep = cep;
    setField(form, '#billing-street', address?.logradouro);
    setField(form, '#billing-neighborhood', address?.bairro);
    setField(form, '#billing-city', address?.localidade);
    setField(form, '#billing-state', address?.uf);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    delete input.dataset.loadedCep;
    const message = error instanceof Error ? error.message : 'Não foi possível consultar o CEP.';
    input.setCustomValidity(message);
    setCepError(form, message);
  } finally {
    if (cepRequests.get(input) === controller) cepRequests.delete(input);
    input.removeAttribute('aria-busy');
  }
}

document.addEventListener('input', event => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;

  if (input.id === 'card-expiration') {
    const formatted = formatExpiration(input.value);
    if (input.value !== formatted) input.value = formatted;
    return;
  }

  if (input.id === 'billing-zipcode') {
    const cep = onlyDigits(input.value).slice(0, 8);
    const formatted = formatCep(cep);
    if (input.value !== formatted) input.value = formatted;

    input.setCustomValidity('');
    setCepError(input.closest('form'));

    if (cep.length === 8) {
      void lookupCep(input, cep);
    } else {
      delete input.dataset.loadedCep;
      const previous = cepRequests.get(input);
      if (previous) previous.abort();
    }
  }
});

document.addEventListener('blur', event => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.id !== 'billing-zipcode') return;
  const cep = onlyDigits(input.value);
  if (cep.length === 8) void lookupCep(input, cep);
}, true);
