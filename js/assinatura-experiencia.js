const MANAGEMENT_HOST_SELECTOR = '#subscription-management-actions';
const SUMMARY_HOST_SELECTOR = '#subscription-summary-grid';

function injectExperienceStyles() {
  if (document.querySelector('#subscription-experience-styles')) return;

  const style = document.createElement('style');
  style.id = 'subscription-experience-styles';
  style.textContent = `
    .subscription-page{padding-bottom:40px}
    .subscription-management-grid{grid-template-columns:1fr}
    .subscription-management-action--primary{align-items:center;padding:18px;border-color:rgba(181,236,0,.34);background:linear-gradient(145deg,rgba(181,236,0,.08),var(--surface-light) 58%)}
    .subscription-management-action--primary>div{min-width:0}
    .subscription-management-action--primary strong{font-size:1.02rem}
    .subscription-management-action--primary .btn{min-width:170px}
    .subscription-management-more{border-top:1px solid var(--border)}
    .subscription-management-more summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 2px 2px;cursor:pointer;list-style:none;color:var(--muted);font-size:.84rem;font-weight:800}
    .subscription-management-more summary::-webkit-details-marker{display:none}
    .subscription-management-more summary::after{content:'›';font-size:1.4rem;line-height:1;transition:transform .18s ease}
    .subscription-management-more[open] summary::after{transform:rotate(90deg)}
    .subscription-management-secondary-list{display:grid;margin-top:10px}
    .subscription-management-secondary-list .subscription-management-action{align-items:center;padding:13px 2px;border:0;border-bottom:1px solid var(--border);border-radius:0;background:transparent}
    .subscription-management-secondary-list .subscription-management-action:last-child{border-bottom:0}
    .subscription-management-secondary-list .subscription-management-action .btn{min-width:122px}
    html.subscription-modal-active,body.subscription-modal-active{overflow:hidden;overscroll-behavior:none}
    .subscription-modal-backdrop{overscroll-behavior:contain;padding:max(16px,env(safe-area-inset-top)) 16px max(16px,env(safe-area-inset-bottom))}
    .subscription-modal{max-height:calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 32px);overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
    .subscription-history-item{grid-template-columns:minmax(0,1fr) auto auto}
    .subscription-history-date{display:none}

    @media(max-width:720px){
      .subscription-page{padding-bottom:calc(118px + env(safe-area-inset-bottom))}
      .subscription-management-action--primary{align-items:flex-start;flex-direction:column;padding:16px}
      .subscription-management-action--primary .btn{width:100%;min-width:0}
      .subscription-management-secondary-list .subscription-management-action{align-items:flex-start;flex-direction:row;gap:10px}
      .subscription-management-secondary-list .subscription-management-action>div{min-width:0;flex:1}
      .subscription-management-secondary-list .subscription-management-action .btn{width:auto;min-width:0;padding-inline:12px}
      .subscription-modal-backdrop{place-items:end center;padding:env(safe-area-inset-top) 0 0}
      .subscription-modal{width:100%;max-height:calc(100dvh - env(safe-area-inset-top) - 8px);padding:20px 16px calc(20px + env(safe-area-inset-bottom));border-radius:20px 20px 0 0}
    }

    @media(max-width:620px){
      .subscription-history-item{grid-template-columns:minmax(0,1fr) auto}
      .subscription-history-main{grid-column:1;grid-row:1 / span 2}
      .subscription-history-value{grid-column:2;grid-row:1;text-align:right}
      .subscription-history-item>.subscription-status-badge{grid-column:2;grid-row:2;justify-self:end}
    }
  `;
  document.head.appendChild(style);
}

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

injectExperienceStyles();

const observer = new MutationObserver(() => {
  enhanceManagement();
  syncModalState();
});

observer.observe(document.body, { childList: true, subtree: true });
enhanceManagement();
syncModalState();
