'use strict';

// Sketch lifecycle: setup()/draw()/loop()/noLoop()/isLooping()/redraw()/
// remove()/registerAddon()/createSketch(). Canvas.js already has a
// *lower-level* requestAnimationFrame loop (init()/frame()) that
// dispatches to a single global `window.frame()` function - Structure
// sits one layer above that and gives sketches the more familiar
// setup()-once / draw()-repeatedly shape, as plain callbacks (no globals
// required), plus frameCount tracking and addon registration.
//
// Wrapped in the same IIFE pattern as the other engine files (see the
// comment at the top of transform.js) so this can be loaded either as a
// sibling <script> tag in the browser or via require() in Node.
(function (root, factory) {
    let Structure;
    if (typeof module === 'object' && module.exports) {
        Structure = factory(require('./canvas.js'));
        module.exports = Structure;
        module.exports.Structure = Structure;
    } else {
        if (!root || !root.Canvas) throw new Error('Structure requires canvas.js to be loaded first.');
        Structure = factory(root.Canvas);
        root.Sketch = Structure.Sketch;
        root.createSketch = Structure.createSketch;
        root.Structure = Structure;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Canvas) {

// Addons registered via Sketch.registerAddon(), applied to every Sketch
// instance as it's constructed - lets third-party libraries hook
// themselves onto each new sketch instance.
const addons = [];

/**
 * Drives a sketch's lifecycle: calls a `setup` callback once, then a
 * `draw` callback repeatedly (via a {@link Canvas}'s animation loop),
 * tracking `frameCount` along the way. Can be used directly
 * (`new Sketch({...})`) or through the {@link createSketch} instance-mode helper.
 *
 * @class
 */
class Sketch {
    /**
     * @param {Object} [options={}] - Sketch configuration.
     * @param {Canvas} [options.canvas] - An existing {@link Canvas} instance to drive. If omitted, a new one is created from `options.canvasOptions`.
     * @param {Object} [options.canvasOptions={}] - Options forwarded to `new Canvas()` when `options.canvas` isn't given.
     * @param {Function} [options.setup] - Called once, before the first draw, after the canvas has been created.
     * @param {Function} [options.draw] - Called on every tick of the animation loop, once looping has started.
     */
    constructor({ canvas, canvasOptions = {}, setup, draw } = {}) {
        this.canvas = canvas || new Canvas(canvasOptions);
        this._setup = typeof setup === 'function' ? setup : null;
        this._draw = typeof draw === 'function' ? draw : null;

        /** @type {number} Number of times draw() has run since the sketch started. */
        this.frameCount = 0;
        this._started = false;
        this._removed = false;

        for (const addon of addons) addon(this);
    }

    /**
     * Runs `setup()` (if the canvas element doesn't exist yet, creates it
     * first) and then starts the draw loop. Safe to call more than once -
     * subsequent calls are ignored once the sketch has started.
     *
     * @returns {Sketch} This instance, to allow chaining.
     */
    start() {
        if (this._started || this._removed) return this;
        this._started = true;

        if (!this.canvas.canvas()) this.canvas.create();
        if (this._setup) this._setup(this);

        this._tick = () => {
            this.frameCount++;
            if (this._draw) this._draw(this);
        };
        if (typeof window !== 'undefined') window.frame = this._tick;
        this.canvas.frame();
        return this;
    }

    /**
     * Resumes the draw loop after {@link Sketch#noLoop} was called.
     * @returns {Sketch} This instance, to allow chaining.
     */
    loop() {
        if (!this._started) return this.start();
        this.canvas.frame();
        return this;
    }

    /**
     * Stops draw() from being called repeatedly. The sketch stays alive -
     * call {@link Sketch#loop} or {@link Sketch#redraw} to keep going.
     * @returns {Sketch} This instance, to allow chaining.
     */
    noLoop() {
        this.canvas.noLoop();
        return this;
    }

    /**
     * Reports whether the draw loop is currently running.
     * @returns {boolean} `true` if looping, `false` if stopped (e.g. after {@link Sketch#noLoop}).
     */
    isLooping() {
        return Boolean(this._started) && this._looping !== false;
    }

    // Canvas.js doesn't expose a public isLooping() itself; noLoop()/frame()
    // are idempotent, so the simplest reliable signal is: has start() run,
    // and has noLoop() not been the last call. Tracked with a tiny flag
    // (this._looping) updated by loop()/noLoop()/start() below, rather
    // than reaching into Canvas's private state.

    /**
     * Runs `draw()` exactly once, regardless of whether the loop is
     * currently running. Useful after {@link Sketch#noLoop} to render a
     * single updated frame (e.g. in response to a UI control changing).
     * @returns {Sketch} This instance, to allow chaining.
     */
    redraw() {
        if (!this._started) this.start();
        this.frameCount++;
        if (this._draw) this._draw(this);
        return this;
    }

    /**
     * Stops the draw loop and removes the sketch's `<canvas>` element from
     * the page. The Sketch instance itself is left inert afterwards -
     * create a new one to start again.
     * @returns {void}
     */
    remove() {
        this.canvas.noLoop();
        const el = this.canvas.canvas();
        if (el && el.parentNode) el.parentNode.removeChild(el);
        this._removed = true;
    }

    /**
     * Registers a library/addon function to run against every future
     * `new Sketch(...)`/`createSketch(...)` instance, immediately after
     * construction.
     *
     * @param {function(Sketch): void} addonFn - Called with each new Sketch instance.
     * @returns {void}
     */
    static registerAddon(addonFn) {
        if (typeof addonFn !== 'function') throw new Error('Structure.registerAddon() requires a function.');
        addons.push(addonFn);
    }
}

// loop()/noLoop() flip a plain flag Canvas doesn't expose, kept in sync here.
const originalLoop = Sketch.prototype.loop;
Sketch.prototype.loop = function () { this._looping = true; return originalLoop.call(this); };
const originalNoLoop = Sketch.prototype.noLoop;
Sketch.prototype.noLoop = function () { this._looping = false; return originalNoLoop.call(this); };
const originalStart = Sketch.prototype.start;
Sketch.prototype.start = function () { this._looping = true; return originalStart.call(this); };

/**
 * "Instance mode" entry point: calls `sketchFn(instance)` so the sketch
 * function can attach `setup`/`draw` (and anything else) onto `instance`
 * itself, then starts it.
 *
 * @example
 * createSketch(function (sk) {
 *   sk.setup = () => { sk.canvas.create(); };
 *   sk.draw = () => { };
 * });
 *
 * @param {function(Sketch): void} sketchFn - Receives the new Sketch instance to configure.
 * @param {Object} [canvasOptions={}] - Options forwarded to `new Canvas()`.
 * @returns {Sketch} The configured, started Sketch instance.
 */
function createSketch(sketchFn, canvasOptions = {}) {
    const instance = new Sketch({ canvasOptions });
    if (typeof sketchFn === 'function') sketchFn(instance);
    return instance.start();
}

return { Sketch, createSketch };
});