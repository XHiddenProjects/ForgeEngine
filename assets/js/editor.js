"use strict";
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const root = document.documentElement;
  const canvas = $('#gridCanvas');
  const ctx = canvas.getContext('2d');
  const viewport = $('#viewport');

  const ICONS = { camera: '◈', light: '☀', sprite: '◆', mesh: '▰', group: '▾', collider: '⬡', ui: '▣', audio: '♪' };
  const TYPE_LABELS = { camera: 'Camera', light: 'Directional Light', sprite: 'Sprite Object', mesh: 'Mesh Object', group: 'Node Group', collider: 'Collider 2D', ui: 'UI Canvas', audio: 'Audio Source' };
  const VIEWPORT_SLOTS = {
    camera: { className: 'camera-object', markup: o => `<span>${o.icon}</span><label>${escapeHtml(o.name)}</label>` },
    light: { className: 'light-object', markup: o => `<span>${o.icon}</span><label>${escapeHtml(o.name)}</label>` },
    sprite: { className: 'sprite-object', markup: (o, selected) => selected
      ? `<div class="selection-box"><i class="handle nw"></i><i class="handle ne"></i><i class="handle sw"></i><i class="handle se"></i><div class="player-shape">${escapeHtml(o.name[0] || '?')}</div></div><label>${escapeHtml(o.name)}</label>`
      : `<div class="player-shape">${escapeHtml(o.name[0] || '?')}</div><label>${escapeHtml(o.name)}</label>` },
    mesh: { className: 'platform-object', markup: o => `<div></div><label>${escapeHtml(o.name)}</label>` }
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const state = {
    mode: '2d', tool: 'select', zoom: 1, offsetX: 0, offsetY: 0, grid: true, snap: true,
    slug: null, sceneName: 'Main', objects: [], selectedId: null, dirty: false, logs: []
  };

  const toast = msg => { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 1800); };
  const log = (level, message) => {
    state.logs.push({ level, message, time: new Date().toLocaleTimeString([], { hour12: false }) });
    renderConsole();
  };

  function renderConsole() {
    const list = $('#consoleList');
    const badge = $('#consoleBadge');
    badge.textContent = state.logs.filter(l => l.level !== 'info').length;
    list.innerHTML = state.logs.map(l => `<div><span class="${l.level}-icon">${l.level === 'error' ? '×' : l.level === 'warn' ? '!' : 'i'}</span><code>${escapeHtml(l.message)}</code><time>${l.time}</time></div>`).join('');
  }

  function markDirty(isDirty = true) {
    state.dirty = isDirty;
    $('#dirtyDot').style.visibility = isDirty ? 'visible' : 'hidden';
  }

  // ---------------------------------------------------------------
  // Loading the real game + scene from the server
  // ---------------------------------------------------------------

  function slugFromUrl() {
    const parts = location.pathname.split('/').filter(Boolean); // ["editor", "<slug>"]
    return parts.length > 1 ? decodeURIComponent(parts[1]) : null;
  }

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(body.error || `Request failed (${response.status})`), { status: response.status });
    return body;
  }

  async function loadGame() {
    const slug = slugFromUrl();
    if (!slug) { toast('No game selected'); setTimeout(() => location.assign('/'), 1200); return; }
    state.slug = slug;
    try {
      const [{ game }, status] = await Promise.all([
        api(`/api/games/${encodeURIComponent(slug)}`),
        api('/api/account/status').catch(() => null)
      ]);
      if (status?.displayName) $('#userAvatar').textContent = status.displayName.slice(0, 2).toUpperCase();

      document.title = `${game.config.name} · ForgeEngine Editor`;
      $('#projectName').textContent = game.config.name;

      let scene = { name: 'Main', objects: [] };
      try { scene = JSON.parse(game.files['scenes/main.scene.json'] || '{}'); } catch { /* fall back to empty scene */ }
      state.sceneName = scene.name || 'Main';
      state.objects = Array.isArray(scene.objects) ? scene.objects.map(withDefaults) : [];
      state.selectedId = state.objects[0]?.id || null;

      $('#sceneNameLabel').textContent = state.sceneName;
      $('#sceneHeaderName').textContent = state.sceneName;
      $('#viewportTabName').textContent = state.sceneName;

      log('info', `Loaded "${game.config.name}" (${game.config.template})`);
      if (state.objects.length === 0) log('warn', 'This scene has no objects yet — use + in the Scene panel to add one.');

      renderTree();
      renderInspector();
      renderViewportObjects();
      markDirty(false);
      loadAssets(slug);
    } catch (error) {
      if (error.status === 401) { location.assign('/'); return; }
      toast(error.message);
      log('error', error.message);
      setTimeout(() => location.assign('/'), 1600);
    }
  }

  function withDefaults(o) {
    const type = ICONS[o.type] ? o.type : 'mesh';
    return {
      id: String(o.id || `object-${Math.random().toString(36).slice(2, 8)}`),
      name: String(o.name || 'Game Object'),
      type,
      icon: o.icon || ICONS[type],
      parent: Boolean(o.parent),
      indent: Number.isFinite(o.indent) ? o.indent : 0,
      position: {
        x: Number.isFinite(o.position?.x) ? o.position.x : 0,
        y: Number.isFinite(o.position?.y) ? o.position.y : 0,
        z: Number.isFinite(o.position?.z) ? o.position.z : 0
      }
    };
  }

  // ---------------------------------------------------------------
  // Hierarchy / inspector / viewport rendering
  // ---------------------------------------------------------------

  function renderTree(filter = '') {
    const list = state.objects.filter(o => o.name.toLowerCase().includes(filter.toLowerCase()));
    $('#objectCount').textContent = `${state.objects.length} object${state.objects.length === 1 ? '' : 's'}`;
    $('#selectionCount').textContent = state.selectedId ? '1 selected' : '0 selected';

    if (state.objects.length === 0) {
      $('#sceneTree').innerHTML = `<p class="muted" style="padding:14px">No objects in this scene yet. Click <strong>+</strong> above to add one.</p>`;
      return;
    }
    $('#sceneTree').innerHTML = list.map(o => `<div class="tree-row ${o.id === state.selectedId ? 'selected' : ''}" data-id="${o.id}" data-type="${o.type}"><span class="indent" style="margin-left:${(o.indent || 0) * 12}px">${o.parent ? '⌄' : ''}</span><span class="node-icon">${o.icon}</span><span>${escapeHtml(o.name)}</span><span class="eye">◉</span></div>`).join('');
    $$('.tree-row').forEach(row => row.addEventListener('click', () => selectObject(row.dataset.id)));
  }

  function selectObject(id) {
    state.selectedId = id;
    renderTree($('#sceneSearch').value);
    renderInspector();
    renderViewportObjects();
    const o = state.objects.find(x => x.id === id);
    if (o) toast(`${o.name} selected`);
  }

  function renderInspector() {
    const o = state.objects.find(x => x.id === state.selectedId);
    $('#inspectorEmpty').style.display = o ? 'none' : 'flex';
    $('#inspectorContent').style.display = o ? 'block' : 'none';
    if (!o) return;
    $('#objectName').value = o.name;
    $('#objectType').textContent = TYPE_LABELS[o.type] || 'Game Object';
    $('#objectIcon').textContent = o.icon;
    const [x, y, z] = $$('.transform-fields .vector')[0].querySelectorAll('input');
    x.value = o.position.x; y.value = o.position.y; z.value = o.position.z;
  }

  function renderViewportObjects() {
    const container = $('#viewportObjects');
    const counts = {};
    container.innerHTML = state.objects.map(o => {
      const slot = VIEWPORT_SLOTS[o.type];
      if (!slot) return '';
      const n = counts[o.type] = (counts[o.type] || 0);
      counts[o.type]++;
      const selected = o.id === state.selectedId;
      const nudge = n * 4;
      return `<div class="scene-object ${slot.className} ${selected ? 'selected' : ''}" data-object-id="${o.id}" style="margin-left:${nudge}px;margin-top:${nudge}px">${slot.markup(o, selected)}</div>`;
    }).join('');
    $$('.scene-object').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); selectObject(el.dataset.objectId); }));
    $('#viewportHint').textContent = state.objects.length === 0
      ? 'Scene is empty · use + in the Scene panel to add your first object'
      : (state.mode === '2d' ? '2D Grid · Drag to pan · Wheel to zoom' : state.mode === '25d' ? '2.5D Perspective Grid · Depth layers enabled' : '3D Perspective Grid · Orbit controls planned');
  }

  // ---------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------

  $('#objectName').addEventListener('change', e => {
    const o = state.objects.find(x => x.id === state.selectedId);
    if (!o) return;
    o.name = e.target.value.trim() || 'Game Object';
    renderTree($('#sceneSearch').value);
    renderViewportObjects();
    markDirty();
    toast('Object renamed');
  });

  $$('.transform-fields .vector')[0]?.querySelectorAll('input').forEach((input, i) => {
    const axis = ['x', 'y', 'z'][i];
    input.addEventListener('change', () => {
      const o = state.objects.find(x => x.id === state.selectedId);
      if (!o) return;
      const value = parseFloat(input.value);
      o.position[axis] = Number.isFinite(value) ? value : 0;
      markDirty();
    });
  });

  $('#addObject').onclick = () => {
    const id = `object-${Date.now().toString(36)}`;
    const n = state.objects.length + 1;
    state.objects.push(withDefaults({ id, name: `Game Object ${n}`, type: 'mesh' }));
    markDirty();
    selectObject(id);
    renderTree($('#sceneSearch').value);
    log('info', `Added "Game Object ${n}" to the scene`);
  };

  $('#deleteObject').onclick = () => {
    const o = state.objects.find(x => x.id === state.selectedId);
    if (!o) return;
    state.objects = state.objects.filter(x => x.id !== o.id);
    state.selectedId = state.objects[0]?.id || null;
    markDirty();
    renderTree($('#sceneSearch').value);
    renderInspector();
    renderViewportObjects();
    toast(`${o.name} deleted`);
    log('info', `Deleted "${o.name}"`);
  };

  $('#addComponent').onclick = () => toast('Component browser would open here');

  // ---------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------

  async function saveScene() {
    if (!state.slug) return;
    try {
      const payload = { name: state.sceneName, objects: state.objects };
      await api(`/api/games/${encodeURIComponent(state.slug)}/scene`, { method: 'PUT', body: JSON.stringify(payload) });
      markDirty(false);
      toast('Scene saved');
      log('info', 'Scene saved');
    } catch (error) {
      toast(error.message);
      log('error', `Save failed: ${error.message}`);
    }
  }

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveScene(); }
  });

  // ---------------------------------------------------------------
  // Assets tab: real files for this game, pulled from /api/assets
  // ---------------------------------------------------------------

  function fileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return { cls: 'sprite', glyph: '◆' };
    if (['json'].includes(ext) && name.includes('scene')) return { cls: 'scene', glyph: '◇' };
    if (['js', 'ts'].includes(ext)) return { cls: 'script', glyph: 'JS' };
    if (['mp3', 'ogg', 'wav'].includes(ext)) return { cls: '', glyph: '♪' };
    return { cls: '', glyph: '◫' };
  }

  async function loadAssets(slug) {
    try {
      const { games } = await api('/api/assets');
      const entry = games.find(g => g.slug === slug);
      const grid = $('#assetGrid');
      if (!entry || entry.files.length === 0) {
        grid.innerHTML = `<p class="muted" style="padding:6px;grid-column:1/-1">No assets yet. Add files to this project's <code>assets</code> folder to see them here.</p>`;
        return;
      }
      grid.innerHTML = entry.files.map(name => {
        const { cls, glyph } = fileIcon(name);
        return `<div class="asset-card ${cls}"><div class="asset-preview">${glyph}</div><span>${escapeHtml(name)}</span></div>`;
      }).join('');
    } catch (error) {
      log('error', `Could not load assets: ${error.message}`);
    }
  }

  $('#assetSearch')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    $$('#assetGrid .asset-card').forEach(card => { card.style.display = card.querySelector('span').textContent.toLowerCase().includes(q) ? '' : 'none'; });
  });

  // ---------------------------------------------------------------
  // Grid / viewport rendering (visual chrome, unchanged from prototype)
  // ---------------------------------------------------------------

  function resizeCanvas() { const r = viewport.getBoundingClientRect(), dpr = devicePixelRatio || 1; canvas.width = Math.max(1, r.width * dpr); canvas.height = Math.max(1, r.height * dpr); canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawGrid(); }
  function drawGrid() {
    const w = viewport.clientWidth, h = viewport.clientHeight; ctx.clearRect(0, 0, w, h); ctx.fillStyle = state.mode === '3d' ? '#171a1f' : '#191c21'; ctx.fillRect(0, 0, w, h); if (!state.grid) return;
    const spacing = 32 * state.zoom, ox = (w / 2 + state.offsetX) % spacing, oy = (h / 2 + state.offsetY) % spacing;
    ctx.lineWidth = 1;
    if (state.mode === '3d' || state.mode === '25d') {
      ctx.strokeStyle = '#2a2f36'; for (let i = -h; i < w + h; i += spacing) { ctx.beginPath(); ctx.moveTo(i + state.offsetX, h); ctx.lineTo(w / 2 + state.offsetX + (i - w / 2) * .18, h * .46 + state.offsetY); ctx.stroke(); ctx.beginPath(); ctx.moveTo(w - i + state.offsetX, h); ctx.lineTo(w / 2 + state.offsetX + (w / 2 - i) * .18, h * .46 + state.offsetY); ctx.stroke(); }
      ctx.strokeStyle = '#39404a'; ctx.beginPath(); ctx.moveTo(0, h * .46 + state.offsetY); ctx.lineTo(w, h * .46 + state.offsetY); ctx.stroke();
    } else {
      ctx.strokeStyle = '#252a31'; for (let x = ox; x < w; x += spacing) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); } for (let y = oy; y < h; y += spacing) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      ctx.strokeStyle = '#343b45'; ctx.beginPath(); ctx.moveTo(w / 2 + state.offsetX, 0); ctx.lineTo(w / 2 + state.offsetX, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, h / 2 + state.offsetY); ctx.lineTo(w, h / 2 + state.offsetY); ctx.stroke();
    }
  }

  $('#sceneSearch').addEventListener('input', e => renderTree(e.target.value));
  $$('#transformTools .tool').forEach(b => b.onclick = () => { $$('#transformTools .tool').forEach(x => x.classList.remove('active')); b.classList.add('active'); state.tool = b.dataset.tool; toast(`${b.title.split(' ')[0]} tool active`); });
  $$('#viewportModes button').forEach(b => b.onclick = () => { $$('#viewportModes button').forEach(x => x.classList.remove('active')); b.classList.add('active'); state.mode = b.dataset.mode; viewport.dataset.mode = state.mode; $('#cameraMode').textContent = state.mode === '3d' ? 'Perspective' : 'Orthographic'; drawGrid(); renderViewportObjects(); toast(`${b.textContent} workspace active`); });
  $('#gridToggle').onclick = () => { state.grid = !state.grid; drawGrid(); toast(`Grid ${state.grid ? 'enabled' : 'disabled'}`); };
  $('#snapToggle').onclick = e => { state.snap = !state.snap; e.currentTarget.classList.toggle('active', state.snap); toast(`Snap ${state.snap ? 'enabled' : 'disabled'}`); };
  $('#playButton').onclick = e => { state.playing = !state.playing; e.currentTarget.classList.toggle('running', state.playing); e.currentTarget.textContent = state.playing ? '■' : '▶'; toast(state.playing ? 'Running game preview' : 'Game preview stopped'); };
  $('#pauseButton').onclick = () => toast('Game preview paused');
  $('#stopButton').onclick = () => { state.playing = false; $('#playButton').classList.remove('running'); $('#playButton').textContent = '▶'; toast('Game preview stopped'); };
  $$('.component-head').forEach(b => b.onclick = () => { const c = b.parentElement; c.classList.toggle('open'); const body = c.querySelector('.component-body'); if (body) body.style.display = c.classList.contains('open') ? 'block' : 'none'; b.querySelector('span').textContent = c.classList.contains('open') ? '⌄' : '›'; });
  $$('#bottomTabs button[data-bottom]').forEach(b => b.onclick = () => { $$('#bottomTabs button').forEach(x => x.classList.remove('active')); b.classList.add('active'); $$('.bottom-content').forEach(x => x.classList.toggle('active', x.dataset.content === b.dataset.bottom)); });

  let pan = false, lastX = 0, lastY = 0;
  viewport.addEventListener('mousedown', e => { if (e.target === canvas || e.button === 1) { pan = true; lastX = e.clientX; lastY = e.clientY; viewport.style.cursor = 'grabbing'; } });
  window.addEventListener('mouseup', () => { pan = false; viewport.style.cursor = ''; });
  window.addEventListener('mousemove', e => { const r = viewport.getBoundingClientRect(); $('#cursorPosition').innerHTML = `X ${Math.round((e.clientX - r.left - r.width / 2 - state.offsetX) / state.zoom)}&nbsp;&nbsp;Y ${Math.round((r.height / 2 - (e.clientY - r.top) + state.offsetY) / state.zoom)}`; if (pan) { state.offsetX += e.clientX - lastX; state.offsetY += e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; drawGrid(); } });
  viewport.addEventListener('wheel', e => { e.preventDefault(); state.zoom = Math.min(2.5, Math.max(.35, state.zoom * (e.deltaY < 0 ? 1.1 : .9))); $('#zoomValue').textContent = Math.round(state.zoom * 100) + '%'; drawGrid(); }, { passive: false });

  const menus = {
    File: [['New Project', 'Ctrl+N'], ['Open Project…', 'Ctrl+O'], ['Save Scene', 'Ctrl+S'], ['---', ''], ['Build Settings…', 'Ctrl+Shift+B'], ['Exit', 'Alt+F4']],
    Edit: [['Undo', 'Ctrl+Z'], ['Redo', 'Ctrl+Y'], ['---', ''], ['Duplicate', 'Ctrl+D'], ['Delete', 'Del'], ['Editor Settings…', '']],
    Assets: [['Import Asset…', ''], ['Create', '›'], ['Reimport All', '']],
    Scene: [['New Scene', ''], ['Save Scene', 'Ctrl+S'], ['Scene Settings…', '']],
    Project: [['Project Settings…', ''], ['Input Map…', ''], ['Package Manager…', '']],
    Build: [['Build Project', 'Ctrl+B'], ['Build & Run', 'Ctrl+Shift+B'], ['Export Templates…', '']],
    Window: [['Scene', ''], ['Inspector', ''], ['Assets', ''], ['Console', ''], ['Profiler', '']],
    Help: [['Documentation', 'F1'], ['Keyboard Shortcuts', ''], ['About ForgeEngine', '']]
  };
  const pop = $('#menuPopover');
  $$('[data-menu]').forEach(btn => btn.onclick = e => {
    const items = menus[btn.dataset.menu];
    pop.innerHTML = items.map(i => i[0] === '---' ? '<hr>' : `<button>${i[0]}<kbd>${i[1]}</kbd></button>`).join('');
    pop.style.left = e.currentTarget.getBoundingClientRect().left + 'px';
    pop.style.top = e.currentTarget.getBoundingClientRect().bottom + 'px';
    pop.classList.add('show');
    $$('[data-menu]').forEach(x => x.classList.toggle('active', x === btn));
    pop.querySelectorAll('button').forEach(x => x.onclick = () => {
      const label = x.firstChild.textContent;
      pop.classList.remove('show');
      if (label === 'Save Scene') saveScene();
      else toast(`${label} selected`);
    });
  });
  document.addEventListener('click', e => { if (!e.target.closest('[data-menu]') && !e.target.closest('#menuPopover')) { pop.classList.remove('show'); $$('[data-menu]').forEach(x => x.classList.remove('active')); } });

  function splitter(el, type) {
    let start, a, b;
    el.addEventListener('mousedown', e => {
      start = type === 'bottom' ? e.clientY : e.clientX;
      a = parseFloat(getComputedStyle(root).getPropertyValue(type === 'left' ? '--left' : type === 'right' ? '--right' : '--bottom'));
      el.classList.add('dragging');
      const move = m => { const delta = (type === 'bottom' ? start - m.clientY : type === 'right' ? start - m.clientX : m.clientX - start); b = Math.max(type === 'bottom' ? 120 : 170, Math.min(type === 'bottom' ? 420 : 460, a + delta)); root.style.setProperty(type === 'left' ? '--left' : type === 'right' ? '--right' : '--bottom', b + 'px'); resizeCanvas(); };
      const up = () => { el.classList.remove('dragging'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    });
  }
  $$('[data-split]').forEach(el => splitter(el, el.dataset.split));
  $('#layoutReset').onclick = () => { root.style.setProperty('--left', '235px'); root.style.setProperty('--right', '300px'); root.style.setProperty('--bottom', '224px'); setTimeout(resizeCanvas); toast('Editor layout reset'); };
  $('#closeEditor').onclick = () => { if (state.dirty && !confirm('You have unsaved changes. Leave anyway?')) return; location.assign('/'); };

  window.addEventListener('resize', resizeCanvas);
  new ResizeObserver(resizeCanvas).observe(viewport);
  resizeCanvas();
  loadGame();
})();