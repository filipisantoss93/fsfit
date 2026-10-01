// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { supabase } from './supabase.js';

if ((window.location.pathname.split('/').pop() || '') === 'painel.html') {
  type StudentAvatar = { id: string; name: string; photo: string };
  let activeStudent: StudentAvatar | null = null;
  const photoCache = new Map();

  function initials(value = '') {
    const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
    return (parts.slice(0, 2).map(part => part.charAt(0)).join('') || 'A').toUpperCase();
  }

  function studentIdFromRow(row: HTMLElement) {
    if (row?.dataset?.studentId) return row.dataset.studentId;
    const href = row?.getAttribute?.('href') || '';
    if (!href) return '';
    try {
      return new URL(href, window.location.origin).searchParams.get('id') || '';
    } catch {
      return '';
    }
  }

  function studentNameFromRow(row: HTMLElement) {
    return row?.querySelector('.today-entry-main strong')?.textContent?.trim() || 'Aluno';
  }

  function photoFromRow(row: HTMLElement) {
    return row?.querySelector<HTMLImageElement>('.fsfit-personal-student-avatar img')?.src || '';
  }

  function decorateModal() {
    if (!activeStudent) return;
    const modal = document.querySelector('#today-workout-dashboard-modal.open');
    const header = modal?.querySelector('.today-workout-dashboard-header');
    if (!header) return;

    let identity = header.querySelector<HTMLElement>('.fsfit-today-modal-identity');
    let copy = header.querySelector<HTMLElement>('.fsfit-today-modal-copy');
    let avatar = header.querySelector<HTMLElement>('.fsfit-today-modal-avatar');

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
    const avatarSignature = photoUrl ? `photo:${photoUrl}` : `initials:${initials(activeStudent.name)}`;

    // Evita reescrever o mesmo conteúdo do avatar. A versão anterior fazia isso
    // dentro de um MutationObserver global e acabava disparando o próprio observer
    // repetidamente, o que podia travar o Safari/iOS assim que o modal era aberto.
    if (avatar.dataset.renderSignature === avatarSignature) return;
    avatar.dataset.renderSignature = avatarSignature;
    avatar.replaceChildren();

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

  function scheduleDecorate() {
    queueMicrotask(decorateModal);
    requestAnimationFrame(decorateModal);
    window.setTimeout(decorateModal, 80);
  }

  async function loadPhoto(studentId: string): Promise<string> {
    if (!studentId || photoCache.has(studentId)) return photoCache.get(studentId) || '';
    try {
      const { data, error } = await supabase
        .from('alunos')
        .select('foto_perfil_url')
        .eq('id', studentId)
        .maybeSingle();
      if (error) throw error;
      const photo = (data?.foto_perfil_url as string | null | undefined) || '';
      photoCache.set(studentId, photo);
      return photo;
    } catch (error) {
      console.warn('Não foi possível carregar a foto do aluno para o modal:', error);
      photoCache.set(studentId, '');
      return '';
    }
  }

  function captureStudent(row: HTMLElement) {
    const studentId = studentIdFromRow(row);
    if (!studentId) return;

    activeStudent = {
      id: studentId,
      name: studentNameFromRow(row),
      photo: photoFromRow(row)
    };

    if (activeStudent.photo) photoCache.set(studentId, activeStudent.photo);
    scheduleDecorate();

    if (!activeStudent.photo) {
      loadPhoto(studentId).then(photo => {
        if (!activeStudent || activeStudent.id !== studentId) return;
        activeStudent.photo = photo;
        decorateModal();
      });
    }
  }

  document.addEventListener('pointerdown', event => {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>('#today-list .today-entry') : null;
    if (row) captureStudent(row);
  }, true);

  document.addEventListener('click', event => {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>('#today-list .today-entry') : null;
    if (row) {
      captureStudent(row);
      scheduleDecorate();
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>('#today-list .today-entry') : null;
    if (row) captureStudent(row);
  }, true);
}
