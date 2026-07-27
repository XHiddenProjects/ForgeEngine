'use strict';

const constants = require('./constants.js');

/**
 * Clamps and rounds a numeric value to the 8-bit color-channel range.
 *
 * @param {number} n - Value to clamp.
 *
 * @returns {number} Integer from 0 through 255.
 */
function clamp255(n) { return Math.round(Math.max(0, Math.min(255, n))); }
/**
 * Clamps a numeric value to the normalized range.
 *
 * @param {number} n - Value to clamp.
 *
 * @returns {number} Value from 0 through 1.
 */
function clamp1(n) { return Math.max(0, Math.min(1, n)); }

/**
 * Converts an RGB color to HSL components.
 *
 * @param {number} r - Red channel from 0 through 255.
 * @param {number} g - Green channel from 0 through 255.
 * @param {number} b - Blue channel from 0 through 255.
 *
 * @returns {number[]} Hue in degrees followed by saturation and lightness percentages.
 */
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

/**
 * Converts HSL components to RGB channels.
 *
 * @param {number} h - Hue in degrees.
 * @param {number} s - Saturation percentage.
 * @param {number} l - Lightness percentage.
 *
 * @returns {number[]} Red, green, and blue channels from 0 through 255.
 */
function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
  ];
}

/**
 * A standalone RGBA color value (no canvas / DOM dependency).
 * Internally stored as 0-255 RGBA; HSL is derived on demand.
 */
class Color {
  /**
   * Creates an RGBA color value.
   *
   * @param {number|string|number[]} [r=0] - Red channel, supported color string, or RGBA array.
   * @param {number} [g=0] - Green channel.
   * @param {number} [b=0] - Blue channel.
   * @param {number} [a=255] - Alpha channel.
   */
  constructor(r = 0, g = 0, b = 0, a = 255) {
    if (Array.isArray(r)) { [r, g, b, a = 255] = r; }
    if (typeof r === 'string') {
      const parsed = Color.parse(r);
      r = parsed.r; g = parsed.g; b = parsed.b; a = parsed.a;
    }
    if (g === undefined) { g = r; b = r; } // grayscale shorthand
    this._r = clamp255(r);
    this._g = clamp255(g);
    this._b = clamp255(b);
    this._a = a === undefined ? 255 : clamp255(a);
  }

  /**
   * Parses a supported CSS-style color string.
   *
   * @throws {Error} If the color string is not recognized.
   *
   * @param {string} str - Hex, RGB, or RGBA color string.
   *
   * @returns {{r:number,g:number,b:number,a:number}} Parsed 8-bit RGBA channels.
   */
  static parse(str) {
    str = str.trim();
    let m = str.match(/^#([0-9a-f]{3})$/i);
    if (m) {
      const [r, g, b] = m[1].split('').map(c => parseInt(c + c, 16));
      return { r, g, b, a: 255 };
    }
    m = str.match(/^#([0-9a-f]{6})$/i);
    if (m) {
      const n = parseInt(m[1], 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 255 };
    }
    m = str.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      const parts = m[1].split(',').map(s => parseFloat(s.trim()));
      const [r, g, b, a = 1] = parts;
      return { r, g, b, a: Math.round(a * 255) };
    }
    throw new Error(`Color.parse: unrecognized color string "${str}"`);
  }

  /**
   * Returns the red channel.
   *
   * @returns {number} Channel value from 0 through 255.
   */
  red() { return this._r; }
  /**
   * Returns the green channel.
   *
   * @returns {number} Channel value from 0 through 255.
   */
  green() { return this._g; }
  /**
   * Returns the blue channel.
   *
   * @returns {number} Channel value from 0 through 255.
   */
  blue() { return this._b; }
  /**
   * Returns the alpha channel.
   *
   * @returns {number} Channel value from 0 through 255.
   */
  alpha() { return this._a; }
  /**
   * Sets the red channel.
   *
   * @param {number} v - New channel value; clamped and rounded to 0 through 255.
   *
   * @returns {Color} This color for chaining.
   */
  setRed(v) { this._r = clamp255(v); return this; }
  /**
   * Sets the green channel.
   *
   * @param {number} v - New channel value; clamped and rounded to 0 through 255.
   *
   * @returns {Color} This color for chaining.
   */
  setGreen(v) { this._g = clamp255(v); return this; }
  /**
   * Sets the blue channel.
   *
   * @param {number} v - New channel value; clamped and rounded to 0 through 255.
   *
   * @returns {Color} This color for chaining.
   */
  setBlue(v) { this._b = clamp255(v); return this; }
  /**
   * Sets the alpha channel.
   *
   * @param {number} v - New channel value; clamped and rounded to 0 through 255.
   *
   * @returns {Color} This color for chaining.
   */
  setAlpha(v) { this._a = clamp255(v); return this; }

  /**
   * Returns the color hue in degrees.
   *
   * @returns {number} Computed component value.
   */
  hue() { return rgbToHsl(this._r, this._g, this._b)[0]; }
  /**
   * Returns the color HSL saturation percentage.
   *
   * @returns {number} Computed component value.
   */
  saturation() { return rgbToHsl(this._r, this._g, this._b)[1]; }
  /**
   * Returns the color HSL lightness percentage.
   *
   * @returns {number} Computed component value.
   */
  lightness() { return rgbToHsl(this._r, this._g, this._b)[2]; }
  /**
   * Returns the color HSB brightness percentage.
   *
   * @returns {number} Computed component value.
   */
  brightness() {
    // HSB brightness (value), distinct from HSL lightness
    return (Math.max(this._r, this._g, this._b) / 255) * 100;
  }

  /**
   * Calculates the WCAG relative-luminance contrast ratio against another color.
   *
   * @param {Color} other - Color to compare.
   *
   * @returns {number} Contrast ratio from 1 through 21.
   */
  contrast(other) {
    const luminance = c => {
      const [r, g, b] = [c._r, c._g, c._b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const l1 = luminance(this) + 0.05;
    const l2 = luminance(other) + 0.05;
    return l1 > l2 ? l1 / l2 : l2 / l1;
  }

  /**
   * Returns the color as RGBA channels.
   *
   * @returns {number[]} A new `[red, green, blue, alpha]` array.
   */
  toArray() { return [this._r, this._g, this._b, this._a]; }
  /**
   * Formats the color as a hexadecimal or CSS color string.
   *
   * @param {string} [format='#rrggbbaa'] - Output format: `#rrggbb`, `#rrggbbaa`, `rgb`, or `rgba`.
   *
   * @returns {string} Formatted color value.
   */
  toString(format = '#rrggbbaa') {
    if (format === '#rrggbb') {
      return '#' + [this._r, this._g, this._b].map(v => v.toString(16).padStart(2, '0')).join('');
    }
    if (format === 'rgb') return `rgb(${this._r}, ${this._g}, ${this._b})`;
    if (format === 'rgba') return `rgba(${this._r}, ${this._g}, ${this._b}, ${(this._a / 255).toFixed(3)})`;
    return '#' + [this._r, this._g, this._b, this._a].map(v => v.toString(16).padStart(2, '0')).join('');
  }
}

/**
 * Creates a Color from channel values, an array, or a supported string.
 *
 * @param {*} ...args - Arguments forwarded to the Color constructor.
 *
 * @returns {Color} Created color.
 */
function color(...args) {
  if (args.length === 1) return new Color(args[0]);
  return new Color(...args);
}

/**
 * Linearly interpolates between two colors.
 *
 * @param {Color} c1 - Starting color.
 * @param {Color} c2 - Ending color.
 * @param {number} amt - Interpolation amount, clamped to 0 through 1.
 *
 * @returns {Color} Interpolated color.
 */
function lerpColor(c1, c2, amt) {
  amt = clamp1(amt);
  return new Color(
    c1.red() + (c2.red() - c1.red()) * amt,
    c1.green() + (c2.green() - c1.green()) * amt,
    c1.blue() + (c2.blue() - c1.blue()) * amt,
    c1.alpha() + (c2.alpha() - c1.alpha()) * amt
  );
}

/**
 * Interpolates across a color palette.
 *
 * @throws {Error} If the palette is empty.
 *
 * @param {Color[]} palette - Ordered palette containing at least one color.
 * @param {number} amt - Position across the palette, clamped to 0 through 1.
 *
 * @returns {Color} Interpolated palette color.
 */
function paletteLerp(palette, amt) {
  // palette: array of Color, amt: 0-1 across the whole palette
  if (palette.length === 0) throw new Error('paletteLerp: palette is empty');
  if (palette.length === 1) return palette[0];
  const scaled = clamp1(amt) * (palette.length - 1);
  const i = Math.floor(scaled);
  const t = scaled - i;
  if (i >= palette.length - 1) return palette[palette.length - 1];
  return lerpColor(palette[i], palette[i + 1], t);
}

// ---------------------------------------------------------------------------
// Setting: mutable rendering state (fill/stroke/blend/clip/colorMode etc.)
// Headless equivalent of p5's drawing-state setters. Operates on a context
// object so multiple independent "canvases" can each keep their own state.
// ---------------------------------------------------------------------------
/**
 * Creates the default mutable rendering-state object.
 *
 * @returns {Object} New rendering state with fill, stroke, blending, color-mode, erase, and clipping defaults.
 */
function createRenderState() {
  return {
    fillColor: new Color(255, 255, 255, 255),
    strokeColor: new Color(0, 0, 0, 255),
    fillEnabled: true,
    strokeEnabled: true,
    backgroundColor: new Color(204, 204, 204, 255),
    blendModeValue: constants.BLEND,
    colorModeValue: constants.RGB || 'rgb',
    colorMaxes: [255, 255, 255, 255],
    eraseState: null,
    clipRegion: null,
    clipping: false
  };
}

class Setting {
  /**
   * Creates a rendering-state controller.
   *
   * @param {Object} [state=createRenderState()] - Mutable state object to manage.
   */
  constructor(state = createRenderState()) { this.state = state; }

  /**
   * Sets the background color.
   *
   * @param {*} ...args - A Color instance or arguments accepted by `color()`.
   *
   * @returns {Color} Applied background color.
   */
  background(...args) {
    this.state.backgroundColor = args[0] instanceof Color ? args[0] : color(...args);
    return this.state.backgroundColor;
  }
  /**
   * Sets and enables the fill color.
   *
   * @param {*} ...args - A Color instance or arguments accepted by `color()`.
   *
   * @returns {Color} Applied fill color.
   */
  fill(...args) {
    this.state.fillColor = args[0] instanceof Color ? args[0] : color(...args);
    this.state.fillEnabled = true;
    return this.state.fillColor;
  }
  /**
   * Sets and enables the stroke color.
   *
   * @param {*} ...args - A Color instance or arguments accepted by `color()`.
   *
   * @returns {Color} Applied stroke color.
   */
  stroke(...args) {
    this.state.strokeColor = args[0] instanceof Color ? args[0] : color(...args);
    this.state.strokeEnabled = true;
    return this.state.strokeColor;
  }
  /**
   * Disables filling shapes.
   *
   * @returns {Setting} This settings controller for chaining.
   */
  noFill() { this.state.fillEnabled = false; return this; }
  /**
   * Disables shape strokes.
   *
   * @returns {Setting} This settings controller for chaining.
   */
  noStroke() { this.state.strokeEnabled = false; return this; }
  /**
   * Clears the background to fully transparent black.
   *
   * @returns {Setting} This settings controller for chaining.
   */
  clear() {
    this.state.backgroundColor = new Color(0, 0, 0, 0);
    return this;
  }
  /**
   * Gets or sets the active color mode and component maxima.
   *
   * @param {*} [mode] - Color mode to apply; omit to read the current mode.
   * @param {number} ...maxes - One shared maximum or per-component maxima.
   *
   * @returns {*} Current mode when omitted, otherwise the applied mode.
   */
  colorMode(mode, ...maxes) {
    if (mode === undefined) return this.state.colorModeValue;
    this.state.colorModeValue = mode;
    if (maxes.length) this.state.colorMaxes = maxes.length === 1 ? [maxes[0], maxes[0], maxes[0], maxes[0]] : maxes;
    return this.state.colorModeValue;
  }
  /**
   * Gets or sets the compositing mode.
   *
   * @param {*} [mode] - Blend mode to apply; omit to read the current mode.
   *
   * @returns {*} Current or applied blend mode.
   */
  blendMode(mode) {
    if (mode === undefined) return this.state.blendModeValue;
    this.state.blendModeValue = mode;
    return this.state.blendModeValue;
  }
  /**
   * Enables erase mode with fill and stroke strengths.
   *
   * @param {number} [strengthFill=255] - Fill erasing strength.
   * @param {number} [strengthStroke=255] - Stroke erasing strength.
   *
   * @returns {Setting} This settings controller for chaining.
   */
  erase(strengthFill = 255, strengthStroke = 255) {
    this.state.eraseState = { strengthFill, strengthStroke };
    return this;
  }
  /**
   * Disables erase mode.
   *
   * @returns {Setting} This settings controller for chaining.
   */
  noErase() { this.state.eraseState = null; return this; }
  /**
   * Begins recording a clipping region.
   *
   * @param {Object} [options={}] - Clip configuration options.
   *
   * @returns {Object} New clip-region descriptor.
   */
  beginClip(options = {}) {
    this.state.clipping = true;
    this.state.clipRegion = { options, path: [] };
    return this.state.clipRegion;
  }
  /**
   * Records a clipping region using a callback and then ends clipping.
   *
   * @param {Function} callback - Function that defines the clipping path.
   *
   * @returns {Object|null} Recorded clip region.
   */
  clip(callback) {
    this.beginClip();
    if (typeof callback === 'function') callback();
    return this.endClip();
  }
  /**
   * Stops recording and returns the current clipping region.
   *
   * @returns {Object|null} Current clip-region descriptor.
   */
  endClip() {
    this.state.clipping = false;
    const region = this.state.clipRegion;
    return region;
  }
}

module.exports = {
  Color,
  Setting,
  color,
  lerpColor,
  paletteLerp,
  createRenderState
};
