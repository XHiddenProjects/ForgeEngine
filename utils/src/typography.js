'use strict';

// Wrapped in an IIFE - see the comment at the top of Transform.js for why:
// this file is injected as a sibling <script> tag alongside Transform.js,
// canvas.js, shapes.js, and text.js into the same page, so a top-level
// `class Typography` here would collide with any other same-named
// top-level declaration sharing that global scope.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        const Typography = factory(require('./color'));
        module.exports = Typography;
        module.exports.Typography = Typography;
    } else if (root) {
        if (!root.Color) throw new Error('Typography requires color.js to be loaded first.');
        root.Typography = factory(root.Color);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Color) {

/**
 * Default typographic properties, mirroring p5.js's global text state.
 * Mutated in place by {@link Typography#textProperty}/{@link
 * Typography#textProperties} (and by the individual `textXxx()` methods).
 *
 * @typedef {Object} TextProps
 * @property {string} textFont - CSS font-family currently selected.
 * @property {number} textSize - Font size, in pixels.
 * @property {number} textLeading - Distance, in pixels, between the baselines of successive lines.
 * @property {string} textAlign - Horizontal alignment: `'left'`, `'center'`, or `'right'`.
 * @property {string} textBaseline - Vertical alignment: `'top'`, `'center'`, `'bottom'`, or `'alphabetic'`.
 * @property {string} fontStyle - `'normal'`, `'italic'`, `'bold'`, or `'bold italic'` (see {@link Typography#textStyle}).
 * @property {number|string} textWeight - Numeric CSS font-weight (`1`-`1000`) or a keyword such as `'normal'`/`'bold'`.
 * @property {string} textDirection - `'ltr'`, `'rtl'`, or `'inherit'`.
 * @property {string} textWrap - `'word'` or `'char'` - where automatic wrapping is allowed to break a line.
 */
const DEFAULT_PROPS = {
    textFont: 'sans-serif',
    textSize: 12,
    textLeading: 15,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fontStyle: 'normal',
    textWeight: 'normal',
    textDirection: 'inherit',
    textWrap: 'word'
};

// Keys accepted by textProperty()/textProperties(), and the setter each one
// is dispatched to - keeps the two batch/single methods from drifting out
// of sync with the individual textXxx() methods below. `textBaseline` has
// no dedicated public setter (p5 folds it into textAlign()'s second
// argument), so it's intentionally absent here and falls back to a direct
// property write inside textProperty().
const PROPERTY_SETTERS = {
    textFont: (t, v) => t.textFont(v),
    textSize: (t, v) => t.textSize(v),
    textLeading: (t, v) => t.textLeading(v),
    textAlign: (t, v, v2) => t.textAlign(v, v2),
    fontStyle: (t, v) => t.textStyle(v),
    textWeight: (t, v) => t.textWeight(v),
    textDirection: (t, v) => t.textDirection(v),
    textWrap: (t, v) => t.textWrap(v)
};

/**
 * p5.js-flavored typography API (`text()`, `textAlign()`, `textSize()`,
 * `textFont()`, `loadFont()`, and friends) layered on top of a {@link
 * Canvas}'s `'2d'` rendering context.
 *
 * "Loose" metrics (`fontAscent`/`fontDescent`/`fontWidth`/`fontBounds`) use
 * the font's own intrinsic metrics (`TextMetrics.fontBoundingBox*` and the
 * glyph advance width) - the same box every string in that font/size
 * shares, regardless of which characters it actually contains. "Tight"
 * metrics (`textAscent`/`textDescent`/`textWidth`/`textBounds`) instead use
 * the *rendered ink* of the specific text passed in
 * (`TextMetrics.actualBoundingBox*`), so e.g. `"..."` and `"Ap"` at the same
 * size report different tight ascents/descents.
 *
 * @class
 */
class Typography {
    // Private fields must be declared here before they can be used anywhere
    // in the class (see the same note in canvas.js).
    #canvas;
    #ctx;
    #scratch;
    #props;
    #fonts;

    /**
     * @param {Canvas} canvas - A {@link Canvas} instance that has already had `create()` called on it.
     */
    constructor(canvas) {
        if (!canvas || typeof canvas.context !== 'function') {
            throw new Error('Typography requires a Canvas instance.');
        }
        this.#canvas = canvas;
        this.#ctx = canvas.context();
        this.#scratch = null;
        this.#props = { ...DEFAULT_PROPS };
        this.#fonts = new Map();

        // p5-style constants.
        this.NORMAL = 'normal';
        this.ITALIC = 'italic';
        this.BOLD = 'bold';
        this.BOLDITALIC = 'bold italic';
        this.LEFT = 'left';
        this.RIGHT = 'right';
        this.CENTER = 'center';
        this.TOP = 'top';
        this.BOTTOM = 'bottom';
        this.BASELINE = 'alphabetic';
        this.WORD = 'word';
        this.CHAR = 'char';
        this.LTR = 'ltr';
        this.RTL = 'rtl';
    }

    // ---------------------------------------------------------------
    // Loose (font-intrinsic) metrics
    // ---------------------------------------------------------------

    /**
     * Returns the loose ascent of the text based on the font's intrinsic
     * metrics (`TextMetrics.fontBoundingBoxAscent`) - independent of which
     * characters are actually drawn.
     *
     * @returns {number} Loose ascent, in pixels, above the alphabetic baseline.
     */
    fontAscent() {
        const ctx = this._measuringCtx();
        this._applyFont(ctx);
        const metrics = ctx.measureText('');
        return metrics.fontBoundingBoxAscent ?? this.#props.textSize * 0.8;
    }

    /**
     * Returns the loose descent of the text based on the font's intrinsic
     * metrics (`TextMetrics.fontBoundingBoxDescent`) - independent of which
     * characters are actually drawn.
     *
     * @returns {number} Loose descent, in pixels, below the alphabetic baseline.
     */
    fontDescent() {
        const ctx = this._measuringCtx();
        this._applyFont(ctx);
        const metrics = ctx.measureText('');
        return metrics.fontBoundingBoxDescent ?? this.#props.textSize * 0.2;
    }

    /**
     * Returns the loose width of a text string based on the current font -
     * the sum of each glyph's advance width (`TextMetrics.width`), not the
     * tighter ink-only extents used by {@link Typography#textWidth}.
     *
     * @param {string} text - The text to measure.
     * @returns {number} Loose width, in pixels.
     */
    fontWidth(text) {
        const ctx = this._measuringCtx();
        this._applyFont(ctx);
        return ctx.measureText(String(text)).width;
    }

    /**
     * Computes a generic (non-tight) bounding box for a block of text,
     * built from the font's intrinsic ascent/descent and {@link
     * Typography#fontWidth} rather than each line's actual rendered ink.
     * Honors the current {@link Typography#textAlign}/{@link
     * Typography#textWrap}, and wraps to `width` when given.
     *
     * @param {string} text - The text to measure.
     * @param {number} [x=0] - X coordinate the text would be drawn at.
     * @param {number} [y=0] - Y coordinate the text would be drawn at.
     * @param {number} [width=Infinity] - Wrapping width, in pixels.
     * @param {number} [height=Infinity] - Maximum block height, in pixels; extra lines are dropped.
     * @returns {{x: number, y: number, w: number, h: number}} The loose bounding box.
     */
    fontBounds(text, x = 0, y = 0, width = Infinity, height = Infinity) {
        const ctx = this._measuringCtx();
        this._applyFont(ctx);
        const lines = this._layout(ctx, String(text), width);
        const ascent = this.fontAscent();
        const descent = this.fontDescent();
        const leading = this.#props.textLeading;

        let maxWidth = 0;
        for (const line of lines) {
            const w = ctx.measureText(line).width;
            if (w > maxWidth) maxWidth = w;
        }

        const blockHeight = Math.min(height, lines.length * leading);
        return this._alignBox(x, y, maxWidth, blockHeight, ascent, descent);
    }

    // ---------------------------------------------------------------
    // Tight (rendered-ink) metrics
    // ---------------------------------------------------------------

    /**
     * Returns the ascent of the text: the tight, ink-based distance
     * (`TextMetrics.actualBoundingBoxAscent`) above the alphabetic baseline
     * for an ascender-heavy reference glyph in the current font/size.
     *
     * @returns {number} Tight ascent, in pixels.
     */
    textAscent() {
        const ctx = this._measuringCtx();
        this._applyFont(ctx);
        const metrics = ctx.measureText('Ap');
        return metrics.actualBoundingBoxAscent ?? this.#props.textSize * 0.7;
    }

    /**
     * Returns the descent of the text: the tight, ink-based distance
     * (`TextMetrics.actualBoundingBoxDescent`) below the alphabetic
     * baseline for a descender-heavy reference glyph in the current
     * font/size.
     *
     * @returns {number} Tight descent, in pixels.
     */
    textDescent() {
        const ctx = this._measuringCtx();
        this._applyFont(ctx);
        const metrics = ctx.measureText('pqy');
        return metrics.actualBoundingBoxDescent ?? this.#props.textSize * 0.2;
    }

    /**
     * Calculates the width of the given text string in pixels, using the
     * tight, ink-based extents (`actualBoundingBoxLeft` +
     * `actualBoundingBoxRight`) of the current font/size rather than the
     * looser glyph advance width used by {@link Typography#fontWidth}.
     *
     * @param {string} text - The text to measure.
     * @returns {number} Tight width, in pixels.
     */
    textWidth(text) {
        const ctx = this._measuringCtx();
        this._applyFont(ctx);
        const metrics = ctx.measureText(String(text));
        if (metrics.actualBoundingBoxLeft !== undefined && metrics.actualBoundingBoxRight !== undefined) {
            return metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
        }
        return metrics.width;
    }

    /**
     * Computes the tight bounding box for a block of text - each line's
     * actual rendered ink extents, stacked using {@link
     * Typography#textLeading}. Honors the current {@link
     * Typography#textAlign}/{@link Typography#textWrap}, and wraps to
     * `width` when given.
     *
     * @param {string} text - The text to measure.
     * @param {number} [x=0] - X coordinate the text would be drawn at.
     * @param {number} [y=0] - Y coordinate the text would be drawn at.
     * @param {number} [width=Infinity] - Wrapping width, in pixels.
     * @param {number} [height=Infinity] - Maximum block height, in pixels; extra lines are dropped.
     * @returns {{x: number, y: number, w: number, h: number}} The tight bounding box.
     */
    textBounds(text, x = 0, y = 0, width = Infinity, height = Infinity) {
        const ctx = this._measuringCtx();
        this._applyFont(ctx);
        const lines = this._layout(ctx, String(text), width);
        const leading = this.#props.textLeading;

        let maxWidth = 0;
        let firstAscent = 0;
        let lastDescent = 0;
        lines.forEach((line, i) => {
            const metrics = ctx.measureText(line);
            const left = metrics.actualBoundingBoxLeft ?? 0;
            const right = metrics.actualBoundingBoxRight ?? metrics.width;
            const w = left + right;
            if (w > maxWidth) maxWidth = w;
            if (i === 0) firstAscent = metrics.actualBoundingBoxAscent ?? this.textAscent();
            if (i === lines.length - 1) lastDescent = metrics.actualBoundingBoxDescent ?? this.textDescent();
        });

        const blockHeight = Math.min(height, (lines.length - 1) * leading + firstAscent + lastDescent);
        return this._alignBox(x, y, maxWidth, blockHeight, firstAscent, lastDescent);
    }

    // ---------------------------------------------------------------
    // Drawing
    // ---------------------------------------------------------------

    /**
     * Draws text to the canvas at `(x, y)`, honoring the current {@link
     * Typography#textAlign}, {@link Typography#textAlign} baseline (its
     * second argument), {@link Typography#textLeading}, and {@link
     * Typography#textWrap}. Explicit line breaks (`\n`) are always
     * respected; passing `width` additionally wraps long lines, and
     * `height` (if given) stops drawing once the block would exceed it.
     *
     * @param {string} text - The text to draw.
     * @param {number} x - X coordinate, in canvas pixels.
     * @param {number} y - Y coordinate, in canvas pixels, of the first line's baseline/box.
     * @param {number} [width=Infinity] - Wrapping width, in pixels.
     * @param {number} [height=Infinity] - Maximum block height, in pixels; extra lines are skipped.
     * @returns {Typography} This instance, to allow chaining.
     * @throws {Error} If the canvas was not created with a `'2d'` context.
     */
    text(text, x, y, width = Infinity, height = Infinity) {
        this._require2D('text');
        const ctx = this.#ctx;
        const lines = this._layout(ctx, String(text), width);
        const leading = this.#props.textLeading;
        const maxLines = Number.isFinite(height) ? Math.max(1, Math.floor(height / leading)) : lines.length;

        ctx.save();
        this._applyFont(ctx);
        ctx.textAlign = this.#props.textAlign;
        ctx.textBaseline = this.#props.textBaseline;
        ctx.direction = this.#props.textDirection;

        const fillColor = typeof this.#canvas.getFill === 'function' ? this.#canvas.getFill() : null;
        if (fillColor) ctx.fillStyle = Color.toString(fillColor);

        lines.slice(0, maxLines).forEach((line, i) => {
            ctx.fillText(line, x, y + i * leading);
        });

        ctx.restore();
        return this;
    }

    // ---------------------------------------------------------------
    // Font loading
    // ---------------------------------------------------------------

    /**
     * Loads a font and creates a p5.Font-like object. Returns a plain
     * object immediately (synchronously), which is filled in (`loaded`
     * flips to `true`, `face` is populated) once the font has actually
     * finished downloading; `onSuccess`/`onError` fire at that point too.
     *
     * @param {string} path - URL/path to the font file (`.woff`, `.woff2`, `.ttf`, `.otf`).
     * @param {function(Object):void} [onSuccess] - Called with the font object once loading succeeds.
     * @param {function(Error):void} [onError] - Called with the error if loading fails.
     * @returns {{name: string, family: string, path: string, face: ?FontFace, loaded: boolean}} A p5.Font-like handle, usable with {@link Typography#textFont} once `loaded` is `true`.
     */
    loadFont(path, onSuccess, onError) {
        const name = String(path).split('/').pop().replace(/\.[^./]+$/, '') || 'Font';
        const fontObject = { name, family: name, path: String(path), face: null, loaded: false };
        this.#fonts.set(name, fontObject);

        if (typeof FontFace === 'undefined' || typeof document === 'undefined' || !document.fonts) {
            const error = new Error('loadFont() requires a browser environment with the FontFace API.');
            if (onError) onError(error);
            else throw error;
            return fontObject;
        }

        const face = new FontFace(name, `url(${fontObject.path})`);
        fontObject.face = face;
        face.load()
            .then(loaded => {
                document.fonts.add(loaded);
                fontObject.loaded = true;
                if (onSuccess) onSuccess(fontObject);
            })
            .catch(error => {
                if (onError) onError(error);
            });

        return fontObject;
    }

    // ---------------------------------------------------------------
    // Property getters/setters
    // ---------------------------------------------------------------

    /**
     * Sets the way text is aligned when {@link Typography#text} is called,
     * both horizontally and (optionally) vertically. Call with no arguments
     * to read the current alignment instead.
     *
     * @param {string} [horizAlign] - `this.LEFT`, `this.CENTER`, or `this.RIGHT`.
     * @param {string} [vertAlign] - `this.TOP`, `this.CENTER`, `this.BOTTOM`, or `this.BASELINE`.
     * @returns {Typography|{horizAlign: string, vertAlign: string}} This instance when setting, or the current `{horizAlign, vertAlign}` when reading.
     */
    textAlign(horizAlign, vertAlign) {
        if (horizAlign === undefined) {
            return { horizAlign: this.#props.textAlign, vertAlign: this.#props.textBaseline };
        }
        this.#props.textAlign = horizAlign;
        if (vertAlign !== undefined) this.#props.textBaseline = vertAlign;
        return this;
    }

    /**
     * Sets or gets the text drawing direction.
     *
     * @param {string} [direction] - `this.LTR`, `this.RTL`, or `'inherit'`.
     * @returns {Typography|string} This instance when setting, or the current direction when reading.
     */
    textDirection(direction) {
        if (direction === undefined) return this.#props.textDirection;
        this.#props.textDirection = direction;
        return this;
    }

    /**
     * Sets the font used by {@link Typography#text}, or gets the currently
     * selected font/family. Accepts either a CSS font-family string or a
     * font object returned by {@link Typography#loadFont}.
     *
     * @param {string|Object} [font] - Font family name, or a {@link Typography#loadFont} result.
     * @param {number} [size] - Optional font size, in pixels, set at the same time.
     * @returns {Typography|string} This instance when setting, or the current font-family string when reading.
     */
    textFont(font, size) {
        if (font === undefined) return this.#props.textFont;
        this.#props.textFont = typeof font === 'string' ? font : (font.family || font.name);
        if (size !== undefined) this.#props.textSize = size;
        return this;
    }

    /**
     * Sets the spacing between the baselines of successive lines of text
     * when {@link Typography#text} is called, or gets the current leading.
     *
     * @param {number} [leading] - Distance between baselines, in pixels.
     * @returns {Typography|number} This instance when setting, or the current leading when reading.
     */
    textLeading(leading) {
        if (leading === undefined) return this.#props.textLeading;
        this.#props.textLeading = leading;
        return this;
    }

    /**
     * Gets or sets several text properties in batch, equivalent to calling
     * {@link Typography#textProperty} once per key. Call with no arguments
     * to read all current properties at once.
     *
     * @param {Partial<TextProps>} [properties] - Properties to set.
     * @returns {Typography|TextProps} This instance when setting, or a shallow copy of all current properties when reading.
     */
    textProperties(properties) {
        if (properties === undefined) return { ...this.#props };
        for (const [key, value] of Object.entries(properties)) this.textProperty(key, value);
        return this;
    }

    /**
     * Sets or gets a single named text property. Recognized keys are the
     * same as {@link TextProps} (`textFont`, `textSize`, `textLeading`,
     * `textAlign`, `textBaseline`, `fontStyle`, `textWeight`,
     * `textDirection`, `textWrap`) - the same set `textProperties()`
     * accepts/returns in batch.
     *
     * @param {string} property - Property name to get/set.
     * @param {*} [value] - New value. Omit to read the current value instead.
     * @returns {Typography|*} This instance when setting, or the current value when reading.
     * @throws {Error} If `property` isn't a recognized text property.
     */
    textProperty(property, value) {
        if (!(property in this.#props)) {
            throw new Error(`textProperty(): unrecognized property "${property}".`);
        }
        if (value === undefined) return this.#props[property];

        const setter = PROPERTY_SETTERS[property];
        if (setter) setter(this, value);
        else this.#props[property] = value; // textBaseline - no dedicated public setter
        return this;
    }

    /**
     * Sets the current font size used by {@link Typography#text}, or gets
     * the current size.
     *
     * @param {number} [size] - Font size, in pixels.
     * @returns {Typography|number} This instance when setting, or the current size when reading.
     */
    textSize(size) {
        if (size === undefined) return this.#props.textSize;
        this.#props.textSize = size;
        return this;
    }

    /**
     * Sets the style for system fonts when {@link Typography#text} is
     * called, or gets the current style.
     *
     * @param {string} [style] - `this.NORMAL`, `this.ITALIC`, `this.BOLD`, or `this.BOLDITALIC`.
     * @returns {Typography|string} This instance when setting, or the current style when reading.
     */
    textStyle(style) {
        if (style === undefined) return this.#props.fontStyle;
        this.#props.fontStyle = style;
        return this;
    }

    /**
     * Sets or gets the current font weight, used to select a specific
     * variant of the current font family.
     *
     * @param {number|string} [weight] - Numeric CSS weight (`1`-`1000`) or a keyword such as `'normal'`/`'bold'`.
     * @returns {Typography|number|string} This instance when setting, or the current weight when reading.
     */
    textWeight(weight) {
        if (weight === undefined) return this.#props.textWeight;
        this.#props.textWeight = weight;
        return this;
    }

    /**
     * Sets the style for wrapping text when {@link Typography#text} is
     * called with a `width`, or gets the current wrap mode.
     *
     * @param {string} [mode] - `this.WORD` (break on whitespace) or `this.CHAR` (break anywhere).
     * @returns {Typography|string} This instance when setting, or the current wrap mode when reading.
     */
    textWrap(mode) {
        if (mode === undefined) return this.#props.textWrap;
        this.#props.textWrap = mode;
        return this;
    }

    // ---------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------

    /**
     * Throws if this instance's canvas wasn't created with a `'2d'`
     * context - used by methods that actually paint pixels (measurement
     * methods fall back to an offscreen context instead, via {@link
     * Typography#_measuringCtx}, so they work regardless of canvas type).
     *
     * @private
     * @param {string} method - Name of the calling method, used in the error message.
     * @returns {void}
     */
    _require2D(method) {
        if (this.#canvas.contextType() !== this.#canvas.TWO_D) {
            throw new Error(`${method}() requires a created 2D canvas context.`);
        }
    }

    /**
     * Returns a 2D context suitable for measurement: the real canvas
     * context if this instance's canvas is `'2d'`, otherwise a cached,
     * unattached offscreen 2D context (`measureText()` has no WebGL
     * equivalent).
     *
     * @private
     * @returns {CanvasRenderingContext2D} A context with `measureText()` available.
     */
    _measuringCtx() {
        if (this.#canvas.contextType() === this.#canvas.TWO_D) return this.#ctx;
        if (!this.#scratch) {
            const el = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
            this.#scratch = el.getContext('2d');
        }
        return this.#scratch;
    }

    /**
     * Applies `textFont`/`textSize`/`fontStyle`/`textWeight` to a context as
     * a single CSS font shorthand string.
     *
     * @private
     * @param {CanvasRenderingContext2D} ctx - Target context.
     * @returns {void}
     */
    _applyFont(ctx) {
        const { fontStyle, textWeight, textSize, textFont } = this.#props;
        ctx.font = `${fontStyle} ${textWeight} ${textSize}px ${textFont}`;
    }

    /**
     * Splits text into drawable lines: first on explicit `\n` breaks, then
     * (when `width` is finite) further wrapping each line so it fits,
     * breaking on whitespace (`this.WORD`) or anywhere (`this.CHAR`)
     * depending on {@link Typography#textWrap}. A single word wider than
     * `width` is kept on its own line rather than split mid-word in `WORD`
     * mode.
     *
     * @private
     * @param {CanvasRenderingContext2D} ctx - Context to measure with (must already have the font applied).
     * @param {string} text - Raw input text.
     * @param {number} width - Wrapping width, in pixels; `Infinity` disables wrapping.
     * @returns {string[]} Lines ready to be drawn top-to-bottom.
     */
    _layout(ctx, text, width) {
        const rawLines = text.split('\n');
        if (!Number.isFinite(width)) return rawLines;

        const byChar = this.#props.textWrap === this.CHAR;
        const wrapped = [];

        for (const rawLine of rawLines) {
            const units = byChar ? [...rawLine] : rawLine.split(' ');
            let current = '';
            for (const unit of units) {
                const candidate = current ? (byChar ? current + unit : `${current} ${unit}`) : unit;
                if (ctx.measureText(candidate).width > width && current) {
                    wrapped.push(current);
                    current = unit;
                } else {
                    current = candidate;
                }
            }
            wrapped.push(current);
        }
        return wrapped;
    }

    /**
     * Positions a `width`x`height` box (whose height is already split into
     * `ascent` above / `descent` below its first baseline) at `(x, y)`
     * according to the current `textAlign`/`textBaseline`, the same way
     * {@link Typography#text} would draw it.
     *
     * @private
     * @param {number} x - X coordinate passed to the caller.
     * @param {number} y - Y coordinate passed to the caller.
     * @param {number} width - Box width, in pixels.
     * @param {number} height - Box height, in pixels.
     * @param {number} ascent - Distance from the box's top edge to the first baseline.
     * @param {number} descent - Distance from the last baseline to the box's bottom edge.
     * @returns {{x: number, y: number, w: number, h: number}} The positioned box, top-left anchored.
     */
    _alignBox(x, y, width, height, ascent, descent) {
        const { textAlign, textBaseline } = this.#props;

        let boxX = x;
        if (textAlign === this.CENTER) boxX = x - width / 2;
        else if (textAlign === this.RIGHT) boxX = x - width;

        let boxY = y - ascent;
        if (textBaseline === this.TOP) boxY = y;
        else if (textBaseline === this.CENTER) boxY = y - height / 2;
        else if (textBaseline === this.BOTTOM) boxY = y - height;

        return { x: boxX, y: boxY, w: width, h: height };
    }
}

return Typography;
});