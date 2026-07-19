'use strict';

// This file is loaded two ways (see the identical note in shapes.js):
//  1. In the browser, as a sibling <script> tag alongside Transform.js,
//     canvas.js, and shapes.js, all sharing ONE global scope. 3D text needs
//     Transform's matrix helpers, which are picked up from `window.Transform`
//     (set by Transform.js) below.
//  2. In Node, via require('./text.js'), where Transform is pulled in with
//     require() instead.
//
// Everything is wrapped in an IIFE, and `Transform` is a *local* const
// inside it, so this never collides with the top-level declarations in the
// other engine files even though they share a global scope in the browser.
(function (root, factory) {
    let Text;
    if (typeof module === 'object' && module.exports) {
        Text = factory(require('./transform.js'));
        module.exports = Text;
        module.exports.Text = Text;
    } else {
        if (!root || !root.Transform) throw new Error('Text requires Transform.js to be loaded first.');
        Text = factory(root.Transform);
        root.Text = Text;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Transform) {

const TEXT_VERTEX_SHADER = `
    attribute vec3 aPosition;
    attribute vec2 aTexCoord;

    uniform mat4 uModel;
    uniform mat4 uView;
    uniform mat4 uProjection;

    varying vec2 vTexCoord;

    void main() {
        vTexCoord = aTexCoord;
        gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
    }
`;

const TEXT_FRAGMENT_SHADER = `
    precision mediump float;

    varying vec2 vTexCoord;
    uniform sampler2D uTexture;

    void main() {
        vec4 texColor = texture2D(uTexture, vTexCoord);
        if (texColor.a < 0.01) discard;
        gl_FragColor = texColor;
    }
`;

/**
 * Default text style applied whenever an option isn't explicitly passed to
 * a drawing call. Mutated in place by {@link Text#style} (and by the
 * individual `setXxx()` convenience methods).
 *
 * @typedef {Object} TextStyle
 * @property {string} color - Fill color for the glyphs (any valid CSS color string).
 * @property {?string} background - Background fill drawn behind the text, or `null` for none.
 * @property {number} padding - Padding, in pixels, applied around the text on all sides when `background` is set (2D), or around the rasterized text before it becomes a texture (3D).
 * @property {string} fontFamily - CSS font-family string.
 * @property {number} fontSize - Font size, in pixels.
 * @property {string} fontWeight - CSS font-weight (`'normal'`, `'bold'`, `'400'`, etc).
 * @property {string} fontStyle - CSS font-style (`'normal'`, `'italic'`, `'oblique'`).
 * @property {CanvasTextAlign} align - Horizontal alignment: `'left'`, `'right'`, `'center'`, `'start'`, or `'end'`.
 * @property {CanvasTextBaseline} baseline - Vertical alignment: `'top'`, `'middle'`, `'alphabetic'`, `'bottom'`, etc. 2D only.
 * @property {number} lineHeight - Line height, as a multiple of `fontSize`, used between lines of multi-line text.
 * @property {number} letterSpacing - Extra spacing, in pixels, inserted between characters. `0` uses the browser's native (unspaced) rendering.
 * @property {?string} shadowColor - Drop shadow color, or `null` for no shadow.
 * @property {number} shadowBlur - Drop shadow blur radius, in pixels.
 * @property {number} shadowOffsetX - Drop shadow X offset, in pixels.
 * @property {number} shadowOffsetY - Drop shadow Y offset, in pixels.
 * @property {number} maxWidth - Maximum line width, in pixels, before text is wrapped. `Infinity` disables wrapping.
 */
const DEFAULT_STYLE = {
    color: '#ffffff',
    background: null,
    padding: 4,
    fontFamily: 'sans-serif',
    fontSize: 16,
    fontWeight: 'normal',
    fontStyle: 'normal',
    align: 'left',
    baseline: 'top',
    lineHeight: 1.2,
    letterSpacing: 0,
    shadowColor: null,
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    maxWidth: Infinity
};

/**
 * Draws and styles text on a {@link Canvas} instance.
 *
 * On a `'2d'` canvas, {@link Text#create} draws directly with the Canvas2D
 * text APIs. On a `'webgl'`/`'webgl2'` canvas, {@link Text#create3D}
 * rasterizes the same styled text onto an offscreen 2D canvas, uploads it
 * as a texture, and renders it on a flat, positionable/rotatable plane in
 * 3D space - "3D text" here means text *placed and oriented in 3D world
 * space*, not text extruded into 3D geometry (true glyph extrusion needs a
 * font-parsing library this dependency-free engine doesn't have).
 *
 * Styling (color, background, font, alignment, wrapping, shadow) is shared
 * between both modes - the same {@link TextStyle} produces the same-looking
 * text whether it ends up as pixels on a 2D canvas or as a texture on a 3D
 * plane. (Note: stroking/outlining lives on {@link Canvas#setStroke} now -
 * that draws a border around the `<canvas>` element itself, not around
 * individual glyphs.)
 *
 * @class
 */
class Text {
    // Private fields must be declared here before they can be used anywhere
    // in the class (see the same note in canvas.js).
    #canvas;
    #ctx;
    #type;
    #style;
    #scratch;
    #gl;
    #glProgram;
    #glLocations;
    #glQuad;
    #textureCache;

    /**
     * @param {Canvas} canvas - A {@link Canvas} instance that has already had `create()` called on it.
     * @param {Partial<TextStyle>} [style={}] - Initial style overrides, merged over {@link DEFAULT_STYLE}. Can also be set later via {@link Text#style} or the individual `setXxx()` methods.
     */
    constructor(canvas, style = {}) {
        this.#canvas = canvas;
        this.#ctx = canvas.context();
        this.#type = canvas.contextType();
        // Pull over the canvas's current fill() color as the default text
        // color (falling back to DEFAULT_STYLE.color if fill is disabled via
        // noFill()), so `canvas.fill('red')` followed by `new Text(canvas)`
        // draws red text without needing to pass a color explicitly. An
        // explicit `color` in the `style` argument still wins.
        const inheritedColor = typeof canvas.getFill === 'function' ? canvas.getFill() : null;
        this.#style = {
            ...DEFAULT_STYLE,
            ...(inheritedColor ? { color: inheritedColor } : {}),
            ...style
        };
        this.#scratch = null;
        this.#textureCache = new Map();

        if (this.#type !== '2d') {
            this.#gl = this.#ctx;
            this._initGL3D();
        }
    }

    // ---------------------------------------------------------------
    // Styling - beginner-friendly setters
    // ---------------------------------------------------------------
    // Each of these changes exactly one thing about how text will look and
    // returns `this`, so calls can be chained, e.g.:
    //   text.setColor('#ff0000').setFontSize(32).setBold(true).create('Hi', 10, 10);
    // They're just thin wrappers around style() - use whichever reads
    // easier to you.

    /** @param {string} color - Text fill color (e.g. `'#ff0000'`, `'red'`, `'rgb(255,0,0)'`). @returns {Text} */
    setColor(color) { return this.style({ color }), this; }

    /** @param {?string} color - Background fill color behind the text, or `null`/omit to remove it. @returns {Text} */
    setBackground(color = null) { return this.style({ background: color }), this; }

    /**
     * @param {string} family - CSS font-family (e.g. `'Georgia'`, `'"Comic Sans MS", cursive'`).
     * @param {number} [size] - Optional font size, in pixels, set at the same time.
     * @returns {Text}
     */
    setFont(family, size) {
        const options = { fontFamily: family };
        if (size !== undefined) options.fontSize = size;
        return this.style(options), this;
    }

    /** @param {number} size - Font size, in pixels. @returns {Text} */
    setFontSize(size) { return this.style({ fontSize: size }), this; }

    /** @param {string} family - CSS font-family. @returns {Text} */
    setFontFamily(family) { return this.style({ fontFamily: family }), this; }

    /** @param {boolean} [bold=true] - Whether text should be bold. @returns {Text} */
    setBold(bold = true) { return this.style({ fontWeight: bold ? 'bold' : 'normal' }), this; }

    /** @param {boolean} [italic=true] - Whether text should be italicized. @returns {Text} */
    setItalic(italic = true) { return this.style({ fontStyle: italic ? 'italic' : 'normal' }), this; }

    /** @param {CanvasTextAlign} align - Horizontal alignment: `'left'`, `'center'`, or `'right'`. @returns {Text} */
    setAlign(align) { return this.style({ align }), this; }

    /** @param {CanvasTextBaseline} baseline - Vertical alignment: `'top'`, `'middle'`, or `'bottom'`. 2D only. @returns {Text} */
    setBaseline(baseline) { return this.style({ baseline }), this; }

    /** @param {number} multiplier - Line height as a multiple of font size (e.g. `1.5` for 1.5x spacing). @returns {Text} */
    setLineHeight(multiplier) { return this.style({ lineHeight: multiplier }), this; }

    /** @param {number} pixels - Extra space, in pixels, between letters. `0` for normal spacing. @returns {Text} */
    setLetterSpacing(pixels) { return this.style({ letterSpacing: pixels }), this; }

    /**
     * @param {?string} color - Shadow color, or `null` to remove the shadow.
     * @param {number} [blur=4] - Shadow blur radius, in pixels.
     * @param {number} [offsetX=2] - Shadow X offset, in pixels.
     * @param {number} [offsetY=2] - Shadow Y offset, in pixels.
     * @returns {Text}
     */
    setShadow(color, blur = 4, offsetX = 2, offsetY = 2) {
        return this.style({ shadowColor: color, shadowBlur: blur, shadowOffsetX: offsetX, shadowOffsetY: offsetY }), this;
    }

    /** Removes any shadow set with {@link Text#setShadow}. @returns {Text} */
    removeShadow() { return this.style({ shadowColor: null }), this; }

    /** @param {number} pixels - Padding around the text, in pixels, used when a background is set. @returns {Text} */
    setPadding(pixels) { return this.style({ padding: pixels }), this; }

    /** @param {number} pixels - Maximum line width, in pixels, before text wraps. Pass `Infinity` to disable wrapping. @returns {Text} */
    setMaxWidth(pixels) { return this.style({ maxWidth: pixels }), this; }

    /**
     * Merges the given properties into this instance's default style, used
     * by {@link Text#create}/{@link Text#create3D} whenever a call doesn't
     * override them. Call with no arguments to read the current style. The
     * individual `setXxx()` methods above are convenience wrappers around
     * this for people who'd rather not build a style object by hand.
     *
     * @param {Partial<TextStyle>} [options={}] - Style properties to change.
     * @returns {TextStyle} A shallow copy of the resulting style, for inspection.
     */
    style(options = {}) {
        Object.assign(this.#style, options);
        return { ...this.#style };
    }

    /**
     * Resets the style to engine defaults, discarding any previous
     * {@link Text#style}/`setXxx()` calls.
     *
     * @returns {Text} This instance, to allow chaining.
     */
    resetStyle() {
        this.#style = { ...DEFAULT_STYLE };
        return this;
    }

    // ---------------------------------------------------------------
    // 2D drawing
    // ---------------------------------------------------------------

    /**
     * Draws text at the given position on a 2D canvas. Supports explicit
     * line breaks (`\n`) and, when `maxWidth` is finite, automatic
     * word-wrapping. Options are merged over (without mutating) this
     * instance's current style for the duration of this call only.
     *
     * @param {string} text - The text to draw.
     * @param {number} x - X coordinate, in canvas pixels. Interpreted according to `align`.
     * @param {number} y - Y coordinate, in canvas pixels, of the first line. Interpreted according to `baseline`.
     * @param {Partial<TextStyle>} [options={}] - One-off style overrides for this call.
     * @returns {Text} This instance, to allow chaining.
     * @throws {Error} If the canvas was not created with a `'2d'` context.
     */
    create(text, x, y, options = {}) {
        this._require2D('create');
        const style = { ...this.#style, ...options };
        const ctx = this.#ctx;
        const lines = this._layout(ctx, String(text), style);

        ctx.save();
        this._applyFont(ctx, style);
        ctx.textAlign = style.align;
        ctx.textBaseline = style.baseline;

        if (style.background) {
            this._drawBackground(ctx, lines, x, y, style);
        }

        if (style.shadowColor) {
            ctx.shadowColor = style.shadowColor;
            ctx.shadowBlur = style.shadowBlur;
            ctx.shadowOffsetX = style.shadowOffsetX;
            ctx.shadowOffsetY = style.shadowOffsetY;
        }

        const lineHeight = style.lineHeight * style.fontSize;
        lines.forEach((line, i) => {
            const lineY = y + i * lineHeight;
            if (style.letterSpacing) {
                this._drawSpacedLine(ctx, line, x, lineY, style);
            } else {
                if (style.color) {
                    ctx.fillStyle = style.color;
                    ctx.fillText(line, x, lineY);
                }
            }
        });

        ctx.restore();
        return this;
    }

    /**
     * Measures text as it would be drawn by {@link Text#create} with the
     * given style (this instance's current style, plus any overrides),
     * including line wrapping. Does not draw anything. Works regardless of
     * canvas type (an offscreen 2D context is used for measuring on a
     * WebGL canvas).
     *
     * @param {string} text - The text to measure.
     * @param {Partial<TextStyle>} [options={}] - One-off style overrides for this measurement.
     * @returns {{width: number, height: number, lines: string[]}} Bounding box of the (possibly wrapped/multi-line) text, and the wrapped lines themselves.
     */
    measure(text, options = {}) {
        const style = { ...this.#style, ...options };
        const ctx = this.#type === '2d' ? this.#ctx : this._scratchCtx();
        const lines = this._layout(ctx, String(text), style);

        ctx.save();
        this._applyFont(ctx, style);
        let width = 0;
        for (const line of lines) {
            const w = style.letterSpacing ? this._spacedWidth(ctx, line, style) : ctx.measureText(line).width;
            if (w > width) width = w;
        }
        ctx.restore();

        return {
            width,
            height: lines.length * style.lineHeight * style.fontSize,
            lines
        };
    }

    // ---------------------------------------------------------------
    // 3D drawing
    // ---------------------------------------------------------------

    /**
     * Draws text positioned and oriented in 3D world space, on a WebGL
     * canvas. The text (with the same styling options as {@link
     * Text#create} - color, background, font, shadow, wrapping,
     * etc) is rasterized once onto an offscreen 2D canvas tightly cropped
     * to its content, uploaded as a texture, and rendered on a flat plane
     * sized so it's `size` world-units tall (width follows the text's
     * aspect ratio automatically). Rasterized textures are cached per
     * unique text+style combination, so redrawing the same text/style
     * every frame (e.g. in a render loop) is cheap after the first call.
     *
     * @param {string} text - The text to draw.
     * @param {Object} [options={}] - 3D placement plus any {@link TextStyle} overrides.
     * @param {number} [options.x=0] - Center X position, in world space.
     * @param {number} [options.y=0] - Center Y position, in world space.
     * @param {number} [options.z=0] - Center Z position, in world space.
     * @param {number} [options.rx=0] - Rotation around the X axis, in radians.
     * @param {number} [options.ry=0] - Rotation around the Y axis, in radians.
     * @param {number} [options.rz=0] - Rotation around the Z axis, in radians.
     * @param {number} [options.size=1] - Height of the text plane, in world units. Width is derived from the rasterized text's aspect ratio.
     * @returns {Text} This instance, to allow chaining.
     * @throws {Error} If the canvas was not created with a `'webgl'`/`'webgl2'` context.
     */
    create3D(text, options = {}) {
        this._require3D('create3D');
        const { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, size = 1, ...styleOverrides } = options;
        const style = { ...this.#style, ...styleOverrides };

        const { texture, aspect } = this._getTexture(String(text), style);
        const gl = this.#gl;
        const loc = this.#glLocations;
        const quad = this.#glQuad;

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(this.#glProgram);

        const model = Transform.compose({ x, y, z, rx, ry, rz, sx: size * aspect, sy: size, sz: 1 });
        const view = Transform.identity();
        const canvasAspect = this.#canvas.width() / this.#canvas.height();
        const projection = Transform.perspective((45 * Math.PI) / 180, canvasAspect, 0.1, 100);

        gl.uniformMatrix4fv(loc.uModel, false, model);
        gl.uniformMatrix4fv(loc.uView, false, view);
        gl.uniformMatrix4fv(loc.uProjection, false, projection);

        gl.bindBuffer(gl.ARRAY_BUFFER, quad.positionBuffer);
        gl.enableVertexAttribArray(loc.aPosition);
        gl.vertexAttribPointer(loc.aPosition, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, quad.texcoordBuffer);
        gl.enableVertexAttribArray(loc.aTexCoord);
        gl.vertexAttribPointer(loc.aTexCoord, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(loc.uTexture, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quad.indexBuffer);
        gl.drawElements(gl.TRIANGLES, quad.indexCount, gl.UNSIGNED_SHORT, 0);

        return this;
    }

    /**
     * Clears the cached textures built by {@link Text#create3D}. Useful if
     * you're generating many distinct/dynamic strings (e.g. a score
     * counter) and want to free GPU memory rather than let the cache grow
     * unbounded for the lifetime of the page.
     *
     * @returns {Text} This instance, to allow chaining.
     */
    clearCache() {
        if (this.#gl) {
            for (const { texture } of this.#textureCache.values()) this.#gl.deleteTexture(texture);
        }
        this.#textureCache.clear();
        return this;
    }

    // ---------------------------------------------------------------
    // Internals - shared
    // ---------------------------------------------------------------

    /**
     * @private
     * @param {string} method - Name of the calling method, used in the error message.
     * @throws {Error} If this instance's canvas is not a `'2d'` context.
     */
    _require2D(method) {
        if (this.#type !== '2d') {
            throw new Error(`Text#${method}() requires a "2d" canvas context, got "${this.#type}". Use create3D() instead.`);
        }
    }

    /**
     * @private
     * @param {string} method - Name of the calling method, used in the error message.
     * @throws {Error} If this instance's canvas is a `'2d'` context.
     */
    _require3D(method) {
        if (this.#type === '2d') {
            throw new Error(`Text#${method}() requires a "webgl"/"webgl2" canvas context, got "2d". Use create() instead.`);
        }
    }

    /**
     * Lazily creates (and caches) an offscreen 2D canvas used for measuring
     * text and rasterizing it into a texture when this instance's own
     * canvas is a WebGL one (which has no text/measurement APIs).
     *
     * @private
     * @returns {CanvasRenderingContext2D} A 2D context, unattached to the DOM.
     */
    _scratchCtx() {
        if (!this.#scratch) {
            const el = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
            this.#scratch = el.getContext('2d');
        }
        return this.#scratch;
    }

    /**
     * Applies font family/size/weight/style to the context as a single CSS
     * font shorthand string.
     *
     * @private
     * @param {CanvasRenderingContext2D} ctx - Target context.
     * @param {TextStyle} style - Style to read font properties from.
     * @returns {void}
     */
    _applyFont(ctx, style) {
        ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`;
    }

    /**
     * Splits text into drawable lines: first on explicit `\n` breaks, then
     * further wrapping each resulting line so it fits within
     * `style.maxWidth`, breaking on whitespace. A single word wider than
     * `maxWidth` is kept on its own line rather than being split mid-word.
     *
     * @private
     * @param {CanvasRenderingContext2D} ctx - Context to measure with (must be usable regardless of whether it's ever attached to a visible canvas).
     * @param {string} text - Raw input text.
     * @param {TextStyle} style - Style to read `maxWidth` (and font, for measuring) from.
     * @returns {string[]} Lines ready to be drawn top-to-bottom.
     */
    _layout(ctx, text, style) {
        const rawLines = text.split('\n');
        if (!Number.isFinite(style.maxWidth)) return rawLines;

        ctx.save();
        this._applyFont(ctx, style);

        const wrapped = [];
        for (const rawLine of rawLines) {
            const words = rawLine.split(' ');
            let current = '';
            for (const word of words) {
                const candidate = current ? `${current} ${word}` : word;
                if (ctx.measureText(candidate).width > style.maxWidth && current) {
                    wrapped.push(current);
                    current = word;
                } else {
                    current = candidate;
                }
            }
            wrapped.push(current);
        }

        ctx.restore();
        return wrapped;
    }

    /**
     * Computes the total width of a line as it would be drawn with
     * `style.letterSpacing` applied.
     *
     * @private
     * @param {CanvasRenderingContext2D} ctx - Target context (must already have the correct font set).
     * @param {string} line - Single line of text (no `\n`).
     * @param {TextStyle} style - Style to read `letterSpacing` from.
     * @returns {number} Total rendered width, in pixels.
     */
    _spacedWidth(ctx, line, style) {
        let width = 0;
        for (const ch of line) width += ctx.measureText(ch).width + style.letterSpacing;
        return line.length ? width - style.letterSpacing : 0;
    }

    // ---------------------------------------------------------------
    // Internals - 2D
    // ---------------------------------------------------------------

    /**
     * Draws a background rectangle sized to fit the given lines (widest
     * line, full stacked height), padded by `style.padding`, positioned
     * consistently with how `create()` draws the text on top of it (i.e.
     * respecting `align`/`baseline`).
     *
     * @private
     * @param {CanvasRenderingContext2D} ctx - Target context.
     * @param {string[]} lines - Lines as returned by {@link Text#_layout}.
     * @param {number} x - X coordinate passed to `create()`.
     * @param {number} y - Y coordinate passed to `create()`.
     * @param {TextStyle} style - Style to read `background`/`padding`/`align`/`baseline`/font metrics from.
     * @returns {void}
     */
    _drawBackground(ctx, lines, x, y, style) {
        let maxWidth = 0;
        for (const line of lines) {
            const w = style.letterSpacing ? this._spacedWidth(ctx, line, style) : ctx.measureText(line).width;
            if (w > maxWidth) maxWidth = w;
        }
        const lineHeight = style.lineHeight * style.fontSize;
        const totalHeight = lines.length * lineHeight;

        let boxX = x;
        if (style.align === 'center') boxX = x - maxWidth / 2;
        else if (style.align === 'right' || style.align === 'end') boxX = x - maxWidth;

        let boxY = y;
        if (style.baseline === 'middle') boxY = y - totalHeight / 2;
        else if (style.baseline === 'bottom' || style.baseline === 'alphabetic' || style.baseline === 'ideographic') boxY = y - totalHeight;

        const p = style.padding;
        ctx.save();
        ctx.shadowColor = 'transparent';
        ctx.fillStyle = style.background;
        ctx.fillRect(boxX - p, boxY - p, maxWidth + p * 2, totalHeight + p * 2);
        ctx.restore();
    }

    /**
     * Draws a single line character-by-character with `style.letterSpacing`
     * extra pixels inserted between glyphs, since Canvas2D has no reliable
     * native letter-spacing for fill/stroke text. Temporarily forces
     * `textAlign = 'left'` so per-character advances are predictable, then
     * offsets the starting X to honor the originally requested alignment.
     *
     * @private
     * @param {CanvasRenderingContext2D} ctx - Target context.
     * @param {string} line - Single line of text (no `\n`).
     * @param {number} x - X coordinate, interpreted per `style.align`.
     * @param {number} y - Y coordinate of this line.
     * @param {TextStyle} style - Style to read `color`/`align`/`letterSpacing` from.
     * @returns {void}
     */
    _drawSpacedLine(ctx, line, x, y, style) {
        const totalWidth = this._spacedWidth(ctx, line, style);

        let startX = x;
        if (style.align === 'center') startX = x - totalWidth / 2;
        else if (style.align === 'right' || style.align === 'end') startX = x - totalWidth;

        const prevAlign = ctx.textAlign;
        ctx.textAlign = 'left';

        let cursor = startX;
        for (const ch of line) {
            if (style.color) {
                ctx.fillStyle = style.color;
                ctx.fillText(ch, cursor, y);
            }
            cursor += ctx.measureText(ch).width + style.letterSpacing;
        }

        ctx.textAlign = prevAlign;
    }

    // ---------------------------------------------------------------
    // Internals - 3D
    // ---------------------------------------------------------------

    /**
     * Compiles the textured-quad shader program used by `create3D()`,
     * looks up its attribute/uniform locations, and builds the single
     * shared unit-quad geometry (position + texcoord + index buffers) that
     * every `create3D()` call reuses, scaled per-call via the model matrix.
     *
     * @private
     * @returns {void}
     */
    _initGL3D() {
        const gl = this.#gl;

        const vertexShader = this._compileShader(gl.VERTEX_SHADER, TEXT_VERTEX_SHADER);
        const fragmentShader = this._compileShader(gl.FRAGMENT_SHADER, TEXT_FRAGMENT_SHADER);

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error('Failed to link Text shader program: ' + gl.getProgramInfoLog(program));
        }
        this.#glProgram = program;

        this.#glLocations = {
            aPosition: gl.getAttribLocation(program, 'aPosition'),
            aTexCoord: gl.getAttribLocation(program, 'aTexCoord'),
            uModel: gl.getUniformLocation(program, 'uModel'),
            uView: gl.getUniformLocation(program, 'uView'),
            uProjection: gl.getUniformLocation(program, 'uProjection'),
            uTexture: gl.getUniformLocation(program, 'uTexture')
        };

        // Unit quad, centered at the origin, in the XY plane. Texcoords put
        // (0,0) at the top-left, matching a 2D canvas's pixel coordinates.
        const positions = new Float32Array([
            -0.5, 0.5, 0,
             0.5, 0.5, 0,
             0.5, -0.5, 0,
            -0.5, -0.5, 0
        ]);
        const texcoords = new Float32Array([
            0, 0,
            1, 0,
            1, 1,
            0, 1
        ]);
        const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const texcoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, texcoords, gl.STATIC_DRAW);

        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        this.#glQuad = { positionBuffer, texcoordBuffer, indexBuffer, indexCount: indices.length };
    }

    /**
     * Compiles a single GLSL shader.
     *
     * @private
     * @param {GLenum} type - `gl.VERTEX_SHADER` or `gl.FRAGMENT_SHADER`.
     * @param {string} source - GLSL source code for the shader.
     * @returns {WebGLShader} The compiled shader.
     * @throws {Error} If compilation fails.
     */
    _compileShader(type, source) {
        const gl = this.#gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error('Failed to compile shader: ' + info);
        }
        return shader;
    }

    /**
     * Returns the (possibly cached) GPU texture for a given text+style
     * combination, rasterizing and uploading it first if this is the first
     * time this exact combination has been requested.
     *
     * @private
     * @param {string} text - The text to rasterize.
     * @param {TextStyle} style - Style to rasterize it with.
     * @returns {{texture: WebGLTexture, aspect: number}} The GPU texture and its width/height aspect ratio (used to size the quad).
     */
    _getTexture(text, style) {
        const key = JSON.stringify([text, style]);
        const cached = this.#textureCache.get(key);
        if (cached) return cached;

        const { source, width, height } = this._rasterize(text, style);

        const gl = this.#gl;
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        // NPOT-safe filtering/wrapping - no mipmaps required.
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        const entry = { texture, aspect: width / height };
        this.#textureCache.set(key, entry);
        return entry;
    }

    /**
     * Rasterizes styled, (optionally wrapped/multi-line) text onto a
     * offscreen 2D canvas sized tightly to its content plus `padding`, with
     * `background`/`color`/`shadowColor` all applied exactly
     * as they would be by `create()`. The canvas returned is later handed
     * straight to `gl.texImage2D` as the texture source.
     *
     * @private
     * @param {string} text - The text to rasterize.
     * @param {TextStyle} style - Style to rasterize it with.
     * @returns {{source: HTMLCanvasElement|OffscreenCanvas, width: number, height: number}} The rasterized bitmap and its pixel dimensions.
     */
    _rasterize(text, style) {
        const measureCtx = this._scratchCtx();
        const lines = this._layout(measureCtx, text, style);

        measureCtx.save();
        this._applyFont(measureCtx, style);
        let blockWidth = 0;
        const lineWidths = lines.map(line => {
            const w = style.letterSpacing ? this._spacedWidth(measureCtx, line, style) : measureCtx.measureText(line).width;
            if (w > blockWidth) blockWidth = w;
            return w;
        });
        measureCtx.restore();

        const lineHeight = style.lineHeight * style.fontSize;
        const blockHeight = lines.length * lineHeight;
        const margin = style.shadowBlur + Math.abs(style.shadowOffsetX) + Math.abs(style.shadowOffsetY);
        const p = style.padding + margin;

        const width = Math.max(1, Math.ceil(blockWidth + p * 2));
        const height = Math.max(1, Math.ceil(blockHeight + p * 2));

        const el = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : document.createElement('canvas');
        el.width = width;
        el.height = height;
        const ctx = el.getContext('2d');

        this._applyFont(ctx, style);
        ctx.textBaseline = 'alphabetic';

        if (style.background) {
            ctx.fillStyle = style.background;
            ctx.fillRect(0, 0, width, height);
        }

        if (style.shadowColor) {
            ctx.shadowColor = style.shadowColor;
            ctx.shadowBlur = style.shadowBlur;
            ctx.shadowOffsetX = style.shadowOffsetX;
            ctx.shadowOffsetY = style.shadowOffsetY;
        }

        // Ascent puts the first baseline correctly below the top padding;
        // fall back to a 0.8 * fontSize estimate if metrics aren't available.
        const metrics = measureCtx.measureText('M');
        const ascent = metrics.actualBoundingBoxAscent || style.fontSize * 0.8;

        lines.forEach((line, i) => {
            let lineX = p;
            if (style.align === 'center') lineX = p + (blockWidth - lineWidths[i]) / 2;
            else if (style.align === 'right' || style.align === 'end') lineX = p + (blockWidth - lineWidths[i]);

            const lineY = p + ascent + i * lineHeight;

            if (style.letterSpacing) {
                let cursor = lineX;
                for (const ch of line) {
                    if (style.color) { ctx.fillStyle = style.color; ctx.fillText(ch, cursor, lineY); }
                    cursor += ctx.measureText(ch).width + style.letterSpacing;
                }
            } else {
                if (style.color) { ctx.fillStyle = style.color; ctx.fillText(line, lineX, lineY); }
            }
        });

        return { source: el, width, height };
    }
}

return Text;
});