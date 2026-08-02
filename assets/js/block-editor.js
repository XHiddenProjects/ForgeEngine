"use strict";
(() => {
  const mount = document.getElementById('blocksPanel');
  const state = window.__forgeState;
  if (!mount || !state) return;
  const api = window.__forgeApi, toast = window.__forgeToast, log = window.__forgeLog, escapeHtml = window.__forgeEscape;

  // Catalog of ForgeEngine's `Behaviors` blocks — the Flowlab-style Trigger /
  // Logic & Math / Component / Text & List / GUI / Game Flow functions from
  // utils/src/behaviors.js. This intentionally does NOT expose the raw
  // utils/src/*.js primitives (math.lerp, data.shuffle, ...) directly —
  // those are internal plumbing that Behaviors is already built on top of.
  const CATALOG = {
    'Triggers': [
      ['once', ['onOut']], ['always', ['onOut']],
      ['timer', ['{delay,repeatForever,repeat,autoStart}', 'onOut', 'onDone']],
      ['keyboard', ['key', '{repeating,repeatDelayMs,anyKey}', '{down,up}']],
      ['mouseClick', ['{button,captureAnywhere}', '{down,up,over,out}']],
      ['mouseMove', ['{}', 'onMove']],
      ['collision', ['a', 'b', '{sides}']],
      ['mailbox', ['name', 'onOut']], ['sendMessage', ['name', 'value']]
    ],
    'Logic & Math': [
      ['number', ['initial', '{round}']], ['expression', ['exprString', 'vars']],
      ['repeater', ['count', 'onOut', 'onDone']], ['random', ['min', 'max']],
      ['filter', ['value', 'op', 'compareTo']], ['switchGate', ['initialOn']],
      ['toggle', ['{loop,startOn}']], ['router', ['{mode,routeCount}']],
      ['logicGate', ['type', 'a', 'b']]
    ],
    'Components': [
      ['ease', ['{from,to,seconds,fn,mode}', 'onOut', 'onDone']],
      ['extractor', ['object', 'propertyPath']], ['destroyer', ['object', 'removeFn']],
      ['sound', ['backend', '{loop,volume,pan,pitch}']], ['ad', ['{iosBannerId,iosInterstitialId,androidBannerId,androidInterstitialId,position,testMode}', '{banner,full,hide,reward}']]
    ],
    'Text & Lists': [
      ['text', ['initial']], ['textCase', ['value', 'mode']], ['textLength', ['value']],
      ['toNumber', ['value']], ['textCompare', ['a', 'b', 'mode']], ['textSanitize', ['value']],
      ['list', ['initial']], ['listModify', ['items', 'mode', 'index', 'value']],
      ['listOrder', ['items', 'mode', '{asNumbers}']], ['listEach', ['items', '{delayMs}', 'onIndex', 'onOut', 'onDone']],
      ['listCount', ['items']]
    ],
    'GUI': [
      ['alert', ['ui', '{title,message,buttonLabel}', 'onClick']],
      ['bar', ['initial', 'max']], ['label', ['initial']]
    ],
    'Game Flow': [
      ['pauseGame', ['initialPaused']], ['loadLevel', ['loader', 'mode', 'explicitTarget']],
      ['restartGame', ['restart']]
    ]
  };

  const workspace = { blocks: [] };
  let idSeq = 0;

  mount.innerHTML = `
    <div class="forge-tool">
      <aside class="forge-tool__rail" style="width:230px">
        <div class="muted" style="line-height:1.5">Click or drag a block from the <code>Behaviors</code> library (Triggers, Logic & Math, Components, Text & Lists, GUI, Game Flow) into the workspace, fill in its arguments, then combine the sequence into a saved function. Each block is a real function in <code>utils/src/behaviors.js</code>, built on top of the lower-level utils modules.</div>
        ${Object.entries(CATALOG).map(([mod, fns]) => `
          <div>
            <h4>${mod}</h4>
            <div style="display:flex;flex-wrap:wrap;gap:5px">
              ${fns.map(([fn, params]) => `<div class="forge-chip" draggable="true" data-mod="${mod}" data-fn="${fn}" data-params="${escapeHtml(params.join(','))}" title="Behaviors.${fn}(${params.join(', ')})">${fn}</div>`).join('')}
            </div>
          </div>`).join('')}
      </aside>
      <div class="forge-tool__main">
        <div class="forge-tool__toolbar">
          <input id="blkFnName" placeholder="functionName" value="myFunction" style="width:160px">
          <button id="blkCombine">🧩 Combine into Function</button>
          <button id="blkClear">Clear</button>
          <span class="muted" style="margin-left:auto">Drag blocks here, top to bottom = execution order</span>
        </div>
        <div class="forge-tool__stage" style="align-items:flex-start;justify-content:flex-start;padding:12px;overflow:auto">
          <div class="forge-block-slot" id="blkSlot" style="width:100%"></div>
        </div>
        <div class="forge-tool__panel">
          <h4>Generated Code Preview</h4>
          <pre id="blkPreview" style="white-space:pre-wrap;margin:0;font-family:'SFMono-Regular',Consolas,monospace;font-size:11.5px;color:#c7cad0"></pre>
        </div>
      </div>
    </div>`;

  const slot = mount.querySelector('#blkSlot');
  const preview = mount.querySelector('#blkPreview');

  function addBlock(mod, fn, params) {
    workspace.blocks.push({ id: `b${idSeq++}`, mod, fn, args: params.map(() => '') , params});
    renderSlot();
  }

  mount.querySelectorAll('.forge-chip').forEach(chip => {
    chip.addEventListener('click', () => addBlock(chip.dataset.mod, chip.dataset.fn, chip.dataset.params ? chip.dataset.params.split(',') : []));
    chip.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', JSON.stringify({ mod: chip.dataset.mod, fn: chip.dataset.fn, params: chip.dataset.params ? chip.dataset.params.split(',') : [] }));
    });
  });

  slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('drag-over'); });
  slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
  slot.addEventListener('drop', e => {
    e.preventDefault();
    slot.classList.remove('drag-over');
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      addBlock(data.mod, data.fn, data.params);
    } catch { /* ignore non-block drops */ }
  });

  function renderSlot() {
    slot.innerHTML = workspace.blocks.length === 0
      ? '<span class="muted" style="padding:20px">Empty — drag or click blocks from the left to build a sequence.</span>'
      : workspace.blocks.map((b, i) => `
        <div class="forge-block" data-id="${b.id}">
          <strong>Behaviors.${escapeHtml(b.fn)}</strong> <span class="muted" style="font-size:10px">${escapeHtml(b.mod)}</span>
          <span>(</span>
          ${b.params.map((p, pi) => `<input data-arg="${pi}" placeholder="${escapeHtml(p)}" value="${escapeHtml(b.args[pi] || '')}" style="width:${Math.max(48, p.length * 8)}px">`).join('<span>,</span>')}
          <span>)</span>
          <button data-up="${i}" title="Move up">↑</button>
          <button data-down="${i}" title="Move down">↓</button>
          <button data-remove="${b.id}" title="Remove">×</button>
        </div>`).join('');
    updatePreview();
  }

  slot.addEventListener('input', e => {
    const argInput = e.target.closest('[data-arg]');
    if (!argInput) return;
    const block = workspace.blocks.find(b => b.id === argInput.closest('.forge-block').dataset.id);
    block.args[Number(argInput.dataset.arg)] = argInput.value;
    updatePreview();
  });

  slot.addEventListener('click', e => {
    const rm = e.target.closest('[data-remove]');
    if (rm) { workspace.blocks = workspace.blocks.filter(b => b.id !== rm.dataset.remove); renderSlot(); return; }
    const up = e.target.closest('[data-up]');
    if (up) { const i = Number(up.dataset.up); if (i > 0) [workspace.blocks[i - 1], workspace.blocks[i]] = [workspace.blocks[i], workspace.blocks[i - 1]]; renderSlot(); return; }
    const down = e.target.closest('[data-down]');
    if (down) { const i = Number(down.dataset.down); if (i < workspace.blocks.length - 1) [workspace.blocks[i + 1], workspace.blocks[i]] = [workspace.blocks[i], workspace.blocks[i + 1]]; renderSlot(); }
  });

  mount.querySelector('#blkClear').addEventListener('click', () => {
    if (workspace.blocks.length && !window.confirm('Clear all blocks?')) return;
    workspace.blocks = []; renderSlot();
  });

  function argLiteral(raw, paramName) {
    const value = (raw || '').trim();
    if (!value) return `/* ${paramName} */ undefined`;
    if (!Number.isNaN(Number(value)) && value !== '') return value; // numeric literal
    if (/^(true|false|null)$/.test(value)) return value;
    if (/^["'\[{].*[\]'"}]$/.test(value)) return value; // already a JS literal/array/object
    return JSON.stringify(value); // treat as a plain string
  }

  function generateCode() {
    const fnName = (mount.querySelector('#blkFnName').value.trim() || 'myFunction').replace(/[^A-Za-z0-9_$]/g, '') || 'myFunction';
    const lines = workspace.blocks.map(b => `  Behaviors.${b.fn}(${b.params.map((p, i) => argLiteral(b.args[i], p)).join(', ')});`);
    return `"use strict";\n\n// Generated by ForgeEngine's visual block editor — combines Behaviors blocks\n// (utils/src/behaviors.js) into one function. Behaviors wraps the raw utils\n// library internally; this script only ever calls the named block functions.\nconst { Behaviors } = require("@ForgeEngine/utils");\n\nfunction ${fnName}() {\n${lines.join('\n') || '  // add blocks on the left to fill this in'}\n}\n\nmodule.exports = { ${fnName} };\n`;
  }

  function updatePreview() { preview.textContent = generateCode(); }

  mount.querySelector('#blkCombine').addEventListener('click', async () => {
    if (!state.slug) return;
    if (!workspace.blocks.length) { toast('Add at least one block first'); return; }
    const fnName = mount.querySelector('#blkFnName').value.trim() || 'myFunction';
    try {
      await api(`/api/games/${encodeURIComponent(state.slug)}/assets`, {
        method: 'POST',
        body: JSON.stringify({ name: fnName, category: 'script', code: generateCode() })
      });
      toast(`Saved function "${fnName}" as a script asset`);
      log('info', `Block editor: combined ${workspace.blocks.length} block(s) into "${fnName}"`);
      window.__forgeLoadAssets?.();
    } catch (error) { toast(error.message); }
  });

  mount.querySelector('#blkFnName').addEventListener('input', updatePreview);
  renderSlot();
})();