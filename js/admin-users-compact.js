import { supabase } from './supabase.js';
import { showMessage } from './layout.js';

const usersList = document.querySelector('#admin-users-list');
const userModalContent = document.querySelector('#admin-user-modal-content');
const message = document.querySelector('#admin-message');
const searchInput = document.querySelector('#admin-user-search');

function parsePtDate(value = '') {
  const match = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

function currentExpiryText() {
  const item = [...(userModalContent?.querySelectorAll('.admin-detail-item') || [])]
    .find(node => node.querySelector('span')?.textContent?.trim() === 'Vencimento');
  return item?.querySelector('strong')?.textContent?.trim() || '';
}

function compactUsersTable() {
  if (!usersList) return;
  const table = usersList.closest('table');
  if (!table) return;
  table.classList.add('admin-users-compact-table');

  const header = table.querySelector('thead tr');
  if (header && !header.dataset.compactReady) {
    header.innerHTML = '<th>Usuário</th><th>Vencimento</th><th aria-label="Abrir detalhes"></th>';
    header.dataset.compactReady = 'true';
  }

  usersList.querySelectorAll('tr').forEach(row => {
    if (row.dataset.compactReady) return;
    const cells = [...row.children];

    if (cells.length === 1) {
      cells[0].colSpan = 3;
      row.dataset.compactReady = 'true';
      return;
    }

    if (cells.length < 5) return;
    const [userCell, planCell, expiryCell, statusCell, actionsCell] = cells;
    const detailsButton = actionsCell.querySelector('[data-open-user]');
    if (!detailsButton) return;

    const userId = detailsButton.dataset.openUser;
    const userMeta = userCell.querySelector('.admin-user-meta');
    const name = userMeta?.querySelector('strong');
    const planBadge = planCell.querySelector('.admin-badge');

    if (userMeta && name && planBadge) {
      const titleLine = document.createElement('div');
      titleLine.className = 'admin-compact-user-line';
      titleLine.append(name, planBadge);
      userMeta.prepend(titleLine);
    }

    userCell.classList.add('admin-compact-user-cell');
    expiryCell.classList.add('admin-compact-expiry-cell');

    detailsButton.className = 'admin-user-row-details-proxy';
    detailsButton.hidden = true;
    actionsCell.innerHTML = '';
    actionsCell.className = 'admin-user-row-open';
    actionsCell.append(detailsButton);
    const arrow = document.createElement('span');
    arrow.className = 'admin-user-row-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '›';
    actionsCell.append(arrow);

    planCell.remove();
    statusCell.remove();

    row.dataset.compactReady = 'true';
    row.dataset.adminUserId = userId;
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `Abrir detalhes de ${name?.textContent?.trim() || 'usuário'}`);

    const openDetails = event => {
      if (event?.target?.closest?.('button,a,input,select,textarea')) return;
      detailsButton.click();
    };
    row.addEventListener('click', openDetails);
    row.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      detailsButton.click();
    });
  });
}

function enhanceUserModal() {
  if (!userModalContent) return;
  const planSelect = userModalContent.querySelector('[data-plan-user]');
  const adminSection = userModalContent.querySelector('.admin-detail-section.full');
  if (!planSelect || !adminSection) return;

  const userId = planSelect.dataset.planUser;
  if (adminSection.querySelector(`[data-expiry-editor-user="${CSS.escape(userId)}"]`)) return;

  const savedPlan = String(planSelect.value || '').toLowerCase();
  const canExpire = savedPlan === 'premium' || savedPlan === 'trial';
  const expiryEditor = document.createElement('div');
  expiryEditor.className = 'admin-expiry-editor';
  expiryEditor.dataset.expiryEditorUser = userId;
  expiryEditor.innerHTML = `
    <div class="form-group">
      <label for="admin-modal-expiry-date">Vencimento do plano</label>
      <input id="admin-modal-expiry-date" type="date" value="${parsePtDate(currentExpiryText())}" ${canExpire ? '' : 'disabled'}>
      <small>${canExpire ? 'Define o último dia de acesso deste plano.' : 'O plano Free não possui vencimento.'}</small>
    </div>
    <button class="btn btn-outline" type="button" data-save-expiry="${userId}" ${canExpire ? '' : 'disabled'}>Salvar vencimento</button>`;

  const planRow = adminSection.querySelector('.admin-modal-plan-row');
  adminSection.insertBefore(expiryEditor, planRow || adminSection.firstChild);

  expiryEditor.querySelector('[data-save-expiry]')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    const input = expiryEditor.querySelector('#admin-modal-expiry-date');
    if (!input?.value) return showMessage(message, 'Informe a data de vencimento.', 'error');
    if (!window.confirm(`Alterar o vencimento deste plano para ${input.value.split('-').reverse().join('/')}?`)) return;

    const expiry = new Date(`${input.value}T23:59:59.999`);
    if (Number.isNaN(expiry.getTime())) return showMessage(message, 'Data de vencimento inválida.', 'error');

    button.disabled = true;
    try {
      const { error } = await supabase.rpc('fsfit_admin_atualizar_vencimento_plano', {
        p_user_id: userId,
        p_vencimento: expiry.toISOString()
      });
      if (error) throw error;
      showMessage(message, 'Vencimento do plano atualizado com sucesso.');
      searchInput?.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (error) {
      console.error(error);
      showMessage(message, error.message || 'Não foi possível alterar o vencimento do plano.', 'error');
    } finally {
      button.disabled = false;
    }
  });
}

const usersObserver = new MutationObserver(compactUsersTable);
if (usersList) usersObserver.observe(usersList, { childList: true, subtree: true });

const modalObserver = new MutationObserver(enhanceUserModal);
if (userModalContent) modalObserver.observe(userModalContent, { childList: true, subtree: true });

compactUsersTable();
enhanceUserModal();
