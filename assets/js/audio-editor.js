"use strict";
(() => {
  const mount = document.getElementById('audioPanel');
  const state = window.__forgeState;
  if (!mount || !state) return;
  const api = window.__forgeApi, toast = window.__forgeToast, log = window.__forgeLog, escapeHtml = window.__forgeEscape;

  const WAVES = ['sine', 'square', 'sawtooth', 'triangle'];
  const audio = {
    ctx: null,
    tracks: [], // { id, name, buffer, gain, pan, muted, solo, color }
    selectedId: null,
    playing: false,
    playStart: 0,
    sources: [],
    trim: { start: 0, end: 1 }
  };
  let idSeq = 0;
  const COLORS = ['#41a6f6', '#e4813a', '#38b764', '#b13e53', '#a7f070', '#73eff7'];

  mount.innerHTML = `
    <div class="audio-editor">
      <aside class="audio-side">
        <div>
          <h4>Generate</h4>
          <select id="audWave" style="width:100%">${WAVES.map(w => `<option value="${w}">${w}</option>`).join('')}<option value="noise">noise</option></select>
          <div style="display:flex;gap:4px;margin-top:6px">
            <input id="audFreq" type="number" value="440" min="20" max="8000" style="width:70px" title="Frequency (Hz)">
            <input id="audDur" type="number" value="0.6" min="0.05" max="6" step="0.05" style="width:60px" title="Duration (s)">
          </div>
          <button id="audGenerate" style="width:100%;margin-top:6px">✨ Generate Tone</button>
        </div>
        <div style="flex:1;min-height:0;display:flex;flex-direction:column">
          <h4>Tracks</h4>
          <div id="audTrackList" style="overflow:auto;flex:1"></div>
        </div>
        <div class="muted" style="line-height:1.5">Generate a tone/noise clip, import audio from your Assets, or record from the mic. Drag the trim handles on the waveform to clip a track before saving.</div>
      </aside>
      <div class="audio-main">
        <div class="audio-toolbar">
          <button id="audImport">⇩ Import from Assets</button>
          <button id="audRecord">● Record Mic</button>
          <span class="grow"></span>
          <button id="audPlay">▶ Play</button>
          <button id="audStop">■ Stop</button>
          <button id="audTrimApply">✂ Trim to Selection</button>
          <input id="audAssetName" placeholder="sound-name" style="width:130px">
          <button id="audSave">💾 Save as Asset</button>
        </div>
        <div class="audio-wave-wrap"><canvas id="audCanvas"></canvas></div>
        <div class="audio-mixer" id="audMixer"></div>
      </div>
    </div>`;

  const el = sel => mount.querySelector(sel);
  const canvas = el('#audCanvas');
  const ctx2d = canvas.getContext('2d');
  const listEl = el('#audTrackList');
  const mixerEl = el('#audMixer');

  function ensureCtx() {
    if (!audio.ctx) { const A = window.AudioContext || window.webkitAudioContext; if (!A) { toast('Web Audio unavailable in this browser'); return null; } audio.ctx = new A(); }
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
    return audio.ctx;
  }

  function selectedTrack() { return audio.tracks.find(t => t.id === audio.selectedId) || null; }

  function addTrack(name, buffer) {
    const track = { id: `t${idSeq++}`, name, buffer, gain: 0.8, pan: 0, muted: false, solo: false, color: COLORS[audio.tracks.length % COLORS.length] };
    audio.tracks.push(track);
    audio.selectedId = track.id;
    audio.trim = { start: 0, end: 1 };
    renderAll();
    return track;
  }

  function renderList() {
    listEl.innerHTML = audio.tracks.length ? audio.tracks.map(t => `
      <div class="audio-track-item${t.id === audio.selectedId ? ' active' : ''}" data-id="${t.id}">
        <span style="width:8px;height:8px;border-radius:50%;background:${t.color}"></span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(t.name)}</span>
        <span class="muted">${t.buffer ? t.buffer.duration.toFixed(2) + 's' : ''}</span>
        <span data-remove="${t.id}" style="color:#9298a1;cursor:pointer" title="Remove">×</span>
      </div>`).join('') : '<div class="muted" style="padding:8px 4px">No tracks yet — generate a tone or import audio.</div>';
  }

  function renderMixer() {
    mixerEl.innerHTML = audio.tracks.map(t => `
      <div class="audio-channel" data-mixer="${t.id}">
        <div class="lbl">${escapeHtml(t.name)}</div>
        <input type="range" data-gain min="0" max="1" step="0.01" value="${t.gain}">
        <div style="display:flex;gap:3px">
          <button data-mute style="width:24px;padding:2px 0;${t.muted ? 'background:#a4394a;color:#fff' : ''}">M</button>
          <button data-solo style="width:24px;padding:2px 0;${t.solo ? 'background:#41a6f6;color:#fff' : ''}">S</button>
        </div>
        <input type="range" data-pan min="-1" max="1" step="0.1" value="${t.pan}" title="Pan" style="writing-mode:horizontal-tb;height:auto;width:56px">
      </div>`).join('') || '<span class="muted" style="padding:6px">Mixer channels appear once you add a track.</span>';
  }

  function renderWave() {
    const stage = canvas.parentElement;
    canvas.width = stage.clientWidth; canvas.height = stage.clientHeight;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    const t = selectedTrack();
    if (!t || !t.buffer) {
      ctx2d.fillStyle = '#5c6270'; ctx2d.font = '12px sans-serif'; ctx2d.textAlign = 'center';
      ctx2d.fillText('Select or create a track to see its waveform', canvas.width / 2, canvas.height / 2);
      return;
    }
    const data = t.buffer.getChannelData(0);
    const w = canvas.width, h = canvas.height, mid = h / 2;
    const step = Math.max(1, Math.floor(data.length / w));
    ctx2d.strokeStyle = t.color; ctx2d.lineWidth = 1; ctx2d.beginPath();
    for (let x = 0; x < w; x++) {
      let min = 1, max = -1;
      const from = x * step;
      for (let i = 0; i < step; i++) { const v = data[from + i] || 0; if (v < min) min = v; if (v > max) max = v; }
      ctx2d.moveTo(x, mid + min * mid * 0.9);
      ctx2d.lineTo(x, mid + max * mid * 0.9);
    }
    ctx2d.stroke();
    ctx2d.strokeStyle = 'rgba(255,255,255,.08)'; ctx2d.beginPath(); ctx2d.moveTo(0, mid); ctx2d.lineTo(w, mid); ctx2d.stroke();
    // trim selection overlay
    const sx = audio.trim.start * w, ex = audio.trim.end * w;
    ctx2d.fillStyle = 'rgba(65,166,246,0.12)'; ctx2d.fillRect(sx, 0, ex - sx, h);
    ctx2d.fillStyle = '#41a6f6';
    ctx2d.fillRect(sx - 2, 0, 4, h);
    ctx2d.fillRect(ex - 2, 0, 4, h);
    // playhead
    if (audio.playing) {
      const elapsed = audio.ctx.currentTime - audio.playStart;
      const px = (elapsed / t.buffer.duration) * w;
      if (px >= 0 && px <= w) { ctx2d.strokeStyle = '#ff5d73'; ctx2d.beginPath(); ctx2d.moveTo(px, 0); ctx2d.lineTo(px, h); ctx2d.stroke(); }
    }
  }

  function renderAll() { renderList(); renderMixer(); renderWave(); }

  // ---- generation ----
  function generateBuffer(type, freq, dur) {
    const c = ensureCtx(); if (!c) return null;
    const sr = c.sampleRate, len = Math.max(1, Math.floor(sr * dur));
    const buffer = c.createBuffer(1, len, sr);
    const d = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.min(1, i / (sr * 0.01)) * Math.min(1, (len - i) / (sr * 0.03)); // quick attack/release to avoid clicks
      let v = 0;
      if (type === 'noise') v = Math.random() * 2 - 1;
      else if (type === 'sine') v = Math.sin(2 * Math.PI * freq * t);
      else if (type === 'square') v = Math.sign(Math.sin(2 * Math.PI * freq * t));
      else if (type === 'sawtooth') v = 2 * (t * freq - Math.floor(0.5 + t * freq));
      else if (type === 'triangle') v = 2 * Math.abs(2 * (t * freq - Math.floor(t * freq + 0.5))) - 1;
      d[i] = v * env * 0.6;
    }
    return buffer;
  }

  el('#audGenerate').addEventListener('click', () => {
    const wave = el('#audWave').value, freq = Number(el('#audFreq').value) || 440, dur = Number(el('#audDur').value) || 0.5;
    const buffer = generateBuffer(wave, freq, dur);
    if (!buffer) return;
    addTrack(`${wave}-${freq}hz`, buffer);
    toast(`Generated ${wave} tone`);
  });

  // ---- import from asset library ----
  el('#audImport').addEventListener('click', async () => {
    if (!state.slug) { toast('No project loaded'); return; }
    try {
      const assets = await api(`/api/games/${encodeURIComponent(state.slug)}/assets`);
      const audioAssets = (assets.assets || assets || []).filter(a => a.category === 'audio');
      if (!audioAssets.length) { toast('No audio assets found in this project'); return; }
      window.__forgeOpenPicker ? window.__forgeOpenPicker(audioAssets, pickAsset) : pickAsset(audioAssets[0]);
    } catch (error) { toast('Could not load assets: ' + error.message); }
  });
  async function pickAsset(asset) {
    const c = ensureCtx(); if (!c) return;
    try {
      const res = await fetch(asset.url || asset.dataUrl);
      const arr = await res.arrayBuffer();
      const buffer = await c.decodeAudioData(arr);
      addTrack(asset.name, buffer);
      toast(`Imported "${asset.name}"`);
    } catch { toast('Could not decode that audio file'); }
  }

  // ---- mic recording ----
  let recorder = null, recChunks = [];
  el('#audRecord').addEventListener('click', async () => {
    if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);
      recChunks = [];
      recorder.ondataavailable = e => recChunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach(tr => tr.stop());
        const blob = new Blob(recChunks, { type: 'audio/webm' });
        const c = ensureCtx(); if (!c) return;
        const buffer = await c.decodeAudioData(await blob.arrayBuffer());
        addTrack(`recording-${Date.now()}`, buffer);
        toast('Recording added as a new track');
        el('#audRecord').textContent = '● Record Mic';
      };
      recorder.start();
      el('#audRecord').textContent = '■ Stop Recording';
      toast('Recording… click again to stop');
    } catch { toast('Microphone access denied or unavailable'); }
  });

  // ---- selection list ----
  listEl.addEventListener('click', e => {
    const rm = e.target.closest('[data-remove]');
    if (rm) { audio.tracks = audio.tracks.filter(t => t.id !== rm.dataset.remove); if (audio.selectedId === rm.dataset.remove) audio.selectedId = audio.tracks[0]?.id || null; renderAll(); return; }
    const row = e.target.closest('[data-id]');
    if (row) { audio.selectedId = row.dataset.id; audio.trim = { start: 0, end: 1 }; renderAll(); }
  });

  // ---- mixer interactions ----
  mixerEl.addEventListener('input', e => {
    const chan = e.target.closest('[data-mixer]'); if (!chan) return;
    const t = audio.tracks.find(x => x.id === chan.dataset.mixer); if (!t) return;
    if (e.target.dataset.gain !== undefined) t.gain = Number(e.target.value);
    if (e.target.dataset.pan !== undefined) t.pan = Number(e.target.value);
  });
  mixerEl.addEventListener('click', e => {
    const chan = e.target.closest('[data-mixer]'); if (!chan) return;
    const t = audio.tracks.find(x => x.id === chan.dataset.mixer); if (!t) return;
    if (e.target.dataset.mute !== undefined) { t.muted = !t.muted; renderMixer(); }
    if (e.target.dataset.solo !== undefined) { t.solo = !t.solo; renderMixer(); }
  });

  // ---- trim selection on waveform ----
  let dragTrim = null;
  canvas.addEventListener('mousedown', e => {
    const t = selectedTrack(); if (!t) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    dragTrim = x;
    audio.trim = { start: x, end: x };
    renderWave();
  });
  canvas.addEventListener('mousemove', e => {
    if (dragTrim === null) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.trim = { start: Math.min(dragTrim, x), end: Math.max(dragTrim, x) };
    renderWave();
  });
  addEventListener('mouseup', () => { dragTrim = null; });

  el('#audTrimApply').addEventListener('click', () => {
    const t = selectedTrack(); if (!t || !t.buffer) return;
    const { start, end } = audio.trim;
    if (end - start < 0.01) { toast('Drag on the waveform to select a range first'); return; }
    const c = ensureCtx(); if (!c) return;
    const total = t.buffer.length;
    const from = Math.floor(start * total), to = Math.floor(end * total);
    const len = Math.max(1, to - from);
    const trimmed = c.createBuffer(t.buffer.numberOfChannels, len, t.buffer.sampleRate);
    for (let ch = 0; ch < t.buffer.numberOfChannels; ch++) trimmed.copyToChannel(t.buffer.getChannelData(ch).slice(from, to), ch);
    t.buffer = trimmed;
    audio.trim = { start: 0, end: 1 };
    renderAll();
    toast('Trimmed selection applied');
  });

  // ---- playback ----
  function stopAll() {
    audio.sources.forEach(s => { try { s.stop(); } catch {} });
    audio.sources = [];
    audio.playing = false;
    el('#audPlay').textContent = '▶ Play';
  }
  el('#audPlay').addEventListener('click', () => {
    const c = ensureCtx(); if (!c) return;
    if (audio.playing) { stopAll(); return; }
    const anySolo = audio.tracks.some(t => t.solo);
    let played = false;
    audio.tracks.forEach(t => {
      if (!t.buffer) return;
      if (t.muted) return;
      if (anySolo && !t.solo) return;
      const src = c.createBufferSource(); src.buffer = t.buffer;
      const gain = c.createGain(); gain.gain.value = t.gain;
      const panner = c.createStereoPanner ? c.createStereoPanner() : null;
      if (panner) { panner.pan.value = t.pan; src.connect(gain).connect(panner).connect(c.destination); }
      else src.connect(gain).connect(c.destination);
      src.start();
      audio.sources.push(src);
      played = true;
    });
    if (!played) { toast('No audible tracks (check mute/solo)'); return; }
    audio.playing = true; audio.playStart = c.currentTime;
    el('#audPlay').textContent = '⏸ Pause';
    const t = selectedTrack();
    const dur = t?.buffer?.duration || 1;
    setTimeout(() => { if (audio.playing) stopAll(); }, dur * 1000 + 60);
    const tick = () => { if (!audio.playing) return; renderWave(); requestAnimationFrame(tick); };
    tick();
  });
  el('#audStop').addEventListener('click', stopAll);

  // ---- save to assets ----
  function bufferToWav(buffer) {
    const numCh = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length;
    const bytesPerSample = 2, blockAlign = numCh * bytesPerSample;
    const dataSize = len * blockAlign;
    const bufOut = new ArrayBuffer(44 + dataSize);
    const view = new DataView(bufOut);
    const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE');
    writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, numCh, true); view.setUint32(24, sr, true);
    view.setUint32(28, sr * blockAlign, true); view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true);
    writeStr(36, 'data'); view.setUint32(40, dataSize, true);
    const channels = []; for (let i = 0; i < numCh; i++) channels.push(buffer.getChannelData(i));
    let offset = 44;
    for (let i = 0; i < len; i++) for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
    return bufOut;
  }
  function arrayBufferToBase64(buf) {
    let binary = ''; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  el('#audSave').addEventListener('click', async () => {
    if (!state.slug) return;
    const t = selectedTrack();
    if (!t || !t.buffer) { toast('Generate or import a track first'); return; }
    const name = (el('#audAssetName').value.trim() || t.name || `sound-${Date.now()}`).replace(/\.wav$/i, '');
    try {
      const wav = bufferToWav(t.buffer);
      const dataUrl = `data:audio/wav;base64,${arrayBufferToBase64(wav)}`;
      await api(`/api/games/${encodeURIComponent(state.slug)}/assets`, {
        method: 'POST',
        body: JSON.stringify({ name: `${name}.wav`, category: 'audio', mime: 'audio/wav', dataUrl })
      });
      toast(`Saved "${name}.wav" to Assets`);
      log('info', `Audio track "${name}" saved as asset`);
      window.__forgeLoadAssets?.();
    } catch (error) { toast(error.message); }
  });

  window.addEventListener('forge-tool-modal-open', e => { if (e.detail?.name === 'audio') renderAll(); });
  window.addEventListener('resize', () => { if (mount.classList.contains('active')) renderWave(); });

  renderAll();
})();
