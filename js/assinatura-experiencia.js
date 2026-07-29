const MANAGEMENT_HOST_SELECTOR = '#subscription-management-actions';
const SUMMARY_HOST_SELECTOR = '#subscription-summary-grid';

function actionTitle(article) {
  return article?.querySelector('strong')?.textContent?.trim() || '';
}

function findAction(actions, matcher) {
  return actions.find(article => matcher(actionTitle(article).toLocaleLowerCase('pt-BR')));
}

function readSummaryText() {
  return document.querySelector(SUMMARY_HOST_SELECTOR)?.textContent?.toLocaleLowerCase('pt-BR') || '';
}

function setSectionCopy(title, description) {
  const titleNode = document.querySelector('#subscription-management-title');
  const descriptionNode = document.querySelector('#subscription-management-title + p');
  if (titleNode) titleNode.textContent = title;
  if (descriptionNode) descriptionNode.textContent = description;
}

function preparePrimaryAction(article, { title, description, buttonText }) {
  article.classList.add('subscription-management-action--primary');
  const titleNode = article.querySelector('strong');
  const descriptionNode = article.querySelector('span');
  const button = article.querySelector('button');

  if (titleNode) titleNode.textContent = title;
  if (descriptionNode) descriptionNode.textContent = description;
  if (button) {
    button.textContent = buttonText;
    button.classList.remove('btn-outline', 'btn-danger', 'btn-neutral');
    button.classList.add('btn-primary');
  }
}

function enhanceManagement() {
  const host = document.querySelector(MANAGEMENT_HOST_SELECTOR);
  if (!host || host.dataset.subscriptionUxReady === 'true') return;

  const summaryText = readSummaryText();
  if (!summaryText || summaryText.includes('carregando informações')) return;

  const actions = Array.from(host.querySelectorAll(':scope > .subscription-management-action'));
  if (!actions.length) return;

  const hasActiveCardControls = actions.some(article => /trocar cartão/i.test(actionTitle(article)))
    && actions.some(article => /cancelar assinatura/i.test(actionTitle(article)));
  const hasCanceledCard = actions.some(article => /excluir referência do cartão/i.test(actionTitle(article)))
    || actions.some(article => /reativar com cartão/i.test(article.textContent || ''));
  const hasPixAccess = /pagamento\s*pix/.test(summaryText);

  let primary;
  let sectionCopy;
  let primaryCopy;
  let detailsLabel = 'Outras opções da assinatura';

  if (hasActiveCardControls) {
    primary = findAction(actions, title => title === 'alterar plano') || actions[0];
    sectionCopy = {
      title: 'Gerenciar assinatura',
      description: 'Sua renovação automática está ativa. As opções menos usadas ficam organizadas abaixo.'
    };
    primaryCopy = {
      title: 'Plano e forma de pagamento',
      description: 'Altere o plano recorrente ou migre para um período pago por PIX.',
      buttonText: 'Gerenciar'
    };
  } else if (hasCanceledCard) {
    primary = findAction(actions, title => title === 'assinar com cartão') || actions[0];
    sectionCopy = {
      title: 'Reativar assinatura',
      description: 'A renovação automática está desativada. Escolha como deseja continuar usando o FS Fit.'
    };
    primaryCopy = {
      title: 'Reativar com cartão',
      description: 'Cadastre um cartão para voltar à renovação automática mensal.',
      buttonText: 'Reativar assinatura'
    };
  } else if (hasPixAccess) {
    primary = findAction(actions, title => title.includes('pagar ou renovar com pix')) || actions[0];
    sectionCopy = {
      title: 'Renovar assinatura',
      description: 'Continue com PIX ou altere a forma de pagamento quando precisar.'
    };
    primaryCopy = {
      title: 'Renovar acesso com PIX',
      description: 'Escolha o período e renove sem cobrança automática.',
      buttonText: 'Renovar com PIX'
    };
  } else {
    primary = findAction(actions, title => title === 'alterar plano') || actions[0];
    sectionCopy = {
      title: 'Assinar o FS Fit',
      description: 'Escolha um plano e a forma de pagamento. Cartão renova automaticamente; PIX é pago por período.'
    };
    primaryCopy = {
      title: 'Escolha como deseja assinar',
      description: 'Compare cartão com renovação automática e os períodos disponíveis via PIX.',
      buttonText: 'Ver planos'
    };
    detailsLabel = 'Escolher diretamente a forma de pagamento';
  }

  setSectionCopy(sectionCopy.title, sectionCopy.description);
  preparePrimaryAction(primary, primaryCopy);

  const secondaryActions = actions.filter(article => article !== primary);
  if (hasActiveCardControls) {
    const duplicate = findAction(secondaryActions, title => title === 'alterar forma de pagamento');
    duplicate?.remove();
  }

  const remainingActions = secondaryActions.filter(article => article.isConnected);
  host.replaceChildren(primary);

  if (remainingActions.length) {
    const details = document.createElement('details');
    details.className = 'subscription-management-more';
    details.innerHTML = `<summary>${detailsLabel}</summary><div class="subscription-management-secondary-list"></div>`;
    const list = details.querySelector('.subscription-management-secondary-list');
    remainingActions.forEach(article => list.appendChild(article));
    host.appendChild(details);
  }

  host.dataset.subscriptionUxReady = 'true';
}

function syncModalState() {
  const isOpen = Boolean(document.querySelector('#subscription-management-modal'));
  document.documentElement.classList.toggle('subscription-modal-active', isOpen);
  document.body.classList.toggle('subscription-modal-active', isOpen);
}

const observer = new MutationObserver(() => {
  enhanceManagement();
  syncModalState();
});

observer.observe(document.body, { childList: true, subtree: true });
enhanceManagement();
syncModalState();
