const workoutContent = document.querySelector('#workout-content');

function esc(value = '') {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function youtubeEmbedUrl(url) {
  try {
    const parsed = new URL(String(url || '').trim());
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    let id = '';

    if (host === 'youtu.be') {
      id = parsed.pathname.split('/').filter(Boolean)[0] || '';
    } else if (host === 'youtube.com' || host === 'm.youtube.com') {
      id = parsed.searchParams.get('v') || '';
      if (!id && parsed.pathname.startsWith('/shorts/')) id = parsed.pathname.split('/')[2] || '';
      if (!id && parsed.pathname.startsWith('/embed/')) id = parsed.pathname.split('/')[2] || '';
      if (!id && parsed.pathname.startsWith('/live/')) id = parsed.pathname.split('/')[2] || '';
    }

    return /^[A-Za-z0-9_-]{6,20}$/.test(id)
      ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`
      : null;
  } catch {
    return null;
  }
}

function dayLabel(day) {
  return {
    0: 'Domingo',
    1: 'Segunda-feira',
    2: 'Terça-feira',
    3: 'Quarta-feira',
    4: 'Quinta-feira',
    5: 'Sexta-feira',
    6: 'Sábado',
    7: 'Domingo'
  }[Number(day)] || '';
}

function exerciseMeta(item) {
  return [
    item.series ? `${item.series} séries` : '',
    item.repeticoes ? `${item.repeticoes} repetições` : '',
    item.carga ? `Carga: ${item.carga}` : '',
    Number.isFinite(Number(item.descanso_segundos)) && item.descanso_segundos !== null
      ? `Descanso: ${item.descanso_segundos}s`
      : ''
  ].filter(Boolean).join(' • ');
}

function renderWorkout(data) {
  if (!workoutContent || !data || typeof data !== 'object') return false;

  const exercises = Array.isArray(data.exercicios) ? data.exercicios : [];
  const description = String(data.descricao || '').trim();

  if (!description && !exercises.length) {
    workoutContent.textContent = 'Nenhum treino publicado ainda.';
    return true;
  }

  const groups = new Map();
  exercises.forEach(item => {
    const key = item.dia_semana ?? 'sem-dia';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  const exercisesHtml = [...groups.entries()].map(([day, items]) => {
    const label = day === 'sem-dia' ? '' : dayLabel(day);
    return `<section class="student-workout-day">
      ${label ? `<h3 class="student-workout-day-title">${esc(label)}</h3>` : ''}
      <div class="student-workout-exercises">
        ${items.map(item => {
          const embed = youtubeEmbedUrl(item.video_url);
          const meta = exerciseMeta(item);
          return `<article class="student-workout-exercise">
            <div class="student-workout-exercise-heading">
              <div>
                <strong>${esc(item.nome || 'Exercício')}</strong>
                ${item.grupo_muscular ? `<span>${esc(item.grupo_muscular)}</span>` : ''}
              </div>
              ${item.ordem ? `<small>#${esc(item.ordem)}</small>` : ''}
            </div>
            ${meta ? `<p class="student-workout-meta">${esc(meta)}</p>` : ''}
            ${item.equipamento ? `<p><strong>Equipamento:</strong> ${esc(item.equipamento)}</p>` : ''}
            ${item.instrucoes ? `<p>${esc(item.instrucoes)}</p>` : ''}
            ${item.observacoes ? `<p><strong>Observações:</strong> ${esc(item.observacoes)}</p>` : ''}
            ${embed ? `<div class="student-workout-video"><iframe src="${esc(embed)}" title="Vídeo demonstrativo de ${esc(item.nome || 'exercício')}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>` : ''}
          </article>`;
        }).join('')}
      </div>
    </section>`;
  }).join('');

  workoutContent.innerHTML = `${description ? `<p class="student-workout-description">${esc(description)}</p>` : ''}${exercisesHtml}`;
  workoutContent.dataset.structuredWorkoutRendered = 'true';
  return true;
}

function tryRenderStructuredWorkout() {
  if (!workoutContent || workoutContent.dataset.structuredWorkoutRendered === 'true') return;
  const raw = workoutContent.textContent.trim();
  if (!raw || (!raw.startsWith('{') && !raw.startsWith('['))) return;

  try {
    const parsed = JSON.parse(raw);
    renderWorkout(parsed);
  } catch {
    // Mantém compatibilidade com treinos antigos em texto puro.
  }
}

if (workoutContent) {
  const observer = new MutationObserver(tryRenderStructuredWorkout);
  observer.observe(workoutContent, { childList: true, subtree: true, characterData: true });
  tryRenderStructuredWorkout();
}