// @ts-ignore The browser runtime resolves this existing JavaScript module.
import { supabase } from './supabase.js';

const isDashboard = (window.location.pathname.split('/').pop() || '') === 'painel.html';

if (isDashboard) {
  type LiveSessionRow = { sessao_id?: string | null; aluno_id?: string | null; aluno_nome?: string | null; id?: string; foto_perfil_url?: string | null };
  type LiveSession = { sessionId: string; studentId: string; name: string };
  const icon = await waitForElement<HTMLElement>('#home-now-icon');
  const action = await waitForElement<HTMLElement>('#home-now-action');
  const liveList = document.querySelector('#live-students-list');

  if (icon && action) {
    const avatarIcon = icon;
    const actionControl = action;
    const sessionById = new Map<string, LiveSession>();
    const photoByStudentId = new Map<string, string>();
    let loading = false;

    function initials(value = '') {
      const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
      return (parts.slice(0, 2).map(part => part.charAt(0)).join('') || 'A').toUpperCase();
    }

    function resetAvatarState() {
      avatarIcon.classList.remove('has-student-avatar', 'has-profile-photo');
      delete avatarIcon.dataset.avatarSignature;
    }

    function renderAvatar() {
      if (actionControl.dataset.mode !== 'live' || !actionControl.dataset.sessionId) {
        resetAvatarState();
        return;
      }

      const session = sessionById.get(actionControl.dataset.sessionId);
      if (!session) return;

      const photo = photoByStudentId.get(session.studentId);
      const signature = photo
        ? `photo:${session.sessionId}:${photo}`
        : `initials:${session.sessionId}:${session.name}`;

      if (avatarIcon.dataset.avatarSignature === signature) return;
      avatarIcon.dataset.avatarSignature = signature;
      avatarIcon.classList.add('has-student-avatar');
      avatarIcon.classList.toggle('has-profile-photo', Boolean(photo));
      avatarIcon.replaceChildren();

      if (photo) {
        const image = document.createElement('img');
        image.src = photo;
        image.alt = '';
        image.decoding = 'async';
        image.loading = 'eager';
        image.addEventListener('error', () => {
          photoByStudentId.set(session.studentId, '');
          delete avatarIcon.dataset.avatarSignature;
          renderAvatar();
        }, { once: true });
        avatarIcon.appendChild(image);
        return;
      }

      avatarIcon.textContent = initials(session.name);
    }

    async function loadMissingPhotos(rows: LiveSessionRow[]) {
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

      ((data || []) as LiveSessionRow[]).forEach(student => {
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
        rows.forEach((row: LiveSessionRow) => {
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
      const sessionId = actionControl.dataset.sessionId;
      if (actionControl.dataset.mode === 'live' && sessionId && !sessionById.has(sessionId)) {
        refreshSessions().catch(console.error);
      }
    }).observe(actionControl, {
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

function waitForElement<T extends Element = HTMLElement>(selector: string, timeout = 8000): Promise<T | null> {
  const existing = document.querySelector<T>(selector);
  if (existing) return Promise.resolve(existing);

  return new Promise(resolve => {
    const observer = new MutationObserver(() => {
      const element = document.querySelector<T>(selector);
      if (!element) return;
      observer.disconnect();
      resolve(element);
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector<T>(selector));
    }, timeout);
  });
}
