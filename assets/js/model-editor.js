"use strict";
(() => {
  const mount = document.getElementById('modelPanel');
  const state = window.__forgeState;
  if (!mount || !state) return;
  const api = window.__forgeApi, toast = window.__forgeToast, log = window.__forgeLog, escapeHtml = window.__forgeEscape;

  const PRIMS = { box: '▰', sphere: '◯', cylinder: '▮', cone: '▲', plane: '▭' };
  const model = { name: 'New Model', primitives: [] };
  let selected = null;
  // Looks down at the model from above by default (negative pitch), matching the main viewport fix.
  const cam = { yaw: 0.6, pitch: -0.5, zoom: 1 };

  function newPrimitive(type) {
    return { id: `p${Date.now().toString(36)}${Math.floor(Math.random() * 999)}`, type,
      position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: '#41a6f6' };
  }

  mount.innerHTML = `
    <div class="forge-tool">
      <aside class="forge-tool__rail">
        <div>
          <h4>Add Primitive</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
            ${Object.entries(PRIMS).map(([t, g]) => `<button data-add="${t}">${g} ${t}</button>`).join('')}
          </div>
        </div>
        <div style="flex:1;min-height:0;display:flex;flex-direction:column">
          <h4>Primitives</h4>
          <div id="modelList" style="overflow:auto;flex:1;display:flex;flex-direction:column;gap:4px"></div>
        </div>
      </aside>
      <div class="forge-tool__main">
        <div class="forge-tool__toolbar">
          <input id="modelName" placeholder="model-name" value="${escapeHtml(model.name)}" style="width:160px">
          <button id="modelSave">💾 Save as Asset</button>
          <button id="modelClear">Clear</button>
          <span class="muted" style="margin-left:auto">Drag to orbit · Wheel to zoom</span>
        </div>
        <div class="forge-tool__stage"><canvas id="modelCanvas"></canvas></div>
        <div class="forge-tool__panel" id="modelInspector"><span class="muted">Select a primitive to edit its transform.</span></div>
      </div>
    </div>`;

  const canvas = mount.querySelector('#modelCanvas');
  const ctx = canvas.getContext('2d');

  function resize() {
    const stage = mount.querySelector('.forge-tool__stage');
    canvas.width = stage.clientWidth; canvas.height = stage.clientHeight;
    render();
  }
  new ResizeObserver(resize).observe(mount.querySelector('.forge-tool__stage'));

  function project(p) {
    const w = canvas.width, h = canvas.height;
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const x = p.x, y = p.y, z = p.z;
    const rx = x * cy - z * sy, rz = x * sy + z * cy;
    const ry = y * cp - rz * sp, depth = y * sp + rz * cp;
    const scale = Math.max(0.3, 1 - depth * 0.02);
    const px = 40 * cam.zoom * scale;
    return { x: w / 2 + rx * px, y: h / 2 - ry * px, depth, scale };
  }

  function drawGround() {
    ctx.strokeStyle = '#2b3139';
    for (let i = -6; i <= 6; i++) {
      const a = project({ x: i, y: 0, z: -6 }), b = project({ x: i, y: 0, z: 6 });
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      const c = project({ x: -6, y: 0, z: i }), d = project({ x: 6, y: 0, z: i });
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
    }
  }

  function drawPrimitive(prim) {
    const p = project(prim.position);
    const size = 22 * p.scale * Math.max(prim.scale.x, prim.scale.y, prim.scale.z, 0.2);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate((prim.rotation.z || 0) * Math.PI / 180);
    ctx.fillStyle = prim.color;
    ctx.strokeStyle = prim.id === selected ? '#ff9d58' : '#12141a';
    ctx.lineWidth = prim.id === selected ? 2.5 : 1;
    ctx.beginPath();
    if (prim.type === 'sphere') ctx.arc(0, 0, size, 0, Math.PI * 2);
    else if (prim.type === 'cone') { ctx.moveTo(0, -size); ctx.lineTo(size, size); ctx.lineTo(-size, size); ctx.closePath(); }
    else if (prim.type === 'plane') ctx.rect(-size, -size * 0.15, size * 2, size * 0.3);
    else if (prim.type === 'cylinder') { ctx.ellipse(0, 0, size, size * 0.55, 0, 0, Math.PI * 2); }
    else ctx.rect(-size, -size, size * 2, size * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#14161a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGround();
    model.primitives.map(p => ({ p, d: project(p.position).depth })).sort((a, b) => a.d - b.d).forEach(x => drawPrimitive(x.p));
  }

  let drag = null;
  canvas.addEventListener('mousedown', e => {
    // hit-test primitives first (closest screen point wins)
    let hit = null, best = 26;
    for (const prim of model.primitives) {
      const p = project(prim.position);
      const d = Math.hypot(e.offsetX - p.x, e.offsetY - p.y);
      if (d < best) { best = d; hit = prim; }
    }
    if (hit) { selected = hit.id; renderInspector(); render(); return; }
    drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch };
  });
  canvas.addEventListener('mousemove', e => {
    if (!drag) return;
    cam.yaw = drag.yaw + (e.clientX - drag.x) * 0.008;
    cam.pitch = Math.max(-1.3, Math.min(1.3, drag.pitch + (e.clientY - drag.y) * 0.008));
    render();
  });
  addEventListener('mouseup', () => drag = null);
  canvas.addEventListener('wheel', e => { e.preventDefault(); cam.zoom = Math.max(.3, Math.min(3, cam.zoom * (e.deltaY < 0 ? 1.1 : .9))); render(); }, { passive: false });

  function renderList() {
    mount.querySelector('#modelList').innerHTML = model.primitives.map(p => `
      <button data-select="${p.id}" style="display:flex;align-items:center;gap:6px;justify-content:space-between;${p.id === selected ? 'background:#30353d' : ''}">
        <span>${PRIMS[p.type]} ${escapeHtml(p.type)}</span><span data-remove="${p.id}" style="color:#9298a1">×</span>
      </button>`).join('') || '<span class="muted">No primitives yet — add one from the left.</span>';
  }

  function renderInspector() {
    const panel = mount.querySelector('#modelInspector');
    const prim = model.primitives.find(p => p.id === selected);
    if (!prim) { panel.innerHTML = '<span class="muted">Select a primitive to edit its transform.</span>'; return; }
    const vec = (label, key) => `<div class="field-row" style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
      <label style="width:60px">${label}</label>
      ${['x', 'y', 'z'].map(ax => `<input data-vec="${key}.${ax}" type="number" step="0.1" value="${prim[key][ax]}" style="width:64px">`).join('')}
    </div>`;
    panel.innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <div>${vec('Position', 'position')}${vec('Rotation', 'rotation')}${vec('Scale', 'scale')}</div>
        <div><h4>Color</h4><input type="color" value="${prim.color}" id="modelColor"></div>
      </div>`;
    panel.querySelectorAll('[data-vec]').forEach(input => input.addEventListener('input', () => {
      const [key, ax] = input.dataset.vec.split('.');
      prim[key][ax] = Number(input.value) || 0;
      render();
    }));
    panel.querySelector('#modelColor').addEventListener('input', e => { prim.color = e.target.value; render(); });
  }

  mount.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => {
    const prim = newPrimitive(btn.dataset.add);
    prim.position = { x: (Math.random() - 0.5) * 2, y: 0.5, z: (Math.random() - 0.5) * 2 };
    model.primitives.push(prim);
    selected = prim.id;
    renderList(); renderInspector(); render();
  }));

  mount.querySelector('#modelList').addEventListener('click', e => {
    const rm = e.target.closest('[data-remove]');
    if (rm) { model.primitives = model.primitives.filter(p => p.id !== rm.dataset.remove); if (selected === rm.dataset.remove) selected = null; renderList(); renderInspector(); render(); return; }
    const sel = e.target.closest('[data-select]');
    if (sel) { selected = sel.dataset.select; renderList(); renderInspector(); render(); }
  });

  mount.querySelector('#modelClear').addEventListener('click', () => {
    if (model.primitives.length && !window.confirm('Clear all primitives?')) return;
    model.primitives = []; selected = null; renderList(); renderInspector(); render();
  });

  mount.querySelector('#modelSave').addEventListener('click', async () => {
    if (!state.slug) return;
    const name = mount.querySelector('#modelName').value.trim() || `model-${Date.now()}`;
    if (!model.primitives.length) { toast('Add at least one primitive first'); return; }
    try {
      const payload = { name: `${name}.model.json`, category: 'model', mime: 'application/json',
        dataUrl: `data:application/json;base64,${btoa(unescape(encodeURIComponent(JSON.stringify({ name, primitives: model.primitives }, null, 2))))}` };
      await api(`/api/games/${encodeURIComponent(state.slug)}/assets`, { method: 'POST', body: JSON.stringify(payload) });
      toast(`Saved model "${name}" to Assets`);
      log('info', `Model saved as asset "${name}" (${model.primitives.length} primitives)`);
      window.__forgeLoadAssets?.();
    } catch (error) { toast(error.message); }
  });

  renderList(); renderInspector();
  resize();
})();