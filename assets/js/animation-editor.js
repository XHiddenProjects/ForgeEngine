"use strict";
(() => {
  const mount = document.getElementById('animationPanel');
  const state = window.__forgeState;
  if (!mount || !state) return;
  const api = window.__forgeApi, toast = window.__forgeToast, log = window.__forgeLog, escapeHtml = window.__forgeEscape;

  state.keyframes ||= {}; // objectId -> [{frame, position:{x,y,z}, rotation:{x,y,z}, scale:{x,y,z}}]

  const TRACKS = [
    { key: 'position.x', label: 'Pos X' }, { key: 'position.y', label: 'Pos Y' }, { key: 'position.z', label: 'Pos Z' },
    { key: 'rotation.x', label: 'Rot X' }, { key: 'rotation.y', label: 'Rot Y' }, { key: 'rotation.z', label: 'Rot Z' },
    { key: 'scale.x', label: 'Scale X' }, { key: 'scale.y', label: 'Scale Y' }, { key: 'scale.z', label: 'Scale Z' }
  ];
  const FRAME_COUNT = 120;   // 5s @ 24fps timeline length
  const FPS = 24;
  const PX_PER_FRAME = 8;

  const anim = { frame: 0, playing: false, raf: null, lastTs: 0, selectedKey: null };

  mount.innerHTML = `
    <div class="anim-editor">
      <div class="anim-toolbar">
        <label class="muted">Object</label>
        <select id="animObject" style="min-width:160px"></select>
        <button id="animAddKey" class="primary">＋ Add Keyframe</button>
        <button id="animDeleteKey">Delete Keyframe</button>
        <span class="grow"></span>
        <button id="animPlay" title="Play/Pause (Space)">▶ Play</button>
        <button id="animStop" title="Stop">■ Stop</button>
        <label class="muted">Loop <input type="checkbox" id="animLoop" checked></label>
        <input id="animAssetName" placeholder="clip-name" style="width:130px">
        <button id="animSave">💾 Save Clip as Asset</button>
      </div>
      <div class="anim-body">
        <div class="anim-stage" id="animStage">
          <div class="anim-stage-obj" id="animStageObj">◆</div>
        </div>
        <aside class="anim-side">
          <div>
            <h4>Frame</h4>
            <div class="muted" id="animFrameLabel">Frame 0 / ${FRAME_COUNT} · 0.00s</div>
          </div>
          <div style="flex:1;min-height:0;display:flex;flex-direction:column">
            <h4>Objects with Keyframes</h4>
            <div id="animClipList" style="overflow:auto;flex:1"></div>
          </div>
          <div class="muted" style="line-height:1.5">Select an object above, scrub the timeline, then <strong>Add Keyframe</strong> to record its transform at that frame. Drag diamonds on the timeline to retime them.</div>
        </aside>
      </div>
      <div class="anim-timeline">
        <div class="anim-timeline-head">
          <button id="animStepBack" title="Previous frame">⏮</button>
          <input id="animScrub" type="range" min="0" max="${FRAME_COUNT}" value="0" style="flex:1">
          <button id="animStepFwd" title="Next frame">⏭</button>
          <span class="muted">${FPS} fps</span>
        </div>
        <div class="anim-ruler" id="animRuler"></div>
        <div class="anim-tracks" id="animTracks"></div>
      </div>
    </div>`;

  const el = sel => mount.querySelector(sel);
  const objectSelect = el('#animObject');
  const tracksEl = el('#animTracks');
  const rulerEl = el('#animRuler');
  const scrub = el('#animScrub');
  const stageObj = el('#animStageObj');
  const clipListEl = el('#animClipList');

  function currentObject() {
    const id = objectSelect.value;
    return state.objects.find(o => o.id === id) || null;
  }
  function keyList(objId) { return (state.keyframes[objId] ||= []); }

  function refreshObjectList() {
    const prev = objectSelect.value;
    objectSelect.innerHTML = state.objects.length
      ? state.objects.map(o => `<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')
      : '<option value="">No objects in scene</option>';
    if (state.objects.some(o => o.id === (state.selectedId))) objectSelect.value = state.selectedId;
    else if (state.objects.some(o => o.id === prev)) objectSelect.value = prev;
  }

  function getPath(obj, path) { const [a, b] = path.split('.'); return obj?.[a]?.[b]; }
  function setPath(obj, path, v) { const [a, b] = path.split('.'); obj[a][b] = v; }

  function valueAtFrame(objId, path, frame) {
    const keys = keyList(objId).filter(k => k[path.split('.')[0]] && (path.split('.')[1] in k[path.split('.')[0]]));
    // gather explicit samples for this path from recorded keyframes (each keyframe stores full transform)
    const samples = keyList(objId).map(k => ({ frame: k.frame, value: getPath(k, path) })).sort((a, b) => a.frame - b.frame);
    if (!samples.length) return null;
    if (frame <= samples[0].frame) return samples[0].value;
    if (frame >= samples[samples.length - 1].frame) return samples[samples.length - 1].value;
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i], b = samples[i + 1];
      if (frame >= a.frame && frame <= b.frame) {
        const t = b.frame === a.frame ? 0 : (frame - a.frame) / (b.frame - a.frame);
        return a.value + (b.value - a.value) * t;
      }
    }
    return samples[samples.length - 1].value;
  }

  function renderRuler() {
    let html = '';
    for (let f = 0; f <= FRAME_COUNT; f += FPS) html += `<span style="left:${f * PX_PER_FRAME}px">${(f / FPS).toFixed(0)}s</span>`;
    rulerEl.innerHTML = html;
    rulerEl.style.minWidth = `${FRAME_COUNT * PX_PER_FRAME}px`;
  }

  function renderTracks() {
    const obj = currentObject();
    if (!obj) { tracksEl.innerHTML = '<div class="muted" style="padding:14px">Select or create an object in the scene first.</div>'; return; }
    const keys = keyList(obj.id);
    tracksEl.innerHTML = TRACKS.map(t => {
      const laneWidth = FRAME_COUNT * PX_PER_FRAME;
      const dots = keys.map(k => {
        const left = k.frame * PX_PER_FRAME;
        const active = anim.selectedKey && anim.selectedKey.objId === obj.id && anim.selectedKey.frame === k.frame && anim.selectedKey.path === t.key ? ' selected' : '';
        return `<div class="anim-key${active}" data-frame="${k.frame}" data-path="${t.key}" style="left:${left}px" title="${t.label} @ frame ${k.frame} = ${getPath(k, t.key)}"></div>`;
      }).join('');
      return `<div class="anim-track">
        <div class="anim-track-label">${t.label}</div>
        <div class="anim-track-lane" data-path="${t.key}" style="min-width:${laneWidth}px">${dots}</div>
      </div>`;
    }).join('');
  }

  function renderClipList() {
    const entries = Object.entries(state.keyframes).filter(([, v]) => v.length);
    clipListEl.innerHTML = entries.length ? entries.map(([id, frames]) => {
      const obj = state.objects.find(o => o.id === id);
      const name = obj ? obj.name : '(deleted object)';
      return `<div class="anim-clip-row${id === objectSelect.value ? ' active' : ''}" data-obj="${id}"><span>◆</span><span style="flex:1">${escapeHtml(name)}</span><span class="muted">${frames.length} key${frames.length === 1 ? '' : 's'}</span></div>`;
    }).join('') : '<div class="muted" style="padding:8px 4px">No keyframes recorded yet.</div>';
  }

  function updateStagePreview() {
    const obj = currentObject();
    const track = el('#animStage');
    const w = track.clientWidth, h = track.clientHeight;
    if (!obj) { stageObj.style.display = 'none'; return; }
    stageObj.style.display = 'flex';
    const px = valueAtFrame(obj.id, 'position.x', anim.frame);
    const py = valueAtFrame(obj.id, 'position.y', anim.frame);
    const rz = valueAtFrame(obj.id, 'rotation.z', anim.frame);
    const sx = valueAtFrame(obj.id, 'scale.x', anim.frame);
    const sy = valueAtFrame(obj.id, 'scale.y', anim.frame);
    const baseX = px != null ? px : obj.position.x;
    const baseY = py != null ? py : obj.position.y;
    const rot = rz != null ? rz : (obj.rotation?.z || 0);
    const scaleX = sx != null ? sx : (obj.scale?.x ?? 1);
    const scaleY = sy != null ? sy : (obj.scale?.y ?? 1);
    const cx = w / 2 + baseX, cy = h / 2 - baseY;
    stageObj.style.transform = `translate(${cx - 32}px, ${cy - 32}px) rotate(${rot}deg) scale(${scaleX}, ${scaleY})`;
    // scrub the live scene too, so the main viewport reflects the current pose while previewing
    if (px != null) obj.position.x = px;
    if (py != null) obj.position.y = py;
    const pz = valueAtFrame(obj.id, 'position.z', anim.frame); if (pz != null) obj.position.z = pz;
    if (rz != null) obj.rotation.z = rz;
    const rx = valueAtFrame(obj.id, 'rotation.x', anim.frame); if (rx != null) obj.rotation.x = rx;
    const ry = valueAtFrame(obj.id, 'rotation.y', anim.frame); if (ry != null) obj.rotation.y = ry;
    if (sx != null) obj.scale.x = sx;
    if (sy != null) obj.scale.y = sy;
    const sz = valueAtFrame(obj.id, 'scale.z', anim.frame); if (sz != null) obj.scale.z = sz;
    window.forgeRedraw3D?.();
  }

  function setFrame(f) {
    anim.frame = Math.max(0, Math.min(FRAME_COUNT, Math.round(f)));
    scrub.value = anim.frame;
    el('#animFrameLabel').textContent = `Frame ${anim.frame} / ${FRAME_COUNT} · ${(anim.frame / FPS).toFixed(2)}s`;
    document.querySelectorAll('.anim-playhead').forEach(p => p.remove());
    const ruler = rulerEl.getBoundingClientRect();
    let playhead = tracksEl.querySelector('.anim-playhead-line');
    tracksEl.querySelectorAll('.anim-track-lane').forEach(lane => {
      let ph = lane.querySelector('.anim-playhead');
      if (!ph) { ph = document.createElement('div'); ph.className = 'anim-playhead'; lane.appendChild(ph); }
      ph.style.left = `${anim.frame * PX_PER_FRAME}px`;
    });
    updateStagePreview();
  }

  function render() { refreshObjectList(); renderRuler(); renderTracks(); renderClipList(); setFrame(anim.frame); }

  objectSelect.addEventListener('change', () => { anim.selectedKey = null; renderTracks(); renderClipList(); updateStagePreview(); });
  clipListEl.addEventListener('click', e => {
    const row = e.target.closest('[data-obj]');
    if (!row) return;
    objectSelect.value = row.dataset.obj;
    anim.selectedKey = null;
    renderTracks(); renderClipList(); updateStagePreview();
  });

  scrub.addEventListener('input', () => setFrame(Number(scrub.value)));
  el('#animStepBack').addEventListener('click', () => setFrame(anim.frame - 1));
  el('#animStepFwd').addEventListener('click', () => setFrame(anim.frame + 1));

  el('#animAddKey').addEventListener('click', () => {
    const obj = currentObject();
    if (!obj) { toast('Select an object first'); return; }
    const keys = keyList(obj.id);
    const existing = keys.find(k => k.frame === anim.frame);
    const snapshot = { frame: anim.frame, position: { ...obj.position }, rotation: { ...obj.rotation }, scale: { ...obj.scale } };
    if (existing) Object.assign(existing, snapshot); else { keys.push(snapshot); keys.sort((a, b) => a.frame - b.frame); }
    renderTracks(); renderClipList();
    toast(`Keyframe recorded at frame ${anim.frame} for "${obj.name}"`);
    log('info', `Animation: recorded keyframe #${anim.frame} for "${obj.name}"`);
  });

  el('#animDeleteKey').addEventListener('click', () => {
    const obj = currentObject();
    if (!obj) return;
    const keys = keyList(obj.id);
    const idx = keys.findIndex(k => k.frame === anim.frame);
    if (idx === -1) { toast('No keyframe on this frame'); return; }
    keys.splice(idx, 1);
    renderTracks(); renderClipList();
    toast('Keyframe deleted');
  });

  // Drag keys along the timeline to retime them.
  let dragKey = null;
  tracksEl.addEventListener('mousedown', e => {
    const dot = e.target.closest('.anim-key');
    if (!dot) return;
    const obj = currentObject();
    if (!obj) return;
    anim.selectedKey = { objId: obj.id, frame: Number(dot.dataset.frame), path: dot.dataset.path };
    dragKey = { objId: obj.id, startFrame: Number(dot.dataset.frame) };
    renderTracks();
  });
  document.addEventListener('mousemove', e => {
    if (!dragKey) return;
    const lane = tracksEl.querySelector('.anim-track-lane');
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    const frame = Math.max(0, Math.min(FRAME_COUNT, Math.round((e.clientX - rect.left) / PX_PER_FRAME)));
    if (frame === dragKey.startFrame) return;
    const keys = keyList(dragKey.objId);
    const k = keys.find(x => x.frame === dragKey.startFrame);
    if (!k || keys.some(x => x.frame === frame)) return;
    k.frame = frame;
    dragKey.startFrame = frame;
    keys.sort((a, b) => a.frame - b.frame);
    renderTracks();
  });
  document.addEventListener('mouseup', () => { dragKey = null; });

  // Click empty lane space to scrub to that frame.
  tracksEl.addEventListener('click', e => {
    if (e.target.closest('.anim-key')) return;
    const lane = e.target.closest('.anim-track-lane');
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    setFrame((e.clientX - rect.left) / PX_PER_FRAME);
  });

  function playLoop(ts) {
    if (!anim.playing) return;
    if (!anim.lastTs) anim.lastTs = ts;
    const dt = (ts - anim.lastTs) / 1000;
    anim.lastTs = ts;
    let next = anim.frame + dt * FPS;
    if (next > FRAME_COUNT) { next = el('#animLoop').checked ? 0 : FRAME_COUNT; if (!el('#animLoop').checked) { stopPlayback(); return; } }
    setFrame(next);
    anim.raf = requestAnimationFrame(playLoop);
  }
  function stopPlayback() {
    anim.playing = false; anim.lastTs = 0;
    cancelAnimationFrame(anim.raf);
    el('#animPlay').textContent = '▶ Play';
  }
  el('#animPlay').addEventListener('click', () => {
    anim.playing = !anim.playing;
    el('#animPlay').textContent = anim.playing ? '⏸ Pause' : '▶ Play';
    if (anim.playing) { anim.lastTs = 0; anim.raf = requestAnimationFrame(playLoop); }
    else cancelAnimationFrame(anim.raf);
  });
  el('#animStop').addEventListener('click', () => { stopPlayback(); setFrame(0); });

  document.addEventListener('keydown', e => {
    if (!mount.classList.contains('active') || !mount.offsetParent) return;
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); el('#animPlay').click(); }
  });

  el('#animSave').addEventListener('click', async () => {
    if (!state.slug) return;
    const obj = currentObject();
    if (!obj) { toast('Select an object first'); return; }
    const keys = keyList(obj.id);
    if (!keys.length) { toast('Record at least one keyframe first'); return; }
    const name = el('#animAssetName').value.trim() || `${obj.name.replace(/\s+/g, '-').toLowerCase()}-clip`;
    const clip = { name, fps: FPS, length: FRAME_COUNT, target: obj.name, keyframes: keys };
    try {
      const payload = { name: `${name}.anim.json`, category: 'other', mime: 'application/json',
        dataUrl: `data:application/json;base64,${btoa(unescape(encodeURIComponent(JSON.stringify(clip, null, 2))))}` };
      await api(`/api/games/${encodeURIComponent(state.slug)}/assets`, { method: 'POST', body: JSON.stringify(payload) });
      toast(`Saved animation clip "${name}" to Assets`);
      log('info', `Animation clip "${name}" saved (${keys.length} keyframes)`);
      window.__forgeLoadAssets?.();
    } catch (error) { toast(error.message); }
  });

  window.addEventListener('forge-tool-modal-open', e => { if (e.detail?.name === 'animation') render(); });
  window.addEventListener('resize', () => { if (mount.classList.contains('active')) updateStagePreview(); });
  window.__forgeRenderKeyframes = render;

  render();
})();
