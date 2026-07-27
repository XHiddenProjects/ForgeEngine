'use strict';

const constants = require('./constants.js');
const { Images } = require('./image.js');
const { Camera } = require('./3d.js');

// ---------------------------------------------------------------------------
// Rendering: manages the "canvas" surface(s) a sketch draws into. Headless
// equivalent of p5's createCanvas()/createGraphics() family — there's no
// real GPU/DOM <canvas> in Node, so a "canvas" here is just a Graphics
// instance (an RGBA pixel buffer, see image.js's Images) plus a bit of
// bookkeeping. Any real front-end (browser <canvas>, terminal renderer,
// PNG export) can consume `drawingContext`/`pixels` afterwards.
// ---------------------------------------------------------------------------
class Rendering {
  /**
   * Creates a new Rendering instance.
   */
  constructor() {
    this._canvas = null; // active Graphics instance, or null before createCanvas()
    this._attributes = {
      alpha: true,
      depth: true,
      stencil: true,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      perPixelLighting: true,
      version: 2
    };
    this._depthBuffer = null;
  }

  /**
   * Resets every value in the active depth buffer.
   *
   * @param {number} [depth=1] - Depth value.
   *
   * @returns {Rendering} This instance for chaining.
   */
  clearDepth(depth = 1) {
    if (this._depthBuffer) this._depthBuffer.fill(depth);
    return this;
  }

  /**
   * Creates and activates the main drawing surface.
   *
   * @param {number} [width=100] - Width value.
   * @param {number} [height=100] - Height value.
   * @param {string} [renderer=constants.P2D] - Renderer value.
   *
   * @returns {Graphics} The resulting value.
   */
  createCanvas(width = 100, height = 100, renderer = constants.P2D) {
    this._canvas = new Graphics(width, height, renderer);
    if (renderer !== constants.P2D) {
      this._depthBuffer = new Float32Array(width * height).fill(1);
    }
    return this._canvas;
  }

  /**
   * Removes the active canvas and its depth buffer.
   *
   * @returns {Rendering} This instance for chaining.
   */
  noCanvas() {
    this._canvas = null;
    this._depthBuffer = null;
    return this;
  }

  /**
   * Resizes the active canvas and recreates its depth buffer when needed.
   *
   * @param {number} width - Width value.
   * @param {number} height - Height value.
   *
   * @throws {Error} If no canvas has been created.
   *
   * @returns {Graphics} The resulting value.
   */
  resizeCanvas(width, height) {
    if (!this._canvas) throw new Error('resizeCanvas(): no canvas exists yet — call createCanvas() first.');
    this._canvas.resize(width, height);
    if (this._depthBuffer) this._depthBuffer = new Float32Array(width * height).fill(1);
    return this._canvas;
  }

  /**
   * Creates an independent off-screen graphics surface.
   *
   * @param {number} [width=100] - Width value.
   * @param {number} [height=100] - Height value.
   * @param {string} [renderer=constants.P2D] - Renderer value.
   *
   * @returns {Graphics} The resulting value.
   */
  createGraphics(width = 100, height = 100, renderer = constants.P2D) {
    return new Graphics(width, height, renderer);
  }

  /**
   * Creates a frame buffer attached to the current rendering target.
   *
   * @param {Object} [options={}] - Options value.
   *
   * @throws {Error} If no active canvas exists.
   *
   * @returns {FrameBuffer} The resulting value.
   */
  createFrameBuffer(options = {}) {
    if (!this._canvas) throw new Error('createFrameBuffer(): no canvas exists yet — call createCanvas() first.');
    return new FrameBuffer(this._canvas, options);
  }

  /**
   * Returns the active canvas pixel buffer.
   *
   * @returns {Buffer|null} The resulting value.
   */
  get drawingContext() {
    return this._canvas ? this._canvas.pixelsRef() : null;
  }

  /**
   * Updates one or more renderer creation attributes.
   *
   * @param {string} key - Key value.
   * @param {*} value - Value value.
   *
   * @returns {Rendering} This instance for chaining.
   */
  setAttributes(key, value) {
    if (typeof key === 'object' && key !== null) {
      Object.assign(this._attributes, key);
    } else {
      this._attributes[key] = value;
    }
    return this;
  }
}

// ---------------------------------------------------------------------------
// Graphics: an off-screen (or main) drawing surface — a thin, renderer-aware
// wrapper around image.js's `Images` (which already owns the real RGBA
// pixel buffer + get/set/resize/filter/save logic), so 2D pixel data isn't
// duplicated between this file and image.js.
// ---------------------------------------------------------------------------
class Graphics extends Images {
  /**
   * Creates a new Graphics instance.
   *
   * @param {number} [width=100] - Width value.
   * @param {number} [height=100] - Height value.
   * @param {string} [renderer=constants.P2D] - Renderer value.
   */
  constructor(width = 100, height = 100, renderer = constants.P2D) {
    super(width, height);
    this.renderer = renderer;
    this._frameBuffers = [];
  }

  /**
   * Creates a frame buffer attached to the current rendering target.
   *
   * @param {Object} [options={}] - Options value.
   *
   * @throws {Error} If no active canvas exists.
   *
   * @returns {FrameBuffer} The resulting value.
   */
  createFrameBuffer(options = {}) {
    const fb = new FrameBuffer(this, options);
    this._frameBuffers.push(fb);
    return fb;
  }

  /**
   * Releases the object’s buffers and associated resources.
   *
   * @returns {void} The resulting value.
   */
  remove() {
    for (const fb of this._frameBuffers) fb.remove();
    this._frameBuffers = [];
    this._pixels = Buffer.alloc(0);
    this._width = 0;
    this._height = 0;
    this._loaded = false;
  }

  /**
   * Restores drawing state without modifying pixel content.
   *
   * @returns {Graphics} This instance for chaining.
   */
  reset() {
    this._tintColor = null;
    return this;
  }
}

// ---------------------------------------------------------------------------
// FrameBuffer: a WEBGL-style render target — a canvas (or graphics buffer)
// can `begin()`/`end()` a FrameBuffer to redirect drawing into its own
// color (+ depth) buffer instead of straight to the screen, then read it
// back via `get()`/`pixels`/`loadPixels()`, or hand it to a `Camera` for
// use as a texture.
// ---------------------------------------------------------------------------
class FrameBuffer {
  /**
   * Creates a new FrameBuffer instance.
   *
   * @param {SoundNode|VirtualAudioNode|Object} target - Target value.
   * @param {Object} [options={}] - Options value.
   */
  constructor(target, options = {}) {
    this._target = target;
    this._density = options.density || 1;
    this._width = options.width || target.width;
    this._height = options.height || target.height;
    this._hasDepth = options.depth !== false;
    this._colorBuffer = new Images(this._width * this._density, this._height * this._density);
    this._depthBuffer = this._hasDepth
      ? new Float32Array(this._width * this._density * this._height * this._density).fill(1)
      : null;
    this._autoResize = false;
    this._active = false;
    this._removed = false;
  }

  /**
   * Gets or sets automatic frame-buffer resizing.
   *
   * @param {*} value - Value value.
   *
   * @returns {FrameBuffer} This instance for chaining.
   */
  autoResize(value) {
    if (value === undefined) return this._autoResize;
    this._autoResize = Boolean(value);
    return this;
  }

  /**
   * Activates this frame buffer as the drawing target.
   *
   * @throws {Error} If the frame buffer has been removed.
   *
   * @returns {FrameBuffer} This instance for chaining.
   */
  begin() {
    if (this._removed) throw new Error('FrameBuffer.begin(): this frame buffer was removed.');
    this._active = true;
    return this;
  }

  /**
   * Deactivates this frame buffer as the drawing target.
   *
   * @returns {FrameBuffer} This instance for chaining.
   */
  end() {
    this._active = false;
    return this;
  }

  /**
   * Returns the frame buffer color attachment.
   *
   * @returns {Images} The resulting value.
   */
  get color() { return this._colorBuffer; }

  /**
   * Returns the frame buffer depth attachment.
   *
   * @returns {Float32Array|null} The resulting value.
   */
  get depth() { return this._depthBuffer; }

  /**
   * Creates a camera configured for this frame buffer’s aspect ratio.
   *
   * @returns {Camera} The resulting value.
   */
  createCamera() {
    const cam = new Camera();
    cam.perspective(Math.PI / 3, this._width / Math.max(1, this._height));
    return cam;
  }

  /**
   * Executes drawing commands while this frame buffer is active.
   *
   * @param {Function} callback - Callback value.
   *
   * @returns {FrameBuffer} This instance for chaining.
   */
  draw(callback) {
    this.begin();
    if (typeof callback === 'function') callback(this);
    this.end();
    return this;
  }

  /**
   * Performs the get operation.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} w - W value.
   * @param {number} h - H value.
   *
   * @returns {Images|number[]} The resulting value.
   */
  get(x, y, w, h) { return this._colorBuffer.get(x, y, w, h); }

  /**
   * Returns the height in pixels.
   *
   * @returns {number} The resulting value.
   */
  get height() { return this._height; }

  /**
   * Returns the live color-buffer pixels.
   *
   * @returns {Buffer} The resulting value.
   */
  loadPixels() { return this._colorBuffer.loadPixels(); }

  /**
   * Gets or sets the frame-buffer pixel density.
   *
   * @param {*} value - Value value.
   *
   * @returns {FrameBuffer} This instance for chaining.
   */
  pixelDensity(value) {
    if (value === undefined) return this._density;
    this._density = value;
    this._colorBuffer.resize(this._width * this._density, this._height * this._density);
    if (this._hasDepth) this._depthBuffer = new Float32Array(this._width * this._density * this._height * this._density).fill(1);
    return this;
  }

  /**
   * Returns the raw RGBA color-buffer pixels.
   *
   * @returns {Buffer} The resulting value.
   */
  get pixels() { return this._colorBuffer.pixelsRef(); }

  /**
   * Releases the object’s buffers and associated resources.
   *
   * @returns {void} The resulting value.
   */
  remove() {
    this._removed = true;
    this._active = false;
    this._colorBuffer.remove ? this._colorBuffer.remove() : null;
    this._depthBuffer = null;
  }

  /**
   * Resizes the color and depth attachments.
   *
   * @param {number} width - Width value.
   * @param {number} height - Height value.
   *
   * @returns {FrameBuffer} This instance for chaining.
   */
  resize(width, height) {
    this._width = width;
    this._height = height;
    this._colorBuffer.resize(width * this._density, height * this._density);
    if (this._hasDepth) this._depthBuffer = new Float32Array(width * this._density * height * this._density).fill(1);
    return this;
  }

  /**
   * Returns the width in pixels.
   *
   * @returns {number} The resulting value.
   */
  get width() { return this._width; }
}

module.exports = { Rendering, FrameBuffer, Graphics };
