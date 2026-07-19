'use strict';

// Wrapped in an IIFE - see the comment at the top of Transform.js for why:
// this file is injected as a sibling <script> tag alongside
// Transform.js/shapes.js into the same page, so a top-level `class Canvas`
// here would collide with any other same-named top-level declaration
// sharing that global scope.
(function (root, factory) {
    const Canvas = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = Canvas;
        module.exports.Canvas = Canvas;
    } else if (root) {
        root.Canvas = Canvas;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
/**
 * Creates and manages an HTML `<canvas>` element, wrapping either a 2D or
 * WebGL rendering context. Instances are handed to helpers such as `Shapes`
 * to perform the actual drawing.
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

    /**
     * @param {Object} [options={}] - Canvas configuration.
     * @param {string} [options.id='forge-engine'] - `id` attribute applied to the created `<canvas>` element.
     * @param {number} [options.width=800] - Canvas width, in pixels.
     * @param {number} [options.height=600] - Canvas height, in pixels.
     * @param {string} [options.bg='#000000'] - Background fill color, used only for 2D contexts.
     * @param {string} [options.ctx='2d'] - Rendering context type to request: `'2d'`, `'webgl'`, or `'webgl2'` (see `Canvas#TWO_D`, `Canvas#WEBGL`, `Canvas#WEBGL2`).
     */
    constructor(options = {}) {
        // constants
        this.TWO_D = '2d';
        this.WEBGL = 'webgl';
        this.WEBGL2 = 'webgl2';
        // options
        this.#canvas_id = options.id || 'forge-engine';
        this.#canvas_width = options.width || 800;
        this.#canvas_height = options.height || 600;
        this.#canvas_bg = options.bg || '#000000';
        this.#canvas_context = options.ctx || this.TWO_D;
        // canvas
        this.#canvas = null;
        this.#ctx = null;
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
            this.#ctx.fillStyle = this.#canvas_bg;
            this.#ctx.fillRect(0, 0, this.#canvas_width, this.#canvas_height);
        } else {
            this.#ctx.viewport(0, 0, this.#canvas_width, this.#canvas_height);
        }

        document.body.appendChild(this.#canvas);
        return this;
    }

    /**
     * Returns the canvas height configured for this instance.
     *
     * @returns {number} Canvas height, in pixels.
     */
    height() {
        return this.#canvas_height;
    }

    /**
     * Returns the canvas width configured for this instance.
     *
     * @returns {number} Canvas width, in pixels.
     */
    width() {
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
}

return Canvas;
});
