import { Color } from "../libs/color.js";
import { Helpers } from "../libs/helpers.js";
import { Keyboard, pointer, Window, controller, sensor } from "../libs/events.js";

export class PixelArt {

    // ── Grid state ──────────────────────────────────────────────────────────
    #cols   = 16;
    #rows   = 16;
    #pixels = [];          // flat Array<string|null>  (CSS color or null = transparent)

    // ── History (undo / redo) ───────────────────────────────────────────────
    #history      = [];    // Array of snapshot strings
    #historyIndex = -1;
    #maxHistory   = 60;

    // ── Tool state ──────────────────────────────────────────────────────────
    #tool           = "pen";       // pen | eraser | fill | eyedropper | line | rect | ellipse | move | select
    #primaryColor   = "#000000";
    #secondaryColor = "#ffffff";
    #brushSize      = 1;           // cells
    #opacity        = 1;           // 0–1

    // ── Layers ──────────────────────────────────────────────────────────────
    #layers = [];   // Array<{ id, name, pixels, visible, opacity, locked }>
    #activeLayerIndex = 0;

    // ── Canvas / rendering ──────────────────────────────────────────────────
    #canvasEl          = null;
    #ctx               = null;
    #cellSize          = 24;     // logical CSS px per cell (always an integer)
    #dpr               = 1;      // devicePixelRatio snapshot taken at init
    #showGrid          = true;
    #showCheckerboard  = true;

    // ── View transform ──────────────────────────────────────────────────────
    #viewX     = 0;       // logical CSS px offset
    #viewY     = 0;
    #viewScale = 1;
    #isPanning = false;
    #panStart  = { x: 0, y: 0, vx: 0, vy: 0 };

    // ── Selection ───────────────────────────────────────────────────────────
    #selection     = null;  // { x1, y1, x2, y2 } in cell coords, or null
    #selectionData = null;  // captured pixel data during move

    // ── Drawing state (mouse drag) ──────────────────────────────────────────
    #isDrawing       = false;
    #drawStartCell   = null;
    #lastDrawnCell   = null;
    #previewPixels   = null;   // Map<key, color> for shape previews

    // ── Palette ─────────────────────────────────────────────────────────────
    #palette = [
        "#000000","#ffffff","#ff0000","#00ff00","#0000ff","#ffff00",
        "#ff00ff","#00ffff","#ff8800","#8800ff","#00ff88","#ff0088",
        "#884400","#004488","#448800","#888888","#444444","#cccccc",
        "#ffcccc","#ccffcc","#ccccff","#ffffcc","#ffccff","#ccffff",
        "#ff6666","#66ff66","#6666ff","#ffff66","#ff66ff","#66ffff",
        "#993300","#003399","#116611","#661166","#116666","#662211",
        "#eeaa55","#55aaee","#aa55ee","#55eeaa",
    ];

    // ── UI references ────────────────────────────────────────────────────────
    #container    = null;
    #uiRoot       = null;
    #statusText   = null;   // DOM TextNode in the status bar
    #statusCell   = null;   // DOM TextNode for cell coords
    #statusSize   = null;   // DOM TextNode for grid size
    #layerListEl  = null;
    #paletteEl    = null;
    #framesStripEl= null;   // frame thumbnail row
    #frameIndEl   = null;   // "Frame N / M" label
    #gridBtnEl    = null;   // reference kept to toggle active style
    #playBtnEl    = null;

    // ── Symmetry ─────────────────────────────────────────────────────────────
    #symmetry = "none";  // none | horizontal | vertical | both

    // ── Animation ────────────────────────────────────────────────────────────
    #frames        = [];   // Array<Array<Layer>>  (each frame is a layers snapshot)
    #activeFrame   = 0;
    #isPlaying     = false;
    #fps           = 6;
    #playInterval  = null;

    // ── Theme ────────────────────────────────────────────────────────────────
    #theme = "dark";   // "dark" | "light"

    // ── Drag-reorder state (frames) ──────────────────────────────────────────
    #frameDragIndex = null;   // index of the frame being dragged

    // ── Selection clipboard ──────────────────────────────────────────────────
    #clipboard = null;   // { width, height, pixels: Array<string|null> }

    // ── Gradient ─────────────────────────────────────────────────────────────
    #gradientMode = "linear";   // "linear" | "radial"

    // ── Touch ────────────────────────────────────────────────────────────────
    #touchLast      = null;
    #touchPinchDist = null;

    // ═════════════════════════════════════════════════════════════════════════
    //  Constructor
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * @param {string|HTMLElement} container  CSS selector or element
     * @param {object} [options]
     * @param {number} [options.cols=16]
     * @param {number} [options.rows=16]
     * @param {number} [options.cellSize=24]
     * @param {boolean} [options.showGrid=true]
     */
    constructor(container, options = {}) {
        this.#container = typeof container === "string"
            ? document.querySelector(container)
            : container;

        if (!this.#container) throw new Error("PixelArt: container not found");

        this.#cols     = options.cols      ?? 16;
        this.#rows     = options.rows      ?? 16;
        this.#cellSize = options.cellSize  ?? 24;
        this.#showGrid = options.showGrid  ?? true;
        this.#dpr      = window.devicePixelRatio || 1;

        this.#injectStyles();
        this.#initLayers();
        this.#initFrames();
        this.#buildUI();
        this.#initCanvas();
        this.#bindEvents();
        this.#saveHistory();
        this.render();
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  Public API  (all original signatures preserved)
    // ═════════════════════════════════════════════════════════════════════════

    /** Switch the active tool */
    setTool(name) {
        const valid = ["pen","eraser","fill","eyedropper","line","rect","ellipse","move","select","gradient"];
        if (!valid.includes(name)) return;
        // Clear selection when leaving select tool
        if (this.#tool === "select" && name !== "select") {
            this.#selection = null;
            this._canvasWrap?.querySelectorAll(".__pa_selbadge").forEach(b => b.remove());
        }
        this.#tool = name;
        this.#updateToolButtons();
        this.#setStatus(`Tool: ${name}`);
        if (name !== "select") this.render();
    }

    /** Set primary drawing color */
    setColor(hex, secondary = false) {
        if (secondary) {
            this.#secondaryColor = hex;
        } else {
            this.#primaryColor = hex;
        }
        this.#updateColorSwatches();
    }

    /** Set brush size in cells (1–8) */
    setBrushSize(size) {
        this.#brushSize = Helpers.clamp(Math.round(size), 1, 8);
        this.#setStatus(`Brush size: ${this.#brushSize}`);
    }

    /** Set opacity (0–1) */
    setOpacity(value) {
        this.#opacity = Helpers.clamp(value, 0, 1);
    }

    /** Undo last action */
    undo() {
        if (this.#historyIndex <= 0) return;
        this.#historyIndex--;
        this.#loadSnapshot(this.#history[this.#historyIndex]);
        this.render();
        this.#setStatus("Undo");
    }

    /** Redo undone action */
    redo() {
        if (this.#historyIndex >= this.#history.length - 1) return;
        this.#historyIndex++;
        this.#loadSnapshot(this.#history[this.#historyIndex]);
        this.render();
        this.#setStatus("Redo");
    }

    /** Clear the active layer */
    clear() {
        this.#activeLayer().pixels.fill(null);
        this.#saveHistory();
        this.render();
        this.#setStatus("Canvas cleared");
    }

    /** Export current frame as PNG data URL (transparent bg, 1 px per cell) */
    exportPNG() {
        const offscreen = document.createElement("canvas");
        offscreen.width  = this.#cols;
        offscreen.height = this.#rows;
        const ctx = offscreen.getContext("2d");

        for (const layer of this.#layers) {
            if (!layer.visible) continue;
            ctx.globalAlpha = layer.opacity;
            for (let i = 0; i < layer.pixels.length; i++) {
                if (!layer.pixels[i]) continue;
                const x = i % this.#cols;
                const y = Math.floor(i / this.#cols);
                ctx.fillStyle = layer.pixels[i];
                ctx.fillRect(x, y, 1, 1);
            }
        }
        ctx.globalAlpha = 1;
        return offscreen.toDataURL("image/png");
    }

    /**
     * Compatibility alias used by GameEditor's sprite bridge.
     * Returns ONLY the pixel grid as a transparent PNG data URL — no editor UI,
     * no checkerboard, no selection rectangle, no grid, and no border.
     */
    toDataURL(type = "image/png") {
        return this.exportPNG();
    }

    /** Compatibility alias for older callers. */
    getDataURL(type = "image/png") {
        return this.exportPNG();
    }

    /** Compatibility alias for older callers. */
    getPNGDataURL() {
        return this.exportPNG();
    }

    /** Compatibility alias for older callers. */
    exportDataURL(type = "image/png") {
        return this.exportPNG();
    }

    /**
     * Load a PNG/data URL back into the current PixelArt grid.
     * Used when re-opening a sprite asset so saved pixels are restored into
     * the editable grid instead of clearing the sprite.
     */
    loadFromDataURL(dataURL, opts = {}) {
        if (!dataURL) return Promise.resolve();
        const { resize = false } = opts;
        return this.importImage(dataURL, { newLayer: false, resize });
    }

    /**
     * Export all animation frames as an array of PNG data URLs.
     * Each element corresponds to one frame (all visible layers composited).
     * @returns {string[]} Array of data URLs (one per frame).
     */
    exportFramesPNG() {
        // Commit current working layers to the active frame slot first
        this.#frames[this.#activeFrame] = this.#layers;
        return this.#frames.map(frameLayers => {
            const off = document.createElement("canvas");
            off.width  = this.#cols;
            off.height = this.#rows;
            const ctx  = off.getContext("2d");
            for (const layer of frameLayers) {
                if (!layer.visible) continue;
                ctx.globalAlpha = layer.opacity;
                for (let i = 0; i < layer.pixels.length; i++) {
                    if (!layer.pixels[i]) continue;
                    ctx.fillStyle = layer.pixels[i];
                    ctx.fillRect(i % this.#cols, Math.floor(i / this.#cols), 1, 1);
                }
            }
            ctx.globalAlpha = 1;
            return off.toDataURL("image/png");
        });
    }

    /**
     * Export the current frame as an HTMLImageElement.
     * Useful for handing off pixel-art to Sprites.js.
     *
     * @param {number} [scale=1]  Optional integer upscale factor (e.g. 4 → each pixel becomes 4×4).
     * @returns {Promise<HTMLImageElement>} Resolves when the image is fully loaded.
     *
     * @example
     * const img = await pixelArt.toImage(4);
     * const hero = Sprites.create({ image: img, x: 100, y: 200 });
     */
    toImage(scale = 1) {
        const s = Math.max(1, Math.round(scale));
        let dataURL;
        if (s === 1) {
            dataURL = this.exportPNG();
        } else {
            const off = document.createElement("canvas");
            off.width  = this.#cols * s;
            off.height = this.#rows * s;
            const ctx  = off.getContext("2d");
            ctx.imageSmoothingEnabled = false;
            // Draw at 1× then scale up
            const tmp = document.createElement("canvas");
            tmp.width  = this.#cols;
            tmp.height = this.#rows;
            const tc   = tmp.getContext("2d");
            for (const layer of this.#layers) {
                if (!layer.visible) continue;
                tc.globalAlpha = layer.opacity;
                for (let i = 0; i < layer.pixels.length; i++) {
                    if (!layer.pixels[i]) continue;
                    tc.fillStyle = layer.pixels[i];
                    tc.fillRect(i % this.#cols, Math.floor(i / this.#cols), 1, 1);
                }
            }
            tc.globalAlpha = 1;
            ctx.drawImage(tmp, 0, 0, this.#cols * s, this.#rows * s);
            dataURL = off.toDataURL("image/png");
        }
        return new Promise((resolve, reject) => {
            const img = new window.Image();
            img.onload  = () => resolve(img);
            img.onerror = reject;
            img.src = dataURL;
        });
    }

    /**
     * Export all animation frames as an HTMLImageElement sprite-sheet
     * (frames laid out horizontally, one column per frame).
     *
     * The returned object is `{ image, frameWidth, frameHeight, frameCount }`
     * which maps directly onto `Sprites.createSheet(image, frameWidth, frameHeight)`.
     *
     * @param {number} [scale=1] Optional integer upscale factor.
     * @returns {Promise<{image:HTMLImageElement, frameWidth:number, frameHeight:number, frameCount:number}>}
     *
     * @example
     * const sheet = await pixelArt.toSpriteSheet(4);
     * const spr   = Sprites.create({
     *   sheet: Sprites.createSheet(sheet.image, sheet.frameWidth, sheet.frameHeight),
     *   width: sheet.frameWidth, height: sheet.frameHeight,
     * });
     * Sprites.addAnimation(spr, 'walk', { frames: [0,1,2,3], fps: 8 });
     * Sprites.playAnimation(spr, 'walk');
     */
    toSpriteSheet(scale = 1) {
        const s      = Math.max(1, Math.round(scale));
        const fw     = this.#cols * s;
        const fh     = this.#rows * s;
        const frames = this.exportFramesPNG();
        const off    = document.createElement("canvas");
        off.width    = fw * frames.length;
        off.height   = fh;
        const ctx    = off.getContext("2d");
        ctx.imageSmoothingEnabled = false;

        return Promise.all(frames.map(url => new Promise((res, rej) => {
            const img = new window.Image();
            img.onload  = () => res(img);
            img.onerror = rej;
            img.src     = url;
        }))).then(imgs => {
            imgs.forEach((img, i) => ctx.drawImage(img, i * fw, 0, fw, fh));
            return new Promise((res, rej) => {
                const sheet = new window.Image();
                sheet.onload  = () => res({ image: sheet, frameWidth: fw, frameHeight: fh, frameCount: frames.length });
                sheet.onerror = rej;
                sheet.src     = off.toDataURL("image/png");
            });
        });
    }

    /** Download the current frame as a PNG */
    downloadPNG(filename = "pixelart.png") {
        const url = this.exportPNG();
        const a   = document.createElement("a");
        a.href     = url;
        a.download = filename;
        a.click();
        this.#setStatus("Exported PNG");
    }

    /**
     * Show the GIF-export modal and (on confirm) encode all frames via gif.js.
     * gif.js is loaded on-demand from cdnjs so it adds zero weight until called.
     */
    downloadGIF(filename = "pixelart.gif") {
        this.#showGIFModal(filename);
    }

    /** Load a project from a JSON string */
    loadJSON(json) {
        try {
            const data = JSON.parse(json);
            this.#cols   = data.cols;
            this.#rows   = data.rows;
            this.#layers = data.layers;
            this.#frames = data.frames;
            this.#palette = data.palette ?? this.#palette;
            this.#activeLayerIndex = 0;
            this.#activeFrame      = 0;
            this.#saveHistory();
            this.#rebuildLayerList();
            this.#rebuildPalette();
            this.#rebuildFramesStrip();
            this.render();
            this.#setStatus("Project loaded");
        } catch (e) {
            this.#setStatus("Load failed: " + e.message);
        }
    }

    /** Save the project to a JSON string */
    saveJSON() {
        return JSON.stringify({
            cols:    this.#cols,
            rows:    this.#rows,
            layers:  this.#layers,
            frames:  this.#frames,
            palette: this.#palette,
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  Image Import  – converts any raster image → pixel grid
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Import an image file and convert it to pixel-art on the active layer.
     *
     * The image is down-sampled to the current grid dimensions (cols × rows)
     * using nearest-neighbour sampling. Transparent pixels (alpha < 128) are
     * stored as null so the checkerboard shows through.
     *
     * @param {File|Blob|string} source  A File/Blob object OR a data-URL string.
     * @param {object}  [opts]
     * @param {boolean} [opts.newLayer=true]   Paint onto a new layer instead of the active one.
     * @param {boolean} [opts.resize=false]    Resize the grid to match the image's natural pixel count
     *                                         (capped at 128×128).
     * @returns {Promise<void>}
     *
     * @example
     * // From a file-input change event
     * const [file] = e.target.files;
     * await pixelArt.importImage(file, { newLayer: true });
     *
     * @example
     * // From a data URL
     * await pixelArt.importImage(dataURL, { resize: true });
     */
    importImage(source, opts = {}) {
        const { newLayer = true, resize: autoResize = false } = opts;

        return new Promise((resolve, reject) => {
            const img = new window.Image();
            img.crossOrigin = "anonymous";

            img.onload = () => {
                // ── Optional auto-resize ────────────────────────────────────
                if (autoResize) {
                    const maxDim = 128;
                    const scale  = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
                    const newCols = Math.max(1, Math.round(img.naturalWidth  * scale));
                    const newRows = Math.max(1, Math.round(img.naturalHeight * scale));
                    if (newCols !== this.#cols || newRows !== this.#rows) {
                        this.resize(newCols, newRows);
                    }
                }

                // ── Sample image → offscreen canvas ─────────────────────────
                // Use a multi-step downscale for better quality when the source
                // image is much larger than the target grid. Halving repeatedly
                // preserves more colour detail than a single nearest-neighbour
                // jump straight to the target size.
                const targetW = this.#cols;
                const targetH = this.#rows;

                let src = document.createElement("canvas");
                src.width  = img.naturalWidth;
                src.height = img.naturalHeight;
                const srcCtx = src.getContext("2d");
                srcCtx.drawImage(img, 0, 0);

                // Step down by halves while still more than 2× the target
                while (src.width > targetW * 2 || src.height > targetH * 2) {
                    const stepW = Math.max(targetW, Math.ceil(src.width  / 2));
                    const stepH = Math.max(targetH, Math.ceil(src.height / 2));
                    const step  = document.createElement("canvas");
                    step.width  = stepW;
                    step.height = stepH;
                    const sc = step.getContext("2d");
                    sc.imageSmoothingEnabled = true;
                    sc.imageSmoothingQuality = "high";
                    sc.drawImage(src, 0, 0, stepW, stepH);
                    src = step;
                }

                // Final draw to exact grid size with high-quality smoothing
                const off = document.createElement("canvas");
                off.width  = targetW;
                off.height = targetH;
                const ctx  = off.getContext("2d");
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = "high";
                ctx.drawImage(src, 0, 0, targetW, targetH);

                const { data } = ctx.getImageData(0, 0, this.#cols, this.#rows);

                // ── Prepare target layer ─────────────────────────────────────
                if (newLayer) {
                    this.addLayer("Imported Image");
                }
                const layer = this.#activeLayer();
                if (layer.locked) { this.#setStatus("Layer is locked"); reject(new Error("locked")); return; }

                // ── Write pixels ─────────────────────────────────────────────
                for (let i = 0; i < this.#cols * this.#rows; i++) {
                    const base  = i * 4;
                    const r = data[base], g = data[base + 1], b = data[base + 2], a = data[base + 3];
                    // Treat near-transparent pixels as empty
                    layer.pixels[i] = a < 128
                        ? null
                        : `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
                }

                this.#saveHistory();
                this.render();
                this.#setStatus(`Image imported (${this.#cols}×${this.#rows})`);
                resolve();
            };

            img.onerror = () => { this.#setStatus("Image load failed"); reject(new Error("load")); };

            // Accept File/Blob or raw data-URL string
            img.src = (source instanceof Blob)
                ? URL.createObjectURL(source)
                : source;
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  .pxart  –  custom binary-ish format  (JSON inside a typed-array wrapper)
    //
    //  File layout (little-endian):
    //    Bytes 0-3   magic  0x50 0x58 0x41 0x52  ("PXAR")
    //    Byte  4     version  0x01
    //    Bytes 5-8   payload length (uint32)
    //    Bytes 9+    UTF-8 JSON payload
    //
    //  JSON payload schema:
    //    { version, cols, rows, palette, frames, activeFrame, fps,
    //      createdAt, modifiedAt, author? }
    //    Each frame: Array<{ id, name, visible, opacity, locked, pixels }>
    //    pixels: Array<string|null>  (CSS hex or null = transparent)
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Serialise the full project to a .pxart binary blob.
     *
     * @param {object} [meta]           Optional metadata merged into the header.
     * @param {string} [meta.author]    Creator name embedded in the file.
     * @returns {Blob}  A Blob with MIME type "application/x-pxart".
     */
    exportPXART(meta = {}) {
        // Commit current layers to the active frame slot
        this.#frames[this.#activeFrame] = this.#layers;

        const payload = JSON.stringify({
            version:      1,
            cols:         this.#cols,
            rows:         this.#rows,
            palette:      this.#palette,
            activeFrame:  this.#activeFrame,
            fps:          this.#fps,
            createdAt:    new Date().toISOString(),
            modifiedAt:   new Date().toISOString(),
            author:       meta.author ?? null,
            frames:       this.#frames,
        });

        const payloadBytes = new TextEncoder().encode(payload);
        const buf  = new ArrayBuffer(9 + payloadBytes.byteLength);
        const view = new DataView(buf);

        // Magic "PXAR"
        view.setUint8(0, 0x50); view.setUint8(1, 0x58);
        view.setUint8(2, 0x41); view.setUint8(3, 0x52);
        // Version
        view.setUint8(4, 0x01);
        // Payload length (uint32 little-endian)
        view.setUint32(5, payloadBytes.byteLength, true);
        // Payload
        new Uint8Array(buf, 9).set(payloadBytes);

        return new Blob([buf], { type: "application/x-pxart" });
    }

    /**
     * Download the current project as a .pxart file.
     *
     * @param {string} [filename="pixelart.pxart"]
     * @param {object} [meta]  Forwarded to exportPXART().
     */
    downloadPXART(filename = "pixelart.pxart", meta = {}) {
        const blob = this.exportPXART(meta);
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        this.#setStatus("Saved .pxart");
    }

    /**
     * Load a project from a .pxart Blob/File or an ArrayBuffer.
     *
     * @param {Blob|File|ArrayBuffer} source
     * @returns {Promise<void>}
     *
     * @example
     * const [file] = e.target.files;
     * await pixelArt.importPXART(file);
     */
    importPXART(source) {
        const readBuf = source instanceof ArrayBuffer
            ? Promise.resolve(source)
            : source.arrayBuffer();

        return readBuf.then(buf => {
            const view = new DataView(buf);

            // Validate magic bytes
            const magic = String.fromCharCode(
                view.getUint8(0), view.getUint8(1),
                view.getUint8(2), view.getUint8(3)
            );
            if (magic !== "PXAR") throw new Error(".pxart: invalid magic bytes");

            const fileVersion = view.getUint8(4);
            if (fileVersion !== 1) throw new Error(`.pxart: unsupported version ${fileVersion}`);

            const payloadLen = view.getUint32(5, true);
            const payloadBytes = new Uint8Array(buf, 9, payloadLen);
            const json = new TextDecoder().decode(payloadBytes);
            const data = JSON.parse(json);

            // Apply state
            this.#cols             = data.cols;
            this.#rows             = data.rows;
            this.#palette          = data.palette ?? this.#palette;
            this.#fps              = data.fps      ?? this.#fps;
            this.#frames           = data.frames;
            this.#activeFrame      = data.activeFrame ?? 0;
            this.#layers           = this.#frames[this.#activeFrame];
            this.#activeLayerIndex = 0;

            this.#saveHistory();
            this.#rebuildLayerList();
            this.#rebuildPalette();
            this.#rebuildFramesStrip();
            this.render();
            this.#setStatus(
                `.pxart loaded — ${data.cols}×${data.rows}, ` +
                `${data.frames.length} frame(s)` +
                (data.author ? ` by ${data.author}` : "")
            );
        }).catch(e => {
            this.#setStatus("Import failed: " + e.message);
            throw e;
        });
    }

    /** Resize the grid (destructive – existing pixels preserved where they fit) */
    resize(cols, rows) {
        const newLayers = this.#layers.map(layer => {
            const newPixels = new Array(cols * rows).fill(null);
            for (let y = 0; y < Math.min(rows, this.#rows); y++) {
                for (let x = 0; x < Math.min(cols, this.#cols); x++) {
                    newPixels[y * cols + x] = layer.pixels[y * this.#cols + x] ?? null;
                }
            }
            return { ...layer, pixels: newPixels };
        });
        this.#cols   = cols;
        this.#rows   = rows;
        this.#layers = newLayers;
        this.#saveHistory();
        this.render();
        if (this.#statusSize) this.#statusSize.textContent = `${cols}×${rows}`;
        // Sync toolbar sliders/labels if they exist
        if (this._wSlider) { this._wSlider.value = String(this.#cols); this._wOut.textContent = this.#cols; }
        if (this._hSlider) { this._hSlider.value = String(this.#rows); this._hOut.textContent = this.#rows; }
    }

    /** Flip the active layer horizontally */
    flipHorizontal() {
        const layer = this.#activeLayer();
        const next  = new Array(layer.pixels.length).fill(null);
        for (let y = 0; y < this.#rows; y++)
            for (let x = 0; x < this.#cols; x++)
                next[y * this.#cols + (this.#cols - 1 - x)] = layer.pixels[y * this.#cols + x];
        layer.pixels = next;
        this.#saveHistory();
        this.render();
        this.#setStatus("Flipped horizontal");
    }

    /** Flip the active layer vertically */
    flipVertical() {
        const layer = this.#activeLayer();
        const next  = new Array(layer.pixels.length).fill(null);
        for (let y = 0; y < this.#rows; y++)
            for (let x = 0; x < this.#cols; x++)
                next[(this.#rows - 1 - y) * this.#cols + x] = layer.pixels[y * this.#cols + x];
        layer.pixels = next;
        this.#saveHistory();
        this.render();
        this.#setStatus("Flipped vertical");
    }

    /** Rotate the active layer 90° clockwise */
    rotate90() {
        const layer     = this.#activeLayer();
        const next      = new Array(layer.pixels.length).fill(null);
        const [C, R]    = [this.#cols, this.#rows];
        for (let y = 0; y < R; y++)
            for (let x = 0; x < C; x++)
                next[x * R + (R - 1 - y)] = layer.pixels[y * C + x];
        layer.pixels = next;
        this.#saveHistory();
        this.render();
        this.#setStatus("Rotated 90°");
    }

    /** Set symmetry mode: 'none' | 'horizontal' | 'vertical' | 'both' */
    setSymmetry(mode) {
        this.#symmetry = mode;
        this.#setStatus(`Symmetry: ${mode}`);
        this.render();
    }

    /** Toggle or set theme: 'dark' | 'light' */
    setTheme(theme) {
        this.#theme = (theme === "light") ? "light" : "dark";
        if (this.#uiRoot) this.#uiRoot.setAttribute("data-pa-theme", this.#theme);
        this.#setStatus(`Theme: ${this.#theme}`);
        this.render();
    }

    /** Delete a specific frame by index */
    deleteFrame(index) {
        if (this.#frames.length <= 1) { this.#setStatus("Cannot delete last frame"); return; }
        this.#frames[this.#activeFrame] = this.#layers;
        this.#frames.splice(index, 1);
        this.#activeFrame = Math.min(this.#activeFrame, this.#frames.length - 1);
        this.#layers = this.#frames[this.#activeFrame];
        this.#activeLayerIndex = Math.min(this.#activeLayerIndex, this.#layers.length - 1);
        this.#rebuildLayerList();
        this.#rebuildFramesStrip();
        this.render();
        this.#setStatus(`Deleted frame – ${this.#frames.length} frame(s) remaining`);
    }

    /** Duplicate a specific frame by index */
    duplicateFrame(index) {
        this.#frames[this.#activeFrame] = this.#layers;
        const copy = this.#frames[index].map(l => ({ ...l, pixels: [...l.pixels] }));
        this.#frames.splice(index + 1, 0, copy);
        this.#activeFrame = index + 1;
        this.#layers = this.#frames[this.#activeFrame];
        this.#rebuildLayerList();
        this.#rebuildFramesStrip();
        this.render();
        this.#setStatus(`Duplicated frame ${index + 1}`);
    }

    /** Copy the current selection to the internal clipboard */
    copySelection() {
        if (!this.#selection) { this.#setStatus("No selection to copy"); return; }
        const { x1, y1, x2, y2 } = this.#selection;
        const sx = Math.min(x1, x2), sy = Math.min(y1, y2);
        const sw = Math.abs(x2 - x1) + 1, sh = Math.abs(y2 - y1) + 1;
        const layer = this.#activeLayer();
        const pixels = [];
        for (let row = 0; row < sh; row++)
            for (let col = 0; col < sw; col++)
                pixels.push(layer.pixels[(sy + row) * this.#cols + (sx + col)] ?? null);
        this.#clipboard = { width: sw, height: sh, pixels };
        this.#setStatus(`Copied ${sw}×${sh} selection`);
    }

    /** Paste clipboard contents to the top-left of the selection (or 0,0) */
    pasteSelection() {
        if (!this.#clipboard) { this.#setStatus("Nothing to paste"); return; }
        const layer = this.#activeLayer();
        if (layer.locked) { this.#setStatus("Layer is locked"); return; }
        const ox = this.#selection ? Math.min(this.#selection.x1, this.#selection.x2) : 0;
        const oy = this.#selection ? Math.min(this.#selection.y1, this.#selection.y2) : 0;
        const { width: w, height: h, pixels } = this.#clipboard;
        for (let row = 0; row < h; row++)
            for (let col = 0; col < w; col++)
                this.#setCell(layer, ox + col, oy + row, pixels[row * w + col]);
        // Move selection to pasted area
        this.#selection = { x1: ox, y1: oy, x2: ox + w - 1, y2: oy + h - 1 };
        this.#saveHistory();
        this.render();
        this.#setStatus(`Pasted ${w}×${h}`);
    }

    /** Clear the active selection without modifying pixels */
    clearSelection() {
        this.#selection     = null;
        this.#selectionData = null;
        this._canvasWrap?.querySelectorAll(".__pa_selbadge").forEach(b => b.remove());
        this.render();
        this.#setStatus("Selection cleared");
    }

    /** Set gradient mode: 'linear' | 'radial' */
    setGradientMode(mode) {
        this.#gradientMode = mode === "radial" ? "radial" : "linear";
        this.#setStatus(`Gradient: ${this.#gradientMode}`);
    }

    /** Move a frame from one index to another */
    moveFrame(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;
        this.#frames[this.#activeFrame] = this.#layers;
        const [moved] = this.#frames.splice(fromIndex, 1);
        this.#frames.splice(toIndex, 0, moved);
        // Follow the active frame to its new position
        if (this.#activeFrame === fromIndex) {
            this.#activeFrame = toIndex;
        } else if (fromIndex < this.#activeFrame && toIndex >= this.#activeFrame) {
            this.#activeFrame--;
        } else if (fromIndex > this.#activeFrame && toIndex <= this.#activeFrame) {
            this.#activeFrame++;
        }
        this.#layers = this.#frames[this.#activeFrame];
        this.#rebuildLayerList();
        this.#rebuildFramesStrip();
        this.render();
    }

    // ── Layer management ─────────────────────────────────────────────────────

    addLayer(name) {
        const id = Helpers.generateId({ length: 8 });
        name = name ?? `Layer ${this.#layers.length + 1}`;
        this.#layers.push({
            id,
            name,
            pixels:  new Array(this.#cols * this.#rows).fill(null),
            visible: true,
            opacity: 1,
            locked:  false,
        });
        this.#activeLayerIndex = this.#layers.length - 1;
        this.#rebuildLayerList();
        this.#saveHistory();
        this.#setStatus(`Added layer "${name}"`);
    }

    removeLayer(index) {
        if (this.#layers.length <= 1) {
            this.#setStatus("Cannot remove last layer");
            return;
        }
        this.#layers.splice(index, 1);
        this.#activeLayerIndex = Helpers.clamp(this.#activeLayerIndex, 0, this.#layers.length - 1);
        this.#rebuildLayerList();
        this.#saveHistory();
        this.render();
    }

    duplicateLayer(index) {
        const src = this.#layers[index];
        const id  = Helpers.generateId({ length: 8 });
        this.#layers.splice(index + 1, 0, {
            ...src,
            id,
            name:   src.name + " copy",
            pixels: [...src.pixels],
        });
        this.#activeLayerIndex = index + 1;
        this.#rebuildLayerList();
        this.render();
    }

    mergeDown(index) {
        if (index <= 0) return;
        const top    = this.#layers[index];
        const bottom = this.#layers[index - 1];
        for (let i = 0; i < top.pixels.length; i++)
            if (top.pixels[i]) bottom.pixels[i] = top.pixels[i];
        this.#layers.splice(index, 1);
        this.#activeLayerIndex = index - 1;
        this.#rebuildLayerList();
        this.#saveHistory();
        this.render();
        this.#setStatus("Merged down");
    }

    // ── Animation frames ──────────────────────────────────────────────────────

    addFrame() {
        this.#frames[this.#activeFrame] = this.#layers;
        const snapshot = this.#layers.map(l => ({ ...l, pixels: [...l.pixels] }));
        this.#frames.push(snapshot);
        this.#activeFrame = this.#frames.length - 1;
        this.#layers = this.#frames[this.#activeFrame];
        this.#rebuildLayerList();
        this.#rebuildFramesStrip();
        this.render();
        this.#setStatus(`Frame ${this.#activeFrame + 1} / ${this.#frames.length}`);
    }

    goToFrame(index) {
        this.#frames[this.#activeFrame] = this.#layers;
        this.#activeFrame = Helpers.clamp(index, 0, this.#frames.length - 1);
        this.#layers = this.#frames[this.#activeFrame];
        this.#activeLayerIndex = Helpers.clamp(this.#activeLayerIndex, 0, this.#layers.length - 1);
        this.#rebuildLayerList();
        this.#rebuildFramesStrip();
        this.render();
        this.#setStatus(`Frame ${this.#activeFrame + 1} / ${this.#frames.length}`);
    }

    playAnimation() {
        if (this.#isPlaying) return;
        this.#isPlaying = true;
        if (this.#playBtnEl) { this.#playBtnEl.textContent = "⏸ Pause"; this.#playBtnEl.classList.add("__pa_playing"); }
        let f = this.#activeFrame;
        this.#playInterval = setInterval(() => {
            f = (f + 1) % this.#frames.length;
            this.#activeFrame = f;
            this.#layers = this.#frames[f];
            this.#rebuildFramesStrip();
            this.render();
        }, 1000 / this.#fps);
    }

    stopAnimation() {
        this.#isPlaying = false;
        clearInterval(this.#playInterval);
        if (this.#playBtnEl) { this.#playBtnEl.textContent = "▶ Play"; this.#playBtnEl.classList.remove("__pa_playing"); }
        this.goToFrame(this.#activeFrame);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  Private – style injection
    // ═════════════════════════════════════════════════════════════════════════

    /** Inject one shared <style> block per document (idempotent). */
    #injectStyles() {
        if (document.getElementById("__pa_styles")) return;
        const s = document.createElement("style");
        s.id = "__pa_styles";
        s.textContent = `
/* ── PixelArt editor reset / vars ── */
.__pa_root *,.__pa_root *::before,.__pa_root *::after{box-sizing:border-box;margin:0;padding:0}
.__pa_root{
  --pa-bg0:#0d1117;--pa-bg1:#161b22;--pa-bg2:#1c2128;--pa-bg3:#21262d;
  --pa-border:#30363d;--pa-border2:#444c56;
  --pa-accent:#58a6ff;--pa-accent2:#1f6feb;--pa-hot:#f78166;
  --pa-text:#e6edf3;--pa-text2:#9daab6;--pa-text3:#adb5c2;
  --pa-green:#3fb950;
  position:absolute;display:flex;flex-direction:column;
  width:100%;height:100%;overflow:hidden;
  background:var(--pa-bg0);color:var(--pa-text);
  font-family:'SF Pro Text',system-ui,-apple-system,sans-serif;
  font-size:13px;user-select:none;-webkit-tap-highlight-color:transparent;
}
/* light theme overrides */
.__pa_root[data-pa-theme="light"]{
  --pa-bg0:#f0f2f5;--pa-bg1:#ffffff;--pa-bg2:#f6f8fa;--pa-bg3:#eaeef2;
  --pa-border:#d0d7de;--pa-border2:#b0b8c1;
  --pa-accent:#0969da;--pa-accent2:#0550ae;--pa-hot:#cf222e;
  --pa-text:#1f2328;--pa-text2:#4a5360;--pa-text3:#545c66;
  --pa-green:#1a7f37;
}
/* toolbar */
.__pa_toolbar{
  height:48px;min-height:48px;flex-shrink:0;
  background:var(--pa-bg1);border-bottom:1px solid var(--pa-border);
  display:flex;align-items:center;gap:2px;padding:0 8px;
  overflow-x:auto;overflow-y:auto;scrollbar-width:none;
  flex-wrap: wrap;
}
.__pa_toolbar::-webkit-scrollbar{display:none}
.__pa_sep{width:1px;height:24px;background:var(--pa-border);flex-shrink:0;margin:0 4px}
.__pa_tbtn{
  width:34px;height:34px;border-radius:6px;border:1px solid transparent;
  background:transparent;color:var(--pa-text2);cursor:pointer;
  display:flex;align-items:center;justify-content:center;
  font-size:15px;transition:background .12s,color .12s;flex-shrink:0;
}
.__pa_tbtn:hover{background:var(--pa-bg3);color:var(--pa-text);border-color:var(--pa-border)}
.__pa_tbtn.__pa_active{background:var(--pa-accent2);color:#fff;border-color:var(--pa-accent)}
.__pa_tbtn svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
/* color pair */
.__pa_cpair{position:relative;width:38px;height:36px;flex-shrink:0}
.__pa_cswatch{width:22px;height:22px;border-radius:4px;border:1.5px solid var(--pa-border2);cursor:pointer;position:absolute;transition:border-color .12s}
.__pa_cswatch:hover{border-color:var(--pa-text)}
.__pa_cswatch.__pa_pri{top:0;left:0;z-index:2;border-color:var(--pa-text2)}
.__pa_cswatch.__pa_sec{bottom:0;right:0;z-index:1}
.__pa_hpicker{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
/* sliders */
.__pa_ctrl{display:flex;align-items:center;gap:5px;flex-shrink:0}
.__pa_lbl{font-size:10px;color:var(--pa-text3);white-space:nowrap;text-transform:uppercase;letter-spacing:.5px}
.__pa_range{
  -webkit-appearance:none;appearance:none;
  width:58px;height:4px;background:var(--pa-bg3);border-radius:2px;cursor:pointer;
  outline:none;border:1px solid var(--pa-border);flex-shrink:0;
}
.__pa_range::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;border-radius:50%;background:var(--pa-accent);border:none;cursor:pointer}
.__pa_range::-moz-range-thumb{width:13px;height:13px;border-radius:50%;background:var(--pa-accent);border:none;cursor:pointer}
.__pa_valout{font-size:11px;color:var(--pa-text3);min-width:24px}
.__pa_sel{background:var(--pa-bg3);color:var(--pa-text);border:1px solid var(--pa-border);border-radius:5px;height:26px;padding:0 4px;font-size:11px;cursor:pointer;outline:none}
.__pa_sel:focus{border-color:var(--pa-accent)}
/* body */
.__pa_body{display:flex;flex:1;overflow:hidden;min-height:0}
/* panels */
.__pa_lpanel{
  width:160px;min-width:160px;flex-shrink:0;
  background:var(--pa-bg1);border-right:1px solid var(--pa-border);
  display:flex;flex-direction:column;overflow:hidden;
}
.__pa_rpanel{
  width:172px;min-width:172px;flex-shrink:0;
  background:var(--pa-bg1);border-left:1px solid var(--pa-border);
  display:flex;flex-direction:column;overflow:hidden;
}
.__pa_psec{padding:8px;border-bottom:1px solid var(--pa-border);flex-shrink:0}
.__pa_ptitle{font-size:10px;font-weight:600;color:var(--pa-accent);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px}
/* palette */
.__pa_pgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:3px}
.__pa_pswatch{aspect-ratio:1;border-radius:3px;cursor:pointer;border:1.5px solid transparent;transition:transform .1s,border-color .1s}
.__pa_pswatch:hover{transform:scale(1.18);border-color:var(--pa-text);z-index:1;position:relative}
.__pa_addrow{display:flex;gap:4px;margin-top:6px;align-items:center}
.__pa_cpick{width:26px;height:26px;border:1px solid var(--pa-border2);background:none;border-radius:4px;cursor:pointer;padding:1px}
.__pa_abtn{flex:1;height:26px;background:var(--pa-bg3);color:var(--pa-text2);border:1px solid var(--pa-border);border-radius:4px;cursor:pointer;font-size:11px;transition:background .12s,color .12s}
.__pa_abtn:hover{background:var(--pa-bg2);color:var(--pa-text);border-color:var(--pa-border2)}
/* canvas wrap */
.__pa_cwrap{flex:1;overflow:hidden;position:relative;cursor:crosshair;background:var(--pa-bg0)}
.__pa_canvas{position:absolute;top:0;left:0;touch-action:none;image-rendering:pixelated}
/* layers */
.__pa_lsec{flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0}
.__pa_sechead{display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-bottom:1px solid var(--pa-border);flex-shrink:0}
.__pa_llist{flex:1;overflow-y:auto;padding:4px;scrollbar-width:thin;scrollbar-color:var(--pa-border) transparent}
.__pa_lrow{display:flex;align-items:center;gap:3px;padding:5px 4px;border-radius:5px;cursor:pointer;margin-bottom:2px;border:1px solid transparent;transition:background .1s}
.__pa_lrow:hover{background:var(--pa-bg3)}
.__pa_lrow.__pa_lactive{background:var(--pa-accent2)!important;border-color:var(--pa-accent)}
.__pa_lrow.__pa_lactive .__pa_lname{color:#fff}
.__pa_lrow.__pa_lactive .__pa_ibtn{color:rgba(255,255,255,.8)}
.__pa_lrow.__pa_lactive .__pa_ibtn:hover{color:#fff;background:rgba(255,255,255,.15)}
.__pa_lname{flex:1;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.__pa_ibtn{width:20px;height:20px;background:none;border:none;color:var(--pa-text3);cursor:pointer;font-size:11px;border-radius:3px;display:flex;align-items:center;justify-content:center;transition:all .1s;flex-shrink:0}
.__pa_ibtn:hover{color:var(--pa-text);background:var(--pa-bg3)}
.__pa_ibtn svg{width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
/* animation */
.__pa_asec{border-top:1px solid var(--pa-border);padding:8px;flex-shrink:0}
.__pa_abtns{display:flex;gap:4px;margin-top:6px;flex-wrap:wrap}
.__pa_abtn2{flex:1;min-width:44px;height:26px;background:var(--pa-bg3);color:var(--pa-text);border:1px solid var(--pa-border);border-radius:4px;cursor:pointer;font-size:10px;font-weight:500;transition:background .12s}
.__pa_abtn2:hover{background:var(--pa-border2)}
.__pa_abtn2.__pa_playing{background:#1a3a1a;color:var(--pa-green);border-color:var(--pa-green)}
.__pa_fpsr{display:flex;align-items:center;gap:6px;margin-top:6px}
.__pa_fpsi{width:46px;height:24px;background:var(--pa-bg3);color:var(--pa-text);border:1px solid var(--pa-border);border-radius:4px;text-align:center;font-size:12px}
.__pa_fpsi:focus{outline:none;border-color:var(--pa-accent)}
.__pa_find{font-size:10px;color:var(--pa-text3);margin-top:4px;text-align:center}
.__pa_fstrip{display:flex;gap:4px;margin-top:6px;overflow-x:auto;padding:2px;scrollbar-width:thin;scrollbar-color:var(--pa-border) transparent}
.__pa_fthumb{width:28px;height:28px;flex-shrink:0;border-radius:3px;border:1.5px solid var(--pa-border);cursor:pointer;background:var(--pa-bg3);overflow:hidden;image-rendering:pixelated}
.__pa_fthumb.__pa_factive{border-color:var(--pa-accent)}
.__pa_fthumb canvas{width:100%;height:100%;display:block}
/* status */
.__pa_status{height:24px;min-height:24px;flex-shrink:0;background:var(--pa-bg1);border-top:1px solid var(--pa-border);display:flex;align-items:center;padding:0 10px;gap:16px;font-size:11px;color:var(--pa-text3)}
/* context menu */
.__pa_ctxmenu{position:fixed;background:var(--pa-bg2);border:1px solid var(--pa-border2);border-radius:7px;box-shadow:0 8px 24px rgba(0,0,0,.5);z-index:9999;min-width:140px;overflow:hidden;padding:4px}
.__pa_ctxitem{padding:7px 12px;cursor:pointer;border-radius:4px;font-size:12px;display:flex;align-items:center;gap:8px;color:var(--pa-text2);transition:all .1s}
.__pa_ctxitem:hover{background:var(--pa-bg3);color:var(--pa-text)}
.__pa_ctxitem.__pa_danger:hover{background:#3d1a1a;color:#f85149}
.__pa_ctxsep{height:1px;background:var(--pa-border);margin:4px 0}
/* modal */
.__pa_overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:10000;display:flex;align-items:center;justify-content:center}
.__pa_modal{background:var(--pa-bg2);border:1px solid var(--pa-border2);border-radius:10px;padding:20px;min-width:280px;max-width:340px;width:90%}
.__pa_modal h3{font-size:15px;font-weight:600;margin-bottom:14px;color:var(--pa-text)}
.__pa_mrow{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;font-size:12px;color:var(--pa-text2)}
.__pa_mrow input,.__pa_mrow select{background:var(--pa-bg3);color:var(--pa-text);border:1px solid var(--pa-border);border-radius:4px;padding:4px 7px;font-size:12px}
.__pa_mrow input:focus,.__pa_mrow select:focus{outline:none;border-color:var(--pa-accent)}
.__pa_mactions{display:flex;gap:8px;margin-top:16px}
.__pa_mbtn{flex:1;height:32px;border-radius:5px;cursor:pointer;font-size:13px;font-weight:500;border:1px solid var(--pa-border);background:var(--pa-bg3);color:var(--pa-text);transition:background .12s}
.__pa_mbtn:hover{background:var(--pa-border)}
.__pa_mbtn.__pa_mprimary{background:var(--pa-accent2);color:#fff;border-color:var(--pa-accent)}
.__pa_mbtn.__pa_mprimary:hover{background:#388bfd}
.__pa_pbar{height:4px;background:var(--pa-bg3);border-radius:2px;overflow:hidden;margin-top:10px;display:none}
.__pa_pfill{height:100%;background:var(--pa-accent);border-radius:2px;width:0;transition:width .1s}
.__pa_mstatus{font-size:11px;color:var(--pa-text3);margin-top:8px;min-height:16px}
/* responsive */
@media(max-width:640px){.__pa_rpanel{display:none}}
@media(max-width:480px){.__pa_lpanel{display:none}}
/* frame drag-and-drop */
.__pa_fthumb.__pa_fdragging{opacity:.35;border-style:dashed}
.__pa_fthumb.__pa_fdragover{border-color:var(--pa-accent);box-shadow:0 0 0 2px var(--pa-accent)}
.__pa_fthumb.__pa_fdragover-left{box-shadow:-3px 0 0 0 var(--pa-accent)}
.__pa_fthumb.__pa_fdragover-right{box-shadow:3px 0 0 0 var(--pa-accent)}
.__pa_fthumb-wrap{position:relative;flex-shrink:0}
.__pa_fthumb-wrap:hover .__pa_fmenu{opacity:1;pointer-events:auto}
.__pa_fmenu{position:absolute;top:-1px;right:-1px;opacity:0;pointer-events:none;transition:opacity .12s;z-index:5;display:flex;flex-direction:column;gap:1px}
.__pa_fmbtn{width:14px;height:14px;border-radius:2px;background:var(--pa-bg2);border:1px solid var(--pa-border2);color:var(--pa-text2);font-size:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;padding:0}
.__pa_fmbtn:hover{background:var(--pa-accent2);color:#fff;border-color:var(--pa-accent)}
.__pa_fmbtn.__pa_fmbtn-del:hover{background:#b91c1c;border-color:#ef4444;color:#fff}
/* gradient mode selector */
.__pa_gradsub{display:flex;gap:2px;align-items:center;flex-shrink:0}
.__pa_gradsub button{height:22px;padding:0 6px;border-radius:4px;border:1px solid var(--pa-border);background:var(--pa-bg3);color:var(--pa-text2);font-size:10px;cursor:pointer;transition:all .1s}
.__pa_gradsub button:hover{background:var(--pa-border2);color:var(--pa-text)}
.__pa_gradsub button.__pa_active{background:var(--pa-accent2);color:#fff;border-color:var(--pa-accent)}
/* selection context bar */
.__pa_selbadge{position:absolute;top:4px;left:50%;transform:translateX(-50%);background:var(--pa-bg2);border:1px solid var(--pa-border2);border-radius:6px;padding:3px 8px;display:flex;gap:6px;align-items:center;font-size:11px;color:var(--pa-text2);z-index:20;pointer-events:auto;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.4)}
.__pa_selbadge button{height:20px;padding:0 7px;border-radius:4px;border:1px solid var(--pa-border);background:var(--pa-bg3);color:var(--pa-text);font-size:10px;cursor:pointer;transition:background .1s}
.__pa_selbadge button:hover{background:var(--pa-border2)}
        `;
        document.head.appendChild(s);
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  Private – initialisation
    // ═════════════════════════════════════════════════════════════════════════

    #initLayers() {
        const id = Helpers.generateId({ length: 8 });
        this.#layers = [{
            id,
            name:    "Background",
            pixels:  new Array(this.#cols * this.#rows).fill(null),
            visible: true,
            opacity: 1,
            locked:  false,
        }];
        this.#activeLayerIndex = 0;
    }

    #initFrames() {
        this.#frames = [this.#layers];
        this.#activeFrame = 0;
    }

    #activeLayer() {
        return this.#layers[this.#activeLayerIndex];
    }

    // ─── Build the full editor UI ────────────────────────────────────────────

    #buildUI() {
        this.#container.innerHTML = "";

        const root = this.#el("div", { class: "__pa_root" });
        root.setAttribute("data-pa-theme", this.#theme);
        this.#uiRoot = root;

        // ── Top toolbar ──────────────────────────────────────────────────────
        const toolbar = this.#el("div", { class: "__pa_toolbar" });

        // Tool buttons
        const tools = [
            { id:"pen",
              svg:`<svg viewBox="0 0 24 24"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`,
              title:"Pen (P)" },
            { id:"eraser",
              svg:`<svg viewBox="0 0 24 24"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>`,
              title:"Eraser (E)" },
            { id:"fill",
              svg:`<svg viewBox="0 0 24 24"><path d="m19 11-8-8-8.5 8.5a5.5 5.5 0 0 0 7.78 7.78L19 11Z"/><path d="m20 12 2 2a1 1 0 1 1 0 2h-4a1 1 0 1 1 0-2l2-2Z"/></svg>`,
              title:"Fill (F)" },
            { id:"eyedropper",
              svg:`<svg viewBox="0 0 24 24"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>`,
              title:"Eyedropper (I)" },
            { id:"line",
              svg:`<svg viewBox="0 0 24 24"><line x1="5" y1="19" x2="19" y2="5"/></svg>`,
              title:"Line (L)" },
            { id:"rect",
              svg:`<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`,
              title:"Rectangle (R)" },
            { id:"ellipse",
              svg:`<svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="10" ry="6"/></svg>`,
              title:"Ellipse (O)" },
            { id:"select",
              svg:`<svg viewBox="0 0 24 24"><path d="M5 3l14 9-7 2-4 7z"/></svg>`,
              title:"Select (S)" },
            { id:"move",
              svg:`<svg viewBox="0 0 24 24"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>`,
              title:"Move/Pan (M)" },
            { id:"gradient",
              svg:`<svg viewBox="0 0 24 24"><defs><linearGradient id="__pa_gi" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="currentColor" stop-opacity="1"/><stop offset="100%" stop-color="currentColor" stop-opacity="0.15"/></linearGradient></defs><rect x="3" y="6" width="18" height="12" rx="2" fill="url(#__pa_gi)" stroke="currentColor" stroke-width="1.5"/><line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" stroke-width="0.5" stroke-dasharray="2,2"/></svg>`,
              title:"Gradient (T)" },
        ];

        this._toolButtons = {};
        for (const t of tools) {
            const btn = this.#el("button", {
                class: "__pa_tbtn" + (t.id === this.#tool ? " __pa_active" : ""),
                title: t.title,
            });
            btn.innerHTML = t.svg;
            btn.addEventListener("click", () => {
                this.setTool(t.id);
                // Show/hide gradient sub-selector
                if (gradSubWrap) gradSubWrap.style.display = (t.id === "gradient") ? "flex" : "none";
            });
            this._toolButtons[t.id] = btn;
            toolbar.appendChild(btn);
        }

        // Gradient mode sub-selector (visible only when gradient tool is active)
        const gradSubWrap = this.#el("div", { class:"__pa_gradsub" });
        gradSubWrap.style.display = this.#tool === "gradient" ? "flex" : "none";
        const gradLbl = this.#el("span"); gradLbl.textContent = "Mode:"; gradLbl.style.cssText = "font-size:10px;color:var(--pa-text3);margin-right:2px";
        const linBtn = this.#el("button"); linBtn.textContent = "Linear";
        linBtn.classList.toggle("__pa_active", this.#gradientMode === "linear");
        const radBtn = this.#el("button"); radBtn.textContent = "Radial";
        radBtn.classList.toggle("__pa_active", this.#gradientMode === "radial");
        linBtn.addEventListener("click", () => { this.setGradientMode("linear"); linBtn.classList.add("__pa_active"); radBtn.classList.remove("__pa_active"); });
        radBtn.addEventListener("click", () => { this.setGradientMode("radial"); radBtn.classList.add("__pa_active"); linBtn.classList.remove("__pa_active"); });
        gradSubWrap.append(gradLbl, linBtn, radBtn);
        toolbar.appendChild(gradSubWrap);

        toolbar.appendChild(this.#sep());

        // Color swatches
        const cpair = this.#el("div", { class: "__pa_cpair" });
        this._secColorEl = this.#el("div", { class: "__pa_cswatch __pa_sec", title: "Secondary color (right-click palette / swatch)" });
        this._priColorEl = this.#el("div", { class: "__pa_cswatch __pa_pri", title: "Primary color (click to edit)" });
        this._priPicker  = this.#el("input", { type:"color", class:"__pa_hpicker", value: this.#primaryColor });
        this._secPicker  = this.#el("input", { type:"color", class:"__pa_hpicker", value: this.#secondaryColor });
        this._priColorEl.addEventListener("click", () => this._priPicker.click());
        this._secColorEl.addEventListener("click", () => this._secPicker.click());
        this._priPicker.addEventListener("input", e => this.setColor(e.target.value));
        this._secPicker.addEventListener("input", e => this.setColor(e.target.value, true));
        cpair.append(this._secColorEl, this._priColorEl, this._priPicker, this._secPicker);
        toolbar.appendChild(cpair);

        toolbar.appendChild(this.#sep());

        // Brush size
        const brushOut = this.#el("span", { class: "__pa_valout" }); brushOut.textContent = this.#brushSize;
        const brushSlider = this.#el("input", { type:"range", class:"__pa_range", min:"1", max:"8", value:String(this.#brushSize), title:"Brush size" });
        brushSlider.addEventListener("input", e => { this.setBrushSize(+e.target.value); brushOut.textContent = this.#brushSize; });
        const brushCtrl = this.#el("div", { class:"__pa_ctrl" });
        brushCtrl.append(this.#lbl("Brush"), brushSlider, brushOut);
        toolbar.appendChild(brushCtrl);

        toolbar.appendChild(this.#sep());

        // Opacity
        const opacOut = this.#el("span", { class:"__pa_valout" }); opacOut.textContent = "100%";
        const opacSlider = this.#el("input", { type:"range", class:"__pa_range", min:"0", max:"100", value:"100", title:"Opacity" });
        opacSlider.addEventListener("input", e => { this.setOpacity(e.target.value / 100); opacOut.textContent = e.target.value + "%"; });
        const opacCtrl = this.#el("div", { class:"__pa_ctrl" });
        opacCtrl.append(this.#lbl("Opacity"), opacSlider, opacOut);
        toolbar.appendChild(opacCtrl);

        toolbar.appendChild(this.#sep());

        // Width slider
        const wOut = this.#el("span", { class: "__pa_valout" }); wOut.textContent = this.#cols;
        const wSlider = this.#el("input", { type:"range", class:"__pa_range", min:"2", max:"128", value:String(this.#cols), title:"Canvas width" });
        wSlider.style.width = "70px";
        wSlider.addEventListener("input", e => {
            const v = Math.max(2, Math.min(128, +e.target.value));
            wOut.textContent = v;
        });
        wSlider.addEventListener("change", e => {
            const v = Math.max(2, Math.min(128, +e.target.value));
            this.resize(v, this.#rows);
            wOut.textContent = this.#cols;
            hSlider.value = String(this.#rows);
            hOut.textContent = this.#rows;
        });
        const wCtrl = this.#el("div", { class:"__pa_ctrl" });
        wCtrl.append(this.#lbl("W"), wSlider, wOut);
        toolbar.appendChild(wCtrl);

        // Height slider
        const hOut = this.#el("span", { class: "__pa_valout" }); hOut.textContent = this.#rows;
        const hSlider = this.#el("input", { type:"range", class:"__pa_range", min:"2", max:"128", value:String(this.#rows), title:"Canvas height" });
        hSlider.style.width = "70px";
        hSlider.addEventListener("input", e => {
            const v = Math.max(2, Math.min(128, +e.target.value));
            hOut.textContent = v;
        });
        hSlider.addEventListener("change", e => {
            const v = Math.max(2, Math.min(128, +e.target.value));
            this.resize(this.#cols, v);
            hOut.textContent = this.#rows;
            wSlider.value = String(this.#cols);
            wOut.textContent = this.#cols;
        });
        const hCtrl = this.#el("div", { class:"__pa_ctrl" });
        hCtrl.append(this.#lbl("H"), hSlider, hOut);
        toolbar.appendChild(hCtrl);

        // Store references so resize() can sync them
        this._wSlider = wSlider; this._wOut = wOut;
        this._hSlider = hSlider; this._hOut = hOut;

        toolbar.appendChild(this.#sep());

        // Action buttons
        const actions = [
            { svg:`<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>`, title:"Undo (Ctrl+Z)", fn:()=>this.undo() },
            { svg:`<svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 9.5 20H13"/></svg>`, title:"Redo (Ctrl+Y)", fn:()=>this.redo() },
            { svg:`<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`, title:"Clear Layer", fn:()=>this.clear() },
            { svg:`<svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3"/><path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/><line x1="12" y1="20" x2="12" y2="4"/></svg>`, title:"Flip Horizontal", fn:()=>this.flipHorizontal() },
            { svg:`<svg viewBox="0 0 24 24"><path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3"/><path d="M21 16v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3"/><line x1="4" y1="12" x2="20" y2="12"/></svg>`, title:"Flip Vertical", fn:()=>this.flipVertical() },
            { svg:`<svg viewBox="0 0 24 24"><path d="M21 2v6h-6"/><path d="M21 13a9 9 0 1 1-3-7.7L21 8"/></svg>`, title:"Rotate 90°", fn:()=>this.rotate90() },
        ];
        for (const a of actions) {
            const btn = this.#el("button", { class:"__pa_tbtn", title:a.title });
            btn.innerHTML = a.svg;
            btn.addEventListener("click", a.fn);
            toolbar.appendChild(btn);
        }

        toolbar.appendChild(this.#sep());

        // Grid toggle
        const gridBtn = this.#el("button", {
            class: "__pa_tbtn" + (this.#showGrid ? " __pa_active" : ""),
            title: "Toggle Grid (G)",
        });
        gridBtn.innerHTML = `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`;
        gridBtn.addEventListener("click", () => {
            this.#showGrid = !this.#showGrid;
            gridBtn.classList.toggle("__pa_active", this.#showGrid);
            this.render();
        });
        this.#gridBtnEl = gridBtn;
        toolbar.appendChild(gridBtn);

        // Symmetry
        const symSel = this.#el("select", { class:"__pa_sel", title:"Symmetry" });
        for (const [v, l] of [["none","Sym: None"],["horizontal","Sym: H"],["vertical","Sym: V"],["both","Sym: Both"]]) {
            const opt = this.#el("option", { value: v }); opt.textContent = l; symSel.appendChild(opt);
        }
        symSel.addEventListener("change", e => this.setSymmetry(e.target.value));
        toolbar.appendChild(symSel);

        toolbar.appendChild(this.#sep());

        // ── Import Image button ───────────────────────────────────────────────
        const imgImportBtn = this.#el("button", { class:"__pa_tbtn", title:"Import image → pixels" });
        imgImportBtn.innerHTML = `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
        imgImportBtn.addEventListener("click", () => {
            const inp = document.createElement("input");
            inp.type   = "file";
            inp.accept = "image/*";
            inp.style.display = "none";
            inp.addEventListener("change", async () => {
                const file = inp.files[0];
                if (!file) return;
                try {
                    await this.importImage(file, { newLayer: true });
                } catch(_) { /* status already set */ }
                inp.remove();
            });
            document.body.appendChild(inp);
            inp.click();
        });
        toolbar.appendChild(imgImportBtn);

        toolbar.appendChild(this.#sep());

        // ── Export PNG / GIF ──────────────────────────────────────────────────
        // Export
        const pngBtn = this.#el("button", { class:"__pa_tbtn", title:"Export PNG (Ctrl+S)" });
        pngBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
        pngBtn.addEventListener("click", () => this.downloadPNG());
        toolbar.appendChild(pngBtn);

        const gifBtn = this.#el("button", { class:"__pa_tbtn", title:"Export GIF" });
        gifBtn.innerHTML = `<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 12h4"/><path d="M7 9v6"/><path d="M14 9v1.5a1.5 1.5 0 0 1-1.5 1.5H12"/></svg>`;
        gifBtn.addEventListener("click", () => this.downloadGIF());
        toolbar.appendChild(gifBtn);

        // ── .pxart Save / Open ────────────────────────────────────────────────
        const pxartSaveBtn = this.#el("button", { class:"__pa_tbtn", title:"Save project as .pxart (Ctrl+Shift+P)" });
        pxartSaveBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`;
        pxartSaveBtn.addEventListener("click", () => this.downloadPXART());
        toolbar.appendChild(pxartSaveBtn);

        const pxartOpenBtn = this.#el("button", { class:"__pa_tbtn", title:"Open .pxart project" });
        pxartOpenBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><polyline points="9 14 12 17 15 14"/></svg>`;
        pxartOpenBtn.addEventListener("click", () => {
            const inp = document.createElement("input");
            inp.type   = "file";
            inp.accept = ".pxart";
            inp.style.display = "none";
            inp.addEventListener("change", async () => {
                const file = inp.files[0];
                if (!file) return;
                try {
                    await this.importPXART(file);
                } catch(_) { /* status already set */ }
                inp.remove();
            });
            document.body.appendChild(inp);
            inp.click();
        });
        toolbar.appendChild(pxartOpenBtn);

        toolbar.appendChild(this.#sep());

        // Theme toggle
        const themeBtn = this.#el("button", { class:"__pa_tbtn", title:"Toggle light/dark theme" });
        const moonSVG = `<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
        const sunSVG  = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
        themeBtn.innerHTML = moonSVG;
        themeBtn.addEventListener("click", () => {
            const next = this.#theme === "dark" ? "light" : "dark";
            this.setTheme(next);
            themeBtn.innerHTML = next === "dark" ? moonSVG : sunSVG;
        });
        toolbar.appendChild(themeBtn);

        // ── Body ─────────────────────────────────────────────────────────────
        const body = this.#el("div", { class:"__pa_body" });

        // ── Left panel ────────────────────────────────────────────────────────
        const lPanel = this.#el("div", { class:"__pa_lpanel" });

        const palSec = this.#el("div", { class:"__pa_psec" });
        palSec.style.flex = "1";
        palSec.style.overflowY = "auto";
        const palTitle = this.#el("div", { class:"__pa_ptitle" }); palTitle.textContent = "Palette";
        this.#paletteEl = this.#el("div", { class:"__pa_pgrid" });
        this.#rebuildPalette();

        const addRow    = this.#el("div", { class:"__pa_addrow" });
        const addPicker = this.#el("input", { type:"color", class:"__pa_cpick", value:"#ff8800" });
        const addBtn    = this.#el("button", { class:"__pa_abtn" }); addBtn.textContent = "+ Add";
        addBtn.addEventListener("click", () => {
            if (!this.#palette.includes(addPicker.value)) {
                this.#palette.push(addPicker.value);
                this.#rebuildPalette();
            }
        });
        addRow.append(addPicker, addBtn);
        palSec.append(palTitle, this.#paletteEl, addRow);
        lPanel.appendChild(palSec);

        // ── Canvas wrap ───────────────────────────────────────────────────────
        const canvasWrap = this.#el("div", { class:"__pa_cwrap" });
        this.#canvasEl   = this.#el("canvas", { class:"__pa_canvas" });
        canvasWrap.appendChild(this.#canvasEl);
        this._canvasWrap = canvasWrap;

        // ── Right panel ───────────────────────────────────────────────────────
        const rPanel = this.#el("div", { class:"__pa_rpanel" });

        // Layers section
        const lSec    = this.#el("div", { class:"__pa_lsec" });
        const lHead   = this.#el("div", { class:"__pa_sechead" });
        const lTitle  = this.#el("div", { class:"__pa_ptitle" }); lTitle.style.margin = "0"; lTitle.textContent = "Layers";
        const addLBtn = this.#el("button", { class:"__pa_ibtn", title:"Add layer" });
        addLBtn.innerHTML = `<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
        addLBtn.addEventListener("click", () => this.addLayer());
        lHead.append(lTitle, addLBtn);
        this.#layerListEl = this.#el("div", { class:"__pa_llist" });
        this.#rebuildLayerList();
        lSec.append(lHead, this.#layerListEl);
        rPanel.appendChild(lSec);

        // Animation section
        const aSec = this.#el("div", { class:"__pa_asec" });
        const aTitle = this.#el("div", { class:"__pa_ptitle" }); aTitle.textContent = "Animation";

        this.#framesStripEl = this.#el("div", { class:"__pa_fstrip" });
        this.#rebuildFramesStrip();

        const aBtns = this.#el("div", { class:"__pa_abtns" });
        const addFrBtn = this.#el("button", { class:"__pa_abtn2" }); addFrBtn.textContent = "+ Frame";
        addFrBtn.addEventListener("click", () => { if (!this.#isPlaying) this.addFrame(); });

        this.#playBtnEl = this.#el("button", { class:"__pa_abtn2" }); this.#playBtnEl.textContent = "▶ Play";
        this.#playBtnEl.addEventListener("click", () => this.#isPlaying ? this.stopAnimation() : this.playAnimation());

        const stopBtn = this.#el("button", { class:"__pa_abtn2" }); stopBtn.textContent = "■ Stop";
        stopBtn.addEventListener("click", () => this.stopAnimation());
        aBtns.append(addFrBtn, this.#playBtnEl, stopBtn);

        const fpsRow = this.#el("div", { class:"__pa_fpsr" });
        const fpsLbl = this.#el("span", { class:"__pa_lbl" }); fpsLbl.textContent = "FPS";
        const fpsIn  = this.#el("input", { type:"number", class:"__pa_fpsi", min:"1", max:"60", value:String(this.#fps) });
        fpsIn.addEventListener("input", e => { this.#fps = Math.max(1, +e.target.value); });
        fpsRow.append(fpsLbl, fpsIn);

        this.#frameIndEl = this.#el("div", { class:"__pa_find" }); this.#frameIndEl.textContent = "Frame 1 / 1";

        aSec.append(aTitle, this.#framesStripEl, aBtns, fpsRow, this.#frameIndEl);
        rPanel.appendChild(aSec);

        // ── Status bar ────────────────────────────────────────────────────────
        const statusBar = this.#el("div", { class:"__pa_status" });
        this.#statusCell = document.createTextNode("Cell (0, 0)");
        this.#statusText = document.createTextNode("Ready");
        this.#statusSize = document.createTextNode(`${this.#cols}×${this.#rows}`);
        const sizeSpan = this.#el("span"); sizeSpan.style.marginLeft = "auto";
        sizeSpan.appendChild(this.#statusSize);
        statusBar.append(
            this.#wrapText(this.#statusCell),
            this.#wrapText(this.#statusText),
            sizeSpan,
        );

        // ── Assemble ──────────────────────────────────────────────────────────
        body.append(lPanel, canvasWrap, rPanel);
        root.append(toolbar, body, statusBar);
        this.#container.appendChild(root);

        this.#updateColorSwatches();
    }

    // ─── Canvas initialisation ───────────────────────────────────────────────

    #initCanvas() {
        this.#resizeCanvas();
        // Window.resized covers explicit window resize events
        Window.resized = () => { this.#resizeCanvas(); this.render(); };
        // ResizeObserver covers panel show/hide from CSS media queries
        // (e.g. mobile breakpoints hide side panels → canvas wrap grows)
        if (typeof ResizeObserver !== "undefined") {
            this._ro = new ResizeObserver(() => { this.#resizeCanvas(); this.render(); });
            this._ro.observe(this._canvasWrap);
        }
    }

    /** Resize the backing bitmap to match the CSS wrapper, accounting for DPR. */
    #resizeCanvas() {
        const wrap = this._canvasWrap;
        // getBoundingClientRect gives accurate CSS px even during mid-layout transitions
        const rect = wrap.getBoundingClientRect();
        const W    = Math.floor(rect.width  || wrap.clientWidth  || 600);
        const H    = Math.floor(rect.height || wrap.clientHeight || 500);

        // Always re-read DPR — it can change on mobile (rotation, zoom, display)
        this.#dpr = window.devicePixelRatio || 1;

        // Integer cell size → no sub-pixel cell boundaries in CSS space
        const fitW = Math.floor((W * 0.85) / this.#cols);
        const fitH = Math.floor((H * 0.85) / this.#rows);
        const fit  = Math.floor(Math.min(fitW, fitH));
        // Always use one integer CSS pixel size for both axes.
        // This guarantees same-size square cells even in non-square containers.
        this.#cellSize = Math.max(2, fit);

        // Integer offsets → grid origin lands on a whole CSS pixel
        this.#viewX    = Math.round((W - this.#cols * this.#cellSize) / 2);
        this.#viewY    = Math.round((H - this.#rows * this.#cellSize) / 2);
        this.#viewScale = 1;

        // Physical bitmap = CSS size × DPR for crisp Retina / hi-DPI rendering
        this.#canvasEl.style.width  = W + "px";
        this.#canvasEl.style.height = H + "px";
        this.#canvasEl.width        = Math.round(W * this.#dpr);
        this.#canvasEl.height       = Math.round(H * this.#dpr);

        // Apply the DPR scale ONCE so every draw call in render() works in CSS pixels.
        // This is the canonical browser pattern and eliminates accumulation drift that
        // makes grid lines uneven on hi-DPI / mobile when switching between breakpoints.
        this.#ctx = this.#canvasEl.getContext("2d");
        this.#ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
    }
    // ─── Event binding ───────────────────────────────────────────────────────

    #bindEvents() {
        const el = this.#canvasEl;

        // Make canvas focusable so Keyboard can attach here
        // (events.js notes standard elements must be focusable)
        el.tabIndex = 0;
        el.style.outline = "none";

        // Prevent the default context menu (same behavior you already had)
        Window.contextMenu = (e) => e.preventDefault();

        // Attach unified input handlers from events.js
        pointer.attach(el);
        Keyboard.attach(el);

        // Wire the Keyboard utility's keyPressed callback → our shortcut handler.
        // Keyboard.attach(el) above re-routes events to the canvas; assigning
        // keyPressed here ensures our handler is called for every keydown on it.
        Keyboard.keyPressed = (e) => this.#onKey(e);

        // ─────────────────────────────────────────────────────────────
        // Pointer routing (mouse/pointer/touch all funnel through here)
        // ─────────────────────────────────────────────────────────────

        // When pressed: focus canvas so keyboard shortcuts work immediately
        pointer.mousePressed = (e) => {
            el.focus();

            // Touch events: keep your existing pinch/draw logic
            if (e && "touches" in e) return this.#onTouchStart(e);

            // Mouse/pointer:
            this.#onPointerDown(e);
        };

        pointer.mouseDragged = (e) => {
            // Touch drag:
            if (e && "touches" in e) return this.#onTouchMove(e);

            // Mouse drag:
            this.#onPointerMove(e);
        };

        pointer.mouseMoved = (e) => {
            // Optional: ignore touch hover updates
            if (e && "touches" in e) return;

            // Mouse move updates status cell + previews
            this.#onPointerMove(e);
        };

        pointer.mouseReleased = (e) => {
            // Touch end:
            if (e && ("changedTouches" in e || "touches" in e)) return this.#onTouchEnd(e);

            // Mouse/pointer up:
            this.#onPointerUp(e);
        };

        pointer.mouseWheel = (e) => {
            this.#onWheel(e);
        };

        // Safety: if the pointer leaves the element, end drawing
        // (pointer util may not fire a release in all leave cases)
        pointer.mouseLeave = (e) => this.#onPointerUp(e);


        // ─────────────────────────────────────────────────────────────
        // Window lifecycle hooks (events.js)
        // ─────────────────────────────────────────────────────────────
        Window.blurredEvent = () => {
            // Ensure we don't get stuck drawing when the tab loses focus
            this.#isDrawing = false;
            this.#isPanning = false;
            this.#previewPixels = null;
            this.render();
        };

        // If you want: respond to focus/visibility/fullscreen changes
        // Window.focusedEvent = () => this.#setStatus("Focused");
        // Window.visibilityChanged = () => this.#setStatus(Window.visible ? "Visible" : "Hidden");
        // Window.fullscreenChanged = () => this.#setStatus(Window.fullscreen ? "Fullscreen" : "Windowed");

        // ─────────────────────────────────────────────────────────────
        // Controller hooks (events.js)
        // ─────────────────────────────────────────────────────────────
        controller.connectedEvent = (gamepad) => {
            this.#setStatus(`Controller connected: ${gamepad?.id ?? "Gamepad"}`);
        };

        controller.disconnectedEvent = (gamepad) => {
            this.#setStatus(`Controller disconnected: ${gamepad?.id ?? "Gamepad"}`);
        };

    }
    // ─── Pointer / mouse events ──────────────────────────────────────────────

    #onPointerDown(e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        const cell = this.#screenToCell(e.offsetX, e.offsetY);

        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            this.#isPanning = true;
            this.#panStart  = { x: e.clientX, y: e.clientY, vx: this.#viewX, vy: this.#viewY };
            return;
        }

        const isRight = e.button === 2;
        const color   = isRight ? this.#secondaryColor : this.#primaryColor;

        switch (this.#tool) {
            case "pen":
                this.#isDrawing = true;
                this.#applyPen(cell, color);
                break;
            case "eraser":
                this.#isDrawing = true;
                this.#applyEraser(cell);
                break;
            case "fill":
                this.#applyFill(cell, color);
                this.#saveHistory();
                break;
            case "eyedropper":
                this.#applyEyedropper(cell, isRight);
                break;
            case "line":
            case "rect":
            case "ellipse":
                this.#isDrawing     = true;
                this.#drawStartCell = { ...cell };
                this.#previewPixels = new Map();
                break;
            case "select":
                this.#selection = { x1: cell.x, y1: cell.y, x2: cell.x, y2: cell.y };
                this.#isDrawing = true;
                break;
            case "gradient":
                this.#isDrawing     = true;
                this.#drawStartCell = { ...cell };
                break;
            case "move":
                this.#isPanning = true;
                this.#panStart  = { x: e.clientX, y: e.clientY, vx: this.#viewX, vy: this.#viewY };
                break;
        }
        this.#lastDrawnCell = { ...cell };
    }

    #onPointerMove(e) {
        const cell = this.#screenToCell(e.offsetX, e.offsetY);
        if (this.#statusCell) this.#statusCell.textContent = `Cell (${cell.x}, ${cell.y})`;

        if (this.#isPanning) {
            this.#viewX = this.#panStart.vx + (e.clientX - this.#panStart.x);
            this.#viewY = this.#panStart.vy + (e.clientY - this.#panStart.y);
            this.render();
            return;
        }
        if (!this.#isDrawing) return;

        const isRight = e.buttons === 2;
        const color   = isRight ? this.#secondaryColor : this.#primaryColor;

        switch (this.#tool) {
            case "pen":    this.#drawLine(this.#lastDrawnCell, cell, color); break;
            case "eraser": this.#drawLine(this.#lastDrawnCell, cell, null);  break;
            case "line":   this.#previewPixels = this.#calcLine(this.#drawStartCell, cell); break;
            case "rect":   this.#previewPixels = this.#calcRect(this.#drawStartCell, cell, color); break;
            case "ellipse":this.#previewPixels = this.#calcEllipse(this.#drawStartCell, cell, color); break;
            case "select":
                this.#selection.x2 = cell.x;
                this.#selection.y2 = cell.y;
                break;
            case "gradient":
                // Just update last cell for the preview line; apply on mouseup
                break;
        }
        this.#lastDrawnCell = { ...cell };
        this.render();
    }

    #onPointerUp(e) {
        if (this.#isPanning) { this.#isPanning = false; return; }
        if (!this.#isDrawing) return;

        const isRight = e.button === 2;
        const color   = isRight ? this.#secondaryColor : this.#primaryColor;

        if (this.#previewPixels && this.#previewPixels.size > 0) {
            const layer = this.#activeLayer();
            for (const [key, col] of this.#previewPixels) {
                const [x, y] = key.split(",").map(Number);
                this.#setCell(layer, x, y, col);
            }
            this.#previewPixels = null;
        }

        // Apply gradient on release
        if (this.#tool === "gradient" && this.#drawStartCell && this.#lastDrawnCell) {
            this.#applyGradient(this.#drawStartCell, this.#lastDrawnCell);
        }

        // Show selection badge when selection finishes
        if (this.#tool === "select" && this.#selection) {
            this.#showSelectionBadge();
        }

        this.#isDrawing     = false;
        this.#drawStartCell = null;
        this.#saveHistory();
        this.render();
    }

    // ─── Touch events (pinch-to-zoom + draw) ────────────────────────────────

    #onTouchStart(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const t    = e.touches[0];
            const rect = this.#canvasEl.getBoundingClientRect();
            const fake = { offsetX: t.clientX - rect.left, offsetY: t.clientY - rect.top, button: 0, clientX: t.clientX, clientY: t.clientY };
            this.#isPanning = false;
            this.#panStart  = { x: t.clientX, y: t.clientY, vx: this.#viewX, vy: this.#viewY };
            this.#onPointerDown(fake);
            this.#touchLast = { x: t.clientX, y: t.clientY };
        } else if (e.touches.length === 2) {
            this.#touchPinchDist = this.#pinchDist(e);
        }
    }

    #onTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 2) {
            const d = this.#pinchDist(e);
            if (this.#touchPinchDist) {
                const factor = d / this.#touchPinchDist;
                // zoom around canvas centre
                const W = this.#canvasEl.getBoundingClientRect().width;
                const H = this.#canvasEl.getBoundingClientRect().height;
                this.#zoomView(factor, W / 2, H / 2);
                this.render();
            }
            this.#touchPinchDist = d;
            return;
        }
        if (e.touches.length === 1) {
            const t    = e.touches[0];
            const rect = this.#canvasEl.getBoundingClientRect();
            const fake = { offsetX: t.clientX - rect.left, offsetY: t.clientY - rect.top, buttons: 1, clientX: t.clientX, clientY: t.clientY };
            this.#onPointerMove(fake);
        }
    }

    #onTouchEnd(e) {
        this.#onPointerUp({ button: 0 });
        this.#touchPinchDist = null;
    }

    #pinchDist(e) {
        const a = e.touches[0], b = e.touches[1];
        return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }

    // ─── Wheel zoom ──────────────────────────────────────────────────────────

    #onWheel(e) {
        //e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        this.#zoomView(factor, e.offsetX, e.offsetY);
        this.render();
    }

    #zoomView(factor, cx, cy) {
        const prev         = this.#viewScale;
        this.#viewScale    = Helpers.clamp(this.#viewScale * factor, 0.1, 50);
        const actualFactor = this.#viewScale / prev;
        this.#viewX        = Math.round(cx - (cx - this.#viewX) * actualFactor);
        this.#viewY        = Math.round(cy - (cy - this.#viewY) * actualFactor);
        // Keep #cellSize as the integer base cell size calculated by #resizeCanvas().
        // Zoom is represented only by #viewScale so every rendered cell remains square
        // and grid lines stay evenly spaced after container resizes and wheel zooms.
    }

    // ─── Keyboard shortcuts ──────────────────────────────────────────────────

    /**
     * Central keyboard-shortcut handler. Wired to Keyboard.keyPressed in #bindEvents.
     *
     * Shortcut reference
     * ──────────────────
     * Tools
     *   B / P          Pen (Brush)
     *   E              Eraser
     *   F              Fill (Flood-fill)
     *   I              Eyedropper (pick colour)
     *   L              Line
     *   R              Rectangle
     *   O              Ellipse
     *   T              Gradient
     *   S              Select
     *   M              Move / Pan
     *   H              Flip Horizontal
     *   V (no Ctrl)    Flip Vertical
     *   Q              Rotate 90° CW
     *
     * Canvas / view
     *   G              Toggle grid
     *   K              Toggle checkerboard
     *   + / =          Zoom in
     *   - / _          Zoom out
     *   0              Reset zoom & centre
     *
     * Brush
     *   [ / ,          Brush size  −1
     *   ] / .          Brush size  +1
     *   1–9            Set brush size directly (1 = 1 cell … 8 = 8 cells)
     *
     * History
     *   Ctrl+Z         Undo
     *   Ctrl+Shift+Z   Redo
     *   Ctrl+Y         Redo
     *
     * Selection / clipboard
     *   Escape         Clear selection
     *   Ctrl+A         Select all
     *   Ctrl+C         Copy selection
     *   Ctrl+V         Paste
     *   Ctrl+D         Duplicate selection (copy + paste in place)
     *   Delete / Backspace  Erase selected area (or clear layer if no selection)
     *
     * Layers
     *   Ctrl+Shift+N   Add new layer
     *   Ctrl+Shift+D   Duplicate active layer
     *   Ctrl+E         Merge layer down
     *
     * Frames / animation
     *   Ctrl+J         Duplicate current frame
     *   Space          Play / Pause animation
     *   ArrowLeft      Previous frame
     *   ArrowRight     Next frame
     *
     * Export
     *   Ctrl+S         Export PNG
     *   Ctrl+Shift+S   Export GIF
     *   Ctrl+Shift+P   Save .pxart
     *
     * Theme
     *   Ctrl+\         Toggle dark / light theme
     */
    #onKey(e) {
        // Never fire when focus is inside a form field (FPS input, layer name, etc.)
        const tag = e.target?.tagName;
        if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
        if (e.target?.isContentEditable) return;

        const ctrl  = e.ctrlKey || e.metaKey;
        const shift = e.shiftKey;
        const key   = e.key;
        const lower = key.toLowerCase();
        // ── Ctrl / Meta combos ────────────────────────────────────────────────
        if (ctrl) {
            // History
            if (lower === "z" && !shift)        { e.preventDefault(); this.undo();           return; }
            if (lower === "z" &&  shift)         { e.preventDefault(); this.redo();           return; }
            if (lower === "y")                   { e.preventDefault(); this.redo();           return; }

            // Export
            if (lower === "s" && !shift)         { e.preventDefault(); this.downloadPNG();    return; }
            if (lower === "s" &&  shift)         { e.preventDefault(); this.downloadGIF();    return; }
            if (lower === "p" &&  shift)         { e.preventDefault(); this.downloadPXART();  return; }

            // Clipboard
            if (lower === "a")                   { e.preventDefault(); this.#selectAll();     return; }
            if (lower === "c")                   { e.preventDefault(); this.copySelection();  return; }
            if (lower === "v")                   { e.preventDefault(); this.pasteSelection(); return; }
            if (lower === "d")                   { e.preventDefault(); this.#duplicateSelection(); return; }

            // Layers
            if (lower === "n" && shift)          { e.preventDefault(); this.addLayer();       return; }
            if (lower === "d" && shift)          { e.preventDefault(); this.duplicateLayer(this.#activeLayerIndex); return; }
            if (lower === "e")                   { e.preventDefault(); this.mergeDown(this.#activeLayerIndex); return; }

            // Frames
            if (lower === "j")                   { e.preventDefault(); this.duplicateFrame(this.#activeFrame); return; }

            // Theme toggle
            if (key === "\\" || key === "|")     { e.preventDefault(); this.#toggleTheme();   return; }

            return; // consume unhandled ctrl combos so they don't fall through to tool keys
        }

        // ── Plain keys ────────────────────────────────────────────────────────

        // Escape — clear selection
        if (key === "Escape") { this.clearSelection(); return; }

        // Delete / Backspace — erase selection or clear active layer
        if (key === "Delete" || key === "Backspace") {
            e.preventDefault();
            if (this.#selection) {
                this.#eraseSelection();
            } else {
                this.clear();
            }
            return;
        }

        // Space — play / pause animation
        if (key === " ") {
            e.preventDefault();
            this.#isPlaying ? this.stopAnimation() : this.playAnimation();
            return;
        }

        // Arrow keys — navigate frames
        if (key === "ArrowLeft")  { e.preventDefault(); this.goToFrame(this.#activeFrame - 1); return; }
        if (key === "ArrowRight") { e.preventDefault(); this.goToFrame(this.#activeFrame + 1); return; }

        // Zoom
        if (key === "+" || key === "=") { this.#zoomView(1.25, this.#canvasEl.getBoundingClientRect().width / 2, this.#canvasEl.getBoundingClientRect().height / 2); this.render(); return; }
        if (key === "-" || key === "_") { this.#zoomView(0.80, this.#canvasEl.getBoundingClientRect().width / 2, this.#canvasEl.getBoundingClientRect().height / 2); this.render(); return; }
        if (key === "0")                { this.#resizeCanvas(); this.render(); this.#setStatus("Zoom reset"); return; }

        // Brush size: [ ] , .  and digit keys 1-8
        if (key === "[" || key === ",") { this.setBrushSize(this.#brushSize - 1); return; }
        if (key === "]" || key === ".") { this.setBrushSize(this.#brushSize + 1); return; }
        const digit = parseInt(key, 10);
        if (digit >= 1 && digit <= 8)  { this.setBrushSize(digit); return; }

        // ── Tool / action keys (all case-insensitive, no modifier) ────────────
        const toolMap = {
            b:"pen", p:"pen",
            e:"eraser",
            f:"fill",
            i:"eyedropper",
            l:"line",
            r:"rect",
            o:"ellipse",
            t:"gradient",
            s:"select",
            m:"move",
        };
        if (toolMap[lower]) { this.setTool(toolMap[lower]); return; }

        // Transform
        if (lower === "h")           { this.flipHorizontal(); return; }
        if (lower === "v" && !shift) { this.flipVertical();   return; }
        if (lower === "q")           { this.rotate90();       return; }

        // View toggles
        if (lower === "g") {
            this.#showGrid = !this.#showGrid;
            if (this.#gridBtnEl) this.#gridBtnEl.classList.toggle("__pa_active", this.#showGrid);
            this.render();
            this.#setStatus(this.#showGrid ? "Grid on" : "Grid off");
            return;
        }
        if (lower === "k") {
            this.#showCheckerboard = !this.#showCheckerboard;
            this.render();
            this.#setStatus(this.#showCheckerboard ? "Checkerboard on" : "Checkerboard off");
            return;
        }
    }

    // ─── Shortcut helpers (used only by #onKey) ──────────────────────────────

    /** Select the entire canvas on the active layer */
    #selectAll() {
        this.#selection = { x1: 0, y1: 0, x2: this.#cols - 1, y2: this.#rows - 1 };
        this.#showSelectionBadge();
        this.render();
        this.#setStatus(`Selected all (${this.#cols}×${this.#rows})`);
    }

    /** Copy then paste in place — duplicates pixels within the current selection */
    #duplicateSelection() {
        this.copySelection();
        this.pasteSelection();
    }

    /** Erase (set to transparent) every pixel inside the current selection */
    #eraseSelection() {
        if (!this.#selection) return;
        const layer = this.#activeLayer();
        if (layer.locked) { this.#setStatus("Layer is locked"); return; }
        const { x1, y1, x2, y2 } = this.#selection;
        const sx = Math.min(x1, x2), sy = Math.min(y1, y2);
        const ex = Math.max(x1, x2), ey = Math.max(y1, y2);
        for (let y = sy; y <= ey; y++)
            for (let x = sx; x <= ex; x++)
                this.#setCell(layer, x, y, null);
        this.#saveHistory();
        this.render();
        this.#setStatus(`Erased ${ex - sx + 1}×${ey - sy + 1} selection`);
    }

    /** Toggle between dark and light theme */
    #toggleTheme() {
        const next = this.#theme === "dark" ? "light" : "dark";
        this.setTheme(next);
        // Sync the toolbar moon/sun button if it exists
        const themeBtn = this.#uiRoot?.querySelector("[title='Toggle light/dark theme']");
        if (themeBtn) {
            const moonSVG = `<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
            const sunSVG  = `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
            themeBtn.innerHTML = next === "dark" ? moonSVG : sunSVG;
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  Drawing primitives
    // ═════════════════════════════════════════════════════════════════════════
    //  Drawing primitives
    // ═════════════════════════════════════════════════════════════════════════

    #applyPen(cell, color) {
        const layer = this.#activeLayer();
        if (layer.locked) return;
        for (const c of this.#brushCells(cell)) this.#setCell(layer, c.x, c.y, color);
        this.render();
    }

    #applyEraser(cell) {
        const layer = this.#activeLayer();
        if (layer.locked) return;
        for (const c of this.#brushCells(cell)) this.#setCell(layer, c.x, c.y, null);
        this.render();
    }

    #drawLine(from, to, color) {
        const layer = this.#activeLayer();
        if (layer.locked) return;
        for (const [x, y] of this.#bresenham(from.x, from.y, to.x, to.y))
            for (const c of this.#brushCells({ x, y }))
                this.#setCell(layer, c.x, c.y, color);
    }

    #applyFill(cell, color) {
        const layer = this.#activeLayer();
        if (layer.locked) return;
        const idx    = cell.y * this.#cols + cell.x;
        const target = layer.pixels[idx];
        if (target === color) return;
        const stack = [idx], visited = new Set();
        while (stack.length) {
            const i = stack.pop();
            if (visited.has(i)) continue;
            if (layer.pixels[i] !== target) continue;
            visited.add(i);
            layer.pixels[i] = color;
            const x = i % this.#cols, y = Math.floor(i / this.#cols);
            if (x > 0)              stack.push(i - 1);
            if (x < this.#cols - 1) stack.push(i + 1);
            if (y > 0)              stack.push(i - this.#cols);
            if (y < this.#rows - 1) stack.push(i + this.#cols);
        }
        this.render();
    }

    #applyEyedropper(cell, secondary = false) {
        const color = this.#sampleColor(cell);
        if (!color) return;
        if (secondary) this.#secondaryColor = color;
        else           this.#primaryColor   = color;
        this.#updateColorSwatches();
        this.#setStatus(`Picked: ${color}`);
    }

    #sampleColor(cell) {
        for (let li = this.#layers.length - 1; li >= 0; li--) {
            const l = this.#layers[li];
            if (!l.visible) continue;
            const c = l.pixels[cell.y * this.#cols + cell.x];
            if (c) return c;
        }
        return null;
    }

    // ─── Shape calculation ───────────────────────────────────────────────────

    #calcLine(from, to) {
        const map = new Map(), color = this.#primaryColor;
        for (const [x, y] of this.#bresenham(from.x, from.y, to.x, to.y))
            for (const c of this.#brushCells({ x, y }))
                map.set(`${c.x},${c.y}`, color);
        return map;
    }

    #calcRect(from, to, color) {
        const map = new Map();
        const x0 = Math.min(from.x, to.x), x1 = Math.max(from.x, to.x);
        const y0 = Math.min(from.y, to.y), y1 = Math.max(from.y, to.y);
        for (let x = x0; x <= x1; x++) { map.set(`${x},${y0}`, color); map.set(`${x},${y1}`, color); }
        for (let y = y0 + 1; y < y1; y++) { map.set(`${x0},${y}`, color); map.set(`${x1},${y}`, color); }
        return map;
    }

    #calcEllipse(from, to, color) {
        const map = new Map();
        const cx  = (from.x + to.x) / 2, cy = (from.y + to.y) / 2;
        const rx  = Math.abs(to.x - from.x) / 2, ry = Math.abs(to.y - from.y) / 2;
        const plot = (x, y) => map.set(`${Math.round(cx + x)},${Math.round(cy + y)}`, color);
        let x = 0, y = ry;
        let d1 = ry * ry - rx * rx * ry + 0.25 * rx * rx;
        let dx = 2 * ry * ry * x, dy = 2 * rx * rx * y;
        while (dx < dy) {
            plot(x, y); plot(-x, y); plot(x, -y); plot(-x, -y);
            if (d1 < 0) { x++; dx += 2*ry*ry; d1 += dx + ry*ry; }
            else        { x++; y--; dx += 2*ry*ry; dy -= 2*rx*rx; d1 += dx - dy + ry*ry; }
        }
        let d2 = ry*ry*(x+0.5)*(x+0.5) + rx*rx*(y-1)*(y-1) - rx*rx*ry*ry;
        while (y >= 0) {
            plot(x, y); plot(-x, y); plot(x, -y); plot(-x, -y);
            if (d2 > 0) { y--; dy -= 2*rx*rx; d2 += rx*rx - dy; }
            else        { y--; x++; dx += 2*ry*ry; dy -= 2*rx*rx; d2 += dx - dy + rx*rx; }
        }
        return map;
    }

    // ─── Gradient fill ───────────────────────────────────────────────────────

    /** Parse a hex/rgb/rgba color string into {r,g,b,a} (0–255). */
    #parseColor(str) {
        const c = document.createElement("canvas"); c.width = c.height = 1;
        const x = c.getContext("2d"); x.fillStyle = str; x.fillRect(0,0,1,1);
        const d = x.getImageData(0,0,1,1).data;
        return { r: d[0], g: d[1], b: d[2], a: d[3] };
    }

    /** Lerp t ∈ [0,1] between two {r,g,b,a} values → "#rrggbbaa" string */
    #lerpColor(ca, cb, t) {
        const r = Math.round(ca.r + (cb.r - ca.r) * t);
        const g = Math.round(ca.g + (cb.g - ca.g) * t);
        const b = Math.round(ca.b + (cb.b - ca.b) * t);
        const a = Math.round(ca.a + (cb.a - ca.a) * t);
        return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
    }

    /** Apply a linear or radial gradient from startCell to endCell */
    #applyGradient(startCell, endCell) {
        const layer = this.#activeLayer();
        if (layer.locked) return;

        const ca = this.#parseColor(this.#primaryColor);
        const cb = this.#parseColor(this.#secondaryColor);

        const x0 = startCell.x, y0 = startCell.y;
        const x1 = endCell.x,   y1 = endCell.y;
        const dx = x1 - x0, dy = y1 - y0;
        const lenSq = dx * dx + dy * dy;

        for (let row = 0; row < this.#rows; row++) {
            for (let col = 0; col < this.#cols; col++) {
                let t;
                if (this.#gradientMode === "radial") {
                    // t = distance from start / distance start→end
                    const dist = Math.sqrt((col - x0) ** 2 + (row - y0) ** 2);
                    const maxDist = Math.sqrt(lenSq) || 1;
                    t = dist / maxDist;
                } else {
                    // Project cell centre onto the gradient vector
                    t = lenSq === 0 ? 0 : ((col - x0) * dx + (row - y0) * dy) / lenSq;
                }
                t = Math.max(0, Math.min(1, t));
                // Only paint cells inside the selection (if one exists), or all cells
                if (this.#selection) {
                    const sx = Math.min(this.#selection.x1, this.#selection.x2);
                    const sy = Math.min(this.#selection.y1, this.#selection.y2);
                    const ex = Math.max(this.#selection.x1, this.#selection.x2);
                    const ey = Math.max(this.#selection.y1, this.#selection.y2);
                    if (col < sx || col > ex || row < sy || row > ey) continue;
                }
                layer.pixels[row * this.#cols + col] = this.#lerpColor(ca, cb, t);
            }
        }
        this.render();
    }

    // ─── Selection badge ─────────────────────────────────────────────────────

    /** Show a floating Copy / Paste / Clear bar above the canvas while there's a selection */
    #showSelectionBadge() {
        // Remove any existing badge
        this._canvasWrap?.querySelectorAll(".__pa_selbadge").forEach(b => b.remove());
        if (!this.#selection) return;

        const badge = this.#el("div", { class:"__pa_selbadge" });
        const { x1, y1, x2, y2 } = this.#selection;
        const w = Math.abs(x2 - x1) + 1, h = Math.abs(y2 - y1) + 1;
        const info = document.createElement("span");
        info.textContent = `${w}×${h}`;
        info.style.cssText = "font-size:10px;opacity:.7";

        const mkBtn = (label, fn) => {
            const b = this.#el("button"); b.textContent = label;
            b.addEventListener("click", e => { e.stopPropagation(); fn(); });
            return b;
        };

        const copyBtn  = mkBtn("Copy",  () => this.copySelection());
        const pasteBtn = mkBtn("Paste", () => this.pasteSelection());
        const clearBtn = mkBtn("✕",     () => { this.clearSelection(); badge.remove(); });
        badge.append(info, copyBtn, pasteBtn, clearBtn);

        this._canvasWrap.style.position = "relative";
        this._canvasWrap.appendChild(badge);

        // Auto-remove badge when tool changes
        const orig = this.setTool.bind(this);
        this._removeBadgeOnToolChange = () => badge.remove();
    }

    #setCell(layer, x, y, color) {
        if (x < 0 || x >= this.#cols || y < 0 || y >= this.#rows) return;
        const final = color ? this.#applyOpacity(color, this.#opacity) : null;
        layer.pixels[y * this.#cols + x] = final;
        if (this.#symmetry === "horizontal" || this.#symmetry === "both")
            layer.pixels[y * this.#cols + (this.#cols - 1 - x)] = final;
        if (this.#symmetry === "vertical"   || this.#symmetry === "both")
            layer.pixels[(this.#rows - 1 - y) * this.#cols + x] = final;
        if (this.#symmetry === "both")
            layer.pixels[(this.#rows - 1 - y) * this.#cols + (this.#cols - 1 - x)] = final;
    }

    #applyOpacity(colorStr, opacity) {
        if (opacity >= 1) return colorStr;
        try {
            const c = Color.color(colorStr);
            return `rgba(${c.r},${c.g},${c.b},${(c.a / 255) * opacity})`;
        } catch {
            // fallback: parse #rrggbb manually
            const m = colorStr.match(/^#([0-9a-f]{6})$/i);
            if (m) {
                const r = parseInt(m[1].slice(0,2),16);
                const g = parseInt(m[1].slice(2,4),16);
                const b = parseInt(m[1].slice(4,6),16);
                return `rgba(${r},${g},${b},${opacity.toFixed(3)})`;
            }
            return colorStr;
        }
    }

    #brushCells(center) {
        const cells = [], half = Math.floor(this.#brushSize / 2);
        for (let dy = -half; dy <= half; dy++)
            for (let dx = -half; dx <= half; dx++)
                cells.push({ x: center.x + dx, y: center.y + dy });
        return cells;
    }

    #bresenham(x0, y0, x1, y1) {
        const pts = [];
        let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
        let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx - dy;
        while (true) {
            pts.push([x0, y0]);
            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) { err -= dy; x0 += sx; }
            if (e2 <  dx) { err += dx; y0 += sy; }
        }
        return pts;
    }

    /**
     * Convert a CSS-pixel screen coordinate to a grid cell.
     * KEY FIX: divide by the logical (CSS) effective cell size, not the
     * physical bitmap size.  (Original used #cellSize * #viewScale which is
     * already in logical pixels, so that part was correct; but if the canvas
     * offsetX/Y comes from a DPR-scaled event it would be wrong – here we
     * ensure we always work in CSS px space by accepting CSS-px inputs from
     * the event handlers.)
     */
    #screenToCell(screenX, screenY) {
        const cs = this.#cellSize * this.#viewScale;   // CSS px per cell
        const x  = Math.floor((screenX - this.#viewX) / cs);
        const y  = Math.floor((screenY - this.#viewY) / cs);
        return {
            x: Helpers.clamp(x, 0, this.#cols - 1),
            y: Helpers.clamp(y, 0, this.#rows - 1),
        };
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  Rendering
    // ═════════════════════════════════════════════════════════════════════════

    render() {
        const ctx = this.#ctx;
        if (!ctx) return;

        // Re-apply the DPR transform in case the context was reset by a canvas resize.
        // setTransform is idempotent when dpr hasn't changed.
        ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);

        // Read live theme vars so dark/light switch takes effect immediately
        const style    = getComputedStyle(this.#uiRoot);
        const cBg0     = style.getPropertyValue("--pa-bg0").trim()     || "#0d1117";
        const cAccent  = style.getPropertyValue("--pa-accent").trim()  || "#58a6ff";
        const cBorder  = style.getPropertyValue("--pa-border").trim()  || "#30363d";
        const gridAlpha = this.#theme === "light" ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.13)";
        const cbLight   = this.#theme === "light" ? "#d8dde3" : "#363636";
        const cbDark    = this.#theme === "light" ? "#c8ced6" : "#2a2a2a";

        // All coordinates are now in CSS pixels — DPR is handled by the transform.
        // W/H are the CSS pixel dimensions of the canvas (not the physical bitmap size).
        const W  = Math.round(this.#canvasEl.width  / this.#dpr);
        const H  = Math.round(this.#canvasEl.height / this.#dpr);

        // cs = CSS pixels per cell (integer, no sub-pixel drift)
        const cs = Math.max(1, Math.floor(this.#cellSize * this.#viewScale));
        // ox/oy = CSS pixel offset (already integer from #resizeCanvas)
        const ox = Math.round(this.#viewX);
        const oy = Math.round(this.#viewY);

        ctx.clearRect(0, 0, W, H);

        // Background
        ctx.fillStyle = cBg0;
        ctx.fillRect(0, 0, W, H);

        // Checkerboard – clipped to art boundary
        if (this.#showCheckerboard) {
            this.#drawCheckerboardTo(ctx, this.#cols * cs, this.#rows * cs, Math.max(2, Math.round(cs / 2)), ox, oy, cbLight, cbDark);
        }

        // Layers
        for (const layer of this.#layers) {
            if (!layer.visible) continue;
            ctx.globalAlpha = layer.opacity;
            for (let i = 0; i < layer.pixels.length; i++) {
                if (!layer.pixels[i]) continue;
                const x = i % this.#cols;
                const y = Math.floor(i / this.#cols);
                ctx.fillStyle = layer.pixels[i];
                ctx.fillRect(ox + x * cs, oy + y * cs, cs, cs);
            }
        }
        ctx.globalAlpha = 1;

        // Shape preview
        if (this.#previewPixels && this.#previewPixels.size > 0) {
            ctx.globalAlpha = 0.75;
            for (const [key, color] of this.#previewPixels) {
                const [x, y] = key.split(",").map(Number);
                ctx.fillStyle = color;
                ctx.fillRect(ox + x * cs, oy + y * cs, cs, cs);
            }
            ctx.globalAlpha = 1;
        }

        // Gradient drag preview line
        if (this.#tool === "gradient" && this.#isDrawing && this.#drawStartCell) {
            const sc = this.#lastDrawnCell ?? this.#drawStartCell;
            ctx.save();
            ctx.strokeStyle = cAccent;
            ctx.lineWidth   = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(ox + (this.#drawStartCell.x + 0.5) * cs, oy + (this.#drawStartCell.y + 0.5) * cs);
            ctx.lineTo(ox + (sc.x + 0.5) * cs, oy + (sc.y + 0.5) * cs);
            ctx.stroke();
            // Endpoints
            ctx.setLineDash([]);
            ctx.fillStyle = this.#primaryColor;
            ctx.beginPath(); ctx.arc(ox + (this.#drawStartCell.x + 0.5) * cs, oy + (this.#drawStartCell.y + 0.5) * cs, 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = this.#secondaryColor;
            ctx.beginPath(); ctx.arc(ox + (sc.x + 0.5) * cs, oy + (sc.y + 0.5) * cs, 4, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }

        // Selection
        if (this.#selection) {
            const { x1, y1, x2, y2 } = this.#selection;
            const sx = Math.min(x1, x2), sy = Math.min(y1, y2);
            const sw = Math.abs(x2 - x1) + 1, sh = Math.abs(y2 - y1) + 1;
            ctx.save();
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = "rgba(0,0,0,0.6)";
            ctx.strokeRect(ox + sx * cs + 0.5, oy + sy * cs + 0.5, sw * cs - 1, sh * cs - 1);
            ctx.lineDashOffset = 5;
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.strokeRect(ox + sx * cs + 0.5, oy + sy * cs + 0.5, sw * cs - 1, sh * cs - 1);
            ctx.restore();
        }

        // Symmetry guides
        if (this.#symmetry !== "none") {
            ctx.strokeStyle = "rgba(88,166,255,0.4)";
            ctx.lineWidth   = 1;
            ctx.setLineDash([4, 4]);
            if (this.#symmetry === "horizontal" || this.#symmetry === "both") {
                const midX = ox + (this.#cols / 2) * cs;
                ctx.beginPath(); ctx.moveTo(midX, oy); ctx.lineTo(midX, oy + this.#rows * cs); ctx.stroke();
            }
            if (this.#symmetry === "vertical" || this.#symmetry === "both") {
                const midY = oy + (this.#rows / 2) * cs;
                ctx.beginPath(); ctx.moveTo(ox, midY); ctx.lineTo(ox + this.#cols * cs, midY); ctx.stroke();
            }
            ctx.setLineDash([]);
        }

        // Grid lines — drawn entirely in CSS pixel space.
        // Because cs is an integer and ox/oy are integers, every line lands on
        // exact CSS pixel boundaries. The DPR transform scales them to physical
        // pixels so the browser's sub-pixel AA never creates uneven lines.
        if (this.#showGrid && cs >= 4) {
            ctx.save();
            ctx.strokeStyle = gridAlpha;
            ctx.lineWidth   = 1;
            ctx.beginPath();
            for (let x = 0; x <= this.#cols; x++) {
                const px = ox + x * cs;
                ctx.moveTo(px, oy);
                ctx.lineTo(px, oy + this.#rows * cs);
            }
            for (let y = 0; y <= this.#rows; y++) {
                const py = oy + y * cs;
                ctx.moveTo(ox,                  py);
                ctx.lineTo(ox + this.#cols * cs, py);
            }
            ctx.stroke();
            ctx.restore();
        }

        // Border
        ctx.strokeStyle = cAccent;
        ctx.lineWidth   = 1;
        ctx.strokeRect(ox + 0.5, oy + 0.5, this.#cols * cs - 1, this.#rows * cs - 1);
    }

    // Checkerboard is clipped to [offX, offY, offX+width, offY+height]
    #drawCheckerboardTo(ctx, width, height, cellPx, offX = 0, offY = 0, colorA = "#363636", colorB = "#2a2a2a") {
        const nc = Math.ceil(width  / cellPx) + 1;
        const nr = Math.ceil(height / cellPx) + 1;
        for (let y = 0; y < nr; y++) {
            for (let x = 0; x < nc; x++) {
                ctx.fillStyle = (x + y) % 2 === 0 ? colorA : colorB;
                const px = offX + x * cellPx;
                const py = offY + y * cellPx;
                const cw = Math.min(cellPx, offX + width  - px);
                const ch = Math.min(cellPx, offY + height - py);
                if (cw > 0 && ch > 0) ctx.fillRect(px, py, cw, ch);
            }
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  History
    // ═════════════════════════════════════════════════════════════════════════

    #saveHistory() {
        this.#history.splice(this.#historyIndex + 1);
        const snap = JSON.stringify(this.#layers.map(l => ({ ...l, pixels: [...l.pixels] })));
        this.#history.push(snap);
        if (this.#history.length > this.#maxHistory) this.#history.shift();
        else this.#historyIndex++;
    }

    #loadSnapshot(snap) {
        this.#layers = JSON.parse(snap);
        this.#frames[this.#activeFrame] = this.#layers;
        this.#activeLayerIndex = Helpers.clamp(this.#activeLayerIndex, 0, this.#layers.length - 1);
        this.#rebuildLayerList();
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  GIF export
    // ═════════════════════════════════════════════════════════════════════════

    /** Render a single layers snapshot to a 1-px-per-cell offscreen canvas. */
    #renderLayersToCanvas(layersSnap, background = null) {
        const off = document.createElement("canvas");
        off.width  = this.#cols;
        off.height = this.#rows;
        const c = off.getContext("2d");
        c.imageSmoothingEnabled = false;
        c.clearRect(0, 0, this.#cols, this.#rows);
        if (background) {
            c.fillStyle = background;
            c.fillRect(0, 0, this.#cols, this.#rows);
        }
        for (const layer of layersSnap) {
            if (!layer.visible) continue;
            c.globalAlpha = layer.opacity;
            for (let i = 0; i < layer.pixels.length; i++) {
                if (!layer.pixels[i]) continue;
                c.fillStyle = layer.pixels[i];
                c.fillRect(i % this.#cols, Math.floor(i / this.#cols), 1, 1);
            }
        }
        c.globalAlpha = 1;
        return off;
    }

    #ensureGIFModalStyles() {
        if (document.getElementById("__pa_gif_modal_styles")) return;
        const style = document.createElement("style");
        style.id = "__pa_gif_modal_styles";
        style.textContent = `
.__pa_overlay{position:fixed;inset:0;background:rgba(0,0,0,.55)!important;backdrop-filter:blur(4px);z-index:100000;display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto}
.__pa_modal{box-sizing:border-box;background:#ffffff!important;color:#0b1220!important;border:1px solid rgba(15,23,42,.18);border-radius:14px;box-shadow:0 18px 70px rgba(0,0,0,.45);width:min(94vw,560px);max-width:560px;max-height:calc(100vh - 40px);display:flex;flex-direction:column;overflow:hidden;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
.__pa_mhead{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:18px 20px 14px;border-bottom:1px solid rgba(15,23,42,.12);background:#f8fafc;position:sticky;top:0;z-index:2}
.__pa_mtitle{margin:0;font-size:18px;font-weight:800;line-height:1.2;color:#0b1220}
.__pa_msubtitle{margin:6px 0 0;font-size:12px;line-height:1.45;color:#475569;max-width:420px}
.__pa_mclose{width:34px;height:34px;border-radius:10px;border:1px solid rgba(15,23,42,.18);background:#ffffff;color:#0b1220;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center}
.__pa_mclose:hover{background:#f1f5f9}
.__pa_mbody{padding:16px 20px 18px;overflow:auto}
.__pa_mmeta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
.__pa_mchip{border:1px solid rgba(15,23,42,.14);background:#ffffff;border-radius:12px;padding:10px 11px;min-width:0}
.__pa_mchip span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;margin-bottom:4px}
.__pa_mchip strong{display:block;font-size:13px;font-weight:750;color:#0b1220;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.__pa_previewwrap{display:flex;gap:12px;align-items:center;border:1px solid rgba(15,23,42,.14);background:#f8fafc;border-radius:12px;padding:12px;margin-bottom:14px}
.__pa_preview{width:76px;height:76px;border:1px solid rgba(15,23,42,.18);border-radius:10px;background:#ffffff;image-rendering:pixelated}
.__pa_previewtxt{font-size:12px;line-height:1.45;color:#475569}
.__pa_previewtxt strong{display:block;color:#0b1220;font-size:13px;margin-bottom:2px}
.__pa_mgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.__pa_mrow{display:flex;flex-direction:column;gap:6px;color:#0b1220}
.__pa_mrow label{font-size:12px;font-weight:750;color:#0b1220}
.__pa_mrow small{font-size:11px;line-height:1.35;color:#64748b}
.__pa_mrow input,.__pa_mrow select{height:40px;border-radius:10px;border:1px solid rgba(15,23,42,.18);background:#ffffff;color:#0b1220;padding:0 10px;font-size:13px;outline:none}
.__pa_mrow input:focus,.__pa_mrow select:focus{border-color:#2563eb;box-shadow:0 0 0 4px rgba(37,99,235,.15)}
.__pa_mcheck{display:flex;gap:10px;align-items:flex-start;border:1px solid rgba(15,23,42,.14);background:#ffffff;border-radius:12px;padding:12px;margin:8px 0 12px}
.__pa_mcheck span{font-size:12px;font-weight:700;color:#0b1220}
.__pa_mcheck small{display:block;margin-top:3px;font-size:11px;line-height:1.35;color:#64748b;font-weight:500}
.__pa_mcheck input{margin-top:2px;accent-color:#2563eb}
.__pa_mnote{font-size:11px;line-height:1.45;color:#475569;background:#eff6ff;border:1px solid rgba(37,99,235,.25);border-radius:12px;padding:10px 12px;margin:0 0 12px}
.__pa_mactions{display:flex;gap:10px;margin-top:14px;position:sticky;bottom:0;background:linear-gradient(to top, rgba(255,255,255,1) 70%, rgba(255,255,255,0));padding-top:10px}
.__pa_mbtn{flex:1;height:42px;border-radius:12px;border:1px solid rgba(15,23,42,.18);background:#ffffff;color:#0b1220;font-size:13px;font-weight:800;cursor:pointer}
.__pa_mbtn:hover:not(:disabled){background:#f1f5f9}
.__pa_mbtn.__pa_mprimary{background:#2563eb;color:#ffffff;border-color:#1d4ed8}
.__pa_mbtn.__pa_mprimary:hover:not(:disabled){background:#1d4ed8}
.__pa_mbtn:disabled{opacity:.6;cursor:not-allowed}
.__pa_pbar{height:10px;border-radius:999px;overflow:hidden;border:1px solid rgba(15,23,42,.14);background:#f1f5f9;margin-top:12px;display:none}
.__pa_pfill{height:100%;width:0;background:linear-gradient(90deg,#2563eb,#22c55e);transition:width .12s ease}
.__pa_mstatus{min-height:18px;margin-top:9px;font-size:12px;line-height:1.45;color:#475569}
@media(max-width:560px){.__pa_mgrid{grid-template-columns:1fr}.__pa_mmeta{grid-template-columns:1fr}.__pa_previewwrap{align-items:flex-start}}
        `;
        document.head.appendChild(style);
    }

    #showGIFModal(filename) {
        this.#ensureGIFModalStyles();
        this.#frames[this.#activeFrame] = this.#layers;
        const frameCount = Math.max(1, this.#frames.length);
        const overlay = this.#el("div", { class:"__pa_overlay" });
        const modal   = this.#el("div", { class:"__pa_modal", role:"dialog", "aria-modal":"true" });

        const head = this.#el("div", { class:"__pa_mhead" });
        const titleWrap = document.createElement("div");
        const h3 = this.#el("h3", { class:"__pa_mtitle" });
        h3.textContent = "Export animation as GIF";
        const sub = this.#el("p", { class:"__pa_msubtitle" });
        sub.textContent = "Crisp scaling, clean backgrounds, progress feedback, and safe frame optimization.";
        titleWrap.append(h3, sub);
        const closeBtn = this.#el("button", { class:"__pa_mclose", type:"button", title:"Close" });
        closeBtn.textContent = "×";
        head.append(titleWrap, closeBtn);

        const body = this.#el("div", { class:"__pa_mbody" });
        const meta = this.#el("div", { class:"__pa_mmeta" });
        const chip = (label, value) => {
            const el = this.#el("div", { class:"__pa_mchip" });
            const s = document.createElement("span"); s.textContent = label;
            const b = document.createElement("strong"); b.textContent = value;
            el.append(s, b);
            return el;
        };
        meta.append(chip("Canvas", `${this.#cols}×${this.#rows}`), chip("Frames", String(frameCount)), chip("FPS", String(this.#fps)));

        const previewWrap = this.#el("div", { class:"__pa_previewwrap" });
        const preview = this.#el("canvas", { class:"__pa_preview" });
        preview.width = this.#cols; preview.height = this.#rows;
        const pctx = preview.getContext("2d");
        pctx.imageSmoothingEnabled = false;
        pctx.drawImage(this.#renderLayersToCanvas(this.#frames[this.#activeFrame] ?? this.#layers), 0, 0);
        const previewTxt = this.#el("div", { class:"__pa_previewtxt" });
        previewTxt.innerHTML = `<strong>Preview</strong><span>Showing frame ${this.#activeFrame + 1}. Export uses all frames.</span>`;
        previewWrap.append(preview, previewTxt);

        const grid = this.#el("div", { class:"__pa_mgrid" });
        const field = (label, control, help) => {
            const row = this.#el("div", { class:"__pa_mrow" });
            const l = document.createElement("label"); l.textContent = label;
            const sm = document.createElement("small"); sm.textContent = help;
            row.append(l, control, sm);
            return row;
        };

        const scaleSel = this.#el("select");
        for (const [v, l] of [[1,`1× (${this.#cols}×${this.#rows})`],[2,`2× (${this.#cols*2}×${this.#rows*2})`],[4,`4× (${this.#cols*4}×${this.#rows*4})`],[8,`8× (${this.#cols*8}×${this.#rows*8})`],[12,`12× (${this.#cols*12}×${this.#rows*12})`]]) {
            const o = this.#el("option", { value:String(v) });
            o.textContent = l;
            if (v === 4) o.selected = true;
            scaleSel.appendChild(o);
        }

        const delayIn = this.#el("input", { type:"number", value:String(Math.round(1000/this.#fps)), min:"20", max:"5000", step:"10" });
        const loopSel = this.#el("select");
        for (const [v, l] of [["0","Loop forever"],["1","Play once"]]) {
            const o = this.#el("option", { value:v }); o.textContent = l; loopSel.appendChild(o);
        }
        const bgSel = this.#el("select");
        for (const [v, l] of [["transparent","Transparent"],["white","White"],["black","Black"],["editor","Editor dark"]]) {
            const o = this.#el("option", { value:v }); o.textContent = l; bgSel.appendChild(o);
        }

        grid.append(
            field("Export scale", scaleSel, "4× or higher keeps small pixel art crisp in viewers."),
            field("Delay per frame", delayIn, "Milliseconds. Lower is faster."),
            field("Playback", loopSel, "Most GIFs loop forever."),
            field("Background", bgSel, "Use solid white/black if transparency previews as black.")
        );

        const optRow = this.#el("label", { class:"__pa_mcheck" });
        const optIn = this.#el("input", { type:"checkbox", checked:"checked" });
        const optText = document.createElement("span");
        optText.innerHTML = `Optimize changed pixels<small>Crops frames to changed rectangles when safe. Transparent exports fall back to full frames to avoid black/ghost artifacts.</small>`;
        optRow.append(optIn, optText);

        const note = this.#el("div", { class:"__pa_mnote" });
        note.textContent = "The GIF writer is built in and no longer depends on gif.js or a worker file. If an app blurs tiny GIFs, export at 4× or 8×.";
        const pbar = this.#el("div", { class:"__pa_pbar" });
        const pfill = this.#el("div", { class:"__pa_pfill" });
        pbar.appendChild(pfill);
        const mStatus = this.#el("div", { class:"__pa_mstatus" });
        mStatus.textContent = "Ready to export.";
        const actions = this.#el("div", { class:"__pa_mactions" });
        const cancelBtn = this.#el("button", { class:"__pa_mbtn", type:"button" }); cancelBtn.textContent = "Cancel";
        const exportBtn = this.#el("button", { class:"__pa_mbtn __pa_mprimary", type:"button" }); exportBtn.textContent = "Export GIF";

        const close = () => overlay.remove();
        closeBtn.addEventListener("click", close);
        cancelBtn.addEventListener("click", close);
        overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
        exportBtn.addEventListener("click", () => {
            const scale = parseInt(scaleSel.value, 10);
            const delay = Helpers.clamp(parseInt(delayIn.value, 10) || Math.round(1000 / this.#fps), 20, 5000);
            const loop = parseInt(loopSel.value, 10);
            const bgMap = { transparent:null, white:"#ffffff", black:"#000000", editor:"#0d1117" };
            const options = { optimize: !!optIn.checked, background: bgMap[bgSel.value] ?? null };
            exportBtn.disabled = cancelBtn.disabled = closeBtn.disabled = true;
            pbar.style.display = "block";
            this.#doGIFExport(scale, delay, loop, filename, options,
                pct => { pfill.style.width = Math.max(0, Math.min(100, pct)) + "%"; },
                msg => { mStatus.textContent = msg; },
                () => setTimeout(() => overlay.remove(), 1400)
            );
        });
        actions.append(cancelBtn, exportBtn);
        body.append(meta, previewWrap, grid, optRow, note, pbar, mStatus, actions);
        modal.append(head, body);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        scaleSel.focus();
    }

    #doGIFExport(scale, delay, loop, filename, options, onProgress, onStatus, onDone) {
        this.#encodeGIF(scale, delay, loop, filename, options, onProgress, onStatus, onDone);
    }

    #encodeGIF(scale, delay, loop, filename, options = {}, onProgress, onStatus, onDone) {
        try {
            const W = this.#cols * scale, H = this.#rows * scale;
            const frameCount = Math.max(1, this.#frames.length);
            const background = options.background ?? null;
            onStatus("Preparing crisp pixel frames…");
            onProgress(0);
            const frameImages = [];
            for (let i = 0; i < frameCount; i++) {
                const raw = this.#renderLayersToCanvas(this.#frames[i] ?? this.#layers, background);
                const scaled = document.createElement("canvas");
                scaled.width = W; scaled.height = H;
                const sc = scaled.getContext("2d", { willReadFrequently: true });
                sc.imageSmoothingEnabled = false;
                sc.clearRect(0, 0, W, H);
                sc.drawImage(raw, 0, 0, W, H);
                frameImages.push(sc.getImageData(0, 0, W, H));
                onProgress(Math.round(((i + 1) / frameCount) * 18));
            }
            onStatus("Building GIF color table…");
            const paletteInfo = this.#buildGIFPalette(frameImages);
            onProgress(32);
            const canOptimize = !!options.optimize && !paletteInfo.hasTransparent;
            onStatus(canOptimize ? "Compressing changed frame rectangles…" : "Encoding full frames for transparency-safe output…");
            const indexedFrames = this.#buildGIFFrameRects(frameImages, paletteInfo, canOptimize);
            onProgress(45);
            onStatus("Writing GIF data…");
            const bytes = this.#makeGIFBytes(indexedFrames, W, H, delay, loop, paletteInfo, pct => onProgress(45 + Math.round(pct * 50)));
            const blob = new Blob([new Uint8Array(bytes)], { type:"image/gif" });
            this.#downloadBlob(blob, filename);
            onProgress(100);
            const optimizedCount = indexedFrames.filter(f => f.width !== W || f.height !== H).length;
            onStatus(`Done! ${frameCount} frame(s)${canOptimize ? ` · ${optimizedCount}/${frameCount} optimized` : ""} · ${(blob.size / 1024).toFixed(1)} KB`);
            onDone();
        } catch (err) {
            console.error("PixelArt GIF export failed:", err);
            onStatus("GIF export failed: " + (err?.message ?? err));
        }
    }

    #downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename; a.style.display = "none";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
    }

    #buildGIFPalette(frameImages) {
        const unique = new Map();
        let hasTransparent = false;
        for (const img of frameImages) {
            const d = img.data;
            for (let i = 0; i < d.length; i += 4) {
                if (d[i + 3] < 128) { hasTransparent = true; continue; }
                const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
                unique.set(key, [d[i], d[i + 1], d[i + 2]]);
            }
        }
        const palette = [], exactMap = new Map();
        let transparentIndex = -1;
        if (hasTransparent) { transparentIndex = 0; palette.push([0, 0, 0]); }
        const exactLimit = hasTransparent ? 255 : 256;
        if (unique.size <= exactLimit) {
            for (const [key, rgb] of unique) { exactMap.set(key, palette.length); palette.push(rgb); }
            if (palette.length === 0) palette.push([0, 0, 0]);
            return { palette, exactMap, transparentIndex, hasTransparent, quantized:false };
        }
        const start = palette.length;
        for (let r = 0; r < 6; r++) for (let g = 0; g < 7; g++) for (let b = 0; b < 6; b++) {
            palette.push([Math.round(r * 255 / 5), Math.round(g * 255 / 6), Math.round(b * 255 / 5)]);
        }
        return { palette, exactMap, transparentIndex, hasTransparent, quantized:true, quantStart:start };
    }

    #buildGIFFrameRects(frameImages, paletteInfo, optimize) {
        const frames = [];
        let previous = null;
        for (const img of frameImages) {
            const full = this.#imageDataToGIFIndices(img, paletteInfo);
            let rect = { left:0, top:0, width:img.width, height:img.height, indices:full };
            if (optimize && previous) {
                let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
                for (let y = 0; y < img.height; y++) {
                    const row = y * img.width;
                    for (let x = 0; x < img.width; x++) {
                        const p = row + x;
                        if (full[p] !== previous[p]) {
                            if (x < minX) minX = x; if (y < minY) minY = y;
                            if (x > maxX) maxX = x; if (y > maxY) maxY = y;
                        }
                    }
                }
                if (maxX < minX || maxY < minY) {
                    rect = { left:0, top:0, width:1, height:1, indices:[previous[0] ?? 0] };
                } else {
                    const w = maxX - minX + 1, h = maxY - minY + 1;
                    const cropped = new Array(w * h);
                    for (let y = 0; y < h; y++) {
                        const src = (minY + y) * img.width + minX, dst = y * w;
                        for (let x = 0; x < w; x++) cropped[dst + x] = full[src + x];
                    }
                    rect = { left:minX, top:minY, width:w, height:h, indices:cropped };
                }
            }
            frames.push(rect);
            previous = full;
        }
        return frames;
    }

    #makeGIFBytes(frames, width, height, delayMs, loop, paletteInfo, onProgress) {
        const palette = paletteInfo.palette;
        const colorTableSize = 1 << Math.max(1, Math.ceil(Math.log2(Math.max(2, palette.length))));
        const colorTableBits = Math.log2(colorTableSize);
        const minCodeSize = Math.max(2, colorTableBits);
        const bytes = [];
        const pushByte = b => bytes.push(b & 255);
        const pushWord = w => { pushByte(w); pushByte(w >> 8); };
        const pushString = s => { for (let i = 0; i < s.length; i++) pushByte(s.charCodeAt(i)); };
        const pushSubBlocks = data => {
            for (let i = 0; i < data.length; i += 255) {
                const chunk = data.slice(i, i + 255); pushByte(chunk.length);
                for (const b of chunk) pushByte(b);
            }
            pushByte(0);
        };
        pushString("GIF89a"); pushWord(width); pushWord(height);
        pushByte(0x80 | ((colorTableBits - 1) & 0x07)); pushByte(0); pushByte(0);
        for (let i = 0; i < colorTableSize; i++) { const [r,g,b] = palette[i] ?? [0,0,0]; pushByte(r); pushByte(g); pushByte(b); }
        if (loop === 0) { pushByte(0x21); pushByte(0xff); pushByte(11); pushString("NETSCAPE2.0"); pushByte(3); pushByte(1); pushWord(0); pushByte(0); }
        const delayCs = Math.max(2, Math.round(delayMs / 10));
        const transparent = paletteInfo.transparentIndex >= 0;
        const transparentIndex = transparent ? paletteInfo.transparentIndex : 0;
        for (let f = 0; f < frames.length; f++) {
            const fr = frames[f];
            pushByte(0x21); pushByte(0xf9); pushByte(4);
            pushByte((2 << 2) | (transparent ? 1 : 0));
            pushWord(delayCs); pushByte(transparentIndex); pushByte(0);
            pushByte(0x2c); pushWord(fr.left); pushWord(fr.top); pushWord(fr.width); pushWord(fr.height); pushByte(0);
            pushByte(minCodeSize); pushSubBlocks(this.#lzwEncodeGIF(fr.indices, minCodeSize));
            onProgress((f + 1) / frames.length);
        }
        pushByte(0x3b);
        return bytes;
    }

    #imageDataToGIFIndices(img, paletteInfo) {
        const d = img.data, out = new Array(img.width * img.height);
        const transparentIndex = paletteInfo.transparentIndex;
        for (let i = 0, p = 0; i < d.length; i += 4, p++) {
            if (d[i + 3] < 128 && transparentIndex >= 0) { out[p] = transparentIndex; continue; }
            if (!paletteInfo.quantized) {
                const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
                out[p] = paletteInfo.exactMap.get(key) ?? 0;
            } else {
                const rq = Math.round(d[i] * 5 / 255), gq = Math.round(d[i + 1] * 6 / 255), bq = Math.round(d[i + 2] * 5 / 255);
                out[p] = Math.min(paletteInfo.quantStart + rq * 42 + gq * 6 + bq, paletteInfo.palette.length - 1);
            }
        }
        return out;
    }
    #lzwEncodeGIF(indices, minCodeSize) {
        // GIF LZW encoder (GIF89a). Uses unsigned operations so output is accepted
        // by strict decoders (e.g. Windows Photos).
        const clearCode = 1 << minCodeSize;
        const endCode = clearCode + 1;

        let codeSize = minCodeSize + 1;
        let nextCode = endCode + 1;

        const out = [];
        let bitBuffer = 0 >>> 0;
        let bitCount = 0;

        let dict;
        const resetDict = () => {
            dict = new Map();
            for (let i = 0; i < clearCode; i++) dict.set(String(i), i);
            codeSize = minCodeSize + 1;
            nextCode = endCode + 1;
        };

        const writeCode = (code) => {
            // Pack codes LSB-first.
            bitBuffer = (bitBuffer | ((code & 0x0FFF) << bitCount)) >>> 0;
            bitCount += codeSize;
            while (bitCount >= 8) {
                out.push(bitBuffer & 0xFF);
                bitBuffer = (bitBuffer >>> 8) >>> 0;
                bitCount -= 8;
            }
        };

        const bumpSize = () => {
            if (codeSize < 12 && nextCode > (1 << codeSize)) codeSize++;
        };

        const addToDict = (key) => {
            if (nextCode < 4096) {
                dict.set(key, nextCode++);
                bumpSize();
            } else {
                // Dictionary full → clear.
                writeCode(clearCode);
                resetDict();
            }
        };

        resetDict();
        writeCode(clearCode);

        if (!indices || indices.length === 0) {
            writeCode(endCode);
            if (bitCount > 0) out.push(bitBuffer & 0xFF);
            return out;
        }

        let phrase = String(indices[0]);
        for (let i = 1; i < indices.length; i++) {
            const k = String(indices[i]);
            const combo = phrase + "," + k;
            if (dict.has(combo)) {
                phrase = combo;
            } else {
                writeCode(dict.get(phrase));
                addToDict(combo);
                phrase = k;
            }
        }

        writeCode(dict.get(phrase));
        writeCode(endCode);
        if (bitCount > 0) out.push(bitBuffer & 0xFF);
        return out;
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  UI helpers
    // ═════════════════════════════════════════════════════════════════════════

    #rebuildPalette() {
        if (!this.#paletteEl) return;
        this.#paletteEl.innerHTML = "";
        for (const color of this.#palette) {
            const swatch = this.#el("div", { class:"__pa_pswatch", title: color });
            swatch.style.background = color;
            swatch.addEventListener("click",       () => this.setColor(color));
            swatch.addEventListener("contextmenu", e => { e.preventDefault(); this.setColor(color, true); });
            this.#paletteEl.appendChild(swatch);
        }
    }

    #rebuildLayerList() {
        if (!this.#layerListEl) return;
        this.#layerListEl.innerHTML = "";
        for (let i = this.#layers.length - 1; i >= 0; i--) {
            const layer = this.#layers[i];
            const row   = this.#el("div", { class: "__pa_lrow" + (i === this.#activeLayerIndex ? " __pa_lactive" : "") });

            // Visibility
            const visBtn = this.#el("button", { class:"__pa_ibtn", title:"Toggle visibility" });
            visBtn.innerHTML = layer.visible
                ? `<svg viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`
                : `<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
            visBtn.addEventListener("click", e => {
                e.stopPropagation();
                layer.visible = !layer.visible;
                this.#rebuildLayerList();
                this.render();
            });

            // Lock
            const lockBtn = this.#el("button", { class:"__pa_ibtn", title:"Toggle lock" });
            lockBtn.innerHTML = layer.locked
                ? `<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
                : `<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
            lockBtn.addEventListener("click", e => {
                e.stopPropagation();
                layer.locked = !layer.locked;
                this.#rebuildLayerList();
            });

            // Name
            const nameEl = this.#el("span", { class:"__pa_lname" });
            nameEl.textContent = layer.name;
            nameEl.addEventListener("dblclick", e => {
                e.stopPropagation();
                const n = prompt("Layer name:", layer.name);
                if (n) { layer.name = n; this.#rebuildLayerList(); }
            });

            // More
            const moreBtn = this.#el("button", { class:"__pa_ibtn", title:"Layer options" });
            moreBtn.innerHTML = `<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>`;
            moreBtn.addEventListener("click", e => { e.stopPropagation(); this.#showLayerMenu(i, e); });

            row.addEventListener("click", () => { this.#activeLayerIndex = i; this.#rebuildLayerList(); });
            row.append(visBtn, lockBtn, nameEl, moreBtn);
            this.#layerListEl.appendChild(row);
        }
    }

    #showLayerMenu(index, evt) {
        document.querySelectorAll(".__pa_ctxmenu").forEach(m => m.remove());
        const menu = this.#el("div", { class:"__pa_ctxmenu" });

        const items = [
            { label:"Duplicate", icon:"⧉", fn:() => this.duplicateLayer(index) },
            { label:"Merge Down", icon:"↓", fn:() => this.mergeDown(index) },
            { sep: true },
            { label:"Delete", icon:"✕", danger:true, fn:() => this.removeLayer(index) },
        ];
        for (const item of items) {
            if (item.sep) { const s = this.#el("div", { class:"__pa_ctxsep" }); menu.appendChild(s); continue; }
            const btn = this.#el("div", { class: "__pa_ctxitem" + (item.danger ? " __pa_danger" : "") });
            btn.innerHTML = `<span style="font-size:12px">${item.icon}</span><span>${item.label}</span>`;
            btn.addEventListener("click", () => { item.fn(); menu.remove(); });
            menu.appendChild(btn);
        }

        document.querySelector('.__pa_root').appendChild(menu);
        const rect = evt.target.getBoundingClientRect();
        menu.style.top  = rect.bottom + 4 + "px";
        menu.style.left = rect.left + "px";
        // Clamp to viewport
        requestAnimationFrame(() => {
            const mr = menu.getBoundingClientRect();
            if (mr.right > window.innerWidth) menu.style.left = (window.innerWidth - mr.width - 8) + "px";
        });
        setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 0);
    }

    /** Rebuild the frame-thumbnail strip in the animation panel. */
    #rebuildFramesStrip() {
        if (!this.#framesStripEl) return;
        this.#framesStripEl.innerHTML = "";
        for (let i = 0; i < this.#frames.length; i++) {
            // ── Wrapper (holds thumb + hover-action buttons) ──────────────────
            const wrap = this.#el("div", { class:"__pa_fthumb-wrap", draggable:"true" });

            // ── Thumbnail canvas ──────────────────────────────────────────────
            const thumb = this.#el("div", {
                class: "__pa_fthumb" + (i === this.#activeFrame ? " __pa_factive" : ""),
                title: `Frame ${i + 1}`,
            });
            const mini = document.createElement("canvas");
            mini.width  = this.#cols;
            mini.height = this.#rows;
            const mc   = mini.getContext("2d");
            const snap = (i === this.#activeFrame) ? this.#layers : this.#frames[i];
            for (const layer of snap) {
                if (!layer.visible) continue;
                mc.globalAlpha = layer.opacity;
                for (let j = 0; j < layer.pixels.length; j++) {
                    if (!layer.pixels[j]) continue;
                    mc.fillStyle = layer.pixels[j];
                    mc.fillRect(j % this.#cols, Math.floor(j / this.#cols), 1, 1);
                }
            }
            mc.globalAlpha = 1;
            thumb.appendChild(mini);

            // Click → go to frame
            thumb.addEventListener("click", () => { if (!this.#isPlaying) this.goToFrame(i); });

            // ── Hover action micro-buttons ────────────────────────────────────
            const menu = this.#el("div", { class:"__pa_fmenu" });

            const dupBtn = this.#el("button", { class:"__pa_fmbtn", title:"Duplicate frame" });
            dupBtn.textContent = "⧉";
            dupBtn.addEventListener("click", e => { e.stopPropagation(); this.duplicateFrame(i); });

            const delBtn = this.#el("button", { class:"__pa_fmbtn __pa_fmbtn-del", title:"Delete frame" });
            delBtn.textContent = "✕";
            delBtn.addEventListener("click", e => { e.stopPropagation(); this.deleteFrame(i); });

            menu.append(dupBtn, delBtn);
            wrap.append(thumb, menu);

            // ── Drag-to-reorder ───────────────────────────────────────────────
            const fi = i; // capture

            wrap.addEventListener("dragstart", e => {
                this.#frameDragIndex = fi;
                e.dataTransfer.effectAllowed = "move";
                requestAnimationFrame(() => thumb.classList.add("__pa_fdragging"));
            });

            wrap.addEventListener("dragend", () => {
                thumb.classList.remove("__pa_fdragging");
                this.#frameDragIndex = null;
                // Clean up any leftover over-indicators
                this.#framesStripEl.querySelectorAll(".__pa_fdragover,.__pa_fdragover-left,.__pa_fdragover-right")
                    .forEach(el => el.classList.remove("__pa_fdragover","__pa_fdragover-left","__pa_fdragover-right"));
            });

            wrap.addEventListener("dragover", e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                // Highlight drop target
                this.#framesStripEl.querySelectorAll(".__pa_fdragover")
                    .forEach(el => el.classList.remove("__pa_fdragover"));
                if (this.#frameDragIndex !== fi) thumb.classList.add("__pa_fdragover");
            });

            wrap.addEventListener("dragleave", () => {
                thumb.classList.remove("__pa_fdragover");
            });

            wrap.addEventListener("drop", e => {
                e.preventDefault();
                thumb.classList.remove("__pa_fdragover");
                const from = this.#frameDragIndex;
                if (from !== null && from !== fi) this.moveFrame(from, fi);
            });

            this.#framesStripEl.appendChild(wrap);
        }
        if (this.#frameIndEl) this.#frameIndEl.textContent = `Frame ${this.#activeFrame + 1} / ${this.#frames.length}`;
    }

    #updateToolButtons() {
        for (const [id, btn] of Object.entries(this._toolButtons || {})) {
            btn.classList.toggle("__pa_active", id === this.#tool);
        }
    }

    #updateColorSwatches() {
        if (this._priColorEl) this._priColorEl.style.background = this.#primaryColor;
        if (this._secColorEl) this._secColorEl.style.background = this.#secondaryColor;
        if (this._priPicker && this.#primaryColor.startsWith("#"))   this._priPicker.value = this.#primaryColor;
        if (this._secPicker && this.#secondaryColor.startsWith("#")) this._secPicker.value = this.#secondaryColor;
    }

    #setStatus(msg) {
        if (this.#statusText) this.#statusText.textContent = msg;
    }

    // ─── DOM micro-helpers ───────────────────────────────────────────────────

    /** Create an element and set class/attribute map. */
    #el(tag, attrs = {}) {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) {
            if (k === "class") el.className = v;
            else el.setAttribute(k, v);
        }
        return el;
    }

    /** Wrap a TextNode in a <span> so it can live in a flex row. */
    #wrapText(textNode) {
        const sp = document.createElement("span");
        sp.appendChild(textNode);
        return sp;
    }

    #lbl(text) {
        const el = this.#el("span", { class:"__pa_lbl" });
        el.textContent = text;
        return el;
    }

    #sep() {
        return this.#el("div", { class:"__pa_sep" });
    }
}