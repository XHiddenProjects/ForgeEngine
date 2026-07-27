'use strict';

const constants = require('./constants.js');

/**
 * Environment: tracks viewport/timing/URL state that would normally come
 * from `window` in a browser. In Node there is no real window, so this
 * class holds an explicit, settable virtual viewport instead.
 */
class Environment {
  /**
   * Initializes a new instance with its default state.
   *
   * @param {string|*} [width=800] - Width value.
   * @param {string|*} [height=600] - Height value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  constructor(width = 800, height = 600) {
    this._width = width;
    this._height = height;
    this._displayWidth = width;
    this._displayHeight = height;
    this._pixelDensity = 1;
    this._frameCount = 0;
    this._targetFrameRate = 60;
    this._lastFrameTime = Date.now();
    this._deltaTime = 0;
    this._focused = true;
    this._cursorStyle = constants.ARROW;
    this._cursorVisible = true;
    this._fullscreenState = false;
    this._url = null;
    this._descriptions = { canvas: null, elements: {} };
    this._webglVersion = constants.WEBGL2;
  }

  /**
   * Returns the width.
   *
   * @returns {number} Current value.
   */
  get width() { return this._width; }
  /**
   * Returns the height.
   *
   * @returns {number} Current value.
   */
  get height() { return this._height; }
  /**
   * Returns the windowWidth.
   *
   * @returns {number} Current value.
   */
  get windowWidth() { return this._displayWidth; }
  /**
   * Returns the windowHeight.
   *
   * @returns {number} Current value.
   */
  get windowHeight() { return this._displayHeight; }
  /**
   * Returns the focused.
   *
   * @returns {number} Current value.
   */
  get focused() { return this._focused; }
  /**
   * Returns the frameCount.
   *
   * @returns {number} Current value.
   */
  get frameCount() { return this._frameCount; }

  /**
   * Sets the virtual viewport dimensions.
   *
   * @param {number} w - W value.
   * @param {number} h - H value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  setViewport(w, h) { this._width = w; this._height = h; return this; }
  /**
   * Updates the display dimensions.
   *
   * @param {number} w - W value.
   * @param {number} h - H value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  windowResized(w, h) {
    this._displayWidth = w;
    this._displayHeight = h;
    return { width: w, height: h };
  }

  /**
   * Returns the display width.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  displayWidth() { return this._displayWidth; }
  /**
   * Returns the display height.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  displayHeight() { return this._displayHeight; }
  /**
   * Gets or sets the display pixel density.
   *
   * @param {number} d - D value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  displayDensity(d) {
    if (d === undefined) return this._pixelDensity;
    this._pixelDensity = d;
    return this._pixelDensity;
  }
  /**
   * Gets or sets the pixel density.
   *
   * @param {number} d - D value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  pixelDensity(d) { return this.displayDensity(d); }

  /**
   * Records a frame and returns elapsed time since the previous frame.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  deltaTime() {
    const now = Date.now();
    this._deltaTime = now - this._lastFrameTime;
    this._lastFrameTime = now;
    this._frameCount++;
    return this._deltaTime;
  }
  /**
   * Gets the measured frame rate or sets the target frame rate.
   *
   * @param {number} fps - Fps value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  frameRate(fps) {
    if (fps === undefined) return this._targetFrameRate > 0 ? 1000 / Math.max(this._deltaTime, 1) : 0;
    this._targetFrameRate = fps;
    return this._targetFrameRate;
  }
  /**
   * Returns the configured target frame rate.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  getTargetFrameRate() { return this._targetFrameRate; }

  /**
   * Sets and shows the cursor.
   *
   * @param {string|*} [style=constants.ARROW] - Style value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  cursor(style = constants.ARROW) { this._cursorStyle = style; this._cursorVisible = true; return this._cursorStyle; }
  /**
   * Hides the cursor.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  noCursor() { this._cursorVisible = false; return this; }

  /**
   * Gets or sets virtual fullscreen state.
   *
   * @param {boolean} state - State value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  fullscreen(state) {
    if (state === undefined) return this._fullscreenState;
    this._fullscreenState = Boolean(state);
    return this._fullscreenState;
  }

  /**
   * Sets an accessibility description for the canvas.
   *
   * @param {string|*} text - Text value.
   * @param {string|*} display - Display value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  describe(text, display) { this._descriptions.canvas = { text, display }; return this; }
  /**
   * Sets an accessibility description for a named element.
   *
   * @param {string|*} name - Name value.
   * @param {string|*} text - Text value.
   * @param {string|*} display - Display value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  describeElement(name, text, display) { this._descriptions.elements[name] = { text, display }; return this; }
  /**
   * Returns accessibility descriptions for text output.
   *
   * @param {string|*} display - Display value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  textOutput(display) { return this._descriptions; }
  /**
   * Returns accessibility descriptions for grid output.
   *
   * @param {string|*} display - Display value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  gridOutput(display) { return this._descriptions; }

  /**
   * Sets the virtual environment URL.
   *
   * @param {string|*} url - Url value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  setURL(url) { this._url = url; return this; }
  /**
   * Returns the virtual environment URL.
   *
   * @returns {string|null} Current or generated value.
   */
  getURL() { return this._url; }
  /**
   * Parses query parameters from the virtual URL.
   *
   * @returns {Object} Parsed query parameters.
   */
  getURLParams() {
    if (!this._url) return {};
    const q = this._url.split('?')[1];
    if (!q) return {};
    return Object.fromEntries(new URLSearchParams(q));
  }
  /**
   * Returns path segments from the virtual URL.
   *
   * @returns {string[]} URL path segments.
   */
  getURLPath() {
    if (!this._url) return [];
    const u = new URL(this._url, 'http://localhost');
    return u.pathname.split('/').filter(Boolean);
  }

  /**
   * Returns the configured WebGL version.
   *
   * @returns {string|null} Current or generated value.
   */
  webglVersion() { return this._webglVersion; }

  /**
   * Writes values to standard output.
   *
   * @param {*} ...args - Args value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  print(...args) { console.log(...args); return this; }

  /**
   * Converts screen coordinates to world coordinates.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {Object} transform - Transform value.
   *
   * @returns {number[]} Computed coordinates or matrix.
   */
  screenToWorld(x, y, transform) {
    // transform: an instance of Transform (utils/src/transform.js), optional.
    if (!transform) return [x, y, 0];
    const inv = invertMatrix4(transform.matrix);
    return applyMat4(inv, x, y, 0);
  }
  /**
   * Converts world coordinates to screen coordinates.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} z - Z value.
   * @param {Object} transform - Transform value.
   *
   * @returns {number[]} Computed coordinates or matrix.
   */
  worldToScreen(x, y, z, transform) {
    if (!transform) return [x, y];
    const [sx, sy] = applyMat4(transform.matrix, x, y, z);
    return [sx, sy];
  }
}

/**
 * Applies a column-major 4x4 transformation matrix to a 3D point.
 *
 * @param {string|*} m - M value.
 * @param {number} x - X value.
 * @param {number} y - Y value.
 * @param {number} z - Z value.
 *
 * @returns {number[]} Computed coordinates or matrix.
 */
function applyMat4(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14]
  ];
}
/**
 * Calculates the inverse of a general 4x4 matrix.
 *
 * @throws {Error} If the matrix is singular.
 *
 * @param {string|*} m - M value.
 *
 * @returns {number[]} Computed coordinates or matrix.
 */
function invertMatrix4(m) {
  // General 4x4 inverse (adjugate/determinant method).
  const inv = new Array(16);
  inv[0] = m[5]*m[10]*m[15]-m[5]*m[11]*m[14]-m[9]*m[6]*m[15]+m[9]*m[7]*m[14]+m[13]*m[6]*m[11]-m[13]*m[7]*m[10];
  inv[4] = -m[4]*m[10]*m[15]+m[4]*m[11]*m[14]+m[8]*m[6]*m[15]-m[8]*m[7]*m[14]-m[12]*m[6]*m[11]+m[12]*m[7]*m[10];
  inv[8] = m[4]*m[9]*m[15]-m[4]*m[11]*m[13]-m[8]*m[5]*m[15]+m[8]*m[7]*m[13]+m[12]*m[5]*m[11]-m[12]*m[7]*m[9];
  inv[12] = -m[4]*m[9]*m[14]+m[4]*m[10]*m[13]+m[8]*m[5]*m[14]-m[8]*m[6]*m[13]-m[12]*m[5]*m[10]+m[12]*m[6]*m[9];
  inv[1] = -m[1]*m[10]*m[15]+m[1]*m[11]*m[14]+m[9]*m[2]*m[15]-m[9]*m[3]*m[14]-m[13]*m[2]*m[11]+m[13]*m[3]*m[10];
  inv[5] = m[0]*m[10]*m[15]-m[0]*m[11]*m[14]-m[8]*m[2]*m[15]+m[8]*m[3]*m[14]+m[12]*m[2]*m[11]-m[12]*m[3]*m[10];
  inv[9] = -m[0]*m[9]*m[15]+m[0]*m[11]*m[13]+m[8]*m[1]*m[15]-m[8]*m[3]*m[13]-m[12]*m[1]*m[11]+m[12]*m[3]*m[9];
  inv[13] = m[0]*m[9]*m[14]-m[0]*m[10]*m[13]-m[8]*m[1]*m[14]+m[8]*m[2]*m[13]+m[12]*m[1]*m[10]-m[12]*m[2]*m[9];
  inv[2] = m[1]*m[6]*m[15]-m[1]*m[7]*m[14]-m[5]*m[2]*m[15]+m[5]*m[3]*m[14]+m[13]*m[2]*m[7]-m[13]*m[3]*m[6];
  inv[6] = -m[0]*m[6]*m[15]+m[0]*m[7]*m[14]+m[4]*m[2]*m[15]-m[4]*m[3]*m[14]-m[12]*m[2]*m[7]+m[12]*m[3]*m[6];
  inv[10] = m[0]*m[5]*m[15]-m[0]*m[7]*m[13]-m[4]*m[1]*m[15]+m[4]*m[3]*m[13]+m[12]*m[1]*m[7]-m[12]*m[3]*m[5];
  inv[14] = -m[0]*m[5]*m[14]+m[0]*m[6]*m[13]+m[4]*m[1]*m[14]-m[4]*m[2]*m[13]-m[12]*m[1]*m[6]+m[12]*m[2]*m[5];
  inv[3] = -m[1]*m[6]*m[11]+m[1]*m[7]*m[10]+m[5]*m[2]*m[11]-m[5]*m[3]*m[10]-m[9]*m[2]*m[7]+m[9]*m[3]*m[6];
  inv[7] = m[0]*m[6]*m[11]-m[0]*m[7]*m[10]-m[4]*m[2]*m[11]+m[4]*m[3]*m[10]+m[8]*m[2]*m[7]-m[8]*m[3]*m[6];
  inv[11] = -m[0]*m[5]*m[11]+m[0]*m[7]*m[9]+m[4]*m[1]*m[11]-m[4]*m[3]*m[9]-m[8]*m[1]*m[7]+m[8]*m[3]*m[5];
  inv[15] = m[0]*m[5]*m[10]-m[0]*m[6]*m[9]-m[4]*m[1]*m[10]+m[4]*m[2]*m[9]+m[8]*m[1]*m[6]-m[8]*m[2]*m[5];

  let det = m[0]*inv[0]+m[1]*inv[4]+m[2]*inv[8]+m[3]*inv[12];
  /**
   * Performs the if operation.
   *
   * @param {string|*} [det=== 0] - Det value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  if (det === 0) throw new Error('Matrix is not invertible');
  det = 1.0 / det;
  return inv.map(v => v * det);
}

module.exports = { Environment };
