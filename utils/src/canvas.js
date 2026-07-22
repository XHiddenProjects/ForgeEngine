'use strict';

// Wrapped in an IIFE - see the comment at the top of Transform.js for why:
// this file is injected as a sibling <script> tag alongside
// Transform.js/shapes.js into the same page, so a top-level `class Canvas`
// here would collide with any other same-named top-level declaration
// sharing that global scope.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        const Canvas = factory(require('./color'));
        module.exports = Canvas;
        module.exports.Canvas = Canvas;
    } else if (root) {
        root.Canvas = factory(root.Color);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Color) {
    if (!Color || typeof Color.color !== 'function' || typeof Color.toString !== 'function') {
        throw new Error('Canvas requires the Color class from color.js.');
    }

    const cssColor = value => Color.toString(Color.color(value));
/**
 * Creates and manages an HTML `<canvas>` element, wrapping either a 2D or
 * WebGL rendering context. Instances are handed to helpers such as `Shapes`
 * to perform the actual drawing. Also supports adding/removing a CSS
 * border around the canvas element itself via {@link Canvas#setBorder}/
 * {@link Canvas#noBorder}, and a small p5.js-style sketch loop via
 * {@link Canvas#init}/{@link Canvas#frame}/{@link Canvas#frameRate}.
 *
 * @class
 */
class Canvas {
    // Private fields must be declared here before they can be used anywhere
    // in the class - this was missing before, which threw a SyntaxError.
    #canvas_id;
    #canvas_width;
    #canvas_height;
    #canvas_bg;
    #canvas_context;
    #canvas;
    #ctx;
    // CSS border drawn around the <canvas> element itself, set via
    // setBorder()/noBorder() - kept separate from #fill_*/#draw_stroke_*
    // below, which are the *drawing* state (the color shapes/text get
    // painted with), so the two concepts can never collide.
    #border_color;
    #border_width;
    // Shared drawing state, set via fill()/noFill()/stroke()/noStroke().
    // Shapes/Text read this (via getFill()/getStroke()) as the default
    // whenever a draw call doesn't pass its own explicit color - a "pullover"
    // of the current Canvas setting into whatever draws onto it next.
    #fill_color;
    #fill_enabled;
    #draw_stroke_color;
    #draw_stroke_width;
    #draw_stroke_enabled;
    // Color interpretation, clipping, blending, and erasing state.
    #color_mode;
    #color_max;
    #clip_defining;
    #erase_active;
    #previous_composite_operation;
    // requestAnimationFrame lifecycle
    #target_fps;
    #current_fps;
    #frame_interval;
    #last_frame_time;
    #last_dispatch_time;
    #raf_id;
    #looping;

    /**
     * @param {Object} [options={}] - Canvas configuration.
     * @param {string} [options.id='forge-engine'] - `id` attribute applied to the created `<canvas>` element.
     * @param {number} [options.width=800] - Canvas width, in pixels.
     * @param {number} [options.height=600] - Canvas height, in pixels.
     * @param {Color|string|number|ArrayLike<number>|Object} [options.bg='#000000'] - Background fill color, used only for 2D contexts.
     * @param {string} [options.ctx='2d'] - Rendering context type to request: `'2d'`, `'webgl'`, or `'webgl2'` (see `Canvas#TWO_D`, `Canvas#WEBGL`, `Canvas#WEBGL2`).
     */
    constructor(options = {}) {
        // constants
        this.TWO_D = '2d';
        this.WEBGL = 'webgl';
        this.WEBGL2 = 'webgl2';

        // Blend-mode constants. Values are intentionally stable public strings,
        // while blendMode() translates them to the native 2D/WebGL operation.
        this.BLEND = 'blend';
        this.ADD = 'add';
        this.DARKEST = 'darkest';
        this.LIGHTEST = 'lightest';
        this.EXCLUSION = 'exclusion';
        this.MULTIPLY = 'multiply';
        this.SCREEN = 'screen';
        this.REPLACE = 'replace';
        this.REMOVE = 'remove';
        this.DIFFERENCE = 'difference';
        this.OVERLAY = 'overlay';
        this.HARD_LIGHT = 'hard-light';
        this.SOFT_LIGHT = 'soft-light';
        this.DODGE = 'dodge';
        this.BURN = 'burn';
        this.SUBTRACT = 'subtract';
        // options
        this.#canvas_id = options.id || 'forge-engine';
        this.#canvas_width = options.width || 800;
        this.#canvas_height = options.height || 600;
        this.#canvas_bg = Color.color(options.bg ?? '#000000');
        this.#canvas_context = options.ctx || this.TWO_D;
        // canvas
        this.#canvas = null;
        this.#ctx = null;
        // border (a CSS border drawn around the <canvas> element itself,
        // set via setBorder()/noBorder() below - not to be confused with
        // stroking shapes/text drawn *onto* the canvas, which is #draw_stroke_*
        // further below)
        this.#border_color = null;
        this.#border_width = 0;
        // shared drawing state - defaults mirror the '#ffffff' fill /
        // no-stroke defaults Shapes/Text used to hardcode individually
        this.#fill_color = Color.color('#ffffff');
        this.#fill_enabled = true;
        this.#draw_stroke_color = Color.color('#000000');
        this.#draw_stroke_width = 1;
        this.#draw_stroke_enabled = false;
        this.#color_mode = 'rgb';
        this.#color_max = [255, 255, 255, 255];
        this.#clip_defining = false;
        this.#erase_active = false;
        this.#previous_composite_operation = 'source-over';
        // requestAnimationFrame lifecycle - defaults to 60fps until
        // frameRate() is called with a different value. #current_fps starts
        // out equal to the target and is then updated with the actually
        // measured rate each time frame() fires.
        this.#target_fps = 60;
        this.#current_fps = 60;
        this.#frame_interval = 1000 / 60;
        this.#last_frame_time = 0;
        this.#last_dispatch_time = 0;
        this.#raf_id = null;
        this.#looping = false;
    }

    /**
     * Creates the underlying `<canvas>` DOM element, obtains its rendering
     * context, applies the configured size/id, fills the background (2D
     * contexts only) or sets the viewport (WebGL contexts), and appends the
     * element to `document.body`.
     *
     * @returns {Canvas} This instance, to allow chaining.
     * @throws {Error} If the requested context type is not supported by the browser.
     */
    create() {
        this.#canvas = document.createElement('canvas');
        this.#canvas.width = this.#canvas_width;
        this.#canvas.height = this.#canvas_height;
        this.#canvas.id = this.#canvas_id;
        this.#canvas.style.width = `${this.#canvas_width}px`;
        this.#canvas.style.height = `${this.#canvas_height}px`;

        // was: this.ctx = this.canvas.getContext(...) -> "this.canvas" doesn't
        // exist (it's a method), and it wrote to a public "ctx" property while
        // context() read from the private "#ctx" field, which was always null.
        this.#ctx = this.#canvas.getContext(this.#canvas_context);

        if (!this.#ctx) {
            throw new Error(`Failed to get "${this.#canvas_context}" context. Is it supported in this browser?`);
        }

        if (this.#canvas_context === this.TWO_D) {
            // Set the canvas background color by default (2D only - a WebGL
            // context doesn't have fillStyle/fillRect, it's cleared via
            // Shapes#clear() instead).
            this.#ctx.fillStyle = cssColor(this.#canvas_bg);
            this.#ctx.fillRect(0, 0, this.#canvas_width, this.#canvas_height);
        } else {
            this.#ctx.viewport(0, 0, this.#canvas_width, this.#canvas_height);
        }

        if (this.#border_color) {
            this.#canvas.style.border = `${this.#border_width}px solid ${cssColor(this.#border_color)}`;
        }

        document.body.appendChild(this.#canvas);
        return this;
    }

    /**
     * Adds (or updates) a CSS border drawn around the `<canvas>` element
     * itself - a visible frame/outline for the canvas, distinct from
     * stroking individual shapes or text drawn *onto* it (see
     * {@link Canvas#stroke} for that). Safe to call before `create()`; the
     * border is applied as soon as the element exists (immediately, if it
     * already does).
     *
     * Named `setBorder`/`noBorder` (rather than `stroke`/`noStroke`) so it
     * can't collide with the shape/text drawing-state methods below.
     *
     * @param {Color|string|number|ArrayLike<number>|Object} color - Border color accepted by {@link Color.color}.
     * @param {number} [width=2] - Border width, in pixels.
     * @returns {Canvas} This instance, to allow chaining.
     */
    setBorder(color, width = 2) {
        this.#border_color = Color.color(color);
        this.#border_width = width;
        if (this.#canvas) {
            this.#canvas.style.border = `${this.#border_width}px solid ${cssColor(this.#border_color)}`;
        }
        return this;
    }

    /**
     * Removes a border previously set with {@link Canvas#setBorder}.
     *
     * @returns {Canvas} This instance, to allow chaining.
     */
    noBorder() {
        this.#border_color = null;
        this.#border_width = 0;
        if (this.#canvas) {
            this.#canvas.style.border = 'none';
        }
        return this;
    }

    /**
     * Sets and immediately paints the canvas background color.
     *
     * @param {...*} values - A Color-compatible value or channel values interpreted
     * according to the current color mode.
     * @returns {Canvas} This instance, to allow chaining.
     */
    background(...values) {
        const value = this.#resolveColor(values);
        this.#canvas_bg = value;
        if (!this.#ctx) return this;
        if (this.#canvas_context === this.TWO_D) {
            this.#ctx.save();
            this.#ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.#ctx.globalCompositeOperation = 'source-over';
            this.#ctx.fillStyle = cssColor(value);
            this.#ctx.fillRect(0, 0, this.#canvas_width, this.#canvas_height);
            this.#ctx.restore();
        } else {
            const r = Color.red(value) / 255;
            const g = Color.green(value) / 255;
            const b = Color.blue(value) / 255;
            const a = Color.alpha(value) / 255;
            this.#ctx.clearColor(r, g, b, a);
            this.#ctx.clear(this.#ctx.COLOR_BUFFER_BIT | this.#ctx.DEPTH_BUFFER_BIT);
        }
        return this;
    }

    /**
     * Starts defining a 2D clipping path.
     *
     * Path-building commands issued through the rendering context after this call
     * contribute to the mask until {@link Canvas#endClip} is called.
     *
     * @returns {Canvas} This instance, to allow chaining.
     * @throws {Error} If the canvas is not using a 2D rendering context.
     */
    beginClip() {
        this.#require2D('beginClip');
        if (this.#clip_defining) throw new Error('A clipping path is already being defined.');
        this.#ctx.beginPath();
        this.#clip_defining = true;
        return this;
    }

    /**
     * Sets the compositing operation used when new pixels are drawn.
     *
     * @param {GlobalCompositeOperation|string} mode - A Canvas 2D composite mode,
     * such as `source-over`, `multiply`, `screen`, `overlay`, or `lighter`.
     * @returns {Canvas} This instance, to allow chaining.
     * @throws {TypeError} If the browser rejects the supplied blend mode.
     */
    blendMode(mode = this.BLEND) {
        if (!this.#ctx) {
            throw new Error('blendMode() requires create() to be called first.');
        }

        const normalized = String(mode).toLowerCase().replace(/_/g, '-');

        if (this.#canvas_context === this.TWO_D) {
            if (normalized === this.SUBTRACT) {
                throw new TypeError('SUBTRACT blend mode is only available in WebGL mode.');
            }

            const operations = {
                [this.BLEND]: 'source-over',
                [this.ADD]: 'lighter',
                [this.DARKEST]: 'darken',
                [this.LIGHTEST]: 'lighten',
                [this.EXCLUSION]: 'exclusion',
                [this.MULTIPLY]: 'multiply',
                [this.SCREEN]: 'screen',
                [this.REPLACE]: 'copy',
                [this.REMOVE]: 'destination-out',
                [this.DIFFERENCE]: 'difference',
                [this.OVERLAY]: 'overlay',
                [this.HARD_LIGHT]: 'hard-light',
                [this.SOFT_LIGHT]: 'soft-light',
                [this.DODGE]: 'color-dodge',
                [this.BURN]: 'color-burn'
            };
            const operation = operations[normalized];
            if (!operation) throw new TypeError(`Unsupported 2D blend mode: ${mode}`);

            const previous = this.#ctx.globalCompositeOperation;
            this.#ctx.globalCompositeOperation = operation;
            if (this.#ctx.globalCompositeOperation !== operation) {
                this.#ctx.globalCompositeOperation = previous;
                throw new TypeError(`The browser does not support blend mode: ${mode}`);
            }
            return this;
        }

        // WebGL's fixed-function blending supports the common modes below.
        // Shader-based modes (DIFFERENCE, OVERLAY, HARD_LIGHT, SOFT_LIGHT,
        // DODGE, and BURN) remain intentionally 2D-only.
        if ([this.DIFFERENCE, this.OVERLAY, this.HARD_LIGHT, this.SOFT_LIGHT,
            this.DODGE, this.BURN].includes(normalized)) {
            throw new TypeError(`${mode} blend mode is only available in 2D mode.`);
        }

        const gl = this.#ctx;
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);

        switch (normalized) {
            case this.BLEND:
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
                break;
            case this.ADD:
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
                break;
            case this.DARKEST:
            case this.LIGHTEST: {
                const ext = this.#canvas_context === this.WEBGL2
                    ? null
                    : gl.getExtension('EXT_blend_minmax');
                const equation = normalized === this.DARKEST
                    ? (gl.MIN ?? ext?.MIN_EXT)
                    : (gl.MAX ?? ext?.MAX_EXT);
                if (equation === undefined) {
                    throw new TypeError(`${mode} is not supported by this WebGL context.`);
                }
                gl.blendEquation(equation);
                gl.blendFunc(gl.ONE, gl.ONE);
                break;
            }
            case this.EXCLUSION:
                gl.blendFunc(gl.ONE_MINUS_DST_COLOR, gl.ONE_MINUS_SRC_COLOR);
                break;
            case this.MULTIPLY:
                gl.blendFunc(gl.DST_COLOR, gl.ZERO);
                break;
            case this.SCREEN:
                gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
                break;
            case this.REPLACE:
                gl.blendFunc(gl.ONE, gl.ZERO);
                break;
            case this.REMOVE:
                gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
                break;
            case this.SUBTRACT:
                gl.blendEquation(gl.FUNC_REVERSE_SUBTRACT);
                gl.blendFunc(gl.ONE, gl.ONE);
                break;
            default:
                throw new TypeError(`Unsupported WebGL blend mode: ${mode}`);
        }
        return this;
    }

    /**
     * Clears every pixel on the canvas to transparent black.
     *
     * @returns {Canvas} This instance, to allow chaining.
     */
    clear() {
        if (!this.#ctx) return this;
        if (this.#canvas_context === this.TWO_D) {
            this.#ctx.save();
            this.#ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.#ctx.clearRect(0, 0, this.#canvas_width, this.#canvas_height);
            this.#ctx.restore();
        } else {
            this.#ctx.clearColor(0, 0, 0, 0);
            this.#ctx.clear(this.#ctx.COLOR_BUFFER_BIT | this.#ctx.DEPTH_BUFFER_BIT);
        }
        return this;
    }

    /**
     * Defines and applies a 2D clipping mask.
     *
     * When a callback is supplied, it receives the 2D context and should add the
     * desired geometry to the current path. Without a callback, the current path
     * is clipped immediately.
     *
     * @param {function(CanvasRenderingContext2D):void} [definePath] - Optional path builder.
     * @param {CanvasFillRule} [fillRule='nonzero'] - The rule used to determine the mask interior.
     * @returns {Canvas} This instance, to allow chaining.
     */
    clip(definePath, fillRule = 'nonzero') {
        this.#require2D('clip');
        if (typeof definePath === 'function') {
            this.#ctx.beginPath();
            definePath(this.#ctx);
        } else if (typeof definePath === 'string') {
            fillRule = definePath;
        }
        this.#ctx.clip(fillRule);
        return this;
    }

    /**
     * Changes how numeric channel values passed to {@link Canvas#fill},
     * {@link Canvas#stroke}, and {@link Canvas#background} are interpreted.
     *
     * @param {'rgb'|'hsl'|'hsb'|'hsv'} mode - The color model to use.
     * @param {...number} maxima - Optional channel maxima. Supply one value for all
     * channels, three for color channels, or four including alpha.
     * @returns {Canvas} This instance, to allow chaining.
     */
    colorMode(mode, ...maxima) {
        const normalized = String(mode).toLowerCase();
        if (!['rgb', 'hsl', 'hsb', 'hsv'].includes(normalized)) {
            throw new TypeError(`Unsupported color mode: ${mode}`);
        }
        this.#color_mode = normalized === 'hsv' ? 'hsb' : normalized;
        if (maxima.length) {
            const values = maxima.length === 1
                ? [maxima[0], maxima[0], maxima[0], maxima[0]]
                : [maxima[0], maxima[1], maxima[2], maxima[3] ?? this.#color_max[3]];
            if (values.some(value => !Number.isFinite(value) || value <= 0)) {
                throw new TypeError('Color-mode maxima must be positive finite numbers.');
            }
            this.#color_max = values;
        } else {
            this.#color_max = this.#color_mode === 'rgb'
                ? [255, 255, 255, 255]
                : [360, 100, 100, 255];
        }
        return this;
    }

    /**
     * Applies the clipping mask started by {@link Canvas#beginClip}.
     *
     * @param {CanvasFillRule} [fillRule='nonzero'] - The clipping fill rule.
     * @returns {Canvas} This instance, to allow chaining.
     */
    endClip(fillRule = 'nonzero') {
        this.#require2D('endClip');
        if (!this.#clip_defining) throw new Error('endClip() requires a matching beginClip().');
        this.#ctx.clip(fillRule);
        this.#clip_defining = false;
        return this;
    }

    /**
     * Starts erasing with subsequently drawn shapes by using destination-out
     * compositing. Call {@link Canvas#noErase} to restore the previous blend mode.
     *
     * @returns {Canvas} This instance, to allow chaining.
     */
    erase() {
        this.#require2D('erase');
        if (!this.#erase_active) {
            this.#previous_composite_operation = this.#ctx.globalCompositeOperation;
            this.#ctx.globalCompositeOperation = 'destination-out';
            this.#erase_active = true;
        }
        return this;
    }

    /**
     * Ends erasing and restores the blend mode active before {@link Canvas#erase}.
     *
     * @returns {Canvas} This instance, to allow chaining.
     */
    noErase() {
        this.#require2D('noErase');
        if (this.#erase_active) {
            this.#ctx.globalCompositeOperation = this.#previous_composite_operation;
            this.#erase_active = false;
        }
        return this;
    }

    // ---------------------------------------------------------------
    // Shared drawing state - fill()/noFill()/stroke()/noStroke()
    // ---------------------------------------------------------------
    // These don't draw anything themselves. They set the *current* fill and
    // stroke settings on this Canvas instance, which helpers built on top of
    // it (Shapes, Text) read back via getFill()/getStroke() and fall back to
    // whenever a draw call is made without its own explicit color - so
    // calling canvas.fill('red') "pulls over" into the next circle/rect/text
    // drawn on that canvas, without needing to pass a color to every call.

    /**
     * Sets the current fill color and enables filling. Shapes/text drawn
     * afterward without an explicit color of their own will use this color.
     *
     * @param {...*} values - A Color-compatible value or channel values interpreted according to the current color mode.
     * @returns {Canvas} This instance, to allow chaining.
     */
    fill(...values) {
        this.#fill_color = this.#resolveColor(values);
        this.#fill_enabled = true;
        return this;
    }

    /**
     * Disables filling for subsequent shapes/text that don't pass their own
     * explicit color, until {@link Canvas#fill} is called again.
     *
     * @returns {Canvas} This instance, to allow chaining.
     */
    noFill() {
        this.#fill_enabled = false;
        return this;
    }

    /**
     * Sets the current stroke color/width and enables stroking. Shapes drawn
     * afterward without their own explicit stroke will use these settings.
     *
     * @param {Color|string|number|ArrayLike<number>|Object} color - Stroke color accepted by {@link Color.color}.
     * @param {number} [width=1] - Stroke width, in pixels.
     * @returns {Canvas} This instance, to allow chaining.
     */
    stroke(color, width = 1) {
        this.#draw_stroke_color = this.#resolveColor([color]);
        this.#draw_stroke_width = width;
        this.#draw_stroke_enabled = true;
        return this;
    }

    /**
     * Disables stroking for subsequent shapes that don't pass their own
     * explicit stroke, until {@link Canvas#stroke} is called again.
     *
     * @returns {Canvas} This instance, to allow chaining.
     */
    noStroke() {
        this.#draw_stroke_enabled = false;
        return this;
    }

    /**
     * Returns the current fill color, for helpers (Shapes, Text) to fall
     * back to when a draw call doesn't specify its own.
     *
     * @returns {?Color} The current fill color, or `null` if filling is disabled (via {@link Canvas#noFill}).
     */
    getFill() {
        return this.#fill_enabled ? Color.toString(this.#fill_color) : null;
    }

    /**
     * Returns the current stroke color/width, for helpers (Shapes, Text) to
     * fall back to when a draw call doesn't specify its own.
     *
     * @returns {?{color: Color, width: number}} The current stroke settings, or `null` if stroking is disabled (the default, until {@link Canvas#stroke} is called).
     */
    getStroke() {
        return this.#draw_stroke_enabled
            ? { color: Color.toString(this.#draw_stroke_color), width: this.#draw_stroke_width }
            : null;
    }

    /**
     * Returns the canvas height configured for this instance.
     *
     * @returns {number} Canvas height, in pixels.
     */
    get HEIGHT() {
        return this.#canvas_height;
    }

    /**
     * Returns the canvas width configured for this instance.
     *
     * @returns {number} Canvas width, in pixels.
     */
    get WIDTH() {
        // was: returned this.#canvas_height (copy/paste bug)
        return this.#canvas_width;
    }

    /**
     * Returns the underlying `<canvas>` DOM element.
     *
     * @returns {HTMLCanvasElement|null} The canvas element, or `null` if `create()` hasn't been called yet.
     */
    canvas() {
        return this.#canvas;
    }

    /**
     * Returns the rendering context obtained for this canvas.
     *
     * @returns {RenderingContext|null} The `2d`, `webgl`, or `webgl2` context, or `null` if `create()` hasn't been called yet.
     */
    context() {
        return this.#ctx;
    }

    /**
     * Returns the type of rendering context this canvas was configured with.
     *
     * @returns {string} One of `'2d'`, `'webgl'`, or `'webgl2'`.
     */
    contextType() {
        return this.#canvas_context;
    }

    /**
     * Runs the page's global `init()` function (if one is defined) once the
     * page has finished loading, then starts the animation loop that drives
     * {@link Canvas#frame}. Safe to call at any point in page load - it
     * waits for the `load` event if the page isn't ready yet, and runs
     * immediately if it already is.
     *
     * @returns {Canvas} This instance, to allow chaining.
     */
    init() {
        if (typeof document === 'undefined') return this;

        const start = () => {
            if (typeof window !== 'undefined' && typeof window.init === 'function') {
                window.init();
            }
            this.frame();
        };

        if (document.readyState === 'complete') {
            start();
        } else {
            window.addEventListener('load', start);
        }
        return this;
    }

    /**
     * Starts the `requestAnimationFrame` loop that calls the page's global
     * `frame()` function on every tick, throttled to the current {@link
     * Canvas#frameRate}. Already-running loops are left alone (calling this
     * more than once doesn't stack up multiple loops). Called automatically
     * by {@link Canvas#init}, but can also be called directly if you don't
     * need the page-load `init()` hook.
     *
     * @returns {Canvas} This instance, to allow chaining.
     */
    frame() {
        if (this.#looping || typeof requestAnimationFrame === 'undefined') return this;
        this.#looping = true;
        this.#last_frame_time = performance.now();
        this.#last_dispatch_time = this.#last_frame_time;

        const tick = (now) => {
            this.#raf_id = requestAnimationFrame(tick);

            const elapsed = now - this.#last_frame_time;
            if (elapsed < this.#frame_interval) return;
            // Measure the actual, real-world gap since the last dispatch for
            // #current_fps - kept separate from #last_frame_time below,
            // which is intentionally phase-corrected (snapped to the
            // frameRate() grid) for throttling, and would otherwise skew the
            // measured rate.
            this.#current_fps = 1000 / (now - this.#last_dispatch_time);
            this.#last_dispatch_time = now;
            // Subtract the remainder (rather than resetting to `now`) so the
            // average call rate tracks frameRate() even if a tick runs late.
            this.#last_frame_time = now - (elapsed % this.#frame_interval);

            if (typeof window !== 'undefined' && typeof window.frame === 'function') {
                window.frame();
            }
        };
        this.#raf_id = requestAnimationFrame(tick);
        return this;
    }

    /**
     * Stops the loop started by {@link Canvas#frame}/{@link Canvas#init}.
     * Call {@link Canvas#frame} again (or {@link Canvas#init}, on the next
     * page load) to resume it.
     *
     * @returns {Canvas} This instance, to allow chaining.
     */
    noLoop() {
        if (this.#raf_id !== null && typeof cancelAnimationFrame !== 'undefined') {
            cancelAnimationFrame(this.#raf_id);
        }
        this.#raf_id = null;
        this.#looping = false;
        return this;
    }

    #require2D(method) {
        if (!this.#ctx || this.#canvas_context !== this.TWO_D) {
            throw new Error(`${method}() requires a created 2D canvas context.`);
        }
    }

    #resolveColor(values) {
        if (values.length === 1 && (typeof values[0] !== 'number' || this.#color_mode === 'rgb')) {
            return Color.color(values[0]);
        }
        if (values.length < 3) return Color.color(...values);

        const [first, second, third, alpha = this.#color_max[3]] = values.map(Number);
        const normalizedAlpha = alpha / this.#color_max[3] * 255;
        if (this.#color_mode === 'rgb') {
            return Color.color(
                first / this.#color_max[0] * 255,
                second / this.#color_max[1] * 255,
                third / this.#color_max[2] * 255,
                normalizedAlpha
            );
        }

        const h = ((first / this.#color_max[0]) % 1 + 1) % 1;
        const s = Math.min(1, Math.max(0, second / this.#color_max[1]));
        const component = Math.min(1, Math.max(0, third / this.#color_max[2]));
        let r, g, b;
        if (this.#color_mode === 'hsl') {
            const chroma = (1 - Math.abs(2 * component - 1)) * s;
            [r, g, b] = this.#hueToRgb(h, chroma, component - chroma / 2);
        } else {
            const chroma = component * s;
            [r, g, b] = this.#hueToRgb(h, chroma, component - chroma);
        }
        return Color.color(r * 255, g * 255, b * 255, normalizedAlpha);
    }

    #hueToRgb(hue, chroma, match) {
        const section = hue * 6;
        const x = chroma * (1 - Math.abs((section % 2) - 1));
        const values = section < 1 ? [chroma, x, 0]
            : section < 2 ? [x, chroma, 0]
            : section < 3 ? [0, chroma, x]
            : section < 4 ? [0, x, chroma]
            : section < 5 ? [x, 0, chroma]
            : [chroma, 0, x];
        return values.map(value => value + match);
    }

    /**
     * Gets the actual, currently-measured frame rate, or sets the target
     * frame rate used to throttle {@link Canvas#frame}. Defaults to `60`
     * until the loop has run - once {@link Canvas#frame} is ticking, calling
     * this with no arguments returns the real elapsed-time-based rate
     * (which may run a little above or below the target depending on how
     * the browser is actually scheduling frames), not just the configured
     * target. Call with a number to change the target (takes effect on the
     * next tick, whether or not the loop is currently running).
     *
     * @param {number} [fps] - Target frames per second to set. Omit to read the current, actually-measured rate instead.
     * @returns {Canvas|number} This instance (for chaining) when setting a new target rate, or the current measured frame rate (a number) when called with no arguments.
     */
    frameRate(fps) {
        if (fps === undefined) return this.#current_fps;
        this.#target_fps = fps;
        this.#frame_interval = 1000 / fps;
        return this;
    }
}

return Canvas;
});