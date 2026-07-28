const CROPPABLE_INPUTS = {
  'avatar-file': { aspect: 1, width: 1080, height: 1080, title: 'Ajustar foto de perfil', shape: 'circle' },
  'workplace-file': { aspect: 16 / 9, width: 1280, height: 720, title: 'Ajustar foto do local', shape: 'rect' },
  'gallery-files': { aspect: 1, width: 1080, height: 1080, title: 'Ajustar foto da galeria', shape: 'rect' }
};

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir esta imagem.')); };
    img.src = url;
  });
}

function canvasToFile(canvas, originalName) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) return reject(new Error('Não foi possível preparar a imagem recortada.'));
      const base = String(originalName || 'foto').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 60) || 'foto';
      resolve(new File([blob], `${base}-recortada.jpg`, { type: 'image/jpeg', lastModified: Date.now() }));
    }, 'image/jpeg', 0.9);
  });
}

async function cropImage(file, config, index = 0, total = 1) {
  const { img, url } = await loadImage(file);

  return new Promise((resolve, reject) => {
    const modal = document.createElement('div');
    modal.className = 'fsfit-cropper';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const title = total > 1 ? `${config.title} (${index + 1} de ${total})` : config.title;
    modal.innerHTML = `
      <div class="fsfit-cropper-card">
        <div class="fsfit-cropper-head"><h2>${title}</h2><button class="fsfit-cropper-close" type="button" aria-label="Cancelar">×</button></div>
        <div class="fsfit-cropper-stage ${config.shape === 'circle' ? 'circle' : ''}" style="--crop-aspect:${config.aspect}">
          <img alt="Imagem selecionada para recorte">
          <div class="fsfit-cropper-grid"></div>
        </div>
        <p class="fsfit-cropper-help">Arraste a foto para ajustar o enquadramento e use o controle para aproximar.</p>
        <label class="fsfit-cropper-zoom"><span>−</span><input type="range" min="1" max="3" step="0.01" value="1" aria-label="Zoom da foto"><span>+</span></label>
        <div class="fsfit-cropper-actions"><button class="btn btn-neutral fsfit-cropper-cancel" type="button">Cancelar</button><button class="btn btn-primary fsfit-cropper-apply" type="button">Usar foto</button></div>
      </div>`;

    const stage = modal.querySelector('.fsfit-cropper-stage');
    const preview = modal.querySelector('img');
    const zoom = modal.querySelector('input[type="range"]');
    const apply = modal.querySelector('.fsfit-cropper-apply');
    preview.src = url;

    let baseScale = 1;
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    document.body.appendChild(modal);

    function bounds() {
      const rect = stage.getBoundingClientRect();
      const renderedW = img.naturalWidth * baseScale * scale;
      const renderedH = img.naturalHeight * baseScale * scale;
      return { maxX: Math.max(0, (renderedW - rect.width) / 2), maxY: Math.max(0, (renderedH - rect.height) / 2) };
    }

    function clamp() {
      const { maxX, maxY } = bounds();
      offsetX = Math.max(-maxX, Math.min(maxX, offsetX));
      offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
    }

    function render() {
      clamp();
      preview.style.width = `${img.naturalWidth * baseScale}px`;
      preview.style.height = `${img.naturalHeight * baseScale}px`;
      preview.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(${scale})`;
    }

    function initialize() {
      const rect = stage.getBoundingClientRect();
      baseScale = Math.max(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
      render();
    }

    function finish(value, error) {
      URL.revokeObjectURL(url);
      modal.remove();
      error ? reject(error) : resolve(value);
    }

    requestAnimationFrame(initialize);
    window.addEventListener('resize', initialize, { once: true });

    zoom.addEventListener('input', () => { scale = Number(zoom.value); render(); });
    stage.addEventListener('pointerdown', event => { dragging = true; lastX = event.clientX; lastY = event.clientY; stage.setPointerCapture(event.pointerId); });
    stage.addEventListener('pointermove', event => {
      if (!dragging) return;
      offsetX += event.clientX - lastX;
      offsetY += event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      render();
    });
    stage.addEventListener('pointerup', () => { dragging = false; });
    stage.addEventListener('pointercancel', () => { dragging = false; });

    modal.querySelector('.fsfit-cropper-close').addEventListener('click', () => finish(null));
    modal.querySelector('.fsfit-cropper-cancel').addEventListener('click', () => finish(null));
    modal.addEventListener('click', event => { if (event.target === modal) finish(null); });

    apply.addEventListener('click', async () => {
      apply.disabled = true;
      apply.textContent = 'Preparando...';
      try {
        const rect = stage.getBoundingClientRect();
        const canvas = document.createElement('canvas');
        canvas.width = config.width;
        canvas.height = config.height;
        const ctx = canvas.getContext('2d');
        const displayedW = img.naturalWidth * baseScale * scale;
        const displayedH = img.naturalHeight * baseScale * scale;
        const sourcePerCssX = img.naturalWidth / displayedW;
        const sourcePerCssY = img.naturalHeight / displayedH;
        const sourceW = rect.width * sourcePerCssX;
        const sourceH = rect.height * sourcePerCssY;
        const centerX = img.naturalWidth / 2 - offsetX * sourcePerCssX;
        const centerY = img.naturalHeight / 2 - offsetY * sourcePerCssY;
        const sourceX = Math.max(0, Math.min(img.naturalWidth - sourceW, centerX - sourceW / 2));
        const sourceY = Math.max(0, Math.min(img.naturalHeight - sourceH, centerY - sourceH / 2));
        ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, canvas.width, canvas.height);
        finish(await canvasToFile(canvas, file.name));
      } catch (error) {
        apply.disabled = false;
        apply.textContent = 'Usar foto';
        finish(null, error);
      }
    });
  });
}

document.addEventListener('change', async event => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
  const config = CROPPABLE_INPUTS[input.id];
  if (!config) return;
  if (input.dataset.cropReady === '1') {
    delete input.dataset.cropReady;
    return;
  }

  const files = [...(input.files || [])];
  if (!files.length) return;
  event.stopImmediatePropagation();

  try {
    const croppedFiles = [];
    for (let i = 0; i < files.length; i++) {
      const cropped = await cropImage(files[i], config, i, files.length);
      if (!cropped) {
        input.value = '';
        return;
      }
      croppedFiles.push(cropped);
    }

    const transfer = new DataTransfer();
    croppedFiles.forEach(file => transfer.items.add(file));
    input.files = transfer.files;
    input.dataset.cropReady = '1';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } catch (error) {
    console.error(error);
    input.value = '';
    window.alert(error.message || 'Não foi possível recortar a imagem.');
  }
}, true);
