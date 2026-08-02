"use strict";
(() => {
  const mount = document.getElementById('shaderPanel');
  const state = window.__forgeState;
  if (!mount || !state) return;
  const api = window.__forgeApi, toast = window.__forgeToast, log = window.__forgeLog;

  const VERTEX_SRC = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

  const DEFAULT_FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
out vec4 fragColor;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec3 col = 0.5 + 0.5 * cos(u_time + uv.xyx * 6.0 + vec3(0, 2, 4));
  fragColor = vec4(col, 1.0);
}`;

  const PRESETS = {
    'Plasma (default)': DEFAULT_FRAGMENT,
    'Solid Color': `#version 300 es
precision highp float;
uniform vec3 u_color;
out vec4 fragColor;
void main() { fragColor = vec4(u_color, 1.0); }`,
    'UV Gradient': `#version 300 es
precision highp float;
uniform vec2 u_resolution;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  fragColor = vec4(uv, 0.5, 1.0);
}`,
    'Radial Pulse': `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
out vec4 fragColor;
void main() {
  vec2 uv = (gl_FragCoord.xy / u_resolution) - 0.5;
  float d = length(uv);
  float glow = smoothstep(0.5, 0.0, d) * (0.6 + 0.4 * sin(u_time * 3.0));
  fragColor = vec4(vec3(0.2, 0.6, 1.0) * glow, 1.0);
}`
  };

  mount.innerHTML = `
    <div class="forge-tool">
      <aside class="forge-tool__rail">
        <div>
          <h4>Presets</h4>
          <select id="shPreset" style="width:100%">${Object.keys(PRESETS).map(k => `<option>${k}</option>`).join('')}</select>
        </div>
        <div>
          <h4>Uniforms</h4>
          <div class="field-row" style="display:flex;align-items:center;gap:6px"><label style="width:56px">Color</label><input type="color" id="shColor" value="#41a6f6"></div>
        </div>
        <div class="muted" style="line-height:1.5">GLSL ES 3.00 fragment shader. Available uniforms: <code>u_resolution</code>, <code>u_time</code>, <code>u_color</code>.</div>
      </aside>
      <div class="forge-tool__main">
        <div class="forge-tool__toolbar">
          <input id="shAssetName" placeholder="shader-name" style="width:160px">
          <button id="shSave">💾 Save as Asset</button>
          <button id="shCompile">▶ Run</button>
          <span class="muted" id="shStatus" style="margin-left:auto">Ready</span>
        </div>
        <div style="flex:1;display:flex;min-height:0">
          <textarea id="shCode" spellcheck="false" style="flex:1;border:0;border-right:1px solid var(--line);border-radius:0;padding:10px">${DEFAULT_FRAGMENT}</textarea>
          <div style="width:45%;display:flex;align-items:center;justify-content:center;background:#0f1013"><canvas id="shCanvas" width="360" height="360" style="max-width:100%;max-height:100%"></canvas></div>
        </div>
      </div>
    </div>`;

  const codeEl = mount.querySelector('#shCode');
  const canvas = mount.querySelector('#shCanvas');
  const statusEl = mount.querySelector('#shStatus');
  const gl = canvas.getContext('webgl2');

  let program = null, buffer = null, raf = null, startTime = performance.now();

  function compile(source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(info || 'Shader compile error');
    }
    return shader;
  }

  function buildProgram(fragmentSrc) {
    const vs = compile(VERTEX_SRC, gl.VERTEX_SHADER);
    const fs = compile(fragmentSrc, gl.FRAGMENT_SHADER);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(info || 'Program link error');
    }
    return prog;
  }

  function run() {
    if (!gl) { statusEl.textContent = 'WebGL2 unavailable in this browser'; return; }
    cancelAnimationFrame(raf);
    try {
      program = buildProgram(codeEl.value);
    } catch (error) {
      statusEl.textContent = `Error: ${error.message.split('\n')[0]}`;
      statusEl.style.color = 'var(--danger)';
      log('error', `Shader compile error: ${error.message}`);
      return;
    }
    statusEl.textContent = 'Compiled OK'; statusEl.style.color = '';
    if (!buffer) {
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    }
    gl.useProgram(program);
    const posLoc = gl.getAttribLocation(program, 'a_pos');
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    const timeLoc = gl.getUniformLocation(program, 'u_time');
    const colorLoc = gl.getUniformLocation(program, 'u_color');
    startTime = performance.now();
    const hexToRgb = hex => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };

    function frame() {
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (resLoc) gl.uniform2f(resLoc, canvas.width, canvas.height);
      if (timeLoc) gl.uniform1f(timeLoc, (performance.now() - startTime) / 1000);
      if (colorLoc) gl.uniform3fv(colorLoc, hexToRgb(mount.querySelector('#shColor').value));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    }
    frame();
  }

  mount.querySelector('#shCompile').addEventListener('click', run);
  codeEl.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run(); });
  mount.querySelector('#shPreset').addEventListener('change', e => { codeEl.value = PRESETS[e.target.value]; run(); });
  mount.querySelector('#shColor').addEventListener('input', () => {});

  mount.querySelector('#shSave').addEventListener('click', async () => {
    if (!state.slug) return;
    const name = mount.querySelector('#shAssetName').value.trim() || `shader-${Date.now()}`;
    try {
      await api(`/api/games/${encodeURIComponent(state.slug)}/assets`, {
        method: 'POST',
        body: JSON.stringify({ name, category: 'shader', code: codeEl.value })
      });
      toast(`Saved shader "${name}" to Assets`);
      log('info', `Shader saved as asset "${name}"`);
      window.__forgeLoadAssets?.();
    } catch (error) { toast(error.message); }
  });

  // Only render while this tab is visible/active, to avoid burning GPU in the background.
  const observer = new MutationObserver(() => {
    if (mount.classList.contains('active')) run();
    else cancelAnimationFrame(raf);
  });
  observer.observe(mount, { attributes: true, attributeFilter: ['class'] });

  if (mount.classList.contains('active')) run();
})();