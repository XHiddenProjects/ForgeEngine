'use strict';

const constants = require('./constants.js');

/**
 * Structure: drives a draw loop in Node using setInterval/setImmediate
 * instead of the browser's requestAnimationFrame. No p5, no DOM.
 */
class Structure {
  /**
   * Creates a new Structure instance.
   *
   * @param {number} [targetFrameRate=60] - Targetframerate value.
   */
  constructor(targetFrameRate = 60) {
    this.disableFriendlyErrors = false;
    this._drawFn = null;
    this._setupFn = null;
    this._looping = false;
    this._timer = null;
    this._frameRate = targetFrameRate;
    this._frameCount = 0;
    this._addons = [];
    this._removed = false;
  }

  /**
   * Registers and immediately invokes the setup callback.
   *
   * @param {Function} fn - Fn value.
   *
   * @returns {Structure} This instance for chaining.
   */
  setup(fn) {
    if (typeof fn === 'function') { this._setupFn = fn; fn(); }
    return this;
  }

  /**
   * Registers the callback executed for each frame.
   *
   * @param {Function} fn - Fn value.
   *
   * @returns {Structure} This instance for chaining.
   */
  draw(fn) {
    if (typeof fn === 'function') this._drawFn = fn;
    return this;
  }

  /**
   * Starts the timed draw loop at the configured frame rate.
   *
   * @throws {Error} If this structure instance has been removed.
   *
   * @returns {Structure} This instance for chaining.
   */
  loop() {
    if (this._removed) throw new Error('Structure.loop(): instance was removed');
    if (this._looping) return this;
    this._looping = true;
    const intervalMs = 1000 / this._frameRate;
    this._timer = setInterval(() => {
      if (typeof this._drawFn === 'function') {
        this._frameCount++;
        this._drawFn(this._frameCount);
      }
    }, intervalMs);
    if (this._timer.unref) this._timer.unref();
    return this;
  }

  /**
   * Stops the active draw loop.
   *
   * @returns {Structure} This instance for chaining.
   */
  noLoop() {
    this._looping = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    return this;
  }

  /**
   * Reports whether the draw loop is active.
   *
   * @returns {boolean} The resulting value.
   */
  isLooping() { return this._looping; }

  /**
   * Executes the draw callback a specified number of times immediately.
   *
   * @param {number} [n=1] - N value.
   *
   * @returns {Structure} This instance for chaining.
   */
  redraw(n = 1) {
    for (let i = 0; i < n; i++) {
      if (typeof this._drawFn === 'function') {
        this._frameCount++;
        this._drawFn(this._frameCount);
      }
    }
    return this;
  }

  /**
   * Registers and initializes an add-on against this structure instance.
   *
   * @param {Function} fn - Fn value.
   *
   * @throws {Error} If the add-on is not a function.
   *
   * @returns {Structure} This instance for chaining.
   */
  registerAddon(fn) {
    if (typeof fn !== 'function') throw new Error('registerAddon expects a function');
    this._addons.push(fn);
    fn(this);
    return this;
  }

  /**
   * Stops the loop and permanently releases registered callbacks.
   *
   * @returns {Structure} This instance for chaining.
   */
  remove() {
    this.noLoop();
    this._removed = true;
    this._drawFn = null;
    this._setupFn = null;
    return this;
  }

  /**
   * Returns the number of draw frames executed.
   *
   * @returns {number} The resulting value.
   */
  get frameCount() { return this._frameCount; }
}

module.exports = { Structure };
