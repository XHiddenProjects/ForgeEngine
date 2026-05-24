import { PixelArt } from './pixelart.js';
import { applyBlockEditorPatch } from './blockEditor.js';


// FORGE GLOBAL IMPORT REGISTRY
// Loads every known FORGE library module once, exposes exported classes/objects
// on window/globalThis, and creates method facades so block execution can call
// ClassName.methodName(...) consistently.
export const FORGE_GLOBAL_LIBRARY_SPECS = [
  { name: 'Canvex', file: 'canvex' },
  { name: 'Canvas', file: 'canvas' },
  { name: 'Shapes', file: 'shapes' },
  { name: 'Interaction', file: 'interaction' },
  { name: 'Camera', file: 'camera' },
  { name: 'math', file: 'math' },
  { name: 'Charts', file: 'charts' },
  { name: 'Events', file: 'events' },
  { name: 'pointer', file: 'events' },
  { name: 'Keyboard', file: 'events' },
  { name: 'Window', file: 'events' },
  { name: 'controller', file: 'events' },
  { name: 'sensor', file: 'events' },
  { name: 'Helpers', file: 'helpers' },
  { name: 'Triggers', file: 'triggers' },
  { name: 'Logic', file: 'logic' },
  { name: 'DateTime', file: 'datetime' },
  { name: 'Multiplayer', file: 'multiplayer' },
  { name: 'Text', file: 'text' },
  { name: 'GUI', file: 'gui' },
  { name: 'Elements', file: 'elements' },
  { name: 'Devices', file: 'devices' },
  { name: 'List', file: 'list' },
  { name: 'Physics', file: 'physics' },
  { name: 'Transform', file: 'transforms' },
  { name: 'Color', file: 'color' },
  { name: 'Sound', file: 'sound' },
  { name: 'Flow', file: 'flow' },
  { name: 'Sprites', file: 'sprites' },
  { name: 'Image', file: 'image' },
  { name: 'PixelArt', file: 'pixelart' },
  { name: 'Particles', file: 'particles' },
  { name: 'Properties', file: 'properties' },
  { name: 'Models', file: 'models' },
  { name: 'Lights', file: 'lights' },
];

const FORGE_CANONICAL_ALIASES = {
  canvex: 'Canvex', canvas: 'Canvas', shapes: 'Shapes', interaction: 'Interaction', camera: 'Camera',
  math: 'math', mathlib: 'math', charts: 'Charts', events: 'Events', pointer: 'pointer', keyboard: 'Keyboard',
  window: 'Window', controller: 'controller', sensor: 'sensor', helpers: 'Helpers', triggers: 'Triggers',
  logic: 'Logic', datetime: 'DateTime', date_time: 'DateTime', multiplayer: 'Multiplayer', text: 'Text',
  gui: 'GUI', elements: 'Elements', devices: 'Devices', list: 'List', physics: 'Physics', transform: 'Transform',
  transforms: 'Transform', color: 'Color', sound: 'Sound', flow: 'Flow', sprites: 'Sprites', image: 'Image',
  images: 'Image', pixelart: 'PixelArt', pixel_art: 'PixelArt', particles: 'Particles', properties: 'Properties',
  models: 'Models', lights: 'Lights', gameeditor: 'GameEditor', game_editor: 'GameEditor'
};

const FORGE_KNOWN_METHODS = {
  Sprites: ['create','load','draw','playAnimation','stopAnimation','setFrame','alpha','tint','visible'],
  Sound: ['play','stop','stopAll','volume','fadeIn','fadeOut'],
  Physics: ['applyForce','applyImpulse','setVelocity','stop','setGravity','isColliding','raycast','enable'],
  Transform: ['position','translate','rotate','scale','lookAt','lerp'],
  Camera: ['follow','shake','zoom','position','reset','background'],
  Events: ['onKeyPress','onKeyRelease','onClick','onCollision','onTimer','onTrigger','emit','on'],
  Keyboard: ['onKeyPress','onKeyRelease','isDown','pressed','released'],
  pointer: ['onClick','onMove','onDown','onUp','position'],
  Logic: ['if','compare','and','or','not','switch'],
  Flow: ['sequence','delay','loop','while','wait','run','stop'],
  Canvas: ['createCanvas','clear','rect','fillRect','strokeRect','text','line','circle'],
  Shapes: ['box','sphere','circle','rect','line','polygon'],
  Color: ['fill','randomColor','lerpColor','tint','hex','rgb'],
  Particles: ['emit','start','stop','gravity'],
  Lights: ['add','remove','intensity','flicker'],
  Text: ['draw','text','measure','typewriter'],
  Triggers: ['create','remove','isInside'],
  math: ['dist','clamp','lerp','map','norm','degToRad','radToDeg','vec2','vec3']
};

export function canonicalForgeClassName(name) {
  const raw = String(name || '').trim();
  const key = raw.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return FORGE_CANONICAL_ALIASES[key] || FORGE_CANONICAL_ALIASES[raw.toLowerCase()] || raw;
}

function forgeMathModule() {
  const m = {
    ...Math,
    PI: Math.PI, E: Math.E,
    dist(a,b,c,d){
      if (arguments.length >= 4) { const dx = c - a, dy = d - b; return Math.sqrt(dx * dx + dy * dy); }
      if (Array.isArray(a) && Array.isArray(b)) return Math.hypot(...a.map((v, i) => v - (b[i] || 0)));
      if (a && b && typeof a === 'object' && typeof b === 'object') return Math.hypot((b.x || 0) - (a.x || 0), (b.y || 0) - (a.y || 0), (b.z || 0) - (a.z || 0));
      return 0;
    },
    clamp(v, mn, mx){ return Math.max(mn, Math.min(mx, v)); },
    lerp(a, b, t){ return a + (b - a) * t; },
    map(v, a, b, c, d){ return c + (d - c) * ((v - a) / (b - a)); },
    norm(v, mn, mx){ return (v - mn) / (mx - mn); },
    degToRad(d){ return d * Math.PI / 180; },
    radToDeg(r){ return r * 180 / Math.PI; },
    vec2(x = 0, y = 0){ return { x, y }; },
    vec3(x = 0, y = 0, z = 0){ return { x, y, z }; },
  };
  m.default = m;
  m.math = m;
  return m;
}

function forgeNoopMethod(className, methodName) {
  const fn = async function forgeGlobalMethodStub(...args) {
    console.warn(`[FORGE] ${className}.${methodName}() was called before a real library implementation was found.`, ...args);
    return undefined;
  };
  fn.__forgeStub = true;
  return fn;
}

function exposeForgeMethod(root, className, methodName, fn) {
  if (typeof fn !== 'function') return;
  root.ForgeMethods[className] ||= {};
  root.ForgeMethods[className][methodName] = fn;
  root.ForgeMethods[`${className}.${methodName}`] = fn;
}

function createForgeClassFacade(className, exportedValue, moduleObject, root) {
  const known = new Set(FORGE_KNOWN_METHODS[className] || []);
  let facade = exportedValue;

  const ownDescriptor = (obj, key) => {
    try { return Object.getOwnPropertyDescriptor(Object(obj), key); } catch (_) { return undefined; }
  };
  const descriptorValueIsFunction = (obj, key) => {
    const desc = ownDescriptor(obj, key);
    return !!(desc && typeof desc.value === 'function');
  };
  const safeOwnNames = (obj) => {
    try { return Object.getOwnPropertyNames(Object(obj)); } catch (_) { return []; }
  };
  const safeKeys = (obj) => {
    try { return Object.keys(Object(obj)); } catch (_) { return []; }
  };
  const safeAssign = (obj, key, value) => {
    try { obj[key] = value; return obj[key] === value || typeof obj[key] === 'function'; }
    catch (_) {
      try { Object.defineProperty(obj, key, { value, configurable: true, writable: true }); return true; }
      catch (_) { return false; }
    }
  };
  const cloneNamespaceIfNeeded = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    const isModuleNamespace = Object.prototype.toString.call(obj) === '[object Module]' || obj[Symbol.toStringTag] === 'Module';
    if (!isModuleNamespace && Object.isExtensible(obj)) return obj;
    const clone = {};
    safeOwnNames(obj).forEach((key) => {
      const desc = ownDescriptor(obj, key);
      if (!desc || !('value' in desc)) return; // Important: never invoke getters while cloning.
      clone[key] = desc.value;
    });
    return clone;
  };

  if (className === 'math') facade = exportedValue || forgeMathModule();
  if (!facade && moduleObject) facade = moduleObject[className] || moduleObject.default || moduleObject;
  if (!facade || (typeof facade !== 'object' && typeof facade !== 'function')) facade = {};

  if (typeof facade === 'function') {
    const proto = facade.prototype || {};

    // Use descriptors instead of proto[key]. Accessing proto[key] can invoke getters.
    // Example: Multiplayer.prototype.playerCount reads this.players.size and crashes
    // when "this" is the prototype instead of an instance.
    safeOwnNames(proto).forEach((key) => {
      if (key !== 'constructor' && descriptorValueIsFunction(proto, key)) known.add(key);
    });
    safeOwnNames(facade).forEach((key) => {
      if (descriptorValueIsFunction(facade, key)) known.add(key);
    });

    known.forEach((methodName) => {
      if (descriptorValueIsFunction(facade, methodName)) return;
      const protoDesc = ownDescriptor(proto, methodName);
      const methodValue = (protoDesc && typeof protoDesc.value === 'function')
        ? function forgeInstanceMethodFacade(...args) {
            let instance = facade.__forgeDefaultInstance;
            if (!instance) {
              try { instance = new facade(); }
              catch (_) { instance = Object.create(proto); }
              try { facade.__forgeDefaultInstance = instance; } catch (_) {}
            }
            return protoDesc.value.apply(instance, args);
          }
        : forgeNoopMethod(className, methodName);
      safeAssign(facade, methodName, methodValue);
    });
    return facade;
  }

  if (facade && typeof facade === 'object') {
    // ES module namespace objects are immutable / non-extensible. Clone them before
    // adding FORGE method facades/stubs. Also use property descriptors so accessors
    // are not accidentally invoked during discovery.
    facade = cloneNamespaceIfNeeded(facade);

    if (moduleObject && typeof moduleObject === 'object') {
      safeOwnNames(moduleObject).forEach((key) => {
        const desc = ownDescriptor(moduleObject, key);
        if (!desc || typeof desc.value !== 'function') return;
        known.add(key);
        if (!descriptorValueIsFunction(facade, key)) safeAssign(facade, key, desc.value);
      });
    }

    safeKeys(facade).forEach((key) => {
      if (descriptorValueIsFunction(facade, key)) known.add(key);
    });
    known.forEach((methodName) => {
      if (descriptorValueIsFunction(facade, methodName)) return;
      safeAssign(facade, methodName, forgeNoopMethod(className, methodName));
    });
  }

  return facade;
}

function registerForgeGlobal(root, name, value, moduleObject) {
  const className = canonicalForgeClassName(name);
  const facade = createForgeClassFacade(className, value, moduleObject, root);
  root.ForgeLibs[className] = moduleObject || facade;
  root.ForgeClasses[className] = facade;
  root[className] = facade;
  root.ForgeLibs[String(className).toLowerCase()] = root.ForgeLibs[className];
  root.ForgeClasses[String(className).toLowerCase()] = facade;
  if (className === 'math') { root.math = facade; root.MathLib = facade; }
  try {
    Object.getOwnPropertyNames(Object(facade || {})).forEach((key) => {
      const desc = Object.getOwnPropertyDescriptor(Object(facade), key);
      if (desc && typeof desc.value === 'function') exposeForgeMethod(root, className, key, desc.value);
    });
  } catch (_) {}
  return facade;
}

export async function importForgeGlobals(extraGlobals = {}) {
  const root = globalThis;
  if (root.__forgeGlobalImportsReady) return root.__forgeGlobalImportsReady;

  root.ForgeLibs ||= {};
  root.ForgeClasses ||= {};
  root.ForgeMethods ||= {};
  root.canonicalForgeClassName = canonicalForgeClassName;

  root.__forgeGlobalImportsReady = (async () => {
    registerForgeGlobal(root, 'math', forgeMathModule(), { math: forgeMathModule(), default: forgeMathModule() });
    if (extraGlobals.PixelArt) registerForgeGlobal(root, 'PixelArt', extraGlobals.PixelArt, { PixelArt: extraGlobals.PixelArt, default: extraGlobals.PixelArt });
    if (extraGlobals.GameEditor) registerForgeGlobal(root, 'GameEditor', extraGlobals.GameEditor, { GameEditor: extraGlobals.GameEditor, default: extraGlobals.GameEditor });

    const importedFiles = new Map();
    await Promise.all(FORGE_GLOBAL_LIBRARY_SPECS.map(async (spec) => {
      const className = canonicalForgeClassName(spec.name);
      if (root.ForgeClasses[className] && !root.ForgeClasses[className].__forgeStub) return;
      let mod = importedFiles.get(spec.file);
      if (!mod) {
        const candidates = [
          // GameEditor.js is served from /Canvex/editors/ and libs live in /Canvex/libs/.
          // Keep this strict so failed fallbacks do not spam the console with
          // /Canvex/editors/libs/* or /Canvex/editors/*.js 404s.
          new URL(`../libs/${spec.file}.js`, import.meta.url).href,
        ];
        if (spec.file === 'pixelart') {
          candidates.unshift(new URL('../pixelart.js', import.meta.url).href);
        }
        mod = null;
        for (const url of candidates) {
          try { mod = await import(url); break; } catch (_) {}
        }
        importedFiles.set(spec.file, mod);
      }
      const exported = mod ? (mod[className] ?? mod[spec.name] ?? mod.default ?? mod) : null;
      registerForgeGlobal(root, className, exported, mod || undefined);
    }));

    root.ForgeGlobalImportsReady = Promise.resolve(root.ForgeClasses);
    return root.ForgeClasses;
  })();

  root.ForgeGlobalImportsReady = root.__forgeGlobalImportsReady;
  root.ensureForgeGlobals = () => root.__forgeGlobalImportsReady;
  return root.__forgeGlobalImportsReady;
}

if (typeof window !== 'undefined') {
  window.importForgeGlobals = importForgeGlobals;
  window.ensureForgeGlobals = () => importForgeGlobals();
  window.canonicalForgeClassName = canonicalForgeClassName;
}
// GameEditor.js
// Human-readable FORGE Game Editor module.
//
// Drop-in replacement for the converted GameEditor.js. The CSS, markup, and
// runtime are now readable template literals instead of single-line escaped
// strings, so this file is easier to inspect, search, and patch.

const GAME_EDITOR_CSS = `
*,*::before,*::after {
  box-sizing:border-box;
  margin:0;
  padding:0;
}

:root {
  --bg0:#08090d;
  --bg1:#0d0f16;
  --bg2:#12141e;
  --bg3:#181b28;
  --bg4:#1e2232;
  --panel:#141720;
  --border:#252a3a;
  --border2:#2e3447;
  --accent:#00d4ff;
  --accent2:#7c3aed;
  --accent3:#f59e0b;
  --danger:#ef4444;
  --success:#22c55e;
  --text0:#f0f2ff;
  --text1:#b8bdd6;
  --text2:#6b7280;
  --text3:#3d4357;
  --mono:'Share Tech Mono',monospace;
  --ui:'Rajdhani',sans-serif;
  --body:'Inter',sans-serif;
  --radius:4px;
  --radius2:6px;
}

html,body {
  width:100%;
  height:100%;
  overflow:hidden;
  background:var(--bg0);
  color:var(--text0);
  font-family:var(--ui);
  position:relative;
}

/* ── LAYOUT ─────────────────────────────────────────── */
#app {
  display:grid;
  grid-template-rows:44px 1fr 28px;
  height:100vh;
  width:100vw;
  position: absolute;
}


#pe-done-btn-v8{
  opacity:0;
  width:0;
  height:0;

}

/* ── TITLEBAR ────────────────────────────────────────── */
#titlebar {
  display:flex;
  align-items:center;
  gap:0;
  background:var(--bg1);
  border-bottom:1px solid var(--border);
  padding:0;
  user-select:none;
  position:relative;
  z-index:100;
}

.tb-logo {
  display:flex;
  align-items:center;
  gap:10px;
  padding:0 20px;
  height:100%;
  border-right:1px solid var(--border);
  font-family:var(--ui);
  font-weight:700;
  font-size:18px;
  letter-spacing:3px;
  color:var(--accent);
  white-space:nowrap;
}

.tb-logo .dot {
  width:8px;
  height:8px;
  border-radius:50%;
  background:var(--accent);
  box-shadow:0 0 8px var(--accent);
}

.tb-menu {
  display:flex;
  height:100%;
}

.tb-menu-item {
  position:relative;
  display:flex;
  align-items:center;
  padding:0 14px;
  font-size:13px;
  font-weight:500;
  color:var(--text1);
  cursor:pointer;
  transition:color .15s;
  letter-spacing:.5px;
}

.tb-menu-item:hover {
  color:var(--text0);
  background:var(--bg2);
}

.tb-menu-item.active {
  color:var(--accent);
}

.tb-spacer {
  flex:1;
}

.tb-mode-group {
  display:flex;
  align-items:center;
  gap:2px;
  padding:0 12px;
  border-left:1px solid var(--border);
}

.mode-btn {
  padding:5px 14px;
  font-size:11px;
  font-weight:600;
  letter-spacing:1.5px;
  border:1px solid var(--border2);
  background:transparent;
  color:var(--text2);
  cursor:pointer;
  transition:all .15s;
  font-family:var(--ui);
  border-radius:var(--radius);
}

.mode-btn.active {
  background:var(--accent);
  color:var(--bg0);
  border-color:var(--accent);
}

.mode-btn:hover:not(.active) {
  color:var(--text0);
  border-color:var(--text2);
}

.tb-actions {
  display:flex;
  align-items:center;
  gap:6px;
  padding:0 14px;
  border-left:1px solid var(--border);
}

.tb-btn {
  display:flex;
  align-items:center;
  gap:5px;
  padding:5px 12px;
  font-size:11px;
  font-weight:600;
  letter-spacing:1px;
  border:1px solid var(--border2);
  background:transparent;
  color:var(--text1);
  cursor:pointer;
  transition:all .15s;
  font-family:var(--ui);
  border-radius:var(--radius);
}

.tb-btn:hover {
  color:var(--text0);
  border-color:var(--accent);
  background:rgba(0,212,255,.07);
}

.tb-btn.run {
  background:rgba(34,197,94,.12);
  border-color:var(--success);
  color:var(--success);
}

.tb-btn.run:hover {
  background:rgba(34,197,94,.22);
}

.tb-btn svg {
  width:12px;
  height:12px;
  fill:currentColor;
}

/* ── WORKSPACE ───────────────────────────────────────── */
#workspace {
  display:grid;
  grid-template-columns:240px 1fr 260px;
  overflow:hidden;
}

/* ── LEFT PANEL ──────────────────────────────────────── */
#left-panel {
  background:var(--panel);
  border-right:1px solid var(--border);
  display:flex;
  flex-direction:column;
  overflow:hidden;
}

.panel-tabs {
  display:flex;
  border-bottom:1px solid var(--border);
}

.panel-tab {
  flex:1;
  padding:9px 4px;
  font-size:11px;
  font-weight:600;
  letter-spacing:.8px;
  text-align:center;
  cursor:pointer;
  color:var(--text2);
  border-bottom:2px solid transparent;
  transition:all .15s;
}

.panel-tab.active {
  color:var(--accent);
  border-bottom-color:var(--accent);
}

.panel-tab:hover:not(.active) {
  color:var(--text1);
}

.panel-body {
  flex:1;
  overflow-y:auto;
  padding:8px;
}

.panel-body::-webkit-scrollbar {
  width:3px;
}

.panel-body::-webkit-scrollbar-track {
  background:transparent;
}

.panel-body::-webkit-scrollbar-thumb {
  background:var(--border2);
  border-radius:2px;
}

/* Asset tree */
.tree-section {
  margin-bottom:4px;
}

.tree-section-header {
  display:flex;
  align-items:center;
  gap:6px;
  padding:5px 6px;
  font-size:10px;
  font-weight:600;
  letter-spacing:1.2px;
  color:var(--text2);
  cursor:pointer;
  border-radius:var(--radius);
  text-transform:uppercase;
}

.tree-section-header:hover {
  background:var(--bg3);
  color:var(--text1);
}

.tree-section-header .arrow {
  transition:transform .15s;
  font-size:8px;
}

.tree-section-header.open .arrow {
  transform:rotate(90deg);
}

.tree-item {
  display:flex;
  align-items:center;
  gap:7px;
  padding:4px 8px 4px 20px;
  font-size:12px;
  color:var(--text1);
  cursor:pointer;
  border-radius:var(--radius);
  transition:background .1s;
}

.tree-item:hover {
  background:var(--bg3);
}

.tree-item.selected {
  background:rgba(0,212,255,.1);
  color:var(--accent);
}

.tree-icon {
  font-size:12px;
  opacity:.7;
  width:14px;
  text-align:center;
}

/* Library blocks */
.lib-category {
  margin-bottom:8px;
}

.lib-cat-title {
  font-size:10px;
  font-weight:600;
  letter-spacing:1px;
  color:var(--text2);
  padding:4px 6px;
  text-transform:uppercase;
  border-bottom:1px solid var(--border);
  margin-bottom:4px;
}

.lib-block {
  display:flex;
  align-items:center;
  gap:8px;
  padding:6px 8px;
  margin:2px 0;
  font-size:11px;
  font-weight:500;
  border-radius:var(--radius);
  cursor:grab;
  transition:all .15s;
  border:1px solid transparent;
  user-select:none;
  -webkit-user-select:none;
  pointer-events:auto;
  touch-action:none;
}

.lib-block:hover {
  border-color:var(--border2);
  background:var(--bg3);
}

.lib-block:active {
  cursor:grabbing;
}

.lib-block.dragging {
  opacity:.55;
  cursor:grabbing;
}

.lib-block-dot {
  width:8px;
  height:8px;
  border-radius:50%;
  flex-shrink:0;
}

/* Props panel */
.prop-group {
  margin-bottom:14px;
}

.prop-group-title {
  font-size:10px;
  font-weight:600;
  letter-spacing:1px;
  color:var(--text2);
  text-transform:uppercase;
  margin-bottom:6px;
  padding:0 2px;
}

.prop-row {
  display:flex;
  align-items:center;
  gap:8px;
  margin-bottom:5px;
}

.prop-label {
  font-size:11px;
  color:var(--text2);
  min-width:60px;
  flex-shrink:0;
}

.prop-input {
  flex:1;
  background:var(--bg2);
  border:1px solid var(--border2);
  color:var(--text0);
  padding:4px 7px;
  font-size:11px;
  font-family:var(--mono);
  border-radius:var(--radius);
  outline:none;
  transition:border-color .15s;
}

.prop-input:focus {
  border-color:var(--accent);
}

.prop-select {
  flex:1;
  background:var(--bg2);
  border:1px solid var(--border2);
  color:var(--text0);
  padding:4px 7px;
  font-size:11px;
  font-family:var(--ui);
  border-radius:var(--radius);
  outline:none;
  cursor:pointer;
}

.prop-color {
  width:32px;
  height:24px;
  border:1px solid var(--border2);
  border-radius:var(--radius);
  cursor:pointer;
  padding:1px;
}

.prop-checkbox {
  width:14px;
  height:14px;
  accent-color:var(--accent);
  cursor:pointer;
}

/* ── CENTER ───────────────────────────────────────────── */
#center {
  display:flex;
  flex-direction:column;
  overflow:hidden;
}

.editor-tabs {
  display:flex;
  align-items:center;
  background:var(--bg1);
  border-bottom:1px solid var(--border);
  padding:0 12px;
  gap:2px;
}

.editor-tab {
  display:flex;
  align-items:center;
  gap:6px;
  padding:9px 14px;
  font-size:11px;
  font-weight:600;
  letter-spacing:.5px;
  color:var(--text2);
  cursor:pointer;
  border-bottom:2px solid transparent;
  transition:all .15s;
  position:relative;
}

.editor-tab:hover {
  color:var(--text1);
}

.editor-tab.active {
  color:var(--accent);
  border-bottom-color:var(--accent);
}

.editor-tab .badge {
  background:var(--accent2);
  color:#fff;
  font-size:8px;
  padding:1px 5px;
  border-radius:8px;
  font-weight:700;
}

.editor-tabs-spacer {
  flex:1;
}

.ed-tool-btn {
  padding:4px 10px;
  font-size:10px;
  font-weight:600;
  letter-spacing:.8px;
  border:1px solid var(--border2);
  background:transparent;
  color:var(--text2);
  cursor:pointer;
  border-radius:var(--radius);
  font-family:var(--ui);
  transition:all .15s;
}

.ed-tool-btn:hover {
  color:var(--text0);
  border-color:var(--border2);
  background:var(--bg3);
}

.ed-tool-btn.active {
  color:var(--accent);
  border-color:var(--accent);
  background:rgba(0,212,255,.06);
}

.editor-area {
  flex:1;
  overflow:hidden;
  position:relative;
}

/* ── VIEWPORT ────────────────────────────────────────── */
#viewport {
  width:100%;
  height:100%;
  background:var(--bg0);
  position:relative;
  overflow:hidden;
}

.vp-canvas-wrap {
  position:absolute;
  top:50%;
  left:50%;
  transform:translate(-50%,-50%);
  background:#000;
  box-shadow:0 0 0 1px var(--border2),0 0 40px rgba(0,0,0,.8);
}

#vp-canvas {
  display:block;
}

.vp-grid {
  position:absolute;
  inset:0;
  pointer-events:none;
  background-image:
    linear-gradient(var(--border) 1px,transparent 1px),
    linear-gradient(90deg,var(--border) 1px,transparent 1px);
  background-size:40px 40px;
  opacity:.3;
}

.vp-overlay {
  position:absolute;
  inset:0;
  pointer-events:none;
  border:1px solid var(--border);
}

.vp-toolbar {
  position:absolute;
  top:10px;
  left:10px;
  display:flex;
  flex-direction:column;
  gap:4px;
  z-index:10;
}

.vp-btn {
  width:32px;
  height:32px;
  display:flex;
  align-items:center;
  justify-content:center;
  background:var(--bg2);
  border:1px solid var(--border2);
  border-radius:var(--radius);
  cursor:pointer;
  font-size:14px;
  color:var(--text1);
  transition:all .15s;
}

.vp-btn:hover {
  background:var(--bg3);
  color:var(--accent);
  border-color:var(--accent);
}

.vp-btn.active {
  background:rgba(0,212,255,.12);
  color:var(--accent);
  border-color:var(--accent);
}

.vp-info {
  position:absolute;
  bottom:10px;
  left:10px;
  font-size:10px;
  font-family:var(--mono);
  color:var(--text2);
  background:rgba(8,9,13,.8);
  border:1px solid var(--border);
  padding:4px 10px;
  border-radius:var(--radius);
  display:flex;
  gap:14px;
}

.vp-info span {
  color:var(--accent);
}

/* 3D-specific grid */
#vp-canvas-3d {
  width:100%;
  height:100%;
  background:radial-gradient(ellipse at center, #0d1117 0%, #08090d 100%);
}

/* ── BLOCK EDITOR ────────────────────────────────────── */
#block-editor {
  width:100%;
  height:100%;
  position:relative;
  overflow:hidden;
  background:var(--bg0);
}

.be-canvas {
  width:100%;
  height:100%;
  position:relative;
  cursor:default;
}

.be-svg {
  position:absolute;
  top:0;
  left:0;
  width:100%;
  height:100%;
  pointer-events:none;
  z-index:0;
}

.be-block {
  position:absolute;
  min-width:160px;
  background:var(--bg2);
  border:1px solid var(--border2);
  border-radius:var(--radius2);
  overflow:visible;
  cursor:move;
  z-index:1;
  box-shadow:0 4px 20px rgba(0,0,0,.5);
  user-select:none;
  transition:box-shadow .15s;
}

.be-block:hover {
  box-shadow:0 4px 24px rgba(0,0,0,.7);
}

.be-block.selected {
  border-color:var(--accent);
  box-shadow:0 0 0 1px var(--accent),0 4px 20px rgba(0,212,255,.15);
}

.be-block-header {
  display:flex;
  align-items:center;
  gap:7px;
  padding:7px 10px;
  border-bottom:1px solid var(--border);
  cursor:move;
  border-radius:var(--radius2) var(--radius2) 0 0;
}

.be-block-cat {
  font-size:8px;
  font-weight:700;
  letter-spacing:1.2px;
  text-transform:uppercase;
  padding:2px 6px;
  border-radius:2px;
  opacity:.9;
}

.be-block-title {
  font-size:12px;
  font-weight:600;
  color:var(--text0);
  letter-spacing:.3px;
}

.be-block-body {
  padding:8px 10px;
  display:flex;
  flex-direction:column;
  gap:5px;
}

.be-port-row {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:6px;
}

.be-port {
  display:flex;
  align-items:center;
  gap:5px;
  font-size:10px;
  color:var(--text1);
  position:relative;
}

.be-port.out {
  flex-direction:row-reverse;
}

.be-connector {
  width:10px;
  height:10px;
  border-radius:50%;
  border:2px solid var(--text2);
  background:var(--bg0);
  cursor:crosshair;
  transition:all .15s;
  position:relative;
  z-index:2;
}

.be-connector:hover,.be-connector.connected {
  border-color:var(--accent);
  background:var(--accent);
}

.be-param {
  display:flex;
  align-items:center;
  gap:6px;
  margin-top:2px;
}

.be-param-label {
  font-size:9px;
  color:var(--text2);
  min-width:40px;
}

.be-param-input {
  flex:1;
  background:var(--bg3);
  border:1px solid var(--border2);
  color:var(--text0);
  padding:2px 6px;
  font-size:10px;
  font-family:var(--mono);
  border-radius:3px;
  outline:none;
}

.be-param-input:focus {
  border-color:var(--accent);
}

.be-toolbar {
  position:absolute;
  bottom:12px;
  left:50%;
  transform:translateX(-50%);
  display:flex;
  gap:4px;
  z-index:10;
  background:var(--bg2);
  border:1px solid var(--border2);
  padding:4px;
  border-radius:6px;
}

.be-tb-btn {
  display:flex;
  align-items:center;
  gap:5px;
  padding:5px 10px;
  font-size:10px;
  font-weight:600;
  letter-spacing:.8px;
  border:1px solid transparent;
  background:transparent;
  color:var(--text1);
  cursor:pointer;
  border-radius:var(--radius);
  font-family:var(--ui);
  transition:all .15s;
}

.be-tb-btn:hover {
  background:var(--bg3);
  color:var(--text0);
  border-color:var(--border2);
}

.be-tb-btn.danger {
  color:var(--danger);
}

.be-tb-btn.danger:hover {
  background:rgba(239,68,68,.1);
  border-color:var(--danger);
}

/* validation badge */
.be-valid {
  position:absolute;
  top:10px;
  right:10px;
  font-size:10px;
  font-weight:600;
  letter-spacing:.8px;
  padding:4px 10px;
  border-radius:var(--radius);
  display:flex;
  align-items:center;
  gap:5px;
}

.be-valid.ok {
  background:rgba(34,197,94,.1);
  border:1px solid var(--success);
  color:var(--success);
}

.be-valid.err {
  background:rgba(239,68,68,.1);
  border:1px solid var(--danger);
  color:var(--danger);
}

/* ── CODE EDITOR ─────────────────────────────────────── */
#code-editor {
  width:100%;
  height:100%;
  display:flex;
  flex-direction:column;
}

.ce-toolbar {
  display:flex;
  align-items:center;
  gap:6px;
  padding:6px 10px;
  background:var(--bg1);
  border-bottom:1px solid var(--border);
}

.ce-tb-label {
  font-size:10px;
  color:var(--text2);
  letter-spacing:.8px;
  text-transform:uppercase;
  margin-right:4px;
}

.ce-wrap {
  flex:1;
  overflow:hidden;
  position:relative;
}

#code-area {
  width:100%;
  height:100%;
  background:transparent;
  color:transparent;
  -webkit-text-fill-color:transparent;
  caret-color:var(--accent);
  font-family:var(--mono);
  font-size:13px;
  line-height:1.7;
  tab-size:2;
  border:none;
  outline:none;
  resize:none;
  padding:14px 14px 14px 58px;
  position:absolute;
  top:0;
  left:0;
  z-index:2;
  overflow:auto;
  white-space:pre;
  word-break:normal;
}

#code-area::selection {
  background:rgba(0,212,255,.28);
  -webkit-text-fill-color:transparent;
}

#code-highlight {
  position:absolute;
  top:0;
  left:0;
  width:100%;
  height:100%;
  overflow:auto;
  font-family:var(--mono);
  font-size:13px;
  line-height:1.7;
  tab-size:2;
  padding:14px 14px 14px 58px;
  pointer-events:none;
  z-index:1;
  white-space:pre;
  word-break:normal;
  color:#d6deff;
  background:var(--bg0);
}

#code-highlight .tok-keyword {
  color:#ff7bdb;
  font-weight:700;
}

#code-highlight .tok-string {
  color:#9af7b0;
}

#code-highlight .tok-number {
  color:#ffd166;
}

#code-highlight .tok-comment {
  color:#8b95ad;
  font-style:italic;
}

#code-highlight .tok-function {
  color:#6ee7ff;
}

#code-highlight .tok-library {
  font-weight:700;
}

#code-highlight .tok-operator {
  color:#f8fafc;
}

#line-nums {
  position:absolute;
  top:0;
  left:0;
  width:44px;
  height:100%;
  padding:14px 0;
  font-family:var(--mono);
  font-size:13px;
  line-height:1.7;
  color:#6f7da3;
  text-align:right;
  padding-right:10px;
  user-select:none;
  border-right:1px solid var(--border);
  background:var(--bg1);
  z-index:3;
}

.ce-status {
  display:flex;
  align-items:center;
  gap:12px;
  padding:4px 12px;
  background:var(--bg1);
  border-top:1px solid var(--border);
  font-size:10px;
  font-family:var(--mono);
  color:var(--text2);
}

.ce-status span {
  color:var(--accent);
}

.ce-error {
  color:var(--danger)!important;
}

/* autocomplete */
#autocomplete {
  position:absolute;
  z-index:100;
  background:var(--bg2);
  border:1px solid var(--border2);
  border-radius:var(--radius2);
  min-width:180px;
  max-height:200px;
  overflow-y:auto;
  box-shadow:0 8px 30px rgba(0,0,0,.6);
  display:none;
}

.ac-item {
  padding:6px 12px;
  font-size:11px;
  font-family:var(--mono);
  color:var(--text1);
  cursor:pointer;
  display:flex;
  align-items:center;
  gap:8px;
}

.ac-item:hover,.ac-item.selected {
  background:rgba(0,212,255,.1);
  color:var(--accent);
}

.ac-kind {
  font-size:9px;
  color:var(--text2);
  padding:1px 5px;
  background:var(--bg3);
  border-radius:2px;
}

/* ── PIXEL EDITOR ────────────────────────────────────── */
#pixel-editor {
  width:100%;
  height:100%;
  display:flex;
  overflow:hidden;
}

/* ── Original sprite reference panel ── */
.pe-reference {
  width:110px;
  min-width:110px;
  background:var(--bg1);
  border-right:1px solid var(--border);
  display:flex;
  flex-direction:column;
  align-items:center;
  padding:8px 6px;
  gap:6px;
  overflow:hidden;
}
.pe-reference-title {
  font-size:9px;
  font-weight:700;
  letter-spacing:1px;
  color:var(--text2);
  text-transform:uppercase;
  width:100%;
  text-align:center;
}
.pe-reference-canvas {
  image-rendering:pixelated;
  border:1px solid var(--border2);
  border-radius:2px;
  background:repeating-conic-gradient(#1a1a2a 0% 25%, #111120 0% 50%) 0 0 / 8px 8px;
  max-width:96px;
  max-height:96px;
  width:96px;
  height:96px;
  object-fit:contain;
}
.pe-reference-label {
  font-size:9px;
  color:var(--text2);
  text-align:center;
  word-break:break-all;
  line-height:1.3;
  max-width:98px;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.pe-edited-canvas {
  image-rendering:pixelated;
  border:1px solid var(--accent);
  border-radius:2px;
  background:repeating-conic-gradient(#1a1a2a 0% 25%, #111120 0% 50%) 0 0 / 8px 8px;
  max-width:96px;
  max-height:96px;
  width:96px;
  height:96px;
  object-fit:contain;
}

.pe-tools {
  width:52px;
  background:var(--bg1);
  border-right:1px solid var(--border);
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:4px;
  padding:8px 4px;
}

.pe-tool {
  width:36px;
  height:36px;
  display:flex;
  align-items:center;
  justify-content:center;
  border:1px solid var(--border);
  border-radius:var(--radius);
  cursor:pointer;
  font-size:16px;
  background:var(--bg2);
  color:var(--text1);
  transition:all .15s;
  position:relative;
}

.pe-tool:hover {
  border-color:var(--border2);
  color:var(--text0);
}

.pe-tool.active {
  border-color:var(--accent);
  color:var(--accent);
  background:rgba(0,212,255,.08);
}

.pe-tool-sep {
  width:28px;
  height:1px;
  background:var(--border);
  margin:3px 0;
}

.pe-center {
  flex:1;
  display:flex;
  align-items:center;
  justify-content:center;
  overflow:auto;
  background:var(--bg0);
  position:relative;
}

.pe-checkerboard {
  position:absolute;
  inset:0;
  background-image:
    linear-gradient(45deg,#1a1a2a 25%,transparent 25%),
    linear-gradient(-45deg,#1a1a2a 25%,transparent 25%),
    linear-gradient(45deg,transparent 75%,#1a1a2a 75%),
    linear-gradient(-45deg,transparent 75%,#1a1a2a 75%);
  background-size:16px 16px;
  background-position:0 0,0 8px,8px -8px,-8px 0;
  opacity:.3;
}

#pe-canvas {
  image-rendering:pixelated;
  cursor:crosshair;
  z-index:1;
  box-shadow:0 0 0 1px var(--border2),0 4px 30px rgba(0,0,0,.6);
}

.pe-right {
  width:200px;
  background:var(--bg1);
  border-left:1px solid var(--border);
  display:flex;
  flex-direction:column;
  overflow-y:auto;
}

.pe-section {
  padding:10px;
  border-bottom:1px solid var(--border);
}

.pe-section-title {
  font-size:9px;
  font-weight:700;
  letter-spacing:1.2px;
  color:var(--text2);
  text-transform:uppercase;
  margin-bottom:8px;
}

.pe-palette {
  display:grid;
  grid-template-columns:repeat(8,1fr);
  gap:2px;
}

.pe-swatch {
  aspect-ratio:1;
  border-radius:2px;
  cursor:pointer;
  border:1px solid transparent;
  transition:all .1s;
}

.pe-swatch:hover {
  transform:scale(1.15);
  z-index:1;
  position:relative;
}

.pe-swatch.selected {
  border-color:#fff;
  box-shadow:0 0 0 1px rgba(255,255,255,.4);
}

.pe-color-preview {
  width:100%;
  height:32px;
  border-radius:var(--radius);
  margin-bottom:6px;
  border:1px solid var(--border2);
}

.pe-layers {
  display:flex;
  flex-direction:column;
  gap:3px;
}

.pe-layer {
  display:flex;
  align-items:center;
  gap:6px;
  padding:5px 8px;
  border:1px solid var(--border);
  border-radius:var(--radius);
  cursor:pointer;
  font-size:11px;
  color:var(--text1);
  transition:all .15s;
}

.pe-layer.active {
  border-color:var(--accent);
  color:var(--accent);
  background:rgba(0,212,255,.06);
}

.pe-layer-thumb {
  width:20px;
  height:20px;
  border-radius:2px;
  border:1px solid var(--border2);
  image-rendering:pixelated;
  flex-shrink:0;
}

.pe-zoom-info {
  position:absolute;
  bottom:10px;
  right:10px;
  font-size:10px;
  font-family:var(--mono);
  color:var(--text2);
  background:rgba(8,9,13,.8);
  border:1px solid var(--border);
  padding:3px 8px;
  border-radius:var(--radius);
}

/* ── RIGHT PANEL ─────────────────────────────────────── */
#right-panel {
  background:var(--panel);
  border-left:1px solid var(--border);
  display:flex;
  flex-direction:column;
  overflow:hidden;
}

/* Scene hierarchy */
.hier-item {
  display:flex;
  align-items:center;
  gap:6px;
  padding:4px 8px;
  font-size:11px;
  color:var(--text1);
  cursor:pointer;
  border-radius:var(--radius);
  transition:background .1s;
}

.hier-item:hover {
  background:var(--bg3);
}

.hier-item.selected {
  background:rgba(0,212,255,.1);
  color:var(--accent);
}

.hier-indent {
  padding-left:16px;
}

.hier-icon {
  font-size:11px;
  opacity:.6;
  width:12px;
}

.hier-vis {
  margin-left:auto;
  font-size:10px;
  opacity:.3;
  cursor:pointer;
}

.hier-vis:hover {
  opacity:.8;
}

/* ── STATUS BAR ──────────────────────────────────────── */
#statusbar {
  display:flex;
  align-items:center;
  gap:16px;
  background:var(--accent2);
  padding:0 14px;
  font-size:10px;
  font-weight:600;
  letter-spacing:.5px;
  color:rgba(255,255,255,.7);
}

#statusbar .sb-item {
  display:flex;
  align-items:center;
  gap:5px;
}

#statusbar .sb-item span {
  color:#fff;
}

#statusbar .sb-right {
  margin-left:auto;
  display:flex;
  align-items:center;
  gap:14px;
}

.sb-dot {
  width:6px;
  height:6px;
  border-radius:50%;
  background:var(--success);
  animation:pulse 2s infinite;
}

@keyframes pulse{0%,100% {
  opacity:1;
}

50% {
  opacity:.4;
}

}

/* ── DROPDOWN MENUS ──────────────────────────────────── */
.dropdown {
  position:absolute;
  top:100%;
  left:0;
  z-index:200;
  min-width:180px;
  background:var(--bg2);
  border:1px solid var(--border2);
  border-radius:var(--radius2);
  padding:4px;
  box-shadow:0 8px 32px rgba(0,0,0,.6);
  display:none;
}

.dropdown.open {
  display:block;
}

.dd-item {
  display:flex;
  align-items:center;
  gap:8px;
  padding:6px 10px;
  font-size:12px;
  color:var(--text1);
  cursor:pointer;
  border-radius:var(--radius);
}

.dd-item:hover {
  background:var(--bg3);
  color:var(--text0);
}

.dd-item .dd-key {
  margin-left:auto;
  font-size:10px;
  font-family:var(--mono);
  color:var(--text2);
}

.dd-sep {
  height:1px;
  background:var(--border);
  margin:3px 0;
}

/* ── MODALS ──────────────────────────────────────────── */
.modal-overlay {
  position:fixed;
  inset:0;
  background:rgba(0,0,0,.7);
  z-index:1000;
  display:flex;
  align-items:center;
  justify-content:center;
  opacity:0;
  pointer-events:none;
  transition:opacity .2s;
}

.modal-overlay.open {
  opacity:1;
  pointer-events:all;
}

.modal {
  background:var(--bg2);
  border:1px solid var(--border2);
  border-radius:8px;
  padding:24px;
  min-width:400px;
  max-width:600px;
  box-shadow:0 20px 60px rgba(0,0,0,.8);
  transform:translateY(8px);
  transition:transform .2s;
}

.modal-overlay.open .modal {
  transform:translateY(0);
}

.modal-title {
  font-size:16px;
  font-weight:700;
  letter-spacing:.5px;
  margin-bottom:16px;
  color:var(--text0);
}

.modal-row {
  display:flex;
  align-items:center;
  gap:10px;
  margin-bottom:10px;
}

.modal-label {
  font-size:12px;
  color:var(--text2);
  min-width:80px;
}

.modal-input {
  flex:1;
  background:var(--bg3);
  border:1px solid var(--border2);
  color:var(--text0);
  padding:7px 10px;
  font-size:12px;
  border-radius:var(--radius);
  outline:none;
  font-family:var(--ui);
}

.modal-input:focus {
  border-color:var(--accent);
}

.modal-actions {
  display:flex;
  justify-content:flex-end;
  gap:8px;
  margin-top:20px;
}

.modal-btn {
  padding:7px 18px;
  font-size:11px;
  font-weight:600;
  letter-spacing:.8px;
  border-radius:var(--radius);
  cursor:pointer;
  font-family:var(--ui);
  transition:all .15s;
}

.modal-btn.cancel {
  background:transparent;
  border:1px solid var(--border2);
  color:var(--text1);
}

.modal-btn.cancel:hover {
  border-color:var(--text1);
  color:var(--text0);
}

.modal-btn.confirm {
  background:var(--accent);
  border:1px solid var(--accent);
  color:var(--bg0);
}

.modal-btn.confirm:hover {
  filter:brightness(1.1);
}

/* console */
#console-panel {
  height:140px;
  border-top:1px solid var(--border);
  background:var(--bg0);
  display:flex;
  flex-direction:column;
  flex-shrink:0;
  overflow:hidden;
}

.console-header {
  display:flex;
  align-items:center;
  gap:8px;
  padding:4px 12px;
  background:var(--bg1);
  border-bottom:1px solid var(--border);
  font-size:10px;
  font-weight:600;
  letter-spacing:.8px;
  color:var(--text2);
  cursor:pointer;
}

.console-header:hover {
  color:var(--text1);
}

#console-output {
  flex:1;
  overflow-y:auto;
  padding:8px 12px;
  font-family:var(--mono);
  font-size:11px;
  display:flex;
  flex-direction:column;
  gap:2px;
}

#console-output::-webkit-scrollbar {
  width:3px;
}

#console-output::-webkit-scrollbar-thumb {
  background:var(--border2);
}

.con-line {
  line-height:1.5;
}

.con-info {
  color:var(--text1);
}

.con-warn {
  color:var(--accent3);
}

.con-error {
  color:var(--danger);
}

.con-success {
  color:var(--success);
}

.con-prefix {
  color:var(--text3);
  margin-right:6px;
}

/* ── MISC UTILS ──────────────────────────────────────── */
.hidden {
  display:none!important;
}

.btn-icon {
  background:none;
  border:none;
  cursor:pointer;
  color:var(--text2);
  padding:2px;
  font-size:14px;
  line-height:1;
  transition:color .15s;
}

.btn-icon:hover {
  color:var(--text0);
}

.tag {
  font-size:9px;
  font-weight:700;
  letter-spacing:1px;
  padding:2px 6px;
  border-radius:2px;
  text-transform:uppercase;
}

.tag-2d {
  background:rgba(0,212,255,.15);
  color:var(--accent);
  border:1px solid rgba(0,212,255,.3);
}

.tag-3d {
  background:rgba(124,58,237,.15);
  color:#a78bfa;
  border:1px solid rgba(124,58,237,.3);
}

/* scrollbars global */
*::-webkit-scrollbar {
  width:4px;
  height:4px;
}

*::-webkit-scrollbar-track {
  background:transparent;
}

*::-webkit-scrollbar-thumb {
  background:var(--border2);
  border-radius:2px;
}

/* FORGE PATCH V3: reliable tabs, drag connections, contextual edit actions */
.panel-tabs,.panel-tab {
  pointer-events:auto;
  position:relative;
  z-index:30;
}

.panel-body.hidden {
  display:none!important;
}

.be-connector.valid-target {
  border-color:var(--success)!important;
  background:rgba(34,197,94,.35)!important;
  box-shadow:0 0 0 4px rgba(34,197,94,.12),0 0 12px rgba(34,197,94,.4);
}

.be-connector.invalid-target {
  opacity:.28;
  cursor:not-allowed;
  filter:grayscale(1);
}

.be-connector.connecting {
  border-color:var(--accent)!important;
  background:var(--accent)!important;
  box-shadow:0 0 12px rgba(0,212,255,.55);
}

.be-preview-valid {
  stroke:var(--success);
  stroke-width:3;
  fill:none;
  opacity:.95;
  stroke-linecap:round;
}

.be-preview-invalid {
  stroke:var(--danger);
  stroke-width:2;
  fill:none;
  opacity:.65;
  stroke-dasharray:6 5;
  stroke-linecap:round;
}

.be-port.disabled {
  opacity:.35;
  cursor:not-allowed;
}

.be-connection-hit {
  stroke:transparent;
  stroke-width:12;
  fill:none;
  pointer-events:stroke;
  cursor:pointer;
}

/* ── Asset empty placeholders + contextual menus ───────── */
.tree-empty {
  padding:4px 8px 6px 36px;
  font-size:10px;
  color:var(--text3);
  font-family:var(--mono);
  font-style:italic;
}
.forge-context-menu {
  position:fixed;
  min-width:190px;
  background:var(--bg2);
  border:1px solid var(--border2);
  border-radius:var(--radius2);
  box-shadow:0 12px 40px rgba(0,0,0,.65);
  padding:4px;
  z-index:5000;
  display:none;
  user-select:none;
}
.forge-context-menu.open { display:block; }
.forge-cm-title {
  padding:6px 10px 4px;
  font-size:9px;
  font-weight:700;
  letter-spacing:1.2px;
  color:var(--text2);
  text-transform:uppercase;
  border-bottom:1px solid var(--border);
  margin-bottom:3px;
}
.forge-cm-item {
  display:flex;
  align-items:center;
  gap:8px;
  padding:6px 10px;
  font-size:12px;
  color:var(--text1);
  border-radius:var(--radius);
  cursor:pointer;
}
.forge-cm-item:hover { background:var(--bg3); color:var(--text0); }
.forge-cm-item.danger { color:var(--danger); }
.forge-cm-sep { height:1px; background:var(--border); margin:3px 0; }

/* ── MOBILE SUPPORT ──────────────────────────────────── */
@media (max-width: 768px) {
  #workspace {
    grid-template-columns: 0 1fr 0;
  }
  #left-panel, #right-panel {
    display: none;
  }
  #app {
    grid-template-rows: 44px 1fr 22px;
  }
  .tb-logo { padding: 0 10px; font-size: 14px; letter-spacing: 2px; }
  .tb-menu-item { padding: 0 8px; font-size: 11px; }
  .mode-btn { padding: 4px 8px; font-size: 10px; }
  .tb-btn { padding: 4px 8px; font-size: 10px; }
  .editor-tab { padding: 8px 8px; font-size: 10px; }
  /* Mobile panel toggles */
  #mobile-panel-toggle {
    display: flex;
    position: fixed;
    bottom: 36px;
    right: 8px;
    z-index: 500;
    flex-direction: column;
    gap: 6px;
  }
  .mob-btn {
    width: 40px; height: 40px;
    background: var(--bg2);
    border: 1px solid var(--border2);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px;
    color: var(--text1);
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,.5);
  }
  #left-panel.mob-open, #right-panel.mob-open {
    display: flex;
    position: fixed;
    top: 44px;
    bottom: 28px;
    z-index: 400;
    width: 240px;
  }
  #left-panel.mob-open { left: 0; }
  #right-panel.mob-open { right: 0; }
}
@media (min-width: 769px) {
  #mobile-panel-toggle { display: none; }
}
`;
const GAME_EDITOR_MARKUP = `<div id="app">
  <!-- ══ TITLEBAR ══ -->
  <div id="titlebar">
    <div class="tb-logo">
      <div class="dot"></div>
      FORGE
    </div>

    <!-- File menu -->
    <div class="tb-menu">
      <div class="tb-menu-item" id="menu-file" onclick="toggleMenu('file')">
        File
        <div class="dropdown" id="dd-file">
          <div class="dd-item" onclick="newProject()">📄 New Project<span class="dd-key">Ctrl+N</span></div>
          <div class="dd-item" onclick="openProject()">📂 Open...<span class="dd-key">Ctrl+O</span></div>
          <div class="dd-sep"></div>
          <div class="dd-item" onclick="saveProject()">💾 Save<span class="dd-key">Ctrl+S</span></div>
          <div class="dd-item" onclick="exportHTML5()">📤 Export HTML5</div>
          <div class="dd-sep"></div>
          <div class="dd-item" onclick="openProjectSettings()">⚙️ Project Settings</div>
        </div>
      </div>
      <div class="tb-menu-item" id="menu-edit" onclick="toggleMenu('edit')">
        Edit
        <div class="dropdown" id="dd-edit">
          <div class="dd-item" onclick="undo()">↩ Undo<span class="dd-key">Ctrl+Z</span></div>
          <div class="dd-item" onclick="redo()">↪ Redo<span class="dd-key">Ctrl+Y</span></div>
          <div class="dd-sep"></div>
          <div class="dd-item" onclick="contextEdit('cut')">✂️ Cut<span class="dd-key">Ctrl+X</span></div>
          <div class="dd-item" onclick="contextEdit('copy')">📋 Copy<span class="dd-key">Ctrl+C</span></div>
          <div class="dd-item" onclick="contextEdit('paste')">📌 Paste<span class="dd-key">Ctrl+V</span></div>
        </div>
      </div>
      <div class="tb-menu-item" id="menu-view" onclick="toggleMenu('view')">
        View
        <div class="dropdown" id="dd-view">
          <div class="dd-item" onclick="toggleGrid()">⊞ Toggle Grid</div>
          <div class="dd-item" onclick="resetCamera()">🎥 Reset Camera</div>
          <div class="dd-sep"></div>
          <div class="dd-item" onclick="toggleTheme()">🌓 Toggle Theme</div>
        </div>
      </div>
      <div class="tb-menu-item" id="menu-add" onclick="toggleMenu('add')">
        Add
        <div class="dropdown" id="dd-add">
          <div class="dd-item" onclick="addObject('sprite')">🖼 Sprite</div>
          <div class="dd-item" onclick="addObject('camera')">🎥 Camera</div>
          <div class="dd-item" onclick="addObject('light')">💡 Light</div>
          <div class="dd-item" onclick="addObject('audio')">🔊 Audio Source</div>
          <div class="dd-item" onclick="addObject('trigger')">⚡ Trigger Zone</div>
          <div class="dd-sep"></div>
          <div class="dd-item" onclick="addObject('model')">📦 3D Model</div>
          <div class="dd-item" onclick="addObject('particles')">✨ Particle System</div>
        </div>
      </div>
    </div>

    <div class="tb-spacer"></div>

    <!-- 2D/3D toggle -->
    <div class="tb-mode-group">
      <span style="font-size:10px;color:var(--text2);letter-spacing:1px;margin-right:6px">MODE</span>
      <button class="mode-btn active" id="mode-2d" onclick="setMode('2d')">2D</button>
      <button class="mode-btn" id="mode-3d" onclick="setMode('3d')">3D</button>
    </div>

    <div class="tb-actions">
      <button class="tb-btn" onclick="stopGame()">
        <svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>
        Stop
      </button>
      <button class="tb-btn run" id="run-btn" onclick="runGame()">
        <svg viewBox="0 0 10 10"><polygon points="0,0 10,5 0,10"/></svg>
        Run
      </button>
    </div>
  </div>

  <!-- ══ WORKSPACE ══ -->
  <div id="workspace">

    <!-- LEFT PANEL -->
    <div id="left-panel">
      <div class="panel-tabs">
        <div class="panel-tab active" onclick="setLeftTab('assets')" id="ltab-assets">ASSETS</div>
        <div class="panel-tab" onclick="setLeftTab('libs')" id="ltab-libs">LIBS</div>
        <div class="panel-tab" onclick="setLeftTab('props')" id="ltab-props">PROPS</div>
      </div>
      <!-- Assets tree -->
      <div class="panel-body" id="lpanel-assets">
        <div id="asset-tree"></div>
      </div>
      <!-- Libs -->
      <div class="panel-body hidden" id="lpanel-libs" style="overflow-y:auto;overflow-x:hidden;">
        <div id="lib-list"></div>
      </div>
      <!-- Properties -->
      <div class="panel-body hidden" id="lpanel-props">
        <div id="props-content"></div>
      </div>
    </div>

    <!-- CENTER -->
    <div id="center">
      <div class="editor-tabs">
        <div class="editor-tab active" id="etab-viewport" onclick="setEditorTab('viewport')">
          🎮 Viewport <span class="tag" id="mode-tag" style="margin-left:4px">2D</span>
        </div>
        <div class="editor-tab" id="etab-blocks" onclick="setEditorTab('blocks')">
          ⬡ Block Editor <span class="badge">VISUAL</span>
        </div>
        <div class="editor-tab" id="etab-code" onclick="setEditorTab('code')">
          ◧ Code Editor
        </div>
        <div class="editor-tab" id="etab-pixels" onclick="setEditorTab('pixels')">
          ◼ Pixel Art
        </div>
        <div class="editor-tabs-spacer"></div>
        <button class="ed-tool-btn active" id="snap-btn" onclick="toggleSnap()">⊞ SNAP</button>
        <button class="ed-tool-btn" onclick="focusSelected()">⊙ FOCUS</button>
      </div>

      <div class="editor-area">
        <!-- VIEWPORT -->
        <div id="viewport" class="editor-area">
          <div class="vp-grid" id="vp-grid"></div>
          <div class="vp-canvas-wrap" id="vp-wrap">
            <canvas id="vp-canvas" width="800" height="450"></canvas>
          </div>
          <div class="vp-toolbar">
            <div class="vp-btn active" id="tool-select" title="Select" onclick="setVpTool('select')">↖</div>
            <div class="vp-btn" id="tool-move" title="Move" onclick="setVpTool('move')">✥</div>
            <div class="vp-btn" id="tool-scale" title="Scale" onclick="setVpTool('scale')">⤡</div>
            <div class="vp-btn" id="tool-rotate" title="Rotate" onclick="setVpTool('rotate')">↻</div>
          </div>
          <div class="vp-info" id="vp-info">
            <span>X: <span id="vp-x">0</span></span>
            <span>Y: <span id="vp-y">0</span></span>
            <span>Zoom: <span id="vp-zoom">100</span>%</span>
          </div>
        </div>

        <!-- BLOCK EDITOR -->
        <div id="block-editor" class="hidden">
          <svg class="be-svg" id="be-svg"></svg>
          <div class="be-canvas" id="be-canvas"></div>
          <div class="be-toolbar">
            <button class="be-tb-btn" onclick="addBlock()">＋ Add Block</button>
            <button class="be-tb-btn" onclick="validateBlocks()">✓ Validate</button>
            <button class="be-tb-btn" onclick="generateCode()">⟶ To Code</button>
            <button class="be-tb-btn" onclick="clearBlocks()" style="margin-left:8px" >↺ Reset</button>
            <button class="be-tb-btn danger" onclick="deleteSelected()">✕ Delete</button>
          </div>
          <div class="be-valid hidden" id="be-valid"></div>
        </div>

        <!-- CODE EDITOR -->
        <div id="code-editor" class="hidden">
          <div class="ce-toolbar">
            <span class="ce-tb-label">Script</span>
            <button class="ed-tool-btn" onclick="formatCode()">⊞ Format</button>
            <button class="ed-tool-btn" onclick="runSnippet()">▶ Run</button>
            <div style="flex:1"></div>
            <span style="font-size:10px;font-family:var(--mono);color:var(--text2)" id="ce-cursor-pos">Ln 1, Col 1</span>
          </div>
          <div class="ce-wrap">
            <div id="line-nums"></div>
            <div id="code-highlight" aria-hidden="true"></div>
            <textarea id="code-area" spellcheck="false" autocorrect="off" autocapitalize="off"
              onkeyup="onCodeKey(event)" oninput="onCodeInput(event)" onscroll="syncScroll()" onclick="updateCursor()" onkeydown="handleCodeKeyDown(event)"></textarea>
            <div id="autocomplete"></div>
          </div>
          <div class="ce-status">
            <span>JS</span>
            <span id="ce-status-msg" class="con-success">● Ready</span>
            <span style="margin-left:auto;font-size:10px;color:var(--text2)" id="ce-line-count">1 line</span>
          </div>
        </div>

        <!-- PIXEL EDITOR -->
        <div id="pixel-editor" class="hidden">
          <!-- Original + Edited sprite reference -->
          <div class="pe-reference" id="pe-reference-panel" style="display:none">
            <div class="pe-reference-title">Original</div>
            <canvas class="pe-reference-canvas" id="pe-ref-canvas" width="32" height="32" title="Original uploaded sprite"></canvas>
            <div class="pe-reference-label" id="pe-ref-label">—</div>
            <div class="pe-reference-title" style="margin-top:4px">Edited</div>
            <canvas class="pe-edited-canvas" id="pe-edited-canvas" width="32" height="32" title="Current edited sprite"></canvas>
          </div>
          <div class="pe-tools" id="pe-tools"></div>
          <div class="pe-center">
            <div class="pe-checkerboard"></div>
            <canvas id="pe-canvas"></canvas>
            <div class="pe-zoom-info" id="pe-zoom-info">32 × 32 · 1×</div>
          </div>
          <div class="pe-right">
            <div class="pe-section">
              <div class="pe-section-title">Active Color</div>
              <div class="pe-color-preview" id="pe-color-preview"></div>
              <input type="color" id="pe-color-picker" value="#e94560"
                style="width:100%;height:28px;border:1px solid var(--border2);border-radius:4px;background:var(--bg2);cursor:pointer"
                oninput="setPeColor(this.value)"/>
            </div>
            <div class="pe-section">
              <div class="pe-section-title">Palette</div>
              <div class="pe-palette" id="pe-palette"></div>
            </div>
            <div class="pe-section">
              <div class="pe-section-title">Canvas Size</div>
              <div class="prop-row">
                <span class="prop-label">Width</span>
                <input class="prop-input" id="pe-w" type="number" value="32" min="4" max="512" style="width:60px" oninput="resizePeCanvas()" onchange="resizePeCanvas()"/>
              </div>
              <div class="prop-row">
                <span class="prop-label">Height</span>
                <input class="prop-input" id="pe-h" type="number" value="32" min="4" max="512" style="width:60px" oninput="resizePeCanvas()" onchange="resizePeCanvas()"/>
              </div>
              <div class="prop-row">
                <span class="prop-label">Zoom</span>
                <input class="prop-input" id="pe-zoom" type="range" min="2" max="24" value="12" oninput="setPeZoom(this.value)" style="flex:1"/>
              </div>
            </div>
            <div class="pe-section">
              <div class="pe-section-title">Layers</div>
              <div class="pe-layers" id="pe-layers"></div>
              <button class="be-tb-btn" style="margin-top:6px;font-size:10px" onclick="addPeLayer()">＋ Layer</button>
            </div>
            <div class="pe-section">
              <button class="be-tb-btn" style="width:100%;justify-content:center;margin-bottom:4px" onclick="savePixelArtToSprite()">🖼 Save to Sprite</button>
              <button class="be-tb-btn" style="width:100%;justify-content:center" onclick="exportPeSprite()">⤓ Export PNG</button>
            </div>
          </div>
        </div>
      </div>

      <!-- CONSOLE -->
      <div id="console-panel">
        <div class="console-header" onclick="toggleConsole()">
          <span>▼ CONSOLE</span>
          <span style="margin-left:auto;font-size:9px;color:var(--text2)" id="con-count">0 messages</span>
          <button class="btn-icon" onclick="clearConsole();event.stopPropagation()">✕</button>
        </div>
        <div id="console-output"></div>
      </div>
    </div>

    <!-- RIGHT PANEL -->
    <div id="right-panel">
      <div class="panel-tabs">
        <div class="panel-tab active" onclick="setRightTab('scene')" id="rtab-scene">SCENE</div>
        <div class="panel-tab" onclick="setRightTab('inspect')" id="rtab-inspect">INSPECT</div>
      </div>
      <div class="panel-body" id="rpanel-scene">
        <div id="hier-tree"></div>
      </div>
      <div class="panel-body hidden" id="rpanel-inspect">
        <div id="inspect-content"></div>
      </div>
    </div>

  </div><!-- /workspace -->

  <!-- STATUS BAR -->
  <div id="statusbar">
    <div class="sb-item"><span class="sb-dot"></span><span>FORGE</span> Engine v1.0</div>
    <div class="sb-item">Mode: <span id="sb-mode">2D</span></div>
    <div class="sb-item">Objects: <span id="sb-objects">1</span></div>
    <div class="sb-item">FPS: <span id="sb-fps">60</span></div>
    <div class="sb-right">
      <div class="sb-item" id="sb-msg">Ready</div>
    </div>
  </div>

</div><!-- /app -->

<!-- Mobile panel toggles (visible only on small screens) -->
<div id="mobile-panel-toggle">
  <div class="mob-btn" title="Toggle Left Panel" onclick="document.getElementById('left-panel').classList.toggle('mob-open')">☰</div>
  <div class="mob-btn" title="Toggle Right Panel" onclick="document.getElementById('right-panel').classList.toggle('mob-open')">⊞</div>
</div>

<!-- New Project Modal -->
<div class="modal-overlay" id="modal-new">
  <div class="modal">
    <div class="modal-title">New Project</div>
    <div class="modal-row">
      <span class="modal-label">Name</span>
      <input class="modal-input" id="proj-name" value="MyGame" placeholder="Project name"/>
    </div>
    <div class="modal-row">
      <span class="modal-label">Mode</span>
      <select class="modal-input" id="proj-mode">
        <option value="2d">2D</option>
        <option value="3d">3D</option>
      </select>
    </div>
    <div class="modal-row">
      <span class="modal-label">Width</span>
      <input class="modal-input" id="proj-w" value="800" type="number"/>
    </div>
    <div class="modal-row">
      <span class="modal-label">Height</span>
      <input class="modal-input" id="proj-h" value="450" type="number"/>
    </div>
    <div class="modal-actions">
      <button class="modal-btn cancel" onclick="closeModal('modal-new')">Cancel</button>
      <button class="modal-btn confirm" onclick="confirmNewProject()">Create</button>
    </div>
  </div>
</div>
`;

const GAME_EDITOR_RUNTIME = `
'use strict';

// ═══════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════
const STATE = {
  mode: '2d',
  editorTab: 'viewport',
  leftTab: 'assets',
  rightTab: 'scene',
  vpTool: 'select',
  snap: true,
  gridVisible: true,
  zoom: 1,
  panX: 0, panY: 0,
  selectedId: null,
  running: false,
  undoStack: [], redoStack: [],
  projectName: 'MyGame',
  projectSettings: {
    backgroundColor: '#0d0f18',
    targetFps: 60,
    fixedTimestep: 16.666,
    physicsGravity: 9.8,
    snapSize: 20,
    gridStep: 50,
    renderPixelated: true,
    autoSave: false,
    show3DStats: true,
    multiplayer: {
      enabled: false,
      mode: 'local',
      roomId: '',
      maxPlayers: 4,
      tickRate: 30,
      autoHost: true,
      syncScene: true,
    },
  },
  objects: [],
  nextId: 10,
  fps: 0, frameCount: 0, lastFpsTime: performance.now(),
};

const LIBS = [
  {name:'Camera',   color:'#8b5cf6', desc:'Viewport & projection control'},
  {name:'Canvas',   color:'#06b6d4', desc:'2D drawing surface'},
  {name:'Canvex',   color:'#06b6d4', desc:'Extended canvas utilities'},
  {name:'Color',    color:'#ec4899', desc:'Color manipulation & palettes'},
  {name:'Curves',   color:'#f59e0b', desc:'Bezier & spline curves'},
  {name:'DateTime', color:'#6366f1', desc:'Time & scheduling'},
  {name:'Devices',  color:'#84cc16', desc:'Input device handling'},
  {name:'Elements', color:'#14b8a6', desc:'DOM & game object elements'},
  {name:'Events',   color:'#f97316', desc:'Event system & emitters'},
  {name:'GUI',      color:'#a855f7', desc:'UI components'},
  {name:'Flow',     color:'#0ea5e9', desc:'Control flow & game loop'},
  {name:'Helpers',  color:'#64748b', desc:'Utility functions'},
  {name:'Image',    color:'#22c55e', desc:'Image loading & manipulation'},
  {name:'IO',       color:'#ef4444', desc:'File & network I/O'},
  {name:'Lights',   color:'#fbbf24', desc:'Lighting systems'},
  {name:'List',     color:'#6b7280', desc:'Array & collection utilities'},
  {name:'Logic',    color:'#e67e22', desc:'Boolean logic & conditions'},
  {name:'math',     color:'#3b82f6', desc:'Math utilities & vectors'},
  {name:'Models',   color:'#7c3aed', desc:'3D model loader'},
  {name:'Multiplayer',color:'#059669',desc:'Network & multiplayer'},
  {name:'PixelArt', color:'#db2777', desc:'Pixel art tools'},
  {name:'Particles',color:'#d97706', desc:'Particle systems'},
  {name:'Physics',  color:'#2563eb', desc:'Physics engine'},
  {name:'Properties',color:'#64748b',desc:'Object properties'},
  {name:'Shapes',   color:'#7c3aed', desc:'Primitive shape drawing'},
  {name:'Sound',    color:'#1abc9c', desc:'Audio playback & mixing'},
  {name:'Sprites',  color:'#9b59b6', desc:'Sprite management'},
  {name:'Text',     color:'#f59e0b', desc:'Text rendering'},
  {name:'Transform',color:'#e74c3c', desc:'Transform manipulation'},
  {name:'Triggers', color:'#1d4ed8', desc:'Trigger zones & events'},
];

// ═══════════════════════════════════════════════════════
//  DYNAMIC BLOCK GENERATION FROM LIBRARY METHODS
// ═══════════════════════════════════════════════════════
/**
 * Library method metadata for block generation.
 * Maps library names to their methods and port configurations.
 */
const LIB_METHODS = {
  Camera: {
    color: '#8b5cf6', bg: 'rgba(139,92,246,.12)',
    methods: [
      { name: 'follow', display: 'Follow Target', ports: { in: ['exec'], out: ['done'] } },
      { name: 'shake', display: 'Shake', ports: { in: ['exec'], out: ['done'] } },
      { name: 'setZoom', display: 'Set Zoom', ports: { in: ['exec'], out: ['done'] } },
      { name: 'move', display: 'Move Camera', ports: { in: ['exec'], out: ['done'] } },
    ]
  },
  Canvas: {
    color: '#06b6d4', bg: 'rgba(6,182,212,.12)',
    methods: [
      { name: 'clear', display: 'Clear Canvas', ports: { in: ['exec'], out: ['done'] } },
      { name: 'fillRect', display: 'Fill Rect', ports: { in: ['exec'], out: ['done'] } },
      { name: 'strokeRect', display: 'Stroke Rect', ports: { in: ['exec'], out: ['done'] } },
    ]
  },
  Shapes: {
    color: '#7c3aed', bg: 'rgba(124,58,237,.12)',
    methods: [
      { name: 'circle', display: 'Draw Circle', ports: { in: ['exec'], out: ['done'] } },
      { name: 'rect', display: 'Draw Rectangle', ports: { in: ['exec'], out: ['done'] } },
      { name: 'line', display: 'Draw Line', ports: { in: ['exec'], out: ['done'] } },
    ]
  },
  Sprites: {
    color: '#9b59b6', bg: 'rgba(155,89,182,.12)',
    methods: [
      { name: 'load', display: 'Load Sprite', ports: { in: ['exec'], out: ['done'] } },
      { name: 'draw', display: 'Draw Sprite', ports: { in: ['exec'], out: ['done'] } },
    ]
  },
  Sound: {
    color: '#1abc9c', bg: 'rgba(26,188,156,.12)',
    methods: [
      { name: 'play', display: 'Play Sound', ports: { in: ['exec'], out: ['done'] } },
      { name: 'stop', display: 'Stop Sound', ports: { in: ['exec'], out: ['done'] } },
    ]
  },
  Physics: {
    color: '#3b82f6', bg: 'rgba(59,130,246,.12)',
    methods: [
      { name: 'applyForce', display: 'Apply Force', ports: { in: ['exec'], out: ['done'] } },
      { name: 'setVelocity', display: 'Set Velocity', ports: { in: ['exec'], out: ['done'] } },
    ]
  },
  Text: {
    color: '#f59e0b', bg: 'rgba(245,158,11,.12)',
    methods: [
      { name: 'draw', display: 'Draw Text', ports: { in: ['exec'], out: ['done'] } },
      { name: 'measure', display: 'Measure Text', ports: { in: ['exec'], out: ['done'] } },
    ]
  },
  Color: {
    color: '#ec4899', bg: 'rgba(236,72,153,.12)',
    methods: [
      { name: 'hex', display: 'From Hex', ports: { in: ['exec'], out: ['done'] } },
      { name: 'rgb', display: 'From RGB', ports: { in: ['exec'], out: ['done'] } },
    ]
  },
  math: {
    color: '#3b82f6', bg: 'rgba(59,130,246,.12)',
    methods: [
      { name: 'radians', display: 'To Radians', ports: { in: ['exec'], out: ['done'] } },
      { name: 'degrees', display: 'To Degrees', ports: { in: ['exec'], out: ['done'] } },
      { name: 'random', display: 'Random', ports: { in: ['exec'], out: ['done'] } },
    ]
  },
};

/**
 * Dynamically generate block definitions from LIB_METHODS.
 * Creates a merged BLOCK_DEFS with both custom and auto-generated blocks.
 */
function generateBlockDefsFromLibs() {
  const generated = {};
  for (const [libName, libData] of Object.entries(LIB_METHODS)) {
    generated[libName] = {
      color: libData.color,
      bg: libData.bg,
      types: libData.methods.map(method => ({
        name: method.display,
        method: method.name,
        library: libName,
        ports: method.ports,
        params: [
          { k: 'arg1', v: '', type: 'text', optional: true },
          { k: 'arg2', v: '', type: 'text', optional: true },
          { k: 'arg3', v: '', type: 'text', optional: true },
        ]
      }))
    };
  }
  return generated;
}

const BLOCK_DEFS = {
  // ── Events ───────────────────────────────────────────────────
  Events: { color:'#f97316', bg:'rgba(249,115,22,.12)',
    types:[
      {name:'On Key Press',   ports:{in:[],out:['then']},     params:[{k:'key',v:'Space',type:'select',options:['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Escape','w','a','s','d','Shift','Control','z','x','c']}]},
      {name:'On Key Release', ports:{in:[],out:['then']},     params:[{k:'key',v:'Space',type:'select',options:['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter','Escape','w','a','s','d']}]},
      {name:'On Click',       ports:{in:[],out:['then']},     params:[{k:'button',v:'left',type:'select',options:['left','right','middle']}]},
      {name:'On Collision',   ports:{in:[],out:['then','other']}, params:[{k:'tag',v:'enemy',type:'text'},{k:'target',v:'',type:'target'}]},
      {name:'On Timer',       ports:{in:[],out:['tick']},     params:[{k:'ms',v:'1000',type:'number'},{k:'repeat',v:'true',type:'select',options:['true','false']}]},
      {name:'On Trigger Enter',ports:{in:[],out:['enter']},   params:[{k:'zone',v:'',type:'target'}]},
      {name:'On Trigger Exit', ports:{in:[],out:['exit']},    params:[{k:'zone',v:'',type:'target'}]},
      {name:'Emit Event',     ports:{in:['exec'],out:['done']},params:[{k:'event',v:'custom',type:'text'},{k:'data',v:'{}',type:'text'}]},
      {name:'On Event',       ports:{in:[],out:['then']},     params:[{k:'event',v:'custom',type:'text'}]},
    ]},
  // ── Physics ──────────────────────────────────────────────────
  Physics: { color:'#3b82f6', bg:'rgba(59,130,246,.12)',
    types:[
      {name:'Apply Force',     ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'x',v:'0',type:'number'},{k:'y',v:'-300',type:'number'}]},
      {name:'Apply Impulse',   ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'x',v:'0',type:'number'},{k:'y',v:'-500',type:'number'}]},
      {name:'Set Velocity',    ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'x',v:'5',type:'number'},{k:'y',v:'0',type:'number'}]},
      {name:'Stop Movement',   ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'}]},
      {name:'Add Gravity',     ports:{in:['exec'],out:['done']}, params:[{k:'g',v:'9.8',type:'number'}]},
      {name:'Set Gravity',     ports:{in:['exec'],out:['done']}, params:[{k:'g',v:'9.8',type:'number'}]},
      {name:'Detect Collision',ports:{in:['exec'],out:['hit','miss']},params:[{k:'a',v:'',type:'target'},{k:'b',v:'',type:'target'}]},
      {name:'Raycast',         ports:{in:['exec'],out:['hit','miss']},params:[{k:'fromX',v:'0',type:'number'},{k:'fromY',v:'0',type:'number'},{k:'angle',v:'0',type:'number'},{k:'dist',v:'200',type:'number'}]},
      {name:'Enable Physics',  ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'mass',v:'1',type:'number'},{k:'bounciness',v:'0.3',type:'number'}]},
    ]},
  // ── Transform ────────────────────────────────────────────────
  Transform: { color:'#e74c3c', bg:'rgba(231,76,60,.12)',
    types:[
      {name:'Move To',     ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'x',v:'0',type:'number'},{k:'y',v:'0',type:'number'}]},
      {name:'Move By',     ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'dx',v:'0',type:'number'},{k:'dy',v:'0',type:'number'}]},
      {name:'Rotate',      ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'deg',v:'45',type:'number'}]},
      {name:'Rotate To',   ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'deg',v:'0',type:'number'}]},
      {name:'Scale',       ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'x',v:'1',type:'number'},{k:'y',v:'1',type:'number'}]},
      {name:'Set Size',    ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'w',v:'48',type:'number'},{k:'h',v:'48',type:'number'}]},
      {name:'Flip',        ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'axis',v:'x',type:'select',options:['x','y','both']}]},
      {name:'Look At',     ports:{in:['exec'],out:['done']}, params:[{k:'source',v:'',type:'target'},{k:'dest',v:'',type:'target'}]},
      {name:'Lerp To',     ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'x',v:'0',type:'number'},{k:'y',v:'0',type:'number'},{k:'t',v:'0.1',type:'number'}]},
    ]},
  // ── Sprites ──────────────────────────────────────────────────
  Sprites: { color:'#9b59b6', bg:'rgba(155,89,182,.12)',
    types:[
      {name:'Load Sprite',    ports:{in:['exec'],out:['done']},  params:[{k:'target',v:'',type:'target'},{k:'src',v:'player.png',type:'text'}]},
      {name:'Play Animation', ports:{in:['exec'],out:['end']},   params:[{k:'target',v:'',type:'target'},{k:'anim',v:'run',type:'text'},{k:'loop',v:'true',type:'select',options:['true','false']}]},
      {name:'Stop Animation', ports:{in:['exec'],out:['done']},  params:[{k:'target',v:'',type:'target'}]},
      {name:'Set Frame',      ports:{in:['exec'],out:['done']},  params:[{k:'target',v:'',type:'target'},{k:'frame',v:'0',type:'number'}]},
      {name:'Set Opacity',    ports:{in:['exec'],out:['done']},  params:[{k:'target',v:'',type:'target'},{k:'val',v:'1',type:'number'}]},
      {name:'Set Tint',       ports:{in:['exec'],out:['done']},  params:[{k:'target',v:'',type:'target'},{k:'color',v:'#ffffff',type:'color'}]},
      {name:'Set Visible',    ports:{in:['exec'],out:['done']},  params:[{k:'target',v:'',type:'target'},{k:'visible',v:'true',type:'select',options:['true','false']}]},
      {name:'Draw Sprite',    ports:{in:['exec'],out:['done']},  params:[{k:'src',v:'player.png',type:'text'},{k:'x',v:'0',type:'number'},{k:'y',v:'0',type:'number'}]},
    ]},
  // ── Sound ────────────────────────────────────────────────────
  Sound: { color:'#1abc9c', bg:'rgba(26,188,156,.12)',
    types:[
      {name:'Play Sound',   ports:{in:['exec'],out:['end']},  params:[{k:'src',v:'jump.wav',type:'text'},{k:'volume',v:'1',type:'number'},{k:'loop',v:'false',type:'select',options:['false','true']}]},
      {name:'Stop Sound',   ports:{in:['exec'],out:['done']}, params:[{k:'src',v:'music.mp3',type:'text'}]},
      {name:'Stop All',     ports:{in:['exec'],out:['done']}, params:[]},
      {name:'Set Volume',   ports:{in:['exec'],out:['done']}, params:[{k:'vol',v:'0.8',type:'number'}]},
      {name:'Fade In',      ports:{in:['exec'],out:['done']}, params:[{k:'src',v:'music.mp3',type:'text'},{k:'ms',v:'1000',type:'number'}]},
      {name:'Fade Out',     ports:{in:['exec'],out:['done']}, params:[{k:'src',v:'music.mp3',type:'text'},{k:'ms',v:'500',type:'number'}]},
    ]},
  // ── Logic ────────────────────────────────────────────────────
  Logic: { color:'#e67e22', bg:'rgba(230,126,34,.12)',
    types:[
      {name:'If / Else',  ports:{in:['exec','cond'],out:['true','false']}, params:[]},
      {name:'Compare',    ports:{in:['a','b'],out:['result']},            params:[{k:'op',v:'==',type:'select',options:['==','!=','>','<','>=','<=']}]},
      {name:'AND Gate',   ports:{in:['a','b'],out:['out']},               params:[]},
      {name:'OR Gate',    ports:{in:['a','b'],out:['out']},               params:[]},
      {name:'NOT Gate',   ports:{in:['a'],out:['out']},                   params:[]},
      {name:'Switch',     ports:{in:['exec','value'],out:['A','B','C','default']}, params:[{k:'A',v:'0',type:'text'},{k:'B',v:'1',type:'text'},{k:'C',v:'2',type:'text'}]},
    ]},
  // ── Camera ───────────────────────────────────────────────────
  Camera: { color:'#8b5cf6', bg:'rgba(139,92,246,.12)',
    types:[
      {name:'Follow Target', ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'speed',v:'0.1',type:'number'},{k:'lag',v:'0.08',type:'number'}]},
      {name:'Shake',         ports:{in:['exec'],out:['done']}, params:[{k:'mag',v:'5',type:'number'},{k:'ms',v:'300',type:'number'}]},
      {name:'Set Zoom',      ports:{in:['exec'],out:['done']}, params:[{k:'zoom',v:'1.5',type:'number'}]},
      {name:'Move Camera',   ports:{in:['exec'],out:['done']}, params:[{k:'x',v:'0',type:'number'},{k:'y',v:'0',type:'number'},{k:'ease',v:'true',type:'select',options:['true','false']}]},
      {name:'Reset Camera',  ports:{in:['exec'],out:['done']}, params:[]},
      {name:'Set Background',ports:{in:['exec'],out:['done']}, params:[{k:'color',v:'#0d0f18',type:'color'}]},
    ]},
  // ── Flow ─────────────────────────────────────────────────────
  Flow: { color:'#0ea5e9', bg:'rgba(14,165,233,.12)',
    types:[
      {name:'Sequence',    ports:{in:['exec'],out:['1','2','3']}, params:[]},
      {name:'Delay',       ports:{in:['exec'],out:['done']},      params:[{k:'ms',v:'500',type:'number'}]},
      {name:'Loop',        ports:{in:['exec'],out:['body','done']},params:[{k:'n',v:'10',type:'number'}]},
      {name:'While',       ports:{in:['exec','cond'],out:['body','done']}, params:[]},
      {name:'Wait For',    ports:{in:['exec'],out:['done']},      params:[{k:'frames',v:'60',type:'number'}]},
      {name:'Run Script',  ports:{in:['exec'],out:['done']},      params:[{k:'fn',v:'myFunction',type:'text'}]},
      {name:'Stop Flow',   ports:{in:['exec'],out:[]},            params:[]},
    ]},
  // ── Canvas ───────────────────────────────────────────────────
  Canvas: { color:'#06b6d4', bg:'rgba(6,182,212,.12)',
    types:[
      {name:'Create Canvas', ports:{in:['exec'],out:['done']}, params:[{k:'id',v:'main',type:'text'},{k:'w',v:'800',type:'number'},{k:'h',v:'450',type:'number'}]},
      {name:'Clear',         ports:{in:['exec'],out:['done']}, params:[{k:'color',v:'#0d0f18',type:'color'}]},
      {name:'Fill Rect',     ports:{in:['exec'],out:['done']}, params:[{k:'x',v:'0',type:'number'},{k:'y',v:'0',type:'number'},{k:'w',v:'100',type:'number'},{k:'h',v:'100',type:'number'},{k:'color',v:'#ff0000',type:'color'}]},
      {name:'Draw Text',     ports:{in:['exec'],out:['done']}, params:[{k:'text',v:'Hello',type:'text'},{k:'x',v:'20',type:'number'},{k:'y',v:'30',type:'number'},{k:'color',v:'#ffffff',type:'color'},{k:'size',v:'16',type:'number'}]},
      {name:'Draw Line',     ports:{in:['exec'],out:['done']}, params:[{k:'x1',v:'0',type:'number'},{k:'y1',v:'0',type:'number'},{k:'x2',v:'100',type:'number'},{k:'y2',v:'100',type:'number'},{k:'color',v:'#00d4ff',type:'color'}]},
      {name:'Draw Circle',   ports:{in:['exec'],out:['done']}, params:[{k:'x',v:'100',type:'number'},{k:'y',v:'100',type:'number'},{k:'r',v:'40',type:'number'},{k:'color',v:'#ff0000',type:'color'},{k:'fill',v:'true',type:'select',options:['true','false']}]},
    ]},
  // ── Shapes ───────────────────────────────────────────────────
  Shapes: { color:'#7c3aed', bg:'rgba(124,58,237,.12)',
    types:[
      {name:'Draw Box',     ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'color',v:'#ff0000',type:'color'}]},
      {name:'Draw Circle',  ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'color',v:'#00d4ff',type:'color'}]},
      {name:'Draw Line',    ports:{in:['exec'],out:['done']}, params:[{k:'x1',v:'0',type:'number'},{k:'y1',v:'0',type:'number'},{k:'x2',v:'100',type:'number'},{k:'y2',v:'100',type:'number'},{k:'stroke',v:'#ffffff',type:'color'},{k:'width',v:'2',type:'number'}]},
      {name:'Draw Polygon', ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'sides',v:'6',type:'number'},{k:'color',v:'#7c3aed',type:'color'}]},
    ]},
  // ── Color ────────────────────────────────────────────────────
  Color: { color:'#ec4899', bg:'rgba(236,72,153,.12)',
    types:[
      {name:'Use Color',   ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'color',v:'#e94560',type:'color'}]},
      {name:'Random Color',ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'}]},
      {name:'Lerp Color',  ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'from',v:'#000000',type:'color'},{k:'to',v:'#ffffff',type:'color'},{k:'t',v:'0.5',type:'number'}]},
      {name:'Set Tint',    ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'color',v:'#ffffff',type:'color'},{k:'alpha',v:'1',type:'number'}]},
    ]},
  // ── Particles ────────────────────────────────────────────────
  Particles: { color:'#d97706', bg:'rgba(217,119,6,.12)',
    types:[
      {name:'Emit Burst',   ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'count',v:'20',type:'number'},{k:'speed',v:'100',type:'number'},{k:'color',v:'#fbbf24',type:'color'}]},
      {name:'Start Emitter',ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'rate',v:'10',type:'number'}]},
      {name:'Stop Emitter', ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'}]},
      {name:'Set Gravity',  ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'g',v:'50',type:'number'}]},
    ]},
  // ── Lights ───────────────────────────────────────────────────
  Lights: { color:'#fbbf24', bg:'rgba(251,191,36,.12)',
    types:[
      {name:'Add Light',    ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'intensity',v:'1',type:'number'},{k:'color',v:'#ffe066',type:'color'},{k:'radius',v:'200',type:'number'}]},
      {name:'Remove Light', ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'}]},
      {name:'Set Intensity',ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'val',v:'1',type:'number'}]},
      {name:'Flicker',      ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'speed',v:'0.1',type:'number'},{k:'range',v:'0.3',type:'number'}]},
    ]},
  // ── Text ─────────────────────────────────────────────────────
  Text: { color:'#f59e0b', bg:'rgba(245,158,11,.12)',
    types:[
      {name:'Show Text',    ports:{in:['exec'],out:['done']}, params:[{k:'text',v:'Score: 0',type:'text'},{k:'x',v:'20',type:'number'},{k:'y',v:'30',type:'number'},{k:'size',v:'16',type:'number'},{k:'color',v:'#ffffff',type:'color'}]},
      {name:'Set Text',     ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'text',v:'',type:'text'}]},
      {name:'Typewriter',   ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'text',v:'Hello World',type:'text'},{k:'ms',v:'50',type:'number'}]},
    ]},
  // ── Triggers ─────────────────────────────────────────────────
  Triggers: { color:'#1d4ed8', bg:'rgba(29,78,216,.12)',
    types:[
      {name:'Create Trigger', ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'},{k:'tag',v:'zone1',type:'text'}]},
      {name:'Remove Trigger', ports:{in:['exec'],out:['done']}, params:[{k:'target',v:'',type:'target'}]},
      {name:'Is Inside',      ports:{in:['exec'],out:['yes','no']}, params:[{k:'obj',v:'',type:'target'},{k:'zone',v:'',type:'target'}]},
    ]},
};

// Default scene objects — only camera on fresh load
STATE.objects = [
  {id:1, name:'Main Camera', type:'camera', x:400,y:225,w:40,h:30,z:0,rot:0,scaleX:1,scaleY:1,color:'#fbbf24',visible:true,locked:false},
];
STATE.nextId = 2;

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  buildAssetTree();
  buildLibList();
  buildPropsPanel();
  buildHierarchy();
  buildBlockEditor();
  initCodeEditor();
  initPixelEditor();
  renderViewport();
  updateStatusBar();
  startFpsCounter();
  logConsole('info', 'FORGE Engine initialized');
  logConsole('success', \`Project "\${STATE.projectName}" loaded\`);
  logConsole('info', \`Libs loaded: \${LIBS.length} modules\`);
});

document.addEventListener('keydown', e => {
  if (e.ctrlKey||e.metaKey) {
    if(e.key==='s'){e.preventDefault();saveProject();}
    if(e.key==='z'){e.preventDefault();undo();}
    if(e.key==='y'){e.preventDefault();redo();}
    if(e.key==='n'){e.preventDefault();newProject();}
  }
  if(e.key==='Delete'&&STATE.selectedId&&STATE.editorTab==='viewport'){deleteObject(STATE.selectedId);}
});
document.addEventListener('click', e => {
  document.querySelectorAll('.dropdown').forEach(d=>d.classList.remove('open'));
});
document.addEventListener('visibilitychange',()=>{ if(document.hidden) autosavePixelEditorToSpritePreview?.(); });
window.addEventListener('beforeunload',()=>{ autosavePixelEditorToSpritePreview?.(); });

// ═══════════════════════════════════════════════════════
//  MENUS / NAV
// ═══════════════════════════════════════════════════════
function toggleMenu(name, evt) {
  const e = evt || window.event;
  if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
  const dd = document.getElementById('dd-'+name);
  const shouldOpen = dd && !dd.classList.contains('open');
  document.querySelectorAll('.dropdown').forEach(d=>d.classList.remove('open'));
  if (dd) dd.classList.toggle('open', shouldOpen);
}

function setMode(m) {
  STATE.mode = m;
  document.getElementById('mode-2d').classList.toggle('active', m==='2d');
  document.getElementById('mode-3d').classList.toggle('active', m==='3d');
  document.getElementById('mode-tag').className = 'tag '+(m==='2d'?'tag-2d':'tag-3d');
  document.getElementById('mode-tag').textContent = m.toUpperCase();
  document.getElementById('sb-mode').textContent = m.toUpperCase();
  
  // Ensure the 2D overlay grid never covers the 3D viewport
  const _gridEl = document.getElementById('vp-grid');
  if (_gridEl) {
    _gridEl.style.display = (STATE.gridVisible && m === '2d') ? '' : 'none';
  }
renderViewport();
  logConsole('info', \`Switched to \${m.toUpperCase()} mode\`);
  setStatusMsg(\`Mode: \${m.toUpperCase()}\`);
}

function setEditorTab(tab) {
  STATE.editorTab = tab;
  const panels = { viewport:'viewport', blocks:'block-editor', code:'code-editor', pixels:'pixel-editor' };
  Object.keys(panels).forEach(t=>{
    const tabEl = document.getElementById('etab-'+t);
    const panelEl = document.getElementById(panels[t]);
    if (tabEl) tabEl.classList.toggle('active', t===tab);
    if (panelEl) panelEl.classList.toggle('hidden', t!==tab);
  });
  if(tab==='code') {
    refreshCodeHighlight();
    syncScroll();
    requestAnimationFrame(()=>document.getElementById('code-area')?.focus());
  }
  if(tab==='pixels') drawPeCanvas();
  if(tab==='blocks') renderBlockEditor();
  if(tab==='viewport') renderViewport();
}

function setLeftTab(tab) {
  STATE.leftTab = tab;
  ['assets','libs','props'].forEach(t=>{
    document.getElementById('ltab-'+t)?.classList.toggle('active',t===tab);
    document.getElementById('lpanel-'+t)?.classList.toggle('hidden',t!==tab);
  });
  if(tab==='props') renderPropsFor(STATE.objects.find(o=>o.id===STATE.selectedId)||null);
}

function setRightTab(tab) {
  STATE.rightTab = tab;
  ['scene','inspect'].forEach(t=>{
    document.getElementById('rtab-'+t)?.classList.toggle('active',t===tab);
    document.getElementById('rpanel-'+t)?.classList.toggle('hidden',t!==tab);
  });
  if(tab==='scene') buildHierarchy();
  if(tab==='inspect') renderInspect();
}

// ═══════════════════════════════════════════════════════
//  ASSET TREE
// ═══════════════════════════════════════════════════════
const ASSET_TREE = [
  // Fresh projects keep every asset section visible, but empty/collapsed by default.
  {name:'Sprites',   icon:'🖼', open:false, children:[]},
  {name:'Audio',     icon:'🔊', open:false, children:[]},
  {name:'Scripts',   icon:'📜', open:false, children:[]},
  {name:'Shaders',   icon:'✦',  open:false, children:[]},
  {name:'Scenes',    icon:'🎬', open:true,  children:[{name:'main.scene',icon:'🎬'}]},
  {name:'Models',    icon:'📦', open:false, children:[]},
  {name:'Materials', icon:'◆',  open:false, children:[]},
  {name:'Prefabs',   icon:'◇',  open:false, children:[]},
];
// Script content store — in-memory scripts per asset name
const SCRIPT_STORE = {};

// Per-sprite pixel art data store (name → dataURL)
const SPRITE_PIXELDATA = {};

function openAsset(name, icon) {
  if (icon === '🖼' || /\\.png$|\\.jpg$|\\.gif$/i.test(name)) {
    // Open pixel editor with this sprite loaded
    STATE.editingSpriteName = name;
    setEditorTab('pixels');
    // Load saved/uploaded sprite pixels directly into the native Pixel Editor layers.
    requestAnimationFrame(() => {
      const savedURL = getSpriteDataURLByName(name) || STATE.assetData?.[name]?.dataURL || null;
      if(savedURL) loadSpriteDataURLIntoPixelEditor(name,savedURL);
      else {
        const editor = ensurePixelArtEditor?.();
        if(editor?.clear) { try { editor.clear(); } catch (_) {} }
      }
    });
    logConsole('info', \`Opened sprite in Pixel Editor: \${name}\`);
    setStatusMsg(\`Editing: \${name}\`);
    return;
  }
  if (icon === '📜' || /\\.js$/i.test(name)) {
    // Load script content into code editor
    const ta = safeEl('code-area') || document.getElementById('code-area');
    if (ta) {
      const code = SCRIPT_STORE[name] ?? '';
      if (SCRIPT_STORE[name] === undefined) SCRIPT_STORE[name] = '';
      ta.value = code;
      if (typeof refreshCodeHighlight === 'function') { refreshCodeHighlight(); syncScroll?.(); updateCursor?.(); }
      STATE.openScriptName = name;
      // Show script name in code editor status
      const statusEl = safeEl('ce-status-msg');
      if (statusEl) { statusEl.textContent = \`● \${name}\`; statusEl.className = 'con-success'; }
    }
    setEditorTab('code');
    logConsole('info', \`Opened script: \${name}\`);
    setStatusMsg(\`Script: \${name}\`);
    return;
  }
  if (icon === '✦' || /\\.glsl$/i.test(name)) {
    const ta = safeEl('code-area') || document.getElementById('code-area');
    if (ta) {
      const code = SCRIPT_STORE[name] ?? '';
      if (SCRIPT_STORE[name] === undefined) SCRIPT_STORE[name] = '';
      ta.value = code;
      if (typeof refreshCodeHighlight === 'function') refreshCodeHighlight();
      STATE.openScriptName = name;
    }
    setEditorTab('code');
    logConsole('info', \`Opened shader: \${name}\`);
    return;
  }
  if (icon === '🎬' || /\\.scene$/i.test(name)) {
    logConsole('info', \`Scene "\${name}" — scene switching coming soon.\`);
    setStatusMsg(\`Scene: \${name}\`);
    return;
  }
  if (icon === '🔊' || /\\.(wav|mp3|ogg)$/i.test(name)) {
    logConsole('info', \`Audio asset: \${name} — playback not available in editor.\`);
    return;
  }
  logConsole('info', \`Opened: \${name}\`);
}

function buildAssetTree() {
  const el = document.getElementById('asset-tree');
  el.innerHTML = '';
  ASSET_TREE.forEach(sec => {
    const secDiv = document.createElement('div');
    secDiv.className = 'tree-section';
    const hdr = document.createElement('div');
    hdr.className = 'tree-section-header'+(sec.open?' open':'');
    hdr.innerHTML = \`<span class="arrow">▶</span>\${sec.icon} \${sec.name}\`;
    let childEl;
    hdr.onclick = () => {
      sec.open = !sec.open;
      hdr.classList.toggle('open', sec.open);
      childEl.classList.toggle('hidden', !sec.open);
    };
    secDiv.appendChild(hdr);
    childEl = document.createElement('div');
    if(!sec.open) childEl.classList.add('hidden');
    sec.children.forEach(c=>{
      const item = document.createElement('div');
      item.className='tree-item';
      const canOpen = /\\.(js|png|jpg|gif|glsl|scene|wav|mp3)$/i.test(c.name);
      item.innerHTML=\`<span class="tree-icon">\${c.icon}</span><span style="flex:1">\${c.name}</span>\${canOpen?'<span style="font-size:9px;color:var(--text3);font-family:var(--mono)">dbl</span>':''}\`;
      item.title = canOpen ? \`Double-click to open \${c.name}\` : c.name;
      item.onclick = () => {
        document.querySelectorAll('#asset-tree .tree-item').forEach(i=>i.classList.remove('selected'));
        item.classList.add('selected');
        // Single click opens sprites directly; other assets require double-click
        if (c.icon === '🖼' || /\\.png$|\\.jpg$|\\.gif$/i.test(c.name)) {
          openAsset(c.name, c.icon);
        }
      };
      item.ondblclick = () => openAsset(c.name, c.icon);
      childEl.appendChild(item);
    });
    secDiv.appendChild(childEl);
    el.appendChild(secDiv);
  });
}

// ═══════════════════════════════════════════════════════
//  LIB LIST
// ═══════════════════════════════════════════════════════
function buildLibList() {
  const el = document.getElementById('lib-list');
  if (!el) return;
  el.innerHTML = '';
  // group by category
  const cats = {};
  LIBS.forEach(lib => {
    const cat = lib.name === 'math' ? 'Utilities' :
      ['Camera','Canvas','Canvex','Image','Lights','Models'].includes(lib.name) ? 'Rendering' :
      ['Physics','Transform','Curves'].includes(lib.name) ? 'Simulation' :
      ['Events','Flow','Logic','Triggers'].includes(lib.name) ? 'Control' :
      ['Sound','Sprites','PixelArt','Particles','Shapes','Text'].includes(lib.name) ? 'Assets' :
      'Core';
    if(!cats[cat]) cats[cat]=[];
    cats[cat].push(lib);
  });
  Object.entries(cats).forEach(([cat,libs])=>{
    const catDiv = document.createElement('div');
    catDiv.className = 'lib-category';
    catDiv.innerHTML = \`<div class="lib-cat-title">\${cat}</div>\`;
    libs.forEach(lib=>{
      const block = document.createElement('div');
      block.className = 'lib-block';
      block.draggable = true;
      block.innerHTML = \`<div class="lib-block-dot" style="background:\${lib.color}"></div><div style="flex:1"><div style="font-size:12px;font-weight:600;color:var(--text0)">\${lib.name}</div><div style="font-size:10px;color:var(--text2)">\${lib.desc}</div></div>\`;
      block.ondragstart = e => {
        e.dataTransfer.setData('lib', lib.name);
        e.dataTransfer.setData('libColor', lib.color);
      };
      block.ondblclick = () => {
        insertLibIntoCode(lib.name);
        setEditorTab('code');
        setLeftTab('assets');
      };
      catDiv.appendChild(block);
    });
    el.appendChild(catDiv);
  });
}

// ═══════════════════════════════════════════════════════
//  PROPERTIES PANEL
// ═══════════════════════════════════════════════════════
function buildPropsPanel() {
  renderPropsFor(STATE.objects.find(o=>o.id===STATE.selectedId)||null);
}
function renderPropsFor(obj) {
  const el = document.getElementById('props-content');
  if(!obj){ el.innerHTML=\`<div style="font-size:11px;color:var(--text2);padding:10px">Select an object to edit properties.</div>\`; return; }
  el.innerHTML=\`
  <div class="prop-group">
    <div class="prop-group-title">Identity</div>
    <div class="prop-row"><span class="prop-label">Name</span><input class="prop-input" value="\${obj.name}" onchange="setProp(\${obj.id},'name',this.value)"/></div>
    <div class="prop-row"><span class="prop-label">Tag</span><input class="prop-input" value="\${obj.tag||''}" onchange="setProp(\${obj.id},'tag',this.value)"/></div>
    <div class="prop-row"><span class="prop-label">Type</span><span style="font-size:11px;color:var(--accent);font-family:var(--mono)">\${obj.type}</span></div>
  </div>
  <div class="prop-group">
    <div class="prop-group-title">Transform</div>
    <div class="prop-row"><span class="prop-label">X</span><input class="prop-input" type="number" value="\${obj.x}" onchange="setProp(\${obj.id},'x',+this.value)"/></div>
    <div class="prop-row"><span class="prop-label">Y</span><input class="prop-input" type="number" value="\${obj.y}" onchange="setProp(\${obj.id},'y',+this.value)"/></div>
    <div class="prop-row"><span class="prop-label">W</span><input class="prop-input" type="number" value="\${obj.w}" onchange="setProp(\${obj.id},'w',+this.value)"/></div>
    <div class="prop-row"><span class="prop-label">H</span><input class="prop-input" type="number" value="\${obj.h}" onchange="setProp(\${obj.id},'h',+this.value)"/></div>
    <div class="prop-row"><span class="prop-label">Rotation</span><input class="prop-input" type="number" value="\${obj.rot||0}" onchange="setProp(\${obj.id},'rot',+this.value)"/></div>
  </div>
  <div class="prop-group">
    <div class="prop-group-title">Appearance</div>
    <div class="prop-row"><span class="prop-label">Color</span><input class="prop-color" type="color" value="\${obj.color}" oninput="setProp(\${obj.id},'color',this.value)"/></div>
    <div class="prop-row"><span class="prop-label">Visible</span><input class="prop-checkbox" type="checkbox" \${obj.visible?'checked':''} onchange="setProp(\${obj.id},'visible',this.checked)"/></div>
    <div class="prop-row"><span class="prop-label">Locked</span><input class="prop-checkbox" type="checkbox" \${obj.locked?'checked':''} onchange="setProp(\${obj.id},'locked',this.checked)"/></div>
  </div>
  <div class="prop-group">
    <div class="prop-group-title">Z-Order</div>
    <div class="prop-row"><span class="prop-label">Z Index</span><input class="prop-input" type="number" value="\${obj.z||0}" onchange="setProp(\${obj.id},'z',+this.value)"/></div>
  </div>
  <div class="prop-group">
    <div class="prop-group-title">Script</div>
    <div class="prop-row">
      <span class="prop-label">Script</span>
      <select class="prop-select" onchange="setProp(\${obj.id},'script',this.value)">
        <option value="">— none —</option>
        \${Object.keys(SCRIPT_STORE).filter(k=>k.endsWith('.js')).map(k=>\`<option value="\${k}" \${obj.script===k?'selected':''}>\${k}</option>\`).join('')}
      </select>
    </div>
    \${obj.script ? \`<div class="prop-row"><button class="be-tb-btn" style="font-size:10px;width:100%;justify-content:center" onclick="openAsset('\${obj.script}','📜')">✎ Edit Script</button></div>\` : ''}
  </div>
  \`;
}

// ═══════════════════════════════════════════════════════
//  SCENE HIERARCHY
// ═══════════════════════════════════════════════════════
function buildHierarchy() {
  const el = document.getElementById('hier-tree');
  el.innerHTML='';
  const iconMap={camera:'🎥',sprite:'🖼',shape:'◼',light:'💡',audio:'🔊',trigger:'⚡',model:'📦',particles:'✨'};
  STATE.objects.forEach(obj=>{
    const item = document.createElement('div');
    item.className='hier-item'+(obj.id===STATE.selectedId?' selected':'');
    item.innerHTML=\`
      <span class="hier-icon">\${iconMap[obj.type]||'◆'}</span>
      <span style="flex:1;font-size:11px">\${obj.name}</span>
      <span class="hier-vis" onclick="toggleVisible(\${obj.id});event.stopPropagation()">\${obj.visible?'👁':'🚫'}</span>
    \`;
    item.onclick=()=>selectObject(obj.id);
    item.ondblclick=()=>{
      selectObject(obj.id);
      if(obj.type==='sprite'){
        // Open pixel editor to edit this sprite and load its saved texture when available.
        STATE.editingSpriteName = obj.spriteSrc || obj.name;
        setEditorTab('pixels');
        requestAnimationFrame(()=>{
          const editor = ensurePixelArtEditor?.();
          const savedURL = getSpriteDataURLForObject(obj);
          if(savedURL) loadSpriteDataURLIntoPixelEditor(STATE.editingSpriteName,savedURL);
          else if(editor?.clear){ try { editor.clear(); } catch(_) {} }
        });
        logConsole('info',\`Editing sprite: \${obj.name} in Pixel Editor\`);
        setStatusMsg(\`Editing: \${obj.name}\`);
      } else {
        setLeftTab('props');
      }
    };
    el.appendChild(item);
  });
}

// ═══════════════════════════════════════════════════════
//  VIEWPORT RENDERING
// ═══════════════════════════════════════════════════════
const vpCanvas = document.getElementById('vp-canvas');
const vpCtx = vpCanvas.getContext('2d');
let vpDrag = null, vpDragOffX=0, vpDragOffY=0;

// ── 2D Viewport infinite pan/zoom state ──
const VP2D = {
  panX: 0, panY: 0, zoom: 1,
  isPanning: false, panStartX: 0, panStartY: 0, panStartVX: 0, panStartVY: 0,
};

function renderViewport() {
  const W = vpCanvas.width, H = vpCanvas.height;
  vpCtx.clearRect(0,0,W,H);
  vpCtx.fillStyle = STATE.mode==='3d' ? '#0a0d14' : '#0d0f18';
  vpCtx.fillRect(0,0,W,H);
  if(STATE.mode==='3d') draw3DScene(vpCtx,W,H);
  else draw2DScene(vpCtx,W,H);
}

function draw2DScene(ctx,W,H) {
  const z = VP2D.zoom, px = VP2D.panX, py = VP2D.panY;
  // ── Infinite grid ──
  const minor = 20 * z, major = 100 * z;
  const ox = ((px % minor) + minor) % minor;
  const oy = ((py % minor) + minor) % minor;
  // minor grid
  ctx.strokeStyle='rgba(255,255,255,.04)'; ctx.lineWidth=1;
  for(let x = ox - minor; x < W + minor; x += minor){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y = oy - minor; y < H + minor; y += minor){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  // major grid
  const mox = ((px % major) + major) % major;
  const moy = ((py % major) + major) % major;
  ctx.strokeStyle='rgba(255,255,255,.09)'; ctx.lineWidth=1;
  for(let x = mox - major; x < W + major; x += major){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y = moy - major; y < H + major; y += major){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  // axis lines
  const axisX = px, axisY = py;
  if(axisX >= 0 && axisX <= W){ctx.strokeStyle='rgba(0,212,255,.25)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(axisX,0);ctx.lineTo(axisX,H);ctx.stroke();}
  if(axisY >= 0 && axisY <= H){ctx.strokeStyle='rgba(0,212,255,.25)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,axisY);ctx.lineTo(W,axisY);ctx.stroke();}

  // draw objects with pan+zoom transform
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(z, z);
  const sorted = [...STATE.objects].sort((a,b)=>(a.z||0)-(b.z||0));
  sorted.forEach(obj=>{
    if(!obj.visible) return;
    ctx.save();
    ctx.translate(obj.x, obj.y);
    if(obj.rot) ctx.rotate(obj.rot*Math.PI/180);
    if(obj.type==='camera'){
      ctx.strokeStyle='#fbbf24';ctx.lineWidth=2/z;ctx.setLineDash([4/z,4/z]);
      ctx.strokeRect(-obj.w/2,-obj.h/2,obj.w,obj.h);
      ctx.setLineDash([]);
      ctx.fillStyle='rgba(251,191,36,.08)';ctx.fillRect(-obj.w/2,-obj.h/2,obj.w,obj.h);
      ctx.fillStyle='#fbbf24';ctx.font=\`\${9/z}px Share Tech Mono\`;ctx.textAlign='center';
      ctx.fillText('CAM',0,obj.h/2+14/z);
    } else if(obj.type==='sprite'){
      const spriteDataURL=getSpriteDataURLForObject(obj);
      if(spriteDataURL){
        // Always use spriteDataURL as the cache key. obj.__spriteImage is only valid
        // when it was loaded from the current spriteDataURL -- bust it on mismatch.
        if(obj.__spriteImage && obj.__spriteImageSrc !== spriteDataURL){
          obj.__spriteImage = null;
        }
        let img = (obj.__spriteImageSrc === spriteDataURL && obj.__spriteImage) || _spriteImageCache[spriteDataURL];
        const ready = img && ((img.complete === true && img.naturalWidth > 0) || img.naturalWidth > 0 || (img.width > 0 && img.height > 0));
        if(ready){
          ctx.imageSmoothingEnabled=false;
          ctx.drawImage(img,-obj.w/2,-obj.h/2,obj.w,obj.h);
        } else {
          // Use single-flight loader to avoid repeated per-frame Image() creation
          ensureSpriteImageLoaded(obj, spriteDataURL, () => {});
          // Draw a faint placeholder while the data URL image is loading.
          ctx.fillStyle='rgba(255,255,255,.04)'; ctx.fillRect(-obj.w/2,-obj.h/2,obj.w,obj.h);
        }
      } else {
        ctx.fillStyle='rgba(255,255,255,.04)'; ctx.fillRect(-obj.w/2,-obj.h/2,obj.w,obj.h);
        ctx.strokeStyle='rgba(0,212,255,.35)'; ctx.lineWidth=1/z; ctx.strokeRect(-obj.w/2,-obj.h/2,obj.w,obj.h);
      }
    } else if(obj.type==='shape'){
      ctx.fillStyle=obj.color;ctx.fillRect(-obj.w/2,-obj.h/2,obj.w,obj.h);
    } else if(obj.type==='light'){
      const grad=ctx.createRadialGradient(0,0,0,0,0,obj.w/2);
      grad.addColorStop(0,'rgba(255,220,120,.4)');grad.addColorStop(1,'transparent');
      ctx.fillStyle=grad;ctx.beginPath();ctx.arc(0,0,obj.w/2,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#fbbf24';ctx.lineWidth=1/z;ctx.setLineDash([3/z,3/z]);ctx.stroke();ctx.setLineDash([]);
    } else if(obj.type==='trigger'){
      ctx.strokeStyle='#22c55e';ctx.lineWidth=2/z;ctx.setLineDash([6/z,4/z]);
      ctx.strokeRect(-obj.w/2,-obj.h/2,obj.w,obj.h);ctx.setLineDash([]);
      ctx.fillStyle='rgba(34,197,94,.06)';ctx.fillRect(-obj.w/2,-obj.h/2,obj.w,obj.h);
    } else if(obj.type==='particles'){
      for(let i=0;i<12;i++){
        const px2=(Math.random()-.5)*obj.w,py2=(Math.random()-.5)*obj.h;
        ctx.fillStyle=\`hsla(\${Math.random()*60+30},100%,70%,\${Math.random()*.7+.3})\`;
        ctx.beginPath();ctx.arc(px2,py2,Math.random()*3+1,0,Math.PI*2);ctx.fill();
      }
    } else {
      ctx.fillStyle=obj.color||'#555';ctx.fillRect(-obj.w/2,-obj.h/2,obj.w,obj.h);
    }
    if(obj.id===STATE.selectedId){
      ctx.strokeStyle=obj.locked?'#f59e0b':'#00d4ff';ctx.lineWidth=1.5/z;ctx.setLineDash([]);
      ctx.strokeRect(-obj.w/2-3/z,-obj.h/2-3/z,obj.w+6/z,obj.h+6/z);
      [[-obj.w/2-3/z,-obj.h/2-3/z],[obj.w/2+3/z,-obj.h/2-3/z],[-obj.w/2-3/z,obj.h/2+3/z],[obj.w/2+3/z,obj.h/2+3/z]].forEach(([hx,hy])=>{
        ctx.fillStyle='#00d4ff';ctx.fillRect(hx-4/z,hy-4/z,8/z,8/z);
      });
    }
    ctx.restore();
  });
  ctx.restore();
}

// ── 3D editor camera state ──
const VP3D = {
  // Default 3D Scene View: centered, forward-facing, lightly pitched down.
  azimuth: 0, elevation: 0.18, distance: 720,
  panX: 0, panY: 0,
  isOrbiting: false, isPanning3D: false,
  orbitStart: {x:0,y:0,az:0,el:0},
  panStart: {x:0,y:0,px:0,py:0},
  zoom: 1,
  frameTime: 0, fps: 0, drawCalls: 0,
};

function draw3DScene(ctx,W,H) {
  VP3D.drawCalls = 0;
  // ── Sky gradient ──
  const sky = ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0,'#070b12'); sky.addColorStop(1,'#0e1520');
  ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);

  // ── Project 3D point to 2D screen ──
  const az = VP3D.azimuth, el = VP3D.elevation, dist = VP3D.distance / VP3D.zoom;
  const camX = dist * Math.cos(el) * Math.sin(az);
  const camY = dist * Math.sin(el);
  const camZ = dist * Math.cos(el) * Math.cos(az);
  const cx = W/2 + VP3D.panX, cy = H/2 + VP3D.panY;

  // Option A: map 2D editor coordinates into a centered 3D world on the ground plane.
  // 2D center (W/2,H/2) becomes 3D origin (0,0,0). 2D x -> 3D X, 2D y -> 3D Z.
  const hw = W / 2, hh = H / 2;
  const worldX = (o) => (typeof o.x3d === 'number') ? o.x3d : ((o.x || 0) - hw);
  const worldZ = (o) => (typeof o.z3d === 'number') ? o.z3d : ((o.y || 0) - hh);
  const worldY = (o) => (typeof o.y3d === 'number') ? o.y3d : 0;

  const fov = 0.9;

  function project(wx, wy, wz) {
    // view-space
    const dx = wx - camX, dy = wy - camY, dz = wz - camZ;
    const fwdX = -camX/dist, fwdY = -camY/dist, fwdZ = -camZ/dist;
    const rightX = Math.cos(az), rightY = 0, rightZ = -Math.sin(az);
    const upX = Math.sin(el)*Math.sin(az), upY = Math.cos(el), upZ = Math.sin(el)*Math.cos(az);
    const vx = dx*rightX + dy*rightY + dz*rightZ;
    const vy = dx*upX   + dy*upY    + dz*upZ;
    const vz = dx*fwdX  + dy*fwdY   + dz*fwdZ;
    // Positive depth means the point is in front of the editor camera.
    // The old sign check rejected the whole ground grid/camera, leaving a blank 3D view.
    if(vz <= 1) return null;
    const scale = fov * Math.min(W,H) / vz;
    return { sx: cx + vx*scale, sy: cy - vy*scale, scale };
  }

  if (STATE.gridVisible) {
  // ── Infinite ground grid ──
  // Brighter default grid so the 3D view is readable immediately on first load.
  // Minor lines are soft white, major lines are stronger, and center axes are bold/cyan.
  const GRID_SIZE = 1000;
  const GRID_STEP = Math.max(10, Number(STATE.projectSettings?.gridStep) || 50);
  const MAJOR_EVERY = GRID_STEP * 4;
  const gridAlpha = Math.max(0.72, Math.min(1, VP3D.zoom * 1.05 + 0.42));
  function drawGridLine3D(a,b,index){
    if(!a||!b) return;
    const isCenter = index === 0;
    const isMajor = Math.abs(index) % MAJOR_EVERY === 0;
    ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
    if(isCenter){ ctx.strokeStyle = \`rgba(0,212,255,\${0.95*gridAlpha})\`; ctx.lineWidth = 2.4; }
    else if(isMajor){ ctx.strokeStyle = \`rgba(255,255,255,\${0.42*gridAlpha})\`; ctx.lineWidth = 1.25; }
    else { ctx.strokeStyle = \`rgba(255,255,255,\${0.18*gridAlpha})\`; ctx.lineWidth = 0.8; }
    ctx.stroke(); VP3D.drawCalls++;
  }
  for(let ix = -GRID_SIZE; ix <= GRID_SIZE; ix += GRID_STEP) {
    drawGridLine3D(project(ix, 0, -GRID_SIZE), project(ix, 0, GRID_SIZE), ix);
  }
  for(let iz = -GRID_SIZE; iz <= GRID_SIZE; iz += GRID_STEP) {
    drawGridLine3D(project(-GRID_SIZE, 0, iz), project(GRID_SIZE, 0, iz), iz);
  }
  const originDot = project(0,0,0);
  if(originDot){
    ctx.fillStyle='rgba(0,212,255,.85)';
    ctx.beginPath(); ctx.arc(originDot.sx, originDot.sy, 4, 0, Math.PI*2); ctx.fill();
  }

  // ── World axes ──
  const orig = project(0,0,0);
  if(orig) {
    const axX = project(60,0,0), axY = project(0,60,0), axZ = project(0,0,60);
    if(axX){ctx.beginPath();ctx.moveTo(orig.sx,orig.sy);ctx.lineTo(axX.sx,axX.sy);ctx.strokeStyle='rgba(239,68,68,.8)';ctx.lineWidth=2;ctx.stroke();}
    if(axY){ctx.beginPath();ctx.moveTo(orig.sx,orig.sy);ctx.lineTo(axY.sx,axY.sy);ctx.strokeStyle='rgba(34,197,94,.8)';ctx.lineWidth=2;ctx.stroke();}
    if(axZ){ctx.beginPath();ctx.moveTo(orig.sx,orig.sy);ctx.lineTo(axZ.sx,axZ.sy);ctx.strokeStyle='rgba(59,130,246,.8)';ctx.lineWidth=2;ctx.stroke();}
    VP3D.drawCalls += 3;
  }

  
}
// ── Draw objects as 3D boxes ──
  const sorted = [...STATE.objects].sort((a,b)=> {
    const dax = worldX(a) - camX, day = worldY(a) - camY, daz = worldZ(a) - camZ;
    const dbx = worldX(b) - camX, dby = worldY(b) - camY, dbz = worldZ(b) - camZ;
    const da = dax*dax + day*day + daz*daz;
    const db = dbx*dbx + dby*dby + dbz*dbz;
    return db - da;
  });
  sorted.forEach(obj=>{
    if(!obj.visible) return;
    if(obj.type==='camera'){
      const cw=Math.max(obj.w||40,80), ch=Math.max(obj.h||30,54), cd=70;
      const x = worldX(obj), z = worldZ(obj);
      const baseY=0, topY=-ch;
      const camPts=[
        [x-cw/2,baseY,z-cd/2],[x+cw/2,baseY,z-cd/2],[x+cw/2,baseY,z+cd/2],[x-cw/2,baseY,z+cd/2],
        [x-cw/2,topY,z-cd/2],[x+cw/2,topY,z-cd/2],[x+cw/2,topY,z+cd/2],[x-cw/2,topY,z+cd/2],
        [x,topY-ch*.45,z+cd*.95]
      ].map(([px,py,pz])=>project(px,py,pz));
      if(!camPts.some(p=>!p)){
        const edgePairs=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7],[4,8],[5,8],[6,8],[7,8]];
        ctx.save();
        ctx.shadowColor='rgba(251,191,36,.75)'; ctx.shadowBlur=10;
        ctx.strokeStyle='rgba(251,191,36,.98)'; ctx.lineWidth=2.2;
        edgePairs.forEach(([a,b])=>{ctx.beginPath();ctx.moveTo(camPts[a].sx,camPts[a].sy);ctx.lineTo(camPts[b].sx,camPts[b].sy);ctx.stroke();});
        ctx.shadowBlur=0;
        ctx.fillStyle='rgba(251,191,36,.16)';
        ctx.beginPath(); ctx.moveTo(camPts[4].sx,camPts[4].sy); [5,6,7].forEach(i=>ctx.lineTo(camPts[i].sx,camPts[i].sy)); ctx.closePath(); ctx.fill();
        const label=project(x, topY-ch*.72, z+cd*.95);
        if(label){
          ctx.fillStyle='rgba(8,9,13,.82)'; ctx.beginPath(); ctx.roundRect(label.sx-48,label.sy-18,96,20,4); ctx.fill();
          ctx.fillStyle='#fbbf24'; ctx.font='bold 10px Share Tech Mono'; ctx.textAlign='center'; ctx.fillText('MAIN CAMERA',label.sx,label.sy-4);
        }
        ctx.restore(); VP3D.drawCalls++;
      }
      return;
    }
    const bw=obj.w||40, bh=obj.h||40, bd=obj.w||40;
    const x = worldX(obj), z = worldZ(obj), baseY = worldY(obj);
    const bx=x-bw/2, by=(baseY-bh), bz=z-bd/2;
    const corners = [
      [bx,by+bh,bz],[bx+bw,by+bh,bz],[bx+bw,by+bh,bz+bd],[bx,by+bh,bz+bd],
      [bx,by,bz],[bx+bw,by,bz],[bx+bw,by,bz+bd],[bx,by,bz+bd]
    ].map(([x,y,z])=>project(x,y,z));
    if(corners.some(c=>!c)) return;
    VP3D.drawCalls++;
    const r=parseInt(obj.color.slice(1,3),16), g=parseInt(obj.color.slice(3,5),16), b2=parseInt(obj.color.slice(5,7),16);
    // faces: bottom[0-3], top[4-7], front[0,1,5,4], back[2,3,7,6], left[0,3,7,4], right[1,2,6,5]
    const faces = [
      {pts:[4,5,1,0], light:0.6},  // front
      {pts:[5,6,2,1], light:0.4},  // right
      {pts:[6,7,3,2], light:0.3},  // back
      {pts:[7,4,0,3], light:0.5},  // left
      {pts:[0,1,2,3], light:0.2},  // bottom
      {pts:[4,5,6,7], light:1.0},  // top
    ];
    const sel = obj.id===STATE.selectedId;
    faces.forEach(f=>{
      const pts = f.pts.map(i=>corners[i]);
      const l = f.light;
      ctx.beginPath();
      ctx.moveTo(pts[0].sx, pts[0].sy);
      pts.forEach(p=>ctx.lineTo(p.sx, p.sy));
      ctx.closePath();
      ctx.fillStyle = \`rgba(\${Math.round(r*l)},\${Math.round(g*l)},\${Math.round(b2*l)},0.88)\`;
      ctx.fill();
      if(sel){ctx.strokeStyle='rgba(0,212,255,.7)';ctx.lineWidth=1.5;}
      else {ctx.strokeStyle='rgba(0,0,0,.3)';ctx.lineWidth=0.5;}
      ctx.stroke();
    });
    // label
    const top = corners[4];
    if(top){
      ctx.fillStyle='rgba(255,255,255,.7)'; ctx.font=\`\${Math.max(8,top.scale*6)}px Share Tech Mono\`;
      ctx.textAlign='center'; ctx.fillText(obj.name, top.sx, top.sy-8);
    }
  });

  // ── Debug overlay (top-right) ──
  const t = performance.now();
  if(VP3D._lastT) {
    const delta = t - VP3D._lastT;
    VP3D.fps = Math.round(1000/Math.max(1,delta));
  }
  VP3D._lastT = t;

  // Gizmo cube in corner
  const gx = W - 68, gy = 68, gr = 28;
  ctx.save();
  ctx.translate(gx, gy);
  function gizProject(x,y,z){ return {x:x*Math.cos(az)-z*Math.sin(az),y:y*Math.cos(el)-(x*Math.sin(az)+z*Math.cos(az))*Math.sin(el)}; }
  const gAxes = [{v:[gr,0,0],c:'#ef4444',l:'X'},{v:[0,gr,0],c:'#22c55e',l:'Y'},{v:[0,0,gr],c:'#3b82f6',l:'Z'}];
  gAxes.forEach(a=>{
    const p=gizProject(a.v[0],a.v[1],a.v[2]);
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(p.x,-p.y);
    ctx.strokeStyle=a.c; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle=a.c; ctx.font='bold 10px Share Tech Mono';
    ctx.textAlign='center'; ctx.fillText(a.l, p.x*1.2, -p.y*1.2+4);
  });
  ctx.restore();

  // Stats HUD
  ctx.fillStyle='rgba(8,9,13,.75)'; ctx.beginPath(); ctx.roundRect(W-140,8,132,60,4); ctx.fill();
  ctx.fillStyle='rgba(0,212,255,.4)'; ctx.font='9px Share Tech Mono';
  ctx.textAlign='left'; ctx.fillText('3D VIEWPORT', W-132, 24);
  ctx.fillStyle='rgba(255,255,255,.55)'; ctx.fillText(\`CAM  az:\${(VP3D.azimuth*57.3).toFixed(1)}° el:\${(VP3D.elevation*57.3).toFixed(1)}°\`, W-132, 38);
  ctx.fillText(\`ZOOM \${VP3D.zoom.toFixed(2)}×  DC:\${VP3D.drawCalls}\`, W-132, 52);
  ctx.fillText(\`OBJS \${STATE.objects.length}  FPS:\${VP3D.fps}\`, W-132, 64);
}

function shiftLightness(hex, amt) {
  try{
    let r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
    r=Math.min(255,Math.max(0,r+amt));g=Math.min(255,Math.max(0,g+amt));b=Math.min(255,Math.max(0,b+amt));
    return \`rgb(\${r},\${g},\${b})\`;
  }catch{return hex;}
}

// Viewport interaction
// ── Viewport interaction (2D pan+zoom + 3D Unity-style orbit) ──

// ── 3D object picking via ray-casting ──
function pick3DObject(ex, ey) {
  if(STATE.mode !== '3d') return null;
  const c = vpCanvas;
  const W = c.width, H = c.height;
  const az = VP3D.azimuth, el = VP3D.elevation;
  const dist = VP3D.distance / Math.max(0.001, VP3D.zoom);
  const camX = dist * Math.cos(el) * Math.sin(az);
  const camY = dist * Math.sin(el);
  const camZ = dist * Math.cos(el) * Math.cos(az);
  const cx = W/2 + VP3D.panX, cy = H/2 + VP3D.panY;
  const fov = 0.9;

  function project3(wx, wy, wz) {
    const dx = wx - camX, dy = wy - camY, dz = wz - camZ;
    const fwdX = -camX/dist, fwdY = -camY/dist, fwdZ = -camZ/dist;
    const rightX = Math.cos(az), rightZ = -Math.sin(az);
    const upX = Math.sin(el)*Math.sin(az), upY = Math.cos(el), upZ = Math.sin(el)*Math.cos(az);
    const vx = dx*rightX + dz*rightZ;
    const vy = dx*upX + dy*upY + dz*upZ;
    const vz = dx*fwdX + dy*fwdY + dz*fwdZ;
    if(vz <= 1) return null;
    const s = fov * Math.min(W,H) / vz;
    return {sx: cx + vx*s, sy: cy - vy*s, z: vz, scale: s};
  }

  const hw = W/2, hh = H/2;
  let best = null, bestDist = Infinity;
  STATE.objects.forEach(obj => {
    if(!obj.visible) return;
    const wx = typeof obj.x3d === 'number' ? obj.x3d : ((obj.x||0) - hw);
    const wz = typeof obj.z3d === 'number' ? obj.z3d : ((obj.y||0) - hh);
    const wy = typeof obj.y3d === 'number' ? obj.y3d : 0;
    const p = project3(wx, wy, wz);
    if(!p) return;
    const dx = ex - p.sx, dy = ey - p.sy;
    const d = Math.sqrt(dx*dx + dy*dy);
    const hitRadius = Math.max(18, (obj.w||40) * p.scale * 0.5);
    if(d < hitRadius && p.z < bestDist) { best = obj; bestDist = p.z; }
  });
  return best;
}

// State for 3D object dragging
let _3dDrag = null; // {obj, startAz, startEl, startDist, startWX, startWZ, startScreenX, startScreenY}

vpCanvas.addEventListener('mousemove', e=>{
  const {x,y}=getVpCoords(e);
  document.getElementById('vp-x').textContent=Math.round(x);
  document.getElementById('vp-y').textContent=Math.round(y);

  if(STATE.mode==='2d') {
    if(VP2D.isPanning) {
      VP2D.panX = VP2D.panStartVX + (e.clientX - VP2D.panStartX);
      VP2D.panY = VP2D.panStartVY + (e.clientY - VP2D.panStartY);
      renderViewport(); return;
    }
    if(vpDrag&&!vpDrag.obj.locked){
      if(vpDrag.mode==='move'||!vpDrag.mode){
        pushUndo();
        vpDrag.obj.x=Math.round(x-vpDragOffX);
        vpDrag.obj.y=Math.round(y-vpDragOffY);
        if(STATE.snap){vpDrag.obj.x=Math.round(vpDrag.obj.x/20)*20;vpDrag.obj.y=Math.round(vpDrag.obj.y/20)*20;}
      } else if(vpDrag.mode==='scale'){
        const dx=x-vpDrag.startX, dy=y-vpDrag.startY;
        vpDrag.obj.w=Math.max(8,Math.round(vpDrag.origW+dx));
        vpDrag.obj.h=Math.max(8,Math.round(vpDrag.origH+dy));
      } else if(vpDrag.mode==='rotate'){
        const cx=vpDrag.obj.x, cy=vpDrag.obj.y;
        const angle=Math.atan2(y-cy,x-cx)*180/Math.PI;
        const startAngle=Math.atan2(vpDrag.startY-cy,vpDrag.startX-cx)*180/Math.PI;
        vpDrag.obj.rot=Math.round(vpDrag.origRot+(angle-startAngle));
      }
      renderViewport();buildHierarchy();
      if(STATE.rightTab==='inspect')renderInspect();
    }
  } else {
    // ── 3D mode ──
    if(_3dDrag && _3dDrag.obj && !_3dDrag.obj.locked) {
      // Move object on XZ ground plane by tracking mouse delta in screen space
      // and converting to world-space motion along camera right+forward vectors
      const dx = e.clientX - _3dDrag.startScreenX;
      const dy = e.clientY - _3dDrag.startScreenY;
      const az = VP3D.azimuth;
      // Right vector (X/Z components)
      const speed = VP3D.distance / Math.max(0.01, VP3D.zoom) * 0.0022;
      const obj = _3dDrag.obj;
      const wx = _3dDrag.startWX + dx * Math.cos(az) * speed;
      const wz = _3dDrag.startWZ + dx * (-Math.sin(az)) * speed;
      // Vertical drag moves on Z (depth) axis
      const wz2 = wz + dy * Math.cos(az) * speed;
      const wx2 = wx + dy * Math.sin(az) * speed;
      if(typeof obj.x3d === 'number') { obj.x3d = wx2; obj.z3d = wz2; }
      else { const hw = vpCanvas.width/2, hh = vpCanvas.height/2; obj.x = Math.round(wx2 + hw); obj.y = Math.round(wz2 + hh); }
      renderViewport(); buildHierarchy();
      if(STATE.rightTab==='inspect') renderInspect();
      return;
    }
    if(VP3D.isOrbiting) {
      const dx = e.clientX - VP3D.orbitStart.x, dy = e.clientY - VP3D.orbitStart.y;
      VP3D.azimuth   = VP3D.orbitStart.az + dx * 0.008;
      VP3D.elevation = Math.max(-1.4, Math.min(1.4, VP3D.orbitStart.el - dy * 0.006));
      renderViewport();
    } else if(VP3D.isPanning3D) {
      VP3D.panX = VP3D.panStart.px + (e.clientX - VP3D.panStart.x);
      VP3D.panY = VP3D.panStart.py + (e.clientY - VP3D.panStart.y);
      renderViewport();
    }
  }
});

vpCanvas.addEventListener('mousedown', e=>{
  vpCanvas.focus && vpCanvas.focus();

  if(STATE.mode==='2d') {
    // Middle mouse or Alt+left → pan
    if(e.button===1 || (e.button===0 && e.altKey)) {
      e.preventDefault();
      VP2D.isPanning=true; VP2D.panStartX=e.clientX; VP2D.panStartY=e.clientY;
      VP2D.panStartVX=VP2D.panX; VP2D.panStartVY=VP2D.panY;
      vpCanvas.style.cursor='grab';
      return;
    }
    const {x,y}=getVpCoords(e);
    let hit=null;
    [...STATE.objects].reverse().forEach(obj=>{
      if(!hit&&obj.visible&&x>=obj.x-obj.w/2&&x<=obj.x+obj.w/2&&y>=obj.y-obj.h/2&&y<=obj.y+obj.h/2)
        hit=obj;
    });
    if(hit){
      selectObject(hit.id);
      if(STATE.vpTool==='select'||STATE.vpTool==='move'){
        vpDrag={obj:hit,mode:'move'}; vpDragOffX=x-hit.x; vpDragOffY=y-hit.y;
        vpCanvas.style.cursor='grabbing';
      } else if(STATE.vpTool==='scale'){
        vpDrag={obj:hit,mode:'scale',startX:x,startY:y,origW:hit.w,origH:hit.h};
        vpCanvas.style.cursor='nwse-resize';
      } else if(STATE.vpTool==='rotate'){
        vpDrag={obj:hit,mode:'rotate',startX:x,startY:y,origRot:hit.rot||0};
        vpCanvas.style.cursor='crosshair';
      }
    } else { selectObject(null); }
    return;
  }

  // ── 3D mode mouse controls (Unity-style) ──
  e.preventDefault();

  // RMB or MMB → pan
  if(e.button===2 || e.button===1) {
    VP3D.isPanning3D=true;
    VP3D.panStart={x:e.clientX,y:e.clientY,px:VP3D.panX,py:VP3D.panY};
    vpCanvas.style.cursor='move';
    return;
  }

  // LMB + Alt → orbit (same as Unity alt-drag)
  if(e.button===0 && e.altKey) {
    VP3D.isOrbiting=true;
    VP3D.orbitStart={x:e.clientX,y:e.clientY,az:VP3D.azimuth,el:VP3D.elevation};
    vpCanvas.style.cursor='grabbing';
    return;
  }

  // LMB → try to pick object, else orbit
  if(e.button===0) {
    const rect = vpCanvas.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const hit = pick3DObject(sx, sy);
    if(hit && !hit.locked) {
      selectObject(hit.id);
      pushUndo();
      const hw = vpCanvas.width/2, hh = vpCanvas.height/2;
      const startWX = typeof hit.x3d === 'number' ? hit.x3d : ((hit.x||0) - hw);
      const startWZ = typeof hit.z3d === 'number' ? hit.z3d : ((hit.y||0) - hh);
      _3dDrag = {obj: hit, startScreenX: e.clientX, startScreenY: e.clientY, startWX, startWZ};
      vpCanvas.style.cursor='grabbing';
    } else {
      if(!hit) selectObject(null);
      VP3D.isOrbiting=true;
      VP3D.orbitStart={x:e.clientX,y:e.clientY,az:VP3D.azimuth,el:VP3D.elevation};
      vpCanvas.style.cursor='grabbing';
    }
    return;
  }
});

vpCanvas.addEventListener('mouseup', e=>{
  vpDrag=null; _3dDrag=null;
  VP2D.isPanning=false; VP3D.isOrbiting=false; VP3D.isPanning3D=false;
  vpCanvas.style.cursor = STATE.mode==='3d' ? 'grab' : '';
});
vpCanvas.addEventListener('mouseleave',()=>{
  vpDrag=null; _3dDrag=null;
  VP2D.isPanning=false; VP3D.isOrbiting=false; VP3D.isPanning3D=false;
  vpCanvas.style.cursor='';
});

// Prevent default context menu on canvas so RMB can pan
vpCanvas.addEventListener('contextmenu', e => { if(STATE.mode==='3d') e.preventDefault(); });

vpCanvas.addEventListener('wheel',e=>{
  e.preventDefault();
  if(STATE.mode==='2d') {
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const r = vpCanvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const prevZ = VP2D.zoom;
    VP2D.zoom = Math.max(0.1, Math.min(10, VP2D.zoom * factor));
    VP2D.panX = mx - (mx - VP2D.panX) * (VP2D.zoom / prevZ);
    VP2D.panY = my - (my - VP2D.panY) * (VP2D.zoom / prevZ);
    document.getElementById('vp-zoom').textContent = Math.round(VP2D.zoom*100);
  } else {
    // Scroll to dolly (move camera forward/back along view axis)
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    VP3D.zoom = Math.max(0.05, Math.min(20, VP3D.zoom * factor));
    document.getElementById('vp-zoom').textContent = Math.round(VP3D.zoom*100);
  }
  renderViewport();
},{passive:false});

// ── WASD / Arrow key fly navigation in 3D ──
(function bind3DKeyNav(){
  const _keys3d = {};
  let _3dNavFrame = null;

  function do3DNav() {
    if(STATE.mode !== '3d' || STATE.editorTab !== 'viewport') { _3dNavFrame = null; return; }
    const spd = 8 / Math.max(0.1, VP3D.zoom);
    const az = VP3D.azimuth;
    // Forward/back along camera's horizontal look direction
    const fwdX = Math.sin(az), fwdZ = Math.cos(az);
    // Right strafe
    const rgtX = Math.cos(az), rgtZ = -Math.sin(az);
    let mx = 0, mz = 0, my = 0;
    if(_keys3d['w']||_keys3d['arrowup'])    { mx += fwdX*spd; mz += fwdZ*spd; }
    if(_keys3d['s']||_keys3d['arrowdown'])  { mx -= fwdX*spd; mz -= fwdZ*spd; }
    if(_keys3d['a']||_keys3d['arrowleft'])  { mx -= rgtX*spd; mz -= rgtZ*spd; }
    if(_keys3d['d']||_keys3d['arrowright']) { mx += rgtX*spd; mz += rgtZ*spd; }
    if(_keys3d['q']||_keys3d['pagedown'])   { my -= spd; }
    if(_keys3d['e']||_keys3d['pageup'])     { my += spd; }
    if(mx !== 0 || mz !== 0 || my !== 0) {
      // Move camera pan offset to simulate fly-through (panning the scene origin)
      VP3D.panX -= mx;
      VP3D.panY += mz * 0.5 - my;
      renderViewport();
    }
    _3dNavFrame = requestAnimationFrame(do3DNav);
  }

  document.addEventListener('keydown', e => {
    if(STATE.mode !== '3d' || STATE.editorTab !== 'viewport') return;
    // Don't steal keys from input fields
    const tag = document.activeElement && document.activeElement.tagName;
    if(tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable) return;
    const key = e.key.toLowerCase();
    const navKeys = ['w','a','s','d','q','e','arrowup','arrowdown','arrowleft','arrowright','pageup','pagedown'];
    if(navKeys.includes(key)) {
      _keys3d[key] = true;
      e.preventDefault();
      if(!_3dNavFrame) _3dNavFrame = requestAnimationFrame(do3DNav);
    }
    // F key: focus selected object
    if(key === 'f' && STATE.selectedId) {
      const obj = STATE.objects.find(o => o.id === STATE.selectedId);
      if(obj) {
        const hw = vpCanvas.width/2, hh = vpCanvas.height/2;
        const wx = typeof obj.x3d === 'number' ? obj.x3d : ((obj.x||0) - hw);
        const wz = typeof obj.z3d === 'number' ? obj.z3d : ((obj.y||0) - hh);
        VP3D.panX = -wx * VP3D.zoom * 0.9;
        VP3D.panY = -wz * VP3D.zoom * 0.9 * 0.5;
        renderViewport();
        logConsole('info', 'Focused: ' + obj.name);
      }
    }
  }, true);

  document.addEventListener('keyup', e => {
    const key = e.key.toLowerCase();
    _keys3d[key] = false;
    const anyHeld = Object.values(_keys3d).some(Boolean);
    if(!anyHeld && _3dNavFrame) { cancelAnimationFrame(_3dNavFrame); _3dNavFrame = null; }
  }, true);
})();

// ── Touch support ──
let _lastTouchDist = 0, _lastTouchMid = {x:0,y:0}, _touchPanStart = null;
vpCanvas.addEventListener('touchstart', e=>{
  e.preventDefault();
  if(e.touches.length === 1) {
    const t = e.touches[0];
    if(STATE.mode==='2d') {
      _touchPanStart = {cx:t.clientX, cy:t.clientY, px:VP2D.panX, py:VP2D.panY};
    } else {
      VP3D.isOrbiting = true;
      VP3D.orbitStart = {x:t.clientX, y:t.clientY, az:VP3D.azimuth, el:VP3D.elevation};
    }
  } else if(e.touches.length === 2) {
    const t1=e.touches[0], t2=e.touches[1];
    _lastTouchDist = Math.hypot(t2.clientX-t1.clientX, t2.clientY-t1.clientY);
    _lastTouchMid = {x:(t1.clientX+t2.clientX)/2, y:(t1.clientY+t2.clientY)/2};
    _touchPanStart = null;
    VP3D.isOrbiting = false;
  }
},{passive:false});

vpCanvas.addEventListener('touchmove', e=>{
  e.preventDefault();
  if(e.touches.length === 1 && _touchPanStart) {
    const t=e.touches[0];
    if(STATE.mode==='2d') {
      VP2D.panX = _touchPanStart.px + (t.clientX - _touchPanStart.cx);
      VP2D.panY = _touchPanStart.py + (t.clientY - _touchPanStart.cy);
    } else if(VP3D.isOrbiting) {
      const dx=t.clientX-VP3D.orbitStart.x, dy=t.clientY-VP3D.orbitStart.y;
      VP3D.azimuth = VP3D.orbitStart.az + dx*0.008;
      VP3D.elevation = Math.max(-1.4,Math.min(1.4, VP3D.orbitStart.el - dy*0.006));
    }
    renderViewport();
  } else if(e.touches.length === 2) {
    const t1=e.touches[0], t2=e.touches[1];
    const dist = Math.hypot(t2.clientX-t1.clientX, t2.clientY-t1.clientY);
    const factor = dist / Math.max(1, _lastTouchDist);
    if(STATE.mode==='2d') {
      const mid = {x:(t1.clientX+t2.clientX)/2, y:(t1.clientY+t2.clientY)/2};
      const r = vpCanvas.getBoundingClientRect();
      const mx=mid.x-r.left, my=mid.y-r.top;
      const prev=VP2D.zoom; VP2D.zoom=Math.max(0.1,Math.min(10,VP2D.zoom*factor));
      VP2D.panX = mx-(mx-VP2D.panX)*(VP2D.zoom/prev);
      VP2D.panY = my-(my-VP2D.panY)*(VP2D.zoom/prev);
    } else {
      VP3D.zoom = Math.max(0.1,Math.min(8,VP3D.zoom*factor));
    }
    _lastTouchDist = dist;
    renderViewport();
  }
},{passive:false});

vpCanvas.addEventListener('touchend', e=>{
  if(e.touches.length === 0) {
    _touchPanStart = null; VP3D.isOrbiting = false;
  }
},{passive:false});

function getVpCoords(e){
  const r=vpCanvas.getBoundingClientRect();
  const sx = e.clientX-r.left, sy = e.clientY-r.top;
  if(STATE.mode==='2d') {
    return {x:(sx-VP2D.panX)/VP2D.zoom, y:(sy-VP2D.panY)/VP2D.zoom};
  }
  return {x:sx, y:sy};
}

function selectObject(id) {
  STATE.selectedId=id;
  buildHierarchy();
  const obj=STATE.objects.find(o=>o.id===id);
  if(STATE.leftTab==='props')renderPropsFor(obj||null);
  if(STATE.rightTab==='inspect')renderInspect();
  renderViewport();
  updateStatusBar();
}

function renderInspect(){
  const el=document.getElementById('inspect-content');
  const obj=STATE.objects.find(o=>o.id===STATE.selectedId);
  if(!obj){el.innerHTML=\`<div style="font-size:11px;color:var(--text2);padding:10px">Nothing selected</div>\`;return;}
  renderPropsFor(obj);
  el.innerHTML=document.getElementById('props-content').innerHTML;
}

function setVpTool(t){
  STATE.vpTool=t;
  ['select','move','scale','rotate'].forEach(x=>{
    const btn=document.getElementById('tool-'+x);
    if(btn) btn.classList.toggle('active',x===t);
  });
  const cursors={select:'default',move:'move',scale:'nwse-resize',rotate:'crosshair'};
  if(vpCanvas) vpCanvas.style.cursor=cursors[t]||'default';
  setStatusMsg('Tool: '+t.toUpperCase());
}

function toggleGrid(){
  STATE.gridVisible = !STATE.gridVisible;

  // 2D overlay grid only
  const gridEl = document.getElementById('vp-grid');
  if (gridEl) {
    gridEl.style.display = (STATE.gridVisible && STATE.mode === '2d') ? '' : 'none';
  }

  // 3D grid is drawn inside the canvas, so re-render
  renderViewport();
}
function toggleSnap(){
  STATE.snap=!STATE.snap;
  document.getElementById('snap-btn').classList.toggle('active',STATE.snap);
}
function resetCamera(){
  VP2D.panX=0; VP2D.panY=0; VP2D.zoom=1;
  VP3D.azimuth=0; VP3D.elevation=0.18; VP3D.distance=720; VP3D.panX=0; VP3D.panY=0; VP3D.zoom=1;
  document.getElementById('vp-zoom').textContent=100;
  renderViewport();
  logConsole('info','Camera reset');
}
function focusSelected(){
  if(!STATE.selectedId)return;
  const obj=STATE.objects.find(o=>o.id===STATE.selectedId);
  if(obj)logConsole('info',\`Focusing: \${obj.name}\`);
}

// ═══════════════════════════════════════════════════════
//  OBJECT MANAGEMENT
// ═══════════════════════════════════════════════════════
function addObject(type) {
  pushUndo();
  const defaults={camera:{w:40,h:30,color:'#fbbf24'},sprite:{w:48,h:48,color:'#e94560'},
    shape:{w:100,h:30,color:'#444'},light:{w:80,h:80,color:'#ffe066'},
    audio:{w:32,h:32,color:'#1abc9c'},trigger:{w:120,h:80,color:'#22c55e'},
    model:{w:60,h:60,color:'#7c3aed'},particles:{w:60,h:60,color:'#f59e0b'}};
  const d=defaults[type]||{w:50,h:50,color:'#888'};
  const obj={
    id:STATE.nextId++,name:\`\${type.charAt(0).toUpperCase()+type.slice(1)} \${STATE.nextId-10}\`,
    type,x:200+Math.random()*400,y:100+Math.random()*250,
    ...d,z:0,rot:0,scaleX:1,scaleY:1,visible:true,locked:false,tag:type
  };
  if(type==='sprite'){
    // New sprites intentionally start transparent. They only receive a texture
    // after this sprite is edited in the Pixel Art editor or an asset is assigned.
    obj.color='transparent';
    obj.pixelDataURL=null;
    obj.pixelW=PE?.w||32;
    obj.pixelH=PE?.h||32;
    obj.spriteSrc=null;
  }
  STATE.objects.push(obj);
  // STATE.objects++ removed: STATE.objects is an array; updateStatusBar() reads its length.
  buildHierarchy();renderViewport();updateStatusBar();
  selectObject(obj.id);
  logConsole('success',\`Added \${type}: \${obj.name}\`);
}

function deleteObject(id) {
  pushUndo();
  STATE.objects=STATE.objects.filter(o=>o.id!==id);
  if(STATE.selectedId===id)selectObject(null);
  buildHierarchy();renderViewport();updateStatusBar();
  logConsole('warn',\`Deleted object #\${id}\`);
}

function setProp(id,key,val){
  const obj=STATE.objects.find(o=>o.id===id);
  if(!obj)return;
  pushUndo();
  obj[key]=val;
  renderViewport();buildHierarchy();
  setStatusMsg(\`\${key} = \${val}\`);
}

function toggleVisible(id){
  const obj=STATE.objects.find(o=>o.id===id);
  if(obj){obj.visible=!obj.visible;buildHierarchy();renderViewport();}
}

// ═══════════════════════════════════════════════════════
//  BLOCK EDITOR
// ═══════════════════════════════════════════════════════
let BE = {
  blocks: [],
  connections: [],
  nextId: 1,
  selected: null,
  multiSelected: new Set(),
  dragging: null,
  dragOffX: 0,
  dragOffY: 0,
  connecting: null,
  canvasOff: { x: 0, y: 0 }
};
window.BE = BE;
window.__FORGE_BE = BE;
function beIsSelected(id){ return BE.selected===id || BE.multiSelected.has(id); }
function beClearMulti(){ BE.multiSelected=new Set(); }
function beToggleMulti(id){ if(BE.multiSelected.has(id)) BE.multiSelected.delete(id); else { BE.multiSelected.add(id); if(BE.selected) BE.multiSelected.add(BE.selected); } }

function buildBlockEditor() {
  // Start blank — no seed blocks
  if(!BE.blocks.length) {
    BE.blocks=[];
    BE.connections=[];
  }
  renderBlockEditor();
}

function renderBlockEditor(){
  const canvas=document.getElementById('be-canvas');
  const svg=document.getElementById('be-svg');
  canvas.innerHTML='';
  const W=canvas.offsetWidth||900, H=canvas.offsetHeight||600;
  svg.setAttribute('viewBox',\`0 0 \${W} \${H}\`);
  svg.innerHTML='';

  BE.blocks.forEach(block=>{
    const def=findBlockDef(block.cat,block.type);
    const catColor=BLOCK_DEFS[block.cat]?.color||'#888';
    const catBg=BLOCK_DEFS[block.cat]?.bg||'rgba(128,128,128,.12)';
    const el=document.createElement('div');
    el.className='be-block'+((typeof beIsSelected==='function'?beIsSelected(block.id):block.id===BE.selected)?' selected':'');
    el.id=\`be-block-\${block.id}\`;
    el.style.cssText=\`left:\${block.x}px;top:\${block.y}px\`;
    el.innerHTML=\`
      <div class="be-block-header" style="background:\${catBg}">
        <span class="be-block-cat" style="background:\${catColor}20;color:\${catColor};border:1px solid \${catColor}40">\${block.cat}</span>
        <span class="be-block-title">\${block.type}</span>
      </div>
      <div class="be-block-body">
        \${(def?.ports?.in||[]).map(p=>\`
          <div class="be-port-row">
            <div class="be-port in">
              <div class="be-connector\${isPortConnected(block.id,p,'in')?' connected':''}"
                   data-block="\${block.id}" data-port="\${p}" data-dir="in"
                   onclick="startConnect(event,\${block.id},'\${p}','in')"></div>
              <span style="font-size:10px;color:var(--text2)">\${p}</span>
            </div>
          </div>\`).join('')}
        \${(def?.ports?.out||[]).map((p,i)=>\`
          <div class="be-port-row">
            <div class="be-port out" style="margin-left:auto">
              <span style="font-size:10px;color:var(--text2)">\${p}</span>
              <div class="be-connector\${isPortConnected(block.id,p,'out')?' connected':''}"
                   data-block="\${block.id}" data-port="\${p}" data-dir="out"
                   onclick="startConnect(event,\${block.id},'\${p}','out')"></div>
            </div>
          </div>\`).join('')}
        \${block.params.map(param=>renderBlockParamInput(block,param)).join('')}
      </div>\`;

    // drag header
    el.querySelector('.be-block-header').addEventListener('mousedown', e=>{
      e.stopPropagation();
      BE.selected=block.id;
      const rect=el.getBoundingClientRect();
      const cRect=canvas.getBoundingClientRect();
      BE.dragging=block;
      BE.dragOffX=e.clientX-rect.left;
      BE.dragOffY=e.clientY-rect.top;
      renderBlockEditor();
    });
    el.addEventListener('mousedown', e=>{ BE.selected=block.id; renderBlockEditor(); });
    canvas.appendChild(el);
  });

  // draw connections as SVG bezier paths
  BE.connections.forEach(conn=>{
    const fromEl=canvas.querySelector(\`#be-block-\${conn.from} .be-connector[data-port="\${conn.fromPort}"][data-dir="out"]\`);
    const toEl=canvas.querySelector(\`#be-block-\${conn.to} .be-connector[data-port="\${conn.toPort}"][data-dir="in"]\`);
    if(!fromEl||!toEl)return;
    const cRect=canvas.getBoundingClientRect();
    const fr=fromEl.getBoundingClientRect(), tr=toEl.getBoundingClientRect();
    const x1=fr.left-cRect.left+fr.width/2, y1=fr.top-cRect.top+fr.height/2;
    const x2=tr.left-cRect.left+tr.width/2, y2=tr.top-cRect.top+tr.height/2;
    const cp=Math.abs(x2-x1)*0.5;
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',\`M\${x1},\${y1} C\${x1+cp},\${y1} \${x2-cp},\${y2} \${x2},\${y2}\`);
    path.setAttribute('fill','none');
    path.setAttribute('stroke','#00d4ff');
    path.setAttribute('stroke-width','2');
    path.setAttribute('opacity','0.7');
    svg.appendChild(path);
  });

  // mouse handlers for drag
  canvas.onmousemove=e=>{
    if(BE.dragging){
      const r=canvas.getBoundingClientRect();
      BE.dragging.x=Math.max(0,e.clientX-r.left-BE.dragOffX);
      BE.dragging.y=Math.max(0,e.clientY-r.top-BE.dragOffY);
      renderBlockEditor();
    }
  };
  canvas.onmouseup=()=>{BE.dragging=null;};
}

function findBlockDef(cat,type){
  // Check both custom and dynamic block definitions
  const allCats = { ...BLOCK_DEFS, ...generateBlockDefsFromLibs() };
  return allCats[cat]?.types?.find(t=>t.name===type);
}
function isPortConnected(blockId,port,dir){
  return BE.connections.some(c=>
    (dir==='out'&&c.from===blockId&&c.fromPort===port)||
    (dir==='in'&&c.to===blockId&&c.toPort===port));
}
function setBlockParam(blockId,key,val){
  const b=BE.blocks.find(b=>b.id===blockId);
  if(b){const p=b.params.find(p=>p.k===key);if(p)p.v=val;}
}

let connectStart=null;
function startConnect(e,blockId,port,dir){
  e.stopPropagation();
  if(!connectStart){
    connectStart={blockId,port,dir};
    logConsole('info',\`Connecting from \${port}...\`);
  } else {
    if(connectStart.blockId!==blockId&&connectStart.dir!==dir){
      const from=dir==='in'?{id:connectStart.blockId,port:connectStart.port}:{id:blockId,port};
      const to=dir==='in'?{id:blockId,port}:{id:connectStart.blockId,port:connectStart.port};
      BE.connections.push({from:from.id,fromPort:from.port,to:to.id,toPort:to.port});
      logConsole('success',\`Connected: \${from.port} → \${to.port}\`);
      renderBlockEditor();
    }
    connectStart=null;
  }
}

function addBlockLegacy_1(){
  const cats=Object.keys(BLOCK_DEFS);
  const cat=cats[Math.floor(Math.random()*cats.length)];
  const types=BLOCK_DEFS[cat].types;
  const type=types[Math.floor(Math.random()*types.length)];
  const blockData = {
    id:BE.nextId++,cat,type:type.name,
    x:100+Math.random()*400,y:80+Math.random()*300,
    params:type.params.map(p=>({...p})),
    ports:{...type.ports}
  };
  // Add library info if available
  if (type.library) {
    blockData.library = type.library;
    blockData.method = type.method;
  }
  BE.blocks.push(blockData);
  renderBlockEditor();
  logConsole('success',\`Added block: \${type.name}\`);
}

function validateBlocks(){
  const errors=[];
  const warnings=[];
  BE.blocks.forEach(b=>{
    const def=findBlockDef(b.cat,b.type);
    if(def?.ports?.in?.length>0){
      const hasIn=BE.connections.some(c=>c.to===b.id);
      if(!hasIn)errors.push(\`"\${b.type}" has no input connection\`);
    }
    // Warn if library method block has no parameters set
    if (b.lib && (!b.params || b.params.every(p => p.v === '' || p.v === undefined))) {
      warnings.push(\`"\${b.type}" has no parameters set\`);
    }
  });
  const v=document.getElementById('be-valid');
  v.classList.remove('hidden');
  if(errors.length===0){
    const msg = warnings.length > 0 ? \`✓ Valid (\${warnings.length} warning)\` : '✓ Graph valid';
    v.className='be-valid ok';v.textContent=msg;
    logConsole('success','Block graph validation passed');
    warnings.forEach(w=>logConsole('warn',w));
  } else {
    v.className='be-valid err';v.textContent=\`✕ \${errors.length} error(s)\`;
    errors.forEach(e=>logConsole('error',e));
  }
  setTimeout(()=>v.classList.add('hidden'),4000);
}

function generateCode(){
  const lines = [];
  const imports = new Set();
  const usedLibs = new Set();
  
  // Track which libraries are used
  BE.blocks.forEach(b => {
    if (b.lib) usedLibs.add(b.lib);
  });
  
  // Add necessary imports at the top
  lines.push('// Generated from Block Editor - Library imports auto-generated');
  lines.push('// Copy this to your main JS file or game loop');
  lines.push('');
  
  if (usedLibs.size > 0) {
    const sortedLibs = Array.from(usedLibs).sort();
    sortedLibs.forEach(lib => {
      const libName = lib.charAt(0).toUpperCase() + lib.slice(1);
      // events.js exports multiple named exports, use namespace import
      if(lib.toLowerCase() === 'events'){
        imports.add(\`import * as \${libName} from '../libs/\${lib.toLowerCase()}.js';\`);
      } else {
        imports.add(\`import { \${libName} } from '../libs/\${lib.toLowerCase()}.js';\`);
      }
    });
    Array.from(imports).forEach(imp => lines.push(imp));
    lines.push('');
    lines.push('// ════════════════════════════════════');
    lines.push('// BLOCK-GENERATED CODE');
    lines.push('// ════════════════════════════════════');
    lines.push('');
  } else {
    lines.push('// ════════════════════════════════════');
    lines.push('// BLOCK-GENERATED CODE');
    lines.push('// ════════════════════════════════════');
    lines.push('');
  }
  
  // Generate block execution code
  BE.blocks.forEach(b=>{
    lines.push(\`// [Block] \${b.type}\`);
    
    if (b.lib) {
      // Dynamic library method call
      const libName = b.lib.charAt(0).toUpperCase() + b.lib.slice(1);
      const methodName = b.method || b.type.replace(/ /g, '').charAt(0).toLowerCase() + b.type.replace(/ /g, '').slice(1);
      
      // Check if this is an event handler (property assignment instead of method call)
      const eventHandlers = ['keyPressed', 'keyReleased', 'keyTyped', 'mousePressed', 'mouseReleased', 'mouseDragged', 'mouseMoved', 'mouseClicked', 'doubleClicked', 'mouseWheel', 'mouseLeave', 'windowResized', 'windowFocused', 'windowBlurred'];
      
      if (eventHandlers.includes(methodName)) {
        // Generate event handler assignment
        lines.push(\`\${libName}.\${methodName} = function(event) {\`);
        lines.push(\`  // TODO: Add your event handling code here\`);
        lines.push(\`};\`);
      } else {
        // Regular method call
        const activeParams = b.params.filter(p => p.v !== '' && p.v !== undefined && p.v !== null);
        let paramStr = '';
        
        if (activeParams.length > 0) {
          paramStr = activeParams.map(p => {
            const val = isNaN(p.v) ? \`'\${p.v}'\` : p.v;
            return \`\${p.k}: \${val}\`;
          }).join(', ');
          lines.push(\`\${libName}.\${methodName}({ \${paramStr} });\`);
        } else {
          lines.push(\`\${libName}.\${methodName}();\`);
        }
      }
    } else {
      // Legacy block format (custom definitions)
      const params=b.params.map(p=>\`\${p.k}: \${isNaN(p.v)?\`"\${p.v}"\`:p.v}\`).join(', ');
      const methodName = b.type.replace(/ /g,'').charAt(0).toLowerCase()+b.type.replace(/ /g,'').slice(1);
      lines.push(\`\${b.cat.toLowerCase()}.\${methodName}({ \${params} });\`);
    }
    lines.push('');
  });
  
  document.getElementById('code-area').value=lines.join('\\n');
  refreshCodeHighlight();
  setEditorTab('code');
  logConsole('success','Code generated with library imports and method calls');
}

function clearBlocks(){BE.blocks=[];BE.connections=[];BE.selected=null;buildBlockEditor();}
function deleteSelected(){
  if(!BE.selected)return;
  BE.blocks=BE.blocks.filter(b=>b.id!==BE.selected);
  BE.connections=BE.connections.filter(c=>c.from!==BE.selected&&c.to!==BE.selected);
  BE.selected=null;
  renderBlockEditor();
}

// ═══════════════════════════════════════════════════════
//  CODE EDITOR
// ═══════════════════════════════════════════════════════
const STARTER_CODE=\`\`;

const JS_KEYWORDS=/\\b(import|export|from|const|let|var|function|class|return|if|else|for|while|do|switch|case|break|continue|new|this|typeof|instanceof|null|undefined|true|false|async|await|try|catch|finally|throw|delete|in|of|extends|super)\\b/g;
const JS_STRINGS=/(["'\`])((?:\\\\.|(?!\\1)[^\\\\])*)\\1/g;
const JS_NUMBERS=/\\b(\\d+\\.?\\d*)\\b/g;
const JS_COMMENTS=/(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)/g;
const JS_FUNCS=/\\b([A-Za-z_$][A-Za-z0-9_$]*)(?=\\s*\\()/g;

function escapeHtml(value){
  return String(value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function syntaxHighlight(code){
  const libColor = Object.fromEntries(LIBS.map(l=>[l.name,l.color]));
  const keywordSet = new Set('import export from const let var function class return if else for while do switch case break continue new this typeof instanceof null undefined true false async await try catch finally throw delete in of extends super'.split(' '));
  const tokenRe = /(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/)|(["'\`])(?:\\\\.|(?!\\2)[^\\\\])*\\2|\\b\\d+(?:\\.\\d+)?\\b|\\b[A-Za-z_$][A-Za-z0-9_$]*\\b|[+\\-*\\/%=<>!&|?:.,;()[\\]{}]/g;
  let out = '';
  let last = 0;
  for (const match of code.matchAll(tokenRe)) {
    const token = match[0];
    out += escapeHtml(code.slice(last, match.index));
    if (match[1]) {
      out += \`<span class="tok-comment">\${escapeHtml(token)}</span>\`;
    } else if (/^["'\`]/.test(token)) {
      out += \`<span class="tok-string">\${escapeHtml(token)}</span>\`;
    } else if (/^\\d/.test(token)) {
      out += \`<span class="tok-number">\${escapeHtml(token)}</span>\`;
    } else if (keywordSet.has(token)) {
      out += \`<span class="tok-keyword">\${escapeHtml(token)}</span>\`;
    } else if (libColor[token]) {
      out += \`<span class="tok-library" style="color:\${libColor[token]}">\${escapeHtml(token)}</span>\`;
    } else if (/^[A-Za-z_$]/.test(token)) {
      const next = code.slice(match.index + token.length).match(/^\\s*\\(/);
      out += next ? \`<span class="tok-function">\${escapeHtml(token)}</span>\` : escapeHtml(token);
    } else {
      out += \`<span class="tok-operator">\${escapeHtml(token)}</span>\`;
    }
    last = match.index + token.length;
  }
  out += escapeHtml(code.slice(last));
  return out;
}

function initCodeEditor(){
  const ta=document.getElementById('code-area');
  ta.value=STARTER_CODE;
  refreshCodeHighlight();
}

function refreshCodeHighlight(){
  const ta=document.getElementById('code-area');
  const hl=document.getElementById('code-highlight');
  const ln=document.getElementById('line-nums');
  const code=ta.value;
  hl.innerHTML=syntaxHighlight(code)+'\\n';
  const lines=code.split('\\n');
  ln.innerHTML=lines.map((_,i)=>\`<div>\${i+1}</div>\`).join('');
  document.getElementById('ce-line-count').textContent=\`\${lines.length} line\${lines.length>1?'s':''}\`;
}

function onCodeInput(e){
  refreshCodeHighlight();
  updateCursor();
  const ta=document.getElementById('code-area');
  const val=ta.value;const pos=ta.selectionStart;
  const before=val.slice(0,pos);const word=before.match(/[\\w.]+$/)?.[0]||'';
  if(word.length>=2)showAutocomplete(word,ta,pos);
  else hideAutocomplete();
}
function onCodeKey(e){updateCursor();}
function syncScroll(){
  const ta=document.getElementById('code-area');
  const hl=document.getElementById('code-highlight');
  const ln=document.getElementById('line-nums');
  hl.scrollTop=ta.scrollTop;hl.scrollLeft=ta.scrollLeft;
  ln.scrollTop=ta.scrollTop;
}
function updateCursor(){
  const ta=document.getElementById('code-area');
  const val=ta.value.slice(0,ta.selectionStart);
  const lines=val.split('\\n');
  document.getElementById('ce-cursor-pos').textContent=\`Ln \${lines.length}, Col \${lines[lines.length-1].length+1}\`;
}

function handleCodeKeyDown(e){
  const ta=document.getElementById('code-area');
  if(e.key==='Tab'){
    e.preventDefault();
    const s=ta.selectionStart, end=ta.selectionEnd;
    if(s!==end){
      const before=ta.value.slice(0,s);
      const selected=ta.value.slice(s,end);
      const after=ta.value.slice(end);
      const lineStart=before.lastIndexOf('\\n')+1;
      const block=ta.value.slice(lineStart,end);
      const replacement=e.shiftKey
        ? block.replace(/^ {1,2}/gm,'')
        : block.replace(/^/gm,'  ');
      ta.value=ta.value.slice(0,lineStart)+replacement+after;
      ta.selectionStart=lineStart;
      ta.selectionEnd=lineStart+replacement.length;
    } else {
      ta.value=ta.value.slice(0,s)+'  '+ta.value.slice(end);
      ta.selectionStart=ta.selectionEnd=s+2;
    }
    refreshCodeHighlight();
    syncScroll();
    updateCursor();
  }
  if(e.key==='Enter'){
    const s=ta.selectionStart;
    const line=ta.value.slice(0,s).split('\\n').pop();
    const indent=line.match(/^(\\s*)/)[1];
    const extra=line.trim().endsWith('{')?'  ':'';
    e.preventDefault();
    const ins='\\n'+indent+extra;
    ta.value=ta.value.slice(0,s)+ins+ta.value.slice(s);
    ta.selectionStart=ta.selectionEnd=s+ins.length;
    refreshCodeHighlight();
    syncScroll();
    updateCursor();
  }
  hideAutocomplete();
}

// Autocomplete
const AC_ITEMS=[
  ...LIBS.map(l=>({label:l.name,kind:'lib',color:l.color})),
  {label:'Canvas.create',kind:'fn'},{label:'Canvas.clear',kind:'fn'},
  {label:'Physics.init',kind:'fn'},{label:'Physics.step',kind:'fn'},{label:'Physics.applyForce',kind:'fn'},
  {label:'Events.on',kind:'fn'},{label:'Events.emit',kind:'fn'},
  {label:'Flow.loop',kind:'fn'},{label:'Flow.once',kind:'fn'},
  {label:'Sprites.load',kind:'fn'},{label:'Sprites.drawAll',kind:'fn'},
  {label:'Transform.translate',kind:'fn'},{label:'Transform.rotate',kind:'fn'},
  {label:'Camera.follow',kind:'fn'},{label:'Camera.update',kind:'fn'},
  {label:'Sound.play',kind:'fn'},{label:'Sound.stop',kind:'fn'},
];

function showAutocomplete(word,ta,pos){
  const ac=document.getElementById('autocomplete');
  const matches=AC_ITEMS.filter(i=>i.label.toLowerCase().startsWith(word.toLowerCase())&&i.label!==word);
  if(!matches.length){hideAutocomplete();return;}
  ac.innerHTML=matches.slice(0,8).map((m,i)=>\`
    <div class="ac-item\${i===0?' selected':''}" onclick="applyAutocomplete('\${m.label}','\${word}')">
      <span style="color:\${m.color||'var(--accent)'}">\${m.label}</span>
      <span class="ac-kind">\${m.kind}</span>
    </div>\`).join('');
  // position near cursor
  const r=ta.getBoundingClientRect();
  const lines=ta.value.slice(0,pos).split('\\n');
  const lineH=22;
  ac.style.display='block';
  ac.style.top=(lines.length*lineH+10)+'px';
  ac.style.left='58px';
}
function hideAutocomplete(){document.getElementById('autocomplete').style.display='none';}
function applyAutocomplete(label,word){
  const ta=document.getElementById('code-area');
  const pos=ta.selectionStart;
  const start=pos-word.length;
  ta.value=ta.value.slice(0,start)+label+ta.value.slice(pos);
  ta.selectionStart=ta.selectionEnd=start+label.length;
  refreshCodeHighlight();hideAutocomplete();ta.focus();
}

function insertLibIntoCode(name){
  const ta=document.getElementById('code-area');
  const imp=\`import { \${name} } from "../libs/\${name.toLowerCase()}.js";\\n\`;
  if(!ta.value.includes(\`{ \${name} }\`)){ta.value=imp+ta.value;}
  refreshCodeHighlight();
  logConsole('success',\`Inserted import: \${name}\`);
}
function formatCode(){
  const ta=safeEl('code-area'); if(!ta) return;
  try{
    // Simple JS auto-formatter: normalize indentation
    let code=ta.value;
    const lines=code.split('\\n');
    let indent=0;
    const formatted=lines.map(raw=>{
      const line=raw.trim();
      if(!line) return '';
      // Decrease indent before closing braces
      if(/^[}\\])];?\\s*$/.test(line)) indent=Math.max(0,indent-1);
      const out='  '.repeat(indent)+line;
      // Increase indent after opening braces
      if(/[{\\[(]\\s*$/.test(line) || /=>\\s*\\{\\s*$/.test(line)) indent++;
      return out;
    });
    ta.value=formatted.join('\\n');
    refreshCodeHighlight(); syncScroll(); updateCursor();
    logConsole('success','Code formatted');
    setStatusMsg('Formatted ✓');
  }catch(err){
    logConsole('error','Format error: '+err.message);
  }
}
function runSnippet(){
  const ta=safeEl('code-area'); if(!ta) return;
  const code=ta.value;
  // Strip import lines (they can't run in a browser snippet context)
  const runnable=code.split('\\n').filter(l=>!/^\\s*import\\b/.test(l)).join('\\n');
  const statusEl=safeEl('ce-status-msg');
  try{
    // Validate syntax first
    new Function(runnable);
    logConsole('success','▶ Snippet syntax OK — simulating execution...');
    if(statusEl){statusEl.textContent='● OK';statusEl.className='con-success';}
    setStatusMsg('Snippet OK');
    // Count blocks/calls as a proxy for "ran"
    const calls=(runnable.match(/\\w+\\.\\w+\\s*\\(/g)||[]).length;
    setTimeout(()=>logConsole('info',\`Snippet processed \${calls} call(s). Connect libs to run for real.\`),200);
  }catch(err){
    logConsole('error','✕ Snippet error: '+err.message);
    if(statusEl){statusEl.textContent='● Error';statusEl.className='ce-error';}
    setStatusMsg('Snippet error');
  }
}

// ═══════════════════════════════════════════════════════
//  PIXEL EDITOR
// ═══════════════════════════════════════════════════════
const PE={
  canvas:null, ctx:null,
  w:32, h:32, zoom:12,
  tool:'draw', color:'#e94560',
  painting:false,
  layers:[{name:'Layer 0',visible:true,active:true,data:null}],
  activeLayer:0,
  palette:[
    '#1a1a2e','#0f3460','#533483','#e94560','#f5a623','#4ecdc4',
    '#45b7d1','#96ceb4','#ffeaa7','#dfe6e9','#ffffff','#2d3436',
    '#636e72','#ff7675','#fd79a8','#a29bfe','#00b894','#0984e3',
    '#6c5ce7','#fdcb6e','#e17055','#55efc4','#74b9ff','#b2bec3',
  ]
};

const PE_TOOLS=[
  {id:'draw',  icon:'✏',  title:'Draw'},
  {id:'erase', icon:'◻',  title:'Erase'},
  {id:'fill',  icon:'◈',  title:'Fill'},
  {id:'pick',  icon:'◎',  title:'Pick Color'},
  null,
  {id:'line',  icon:'╱',  title:'Line'},
  {id:'rect',  icon:'▭',  title:'Rectangle'},
  {id:'circle',icon:'○',  title:'Circle'},
];

function initPixelEditor(){
    ensurePixelArtBridgeState();

  PE.canvas=document.getElementById('pe-canvas');
  PE.ctx=PE.canvas.getContext('2d');
  PE.w=32;PE.h=32;PE.zoom=12;
  // init layer data
  PE.layers[0].data=new Uint8ClampedArray(PE.w*PE.h*4);
  // fill transparent
  for(let i=0;i<PE.layers[0].data.length;i+=4){PE.layers[0].data[i+3]=0;}
  applySizeAndZoom();
  buildPeTools();
  buildPePalette();
  bindPeEvents();
  renderPeLayers();
  drawPeCanvas();
}

function applySizeAndZoom(){
  PE.canvas.width=PE.w;PE.canvas.height=PE.h;
  PE.canvas.style.width=(PE.w*PE.zoom)+'px';
  PE.canvas.style.height=(PE.h*PE.zoom)+'px';
  document.getElementById('pe-zoom-info').textContent=\`\${PE.w} × \${PE.h} · \${PE.zoom}×\`;
}

function buildPeTools(){
  const el=document.getElementById('pe-tools');
  el.innerHTML='';
  PE_TOOLS.forEach(t=>{
    if(!t){const sep=document.createElement('div');sep.className='pe-tool-sep';el.appendChild(sep);return;}
    const btn=document.createElement('div');
    btn.className='pe-tool'+(PE.tool===t.id?' active':'');
    btn.title=t.title;btn.textContent=t.icon;
    btn.onclick=()=>{PE.tool=t.id;buildPeTools();};
    el.appendChild(btn);
  });
}

function buildPePalette(){
  const el=document.getElementById('pe-palette');
  el.innerHTML='';
  PE.palette.forEach(c=>{
    const sw=document.createElement('div');
    sw.className='pe-swatch'+(c===PE.color?' selected':'');
    sw.style.background=c;
    sw.onclick=()=>setPeColor(c);
    el.appendChild(sw);
  });
}

function setPeColor(c){
    ensurePixelArtBridgeState();

  PE.color=c;
  document.getElementById('pe-color-preview').style.background=c;
  document.getElementById('pe-color-picker').value=c;
  buildPePalette();
}

function bindPeEvents(){
  PE.canvas.addEventListener('mousedown',e=>{PE.painting=true;pePaint(e);});
  PE.canvas.addEventListener('mousemove',e=>{if(PE.painting)pePaint(e);});
  PE.canvas.addEventListener('mouseup',()=>PE.painting=false);
  PE.canvas.addEventListener('mouseleave',()=>PE.painting=false);
  ['pe-w','pe-h'].forEach(id=>{
    const el=document.getElementById(id);
    if(el && !el.__forgeLiveResizeBound){
      el.addEventListener('input', resizePeCanvas);
      el.addEventListener('change', resizePeCanvas);
      el.__forgeLiveResizeBound=true;
    }
  });
}

function pePaint(e){
  const r=PE.canvas.getBoundingClientRect();
  const x=Math.floor((e.clientX-r.left)/PE.zoom);
  const y=Math.floor((e.clientY-r.top)/PE.zoom);
  if(x<0||x>=PE.w||y<0||y>=PE.h)return;
  const layer=PE.layers[PE.activeLayer];
  if(!layer||!layer.visible)return;
  if(PE.tool==='draw'){setPixel(layer,x,y,PE.color);}
  else if(PE.tool==='erase'){clearPixel(layer,x,y);}
  else if(PE.tool==='fill'){floodFill(layer,x,y,PE.color);}
  else if(PE.tool==='pick'){
    const idx=(y*PE.w+x)*4;
    const d=layer.data;
    if(d[idx+3]>0){
      const hex=\`#\${[d[idx],d[idx+1],d[idx+2]].map(v=>v.toString(16).padStart(2,'0')).join('')}\`;
      setPeColor(hex);
    }
  }
  drawPeCanvas();
  schedulePixelEditorSpritePreviewSync();
}

function setPixel(layer,x,y,hex){
  const idx=(y*PE.w+x)*4;
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  layer.data[idx]=r;layer.data[idx+1]=g;layer.data[idx+2]=b;layer.data[idx+3]=255;
}
function clearPixel(layer,x,y){
  const idx=(y*PE.w+x)*4;
  layer.data[idx+3]=0;
}
function floodFill(layer,x,y,newColor){
  const idx=(y*PE.w+x)*4;const d=layer.data;
  const tr=d[idx],tg=d[idx+1],tb=d[idx+2],ta=d[idx+3];
  const nr=parseInt(newColor.slice(1,3),16),ng=parseInt(newColor.slice(3,5),16),nb=parseInt(newColor.slice(5,7),16);
  if(tr===nr&&tg===ng&&tb===nb&&ta===255)return;
  const stack=[[x,y]];
  const visited=new Set();
  while(stack.length){
    const [cx,cy]=stack.pop();
    if(cx<0||cx>=PE.w||cy<0||cy>=PE.h)continue;
    const key=cy*PE.w+cx;
    if(visited.has(key))continue;
    const ci=key*4;
    if(d[ci]!==tr||d[ci+1]!==tg||d[ci+2]!==tb||d[ci+3]!==ta)continue;
    visited.add(key);
    d[ci]=nr;d[ci+1]=ng;d[ci+2]=nb;d[ci+3]=255;
    stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
  }
}

function drawPeCanvas(){
    ensurePixelArtBridgeState();

  const ctx=PE.ctx;
  ctx.clearRect(0,0,PE.w,PE.h);
  PE.layers.forEach(layer=>{
    if(!layer.visible)return;
    const id=new ImageData(new Uint8ClampedArray(layer.data),PE.w,PE.h);
    ctx.putImageData(id,0,0);
  });
}

function addPeLayer(){
    ensurePixelArtBridgeState();

  const data=new Uint8ClampedArray(PE.w*PE.h*4);
  PE.layers.push({name:\`Layer \${PE.layers.length}\`,visible:true,active:false,data});
  PE.activeLayer=PE.layers.length-1;
  renderPeLayers();
}

function renderPeLayers(){
    ensurePixelArtBridgeState();

  const el=document.getElementById('pe-layers');
  el.innerHTML='';
  PE.layers.forEach((layer,i)=>{
    const div=document.createElement('div');
    div.className='pe-layer'+(i===PE.activeLayer?' active':'');
    div.onclick=()=>{PE.activeLayer=i;renderPeLayers();};
    div.innerHTML=\`
      <canvas class="pe-layer-thumb" width="\${PE.w}" height="\${PE.h}"></canvas>
      <span style="flex:1;font-size:11px">\${layer.name}</span>
      <span style="cursor:pointer;font-size:11px;color:var(--text2)"
        onclick="togglePeLayer(\${i});event.stopPropagation()">\${layer.visible?'👁':'—'}</span>\`;
    const thumb=div.querySelector('canvas');
    const tc=thumb.getContext('2d');
    const id2=new ImageData(new Uint8ClampedArray(layer.data),PE.w,PE.h);
    tc.putImageData(id2,0,0);
    el.appendChild(div);
  });
}
function togglePeLayer(i){
  PE.layers[i].visible=!PE.layers[i].visible;
  drawPeCanvas();renderPeLayers();schedulePixelEditorSpritePreviewSync();
}
function resizePeCanvas(){
  ensurePixelArtBridgeState();
  const wInput=document.getElementById('pe-w');
  const hInput=document.getElementById('pe-h');
  const oldW=PE.w||32, oldH=PE.h||32;
  const newW=Math.max(4, Math.min(512, +wInput?.value||32));
  const newH=Math.max(4, Math.min(512, +hInput?.value||32));
  if(wInput && +wInput.value!==newW) wInput.value=newW;
  if(hInput && +hInput.value!==newH) hInput.value=newH;
  if(newW===oldW && newH===oldH){ applySizeAndZoom(); drawPeCanvas(); renderPeLayers(); schedulePixelEditorSpritePreviewSync(); return; }
  PE.layers.forEach(layer=>{
    const oldData=layer.data || new Uint8ClampedArray(oldW*oldH*4);
    const newData=new Uint8ClampedArray(newW*newH*4);
    const copyW=Math.min(oldW,newW), copyH=Math.min(oldH,newH);
    for(let y=0;y<copyH;y++){
      for(let x=0;x<copyW;x++){
        const src=(y*oldW+x)*4, dst=(y*newW+x)*4;
        newData[dst]=oldData[src]||0; newData[dst+1]=oldData[src+1]||0; newData[dst+2]=oldData[src+2]||0; newData[dst+3]=oldData[src+3]||0;
      }
    }
    layer.data=newData;
  });
  PE.w=newW; PE.h=newH;
  const selectedObj=STATE.objects.find(o=>o.id===STATE.selectedId);
  if(selectedObj?.type==='sprite'){
    selectedObj.w=newW; selectedObj.h=newH; selectedObj.pixelW=newW; selectedObj.pixelH=newH;
  }
  applySizeAndZoom();
  drawPeCanvas();
  renderPeLayers();
  schedulePixelEditorSpritePreviewSync();
  renderViewport();
}
function setPeZoom(v){
    ensurePixelArtBridgeState();

  PE.zoom=+v;applySizeAndZoom();
}
function getPixelEditorDataURL(){
  // PRIMARY: always read from the live PixelArt instance (pixelart.js) — it is the
  // only thing the user actually draws on. The legacy PE.layers path is never
  // populated by the new editor and must come last as a last-resort fallback only.
  const editor = PIXELART_BRIDGE?.instance;
  if(editor){
    const methodNames=['exportPNG','toDataURL','getDataURL','getPNGDataURL','exportDataURL'];
    for(const name of methodNames){
      if(typeof editor[name]==='function'){
        try{
          const out=editor[name]('image/png');
          if(typeof out==='string' && out.startsWith('data:image')) return out;
        }catch(_){}
        try{
          const out=editor[name]();
          if(typeof out==='string' && out.startsWith('data:image')) return out;
        }catch(_){}
      }
    }
    // Fallback: grab the raw canvas the PixelArt instance rendered to
    const canvas = PIXELART_BRIDGE?.root?.querySelector('canvas.__pa_canvas')
                || PIXELART_BRIDGE?.root?.querySelector('canvas')
                || document.querySelector('#pe-canvas')
                || document.querySelector('#pixel-editor canvas')
                || document.querySelector('#pixel-art-editor-root canvas');
    if(canvas && typeof canvas.toDataURL==='function'){
      try{ const out=canvas.toDataURL('image/png'); if(out.startsWith('data:image')) return out; }catch(_){}
    }
  }

  // LEGACY FALLBACK: old inline PE.layers (only populated by the pre-pixelart.js editor)
  try{
    if(PE && PE.layers && PE.w && PE.h){
      const tempCanvas=document.createElement('canvas');
      tempCanvas.width=PE.w; tempCanvas.height=PE.h;
      const tc=tempCanvas.getContext('2d');
      let hasPixels=false;
      PE.layers.forEach(layer=>{
        if(!layer || !layer.visible || !layer.data) return;
        for(let i=3;i<layer.data.length;i+=4){ if(layer.data[i]>0){ hasPixels=true; break; } }
        const id=new ImageData(new Uint8ClampedArray(layer.data),PE.w,PE.h);
        tc.putImageData(id,0,0);
      });
      if(hasPixels) return tempCanvas.toDataURL('image/png');
    }
  }catch(_){}

  try{
    if(PE && PE.canvas && typeof PE.canvas.toDataURL==='function'){
      const out=PE.canvas.toDataURL('image/png');
      if(typeof out==='string' && out.startsWith('data:image')) return out;
    }
  }catch(_){}

  return null;
}
function savePixelArtToSprite(){
  const dataURL=getPixelEditorDataURL();
  if(!dataURL){ logConsole('error','Could not read the Pixel Art canvas.'); setStatusMsg('Pixel autosave failed'); return; }
  const selectedObj=STATE.objects.find(o=>o.id===STATE.selectedId);
  const spriteName=STATE.editingSpriteName || selectedObj?.spriteSrc || selectedObj?.name || STATE.lastEditedSpriteName || 'edited-sprite.png';

  const w2=Number(document.getElementById('pe-w')?.value) || PE?.w || 32;
  const h2=Number(document.getElementById('pe-h')?.value) || PE?.h || 32;
  saveSpriteAssetData(spriteName,dataURL,w2,h2);
  let applied=applyPixelDataToSpriteObjects(spriteName,dataURL,w2,h2);

  // Always update the selected sprite; this is the active object being edited.
  if(selectedObj?.type==='sprite' && !applied.includes(selectedObj)){
    attachPixelDataToSpriteObject(selectedObj,dataURL,w2,h2,spriteName);
    applied.push(selectedObj);
  }
  primeSpriteImageAndRender(dataURL);
  buildHierarchy();
  setStatusMsg('Sprite saved ✓');
  logConsole('success','Pixel art saved to '+spriteName+' ('+applied.length+' object(s)).');
}
function normalizeSpriteAssetName(value){
  return String(value || '').trim().toLowerCase();
}
function spriteBaseName(value){
  return normalizeSpriteAssetName(value).replace(/\.(png|jpg|jpeg|gif|webp)$/i,'');
}
function saveSpriteAssetData(name,dataURL,w=32,h=32){
  if(!name || !dataURL) return;
  if(!STATE.spritePixelData) STATE.spritePixelData={};
  STATE.spritePixelData[name]={dataURL,w,h,updatedAt:Date.now()};
  SPRITE_PIXELDATA[name]=dataURL;
  STATE.lastEditedSpriteName=name;
  STATE.lastSpriteDataURL=dataURL;
}
function getSpriteDataURLByName(name){
  if(!name) return null;
  const exact = SPRITE_PIXELDATA?.[name] || STATE.spritePixelData?.[name]?.dataURL || STATE.spritePixelData?.[name];
  if(typeof exact === 'string') return exact;
  if(exact?.dataURL) return exact.dataURL;
  const target=normalizeSpriteAssetName(name), targetBase=spriteBaseName(name);
  const stores=[SPRITE_PIXELDATA, STATE.spritePixelData || {}];
  for(const store of stores){
    for(const key of Object.keys(store || {})){
      const keyNorm=normalizeSpriteAssetName(key), keyBase=spriteBaseName(key);
      if(keyNorm===target || keyBase===targetBase){
        const value=store[key];
        if(typeof value==='string') return value;
        if(value?.dataURL) return value.dataURL;
      }
    }
  }
  return null;
}
function getLatestSpriteDataURL(){
  if(STATE.lastSpriteDataURL) return STATE.lastSpriteDataURL;
  if(STATE.lastEditedSpriteName){
    const url=getSpriteDataURLByName(STATE.lastEditedSpriteName);
    if(url) return url;
  }
  const store=STATE.spritePixelData || SPRITE_PIXELDATA || {};
  let best=null,bestTime=-1;
  Object.keys(store).forEach(key=>{
    const value=store[key];
    const dataURL=typeof value==='string'?value:value?.dataURL;
    const t=typeof value==='string'?0:(value?.updatedAt||0);
    if(dataURL && t>=bestTime){ best=dataURL; bestTime=t; }
  });
  return best;
}
function getSpriteDataURLForObject(obj){
  if(!obj || obj.type!=='sprite') return null;
  // Do not fall back to the latest edited texture. A brand-new sprite must stay
  // transparent until that sprite/asset is explicitly edited or assigned.
  return obj.pixelDataURL || getSpriteDataURLByName(obj.spriteSrc) || getSpriteDataURLByName(obj.assetName) || getSpriteDataURLByName(obj.name) || null;
}
function spriteObjectMatchesAsset(obj,spriteName){
  if(!obj || obj.type!=='sprite' || !spriteName) return false;
  const target=normalizeSpriteAssetName(spriteName), targetBase=spriteBaseName(spriteName);
  const candidates=[obj.spriteSrc,obj.assetName,obj.name].filter(Boolean);
  return candidates.some(value=>{
    const norm=normalizeSpriteAssetName(value), base=spriteBaseName(value);
    return norm===target || base===targetBase || norm.includes(targetBase) || targetBase.includes(base);
  });
}
function attachPixelDataToSpriteObject(obj,dataURL,w=32,h=32,spriteName=null){
if(!obj || obj.type!=='sprite' || !dataURL) return;
  obj.pixelDataURL=dataURL;
  obj.pixelW=w;
  obj.pixelH=h;
  obj.w=w;
  obj.h=h;
  obj.color='transparent';
  if(spriteName) obj.spriteSrc=spriteName;
  // Bust stale image cache so renderViewport() always reloads the updated texture
  obj.__spriteImage=null;
  obj.__spriteImageSrc=null;
}
function applyPixelDataToSpriteObjects(spriteName,dataURL,w=32,h=32){
  const applied=[];
  STATE.objects.forEach(obj=>{
    if(!spriteName && obj.type==='sprite'){
      attachPixelDataToSpriteObject(obj,dataURL,w,h,spriteName);
      applied.push(obj);
      return;
    }
    if(!spriteObjectMatchesAsset(obj,spriteName)) return;
    attachPixelDataToSpriteObject(obj,dataURL,w,h,spriteName);
    applied.push(obj);
  });
  return applied;
}
function primeSpriteImageAndRender(dataURL){
  if(!dataURL){ renderViewport(); return; }
  // Prime the cache with a single-flight loader and trigger a viewport render when done
  ensureSpriteImageLoaded(null, dataURL, () => {});
  renderViewport();
}
function loadSpriteDataURLIntoPixelEditor(name,dataURL,options={}){
  if(!dataURL) return Promise.resolve(false);
  STATE.editingSpriteName=name || STATE.editingSpriteName || 'edited-sprite.png';
  STATE.lastEditedSpriteName=STATE.editingSpriteName;

  // Show original sprite in the reference panel
  const refPanel=document.getElementById('pe-reference-panel');
  const refCanvas=document.getElementById('pe-ref-canvas');
  const refLabel=document.getElementById('pe-ref-label');
  if(refPanel && refCanvas){
    refPanel.style.display='flex';
    const refImg=new Image();
    refImg.onload=()=>{
      const sz=Math.max(refImg.naturalWidth,refImg.naturalHeight)||32;
      const scale=Math.floor(96/sz)||1;
      refCanvas.width=refImg.naturalWidth||32;
      refCanvas.height=refImg.naturalHeight||32;
      refCanvas.style.width=Math.min(96,refImg.naturalWidth*scale)+'px';
      refCanvas.style.height=Math.min(96,refImg.naturalHeight*scale)+'px';
      const rc=refCanvas.getContext('2d');
      rc.imageSmoothingEnabled=false;
      rc.clearRect(0,0,refCanvas.width,refCanvas.height);
      rc.drawImage(refImg,0,0);
      if(refLabel) refLabel.textContent=(name||'sprite').replace(/.*\\//,'').slice(0,18);
    };
    refImg.src=dataURL;
    // Store original for comparison
    STATE._originalSpriteDataURL=dataURL;
  }
  return new Promise(resolve=>{
    const img=new Image();
    img.onload=()=>{
      try{
        const max=512;
        const w=Math.max(4,Math.min(max,options.w||img.naturalWidth||img.width||32));
        const h=Math.max(4,Math.min(max,options.h||img.naturalHeight||img.height||32));
        PE.w=w; PE.h=h;
        const wInput=document.getElementById('pe-w'), hInput=document.getElementById('pe-h');
        if(wInput) wInput.value=w;
        if(hInput) hInput.value=h;
        const temp=document.createElement('canvas');
        temp.width=w; temp.height=h;
        const tc=temp.getContext('2d');
        tc.imageSmoothingEnabled=false;
        tc.clearRect(0,0,w,h);
        tc.drawImage(img,0,0,w,h);
        const imageData=tc.getImageData(0,0,w,h);
        PE.layers=[{name:'Sprite',visible:true,active:true,data:new Uint8ClampedArray(imageData.data)}];
        PE.activeLayer=0;
        applySizeAndZoom();
        drawPeCanvas();
        renderPeLayers();
        saveSpriteAssetData(STATE.editingSpriteName,temp.toDataURL('image/png'),w,h);
        const selectedObj=STATE.objects.find(o=>o.id===STATE.selectedId);
        if(selectedObj?.type==='sprite') attachPixelDataToSpriteObject(selectedObj,temp.toDataURL('image/png'),w,h,STATE.editingSpriteName);
        applyPixelDataToSpriteObjects(STATE.editingSpriteName,temp.toDataURL('image/png'),w,h);
        primeSpriteImageAndRender(temp.toDataURL('image/png'));
        const editor=ensurePixelArtEditor?.();
        if(editor){ try{ if(editor.loadFromDataURL) editor.loadFromDataURL(temp.toDataURL('image/png')); else if(editor.importImage) editor.importImage(temp.toDataURL('image/png'),{newLayer:false,resize:false}); }catch(_){} }
        resolve(true);
      }catch(err){ console.warn('loadSpriteDataURLIntoPixelEditor failed',err); resolve(false); }
    };
    img.onerror=()=>resolve(false);
    img.src=dataURL;
  });
}
let _pixelPreviewSyncRAF=null;
function autosavePixelEditorToSpritePreview(){
  try{
    const dataURL=getPixelEditorDataURL();
    if(!dataURL) return false;
    const selectedObj=STATE.objects.find(o=>o.id===STATE.selectedId);
    const spriteName=STATE.editingSpriteName || selectedObj?.spriteSrc || selectedObj?.name || STATE.lastEditedSpriteName || 'edited-sprite.png';
    // Get real dimensions from the live PixelArt instance, not the stale PE legacy object
    const editor=PIXELART_BRIDGE?.instance;
    const w=Number(document.getElementById('pe-w')?.value)||editor?._PixelArt__cols||PE?.w||32;
    const h=Number(document.getElementById('pe-h')?.value)||editor?._PixelArt__rows||PE?.h||32;
    saveSpriteAssetData(spriteName,dataURL,w,h);
    // Apply to ALL sprite objects that share this asset name, plus force-apply to selected
    const applied=applyPixelDataToSpriteObjects(spriteName,dataURL,w,h);
    if(selectedObj?.type==='sprite' && !applied.includes(selectedObj)) attachPixelDataToSpriteObject(selectedObj,dataURL,w,h,spriteName);
    primeSpriteImageAndRender(dataURL);
    // Update "Edited" preview in reference panel
    const editedCanvas=document.getElementById('pe-edited-canvas');
    if(editedCanvas){
      const img=new Image();
      img.onload=()=>{
        const sz=Math.max(img.naturalWidth,img.naturalHeight)||32;
        const scale=Math.floor(96/sz)||1;
        editedCanvas.width=img.naturalWidth||w;
        editedCanvas.height=img.naturalHeight||h;
        editedCanvas.style.width=Math.min(96,(img.naturalWidth||w)*scale)+'px';
        editedCanvas.style.height=Math.min(96,(img.naturalHeight||h)*scale)+'px';
        const ec=editedCanvas.getContext('2d');
        ec.imageSmoothingEnabled=false;
        ec.clearRect(0,0,editedCanvas.width,editedCanvas.height);
        ec.drawImage(img,0,0);
      };
      img.src=dataURL;
    }
    return true;
  }catch(_){ return false; }
}
function schedulePixelEditorSpritePreviewSync(){
  if(_pixelPreviewSyncRAF) return;
  if(!STATE.editingSpriteName && !(STATE.objects.find(o=>o.id===STATE.selectedId)?.type==='sprite')) return;
  _pixelPreviewSyncRAF=requestAnimationFrame(()=>{ _pixelPreviewSyncRAF=null; autosavePixelEditorToSpritePreview(); });
}
function applyUploadedSpriteAssetToScene(name,dataURL,w=32,h=32){
  saveSpriteAssetData(name,dataURL,w,h);
  const selectedObj=STATE.objects.find(o=>o.id===STATE.selectedId);
  let applied=[];
  if(selectedObj?.type==='sprite'){
    attachPixelDataToSpriteObject(selectedObj,dataURL,w,h,name);
    applied.push(selectedObj);
  } else {
    applied=applyPixelDataToSpriteObjects(name,dataURL,w,h);
  }
  if(!applied.length){
    const obj={id:STATE.nextId++,name:String(name||'sprite').replace(/\.[^.]+$/,''),type:'sprite',x:200+Math.random()*300,y:120+Math.random()*220,w:48,h:48,color:'transparent',z:0,rot:0,scaleX:1,scaleY:1,visible:true,locked:false,tag:'sprite',spriteSrc:name,pixelDataURL:dataURL,pixelW:w,pixelH:h};
    STATE.objects.push(obj);
    STATE.selectedId=obj.id;
    applied.push(obj);
    updateStatusBar();
  }
  primeSpriteImageAndRender(dataURL);
  buildHierarchy();
  setStatusMsg('Imported sprite applied ✓');
  if(STATE.editorTab==='pixels' || STATE.editingSpriteName===name) loadSpriteDataURLIntoPixelEditor(name,dataURL,{w,h});
  return applied;
}
// Cache for pixel art image elements (so we can draw dataURLs on the canvas)
const _spriteImageCache={};
// Single-flight loaders for dataURL/image src values
const _spriteLoaders = {};

function ensureSpriteImageLoaded(obj, src, onLoaded){
  if(!src) return;
  // If caller provided an object, set the src immediately so stale-cache guards work
  if(obj) obj.__spriteImageSrc = src;

  // If we already have a cached image that's complete, attach and callback immediately
  const cached = _spriteImageCache[src];
  if(cached && cached.complete && cached.naturalWidth > 0){
    if(obj) obj.__spriteImage = cached;
    try{ if(typeof onLoaded==='function') onLoaded(cached); }catch(_){}
    return;
  }

  // If a loader is already in-flight for this src, queue the callback and optionally link the obj
  if(_spriteLoaders[src]){
    if(obj) obj.__spriteImage = _spriteLoaders[src].img;
    if(typeof onLoaded==='function') _spriteLoaders[src].cbs.push(onLoaded);
    return;
  }

  // Start loading (single-flight) using the browser DOM image constructor.
  const img = (typeof document !== 'undefined' && document.createElement) ? document.createElement('img') : new Image();
  if(src && src.indexOf('data:') !== 0){
    try{ img.crossOrigin = 'Anonymous'; }catch(_){ }
  }
  _spriteLoaders[src] = { img: img, cbs: [] };
  if(obj) { obj.__spriteImage = img; obj.__spriteImageLoading = true; }
  if(typeof onLoaded==='function') _spriteLoaders[src].cbs.push(onLoaded);

  img.onload = () => {
    _spriteImageCache[src] = img;
    // attach to object if provided
    if(obj) { obj.__spriteImage = img; obj.__spriteImageLoading = false; }
    const cbs = (_spriteLoaders[src] && _spriteLoaders[src].cbs) || [];
    delete _spriteLoaders[src];
    cbs.forEach(cb=>{ try{ cb(img); }catch(_){}});
    try{ renderViewport(); }catch(_){ }
  };
  img.onerror = (e) => {
    const cbs = (_spriteLoaders[src] && _spriteLoaders[src].cbs) || [];
    delete _spriteLoaders[src];
    if(obj) { obj.__spriteImage = null; obj.__spriteImageLoading = false; }
    console.warn('[FORGE] Failed to load sprite texture:', src, e && e.message);
    cbs.forEach(cb=>{ try{ cb(null); }catch(_){}});
  };
  img.src = src;
}
function getSpriteImage(dataURL, cb){
  if(_spriteImageCache[dataURL]){ cb(_spriteImageCache[dataURL]); return; }
  ensureSpriteImageLoaded(null, dataURL, function(img){ cb(img); });
}

function exportPeSprite(){
    ensurePixelArtBridgeState();

  const tempCanvas=document.createElement('canvas');
  tempCanvas.width=PE.w;tempCanvas.height=PE.h;
  const tc=tempCanvas.getContext('2d');
  PE.layers.forEach(layer=>{
    if(!layer.visible)return;
    const id=new ImageData(new Uint8ClampedArray(layer.data),PE.w,PE.h);
    tc.putImageData(id,0,0);
  });
  const link=document.createElement('a');
  link.href=tempCanvas.toDataURL('image/png');
  link.download='sprite.png';link.click();
  logConsole('success',\`Exported sprite: \${PE.w}x\${PE.h} PNG\`);
}

// ═══════════════════════════════════════════════════════
//  PROJECT MANAGEMENT
// ═══════════════════════════════════════════════════════
function newProject(){openModal('modal-new');}
function confirmNewProject(){
  const name=document.getElementById('proj-name').value||'MyGame';
  const mode=document.getElementById('proj-mode').value;
  const w=+document.getElementById('proj-w').value||800;
  const h=+document.getElementById('proj-h').value||450;
  STATE.projectName=name;
  STATE.objects=[{id:1,name:'Main Camera',type:'camera',x:w/2,y:h/2,w:40,h:30,z:0,rot:0,scaleX:1,scaleY:1,color:'#fbbf24',visible:true,locked:false}];
  STATE.selectedId=null; STATE.nextId=2;
  vpCanvas.width=w;vpCanvas.height=h;
  setMode(mode);
  VP2D.panX=0; VP2D.panY=0; VP2D.zoom=1;
  VP3D.azimuth=0; VP3D.elevation=0.18; VP3D.distance=720; VP3D.zoom=1; VP3D.panX=0; VP3D.panY=0;
  buildHierarchy();renderViewport();updateStatusBar();
  logConsole('success',\`New project: \${name} (\${mode.toUpperCase()}, \${w}x\${h})\`);
  closeModal('modal-new');
}

function openProject(){
  // Create a hidden file input to load a .forge JSON file
  const input=document.createElement('input');
  input.type='file'; input.accept='.forge,.json';
  input.onchange=e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const data=JSON.parse(ev.target.result);
        if(data.objects){ STATE.objects=data.objects; STATE.nextId=Math.max(...data.objects.map(o=>o.id+1),10); }
        if(data.projectSettings){ STATE.projectSettings=Object.assign(ensureProjectSettings?.()||{},data.projectSettings); }
        if(data.spritePixelData){ STATE.spritePixelData=data.spritePixelData; Object.entries(data.spritePixelData).forEach(([k,v])=>{SPRITE_PIXELDATA[k]=v?.dataURL||v;}); }
        if(data.assetData){ STATE.assetData=data.assetData; }
        if(data.audioData){ STATE.audioData=data.audioData; }
        if(data.mode) setMode(data.mode);
        if(data.name){ STATE.projectName=data.name; }
        buildHierarchy(); renderViewport(); updateStatusBar();
        logConsole('success',\`Opened project: \${data.name||file.name}\`);
      }catch(err){ logConsole('error','Failed to open project: '+err.message); }
    };
    reader.readAsText(file);
  };
  input.click();
}

function exportHTML5(){
  // Build a self-contained HTML game preview from the project state and code editor content
  const ta=safeEl('code-area'); const code=(ta?ta.value:'// no script');
  const W=vpCanvas.width||800, H=vpCanvas.height||450;
  const objsJson=JSON.stringify(STATE.objects);
  const html=\`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>\${STATE.projectName}</title>
<style>*{margin:0;padding:0;box-sizing:border-box;}body{background:#000;display:flex;align-items:center;justify-content:center;height:100vh;}canvas{display:block;image-rendering:pixelated;}</style>
</head><body>
<canvas id="c" width="\${W}" height="\${H}"></canvas>
<script>
// FORGE Export — \${STATE.projectName}
const STATE={objects:\${objsJson},mode:'\${STATE.mode}'};
const canvas=document.getElementById('c');
const ctx=canvas.getContext('2d');
const keys={};
document.addEventListener('keydown',e=>{keys[e.key]=true;});
document.addEventListener('keyup',e=>{keys[e.key]=false;});
function loop(){
  ctx.fillStyle='#0d0f18';ctx.fillRect(0,0,\${W},\${H});
  // No default gameplay scripts are generated or run.
  // Add your own scripts in FORGE and wire them into your exported game.
  STATE.objects.sort((a,b)=>(a.z||0)-(b.z||0)).forEach(obj=>{
    if(!obj.visible||obj.type==='camera'||obj.type==='trigger')return;
    ctx.save();ctx.translate(obj.x,obj.y);
    if(obj.rot)ctx.rotate(obj.rot*Math.PI/180);
    if(obj.type==='sprite'&&obj.pixelDataURL){const img=new Image();img.src=obj.pixelDataURL;if(img.complete){ctx.imageSmoothingEnabled=false;ctx.drawImage(img,-obj.w/2,-obj.h/2,obj.w,obj.h);}else{ctx.fillStyle=obj.color;ctx.fillRect(-obj.w/2,-obj.h/2,obj.w,obj.h);}} else if(obj.type==='shape'||obj.type==='sprite'){ctx.fillStyle=obj.color;ctx.fillRect(-obj.w/2,-obj.h/2,obj.w,obj.h);}
    else if(obj.type==='light'){const g=ctx.createRadialGradient(0,0,0,0,0,obj.w/2);g.addColorStop(0,'rgba(255,220,120,.35)');g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,obj.w/2,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  });
  requestAnimationFrame(loop);
}
loop();
<\/script></body></html>\`;
  const blob=new Blob([html],{type:'text/html'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=STATE.projectName+'.html';a.click();
  logConsole('success',\`Exported HTML5: \${STATE.projectName}.html\`);
  setStatusMsg('Exported HTML5 ✓');
}

let _lightTheme=false;
function toggleTheme(){
  _lightTheme=!_lightTheme;
  const root=document.documentElement;
  if(_lightTheme){
    root.style.setProperty('--bg0','#f0f2ff');root.style.setProperty('--bg1','#e4e8f5');
    root.style.setProperty('--bg2','#d8ddf0');root.style.setProperty('--bg3','#ccd2eb');
    root.style.setProperty('--panel','#dde1f0');root.style.setProperty('--border','#b8bdd6');
    root.style.setProperty('--border2','#a0a8cc');root.style.setProperty('--text0','#0a0c18');
    root.style.setProperty('--text1','#1a1e36');root.style.setProperty('--text2','#4a5070');
    root.style.setProperty('--text3','#7880a0');
  } else {
    root.style.setProperty('--bg0','#08090d');root.style.setProperty('--bg1','#0d0f16');
    root.style.setProperty('--bg2','#12141e');root.style.setProperty('--bg3','#181b28');
    root.style.setProperty('--panel','#141720');root.style.setProperty('--border','#252a3a');
    root.style.setProperty('--border2','#2e3447');root.style.setProperty('--text0','#f0f2ff');
    root.style.setProperty('--text1','#b8bdd6');root.style.setProperty('--text2','#6b7280');
    root.style.setProperty('--text3','#3d4357');
  }
  logConsole('info',\`Theme: \${_lightTheme?'Light':'Dark'}\`);
}

function ensureProjectSettings(){
  STATE.projectSettings = Object.assign({
    backgroundColor: '#0d0f18', targetFps: 60, fixedTimestep: 16.666,
    physicsGravity: 9.8, snapSize: 20, gridStep: 50,
    renderPixelated: true, autoSave: false, show3DStats: true,
    multiplayer: {
      enabled: false,
      mode: 'local',
      roomId: '',
      maxPlayers: 4,
      tickRate: 30,
      autoHost: true,
      syncScene: true,
    },
  }, STATE.projectSettings || {});
  STATE.projectSettings.multiplayer = Object.assign({
    enabled: false,
    mode: 'local',
    roomId: '',
    maxPlayers: 4,
    tickRate: 30,
    autoHost: true,
    syncScene: true,
  }, STATE.projectSettings.multiplayer || {});
  return STATE.projectSettings;
}
function openProjectSettings(){
  const settings=ensureProjectSettings();
  let modal=document.getElementById('modal-proj-settings');
  if(!modal){
    modal=document.createElement('div'); modal.id='modal-proj-settings'; modal.className='modal-overlay';
    modal.innerHTML=\`
      <div class="modal" style="min-width:520px;max-width:720px;max-height:88vh;overflow:auto">
        <div class="modal-title">⚙️ Project Settings</div>
        <div class="prop-group"><div class="prop-group-title">General</div>
          <div class="modal-row"><span class="modal-label">Name</span><input class="modal-input" id="ps-name"/></div>
          <div class="modal-row"><span class="modal-label">Width</span><input class="modal-input" id="ps-w" type="number" min="64"/></div>
          <div class="modal-row"><span class="modal-label">Height</span><input class="modal-input" id="ps-h" type="number" min="64"/></div>
          <div class="modal-row"><span class="modal-label">Mode</span><select class="modal-input" id="ps-mode"><option value="2d">2D</option><option value="3d">3D</option></select></div>
          <div class="modal-row"><span class="modal-label">BG Color</span><input class="modal-input" id="ps-bg" type="color" style="height:36px;padding:2px"/></div>
        </div>
        <details style="border:1px solid var(--border);border-radius:6px;padding:10px;background:rgba(0,212,255,.035);margin-bottom:10px">
          <summary style="cursor:pointer;font-size:12px;font-weight:700;color:var(--accent);letter-spacing:.8px">Multiplayer Settings</summary>
          <div style="height:10px"></div>
          <div class="modal-row"><span class="modal-label">Enabled</span><input class="prop-checkbox" id="ps-mp-enabled" type="checkbox"/></div>
          <div class="modal-row"><span class="modal-label">Mode</span><select class="modal-input" id="ps-mp-mode"><option value="local">Local test</option><option value="host">Host room</option><option value="peer">Join room</option></select></div>
          <div class="modal-row"><span class="modal-label">Room ID</span><input class="modal-input" id="ps-mp-room" placeholder="Auto when blank"/></div>
          <div class="modal-row"><span class="modal-label">Max Players</span><input class="modal-input" id="ps-mp-max" type="number" min="1" max="8"/></div>
          <div class="modal-row"><span class="modal-label">Tick Rate</span><input class="modal-input" id="ps-mp-tick" type="number" min="1" max="120"/></div>
          <div class="modal-row"><span class="modal-label">Auto Host</span><input class="prop-checkbox" id="ps-mp-autohost" type="checkbox"/></div>
          <div class="modal-row"><span class="modal-label">Sync Scene</span><input class="prop-checkbox" id="ps-mp-sync" type="checkbox"/></div>
        </details>
        <details style="border:1px solid var(--border);border-radius:6px;padding:10px;background:rgba(255,255,255,.02)">
          <summary style="cursor:pointer;font-size:12px;font-weight:700;color:var(--accent);letter-spacing:.8px">Advanced Settings</summary>
          <div style="height:10px"></div>
          <div class="modal-row"><span class="modal-label">Target FPS</span><input class="modal-input" id="ps-target-fps" type="number" min="15" max="240"/></div>
          <div class="modal-row"><span class="modal-label">Fixed Step</span><input class="modal-input" id="ps-fixed-step" type="number" min="1" step="0.001"/></div>
          <div class="modal-row"><span class="modal-label">Gravity</span><input class="modal-input" id="ps-gravity" type="number" step="0.1"/></div>
          <div class="modal-row"><span class="modal-label">Snap Size</span><input class="modal-input" id="ps-snap-size" type="number" min="1"/></div>
          <div class="modal-row"><span class="modal-label">3D Grid Step</span><input class="modal-input" id="ps-grid-step" type="number" min="5"/></div>
          <div class="modal-row"><span class="modal-label">Pixelated</span><input class="prop-checkbox" id="ps-pixelated" type="checkbox"/></div>
          <div class="modal-row"><span class="modal-label">Auto Save</span><input class="prop-checkbox" id="ps-autosave" type="checkbox"/></div>
          <div class="modal-row"><span class="modal-label">3D Stats</span><input class="prop-checkbox" id="ps-3d-stats" type="checkbox"/></div>
        </details>
        <div class="modal-actions"><button class="modal-btn cancel" onclick="closeModal('modal-proj-settings')">Cancel</button><button class="modal-btn confirm" onclick="applyProjectSettings()">Apply</button></div>
      </div>\`;
    modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open');}); document.body.appendChild(modal);
  }
  safeEl('ps-name').value=STATE.projectName; safeEl('ps-w').value=vpCanvas.width||800; safeEl('ps-h').value=vpCanvas.height||450; safeEl('ps-mode').value=STATE.mode;
  safeEl('ps-bg').value=settings.backgroundColor || '#0d0f18'; safeEl('ps-target-fps').value=settings.targetFps; safeEl('ps-fixed-step').value=settings.fixedTimestep;
  safeEl('ps-gravity').value=settings.physicsGravity; safeEl('ps-snap-size').value=settings.snapSize; safeEl('ps-grid-step').value=settings.gridStep;
  safeEl('ps-pixelated').checked=!!settings.renderPixelated; safeEl('ps-autosave').checked=!!settings.autoSave; safeEl('ps-3d-stats').checked=!!settings.show3DStats;
  const mp=settings.multiplayer||{};
  safeEl('ps-mp-enabled').checked=!!mp.enabled; safeEl('ps-mp-mode').value=mp.mode||'local'; safeEl('ps-mp-room').value=mp.roomId||'';
  safeEl('ps-mp-max').value=mp.maxPlayers||4; safeEl('ps-mp-tick').value=mp.tickRate||30;
  safeEl('ps-mp-autohost').checked=mp.autoHost!==false; safeEl('ps-mp-sync').checked=mp.syncScene!==false;
  modal.classList.add('open');
}
function applyProjectSettings(){
  const settings=ensureProjectSettings(); const name=safeEl('ps-name')?.value||STATE.projectName; const w=+safeEl('ps-w')?.value||800; const h=+safeEl('ps-h')?.value||450; const mode=safeEl('ps-mode')?.value||STATE.mode;
  STATE.projectName=name; settings.backgroundColor=safeEl('ps-bg')?.value||settings.backgroundColor; settings.targetFps=Math.max(15,Math.min(240,+safeEl('ps-target-fps')?.value||60));
  settings.fixedTimestep=Math.max(1,+safeEl('ps-fixed-step')?.value||16.666); settings.physicsGravity=+safeEl('ps-gravity')?.value||9.8; settings.snapSize=Math.max(1,+safeEl('ps-snap-size')?.value||20);
  settings.gridStep=Math.max(5,+safeEl('ps-grid-step')?.value||50); settings.renderPixelated=!!safeEl('ps-pixelated')?.checked; settings.autoSave=!!safeEl('ps-autosave')?.checked; settings.show3DStats=!!safeEl('ps-3d-stats')?.checked;
  settings.multiplayer={
    enabled: !!safeEl('ps-mp-enabled')?.checked,
    mode: safeEl('ps-mp-mode')?.value || 'local',
    roomId: (safeEl('ps-mp-room')?.value || '').trim(),
    maxPlayers: Math.max(1,Math.min(8,+safeEl('ps-mp-max')?.value||4)),
    tickRate: Math.max(1,Math.min(120,+safeEl('ps-mp-tick')?.value||30)),
    autoHost: !!safeEl('ps-mp-autohost')?.checked,
    syncScene: !!safeEl('ps-mp-sync')?.checked,
  };
  vpCanvas.width=w; vpCanvas.height=h; vpCanvas.style.imageRendering=settings.renderPixelated?'pixelated':'auto'; setMode(mode); buildHierarchy(); renderViewport(); updateStatusBar();
  logConsole('success',\`Project settings updated: \${name} \${w}×\${h} \${mode.toUpperCase()} · multiplayer \${settings.multiplayer.enabled?'ON':'OFF'}\`); closeModal('modal-proj-settings');
}

function saveProject(){
  const data=JSON.stringify({name:STATE.projectName,mode:STATE.mode,projectSettings:ensureProjectSettings?.(),objects:STATE.objects,spritePixelData:STATE.spritePixelData||{},assetData:STATE.assetData||{},audioData:STATE.audioData||{}},null,2);
  const blob=new Blob([data],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=STATE.projectName+'.forge';a.click();
  logConsole('success',\`Project saved: \${STATE.projectName}.forge\`);
  setStatusMsg('Saved ✓');
}

// ═══════════════════════════════════════════════════════
//  UNDO / REDO
// ═══════════════════════════════════════════════════════
function pushUndo(){
  STATE.undoStack.push(JSON.stringify(STATE.objects));
  if(STATE.undoStack.length>50)STATE.undoStack.shift();
  STATE.redoStack=[];
}
function undo(){
  if(!STATE.undoStack.length)return;
  STATE.redoStack.push(JSON.stringify(STATE.objects));
  STATE.objects=JSON.parse(STATE.undoStack.pop());
  buildHierarchy();renderViewport();updateStatusBar();
  logConsole('info','Undo');
}
function redo(){
  if(!STATE.redoStack.length)return;
  STATE.undoStack.push(JSON.stringify(STATE.objects));
  STATE.objects=JSON.parse(STATE.redoStack.pop());
  buildHierarchy();renderViewport();updateStatusBar();
  logConsole('info','Redo');
}

// ═══════════════════════════════════════════════════════
//  RUN / STOP
// ═══════════════════════════════════════════════════════
// ── PLAY MODE OVERLAY ──────────────────────────────────
// Creates a full-viewport game preview so players see exactly what the
// published game looks like, with all editor UI hidden behind.

// ═══════════════════════════════════════════════════════
//  PLAY MODE BLOCK-CODE RUNTIME PATCH
// ═══════════════════════════════════════════════════════
// This bridges generated Block Editor code into Play Mode.  Instead of merely
// drawing the scene and running manually attached scripts, Play Mode now reads
// the generated FORGE_BLOCKS metadata from the Code Editor (or falls back to BE)
// and executes the same block graph while the game is running.
function createBlockCodePlayRuntimeV17(options){
  const playCanvas = options.playCanvas;
  const playCtx = options.playCtx;
  const keys = options.keys || {};
  const W = options.W || (playCanvas ? playCanvas.width : 800);
  const H = options.H || (playCanvas ? playCanvas.height : 450);
  const cleanup = [];
  const timers = [];
  const runningLoops = new Set();

  function readGraph(){
    const ta = safeEl('code-area');
    if (ta && ta.value && typeof parseCodeToBlocksV4 === 'function') {
      try {
        const parsed = parseCodeToBlocksV4(ta.value);
        if (parsed && Array.isArray(parsed.blocks) && parsed.blocks.length) {
          return parsed;
        }
      } catch (err) {
        // If the code area does not contain generated block metadata, fall back
        // to the current block graph instead of failing Play Mode.
        logConsole('warn', 'Block play runtime using current block graph: ' + err.message);
      }
    }
    return {
      blocks: (BE && Array.isArray(BE.blocks)) ? cloneV4(BE.blocks) : [],
      connections: (BE && Array.isArray(BE.connections)) ? cloneV4(BE.connections) : [],
      nextId: BE?.nextId || 1
    };
  }

  const graph = readGraph();
  const blocks = Array.isArray(graph.blocks) ? graph.blocks : [];
  const connections = Array.isArray(graph.connections) ? graph.connections : [];
  const byId = Object.fromEntries(blocks.map(b => [String(b.id), b]));
  const downstream = {};
  const incoming = new Set();
  connections.forEach(c => {
    if (!downstream[c.from]) downstream[c.from] = [];
    downstream[c.from].push(c);
    incoming.add(c.to);
  });

  const TRIGGERS = new Set(['On Key Press','On Key Release','On Click','On Timer','On Event','On Trigger Enter','On Trigger Exit','On Collision']);
  const roots = blocks.filter(b => !incoming.has(b.id));

  function paramsOf(block){
    const out = {};
    (block.params || []).forEach(p => out[p.k] = p.v);
    return out;
  }
  function num(v, def=0){
    if (v === undefined || v === null || v === '') return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  }
  function bool(v, def=false){
    if (v === true || v === 'true') return true;
    if (v === false || v === 'false') return false;
    return def;
  }
  function normKey(k){
    const s = String(k || '').toLowerCase();
    if (s === 'space') return ' ';
    if (s === 'arrowup' || s === 'up') return 'ArrowUp';
    if (s === 'arrowdown' || s === 'down') return 'ArrowDown';
    if (s === 'arrowleft' || s === 'left') return 'ArrowLeft';
    if (s === 'arrowright' || s === 'right') return 'ArrowRight';
    if (s === 'enter') return 'Enter';
    if (s === 'escape' || s === 'esc') return 'Escape';
    return String(k || '');
  }
  function resolveObject(target){
    const t = String(target || '').trim();
    const objs = STATE.objects || [];
    if (t) {
      return objs.find(o => String(o.id) === t || o.name === t || o.tag === t || o.spriteSrc === t) || null;
    }
    return objs.find(o => o.id === STATE.selectedId && o.type !== 'camera') ||
           objs.find(o => o.type === 'sprite') ||
           objs.find(o => o.type !== 'camera') ||
           null;
  }
  function showFloatingText(text, x, y, color, size){
    if (!STATE._playTexts) STATE._playTexts = [];
    STATE._playTexts.push({ text:String(text || ''), x:num(x,20), y:num(y,30), color:color || '#ffffff', size:num(size,16), life:90 });
  }

  async function runChain(blockId, event, visited){
    const key = String(blockId);
    if (visited.has(key)) return;
    visited.add(key);
    const block = byId[key];
    if (!block) return;
    await executeBlock(block, event);
    const outs = downstream[block.id] || downstream[String(block.id)] || [];
    for (const conn of outs) {
      await runChain(conn.to, event, new Set(visited));
    }
  }

  async function runConnectedFrom(block, event){
    const outs = downstream[block.id] || downstream[String(block.id)] || [];
    for (const conn of outs) {
      await runChain(conn.to, event, new Set([String(block.id)]));
    }
  }

  async function executeBlock(block, event){
    const p = paramsOf(block);
    const obj = resolveObject(p.target || p.obj || p.source);
    switch (block.type) {
      // ── Transform ─────────────────────────────────────────────
      case 'Move To': if(obj){ obj.x=num(p.x,obj.x); obj.y=num(p.y,obj.y); } break;
      case 'Move By': if(obj){ obj.x+=num(p.dx,0); obj.y+=num(p.dy,0); } break;
      case 'Rotate': if(obj){ obj.rot=(obj.rot||0)+num(p.deg,0); } break;
      case 'Rotate To': if(obj){ obj.rot=num(p.deg,0); } break;
      case 'Scale': if(obj){ obj.scaleX=num(p.x,1); obj.scaleY=num(p.y,1); obj.w=(obj.baseW||obj.w||48)*Math.abs(obj.scaleX); obj.h=(obj.baseH||obj.h||48)*Math.abs(obj.scaleY); } break;
      case 'Set Size': if(obj){ obj.w=num(p.w,obj.w||48); obj.h=num(p.h,obj.h||48); } break;
      case 'Set Visible': if(obj){ obj.visible=bool(p.visible,true); } break;
      case 'Set Opacity': if(obj){ obj.opacity=num(p.val,1); } break;
      case 'Set Tint':
      case 'Use Color': if(obj && p.color){ obj.color=p.color; } break;

      // ── Simple physics for Play Mode preview ──────────────────
      case 'Set Velocity': if(obj){ obj.vx=num(p.x,0); obj.vy=num(p.y,0); } break;
      case 'Apply Force': if(obj){ obj.vx=(obj.vx||0)+num(p.x,0)*0.016; obj.vy=(obj.vy||0)+num(p.y,0)*0.016; } break;
      case 'Apply Impulse': if(obj){ obj.vx=(obj.vx||0)+num(p.x,0)*0.08; obj.vy=(obj.vy||0)+num(p.y,0)*0.08; } break;
      case 'Stop Movement': if(obj){ obj.vx=0; obj.vy=0; } break;
      case 'Add Gravity':
      case 'Set Gravity': STATE._playGravity=num(p.g,9.8); break;

      // ── Canvas drawing blocks draw directly to the play canvas ──
      case 'Clear': playCtx.fillStyle=p.color || '#0d0f18'; playCtx.fillRect(0,0,W,H); break;
      case 'Fill Rect': playCtx.fillStyle=p.color || '#ffffff'; playCtx.fillRect(num(p.x),num(p.y),num(p.w,100),num(p.h,100)); break;
      case 'Draw Line': playCtx.strokeStyle=p.color || p.stroke || '#ffffff'; playCtx.lineWidth=num(p.width,2); playCtx.beginPath(); playCtx.moveTo(num(p.x1),num(p.y1)); playCtx.lineTo(num(p.x2),num(p.y2)); playCtx.stroke(); break;
      case 'Draw Circle': playCtx.fillStyle=p.color || '#ffffff'; playCtx.beginPath(); playCtx.arc(num(p.x),num(p.y),num(p.r,20),0,Math.PI*2); bool(p.fill,true) ? playCtx.fill() : playCtx.stroke(); break;
      case 'Draw Text':
      case 'Show Text': showFloatingText(p.text, p.x, p.y, p.color, p.size); break;
      case 'Set Text': if(obj){ obj.text=String(p.text || ''); } break;

      // ── Flow ──────────────────────────────────────────────────
      case 'Delay': await new Promise(r => setTimeout(r, num(p.ms,0))); break;
      case 'Loop': {
        const count = Math.max(0, Math.min(1000, num(p.n,1)));
        const outs = downstream[block.id] || [];
        const bodyConns = outs.filter(c => c.fromPort === 'body');
        for (let i=0; i<count; i++) {
          for (const c of bodyConns) await runChain(c.to, event, new Set([String(block.id)]));
        }
        break;
      }
      case 'Run Script': {
        const fnName = String(p.fn || '').trim();
        if (fnName && typeof window[fnName] === 'function') window[fnName]({STATE, keys, dt:1/60, event});
        break;
      }
      case 'Stop Flow': throw new Error('__STOP_FLOW__');
      case 'Emit Event': document.dispatchEvent(new CustomEvent(String(p.event || 'custom'), { detail: p.data || null })); break;

      // ── Audio/Sprite/Camera preview-safe behaviors ────────────
      case 'Play Sound': logConsole('info', '🔊 Play Sound: ' + (p.src || 'sound')); break;
      case 'Stop Sound': logConsole('info', '🔇 Stop Sound: ' + (p.src || 'sound')); break;
      case 'Stop All': logConsole('info', '🔇 Stop all sounds'); break;
      case 'Set Volume': STATE._playVolume=num(p.vol ?? p.volume,1); break;
      case 'Shake': STATE._playShakeFrames=Math.max(1, Math.round(num(p.ms,300)/16)); STATE._playShakeMag=num(p.mag,5); break;
      case 'Set Background': STATE.projectSettings.backgroundColor=p.color || STATE.projectSettings.backgroundColor; break;
      case 'Load Sprite': if(obj && p.src){ obj.spriteSrc=p.src; } break;
      case 'Play Animation': if(obj){ obj.anim=p.anim || 'default'; } break;
      case 'Stop Animation': if(obj){ obj.anim=null; } break;
      case 'Set Frame': if(obj){ obj.frame=num(p.frame,0); } break;
      default:
        // Unknown block types are ignored at runtime instead of breaking play mode.
        break;
    }
  }

  function bindTriggers(){
    roots.filter(b => TRIGGERS.has(b.type)).forEach(block => {
      const p = paramsOf(block);
      if (block.type === 'On Key Press') {
        const wanted = normKey(p.key || p.k || 'Space');
        const handler = e => { if (e.key === wanted || normKey(e.key) === wanted) runConnectedFrom(block, e).catch(err => { if(err.message !== '__STOP_FLOW__') logConsole('error','Block runtime error: '+err.message); }); };
        document.addEventListener('keydown', handler);
        cleanup.push(() => document.removeEventListener('keydown', handler));
      } else if (block.type === 'On Key Release') {
        const wanted = normKey(p.key || p.k || 'Space');
        const handler = e => { if (e.key === wanted || normKey(e.key) === wanted) runConnectedFrom(block, e).catch(err => { if(err.message !== '__STOP_FLOW__') logConsole('error','Block runtime error: '+err.message); }); };
        document.addEventListener('keyup', handler);
        cleanup.push(() => document.removeEventListener('keyup', handler));
      } else if (block.type === 'On Click') {
        const handler = e => runConnectedFrom(block, e).catch(err => { if(err.message !== '__STOP_FLOW__') logConsole('error','Block runtime error: '+err.message); });
        playCanvas.addEventListener('mousedown', handler);
        cleanup.push(() => playCanvas.removeEventListener('mousedown', handler));
      } else if (block.type === 'On Timer') {
        const ms = Math.max(1, num(p.ms,1000));
        const id = setInterval(() => runConnectedFrom(block, {type:'timer'}).catch(err => { if(err.message !== '__STOP_FLOW__') logConsole('error','Block runtime error: '+err.message); }), ms);
        timers.push(id);
      } else if (block.type === 'On Event') {
        const eventName = String(p.event || 'custom');
        const handler = e => runConnectedFrom(block, e).catch(err => { if(err.message !== '__STOP_FLOW__') logConsole('error','Block runtime error: '+err.message); });
        document.addEventListener(eventName, handler);
        cleanup.push(() => document.removeEventListener(eventName, handler));
      }
    });
  }

  function runStandaloneRoots(){
    roots.filter(b => !TRIGGERS.has(b.type)).forEach(b => {
      runChain(b.id, {type:'play-start'}, new Set()).catch(err => {
        if (err.message !== '__STOP_FLOW__') logConsole('error','Block runtime error: '+err.message);
      });
    });
  }

  function update(dt){
    // Lightweight physics integration for blocks that set velocity/force/gravity.
    const g = Number.isFinite(STATE._playGravity) ? STATE._playGravity : 0;
    (STATE.objects || []).forEach(o => {
      if (!o || o.type === 'camera') return;
      if (g && o.vy !== undefined) o.vy += g * dt;
      if (o.vx) o.x += o.vx * dt;
      if (o.vy) o.y += o.vy * dt;
    });
  }

  function drawOverlays(){
    // Draw transient text created by Show Text / Draw Text blocks after objects,
    // so generated block text appears on top of gameplay.
    if (STATE._playTexts && STATE._playTexts.length) {
      STATE._playTexts = STATE._playTexts.filter(t => t.life-- > 0);
      STATE._playTexts.forEach(t => {
        playCtx.fillStyle = t.color || '#ffffff';
        playCtx.font = (t.size || 16) + 'px sans-serif';
        playCtx.fillText(t.text, t.x, t.y);
      });
    }
  }

  bindTriggers();
  runStandaloneRoots();
  logConsole('success', '▶ Block-generated code runtime attached: ' + blocks.length + ' block(s), ' + connections.length + ' connection(s)');

  return {
    update,
    drawOverlays,
    cleanup(){
      cleanup.forEach(fn => { try{ fn(); }catch(_){} });
      timers.forEach(id => clearInterval(id));
      STATE._playTexts = [];
      STATE._playGravity = 0;
    }
  };
}

function runGame(){
  if(STATE.running) return;
  STATE.running=true;
  // Keep the code editor in sync with the current block graph right before
  // Play Mode starts, so the runtime executes the latest generated block code.
  try { if (typeof syncCodeFromBlocksV4 === 'function' && BE && BE.blocks && BE.blocks.length) syncCodeFromBlocksV4('play mode'); } catch(_) {}

  // Build overlay
  let overlay=document.getElementById('play-overlay');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.id='play-overlay';
    overlay.style.cssText='position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;';
    const bar=document.createElement('div');
    bar.style.cssText='position:absolute;top:0;left:0;right:0;height:36px;background:rgba(0,0,0,.85);display:flex;align-items:center;padding:0 14px;gap:10px;z-index:2;border-bottom:1px solid #252a3a;';
    bar.innerHTML='<span style="font-family:var(--ui);font-size:11px;font-weight:700;letter-spacing:2px;color:#00d4ff">▶ PLAY MODE</span><span id="play-runtime-status" style="font-size:10px;color:#22c55e;font-family:var(--mono)">BLOCK CODE ENABLED</span><span style="flex:1"></span><button id="play-stop-btn" style="padding:4px 16px;font-size:11px;font-weight:600;font-family:var(--ui);background:rgba(239,68,68,.15);border:1px solid #ef4444;color:#ef4444;border-radius:4px;cursor:pointer;letter-spacing:1px" onclick="stopGame()">■ STOP</button><kbd style="font-size:10px;color:#6b7280;font-family:var(--mono)">Esc to stop</kbd>';
    overlay.appendChild(bar);
    const gameWrap=document.createElement('div');
    gameWrap.id='play-game-wrap';
    gameWrap.style.cssText='position:relative;margin-top:36px;display:flex;align-items:center;justify-content:center;width:100%;height:calc(100% - 36px);';
    const playCanvas=document.createElement('canvas');
    playCanvas.id='play-canvas';
    const canvasW=vpCanvas.width||800, canvasH=vpCanvas.height||450;
    playCanvas.width=canvasW; playCanvas.height=canvasH;
    const scaleX=(window.innerWidth)/canvasW, scaleY=(window.innerHeight-36)/canvasH;
    const scale=Math.min(scaleX,scaleY,2);
    playCanvas.style.cssText=\`display:block;image-rendering:pixelated;box-shadow:0 0 60px rgba(0,0,0,.9);transform:scale(\${scale});transform-origin:center center;\`;
    gameWrap.appendChild(playCanvas);
    overlay.appendChild(gameWrap);
    document.body.appendChild(overlay);
  } else {
    overlay.style.display='flex';
  }

  const playCanvas=document.getElementById('play-canvas');
  const playCtx=playCanvas.getContext('2d');
  const W=playCanvas.width, H=playCanvas.height;
  const keys={};
  const keyDown=e=>{ keys[e.key]=true; if(e.key !== 'Escape') e.preventDefault(); };
  const keyUp=e=>{ keys[e.key]=false; };
  document.addEventListener('keydown',keyDown);
  document.addEventListener('keyup',keyUp);
  const escStop=e=>{ if(e.key==='Escape') stopGame(); };
  document.addEventListener('keydown',escStop);

  // Snapshot object positions for restoration on stop
  STATE._playSnapshot=JSON.stringify(STATE.objects);

  let blockPlayRuntime=null;
  try {
    blockPlayRuntime = createBlockCodePlayRuntimeV17({playCanvas, playCtx, keys, W, H});
  } catch(err) {
    logConsole('error','Block code runtime failed to start: '+(err && err.message ? err.message : err));
  }

  STATE._playCleanup=()=>{
    document.removeEventListener('keydown',keyDown);
    document.removeEventListener('keyup',keyUp);
    document.removeEventListener('keydown',escStop);
    if(blockPlayRuntime && typeof blockPlayRuntime.cleanup === 'function') blockPlayRuntime.cleanup();
  };

  // Build per-object script runners from attached scripts. These still work,
  // but they now run alongside block-generated gameplay code.
  const scriptRunners=[];
  STATE.objects.forEach(obj=>{
    if(!obj.script) return;
    const code=SCRIPT_STORE[obj.script];
    if(!code) return;
    try{
      const fn=new Function('self','keys','dt','logConsole','STATE','ctx', code.split('\\n').filter(l=>!/^\s*import\b/.test(l)).join('\\n')+'\\n');
      scriptRunners.push({obj, fn});
      logConsole('info',\`Script running: \${obj.script} on \${obj.name}\`);
    }catch(err){ logConsole('error',\`Script error in \${obj.script}: \${err.message}\`); }
  });

  let lastFrame=performance.now();
  function playLoop(){
    if(!STATE.running) return;
    const now=performance.now();
    const dt=Math.min(0.05, (now-lastFrame)/1000 || 1/60);
    lastFrame=now;

    playCtx.clearRect(0,0,W,H);
    playCtx.fillStyle=STATE.projectSettings?.backgroundColor || (STATE.mode==='3d'?'#0a0d14':'#0d0f18');
    playCtx.fillRect(0,0,W,H);

    if(STATE.mode==='3d') draw3DScene(playCtx,W,H);
    else {
      scriptRunners.forEach(({obj,fn})=>{
        try{ fn(obj,keys,dt,logConsole,STATE,playCtx); }catch(err){ logConsole('error','Script runtime error: '+err.message); }
      });

      // Update block-generated gameplay before rendering scene objects.
      if(blockPlayRuntime && typeof blockPlayRuntime.update === 'function') {
        try { blockPlayRuntime.update(dt); } catch(err) { logConsole('error','Block runtime update error: '+err.message); }
      }

      const sorted=[...STATE.objects].sort((a,b)=>(a.z||0)-(b.z||0));
      sorted.forEach(obj=>{
        if(!obj.visible) return;
        playCtx.save();
        if(STATE._playShakeFrames>0){
          const mag=STATE._playShakeMag||4;
          playCtx.translate((Math.random()-.5)*mag,(Math.random()-.5)*mag);
          STATE._playShakeFrames--;
        }
        playCtx.translate(obj.x,obj.y);
        if(obj.rot) playCtx.rotate(obj.rot*Math.PI/180);
        if(obj.opacity !== undefined) playCtx.globalAlpha=Math.max(0,Math.min(1,+obj.opacity));
        if(obj.type==='camera'){ playCtx.restore(); return; }
        if(obj.type==='trigger'){ playCtx.restore(); return; }
        if(obj.type==='sprite'){
          if(obj.pixelDataURL){
            const img=_spriteImageCache[obj.pixelDataURL];
            if(img){ playCtx.imageSmoothingEnabled=false; playCtx.drawImage(img,-obj.w/2,-obj.h/2,obj.w,obj.h); }
            else { getSpriteImage(obj.pixelDataURL,()=>{}); playCtx.fillStyle=obj.color; playCtx.fillRect(-obj.w/2,-obj.h/2,obj.w,obj.h); }
          } else {
            playCtx.fillStyle=obj.color;
            playCtx.fillRect(-obj.w/2,-obj.h/2,obj.w,obj.h);
            playCtx.fillStyle='rgba(255,255,255,.15)';
            playCtx.fillRect(-obj.w/2+4,-obj.h/2+4,obj.w-8,obj.h/2-8);
          }
        } else if(obj.type==='shape'){
          playCtx.fillStyle=obj.color;
          playCtx.fillRect(-obj.w/2,-obj.h/2,obj.w,obj.h);
        } else if(obj.type==='light'){
          const g=playCtx.createRadialGradient(0,0,0,0,0,obj.w/2);
          g.addColorStop(0,'rgba(255,220,120,.35)');g.addColorStop(1,'transparent');
          playCtx.fillStyle=g;playCtx.beginPath();playCtx.arc(0,0,obj.w/2,0,Math.PI*2);playCtx.fill();
        } else if(obj.type==='particles'){
          for(let i=0;i<8;i++){
            const px=(Math.random()-.5)*obj.w,py=(Math.random()-.5)*obj.h;
            playCtx.fillStyle=\`hsla(\${Math.random()*60+30},100%,70%,\${Math.random()*.7+.3})\`;
            playCtx.beginPath();playCtx.arc(px,py,Math.random()*3+1,0,Math.PI*2);playCtx.fill();
          }
        } else if(obj.text){
          playCtx.fillStyle=obj.color||'#fff'; playCtx.font=(obj.size||16)+'px sans-serif'; playCtx.fillText(obj.text,0,0);
        } else {
          playCtx.fillStyle=obj.color||'#555';
          playCtx.fillRect(-obj.w/2,-obj.h/2,obj.w,obj.h);
        }
        playCtx.restore();
      });

      // Draw transient text after objects, so Show Text blocks appear on top.
      if(blockPlayRuntime && typeof blockPlayRuntime.drawOverlays === 'function') {
        try { blockPlayRuntime.drawOverlays(); } catch(err) { logConsole('error','Block runtime overlay error: '+err.message); }
      }
    }
    STATE.frameCount++;
    animFrame=requestAnimationFrame(playLoop);
  }
  playLoop();
  logConsole('success','▶ Play mode running block-generated code plus attached scripts.');
  setStatusMsg('▶ Playing block code');
  const runBtn=document.getElementById('run-btn');
  if(runBtn){ runBtn.style.background='rgba(239,68,68,.15)'; runBtn.style.borderColor='var(--danger)'; runBtn.style.color='var(--danger)'; }
}

function stopGame(){
  if(!STATE.running) return;
  STATE.running=false;
  cancelAnimationFrame(animFrame);
  // Restore object positions
  if(STATE._playSnapshot){ try{ STATE.objects=JSON.parse(STATE._playSnapshot); STATE._playSnapshot=null; }catch(_){} }
  STATE._playCleanup?.(); STATE._playCleanup=null;
  // Hide overlay
  const overlay=document.getElementById('play-overlay');
  if(overlay) overlay.style.display='none';
  // Reset run button
  const runBtn=document.getElementById('run-btn');
  if(runBtn) runBtn.style.cssText='';
  renderViewport(); buildHierarchy(); updateStatusBar();
  logConsole('warn','■ Play mode stopped');
  setStatusMsg('Stopped');
}
let animFrame;

// ═══════════════════════════════════════════════════════
//  STATUS / CONSOLE
// ═══════════════════════════════════════════════════════
function updateStatusBar(){
  document.getElementById('sb-objects').textContent=STATE.objects.length;
  const obj=STATE.objects.find(o=>o.id===STATE.selectedId);
  if(obj)setStatusMsg(\`Selected: \${obj.name}\`);
}
function setStatusMsg(msg){document.getElementById('sb-msg').textContent=msg;}

let conMsgs=0;
function logConsole(type,msg){
  const out=document.getElementById('console-output');
  const now=new Date();
  const ts=\`\${now.getHours().toString().padStart(2,'0')}:\${now.getMinutes().toString().padStart(2,'0')}:\${now.getSeconds().toString().padStart(2,'0')}\`;
  const div=document.createElement('div');
  div.className=\`con-line con-\${type}\`;
  div.innerHTML=\`<span class="con-prefix">[\${ts}]</span>\${msg}\`;
  out.appendChild(div);
  out.scrollTop=out.scrollHeight;
  conMsgs++;
  document.getElementById('con-count').textContent=\`\${conMsgs} message\${conMsgs>1?'s':''}\`;
}
function clearConsole(){
  document.getElementById('console-output').innerHTML='';
  conMsgs=0;document.getElementById('con-count').textContent='0 messages';
}
let consoleOpen=true;
function toggleConsole(){
  const out=document.getElementById('console-output');
  consoleOpen=!consoleOpen;out.style.display=consoleOpen?'flex':'none';
  document.querySelector('.console-header span').textContent=(consoleOpen?'▼':'▶')+' CONSOLE';
}

// FPS
function startFpsCounter(){
  setInterval(()=>{
    const now=performance.now();
    const elapsed=(now-STATE.lastFpsTime)/1000;
    STATE.fps=Math.round(STATE.frameCount/elapsed);
    if(STATE.running)document.getElementById('sb-fps').textContent=STATE.fps||60;
    STATE.frameCount=0;STATE.lastFpsTime=now;
  },1000);
}

// ═══════════════════════════════════════════════════════
//  MODALS
// ═══════════════════════════════════════════════════════
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
document.querySelectorAll('.modal-overlay').forEach(m=>{
  m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');});
});

// init color preview
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('pe-color-preview').style.background=PE.color;
});




// ═══════════════════════════════════════════════════════
//  FORGE PATCH V3: reliable tab click routing, drag-to-connect lines, contextual edit history
// ═══════════════════════════════════════════════════════
const V3 = { bound:false, codeUndo:[], codeRedo:[], blockUndo:[], blockRedo:[], max:80, connecting:null, previewPath:null, hoverTarget:null };
function safeEl(id){ return document.getElementById(id); }
function activeEditorContext(){
  const ae=document.activeElement;
  if(ae && ae.id==='code-area') return 'code';
  if(ae && (ae.closest?.('#left-panel'))) return 'left';
  if(ae && (ae.closest?.('#right-panel'))) return 'right';
  return STATE.editorTab || 'viewport';
}
function bindForgeV3(){
  if(V3.bound) return; V3.bound=true;
  const tabMap=[['ltab-assets','assets'],['ltab-libs','libs'],['ltab-props','props']];
  tabMap.forEach(([id,tab])=>{ const el=safeEl(id); if(el) el.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();setLeftTab(tab);},true); });
  [['rtab-scene','scene'],['rtab-inspect','inspect']].forEach(([id,tab])=>{ const el=safeEl(id); if(el) el.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();setRightTab(tab);},true); });
  [['etab-viewport','viewport'],['etab-blocks','blocks'],['etab-code','code'],['etab-pixels','pixels']].forEach(([id,tab])=>{ const el=safeEl(id); if(el) el.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();setEditorTab(tab);},true); });
  const ta=safeEl('code-area');
  if(ta){ V3.codeUndo=[ta.value]; ta.addEventListener('input',()=>{ const last=V3.codeUndo[V3.codeUndo.length-1]; if(last!==ta.value){V3.codeUndo.push(ta.value); if(V3.codeUndo.length>V3.max)V3.codeUndo.shift(); V3.codeRedo=[];} }, false); }
  const editItems=[...document.querySelectorAll('#dd-edit .dd-item')];
  editItems.forEach(item=>{
    const txt=item.textContent.toLowerCase();
    if(txt.includes('undo')) item.onclick=(e)=>{e.stopPropagation();undo();};
    if(txt.includes('redo')) item.onclick=(e)=>{e.stopPropagation();redo();};
    if(txt.includes('cut')) item.onclick=(e)=>{e.stopPropagation();contextEdit('cut');};
    if(txt.includes('copy')) item.onclick=(e)=>{e.stopPropagation();contextEdit('copy');};
    if(txt.includes('paste')) item.onclick=(e)=>{e.stopPropagation();contextEdit('paste');};
  });
  document.addEventListener('mousemove', onBlockConnectMove, true);
  document.addEventListener('mouseup', onBlockConnectEnd, true);
}
function setLeftTab(tab){
  STATE.leftTab=tab;
  ['assets','libs','props'].forEach(t=>{
    const tabEl=safeEl('ltab-'+t), panel=safeEl('lpanel-'+t);
    if(tabEl) tabEl.classList.toggle('active', t===tab);
    if(panel){ panel.classList.toggle('hidden', t!==tab); panel.style.display=t===tab?'block':'none'; }
  });
  if(tab==='assets') buildAssetTree();
  if(tab==='libs') buildLibList();
  if(tab==='props') renderPropsFor(STATE.objects.find(o=>o.id===STATE.selectedId)||null);
  setStatusMsg(\`Left tab: \${tab.toUpperCase()}\`);
}
function setRightTab(tab){
  STATE.rightTab=tab;
  ['scene','inspect'].forEach(t=>{
    const tabEl=safeEl('rtab-'+t), panel=safeEl('rpanel-'+t);
    if(tabEl) tabEl.classList.toggle('active', t===tab);
    if(panel){ panel.classList.toggle('hidden', t!==tab); panel.style.display=t===tab?'block':'none'; }
  });
  if(tab==='scene') buildHierarchy();
  if(tab==='inspect') renderInspect();
}
function setEditorTab(tab){
  STATE.editorTab=tab;
  const panels={viewport:'viewport',blocks:'block-editor',code:'code-editor',pixels:'pixel-editor'};
  Object.keys(panels).forEach(t=>{
    safeEl('etab-'+t)?.classList.toggle('active', t===tab);
    safeEl(panels[t])?.classList.toggle('hidden', t!==tab);
  });
  if(tab==='blocks') renderBlockEditor();
  if(tab==='code'){refreshCodeHighlight();syncScroll();safeEl('code-area')?.focus();}
  if(tab==='pixels') drawPeCanvas();
  if(tab==='viewport') renderViewport();
}
function snapshotBlocks(){
  V3.blockUndo.push(JSON.stringify({blocks:BE.blocks,connections:BE.connections,nextId:BE.nextId}));
  if(V3.blockUndo.length>V3.max) V3.blockUndo.shift();
  V3.blockRedo=[];
}
function restoreBlocks(serialized){
  const data=JSON.parse(serialized);
  BE.blocks=data.blocks||[]; BE.connections=data.connections||[]; BE.nextId=data.nextId||1; BE.selected=null; renderBlockEditor();
}
function undo(){
  const ctx=activeEditorContext();
  if(ctx==='code'){
    const ta=safeEl('code-area'); if(!ta||V3.codeUndo.length<2) return;
    V3.codeRedo.push(V3.codeUndo.pop()); ta.value=V3.codeUndo[V3.codeUndo.length-1]; refreshCodeHighlight(); updateCursor(); logConsole('info','Undo code edit'); return;
  }
  if(ctx==='blocks'){
    if(!V3.blockUndo.length) return;
    V3.blockRedo.push(JSON.stringify({blocks:BE.blocks,connections:BE.connections,nextId:BE.nextId})); restoreBlocks(V3.blockUndo.pop()); logConsole('info','Undo block edit'); return;
  }
  if(!STATE.undoStack.length)return;
  STATE.redoStack.push(JSON.stringify(STATE.objects)); STATE.objects=JSON.parse(STATE.undoStack.pop()); buildHierarchy(); renderViewport(); updateStatusBar(); logConsole('info','Undo scene edit');
}
function redo(){
  const ctx=activeEditorContext();
  if(ctx==='code'){
    const ta=safeEl('code-area'); if(!ta||!V3.codeRedo.length) return;
    const next=V3.codeRedo.pop(); V3.codeUndo.push(next); ta.value=next; refreshCodeHighlight(); updateCursor(); logConsole('info','Redo code edit'); return;
  }
  if(ctx==='blocks'){
    if(!V3.blockRedo.length) return;
    V3.blockUndo.push(JSON.stringify({blocks:BE.blocks,connections:BE.connections,nextId:BE.nextId})); restoreBlocks(V3.blockRedo.pop()); logConsole('info','Redo block edit'); return;
  }
  if(!STATE.redoStack.length)return;
  STATE.undoStack.push(JSON.stringify(STATE.objects)); STATE.objects=JSON.parse(STATE.redoStack.pop()); buildHierarchy(); renderViewport(); updateStatusBar(); logConsole('info','Redo scene edit');
}
function contextEdit(action){
  const ctx=activeEditorContext();
  if(ctx==='code') return codeEdit(action);
  if(ctx==='blocks') return blockEdit(action);
  if(ctx==='viewport') return viewportEdit(action);
  setStatusMsg(\`\${action.toUpperCase()} only affects focused editor\`);
}
function editAction(action){ return contextEdit(action); }
function codeEdit(action){
  const ta=safeEl('code-area'); if(!ta) return;
  const s=ta.selectionStart, e=ta.selectionEnd, selected=ta.value.slice(s,e);
  if(action==='copy' && selected && navigator.clipboard) navigator.clipboard.writeText(selected);
  if(action==='cut' && selected){ V3.codeUndo.push(ta.value); if(navigator.clipboard) navigator.clipboard.writeText(selected); ta.value=ta.value.slice(0,s)+ta.value.slice(e); ta.selectionStart=ta.selectionEnd=s; refreshCodeHighlight(); updateCursor(); }
  if(action==='paste'){ logConsole('info','Use Ctrl+V inside Code Editor to paste from clipboard.'); ta.focus(); }
  setStatusMsg(\`Code \${action}\`);
}
function blockEdit(action){
  if(action==='copy'){ if(BE.selected){ localStorage.setItem('forge.block.copy', JSON.stringify(BE.blocks.find(b=>b.id===BE.selected))); logConsole('info','Copied selected block'); } return; }
  if(action==='cut'){ if(BE.selected){ snapshotBlocks(); deleteSelected(); logConsole('info','Cut selected block'); } return; }
  if(action==='paste'){
    const raw=localStorage.getItem('forge.block.copy'); if(!raw) return;
    snapshotBlocks(); const b=JSON.parse(raw); BE.nextId=Math.max(BE.nextId,...BE.blocks.map(x=>x.id+1),1); b.id=BE.nextId++; b.x+=30; b.y+=30; BE.blocks.push(b); renderBlockEditor(); logConsole('info','Pasted block'); return;
  }
}
function viewportEdit(action){
  if(action==='copy'){ const obj=STATE.objects.find(o=>o.id===STATE.selectedId); if(obj){ localStorage.setItem('forge.object.copy', JSON.stringify(obj)); logConsole('info','Copied selected object'); } return; }
  if(action==='cut'){ if(STATE.selectedId){ deleteObject(STATE.selectedId); logConsole('info','Cut selected object'); } return; }
  if(action==='paste'){
    const raw=localStorage.getItem('forge.object.copy'); if(!raw) return;
    pushUndo(); const obj=JSON.parse(raw); obj.id=STATE.nextId++; obj.name=obj.name+' Copy'; obj.x+=30; obj.y+=30; STATE.objects.push(obj); selectObject(obj.id); buildHierarchy(); renderViewport(); updateStatusBar(); logConsole('info','Pasted object'); return;
  }
}
function blockDefFor(block){ return findBlockDef(block.cat, block.type) || {ports:block.ports||{in:[],out:[]}}; }
function canConnectPorts(from, to){
  if(!from||!to) return false;
  if(from.blockId===to.blockId) return false;
  if(from.dir===to.dir) return false;
  const out = from.dir==='out' ? from : to;
  const inn = from.dir==='in' ? from : to;
  const inBlock=BE.blocks.find(b=>b.id===inn.blockId);
  const outBlock=BE.blocks.find(b=>b.id===out.blockId);
  if(!inBlock||!outBlock) return false;
  const inPorts=(blockDefFor(inBlock).ports?.in||[]);
  const outPorts=(blockDefFor(outBlock).ports?.out||[]);
  if(!inPorts.includes(inn.port) || !outPorts.includes(out.port)) return false;
  return !BE.connections.some(c=>c.to===inn.blockId && c.toPort===inn.port && c.from===out.blockId && c.fromPort===out.port);
}
function normalizeConnection(a,b){
  const from=a.dir==='out'?a:b;
  const to=a.dir==='in'?a:b;
  return {from:from.blockId,fromPort:from.port,to:to.blockId,toPort:to.port};
}
function bePointFromEvent(e){
  const canvas=safeEl('be-canvas'); const r=canvas.getBoundingClientRect();
  return {x:e.clientX-r.left,y:e.clientY-r.top};
}
function connectorPoint(el){
  const canvas=safeEl('be-canvas'); const cr=canvas.getBoundingClientRect(); const r=el.getBoundingClientRect();
  return {x:r.left-cr.left+r.width/2,y:r.top-cr.top+r.height/2};
}
function makeBezier(a,b){ const cp=Math.max(55,Math.abs(b.x-a.x)*0.5); return \`M\${a.x},\${a.y} C\${a.x+cp},\${a.y} \${b.x-cp},\${b.y} \${b.x},\${b.y}\`; }
function updateConnectorAvailability(start){
  document.querySelectorAll('.be-connector').forEach(el=>{
    const target={blockId:+el.dataset.block, port:el.dataset.port, dir:el.dataset.dir};
    const valid=canConnectPorts(start,target);
    el.classList.toggle('valid-target',valid);
    el.classList.toggle('invalid-target',!valid && !(target.blockId===start.blockId&&target.port===start.port&&target.dir===start.dir));
  });
}
function clearConnectorAvailability(){ document.querySelectorAll('.be-connector').forEach(el=>el.classList.remove('valid-target','invalid-target','connecting')); }
function beginBlockConnection(e,blockId,port,dir){
  e.preventDefault(); e.stopPropagation();
  const el=e.currentTarget; const startPt=connectorPoint(el);
  V3.connecting={blockId,port,dir,startPt,lastPt:startPt};
  el.classList.add('connecting'); updateConnectorAvailability(V3.connecting);
  const svg=safeEl('be-svg'); if(svg){ V3.previewPath=document.createElementNS('http://www.w3.org/2000/svg','path'); V3.previewPath.setAttribute('class','be-preview-invalid'); V3.previewPath.setAttribute('d',makeBezier(startPt,startPt)); svg.appendChild(V3.previewPath); }
}
function onBlockConnectMove(e){
  if(!V3.connecting) return;
  const pt=bePointFromEvent(e); V3.connecting.lastPt=pt;
  const over=e.target?.classList?.contains('be-connector') ? e.target : null;
  let endPt=pt, valid=false;
  if(over){
    const target={blockId:+over.dataset.block,port:over.dataset.port,dir:over.dataset.dir};
    valid=canConnectPorts(V3.connecting,target); if(valid) endPt=connectorPoint(over); V3.hoverTarget=valid?target:null;
  } else V3.hoverTarget=null;
  if(V3.previewPath){ V3.previewPath.setAttribute('class',valid?'be-preview-valid':'be-preview-invalid'); V3.previewPath.setAttribute('d',makeBezier(V3.connecting.startPt,endPt)); }
}
function onBlockConnectEnd(e){
  if(!V3.connecting) return;
  const over=e.target?.classList?.contains('be-connector') ? e.target : null;
  if(over){
    const target={blockId:+over.dataset.block,port:over.dataset.port,dir:over.dataset.dir};
    if(canConnectPorts(V3.connecting,target)){
      snapshotBlocks(); const c=normalizeConnection(V3.connecting,target);
      BE.connections=BE.connections.filter(x=>!(x.to===c.to&&x.toPort===c.toPort)); BE.connections.push(c);
      logConsole('success',\`Connected \${c.fromPort} → \${c.toPort}\`);
    } else logConsole('warn','Invalid connection: connect an output to an input on a different block.');
  }
  V3.previewPath?.remove(); V3.previewPath=null; V3.connecting=null; V3.hoverTarget=null; clearConnectorAvailability(); renderBlockEditor();
}
function renderBlockEditor(){
  const canvas=safeEl('be-canvas'), svg=safeEl('be-svg'); if(!canvas||!svg) return;
  canvas.innerHTML=''; svg.innerHTML=''; const W=canvas.offsetWidth||1200,H=canvas.offsetHeight||800; svg.setAttribute('viewBox',\`0 0 \${W} \${H}\`);
  BE.blocks.forEach(block=>{
    const def=blockDefFor(block); const catColor=BLOCK_DEFS[block.cat]?.color||'#888'; const catBg=BLOCK_DEFS[block.cat]?.bg||'rgba(128,128,128,.12)';
    const el=document.createElement('div'); el.className='be-block'+((typeof beIsSelected==='function'?beIsSelected(block.id):block.id===BE.selected)?' selected':''); el.id=\`be-block-\${block.id}\`; el.style.cssText=\`left:\${block.x}px;top:\${block.y}px\`;
    el.innerHTML=\`<div class="be-block-header" style="background:\${catBg}"><span class="be-block-cat" style="background:\${catColor}20;color:\${catColor};border:1px solid \${catColor}40">\${block.cat}</span><span class="be-block-title">\${block.type}</span></div><div class="be-block-body">
      \${(def.ports?.in||[]).map(p=>\`<div class="be-port-row"><div class="be-port in"><div class="be-connector\${isPortConnected(block.id,p,'in')?' connected':''}" data-block="\${block.id}" data-port="\${p}" data-dir="in"></div><span style="font-size:10px;color:var(--text2)">\${p}</span></div></div>\`).join('')}
      \${(def.ports?.out||[]).map(p=>\`<div class="be-port-row"><div class="be-port out" style="margin-left:auto"><span style="font-size:10px;color:var(--text2)">\${p}</span><div class="be-connector\${isPortConnected(block.id,p,'out')?' connected':''}" data-block="\${block.id}" data-port="\${p}" data-dir="out"></div></div></div>\`).join('')}
      \${(block.params||[]).map(param=>\`<div class="be-param"><span class="be-param-label">\${param.k}</span><input class="be-param-input" value="\${String(param.v).replace(/"/g,'&quot;')}" oninput="setBlockParam(\${block.id},'\${param.k}',this.value)" onclick="event.stopPropagation()"/></div>\`).join('')}
    </div>\`;
    el.querySelector('.be-block-header').addEventListener('mousedown', e=>{ e.stopPropagation(); snapshotBlocks(); BE.selected=block.id; const rect=el.getBoundingClientRect(); const cRect=canvas.getBoundingClientRect(); BE.dragging=block; BE.dragOffX=e.clientX-rect.left; BE.dragOffY=e.clientY-rect.top; renderBlockEditor(); });
    el.addEventListener('mousedown', e=>{ BE.selected=block.id; renderBlockEditor(); });
    canvas.appendChild(el);
  });
  canvas.querySelectorAll('.be-connector').forEach(conn=>conn.addEventListener('mousedown',e=>beginBlockConnection(e,+conn.dataset.block,conn.dataset.port,conn.dataset.dir)));
  BE.connections.forEach(conn=>{
    const fromEl=canvas.querySelector(\`#be-block-\${conn.from} .be-connector[data-port="\${conn.fromPort}"][data-dir="out"]\`);
    const toEl=canvas.querySelector(\`#be-block-\${conn.to} .be-connector[data-port="\${conn.toPort}"][data-dir="in"]\`);
    if(!fromEl||!toEl) return; const a=connectorPoint(fromEl), b=connectorPoint(toEl);
    const hit=document.createElementNS('http://www.w3.org/2000/svg','path'); hit.setAttribute('d',makeBezier(a,b)); hit.setAttribute('class','be-connection-hit'); hit.addEventListener('dblclick',()=>{snapshotBlocks();BE.connections=BE.connections.filter(c=>c!==conn);renderBlockEditor();}); svg.appendChild(hit);
    const path=document.createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d',makeBezier(a,b)); path.setAttribute('fill','none'); path.setAttribute('stroke','#00d4ff'); path.setAttribute('stroke-width','2'); path.setAttribute('opacity','0.82'); svg.appendChild(path);
  });
  canvas.onmousemove=e=>{ if(BE.dragging&&!V3.connecting){ const r=canvas.getBoundingClientRect(); BE.dragging.x=Math.max(0,e.clientX-r.left-BE.dragOffX); BE.dragging.y=Math.max(0,e.clientY-r.top-BE.dragOffY); renderBlockEditor(); } };
  canvas.onmouseup=()=>{BE.dragging=null;};
}
function setBlockParam(blockId,key,val){ const b=BE.blocks.find(b=>b.id===blockId); if(b){ snapshotBlocks(); const p=b.params.find(p=>p.k===key); if(p)p.v=val; } }
function addBlockLegacy_2(){ snapshotBlocks(); const cats=Object.keys(BLOCK_DEFS); const cat=cats[Math.floor(Math.random()*cats.length)]; const type=BLOCK_DEFS[cat].types[Math.floor(Math.random()*BLOCK_DEFS[cat].types.length)]; BE.blocks.push({id:BE.nextId++,cat,type:type.name,x:100+Math.random()*400,y:80+Math.random()*300,params:type.params.map(p=>({...p})),ports:{...type.ports}}); renderBlockEditor(); }
function deleteSelected(){ if(!BE.selected)return; snapshotBlocks(); BE.blocks=BE.blocks.filter(b=>b.id!==BE.selected); BE.connections=BE.connections.filter(c=>c.from!==BE.selected&&c.to!==BE.selected); BE.selected=null; renderBlockEditor(); }



// ═══════════════════════════════════════════════════════════════
//  COPILOT PATCH V4: block canvas orbit/pan/zoom, block↔code sync, reliable library DnD
// ═══════════════════════════════════════════════════════════════
const PATCH_V4 = {
  syncLock:false,
  syncTimer:null,
  lastGraphHash:'',
  lastCodeHash:'',
  pan:false,
  panStart:null,
  movedBlockSnapshot:false,
  libDropBound:false,
  originalOnCodeInput: (typeof onCodeInput === 'function' ? onCodeInput : null),
};

function hashStringV4(value){
  let h=2166136261;
  value=String(value||'');
  for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0).toString(36);
}
function cloneV4(value){ return JSON.parse(JSON.stringify(value)); }
function b64EncodeUnicodeV4(str){ return btoa(unescape(encodeURIComponent(str))); }
function b64DecodeUnicodeV4(str){ return decodeURIComponent(escape(atob(str))); }
function graphPayloadV4(){
  return {version:4,nextId:BE.nextId,blocks:cloneV4(BE.blocks),connections:cloneV4(BE.connections)};
}
function graphHashV4(){ return hashStringV4(JSON.stringify(graphPayloadV4())); }
function getLibMetaV4(name){ return LIBS.find(l=>l.name.toLowerCase()===String(name||'').toLowerCase()) || null; }
function libToCategoryV4(name){
  const n=String(name||'');
  if(BLOCK_DEFS[n]) return n;
  if(n==='math' || n==='Helpers' || n==='List' || n==='DateTime') return 'Logic';
  if(['Canvas','Canvex','Image','Lights','Models','Shapes','Text','Color'].includes(n)) return 'Sprites';
  if(['Devices','Events','Triggers','IO','Multiplayer'].includes(n)) return 'Events';
  if(['Transform','Physics','Curves','Properties'].includes(n)) return n==='Physics'?'Physics':'Transform';
  if(['Sound'].includes(n)) return 'Sound';
  if(['Camera'].includes(n)) return 'Camera';
  if(['Flow'].includes(n)) return 'Flow';
  if(['Sprites','PixelArt','Particles'].includes(n)) return 'Sprites';
  return 'Flow';
}
function blockTypeToMethodV4(category, blockType) {
  // Map block types to actual Canvex library method names
  const typeToMethod = {
    'Sprites': {
      'Load Sprite': 'create',
      'Play Animation': 'playAnimation',
      'Stop Animation': 'stopAnimation',
      'Set Frame': 'setFrame',
      'Set Opacity': 'alpha',
      'Set Tint': 'tint',
      'Set Visible': 'visible',
      'Draw Sprite': 'draw'
    },
    'Sound': {
      'Play Sound': 'play',
      'Stop Sound': 'stop',
      'Stop All': 'stopAll',
      'Set Volume': 'volume',
      'Fade In': 'fadeIn',
      'Fade Out': 'fadeOut'
    },
    'Physics': {
      'Apply Force': 'applyForce',
      'Apply Impulse': 'applyImpulse',
      'Set Velocity': 'setVelocity',
      'Stop Movement': 'stop',
      'Add Gravity': 'setGravity',
      'Set Gravity': 'setGravity',
      'Detect Collision': 'isColliding',
      'Raycast': 'raycast',
      'Enable Physics': 'enable'
    },
    'Transform': {
      'Move To': 'position',
      'Move By': 'translate',
      'Rotate': 'rotate',
      'Rotate To': 'rotate',
      'Scale': 'scale',
      'Set Size': 'scale',
      'Flip': 'scale',
      'Look At': 'lookAt',
      'Lerp To': 'lerp'
    },
    'Camera': {
      'Follow Target': 'follow',
      'Shake': 'shake',
      'Set Zoom': 'zoom',
      'Move Camera': 'position',
      'Reset Camera': 'reset',
      'Set Background': 'background'
    },
    'Events': {
      'On Key Press': 'onKeyPress',
      'On Key Release': 'onKeyRelease',
      'On Click': 'onClick',
      'On Collision': 'onCollision',
      'On Timer': 'onTimer',
      'On Trigger Enter': 'onTrigger',
      'On Trigger Exit': 'onTrigger',
      'Emit Event': 'emit',
      'On Event': 'on'
    },
    'Logic': {
      'If / Else': 'if',
      'Compare': 'compare',
      'AND Gate': 'and',
      'OR Gate': 'or',
      'NOT Gate': 'not',
      'Switch': 'switch'
    },
    'Flow': {
      'Sequence': 'sequence',
      'Delay': 'delay',
      'Loop': 'loop',
      'While': 'while',
      'Wait For': 'wait',
      'Run Script': 'run',
      'Stop Flow': 'stop'
    },
    'Canvas': {
      'Create Canvas': 'createCanvas',
      'Clear': 'clear',
      'Fill Rect': 'rect',
      'Draw Text': 'text',
      'Draw Line': 'line',
      'Draw Circle': 'circle'
    },
    'Shapes': {
      'Draw Box': 'box',
      'Draw Circle': 'sphere',
      'Draw Line': 'line',
      'Draw Polygon': 'polygon'
    },
    'Color': {
      'Use Color': 'fill',
      'Random Color': 'randomColor',
      'Lerp Color': 'lerpColor',
      'Set Tint': 'tint'
    },
    'Particles': {
      'Emit Burst': 'emit',
      'Start Emitter': 'start',
      'Stop Emitter': 'stop',
      'Set Gravity': 'gravity'
    },
    'Lights': {
      'Add Light': 'add',
      'Remove Light': 'remove',
      'Set Intensity': 'intensity',
      'Flicker': 'flicker'
    },
    'Text': {
      'Show Text': 'draw',
      'Set Text': 'text',
      'Typewriter': 'typewriter'
    },
    'Triggers': {
      'Create Trigger': 'create',
      'Remove Trigger': 'remove',
      'Is Inside': 'isInside'
    }
  };
  
  if (typeToMethod[category] && typeToMethod[category][blockType]) {
    return typeToMethod[category][blockType];
  }
  // Fallback: use camelCase conversion
  return safeMethodNameV4(blockType);
}

function safeMethodNameV4(type){
  const compact=String(type||'block').replace(/[^A-Za-z0-9]+/g,' ').trim().split(/\\s+/).filter(Boolean);
  if(!compact.length) return 'run';
  return compact.map((part,i)=>i===0?part.charAt(0).toLowerCase()+part.slice(1):part.charAt(0).toUpperCase()+part.slice(1)).join('');
}
function paramLiteralV4(v){
  const s=String(v);
  if(/^[-+]?\\d+(\\.\\d+)?$/.test(s)) return s;
  if(s==='true'||s==='false'||s==='null') return s;
  return JSON.stringify(s);
}
function serializeBlocksToCodeV4(){
  if(!BE.blocks.length && !BE.connections.length) return '';
  const payload=graphPayloadV4();
  const graphLine='// FORGE_BLOCKS '+b64EncodeUnicodeV4(JSON.stringify(payload));

  // ── Build execution graph ────────────────────────────────────────────
  const blockMap={};
  BE.blocks.forEach(b=>{ blockMap[b.id]=b; });
  const downstream={};   // blockId -> [{id, fromPort, toPort}]
  const hasIncoming=new Set();
  BE.connections.forEach(c=>{
    if(!downstream[c.from]) downstream[c.from]=[];
    downstream[c.from].push({id:c.to,fromPort:c.fromPort,toPort:c.toPort});
    hasIncoming.add(c.to);
  });
  const roots=BE.blocks.filter(b=>!hasIncoming.has(b.id));

  // ── Block role classification ────────────────────────────────────────
  const TRIGGER_TYPES=new Set([
    'On Key Press','On Key Release','On Click','On Collision',
    'On Timer','On Trigger Enter','On Trigger Exit','On Event'
  ]);

  // ── Import resolution ────────────────────────────────────────────────
  // Maps block type → the actual exported class from the library files
  const BLOCK_CLASS = {
    // Input / events
    'On Key Press': 'Keyboard', 'On Key Release': 'Keyboard', 'On Click': 'pointer',
    // Timers / flow
    'On Timer': 'Logic', 'Sequence': 'Flow', 'Delay': 'Flow', 'Loop': 'Flow', 'While': 'Flow', 'Wait For': 'Flow', 'Run Script': null, 'Stop Flow': 'Flow',
    // Triggers / collisions
    'On Collision': 'Physics', 'On Trigger Enter': 'Triggers', 'On Trigger Exit': 'Triggers', 'On Event': null, 'Emit Event': null,
    // Transform / movement
    'Move To': 'Transform', 'Move By': 'Transform', 'Rotate': 'Transform', 'Rotate To': 'Transform', 'Scale': 'Transform', 'Set Size': 'Transform', 'Flip': 'Transform', 'Look At': 'Transform', 'Lerp To': 'Transform',
    // Physics
    'Apply Force': 'Physics', 'Apply Impulse': 'Physics', 'Set Velocity': 'Physics', 'Stop Movement': 'Physics', 'Enable Physics': 'Physics', 'Add Gravity': 'Physics', 'Set Gravity': 'Physics', 'Detect Collision': 'Physics', 'Raycast': 'Physics',
    // Sound
    'Play Sound': 'Sound', 'Stop Sound': 'Sound', 'Stop All': 'Sound', 'Set Volume': 'Sound', 'Fade In': 'Sound', 'Fade Out': 'Sound',
    // Camera
    'Follow Target': 'Camera', 'Shake': 'Camera', 'Set Zoom': 'Camera', 'Move Camera': 'Camera', 'Reset Camera': 'Camera', 'Set Background': 'Camera',
    // Particles
    'Emit Burst': 'Particles', 'Start Emitter': 'Particles', 'Stop Emitter': 'Particles',
    // Sprites / objects
    'Load Sprite': 'Sprites', 'Play Animation': 'Sprites', 'Stop Animation': 'Sprites', 'Set Frame': 'Sprites', 'Set Visible': 'Sprites', 'Set Tint': 'Sprites', 'Use Color': 'Color',
    // Text / drawing
    'Show Text': 'Text', 'Set Text': 'Text', 'Draw Text': 'Text', 'Typewriter': 'Text',
    'Clear': 'Canvas', 'Fill Rect': 'Canvas', 'Draw Circle': 'Canvas', 'Draw Line': 'Canvas',
    // Logic / gates
    'If / Else': 'Logic', 'Compare': 'Logic', 'AND Gate': 'Logic', 'OR Gate': 'Logic', 'NOT Gate': 'Logic', 'Switch': 'Logic',
    // Triggers management
    'Create Trigger': 'Triggers', 'Remove Trigger': 'Triggers', 'Is Inside': 'Triggers',
    // Lights
    'Add Light': 'Lights', 'Remove Light': 'Lights', 'Set Intensity': 'Lights', 'Flicker': 'Lights',
  };

  const CLASS_FILE = {
    // events
    Keyboard: 'events', pointer: 'events', Window: 'events', controller: 'events', sensor: 'events',
    // core helpers
    Helpers: 'helpers', Canvex: 'canvex', Canvas: 'canvas',
    // rendering / drawing
    Transform: 'transforms', Camera: 'camera', Canvas: 'canvas', Color: 'color', Image: 'image',
    // gameplay
    Sprites: 'sprites', Particles: 'particles', Physics: 'physics',
    // audio
    Sound: 'sound',
    // UI / text
    Text: 'text', GUI: 'gui',
    // logic / flow
    Logic: 'logic', Flow: 'flow', Triggers: 'triggers',
    // misc
    Models: 'models', Shapes: 'shapes', math: 'math', DateTime: 'datetime', Lights: 'lights'
  };

  const neededClasses=new Set();
  BE.blocks.forEach(b=>{
    const cls=BLOCK_CLASS[b.type];
    if(cls) neededClasses.add(cls);
  });
  // Group by file for import statements
  const byFile={};
  neededClasses.forEach(cls=>{
    const file=CLASS_FILE[cls]||cls.toLowerCase();
    if(!byFile[file]) byFile[file]=[];
    byFile[file].push(cls);
  });
  const importLines=Object.entries(byFile).map(([file,classes])=>
    \`import { \${classes.join(', ')} } from '../libs/\${file}.js';\`
  );
  // ── Helper: extract params as an object ─────────────────────────────
  function pp(block){ const o={}; (block.params||[]).forEach(q=>{o[q.k]=q.v;}); return o; }
  function num(v,def=0){ return /^-?[\d.]+$/.test(String(v))?String(v):String(def); }
  function qstr(v,def=''){ return JSON.stringify(String(v!==undefined&&v!==null?v:def)); }

  // ── Generate code lines for a single action block ───────────────────
  function actionLines(b, ind){
    const p=pp(b); const I=ind;
    if(b.type === 'Play Sound'){
      if(p.target){
        return [
          I + '{ const _t=_forgeObjects[' + qstr(p.target,'sound') + ']; if(!_t){ _forgeObjects[' + qstr(p.target,'sound') + '] = Sound.create(' + qstr(p.src) + ', { volume: ' + num(p.volume||p.vol,1) + ', loop: ' + (p.loop==='true') + ' }); }',
          I + '  Sound.play(_forgeObjects[' + qstr(p.target,'sound') + ']).catch(()=>{}); }'
        ];
      }
      return [
        I + '{ const _s = Sound.create(' + qstr(p.src) + ', { volume: ' + num(p.volume||p.vol,1) + ', loop: ' + (p.loop==='true') + ' });',
        I + '  Sound.play(_s).catch(()=>{}); }'
      ];
    }
    if(b.type === 'Stop Sound'){
      return [ I + '{ const _t=_forgeObjects[' + qstr(p.target) + ']; if(_t) Sound.stop(_t); }' ];
    }
    if(b.type === 'Stop All'){
      return [ I + 'Sound.stopAll();' ];
    }
    if(b.type === 'Set Volume'){
      return [ I + '{ const _t=_forgeObjects[' + qstr(p.target) + ']; if(_t) Sound.setVolume(_t, ' + num(p.vol,1) + '); }' ];
    }
    if(b.type === 'Fade In'){
      return [ I + '{ const _t=_forgeObjects[' + qstr(p.target) + ']||Sound.create(' + qstr(p.src) + ', { volume: 0 }); Sound.fadeIn(_t, ' + num(p.volume||p.vol,1) + ', ' + num(p.ms,1000) + ').catch(()=>{}); }' ];
    }
    if(b.type === 'Fade Out'){
      return [ I + '{ const _t=_forgeObjects[' + qstr(p.target) + ']; if(_t) Sound.fadeOut(_t, ' + num(p.ms,1000) + ').catch(()=>{}); }' ];
    }
    switch(b.type){
      case 'Scale':
        return [\`\${I}{ const _o=_forgeObjects[\${qstr(p.target,'object')}];\`,
                \`\${I}  if(_o){ _o.scaleX=\${num(p.x,1)}; _o.scaleY=\${num(p.y,1)}; } }\`];
      case 'Set Size':
        return [\`\${I}{ const _o=_forgeObjects[\${qstr(p.target,'object')}];\`,
                \`\${I}  if(_o){ _o.w=\${num(p.w)}; _o.h=\${num(p.h)}; } }\`];
      case 'Flip':
        return [\`\${I}{ const _o=_forgeObjects[\${qstr(p.target,'object')}];\`,
                \`\${I}  if(_o){ if(\${qstr(p.axis,'x')} === 'x') _o.scaleX*=-1; else _o.scaleY*=-1; } }\`];
      case 'Lerp To':
        return [\`\${I}{ const _o=_forgeObjects[\${qstr(p.target,'object')}]; const _t=\${num(p.t,0.1)};\`,
                \`\${I}  if(_o){ _o.x+=(\${num(p.x)}-_o.x)*_t; _o.y+=(\${num(p.y)}-_o.y)*_t; } }\`];
      // Physics
      case 'Apply Force':
        return [\`\${I}Physics.applyForce(\${qstr(p.target,'object')}, \${num(p.x)}, \${num(p.y)});\`];
      case 'Apply Impulse':
        return [\`\${I}Physics.applyImpulse(\${qstr(p.target,'object')}, \${num(p.x)}, \${num(p.y)});\`];
      case 'Set Velocity':
        return [\`\${I}Physics.setVelocity(\${qstr(p.target,'object')}, \${num(p.x)}, \${num(p.y)});\`];
      case 'Stop Movement':
        return [\`\${I}Physics.stop(\${qstr(p.target,'object')});\`];
      case 'Enable Physics':
        return [\`\${I}Physics.enable(\${qstr(p.target,'object')});\`];
      // Sound
      case 'Play Sound':
        return [\`\${I}Sound.play(\${qstr(p.src)}, { loop: \${p.loop==='true'}, volume: \${num(p.vol,1)} });\`];
      case 'Stop Sound':
        return [\`\${I}Sound.stop(\${qstr(p.src)});\`];
      case 'Stop All':
        return [\`\${I}Sound.stopAll();\`];
      case 'Set Volume':
        return [\`\${I}Sound.setVolume(\${num(p.vol,1)});\`];
      case 'Fade In':
        return [\`\${I}Sound.fadeIn(\${qstr(p.src)}, \${num(p.ms,500)});\`];
      case 'Fade Out':
        return [\`\${I}Sound.fadeOut(\${qstr(p.src)}, \${num(p.ms,500)});\`];
      // Camera
      case 'Follow Target':
        return [\`\${I}Camera.follow({ target: \${qstr(p.target,'object')}, speed: \${num(p.speed,0.1)} });\`];
      case 'Shake':
        return [\`\${I}Camera.shake({ magnitude: \${num(p.mag,5)}, ms: \${num(p.ms,300)} });\`];
      case 'Set Zoom':
        return [\`\${I}Camera.zoom(\${num(p.zoom,1)});\`];
      case 'Move Camera':
        return [\`\${I}Camera.position({ x: \${num(p.x)}, y: \${num(p.y)} });\`];
      case 'Reset Camera':
        return [\`\${I}Camera.reset();\`];
      case 'Set Background':
        return [\`\${I}Camera.background(\${qstr(p.color,'#000000')});\`];
      // Particles
      case 'Emit Burst':
        return [\`\${I}{ const _o=_forgeObjects[\${qstr(p.target,'emitter')}]||{x:0,y:0};\`,
                \`\${I}  Particles.burst(\${qstr(p.target,'emitter')}, _o.x, _o.y, \${num(p.count,10)}); }\`];
      case 'Start Emitter':
        return [\`\${I}// Particles.emit(\${qstr(p.target,'emitter')}, x, y, delta, {}) — call this in your game loop\`];
      case 'Stop Emitter':
        return [\`\${I}Particles.clear(\${qstr(p.target,'emitter')});\`];
      // Text
      case 'Show Text':
      case 'Draw Text':
        return [\`\${I}// ctx.font = '\${p.size||16}px sans-serif'; ctx.fillStyle = \${qstr(p.color,'#ffffff')};\`,
                \`\${I}// ctx.fillText(\${qstr(p.text,'text')}, \${num(p.x)}, \${num(p.y)});\`];
      case 'Set Text':
        return [\`\${I}{ const _o=_forgeObjects[\${qstr(p.target,'textObject')}];\`,
                \`\${I}  if(_o){ _o.text=\${qstr(p.text)}; } }\`];
      case 'Typewriter':
        return [\`\${I}Text.typewriter({ target: \${qstr(p.target,'textObject')}, text: \${qstr(p.text)}, ms: \${num(p.ms,50)} });\`];
      // Logic / Flow
      case 'Delay':
        return [\`\${I}await new Promise(r=>setTimeout(r,\${num(p.ms,0)}));\`];
      case 'Loop':
        return [\`\${I}for(let _i=0; _i<\${num(p.n,1)}; _i++){\`,
                \`\${I}  // loop body — connect blocks to this output\`,
                \`\${I}}\`];
      case 'Run Script':
        return [\`\${I}if(typeof \${p.fn||'myFunction'} === 'function') \${p.fn||'myFunction'}();\`];
      case 'Stop Flow':
        return [\`\${I}return;\`];
      case 'Emit Event':
        return [\`\${I}document.dispatchEvent(new CustomEvent(\${qstr(p.event,'myEvent')}));\`];
      // Canvas
      case 'Clear':
        return [\`\${I}ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);\`];
      case 'Fill Rect':
        return [\`\${I}ctx.fillStyle=\${qstr(p.color,'#ffffff')}; ctx.fillRect(\${num(p.x)},\${num(p.y)},\${num(p.w,100)},\${num(p.h,100)});\`];
      case 'Draw Circle':
        return [\`\${I}ctx.fillStyle=\${qstr(p.color,'#ffffff')};\`,
                \`\${I}ctx.beginPath(); ctx.arc(\${num(p.x)},\${num(p.y)},\${num(p.r,20)},0,Math.PI*2); ctx.fill();\`];
      case 'Draw Line':
        return [\`\${I}ctx.strokeStyle=\${qstr(p.color,'#ffffff')};\`,
                \`\${I}ctx.beginPath(); ctx.moveTo(\${num(p.x1)},\${num(p.y1)}); ctx.lineTo(\${num(p.x2)},\${num(p.y2)}); ctx.stroke();\`];
      // Triggers
      case 'Create Trigger':
        return [\`\${I}Triggers.create(\${qstr(p.zone,'zone1')}, { x:\${num(p.x)}, y:\${num(p.y)}, w:\${num(p.w,100)}, h:\${num(p.h,100)} });\`];
      case 'Remove Trigger':
        return [\`\${I}Triggers.remove(\${qstr(p.zone,'zone1')});\`];
      case 'Is Inside':
        return [\`\${I}Triggers.isInside(\${qstr(p.target,'object')}, \${qstr(p.zone,'zone1')});\`];
      default:
        return [\`\${I}// TODO: Block "\${b.type}" — add your implementation here\`];
    }
  }

  // ── Recursively collect action-chain code ────────────────────────────
  function buildChain(blockId, indent, visited){
    if(!visited) visited=new Set();
    if(visited.has(blockId)) return [];
    visited.add(blockId);
    const b=blockMap[blockId];
    if(!b) return [];
    const lines=[\`\${indent}// \${b.type} (block \${b.id})\`];
    actionLines(b,indent).forEach(l=>lines.push(l));
    (downstream[blockId]||[]).forEach(conn=>{
      buildChain(conn.id,indent,visited).forEach(l=>lines.push(l));
    });
    return lines;
  }

  // ── Generate wrapper for a trigger block ─────────────────────────────
  function triggerBlock(b){
    const p=pp(b);
    const chainLines=[];
    (downstream[b.id]||[]).forEach(conn=>{
      buildChain(conn.id,'    ',new Set([b.id])).forEach(l=>chainLines.push(l));
    });
    const inner=chainLines.length?chainLines:[\`    // (no action blocks connected yet)\`];
    switch(b.type){
      case 'On Key Press':
        return [\`// Block \${b.id}: On Key Press → "\${p.key||'Enter'}"\`,
                \`Keyboard.keyPressed = (event) => {\`,
                \`  if (event.key === \${qstr(p.key||'Enter')}) {\`,
                ...inner,
                \`  }\`,
                \`};\`];
      case 'On Key Release':
        return [\`// Block \${b.id}: On Key Release → "\${p.key||'Enter'}"\`,
                \`Keyboard.keyReleased = (event) => {\`,
                \`  if (event.key === \${qstr(p.key||'Enter')}) {\`,
                ...inner,
                \`  }\`,
                \`};\`];
      case 'On Click':
        return [\`// Block \${b.id}: On Click\`,
                \`pointer.mouseClicked = (event) => {\`,
                ...inner.map(l=>l.slice(2)),
                \`};\`];
      case 'On Timer':
        return [\`// Block \${b.id}: On Timer — every \${p.ms||1000}ms\`,
                \`setInterval(async () => {\`,
                ...inner.map(l=>l.slice(2)),
                \`}, \${num(p.ms,1000)});\`];
      case 'On Event':
        return [\`// Block \${b.id}: On Event → "\${p.event||'myEvent'}"\`,
                \`document.addEventListener(\${qstr(p.event||'myEvent')}, async (event) => {\`,
                ...inner.map(l=>l.slice(2)),
                \`});\`];
      case 'On Collision':
        return [\`// Block \${b.id}: On Collision — wire this into Physics.onCollision() in your game loop:\`,
                \`// Physics.onCollision(\${qstr(p.target,'object')}, \${qstr(p.tag,'other')}, () => {\`,
                ...inner.map(l=>\`// \${l}\`),
                \`// });\`];
      case 'On Trigger Enter':
        return [\`// Block \${b.id}: On Trigger Enter — zone: "\${p.zone||'zone1'}"\`,
                \`// Check inside your game loop: if(Triggers.isInside(\${qstr(p.target,'object')}, \${qstr(p.zone||'zone1')})){\`,
                ...inner.map(l=>\`// \${l}\`),
                \`// }\`];
      default:
        return [\`// Block \${b.id}: \${b.type}\`, ...inner.map(l=>l.slice(2))];
    }
  }

  // ── Assemble final output ────────────────────────────────────────────
  const lines=[
    '/**',
    ' * Generated Code from FORGE Block Editor',
    ' * This code is automatically synced with your visual block graph.',
    ' * You can edit either the blocks or the code — they stay in sync!',
    ' */',
    graphLine,
    '',
    ...importLines,
    '',
    '// ════════════════════════════════════════════════════════════════',
    '// GAME OBJECT REGISTRY',
    '// Call registerForgeObject("player", myObj) during scene setup',
    '// so blocks that reference "player" (or any named target) can find it.',
    '// myObj must have at least { x, y } — add w, h, rotation, scaleX,',
    '// scaleY, visible, opacity etc. as needed.',
    '// ════════════════════════════════════════════════════════════════',
    'const _forgeObjects = {};',
    'export function registerForgeObject(id, obj) { _forgeObjects[id] = obj; }',
    '',
    '// ════════════════════════════════════════════════════════════════',
    '// BLOCK LOGIC  (auto-generated from your block graph)',
    '// ════════════════════════════════════════════════════════════════',
    '',
  ];

  // Triggers first, then any floating action-only roots
  const triggerRoots = roots.filter(b=>TRIGGER_TYPES.has(b.type));
  const actionRoots  = roots.filter(b=>!TRIGGER_TYPES.has(b.type));

  triggerRoots.forEach(b=>{
    triggerBlock(b).forEach(l=>lines.push(l));
    lines.push('');
  });

  if(actionRoots.length){
    lines.push('// ── Standalone action blocks (not connected to a trigger) ───────');
    actionRoots.forEach(b=>{
      lines.push(\`// Block \${b.id}: \${b.type}\`);
      actionLines(b,'').forEach(l=>lines.push(l));
      lines.push('');
    });
  }

  return lines.join('\\n').replace(/\\s+$/,'')+'\\n';
}
function parseCodeToBlocksV4(code){
  const marker=String(code||'').match(/^\\s*\\/\\/\\s*FORGE_BLOCKS\\s+([A-Za-z0-9+/=]+)\\s*$/m);
  if(marker){
    const payload=JSON.parse(b64DecodeUnicodeV4(marker[1]));
    if(!Array.isArray(payload.blocks) || !Array.isArray(payload.connections)) throw new Error('FORGE_BLOCKS metadata is missing graph arrays.');
    return {blocks:payload.blocks,connections:payload.connections,nextId:payload.nextId||((Math.max(0,...payload.blocks.map(b=>+b.id||0)))+1)};
  }
  // Fallback: rebuild a simple graph from generated comment/call pairs if the metadata comment was removed.
  const blocks=[];
  const re=/\\/\\/\\s*\\[([^\\]]+)\\]\\s*([^\\n]+)\\n\\s*([A-Za-z_$][\\w$]*)\\.([A-Za-z_$][\\w$]*)\\s*\\(\\s*\\{([\\s\\S]*?)\\}\\s*\\)\\s*;/g;
  let m, id=1;
  while((m=re.exec(code))){
    const cat=m[1].trim(), type=m[2].trim();
    if(!BLOCK_DEFS[cat]) continue;
    const def=findBlockDef(cat,type) || BLOCK_DEFS[cat].types[0];
    const params=[];
    const body=m[5].trim();
    if(body){
      body.split(',').forEach(pair=>{
        const bits=pair.split(':');
        if(bits.length>=2){
          const k=bits.shift().trim();
          let v=bits.join(':').trim();
          v=v.replace(/^['"]|['"]$/g,'');
          params.push({k,v});
        }
      });
    }
    blocks.push({id:id++,cat,type,x:80+((id-2)%3)*260,y:80+Math.floor((id-2)/3)*150,params:params.length?params:cloneV4(def.params||[]),ports:cloneV4(def.ports||{in:[],out:[]})});
  }
  if(!blocks.length) throw new Error('No FORGE blocks found in code. Keep the FORGE_BLOCKS metadata line or generated block comments.');
  const connections=[];
  for(let i=0;i<blocks.length-1;i++){
    const out=(blockDefFor(blocks[i]).ports?.out||[])[0];
    const inn=(blockDefFor(blocks[i+1]).ports?.in||[])[0];
    if(out&&inn) connections.push({from:blocks[i].id,fromPort:out,to:blocks[i+1].id,toPort:inn});
  }
  return {blocks,connections,nextId:id};
}
function setCodeStatusV4(ok,msg){
  const el=safeEl('ce-status-msg');
  if(el){el.textContent=(ok?'● Synced':'● Sync error')+(msg?\` — \${msg}\`:'');el.className=ok?'con-success':'ce-error';}
  const v=safeEl('be-valid');
  if(v){v.classList.remove('hidden');v.className=ok?'be-valid ok':'be-valid err';v.textContent=ok?'✓ Blocks/code synced':'✕ Blocks/code mismatch';clearTimeout(v._syncTimer);v._syncTimer=setTimeout(()=>v.classList.add('hidden'),2200);}
}
function syncCodeFromBlocksV4(reason='block edit'){
  if(PATCH_V4.syncLock) return;
  const ta=safeEl('code-area'); if(!ta) return;
  PATCH_V4.syncLock=true;
  const code=serializeBlocksToCodeV4();
  if(ta.value!==code){
    ta.value=code;
    refreshCodeHighlight(); syncScroll(); updateCursor();
    if(V3 && V3.codeUndo && V3.codeUndo[V3.codeUndo.length-1]!==code) V3.codeUndo.push(code);
    // Extract and log which libraries are imported
    var importLines=code.split('\\n').filter(function(line){ return /^import\s*\{/.test(line); });
    if(importLines.length>0){
      var libsInCode=[];
      importLines.forEach(function(line){
        var match=line.match(/import\s*\{\s*([^}]+)\s*\}/);
        if(match) libsInCode.push(match[1].trim());
      });
      if(libsInCode.length>0){
        logConsole('info','📦 Generated code with imports: '+libsInCode.join(', '));
      }
    }
  }
  PATCH_V4.lastGraphHash=graphHashV4(); PATCH_V4.lastCodeHash=hashStringV4(code);
  PATCH_V4.syncLock=false;
  setCodeStatusV4(true,reason);
}
function syncBlocksFromCodeV4(reason='code edit', immediate=false){
  if(PATCH_V4.syncLock) return;
  const ta=safeEl('code-area'); if(!ta) return;
  // Only immediately sync when explicitly requested (e.g. on blur), not mid-keystroke.
  // This prevents the block editor from fighting the user while they type.
  clearTimeout(PATCH_V4.syncTimer);
  const doSync=()=>{
    if(PATCH_V4.syncLock) return;
    try{
      const parsed=parseCodeToBlocksV4(ta.value);
      PATCH_V4.syncLock=true;
      if(JSON.stringify({blocks:BE.blocks,connections:BE.connections,nextId:BE.nextId})!==JSON.stringify(parsed)){
        snapshotBlocks(); BE.blocks=parsed.blocks; BE.connections=parsed.connections; BE.nextId=parsed.nextId; BE.selected=null; renderBlockEditor();
      }
      PATCH_V4.lastGraphHash=graphHashV4(); PATCH_V4.lastCodeHash=hashStringV4(ta.value);
      PATCH_V4.syncLock=false;
      setCodeStatusV4(true,reason);
    }catch(err){ PATCH_V4.syncLock=false; setCodeStatusV4(false,err.message); }
  };
  if(immediate){ doSync(); } else { PATCH_V4.syncTimer=setTimeout(doSync,1800); }
}

// Coordinate helpers for block editor pan/zoom.
function ensureBlockViewV4(){
  if(!BE.view) BE.view={x:0,y:0,scale:1};
  return BE.view;
}
function applyBlockViewV4(){
  const view=ensureBlockViewV4();
  const canvas=safeEl('be-canvas'), svg=safeEl('be-svg');
  const transform=\`translate(\${view.x}px, \${view.y}px) scale(\${view.scale})\`;
  if(canvas){canvas.style.transformOrigin='0 0';canvas.style.transform=transform;canvas.style.width='2400px';canvas.style.height='1600px';}
  if(svg){svg.style.transformOrigin='0 0';svg.style.transform=transform;svg.style.width='2400px';svg.style.height='1600px';}
}
function beLocalPointV4(e){
  const editor=safeEl('block-editor'); const r=editor.getBoundingClientRect(); const v=ensureBlockViewV4();
  return {x:(e.clientX-r.left-v.x)/v.scale,y:(e.clientY-r.top-v.y)/v.scale};
}
function connectorPoint(el){
  const editor=safeEl('block-editor'); const er=editor.getBoundingClientRect(); const r=el.getBoundingClientRect(); const v=ensureBlockViewV4();
  return {x:(r.left-er.left + r.width/2 - v.x)/v.scale, y:(r.top-er.top + r.height/2 - v.y)/v.scale};
}
function bePointFromEvent(e){ return beLocalPointV4(e); }
function bindBlockOrbitV4(){
  const editor=safeEl('block-editor'); if(!editor || editor._orbitV4) return; editor._orbitV4=true;
  editor.addEventListener('wheel',e=>{
    if(STATE.editorTab!=='blocks') return;
    e.preventDefault();
    const v=ensureBlockViewV4(); const r=editor.getBoundingClientRect();
    const mx=e.clientX-r.left, my=e.clientY-r.top;
    const before={x:(mx-v.x)/v.scale,y:(my-v.y)/v.scale};
    const next=Math.max(.35,Math.min(2.5,v.scale*(e.deltaY<0?1.08:.925)));
    v.scale=next; v.x=mx-before.x*next; v.y=my-before.y*next; applyBlockViewV4();
    setStatusMsg(\`Block zoom: \${Math.round(v.scale*100)}%\`);
  },{passive:false});
  editor.addEventListener('mousedown',e=>{
    if(STATE.editorTab!=='blocks') return;
    const isBlank=e.target===editor || e.target.id==='be-canvas' || e.target.id==='be-svg';
    if(e.button===1 || e.button===2 || (e.altKey && isBlank) || (e.shiftKey && isBlank)){
      e.preventDefault(); PATCH_V4.pan=true; const v=ensureBlockViewV4(); PATCH_V4.panStart={x:e.clientX,y:e.clientY,vx:v.x,vy:v.y}; editor.style.cursor='grabbing';
    }
  },true);
  editor.addEventListener('contextmenu',e=>{ if(PATCH_V4.pan) e.preventDefault(); });
  document.addEventListener('mousemove',e=>{
    if(!PATCH_V4.pan) return; const v=ensureBlockViewV4();
    v.x=PATCH_V4.panStart.vx+(e.clientX-PATCH_V4.panStart.x); v.y=PATCH_V4.panStart.vy+(e.clientY-PATCH_V4.panStart.y); applyBlockViewV4();
  },true);
  document.addEventListener('mouseup',()=>{ if(PATCH_V4.pan){PATCH_V4.pan=false; editor.style.cursor='';}},true);
}
function resetBlockViewV4(){ BE.view={x:0,y:0,scale:1}; applyBlockViewV4(); setStatusMsg('Block view reset'); }

// Live execution system for blocks in game mode
let BLOCK_EXECUTION_STATE = { isRunning: false, currentStep: 0 };

async function runBlocksLiveV4(){
  if(!BE.blocks.length) { logConsole('error', '❌ No blocks to execute'); return; }
  if(BLOCK_EXECUTION_STATE.isRunning) { logConsole('warn', '⏸ Already running blocks...'); return; }
  
  BLOCK_EXECUTION_STATE.isRunning = true;
  logConsole('info', '▶️ Starting live block execution...');
  
  try {
    for(let idx = 0; idx < BE.blocks.length; idx++) {
      const block = BE.blocks[idx];
      BLOCK_EXECUTION_STATE.currentStep = idx + 1;
      
      // Visual feedback - highlight executing block
      highlightBlockExecutionV4(block.id);
      logConsole('success', \`▶️ Executing Step \${idx + 1}/\${BE.blocks.length}: \${block.type}\`);
      
      // Execute the block
      await executeBlockV4(block);
      
      // Small delay so user can see execution flow
      await new Promise(r => setTimeout(r, 300));
    }
    
    logConsole('success', '✅ Block execution complete!');
    BLOCK_EXECUTION_STATE.currentStep = 0;
  } catch(err) {
    logConsole('error', \`❌ Block execution error: \${err.message}\`);
  } finally {
    BLOCK_EXECUTION_STATE.isRunning = false;
    clearBlockExecutionHighlightV4();
  }
}

async function executeBlockV4(block){
  const params = {};
  (block.params || []).forEach(p => {
    const val = p.v;
    if(val === 'true') params[p.k] = true;
    else if(val === 'false') params[p.k] = false;
    else if(!isNaN(val) && val !== '') params[p.k] = Number(val);
    else params[p.k] = val;
  });

  const rawLibName = (block.lib || block.cat || '').trim();
  const canonical = (typeof window.canonicalForgeClassName === 'function')
    ? window.canonicalForgeClassName(rawLibName)
    : (rawLibName.charAt(0).toUpperCase() + rawLibName.slice(1));
  const methodName = block.method || blockTypeToMethodV4(block.cat, block.type);

  try {
    if (window.ensureForgeGlobals) await window.ensureForgeGlobals();
    else if (window.ForgeGlobalImportsReady) await window.ForgeGlobalImportsReady;

    const className = canonical;
    const candidates = [
      window[className],
      window.ForgeClasses && window.ForgeClasses[className],
      window.ForgeClasses && window.ForgeClasses[String(className).toLowerCase()],
      window.ForgeLibs && window.ForgeLibs[className],
      window.ForgeLibs && window.ForgeLibs[String(className).toLowerCase()],
      window.ForgeMethods && window.ForgeMethods[className]
    ].filter(Boolean);

    let target = null;
    for (const candidate of candidates) {
      if (candidate && typeof candidate[methodName] === 'function') { target = candidate; break; }
      if (candidate && candidate.default && typeof candidate.default[methodName] === 'function') { target = candidate.default; break; }
    }

    if (target && typeof target[methodName] === 'function') {
      await target[methodName](params);
      logConsole('info', \`  ↳ \${className}.\${methodName}() executed\`);
    } else {
      logConsole('warn', \`  ↳ Method \${className}.\${methodName}() not found. Global imports loaded: \${!!window.ForgeClasses}\`);
    }
  } catch(err) {
    logConsole('error', \`  ↳ Error: \${err.message}\`);
  }
}

function highlightBlockExecutionV4(blockId){
  const el = document.querySelector(\`#be-block-\${blockId}\`);
  if(el) {
    el.style.boxShadow = '0 0 20px rgba(0, 255, 200, 0.8)';
    el.style.transform = 'scale(1.05)';
    el.style.zIndex = '1000';
  }
}

function clearBlockExecutionHighlightV4(){
  document.querySelectorAll('.be-block').forEach(el => {
    el.style.boxShadow = '';
    el.style.transform = '';
    el.style.zIndex = '';
  });
}

// Expose generator to browser console: call \`exportGeneratedForgeCode()\`
if(typeof window !== 'undefined'){
  window.exportGeneratedForgeCode = function(download){
    try{
      const code = serializeBlocksToCodeV4();
      console.log(code);
      if(download && typeof document !== 'undefined'){
        const blob = new Blob([code], { type: 'text/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'forge-generated.js'; document.body.appendChild(a);
        a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
      return code;
    }catch(err){ console.error('exportGeneratedForgeCode failed', err); return null; }
  };
}

// Override block renderer so dragging works correctly while zoomed/panned and block changes auto-update code.
function renderBlockEditor(){
  const canvas=safeEl('be-canvas'), svg=safeEl('be-svg'); if(!canvas||!svg) return;
  ensureBlockViewV4(); canvas.innerHTML=''; svg.innerHTML='';
  const W=2400,H=1600; svg.setAttribute('viewBox',\`0 0 \${W} \${H}\`); applyBlockViewV4();
  BE.blocks.forEach(block=>{
    const def=blockDefFor(block); const catColor=BLOCK_DEFS[block.cat]?.color||'#888'; const catBg=BLOCK_DEFS[block.cat]?.bg||'rgba(128,128,128,.12)';
    const el=document.createElement('div'); el.className='be-block'+((typeof beIsSelected==='function'?beIsSelected(block.id):block.id===BE.selected)?' selected':''); el.id=\`be-block-\${block.id}\`; el.style.cssText=\`left:\${block.x}px;top:\${block.y}px\`;
    el.innerHTML=\`<div class="be-block-header" style="background:\${catBg}"><span class="be-block-cat" style="background:\${catColor}20;color:\${catColor};border:1px solid \${catColor}40">\${block.cat}</span><span class="be-block-title">\${block.type}</span></div><div class="be-block-body">
      \${(def.ports?.in||[]).map(p=>\`<div class="be-port-row"><div class="be-port in"><div class="be-connector\${isPortConnected(block.id,p,'in')?' connected':''}" data-block="\${block.id}" data-port="\${p}" data-dir="in"></div><span style="font-size:10px;color:var(--text2)">\${p}</span></div></div>\`).join('')}
      \${(def.ports?.out||[]).map(p=>\`<div class="be-port-row"><div class="be-port out" style="margin-left:auto"><span style="font-size:10px;color:var(--text2)">\${p}</span><div class="be-connector\${isPortConnected(block.id,p,'out')?' connected':''}" data-block="\${block.id}" data-port="\${p}" data-dir="out"></div></div></div>\`).join('')}
      \${(block.params||[]).map(param=>\`<div class="be-param"><span class="be-param-label">\${param.k}</span><input class="be-param-input" value="\${String(param.v).replace(/"/g,'&quot;')}" oninput="setBlockParam(\${block.id},'\${param.k}',this.value)" onclick="event.stopPropagation()"/></div>\`).join('')}
    </div>\`;
    el.querySelector('.be-block-header').addEventListener('mousedown', e=>{
      e.stopPropagation(); if(V3.connecting) return; snapshotBlocks(); PATCH_V4.movedBlockSnapshot=true;
      BE.selected=block.id; const pt=beLocalPointV4(e); BE.dragging=block; BE.dragOffX=pt.x-block.x; BE.dragOffY=pt.y-block.y; renderBlockEditor();
    });
    el.addEventListener('mousedown', e=>{ if(!e.target.classList.contains('be-connector')){BE.selected=block.id; renderBlockEditor();} });
    canvas.appendChild(el);
  });
  canvas.querySelectorAll('.be-connector').forEach(conn=>conn.addEventListener('mousedown',e=>beginBlockConnection(e,+conn.dataset.block,conn.dataset.port,conn.dataset.dir)));
  BE.connections.forEach(conn=>{
    const fromEl=canvas.querySelector(\`#be-block-\${conn.from} .be-connector[data-port="\${conn.fromPort}"][data-dir="out"]\`);
    const toEl=canvas.querySelector(\`#be-block-\${conn.to} .be-connector[data-port="\${conn.toPort}"][data-dir="in"]\`);
    if(!fromEl||!toEl) return; const a=connectorPoint(fromEl), b=connectorPoint(toEl);
    const hit=document.createElementNS('http://www.w3.org/2000/svg','path'); hit.setAttribute('d',makeBezier(a,b)); hit.setAttribute('class','be-connection-hit'); hit.addEventListener('dblclick',()=>{snapshotBlocks();BE.connections=BE.connections.filter(c=>c!==conn);renderBlockEditor();syncCodeFromBlocksV4('connection removed');}); svg.appendChild(hit);
    const path=document.createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d',makeBezier(a,b)); path.setAttribute('fill','none'); path.setAttribute('stroke','#00d4ff'); path.setAttribute('stroke-width','2'); path.setAttribute('opacity','0.82'); svg.appendChild(path);
  });
  canvas.onmousemove=e=>{ if(BE.dragging&&!V3.connecting){ const pt=beLocalPointV4(e); BE.dragging.x=Math.max(0,pt.x-BE.dragOffX); BE.dragging.y=Math.max(0,pt.y-BE.dragOffY); renderBlockEditor(); } };
  canvas.onmouseup=()=>{ if(BE.dragging){BE.dragging=null; PATCH_V4.movedBlockSnapshot=false; syncCodeFromBlocksV4('block moved');} };
}

function addBlockFromLibraryV4(libName,x,y){
  snapshotBlocks();
  const cat=libToCategoryV4(libName); const def=(BLOCK_DEFS[cat]?.types||[])[0] || BLOCK_DEFS.Flow.types[0];
  const id=Math.max(BE.nextId, ...BE.blocks.map(b=>b.id+1), 1); BE.nextId=id+1;
  BE.blocks.push({id,cat,type:def.name,x:Math.max(0,x||120),y:Math.max(0,y||120),params:cloneV4(def.params||[]),ports:cloneV4(def.ports||{in:[],out:[]}),lib:libName});
  BE.selected=id; renderBlockEditor(); syncCodeFromBlocksV4(\`dropped \${libName}\`); logConsole('success',\`Dropped \${libName} into Block Editor\`);
}
function bindLibraryDropTargetsV4(){
  if(PATCH_V4.libDropBound) return; PATCH_V4.libDropBound=true;
  const codeWrap=safeEl('code-editor');
  if(codeWrap){
    codeWrap.addEventListener('dragover',e=>{ if(e.dataTransfer.types.includes('application/x-forge-lib')||e.dataTransfer.types.includes('lib')){e.preventDefault();e.dataTransfer.dropEffect='copy';}},true);
    codeWrap.addEventListener('drop',e=>{ const name=e.dataTransfer.getData('application/x-forge-lib')||e.dataTransfer.getData('lib')||e.dataTransfer.getData('text/plain'); if(!name)return; e.preventDefault(); insertLibIntoCode(name.trim()); setEditorTab('code'); syncBlocksFromCodeV4('library import'); },true);
  }
  const blockEditor=safeEl('block-editor');
  if(blockEditor){
    blockEditor.addEventListener('dragover',e=>{ if(e.dataTransfer.types.includes('application/x-forge-lib')||e.dataTransfer.types.includes('lib')){e.preventDefault();e.dataTransfer.dropEffect='copy';}},true);
    blockEditor.addEventListener('drop',e=>{ const name=e.dataTransfer.getData('application/x-forge-lib')||e.dataTransfer.getData('lib')||e.dataTransfer.getData('text/plain'); if(!name)return; e.preventDefault(); const pt=beLocalPointV4(e); addBlockFromLibraryV4(name.trim(),pt.x,pt.y); },true);
  }
  const viewport=safeEl('viewport');
  if(viewport){
    viewport.addEventListener('dragover',e=>{ if(e.dataTransfer.types.includes('application/x-forge-lib')||e.dataTransfer.types.includes('lib')){e.preventDefault();e.dataTransfer.dropEffect='copy';}},true);
    viewport.addEventListener('drop',e=>{ const name=e.dataTransfer.getData('application/x-forge-lib')||e.dataTransfer.getData('lib')||e.dataTransfer.getData('text/plain'); if(!name)return; e.preventDefault(); const map={Camera:'camera',Sound:'audio',Sprites:'sprite',PixelArt:'sprite',Lights:'light',Triggers:'trigger',Models:'model',Particles:'particles',Shapes:'shape'}; addObject(map[name.trim()]||'shape'); },true);
  }
}

function buildLibList(){
  const el=safeEl('lib-list'); if(!el) return; el.innerHTML='';
  const cats={};
  LIBS.forEach(lib=>{ const cat=lib.name==='math'?'Utilities':['Camera','Canvas','Canvex','Image','Lights','Models'].includes(lib.name)?'Rendering':['Physics','Transform','Curves'].includes(lib.name)?'Simulation':['Events','Flow','Logic','Triggers'].includes(lib.name)?'Control':['Sound','Sprites','PixelArt','Particles','Shapes','Text'].includes(lib.name)?'Assets':'Core'; (cats[cat]||(cats[cat]=[])).push(lib); });
  Object.entries(cats).forEach(([cat,libs])=>{
    const catDiv=document.createElement('div'); catDiv.className='lib-category'; catDiv.innerHTML=\`<div class="lib-cat-title">\${cat}</div>\`;
    libs.forEach(lib=>{
      const block=document.createElement('div'); block.className='lib-block'; block.draggable=true; block.title='Drag to Code, Blocks, or Viewport';
      block.innerHTML=\`<div class="lib-block-dot" style="background:\${lib.color}"></div><div style="flex:1"><div style="font-size:12px;font-weight:600;color:var(--text0)">\${lib.name}</div><div style="font-size:10px;color:var(--text2)">\${lib.desc}</div></div>\`;
      block.addEventListener('dragstart',e=>{
        e.dataTransfer.effectAllowed='copy';
        e.dataTransfer.setData('application/x-forge-lib',lib.name);
        e.dataTransfer.setData('lib',lib.name);
        e.dataTransfer.setData('text/plain',lib.name);
        e.dataTransfer.setData('libColor',lib.color);
        block.classList.add('dragging');
      });
      block.addEventListener('dragend',()=>block.classList.remove('dragging'));
      block.ondblclick=()=>{ insertLibIntoCode(lib.name); setEditorTab('code'); };
      catDiv.appendChild(block);
    }); el.appendChild(catDiv);
  });
  bindLibraryDropTargetsV4();
}

function generateCode(){ syncCodeFromBlocksV4('manual generate'); setEditorTab('code'); logConsole('success','Code generated and synchronized from block graph'); }
function setBlockParam(blockId,key,val){ const b=BE.blocks.find(b=>b.id===blockId); if(b){ snapshotBlocks(); const p=(b.params||[]).find(p=>p.k===key); if(p)p.v=val; syncCodeFromBlocksV4('parameter changed'); } }

// Add a "Run Blocks" button to the block editor
function addRunBlocksButtonV4() {
  const blockEditor = safeEl('block-editor');
  if (!blockEditor) return;
  
  // Check if button already exists
  if (blockEditor._hasRunButton) return;
  blockEditor._hasRunButton = true;
  
  // Create button container
  const btnContainer = document.createElement('div');
  btnContainer.style.cssText = 'position: absolute; bottom: 16px; right: 16px; z-index: 500; display: flex; gap: 8px;';
  
  // Run Blocks button
  const runBtn = document.createElement('button');
  runBtn.innerHTML = '▶️ Run Blocks';
  runBtn.style.cssText = \`
    padding: 10px 14px;
    background: linear-gradient(135deg, #00d4ff 0%, #0091ff 100%);
    color: #000;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 212, 255, 0.4);
    transition: all 0.2s;
  \`;
  
  runBtn.onmouseover = () => {
    runBtn.style.boxShadow = '0 6px 16px rgba(0, 212, 255, 0.6)';
    runBtn.style.transform = 'translateY(-2px)';
  };
  runBtn.onmouseout = () => {
    runBtn.style.boxShadow = '0 4px 12px rgba(0, 212, 255, 0.4)';
    runBtn.style.transform = 'none';
  };
  
  runBtn.onclick = () => {
    if (BLOCK_EXECUTION_STATE.isRunning) {
      logConsole('warn', '⏸ Blocks are already running...');
      return;
    }
    runBlocksLiveV4();
  };
  
  btnContainer.appendChild(runBtn);
  blockEditor.appendChild(btnContainer);
}
function addBlock(){
  // Button/menu picker only: no textbox, no freeform typing.
  let modal=document.getElementById('modal-add-block');
  if(!modal){
    modal=document.createElement('div');
    modal.id='modal-add-block';
    modal.className='modal-overlay';
    modal.innerHTML=\`
      <div class="modal" style="min-width:560px;max-width:720px">
        <div class="modal-title">Add Block</div>
        <div style="font-size:12px;color:var(--text1);margin-bottom:16px">Use menu buttons only. No typing.</div>
        <div class="modal-row">
          <span class="modal-label">Category</span>
          <div class="ab-picker" id="ab-cat-picker"><button type="button" class="ab-picker-btn" id="ab-cat-btn">Category</button><div class="ab-picker-menu" id="ab-cat-menu"></div></div>
        </div>
        <div class="modal-row">
          <span class="modal-label">Block Type</span>
          <div class="ab-picker" id="ab-type-picker"><button type="button" class="ab-picker-btn" id="ab-type-btn">Block Type</button><div class="ab-picker-menu" id="ab-type-menu"></div></div>
        </div>
        <div id="ab-block-preview" style="margin-top:12px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg1);font-size:11px;color:var(--text2);min-height:42px"></div>
        <div class="modal-actions"><button class="modal-btn cancel" onclick="closeModal('modal-add-block')">Cancel</button><button class="modal-btn confirm" id="ab-confirm-btn" onclick="confirmAddBlock()">OK</button></div>
      </div>\`;
    if(!document.getElementById('ab-picker-style')){
      const style=document.createElement('style');
      style.id='ab-picker-style';
      style.textContent='.ab-picker{position:relative;flex:1}.ab-picker-btn{width:100%;text-align:left;background:var(--bg3);border:1px solid var(--border2);color:var(--text0);padding:9px 34px 9px 12px;font-size:12px;border-radius:var(--radius);font-family:var(--ui);font-weight:700;cursor:pointer}.ab-picker-btn:after{content:"▾";position:absolute;right:12px;color:var(--accent)}.ab-picker.open .ab-picker-btn,.ab-picker-btn:hover{border-color:var(--accent);background:rgba(0,212,255,.08)}.ab-picker-menu{display:none;position:absolute;left:0;right:0;top:calc(100% + 4px);max-height:240px;overflow:auto;background:var(--bg2);border:1px solid var(--border2);border-radius:var(--radius2);box-shadow:0 12px 36px rgba(0,0,0,.65);z-index:2000;padding:4px}.ab-picker.open .ab-picker-menu{display:block}.ab-menu-item{padding:7px 10px;border-radius:var(--radius);font-size:12px;color:var(--text1);cursor:pointer;display:flex;align-items:center;gap:8px}.ab-menu-item:hover,.ab-menu-item.active{background:rgba(0,212,255,.10);color:var(--accent)}.ab-color-dot{width:8px;height:8px;border-radius:50%;flex:0 0 8px}';
      document.head.appendChild(style);
    }
    modal.addEventListener('click',e=>{ if(e.target===modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }
  const cats=Object.keys(BLOCK_DEFS);
  let currentCat=(window._addBlockState&&window._addBlockState.cat) || cats[0];
  let currentType=(window._addBlockState&&window._addBlockState.type) || (BLOCK_DEFS[currentCat]?.types?.[0]?.name);
  const catBtn=document.getElementById('ab-cat-btn');
  const typeBtn=document.getElementById('ab-type-btn');
  const catMenu=document.getElementById('ab-cat-menu');
  const typeMenu=document.getElementById('ab-type-menu');
  const catPicker=document.getElementById('ab-cat-picker');
  const typePicker=document.getElementById('ab-type-picker');
  const preview=document.getElementById('ab-block-preview');
  function closeMenus(){ catPicker.classList.remove('open'); typePicker.classList.remove('open'); }
  function makeItem(label,color,active,onClick){
    const div=document.createElement('div');
    div.className='ab-menu-item'+(active?' active':'');
    div.innerHTML=(color?'<span class="ab-color-dot" style="background:'+color+'"></span>':'')+'<span>'+label+'</span>';
    div.onclick=(e)=>{ e.stopPropagation(); onClick(); closeMenus(); };
    return div;
  }
  function renderPicker(){
    // Get all available categories (both custom and dynamic)
    const allCats = { ...BLOCK_DEFS, ...generateBlockDefsFromLibs() };
    const cats = Object.keys(allCats);
    
    catMenu.innerHTML='';
    cats.forEach(cat=>catMenu.appendChild(makeItem(cat,allCats[cat]?.color,cat===currentCat,()=>{ currentCat=cat; currentType=(allCats[cat]?.types||[])[0]?.name; renderPicker(); })));
    typeMenu.innerHTML='';
    (allCats[currentCat]?.types||[]).forEach(def=>typeMenu.appendChild(makeItem(def.name,null,def.name===currentType,()=>{ currentType=def.name; renderPicker(); })));
    const def=(allCats[currentCat]?.types||[]).find(t=>t.name===currentType) || (allCats[currentCat]?.types||[])[0];
    if(!def){ preview.textContent='No blocks available.'; return; }
    currentType=def.name;
    catBtn.textContent=currentCat;
    typeBtn.textContent=def.name;
    preview.innerHTML='<div style="font-weight:700;color:'+allCats[currentCat].color+';margin-bottom:4px">['+currentCat+'] '+def.name+'</div><div>In: '+((def.ports?.in||[]).join(', ')||'—')+' &nbsp; Out: '+((def.ports?.out||[]).join(', ')||'—')+'</div>';
    window._addBlockState={cat:currentCat,type:def.name};
  }
  catBtn.onclick=(e)=>{ e.stopPropagation(); typePicker.classList.remove('open'); catPicker.classList.toggle('open'); };
  typeBtn.onclick=(e)=>{ e.stopPropagation(); catPicker.classList.remove('open'); typePicker.classList.toggle('open'); };
  modal.onclick=(e)=>{ if(!e.target.closest('.ab-picker')) closeMenus(); if(e.target===modal) modal.classList.remove('open'); };
  renderPicker();
  modal.classList.add('open');
  requestAnimationFrame(()=>catBtn.focus());
}
function confirmAddBlock(){
  const state=window._addBlockState||{};
  const cat=state.cat;
  const typeName=state.type;
  if(!cat||!typeName){ logConsole('warn','Select a block type first'); return; }
  
  // Check both custom and dynamic block definitions
  const allCats = { ...BLOCK_DEFS, ...generateBlockDefsFromLibs() };
  if(!allCats[cat]){ logConsole('error','Category not found'); return; }
  
  const def=allCats[cat].types.find(t=>t.name===typeName);
  if(!def){ logConsole('error','Block type not found'); return; }
  
  snapshotBlocks();
  const id=Math.max(BE.nextId,...BE.blocks.map(b=>b.id+1),1); 
  BE.nextId=id+1;
  
  const blockData = {
    id, cat, type:def.name, 
    x:120+Math.random()*400, 
    y:80+Math.random()*300,
    params:def.params.map(p=>({...p})),
    ports:cloneV4(def.ports)
  };
  
  // Add library info if this is a dynamic library block
  if (def.library) {
    blockData.library = def.library;
    blockData.method = def.method;
  }
  
  BE.blocks.push(blockData);
  BE.selected=id;
  renderBlockEditor(); 
  syncCodeFromBlocksV4('block added');
  logConsole('success',\`Added [\${cat}] \${def.name}\`);
  closeModal('modal-add-block');
}
function deleteSelected(){ if(!BE.selected)return; snapshotBlocks(); BE.blocks=BE.blocks.filter(b=>b.id!==BE.selected); BE.connections=BE.connections.filter(c=>c.from!==BE.selected&&c.to!==BE.selected); BE.selected=null; renderBlockEditor(); syncCodeFromBlocksV4('block deleted'); }
function clearBlocks(){ snapshotBlocks(); BE.blocks=[]; BE.connections=[]; BE.selected=null; BE.nextId=1; renderBlockEditor(); syncCodeFromBlocksV4('blocks cleared'); }
function buildBlockEditor(){
  // Start blank on load. Users add blocks manually from the toolbar or by dragging libraries in.
  BE.blocks=[];
  BE.connections=[];
  BE.selected=null;
  BE.nextId=1;
  ensureBlockViewV4(); renderBlockEditor();
}
const __v4OldEnd = (typeof onBlockConnectEnd==='function') ? onBlockConnectEnd : null;
function onBlockConnectEnd(e){
  if(!V3.connecting) return;
  const over=e.target?.classList?.contains('be-connector') ? e.target : null;
  if(over){
    const target={blockId:+over.dataset.block,port:over.dataset.port,dir:over.dataset.dir};
    if(canConnectPorts(V3.connecting,target)){
      snapshotBlocks(); const c=normalizeConnection(V3.connecting,target);
      BE.connections=BE.connections.filter(x=>!(x.to===c.to&&x.toPort===c.toPort)); BE.connections.push(c);
      logConsole('success',\`Connected \${c.fromPort} → \${c.toPort}\`); syncCodeFromBlocksV4('connection changed');
    } else logConsole('warn','Invalid connection: connect an output to an input on a different block.');
  }
  V3.previewPath?.remove(); V3.previewPath=null; V3.connecting=null; V3.hoverTarget=null; clearConnectorAvailability(); renderBlockEditor();
}
function onCodeInput(e){
  refreshCodeHighlight(); updateCursor();
  // Do NOT sync blocks while the user is actively typing.
  // Block sync happens on blur (focus-out) so typing is never interrupted.
  const ta=safeEl('code-area');
  if(ta && V3.codeUndo && V3.codeUndo[V3.codeUndo.length-1]!==ta.value){
    V3.codeUndo.push(ta.value);
    if(V3.codeUndo.length>V3.max) V3.codeUndo.shift();
    V3.codeRedo=[];
  }
}
function initCodeEditor(){
  const ta=safeEl('code-area'); if(!ta) return;
  // Fresh load is intentionally empty. Generated block code appears only after blocks are added.
  ta.value=''; refreshCodeHighlight(); syncScroll(); updateCursor();
  PATCH_V4.lastGraphHash=graphHashV4(); PATCH_V4.lastCodeHash=hashStringV4(ta.value);
  if(!ta._blurBound){ ta._blurBound=true;
    ta.addEventListener('blur',()=>{
      if(ta.value.trim()===''){
        if(BE.blocks.length || BE.connections.length){ snapshotBlocks(); BE.blocks=[]; BE.connections=[]; BE.selected=null; BE.nextId=1; renderBlockEditor(); }
        setCodeStatusV4(true,'empty script');
      } else {
        syncBlocksFromCodeV4('code blur',true);
      }
      if(STATE.openScriptName && SCRIPT_STORE && SCRIPT_STORE[STATE.openScriptName]!==undefined){
        SCRIPT_STORE[STATE.openScriptName]=ta.value;
        logConsole('info',\`Script saved: \${STATE.openScriptName}\`);
      }
    });
  }
}
function validateCodeSyntaxV4(code){
  const body=String(code||'').split('\\n').filter(line=>!/^\\s*import\\b/.test(line)).join('\\n');
  try{ new Function(body); return null; }catch(err){ return err.message; }
}
function validateBlocks(){
  const errors=[];
  BE.blocks.forEach(b=>{
    const def=findBlockDef(b.cat,b.type);
    if(!def) errors.push(\`Unknown block: \${b.cat}/\${b.type}\`);
    if(def?.ports?.in?.length>0 && !BE.connections.some(c=>c.to===b.id)) errors.push(\`"\${b.type}" has no input connection\`);
  });
  BE.connections.forEach(c=>{
    const a={blockId:c.from,port:c.fromPort,dir:'out'}, b={blockId:c.to,port:c.toPort,dir:'in'};
    if(!canConnectPorts(a,b) && !BE.connections.some(x=>x!==c&&x.from===c.from&&x.fromPort===c.fromPort&&x.to===c.to&&x.toPort===c.toPort)) errors.push(\`Invalid connection \${c.from}.\${c.fromPort} -> \${c.to}.\${c.toPort}\`);
  });
  const ta=safeEl('code-area'); if(ta){ try{parseCodeToBlocksV4(ta.value);}catch(err){errors.push('Code sync: '+err.message);} const syntaxErr=validateCodeSyntaxV4(ta.value); if(syntaxErr) errors.push('Code syntax: '+syntaxErr); }
  const v=safeEl('be-valid'); v.classList.remove('hidden');
  if(errors.length===0){v.className='be-valid ok';v.textContent='✓ Graph + code valid';logConsole('success','Block graph and code validation passed');setCodeStatusV4(true,'validated');}
  else{v.className='be-valid err';v.textContent=\`✕ \${errors.length} error(s)\`;errors.forEach(e=>logConsole('error',e));setCodeStatusV4(false,\`\${errors.length} error(s)\`);} setTimeout(()=>v.classList.add('hidden'),5000);
}

function bindForgeV4(){
  const style=document.createElement('style'); style.textContent='#block-editor{cursor:default}.be-canvas,.be-svg{transform-origin:0 0}.be-block{will-change:left,top}.lib-block.dragging{opacity:.55}.be-orbit-help{position:absolute;right:10px;bottom:10px;font:10px var(--mono);color:var(--text2);background:rgba(8,9,13,.82);border:1px solid var(--border);padding:4px 8px;border-radius:var(--radius);z-index:9;pointer-events:none}'; document.head.appendChild(style);
  const be=safeEl('block-editor'); if(be && !safeEl('be-orbit-help')){ const h=document.createElement('div'); h.id='be-orbit-help'; h.className='be-orbit-help'; h.textContent='Wheel zoom · Shift/Alt/MMB drag pan'; be.appendChild(h); }
  bindBlockOrbitV4(); bindLibraryDropTargetsV4(); applyBlockViewV4(); syncCodeFromBlocksV4('initial sync');
}


function existingConnectionValidV4(c){
  const outBlock=BE.blocks.find(b=>b.id===c.from), inBlock=BE.blocks.find(b=>b.id===c.to);
  if(!outBlock || !inBlock || outBlock.id===inBlock.id) return false;
  const outs=(blockDefFor(outBlock).ports?.out||[]), inns=(blockDefFor(inBlock).ports?.in||[]);
  return outs.includes(c.fromPort) && inns.includes(c.toPort);
}
function validateBlocks(){
  const errors=[];
  BE.blocks.forEach(b=>{
    const def=findBlockDef(b.cat,b.type);
    if(!def) errors.push(\`Unknown block: \${b.cat}/\${b.type}\`);
    if(def?.ports?.in?.length>0 && !BE.connections.some(c=>c.to===b.id)) errors.push(\`"\${b.type}" has no input connection\`);
  });
  const seen=new Set();
  BE.connections.forEach(c=>{
    const key=\`\${c.from}:\${c.fromPort}->\${c.to}:\${c.toPort}\`;
    if(seen.has(key)) errors.push(\`Duplicate connection \${key}\`);
    seen.add(key);
    if(!existingConnectionValidV4(c)) errors.push(\`Invalid connection \${c.from}.\${c.fromPort} -> \${c.to}.\${c.toPort}\`);
  });
  const ta=safeEl('code-area');
  if(ta){
    try{ parseCodeToBlocksV4(ta.value); }
    catch(err){ errors.push('Code sync: '+err.message); }
    const syntaxErr=validateCodeSyntaxV4(ta.value);
    if(syntaxErr) errors.push('Code syntax: '+syntaxErr);
  }
  const v=safeEl('be-valid');
  if(v) v.classList.remove('hidden');
  if(errors.length===0){
    if(v){v.className='be-valid ok';v.textContent='✓ Graph + code valid';}
    logConsole('success','Block graph and code validation passed'); setCodeStatusV4(true,'validated');
  } else {
    if(v){v.className='be-valid err';v.textContent=\`✕ \${errors.length} error(s)\`;}
    errors.forEach(e=>logConsole('error',e)); setCodeStatusV4(false,\`\${errors.length} error(s)\`);
  }
  if(v) setTimeout(()=>v.classList.add('hidden'),5000);
}
  // Explicit init; this module may be mounted after DOMContentLoaded has already fired.
  buildAssetTree();
  buildLibList();
  buildPropsPanel();
  buildHierarchy();
  buildBlockEditor();
  initCodeEditor();
  initPixelEditor();
  renderViewport();
  updateStatusBar();
  startFpsCounter();
  logConsole('info', 'FORGE Engine initialized');
  logConsole('success', \`Project "\${STATE.projectName}" loaded\`);
  logConsole('info', \`Libs loaded: \${LIBS.length} modules\`);
  if (document.getElementById('pe-color-preview')) document.getElementById('pe-color-preview').style.background = PE.color;
  bindForgeV3();
  bindForgeV4();
  setLeftTab(STATE.leftTab || 'assets');


  // ═══════════════════════════════════════════════════════════════
  //  COPILOT PATCH V5: use pixelart.js as the Pixel Art editor
  // ═══════════════════════════════════════════════════════════════
  // GameEditor previously carried a small legacy pixel editor inline.  The
  // real editor now lives in pixelart.js as the PixelArt class.  Because the
  // runtime is executed through new Function(...), PixelArt is passed in as an
  // argument from GameEditor.mount() and is available here by name.
  var PIXELART_BRIDGE = (typeof PIXELART_BRIDGE !== 'undefined' && PIXELART_BRIDGE) || {
    instance: null,
    container: null,
    root: null,
    initialized: false,
  };

  function ensurePixelArtBridgeState() {
    if (!PIXELART_BRIDGE) {
      PIXELART_BRIDGE = {
        instance: null,
        container: null,
        root: null,
        initialized: false,
      };
    }
    return PIXELART_BRIDGE;
  }


  function getPixelArtOptions() {
    ensurePixelArtBridgeState();

    const w = Number(document.getElementById('pe-w')?.value) || PE?.w || 32;
    const h = Number(document.getElementById('pe-h')?.value) || PE?.h || 32;
    return {
      cols: Math.max(1, Math.min(512, Math.round(w))),
      rows: Math.max(1, Math.min(512, Math.round(h))),
      cellSize: 18,
      showGrid: true,
    };
  }

  function ensurePixelArtEditor() {
    ensurePixelArtBridgeState();

    const container = document.getElementById('pixel-editor');
    if (!container) return null;

    if (PIXELART_BRIDGE.instance) {
      try { PIXELART_BRIDGE.instance.render?.(); } catch (_) {}
      return PIXELART_BRIDGE.instance;
    }

    if (typeof PixelArt !== 'function') {
      logConsole?.('error', 'PixelArt editor import is unavailable. Check ./pixelart.js export.');
      setStatusMsg?.('PixelArt import failed');
      return null;
    }

    // Replace the old inline pixel-editor markup with the full PixelArt UI.
    container.innerHTML = '';
    container.style.position = 'relative';
    container.style.display = 'flex';
    container.style.overflow = 'hidden';

    const root = document.createElement('div');
    root.id = 'pixel-art-editor-root';
    root.style.cssText = 'position:relative;width:100%;height:100%;min-width:0;min-height:0;flex:1;';
    container.appendChild(root);

    const editor = new PixelArt(root, getPixelArtOptions());
    PIXELART_BRIDGE.instance = editor;
    PIXELART_BRIDGE.container = container;
    PIXELART_BRIDGE.root = root;
    PIXELART_BRIDGE.initialized = true;

    // Keep the initial FORGE-selected color if one exists.
    if (PE?.color) {
      try { editor.setColor(PE.color); } catch (_) {}
    }

    // Hook render() to silently sync edited pixels back to sprite objects.
    // PixelArt calls render() after every stroke/undo/redo so this catches all edits.
    // We debounce to 400ms so a fast paint stroke only triggers ONE sync, not hundreds.
    const _origRender = editor.render.bind(editor);
    let _syncTimer = null;
    let _lastSyncURL = null;
    editor.render = function(...args) {
      _origRender(...args);
      clearTimeout(_syncTimer);
      _syncTimer = setTimeout(() => {
        try {
          // Only run if the pixel editor tab is actually visible
          const pixelPanel = document.getElementById('pixel-editor');
          if (!pixelPanel || pixelPanel.classList.contains('hidden')) return;
          if (typeof autosavePixelEditorToSpritePreview === 'function') {
            autosavePixelEditorToSpritePreview();
          }
        } catch(_) {}
      }, 400);
    };

    logConsole?.('success', 'PixelArt editor loaded from pixelart.js');
    setStatusMsg?.('PixelArt ready');
    return editor;
  }

  // Keep the old public function names because markup, handlers, and the final
  // window export table reference them.  They now proxy to pixelart.js.
  function initPixelEditor() {
    // Lazy-init: the Pixel tab is hidden during startup, so wait until it is
    // visible. PixelArt measures its container during construction.
    ensurePixelArtBridgeState();
    PIXELART_BRIDGE.initialized = false;
    const preview = document.getElementById('pe-color-preview');
    if (preview && PE?.color) preview.style.background = PE.color;
  }

  function drawPeCanvas() {
    const panel = document.getElementById('pixel-editor');
    if (!panel || panel.classList.contains('hidden')) return;
    const editor = ensurePixelArtEditor();
    requestAnimationFrame(() => {
      try { editor?.render?.(); } catch (_) {}
    });
  }

  function setPeColor(c) {
    if (!c) return;
    if (typeof PE !== 'undefined') PE.color = c;
    const preview = document.getElementById('pe-color-preview');
    const picker = document.getElementById('pe-color-picker');
    if (preview) preview.style.background = c;
    if (picker) picker.value = c;
    try { PIXELART_BRIDGE.instance?.setColor(c); } catch (_) {}
    if (typeof buildPePalette === 'function' && document.getElementById('pe-palette')) {
      try { buildPePalette(); } catch (_) {}
    }
  }

  function resizePeCanvas() {
    const editor = ensurePixelArtEditor();
    const { cols, rows } = getPixelArtOptions();
    try { editor?.resize?.(cols, rows); } catch (_) {}
  }

  function setPeZoom(v) {
    // PixelArt owns zoom internally via wheel/pinch/keyboard. Preserve this
    // function only for compatibility with the previous inline controls.
    if (typeof PE !== 'undefined') PE.zoom = Number(v) || PE.zoom || 12;
    drawPeCanvas();
  }

  function addPeLayer() {
    ensurePixelArtEditor()?.addLayer?.();
  }

  function renderPeLayers() {
    // Layers are rendered by pixelart.js. Kept as a no-op compatibility shim.
    drawPeCanvas();
  }

  function togglePeLayer() {
    ensurePixelArtBridgeState();

    logConsole?.('info', 'Use the PixelArt layer panel to toggle layer visibility.');
  }

  function exportPeSprite() {
    const editor = ensurePixelArtEditor();
    if (!editor) return;
    try {
      editor.downloadPNG?.('sprite.png');
      logConsole?.('success', 'Exported sprite with pixelart.js');
    } catch (err) {
      logConsole?.('error', 'PixelArt export failed: ' + (err?.message || err));
    }
  }

  function destroyPixelEditor() {
    ensurePixelArtBridgeState();

    try { PIXELART_BRIDGE.instance?.stopAnimation?.(); } catch (_) {}
    PIXELART_BRIDGE.instance = null;
    PIXELART_BRIDGE.container = null;
    PIXELART_BRIDGE.root = null;
    PIXELART_BRIDGE.initialized = false;
  }


  // ═══════════════════════════════════════════════════════════════
  //  COPILOT PATCH V6: empty asset sections, auto sprite texture, contextual right-click menus
  // ═══════════════════════════════════════════════════════════════
  function normalizeAssetSectionsV6() {
    const sections = [
      {name:'Sprites', icon:'🖼', open:false, children:[]},
      {name:'Audio', icon:'🔊', open:false, children:[]},
      {name:'Scripts', icon:'📜', open:false, children:[]},
      {name:'Shaders', icon:'✦', open:false, children:[]},
      {name:'Scenes', icon:'🎬', open:true, children:[{name:'main.scene', icon:'🎬'}]},
      {name:'Models', icon:'📦', open:false, children:[]},
      {name:'Materials', icon:'◆', open:false, children:[]},
      {name:'Prefabs', icon:'◇', open:false, children:[]}
    ];
    const existing = new Map((ASSET_TREE || []).map(function(sec){ return [sec.name, sec]; }));
    sections.forEach(function(sec){
      const old = existing.get(sec.name);
      if (old) {
        sec.open = old.open !== undefined ? old.open : sec.open;
        const merged = (old.children || []).concat(sec.children || []);
        const seen = new Set();
        sec.children = merged.filter(function(item){
          if (!item || seen.has(item.name)) return false;
          seen.add(item.name);
          return true;
        });
      }
    });
    ASSET_TREE.splice.apply(ASSET_TREE, [0, ASSET_TREE.length].concat(sections));
  }
  function findAssetSectionV6(name) { return ASSET_TREE.find(function(sec){ return sec.name === name; }); }
  function addAssetToSectionV6(sectionName, asset) {
    normalizeAssetSectionsV6();
    const sec = findAssetSectionV6(sectionName);
    if (!sec || !asset || !asset.name) return;
    if (!sec.children.some(function(c){ return c.name === asset.name; })) sec.children.push(asset);
    sec.open = true;
    buildAssetTree();
  }
  function hasFileExtV6(name, exts) {
    const lower = String(name || '').toLowerCase();
    return exts.some(function(ext){ return lower.endsWith(ext); });
  }
  function buildAssetTree() {
    normalizeAssetSectionsV6();
    const el = safeEl('asset-tree') || document.getElementById('asset-tree');
    if (!el) return;
    el.innerHTML = '';
    ASSET_TREE.forEach(function(sec){
      const secDiv = document.createElement('div');
      secDiv.className = 'tree-section';
      secDiv.dataset.section = sec.name;
      const hdr = document.createElement('div');
      hdr.className = 'tree-section-header' + (sec.open ? ' open' : '');
      hdr.innerHTML = '<span class="arrow">▶</span>' + sec.icon + ' ' + sec.name;
      const childEl = document.createElement('div');
      if (!sec.open) childEl.classList.add('hidden');
      hdr.onclick = function(){
        sec.open = !sec.open;
        hdr.classList.toggle('open', sec.open);
        childEl.classList.toggle('hidden', !sec.open);
      };
      secDiv.appendChild(hdr);
      if (!sec.children || sec.children.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'tree-empty';
        empty.textContent = 'empty';
        childEl.appendChild(empty);
      } else {
        sec.children.forEach(function(c){
          const item = document.createElement('div');
          item.className = 'tree-item';
          item.dataset.assetName = c.name;
          item.dataset.assetIcon = c.icon;
          item.dataset.section = sec.name;
          const canOpen = hasFileExtV6(c.name, ['.js','.png','.jpg','.jpeg','.gif','.webp','.glsl','.wgsl','.scene','.wav','.mp3','.ogg','.obj','.fbx','.glb','.gltf']);
          item.innerHTML = '<span class="tree-icon">' + c.icon + '</span><span style="flex:1">' + c.name + '</span>' + (canOpen ? '<span style="font-size:9px;color:var(--text3);font-family:var(--mono)">dbl</span>' : '');
          item.title = canOpen ? ('Double-click to open ' + c.name) : c.name;
          item.onclick = function(){
            document.querySelectorAll('#asset-tree .tree-item').forEach(function(i){ i.classList.remove('selected'); });
            item.classList.add('selected');
            if (c.icon === '🖼' || hasFileExtV6(c.name, ['.png','.jpg','.jpeg','.gif','.webp'])) openAsset(c.name, c.icon);
          };
          item.ondblclick = function(){ openAsset(c.name, c.icon); };
          childEl.appendChild(item);
        });
      }
      secDiv.appendChild(childEl);
      el.appendChild(secDiv);
    });
  }
  function getPixelArtRawCanvasV6(editor) {
    const candidates = [];
    ['exportCanvas','outputCanvas','spriteCanvas','artCanvas','drawingCanvas','bitmapCanvas','canvas','previewCanvas'].forEach(function(key){ if (editor && editor[key]) candidates.push(editor[key]); });
    const root = PIXELART_BRIDGE && PIXELART_BRIDGE.root;
    if (root) root.querySelectorAll('canvas').forEach(function(canvas){ candidates.push(canvas); });
    candidates.sort(function(a,b){
      function score(c) {
        const area = (c.width || 0) * (c.height || 0);
        const cssW = parseFloat(c.style.width) || c.clientWidth || c.width || 0;
        const cssH = parseFloat(c.style.height) || c.clientHeight || c.height || 0;
        const cssArea = cssW * cssH;
        return (area <= 128 * 128 ? 0 : 1000000) + area + Math.abs(cssArea - area) * 0.01;
      }
      return score(a) - score(b);
    });
    return candidates[0] || null;
  }
  function getPixelEditorDataURL() {
    const editor = ensurePixelArtEditor && ensurePixelArtEditor();
    if (editor) {
      const methods = ['exportPNG','toDataURL','getDataURL','getPNGDataURL','exportDataURL','serializePNG','getImageDataURL'];
      for (const name of methods) {
        if (typeof editor[name] === 'function') {
          try { const out = editor[name]('image/png'); if (typeof out === 'string' && out.startsWith('data:image')) return out; } catch (_) {}
          try { const out = editor[name](); if (typeof out === 'string' && out.startsWith('data:image')) return out; } catch (_) {}
        }
      }
      try {
        const cols = editor.cols || editor.width || editor.w || (PE && PE.w) || 32;
        const rows = editor.rows || editor.height || editor.h || (PE && PE.h) || 32;
        const layers = editor.layers || (editor.state && editor.state.layers);
        if (Array.isArray(layers) && cols && rows) {
          const outCanvas = document.createElement('canvas');
          outCanvas.width = cols;
          outCanvas.height = rows;
          const ctx = outCanvas.getContext('2d');
          layers.forEach(function(layer){
            if (layer.visible === false) return;
            const data = layer.data || layer.pixels || (layer.imageData && layer.imageData.data);
            if (data && data.length >= cols * rows * 4) ctx.putImageData(new ImageData(new Uint8ClampedArray(data), cols, rows), 0, 0);
            else if (layer.canvas) ctx.drawImage(layer.canvas, 0, 0, cols, rows);
          });
          return outCanvas.toDataURL('image/png');
        }
      } catch (_) {}
      const canvas = getPixelArtRawCanvasV6(editor);
      if (canvas && typeof canvas.toDataURL === 'function') {
        try { return canvas.toDataURL('image/png'); } catch (_) {}
      }
    }
    if (PE && PE.layers && PE.w && PE.h) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = PE.w;
      tempCanvas.height = PE.h;
      const tc = tempCanvas.getContext('2d');
      PE.layers.forEach(function(layer){
        if (!layer.visible) return;
        const id = new ImageData(new Uint8ClampedArray(layer.data), PE.w, PE.h);
        tc.putImageData(id, 0, 0);
      });
      return tempCanvas.toDataURL('image/png');
    }
    return null;
  }
  function primeSpriteImageV6(dataURL, cb) {
    if (!dataURL) return;
    if (_spriteImageCache[dataURL]) { if (cb) cb(_spriteImageCache[dataURL]); return; }
    ensureSpriteImageLoaded(null, dataURL, function(img){ if (cb) cb(img); });
  }
  function applySpriteTextureToObjectV6(obj, dataURL, sourceName) {
    if (!obj || obj.type !== 'sprite' || !dataURL) return;
    obj.pixelDataURL = dataURL;
    obj.pixelW = (PE && PE.w) || 32;
    obj.pixelH = (PE && PE.h) || 32;
    if (sourceName) obj.spriteSrc = sourceName;
    STATE.lastSpriteDataURL = dataURL;
    STATE.lastSpriteAssetName = sourceName || obj.spriteSrc || obj.name;
    primeSpriteImageV6(dataURL, function(){ renderViewport(); });
  }
  function savePixelArtToSprite() {
    const dataURL = getPixelEditorDataURL();
    if (!dataURL) { logConsole('error', 'Could not read the Pixel Art canvas.'); setStatusMsg('Pixel save failed'); return; }
    const selectedObj = STATE.objects.find(function(o){ return o.id === STATE.selectedId; });
    const targetObj = selectedObj && selectedObj.type === 'sprite' ? selectedObj : (STATE.editingSpriteName ? STATE.objects.find(function(o){ return o.type === 'sprite' && (o.spriteSrc === STATE.editingSpriteName || o.name.toLowerCase().indexOf(String(STATE.editingSpriteName).split('.')[0].toLowerCase()) !== -1); }) : null);
    const assetName = STATE.editingSpriteName || (targetObj && targetObj.spriteSrc) || (targetObj && targetObj.name) || ('sprite-' + Date.now() + '.png');
    if (!STATE.spritePixelData) STATE.spritePixelData = {};
    STATE.spritePixelData[assetName] = {dataURL:dataURL, w:(PE && PE.w) || 32, h:(PE && PE.h) || 32, updatedAt:Date.now()};
    SPRITE_PIXELDATA[assetName] = dataURL;
    addAssetToSectionV6('Sprites', {name:assetName, icon:'🖼'});
    if (targetObj) {
      applySpriteTextureToObjectV6(targetObj, dataURL, assetName);
      buildHierarchy();
      renderViewport();
      logConsole('success', 'Pixel art saved and auto-shown on canvas: ' + targetObj.name);
      setStatusMsg('Sprite texture updated: ' + targetObj.name + ' ✓');
    } else {
      STATE.lastSpriteDataURL = dataURL;
      STATE.lastSpriteAssetName = assetName;
      logConsole('success', 'Pixel art saved to sprite asset: ' + assetName);
      setStatusMsg('Saved sprite asset: ' + assetName + ' ✓');
    }
  }
  const __addObjectBeforeV6 = addObject;
  function addObject(type) {
    __addObjectBeforeV6(type);
    const obj = STATE.objects.find(function(o){ return o.id === STATE.selectedId; });
    if (type === 'sprite' && obj) {
      const assetName = STATE.lastSpriteAssetName || STATE.editingSpriteName;
      const savedEntry = assetName ? ((SPRITE_PIXELDATA && SPRITE_PIXELDATA[assetName]) || (STATE.spritePixelData && STATE.spritePixelData[assetName] && STATE.spritePixelData[assetName].dataURL)) : STATE.lastSpriteDataURL;
      if (savedEntry) applySpriteTextureToObjectV6(obj, typeof savedEntry === 'string' ? savedEntry : savedEntry.dataURL, assetName);
      buildHierarchy();
      renderViewport();
    }
  }
  function newSpriteAssetV6() {
    const name = 'sprite-' + Date.now().toString().slice(-5) + '.png';
    STATE.editingSpriteName = name;
    addAssetToSectionV6('Sprites', {name:name, icon:'🖼'});
    setEditorTab('pixels');
    logConsole('success', 'Created sprite asset: ' + name);
  }
  function newScriptAssetV6() {
    const name = 'script-' + Date.now().toString().slice(-5) + '.js';
    SCRIPT_STORE[name] = '';
    addAssetToSectionV6('Scripts', {name:name, icon:'📜'});
    openAsset(name, '📜');
  }
  function deleteSelectedAssetV6(assetName, sectionName) {
    const sec = findAssetSectionV6(sectionName);
    if (!sec) return;
    sec.children = sec.children.filter(function(c){ return c.name !== assetName; });
    if (STATE.spritePixelData) delete STATE.spritePixelData[assetName];
    delete SPRITE_PIXELDATA[assetName];
    delete SCRIPT_STORE[assetName];
    buildAssetTree();
    setStatusMsg('Deleted asset: ' + assetName);
  }
  function viewportObjectAtEventV6(e) {
    if (STATE.mode !== '2d') return null;
    const coords = getVpCoords(e);
    let hit = null;
    Array.from(STATE.objects).reverse().forEach(function(obj){
      if (!hit && obj.visible && coords.x >= obj.x - obj.w / 2 && coords.x <= obj.x + obj.w / 2 && coords.y >= obj.y - obj.h / 2 && coords.y <= obj.y + obj.h / 2) hit = obj;
    });
    return hit;
  }
  function getContextTargetV6(e) {
    const assetItem = e.target.closest && e.target.closest('#asset-tree .tree-item');
    const assetSection = e.target.closest && e.target.closest('#asset-tree .tree-section-header');
    const block = e.target.closest && e.target.closest('.be-block');
    if (assetItem) return {type:'asset-item', name:assetItem.dataset.assetName, icon:assetItem.dataset.assetIcon, section:assetItem.dataset.section};
    if (assetSection) return {type:'asset-section', section:assetSection.parentElement && assetSection.parentElement.dataset.section};
    if (e.target.closest && e.target.closest('#code-editor')) return {type:'code'};
    if (e.target.closest && e.target.closest('#block-editor')) return {type:'blocks', blockId:block && block.id && block.id.replace('be-block-', '')};
    if (e.target.closest && e.target.closest('#pixel-editor')) return {type:'pixels'};
    if (e.target.closest && e.target.closest('#viewport')) return {type:'viewport', object:viewportObjectAtEventV6(e)};
    return {type:'workspace'};
  }
  function menuItemV6(label, action, danger) { return {label:label, action:action, danger:!!danger}; }
  function menuForContextV6(ctx) {
    if (ctx.type === 'asset-item') return {title:'Asset: ' + ctx.name, items:[
      menuItemV6('Open', function(){ openAsset(ctx.name, ctx.icon); }),
      menuItemV6('Reveal in Pixel Editor', function(){ openAsset(ctx.name, ctx.icon); }),
      'sep', menuItemV6('Delete Asset', function(){ deleteSelectedAssetV6(ctx.name, ctx.section); }, true)
    ]};
    if (ctx.type === 'asset-section') return {title:ctx.section || 'Assets', items:[
      menuItemV6('New Sprite Asset', newSpriteAssetV6),
      menuItemV6('New Script Asset', newScriptAssetV6),
      menuItemV6('Refresh Assets', buildAssetTree)
    ]};
    if (ctx.type === 'viewport') {
      if (ctx.object) {
        selectObject(ctx.object.id);
        return {title:'Object: ' + ctx.object.name, items:[
          menuItemV6('Edit Properties', function(){ setLeftTab('props'); }),
          menuItemV6('Copy', function(){ viewportEdit('copy'); }),
          menuItemV6('Duplicate', function(){ viewportEdit('copy'); viewportEdit('paste'); }),
          ctx.object.type === 'sprite' ? menuItemV6('Edit Sprite Texture', function(){ STATE.editingSpriteName = ctx.object.spriteSrc || ctx.object.name; setEditorTab('pixels'); }) : null,
          'sep', menuItemV6('Delete Object', function(){ deleteObject(ctx.object.id); }, true)
        ].filter(Boolean)};
      }
      return {title:'Viewport', items:[
        menuItemV6('Add Sprite', function(){ addObject('sprite'); }),
        menuItemV6('Add Camera', function(){ addObject('camera'); }),
        menuItemV6('Add Light', function(){ addObject('light'); }),
        'sep', menuItemV6('Paste Object', function(){ viewportEdit('paste'); }),
        menuItemV6('Reset Camera', resetCamera)
      ]};
    }
    if (ctx.type === 'blocks') return {title:'Block Editor', items:[menuItemV6('Add Block', addBlock), menuItemV6('Paste Block', function(){ blockEdit('paste'); }), menuItemV6('Reset View', resetBlockViewV4), 'sep', menuItemV6('Clear Blocks', clearBlocks, true)]};
    if (ctx.type === 'code') return {title:'Code Editor', items:[menuItemV6('Cut', function(){ codeEdit('cut'); }), menuItemV6('Copy', function(){ codeEdit('copy'); }), menuItemV6('Paste', function(){ codeEdit('paste'); }), 'sep', menuItemV6('Format Code', formatCode), menuItemV6('Run Snippet', runSnippet)]};
    if (ctx.type === 'pixels') return {title:'Pixel Art', items:[menuItemV6('Save to Sprite', savePixelArtToSprite), menuItemV6('Export PNG', exportPeSprite), menuItemV6('New Sprite Asset', newSpriteAssetV6)]};
    return {title:'FORGE', items:[menuItemV6('New Sprite', function(){ addObject('sprite'); }), menuItemV6('Project Settings', openProjectSettings)]};
  }
  function ensureContextMenuV6() {
    let menu = safeEl('forge-context-menu');
    if (menu) return menu;
    menu = document.createElement('div');
    menu.id = 'forge-context-menu';
    menu.className = 'forge-context-menu';
    document.body.appendChild(menu);
    return menu;
  }
  function showContextMenuV6(e) {
    const ctx = getContextTargetV6(e);
    const spec = menuForContextV6(ctx);
    const menu = ensureContextMenuV6();
    menu.innerHTML = '<div class="forge-cm-title">' + spec.title + '</div>';
    spec.items.forEach(function(item){
      if (item === 'sep') {
        const sep = document.createElement('div');
        sep.className = 'forge-cm-sep';
        menu.appendChild(sep);
        return;
      }
      const div = document.createElement('div');
      div.className = 'forge-cm-item' + (item.danger ? ' danger' : '');
      div.textContent = item.label;
      div.onclick = function(){ hideContextMenuV6(); if (item.action) item.action(); };
      menu.appendChild(div);
    });
    menu.classList.add('open');
    menu.style.display = 'block';
    const x = Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 8);
    const y = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8);
    menu.style.left = Math.max(4, x) + 'px';
    menu.style.top = Math.max(4, y) + 'px';
  }
  function hideContextMenuV6() {
    const menu = safeEl('forge-context-menu');
    if (menu) { menu.classList.remove('open'); menu.style.display = 'none'; }
  }
  function bindForgeV6() {
    normalizeAssetSectionsV6();
    buildAssetTree();
    const root = safeEl('app') || document.body;
    if (root && !root._forgeContextV6) {
      root._forgeContextV6 = true;
      root.addEventListener('contextmenu', function(e){ e.preventDefault(); e.stopPropagation(); showContextMenuV6(e); }, true);
      document.addEventListener('click', hideContextMenuV6, true);
      window.addEventListener('resize', hideContextMenuV6);
      document.addEventListener('keydown', function(e){ if (e.key === 'Escape') hideContextMenuV6(); });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  COPILOT PATCH V8: Done button, sprite drag-to-viewport, import/upload/rename/use
  // ═══════════════════════════════════════════════════════════════
  function assetAcceptForSectionV8(sectionName){
    return ({Sprites:'image/png,image/jpeg,image/gif,image/webp',Audio:'audio/*,.wav,.mp3,.ogg',Scripts:'.js,text/javascript,application/javascript,text/plain',Shaders:'.glsl,.wgsl,text/plain',Scenes:'.scene,.json,application/json,text/plain',Models:'.obj,.fbx,.glb,.gltf,application/octet-stream',Materials:'.mat,.json,text/plain,application/json',Prefabs:'.prefab,.json,text/plain,application/json'})[sectionName] || '*/*';
  }
  function iconForAssetFileV8(sectionName,fileName){
    const lower=String(fileName||'').toLowerCase();
    if(sectionName==='Sprites'||/\.(png|jpg|jpeg|gif|webp)$/.test(lower))return'🖼';
    if(sectionName==='Audio'||/\.(wav|mp3|ogg)$/.test(lower))return'🔊';
    if(sectionName==='Scripts'||/\.js$/.test(lower))return'📜';
    if(sectionName==='Shaders'||/\.(glsl|wgsl)$/.test(lower))return'✦';
    if(sectionName==='Scenes'||/\.scene$/.test(lower))return'🎬';
    if(sectionName==='Models'||/\.(obj|fbx|glb|gltf)$/.test(lower))return'📦';
    if(sectionName==='Materials'||/\.mat$/.test(lower))return'◆';
    if(sectionName==='Prefabs'||/\.prefab$/.test(lower))return'◇';
    return'◆';
  }
  function assetKindV8(name,section,icon){
    if(section)return section;
    if(icon==='🖼'||hasFileExtV6(name,['.png','.jpg','.jpeg','.gif','.webp']))return'Sprites';
    if(icon==='🔊'||hasFileExtV6(name,['.wav','.mp3','.ogg']))return'Audio';
    if(icon==='📜'||hasFileExtV6(name,['.js']))return'Scripts';
    if(icon==='✦'||hasFileExtV6(name,['.glsl','.wgsl']))return'Shaders';
    if(icon==='🎬'||hasFileExtV6(name,['.scene']))return'Scenes';
    if(icon==='📦'||hasFileExtV6(name,['.obj','.fbx','.glb','.gltf']))return'Models';
    if(icon==='◆'||hasFileExtV6(name,['.mat']))return'Materials';
    if(icon==='◇'||hasFileExtV6(name,['.prefab']))return'Prefabs';
    return'Assets';
  }
  function ensureAssetDataStoreV8(){ if(!STATE.assetData)STATE.assetData={}; if(!STATE.audioData)STATE.audioData={}; return STATE.assetData; }
  function uniqueAssetNameV8(sectionName,originalName){
    normalizeAssetSectionsV6(); const sec=findAssetSectionV6(sectionName); const used=new Set((sec?.children||[]).map(c=>c.name));
    if(!used.has(originalName))return originalName; const dot=originalName.lastIndexOf('.'),base=dot>0?originalName.slice(0,dot):originalName,ext=dot>0?originalName.slice(dot):''; let i=2; while(used.has(base+'-'+i+ext))i++; return base+'-'+i+ext;
  }
  function getSpriteAssetDataURLV8(assetName){ const saved=(SPRITE_PIXELDATA&&SPRITE_PIXELDATA[assetName])||(STATE.spritePixelData&&STATE.spritePixelData[assetName]); return typeof saved==='string'?saved:(saved?.dataURL||null); }
  function getAssetDataURLV8(assetName){ ensureAssetDataStoreV8(); return STATE.assetData?.[assetName]?.dataURL||STATE.audioData?.[assetName]||getSpriteAssetDataURLV8(assetName)||null; }
  function storeImportedAssetV8(sectionName,file,name,icon,value,isText){
    ensureAssetDataStoreV8();
    STATE.assetData[name]={name,originalName:file?.name||name,section:sectionName,icon,type:file?.type||'',size:file?.size||0,dataURL:isText?null:value,text:isText?String(value||''):null,importedAt:Date.now()};
    if(sectionName==='Sprites'){
      saveSpriteAssetData(name,value,32,32);
      primeSpriteImageV6(value);
      applyUploadedSpriteAssetToScene(name,value,32,32);
    }
    if(sectionName==='Audio')STATE.audioData[name]=value;
    if(sectionName==='Scripts'||sectionName==='Shaders'||/\.(js|glsl|wgsl)$/i.test(name))SCRIPT_STORE[name]=String(value||'');
    addAssetToSectionV6(sectionName,{name,icon}); logConsole('success','Imported '+name+' to '+sectionName); setStatusMsg('Imported: '+name);
  }
  function readAndStoreAssetFilesV8(sectionName,files){
    ensureAssetDataStoreV8(); Array.from(files||[]).forEach(file=>{ const name=uniqueAssetNameV8(sectionName,file.name),icon=iconForAssetFileV8(sectionName,name); const isText=sectionName==='Scripts'||sectionName==='Shaders'||sectionName==='Scenes'||sectionName==='Materials'||sectionName==='Prefabs'||/\.(js|glsl|wgsl|scene|json|mat|prefab|txt)$/i.test(name); const reader=new FileReader(); reader.onload=e=>storeImportedAssetV8(sectionName,file,name,icon,e.target.result,isText); if(isText)reader.readAsText(file); else reader.readAsDataURL(file); });
  }
  function importAssetToSectionV8(sectionName){ const input=document.createElement('input'); input.type='file'; input.accept=assetAcceptForSectionV8(sectionName); input.multiple=true; input.onchange=e=>readAndStoreAssetFilesV8(sectionName,e.target.files); input.click(); }
  function createBlankAssetV8(sectionName){
    const spec=({Sprites:['sprite','.png','🖼'],Audio:['audio','.wav','🔊'],Scripts:['script','.js','📜'],Shaders:['shader','.glsl','✦'],Scenes:['scene','.scene','🎬'],Models:['model','.glb','📦'],Materials:['material','.mat','◆'],Prefabs:['prefab','.prefab','◇']})[sectionName]||['asset','.dat','◆'];
    const name=uniqueAssetNameV8(sectionName,spec[0]+'-'+Date.now().toString().slice(-5)+spec[1]);
    if(sectionName==='Scripts'||sectionName==='Shaders')SCRIPT_STORE[name]=''; addAssetToSectionV6(sectionName,{name,icon:spec[2]}); setStatusMsg('Created: '+name); return name;
  }
  function renameAssetV8(oldName, sectionName){
  const sec = findAssetSectionV6(sectionName);
  if(!sec) return;

  const match = String(oldName||'').match(/^(.*?)(\.[^.]*)?$/);
  const oldBase = (match && match[1]) || String(oldName||'');
  const oldExt  = (match && match[2]) || '';

  // Build modal on demand (base name only; extension locked).
  // HOTFIX: use a contenteditable textbox instead of a native input. In some
  // embedded editor shells, native inputs can lose focus or have keystrokes
  // intercepted by global editor handlers. contenteditable stays editable here.
  // Destroy any stale modal to ensure clean state
  const _oldRenameModal = document.getElementById('modal-rename-asset');
  if(_oldRenameModal) _oldRenameModal.remove();

  const modal = document.createElement('div');
  modal.id = 'modal-rename-asset';
  modal.className = 'modal-overlay';
  modal.innerHTML = \`
    <div class="modal" style="min-width:520px;max-width:680px">
      <div class="modal-title">Rename Asset</div>
      <div class="modal-row">
        <span class="modal-label">Name</span>
        <input
          type="text"
          class="modal-input"
          id="ra-base"
          autocomplete="off"
          spellcheck="false"
          style="flex:1;font-family:var(--mono);font-size:13px;padding:8px 10px;"
        />
      </div>
      <div class="modal-row">
        <span class="modal-label">Extension</span>
        <div class="modal-input" style="display:flex;align-items:center;gap:8px;background:var(--bg2)">
          <span style="font-family:var(--mono);color:var(--text1)" id="ra-ext"></span>
          <span style="margin-left:auto;font-size:10px;color:var(--text2)">locked</span>
        </div>
      </div>
      <div style="margin-top:12px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg1);font-size:11px;color:var(--text2)">
        Final: <span id="ra-preview" style="color:var(--accent);font-family:var(--mono)"></span>
      </div>
      <div class="modal-actions">
        <button class="modal-btn cancel" id="ra-cancel-btn">Cancel</button>
        <button class="modal-btn confirm" id="ra-confirm-btn">Rename</button>
      </div>
    </div>\`;
  modal.addEventListener('click', e => { if(e.target === modal) _closeRenameModal(); });
  document.body.appendChild(modal);

  window._renameAssetState = { oldName, sectionName, oldExt };

  // Query off modal itself — never document.getElementById which can hit stale elements
  const baseEl = modal.querySelector('#ra-base');
  const extEl  = modal.querySelector('#ra-ext');
  const prevEl = modal.querySelector('#ra-preview');
  const cancelBtn = modal.querySelector('#ra-cancel-btn');
  const confirmBtn = modal.querySelector('#ra-confirm-btn');

  function updateRenamePreview(){
    let entered = String(baseEl.value || '').replace(/\.[^.]*$/, '').replace(/[\/\:*?"<>|]/g, '-').trim();
    prevEl.textContent = (entered || oldBase) + oldExt;
  }

  baseEl.value = oldBase;
  extEl.textContent = oldExt || '(none)';
  prevEl.textContent = oldBase + oldExt;

  // Stop all keyboard/input events from bubbling to editor-wide handlers
  ['keydown','keyup','keypress','input','beforeinput','paste','cut','copy'].forEach(type => {
    baseEl.addEventListener(type, e => e.stopPropagation(), true);
  });

  baseEl.addEventListener('input', updateRenamePreview);
  baseEl.addEventListener('keydown', e => {
    e.stopPropagation();
    if(e.key === 'Enter'){ e.preventDefault(); confirmRenameAssetV8(); }
    if(e.key === 'Escape'){ e.preventDefault(); _closeRenameModal(); }
  });

  cancelBtn.addEventListener('click', e => { e.stopPropagation(); _closeRenameModal(); });
  confirmBtn.addEventListener('click', e => { e.stopPropagation(); confirmRenameAssetV8(); });

  modal.classList.add('open');
  setTimeout(() => { baseEl.focus(); baseEl.select(); }, 30);
  }

  function confirmRenameAssetV8(){
    const s = window._renameAssetState;
    if(!s) return;
    const sec = findAssetSectionV6(s.sectionName);
    if(!sec) return;

    const liveModal = document.getElementById('modal-rename-asset');
    const baseEl = liveModal ? liveModal.querySelector('#ra-base') : null;
    let entered = String(baseEl ? baseEl.value : '').trim();

  

    if(!entered) return;

  
    if(s.oldExt && entered.toLowerCase().endsWith(s.oldExt.toLowerCase())){
      entered = entered.slice(0, -s.oldExt.length);
    }
    entered = (entered || '').replace(/\.[^.]*$/, '').replace(/[\/\:*?"<>|]/g,'-').trim()||entered;
    if(!entered) return;

    const next = entered + (s.oldExt || '');
    const oldName = s.oldName;
    
    if(next === oldName){ _closeRenameModal(); return; }

    if(sec.children.some(c => c.name === next)){
      setStatusMsg('Asset name already exists: ' + next);
      return;
    }

    const asset = sec.children.find(c => c.name === oldName);
    if(asset) asset.name = next;

    if(STATE.assetData && STATE.assetData[oldName]){ STATE.assetData[next]=Object.assign({},STATE.assetData[oldName],{name:next}); delete STATE.assetData[oldName]; }
    if(STATE.audioData && STATE.audioData[oldName]){ STATE.audioData[next]=STATE.audioData[oldName]; delete STATE.audioData[oldName]; }
    if(STATE.spritePixelData && STATE.spritePixelData[oldName]){ STATE.spritePixelData[next]=STATE.spritePixelData[oldName]; delete STATE.spritePixelData[oldName]; }
    if(SPRITE_PIXELDATA && SPRITE_PIXELDATA[oldName]){ SPRITE_PIXELDATA[next]=SPRITE_PIXELDATA[oldName]; delete SPRITE_PIXELDATA[oldName]; }
    if(SCRIPT_STORE && SCRIPT_STORE[oldName]!==undefined){ SCRIPT_STORE[next]=SCRIPT_STORE[oldName]; delete SCRIPT_STORE[oldName]; }

    STATE.objects.forEach(function(o){
      if(o.spriteSrc===oldName) o.spriteSrc=next;
      if(o.audioSrc===oldName) o.audioSrc=next;
      if(o.modelSrc===oldName) o.modelSrc=next;
      if(o.material===oldName) o.material=next;
      if(o.shader===oldName) o.shader=next;
      if(o.script===oldName) o.script=next;
      if(o.prefabSrc===oldName) o.prefabSrc=next;
    });

    if(STATE.editingSpriteName===oldName) STATE.editingSpriteName=next;
    if(STATE.lastSpriteAssetName===oldName) STATE.lastSpriteAssetName=next;
    if(STATE.openScriptName===oldName) STATE.openScriptName=next;

    _closeRenameModal();
    buildAssetTree();
    buildHierarchy();
    renderViewport();
    logConsole('success','Renamed asset: '+oldName+' → '+next);
    setStatusMsg('Renamed: '+next);
  }

  function _closeRenameModal(){
    const m = document.getElementById('modal-rename-asset');
    if(m){ m.style.display='none'; m.remove(); }
    window._renameAssetState = null;
  }

  // Expose to window so button onclick attributes and external code can reach them
  window.renameAssetV8 = renameAssetV8;
  window.confirmRenameAssetV8 = confirmRenameAssetV8;
  window.closeModal = closeModal;

  function viewportDropWorldPointV8(e){ if(STATE.mode==='2d'&&typeof getVpCoords==='function')return getVpCoords(e); const rect=vpCanvas.getBoundingClientRect(); return{x:e.clientX-rect.left,y:e.clientY-rect.top}; }
  function addSpriteObjectFromAssetV8(assetName,e){
    pushUndo(); const pt=e?viewportDropWorldPointV8(e):{x:vpCanvas.width/2,y:vpCanvas.height/2}; const dataURL=getSpriteAssetDataURLV8(assetName); const base=String(assetName||'Sprite').replace(/\.[^.]+$/,'');
    const obj={id:STATE.nextId++,name:base,type:'sprite',x:pt.x,y:pt.y,w:48,h:48,z:0,rot:0,scaleX:1,scaleY:1,color:'#e94560',visible:true,locked:false,tag:'sprite',spriteSrc:assetName}; if(dataURL)applySpriteTextureToObjectV6(obj,dataURL,assetName);
    STATE.objects.push(obj); selectObject(obj.id); buildHierarchy(); renderViewport(); updateStatusBar(); logConsole('success','Added sprite from asset: '+assetName); setStatusMsg('Dropped sprite: '+assetName); return obj;
  }
  function addAudioObjectFromAssetV8(assetName){ addObject('audio'); const obj=STATE.objects.find(o=>o.id===STATE.selectedId); if(obj){obj.audioSrc=assetName;obj.audioDataURL=getAssetDataURLV8(assetName);obj.name=String(assetName||obj.name).replace(/\.[^.]+$/,'');obj.autoplay=false;obj.loop=false;buildHierarchy();renderViewport();logConsole('success','Audio source now uses: '+assetName);} }
  function previewAudioAssetV8(assetName){ const src=getAssetDataURLV8(assetName); if(!src){setStatusMsg('Import/upload audio first: '+assetName);return;} if(STATE._previewAudioV8){STATE._previewAudioV8.pause();STATE._previewAudioV8=null;} const a=new Audio(src); STATE._previewAudioV8=a; a.play().then(()=>setStatusMsg('Playing: '+assetName)).catch(err=>logConsole('warn','Audio preview blocked: '+(err?.message||err))); }
  function stopAudioPreviewV8(){ if(STATE._previewAudioV8){STATE._previewAudioV8.pause();STATE._previewAudioV8.currentTime=0;STATE._previewAudioV8=null;setStatusMsg('Audio stopped');} }
  function attachScriptToSelectedV8(assetName){ const obj=STATE.objects.find(o=>o.id===STATE.selectedId); if(!obj){setStatusMsg('Select an object first');return;} setProp(obj.id,'script',assetName); }
  function addModelObjectFromAssetV8(assetName){ addObject('model'); const obj=STATE.objects.find(o=>o.id===STATE.selectedId); if(obj){obj.modelSrc=assetName;obj.name=String(assetName).replace(/\.[^.]+$/,'');buildHierarchy();renderViewport();} }
  function applyMaterialToSelectedV8(assetName){ const obj=STATE.objects.find(o=>o.id===STATE.selectedId); if(!obj){setStatusMsg('Select an object first');return;} setProp(obj.id,'material',assetName); }
  function instantiatePrefabV8(assetName){ addObject('shape'); const obj=STATE.objects.find(o=>o.id===STATE.selectedId); if(obj){obj.prefabSrc=assetName;obj.name=String(assetName).replace(/\.[^.]+$/,'');buildHierarchy();renderViewport();} }
  function useAssetV8(ctx){ const kind=assetKindV8(ctx.name,ctx.section,ctx.icon); if(kind==='Sprites')return addSpriteObjectFromAssetV8(ctx.name); if(kind==='Audio')return addAudioObjectFromAssetV8(ctx.name); if(kind==='Scripts')return attachScriptToSelectedV8(ctx.name); if(kind==='Models')return addModelObjectFromAssetV8(ctx.name); if(kind==='Materials')return applyMaterialToSelectedV8(ctx.name); if(kind==='Prefabs')return instantiatePrefabV8(ctx.name); if(kind==='Shaders'){const obj=STATE.objects.find(o=>o.id===STATE.selectedId); if(obj)setProp(obj.id,'shader',ctx.name); else setStatusMsg('Select an object first'); return;} openAsset(ctx.name,ctx.icon); }
  function menuForAssetItemV8(ctx){
    const kind=assetKindV8(ctx.name,ctx.section,ctx.icon); const items=[];
    if(kind==='Sprites')items.push(menuItemV6('Open in Pixel Editor',()=>openAsset(ctx.name,ctx.icon)),menuItemV6('Add Sprite to Viewport',()=>addSpriteObjectFromAssetV8(ctx.name)),menuItemV6('Apply to Selected Sprite',()=>{const obj=STATE.objects.find(o=>o.id===STATE.selectedId&&o.type==='sprite'); if(obj)applySpriteTextureToObjectV6(obj,getSpriteAssetDataURLV8(ctx.name),ctx.name); else setStatusMsg('Select a sprite first');}));
    else if(kind==='Audio')items.push(menuItemV6('Add Audio Source',()=>addAudioObjectFromAssetV8(ctx.name)),menuItemV6('Preview Audio',()=>previewAudioAssetV8(ctx.name)),menuItemV6('Stop Preview',stopAudioPreviewV8));
    else if(kind==='Scripts')items.push(menuItemV6('Open in Code Editor',()=>openAsset(ctx.name,ctx.icon)),menuItemV6('Attach to Selected Object',()=>attachScriptToSelectedV8(ctx.name)));
    else if(kind==='Shaders')items.push(menuItemV6('Open Shader',()=>openAsset(ctx.name,ctx.icon)),menuItemV6('Apply Shader to Selected',()=>useAssetV8(ctx)));
    else if(kind==='Scenes')items.push(menuItemV6('Open Scene',()=>openAsset(ctx.name,ctx.icon)),menuItemV6('Set as Startup Scene',()=>{STATE.startScene=ctx.name;setStatusMsg('Startup scene: '+ctx.name);}));
    else if(kind==='Models')items.push(menuItemV6('Add Model to Viewport',()=>addModelObjectFromAssetV8(ctx.name)));
    else if(kind==='Materials')items.push(menuItemV6('Apply to Selected Object',()=>applyMaterialToSelectedV8(ctx.name)));
    else if(kind==='Prefabs')items.push(menuItemV6('Instantiate Prefab',()=>instantiatePrefabV8(ctx.name)));
    else items.push(menuItemV6('Open',()=>openAsset(ctx.name,ctx.icon)));
    items.push(menuItemV6('Use / Add to Editor',()=>useAssetV8(ctx)),menuItemV6('Rename',()=>renameAssetV8(ctx.name,ctx.section)),'sep',menuItemV6('Delete '+kind.slice(0,-1)+' Asset',()=>deleteSelectedAssetV6(ctx.name,ctx.section),true));
    return{title:kind.slice(0,-1)+': '+ctx.name,items};
  }
  function menuForAssetSectionV8(sectionName){
    const labels={Sprites:'Sprite',Audio:'Audio',Scripts:'Script',Shaders:'Shader',Scenes:'Scene',Models:'Model',Materials:'Material',Prefabs:'Prefab'}; const label=labels[sectionName]||'Asset';
    const items=[menuItemV6('Import / Upload '+label,()=>importAssetToSectionV8(sectionName)),menuItemV6('New '+label+' Placeholder',()=>{const n=createBlankAssetV8(sectionName); if(sectionName==='Sprites'||sectionName==='Scripts'||sectionName==='Shaders')openAsset(n,iconForAssetFileV8(sectionName,n));}),menuItemV6('Refresh '+sectionName,buildAssetTree)];
    if(sectionName==='Sprites')items.splice(2,0,menuItemV6('Add Blank Sprite Object',()=>addObject('sprite')));
    if(sectionName==='Audio')items.splice(2,0,menuItemV6('Add Blank Audio Source',()=>addObject('audio')));
    return{title:sectionName||'Assets',items};
  }
  function menuForContextV6(ctx){
    if(ctx.type==='asset-item')return menuForAssetItemV8(ctx);
    if(ctx.type==='asset-section')return menuForAssetSectionV8(ctx.section);
    if(ctx.type==='viewport'){
      if(ctx.object){selectObject(ctx.object.id);return{title:'Object: '+ctx.object.name,items:[menuItemV6('Edit Properties',()=>setLeftTab('props')),menuItemV6('Copy',()=>viewportEdit('copy')),menuItemV6('Duplicate',()=>{viewportEdit('copy');viewportEdit('paste');}),ctx.object.type==='sprite'?menuItemV6('Edit Sprite Texture',()=>{STATE.editingSpriteName=ctx.object.spriteSrc||ctx.object.name;setEditorTab('pixels');}):null,'sep',menuItemV6('Delete Object',()=>deleteObject(ctx.object.id),true)].filter(Boolean)}};
      return{title:'Viewport',items:[menuItemV6('Add Sprite',()=>addObject('sprite')),menuItemV6('Add Camera',()=>addObject('camera')),menuItemV6('Add Light',()=>addObject('light')),menuItemV6('Add Audio Source',()=>addObject('audio')),'sep',menuItemV6('Paste Object',()=>viewportEdit('paste')),menuItemV6('Reset Camera',resetCamera)]};
    }
    if(ctx.type==='blocks')return{title:'Block Editor',items:[menuItemV6('Add Block',addBlock),menuItemV6('Paste Block',()=>blockEdit('paste')),menuItemV6('Reset View',resetBlockViewV4),'sep',menuItemV6('Clear Blocks',clearBlocks,true)]};
    if(ctx.type==='code')return{title:'Code Editor',items:[menuItemV6('Cut',()=>codeEdit('cut')),menuItemV6('Copy',()=>codeEdit('copy')),menuItemV6('Paste',()=>codeEdit('paste')),'sep',menuItemV6('Format Code',formatCode),menuItemV6('Run Snippet',runSnippet)]};
    if(ctx.type==='pixels')return{title:'Pixel Art',items:[menuItemV6('Done: Save + Viewport',donePixelEditorV8),menuItemV6('Save to Sprite',savePixelArtToSprite),menuItemV6('Export PNG',exportPeSprite),menuItemV6('New Sprite Asset',newSpriteAssetV6)]};
    return{title:'FORGE',items:[menuItemV6('New Sprite',()=>addObject('sprite')),menuItemV6('Project Settings',openProjectSettings)]};
  }
  function buildAssetTree(){
    normalizeAssetSectionsV6(); const el=safeEl('asset-tree')||document.getElementById('asset-tree'); if(!el)return; el.innerHTML='';
    ASSET_TREE.forEach(sec=>{ const secDiv=document.createElement('div'); secDiv.className='tree-section'; secDiv.dataset.section=sec.name; const hdr=document.createElement('div'); hdr.className='tree-section-header'+(sec.open?' open':''); hdr.dataset.section=sec.name; hdr.innerHTML='<span class="arrow">▶</span>'+sec.icon+' '+sec.name; const childEl=document.createElement('div'); if(!sec.open)childEl.classList.add('hidden'); hdr.onclick=()=>{sec.open=!sec.open;hdr.classList.toggle('open',sec.open);childEl.classList.toggle('hidden',!sec.open);}; secDiv.appendChild(hdr);
      if(!sec.children||sec.children.length===0){const empty=document.createElement('div'); empty.className='tree-empty'; empty.textContent='empty'; childEl.appendChild(empty);} else sec.children.forEach(c=>{ const item=document.createElement('div'); item.className='tree-item'; item.dataset.assetName=c.name; item.dataset.assetIcon=c.icon; item.dataset.section=sec.name; const kind=assetKindV8(c.name,sec.name,c.icon); if(kind==='Sprites'){item.draggable=true; item.title='Drag this sprite into the viewport to add it to the editor'; item.addEventListener('dragstart',e=>{e.dataTransfer.effectAllowed='copy';e.dataTransfer.setData('application/x-forge-asset',c.name);e.dataTransfer.setData('application/x-forge-asset-section',sec.name);e.dataTransfer.setData('application/x-forge-sprite',c.name);e.dataTransfer.setData('text/plain',c.name);item.classList.add('dragging');}); item.addEventListener('dragend',()=>item.classList.remove('dragging'));}
        const canOpen=hasFileExtV6(c.name,['.js','.png','.jpg','.jpeg','.gif','.webp','.glsl','.wgsl','.scene','.wav','.mp3','.ogg','.obj','.fbx','.glb','.gltf','.mat','.prefab']); item.innerHTML='<span class="tree-icon">'+c.icon+'</span><span style="flex:1">'+c.name+'</span>'+(kind==='Sprites'?'<span style="font-size:9px;color:var(--accent);font-family:var(--mono)">drag</span>':(canOpen?'<span style="font-size:9px;color:var(--text3);font-family:var(--mono)">dbl</span>':'')); if(kind!=='Sprites')item.title=canOpen?'Double-click to open '+c.name:c.name; item.onclick=()=>{document.querySelectorAll('#asset-tree .tree-item').forEach(i=>i.classList.remove('selected')); item.classList.add('selected'); if(kind==='Sprites')openAsset(c.name,c.icon);}; item.ondblclick=()=>openAsset(c.name,c.icon); childEl.appendChild(item); });
      secDiv.appendChild(childEl); el.appendChild(secDiv); });
  }
  function ensurePixelDoneButtonV8(){ const panel=safeEl('pixel-editor'); if(!panel||panel.classList.contains('hidden'))return; let btn=safeEl('pe-done-btn-v8'); if(!btn){btn=document.createElement('button'); btn.id='pe-done-btn-v8'; btn.type='button'; btn.textContent='✓ DONE'; btn.style.cssText='position:absolute;top:10px;right:10px;z-index:10000;padding:7px 16px;font-size:11px;font-weight:700;letter-spacing:1px;border-radius:4px;border:1px solid var(--success);background:rgba(34,197,94,.18);color:var(--success);font-family:var(--ui);cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.45)'; btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();donePixelEditorV8();}); panel.appendChild(btn);} btn.style.display='block'; }
  function donePixelEditorV8(){ savePixelArtToSprite(); STATE._skipPixelAutoSaveV8=true; setEditorTab('viewport'); STATE._skipPixelAutoSaveV8=false; renderViewport(); setStatusMsg('Sprite texture saved ✓'); }
  const __setEditorTabBeforeV8=setEditorTab;
  setEditorTab=function(tab){ const previous=STATE.editorTab; if(previous==='pixels'&&tab==='viewport'&&!STATE._skipPixelAutoSaveV8){try{savePixelArtToSprite();}catch(err){logConsole('warn','Pixel auto-save skipped: '+(err?.message||err));}} __setEditorTabBeforeV8(tab); if(tab==='pixels')requestAnimationFrame(ensurePixelDoneButtonV8); else{const btn=safeEl('pe-done-btn-v8'); if(btn)btn.style.display='none';} };
  function bindForgeV8(){
    const viewport=safeEl('viewport'); if(viewport&&!viewport._spriteAssetDropV8){viewport._spriteAssetDropV8=true; viewport.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('application/x-forge-sprite')){e.preventDefault();e.dataTransfer.dropEffect='copy';}},true); viewport.addEventListener('drop',e=>{const spriteName=e.dataTransfer.getData('application/x-forge-sprite'); if(!spriteName)return; e.preventDefault();e.stopPropagation();addSpriteObjectFromAssetV8(spriteName,e);},true);}
    const tree=safeEl('asset-tree'); if(tree&&!tree._assetUploadDropV8){tree._assetUploadDropV8=true; tree.addEventListener('dragover',e=>{const sec=e.target.closest?.('.tree-section')?.dataset?.section; if(sec&&e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}},true); tree.addEventListener('drop',e=>{const sec=e.target.closest?.('.tree-section')?.dataset?.section; if(!sec||!e.dataTransfer.files?.length)return; e.preventDefault(); readAndStoreAssetFilesV8(sec,e.dataTransfer.files);},true);}
    buildAssetTree(); if(STATE.editorTab==='pixels')ensurePixelDoneButtonV8();
  }
  bindForgeV6();
  bindForgeV8();



// ═══════════════════════════════════════════════════════
//  FORGE HOTFIX 2026-05-17
//  Sprite replacement, code⇄blocks sync, console.log capture, safer addObject,
//  custom modals, and pixel-editor blank state when no sprite is active.
// ═══════════════════════════════════════════════════════
(function forgeFinalHotfix(){
  if (STATE.__forgeFinalHotfixApplied) return;
  STATE.__forgeFinalHotfixApplied = true;

  function qs(id){ return document.getElementById(id); }
  function cloneDeep(v){ try { return JSON.parse(JSON.stringify(v)); } catch(_) { return v; } }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }

  // Custom modal helpers. These replace browser confirm/prompt UX for editor actions.
  function forgeModal(opts){
    opts = opts || {};
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay open';
    overlay.style.zIndex = '12000';
    var inputHtml = '';
    if (opts.input) {
      var type = opts.inputType || 'text';
      inputHtml = '<div class="modal-row"><span class="modal-label">' + esc(opts.inputLabel || 'Value') + '</span><input class="modal-input" id="forge-modal-input" type="' + esc(type) + '" value="' + esc(opts.value || '') + '" /></div>';
    }
    overlay.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><div class="modal-title">' + esc(opts.title || 'Confirm') + '</div><div style="font-size:12px;color:var(--text1);line-height:1.45;margin-bottom:12px">' + esc(opts.message || '') + '</div>' + inputHtml + '<div class="modal-actions"><button class="modal-btn cancel" data-action="cancel">' + esc(opts.cancelText || 'Cancel') + '</button><button class="modal-btn confirm" data-action="ok">' + esc(opts.okText || 'OK') + '</button></div></div>';
    document.body.appendChild(overlay);
    var input = overlay.querySelector('#forge-modal-input');
    if (input) setTimeout(function(){ input.focus(); input.select(); }, 0);
    return new Promise(function(resolve){
      function close(value){ overlay.remove(); resolve(value); }
      overlay.addEventListener('click', function(e){
        if (e.target === overlay) close(null);
        var action = e.target && e.target.getAttribute && e.target.getAttribute('data-action');
        if (action === 'cancel') close(null);
        if (action === 'ok') close(input ? input.value : true);
      });
      overlay.addEventListener('keydown', function(e){
        if (e.key === 'Escape') close(null);
        if (e.key === 'Enter') close(input ? input.value : true);
      });
    });
  }
  window.forgeModal = forgeModal;
  window.forgeConfirm = function(message, title){ return forgeModal({title:title || 'Confirm', message:message || '', okText:'Confirm'}); };
  window.forgePrompt = function(message, value, title){ return forgeModal({title:title || 'Input', message:message || '', input:true, value:value || ''}); };

  // Add many more developer-friendly blocks and typed params.
  function addBlockDef(cat, meta){
    if (!BLOCK_DEFS[cat]) BLOCK_DEFS[cat] = { color:(meta && meta.color) || '#64748b', bg:(meta && meta.bg) || 'rgba(100,116,139,.12)', types:[] };
    (meta.types || []).forEach(function(t){
      if (!BLOCK_DEFS[cat].types.some(function(x){ return x.name === t.name; })) BLOCK_DEFS[cat].types.push(t);
    });
  }
  addBlockDef('Variables', {color:'#22c55e', bg:'rgba(34,197,94,.12)', types:[
    {name:'Set Variable', ports:{in:['exec'],out:['done']}, params:[{k:'name',v:'score',type:'text'},{k:'value',v:'0',type:'text'}]},
    {name:'Change Variable', ports:{in:['exec'],out:['done']}, params:[{k:'name',v:'score',type:'text'},{k:'amount',v:'1',type:'number'}]},
    {name:'Get Variable', ports:{in:[],out:['value']}, params:[{k:'name',v:'score',type:'text'}]}
  ]});
  addBlockDef('Math', {color:'#3b82f6', bg:'rgba(59,130,246,.12)', types:[
    {name:'Add', ports:{in:['a','b'],out:['result']}, params:[{k:'a',v:'0',type:'number'},{k:'b',v:'0',type:'number'}]},
    {name:'Random Range', ports:{in:[],out:['value']}, params:[{k:'min',v:'0',type:'number'},{k:'max',v:'100',type:'number'}]},
    {name:'Clamp', ports:{in:['value'],out:['result']}, params:[{k:'min',v:'0',type:'number'},{k:'max',v:'1',type:'number'}]}
  ]});
  addBlockDef('Input', {color:'#f97316', bg:'rgba(249,115,22,.12)', types:[
    {name:'Is Key Down', ports:{in:[],out:['true','false']}, params:[{k:'key',v:'ArrowRight',type:'select',options:['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Enter','a','d','w','s']}]},
    {name:'Mouse Position', ports:{in:[],out:['x','y']}, params:[]}
  ]});
  addBlockDef('UI', {color:'#ec4899', bg:'rgba(236,72,153,.12)', types:[
    {name:'Show Text', ports:{in:['exec'],out:['done']}, params:[{k:'text',v:'Hello',type:'text'},{k:'x',v:'20',type:'number'},{k:'y',v:'20',type:'number'},{k:'color',v:'#ffffff',type:'color'}]},
    {name:'Set HUD Value', ports:{in:['exec'],out:['done']}, params:[{k:'id',v:'score',type:'text'},{k:'value',v:'0',type:'text'}]}
  ]});
  addBlockDef('Objects', {color:'#14b8a6', bg:'rgba(20,184,166,.12)', types:[
    {name:'Create Object', ports:{in:['exec'],out:['object']}, params:[{k:'type',v:'sprite',type:'select',options:['sprite','shape','trigger','light','audio','particles']},{k:'name',v:'New Object',type:'text'}]},
    {name:'Destroy Object', ports:{in:['exec'],out:['done']}, params:[{k:'name',v:'Enemy',type:'text'}]},
    {name:'Set Visible', ports:{in:['exec'],out:['done']}, params:[{k:'visible',v:'true',type:'select',options:['true','false']}]} 
  ]});

  // Typed block parameter HTML. renderBlockEditor calls this after the source patch above.
  window.renderBlockParamInput = function(block, param){
    var type = param.type || param.input || (String(param.v).match(/^[-+]?\d+(\.\d+)?$/) ? 'number' : 'text');
    var common = ' class="be-param-input" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()" onchange="setBlockParam(' + block.id + ',\\'' + esc(param.k) + '\\',this.value)" oninput="setBlockParam(' + block.id + ',\\'' + esc(param.k) + '\\',this.value)" ';
    var control = '';
    if (type === 'target') {
      // Scene object selector dropdown
      var objects = (typeof STATE !== 'undefined') ? (STATE.objects || []) : [];
      var opts = '<option value="">— pick object —</option>' +
        objects.map(function(o){ return '<option value="' + esc(o.name) + '" ' + (String(o.name) === String(param.v) ? 'selected' : '') + '>' + esc(o.type + ': ' + o.name) + '</option>'; }).join('');
      control = '<select' + common + 'style="color:var(--accent)" title="Select scene object">' + opts + '</select>';
    } else if (type === 'color') {
      control = '<div style="display:flex;gap:3px;align-items:center"><input type="color" value="' + esc(param.v||'#ffffff') + '"' + common + 'style="width:28px;height:20px;padding:1px;border-radius:3px;flex-shrink:0"/><input type="text" value="' + esc(param.v||'#ffffff') + '"' + common + 'style="width:60px" placeholder="#rrggbb"/></div>';
    } else if (type === 'select') {
      var opts2 = param.options || param.choices || [];
      control = '<select' + common + '>' + opts2.map(function(o){ return '<option value="' + esc(o) + '" ' + (String(o) === String(param.v) ? 'selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
    } else if (type === 'checkbox') {
      control = '<select' + common + '><option value="true" ' + (String(param.v)==='true'?'selected':'') + '>true</option><option value="false" ' + (String(param.v)==='false'?'selected':'') + '>false</option></select>';
    } else {
      control = '<input type="' + esc(type) + '" value="' + esc(param.v) + '"' + common + '/>';
    }
    return '<div class="be-param"><span class="be-param-label">' + esc(param.k) + '</span>' + control + '</div>';
  };

  // Safe, non-recursive addObject replacement. Fixes Maximum call stack exceeded.
  addObject = function(type){
    type = type || 'sprite';
    if (typeof pushUndo === 'function') { try { pushUndo(); } catch(_){} }
    var defaults={camera:{w:40,h:30,color:'#fbbf24'},sprite:{w:48,h:48,color:'#e94560'},shape:{w:100,h:30,color:'#444'},light:{w:80,h:80,color:'#ffe066'},audio:{w:32,h:32,color:'#1abc9c'},trigger:{w:120,h:80,color:'#22c55e'},model:{w:60,h:60,color:'#7c3aed'},particles:{w:60,h:60,color:'#f59e0b'}};
    var d=defaults[type]||{w:50,h:50,color:'#888'};
    var id=STATE.nextId++;
    var obj={id:id,name:type.charAt(0).toUpperCase()+type.slice(1)+' '+id,type:type,x:200+Math.random()*400,y:100+Math.random()*250,w:d.w,h:d.h,color:d.color,z:0,rot:0,scaleX:1,scaleY:1,visible:true,locked:false,tag:type};
    if (type === 'sprite') {
      var assetName = STATE.editingSpriteName || STATE.lastSpriteAssetName || null;
      var saved = assetName ? ((SPRITE_PIXELDATA && SPRITE_PIXELDATA[assetName]) || (STATE.spritePixelData && STATE.spritePixelData[assetName] && STATE.spritePixelData[assetName].dataURL)) : null;
      if (saved) { obj.pixelDataURL = (typeof saved === 'string') ? saved : saved.dataURL; obj.spriteSrc = assetName; }
    }
    STATE.objects.push(obj);
    if (typeof buildHierarchy === 'function') buildHierarchy();
    if (typeof renderViewport === 'function') renderViewport();
    if (typeof updateStatusBar === 'function') updateStatusBar();
    if (typeof selectObject === 'function') selectObject(obj.id);
    logConsole && logConsole('success','Added '+type+': '+obj.name);
    return obj;
  };

  function activeSpriteName(){
    var obj = STATE.objects && STATE.objects.find(function(o){ return o.id === STATE.selectedId; });
    if (STATE.editingSpriteName) return STATE.editingSpriteName;
    if (obj && obj.type === 'sprite') return obj.spriteSrc || obj.name;
    return null;
  }
  function showPixelPlaceholder(){
    var container = qs('pixel-editor');
    if (!container) return;
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:var(--bg0);color:var(--text2);font-family:var(--ui);text-align:center;padding:24px"><div><div style="font-size:36px;margin-bottom:10px">🖼</div><div style="font-size:14px;color:var(--text1);font-weight:700;margin-bottom:6px">No sprite active</div><div style="font-size:11px;max-width:340px;line-height:1.45">Double-click a sprite in Assets or select a sprite object to edit pixel art.</div></div></div>';
    if (typeof destroyPixelEditor === 'function') { try { destroyPixelEditor(); } catch(_){} }
  }

  var __setEditorTabHotfix = setEditorTab;
  setEditorTab = function(tab){
    if (tab === 'blocks') {
      try { syncBlocksFromCodeHotfix('switch to blocks', true); } catch(_){}
    }
    __setEditorTabHotfix(tab);
    if (tab === 'pixels') {
      if (!activeSpriteName()) { showPixelPlaceholder(); return; }
      try { ensurePixelArtEditor && ensurePixelArtEditor(); } catch(_){}
    }
    if (tab === 'code') {
      try { refreshCodeHighlight && refreshCodeHighlight(); syncScroll && syncScroll(); } catch(_){}
    }
  };

  var __openAssetHotfix = openAsset;
  openAsset = function(name, icon){
    if (icon === '🖼' || /\.(png|jpg|jpeg|gif)$/i.test(name)) {
      STATE.editingSpriteName = name;
      __setEditorTabHotfix('pixels');
      requestAnimationFrame(function(){
        var editor = ensurePixelArtEditor && ensurePixelArtEditor();
        var saved = (SPRITE_PIXELDATA && SPRITE_PIXELDATA[name]) || (STATE.spritePixelData && STATE.spritePixelData[name] && STATE.spritePixelData[name].dataURL);
        var url = typeof saved === 'string' ? saved : (saved && saved.dataURL);
        if (editor && url) { try { (editor.loadFromDataURL || editor.importImage).call(editor, url, {newLayer:false, resize:false}); } catch(_){} }
        else if (editor && editor.clear) { try { editor.clear(); } catch(_){} }
      });
      logConsole && logConsole('info','Opened sprite in Pixel Editor: '+name);
      setStatusMsg && setStatusMsg('Editing: '+name);
      return;
    }
    return __openAssetHotfix(name, icon);
  };

  var __buildAssetTreeHotfix = buildAssetTree;
  buildAssetTree = function(){
    __buildAssetTreeHotfix();
    document.querySelectorAll('#asset-tree .tree-item').forEach(function(item){
      var labelEl = item.querySelector('span[style*="flex:1"]');
      var name = labelEl ? labelEl.textContent.trim() : item.textContent.trim();
      var iconEl = item.querySelector('.tree-icon');
      var icon = iconEl ? iconEl.textContent : '';
      if (icon === '🖼' || /\.(png|jpg|jpeg|gif)$/i.test(name)) {
        item.title = 'Double-click to edit ' + name;
        item.onclick = function(){ document.querySelectorAll('#asset-tree .tree-item').forEach(function(i){i.classList.remove('selected');}); item.classList.add('selected'); STATE.pendingSpriteAssetName = name; setStatusMsg && setStatusMsg('Double-click to edit: '+name); };
        item.ondblclick = function(){ openAsset(name, icon); };
      }
    });
  };

  var __savePixelArtToSpriteHotfix = savePixelArtToSprite;
  savePixelArtToSprite = function(){
    var dataURL = getPixelEditorDataURL && getPixelEditorDataURL();
    if (!dataURL) { logConsole && logConsole('error','Could not read the Pixel Art canvas.'); return; }
    var assetName = activeSpriteName();
    if (!assetName) { showPixelPlaceholder(); setStatusMsg && setStatusMsg('No sprite active'); return; }
    if (!STATE.spritePixelData) STATE.spritePixelData = {};
    STATE.spritePixelData[assetName] = {dataURL:dataURL,w:(PE && PE.w)||32,h:(PE && PE.h)||32,updatedAt:Date.now()};
    SPRITE_PIXELDATA[assetName] = dataURL;
    STATE.lastSpriteAssetName = assetName; STATE.lastSpriteDataURL = dataURL;
    var updated = 0;
    (STATE.objects || []).forEach(function(o){
      if (o.type === 'sprite' && (o.id === STATE.selectedId || o.spriteSrc === assetName || o.name === assetName || !o.pixelDataURL)) {
        o.pixelDataURL = dataURL; o.spriteSrc = assetName; o.pixelW = (PE && PE.w)||32; o.pixelH = (PE && PE.h)||32; updated++;
      }
    });
    ensureSpriteImageLoaded(null, dataURL, function(){ /* renderViewport will be triggered by loader */ });
    buildHierarchy && buildHierarchy(); renderViewport && renderViewport(); buildAssetTree && buildAssetTree();
    logConsole && logConsole('success','Pixel art saved to '+assetName+' and applied to '+updated+' sprite object(s).');
    setStatusMsg && setStatusMsg('Saved sprite texture ✓');
  };

  function expandConsoleHotfix(){
    var panel=qs('console-panel'), output=qs('console-output'), head=panel && panel.querySelector('.console-header span');
    if(panel){ panel.style.height='140px'; panel.classList.remove('collapsed'); }
    if(output) output.style.display='flex';
    if(head) head.textContent='▼ CONSOLE';
  }
  var __toggleConsoleHotfix = typeof toggleConsole === 'function' ? toggleConsole : null;
  toggleConsole = function(){
    var panel=qs('console-panel'), output=qs('console-output'), head=panel && panel.querySelector('.console-header span');
    if(!panel || !output) return __toggleConsoleHotfix && __toggleConsoleHotfix();
    var collapsed = panel.classList.toggle('collapsed');
    panel.style.height = collapsed ? '24px' : '140px';
    output.style.display = collapsed ? 'none' : 'flex';
    if(head) head.textContent = collapsed ? '▶ CONSOLE' : '▼ CONSOLE';
  };

  runSnippet = function(){
    var ta=qs('code-area'); if(!ta) return;
    var code=ta.value.split('\\n').filter(function(l){return !/^\\s*import\\b/.test(l);}).join('\\n');
    var statusEl=qs('ce-status-msg');
    var captured=[];
    var fakeConsole={log:function(){captured.push(['info',Array.prototype.slice.call(arguments).map(String).join(' ')]);},warn:function(){captured.push(['warn',Array.prototype.slice.call(arguments).map(String).join(' ')]);},error:function(){captured.push(['error',Array.prototype.slice.call(arguments).map(String).join(' ')]);}};
    try{
      var fn = new Function('console','STATE','BE','PE','logConsole', code);
      fn(fakeConsole, STATE, BE, PE, logConsole);
      expandConsoleHotfix();
      captured.forEach(function(row){ logConsole(row[0], row[1]); });
      if(!captured.length) logConsole('success','▶ Snippet executed.');
      if(statusEl){statusEl.textContent='● Ran';statusEl.className='con-success';}
      setStatusMsg && setStatusMsg('Snippet ran');
      try { syncBlocksFromCodeHotfix('run snippet', true); } catch(_){}
    } catch(err){
      expandConsoleHotfix(); logConsole && logConsole('error','✕ Snippet error: '+err.message);
      if(statusEl){statusEl.textContent='● Error';statusEl.className='ce-error';}
      setStatusMsg && setStatusMsg('Snippet error');
    }
  };

  var __codeSyncTimer = null;
  var __onCodeInputHotfix = onCodeInput;
  onCodeInput = function(e){
    __onCodeInputHotfix(e);
    clearTimeout(__codeSyncTimer);
    __codeSyncTimer = setTimeout(function(){ syncBlocksFromCodeHotfix('typing', false); }, 450);
  };

  function syncBlocksFromCodeHotfix(reason, quiet){
    var ta=qs('code-area'); if(!ta) return false;
    var code=ta.value || '';
    if(!code.trim()) { if(!quiet) return false; }
    try{
      if (typeof parseCodeToBlocksV4 === 'function') {
        var parsed=parseCodeToBlocksV4(code);
        BE.blocks=parsed.blocks || [];
        BE.connections=parsed.connections || [];
        BE.nextId=parsed.nextId || (Math.max(0,...BE.blocks.map(function(b){return +b.id||0;}))+1);
        if (STATE.editorTab === 'blocks') renderBlockEditor();
        return true;
      }
    } catch(_){}
    // Lightweight fallback: detect Cat.method({ ... }) calls and console.log.
    var blocks=[], id=1;
    var callRe=/\\b([A-Z][A-Za-z0-9_$]*)\\.([A-Za-z_$][\\w$]*)\\s*\\(\\s*\\{([\\s\\S]*?)\\}\\s*\\)\\s*;?/g, m;
    while((m=callRe.exec(code))){
      var cat=m[1]; if(!BLOCK_DEFS[cat]) continue;
      var type=m[2].replace(/([A-Z])/g,' $1').replace(/^./,function(c){return c.toUpperCase();}).trim();
      var def=findBlockDef(cat,type) || (BLOCK_DEFS[cat].types && BLOCK_DEFS[cat].types[0]);
      blocks.push({id:id++,cat:cat,type:def?def.name:type,x:80+((id-2)%3)*260,y:80+Math.floor((id-2)/3)*150,params:cloneDeep((def&&def.params)||[]),ports:cloneDeep((def&&def.ports)||{in:['exec'],out:['done']})});
    }
    var logMatches = code.match(/console\\.(log|warn|error)\\s*\\(/g) || [];
    logMatches.forEach(function(_,i){ blocks.push({id:id++,cat:'UI',type:'Show Text',x:80+((id-2)%3)*260,y:80+Math.floor((id-2)/3)*150,params:[{k:'text',v:'console.log output',type:'text'},{k:'x',v:'20',type:'number'},{k:'y',v:String(20+i*20),type:'number'},{k:'color',v:'#ffffff',type:'color'}],ports:{in:['exec'],out:['done']}}); });
    if(blocks.length){ BE.blocks=blocks; BE.connections=[]; BE.nextId=id; if(STATE.editorTab==='blocks') renderBlockEditor(); return true; }
    return false;
  }
  window.syncBlocksFromCodeHotfix = syncBlocksFromCodeHotfix;

  // addBlock: keep the proper selection-menu picker defined at function addBlock() above.
  // renameAssetV8: keep the proper base-name-only modal defined at function renameAssetV8() above.
  // (Previous overrides using forgeModal/forgePrompt text inputs have been removed.)

  try { buildAssetTree(); } catch(_){}
})();



  // ═══════════════════════════════════════════════════════════════
  //  COPILOT HOTFIX V9.1: correct library drops, snippet library scope,
  //  and sprite-asset drag-to-viewport interception
  //  NOTE: this code lives inside GAME_EDITOR_RUNTIME's template string, so
  //  regex/string backslashes are double-escaped intentionally.
  // ═══════════════════════════════════════════════════════════════
  function makeSnippetLibraryHotfixV9(name){
    var api=function(){ return undefined; };
    try { Object.defineProperty(api,'name',{value:String(name||'Lib')}); } catch(_) {}
    api.__forgeLibName=String(name||'Lib');
    api.noop=function(){ return undefined; };
    api.run=function(){ return undefined; };
    api.create=function(opts){ return opts || {}; };
    api.update=function(opts){ return opts || {}; };
    api.draw=function(){ return undefined; };
    api.load=function(src){ return {src:src}; };
    api.play=function(src){ return {src:src, playing:true}; };
    api.stop=function(){ return undefined; };
    api.on=function(){ return undefined; };
    api.emit=function(){ return undefined; };
    api.loop=function(cb){ if(typeof cb==='function') cb(0); };
    api.once=function(cb){ if(typeof cb==='function') cb(); };
    api.clear=function(){ return undefined; };
    if(String(name)==='Color'){
      api.hex=function(v){ return String(v || '#ffffff'); };
      api.rgb=function(r,g,b){ return 'rgb('+[r||0,g||0,b||0].join(',')+')'; };
      api.rgba=function(r,g,b,a){ return 'rgba('+[r||0,g||0,b||0,(a==null?1:a)].join(',')+')'; };
      api.random=function(){ return '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0'); };
      api.palette=function(){ return ['#1a1a2e','#0f3460','#533483','#e94560','#f5a623','#4ecdc4']; };
      api.lighten=function(hex){ return hex || '#ffffff'; };
      api.darken=function(hex){ return hex || '#000000'; };
    }
    return api;
  }
  function snippetLibraryScopeHotfixV9(){
    var scope={};
    (LIBS||[]).forEach(function(lib){ scope[lib.name]=makeSnippetLibraryHotfixV9(lib.name); });
    if(scope.math) scope.MathLib=scope.math;
    return scope;
  }
  function extractImportedLibsHotfixV9(code){
    var imported=new Set();
    var lines=String(code||'').split('\\n');
    lines.forEach(function(line){
      var match=line.match(/import\\s*\\{\\s*([^}]+)\\s*\\}\\s*from\\s*['\"].*[\\'\"]/);
      if(match){
        var names=match[1].split(',').map(function(n){ return n.trim(); });
        names.forEach(function(name){ imported.add(name); });
      }
    });
    return imported;
  }
  function stripImportLinesHotfixV9(code){
    return String(code||'').split('\\n').filter(function(line){ return !/^\\s*import\\b/.test(line); }).join('\\n');
  }
  runSnippet = function(){
    var ta=safeEl('code-area'); if(!ta) return;
    var fullCode=ta.value;
    var code=stripImportLinesHotfixV9(fullCode);
    var statusEl=safeEl('ce-status-msg');
    var captured=[];
    var fakeConsole={
      log:function(){ captured.push(['info',Array.prototype.slice.call(arguments).map(String).join(' ')]); },
      warn:function(){ captured.push(['warn',Array.prototype.slice.call(arguments).map(String).join(' ')]); },
      error:function(){ captured.push(['error',Array.prototype.slice.call(arguments).map(String).join(' ')]); }
    };
    var allLibs=snippetLibraryScopeHotfixV9();
    var importedLibNames=extractImportedLibsHotfixV9(fullCode);
    var libNames;
    if(importedLibNames.size>0){
      libNames=Array.from(importedLibNames).filter(function(n){ return /^[A-Za-z_$][\\w$]*$/.test(n) && allLibs.hasOwnProperty(n); });
    } else {
      libNames=Object.keys(allLibs).filter(function(n){ return /^[A-Za-z_$][\\w$]*$/.test(n); });
    }
    try{
      var fn = Function.apply(null, ['console','STATE','BE','PE','logConsole'].concat(libNames).concat([code]));
      fn.apply(null, [fakeConsole, STATE, BE, PE, logConsole].concat(libNames.map(function(n){ return allLibs[n]; })));
      if(typeof expandConsoleHotfix==='function') expandConsoleHotfix();
      captured.forEach(function(row){ logConsole(row[0], row[1]); });
      var loadedMsg='▶ Snippet executed';
      if(libNames.length>0) loadedMsg+=' — Loaded: '+libNames.join(', ');
      if(!captured.length) logConsole('success', loadedMsg);
      if(statusEl){ statusEl.textContent='● Ran'; statusEl.className='con-success'; }
      setStatusMsg && setStatusMsg('Snippet ran');
      try { if(typeof syncBlocksFromCodeHotfix==='function') syncBlocksFromCodeHotfix('run snippet', true); } catch(_){}
    }catch(err){
      if(typeof expandConsoleHotfix==='function') expandConsoleHotfix();
      logConsole && logConsole('error','✕ Snippet error: '+(err && err.message ? err.message : err));
      if(statusEl){ statusEl.textContent='● Error'; statusEl.className='ce-error'; }
      setStatusMsg && setStatusMsg('Snippet error');
    }
  };
  // Comprehensive method map for all FORGE libraries
  var FORGE_LIB_METHODS = {
    Camera:   [{m:'create',p:[{k:'target',v:'',type:'target'},{k:'zoom',v:'1',type:'number'}]},{m:'follow',p:[{k:'target',v:'',type:'target'},{k:'speed',v:'0.1',type:'number'}]},{m:'shake',p:[{k:'mag',v:'5',type:'number'},{k:'ms',v:'300',type:'number'}]},{m:'setZoom',p:[{k:'zoom',v:'1.5',type:'number'}]},{m:'moveTo',p:[{k:'x',v:'0',type:'number'},{k:'y',v:'0',type:'number'}]},{m:'reset',p:[]}],
    Canvas:   [{m:'create',p:[{k:'w',v:'800',type:'number'},{k:'h',v:'450',type:'number'}]},{m:'clear',p:[{k:'color',v:'#0d0f18',type:'color'}]},{m:'fillRect',p:[{k:'x',v:'0',type:'number'},{k:'y',v:'0',type:'number'},{k:'w',v:'100',type:'number'},{k:'h',v:'100',type:'number'},{k:'color',v:'#ff0000',type:'color'}]},{m:'drawText',p:[{k:'text',v:'Hello',type:'text'},{k:'x',v:'20',type:'number'},{k:'y',v:'30',type:'number'},{k:'size',v:'16',type:'number'},{k:'color',v:'#ffffff',type:'color'}]},{m:'drawLine',p:[{k:'x1',v:'0',type:'number'},{k:'y1',v:'0',type:'number'},{k:'x2',v:'100',type:'number'},{k:'y2',v:'100',type:'number'},{k:'color',v:'#00d4ff',type:'color'}]}],
    Color:    [{m:'hex',p:[{k:'value',v:'#ff0000',type:'color'}]},{m:'rgb',p:[{k:'r',v:'255',type:'number'},{k:'g',v:'0',type:'number'},{k:'b',v:'0',type:'number'}]},{m:'random',p:[]},{m:'lerp',p:[{k:'from',v:'#000000',type:'color'},{k:'to',v:'#ffffff',type:'color'},{k:'t',v:'0.5',type:'number'}]},{m:'lighten',p:[{k:'color',v:'#888888',type:'color'},{k:'amount',v:'30',type:'number'}]},{m:'darken',p:[{k:'color',v:'#888888',type:'color'},{k:'amount',v:'30',type:'number'}]}],
    Events:   [{m:'on',p:[{k:'event',v:'click',type:'text'}]},{m:'emit',p:[{k:'event',v:'custom',type:'text'},{k:'data',v:'{}',type:'text'}]},{m:'off',p:[{k:'event',v:'click',type:'text'}]},{m:'once',p:[{k:'event',v:'ready',type:'text'}]}],
    Flow:     [{m:'loop',p:[{k:'n',v:'10',type:'number'}]},{m:'once',p:[]},{m:'delay',p:[{k:'ms',v:'500',type:'number'}]},{m:'sequence',p:[]},{m:'stop',p:[]}],
    GUI:      [{m:'button',p:[{k:'label',v:'Click Me',type:'text'},{k:'x',v:'10',type:'number'},{k:'y',v:'10',type:'number'}]},{m:'label',p:[{k:'text',v:'Score: 0',type:'text'},{k:'x',v:'10',type:'number'},{k:'y',v:'30',type:'number'}]},{m:'panel',p:[{k:'x',v:'0',type:'number'},{k:'y',v:'0',type:'number'},{k:'w',v:'200',type:'number'},{k:'h',v:'100',type:'number'}]}],
    Image:    [{m:'load',p:[{k:'src',v:'image.png',type:'text'}]},{m:'draw',p:[{k:'src',v:'image.png',type:'text'},{k:'x',v:'0',type:'number'},{k:'y',v:'0',type:'number'}]},{m:'resize',p:[{k:'src',v:'image.png',type:'text'},{k:'w',v:'100',type:'number'},{k:'h',v:'100',type:'number'}]}],
    Lights:   [{m:'add',p:[{k:'target',v:'',type:'target'},{k:'intensity',v:'1',type:'number'},{k:'color',v:'#ffe066',type:'color'},{k:'radius',v:'200',type:'number'}]},{m:'remove',p:[{k:'target',v:'',type:'target'}]},{m:'setIntensity',p:[{k:'target',v:'',type:'target'},{k:'val',v:'1',type:'number'}]},{m:'flicker',p:[{k:'target',v:'',type:'target'},{k:'speed',v:'0.1',type:'number'}]}],
    Logic:    [{m:'if',p:[{k:'condition',v:'',type:'text'}]},{m:'and',p:[{k:'a',v:'',type:'text'},{k:'b',v:'',type:'text'}]},{m:'or',p:[{k:'a',v:'',type:'text'},{k:'b',v:'',type:'text'}]},{m:'not',p:[{k:'value',v:'',type:'text'}]},{m:'compare',p:[{k:'a',v:'',type:'text'},{k:'op',v:'==',type:'select',options:['==','!=','>','<','>=','<=']},{k:'b',v:'',type:'text'}]}],
    math:     [{m:'dist',p:[{k:'x1',v:'0',type:'number'},{k:'y1',v:'0',type:'number'},{k:'x2',v:'100',type:'number'},{k:'y2',v:'100',type:'number'}]},{m:'lerp',p:[{k:'a',v:'0',type:'number'},{k:'b',v:'1',type:'number'},{k:'t',v:'0.5',type:'number'}]},{m:'clamp',p:[{k:'v',v:'0',type:'number'},{k:'min',v:'0',type:'number'},{k:'max',v:'1',type:'number'}]},{m:'random',p:[{k:'min',v:'0',type:'number'},{k:'max',v:'1',type:'number'}]},{m:'abs',p:[{k:'v',v:'0',type:'number'}]},{m:'floor',p:[{k:'v',v:'0',type:'number'}]},{m:'round',p:[{k:'v',v:'0',type:'number'}]},{m:'sin',p:[{k:'angle',v:'0',type:'number'}]},{m:'cos',p:[{k:'angle',v:'0',type:'number'}]}],
    Models:   [{m:'load',p:[{k:'src',v:'model.glb',type:'text'},{k:'target',v:'',type:'target'}]},{m:'setRotation',p:[{k:'target',v:'',type:'target'},{k:'x',v:'0',type:'number'},{k:'y',v:'0',type:'number'},{k:'z',v:'0',type:'number'}]},{m:'setScale',p:[{k:'target',v:'',type:'target'},{k:'s',v:'1',type:'number'}]}],
    Particles:[{m:'emit',p:[{k:'target',v:'',type:'target'},{k:'count',v:'20',type:'number'},{k:'speed',v:'100',type:'number'},{k:'color',v:'#fbbf24',type:'color'}]},{m:'start',p:[{k:'target',v:'',type:'target'},{k:'rate',v:'10',type:'number'}]},{m:'stop',p:[{k:'target',v:'',type:'target'}]},{m:'setGravity',p:[{k:'g',v:'50',type:'number'}]}],
    Physics:  [{m:'init',p:[{k:'target',v:'',type:'target'},{k:'mass',v:'1',type:'number'}]},{m:'step',p:[{k:'dt',v:'0.016',type:'number'}]},{m:'applyForce',p:[{k:'target',v:'',type:'target'},{k:'x',v:'0',type:'number'},{k:'y',v:'-300',type:'number'}]},{m:'setVelocity',p:[{k:'target',v:'',type:'target'},{k:'x',v:'5',type:'number'},{k:'y',v:'0',type:'number'}]},{m:'addGravity',p:[{k:'g',v:'9.8',type:'number'}]}],
    PixelArt: [{m:'create',p:[{k:'w',v:'32',type:'number'},{k:'h',v:'32',type:'number'}]},{m:'setPixel',p:[{k:'x',v:'0',type:'number'},{k:'y',v:'0',type:'number'},{k:'color',v:'#ff0000',type:'color'}]},{m:'fill',p:[{k:'color',v:'#0d0f18',type:'color'}]},{m:'export',p:[]}],
    Shapes:   [{m:'rect',p:[{k:'target',v:'',type:'target'},{k:'color',v:'#ff0000',type:'color'}]},{m:'circle',p:[{k:'target',v:'',type:'target'},{k:'color',v:'#00d4ff',type:'color'}]},{m:'line',p:[{k:'x1',v:'0',type:'number'},{k:'y1',v:'0',type:'number'},{k:'x2',v:'100',type:'number'},{k:'y2',v:'100',type:'number'},{k:'color',v:'#ffffff',type:'color'}]},{m:'polygon',p:[{k:'target',v:'',type:'target'},{k:'sides',v:'6',type:'number'},{k:'color',v:'#7c3aed',type:'color'}]}],
    Sound:    [{m:'play',p:[{k:'src',v:'jump.wav',type:'text'},{k:'volume',v:'1',type:'number'},{k:'loop',v:'false',type:'select',options:['false','true']}]},{m:'stop',p:[{k:'src',v:'music.mp3',type:'text'}]},{m:'stopAll',p:[]},{m:'setVolume',p:[{k:'vol',v:'0.8',type:'number'}]},{m:'fadeIn',p:[{k:'src',v:'music.mp3',type:'text'},{k:'ms',v:'1000',type:'number'}]},{m:'fadeOut',p:[{k:'src',v:'music.mp3',type:'text'},{k:'ms',v:'500',type:'number'}]}],
    Sprites:  [{m:'load',p:[{k:'target',v:'',type:'target'},{k:'src',v:'player.png',type:'text'}]},{m:'play',p:[{k:'target',v:'',type:'target'},{k:'anim',v:'run',type:'text'}]},{m:'stop',p:[{k:'target',v:'',type:'target'}]},{m:'setFrame',p:[{k:'target',v:'',type:'target'},{k:'frame',v:'0',type:'number'}]},{m:'setOpacity',p:[{k:'target',v:'',type:'target'},{k:'val',v:'1',type:'number'}]},{m:'setTint',p:[{k:'target',v:'',type:'target'},{k:'color',v:'#ffffff',type:'color'}]}],
    Text:     [{m:'draw',p:[{k:'text',v:'Hello',type:'text'},{k:'x',v:'20',type:'number'},{k:'y',v:'30',type:'number'},{k:'size',v:'16',type:'number'},{k:'color',v:'#ffffff',type:'color'}]},{m:'set',p:[{k:'target',v:'',type:'target'},{k:'text',v:'',type:'text'}]},{m:'typewriter',p:[{k:'target',v:'',type:'target'},{k:'text',v:'Hello World',type:'text'},{k:'ms',v:'50',type:'number'}]}],
    Transform:[{m:'translate',p:[{k:'target',v:'',type:'target'},{k:'dx',v:'0',type:'number'},{k:'dy',v:'0',type:'number'}]},{m:'rotate',p:[{k:'target',v:'',type:'target'},{k:'deg',v:'45',type:'number'}]},{m:'scale',p:[{k:'target',v:'',type:'target'},{k:'x',v:'1',type:'number'},{k:'y',v:'1',type:'number'}]},{m:'moveTo',p:[{k:'target',v:'',type:'target'},{k:'x',v:'0',type:'number'},{k:'y',v:'0',type:'number'}]},{m:'lerp',p:[{k:'target',v:'',type:'target'},{k:'x',v:'0',type:'number'},{k:'y',v:'0',type:'number'},{k:'t',v:'0.1',type:'number'}]}],
    Triggers: [{m:'create',p:[{k:'target',v:'',type:'target'},{k:'tag',v:'zone',type:'text'}]},{m:'remove',p:[{k:'target',v:'',type:'target'}]},{m:'isInside',p:[{k:'obj',v:'',type:'target'},{k:'zone',v:'',type:'target'}]}],
  };
  function ensureLibraryBlockDefHotfixV9(libName){
    var name=String(libName||'').trim();
    if(!name) name='Library';
    if(!BLOCK_DEFS[name]){
      var meta=(LIBS||[]).find(function(l){ return String(l.name).toLowerCase()===name.toLowerCase(); }) || {color:'#64748b'};
      var color=meta.color || '#64748b';
      var methods=FORGE_LIB_METHODS[name] || FORGE_LIB_METHODS[meta.name] || null;
      var types;
      if(methods && methods.length){
        types = methods.map(function(m){
          var methodLabel = name+'.'+m.m;
          return {
            name: methodLabel,
            ports:{in:['exec'],out:['done']},
            params: m.p || []
          };
        });
      } else {
        // Fallback: single "Use X" block with enabled param
        types = [{name:'Use '+name, ports:{in:['exec'],out:['done']}, params:[{k:'enabled',v:'true',type:'select',options:['true','false']}]}];
      }
      BLOCK_DEFS[name]={
        color:color,
        bg:'rgba('+parseInt(color.slice(1,3),16)+','+parseInt(color.slice(3,5),16)+','+parseInt(color.slice(5,7),16)+',.12)',
        types:types
      };
    }
    return BLOCK_DEFS[name].types[0];
  }
  addBlockFromLibraryV4 = function(libName,x,y){
    var clean=String(libName||'').trim();
    if(!clean) return;
    snapshotBlocks();
    var def=ensureLibraryBlockDefHotfixV9(clean);
    var id=Math.max(BE.nextId, ...BE.blocks.map(function(b){ return b.id+1; }), 1);
    BE.nextId=id+1;
    BE.blocks.push({
      id:id,
      cat:clean,
      type:def.name,
      x:Math.max(0,x||120),
      y:Math.max(0,y||120),
      params:cloneV4(def.params||[]),
      ports:cloneV4(def.ports||{in:[],out:[]}),
      lib:clean
    });
    BE.selected=id;
    renderBlockEditor();
    syncCodeFromBlocksV4('dropped '+clean);
    logConsole('success','Dropped library block: '+clean);
  };
  serializeBlocksToCodeV4 = (function(original){
    return function(){
      if(!BE.blocks.length && !BE.connections.length) return '';
      BE.blocks.forEach(function(b){ if(b && b.cat) ensureLibraryBlockDefHotfixV9(b.cat); });
      return original();
    };
  })(serializeBlocksToCodeV4);
  function bindSpriteDropInterceptorHotfixV9(){
    if(document._forgeSpriteDropInterceptorV9) return;
    document._forgeSpriteDropInterceptorV9=true;
    document.addEventListener('dragover',function(e){
      if(e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('application/x-forge-sprite')){
        e.preventDefault();
        e.dataTransfer.dropEffect='copy';
      }
    },true);
    document.addEventListener('drop',function(e){
      if(!e.dataTransfer || !e.dataTransfer.types || !e.dataTransfer.types.includes('application/x-forge-sprite')) return;
      var viewport=safeEl('viewport');
      if(!viewport || !(e.target===viewport || (e.target.closest && e.target.closest('#viewport')))) return;
      var spriteName=e.dataTransfer.getData('application/x-forge-sprite') || e.dataTransfer.getData('application/x-forge-asset') || e.dataTransfer.getData('text/plain');
      if(!spriteName) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      addSpriteObjectFromAssetV8(spriteName,e);
    },true);
  }
  bindSpriteDropInterceptorHotfixV9();

  const __forgeHandlers = {
      addBlock: (typeof addBlock !== "undefined" ? addBlock : undefined),
      addObject: (typeof addObject !== "undefined" ? addObject : undefined),
      confirmAddBlock: (typeof confirmAddBlock !== "undefined" ? confirmAddBlock : undefined),
      openAsset: (typeof openAsset !== "undefined" ? openAsset : undefined),
      exportHTML5: (typeof exportHTML5 !== "undefined" ? exportHTML5 : undefined),
      toggleTheme: (typeof toggleTheme !== "undefined" ? toggleTheme : undefined),
      openProjectSettings: (typeof openProjectSettings !== "undefined" ? openProjectSettings : undefined),
      applyProjectSettings: (typeof applyProjectSettings !== "undefined" ? applyProjectSettings : undefined),
      savePixelArtToSprite: (typeof savePixelArtToSprite !== "undefined" ? savePixelArtToSprite : undefined),
      addPeLayer: (typeof addPeLayer !== "undefined" ? addPeLayer : undefined),
      applyAutocomplete: (typeof applyAutocomplete !== "undefined" ? applyAutocomplete : undefined),
      clearBlocks: (typeof clearBlocks !== "undefined" ? clearBlocks : undefined),
      clearConsole: (typeof clearConsole !== "undefined" ? clearConsole : undefined),
      closeModal: (typeof closeModal !== "undefined" ? closeModal : undefined),
      confirmNewProject: (typeof confirmNewProject !== "undefined" ? confirmNewProject : undefined),
      deleteSelected: (typeof deleteSelected !== "undefined" ? deleteSelected : undefined),
      exportPeSprite: (typeof exportPeSprite !== "undefined" ? exportPeSprite : undefined),
      focusSelected: (typeof focusSelected !== "undefined" ? focusSelected : undefined),
      formatCode: (typeof formatCode !== "undefined" ? formatCode : undefined),
      generateCode: (typeof generateCode !== "undefined" ? generateCode : undefined),
      handleCodeKeyDown: (typeof handleCodeKeyDown !== "undefined" ? handleCodeKeyDown : undefined),
      newProject: (typeof newProject !== "undefined" ? newProject : undefined),
      onCodeInput: (typeof onCodeInput !== "undefined" ? onCodeInput : undefined),
      onCodeKey: (typeof onCodeKey !== "undefined" ? onCodeKey : undefined),
      openProject: (typeof openProject !== "undefined" ? openProject : undefined),
      redo: (typeof redo !== "undefined" ? redo : undefined),
      resetCamera: (typeof resetCamera !== "undefined" ? resetCamera : undefined),
      resizePeCanvas: (typeof resizePeCanvas !== "undefined" ? resizePeCanvas : undefined),
      runGame: (typeof runGame !== "undefined" ? runGame : undefined),
      runSnippet: (typeof runSnippet !== "undefined" ? runSnippet : undefined),
      saveProject: (typeof saveProject !== "undefined" ? saveProject : undefined),
      setBlockParam: (typeof setBlockParam !== "undefined" ? setBlockParam : undefined),
      setEditorTab: (typeof setEditorTab !== "undefined" ? setEditorTab : undefined),
      setLeftTab: (typeof setLeftTab !== "undefined" ? setLeftTab : undefined),
      setMode: (typeof setMode !== "undefined" ? setMode : undefined),
      setPeColor: (typeof setPeColor !== "undefined" ? setPeColor : undefined),
      setPeZoom: (typeof setPeZoom !== "undefined" ? setPeZoom : undefined),
      setProp: (typeof setProp !== "undefined" ? setProp : undefined),
      setRightTab: (typeof setRightTab !== "undefined" ? setRightTab : undefined),
      setVpTool: (typeof setVpTool !== "undefined" ? setVpTool : undefined),
      startConnect: (typeof startConnect !== "undefined" ? startConnect : undefined),
      stopGame: (typeof stopGame !== "undefined" ? stopGame : undefined),
      syncScroll: (typeof syncScroll !== "undefined" ? syncScroll : undefined),
      toggleConsole: (typeof toggleConsole !== "undefined" ? toggleConsole : undefined),
      toggleGrid: (typeof toggleGrid !== "undefined" ? toggleGrid : undefined),
      toggleMenu: (typeof toggleMenu !== "undefined" ? toggleMenu : undefined),
      togglePeLayer: (typeof togglePeLayer !== "undefined" ? togglePeLayer : undefined),
      toggleSnap: (typeof toggleSnap !== "undefined" ? toggleSnap : undefined),
      toggleVisible: (typeof toggleVisible !== "undefined" ? toggleVisible : undefined),
      undo: (typeof undo !== "undefined" ? undo : undefined),
      updateCursor: (typeof updateCursor !== "undefined" ? updateCursor : undefined),
      validateBlocks: (typeof validateBlocks !== "undefined" ? validateBlocks : undefined),
      resetBlockViewV4: (typeof resetBlockViewV4 !== "undefined" ? resetBlockViewV4 : undefined),
      bindForgeV4: (typeof bindForgeV4 !== "undefined" ? bindForgeV4 : undefined),
      destroyPixelEditor: (typeof destroyPixelEditor !== "undefined" ? destroyPixelEditor : undefined)
  };
  Object.keys(__forgeHandlers).forEach((key) => {
    if (typeof __forgeHandlers[key] === 'function') window[key] = __forgeHandlers[key];
  });
  Object.assign(window,{contextEdit,editAction,bindForgeV3});

// ═══════════════════════════════════════════════════════════════
//  FORGE MASTER PATCH v10 — All fixes
//  1) math library gets real Math.* methods (fixes math.dist etc.)
//  2) Block editor uses typed renderBlockParamInput for all blocks
//  3) 3D grid made much clearer (brighter lines)
//  4) Object size prop applies correctly (coerce to number)
//  5) Pixel art canvas supports up to 512×512
//  6) Orbit-control hints in both 2D and 3D
//  7) Sprite target selector in block params (existing assets)
// ═══════════════════════════════════════════════════════════════
(function forgeMasterPatchV10(){
  if (STATE.__forgeMasterPatchV10) return;
  STATE.__forgeMasterPatchV10 = true;

  // ── 1) Fix math library to expose real Math.* methods ─────────────────────
  var mathLib = {
    // All standard Math functions
    abs:Math.abs, acos:Math.acos, acosh:Math.acosh, asin:Math.asin, asinh:Math.asinh,
    atan:Math.atan, atanh:Math.atanh, atan2:Math.atan2, cbrt:Math.cbrt, ceil:Math.ceil,
    clz32:Math.clz32, cos:Math.cos, cosh:Math.cosh, exp:Math.exp, expm1:Math.expm1,
    floor:Math.floor, fround:Math.fround, hypot:Math.hypot, imul:Math.imul, log:Math.log,
    log1p:Math.log1p, log10:Math.log10, log2:Math.log2, max:Math.max, min:Math.min,
    pow:Math.pow, random:Math.random, round:Math.round, sign:Math.sign, sin:Math.sin,
    sinh:Math.sinh, sqrt:Math.sqrt, tan:Math.tan, tanh:Math.tanh, trunc:Math.trunc,
    PI:Math.PI, E:Math.E, LN2:Math.LN2, LN10:Math.LN10, LOG2E:Math.LOG2E, LOG10E:Math.LOG10E,
    SQRT2:Math.SQRT2,
    // dist: Euclidean distance between two points [x1,y1] and [x2,y2]
    dist: function(a, b) {
      if (Array.isArray(a) && Array.isArray(b)) {
        var sum = 0;
        var len = Math.min(a.length, b.length);
        for (var i = 0; i < len; i++) { var d = a[i] - b[i]; sum += d * d; }
        return Math.sqrt(sum);
      }
      // dist(x1,y1,x2,y2) form
      if (arguments.length >= 4) {
        var dx = arguments[2] - arguments[0], dy = arguments[3] - arguments[1];
        return Math.sqrt(dx*dx + dy*dy);
      }
      return 0;
    },
    clamp: function(v,mn,mx){ return Math.max(mn, Math.min(mx, v)); },
    lerp: function(a,b,t){ return a + (b-a)*t; },
    degToRad: function(d){ return d * Math.PI / 180; },
    radToDeg: function(r){ return r * 180 / Math.PI; },
    map: function(v,a,b,c,d){ return c+(d-c)*((v-a)/(b-a)); },
    norm: function(v,mn,mx){ return (v-mn)/(mx-mn); },
    // Vector helpers
    vec2: function(x,y){ return {x:x||0,y:y||0}; },
    vec3: function(x,y,z){ return {x:x||0,y:y||0,z:z||0}; },
    dot: function(a,b){ return (a.x||0)*(b.x||0)+(a.y||0)*(b.y||0)+(a.z||0)*(b.z||0); },
    cross2: function(a,b){ return (a.x||0)*(b.y||0)-(a.y||0)*(b.x||0); },
  };
  // Make it callable as a function too and callable as math.X
  Object.assign(mathLib, Math);
  // Inject into snippet runner by overriding the library builder for 'math'
  var _origMakeSnippet = window._forgeMakeSnippetLib;
  // Patch the snippet runner's scope to inject the real mathLib
  var _origRunSnippet = runSnippet;
  runSnippet = function(){
    // Temporarily inject real math into window so Function scope can find it
    var prev = window.math;
    window.math = mathLib;
    window.MathLib = mathLib;
    try { _origRunSnippet(); } finally {
      if (prev === undefined) delete window.math; else window.math = prev;
    }
  };
  window.runSnippet = runSnippet;
  window.math = mathLib;
  window.MathLib = mathLib;

  // ── 2) Override renderBlockEditor to use typed inputs via renderBlockParamInput ─
  var _renderBlockEditorBase = renderBlockEditor;
  renderBlockEditor = function(){
    var canvas=safeEl('be-canvas'), svg=safeEl('be-svg'); if(!canvas||!svg) return;
    if(typeof ensureBlockViewV4==='function') ensureBlockViewV4();
    canvas.innerHTML=''; svg.innerHTML='';
    var W=2400,H=1600; svg.setAttribute('viewBox','0 0 '+W+' '+H);
    if(typeof applyBlockViewV4==='function') applyBlockViewV4();

    BE.blocks.forEach(function(block){
      var def=(typeof blockDefFor==='function')?blockDefFor(block):{ports:{in:[],out:[]}};
      var catColor=BLOCK_DEFS[block.cat]?.color||'#888';
      var catBg=BLOCK_DEFS[block.cat]?.bg||'rgba(128,128,128,.12)';
      var el=document.createElement('div');
      el.className='be-block'+((typeof beIsSelected==='function'?beIsSelected(block.id):block.id===BE.selected)?' selected':'');
      el.id='be-block-'+block.id;
      el.style.cssText='left:'+block.x+'px;top:'+block.y+'px';

      // Build header
      var header=document.createElement('div');
      header.className='be-block-header';
      header.style.background=catBg;
      header.innerHTML='<span class="be-block-cat" style="background:'+catColor+'20;color:'+catColor+';border:1px solid '+catColor+'40">'+block.cat+'</span><span class="be-block-title">'+block.type+'</span>';

      // Build body with typed inputs
      var body=document.createElement('div');
      body.className='be-block-body';

      // In ports
      (def.ports&&def.ports.in||[]).forEach(function(p){
        var row=document.createElement('div');row.className='be-port-row';
        var connected=(typeof isPortConnected==='function')&&isPortConnected(block.id,p,'in');
        row.innerHTML='<div class="be-port in"><div class="be-connector'+(connected?' connected':'')+'" data-block="'+block.id+'" data-port="'+p+'" data-dir="in"></div><span style="font-size:10px;color:var(--text2)">'+p+'</span></div>';
        body.appendChild(row);
      });
      // Out ports
      (def.ports&&def.ports.out||[]).forEach(function(p){
        var row=document.createElement('div');row.className='be-port-row';
        var connected=(typeof isPortConnected==='function')&&isPortConnected(block.id,p,'out');
        row.innerHTML='<div class="be-port out" style="margin-left:auto"><span style="font-size:10px;color:var(--text2)">'+p+'</span><div class="be-connector'+(connected?' connected':'')+'" data-block="'+block.id+'" data-port="'+p+'" data-dir="out"></div></div>';
        body.appendChild(row);
      });
      // Params with typed inputs
      (block.params||[]).forEach(function(param){
        var html;
        if(typeof window.renderBlockParamInput==='function') {
          html=window.renderBlockParamInput(block,param);
        } else {
          var esc2=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
          html='<div class="be-param"><span class="be-param-label">'+esc2(param.k)+'</span><input class="be-param-input" value="'+esc2(param.v)+'" oninput="setBlockParam('+block.id+',\\''+esc2(param.k)+'\\',this.value)" onclick="event.stopPropagation()"/></div>';
        }
        var tmp=document.createElement('div'); tmp.innerHTML=html; body.appendChild(tmp.firstChild);
      });

      el.appendChild(header);
      el.appendChild(body);

      // Asset selector row if block targets objects
      var assetParams = (block.params||[]).filter(function(p){ return p.k==='target'||p.k==='object'||p.k==='name'; });
      if(assetParams.length && STATE.objects.length > 0) {
        var sel=document.createElement('select');
        sel.className='be-param-input';
        sel.style.cssText='width:100%;margin-top:3px;font-size:9px;';
        sel.title='Quick-select scene object';
        var blankOpt=document.createElement('option'); blankOpt.value=''; blankOpt.textContent='— scene objects —'; sel.appendChild(blankOpt);
        STATE.objects.forEach(function(obj){
          var opt=document.createElement('option'); opt.value=obj.name; opt.textContent=obj.type+': '+obj.name; sel.appendChild(opt);
        });
        sel.onchange=function(){
          var p=assetParams[0];
          if(p){ if(typeof setBlockParam==='function')setBlockParam(block.id,p.k,sel.value); }
          sel.value='';
        };
        sel.onclick=function(e){e.stopPropagation();};
        sel.onmousedown=function(e){e.stopPropagation();};
        body.appendChild(sel);
      }

      // Header drag
      header.addEventListener('mousedown', function(e){
        e.stopPropagation(); if(V3&&V3.connecting) return;
        if(typeof snapshotBlocks==='function') snapshotBlocks();
        if(typeof PATCH_V4!=='undefined') PATCH_V4.movedBlockSnapshot=true;
        BE.selected=block.id;
        var pt=(typeof beLocalPointV4==='function')?beLocalPointV4(e):{x:e.clientX,y:e.clientY};
        BE.dragging=block; BE.dragOffX=pt.x-block.x; BE.dragOffY=pt.y-block.y;
        renderBlockEditor();
      });
      el.addEventListener('mousedown', function(e){
        if(!e.target.classList.contains('be-connector')){
          if(e.ctrlKey||e.metaKey){
            if(typeof beToggleMulti==='function') beToggleMulti(block.id);
          } else {
            BE.selected=block.id;
            if(typeof beClearMulti==='function') beClearMulti();
          }
          renderBlockEditor();
        }
      });
      canvas.appendChild(el);
    });

    canvas.querySelectorAll('.be-connector').forEach(function(conn){
      conn.addEventListener('mousedown',function(e){
        if(typeof beginBlockConnection==='function') beginBlockConnection(e,+conn.dataset.block,conn.dataset.port,conn.dataset.dir);
      });
    });
    // Draw connections
    BE.connections.forEach(function(conn){
      var fromEl=canvas.querySelector('#be-block-'+conn.from+' .be-connector[data-port="'+conn.fromPort+'"][data-dir="out"]');
      var toEl=canvas.querySelector('#be-block-'+conn.to+' .be-connector[data-port="'+conn.toPort+'"][data-dir="in"]');
      if(!fromEl||!toEl) return;
      var a=(typeof connectorPoint==='function')?connectorPoint(fromEl):{x:0,y:0};
      var b=(typeof connectorPoint==='function')?connectorPoint(toEl):{x:0,y:0};
      var bezD=(typeof makeBezier==='function')?makeBezier(a,b):('M'+a.x+','+a.y+' L'+b.x+','+b.y);
      var hit=document.createElementNS('http://www.w3.org/2000/svg','path');
      hit.setAttribute('d',bezD); hit.setAttribute('class','be-connection-hit');
      hit.addEventListener('dblclick',function(){
        if(typeof snapshotBlocks==='function') snapshotBlocks();
        BE.connections=BE.connections.filter(function(c){return c!==conn;});
        renderBlockEditor();
        if(typeof syncCodeFromBlocksV4==='function') syncCodeFromBlocksV4('connection removed');
      });
      svg.appendChild(hit);
      var path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',bezD); path.setAttribute('fill','none'); path.setAttribute('stroke','#00d4ff');
      path.setAttribute('stroke-width','2'); path.setAttribute('opacity','0.82');
      svg.appendChild(path);
    });
    canvas.onmousemove=function(e){
      if(BE.dragging&&!(V3&&V3.connecting)){
        var pt=(typeof beLocalPointV4==='function')?beLocalPointV4(e):{x:e.clientX,y:e.clientY};
        BE.dragging.x=Math.max(0,pt.x-BE.dragOffX); BE.dragging.y=Math.max(0,pt.y-BE.dragOffY);
        renderBlockEditor();
      }
    };
    canvas.onmouseup=function(){
      if(BE.dragging){BE.dragging=null; if(typeof PATCH_V4!=='undefined') PATCH_V4.movedBlockSnapshot=false; if(typeof syncCodeFromBlocksV4==='function') syncCodeFromBlocksV4('block moved');}
    };
  };
  window.renderBlockEditor = renderBlockEditor;

  // ── 3) Improve 3D grid clarity ─────────────────────────────────────────────
  var _origDraw3DScene = draw3DScene;
  draw3DScene = function(ctx, W, H){
    // Call original, then overdraw with brighter grid
    // Actually we replace the grid drawing by patching draw3DScene
    if(!W||!H) return;
    // Replicate full 3D scene with better grid
    // Professional dark environment background
    var bgGrad=ctx.createLinearGradient(0,0,0,H);
    bgGrad.addColorStop(0,'#0a0e1a');
    bgGrad.addColorStop(0.6,'#07090e');
    bgGrad.addColorStop(1,'#040608');
    ctx.fillStyle=bgGrad;
    ctx.fillRect(0,0,W,H);
    // Subtle vignette
    var vig=ctx.createRadialGradient(W/2,H/2,H*0.2,W/2,H/2,H*0.85);
    vig.addColorStop(0,'transparent');
    vig.addColorStop(1,'rgba(0,0,0,0.4)');
    ctx.fillStyle=vig; ctx.fillRect(0,0,W,H);

    var VP3D_ref = (typeof VP3D!=='undefined')?VP3D:{azimuth:-0.5,elevation:0.72,distance:520,panX:0,panY:0,zoom:1,drawCalls:0,fps:0};
    VP3D_ref.drawCalls=0;
    var az=VP3D_ref.azimuth, el2=VP3D_ref.elevation, dist=Math.max(50,VP3D_ref.distance/VP3D_ref.zoom);
    var camX=dist*Math.sin(az)*Math.cos(el2);
    var camY=dist*Math.sin(el2);
    var camZ=dist*Math.cos(az)*Math.cos(el2);
    var cx=W/2+VP3D_ref.panX, cy=H/2+VP3D_ref.panY, fov=0.85;

    function project(wx,wy,wz){
      var dx=wx-camX,dy=wy-camY,dz=wz-camZ;
      var mag=Math.sqrt(camX*camX+camY*camY+camZ*camZ)||1;
      var fwdX=-camX/mag,fwdY=-camY/mag,fwdZ=-camZ/mag;
      var rightX=Math.cos(az),rightY=0,rightZ=-Math.sin(az);
      var upX=Math.sin(el2)*Math.sin(az),upY=Math.cos(el2),upZ=Math.sin(el2)*Math.cos(az);
      var vx=dx*rightX+dy*rightY+dz*rightZ;
      var vy=dx*upX+dy*upY+dz*upZ;
      var vz=dx*fwdX+dy*fwdY+dz*fwdZ;
      if(vz>=-1)return null;
      var scale=fov*Math.min(W,H)/(-vz);
      return{sx:cx+vx*scale,sy:cy-vy*scale,scale:scale};
    }

    // ── PROFESSIONAL WHITE GROUND GRID (respects STATE.gridVisible toggle) ──
    var gridIsVisible = (typeof STATE !== 'undefined') ? STATE.gridVisible !== false : true;
    if(gridIsVisible){
      var GRID_SIZE=800, GRID_STEP=50;
      // Draw a filled white ground plane quad first for contrast
      var gCorners=[project(-GRID_SIZE,0,-GRID_SIZE),project(GRID_SIZE,0,-GRID_SIZE),project(GRID_SIZE,0,GRID_SIZE),project(-GRID_SIZE,0,GRID_SIZE)];
      if(gCorners.every(Boolean)){
        ctx.beginPath();
        ctx.moveTo(gCorners[0].sx,gCorners[0].sy);
        ctx.lineTo(gCorners[1].sx,gCorners[1].sy);
        ctx.lineTo(gCorners[2].sx,gCorners[2].sy);
        ctx.lineTo(gCorners[3].sx,gCorners[3].sy);
        ctx.closePath();
        ctx.fillStyle='rgba(255,255,255,0.035)';
        ctx.fill();
      }
      var gAlpha = Math.min(1, VP3D_ref.zoom * 0.9 + 0.45);
      // White grid lines — professional light style on dark bg
      for(var ix=-GRID_SIZE;ix<=GRID_SIZE;ix+=GRID_STEP){
        var ga=project(ix,0,-GRID_SIZE),gb=project(ix,0,GRID_SIZE);
        if(!ga||!gb)continue;
        ctx.beginPath();ctx.moveTo(ga.sx,ga.sy);ctx.lineTo(gb.sx,gb.sy);
        var isMajorX=(ix%(GRID_STEP*4)===0);
        if(ix===0){ctx.strokeStyle='rgba(0,212,255,'+(gAlpha*0.95)+')'; ctx.lineWidth=2;}
        else if(isMajorX){ctx.strokeStyle='rgba(220,230,255,'+(gAlpha*0.55)+')'; ctx.lineWidth=1.2;}
        else {ctx.strokeStyle='rgba(200,210,255,'+(gAlpha*0.22)+')'; ctx.lineWidth=0.6;}
        ctx.stroke(); VP3D_ref.drawCalls++;
      }
      for(var iz=-GRID_SIZE;iz<=GRID_SIZE;iz+=GRID_STEP){
        var gc=project(-GRID_SIZE,0,iz),gd=project(GRID_SIZE,0,iz);
        if(!gc||!gd)continue;
        ctx.beginPath();ctx.moveTo(gc.sx,gc.sy);ctx.lineTo(gd.sx,gd.sy);
        var isMajorZ=(iz%(GRID_STEP*4)===0);
        if(iz===0){ctx.strokeStyle='rgba(0,212,255,'+(gAlpha*0.95)+')'; ctx.lineWidth=2;}
        else if(isMajorZ){ctx.strokeStyle='rgba(220,230,255,'+(gAlpha*0.55)+')'; ctx.lineWidth=1.2;}
        else {ctx.strokeStyle='rgba(200,210,255,'+(gAlpha*0.22)+')'; ctx.lineWidth=0.6;}
        ctx.stroke(); VP3D_ref.drawCalls++;
      }
      // Draw major cell highlights at intersections for depth cues
      var majorStep=GRID_STEP*4;
      for(var vx2=-GRID_SIZE;vx2<=GRID_SIZE;vx2+=majorStep){
        for(var vz2=-GRID_SIZE;vz2<=GRID_SIZE;vz2+=majorStep){
          var va=project(vx2,0,vz2);
          if(!va)continue;
          ctx.beginPath();ctx.arc(va.sx,va.sy,2,0,Math.PI*2);
          ctx.fillStyle='rgba(255,255,255,'+(gAlpha*0.25)+')';ctx.fill();
        }
      }
    } // end gridIsVisible

    // ── World axes ──
    var orig=project(0,0,0);
    if(orig){
      var axX=project(80,0,0),axY=project(0,80,0),axZ=project(0,0,80);
      if(axX){ctx.beginPath();ctx.moveTo(orig.sx,orig.sy);ctx.lineTo(axX.sx,axX.sy);ctx.strokeStyle='rgba(239,68,68,.95)';ctx.lineWidth=2.5;ctx.stroke();}
      if(axY){ctx.beginPath();ctx.moveTo(orig.sx,orig.sy);ctx.lineTo(axY.sx,axY.sy);ctx.strokeStyle='rgba(34,197,94,.95)';ctx.lineWidth=2.5;ctx.stroke();}
      if(axZ){ctx.beginPath();ctx.moveTo(orig.sx,orig.sy);ctx.lineTo(axZ.sx,axZ.sy);ctx.strokeStyle='rgba(59,130,246,.95)';ctx.lineWidth=2.5;ctx.stroke();}
      // Axis labels
      if(axX){ctx.fillStyle='rgba(239,68,68,.9)';ctx.font='bold 12px Share Tech Mono';ctx.textAlign='center';ctx.fillText('X',axX.sx,axX.sy);}
      if(axY){ctx.fillStyle='rgba(34,197,94,.9)';ctx.font='bold 12px Share Tech Mono';ctx.textAlign='center';ctx.fillText('Y',axY.sx,axY.sy-6);}
      if(axZ){ctx.fillStyle='rgba(59,130,246,.9)';ctx.font='bold 12px Share Tech Mono';ctx.textAlign='center';ctx.fillText('Z',axZ.sx,axZ.sy);}
      VP3D_ref.drawCalls+=3;
    }

    // ── Draw objects: cameras first (always visible), then 3D boxes ──
    var vpW = W, vpH = H;
    var sorted=[...STATE.objects].sort(function(a,b){
      var da=(a.x-camX)*(a.x-camX)+((a.y||0)-camY)*((a.y||0)-camY)+((a.z||0)-camZ)*((a.z||0)-camZ);
      var db=(b.x-camX)*(b.x-camX)+((b.y||0)-camY)*((b.y||0)-camY)+((b.z||0)-camZ)*((b.z||0)-camZ);
      return db-da;
    });
    sorted.forEach(function(obj){
      if(!obj.visible)return;

      // ── Camera objects: drawn as a 3D camera frustum with label ──
      if(obj.type==='camera'){
        var hw=vpW/2, hh2=vpH/2;
        var ox=(typeof obj.x==='number')?obj.x:0;
        var oy=(typeof obj.y==='number')?obj.y:0;
        // Map 2D editor coords to 3D world (same mapping as non-V10 draw3DScene)
        var wx=(typeof obj.x3d==='number')?obj.x3d:(ox-hw);
        var wz=(typeof obj.z3d==='number')?obj.z3d:(oy-hh2);
        var wy=(typeof obj.y3d==='number')?obj.y3d:0;
        var cw=Math.max(obj.w||40,80), ch=Math.max(obj.h||30,54), cd=70;
        var topY=wy-ch, baseY=wy;
        var camPts=[
          [wx-cw/2,baseY,wz-cd/2],[wx+cw/2,baseY,wz-cd/2],[wx+cw/2,baseY,wz+cd/2],[wx-cw/2,baseY,wz+cd/2],
          [wx-cw/2,topY,wz-cd/2],[wx+cw/2,topY,wz-cd/2],[wx+cw/2,topY,wz+cd/2],[wx-cw/2,topY,wz+cd/2],
          [wx,topY-ch*0.45,wz+cd*0.95]
        ].map(function(c){return project(c[0],c[1],c[2]);});
        if(camPts.every(Boolean)){
          var edgePairs=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7],[4,8],[5,8],[6,8],[7,8]];
          ctx.save();
          ctx.shadowColor='rgba(251,191,36,.75)'; ctx.shadowBlur=10;
          ctx.strokeStyle='rgba(251,191,36,.98)'; ctx.lineWidth=2.2;
          edgePairs.forEach(function(pair){ctx.beginPath();ctx.moveTo(camPts[pair[0]].sx,camPts[pair[0]].sy);ctx.lineTo(camPts[pair[1]].sx,camPts[pair[1]].sy);ctx.stroke();});
          ctx.shadowBlur=0;
          ctx.fillStyle='rgba(251,191,36,.16)';
          ctx.beginPath();ctx.moveTo(camPts[4].sx,camPts[4].sy);
          [5,6,7].forEach(function(i){ctx.lineTo(camPts[i].sx,camPts[i].sy);});
          ctx.closePath();ctx.fill();
          var label=project(wx,topY-ch*0.72,wz+cd*0.95);
          if(label){
            ctx.fillStyle='rgba(8,9,13,.82)';
            if(ctx.roundRect)ctx.roundRect(label.sx-48,label.sy-18,96,20,4); else ctx.rect(label.sx-48,label.sy-18,96,20);
            ctx.fill();
            ctx.fillStyle='#fbbf24';ctx.font='bold 10px Share Tech Mono';ctx.textAlign='center';ctx.fillText(obj.name||'CAMERA',label.sx,label.sy-4);
          }
          if(obj.id===STATE.selectedId){ctx.strokeStyle='rgba(0,212,255,.9)';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(camPts[4].sx,camPts[4].sy);[5,6,7,4].forEach(function(i){ctx.lineTo(camPts[i].sx,camPts[i].sy);});ctx.stroke();}
          ctx.restore(); VP3D_ref.drawCalls++;
        } else {
          // Fallback: dot at projected camera world position
          var dot=project(wx,wy,wz);
          if(dot){
            ctx.save();
            ctx.fillStyle='rgba(251,191,36,.9)';
            ctx.beginPath();ctx.arc(dot.sx,dot.sy,8,0,Math.PI*2);ctx.fill();
            ctx.fillStyle='#fbbf24';ctx.font='bold 10px Share Tech Mono';ctx.textAlign='center';
            ctx.fillText(obj.name||'CAM',dot.sx,dot.sy-14);
            if(obj.id===STATE.selectedId){ctx.strokeStyle='#00d4ff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(dot.sx,dot.sy,11,0,Math.PI*2);ctx.stroke();}
            ctx.restore(); VP3D_ref.drawCalls++;
          }
        }
        return;
      }

      // ── All other objects: 3D boxes ──
      var bw=obj.w||40,bh=obj.h||40,bd=obj.w||40;
      var bx=obj.x-bw/2,by=-(obj.h||40),bz=(obj.z||0)-bd/2;
      var corners=[[bx,by+bh,bz],[bx+bw,by+bh,bz],[bx+bw,by+bh,bz+bd],[bx,by+bh,bz+bd],[bx,by,bz],[bx+bw,by,bz],[bx+bw,by,bz+bd],[bx,by,bz+bd]].map(function(c){return project(c[0],c[1],c[2]);});
      if(corners.some(function(c){return !c;}))return;
      VP3D_ref.drawCalls++;
      var hex=obj.color||'#4488cc';
      var r=parseInt(hex.slice(1,3),16)||68,g=parseInt(hex.slice(3,5),16)||136,b2=parseInt(hex.slice(5,7),16)||204;
      var faces=[{pts:[4,5,1,0],light:0.7},{pts:[5,6,2,1],light:0.5},{pts:[6,7,3,2],light:0.35},{pts:[7,4,0,3],light:0.55},{pts:[0,1,2,3],light:0.25},{pts:[4,5,6,7],light:1.0}];
      var sel=obj.id===STATE.selectedId;
      faces.forEach(function(f){
        var pts=f.pts.map(function(i){return corners[i];});
        var l=f.light;
        ctx.beginPath();ctx.moveTo(pts[0].sx,pts[0].sy);
        pts.forEach(function(p){ctx.lineTo(p.sx,p.sy);});
        ctx.closePath();
        ctx.fillStyle='rgba('+Math.round(r*l)+','+Math.round(g*l)+','+Math.round(b2*l)+',0.9)';
        ctx.fill();
        if(sel){ctx.strokeStyle='rgba(0,212,255,.85)';ctx.lineWidth=1.8;}
        else{ctx.strokeStyle='rgba(0,0,0,.4)';ctx.lineWidth=0.6;}
        ctx.stroke();
      });
      var top=corners[4];
      if(top){
        ctx.fillStyle='rgba(255,255,255,.85)';ctx.font=Math.max(9,top.scale*7)+'px Share Tech Mono';
        ctx.textAlign='center';ctx.fillText(obj.name,top.sx,top.sy-9);
      }
    });

    // ── Orbit control hint ──
    ctx.fillStyle='rgba(255,255,255,.25)';ctx.font='9px Share Tech Mono';ctx.textAlign='left';
    ctx.fillText('LMB: select/orbit  |  RMB/MMB: pan  |  Scroll: zoom  |  WASD/Arrows: fly',10,H-10);

    // ── Gizmo cube in corner ──
    var gx=W-72,gy=72,gr=30;
    ctx.save();ctx.translate(gx,gy);
    function gizProj(x,y,z){return{x:x*Math.cos(az)-z*Math.sin(az),y:y*Math.cos(el2)-(x*Math.sin(az)+z*Math.cos(az))*Math.sin(el2)};}
    var gAxes=[{v:[gr,0,0],c:'#ef4444',l:'X'},{v:[0,gr,0],c:'#22c55e',l:'Y'},{v:[0,0,gr],c:'#3b82f6',l:'Z'}];
    gAxes.forEach(function(a){
      var p=gizProj(a.v[0],a.v[1],a.v[2]);
      ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(p.x,-p.y);
      ctx.strokeStyle=a.c;ctx.lineWidth=2.5;ctx.stroke();
      ctx.fillStyle=a.c;ctx.font='bold 11px Share Tech Mono';ctx.textAlign='center';
      ctx.fillText(a.l,p.x*1.25,-p.y*1.25+4);
    });
    ctx.restore();

    // ── Stats HUD ──
    var t2=performance.now();
    if(VP3D_ref._lastT){var delta=t2-VP3D_ref._lastT;VP3D_ref.fps=Math.round(1000/Math.max(1,delta));}
    VP3D_ref._lastT=t2;
    ctx.fillStyle='rgba(8,9,13,.8)';ctx.beginPath();
    if(ctx.roundRect)ctx.roundRect(W-148,8,140,66,4);else ctx.rect(W-148,8,140,66);
    ctx.fill();
    ctx.fillStyle='rgba(0,212,255,.5)';ctx.font='9px Share Tech Mono';ctx.textAlign='left';
    ctx.fillText('3D VIEWPORT',W-140,24);
    ctx.fillStyle='rgba(255,255,255,.6)';
    ctx.fillText('AZ:'+((VP3D_ref.azimuth||0)*57.3).toFixed(1)+'° EL:'+((VP3D_ref.elevation||0)*57.3).toFixed(1)+'°',W-140,38);
    ctx.fillText('ZOOM '+((VP3D_ref.zoom||1)).toFixed(2)+'×  DC:'+VP3D_ref.drawCalls,W-140,52);
    ctx.fillText('OBJS '+STATE.objects.length+'  FPS:'+(VP3D_ref.fps||60),W-140,66);
  };
  window.draw3DScene = draw3DScene;

  // Override renderViewport to pick up the patched draw3DScene
  var _origRenderViewport = renderViewport;
  renderViewport = function(){
    var W=vpCanvas.width, H=vpCanvas.height;
    vpCtx.clearRect(0,0,W,H);
    vpCtx.fillStyle=STATE.mode==='3d'?'#07090e':'#0d0f18';
    vpCtx.fillRect(0,0,W,H);
    if(STATE.mode==='3d') window.draw3DScene(vpCtx,W,H);
    else draw2DScene(vpCtx,W,H);
  };
  window.renderViewport = renderViewport;

  // ── 4) Fix setProp to correctly coerce number values ──────────────────────
  var _origSetProp = setProp;
  setProp = function(id, key, val){
    var numericKeys = ['x','y','w','h','z','rot','scaleX','scaleY','opacity'];
    var obj=STATE.objects.find(function(o){return o.id===id;});
    if(obj && numericKeys.indexOf(key)!==-1) {
      var n=parseFloat(val);
      if(!isNaN(n)) val=n;
    }
    _origSetProp(id, key, val);
  };
  window.setProp = setProp;

  // ── 5) Pixel art canvas supports up to 512×512 ─────────────────────────────
  // Update the markup pe-w and pe-h max to 512
  var peW=document.getElementById('pe-w'), peH=document.getElementById('pe-h');
  if(peW) peW.setAttribute('max','512');
  if(peH) peH.setAttribute('max','512');

  // ── 6) Add 2D orbit/pan control hint ──────────────────────────────────────
  var vpInfoEl=document.querySelector('.vp-info');
  if(vpInfoEl && !vpInfoEl._hintAdded){
    vpInfoEl._hintAdded=true;
    var hintSpan=document.createElement('span');
    hintSpan.style.cssText='color:var(--text2);font-size:9px;margin-left:8px;';
    hintSpan.title='Middle-mouse or Alt+drag to pan. Scroll to zoom.';
    hintSpan.textContent='Pan: MMB/Alt+drag';
    vpInfoEl.appendChild(hintSpan);
  }

  // ── 7) Fix BLOCK_DEFS to have more accurate settings per block type ───────
  // Map block parameters to actual Canvex library method parameters
  if(BLOCK_DEFS.Sprites){
    BLOCK_DEFS.Sprites.types.forEach(function(t){
      if(t.name==='Load Sprite') t.params=[{k:'target',v:'',type:'target'},{k:'image',v:'player.png',type:'text'}];
      if(t.name==='Play Animation') t.params=[{k:'target',v:'',type:'target'},{k:'anim',v:'run',type:'text'},{k:'loop',v:'true',type:'select',options:['true','false']}];
      if(t.name==='Stop Animation') t.params=[{k:'target',v:'',type:'target'}];
      if(t.name==='Set Frame') t.params=[{k:'target',v:'',type:'target'},{k:'frame',v:'0',type:'number'}];
      if(t.name==='Set Opacity') t.params=[{k:'target',v:'',type:'target'},{k:'val',v:'1',type:'number'}];
      if(t.name==='Set Tint') t.params=[{k:'target',v:'',type:'target'},{k:'color',v:'#ffffff',type:'color'}];
      if(t.name==='Set Visible') t.params=[{k:'target',v:'',type:'target'},{k:'visible',v:'true',type:'select',options:['true','false']}];
      if(t.name==='Draw Sprite') t.params=[{k:'image',v:'player.png',type:'text'},{k:'x',v:'0',type:'number'},{k:'y',v:'0',type:'number'}];
    });
  }
  if(BLOCK_DEFS.Sound){
    BLOCK_DEFS.Sound.types.forEach(function(t){
      if(t.name==='Play Sound') t.params=[{k:'src',v:'jump.wav',type:'text'},{k:'volume',v:'1',type:'number'},{k:'loop',v:'false',type:'select',options:['false','true']}];
      if(t.name==='Stop Sound') t.params=[{k:'src',v:'music.mp3',type:'text'}];
      if(t.name==='Stop All') t.params=[];
      if(t.name==='Set Volume') t.params=[{k:'vol',v:'0.8',type:'number'}];
      if(t.name==='Fade In') t.params=[{k:'src',v:'music.mp3',type:'text'},{k:'duration',v:'1000',type:'number'}];
      if(t.name==='Fade Out') t.params=[{k:'src',v:'music.mp3',type:'text'},{k:'duration',v:'500',type:'number'}];
    });
  }
  if(BLOCK_DEFS.Physics){
    BLOCK_DEFS.Physics.types.forEach(function(t){
      if(t.name==='Apply Force') t.params=[{k:'target',v:'',type:'target'},{k:'x',v:'0',type:'number'},{k:'y',v:'-300',type:'number'}];
      if(t.name==='Apply Impulse') t.params=[{k:'target',v:'',type:'target'},{k:'x',v:'0',type:'number'},{k:'y',v:'-500',type:'number'}];
      if(t.name==='Set Velocity') t.params=[{k:'target',v:'',type:'target'},{k:'x',v:'5',type:'number'},{k:'y',v:'0',type:'number'}];
      if(t.name==='Stop Movement') t.params=[{k:'target',v:'',type:'target'}];
      if(t.name==='Add Gravity') t.params=[{k:'g',v:'9.8',type:'number'}];
      if(t.name==='Set Gravity') t.params=[{k:'g',v:'9.8',type:'number'}];
      if(t.name==='Detect Collision') t.params=[{k:'a',v:'',type:'target'},{k:'b',v:'',type:'target'}];
      if(t.name==='Enable Physics') t.params=[{k:'target',v:'',type:'target'},{k:'mass',v:'1',type:'number'}];
    });
  }
  if(BLOCK_DEFS.Transform){
    BLOCK_DEFS.Transform.types.forEach(function(t){
      if(t.name==='Move To') t.params=[{k:'target',v:'',type:'target'},{k:'x',v:'0',type:'number'},{k:'y',v:'0',type:'number'}];
      if(t.name==='Move By') t.params=[{k:'target',v:'',type:'target'},{k:'dx',v:'0',type:'number'},{k:'dy',v:'0',type:'number'}];
      if(t.name==='Rotate') t.params=[{k:'target',v:'',type:'target'},{k:'angle',v:'45',type:'number'}];
      if(t.name==='Rotate To') t.params=[{k:'target',v:'',type:'target'},{k:'angle',v:'0',type:'number'}];
      if(t.name==='Scale') t.params=[{k:'target',v:'',type:'target'},{k:'x',v:'1',type:'number'},{k:'y',v:'1',type:'number'}];
      if(t.name==='Set Size') t.params=[{k:'target',v:'',type:'target'},{k:'w',v:'48',type:'number'},{k:'h',v:'48',type:'number'}];
    });
  }
  if(BLOCK_DEFS.Camera){
    BLOCK_DEFS.Camera.types.forEach(function(t){
      if(t.name==='Follow Target') t.params=[{k:'target',v:'',type:'target'},{k:'speed',v:'0.1',type:'number'}];
      if(t.name==='Shake') t.params=[{k:'magnitude',v:'5',type:'number'},{k:'duration',v:'300',type:'number'}];
      if(t.name==='Set Zoom') t.params=[{k:'zoom',v:'1.5',type:'number'}];
    });
  }
  if(BLOCK_DEFS.Events){
    BLOCK_DEFS.Events.types.forEach(function(t){
      if(t.name==='On Key Press') t.params=[{k:'key',v:'Space',type:'select',options:['Space','Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d']}];
      if(t.name==='On Collision') t.params=[{k:'target',v:'',type:'target'},{k:'tag',v:'enemy',type:'text'}];
    });
  }
  if(BLOCK_DEFS.Logic){
    BLOCK_DEFS.Logic.types.forEach(function(t){
      if(t.name==='Compare') t.params=[{k:'a',v:'0',type:'text'},{k:'op',v:'==',type:'select',options:['==','!=','>','>=','<','<=']},{k:'b',v:'0',type:'text'}];
    });
  }
  if(BLOCK_DEFS.Flow){
    BLOCK_DEFS.Flow.types.forEach(function(t){
      if(t.name==='Delay') t.params=[{k:'ms',v:'500',type:'number'}];
      if(t.name==='Loop') t.params=[{k:'iterations',v:'10',type:'number'}];
    });
  }

  // Ensure renderBlockEditor is triggered after we patch it
  if(STATE.editorTab==='blocks') renderBlockEditor();

  // ── Expose console.log to snippet runner directly ─────────────────────────
  // Already handled by hotfix v9, but ensure math is always injected
  if(typeof window.math!=='object'||!window.math.dist) window.math=mathLib;
  if(typeof window.MathLib!=='object') window.MathLib=mathLib;

})();

  

// ═══════════════════════════════════════════════════════════════
//  COPILOT PATCH V14: real module import support for Code Editor
//  Static imports are transformed into async dynamic imports so imported
//  symbols resolve to the actual exported class/function/object whenever the
//  module file exists. A proxy fallback is used only if the module cannot load.
// ═══════════════════════════════════════════════════════════════
(function forgeRealModuleImportRuntimeV14(){
  if (STATE.__forgeRealModuleImportRuntimeV14) return;
  STATE.__forgeRealModuleImportRuntimeV14 = true;

  var MODULE_CACHE_V14 = Object.create(null);

  function symbolProxyV14(name){
    var fn = function(){ return undefined; };
    try { Object.defineProperty(fn, 'name', { value: String(name || 'forgeSymbol'), configurable: true }); } catch (_) {}
    fn.__forgeSymbol = true;
    fn.default = fn;
    if (typeof Proxy !== 'function') return fn;
    return new Proxy(fn, {
      get: function(obj, prop){
        if (prop in obj) return obj[prop];
        if (prop === Symbol.toStringTag) return 'FORGE symbol';
        if (typeof prop === 'string') {
          obj[prop] = symbolProxyV14(prop);
          return obj[prop];
        }
        return undefined;
      },
      apply: function(){ return undefined; },
      construct: function(){ return {}; }
    });
  }

  function moduleProxyV14(name){
    var target = { name: String(name || 'module'), __forgeModule: true };
    target.default = target;
    target.toString = function(){ return '[FORGE module ' + target.name + ']'; };
    if (typeof Proxy !== 'function') return target;
    return new Proxy(target, {
      get: function(obj, prop){
        if (prop in obj) return obj[prop];
        if (prop === Symbol.toStringTag) return 'FORGE module';
        if (typeof prop === 'string') {
          obj[prop] = symbolProxyV14(prop);
          return obj[prop];
        }
        return undefined;
      }
    });
  }

  function mathModuleV14(){
    var existing = window.math || window.MathLib;
    if (existing && typeof existing === 'object') return existing;
    var m = {
      abs: Math.abs, acos: Math.acos, acosh: Math.acosh, asin: Math.asin, asinh: Math.asinh,
      atan: Math.atan, atanh: Math.atanh, atan2: Math.atan2, cbrt: Math.cbrt, ceil: Math.ceil,
      clz32: Math.clz32, cos: Math.cos, cosh: Math.cosh, exp: Math.exp, expm1: Math.expm1,
      floor: Math.floor, fround: Math.fround, hypot: Math.hypot, imul: Math.imul, log: Math.log,
      log1p: Math.log1p, log10: Math.log10, log2: Math.log2, max: Math.max, min: Math.min,
      pow: Math.pow, random: Math.random, round: Math.round, sign: Math.sign, sin: Math.sin,
      sinh: Math.sinh, sqrt: Math.sqrt, tan: Math.tan, tanh: Math.tanh, trunc: Math.trunc,
      PI: Math.PI, E: Math.E, LN2: Math.LN2, LN10: Math.LN10, LOG2E: Math.LOG2E, LOG10E: Math.LOG10E,
      SQRT2: Math.SQRT2,
      dist: function(a,b,c,d){
        if (arguments.length >= 4) { var dx = c - a, dy = d - b; return Math.sqrt(dx * dx + dy * dy); }
        if (Array.isArray(a) && Array.isArray(b)) { var s = 0, n = Math.min(a.length, b.length); for (var i = 0; i < n; i++) { var q = a[i] - b[i]; s += q * q; } return Math.sqrt(s); }
        if (a && b && typeof a === 'object' && typeof b === 'object') { var vx = (b.x || 0) - (a.x || 0), vy = (b.y || 0) - (a.y || 0), vz = (b.z || 0) - (a.z || 0); return Math.sqrt(vx * vx + vy * vy + vz * vz); }
        return 0;
      },
      clamp: function(v,mn,mx){ return Math.max(mn, Math.min(mx, v)); },
      lerp: function(a,b,t){ return a + (b - a) * t; },
      map: function(v,a,b,c,d){ return c + (d - c) * ((v - a) / (b - a)); },
      norm: function(v,mn,mx){ return (v - mn) / (mx - mn); },
      degToRad: function(d){ return d * Math.PI / 180; },
      radToDeg: function(r){ return r * 180 / Math.PI; },
      vec2: function(x,y){ return { x: x || 0, y: y || 0 }; },
      vec3: function(x,y,z){ return { x: x || 0, y: y || 0, z: z || 0 }; }
    };
    m.default = m;
    m.math = m;
    window.math = m;
    window.MathLib = m;
    return m;
  }

  function normalizeModuleNameV14(specifier){
    var s = String(specifier || '').trim().replace(/[?#].*$/, '');
    var part = s.split('/').pop() || s;
    part = part.replace(/\\.(mjs|cjs|js|jsx|ts|tsx)$/i, '');
    return part;
  }

  function canonicalNameV14(name){
    var raw = String(name || '').trim();
    var lower = raw.toLowerCase();
    var aliases = {
      canvex:'Canvex', canvas:'Canvas', shapes:'Shapes', interaction:'Interaction', camera:'Camera',
      math:'math', charts:'Charts', events:'Events', pointer:'pointer', keyboard:'Keyboard',
      helpers:'Helpers', triggers:'Triggers', logic:'Logic', datetime:'DateTime', date:'DateTime', time:'DateTime',
      multiplayer:'Multiplayer', mutliplayer:'Multiplayer', text:'Text', gui:'GUI', elements:'Elements',
      devices:'Devices', list:'List', physics:'Physics', transform:'Transform', transforms:'Transform',
      color:'Color', sound:'Sound', flow:'Flow', sprites:'Sprites', image:'Image', images:'Image',
      pixelart:'PixelArt', pixel_art:'PixelArt', models:'Models', lights:'Lights', gameeditor:'GameEditor',
      game_editor:'GameEditor'
    };
    return aliases[lower] || raw;
  }

  function addAliasV14(registry, key, value){
    if (!key || !value) return;
    registry[key] = value;
    registry[String(key).toLowerCase()] = value;
    registry[canonicalNameV14(key)] = value;
    registry[String(canonicalNameV14(key)).toLowerCase()] = value;
  }

  function knownNamesV14(){
    var names = ['Canvex','Canvas','Shapes','Interaction','Camera','math','Charts','Events','pointer','Keyboard','Helpers','Triggers','Logic','DateTime','Multiplayer','Text','GUI','Elements','Devices','List','Physics','Transform','Color','Sound','Flow','Sprites','Image','PixelArt','Models','Lights','GameEditor'];
    (LIBS || []).forEach(function(lib){ if (lib && lib.name) names.push(lib.name); });
    return names;
  }

  function forgeImportRegistryV14(){
    var registry = {};
    var mathObject = mathModuleV14();
    knownNamesV14().forEach(function(name){
      var canonical = canonicalNameV14(name);
      var value;
      if (canonical === 'math') value = mathObject;
      else value = window[canonical] || window[String(canonical).toLowerCase()] || moduleProxyV14(canonical);
      if (value && typeof value === 'object' && value.default == null) { try { value.default = value; } catch (_) {} }
      addAliasV14(registry, name, value);
      addAliasV14(registry, canonical, value);
    });
    registry.default = mathObject;
    return registry;
  }

  function candidateSpecifiersV14(specifier){
    var s = String(specifier || '').trim();
    var out = [];
    function add(v){ if (v && out.indexOf(v) < 0) out.push(v); }

    // GameEditor.js is under /Canvex/editors/, while libraries are under /Canvex/libs/.
    // Never add ./libs/* or bare ./*.js fallbacks here because those resolve under /editors/
    // and create noisy 404s.
    if (s.indexOf('./libs/') === 0) {
      add('../libs/' + s.slice('./libs/'.length));
    } else if (s.indexOf('../libs/') === 0) {
      add(s);
    } else if (s.indexOf('/libs/') < 0 && /\.js$/i.test(s)) {
      add('../libs/' + s.split('/').pop());
    } else {
      add(s);
    }
    return out;
  }

  async function importForgeModuleV14(specifier){
    var key = String(specifier || '').trim();
    if (MODULE_CACHE_V14[key]) return MODULE_CACHE_V14[key];
    var candidates = candidateSpecifiersV14(key);
    for (var i = 0; i < candidates.length; i++) {
      try {
        var mod = await import(candidates[i]);
        MODULE_CACHE_V14[key] = mod;
        MODULE_CACHE_V14[candidates[i]] = mod;
        return mod;
      } catch (_) {}
    }
    return null;
  }

  function fallbackResolveForgeImportV14(registry, specifier, kind, importedName){
    registry = registry || forgeImportRegistryV14();
    var moduleName = canonicalNameV14(normalizeModuleNameV14(specifier));
    var moduleObject = registry[moduleName] || registry[String(moduleName).toLowerCase()] || moduleProxyV14(moduleName || importedName || 'module');
    if (kind === 'namespace' || kind === 'side-effect') return moduleObject;
    if (kind === 'default') return moduleObject.default !== undefined ? moduleObject.default : moduleObject;
    if (kind === 'named') {
      var importedCanonical = canonicalNameV14(importedName);
      if (String(importedCanonical).toLowerCase() === String(moduleName).toLowerCase()) return moduleObject;
      if (importedCanonical === 'math') return registry.math || mathModuleV14();
      if (moduleObject && importedName in Object(moduleObject)) return moduleObject[importedName];
      if (moduleObject && importedCanonical in Object(moduleObject)) return moduleObject[importedCanonical];
      if (registry[importedCanonical]) return registry[importedCanonical];
      if (registry[String(importedCanonical).toLowerCase()]) return registry[String(importedCanonical).toLowerCase()];
      return symbolProxyV14(importedName);
    }
    return moduleObject;
  }

  async function resolveForgeImportV14(registry, specifier, kind, importedName){
    var mod = await importForgeModuleV14(specifier);
    if (mod) {
      if (kind === 'namespace' || kind === 'side-effect') return mod;
      if (kind === 'default') return mod.default !== undefined ? mod.default : mod;
      if (kind === 'named') {
        var importedCanonical = canonicalNameV14(importedName);
        if (Object.prototype.hasOwnProperty.call(mod, importedName)) return mod[importedName];
        if (Object.prototype.hasOwnProperty.call(mod, importedCanonical)) return mod[importedCanonical];
        if (mod.default && Object.prototype.hasOwnProperty.call(Object(mod.default), importedName)) return mod.default[importedName];
        if (mod.default && Object.prototype.hasOwnProperty.call(Object(mod.default), importedCanonical)) return mod.default[importedCanonical];
      }
    }
    return fallbackResolveForgeImportV14(registry, specifier, kind, importedName);
  }

  async function importForgeModuleNamespaceV14(registry, specifier){
    var mod = await importForgeModuleV14(specifier);
    return mod || fallbackResolveForgeImportV14(registry, specifier, 'namespace', '*');
  }

  function requireForgeLibV14(specifier){
    var key = String(specifier || '').trim();
    if (MODULE_CACHE_V14[key]) return MODULE_CACHE_V14[key];
    var registry = forgeImportRegistryV14();
    return fallbackResolveForgeImportV14(registry, specifier, 'namespace', '*');
  }

  function splitTopLevelCommaV14(value){
    var out = [], part = '', depth = 0;
    String(value || '').split('').forEach(function(ch){
      if (ch === '{' || ch === '(' || ch === '[') depth++;
      if (ch === '}' || ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
      if (ch === ',' && depth === 0) { out.push(part.trim()); part = ''; }
      else part += ch;
    });
    if (part.trim()) out.push(part.trim());
    return out;
  }

  function parseImportSpecV14(spec){
    spec = String(spec || '').trim();
    var bindings = [];
    if (!spec) return bindings;
    function addNamedList(body){
      body.split(',').forEach(function(piece){
        piece = piece.trim();
        if (!piece) return;
        var m = piece.match(/^([A-Za-z_$][A-Za-z0-9_$]*)(?:\\s+as\\s+([A-Za-z_$][A-Za-z0-9_$]*))?$/);
        if (m) bindings.push({ kind: 'named', imported: m[1], local: m[2] || m[1] });
      });
    }
    splitTopLevelCommaV14(spec).forEach(function(part, index){
      if (!part) return;
      if (part.charAt(0) === '{') { addNamedList(part.replace(/^\\{/, '').replace(/\\}$/, '')); return; }
      var ns = part.match(/^\\*\\s+as\\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);
      if (ns) { bindings.push({ kind: 'namespace', imported: '*', local: ns[1] }); return; }
      var def = part.match(/^([A-Za-z_$][A-Za-z0-9_$]*)$/);
      if (def && index === 0) bindings.push({ kind: 'default', imported: 'default', local: def[1] });
    });
    return bindings;
  }

  function transformForgeImportsV14(code){
    var declarations = [];
    var imports = [];
    var text = String(code || '');

    text = text.replace(/(^|[\\n;])\\s*import\\s+([\\s\\S]*?)\\s+from\\s*['\\"]([^'\\"]+)['\\"][ \\t]*;?/g, function(full, prefix, spec, source){
      parseImportSpecV14(spec).forEach(function(binding){
        if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(binding.local)) return;
        declarations.push('const ' + binding.local + ' = await resolveForgeImportV14(__forgeImports, ' + JSON.stringify(source) + ', ' + JSON.stringify(binding.kind) + ', ' + JSON.stringify(binding.imported) + ');');
        imports.push(binding.local);
      });
      return prefix || '';
    });

    text = text.replace(/(^|[\\n;])\\s*import\\s*['\\"]([^'\\"]+)['\\"][ \\t]*;?/g, function(full, prefix, source){
      declarations.push('await resolveForgeImportV14(__forgeImports, ' + JSON.stringify(source) + ', "side-effect", "default");');
      return prefix || '';
    });

    text = text.replace(/\\bimport\\s*\\(\\s*(['\\"])([^'\\"]+)\\1\\s*\\)/g, function(full, quote, source){
      return 'importForgeModuleNamespaceV14(__forgeImports, ' + JSON.stringify(source) + ')';
    });

    return { code: declarations.join(String.fromCharCode(10)) + String.fromCharCode(10) + text, imports: imports };
  }

  function formatConsoleValueV14(value){
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'function') {
      var src = '';
      try { src = Function.prototype.toString.call(value); } catch (_) {}
      if (/^\\s*class\\s/.test(src)) return src;
      return '[Function ' + (value.name || 'anonymous') + ']';
    }
    if (typeof value === 'object') {
      try {
        var keys = Object.keys(value).filter(function(k){ return k !== 'default'; }).slice(0, 18);
        return '{ ' + keys.map(function(k){ return k + ': ' + (typeof value[k] === 'function' ? '[Function]' : JSON.stringify(value[k])); }).join(', ') + (Object.keys(value).length > 18 ? ', ...' : '') + ' }';
      } catch (_) { return String(value); }
    }
    return String(value);
  }

  function makeSnippetConsoleV14(){
    return {
      log: function(){ logConsole('info', Array.from(arguments).map(formatConsoleValueV14).join(' ')); },
      info: function(){ logConsole('info', Array.from(arguments).map(formatConsoleValueV14).join(' ')); },
      warn: function(){ logConsole('warn', Array.from(arguments).map(formatConsoleValueV14).join(' ')); },
      error: function(){ logConsole('error', Array.from(arguments).map(formatConsoleValueV14).join(' ')); }
    };
  }

  validateCodeSyntaxV4 = function(code){
    try {
      var transformed = transformForgeImportsV14(code).code;
      var AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      new AsyncFunction('__forgeImports', 'resolveForgeImportV14', 'importForgeModuleNamespaceV14', 'console', 'require', transformed);
      return null;
    } catch (err) { return err.message; }
  };

  runSnippet = function(){
    var ta = safeEl('code-area'); if (!ta) return;
    var statusEl = safeEl('ce-status-msg');
    try {
      var transformed = transformForgeImportsV14(ta.value);
      var imports = forgeImportRegistryV14();
      var AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      var fn = new AsyncFunction('__forgeImports', 'resolveForgeImportV14', 'importForgeModuleNamespaceV14', 'console', 'require', transformed.code);
      Promise.resolve(fn(imports, resolveForgeImportV14, importForgeModuleNamespaceV14, makeSnippetConsoleV14(), requireForgeLibV14)).then(function(){
        if (statusEl) { statusEl.textContent = '● OK'; statusEl.className = 'con-success'; }
        setStatusMsg('Snippet ran');
        logConsole('success', '▶ Snippet executed' + (transformed.imports.length ? ' with imports: ' + transformed.imports.join(', ') : ''));
      }).catch(function(err){
        logConsole('error', '✕ Snippet error: ' + (err && err.message ? err.message : err));
        if (statusEl) { statusEl.textContent = '● Error'; statusEl.className = 'ce-error'; }
        setStatusMsg('Snippet error');
      });
    } catch (err) {
      logConsole('error', '✕ Snippet error: ' + (err && err.message ? err.message : err));
      if (statusEl) { statusEl.textContent = '● Error'; statusEl.className = 'ce-error'; }
      setStatusMsg('Snippet error');
    }
  };

  window.runSnippet = runSnippet;
  window.forgeImportRegistryV14 = forgeImportRegistryV14;
  window.resolveForgeImportV14 = resolveForgeImportV14;
  window.importForgeModuleNamespaceV14 = importForgeModuleNamespaceV14;
  window.requireForgeLibV14 = requireForgeLibV14;
  window.transformForgeImportsV14 = transformForgeImportsV14;
  window.makeSnippetConsoleV14 = makeSnippetConsoleV14;
})();


// ═══════════════════════════════════════════════════════════════
//  COPILOT PATCH V15/V16: Unity-style 3D view + corrected default camera
// ═══════════════════════════════════════════════════════════════
(function forgeUnity3DDefaultCameraPatch(){
  if (window.__forgeUnity3DDefaultCameraPatch) return;
  window.__forgeUnity3DDefaultCameraPatch = true;

  function reset3DViewToForwardFlat(force){
    if (!VP3D) return;
    if (!force && VP3D._userAdjustedDefaultView) return;
    VP3D.azimuth = 0;
    VP3D.elevation = 0.18;
    VP3D.distance = 720;
    VP3D.panX = 0;
    VP3D.panY = 0;
    VP3D.zoom = 1;
    var zoomEl = document.getElementById('vp-zoom');
    if (zoomEl) zoomEl.textContent = 100;
  }

  function ensureUnity3DStyle(){
    if (document.getElementById('forge-unity-3d-default-style')) return;
    var style = document.createElement('style');
    style.id = 'forge-unity-3d-default-style';
    style.textContent =
      'body.forge-unity-3d-active #viewport{background:#1f2226;}' +
      'body.forge-unity-3d-active #vp-wrap{position:absolute;inset:0;top:0;left:0;transform:none;width:100%;height:100%;background:#1f2226;box-shadow:none;border:0;}' +
      'body.forge-unity-3d-active #vp-canvas{width:100%;height:100%;image-rendering:auto;cursor:grab;}' +
      'body.forge-unity-3d-active #vp-grid{display:none!important;}' +
      '.forge-scene-toolbar-v16{position:absolute;top:8px;left:8px;z-index:15;display:flex;align-items:center;gap:4px;height:28px;padding:3px 5px;background:rgba(42,42,42,.92);border:1px solid rgba(0,0,0,.65);box-shadow:0 1px 0 rgba(255,255,255,.08) inset,0 2px 10px rgba(0,0,0,.35);border-radius:3px;font:600 11px Inter,Arial,sans-serif;color:#d6d6d6;pointer-events:none;}' +
      '.forge-scene-toolbar-v16 span{height:20px;display:flex;align-items:center;padding:0 8px;border-radius:2px;background:#3a3a3a;border:1px solid #1b1b1b;color:#e6e6e6;}' +
      '.forge-scene-toolbar-v16 span.dim{color:#aaa;background:#303030;}' +
      '.forge-scene-help-v16{position:absolute;left:10px;bottom:10px;z-index:15;padding:5px 8px;border-radius:3px;background:rgba(32,32,32,.86);border:1px solid rgba(0,0,0,.6);font:10px Share Tech Mono,monospace;color:#bdbdbd;pointer-events:none;}' +
      'body:not(.forge-unity-3d-active) .forge-scene-toolbar-v16,body:not(.forge-unity-3d-active) .forge-scene-help-v16{display:none!important;}';
    document.head.appendChild(style);
  }

  function ensureUnity3DOverlay(){
    ensureUnity3DStyle();
    var vp = document.getElementById('viewport');
    if (!vp) return;
    if (!document.getElementById('forge-scene-toolbar-v16')) {
      var tb = document.createElement('div');
      tb.id = 'forge-scene-toolbar-v16';
      tb.className = 'forge-scene-toolbar-v16';
      tb.innerHTML = '<span>Scene</span><span class="dim">Shaded</span><span class="dim">Gizmos</span><span class="dim">Center</span><span class="dim">Global</span>';
      vp.appendChild(tb);
    }
    if (!document.getElementById('forge-scene-help-v16')) {
      var help = document.createElement('div');
      help.id = 'forge-scene-help-v16';
      help.className = 'forge-scene-help-v16';
      help.textContent = 'LMB: select/orbit · RMB/MMB: pan · Scroll: zoom · Alt+LMB: orbit · WASD/Arrows: fly · F: focus · Q/E: up/down';
      vp.appendChild(help);
    }
  }

  function resize3DCanvas(){
    var c = document.getElementById('vp-canvas');
    var wrap = document.getElementById('vp-wrap');
    if (!c || !wrap || STATE.mode !== '3d') return;
    var w = Math.max(320, Math.floor(wrap.clientWidth || c.clientWidth || 800));
    var h = Math.max(240, Math.floor(wrap.clientHeight || c.clientHeight || 450));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }

  function update3DChrome(){
    ensureUnity3DOverlay();
    document.body.classList.toggle('forge-unity-3d-active', STATE.mode === '3d' && STATE.editorTab === 'viewport');
    var grid = document.getElementById('vp-grid');
    if (grid) grid.style.display = (STATE.gridVisible && STATE.mode === '2d') ? '' : 'none';
    resize3DCanvas();
  }

  function rgbFromHex(hex){
    hex = String(hex || '#777777');
    if (!/^#[0-9a-f]{6}$/i.test(hex)) hex = '#777777';
    return {r:parseInt(hex.slice(1,3),16), g:parseInt(hex.slice(3,5),16), b:parseInt(hex.slice(5,7),16)};
  }
  function rgbaShade(rgb,k,a){ return 'rgba(' + Math.round(rgb.r*k) + ',' + Math.round(rgb.g*k) + ',' + Math.round(rgb.b*k) + ',' + (a == null ? .95 : a) + ')'; }

  draw3DScene = function(ctx,W,H){
    resize3DCanvas();
    W = ctx.canvas.width; H = ctx.canvas.height;
    VP3D.drawCalls = 0;

    var bg = ctx.createLinearGradient(0,0,0,H);
    bg.addColorStop(0,'#292c31'); bg.addColorStop(.55,'#202328'); bg.addColorStop(1,'#191b1f');
    ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);
    var vignette = ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.20,W/2,H/2,Math.max(W,H)*.72);
    vignette.addColorStop(0,'rgba(255,255,255,0)'); vignette.addColorStop(1,'rgba(0,0,0,.32)');
    ctx.fillStyle = vignette; ctx.fillRect(0,0,W,H);

    var az = VP3D.azimuth, el = VP3D.elevation, dist = VP3D.distance / Math.max(.001, VP3D.zoom);
    var camX = dist * Math.cos(el) * Math.sin(az);
    var camY = dist * Math.sin(el);
    var camZ = dist * Math.cos(el) * Math.cos(az);
    var cx = W/2 + VP3D.panX, cy = H/2 + VP3D.panY;
    var fov = 1.05;

    function project(wx,wy,wz){
      var dx = wx-camX, dy = wy-camY, dz = wz-camZ;
      var fwdX = -camX/dist, fwdY = -camY/dist, fwdZ = -camZ/dist;
      var rightX = Math.cos(az), rightY = 0, rightZ = -Math.sin(az);
      var upX = Math.sin(el)*Math.sin(az), upY = Math.cos(el), upZ = Math.sin(el)*Math.cos(az);
      var vx = dx*rightX + dy*rightY + dz*rightZ;
      var vy = dx*upX + dy*upY + dz*upZ;
      var vz = dx*fwdX + dy*fwdY + dz*fwdZ;
      if (vz <= 1) return null;
      var s = fov * Math.min(W,H) / vz;
      return {sx:cx + vx*s, sy:cy - vy*s, z:vz, scale:s};
    }
    function line3(a,b,color,width){ if(!a || !b) return; ctx.beginPath(); ctx.moveTo(a.sx,a.sy); ctx.lineTo(b.sx,b.sy); ctx.strokeStyle=color; ctx.lineWidth=width || 1; ctx.stroke(); VP3D.drawCalls++; }
    function label3(p,text,color){ if(!p) return; ctx.font='bold 11px Inter,Arial,sans-serif'; ctx.textAlign='center'; ctx.fillStyle='rgba(0,0,0,.62)'; ctx.fillRect(p.sx-10,p.sy-16,20,16); ctx.fillStyle=color; ctx.fillText(text,p.sx,p.sy-4); }

    // Anchor the world to the scene's Main Camera object instead of the resized viewport canvas.
    // This removes the huge startup offset and keeps the default object centered.
    var mainCam = (STATE.objects || []).find(function(o){ return o && o.type === 'camera'; });
    var originX = Number.isFinite(STATE.sceneOriginX) ? STATE.sceneOriginX : (mainCam && Number.isFinite(mainCam.x) ? mainCam.x : 400);
    var originZ = Number.isFinite(STATE.sceneOriginZ) ? STATE.sceneOriginZ : (mainCam && Number.isFinite(mainCam.y) ? mainCam.y : 225);
    function worldX(o){ return typeof o.x3d === 'number' ? o.x3d : ((o.x || 0) - originX); }
    function worldZ(o){ return typeof o.z3d === 'number' ? o.z3d : ((o.y || 0) - originZ); }
    function worldY(o){ return typeof o.y3d === 'number' ? o.y3d : 0; }

    if (STATE.gridVisible) {
      var step = Math.max(10, Number(STATE.projectSettings && STATE.projectSettings.gridStep) || 50);
      var size = 1600;
      for (var i=-size; i<=size; i+=step) {
        var major = Math.abs(i) % (step*5) === 0;
        var c = major ? 'rgba(180,180,180,.25)' : 'rgba(145,145,145,.13)';
        line3(project(i,0,-size), project(i,0,size), i === 0 ? 'rgba(219,68,55,.95)' : c, i === 0 ? 2.2 : (major ? 1.1 : .75));
        line3(project(-size,0,i), project(size,0,i), i === 0 ? 'rgba(66,133,244,.95)' : c, i === 0 ? 2.2 : (major ? 1.1 : .75));
      }
      line3(project(0,0,0), project(0,160,0), 'rgba(87,187,87,.95)', 2.2);
      label3(project(190,0,0),'X','#ef4444'); label3(project(0,180,0),'Y','#22c55e'); label3(project(0,0,190),'Z','#3b82f6');
      var o = project(0,0,0); if (o) { ctx.fillStyle='#d8d8d8'; ctx.beginPath(); ctx.arc(o.sx,o.sy,3.5,0,Math.PI*2); ctx.fill(); }
    }

    function drawCamera(obj){
      var x = worldX(obj), z = worldZ(obj), y = worldY(obj) - 42;
      var w = 56, h = 38, d = 44, len = 84;
      var p = [[x-w/2,y-h/2,z-d/2],[x+w/2,y-h/2,z-d/2],[x+w/2,y+h/2,z-d/2],[x-w/2,y+h/2,z-d/2],[x-w,y-h,z+len],[x+w,y-h,z+len],[x+w,y+h,z+len],[x-w,y+h,z+len]].map(function(v){return project(v[0],v[1],v[2]);});
      if (p.some(function(v){ return !v; })) return;
      [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]].forEach(function(e){ line3(p[e[0]],p[e[1]],'#f5c542',1.6); });
      var lp = project(x,y-h-18,z+len);
      if (lp) { ctx.fillStyle='rgba(32,32,32,.78)'; ctx.fillRect(lp.sx-44,lp.sy-16,88,18); ctx.fillStyle='#f5c542'; ctx.font='bold 10px Inter,Arial'; ctx.textAlign='center'; ctx.fillText(obj.name || 'Camera',lp.sx,lp.sy-4); }
    }

    function drawBox(obj){
      var bw = Math.max(12,obj.w || 48), bh = Math.max(12,obj.h || 48), bd = Math.max(12,obj.d || obj.w || 48);
      var x = worldX(obj), z = worldZ(obj), y0 = worldY(obj);
      var x0=x-bw/2, x1=x+bw/2, y1=y0-bh, z0=z-bd/2, z1=z+bd/2;
      var p = [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]].map(function(v){return project(v[0],v[1],v[2]);});
      if (p.some(function(v){ return !v; })) return;
      var rgb = rgbFromHex(obj.color || '#777777');
      [{i:[4,5,1,0],k:.72},{i:[5,6,2,1],k:.55},{i:[6,7,3,2],k:.45},{i:[7,4,0,3],k:.62},{i:[0,1,2,3],k:.36},{i:[4,5,6,7],k:1.05}].forEach(function(f){
        ctx.beginPath(); ctx.moveTo(p[f.i[0]].sx,p[f.i[0]].sy); f.i.slice(1).forEach(function(ii){ctx.lineTo(p[ii].sx,p[ii].sy);}); ctx.closePath();
        ctx.fillStyle = rgbaShade(rgb,f.k,.94); ctx.fill();
        ctx.strokeStyle = obj.id === STATE.selectedId ? 'rgba(0,160,255,.95)' : 'rgba(0,0,0,.42)'; ctx.lineWidth = obj.id === STATE.selectedId ? 1.7 : .8; ctx.stroke();
      });
      if (obj.id === STATE.selectedId) [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]].forEach(function(e){ line3(p[e[0]],p[e[1]],'rgba(0,160,255,.95)',1.7); });
      var lp = project(x,y1-12,z);
      if (lp) { var name = obj.name || obj.type; ctx.font='11px Inter,Arial'; ctx.textAlign='center'; var tw=ctx.measureText(name).width; ctx.fillStyle='rgba(0,0,0,.55)'; ctx.fillRect(lp.sx-tw/2-5,lp.sy-15,tw+10,17); ctx.fillStyle='#d9d9d9'; ctx.fillText(name,lp.sx,lp.sy-3); }
    }

    var sorted = [].concat(STATE.objects || []).sort(function(a,b){
      var ax=worldX(a)-camX, ay=worldY(a)-camY, azz=worldZ(a)-camZ;
      var bx=worldX(b)-camX, by=worldY(b)-camY, bzz=worldZ(b)-camZ;
      return (bx*bx+by*by+bzz*bzz) - (ax*ax+ay*ay+azz*azz);
    });
    sorted.forEach(function(obj){ if (!obj.visible) return; obj.type === 'camera' ? drawCamera(obj) : drawBox(obj); });

    var gx = W - 72, gy = 78, gr = 36;
    ctx.save(); ctx.translate(gx,gy); ctx.fillStyle='rgba(42,42,42,.86)'; ctx.strokeStyle='rgba(0,0,0,.6)'; ctx.beginPath(); ctx.roundRect(-46,-48,92,92,6); ctx.fill(); ctx.stroke();
    function gp(x,y,z){ return {x:x*Math.cos(az)-z*Math.sin(az), y:y*Math.cos(el)-(x*Math.sin(az)+z*Math.cos(az))*Math.sin(el)}; }
    [{v:[gr,0,0],c:'#ef4444',l:'X'},{v:[0,gr,0],c:'#22c55e',l:'Y'},{v:[0,0,gr],c:'#3b82f6',l:'Z'}].forEach(function(a){ var q=gp(a.v[0],a.v[1],a.v[2]); ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(q.x,-q.y); ctx.strokeStyle=a.c; ctx.lineWidth=2.5; ctx.stroke(); ctx.fillStyle=a.c; ctx.beginPath(); ctx.arc(q.x,-q.y,4,0,Math.PI*2); ctx.fill(); ctx.font='bold 11px Inter,Arial'; ctx.textAlign='center'; ctx.fillText(a.l,q.x*1.22,-q.y*1.22+4); });
    ctx.restore();

    if (STATE.projectSettings && STATE.projectSettings.show3DStats !== false) {
      var t = performance.now(); if (VP3D._lastT) VP3D.fps = Math.round(1000 / Math.max(1, t - VP3D._lastT)); VP3D._lastT = t;
      ctx.fillStyle='rgba(42,42,42,.88)'; ctx.strokeStyle='rgba(0,0,0,.65)'; ctx.beginPath(); ctx.roundRect(W-164,8,154,58,4); ctx.fill(); ctx.stroke();
      ctx.font='10px Share Tech Mono,monospace'; ctx.textAlign='left'; ctx.fillStyle='#d8d8d8'; ctx.fillText('Scene  Shaded',W-154,24); ctx.fillStyle='#aaa'; ctx.fillText('AZ ' + (VP3D.azimuth*57.2958).toFixed(1) + '  EL ' + (VP3D.elevation*57.2958).toFixed(1),W-154,38); ctx.fillText('ZOOM ' + VP3D.zoom.toFixed(2) + 'x   DC ' + VP3D.drawCalls,W-154,51); ctx.fillText('OBJS ' + STATE.objects.length + '   FPS ' + (VP3D.fps || 0),W-154,64);
    }
  };
  window.draw3DScene = draw3DScene;

  var __oldSetMode = setMode;
  setMode = function(m){
    var entering3D = m === '3d' && STATE.mode !== '3d';
    if (entering3D) reset3DViewToForwardFlat(false);
    __oldSetMode(m);
    update3DChrome();
    if (m === '3d') renderViewport();
  };
  window.setMode = setMode;

  var __oldSetEditorTab = setEditorTab;
  setEditorTab = function(tab){ __oldSetEditorTab(tab); update3DChrome(); if (STATE.mode === '3d' && tab === 'viewport') renderViewport(); };
  window.setEditorTab = setEditorTab;

  var __oldRenderViewport = renderViewport;
  renderViewport = function(){ update3DChrome(); __oldRenderViewport(); };
  window.renderViewport = renderViewport;

  var __oldResetCamera = resetCamera;
  resetCamera = function(){
    if (STATE.mode === '3d') { reset3DViewToForwardFlat(true); renderViewport(); logConsole('info','3D camera reset to forward flat view'); return; }
    __oldResetCamera();
  };
  window.resetCamera = resetCamera;

  window.addEventListener('resize', function(){ if (STATE.mode === '3d') renderViewport(); });
  reset3DViewToForwardFlat(false);
  update3DChrome();
})();



// ═══════════════════════════════════════════════════════
//  COPILOT FIX V18: event-driven Run Blocks + real Play Mode JS scripts
// ═══════════════════════════════════════════════════════
(function forgeEventDrivenBlocksAndRealScriptsV18(){
  if (window.__FORGE_EVENT_SCRIPT_FIX_V18__) return;
  window.__FORGE_EVENT_SCRIPT_FIX_V18__ = true;

  var EVENT_BLOCK_TYPES_V18 = new Set(['On Key Press','On Key Release','On Click','On Timer','On Event','On Trigger Enter','On Trigger Exit','On Collision']);
  var liveCleanupV18 = [];
  var liveTimersV18 = [];
  var liveRunTokenV18 = 0;

  function paramsV18(block){
    var out = {};
    (block && block.params || []).forEach(function(p){ out[p.k] = p.v; });
    return out;
  }
  function normKeyV18(k){
    var s = String(k || '').toLowerCase();
    if (s === 'space') return ' ';
    if (s === 'arrowup' || s === 'up') return 'ArrowUp';
    if (s === 'arrowdown' || s === 'down') return 'ArrowDown';
    if (s === 'arrowleft' || s === 'left') return 'ArrowLeft';
    if (s === 'arrowright' || s === 'right') return 'ArrowRight';
    if (s === 'enter') return 'Enter';
    if (s === 'escape' || s === 'esc') return 'Escape';
    return String(k || '');
  }
  function numV18(v, def){
    if (v === undefined || v === null || v === '') return def || 0;
    var n = Number(v);
    return Number.isFinite(n) ? n : (def || 0);
  }
  function saveCurrentScriptV18(){
    try {
      var ta = safeEl('code-area');
      if (ta && STATE && STATE.openScriptName && typeof SCRIPT_STORE !== 'undefined') {
        SCRIPT_STORE[STATE.openScriptName] = ta.value;
        var statusEl = safeEl('ce-status-msg');
        if (statusEl) { statusEl.textContent = '● ' + STATE.openScriptName + ' saved'; statusEl.className = 'con-success'; }
      }
    } catch(_) {}
  }
  function bindAutoSaveV18(){
    var ta = safeEl('code-area');
    if (!ta || ta.__forgeScriptAutosaveV18) return;
    ta.__forgeScriptAutosaveV18 = true;
    ta.addEventListener('input', function(){
      if (STATE && STATE.openScriptName && typeof SCRIPT_STORE !== 'undefined') SCRIPT_STORE[STATE.openScriptName] = ta.value;
    });
    ta.addEventListener('blur', saveCurrentScriptV18);
  }

  function makeScriptConsoleV18(scriptName){
    function write(type, args){
      try { logConsole(type, '[' + scriptName + '] ' + Array.prototype.slice.call(args).map(function(x){
        if (typeof x === 'string') return x;
        try { return JSON.stringify(x); } catch(_) { return String(x); }
      }).join(' ')); } catch(_) {}
    }
    return {
      log:function(){ write('info', arguments); },
      info:function(){ write('info', arguments); },
      warn:function(){ write('warn', arguments); },
      error:function(){ write('error', arguments); }
    };
  }
  function stripImportsV18(code){
    return String(code || '').split('\\n').filter(function(line){ return !/^\s*import\b/.test(line); }).join('\\n');
  }
  function transformExportsV18(code, exposedNames){
    code = String(code || '');
    code = code.replace(/export\s+default\s+function\s+([A-Za-z_$][\w$]*)\s*\\(/g, function(_, name){ exposedNames[name] = true; return 'function ' + name + '('; });
    code = code.replace(/export\s+function\s+([A-Za-z_$][\w$]*)\s*\\(/g, function(_, name){ exposedNames[name] = true; return 'function ' + name + '('; });
    code = code.replace(/export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/g, function(_, kind, name){ exposedNames[name] = true; return kind + ' ' + name; });
    code = code.replace(/export\s*\{([^}]+)\}\s*;?/g, function(_, names){
      names.split(',').forEach(function(part){
        var pieces = part.trim().split(/\s+as\s+/i);
        var local = (pieces[0] || '').trim();
        var alias = (pieces[1] || local).trim();
        if (local) exposedNames[local] = alias || true;
      });
      return '';
    });
    return code;
  }
  function compileAllScriptsForPlayV18(keys, ctx){
    saveCurrentScriptV18();
    var restore = [];
    var registry = {};
    var store = (typeof SCRIPT_STORE !== 'undefined' && SCRIPT_STORE) ? SCRIPT_STORE : {};
    Object.keys(store).forEach(function(scriptName){
      var exposed = {};
      var code = stripImportsV18(store[scriptName]);
      code = transformExportsV18(code, exposed);
      var functionMatches = code.match(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\\(/g) || [];
      functionMatches.forEach(function(m){ var name = m.replace(/\bfunction\s+/, '').replace(/\s*\\($/, ''); exposed[name] = exposed[name] || true; });
      var assignLines = Object.keys(exposed).map(function(local){
        var globalName = exposed[local] === true ? local : exposed[local];
        return "try { if (typeof " + local + " !== 'undefined') { window[" + JSON.stringify(globalName) + "] = " + local + "; __exports[" + JSON.stringify(globalName) + "] = " + local + "; } } catch(_) {}";
      }).join('\\n');
      try {
        var previous = {};
        Object.keys(exposed).forEach(function(local){ var globalName = exposed[local] === true ? local : exposed[local]; previous[globalName] = window[globalName]; });
        var scriptConsole = makeScriptConsoleV18(scriptName);
        var fn = new Function('window','STATE','BE','keys','ctx','logConsole','console','__exports', code + '\\n' + assignLines + '\\nreturn __exports;');
        var exportsObj = {};
        registry[scriptName] = fn(window, STATE, BE, keys || {}, ctx || null, logConsole, scriptConsole, exportsObj) || exportsObj;
        Object.keys(exposed).forEach(function(local){
          var globalName = exposed[local] === true ? local : exposed[local];
          restore.push(function(name, oldValue){ return function(){ if (oldValue === undefined) delete window[name]; else window[name] = oldValue; }; }(globalName, previous[globalName]));
        });
        logConsole('success', 'JS script loaded into Play Mode: ' + scriptName);
      } catch(err) {
        logConsole('error', 'JS script compile error in ' + scriptName + ': ' + err.message);
      }
    });
    STATE._scriptRuntimeRegistry = registry;
    STATE._scriptRuntimeCleanupV18 = function(){ restore.forEach(function(fn){ try{ fn(); }catch(_){} }); STATE._scriptRuntimeRegistry = {}; };
    return STATE._scriptRuntimeCleanupV18;
  }

  function buildGraphV18(){
    var blocks = (BE && Array.isArray(BE.blocks)) ? BE.blocks.slice() : [];
    var connections = (BE && Array.isArray(BE.connections)) ? BE.connections.slice() : [];
    var byId = {};
    var incoming = {};
    var downstream = {};
    blocks.forEach(function(b){ byId[String(b.id)] = b; });
    connections.forEach(function(c){
      var f = String(c.from), t = String(c.to);
      if (!downstream[f]) downstream[f] = [];
      downstream[f].push(c);
      incoming[t] = true;
    });
    return { blocks:blocks, connections:connections, byId:byId, incoming:incoming, downstream:downstream };
  }
  async function executeLiveBlockV18(block, graph, event, visited, token){
    if (!BLOCK_EXECUTION_STATE.isRunning || token !== liveRunTokenV18) return;
    var id = String(block.id);
    if (visited[id]) return;
    visited[id] = true;
    if (!EVENT_BLOCK_TYPES_V18.has(block.type)) {
      highlightBlockExecutionV4(block.id);
      logConsole('success', '▶ Executing: ' + block.type);
      if (block.type === 'Delay') await new Promise(function(resolve){ setTimeout(resolve, numV18(paramsV18(block).ms, 0)); });
      else if (block.type === 'Stop Flow') return;
      else if (block.type === 'Loop') {
        var p = paramsV18(block);
        var count = Math.max(0, Math.min(1000, numV18(p.n, 1)));
        var body = (graph.downstream[id] || []).filter(function(c){ return c.fromPort === 'body'; });
        for (var i=0; i<count; i++) for (var j=0; j<body.length; j++) {
          var bodyBlock = graph.byId[String(body[j].to)];
          if (bodyBlock) await executeLiveBlockV18(bodyBlock, graph, event, Object.assign({}, visited), token);
        }
      } else {
        await executeBlockV4(block);
      }
      await new Promise(function(resolve){ setTimeout(resolve, 120); });
    }
    var outs = (graph.downstream[id] || []).filter(function(c){ return block.type !== 'Loop' || c.fromPort !== 'body'; });
    for (var k=0; k<outs.length; k++) {
      var next = graph.byId[String(outs[k].to)];
      if (next) await executeLiveBlockV18(next, graph, event, Object.assign({}, visited), token);
    }
  }
  async function runConnectedFromLiveV18(block, graph, event, token){
    var outs = graph.downstream[String(block.id)] || [];
    for (var i=0; i<outs.length; i++) {
      var next = graph.byId[String(outs[i].to)];
      if (next) await executeLiveBlockV18(next, graph, event, {}, token);
    }
    clearBlockExecutionHighlightV4();
  }
  function bindLiveEventV18(block, graph, token){
    var p = paramsV18(block);
    if (block.type === 'On Key Press') {
      var wantedDown = normKeyV18(p.key || p.k || 'Space');
      var down = function(e){ if (e.key === wantedDown || normKeyV18(e.key) === wantedDown) runConnectedFromLiveV18(block, graph, e, token); };
      document.addEventListener('keydown', down);
      liveCleanupV18.push(function(){ document.removeEventListener('keydown', down); });
      logConsole('info', 'Waiting for key press: ' + (p.key || p.k || 'Space'));
    } else if (block.type === 'On Key Release') {
      var wantedUp = normKeyV18(p.key || p.k || 'Space');
      var up = function(e){ if (e.key === wantedUp || normKeyV18(e.key) === wantedUp) runConnectedFromLiveV18(block, graph, e, token); };
      document.addEventListener('keyup', up);
      liveCleanupV18.push(function(){ document.removeEventListener('keyup', up); });
      logConsole('info', 'Waiting for key release: ' + (p.key || p.k || 'Space'));
    } else if (block.type === 'On Click') {
      var clickTarget = safeEl('be-canvas') || document;
      var click = function(e){ runConnectedFromLiveV18(block, graph, e, token); };
      clickTarget.addEventListener('mousedown', click);
      liveCleanupV18.push(function(){ clickTarget.removeEventListener('mousedown', click); });
      logConsole('info', 'Waiting for click.');
    } else if (block.type === 'On Timer') {
      var ms = Math.max(1, numV18(p.ms, 1000));
      var repeat = !(p.repeat === false || p.repeat === 'false');
      var timer = setInterval(function(){ runConnectedFromLiveV18(block, graph, {type:'timer'}, token); if (!repeat) clearInterval(timer); }, ms);
      liveTimersV18.push(timer);
      logConsole('info', 'Timer armed: every ' + ms + 'ms' + (repeat ? '' : ' once'));
    } else if (block.type === 'On Event') {
      var eventName = String(p.event || 'custom');
      var handler = function(e){ runConnectedFromLiveV18(block, graph, e, token); };
      document.addEventListener(eventName, handler);
      liveCleanupV18.push(function(){ document.removeEventListener(eventName, handler); });
      logConsole('info', 'Waiting for custom event: ' + eventName);
    } else {
      logConsole('warn', block.type + ' needs Play Mode simulation to trigger; listener armed but editor preview cannot detect it yet.');
    }
  }

  window.stopBlocksLiveV4 = function(){
    liveRunTokenV18++;
    liveCleanupV18.forEach(function(fn){ try{ fn(); }catch(_){} });
    liveTimersV18.forEach(function(id){ clearInterval(id); });
    liveCleanupV18 = [];
    liveTimersV18 = [];
    if (typeof BLOCK_EXECUTION_STATE !== 'undefined') { BLOCK_EXECUTION_STATE.isRunning = false; BLOCK_EXECUTION_STATE.currentStep = 0; }
    try { clearBlockExecutionHighlightV4(); } catch(_) {}
    logConsole('warn', '■ Run Blocks stopped.');
  };

  runBlocksLiveV4 = async function(){
    if (!BE || !BE.blocks || !BE.blocks.length) { logConsole('error', '❌ No blocks to execute'); return; }
    if (BLOCK_EXECUTION_STATE.isRunning) window.stopBlocksLiveV4();
    var graph = buildGraphV18();
    var roots = graph.blocks.filter(function(b){ return !graph.incoming[String(b.id)]; });
    if (!roots.length) roots = graph.blocks.slice(0, 1);
    var eventRoots = roots.filter(function(b){ return EVENT_BLOCK_TYPES_V18.has(b.type); });
    var instantRoots = roots.filter(function(b){ return !EVENT_BLOCK_TYPES_V18.has(b.type); });
    BLOCK_EXECUTION_STATE.isRunning = true;
    BLOCK_EXECUTION_STATE.currentStep = 0;
    liveRunTokenV18++;
    var token = liveRunTokenV18;
    logConsole('info', '▶ Run Blocks armed: ' + graph.blocks.length + ' block(s), ' + graph.connections.length + ' connection(s).');
    eventRoots.forEach(function(b){ bindLiveEventV18(b, graph, token); });
    for (var i=0; i<instantRoots.length; i++) await executeLiveBlockV18(instantRoots[i], graph, {type:'manual-run'}, {}, token);
    if (!eventRoots.length) {
      BLOCK_EXECUTION_STATE.isRunning = false;
      clearBlockExecutionHighlightV4();
      logConsole('success', '✅ Block execution complete.');
    } else {
      logConsole('success', '✅ Event blocks are armed. Trigger the event to run connected blocks. Press Run again or Stop to reset listeners.');
    }
  };
  window.runBlocksLiveV4 = runBlocksLiveV4;

  var oldRunGameV18 = runGame;
  runGame = function(){
    bindAutoSaveV18();
    saveCurrentScriptV18();
    STATE._playKeysV18 = {};
    STATE._playKeyDownV18 = function(e){ STATE._playKeysV18[e.key] = true; };
    STATE._playKeyUpV18 = function(e){ STATE._playKeysV18[e.key] = false; };
    document.addEventListener('keydown', STATE._playKeyDownV18);
    document.addEventListener('keyup', STATE._playKeyUpV18);
    compileAllScriptsForPlayV18(STATE._playKeysV18, null);
    oldRunGameV18();
  };
  window.runGame = runGame;

  var oldStopGameV18 = stopGame;
  stopGame = function(){
    try { if (STATE._scriptRuntimeCleanupV18) STATE._scriptRuntimeCleanupV18(); } catch(_) {}
    try { if (STATE._playKeyDownV18) document.removeEventListener('keydown', STATE._playKeyDownV18); } catch(_) {}
    try { if (STATE._playKeyUpV18) document.removeEventListener('keyup', STATE._playKeyUpV18); } catch(_) {}
    oldStopGameV18();
  };
  window.stopGame = stopGame;

  bindAutoSaveV18();
})();


// COPILOT FIX V21: hard sync Pixel Editor -> selected viewport sprite.
// This intentionally ignores confusing asset/editing state when a sprite object is selected:
// the selected sprite object ALWAYS receives the current Pixel Art pixels immediately.
function __forgeExportCurrentPixelEditorPNG_V21(){
  // Preferred: PixelArt class public API. This is the editor shown in the Pixel Art tab.
  try{
    const editor = (typeof ensurePixelArtEditor === 'function') ? ensurePixelArtEditor() : null;
    if(editor){
      const methods=['exportPNG','toDataURL','getDataURL','getPNGDataURL','exportDataURL'];
      for(const name of methods){
        if(typeof editor[name] === 'function'){
          try{ const out = editor[name]('image/png'); if(typeof out === 'string' && out.startsWith('data:image')) return out; }catch(_){}
          try{ const out = editor[name](); if(typeof out === 'string' && out.startsWith('data:image')) return out; }catch(_){}
        }
      }
    }
  }catch(e){ console.warn('[FORGE] PixelArt export failed:', e); }

  // Fallback: legacy PE layers.
  try{
    if(PE && Array.isArray(PE.layers) && PE.w && PE.h){
      const out=document.createElement('canvas');
      out.width=PE.w; out.height=PE.h;
      const ctx=out.getContext('2d');
      let painted=false;
      PE.layers.forEach(layer=>{
        if(!layer || layer.visible===false || !layer.data) return;
        const imgData=new ImageData(new Uint8ClampedArray(layer.data), PE.w, PE.h);
        for(let i=3;i<imgData.data.length;i+=4){ if(imgData.data[i] > 0){ painted=true; break; } }
        ctx.putImageData(imgData,0,0);
      });
      if(painted) return out.toDataURL('image/png');
    }
  }catch(e){ console.warn('[FORGE] PE export failed:', e); }

  // Last fallback: any visible pixel editor canvas.
  try{
    const c = document.querySelector('#pixel-editor canvas.__pa_canvas, #pixel-editor canvas, #pixel-art-editor-root canvas') || PE?.canvas;
    if(c && typeof c.toDataURL === 'function') return c.toDataURL('image/png');
  }catch(_){}
  return null;
}

function __forgeApplyPNGToSpriteObject_V21(obj, dataURL, assetName){
  if(!obj || obj.type !== 'sprite' || !dataURL) return null;
  const w=(PE && PE.w) || obj.pixelW || obj.w || 32;
  const h=(PE && PE.h) || obj.pixelH || obj.h || 32;
  obj.pixelDataURL=dataURL;
  obj.pixelW=w;
  obj.pixelH=h;
  obj.w=w;
  obj.h=h;
  obj.spriteSrc=assetName || obj.spriteSrc || obj.name || STATE.editingSpriteName;
  obj.assetName=obj.spriteSrc;
  obj.color='transparent';

  // The viewport renderer now checks this live image first.
  // Mark the object as having this sprite src synchronously, then start single-flight load
  obj.__spriteImageSrc = dataURL;
  ensureSpriteImageLoaded(obj, dataURL, () => {});
  return obj;
}

function savePixelArtToSprite(){
  const dataURL=__forgeExportCurrentPixelEditorPNG_V21();
  if(!dataURL){
    logConsole('error','Could not read the Pixel Art canvas.');
    setStatusMsg('Pixel save failed');
    return;
  }

  const selectedObj=STATE.objects.find(o=>o.id===STATE.selectedId);
  const selectedSprite=(selectedObj && selectedObj.type==='sprite') ? selectedObj : null;
  const assetName = selectedSprite?.spriteSrc || STATE.editingSpriteName || selectedSprite?.name || STATE.lastEditedSpriteName || STATE.lastSpriteAssetName || ('sprite-' + Date.now() + '.png');
  const w=(PE && PE.w) || selectedSprite?.pixelW || 32;
  const h=(PE && PE.h) || selectedSprite?.pixelH || 32;

  if(!STATE.spritePixelData) STATE.spritePixelData={};
  STATE.spritePixelData[assetName]={dataURL,w,h,updatedAt:Date.now()};
  SPRITE_PIXELDATA[assetName]=dataURL;
  STATE.editingSpriteName=assetName;
  STATE.lastEditedSpriteName=assetName;
  STATE.lastSpriteAssetName=assetName;
  STATE.lastSpriteDataURL=dataURL;
  try{ addAssetToSectionV6?.('Sprites', {name:assetName, icon:'🖼'}); }catch(_){}

  const applied=[];
  if(selectedSprite){
    __forgeApplyPNGToSpriteObject_V21(selectedSprite, dataURL, assetName);
    applied.push(selectedSprite);
  }

  // Also update clones/instances of the same sprite asset, but never skip the selected one.
  STATE.objects.forEach(obj=>{
    if(!obj || obj.type!=='sprite' || obj===selectedSprite) return;
    const same = obj.spriteSrc===assetName || obj.assetName===assetName || obj.name===assetName ||
      (typeof spriteBaseName==='function' && (spriteBaseName(obj.spriteSrc)===spriteBaseName(assetName) || spriteBaseName(obj.name)===spriteBaseName(assetName)));
    if(same){ __forgeApplyPNGToSpriteObject_V21(obj, dataURL, assetName); applied.push(obj); }
  });

  // If no sprite object was selected, apply to first matching object so the viewport still updates.
  if(!applied.length){
    const first=STATE.objects.find(o=>o.type==='sprite' && (o.spriteSrc===assetName || o.name===assetName));
    if(first){ __forgeApplyPNGToSpriteObject_V21(first, dataURL, assetName); applied.push(first); STATE.selectedId=first.id; }
  }

  buildHierarchy();
  buildAssetTree();
  if(selectedSprite){ STATE.selectedId=selectedSprite.id; }
  updateStatusBar?.();

  // HOTFIX V22: wait for the PNG to be in the single-flight cache before rendering.
  // This avoids the transparent-block race when returning to the viewport.
  ensureSpriteImageLoaded(applied[0] || null, dataURL, () => {
    try{ renderViewport(); }catch(_){}
    try{ requestAnimationFrame(renderViewport); }catch(_){}
  });

  logConsole('success','Pixel art saved and applied to selected sprite: '+(selectedSprite?.name || assetName)+' ('+applied.length+' object(s)).');
  setStatusMsg('Selected sprite updated from Pixel Art ✓');
}

// NOTE: autosavePixelEditorToSpritePreview is defined earlier and should NOT be
// overridden here -- the earlier version does a silent background sync without
// logging. donePixelEditorV8 uses the explicit save (with log) only on Done click.
function donePixelEditorV8(){
  savePixelArtToSprite();
  setEditorTab('viewport');
  const src = STATE.lastSpriteDataURL;
  if(src) ensureSpriteImageLoaded(null, src, () => { try{ renderViewport(); }catch(_){} });
}

// Re-expose for buttons/inline handlers that captured window names.
if(typeof window !== 'undefined'){
  window.savePixelArtToSprite=savePixelArtToSprite;
  window.donePixelEditorV8=donePixelEditorV8;
  // Do NOT re-expose autosavePixelEditorToSpritePreview here -- the earlier
  // silent version must win to prevent console spam.
}

return { STATE, LIBS, BLOCK_DEFS, ASSET_TREE, BE, PE, PIXELART_BRIDGE, destroyPixelEditor };
`;


export const GameEditor = class {
  static options = {};
  static root = null;
  static runtime = null;
  static styleId = 'game-editor-styles';

  

  /**
   * Mounts the FORGE Game Editor into a DOM element.
   *
   * @param {Element|string} target - DOM element or selector to replace with the editor UI.
   * @param {object} options - Optional configuration. Supports { styleId }.
   * @returns {typeof GameEditor}
   */
  static mount(target = document.body, options = {}) {
    this.options = options;
    this.styleId = options.styleId || this.styleId || 'game-editor-styles';

    const host = typeof target === 'string'
      ? document.querySelector(target)
      : target;

    if (!host) {
      throw new Error('GameEditor mount target was not found.');
    }

    this.root = host;
    this.#ensureStyles();

    host.innerHTML = GAME_EDITOR_MARKUP;

    // Start the global library import pass before the runtime runs.  The mount
    // API stays synchronous, while block/code execution can await
    // window.ForgeGlobalImportsReady when it needs the imported classes.
    const forgeGlobalsReady = this.importGlobals();

    // The original HTML used inline event handlers. The runtime exposes those
    // handlers on window so the converted module behaves the same way.
    const runRuntime = new Function('PixelArt', GAME_EDITOR_RUNTIME);
    this.runtime = runRuntime.call(host, PixelArt);

    if (typeof window !== 'undefined') {
      window.GameEditor = this;
      window.ForgeGlobalImportsReady = forgeGlobalsReady;
    }

    // Apply the beginner-friendly block editor enhancements once the
    // editor DOM and runtime are fully initialised.
    applyBlockEditorPatch();

    return this;
  }

  /**
   * Imports every known FORGE library and exposes its classes/method facades
   * through window.ForgeClasses, window.ForgeLibs, and window.ForgeMethods.
   *
   * @returns {Promise<object>} Resolves to the global class registry.
   */
  static importGlobals() {
    const promise = importForgeGlobals({ GameEditor: this, PixelArt });
    this.globalImports = promise;
    return promise;
  }

  /** Clears the mounted editor markup and runtime reference. */
  static destroy() {
    try {
      this.runtime?.destroyPixelEditor?.();
      window.destroyPixelEditor?.();
    } catch (_) {}

    if (this.root) {
      this.root.innerHTML = '';
    }

    this.root = null;
    this.runtime = null;
  }

  /** @returns {object|null} Current editor state, if mounted. */
  static getState() {
    return this.runtime?.STATE ?? null;
  }

  static #ensureStyles() {
    if (document.getElementById(this.styleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = this.styleId;
    style.textContent = GAME_EDITOR_CSS;
    document.head.appendChild(style);
  }
};


export default GameEditor;
