"use strict";
(() => {
  const mount = document.getElementById('pixelPanel');
  const state = window.__forgeState;
  if (!mount || !state) return;
  const api = window.__forgeApi, toast = window.__forgeToast, log = window.__forgeLog;

  const SIZES = [8, 16, 24, 32, 48, 64];
  const PALETTE = ['#000000', '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764',
    '#257179', '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86'];

  const px = { w: 16, h: 16, data: null, color: PALETTE[13], tool: 'pencil', zoom: 20, history: [], future: [] };

  function blank(w, h) { return new Array(w * h).fill(null); }
  px.data = blank(px.w, px.h);

  mount.innerHTML = `
    <div class="forge-tool">
      <aside class="forge-tool__rail">
        <div>
          <h4>Canvas</h4>
          <select id="pxSize">${SIZES.map(s => `<option value="${s}" ${s === 16 ? 'selected' : ''}>${s}×${s}</option>`).join('')}</select>
          <button id="pxNew" style="width:100%;margin-top:6px">New Canvas</button>
        </div>
        <div>
          <h4>Tools</h4>
          <div style="display:flex;gap:4px;flex-wrap:wrap">
            <button data-tool="pencil" class="active" title="Pencil (B)">✏</button>
            <button data-tool="eraser" title="Eraser (E)">▭</button>
            <button data-tool="fill" title="Fill (G)">▨</button>
            <button data-tool="eyedropper" title="Eyedropper (I)">◎</button>
          </div>
        </div>
        <div>
          <h4>Palette</h4>
          <div id="pxPalette" style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px"></div>
          <input id="pxColor" type="color" value="${px.color}" style="width:100%;margin-top:6px;height:26px">
        </div>
        <div>
          <h4>History</h4>
          <div style="display:flex;gap:4px">
            <button id="pxUndo" style="flex:1">Undo</button>
            <button id="pxRedo" style="flex:1">Redo</button>
          </div>
        </div>
      </aside>
      <div class="forge-tool__main">
        <div class="forge-tool__toolbar">
          <input id="pxAssetName" placeholder="sprite-name.png" style="width:180px">
          <button id="pxSave">💾 Save as Asset</button>
          <button id="pxExport">⇩ Export PNG</button>
          <span class="muted" style="margin-left:auto" id="pxZoomLabel">Zoom 20px/cell</span>
        </div>
        <div class="forge-tool__stage">
          <canvas id="pxCanvas" style="image-rendering:pixelated;border:1px solid #3a3f47;background:
            repeating-conic-gradient(#26292f 0% 25%, #1c1e22 0% 50%) 50% / 16px 16px;"></canvas>
        </div>
      </div>
    </div>`;

  const canvas = mount.querySelector('#pxCanvas');
  const ctx = canvas.getContext('2d');
  const paletteEl = mount.querySelector('#pxPalette');
  const colorInput = mount.querySelector('#pxColor');

  function renderPalette() {
    paletteEl.innerHTML = PALETTE.map(c => `<button class="forge-swatch${c === px.color ? ' active' : ''}" style="background:${c}" data-color="${c}"></button>`).join('');
  }
  renderPalette();

  function resizeCanvas() {
    canvas.width = px.w * px.zoom;
    canvas.height = px.h * px.zoom;
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < px.h; y++) {
      for (let x = 0; x < px.w; x++) {
        const c = px.data[y * px.w + x];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x * px.zoom, y * px.zoom, px.zoom, px.zoom);
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let x = 0; x <= px.w; x++) { ctx.beginPath(); ctx.moveTo(x * px.zoom, 0); ctx.lineTo(x * px.zoom, canvas.height); ctx.stroke(); }
    for (let y = 0; y <= px.h; y++) { ctx.beginPath(); ctx.moveTo(0, y * px.zoom); ctx.lineTo(canvas.width, y * px.zoom); ctx.stroke(); }
  }

  function pushHistory() {
    px.history.push(px.data.slice());
    if (px.history.length > 60) px.history.shift();
    px.future.length = 0;
  }

  function cellAt(e) {
    const r = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / (r.width / px.w));
    const y = Math.floor((e.clientY - r.top) / (r.height / px.h));
    if (x < 0 || y < 0 || x >= px.w || y >= px.h) return null;
    return { x, y };
  }

  function floodFill(x0, y0, target, replacement) {
    if (target === replacement) return;
    const stack = [[x0, y0]];
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= px.w || y >= px.h) continue;
      const i = y * px.w + x;
      if (px.data[i] !== target) continue;
      px.data[i] = replacement;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }

  let painting = false;
  function applyTool(cell) {
    const i = cell.y * px.w + cell.x;
    if (px.tool === 'pencil') px.data[i] = px.color;
    else if (px.tool === 'eraser') px.data[i] = null;
    else if (px.tool === 'fill') floodFill(cell.x, cell.y, px.data[i], px.color);
    else if (px.tool === 'eyedropper') { if (px.data[i]) { px.color = px.data[i]; colorInput.value = px.color; renderPalette(); } }
    draw();
  }

  canvas.addEventListener('mousedown', e => {
    const cell = cellAt(e);
    if (!cell) return;
    pushHistory();
    painting = true;
    applyTool(cell);
  });
  canvas.addEventListener('mousemove', e => {
    if (!painting || px.tool === 'fill' || px.tool === 'eyedropper') return;
    const cell = cellAt(e);
    if (cell) applyTool(cell);
  });
  addEventListener('mouseup', () => painting = false);

  mount.querySelectorAll('[data-tool]').forEach(btn => btn.addEventListener('click', () => {
    mount.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    px.tool = btn.dataset.tool;
  }));

  paletteEl.addEventListener('click', e => {
    const sw = e.target.closest('[data-color]');
    if (!sw) return;
    px.color = sw.dataset.color;
    colorInput.value = px.color;
    renderPalette();
  });
  colorInput.addEventListener('input', () => { px.color = colorInput.value; renderPalette(); });

  mount.querySelector('#pxUndo').addEventListener('click', () => {
    if (!px.history.length) return;
    px.future.push(px.data.slice());
    px.data = px.history.pop();
    draw();
  });
  mount.querySelector('#pxRedo').addEventListener('click', () => {
    if (!px.future.length) return;
    px.history.push(px.data.slice());
    px.data = px.future.pop();
    draw();
  });

  mount.querySelector('#pxNew').addEventListener('click', () => {
    const size = Number(mount.querySelector('#pxSize').value);
    if (px.data.some(Boolean) && !window.confirm('Start a new canvas? Unsaved pixels will be lost.')) return;
    px.w = px.h = size;
    px.data = blank(size, size);
    px.history = []; px.future = [];
    resizeCanvas();
  });

  function toPNGDataUrl() {
    const out = document.createElement('canvas');
    out.width = px.w; out.height = px.h;
    const octx = out.getContext('2d');
    for (let y = 0; y < px.h; y++) for (let x = 0; x < px.w; x++) {
      const c = px.data[y * px.w + x];
      if (c) { octx.fillStyle = c; octx.fillRect(x, y, 1, 1); }
    }
    return out.toDataURL('image/png');
  }

  mount.querySelector('#pxExport').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = toPNGDataUrl();
    a.download = (mount.querySelector('#pxAssetName').value || 'sprite') + '.png';
    a.click();
  });

  mount.querySelector('#pxSave').addEventListener('click', async () => {
    if (!state.slug) return;
    const name = mount.querySelector('#pxAssetName').value.trim() || `sprite-${Date.now()}.png`;
    try {
      await api(`/api/games/${encodeURIComponent(state.slug)}/assets`, {
        method: 'POST',
        body: JSON.stringify({ name: name.endsWith('.png') ? name : `${name}.png`, category: 'image', mime: 'image/png', dataUrl: toPNGDataUrl() })
      });
      toast(`Saved "${name}" to Assets`);
      log('info', `Pixel art saved as asset "${name}"`);
      window.__forgeLoadAssets?.();
    } catch (error) { toast(error.message); }
  });

  document.addEventListener('keydown', e => {
    if (!mount.classList.contains('active') || !mount.offsetParent || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const map = { b: 'pencil', e: 'eraser', g: 'fill', i: 'eyedropper' };
    const tool = map[e.key.toLowerCase()];
    if (tool) mount.querySelector(`[data-tool="${tool}"]`)?.click();
  });

  resizeCanvas();
})();