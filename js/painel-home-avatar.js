import { supabase } from './supabase.js';

const isDashboard = (window.location.pathname.split('/').pop() || '') === 'painel.html';

if (isDashboard) {
  const icon = await waitForElement('#home-now-icon');
  const action = await waitForElement('#home-now-action');
  const liveList = document.querySelector('#live-students-list');

  if (icon && action) {
    const sessionById = new Map();
    const photoByStudentId = new Map();
    let loading = false;

    injectStyles();

    function initials(value = '') {
      const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
      return (parts.slice(0, 2).map(part => part.charAt(0)).join('') || 'A').toUpperCase();
    }

    function resetAvatarState() {
      icon.classList.remove('has-student-avatar', 'has-profile-photo');
      delete icon.dataset.avatarSignature;
    }

    function renderAvatar() {
      if (action.dataset.mode !== 'live' || !action.dataset.sessionId) {
        resetAvatarState();
        return;
      }

      const session = sessionById.get(action.dataset.sessionId);
      if (!session) return;

      const photo = photoByStudentId.get(session.studentId);
      const signature = photo
        ? `photo:${session.sessionId}:${photo}`
        : `initials:${session.sessionId}:${session.name}`;

      if (icon.dataset.avatarSignature === signature) return;
      icon.dataset.avatarSignature = signature;
      icon.classList.add('has-student-avatar');
      icon.classList.toggle('has-profile-photo', Boolean(photo));
      icon.replaceChildren();

      if (photo) {
        const image = document.createElement('img');
        image.src = photo;
        image.alt = '';
        image.decoding = 'async';
        image.loading = 'eager';
        image.addEventListener('error', () => {
          photoByStudentId.set(session.studentId, '');
          delete icon.dataset.avatarSignature;
          renderAvatar();
        }, { once: true });
        icon.appendChild(image);
        return;
      }

      icon.textContent = initials(session.name);
    }

    async function loadMissingPhotos(rows) {
      const missingIds = [...new Set(rows
        .map(row => String(row.aluno_id || ''))
        .filter(studentId => studentId && !photoByStudentId.has(studentId)))];

      if (!missingIds.length) return;
      missingIds.forEach(studentId => photoByStudentId.set(studentId, ''));

      const { data, error } = await supabase
        .from('alunos')
        .select('id,foto_perfil_url')
        .in('id', missingIds);

      if (error) throw error;

      (data || []).forEach(student => {
        photoByStudentId.set(String(student.id), student.foto_perfil_url || '');
      });
    }

    async function refreshSessions() {
      if (loading) return;
      loading = true;

      try {
        const { data, error } = await supabase.rpc('listar_sessoes_em_aula_personal');
        if (error) throw error;

        const rows = Array.isArray(data) ? data : [];
        sessionById.clear();
        rows.forEach(row => {
          const sessionId = String(row.sessao_id || '');
          const studentId = String(row.aluno_id || '');
          if (!sessionId || !studentId) return;
          sessionById.set(sessionId, {
            sessionId,
            studentId,
            name: row.aluno_nome || 'Aluno'
          });
        });

        await loadMissingPhotos(rows);
        renderAvatar();
      } catch (error) {
        console.warn('Não foi possível carregar a foto do aluno no card Agora:', error);
        renderAvatar();
      } finally {
        loading = false;
      }
    }

    new MutationObserver(() => {
      renderAvatar();
      const sessionId = action.dataset.sessionId;
      if (action.dataset.mode === 'live' && sessionId && !sessionById.has(sessionId)) {
        refreshSessions().catch(console.error);
      }
    }).observe(action, {
      attributes: true,
      attributeFilter: ['data-mode', 'data-session-id', 'hidden']
    });

    if (liveList) {
      new MutationObserver(() => {
        refreshSessions().catch(console.error);
      }).observe(liveList, { childList: true, subtree: true });
    }

    window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshSessions().catch(console.error);
    }, 15000);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshSessions().catch(console.error);
    });

    await refreshSessions();
  }
}

function injectStyles() {
  if (document.querySelector('#painel-home-avatar-styles')) return;
  const style = document.createElement('style');
  style.id = 'painel-home-avatar-styles';
  style.textContent = `
    .home-now-icon.has-student-avatar{
      overflow:hidden;
      padding:0;
      border:2px solid rgba(177,255,0,.32);
      background:linear-gradient(145deg,rgba(177,255,0,.17),rgba(59,130,246,.12)),var(--surface-light);
      color:var(--text);
      font-size:.82rem;
      letter-spacing:-.03em;
    }
    .home-now-icon.has-profile-photo{
      border-color:rgba(177,255,0,.52);
      box-shadow:0 0 0 4px rgba(177,255,0,.06),inset 0 0 0 1px rgba(255,255,255,.08);
    }
    .home-now-icon.has-profile-photo img{
      display:block;
      width:100%;
      height:100%;
      object-fit:cover;
      object-position:center;
    }
  `;
  document.head.appendChild(style);
}

function waitForElement(selector, timeout = 8000) {
  const existing = document.querySelector(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise(resolve => {
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (!element) return;
      observer.disconnect();
      resolve(element);
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector(selector));
    }, timeout);
  });
}
