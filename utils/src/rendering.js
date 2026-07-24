'use strict';

// Rendering: creating/resizing/removing the canvas surface a sketch draws
// onto, plus off-main-canvas render targets - a plain in-memory p5.Graphics
// buffer, and a WebGL p5.Framebuffer (render-to-texture). Built directly
// on top of {@link Canvas}, which already owns the single "main" render
// surface; Rendering adds the *additional* surfaces and the couple of
// top-level entry points (createCanvas/createGraphics/createFramebuffer/...)
// a sketch calls to get them.
//
// Wrapped in the same IIFE pattern as the other engine files (see the
// comment at the top of transform.js) so this can be loaded either as a
// sibling <script> tag in the browser or via require() in Node.
(function (root, factory) {
    let Rendering;
    if (typeof module === 'object' && module.exports) {
        Rendering = factory(require('./canvas.js'));
        module.exports = Rendering;
        module.exports.Rendering = Rendering;
    } else {
        if (!root || !root.Canvas) throw new Error('Rendering requires canvas.js to be loaded first.');
        Rendering = factory(root.Canvas);
        root.Rendering = Rendering;
        root.Graphics = Rendering.Graphics;
        root.Framebuffer = Rendering.Framebuffer;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Canvas) {

/**
 * An off-screen drawing surface with its own {@link Canvas}, independent
 * of (and not attached to the page by) the main sketch canvas. Created via
 * {@link Rendering.createGraphics}. Anything that can draw onto a Canvas
 * (Shapes, Text, etc.) can be pointed at `graphics.canvas` the same way it
 * would at the main canvas.
 *
 * @class
 */
class Graphics {
    /**
     * @param {number} [width=800]
     * @param {number} [height=600]
     * @param {string} [ctx='2d'] - `'2d'`, `'webgl'`, or `'webgl2'`.
     */
    constructor(width = 800, height = 600, ctx = '2d') {
        this.canvas = new Canvas({ id: `forge-graphics-${Graphics._id++}`, width, height, ctx });
        this.canvas.create();
        // Off-screen buffers aren't part of the page's layout/paint - keep
        // them out of the flow so they don't visually appear next to the
        // main sketch canvas.
        const el = this.canvas.canvas();
        if (el && el.style) el.style.display = 'none';
    }

    /** @returns {number} Buffer width, in pixels. */
    get width() {
        return this.canvas.width();
    }

    /** @returns {number} Buffer height, in pixels. */
    get height() {
        return this.canvas.height();
    }

    /**
     * Reads a pixel or a rectangular region back from the buffer (2D contexts only).
     * @param {number} [x] @param {number} [y] @param {number} [w] @param {number} [h]
     * @returns {ImageData|Uint8ClampedArray} Region pixel data (`x`/`y` given) or the whole canvas's `ImageData`.
     */
    get(x, y, w, h) {
        const ctx = this.canvas.context();
        if (!ctx || typeof ctx.getImageData !== 'function') throw new Error('Graphics#get() requires a 2D context.');
        if (x === undefined) return ctx.getImageData(0, 0, this.width, this.height);
        return ctx.getImageData(x, y, w || 1, h || 1).data;
    }

    /**
     * Resets the buffer's transformations and drawing state back to defaults, without clearing its pixels.
     * @returns {Graphics} This instance, to allow chaining.
     */
    reset() {
        const ctx = this.canvas.context();
        if (ctx && typeof ctx.resetTransform === 'function') ctx.resetTransform();
        return this;
    }

    /**
     * Removes this buffer's underlying `<canvas>` element and stops any loop it had running.
     * @returns {void}
     */
    remove() {
        this.canvas.noLoop();
        const el = this.canvas.canvas();
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }
}
Graphics._id = 0;

/**
 * A WebGL render target: a texture (plus, optionally, a depth buffer) a
 * scene can be drawn into instead of directly onto the screen, then read
 * back or sampled from like any other texture. Created via {@link
 * Rendering.createFramebuffer}, against an existing WebGL {@link Canvas}.
 *
 * @class
 */
class Framebuffer {
    /**
     * @param {Canvas} canvas - A {@link Canvas} already created with a `'webgl'`/`'webgl2'` context; this Framebuffer renders using that context.
     * @param {Object} [options={}]
     * @param {number} [options.width] - Defaults to the canvas's own width.
     * @param {number} [options.height] - Defaults to the canvas's own height.
     * @param {boolean} [options.depth=true] - Whether to attach a depth renderbuffer.
     */
    constructor(canvas, options = {}) {
        if (canvas.contextType() === canvas.TWO_D) throw new Error('Framebuffer requires a WebGL canvas.');
        this.canvas = canvas;
        this._autoSized = options.width === undefined && options.height === undefined;
        this._width = options.width || canvas.width();
        this._height = options.height || canvas.height();
        this._hasDepth = options.depth !== false;
        this._build();
    }

    _build() {
        const gl = this.canvas.context();
        this._fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);

        this._texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this._texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this._width, this._height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._texture, 0);

        if (this._hasDepth) {
            this._depthBuffer = gl.createRenderbuffer();
            gl.bindRenderbuffer(gl.RENDERBUFFER, this._depthBuffer);
            gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this._width, this._height);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this._depthBuffer);
        }

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`Framebuffer incomplete (status ${status}).`);
    }

    /** @returns {number} Current width, in pixels. */
    get width() { return this._width; }
    /** @returns {number} Current height, in pixels. */
    get height() { return this._height; }
    /** @returns {WebGLTexture} The framebuffer's color texture, for use with `texture()`-style binding. */
    get colorTexture() { return this._texture; }

    /**
     * Toggles autosizing (tracking the parent canvas's size) or returns the current mode.
     * @param {boolean} [value]
     * @returns {boolean} Whether autosizing is enabled after this call.
     */
    autoSized(value) {
        if (value !== undefined) this._autoSized = value;
        return this._autoSized;
    }

    /**
     * Begins drawing shapes to this framebuffer: binds it as the active render target.
     * @returns {Framebuffer} This instance, to allow chaining.
     */
    begin() {
        const gl = this.canvas.context();
        if (this._autoSized && (this._width !== this.canvas.width() || this._height !== this.canvas.height())) {
            this.resize(this.canvas.width(), this.canvas.height());
        }
        this._priorViewport = gl.getParameter(gl.VIEWPORT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
        gl.viewport(0, 0, this._width, this._height);
        return this;
    }

    /**
     * Stops drawing to this framebuffer, restoring the canvas's default render target.
     * @returns {Framebuffer} This instance, to allow chaining.
     */
    end() {
        const gl = this.canvas.context();
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (this._priorViewport) gl.viewport(...this._priorViewport);
        return this;
    }

    /**
     * Runs `drawFn` with this framebuffer bound as the render target, then restores the previous target automatically.
     * @param {function(): void} drawFn
     * @returns {Framebuffer} This instance, to allow chaining.
     */
    draw(drawFn) {
        this.begin();
        try { drawFn(); } finally { this.end(); }
        return this;
    }

    /**
     * Resizes the framebuffer, rebuilding its texture/depth-buffer storage.
     * @param {number} width @param {number} height
     * @returns {Framebuffer} This instance, to allow chaining.
     */
    resize(width, height) {
        this._width = width;
        this._height = height;
        this.remove();
        this._build();
        return this;
    }

    /**
     * Reads a pixel or region of pixels back from the framebuffer.
     * @param {number} [x=0] @param {number} [y=0] @param {number} [w=1] @param {number} [h=1]
     * @returns {Uint8Array} RGBA bytes for the requested region.
     */
    get(x = 0, y = 0, w = 1, h = 1) {
        const gl = this.canvas.context();
        const pixels = new Uint8Array(w * h * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._fbo);
        gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return pixels;
    }

    /**
     * Deletes this framebuffer's GPU resources (texture, depth buffer, and the framebuffer object itself).
     * @returns {void}
     */
    remove() {
        const gl = this.canvas.context();
        if (this._texture) gl.deleteTexture(this._texture);
        if (this._depthBuffer) gl.deleteRenderbuffer(this._depthBuffer);
        if (this._fbo) gl.deleteFramebuffer(this._fbo);
    }
}

/**
 * Top-level entry points for creating and managing render surfaces:
 * the main sketch canvas, off-screen {@link Graphics} buffers, and WebGL
 * {@link Framebuffer} render targets.
 *
 * @namespace
 */
const Rendering = {
    Graphics,
    Framebuffer,

    /**
     * Creates the main `<canvas>` element for a sketch. Thin, explicit
     * wrapper over `new Canvas(options).create()` (i.e. p5.js's
     * `createCanvas(w, h, renderer)`, expanded to this engine's option object).
     *
     * @param {Object} [options={}] - Forwarded to `new Canvas()` - see {@link Canvas} for the full list.
     * @returns {Canvas} The created, ready-to-draw-on canvas.
     */
    createCanvas(options = {}) {
        return new Canvas(options).create();
    },

    /**
     * Creates an off-screen graphics buffer with its own canvas and drawing state, independent of the main sketch canvas.
     * @param {number} [width=800] @param {number} [height=600] @param {string} [ctx='2d']
     * @returns {Graphics}
     */
    createGraphics(width = 800, height = 600, ctx = '2d') {
        return new Graphics(width, height, ctx);
    },

    /**
     * Creates a WebGL framebuffer (render-to-texture target) against an existing WebGL canvas.
     * @param {Canvas} canvas - Must already have been created with a `'webgl'`/`'webgl2'` context.
     * @param {Object} [options={}] - See the {@link Framebuffer} constructor.
     * @returns {Framebuffer}
     */
    createFramebuffer(canvas, options = {}) {
        return new Framebuffer(canvas, options);
    },

    /**
     * Removes the given canvas's `<canvas>` element from the page and stops its loop.
     * @param {Canvas} canvas
     * @returns {void}
     */
    noCanvas(canvas) {
        canvas.noLoop();
        const el = canvas.canvas();
        if (el && el.parentNode) el.parentNode.removeChild(el);
    },

    /**
     * Resizes an existing canvas's backing store and CSS size in place.
     * @param {Canvas} canvas @param {number} width @param {number} height
     * @returns {Canvas} The same canvas instance, resized.
     */
    resizeCanvas(canvas, width, height) {
        const el = canvas.canvas();
        if (!el) throw new Error('Rendering.resizeCanvas() requires a canvas that has already been created().');
        el.width = width;
        el.height = height;
        el.style.width = `${width}px`;
        el.style.height = `${height}px`;
        const ctx = canvas.context();
        if (canvas.contextType() !== canvas.TWO_D) ctx.viewport(0, 0, width, height);
        return canvas;
    },

    /**
     * Sets a WebGL context attribute (`alpha`, `antialias`, `depth`, `premultipliedAlpha`, `preserveDrawingBuffer`, `stencil`, ...) for record-keeping/inspection. Real context attributes must be requested at creation time (`canvas.getContext(type, attributes)`); this stores the intent alongside the canvas for the engine's own reference, since Canvas#create() doesn't currently accept a custom attributes bag.
     * @param {Canvas} canvas
     * @param {string} key
     * @param {*} value
     * @returns {Canvas} The same canvas instance.
     */
    setAttributes(canvas, key, value) {
        canvas._forgeAttributes = canvas._forgeAttributes || {};
        canvas._forgeAttributes[key] = value;
        return canvas;
    },

    /**
     * Clears the depth buffer of a WebGL canvas (2D canvases have no depth buffer and are a no-op).
     * @param {Canvas} canvas
     * @returns {void}
     */
    clearDepth(canvas) {
        if (canvas.contextType() === canvas.TWO_D) return;
        const gl = canvas.context();
        gl.clear(gl.DEPTH_BUFFER_BIT);
    },

    /**
     * Returns the raw rendering context for direct/advanced access, mirroring p5.js's `drawingContext`.
     * @param {Canvas} canvas
     * @returns {RenderingContext}
     */
    drawingContext(canvas) {
        return canvas.context();
    }
};

return Rendering;
});