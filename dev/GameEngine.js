/*
 * =============================================================================
 *  GameEngine.js — "Forge" Editor Core
 * =============================================================================
 *  A Unity-inspired, browser-native game engine + professional editor GUI.
 *
 *  Quick start:
 *    import GameEngine from '../libs/GameEngine.js';
 *    GameEngine.createEditor();
 *
 *  What this file provides:
 *   - A Unity-style editor shell: Hierarchy, Inspector, Asset Browser,
 *     Scene Viewport, dockable panels, and a full-screen node-graph
 *     ("Blueprint") workspace.
 *   - 2D, 3D (wireframe/perspective), VR and AR viewport modes, built on
 *     top of the project's own Canvex / Camera / Interaction / Lights
 *     libraries rather than re-implementing a renderer from scratch.
 *   - A pixel-art editor (grid canvas, palette, tools, PNG export) and a
 *     minimal 3D model builder (primitive placement + wireframe preview),
 *     both usable with mouse, pen, or touch.
 *   - Node-based visual scripting ("block coding") with draggable nodes
 *     and bezier connectors. Node categories map directly onto the real
 *     engine libraries (Camera, Lights, Interaction, Keyboard, pointer,
 *     Devices, IO, GUI, Curves, Elements) so a node graph and hand-written
 *     code are always two views of the same thing — the Code panel shows
 *     the exact, syntax-highlighted JS the graph will run.
 *   - A shortcut manager (Unity-style hotkeys), a custom context-menu
 *     system (right-click + long-press), and first-class mobile support
 *     (drawer panels, touch dragging, pinch-zoom, haptics).
 *
 *  Extending it:
 *   - "shapes.js" and "math.js" are used defensively (feature-detected)
 *     because they weren't included in this upload; wire them in fully
 *     once available and the Shapes-based renderer path activates
 *     automatically (see `Renderer2D.drawGameObject`).
 *   - Add new block-coding nodes with `LIBRARY_NODES.push({...})` — see
 *     the "NODE LIBRARY" section for the shape every entry follows.
 * =============================================================================
 */

/* --------------------------------------------------------------------------
 * Library imports — the real engine modules this editor is built on top of.
 * Everything here is used defensively: if a module or a specific method is
 * missing (e.g. not every environment ships every library file), the editor
 * degrades gracefully instead of throwing.
 * ------------------------------------------------------------------------ */
import { Camera } from "../libs/camera.js";
import { Canvas } from "../libs/canvas.js";
import { Canvex } from "../libs/canvex.js";
import { Color } from "../libs/color.js";
import { Curves } from "../libs/curves.js";
import { Devices } from "../libs/devices.js";
import { Elements } from "../libs/elements.js";
import { Keyboard, pointer as Pointer, controller as Controller, sensor as Sensor } from "../libs/events.js";
import { Flow } from "../libs/flow.js";
import { GUI } from "../libs/gui.js";
import { Image as ImageFX } from "../libs/image.js";
import { Interaction } from "../libs/interaction.js";
import { IO } from "../libs/io.js";
import { Lights } from "../libs/lights.js";
import { List } from "../libs/list.js";
import { Logic } from "../libs/logic.js";
import { Materials } from "../libs/materials.js";
import { Multiplayer } from "../libs/multiplayer.js";
import { Particles } from "../libs/particles.js";
import { Physics } from "../libs/physics.js";
import { Helpers } from "../libs/helpers.js";
import { DateTime } from "../libs/datetime.js";
import { Properties } from "../libs/properties.js";
import { Shapes } from "../libs/shapes.js";
import { Sound } from "../libs/sound.js";
import { Sprites } from "../libs/sprites.js";
import { Text } from "../libs/text.js";
import { Transform } from '../libs/transforms.js';
import { Triggers } from "../libs/triggers.js";

const has = (obj, fn) => !!(obj && typeof obj[fn] === "function");
const safeCall = (obj, fn, ...args) => (has(obj, fn) ? obj[fn](...args) : undefined);

/* ============================================================================
 *  GAME ENGINE — runtime (scenes, objects, components, assets, blueprints)
 * ========================================================================= */
export default class GameEngine {
  static VERSION = "1.0.0";
  static RENDERER_2D = "2d";
  static RENDERER_3D = "3d";
  static XR_VR = "immersive-vr";
  static XR_AR = "immersive-ar";

  constructor(options = {}) {
    this.canvas = options.canvas || document.createElement("canvas");
    this.contextMode = options.contextMode || GameEngine.RENDERER_2D;
    this.ctx = this.canvas.getContext("2d");
    this.settings = new SettingsManager(options.settings || {});
    this.events = new EventBus();
    this.scenes = new SceneManager(this);
    this.assets = new AssetManager(this);
    this.blueprints = new BlueprintSystem(this);
    this.undo = new UndoManager(this);
    this.editor = null;

    this.clock = { start: 0, last: 0, dt: 0, fps: 0, frame: 0, accumulator: 0, fixedStep: 1 / 60 };
    this.isRunning = false;
    this.isPaused = false;
    this._loop = this._loop.bind(this);

    this.canvas.tabIndex = 0;
    this.canvas.style.touchAction = "none";
    this.resize(this.settings.get("display.width"), this.settings.get("display.height"));

    // Wire the real input libraries in, if present.
    try { Keyboard.attach?.(window); } catch (_) {}
    try { Pointer.attach?.(this.canvas); } catch (_) {}
  }

  /** Boots the full Unity-style editor and mounts it in `options.parent`. */
  static createEditor(options = {}) {
    return new EditorGUI(options).mount(options.parent || document.body);
  }

  resize(width = innerWidth, height = innerHeight, dpr = devicePixelRatio || 1) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.events.emit("display:resize", { width: w, height: h, dpr });
  }

  start() {
    if (this.isRunning) return this;
    this.isRunning = true;
    this.isPaused = false;
    this.clock.start = this.clock.last = performance.now();
    requestAnimationFrame(this._loop);
    this.events.emit("engine:start", this);
    return this;
  }
  stop() { this.isRunning = false; this.events.emit("engine:stop", this); return this; }
  pause(value = true) { this.isPaused = !!value; this.events.emit(this.isPaused ? "engine:pause" : "engine:resume", this); return this; }

  _loop(now) {
    if (!this.isRunning) return;
    const dt = Math.min(0.1, Math.max(0, (now - this.clock.last) / 1000));
    this.clock.last = now; this.clock.dt = dt; this.clock.frame++; this.clock.fps = dt ? (1 / dt) : this.clock.fps;
    if (!this.isPaused) {
      this.clock.accumulator += dt;
      while (this.clock.accumulator >= this.clock.fixedStep) {
        this.scenes.activeScene?.fixedUpdate(this.clock.fixedStep);
        this.clock.accumulator -= this.clock.fixedStep;
      }
      this.blueprints.tick(dt);
      this.scenes.activeScene?.update(dt);
    }
    // Always render, even paused/editing, so Edit Mode still shows the scene.
    Renderer.frame(this, dt);
    Keyboard.endFrame?.();
    requestAnimationFrame(this._loop);
  }

  createScene(name = "Scene") { return this.scenes.create(name); }
  instantiate(name = "GameObject", components = []) { return this.scenes.activeScene?.createObject(name, components); }

  saveGame(slot = "autosave") {
    const data = {
      version: GameEngine.VERSION, savedAt: new Date().toISOString(),
      settings: this.settings.toJSON(), assets: this.assets.toJSON(),
      scenes: this.scenes.toJSON(), blueprints: this.blueprints.toJSON(),
    };
    try { localStorage.setItem(`ForgeProject:${slot}`, JSON.stringify(data)); } catch (_) {}
    return data;
  }
  loadGame(slotOrData = "autosave") {
    const data = typeof slotOrData === "string"
      ? JSON.parse(localStorage.getItem(`ForgeProject:${slotOrData}`) || "null")
      : slotOrData;
    if (!data) throw new Error("No saved project found.");
    this.settings.fromJSON(data.settings || {});
    this.assets.fromJSON(data.assets || {});
    this.scenes.fromJSON(data.scenes || []);
    this.blueprints.fromJSON(data.blueprints || {});
    return data;
  }
  exportProject(fileName = "project.forge.json") {
    const json = JSON.stringify(this.saveGame("__export__"), null, 2);
    downloadText(fileName, json, "application/json");
    return json;
  }
  async importProject(fileOrJson) {
    const text = fileOrJson instanceof Blob ? await fileOrJson.text() : fileOrJson;
    return this.loadGame(typeof text === "string" ? JSON.parse(text) : text);
  }

  async enterXR(mode) {
    if (!navigator.xr) throw new Error("WebXR is not available on this device/browser.");
    return navigator.xr.requestSession(mode, { optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking", "anchors"] });
  }
  enterVR() { return this.enterXR(GameEngine.XR_VR); }
  enterAR() { return this.enterXR(GameEngine.XR_AR); }
}
export { GameEngine };

/* ============================================================================
 *  CORE DATA MODEL
 * ========================================================================= */
export class EventBus {
  constructor() { this.map = new Map(); }
  on(t, f) { if (!this.map.has(t)) this.map.set(t, new Set()); this.map.get(t).add(f); return () => this.off(t, f); }
  off(t, f) { this.map.get(t)?.delete(f); }
  emit(t, p) { (this.map.get(t) || []).forEach(f => f(p)); }
}

export class SettingsManager {
  constructor(settings = {}) {
    this.values = deepMerge({
      project: { name: "My Game", company: "Indie Studio", version: "1.0.0" },
      display: { width: 960, height: 540 },
      graphics: { renderer: "2d", clearColor: "#0b1020", pixelPerfect: false, showStats: true },
      editor: { gridSnap: true, gridSize: 16, theme: "dark", autosaveMinutes: 3 },
      physics: { gravity: { x: 0, y: 9.81, z: 0 } },
      build: { target: "web", appleStore: false, microsoftStore: false, googlePlay: false },
    }, settings);
  }
  get(path, fallback) { return getPath(this.values, path, fallback); }
  set(path, value) { setPath(this.values, path, value); return value; }
  toJSON() { return clone(this.values); }
  fromJSON(json = {}) { this.values = deepMerge(this.values, json); }
}

export class SceneManager {
  constructor(engine) { this.engine = engine; this.scenes = []; this.activeScene = null; }
  create(name) { const s = new Scene(this.engine, name); this.scenes.push(s); this.activeScene ||= s; return s; }
  toJSON() { return this.scenes.map(s => s.toJSON()); }
  fromJSON(list = []) { this.scenes = list.map(d => Scene.fromJSON(this.engine, d)); this.activeScene = this.scenes[0] || this.create("Scene"); }
}

export class Scene {
  constructor(engine, name = "Scene") { this.engine = engine; this.id = uid("scene"); this.name = name; this.objects = []; }
  createObject(name, comps = []) { const o = new GameObject(name); comps.forEach(c => o.addComponent(c)); this.objects.push(o); return o; }
  removeObject(id) { this.objects = this.objects.filter(o => o.id !== id); }
  fixedUpdate(dt) { this.objects.forEach(o => o.enabled && o.fixedUpdate?.(dt, this)); }
  update(dt) { this.objects.forEach(o => o.enabled && o.update?.(dt, this)); }
  toJSON() { return { id: this.id, name: this.name, objects: this.objects.map(o => o.toJSON()) }; }
  static fromJSON(engine, d) { const s = new Scene(engine, d.name); s.id = d.id || uid("scene"); s.objects = (d.objects || []).map(GameObject.fromJSON); return s; }
}

export class GameObject {
  constructor(name = "GameObject") {
    this.id = uid("obj"); this.name = name; this.enabled = true; this.layer = 0; this.tags = [];
    this.transform = new Transform(); this.components = []; this.mode3D = false; this.primitive = null;
    // Some Transform implementations don't pre-populate these vectors — make
    // sure they always exist so downstream code (inspector fields, the
    // starting scene setup, node-graph moves) never hits "Cannot set
    // properties of undefined" when assigning e.g. transform.position.x.
    this.transform.position ||= { x: 0, y: 0, z: 0 };
    this.transform.rotation ||= { x: 0, y: 0, z: 0 };
    this.transform.scale ||= { x: 1, y: 1, z: 1 };
  }
  addComponent(c) { const comp = typeof c === "function" ? new c() : c; comp.gameObject = this; this.components.push(comp); return comp; }
  fixedUpdate(dt, s) { this.components.forEach(c => c.fixedUpdate?.(dt, s)); }
  update(dt, s) { this.components.forEach(c => c.update?.(dt, s)); }
  toJSON() {
    return {
      id: this.id, name: this.name, enabled: this.enabled, layer: this.layer, tags: this.tags,
      mode3D: this.mode3D, primitive: this.primitive, transform: this.transform.toJSON(),
      components: this.components.map(c => c.toJSON?.() || { type: c.constructor.name }),
    };
  }
  static fromJSON(d) {
    const o = new GameObject(d.name);
    o.id = d.id || uid("obj"); o.enabled = d.enabled !== false; o.layer = d.layer || 0; o.tags = d.tags || [];
    o.mode3D = !!d.mode3D; o.primitive = d.primitive || null;
    o.transform = Transform.fromJSON(d.transform);
    o.transform.position ||= { x: 0, y: 0, z: 0 };
    o.transform.rotation ||= { x: 0, y: 0, z: 0 };
    o.transform.scale ||= { x: 1, y: 1, z: 1 };
    (d.components || []).forEach(c => {
      if (c.type === "SpriteRenderer") o.addComponent(new SpriteRenderer(c));
      if (c.type === "CameraComponent") o.addComponent(new CameraComponent(c));
      if (c.type === "ScriptComponent") o.addComponent(new ScriptComponent(c));
    });
    return o;
  }
}


/** Draws a solid-color rectangle for a GameObject; consumed by Renderer.drawGameObject. */
export class SpriteRenderer {
  constructor({ color = "#38bdf8", width = 64, height = 64, pixelAssetId = null } = {}) {
    this.type = "SpriteRenderer";
    this.color = color;
    this.width = width;
    this.height = height;
    this.pixelAssetId = pixelAssetId;
  }
  toJSON() { return { type: this.type, color: this.color, width: this.width, height: this.height, pixelAssetId: this.pixelAssetId }; }
}

/** Marks a GameObject as the active scene camera (2D pan/zoom + 3D FOV). */
export class CameraComponent {
  constructor({ zoom = 1, fov = 60, clearColor = null } = {}) {
    this.type = "CameraComponent";
    this.zoom = zoom;
    this.fov = fov;
    this.clearColor = clearColor;
  }
  toJSON() { return { type: this.type, zoom: this.zoom, fov: this.fov, clearColor: this.clearColor }; }
}

/** Attaches a compiled blueprint graph's generated code as a live per-object script. */
export class ScriptComponent {
  constructor({ graphId = null, code = "" } = {}) { this.type = "ScriptComponent"; this.graphId = graphId; this.code = code; }
  toJSON() { return { type: this.type, graphId: this.graphId, code: this.code }; }
}

export class AssetManager {
  constructor(engine) { this.engine = engine; this.assets = new Map(); }
  add(a) { a.id ||= uid("asset"); this.assets.set(a.id, a); return a; }
  remove(id) { this.assets.delete(id); }
  createPixelArt(name, w = 16, h = 16, palette = ["#00000000", "#38bdf8", "#f472b6", "#facc15", "#ffffff", "#0f172a"]) {
    return this.add(new PixelArtAsset(name, w, h, palette));
  }
  createModel(name, geometry = MeshFactory.cube(1)) { return this.add(new ModelAsset(name, geometry)); }
  toJSON() { return { assets: [...this.assets.values()].map(a => a.toJSON()) }; }
  fromJSON(json = {}) { this.assets.clear(); (json.assets || []).forEach(a => this.add(Asset.fromJSON(a))); }
}
export class Asset {
  constructor(name, type) { this.id = uid("asset"); this.name = name; this.type = type; }
  toJSON() { return clone({ ...this }); }
  static fromJSON(d) {
    if (d.type === "pixel-art") return PixelArtAsset.fromJSON(d);
    if (d.type === "model") return ModelAsset.fromJSON(d);
    return Object.assign(new Asset(d.name, d.type), d);
  }
}
export class PixelArtAsset extends Asset {
  constructor(name, w, h, palette) {
    super(name, "pixel-art");
    this.width = w; this.height = h; this.palette = palette;
    this.pixels = Array.from({ length: h }, () => Array(w).fill(0));
    this.history = []; this.future = [];
  }
  snapshot() { this.history.push(clone(this.pixels)); if (this.history.length > 50) this.history.shift(); this.future = []; }
  undo() { if (!this.history.length) return; this.future.push(clone(this.pixels)); this.pixels = this.history.pop(); }
  redo() { if (!this.future.length) return; this.history.push(clone(this.pixels)); this.pixels = this.future.pop(); }
  setPixel(x, y, i = 1) { if (this.pixels[y] && x >= 0 && x < this.width) this.pixels[y][x] = i; return this; }
  floodFill(x, y, i) {
    const target = this.pixels[y]?.[x]; if (target === undefined || target === i) return;
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop();
      if (this.pixels[cy]?.[cx] !== target) continue;
      this.pixels[cy][cx] = i;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  }
  toCanvas(scale = 1) {
    const c = document.createElement("canvas"); c.width = this.width * scale; c.height = this.height * scale;
    const ctx = c.getContext("2d"); ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) {
      ctx.fillStyle = this.palette[this.pixels[y][x]] || "#0000"; ctx.fillRect(x * scale, y * scale, scale, scale);
    }
    return c;
  }
  toDataURL(scale = 16) { return this.toCanvas(scale).toDataURL("image/png"); }
  static fromJSON(d) { const p = new PixelArtAsset(d.name, d.width, d.height, d.palette); Object.assign(p, d); p.history = []; p.future = []; return p; }
}
export class ModelAsset extends Asset {
  constructor(name, geometry) { super(name, "model"); this.geometry = geometry; }
  toOBJ() { return MeshFactory.toOBJ(this.geometry, this.name); }
  static fromJSON(d) { return Object.assign(new ModelAsset(d.name, d.geometry), d); }
}
export class MeshFactory {
  static cube(size = 1) {
    const s = size / 2;
    return {
      vertices: [[-s,-s,-s],[s,-s,-s],[s,s,-s],[-s,s,-s],[-s,-s,s],[s,-s,s],[s,s,s],[-s,s,s]],
      edges: [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]],
    };
  }
  static pyramid(size = 1) {
    const s = size / 2;
    return { vertices: [[-s,0,-s],[s,0,-s],[s,0,s],[-s,0,s],[0,size,0]], edges: [[0,1],[1,2],[2,3],[3,0],[0,4],[1,4],[2,4],[3,4]] };
  }
  static sphere(radius = 1, segments = 8) {
    const vertices = []; const edges = [];
    for (let i = 0; i <= segments; i++) {
      const lat = Math.PI * (i / segments - 0.5);
      for (let j = 0; j < segments; j++) {
        const lon = (2 * Math.PI * j) / segments;
        vertices.push([radius * Math.cos(lat) * Math.cos(lon), radius * Math.sin(lat), radius * Math.cos(lat) * Math.sin(lon)]);
        const idx = vertices.length - 1;
        if (j > 0) edges.push([idx - 1, idx]);
        if (i > 0) edges.push([idx - segments, idx]);
      }
    }
    return { vertices, edges };
  }
  static toOBJ(g, n = "model") { return [`# ${n}`, ...g.vertices.map(v => `v ${v.join(" ")}`)].join("\n"); }
}

/* ============================================================================
 *  BLUEPRINT SYSTEM — node-based visual scripting bound to the real libraries
 * ========================================================================= */

/**
 * Every entry is one draggable "block". `run` executes the node live inside
 * the editor's preview scene; `code` returns the exact JS line(s) that node
 * represents, so the Code panel and the graph can never drift apart.
 */
const LIBRARY_NODES = [
  { type: "Event:Start", category: "Events", icon: "⚡", isEvent: true, inputs: {}, run: () => true, code: () => `// runs once when play starts` },
  { type: "Event:Tick", category: "Events", icon: "⚡", isEvent: true, inputs: {}, run: () => true, code: () => `// runs every frame` },
  { type: "Event:KeyPressed", category: "Events", icon: "⚡", isEvent: true, inputs: { key: "Space" }, run: (ctx, n) => Keyboard.keyIsDown ? Keyboard.keyIsDown(n.inputs.key) : false, code: n => `if (Keyboard.keyIsDown('${n.inputs.key}')) {` },

  { type: "Object.Move", category: "Object", icon: "↔", inputs: { x: 0, y: 0, z: 0 }, run: (ctx, n) => { ctx.target?.transform.translate((n.inputs.x||0)*ctx.dt, (n.inputs.y||0)*ctx.dt, (n.inputs.z||0)*ctx.dt); return true; }, code: n => `object.transform.translate(${n.inputs.x||0} * dt, ${n.inputs.y||0} * dt, ${n.inputs.z||0} * dt);` },
  { type: "Object.SetPosition", category: "Object", icon: "▣", inputs: { x: 0, y: 0, z: 0 }, run: (ctx, n) => { if (ctx.target) Object.assign(ctx.target.transform.position, { x: n.inputs.x, y: n.inputs.y, z: n.inputs.z }); return true; }, code: n => `Object.assign(object.transform.position, { x: ${n.inputs.x}, y: ${n.inputs.y}, z: ${n.inputs.z} });` },
  { type: "Object.Log", category: "Object", icon: "●", inputs: { message: "Hello from a node" }, run: (ctx, n) => { console.log(n.inputs.message); return true; }, code: n => `console.log(${JSON.stringify(n.inputs.message)});` },
  { type: "Object.Destroy", category: "Object", icon: "✕", inputs: {}, run: (ctx) => { if (ctx.target && ctx.scene) ctx.scene.removeObject(ctx.target.id); return true; }, code: () => `scene.removeObject(object.id);` },

  { type: "Camera.Move", category: "Camera", icon: "🎥", inputs: { x: 0, y: 0, z: 0 }, run: (ctx, n) => safeCall(Camera, "move", n.inputs.x, n.inputs.y, n.inputs.z), code: n => `Camera.move(${n.inputs.x}, ${n.inputs.y}, ${n.inputs.z});` },
  { type: "Camera.Pan", category: "Camera", icon: "🎥", inputs: { angle: 0.02 }, run: (ctx, n) => safeCall(Camera, "pan", n.inputs.angle), code: n => `Camera.pan(${n.inputs.angle});` },
  { type: "Camera.LookAt", category: "Camera", icon: "🎥", inputs: { x: 0, y: 0, z: 0 }, run: (ctx, n) => safeCall(Camera, "lookAt", n.inputs.x, n.inputs.y, n.inputs.z), code: n => `Camera.lookAt(${n.inputs.x}, ${n.inputs.y}, ${n.inputs.z});` },

  { type: "Render.Background", category: "Rendering", icon: "🖌", inputs: { color: "#0b1020" }, run: (ctx, n) => safeCall(Canvex, "background", n.inputs.color), code: n => `Canvex.background('${n.inputs.color}');` },
  { type: "Render.FrameRate", category: "Rendering", icon: "🖌", inputs: { fps: 60 }, run: (ctx, n) => safeCall(Canvex, "frameRate", n.inputs.fps), code: n => `Canvex.frameRate(${n.inputs.fps});` },

  { type: "Light.Ambient", category: "Lighting", icon: "💡", inputs: { color: "#ffffff" }, run: (ctx, n) => safeCall(Lights, "ambientLight", n.inputs.color), code: n => `Lights.ambientLight('${n.inputs.color}');` },
  { type: "Light.Point", category: "Lighting", icon: "💡", inputs: { x: 0, y: 100, z: 0, color: "#ffffff" }, run: (ctx, n) => safeCall(Lights, "pointLight", n.inputs.color, n.inputs.x, n.inputs.y, n.inputs.z), code: n => `Lights.pointLight('${n.inputs.color}', ${n.inputs.x}, ${n.inputs.y}, ${n.inputs.z});` },

  { type: "Input.KeyDown", category: "Input", icon: "⌨", inputs: { key: "ArrowRight" }, run: (ctx, n) => safeCall(Keyboard, "keyIsDown", n.inputs.key), code: n => `Keyboard.keyIsDown('${n.inputs.key}')` },
  { type: "Input.Orbit", category: "Input", icon: "🖱", inputs: { sensitivity: 1 }, run: (ctx, n) => safeCall(Interaction, "orbitControl", n.inputs.sensitivity, n.inputs.sensitivity, n.inputs.sensitivity), code: n => `Interaction.orbitControl(${n.inputs.sensitivity}, ${n.inputs.sensitivity}, ${n.inputs.sensitivity});` },

  { type: "Device.Vibrate", category: "Device", icon: "📳", inputs: { ms: 100 }, run: (ctx, n) => safeCall(Devices, "vibrate", n.inputs.ms), code: n => `Devices.vibrate(${n.inputs.ms});` },
  { type: "Device.Haptic", category: "Device", icon: "📳", inputs: { style: "MEDIUM" }, run: (ctx, n) => safeCall(Devices, "hapticImpact", n.inputs.style), code: n => `Devices.hapticImpact('${n.inputs.style}');` },
  { type: "Device.IsMobile", category: "Device", icon: "📱", inputs: {}, run: () => safeCall(Devices, "isMobile"), code: () => `Devices.isMobile()` },

  { type: "GUI.Alert", category: "Interface", icon: "🔔", inputs: { message: "Hello!" }, run: (ctx, n) => safeCall(GUI, "alert", { message: n.inputs.message }), code: n => `GUI.alert({ message: ${JSON.stringify(n.inputs.message)} });` },

  { type: "IO.SaveJSON", category: "Data", icon: "💾", inputs: { filename: "data.json" }, run: (ctx, n) => safeCall(IO, "saveJSON", { savedAt: Date.now() }, n.inputs.filename), code: n => `IO.saveJSON(data, '${n.inputs.filename}');` },
  { type: "IO.LoadJSON", category: "Data", icon: "💾", inputs: { path: "data.json" }, run: (ctx, n) => safeCall(IO, "loadJSON", n.inputs.path), code: n => `IO.loadJSON('${n.inputs.path}');` },

  { type: "Curve.BezierPoint", category: "Math", icon: "∿", inputs: { a: 0, b: 0.2, c: 0.8, d: 1, t: 0.5 }, run: (ctx, n) => safeCall(Curves, "bezierPoint", n.inputs.a, n.inputs.b, n.inputs.c, n.inputs.d, n.inputs.t), code: n => `Curves.bezierPoint(${n.inputs.a}, ${n.inputs.b}, ${n.inputs.c}, ${n.inputs.d}, ${n.inputs.t});` },
  { type: "Math.Random", category: "Math", icon: "🎲", inputs: { min: 0, max: 1 }, run: (ctx, n) => n.inputs.min + Math.random() * (n.inputs.max - n.inputs.min), code: n => `(${n.inputs.min} + Math.random() * (${n.inputs.max} - ${n.inputs.min}))` },

  { type: "Time.Now", category: "Time", icon: "⏱", inputs: {}, run: () => safeCall(DateTime, "timestamp"), code: () => `DateTime.timestamp()` },
];
const NODE_TYPES = Object.fromEntries(LIBRARY_NODES.map(n => [n.type, n]));
const NODE_CATEGORIES = [...new Set(LIBRARY_NODES.map(n => n.category))];

export class NodeRegistry {
  constructor() { this.defs = NODE_TYPES; }
  get(type) { return this.defs[type]; }
  execute(type, ctx, node) { return this.defs[type]?.run(ctx, node); }
  code(type, node) { return this.defs[type]?.code(node) || `// ${type}`; }
}

export class BlueprintSystem {
  constructor(engine) { this.engine = engine; this.graphs = new Map(); this.registry = new NodeRegistry(); }
  createGraph(name) { const g = new BlueprintGraph(name, this.registry); this.graphs.set(g.id, g); return g; }
  removeGraph(id) { this.graphs.delete(id); }
  tick(dt) {
    const target = this.engine.editor?.selectedObject || null;
    this.graphs.forEach(g => g.runEvent("Tick", { dt, engine: this.engine, target, scene: this.engine.scenes.activeScene }));
  }
  toJSON() { return { graphs: [...this.graphs.values()].map(g => g.toJSON()) }; }
  fromJSON(json = {}) { this.graphs.clear(); (json.graphs || []).forEach(d => { const g = BlueprintGraph.fromJSON(d, this.registry); this.graphs.set(g.id, g); }); }
}

export class BlueprintGraph {
  constructor(name, registry) { this.id = uid("graph"); this.name = name; this.registry = registry; this.nodes = new Map(); this.connections = []; }
  addNode(type, x = 0, y = 0, inputs = null) {
    const def = this.registry.get(type);
    const node = { id: uid("node"), type, x, y, inputs: inputs || clone(def?.inputs || {}), outputs: [] };
    this.nodes.set(node.id, node);
    return node;
  }
  removeNode(id) { this.nodes.delete(id); this.connections = this.connections.filter(c => c.from !== id && c.to !== id); }
  /**
   * Connects an output (exec) port to an input (exec) port. Each node is
   * "smart" about its own ports rather than accepting any wire blindly:
   *  - a node can't wire into itself
   *  - Event nodes have no input port — they are pulse *sources* only
   *  - an input port accepts a single incoming wire; wiring a new one in
   *    replaces whatever was previously plugged into it (same as Unreal/
   *    Unity graph editors)
   *  - duplicate wires are ignored
   * Returns the created wire, or null if the connection was rejected.
   */
  connect(from, to) {
    if (from === to) return null;
    const fromNode = this.nodes.get(from), toNode = this.nodes.get(to);
    if (!fromNode || !toNode) return null;
    const toDef = this.registry.get(toNode.type);
    if (toDef?.isEvent) return null; // no input port to plug into
    if (this.connections.some(c => c.from === from && c.to === to)) return null;
    this.connections = this.connections.filter(c => c.to !== to); // input port: one wire in
    const wire = { id: uid("wire"), from, to };
    this.connections.push(wire);
    return wire;
  }
  disconnect(wireId) { this.connections = this.connections.filter(c => c.id !== wireId); }
  /** Ports available on a node, for the editor's drag-to-connect UI. */
  portsOf(id) {
    const node = this.nodes.get(id); if (!node) return { in: false, out: true };
    const def = this.registry.get(node.type);
    return { in: !def?.isEvent, out: true };
  }
  outputsOf(id) { return this.connections.filter(c => c.from === id).map(c => this.nodes.get(c.to)).filter(Boolean); }
  runEvent(eventName, ctx) {
    [...this.nodes.values()].filter(n => n.type === `Event:${eventName}`).forEach(n => this.exec(n, ctx, new Set()));
  }
  exec(node, ctx, seen) {
    if (!node || seen.has(node.id)) return;
    seen.add(node.id);
    try { this.registry.execute(node.type, ctx, node); } catch (e) { console.warn(`Blueprint node "${node.type}" failed:`, e); }
    this.outputsOf(node.id).forEach(next => this.exec(next, ctx, seen));
  }
  /** Walks from every event node and emits the equivalent hand-written JS. */
  toJavaScript() {
    const lines = [`// Auto-generated from blueprint "${this.name}" — edits here do not sync back to the graph.`];
    const events = [...this.nodes.values()].filter(n => n.type.startsWith("Event:"));
    for (const evt of events) {
      const label = evt.type.split(":")[1];
      lines.push("", `function on${label}(object, scene, dt) {`);
      const seen = new Set(); const body = [];
      const walk = (n) => { if (!n || seen.has(n.id)) return; seen.add(n.id); body.push("  " + this.registry.code(n.type, n)); this.outputsOf(n.id).forEach(walk); };
      this.outputsOf(evt.id).forEach(walk);
      lines.push(...(body.length ? body : ["  // (empty — drag blocks from the palette)"]), "}");
    }
    if (!events.length) lines.push("", "// Add an Event block (Start / Tick / KeyPressed) to begin.");
    return lines.join("\n");
  }
  toJSON() { return { id: this.id, name: this.name, nodes: [...this.nodes.values()], connections: this.connections }; }
  static fromJSON(d, registry) {
    const g = new BlueprintGraph(d.name, registry); g.id = d.id || uid("graph");
    (d.nodes || []).forEach(n => g.nodes.set(n.id, n));
    g.connections = d.connections || [];
    return g;
  }
}

/* ============================================================================
 *  UNDO / REDO
 * ========================================================================= */
export class UndoManager {
  constructor(engine) { this.engine = engine; this.stack = []; this.pointer = -1; }
  push(label, undoFn, redoFn) { this.stack = this.stack.slice(0, this.pointer + 1); this.stack.push({ label, undoFn, redoFn }); this.pointer = this.stack.length - 1; }
  undo() { if (this.pointer < 0) return null; const e = this.stack[this.pointer--]; e.undoFn(); return e.label; }
  redo() { if (this.pointer >= this.stack.length - 1) return null; const e = this.stack[++this.pointer]; e.redoFn(); return e.label; }
}

/* ============================================================================
 *  RENDERER — draws the active scene using Canvex/Camera/Lights when present,
 *  falling back to plain Canvas 2D so the editor always renders something.
 * ========================================================================= */
export class Renderer {
  static frame(engine, dt) {
    const ctx = engine.ctx;
    const clear = engine.settings.get("graphics.clearColor");
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = clear; ctx.fillRect(0, 0, engine.canvas.width, engine.canvas.height);
    ctx.restore();

    const scene = engine.scenes.activeScene;
    if (scene) {
      const view=engine.editor?.sceneView || {zoom:1,panX:0,panY:0};
      ctx.save(); ctx.translate(view.panX,view.panY); ctx.scale(view.zoom,view.zoom);
      if(engine.contextMode===GameEngine.RENDERER_3D) Renderer.draw3DGrid(ctx, engine.canvas.clientWidth/view.zoom, engine.canvas.clientHeight/view.zoom);
      const objects = [...scene.objects].sort((a, b) => a.layer - b.layer);
      for (const o of objects) if (o.enabled) Renderer.drawGameObject(ctx, o, engine.contextMode, engine);
      const selected=engine.editor?.selectedObject; if(selected) Renderer.drawSelection(ctx,selected);
      ctx.restore();
    }

    if (engine.settings.get("graphics.showStats")) {
      ctx.save(); ctx.fillStyle = "#dbeafecc"; ctx.font = "12px monospace";
      ctx.fillText(`${Math.round(engine.clock.fps)} FPS · ${engine.contextMode.toUpperCase()} · ${scene?.objects.length || 0} objects`, 12, 20);
      ctx.restore();
    }
  }
  static draw3DGrid(ctx,w,h){
    ctx.save(); ctx.strokeStyle="#29415f"; ctx.lineWidth=1;
    const horizon=h*.42; for(let i=-12;i<=12;i++){ctx.beginPath();ctx.moveTo(w/2+i*12,horizon);ctx.lineTo(w/2+i*70,h);ctx.stroke();}
    for(let y=horizon;y<h;y+=Math.max(12,(y-horizon)*.18)){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();} ctx.restore();
  }
  static drawSelection(ctx,o){ const sr=o.components.find(c=>c.type==="SpriteRenderer"); ctx.save();ctx.translate(o.transform.position.x,o.transform.position.y);ctx.setLineDash([6,4]);ctx.strokeStyle="#f5a524";ctx.lineWidth=2;if(sr)ctx.strokeRect(-sr.width/2-6,-sr.height/2-6,sr.width+12,sr.height+12);else if(o.primitive)ctx.strokeRect(-78,-78,156,156);ctx.restore(); }
  static drawGameObject(ctx, o, mode = "2d", engine = null) {
    const t = o.transform;
    if (mode === "3d" && o.primitive) {
      const geometry = o.primitive === "pyramid" ? MeshFactory.pyramid(1) : o.primitive === "sphere" ? MeshFactory.sphere(1, 12) : MeshFactory.cube(1);
      Renderer.drawWireframe(ctx, geometry, t.position.x, t.position.y, 70 * (t.scale.x || 1), t.rotation.x || .45, t.rotation.y || .65);
      return;
    }
    const sprite = o.components.find(c => c.type === "SpriteRenderer");
    if (!sprite) return;
    ctx.save();
    ctx.translate(t.position.x, t.position.y);
    ctx.rotate(t.rotation.z || 0);
    ctx.scale(t.scale.x || 1, t.scale.y || 1);
    // Uses the shared Shapes helper when available for consistency with the
    // rest of the engine; otherwise falls back to a plain filled rect.
    const pixelAsset = sprite.pixelAssetId ? engine?.assets.assets.get(sprite.pixelAssetId) : null;
    if (pixelAsset instanceof PixelArtAsset) {
      pixelAsset._sceneCanvas ||= pixelAsset.toCanvas(1);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(pixelAsset._sceneCanvas, -sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height);
    } else if (has(Shapes, "rect")) {
      Shapes.rect(-sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height, { fill: sprite.color });
    } else {
      ctx.fillStyle = sprite.color; ctx.fillRect(-sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height);
    }
    ctx.restore();
  }
  /** Minimal software wireframe projector for the Model Builder tool. */
  static drawWireframe(ctx, geometry, cx, cy, scale = 60, rotX = 0.5, rotY = 0.6) {
    const project = ([x, y, z]) => {
      let y1 = y * Math.cos(rotX) - z * Math.sin(rotX), z1 = y * Math.sin(rotX) + z * Math.cos(rotX);
      let x2 = x * Math.cos(rotY) + z1 * Math.sin(rotY), z2 = -x * Math.sin(rotY) + z1 * Math.cos(rotY);
      const perspective = 4 / (4 + z2);
      return [cx + x2 * scale * perspective, cy + y1 * scale * perspective];
    };
    ctx.save(); ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 1.5; ctx.shadowColor = "#38bdf8"; ctx.shadowBlur = 6;
    for (const [a, b] of geometry.edges) {
      const [x1, y1] = project(geometry.vertices[a]); const [x2, y2] = project(geometry.vertices[b]);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    ctx.restore();
  }
}

/* ============================================================================
 *  SHORTCUT MANAGER — Unity-style hotkeys
 * ========================================================================= */
export class ShortcutManager {
  constructor(gui) {
    this.gui = gui; this.bindings = [];
    this.handler = this.handler.bind(this);
    window.addEventListener("keydown", this.handler);
  }
  register(combo, description, action) { this.bindings.push({ combo: combo.toLowerCase(), description, action }); }
  destroy() { window.removeEventListener("keydown", this.handler); }
  handler(e) {
    const tag = (e.target.tagName || "").toLowerCase();
    if (["input", "textarea", "select"].includes(tag)) {
      // Still allow global Escape / Ctrl+S while editing a field.
      if (!(e.key === "Escape" || (e.ctrlKey && e.key.toLowerCase() === "s"))) return;
    }
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push("ctrl");
    if (e.shiftKey) parts.push("shift");
    parts.push(e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase());
    const combo = parts.join("+");
    const match = this.bindings.find(b => b.combo === combo);
    if (match) { e.preventDefault(); match.action(e); }
  }
}

/* ============================================================================
 *  CONTEXT MENU — custom, context-sensitive, touch (long-press) friendly
 * ========================================================================= */
export class ContextMenu {
  constructor() {
    this.el = el("div", "ge-context-menu");
    document.body.appendChild(this.el);
    document.addEventListener("pointerdown", (e) => { if (!this.el.contains(e.target)) this.close(); });
    window.addEventListener("scroll", () => this.close(), true);
    window.addEventListener("resize", () => this.close());
  }
  open(x, y, items) {
    this.el.innerHTML = "";
    for (const item of items) {
      if (item === "-") { this.el.appendChild(el("div", "ge-context-sep")); continue; }
      const btn = el("button", `ge-context-item ${item.danger ? "danger" : ""}`, `<span>${item.icon || ""}</span><span>${item.label}</span>${item.shortcut ? `<small>${item.shortcut}</small>` : ""}`);
      btn.onclick = () => { this.close(); item.action?.(); };
      this.el.appendChild(btn);
    }
    const vw = window.innerWidth, vh = window.innerHeight;
    this.el.style.left = `${Math.min(x, vw - 220)}px`;
    this.el.style.top = `${Math.min(y, vh - items.length * 34 - 20)}px`;
    this.el.classList.add("open");
  }
  close() { this.el.classList.remove("open"); }
  /** Attaches right-click + long-press (mobile) to `target`, building items via `factory(event)`. */
  bind(target, factory) {
    target.addEventListener("contextmenu", (e) => { e.preventDefault(); const items = factory(e); if (items) this.open(e.clientX, e.clientY, items); });
    let timer = null, startX = 0, startY = 0;
    target.addEventListener("touchstart", (e) => {
      const t = e.touches[0]; startX = t.clientX; startY = t.clientY;
      timer = setTimeout(() => { const items = factory(e); if (items) { this.open(startX, startY, items); safeCall(Devices, "vibrate", 20); } }, 500);
    }, { passive: true });
    target.addEventListener("touchmove", (e) => { const t = e.touches[0]; if (Math.hypot(t.clientX - startX, t.clientY - startY) > 12) clearTimeout(timer); }, { passive: true });
    target.addEventListener("touchend", () => clearTimeout(timer));
  }
}

/* ============================================================================
 *  EDITOR GUI — the Unity-style shell: menus, panels, viewport, dock, overlay
 * ========================================================================= */
export class EditorGUI {
  constructor(options = {}) {
    this.options = options;
    this.root = null; this.engine = null;
    this.selectedObject = null; this.selectedAsset = null;
    this.activeTab = "assets"; this.activeMode = GameEngine.RENDERER_2D;
    this.transformTool = "move";
    this.pixelTool = "pencil"; this.pixelColor = 1;
    this.blueprintGraph = null;
    /** Editor-wide mode: "edit" | "preview" | "publish". Always boots into "edit". */
    this.editorMode = "edit";
    this.multiplayer = null;
    this.multiplayerRole = "local-host";
    this.bpZoom = 1; this.bpPan = { x: 0, y: 0 };
    this.sceneView = { zoom: 1, panX: 0, panY: 0 };
    this.pixelZoom = 24;
    this.contextMenu = new ContextMenu();
    this.shortcuts = new ShortcutManager(this);
    this.isMobile = safeCall(Devices, "isMobile") ?? (window.innerWidth < 900);
  }

  mount(parent) {
    injectStyles();
    this.root = el("div", `ge-app ${this.isMobile ? "is-mobile" : ""}`);
    this.root.innerHTML = template();
    parent.appendChild(this.root);
    this._neutralizeForeignOverlays();

    const canvas = this.$(".ge-viewport-canvas");
    this.engine = new GameEngine({ canvas, settings: { display: { width: 1024, height: 640 } } });
    this.engine.editor = this;

    const scene = this.engine.createScene("Main Scene");
    const camera = scene.createObject("Main Camera", [new CameraComponent()]);
    this.selectedObject = camera;
    this.sceneView.panX = 0; this.sceneView.panY = 0;

    // Starts empty — no demo nodes, no auto-wiring. Drag blocks in from the
    // palette and connect them by hand (see openBlueprint / bindPortDrag).
    this.blueprintGraph = this.engine.blueprints.createGraph("Player Logic");

    this.bindEvents();
    this.bindShortcuts();
    this.bindContextMenus();
    this.bindMenuBar();
    this.refreshAll();
    this.engine.start();
    this.switchEditorMode("edit");
    setTimeout(() => this.resizeViewport(), 0);
    return this;
  }

  /**
   * Some of the bundled libraries (Canvex, in particular) auto-boot a
   * full-viewport `<canvas>` onto `document.body` the moment they're
   * imported — it's inserted absolutely-positioned, which the browser's
   * CSS painting order places *above* the editor's own (non-positioned)
   * shell regardless of DOM order. The practical symptom is exactly what
   * it looks like: an invisible pane sitting over the whole screen eating
   * every click before a real button ever sees it. The editor doesn't use
   * that global canvas, so it's swept out of the way defensively instead
   * of relying on every consumer of these libs to know about the quirk.
   */
  _neutralizeForeignOverlays() {
    const sweep = () => {
      [...document.body.children].forEach(node => {
        if (node.tagName !== "CANVAS" || this.root.contains(node) || node === this.root) return;
        node.style.pointerEvents = "none";
        node.style.visibility = "hidden";
      });
    };
    sweep();
    // Canvex boots on `window load`, which can fire after we've already
    // mounted — sweep again shortly after, and keep watching for it.
    setTimeout(sweep, 0);
    setTimeout(sweep, 300);
    if (!this._overlayWatcher) {
      this._overlayWatcher = new MutationObserver(sweep);
      this._overlayWatcher.observe(document.body, { childList: true });
    }
  }

  $(sel) { return this.root.querySelector(sel); }
  $all(sel) { return [...this.root.querySelectorAll(sel)]; }
  on(sel, handler) { this.$all(sel).forEach(node => node.onclick = handler); }

  /* ---------------------------- top-level actions --------------------------- */
  bindEvents() {
    addEventListener("resize", () => this.resizeViewport());
    this.on('[data-action="play"]', () => this.switchEditorMode("preview"));
    this.on('[data-action="pause"]', () => { this.engine.pause(true); this.root.classList.remove("is-playing"); this.toast("Preview paused."); });
    this.on('[data-action="stop"]', () => {
      const p = this.engine.scenes.activeScene.objects.find(o => o.name === "Player");
      if (p) { p.transform.position.x = 340; p.transform.position.y = 220; }
      this.switchEditorMode("edit");
    });
    this.$all('[data-mode]').forEach(b => b.onclick = () => this.switchEditorMode(b.dataset.mode));
    this.on('[data-action="menu-duplicate"]', () => this.duplicateSelected());
    this.on('[data-action="menu-delete"]', () => this.deleteSelected());
    this.on('[data-action="menu-focus"]', () => this.focusSelected());
    this.on('[data-action="mp-connect"]', () => this.connectMultiplayer());
    this.on('[data-action="mp-add-player"]', () => this.addTestPlayer());
    this.on('[data-action="mp-disconnect"]', () => this.disconnectMultiplayer());
    this.on('[data-action="add-square"]', () => this.addSprite());
    this.on('[data-action="add-model"]', () => this.addModel());
    this.on('[data-action="save"]', () => { this.engine.saveGame("project"); this.toast("Project saved."); });
    this.on('[data-action="load"]', () => {
      try {
        this.engine.loadGame("project");
        this.selectedObject = this.engine.scenes.activeScene.objects[0];
        this.refreshAll();
        this.toast("Project loaded.");
      } catch (e) { this.toast(e.message || "Nothing to load yet."); }
    });
    this.on('[data-action="export"]', () => this.engine.exportProject(`${safeFile(this.engine.settings.get("project.name"))}.forge.json`));
    this.on('[data-action="import-file"]', () => this.$(".ge-import-input").click());
    this.$(".ge-import-input").onchange = e => e.target.files[0] && this.importFile(e.target.files[0]);
    this.on('[data-action="undo"]', () => { const l = this.engine.undo.undo(); this.toast(l ? `Undid: ${l}` : "Nothing to undo."); this.refreshAll(); });
    this.on('[data-action="redo"]', () => { const l = this.engine.undo.redo(); this.toast(l ? `Redid: ${l}` : "Nothing to redo."); this.refreshAll(); });

    this.on('[data-action="mode-2d"]', () => this.switchMode(GameEngine.RENDERER_2D));
    this.on('[data-action="mode-3d"]', () => this.switchMode(GameEngine.RENDERER_3D));
    this.on('[data-action="vr"]', () => this.engine.enterVR().then(() => this.toast("VR session started.")).catch(e => this.toast(e.message)));
    this.on('[data-action="ar"]', () => this.engine.enterAR().then(() => this.toast("AR session started.")).catch(e => this.toast(e.message)));

    this.on('[data-action="tool-move"]', () => this.setTool("move"));
    this.on('[data-action="tool-rotate"]', () => this.setTool("rotate"));
    this.on('[data-action="tool-scale"]', () => this.setTool("scale"));

    this.on('[data-action="new-pixel"]', () => this.createPixelArt());
    this.on('[data-action="export-png"]', () => this.exportPixelPNG());
    this.on('[data-action="px-undo"]', () => { this.selectedAsset?.undo?.(); this.refreshPixelEditor(); });
    this.on('[data-action="px-redo"]', () => { this.selectedAsset?.redo?.(); this.refreshPixelEditor(); });
    this.$all("[data-pixel-tool]").forEach(b => b.onclick = () => { this.pixelTool = b.dataset.pixelTool; this.$all("[data-pixel-tool]").forEach(x => x.classList.toggle("active", x === b)); });

    this.on('[data-action="open-blueprint"]', () => this.openBlueprint());
    this.on('[data-action="close-blueprint"]', () => this.closeBlueprint());
    this.on('[data-action="sync-code"]', () => this.syncBlueprintCode());
    this.on('[data-action="apply-settings"]', () => this.applySettings());

    this.$all("[data-tab]").forEach(btn => btn.onclick = () => {
      if (btn.dataset.tab === "blueprint") return this.openBlueprint();
      if (btn.dataset.tab === "pixel") return this.openPixelEditor();
      this.activeTab = btn.dataset.tab; this.refreshTabs();
    });
    this.on('[data-action="close-pixel"]', () => this.closePixelEditor());
    this.on('[data-action="pixel-zoom-in"]', () => { this.pixelZoom = Math.min(64, this.pixelZoom + 4); this.refreshPixelEditor(); });
    this.on('[data-action="pixel-zoom-out"]', () => { this.pixelZoom = Math.max(8, this.pixelZoom - 4); this.refreshPixelEditor(); });

    // Mobile drawer toggles.
    this.on('[data-action="toggle-left"]', () => this.root.classList.toggle("show-left"));
    this.on('[data-action="toggle-right"]', () => this.root.classList.toggle("show-right"));
    this.on('[data-action="show-shortcuts"]', () => this.showShortcutSheet());

    // Scene selection/manipulation. Wheel zooms around the viewport center;
    // pointer dragging moves the object directly in scene coordinates.
    const vp = this.$(".ge-viewport");
    vp.addEventListener("wheel", e => {
      e.preventDefault();
      this.sceneView.zoom = Math.max(.25, Math.min(4, this.sceneView.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    }, { passive: false });
    let dragged = null, dragOffset = { x: 0, y: 0 };
    const scenePoint = e => {
      const r = vp.getBoundingClientRect();
      return { x: (e.clientX-r.left-this.sceneView.panX)/this.sceneView.zoom, y: (e.clientY-r.top-this.sceneView.panY)/this.sceneView.zoom };
    };
    vp.addEventListener("pointerdown", e => {
      const p = scenePoint(e), objects = [...this.engine.scenes.activeScene.objects].reverse();
      dragged = objects.find(o => {
        const sr=o.components.find(c=>c.type==="SpriteRenderer"), w=(sr?.width||64)*(o.transform.scale.x||1), h=(sr?.height||64)*(o.transform.scale.y||1);
        return sr && Math.abs(p.x-o.transform.position.x)<=w/2 && Math.abs(p.y-o.transform.position.y)<=h/2;
      }) || null;
      if (dragged) { this.selectedObject=dragged; dragOffset={x:p.x-dragged.transform.position.x,y:p.y-dragged.transform.position.y}; vp.setPointerCapture(e.pointerId); this.refreshHierarchy(); this.refreshInspector(); }
    });
    vp.addEventListener("pointermove", e => {
      if (!dragged || !(e.buttons & 1)) return;
      const p=scenePoint(e), snap=this.engine.settings.get("editor.gridSnap"), size=this.engine.settings.get("editor.gridSize",16);
      let x=p.x-dragOffset.x, y=p.y-dragOffset.y;
      if (snap) { x=Math.round(x/size)*size; y=Math.round(y/size)*size; }
      dragged.transform.position.x=x; dragged.transform.position.y=y;
      this.refreshInspector();
    });
    const release=()=>dragged=null; vp.addEventListener("pointerup",release); vp.addEventListener("pointercancel",release);
  }

  bindShortcuts() {
    const s = this.shortcuts;
    s.register("ctrl+s", "Save project", () => this.$('[data-action="save"]').click());
    s.register("ctrl+z", "Undo", () => this.$('[data-action="undo"]').click());
    s.register("ctrl+y", "Redo", () => this.$('[data-action="redo"]').click());
    s.register("ctrl+shift+z", "Redo", () => this.$('[data-action="redo"]').click());
    s.register("ctrl+d", "Duplicate selected object", () => this.duplicateSelected());
    s.register("delete", "Delete selected object", () => this.deleteSelected());
    s.register("backspace", "Delete selected object", () => this.deleteSelected());
    s.register("w", "Move tool", () => this.setTool("move"));
    s.register("e", "Rotate tool", () => this.setTool("rotate"));
    s.register("r", "Scale tool", () => this.setTool("scale"));
    s.register(" ", "Play / pause", () => this.engine.isRunning && !this.engine.isPaused ? this.$('[data-action="pause"]').click() : this.$('[data-action="play"]').click());
    s.register("f", "Focus selected object", () => this.focusSelected());
    s.register("escape", "Close overlay / menu", () => { this.closeBlueprint(); this.contextMenu.close(); this.$(".ge-shortcut-sheet")?.classList.remove("open"); });
    s.register("?", "Show shortcuts", () => this.showShortcutSheet());
    s.register("shift+/", "Show shortcuts", () => this.showShortcutSheet());
  }

  /** Click-to-open dropdown menu bar (File/Edit/GameObject/Window/…), Unity/Unreal style. */
  bindMenuBar() {
    const menus = this.$all(".ge-menu");
    const closeAll = () => menus.forEach(m => m.classList.remove("open"));
    menus.forEach(menu => {
      const btn = menu.querySelector(".ge-menu-btn");
      btn.onclick = (e) => {
        e.stopPropagation();
        const wasOpen = menu.classList.contains("open");
        closeAll();
        if (!wasOpen) menu.classList.add("open");
      };
      // Once one menu is open, hovering a sibling menu switches to it —
      // the familiar desktop-app menu-bar behavior.
      menu.addEventListener("pointerenter", () => {
        if (menus.some(m => m.classList.contains("open")) && !menu.classList.contains("open")) {
          closeAll(); menu.classList.add("open");
        }
      });
      menu.querySelectorAll(".ge-menu-dropdown button").forEach(item => {
        item.addEventListener("click", () => closeAll());
      });
    });
    document.addEventListener("click", closeAll);
    window.addEventListener("blur", closeAll);
  }

  bindContextMenus() {
    // Hierarchy items get a context menu once rendered (delegated).
    this.contextMenu.bind(this.$(".ge-hierarchy-list"), (e) => {
      const item = e.target.closest?.(".ge-tree-item"); if (!item) return null;
      const obj = this.engine.scenes.activeScene.objects.find(o => o.id === item.dataset.id);
      if (!obj) return null;
      this.selectedObject = obj; this.refreshAll();
      return [
        { icon: "✏", label: "Rename", action: () => this.renameObject(obj) },
        { icon: "⧉", label: "Duplicate", shortcut: "Ctrl+D", action: () => this.duplicateSelected() },
        { icon: "◎", label: "Focus", shortcut: "F", action: () => this.focusSelected() },
        "-",
        { icon: "🗑", label: "Delete", shortcut: "Del", danger: true, action: () => this.deleteSelected() },
      ];
    });
    this.contextMenu.bind(this.$(".ge-viewport"), (e) => [
      { icon: "＋", label: "Add Sprite Object", action: () => this.addSprite() },
      { icon: "＋", label: "Add Cube Model", action: () => this.addModel() },
      "-",
      { icon: "◎", label: "Focus Selected", shortcut: "F", action: () => this.focusSelected() },
      { icon: "🖼", label: "Toggle Stats Overlay", action: () => { this.engine.settings.set("graphics.showStats", !this.engine.settings.get("graphics.showStats")); } },
    ]);
    this.contextMenu.bind(this.$(".ge-assets-list"), (e) => {
      const card = e.target.closest?.(".asset-card"); if (!card) return [{ icon: "＋", label: "New Sprite", action: () => this.createPixelArt() }];
      const asset = [...this.engine.assets.assets.values()].find(a => a.id === card.dataset.id);
      if (!asset) return null;
      this.selectedAsset = asset; this.refreshAll();
      return [
        { icon: "✏", label: "Rename", action: () => { const n = prompt("Asset name", asset.name); if (n) { asset.name = n; this.refreshAll(); } } },
        { icon: "🗑", label: "Delete", danger: true, action: () => { this.engine.assets.remove(asset.id); this.selectedAsset = null; this.refreshAll(); } },
      ];
    });
  }

  /* ---------------------------- object/asset actions --------------------------- */
  addSprite() {
    const asset = this.engine.assets.createPixelArt(`Sprite ${this.engine.assets.assets.size + 1}`, 16, 16);
    const sprite = new SpriteRenderer({ width: 64, height: 64, pixelAssetId: asset.id });
    const o = this.engine.instantiate(asset.name, [sprite]);
    o.transform.position.x = 320; o.transform.position.y = 200;
    this.engine.undo.push("Add Sprite", () => this.engine.scenes.activeScene.removeObject(o.id), () => this.engine.scenes.activeScene.objects.push(o));
    this.selectedObject = o; this.selectedAsset = asset; this.refreshAll();
  }
  addModel() {
    const m = this.engine.assets.createModel(`Cube Model ${this.engine.assets.assets.size + 1}`, MeshFactory.cube(1));
    const o = this.engine.instantiate(m.name, []); o.mode3D = true; o.primitive = "cube";
    o.transform.position.x = 360; o.transform.position.y = 230;
    this.selectedAsset = m; this.selectedObject = o; this.activeTab = "assets";
    this.refreshAll(); this.toast("Cube model added to the scene.");
  }
  duplicateSelected() {
    if (!this.selectedObject) return;
    const src = this.selectedObject; const clone2 = GameObject.fromJSON(src.toJSON());
    clone2.id = uid("obj"); clone2.name = `${src.name} Copy`; clone2.transform.position.x += 24; clone2.transform.position.y += 24;
    this.engine.scenes.activeScene.objects.push(clone2); this.selectedObject = clone2; this.refreshAll();
    safeCall(Devices, "vibrate", 15);
  }
  deleteSelected() {
    if (!this.selectedObject) return;
    const o = this.selectedObject; const scene = this.engine.scenes.activeScene;
    scene.removeObject(o.id);
    this.engine.undo.push("Delete Object", () => scene.objects.push(o), () => scene.removeObject(o.id));
    this.selectedObject = scene.objects[0] || null; this.refreshAll();
  }
  focusSelected() {
    if (!this.selectedObject) return;
    safeCall(Camera, "lookAt", this.selectedObject.transform.position.x, this.selectedObject.transform.position.y, this.selectedObject.transform.position.z || 0);
    this.toast(`Focused on ${this.selectedObject.name}.`);
  }
  renameObject(o) { const n = prompt("Object name", o.name); if (n) { o.name = n; this.refreshAll(); } }
  setTool(tool) { this.transformTool = tool; this.$all("[data-tool]").forEach(b => b.classList.toggle("active", b.dataset.tool === tool)); }

  switchMode(mode) { this.activeMode = mode; this.engine.contextMode = mode; this.root.classList.toggle("mode-3d", mode === GameEngine.RENDERER_3D); const l=this.$(".scene-mode-label"); if(l) l.textContent=mode===GameEngine.RENDERER_3D?"3D PERSPECTIVE EDITOR":"2D GRID EDITOR"; this.toast(`Switched to ${mode.toUpperCase()} view.`); }

  /**
   * Editor-wide mode — distinct from the 2D/3D/VR/AR *viewport* mode above.
   *  - "edit"    — default. Scene is stopped/reset, everything is editable.
   *  - "preview" — runs the scene + blueprints live, like Unity's Play Mode.
   *  - "publish" — jumps to Settings/Build so the project can be exported.
   */
  switchEditorMode(mode) {
    if (!["edit", "preview", "publish"].includes(mode)) return;
    this.editorMode = mode;
    this.root.dataset.editorMode = mode;
    this.$all("[data-mode]").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));

    if (mode === "edit") {
      this.engine.pause(true);
      this.root.classList.remove("is-playing");
    } else if (mode === "preview") {
      this.engine.start(); this.engine.pause(false);
      this.root.classList.add("is-playing");
    } else if (mode === "publish") {
      this.engine.pause(true);
      this.root.classList.remove("is-playing");
      this.activeTab = "settings"; this.refreshTabs();
    }
    this.toast(`${mode[0].toUpperCase()}${mode.slice(1)} Mode`);
  }
  resizeViewport() {
    const wrap = this.$(".ge-viewport"); if (wrap) this.engine.resize(wrap.clientWidth, wrap.clientHeight);
    const topbar = this.$(".ge-topbar"); if (topbar) this.root.style.setProperty("--topbar-h", `${topbar.offsetHeight}px`);
  }

  async importFile(file) { await this.engine.importProject(file); this.selectedObject = this.engine.scenes.activeScene.objects[0]; this.refreshAll(); this.toast("Project imported."); }

  /* ---------------------------- pixel art editor --------------------------- */
  createPixelArt() { this.addSprite(); this.activeTab = "pixel"; this.openPixelEditor(); }
  pixelAssetForObject(o = this.selectedObject, create = true) {
    const sr = o?.components.find(c => c.type === "SpriteRenderer"); if (!sr) return null;
    let a = sr.pixelAssetId ? this.engine.assets.assets.get(sr.pixelAssetId) : null;
    if (!a && create) { a = this.engine.assets.createPixelArt(`${o.name} Sprite`, 16, 16); sr.pixelAssetId = a.id; }
    return a instanceof PixelArtAsset ? a : null;
  }
  openPixelEditor() {
    const a = this.pixelAssetForObject();
    if (!a) return this.toast("Select a Sprite object in the Hierarchy first.");
    this.selectedAsset = a; this.$(".ge-pixel-overlay")?.classList.add("open"); this.refreshPixelEditor();
  }
  closePixelEditor() { this.$(".ge-pixel-overlay")?.classList.remove("open"); }
  exportPixelPNG() {
    if (!(this.selectedAsset instanceof PixelArtAsset)) return this.toast("Select a pixel-art asset first.");
    const a = el("a"); a.href = this.selectedAsset.toDataURL(16); a.download = `${this.selectedAsset.name}.png`; a.click();
  }
  paintPixel(a, x, y, beginStroke = false, cell = null) {
    if (beginStroke) a.snapshot();
    if (this.pixelTool === "pencil") a.setPixel(x, y, this.pixelColor);
    else if (this.pixelTool === "eraser") a.setPixel(x, y, 0);
    else if (this.pixelTool === "fill") { a.floodFill(x, y, this.pixelColor); delete a._sceneCanvas; return this.refreshPixelEditor(); }
    else if (this.pixelTool === "eyedropper") { this.pixelColor = a.pixels[y][x]; return this.refreshPixelEditor(); }
    delete a._sceneCanvas;
    if (cell) cell.style.background = a.palette[a.pixels[y][x]] || "transparent";
  }

  /* ---------------------------- blueprint overlay --------------------------- */
  openBlueprint() {
    this.$(".ge-blueprint-overlay").classList.add("open");
    this.renderPalette();
    this.resetBpView();
    this.bindBlueprintStage();
    this.refreshBlueprint();
  }
  closeBlueprint() { this.$(".ge-blueprint-overlay").classList.remove("open"); }

  /* ---------------------------- blueprint pan / zoom --------------------------- */
  resetBpView() { this.bpZoom = 1; this.bpPan = { x: 0, y: 0 }; this.applyBpTransform(); }
  applyBpTransform() {
    const vp = this.$(".bp-viewport"); if (!vp) return;
    vp.style.transform = `translate(${this.bpPan.x}px, ${this.bpPan.y}px) scale(${this.bpZoom})`;
    const label = this.$(".bp-zoom-level"); if (label) label.textContent = `${Math.round(this.bpZoom * 100)}%`;
  }
  /** Zooms around a screen-space point (defaults to the stage center) so the graph under the cursor stays put. */
  bpZoomBy(factor, screenX = null, screenY = null) {
    const stage = this.$(".bp-stage"); if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const cx = screenX ?? rect.width / 2, cy = screenY ?? rect.height / 2;
    const newZoom = Helpers.clamp(this.bpZoom * factor, 0.25, 2.5);
    const worldX = (cx - this.bpPan.x) / this.bpZoom, worldY = (cy - this.bpPan.y) / this.bpZoom;
    this.bpZoom = newZoom;
    this.bpPan.x = cx - worldX * this.bpZoom;
    this.bpPan.y = cy - worldY * this.bpZoom;
    this.applyBpTransform();
  }
  /** Converts a pointer event to blueprint "world" coordinates (pre-zoom/pan). */
  bpToWorld(e) {
    const rect = this.$(".bp-stage").getBoundingClientRect();
    return { x: (e.clientX - rect.left - this.bpPan.x) / this.bpZoom, y: (e.clientY - rect.top - this.bpPan.y) / this.bpZoom };
  }
  bindBlueprintStage() {
    const stage = this.$(".bp-stage"); if (!stage || stage._bpBound) return;
    stage._bpBound = true;
    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = stage.getBoundingClientRect();
      this.bpZoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    this.$('[data-action="bp-zoom-in"]').onclick = () => this.bpZoomBy(1.2);
    this.$('[data-action="bp-zoom-out"]').onclick = () => this.bpZoomBy(1 / 1.2);
    this.$('[data-action="bp-zoom-reset"]').onclick = () => this.resetBpView();

    // Dragging empty canvas space pans the view (nodes/ports stop propagation).
    let panning = false, sx = 0, sy = 0, ox = 0, oy = 0;
    stage.addEventListener("pointerdown", (e) => {
      if (e.target !== stage && !e.target.classList.contains("bp-viewport") && e.target.tagName !== "svg") return;
      panning = true; stage.setPointerCapture(e.pointerId);
      sx = e.clientX; sy = e.clientY; ox = this.bpPan.x; oy = this.bpPan.y;
    });
    stage.addEventListener("pointermove", (e) => {
      if (!panning) return;
      this.bpPan.x = ox + (e.clientX - sx); this.bpPan.y = oy + (e.clientY - sy);
      this.applyBpTransform();
    });
    stage.addEventListener("pointerup", () => panning = false);
  }
  renderPalette() {
    const wrap = this.$(".bp-palette-list"); wrap.innerHTML = "";
    for (const cat of NODE_CATEGORIES) {
      wrap.appendChild(el("div", "bp-cat-label", cat));
      LIBRARY_NODES.filter(n => n.category === cat).forEach(def => {
        const b = el("button", "bp-block", `<span>${def.icon}</span>${def.type.split(".").pop().replace("Event:", "")}`);
        b.onclick = () => this.addBlueprintNode(def.type);
        wrap.appendChild(b);
      });
    }
  }
  addBlueprintNode(type) {
    // Blocks are dropped unconnected — drag from a node's output dot to
    // another node's input dot to wire them together (see bindPortDrag).
    this.blueprintGraph.addNode(type, 200 + Math.random() * 480, 140 + Math.random() * 320);
    this.refreshBlueprint();
    safeCall(Devices, "vibrate", 10);
  }
  syncBlueprintCode() { const code = this.blueprintGraph.toJavaScript(); this.$(".ge-code-view").innerHTML = highlightJS(code); this.$(".ge-raw-code").value = code; }

  /* ---------------------------- render / refresh --------------------------- */
  refreshAll() { this.refreshHierarchy(); this.refreshInspector(); this.refreshAssets(); this.refreshPixelEditor(); this.refreshBlueprint(); this.refreshSettings(); this.refreshMultiplayer(); this.refreshTabs(); }

  refreshHierarchy() {
    const list = this.$(".ge-hierarchy-list"); list.innerHTML = "";
    this.engine.scenes.activeScene.objects.forEach(o => {
      const b = el("button", `ge-tree-item ${this.selectedObject?.id === o.id ? "active" : ""}`);
      b.dataset.id = o.id;
      b.innerHTML = `<span class="tree-icon">${o.name.includes("Camera") ? "◉" : "◆"}</span><span>${escapeHtml(o.name)}</span>`;
      b.onclick = () => { this.selectedObject = o; const sr=o.components.find(c=>c.type==="SpriteRenderer"); if(sr?.pixelAssetId) this.selectedAsset=this.engine.assets.assets.get(sr.pixelAssetId)||this.selectedAsset; this.refreshAll(); };
      list.appendChild(b);
    });
  }
  refreshInspector() {
    const p = this.$(".ge-inspector-content"); const o = this.selectedObject;
    if (!o) { p.innerHTML = '<p class="muted">Select an object to inspect it.</p>'; return; }
    p.innerHTML = `
      <div class="ins-section"><label class="field-label">Name<input class="ins-name" value="${escapeHtml(o.name)}"></label></div>
      <div class="ins-section"><h4>Transform</h4>${vectorInputs("pos", "Position", o.transform.position)}${vectorInputs("rot", "Rotation", o.transform.rotation)}${vectorInputs("scale", "Scale", o.transform.scale)}</div>
      <div class="ins-section"><h4>Components</h4>${o.components.map(c => `<div class="component-pill">${c.type || c.constructor.name}${c.type === "SpriteRenderer" ? '<button class="edit-sprite-btn">Open Sprite Editor</button>' : ''}</div>`).join("") || '<p class="muted">No components.</p>'}</div>`;
    p.querySelector(".edit-sprite-btn")?.addEventListener("click", () => this.openPixelEditor());
    p.querySelector(".ins-name").oninput = e => { o.name = e.target.value; this.refreshHierarchy(); };
    ["pos", "rot", "scale"].forEach(g => ["x", "y", "z"].forEach(a => {
      const input = p.querySelector(`[data-${g}="${a}"]`);
      input.oninput = e => { const t = g === "pos" ? o.transform.position : g === "rot" ? o.transform.rotation : o.transform.scale; t[a] = Number(e.target.value); };
    }));
  }
  refreshAssets() {
    const list = this.$(".ge-assets-list"); list.innerHTML = "";
    [...this.engine.assets.assets.values()].forEach(a => {
      const b = el("button", `asset-card ${this.selectedAsset?.id === a.id ? "active" : ""}`); b.dataset.id = a.id;
      b.innerHTML = `<strong>${escapeHtml(a.name)}</strong><span>${a.type}</span>`;
      b.onclick = () => { this.selectedAsset = a; this.activeTab = a.type === "pixel-art" ? "pixel" : "assets"; this.refreshAll(); };
      list.appendChild(b);
    });
    if (!list.children.length) list.innerHTML = '<div class="empty-state">No assets yet — create a sprite or a cube model to get started.</div>';
  }
  refreshPixelEditor() {
    const grid = this.$(".ge-pixel-overlay.open .ge-pixel-grid") || this.$(".ge-pixel-grid"); const pal = this.$(".ge-pixel-overlay.open .ge-palette") || this.$(".ge-palette");
    grid.innerHTML = ""; pal.innerHTML = "";
    const a = this.pixelAssetForObject(this.selectedObject, false) || (this.selectedAsset instanceof PixelArtAsset ? this.selectedAsset : null);
    if (!a) { grid.innerHTML = '<div class="empty-state">Create or select a pixel-art sprite.</div>'; return; }
    grid.style.setProperty("--pixel-size", `${this.pixelZoom}px`);
    grid.style.gridTemplateColumns = `repeat(${a.width}, var(--pixel-size))`;
    a.pixels.forEach((row, y) => row.forEach((ci, x) => {
      const c = el("button", "px"); c.style.background = a.palette[ci] || "transparent";
      c.onpointerdown = (e) => { e.preventDefault(); this.paintPixel(a, x, y, true, c); };
      c.onpointerenter = (e) => { if (e.buttons === 1) this.paintPixel(a, x, y, false, c); };
      grid.appendChild(c);
    }));
    a.palette.forEach((color, i) => {
      const sw = el("button", `swatch ${this.pixelColor === i ? "active" : ""}`); sw.style.background = color;
      sw.title = i === 0 ? "Transparent" : color;
      sw.onclick = () => { this.pixelColor = i; this.refreshPixelEditor(); };
      pal.appendChild(sw);
    });
    const native = this.$(".ge-pixel-overlay.open .pixel-native-color");
    if (native) native.oninput = e => {
      let i=a.palette.indexOf(e.target.value); if(i<0){a.palette.push(e.target.value);i=a.palette.length-1;}
      this.pixelColor=i; this.refreshPixelEditor();
    };
  }
  refreshBlueprint() {
    const area = this.$(".bp-canvas"); const svg = this.$(".bp-wires"); const stage = this.$(".bp-stage");
    if (!area || !svg) return;
    const hint = this.$(".bp-empty-hint");
    if (hint) hint.style.display = this.blueprintGraph.nodes.size ? "none" : "block";
    area.querySelectorAll(".bp-node").forEach(n => n.remove());
    svg.innerHTML = "";
    for (const c of this.blueprintGraph.connections) {
      const a = this.blueprintGraph.nodes.get(c.from), b = this.blueprintGraph.nodes.get(c.to);
      if (!a || !b) continue;
      svg.innerHTML += wirePath(a.x + 200, a.y + 26, b.x, b.y + 26, c.id);
    }
    // Wires are drawn with pointer-events on, so a click removes them —
    // that's how a connection gets "unplugged" once it exists.
    svg.querySelectorAll(".bp-wire").forEach(path => {
      path.onclick = (e) => { e.stopPropagation(); this.blueprintGraph.disconnect(path.dataset.wire); this.refreshBlueprint(); };
    });

    for (const n of this.blueprintGraph.nodes.values()) {
      const def = NODE_TYPES[n.type];
      const ports = this.blueprintGraph.portsOf(n.id);
      const node = el("div", `bp-node ${n.type.startsWith("Event") ? "event" : ""}`);
      node.style.left = `${n.x}px`; node.style.top = `${n.y}px`;
      node.innerHTML = `
        <div class="bp-title"><span>${def?.icon || "●"}</span>${n.type.replace("Event:", "On ").replace(".", " ")}</div>
        <div class="bp-body">${Object.keys(n.inputs || {}).map(k => `<label>${k}<input data-node="${n.id}" data-key="${k}" value="${escapeHtml(String(n.inputs[k]))}"></label>`).join("") || '<span class="muted">exec pulse</span>'}</div>
        ${ports.in ? `<i class="port in" data-node="${n.id}" data-port="in" title="Drag a wire here to plug it in"></i>` : ""}
        ${ports.out ? `<i class="port out" data-node="${n.id}" data-port="out" title="Drag from here to another block's input"></i>` : ""}`;
      node.querySelectorAll("input").forEach(inp => inp.oninput = e => { n.inputs[e.target.dataset.key] = isFinite(e.target.value) && e.target.value !== "" ? Number(e.target.value) : e.target.value; this.syncBlueprintCode(); });
      this.contextMenu.bind(node, () => [
        { icon: "⧉", label: "Duplicate Node", action: () => { const c2 = this.blueprintGraph.addNode(n.type, n.x + 30, n.y + 30, clone(n.inputs)); this.refreshBlueprint(); } },
        { icon: "🗑", label: "Delete Node", danger: true, action: () => { this.blueprintGraph.removeNode(n.id); this.refreshBlueprint(); } },
      ]);
      makeDraggable(node, pos => {
        n.x = pos.x; n.y = pos.y;
        for (const c of this.blueprintGraph.connections) {
          if (c.from !== n.id && c.to !== n.id) continue;
          const a=this.blueprintGraph.nodes.get(c.from), b=this.blueprintGraph.nodes.get(c.to), path=svg.querySelector(`[data-wire="${c.id}"]`);
          if(path && a && b) path.setAttribute("d", wirePathD(a.x+200,a.y+26,b.x,b.y+26));
        }
      }, () => this.bpZoom, () => this.syncBlueprintCode());
      const outPort = node.querySelector('.port.out');
      if (outPort) this.bindPortDrag(outPort, n.id);
      area.appendChild(node);
    }
    this.syncBlueprintCode();
  }
  /**
   * Click-and-drag connector: press on an output dot, drag a live wire
   * around, and release over an input dot to connect the two nodes. Nothing
   * auto-connects — every wire in the graph was explicitly dragged by hand.
   * Coordinates are converted through bpToWorld() so the ghost wire tracks
   * the cursor correctly at any zoom/pan level.
   */
  bindPortDrag(outPort, fromId) {
    outPort.onpointerdown = (e) => {
      e.stopPropagation();
      outPort.setPointerCapture(e.pointerId);
      const svg = this.$(".bp-wires");
      const start = this.bpToWorld(e);
      const ghost = document.createElementNS("http://www.w3.org/2000/svg", "path");
      ghost.setAttribute("class", "bp-wire bp-wire-ghost");
      svg.appendChild(ghost);
      let lastTarget = null;

      const draw = (x, y) => {
        const dx = Math.max(80, Math.abs(x - start.x) * 0.45);
        ghost.setAttribute("d", `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${x - dx} ${y}, ${x} ${y}`);
      };
      draw(start.x, start.y);

      const move = (ev) => {
        const w = this.bpToWorld(ev);
        draw(w.x, w.y);
        const el2 = document.elementFromPoint(ev.clientX, ev.clientY);
        const target = el2?.closest?.('.port.in');
        if (target !== lastTarget) { lastTarget?.classList.remove("port-target"); lastTarget = target; lastTarget?.classList.add("port-target"); }
      };
      const up = (ev) => {
        outPort.releasePointerCapture(e.pointerId);
        outPort.removeEventListener("pointermove", move);
        outPort.removeEventListener("pointerup", up);
        ghost.remove();
        lastTarget?.classList.remove("port-target");
        const dropEl = document.elementFromPoint(ev.clientX, ev.clientY);
        const target = dropEl?.closest?.('.port.in');
        if (target) {
          const wire = this.blueprintGraph.connect(fromId, target.dataset.node);
          if (!wire) this.toast("Those two blocks can't be wired together.");
        }
        this.refreshBlueprint();
      };
      outPort.addEventListener("pointermove", move);
      outPort.addEventListener("pointerup", up);
    };
  }
  refreshSettings() {
    this.$(".set-project-name").value = this.engine.settings.get("project.name");
    this.$(".set-clear-color").value = this.engine.settings.get("graphics.clearColor");
    this.$(".set-build-target").value = this.engine.settings.get("build.target");
    this.$(".set-grid-snap").checked = !!this.engine.settings.get("editor.gridSnap");
    this.$(".set-show-stats").checked = !!this.engine.settings.get("graphics.showStats");
    this.$(".ge-build-manifest").textContent = JSON.stringify({
      name: this.engine.settings.get("project.name"), version: this.engine.settings.get("project.version"),
      target: this.engine.settings.get("build.target"), files: ["index.html", "GameEngine.js", "camera.js", "canvas.js", "canvex.js", "…"],
      generatedAt: new Date().toISOString(),
    }, null, 2);
  }
  applySettings() {
    this.engine.settings.set("project.name", this.$(".set-project-name").value);
    this.engine.settings.set("graphics.clearColor", this.$(".set-clear-color").value);
    this.engine.settings.set("build.target", this.$(".set-build-target").value);
    this.engine.settings.set("editor.gridSnap", this.$(".set-grid-snap").checked);
    this.engine.settings.set("graphics.showStats", this.$(".set-show-stats").checked);
    this.refreshAll(); this.toast("Settings applied.");
  }
  /* ---------------------------- multiplayer --------------------------- */
  connectMultiplayer() {
    const role = this.$(".mp-role").value;
    const roomId = this.$(".mp-room-id").value.trim() || undefined;
    const maxPlayers = Number(this.$(".mp-max-players").value) || 8;
    const tickRate = Number(this.$(".mp-tick-rate").value) || 60;
    this.multiplayerRole = role;
    this.multiplayer?._stopTick?.();
    this.multiplayer = new Multiplayer({ roomId, maxPlayers, tickRate });
    this.multiplayer.on("playerJoined", () => this.refreshMultiplayer());
    this.multiplayer.on("playerLeft", () => this.refreshMultiplayer());
    this.multiplayer.on("scoreUpdated", () => this.refreshMultiplayer());
    this.multiplayer.addPlayer(role === "peer" ? uid("peer") : "host", { name: role === "peer" ? "You (Peer)" : "You (Host)" });
    this.$(".mp-room-id").value = this.multiplayer.roomId;
    this.refreshMultiplayer();
    this.toast(`Multiplayer room "${this.multiplayer.roomId}" started as ${role}.`);
  }
  disconnectMultiplayer() {
    if (!this.multiplayer) return;
    this.multiplayer._stopTick?.();
    this.multiplayer = null;
    this.refreshMultiplayer();
    this.toast("Disconnected from room.");
  }
  addTestPlayer() {
    if (!this.multiplayer) return this.toast("Start or connect a room first.");
    const n = this.multiplayer.playerCount + 1;
    this.multiplayer.addPlayer(uid("bot"), { name: `Bot ${n}` });
    this.refreshMultiplayer();
  }
  refreshMultiplayer() {
    const status = this.$(".mp-room-status"); const list = this.$(".mp-players");
    if (!status || !list) return;
    if (!this.multiplayer) {
      status.className = "mp-room-status empty-state";
      status.textContent = 'Not connected. Choose a role and press "Start / Connect Room".';
      list.innerHTML = "";
      return;
    }
    const m = this.multiplayer;
    status.className = "mp-room-status ins-section";
    status.innerHTML = `<strong>${escapeHtml(m.roomId)}</strong> — ${m.state} · ${m.playerCount}/${m.maxPlayers} players · host: ${escapeHtml(m.hostId || "—")}`;
    list.innerHTML = m.getLeaderboard().map(p => `
      <div class="component-pill mp-player-row">
        <span>${p.connected ? "🟢" : "⚪"} ${escapeHtml(p.name)}${m.isHost(p.id) ? " · Host" : ""}</span>
        <span class="mp-score">${p.score} pts</span>
        <button data-add-score="${p.id}" title="Add 10 points">+10</button>
      </div>`).join("") || '<div class="empty-state">No players yet — add a test player.</div>';
    list.querySelectorAll("[data-add-score]").forEach(b => b.onclick = () => { m.addScore(b.dataset.addScore, 10); });
  }

  refreshTabs() {
    this.$all("[data-tab]").forEach(b => b.classList.toggle("active", b.dataset.tab === this.activeTab));
    this.$all("[data-panel]").forEach(p => p.classList.toggle("active", p.dataset.panel === this.activeTab));
  }
  showShortcutSheet() {
    let sheet = this.$(".ge-shortcut-sheet");
    if (!sheet) {
      sheet = el("div", "ge-shortcut-sheet");
      sheet.innerHTML = `<div class="sheet-card"><h3>Shortcuts</h3><div class="sheet-list"></div><button data-action="close-sheet">Close</button></div>`;
      this.root.appendChild(sheet);
      sheet.querySelector('[data-action="close-sheet"]').onclick = () => sheet.classList.remove("open");
      sheet.onclick = e => { if (e.target === sheet) sheet.classList.remove("open"); };
    }
    sheet.querySelector(".sheet-list").innerHTML = this.shortcuts.bindings.map(b => `<div><kbd>${b.combo.replace("ctrl", "Ctrl").replace("+", " + ")}</kbd><span>${b.description}</span></div>`).join("");
    sheet.classList.add("open");
  }
  toast(msg) {
    const t = this.$(".ge-toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(this._toastTimer); this._toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }
}

/* ============================================================================
 *  DOM TEMPLATE, STYLES & SMALL DOM HELPERS
 * ========================================================================= */
function template() {
  return `
  <input class="ge-import-input" type="file" accept=".json" hidden>
  <div class="ge-toast"></div>

  <nav class="ge-menubar">
    <div class="ge-menu" data-menu="file">
      <button class="ge-menu-btn">File</button>
      <div class="ge-menu-dropdown">
        <button data-action="save">Save Project<small>Ctrl+S</small></button>
        <button data-action="load">Load Project</button>
        <button data-action="export">Export Project…</button>
        <button data-action="import-file">Import Project…</button>
      </div>
    </div>
    <div class="ge-menu" data-menu="edit">
      <button class="ge-menu-btn">Edit</button>
      <div class="ge-menu-dropdown">
        <button data-action="undo">Undo<small>Ctrl+Z</small></button>
        <button data-action="redo">Redo<small>Ctrl+Y</small></button>
        <div class="ge-menu-sep"></div>
        <button data-action="menu-duplicate">Duplicate Selected<small>Ctrl+D</small></button>
        <button data-action="menu-delete">Delete Selected<small>Del</small></button>
      </div>
    </div>
    <div class="ge-menu" data-menu="gameobject">
      <button class="ge-menu-btn">GameObject</button>
      <div class="ge-menu-dropdown">
        <button data-action="add-square">New Sprite Object</button>
        <button data-action="add-model">New Cube Model</button>
        <div class="ge-menu-sep"></div>
        <button data-action="menu-focus">Focus Selected<small>F</small></button>
      </div>
    </div>
    <div class="ge-menu" data-menu="window">
      <button class="ge-menu-btn">Window</button>
      <div class="ge-menu-dropdown">
        <button data-tab="assets">Assets</button>
        <button data-tab="pixel">Pixel Art</button>
        <button data-tab="blueprint">Blueprints</button>
        <button data-tab="network">Multiplayer</button>
        <button data-tab="settings">Settings</button>
      </div>
    </div>
    <div class="ge-menu" data-menu="multiplayer">
      <button class="ge-menu-btn">Multiplayer</button>
      <div class="ge-menu-dropdown">
        <button data-tab="network">Multiplayer Settings…</button>
        <button data-action="mp-connect">Start / Connect Room</button>
        <button data-action="mp-add-player">Add Test Player</button>
      </div>
    </div>
    <div class="ge-menu" data-menu="help">
      <button class="ge-menu-btn">Help</button>
      <div class="ge-menu-dropdown">
        <button data-action="show-shortcuts">Keyboard Shortcuts<small>?</small></button>
      </div>
    </div>
    <span class="toolbar-spacer"></span>
    <span class="ge-menubar-version">Forge v1.0.0</span>
  </nav>

  <header class="ge-topbar">
    <div class="ge-topbar-row primary">
      <button class="ge-hamburger" data-action="toggle-left" title="Hierarchy">☰</button>
      <div class="brand"><span class="brand-mark">◆</span><div><strong>Forge</strong><small>Professional Editor</small></div></div>

      <div class="seg seg-editor-mode">
        <button data-mode="edit" class="active" title="Edit Mode">✎<span>Edit</span></button>
        <button data-mode="preview" title="Preview Mode">▶<span>Preview</span></button>
        <button data-mode="publish" title="Publish Mode">⇪<span>Publish</span></button>
      </div>

      <div class="seg seg-transport">
        <button data-action="play" class="primary" title="Play">▶<span>Play</span></button>
        <button data-action="pause" title="Pause">Ⅱ<span>Pause</span></button>
        <button data-action="stop" title="Stop">■<span>Stop</span></button>
      </div>

      <span class="toolbar-spacer"></span>

      <div class="seg seg-mode">
        <button data-action="mode-2d" class="active" title="2D Mode">2D</button>
        <button data-action="mode-3d" title="3D Mode">3D</button>
        <button data-action="vr" title="Enter VR">VR</button>
        <button data-action="ar" title="Enter AR">AR</button>
      </div>

      <button class="ge-help" data-action="show-shortcuts" title="Keyboard shortcuts">?</button>
      <span class="ge-status"></span>
      <button class="ge-hamburger" data-action="toggle-right" title="Inspector">⚙</button>
    </div>

    <div class="ge-topbar-row secondary">
      <div class="seg-label">Tools</div>
      <div class="seg seg-tools">
        <button data-tool="move" data-action="tool-move" class="active" title="Move (W)">↔<span>Move</span></button>
        <button data-tool="rotate" data-action="tool-rotate" title="Rotate (E)">↻<span>Rotate</span></button>
        <button data-tool="scale" data-action="tool-scale" title="Scale (R)">⤢<span>Scale</span></button>
      </div>

      <div class="toolbar-divider"></div>
      <div class="seg-label">Create</div>
      <div class="seg">
        <button data-action="add-square" title="Add 2D sprite">+ 2D</button>
        <button data-action="add-model" title="Add 3D model">+ Model</button>
        <button data-action="open-blueprint" title="Open Blueprints">⌁ Blueprints</button>
      </div>

      <div class="toolbar-divider"></div>
      <div class="seg-label">History</div>
      <div class="seg">
        <button data-action="undo" title="Undo (Ctrl+Z)">↶</button>
        <button data-action="redo" title="Redo (Ctrl+Y)">↷</button>
      </div>

      <div class="toolbar-divider"></div>
      <div class="seg-label">Project</div>
      <div class="seg">
        <button data-action="save" title="Save project">Save</button>
        <button data-action="load" title="Load project">Load</button>
        <button data-action="export" title="Export project">Export</button>
        <button data-action="import-file" title="Import project">Import</button>
      </div>
    </div>
  </header>

  <main class="ge-shell">
    <aside class="panel left">
      <div class="panel-head"><h3>Hierarchy</h3><button data-action="add-square">+</button></div>
      <div class="ge-hierarchy-list tree"></div>
    </aside>

    <section class="workspace">
      <div class="viewport-title"><span>Scene View</span><span class="hint">Right-click / long-press for context actions · shortcuts: W/E/R, Ctrl+Z, Del</span></div>
      <div class="ge-viewport"><div class="scene-mode-label">2D GRID EDITOR</div><canvas class="ge-viewport-canvas"></canvas></div>
      <div class="dock-tabs">
        <button data-tab="assets" class="active">Assets</button>
        <button data-tab="pixel">Pixel Art</button>
        <button data-tab="blueprint">Blueprints ⤢</button>
        <button data-tab="network">Multiplayer</button>
        <button data-tab="settings">Settings</button>
      </div>
      <div class="dock">
        <div data-panel="assets" class="active">
          <div class="dock-actions"><button data-action="new-pixel">New Sprite</button><button data-action="add-model">New Cube Model</button></div>
          <div class="ge-assets-list asset-grid"></div>
        </div>
        <div data-panel="pixel">
          <div class="dock-actions">
            <button data-pixel-tool="pencil" class="active">✏ Pencil</button>
            <button data-pixel-tool="eraser">▭ Eraser</button>
            <button data-pixel-tool="fill">🪣 Fill</button>
            <button data-pixel-tool="eyedropper">💧 Pick</button>
            <button data-action="px-undo">Undo</button><button data-action="px-redo">Redo</button>
            <button data-action="new-pixel">New Sprite</button><button data-action="export-png">Export PNG</button>
          </div>
          <div class="ge-palette"></div>
          <div class="ge-pixel-grid"></div>
        </div>
        <div data-panel="network">
          <div class="settings-grid">
            <label>Role<select class="mp-role">
              <option value="local-host">Local Host (solo test)</option>
              <option value="host">Host</option>
              <option value="peer">Peer</option>
            </select></label>
            <label>Room ID<input class="mp-room-id" placeholder="auto-generated"></label>
            <label>Max Players<input class="mp-max-players" type="number" min="1" max="16" value="8"></label>
            <label>Tick Rate (Hz)<input class="mp-tick-rate" type="number" min="1" max="128" value="60"></label>
            <label class="check"><input type="checkbox" class="mp-enabled"> Enable multiplayer for this project</label>
          </div>
          <div class="dock-actions">
            <button data-action="mp-connect" class="primary">Start / Connect Room</button>
            <button data-action="mp-add-player">Add Test Player</button>
            <button data-action="mp-disconnect" class="danger">Disconnect</button>
          </div>
          <h4>Room</h4>
          <div class="mp-room-status empty-state">Not connected. Choose a role and press "Start / Connect Room".</div>
          <h4>Players</h4>
          <div class="mp-players"></div>
        </div>
        <div data-panel="settings">
          <div class="settings-grid">
            <label>Project Name<input class="set-project-name"></label>
            <label>Clear Color<input class="set-clear-color" type="color"></label>
            <label>Build Target<select class="set-build-target"><option>web</option><option>windows</option><option>macos</option><option>linux</option><option>ios</option><option>android</option><option>microsoft-store</option><option>apple-store</option><option>google-play</option></select></label>
            <label class="check"><input type="checkbox" class="set-grid-snap"> Snap to grid</label>
            <label class="check"><input type="checkbox" class="set-show-stats"> Show FPS / stats overlay</label>
          </div>
          <button data-action="apply-settings">Apply Settings</button>
          <pre class="ge-build-manifest"></pre>
        </div>
      </div>
    </section>

    <aside class="panel right">
      <div class="panel-head"><h3>Inspector</h3><span class="badge">Live</span></div>
      <div class="ge-inspector-content"></div>
    </aside>
  </main>

  <section class="ge-pixel-overlay" aria-label="Pixel editor">
    <header class="pixel-top"><div><strong>Sprite Editor</strong><small>Changes are saved live to the selected Scene sprite</small></div><div class="pixel-top-actions"><button data-action="px-undo">↶</button><button data-action="px-redo">↷</button><button data-action="export-png">Export PNG</button><button data-action="close-pixel">Close</button></div></header>
    <div class="pixel-workspace">
      <aside class="pixel-tools"><h4>Tools</h4><button data-pixel-tool="pencil" class="active">✎ Brush <kbd>B</kbd></button><button data-pixel-tool="eraser">Eraser <kbd>E</kbd></button><button data-pixel-tool="fill">Fill <kbd>G</kbd></button><button data-pixel-tool="eyedropper">Color Picker <kbd>I</kbd></button></aside>
      <main class="pixel-stage"><div class="pixel-canvas-frame"><div class="ge-pixel-grid"></div></div></main>
      <aside class="pixel-properties"><h3>Sprite Inspector</h3><div class="pixel-section"><h4>Palette</h4><div class="ge-palette"></div><input class="pixel-native-color" type="color" value="#38bdf8" title="Custom color"></div><div class="pixel-section"><h4>View</h4><div class="bp-zoom"><button data-action="pixel-zoom-out">−</button><span>Zoom</span><button data-action="pixel-zoom-in">+</button></div></div><div class="pixel-section"><h4>Editing</h4><p class="hint">Click or drag to paint. Transparent pixels use the checkerboard. Every change updates the Scene View immediately.</p></div></aside>
    </div>
  </section>

  <section class="ge-blueprint-overlay">
    <div class="bp-top">
      <div class="brand"><span class="brand-mark">⌁</span><div><strong>Blueprint Logic</strong><small>Full-page block coding workspace</small></div></div>
      <div class="bp-zoom">
        <button data-action="bp-zoom-out" title="Zoom out">−</button>
        <span class="bp-zoom-level">100%</span>
        <button data-action="bp-zoom-in" title="Zoom in">+</button>
        <button data-action="bp-zoom-reset" title="Reset view">Reset</button>
      </div>
      <div class="bp-toolbar"><button data-action="sync-code">Sync Code</button><button data-action="close-blueprint" class="danger">Close (Esc)</button></div>
    </div>
    <div class="bp-layout">
      <aside class="bp-palette"><h3>Blocks</h3><div class="bp-palette-list"></div><p class="muted">Drag a block's output dot onto another block's input dot to wire them. Scroll or pinch to zoom, drag empty space to pan.</p></aside>
      <div class="bp-stage">
        <div class="bp-viewport"><svg class="bp-wires"></svg><div class="bp-canvas"></div></div>
        <div class="empty-state bp-empty-hint">No blocks yet — drag one in from the palette on the left to get started.</div>
      </div>
      <aside class="bp-code"><h3>Code View</h3><pre class="ge-code-view"></pre><h4>Edit Raw</h4><textarea class="ge-raw-code" spellcheck="false" placeholder="Attach custom script code here…"></textarea></aside>
    </div>
  </section>`;
}

function vectorInputs(prefix, label, v) {
  return `<div class="vec"><div class="vec-title">${label}</div>${["x", "y", "z"].map(a => `<label>${a.toUpperCase()}<input type="number" step="1" value="${v[a]}" data-${prefix}="${a}"></label>`).join("")}</div>`;
}

function wirePathD(x1,y1,x2,y2){ const dx=Math.max(80,Math.abs(x2-x1)*.45); return `M ${x1} ${y1} C ${x1+dx} ${y1}, ${x2-dx} ${y2}, ${x2} ${y2}`; }
function wirePath(x1, y1, x2, y2, wireId = "") { return `<path class="bp-wire" data-wire="${wireId}" d="${wirePathD(x1,y1,x2,y2)}"/>`; }

function makeDraggable(node, onMove, getZoom = () => 1, onEnd = () => {}) {
  let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
  node.onpointerdown = e => { if (e.target.tagName === "INPUT" || e.target.closest?.(".port")) return; e.preventDefault(); e.stopPropagation(); dragging = true; node.classList.add("dragging"); node.setPointerCapture(e.pointerId); sx = e.clientX; sy = e.clientY; ox = parseFloat(node.style.left) || 0; oy = parseFloat(node.style.top) || 0; };
  node.onpointermove = e => { if (!dragging) return; const z = getZoom() || 1, x = ox + (e.clientX - sx) / z, y = oy + (e.clientY - sy) / z; node.style.left = x + "px"; node.style.top = y + "px"; onMove({ x, y }); };
  node.onpointerup = e => { if(!dragging)return; dragging = false; node.classList.remove("dragging"); try{node.releasePointerCapture(e.pointerId)}catch(_){} onEnd(); };
  node.onpointercancel = node.onpointerup;
}

/** Very small regex-based JS syntax highlighter for the read-only Code View. */
function highlightJS(code) {
  return escapeHtml(code)
    .replace(/(\/\/.*$)/gm, '<span class="tok-comment">$1</span>')
    .replace(/(&#039;[^&]*?&#039;|&quot;[^&]*?&quot;)/g, '<span class="tok-string">$1</span>')
    .replace(/\b(function|if|else|const|let|return|new)\b/g, '<span class="tok-keyword">$1</span>')
    .replace(/\b(Camera|Canvex|Lights|Interaction|Keyboard|Devices|IO|GUI|Curves|DateTime|object|scene)\b/g, '<span class="tok-type">$1</span>')
    .replace(/\b(\d+(\.\d+)?)\b/g, '<span class="tok-number">$1</span>');
}

function injectStyles() {
  if (document.getElementById("ge-pro-styles")) return;
  const s = document.createElement("style"); s.id = "ge-pro-styles";
  s.textContent = `
:root{--bg:#0b1020;--panel:#121827;--panel2:#171f31;--line:#263347;--line2:#334155;--text:#e5edf8;--muted:#8fa1bb;--accent:#f5a524;--blue:#3b82f6;--cyan:#22d3ee;--green:#22c55e;--red:#ef4444;--shadow:0 18px 50px #0008}
*{box-sizing:border-box}
html,body{margin:0;height:100%;overflow:hidden;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,Segoe UI,sans-serif}
.ge-app{position:relative;z-index:1;height:100vh;display:grid;grid-template-rows:auto 1fr;background:radial-gradient(circle at top,#f5a52418,transparent 42%),var(--bg)}
button,input,select,textarea{font:inherit}

.ge-menubar{display:flex;align-items:center;gap:2px;background:#080d18;border-bottom:1px solid var(--line);padding:0 8px;height:30px;font-size:12.5px;position:relative;z-index:30}
.ge-menu{position:relative}
.ge-menu-btn{background:none;border:none;box-shadow:none;border-radius:5px;padding:4px 10px;color:#c3d2e6;font-size:12.5px}
.ge-menu-btn:hover{background:#1c2942;border:none}
.ge-menu.open .ge-menu-btn{background:linear-gradient(135deg,#c2740f,var(--accent));color:#1a1205}
.ge-menu-dropdown{display:none;position:absolute;top:calc(100% + 4px);left:0;min-width:220px;background:#101827;border:1px solid var(--line2);border-radius:10px;box-shadow:var(--shadow);padding:6px;flex-direction:column;z-index:31}
.ge-menu.open .ge-menu-dropdown{display:flex}
.ge-menu-dropdown button{background:none;border:none;box-shadow:none;border-radius:7px;padding:8px 10px;text-align:left;display:flex;justify-content:space-between;align-items:center;gap:14px;color:var(--text);font-size:12.5px}
.ge-menu-dropdown button:hover{background:#1c2942;border:none}
.ge-menu-dropdown button small{color:var(--muted);font-size:11px}
.ge-menu-sep{height:1px;background:var(--line);margin:5px 2px}
.ge-menubar-version{color:var(--muted);font-size:11px;padding-right:4px}
.seg-editor-mode button.active{background:linear-gradient(135deg,#15803d,#22c55e);border-color:#86efac;color:#04240f}

.ge-topbar{display:flex;flex-direction:column;background:#0f172ae6;border-bottom:1px solid var(--line);backdrop-filter:blur(16px)}
.ge-topbar-row{display:flex;align-items:center;gap:10px;padding:9px 16px;overflow-x:auto}
.ge-topbar-row.primary{min-height:52px}
.ge-topbar-row.secondary{min-height:46px;padding-top:6px;padding-bottom:8px;background:#0b1324a6;border-top:1px solid #ffffff08}

.brand{display:flex;align-items:center;gap:10px;min-width:max-content;padding-right:6px}
.brand-mark{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:linear-gradient(135deg,var(--accent),#fbbf24);box-shadow:0 10px 30px #f5a52433;color:#1a1205;font-weight:900;font-size:14px}
.brand strong{display:block;font-weight:800;letter-spacing:.2px;font-size:14px;line-height:1.2}
.brand small{display:block;color:var(--muted);font-size:10.5px;line-height:1.2}

.toolbar-spacer{flex:1}
.toolbar-divider{width:1px;align-self:stretch;background:var(--line);margin:2px 2px;flex:none}
.seg-label{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);flex:none;padding:0 1px}

/* Segmented control: buttons grouped inside one pill-shaped container instead
   of loose buttons crammed edge-to-edge. */
.seg{display:flex;align-items:stretch;gap:2px;background:#0a1220;border:1px solid var(--line2);border-radius:10px;padding:3px;flex:none}
.seg button{border:none;box-shadow:none;background:transparent;border-radius:7px;padding:6px 10px;display:flex;align-items:center;gap:6px;font-size:12.5px}
.seg button span{display:inline}
.seg button:hover{background:#1c2942;border:none}
.seg button.active,.seg button.primary{background:linear-gradient(135deg,#c2740f,var(--accent));color:#1a1205}
.seg-transport button{min-width:34px;justify-content:center}
.seg-mode button{min-width:34px;justify-content:center;padding:6px 9px}

button{border:1px solid var(--line2);border-radius:10px;background:linear-gradient(#233148,#172033);color:var(--text);padding:7px 11px;cursor:pointer;box-shadow:inset 0 1px 0 #ffffff12;white-space:nowrap;font-size:12.5px}
button:hover{border-color:var(--accent);background:#2b2416}
button.primary,button.active,[data-tool].active,[data-tab].active,[data-pixel-tool].active{background:linear-gradient(135deg,#c2740f,var(--accent));border-color:#fbbf24;color:#1a1205}
button.danger{background:#3a1620;border-color:#7f1d1d}
.ge-help{margin-left:2px;width:28px;height:28px;border-radius:50%;padding:0;flex:none;display:grid;place-items:center;font-size:12px}
.ge-status{margin-left:8px;color:#bcd0ea;font-size:12px;white-space:nowrap}
.ge-hamburger{display:none}
.ge-shell{display:grid;grid-template-columns:minmax(220px,280px) minmax(0,1fr) minmax(300px,360px);width:100%;max-width:100vw;min-height:0;min-width:0;overflow:hidden}
.panel{background:linear-gradient(180deg,var(--panel),#0f1523);border-right:1px solid var(--line);min-height:0;overflow:auto;transition:transform .2s}
.panel.right{border-right:0;border-left:1px solid var(--line)}
.panel-head{height:54px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid var(--line)}
h3{margin:0;font-size:15px} h4{margin:10px 0 6px;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.badge{font-size:11px;color:#bbf7d0;background:#14532d;padding:4px 8px;border-radius:999px}
.tree{padding:10px}
.ge-tree-item{width:100%;display:flex;align-items:center;gap:10px;margin:6px 0;text-align:left;background:#151f31;border-color:#2b3a52}
.ge-tree-item.active{background:linear-gradient(135deg,#c2740f,var(--accent));border-color:#fbbf24;color:#1a1205}
.tree-icon{opacity:.85}
.workspace{display:grid;grid-template-rows:36px minmax(220px,1fr) 42px minmax(150px,250px);min-width:0;min-height:0;overflow:hidden}
.viewport-title{display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:#111827;border-bottom:1px solid var(--line);font-size:12px}
.hint{color:var(--muted)}
.ge-viewport{position:relative;overflow:hidden;min-height:0;background:#0a0f1d;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:32px 32px;touch-action:none}
.ge-app[data-editor-mode="preview"] .ge-viewport::before{content:"● PREVIEW";position:absolute;top:10px;left:10px;z-index:5;background:#15803dcc;color:#dcfce7;font-size:11px;font-weight:800;letter-spacing:.04em;padding:5px 10px;border-radius:999px;pointer-events:none}
.ge-app[data-editor-mode="publish"] .ge-viewport::before{content:"⇪ PUBLISH";position:absolute;top:10px;left:10px;z-index:5;background:#7c3aedcc;color:#ede9fe;font-size:11px;font-weight:800;letter-spacing:.04em;padding:5px 10px;border-radius:999px;pointer-events:none}
.ge-viewport-canvas{display:block;width:100%;height:100%;cursor:crosshair}.scene-mode-label{position:absolute;right:12px;top:10px;z-index:3;padding:5px 9px;border:1px solid #334155;border-radius:7px;background:#08101dcc;color:#9fb3cc;font:700 10px monospace;pointer-events:none}.mode-3d .ge-viewport{background:radial-gradient(circle at 50% 42%,#17243a,#070b13 72%)}
.dock-tabs{display:flex;align-items:center;gap:8px;padding:5px 12px;background:#111827;border-top:1px solid var(--line);border-bottom:1px solid var(--line);overflow-x:auto}
.dock{overflow:auto;background:#0d1422;padding:14px}
.dock>[data-panel]{display:none} .dock>[data-panel].active{display:block}
.dock-actions{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.asset-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
.asset-card{min-height:68px;text-align:left;display:flex;flex-direction:column;justify-content:center;gap:4px}
.asset-card span{color:var(--muted);font-size:12px}
.empty-state{border:1px dashed #3b4b66;border-radius:14px;padding:22px;color:var(--muted);background:#111827}
.ge-inspector-content{padding:14px}
.ins-section{background:#111827;border:1px solid var(--line);border-radius:16px;padding:14px;margin-bottom:12px;box-shadow:0 10px 30px #0002}
.field-label{display:grid;gap:8px;color:#cbd5e1}
.ge-inspector-content input,.settings-grid input,.settings-grid select{width:100%;background:#090f1d;color:var(--text);border:1px solid #334155;border-radius:10px;padding:9px 10px}
.vec{margin:10px 0} .vec-title{font-weight:700;margin-bottom:8px}
.vec label{display:inline-grid;gap:5px;width:31.5%;margin-right:1.5%;color:#aebed4;font-size:12px}
.component-pill{padding:10px 12px;border-radius:12px;background:#19243a;border:1px solid #34445f;margin-top:8px}
.ge-palette{display:flex;gap:8px;margin:10px 0;flex-wrap:wrap}
.swatch{width:32px;height:32px;border-radius:10px;padding:0}
.swatch.active{outline:2px solid white}
.ge-pixel-grid{display:grid;gap:2px;touch-action:none}
.px{width:var(--pixel-size,20px);height:var(--pixel-size,20px);padding:0;border-radius:2px;background-image:linear-gradient(45deg,#1f2937 25%,transparent 25%),linear-gradient(-45deg,#1f2937 25%,transparent 25%);image-rendering:pixelated}
.mp-player-row{display:flex;align-items:center;justify-content:space-between;gap:10px}
.mp-score{color:var(--muted);font-size:11.5px}
.mp-player-row button{padding:4px 9px;font-size:11.5px}
.settings-grid{display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:12px;margin-bottom:12px}
.settings-grid .check{display:flex;align-items:center;gap:8px;flex-direction:row}
.ge-build-manifest{background:#090f1d;border:1px solid var(--line);border-radius:14px;padding:12px;color:#bcd0ea;overflow:auto;margin-top:12px}
.ge-toast{position:fixed;right:20px;bottom:20px;z-index:100;background:linear-gradient(135deg,#c2740f,var(--accent));color:#1a1205;font-weight:600;padding:12px 16px;border-radius:14px;box-shadow:var(--shadow);opacity:0;transform:translateY(10px);transition:.2s;pointer-events:none}
.ge-toast.show{opacity:1;transform:none}
.ge-blueprint-overlay{position:fixed;inset:0;z-index:50;display:none;background:#070b14;color:var(--text)}
.ge-blueprint-overlay.open{display:grid;grid-template-rows:64px 1fr}
.bp-top{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#0f172a;border-bottom:1px solid var(--line);box-shadow:0 10px 40px #0006;gap:16px}
.bp-toolbar{display:flex;gap:8px}
.bp-zoom{display:flex;align-items:center;gap:8px;background:#0a1220;border:1px solid var(--line2);border-radius:10px;padding:4px 6px}
.bp-zoom button{padding:5px 10px;font-size:13px;min-width:30px}
.bp-zoom-level{font-size:12px;color:var(--muted);min-width:42px;text-align:center}
.bp-layout{display:grid;grid-template-columns:230px 1fr 360px;min-height:0}
.bp-palette,.bp-code{background:#0f172a;border-right:1px solid var(--line);padding:16px;overflow:auto}
.bp-code{border-right:0;border-left:1px solid var(--line)}
.bp-cat-label{margin:14px 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.bp-block{width:100%;margin:4px 0;text-align:left;display:flex;gap:8px;align-items:center;cursor:grab}
.bp-stage{position:relative;overflow:hidden;background:#07101c;background-image:radial-gradient(circle at 1px 1px,#f5a52422 1px,transparent 0);background-size:24px 24px;touch-action:none}
.bp-viewport{position:absolute;inset:0;transform-origin:0 0}
.bp-canvas{position:absolute;inset:0}
.bp-wires{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.bp-empty-hint{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none;max-width:320px;text-align:center}
.bp-wire{fill:none;stroke:var(--accent);stroke-width:3;filter:drop-shadow(0 0 6px #f5a52488);pointer-events:stroke;cursor:pointer}
.bp-wire:hover{stroke:#fca5a5;filter:drop-shadow(0 0 6px #ef444488)}
.bp-wire-ghost{stroke:#94a3b8;stroke-dasharray:6 6;pointer-events:none}
.bp-node{position:absolute;width:200px;background:linear-gradient(180deg,#1f2a44,#121a2c);border:1px solid #3b82f6;border-radius:16px;box-shadow:0 18px 40px #0008;cursor:grab;overflow:visible}
.bp-node.event{border-color:var(--accent)}
.bp-title{display:flex;gap:8px;align-items:center;padding:11px 12px;background:#23375d;font-weight:800;font-size:13px;border-radius:16px 16px 0 0}
.bp-node.event .bp-title{background:#5a3d10}
.bp-body{padding:10px 12px;color:#cbd5e1;font-size:12px;display:grid;gap:6px}
.bp-body label{display:grid;gap:4px}
.bp-body input{background:#060b14;color:var(--text);border:1px solid #334155;border-radius:8px;padding:5px 7px;font-size:12px}
.port{position:absolute;top:20px;width:16px;height:16px;border-radius:50%;background:var(--accent);border:2px solid #fde68a;cursor:crosshair;touch-action:none;transition:transform .1s,box-shadow .1s;z-index:2}
.port.in{left:-8px} .port.out{right:-8px}
.port:hover{transform:scale(1.25)}
.port.port-target{transform:scale(1.4);box-shadow:0 0 0 5px #22c55e55;background:#22c55e;border-color:#bbf7d0}
.ge-code-view{background:#060b14;color:#dbeafe;border:1px solid var(--line);border-radius:14px;padding:12px;font-family:Cascadia Code,Consolas,monospace;font-size:11.5px;white-space:pre-wrap;max-height:38vh;overflow:auto}
.ge-raw-code{width:100%;min-height:160px;resize:vertical;background:#060b14;color:#dbeafe;border:1px solid var(--line);border-radius:14px;padding:12px;font-family:Cascadia Code,Consolas,monospace;font-size:12px}
.tok-comment{color:#64748b} .tok-string{color:#a5d6ff} .tok-keyword{color:#f5a524} .tok-type{color:#7dd3fc} .tok-number{color:#f472b6}
.ge-context-menu{position:fixed;z-index:200;min-width:200px;background:#101827;border:1px solid var(--line2);border-radius:12px;box-shadow:var(--shadow);padding:6px;display:none;flex-direction:column}
.ge-context-menu.open{display:flex}
.ge-context-item{display:flex;align-items:center;gap:10px;background:none;border:none;box-shadow:none;text-align:left;border-radius:8px;padding:8px 10px}
.ge-context-item:hover{background:#1c2b45}
.ge-context-item.danger{color:#fca5a5}
.ge-context-item small{margin-left:auto;color:var(--muted)}
.ge-context-sep{height:1px;background:var(--line);margin:4px 2px}
.ge-shortcut-sheet{position:fixed;inset:0;z-index:220;display:none;align-items:center;justify-content:center;background:#000a}
.ge-shortcut-sheet.open{display:flex}
.sheet-card{background:#111827;border:1px solid var(--line2);border-radius:16px;padding:20px;width:min(420px,90vw);max-height:80vh;overflow:auto}
.sheet-list div{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--line)}
.sheet-list kbd{background:#1e293b;border:1px solid #334155;border-radius:6px;padding:2px 8px;font-size:11px}

.ge-pixel-overlay{position:fixed;inset:0;z-index:55;display:none;background:#070b14}.ge-pixel-overlay.open{display:grid;grid-template-rows:64px 1fr}.pixel-top{display:flex;align-items:center;justify-content:space-between;padding:10px 18px;background:#0f172a;border-bottom:1px solid var(--line)}.pixel-top small{display:block;color:var(--muted);margin-top:4px}.pixel-workspace{display:grid;grid-template-columns:170px minmax(0,1fr) 260px;min-height:0}.pixel-tools,.pixel-properties{padding:16px;background:#0f172a;overflow:auto}.pixel-tools{display:flex;flex-direction:column;gap:8px;border-right:1px solid var(--line)}.pixel-properties{border-left:1px solid var(--line)}.pixel-stage{overflow:auto;display:grid;place-items:center;padding:40px;background-color:#080d18;background-image:linear-gradient(45deg,#0c1422 25%,transparent 25%),linear-gradient(-45deg,#0c1422 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#0c1422 75%),linear-gradient(-45deg,transparent 75%,#0c1422 75%);background-size:24px 24px;background-position:0 0,0 12px,12px -12px,-12px 0}.pixel-stage .ge-pixel-grid{box-shadow:0 20px 60px #000b;gap:1px}.panel.right{min-width:0}.panel.right,.workspace,.ge-viewport{max-width:100%}


/* Unity-inspired neutral editor skin */
:root{--bg:#1e1e1e;--panel:#2b2b2b;--panel2:#333;--line:#151515;--line2:#4a4a4a;--text:#d7d7d7;--muted:#9a9a9a;--accent:#3f7fbf;--blue:#3f7fbf;--shadow:0 10px 28px #0008}
.ge-app{background:#1e1e1e}.ge-menubar{height:24px;background:#252526;border-color:#111}.ge-topbar{background:#303030;border-color:#111;backdrop-filter:none}.ge-topbar-row.primary{min-height:42px}.ge-topbar-row.secondary{min-height:34px;background:#292929;border-color:#181818}.brand-mark{background:#555;color:#eee;box-shadow:none}.seg,.bp-zoom{background:#242424;border-color:#151515;border-radius:3px}.seg button,.ge-menu-btn,button{border-radius:3px;background:#3a3a3a;border-color:#555;box-shadow:none;color:#ddd}.seg button.active,.seg button.primary,button.primary,button.active,[data-tool].active,[data-tab].active,[data-pixel-tool].active{background:#3f7fbf;border-color:#5c9bd5;color:white}.panel,.panel.right{background:#2b2b2b;border-color:#111}.panel-head{height:32px;background:#303030;border-color:#171717;padding:0 9px}.panel-head h3,.viewport-title{font-size:12px;font-weight:500}.badge{display:none}.tree{padding:4px}.ge-tree-item{margin:1px 0;padding:4px 7px;border:0;background:transparent;border-radius:0}.ge-tree-item.active{background:#3f7fbf;color:#fff;border:0}.workspace{grid-template-rows:28px minmax(220px,1fr) 30px minmax(120px,220px)}.viewport-title,.dock-tabs{background:#2d2d2d;border-color:#111}.dock-tabs{padding:0 4px;gap:1px}.dock-tabs button{border:0;border-radius:0;background:#292929;padding:6px 12px}.dock-tabs button.active{background:#3b3b3b;border-top:2px solid #3f7fbf;color:#fff}.dock{background:#252525;padding:8px}.ins-section{border-radius:2px;background:#303030;border-color:#1a1a1a;box-shadow:none;padding:10px}.ge-inspector-content{padding:8px}.ge-inspector-content input,.settings-grid input,.settings-grid select{border-radius:2px;background:#1f1f1f;border-color:#4a4a4a;padding:5px}.ge-viewport{background-color:#202020;background-image:linear-gradient(#ffffff0a 1px,transparent 1px),linear-gradient(90deg,#ffffff0a 1px,transparent 1px)}
.ge-pixel-overlay{background:#1e1e1e}.pixel-top{height:42px;padding:5px 10px;background:#303030;border-color:#111}.pixel-top small{display:inline;margin-left:10px}.pixel-top-actions{display:flex;gap:4px}.pixel-workspace{grid-template-columns:190px minmax(0,1fr) 280px}.pixel-tools,.pixel-properties{background:#2b2b2b;border-color:#111;padding:10px}.pixel-tools button{display:flex;justify-content:space-between;text-align:left}.pixel-tools kbd{font-size:10px;color:#aaa}.pixel-properties h3{font-size:12px;padding-bottom:8px;border-bottom:1px solid #171717}.pixel-section{padding:8px 0;border-bottom:1px solid #1b1b1b}.pixel-stage{background-color:#181818;background-size:20px 20px;padding:48px}.pixel-canvas-frame{padding:12px;background:#111;border:1px solid #555;box-shadow:0 12px 35px #000}.pixel-stage .ge-pixel-grid{box-shadow:none}.swatch{border-radius:2px;width:28px;height:28px}.bp-node{border-radius:4px;background:#2c2c2c;border-color:#555;box-shadow:0 5px 14px #0008}.bp-node.dragging{opacity:.92;cursor:grabbing;z-index:100;box-shadow:0 12px 28px #000}.bp-title{border-radius:3px 3px 0 0;background:#3f5f7f;padding:7px 10px}.bp-node.event .bp-title{background:#6b5a32}.bp-stage{background-color:#1b1b1b;background-image:radial-gradient(circle at 1px 1px,#ffffff1a 1px,transparent 0)}.bp-palette,.bp-code,.bp-top{background:#2b2b2b;border-color:#111}

.component-pill{display:flex;align-items:center;justify-content:space-between}.edit-sprite-btn{padding:3px 7px;font-size:11px}.pixel-native-color{width:100%;height:30px;margin-top:8px;background:#222;border:1px solid #555}.px{user-select:none;-webkit-user-drag:none}
@media (max-width:1000px){
  .ge-hamburger{display:block}
  .ge-shell{grid-template-columns:1fr}
  .panel{position:fixed;top:var(--topbar-h,98px);bottom:0;width:82vw;max-width:320px;z-index:40;transform:translateX(-105%);box-shadow:var(--shadow)}
  .panel.right{left:auto;right:0;transform:translateX(105%)}
  .ge-app.show-left .panel.left{transform:none}
  .ge-app.show-right .panel.right{transform:none}
  .workspace{grid-template-rows:36px 1fr 42px 300px}
  .bp-layout{grid-template-columns:1fr}
  .bp-palette,.bp-code{display:none}
  .seg-label,.toolbar-divider{display:none}
  .seg button span{display:none}
  .brand small{display:none}
  button{padding:9px 12px}
}`;
  document.head.appendChild(s);
}

function el(tag, cls = "", html = "") { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }
function uid(p = "id") { return `${p}_${Math.random().toString(36).slice(2, 9)}`; }
function vec3(x = 0, y = 0, z = 0) { return { x, y, z }; }
function getPath(o, p, f) { return String(p).split(".").reduce((a, k) => a?.[k], o) ?? f; }
function setPath(o, p, v) { const a = String(p).split("."), l = a.pop(), t = a.reduce((x, k) => (x[k] ??= {}), o); t[l] = v; }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function deepMerge(a, b) { const o = clone(a); for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge(o[k] || {}, v) : v; return o; }
function downloadText(name, text, type = "text/plain") { const b = new Blob([text], { type }), u = URL.createObjectURL(b), a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 0); }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function safeFile(s) { return String(s || "project").replace(/[^a-z0-9-_]+/gi, "-"); }