'use strict';

// Environment: everything about the sketch's surroundings that isn't
// drawing itself - the browser window/display, the cursor, fullscreen
// state, per-frame timing (frameCount/deltaTime), accessible text
// descriptions of the canvas, and URL introspection.
//
// Wrapped in the same IIFE pattern as the other engine files (see the
// comment at the top of transform.js) so this can be loaded either as a
// sibling <script> tag in the browser or via require() in Node.
(function (root, factory) {
    let Environment;
    if (typeof module === 'object' && module.exports) {
        Environment = factory(require('./transform.js'));
        module.exports = Environment;
        module.exports.Environment = Environment;
    } else {
        if (!root || !root.Transform) throw new Error('Environment requires transform.js to be loaded first.');
        Environment = factory(root.Transform);
        root.Environment = Environment;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Transform) {

/**
 * Everything about a sketch's surroundings that isn't drawing itself:
 * the browser window/display, the mouse cursor, fullscreen state,
 * per-frame timing, accessible descriptions, and the page URL. Wraps a
 * {@link Canvas} instance so screenToWorld()/worldToScreen() can read its
 * size, and (for 3D sketches) an optional {@link Camera}-like object with
 * `viewMatrix()`/`projectionMatrix()` methods.
 *
 * @class
 */
class Environment {
    /**
     * @param {Canvas} canvas - A {@link Canvas} instance (created or not) this Environment describes.
     * @param {Object} [options={}] - Extra configuration.
     * @param {{viewMatrix: function(): Float32Array, projectionMatrix: function(): Float32Array}} [options.camera] - Camera whose matrices screenToWorld()/worldToScreen() should use in WebGL sketches. Optional; 2D coordinates are used directly when omitted.
     */
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.camera = options.camera || null;

        /** @type {number} Number of frames drawn since the sketch started. Call {@link Environment#tick} once per frame to advance it. */
        this.frameCount = 0;
        /** @type {number} Milliseconds it took to draw the last frame. */
        this.deltaTime = 0;
        this._lastTick = null;
        this._targetFrameRate = 60;
        this._windowResizedCallback = null;

        if (typeof window !== 'undefined') {
            window.addEventListener('resize', () => {
                if (typeof this._windowResizedCallback === 'function') this._windowResizedCallback();
            });
        }
    }

    // -----------------------------------------------------------------
    // Per-frame timing - call once per draw() from a Sketch/render loop.
    // -----------------------------------------------------------------

    /**
     * Advances {@link Environment#frameCount} and recomputes {@link
     * Environment#deltaTime}. Intended to be called once at the top of
     * every draw call (e.g. from `Sketch`'s tick).
     *
     * @param {number} [now] - Current timestamp, in milliseconds. Defaults to `performance.now()`/`Date.now()`.
     * @returns {Environment} This instance, to allow chaining.
     */
    tick(now) {
        const t = now ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
        this.deltaTime = this._lastTick === null ? 0 : t - this._lastTick;
        this._lastTick = t;
        this.frameCount++;
        return this;
    }

    /**
     * Returns the target frame rate most recently requested via {@link
     * Environment#setTargetFrameRate} (or the Canvas's own {@link
     * Canvas#frameRate}, if one was given).
     *
     * @returns {number} Target frames per second.
     */
    getTargetFrameRate() {
        if (this.canvas && typeof this.canvas.frameRate === 'function') {
            const measured = this.canvas.frameRate();
            if (typeof measured === 'number' && !Number.isNaN(measured)) return this._targetFrameRate;
        }
        return this._targetFrameRate;
    }

    /**
     * Sets the target frame rate, forwarding to the underlying Canvas if one is attached.
     * @param {number} fps
     * @returns {Environment} This instance, to allow chaining.
     */
    setTargetFrameRate(fps) {
        this._targetFrameRate = fps;
        if (this.canvas && typeof this.canvas.frameRate === 'function') this.canvas.frameRate(fps);
        return this;
    }

    // -----------------------------------------------------------------
    // Window / display
    // -----------------------------------------------------------------

    /** @returns {number} Width of the browser's viewport, in pixels (`0` outside a browser). */
    get windowWidth() {
        return typeof window !== 'undefined' ? window.innerWidth : 0;
    }

    /** @returns {number} Height of the browser's viewport, in pixels (`0` outside a browser). */
    get windowHeight() {
        return typeof window !== 'undefined' ? window.innerHeight : 0;
    }

    /** @returns {number} Width of the screen display, in pixels (`0` outside a browser). */
    get displayWidth() {
        return typeof screen !== 'undefined' ? screen.width : 0;
    }

    /** @returns {number} Height of the screen display, in pixels (`0` outside a browser). */
    get displayHeight() {
        return typeof screen !== 'undefined' ? screen.height : 0;
    }

    /** @returns {boolean} `true` if the browser tab/window is currently focused. */
    get focused() {
        return typeof document !== 'undefined' ? document.hasFocus() : false;
    }

    /**
     * Returns (or sets) the display's current pixel density (`window.devicePixelRatio`).
     * @param {number} [density] - When given, stored as the density used by {@link Environment} calculations that need it (does not itself resize the canvas).
     * @returns {number} Current pixel density.
     */
    pixelDensity(density) {
        if (density !== undefined) this._pixelDensity = density;
        if (this._pixelDensity !== undefined) return this._pixelDensity;
        return typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    }

    /** @returns {number} The display's current pixel density, without changing any stored override. */
    displayDensity() {
        return typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    }

    /**
     * Registers the function to call when the browser window is resized.
     * @param {function(): void} callback
     * @returns {Environment} This instance, to allow chaining.
     */
    windowResized(callback) {
        this._windowResizedCallback = callback;
        return this;
    }

    // -----------------------------------------------------------------
    // Cursor / fullscreen
    // -----------------------------------------------------------------

    /**
     * Changes the mouse cursor's appearance over the canvas.
     * @param {string} [type='default'] - A CSS `cursor` value (`'pointer'`, `'crosshair'`, `'grab'`, a URL, ...).
     * @param {number} [x] - Horizontal offset for a custom-image cursor, in pixels.
     * @param {number} [y] - Vertical offset for a custom-image cursor, in pixels.
     * @returns {Environment} This instance, to allow chaining.
     */
    cursor(type = 'default', x, y) {
        const el = this.canvas && typeof this.canvas.canvas === 'function' ? this.canvas.canvas() : null;
        const style = /^https?:|^data:|\.(png|gif|jpg|jpeg|cur)$/i.test(type)
            ? `url(${type})${x !== undefined ? ` ${x} ${y ?? 0}` : ''}, auto`
            : type;
        if (el) el.style.cursor = style;
        else if (typeof document !== 'undefined') document.body.style.cursor = style;
        return this;
    }

    /**
     * Hides the cursor from view while it's over the canvas.
     * @returns {Environment} This instance, to allow chaining.
     */
    noCursor() {
        return this.cursor('none');
    }

    /**
     * Toggles fullscreen mode for the page, or returns the current mode.
     * @param {boolean} [value] - `true` to enter fullscreen, `false` to exit. Omit to just read the current state.
     * @returns {boolean} Whether the page is fullscreen after this call.
     */
    fullscreen(value) {
        if (typeof document === 'undefined') return false;
        if (value === true && !document.fullscreenElement) {
            (document.documentElement.requestFullscreen || (() => {})).call(document.documentElement);
        } else if (value === false && document.fullscreenElement) {
            (document.exitFullscreen || (() => {})).call(document);
        }
        return Boolean(document.fullscreenElement);
    }

    // -----------------------------------------------------------------
    // Accessibility
    // -----------------------------------------------------------------

    /**
     * Creates a screen reader-accessible description of the canvas as a whole.
     * @param {string} text - The description.
     * @returns {Environment} This instance, to allow chaining.
     */
    describe(text) {
        this._applyAriaLabel(text);
        return this;
    }

    /**
     * Creates a screen reader-accessible description for one labeled element/region on the canvas. Descriptions accumulate into one combined label.
     * @param {string} name - A short label for the element (e.g. `'red circle'`).
     * @param {string} text - The description of that element.
     * @returns {Environment} This instance, to allow chaining.
     */
    describeElement(name, text) {
        this._elementDescriptions = this._elementDescriptions || [];
        this._elementDescriptions.push(`${name}: ${text}`);
        this._applyAriaLabel([this._description, ...this._elementDescriptions].filter(Boolean).join('. '));
        return this;
    }

    _applyAriaLabel(text) {
        this._description = text;
        const el = this.canvas && typeof this.canvas.canvas === 'function' ? this.canvas.canvas() : null;
        if (el && typeof el.setAttribute === 'function') el.setAttribute('aria-label', text);
    }

    /**
     * Builds a screen reader-accessible, plain-language text summary of shapes drawn on the canvas.
     * @param {Array<{type: string, [key: string]: *}>} [shapes=[]] - Shape descriptors, e.g. `{type: 'circle', x, y, size}`.
     * @returns {string} A human-readable summary, one shape per line.
     */
    textOutput(shapes = []) {
        if (!shapes.length) return 'This graphic has no labeled shapes yet.';
        return shapes.map(s => `${s.type || 'shape'} at (${s.x ?? '?'}, ${s.y ?? '?'})${s.size ? `, size ${s.size}` : ''}`).join('\n');
    }

    /**
     * Builds a screen reader-accessible description of shapes on the canvas, laid out as a grid the shapes occupy.
     * @param {Array<{type: string, x: number, y: number}>} [shapes=[]] - Shape descriptors.
     * @param {number} [cols=3] - Number of grid columns to bucket shapes into.
     * @param {number} [rows=3] - Number of grid rows to bucket shapes into.
     * @returns {string} A row-by-row description of which shapes fall in which grid cell.
     */
    gridOutput(shapes = [], cols = 3, rows = 3) {
        const w = (this.canvas && this.canvas.width && this.canvas.width()) || 1;
        const h = (this.canvas && this.canvas.height && this.canvas.height()) || 1;
        const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => []));
        for (const s of shapes) {
            const col = Math.min(cols - 1, Math.max(0, Math.floor(((s.x ?? 0) / w) * cols)));
            const row = Math.min(rows - 1, Math.max(0, Math.floor(((s.y ?? 0) / h) * rows)));
            grid[row][col].push(s.type || 'shape');
        }
        return grid.map((row, r) => row.map((cell, c) => `(${r},${c}): ${cell.length ? cell.join(', ') : 'empty'}`).join(' | ')).join('\n');
    }

    // -----------------------------------------------------------------
    // Misc
    // -----------------------------------------------------------------

    /**
     * Prints a message to the browser/Node console.
     * @param {...*} args
     * @returns {void}
     */
    print(...args) {
        console.log(...args);
    }

    /** @returns {string} The sketch's current URL. */
    getURL() {
        return typeof location !== 'undefined' ? location.href : '';
    }

    /** @returns {Object<string, string>} The current URL's query-string parameters, as key-value pairs. */
    getURLParams() {
        if (typeof location === 'undefined') return {};
        return Object.fromEntries(new URLSearchParams(location.search).entries());
    }

    /** @returns {string[]} The segments of the current URL's path. */
    getURLPath() {
        if (typeof location === 'undefined') return [];
        return location.pathname.split('/').filter(Boolean);
    }

    /**
     * Converts 2D screen coordinates to 3D world coordinates, using the
     * attached camera's view/projection matrices (unproject at `z = 0` in
     * clip space). Requires a `camera` to have been passed to the
     * constructor, or set via `env.camera = ...` afterwards.
     *
     * @param {number} sx - Screen-space X, in pixels.
     * @param {number} sy - Screen-space Y, in pixels.
     * @returns {{x: number, y: number, z: number}} The corresponding world-space point.
     * @throws {Error} If no camera is attached.
     */
    screenToWorld(sx, sy) {
        if (!this.camera) throw new Error('Environment#screenToWorld() requires a camera (pass { camera } to the constructor).');
        const w = (this.canvas && this.canvas.width && this.canvas.width()) || 1;
        const h = (this.canvas && this.canvas.height && this.canvas.height()) || 1;
        const ndcX = (sx / w) * 2 - 1;
        const ndcY = 1 - (sy / h) * 2;
        const inv = invert4(Transform.multiply(this.camera.projectionMatrix(), this.camera.viewMatrix()));
        const [x, y, z] = transformPoint(inv, ndcX, ndcY, 0);
        return { x, y, z };
    }

    /**
     * Converts 3D world coordinates to 2D screen coordinates, using the attached camera.
     * @param {number} wx
     * @param {number} wy
     * @param {number} wz
     * @returns {{x: number, y: number}} The corresponding screen-space point, in pixels.
     * @throws {Error} If no camera is attached.
     */
    worldToScreen(wx, wy, wz = 0) {
        if (!this.camera) throw new Error('Environment#worldToScreen() requires a camera (pass { camera } to the constructor).');
        const w = (this.canvas && this.canvas.width && this.canvas.width()) || 1;
        const h = (this.canvas && this.canvas.height && this.canvas.height()) || 1;
        const clip = Transform.multiply(this.camera.projectionMatrix(), this.camera.viewMatrix());
        const [cx, cy, , cw] = transformPointHomogeneous(clip, wx, wy, wz);
        const ndcX = cw !== 0 ? cx / cw : cx;
        const ndcY = cw !== 0 ? cy / cw : cy;
        return { x: (ndcX * 0.5 + 0.5) * w, y: (1 - (ndcY * 0.5 + 0.5)) * h };
    }
}

// -- small local matrix helpers (screenToWorld/worldToScreen only) --------

function transformPointHomogeneous(m, x, y, z) {
    return [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
        m[3] * x + m[7] * y + m[11] * z + m[15]
    ];
}

function transformPoint(m, x, y, z) {
    const [rx, ry, rz, rw] = transformPointHomogeneous(m, x, y, z);
    return rw !== 0 ? [rx / rw, ry / rw, rz / rw] : [rx, ry, rz];
}

// Generic 4x4 matrix inverse (column-major), via cofactor expansion.
function invert4(m) {
    const inv = new Float32Array(16);
    inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
    inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
    inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
    inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
    inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
    inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
    inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
    inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
    inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
    inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
    inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
    inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
    inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
    inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
    inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
    inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];

    let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    if (det === 0) throw new Error('Environment: cannot unproject - camera matrix is not invertible.');
    det = 1 / det;
    for (let i = 0; i < 16; i++) inv[i] *= det;
    return inv;
}

return Environment;
});