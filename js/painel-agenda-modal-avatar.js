import { supabase } from './supabase.js';

if ((window.location.pathname.split('/').pop() || '') === 'painel.html') {
  let activeStudent = null;
  const photoCache = new Map();

  function initials(value = '') {
    const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
    return (parts.slice(0, 2).map(part => part.charAt(0)).join('') || 'A').toUpperCase();
  }

  function studentIdFromRow(row) {
    if (row?.dataset?.studentId) return row.dataset.studentId;
    const href = row?.getAttribute?.('href') || '';
    if (!href) return '';
    try {
      return new URL(href, window.location.origin).searchParams.get('id') || '';
    } catch {
      return '';
    }
  }

  function studentNameFromRow(row) {
    return row?.querySelector('.today-entry-main strong')?.textContent?.trim() || 'Aluno';
  }

  function photoFromRow(row) {
    return row?.querySelector('.fsfit-personal-student-avatar img')?.src || '';
  }

  function ensureStyles() {
    if (document.querySelector('style[data-fsfit-today-modal-avatar]')) return;
    const style = document.createElement('style');
    style.dataset.fsfitTodayModalAvatar = 'true';
    style.textContent = `
      .today-workout-dashboard-header.fsfit-has-student-avatar{align-items:center}
      .fsfit-today-modal-identity{display:flex;align-items:center;gap:13px;min-width:0;flex:1}
      .fsfit-today-modal-copy{min-width:0}
      .fsfit-today-modal-copy h2,.fsfit-today-modal-copy p{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .fsfit-today-modal-avatar{flex:0 0 58px;width:58px;height:58px;display:grid;place-items:center;overflow:hidden;border:2px solid rgba(255,255,255,.14);border-radius:50%;background:linear-gradient(145deg,rgba(50,215,75,.18),rgba(59,130,246,.13)),var(--surface-light);color:var(--text);font-size:.9rem;font-weight:900;line-height:1}
      .fsfit-today-modal-avatar img{width:100%;height:100%;display:block;object-fit:cover}
      @media(max-width:620px){
        .fsfit-today-modal-identity{gap:10px}
        .fsfit-today-modal-avatar{flex-basis:50px;width:50px;height:50px;font-size:.78rem}
        .today-workout-dashboard-header.fsfit-has-student-avatar{align-items:center}
      }
    `;
    document.head.appendChild(style);
  }

  function decorateModal() {
    if (!activeStudent) return;
    const modal = document.querySelector('#today-workout-dashboard-modal.open');
    const header = modal?.querySelector('.today-workout-dashboard-header');
    if (!header) return;

    let identity = header.querySelector('.fsfit-today-modal-identity');
    let copy = header.querySelector('.fsfit-today-modal-copy');
    let avatar = header.querySelector('.fsfit-today-modal-avatar');

    if (!identity) {
      const originalCopy = [...header.children].find(child => child.tagName === 'DIV');
      if (!originalCopy) return;
      identity = document.createElement('div');
      identity.className = 'fsfit-today-modal-identity';
      copy = document.createElement('div');
      copy.className = 'fsfit-today-modal-copy';
      while (originalCopy.firstChild) copy.appendChild(originalCopy.firstChild);
      originalCopy.replaceWith(identity);
      avatar = document.createElement('span');
      avatar.className = 'fsfit-today-modal-avatar';
      avatar.setAttribute('aria-hidden', 'true');
      identity.append(avatar, copy);
      header.classList.add('fsfit-has-student-avatar');
    }

    if (!avatar) return;
    const photoUrl = activeStudent.photo || photoCache.get(activeStudent.id) || '';
    avatar.textContent = '';
    if (photoUrl) {
      const image = document.createElement('img');
      image.src = photoUrl;
      image.alt = '';
      image.decoding = 'async';
      avatar.appendChild(image);
    } else {
      avatar.textContent = initials(activeStudent.name);
    }
  }

  async function loadPhoto(studentId) {
    if (!studentId || photoCache.has(studentId)) return photoCache.get(studentId) || '';
    try {
      const { data, error } = await supabase
        .from('alunos')
        .select('foto_perfil_url')
        .eq('id', studentId)
        .maybeSingle();
      if (error) throw error;
      const photo = data?.foto_perfil_url || '';
      photoCache.set(studentId, photo);
      return photo;
    } catch (error) {
      console.warn('Não foi possível carregar a foto do aluno para o modal:', error);
      photoCache.set(studentId, '');
      return '';
    }
  }

  function captureStudent(row) {
    const studentId = studentIdFromRow(row);
    if (!studentId) return;
    activeStudent = {
      id: studentId,
      name: studentNameFromRow(row),
      photo: photoFromRow(row)
    };

    if (activeStudent.photo) photoCache.set(studentId, activeStudent.photo);
    queueMicrotask(decorateModal);

    if (!activeStudent.photo) {
      loadPhoto(studentId).then(photo => {
        if (!activeStudent || activeStudent.id !== studentId) return;
        activeStudent.photo = photo;
        decorateModal();
      });
    }
  }

  ensureStyles();

  document.addEventListener('pointerdown', event => {
    const row = event.target.closest?.('#today-list .today-entry');
    if (row) captureStudent(row);
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest?.('#today-list .today-entry');
    if (row) captureStudent(row);
  }, true);

  const observer = new MutationObserver(() => {
    if (document.querySelector('#today-workout-dashboard-modal.open')) decorateModal();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
}
