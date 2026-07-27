'use strict';

const fs = require('fs');
const path = require('path');
const constants = require('./constants.js');

const DEFAULT_SIZE = 12;
const DEFAULT_FAMILY = 'sans-serif';
const VALID_ALIGN = new Set([constants.LEFT, constants.CENTER, constants.RIGHT]);
const VALID_BASELINES = new Set([
  constants.TOP, constants.BOTTOM, constants.CENTER, constants.BASELINE,
  'alphabetic', 'middle', 'hanging', 'ideographic'
]);

/**
 * Converts a value to a finite number.
 *
 * @param {*} value - Value value.
 * @param {*} name - Name value.
 *
 * @throws {Error} If the value is not finite.
 *
 * @returns {number} The resulting value.
 */
function finite(value, name) {
  const number = Number(value);
  /**
   * Performs the if operation.
   *
   * @param {number} !Number.isFinite(number - !number.isfinite(number value.
   *
   * @returns {*} The resulting value.
   */
  if (!Number.isFinite(number)) throw new TypeError(`${name} must be a finite number.`);
  return number;
}

/**
 * Converts a value to a strictly positive finite number.
 *
 * @param {*} value - Value value.
 * @param {*} name - Name value.
 *
 * @throws {Error} If the value is not greater than zero.
 *
 * @returns {number} The resulting value.
 */
function positive(value, name) {
  const number = finite(value, name);
  /**
   * Performs the if operation.
   *
   * @param {number} [number <=0] - Number < value.
   *
   * @returns {*} The resulting value.
   */
  if (number <= 0) throw new RangeError(`${name} must be greater than zero.`);
  return number;
}

/**
 * Normalizes a font style for CSS rendering.
 *
 * @param {*} style - Style value.
 *
 * @returns {string} The resulting value.
 */
function normalizeStyle(style) {
  style = String(style || constants.NORMAL).toLowerCase().trim();
  /**
   * Performs the if operation.
   *
   * @param {*} [style=== constants.BOLDITALIC || style === 'italic bold'] - Style value.
   *
   * @returns {*} The resulting value.
   */
  if (style === constants.BOLDITALIC || style === 'italic bold') return 'italic';
  return style === constants.ITALIC ? 'italic' : 'normal';
}

/**
 * Validates and normalizes a CSS font weight.
 *
 * @param {*} weight - Weight value.
 *
 * @throws {Error} If the weight is unsupported or outside 1 through 1000.
 *
 * @returns {string|number} The resulting value.
 */
function normalizeWeight(weight) {
  /**
   * Performs the if operation.
   *
   * @param {number} [typeof weight=== 'number'] - Typeof weight value.
   *
   * @returns {*} The resulting value.
   */
  if (typeof weight === 'number') {
    if (weight < 1 || weight > 1000) throw new RangeError('textWeight() must be between 1 and 1000.');
    return Math.round(weight);
  }
  const value = String(weight || constants.NORMAL).toLowerCase().trim();
  /**
   * Performs the if operation.
   *
   * @param {*} [value=== constants.BOLD || value === 'bolder' || value === 'lighter' || value === 'normal'] - Value value.
   *
   * @returns {*} The resulting value.
   */
  if (value === constants.BOLD || value === 'bolder' || value === 'lighter' || value === 'normal') return value;
  /**
   * Performs the if operation.
   *
   * @param {number} /^[1-9]00$/.test(value - /^[1-9]00$/.test(value value.
   *
   * @returns {*} The resulting value.
   */
  if (/^[1-9]00$/.test(value)) return Number(value);
  throw new TypeError(`Unsupported font weight: ${weight}`);
}

/**
 * Checks whether a value resembles a Canvas 2D text context.
 *
 * @param {*} value - Value value.
 *
 * @returns {boolean} The resulting value.
 */
function isContext(value) {
  return value && typeof value === 'object' &&
    (typeof value.fillText === 'function' || typeof value.measureText === 'function');
}

/** A loaded font, backed by opentype.js when that optional package is installed. */
class Font {
  /**
   * Creates a new Font instance.
   *
   * @param {string|Buffer|ArrayBuffer|ArrayBufferView} source - Source value.
   * @param {number} [parsed=null] - Parsed value.
   * @param {number} [family=null] - Family value.
   */
  constructor(source, parsed = null, family = null) {
    this.source = source || null;
    this._font = parsed;
    this.family = family || parsed?.names?.fontFamily?.en ||
      (typeof source === 'string' ? path.basename(source, path.extname(source)) : DEFAULT_FAMILY);
  }

  /**
   * Returns the font design units per em.
   *
   * @returns {number} The resulting value.
   */
  get unitsPerEm() { return this._font?.unitsPerEm || 1000; }
  /**
   * Returns the font ascender in design units.
   *
   * @returns {number} The resulting value.
   */
  get ascender() { return this._font?.ascender ?? 800; }
  /**
   * Returns the font descender in design units.
   *
   * @returns {number} The resulting value.
   */
  get descender() { return this._font?.descender ?? -200; }

  /**
   * Ensures that parsed font data is available.
   *
   * @param {number} method - Method value.
   *
   * @throws {Error} If no parsed font data is available.
   *
   * @returns {void} The resulting value.
   */
  _requireParsed(method) {
    if (!this._font) {
      throw new Error(`${method}() requires a parsed font. Install "opentype.js" and load a .ttf or .otf file.`);
    }
  }

  /**
   * Converts text into opentype path objects.
   *
   * @param {*} text - Text value.
   * @param {number} [x=0] - X value.
   * @param {number} [y=0] - Y value.
   * @param {number} [size=DEFAULT_SIZE] - Size value.
   * @param {Object} [options={}] - Options value.
   *
   * @returns {Object[]} The resulting value.
   */
  textToPaths(text, x = 0, y = 0, size = DEFAULT_SIZE, options = {}) {
    this._requireParsed('textToPaths');
    return this._font.getPaths(String(text), finite(x, 'x'), finite(y, 'y'), positive(size, 'size'), options);
  }

  /**
   * Extracts sampled points from glyph path commands.
   *
   * @param {*} text - Text value.
   * @param {number} [x=0] - X value.
   * @param {number} [y=0] - Y value.
   * @param {number} [size=DEFAULT_SIZE] - Size value.
   * @param {Object} [options={}] - Options value.
   *
   * @returns {Object[]} The resulting value.
   */
  textToPoints(text, x = 0, y = 0, size = DEFAULT_SIZE, options = {}) {
    const sampleFactor = positive(options.sampleFactor ?? 0.1, 'sampleFactor');
    const paths = this.textToPaths(text, x, y, size, options);
    const points = [];
    for (const glyphPath of paths) {
      for (const command of glyphPath.commands || []) {
        const coordinates = [];
        if (Number.isFinite(command.x) && Number.isFinite(command.y)) coordinates.push([command.x, command.y]);
        if (Number.isFinite(command.x1) && Number.isFinite(command.y1)) coordinates.push([command.x1, command.y1]);
        if (Number.isFinite(command.x2) && Number.isFinite(command.y2)) coordinates.push([command.x2, command.y2]);
        for (const [px, py] of coordinates) {
          const previous = points[points.length - 1];
          const distance = previous ? Math.hypot(px - previous.x, py - previous.y) : Infinity;
          if (!previous || distance >= 1 / sampleFactor) points.push({ x: px, y: py, alpha: 0 });
        }
      }
    }
    return points;
  }

  /**
   * Converts glyph paths into contour point collections.
   *
   * @param {*} text - Text value.
   * @param {number} [x=0] - X value.
   * @param {number} [y=0] - Y value.
   * @param {number} [size=DEFAULT_SIZE] - Size value.
   * @param {Object} [options={}] - Options value.
   *
   * @returns {Object[][][]} The resulting value.
   */
  textToContours(text, x = 0, y = 0, size = DEFAULT_SIZE, options = {}) {
    const paths = this.textToPaths(text, x, y, size, options);
    return paths.map(glyphPath => {
      const contours = [];
      let contour = [];
      for (const command of glyphPath.commands || []) {
        if (command.type === 'M' && contour.length) {
          contours.push(contour);
          contour = [];
        }
        if (Number.isFinite(command.x) && Number.isFinite(command.y)) {
          contour.push({ x: command.x, y: command.y, type: command.type });
        }
        if (command.type === 'Z' && contour.length) {
          contours.push(contour);
          contour = [];
        }
      }
      if (contour.length) contours.push(contour);
      return contours;
    });
  }

  /**
   * Creates a simple extruded text-model descriptor.
   *
   * @param {*} text - Text value.
   * @param {number} [x=0] - X value.
   * @param {number} [y=0] - Y value.
   * @param {number} [size=DEFAULT_SIZE] - Size value.
   * @param {Object} [options={}] - Options value.
   *
   * @returns {Object} The resulting value.
   */
  textToModel(text, x = 0, y = 0, size = DEFAULT_SIZE, options = {}) {
    const depth = Math.max(0, finite(options.depth ?? 1, 'depth'));
    const contours = this.textToContours(text, x, y, size, options).flat();
    const vertices = [];
    for (const contour of contours) {
      for (const point of contour) vertices.push({ x: point.x, y: point.y, z: 0 });
      for (const point of contour) vertices.push({ x: point.x, y: point.y, z: depth });
    }
    return { vertices, contours, depth };
  }
}

/** Stateful, p5-inspired typography API for Node/CommonJS drawing contexts. */
class Typography {
  /**
   * Creates a new Typography instance.
   *
   * @param {Object} [context=null] - Context value.
   */
  constructor(context = null) {
    this._context = isContext(context) ? context : null;
    this._font = DEFAULT_FAMILY;
    this._size = DEFAULT_SIZE;
    this._style = constants.NORMAL;
    this._weight = constants.NORMAL;
    this._leading = this._size * constants._DEFAULT_LEADMULT;
    this._leadingIsAutomatic = true;
    this._alignX = constants.LEFT;
    this._alignY = constants.BASELINE;
    this._direction = 'ltr';
    this._wrap = constants.WORD;
    this._applyContext();
  }

  /**
   * Assigns a Canvas-like text rendering context.
   *
   * @param {Object} context - Context value.
   *
   * @throws {Error} If the value is not a Canvas-like context.
   *
   * @returns {Typography} This instance for chaining.
   */
  setContext(context) {
    if (!isContext(context)) throw new TypeError('setContext() expects a Canvas-like 2D context.');
    this._context = context;
    this._applyContext();
    return this;
  }

  /**
   * Returns the active font-family name.
   *
   * @returns {string} The resulting value.
   */
  _family() { return this._font instanceof Font ? this._font.family : String(this._font); }
  /**
   * Builds the CSS font shorthand for the current state.
   *
   * @returns {string} The resulting value.
   */
  _cssFont() { return `${normalizeStyle(this._style)} ${normalizeWeight(this._weight)} ${this._size}px ${JSON.stringify(this._family())}`; }

  /**
   * Applies typography state to the rendering context.
   *
   * @returns {void} The resulting value.
   */
  _applyContext() {
    if (!this._context) return;
    this._context.font = this._cssFont();
    this._context.textAlign = this._alignX === constants.CENTER ? 'center' : this._alignX;
    this._context.textBaseline = this._alignY === constants.CENTER ? 'middle' : this._alignY;
    if ('direction' in this._context) this._context.direction = this._direction;
  }

  /**
   * Measures text using the best available backend.
   *
   * @param {*} [text='Mg'] - Text value.
   *
   * @returns {Object} The resulting value.
   */
  _metrics(text = 'Mg') {
    const value = String(text);
    if (this._context?.measureText) {
      this._applyContext();
      const metric = this._context.measureText(value);
      const ascent = metric.actualBoundingBoxAscent ?? this._size * 0.8;
      const descent = metric.actualBoundingBoxDescent ?? this._size * 0.2;
      return {
        width: metric.width,
        ascent,
        descent,
        left: metric.actualBoundingBoxLeft ?? 0,
        right: metric.actualBoundingBoxRight ?? metric.width
      };
    }
    if (this._font instanceof Font && this._font._font) {
      const scale = this._size / this._font.unitsPerEm;
      return {
        width: this._font._font.getAdvanceWidth(value, this._size),
        ascent: this._font.ascender * scale,
        descent: -this._font.descender * scale,
        left: 0,
        right: this._font._font.getAdvanceWidth(value, this._size)
      };
    }
    const width = Array.from(value).reduce((sum, character) =>
      sum + this._size * (/\s/.test(character) ? 0.33 : /[MW@#]/.test(character) ? 0.9 : 0.6), 0);
    return { width, ascent: this._size * 0.8, descent: this._size * 0.2, left: 0, right: width };
  }

  /**
   * Returns the active font ascender.
   *
   * @returns {number} The resulting value.
   */
  fontAscent() { return this._font instanceof Font ? this._font.ascender : 800; }
  /**
   * Returns the active font descender.
   *
   * @returns {number} The resulting value.
   */
  fontDescent() { return this._font instanceof Font ? this._font.descender : -200; }
  /**
   * Returns the active font units-per-em width.
   *
   * @returns {number} The resulting value.
   */
  fontWidth() { return this._font instanceof Font ? this._font.unitsPerEm : 1000; }
  /**
   * Returns the active font’s design-space bounds.
   *
   * @returns {Object} The resulting value.
   */
  fontBounds() { return { x: 0, y: this.fontDescent(), w: this.fontWidth(), h: this.fontAscent() - this.fontDescent() }; }

  /**
   * Asynchronously loads and parses a TrueType or OpenType font.
   *
   * @param {string|Buffer|ArrayBuffer|ArrayBufferView} source - Source value.
   * @param {Function} callback - Callback value.
   * @param {Function} onError - Onerror value.
   *
   * @throws {Error} If the optional parser is unavailable or the source is invalid.
   *
   * @returns {Promise<Font>} The resulting value.
   */
  loadFont(source, callback, onError) {
    const finish = font => { if (typeof callback === 'function') callback(font); return font; };
    try {
      let opentype;
      try { opentype = require('opentype.js'); }
      catch { throw new Error('loadFont() requires the optional dependency "opentype.js". Run: npm install opentype.js'); }
      if (Buffer.isBuffer(source) || source instanceof ArrayBuffer || ArrayBuffer.isView(source)) {
        const buffer = Buffer.isBuffer(source) ? source : Buffer.from(source.buffer || source);
        const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
        return Promise.resolve(finish(new Font(null, opentype.parse(arrayBuffer))));
      }
      if (typeof source !== 'string') throw new TypeError('loadFont() expects a font path or Buffer.');
      return fs.promises.readFile(source)
        .then(buffer => {
          const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
          return finish(new Font(source, opentype.parse(bytes)));
        })
        .catch(error => { if (typeof onError === 'function') onError(error); throw error; });
    } catch (error) {
      if (typeof onError === 'function') onError(error);
      return Promise.reject(error);
    }
  }

  /**
   * Draws wrapped text to the current Canvas-like context.
   *
   * @param {*} value - Value value.
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} maxWidth - Maxwidth value.
   * @param {number} maxHeight - Maxheight value.
   *
   * @throws {Error} If no context with `fillText()` is available.
   *
   * @returns {Typography} This instance for chaining.
   */
  text(value, x, y, maxWidth, maxHeight) {
    if (!this._context?.fillText) throw new Error('text() requires a Canvas-like context with fillText().');
    x = finite(x, 'x'); y = finite(y, 'y');
    const lines = this._layout(String(value), maxWidth);
    const limit = maxHeight == null ? Infinity : Math.max(0, finite(maxHeight, 'maxHeight'));
    this._applyContext();
    lines.forEach((line, index) => {
      if (index * this._leading <= limit) this._context.fillText(line, x, y + index * this._leading);
    });
    return this;
  }

  /**
   * Breaks text into wrapped lines.
   *
   * @param {*} value - Value value.
   * @param {number} maxWidth - Maxwidth value.
   *
   * @returns {string[]} The resulting value.
   */
  _layout(value, maxWidth) {
    const paragraphs = value.split(/\r?\n/);
    if (maxWidth == null) return paragraphs;
    const width = positive(maxWidth, 'maxWidth');
    const lines = [];
    for (const paragraph of paragraphs) {
      const tokens = this._wrap === constants.CHAR ? Array.from(paragraph) : paragraph.split(/(\s+)/).filter(Boolean);
      let line = '';
      for (const token of tokens) {
        const candidate = line + token;
        if (line && this.textWidth(candidate) > width) { lines.push(line.trimEnd()); line = token.trimStart(); }
        else line = candidate;
      }
      lines.push(line);
    }
    return lines;
  }

  /**
   * Sets horizontal alignment and vertical baseline.
   *
   * @param {*} horizontal - Horizontal value.
   * @param {*} [vertical=this._alignY] - Vertical value.
   *
   * @throws {Error} If either alignment value is unsupported.
   *
   * @returns {Typography} This instance for chaining.
   */
  textAlign(horizontal, vertical = this._alignY) {
    if (!VALID_ALIGN.has(horizontal)) throw new TypeError(`Invalid horizontal alignment: ${horizontal}`);
    if (!VALID_BASELINES.has(vertical)) throw new TypeError(`Invalid vertical alignment: ${vertical}`);
    this._alignX = horizontal; this._alignY = vertical; this._applyContext(); return this;
  }
  /**
   * Returns measured text ascent.
   *
   * @returns {number} The resulting value.
   */
  textAscent() { return this._metrics().ascent; }
  /**
   * Returns measured text descent.
   *
   * @returns {number} The resulting value.
   */
  textDescent() { return this._metrics().descent; }
  /**
   * Returns a measured bounding box for text.
   *
   * @param {*} value - Value value.
   * @param {number} [x=0] - X value.
   * @param {number} [y=0] - Y value.
   *
   * @returns {Object} The resulting value.
   */
  textBounds(value, x = 0, y = 0) {
    x = finite(x, 'x'); y = finite(y, 'y');
    const m = this._metrics(value);
    return { x: x - m.left, y: y - m.ascent, w: m.left + m.right, h: m.ascent + m.descent };
  }
  /**
   * Sets the text flow direction.
   *
   * @param {*} direction - Direction value.
   *
   * @throws {Error} If the direction is unsupported.
   *
   * @returns {Typography} This instance for chaining.
   */
  textDirection(direction) {
    direction = String(direction).toLowerCase();
    if (!['ltr', 'rtl', 'inherit'].includes(direction)) throw new TypeError('textDirection() expects "ltr", "rtl", or "inherit".');
    this._direction = direction; this._applyContext(); return this;
  }
  /**
   * Sets the active font family or loaded Font.
   *
   * @param {string|Font} font - Font value.
   * @param {number} size - Size value.
   *
   * @throws {Error} If the font is neither a family string nor a Font.
   *
   * @returns {Typography} This instance for chaining.
   */
  textFont(font, size) {
    if (!(font instanceof Font) && typeof font !== 'string') throw new TypeError('textFont() expects a family name or Font.');
    this._font = font; if (size !== undefined) this.textSize(size); this._applyContext(); return this;
  }
  /**
   * Gets or sets line spacing.
   *
   * @param {*} value - Value value.
   *
   * @returns {Typography|number} The resulting value.
   */
  textLeading(value) {
    if (value === undefined) return this._leading;
    this._leading = positive(value, 'leading'); this._leadingIsAutomatic = false; return this;
  }
  /**
   * Returns an immutable snapshot of typography state.
   *
   * @returns {Object} The resulting value.
   */
  textProperties() {
    return Object.freeze({ font: this._font, family: this._family(), size: this._size, style: this._style,
      weight: this._weight, leading: this._leading, align: this._alignX, baseline: this._alignY,
      direction: this._direction, wrap: this._wrap });
  }
  /**
   * Gets or sets a named typography property.
   *
   * @param {*} name - Name value.
   * @param {*} value - Value value.
   *
   * @throws {Error} If the property name is unknown.
   *
   * @returns {*} The resulting value.
   */
  textProperty(name, value) {
    const map = { font: 'textFont', size: 'textSize', style: 'textStyle', weight: 'textWeight',
      leading: 'textLeading', direction: 'textDirection', wrap: 'textWrap' };
    if (value === undefined) return this.textProperties()[name];
    if (name === 'align') return this.textAlign(value);
    if (name === 'baseline') return this.textAlign(this._alignX, value);
    if (!map[name]) throw new TypeError(`Unknown text property: ${name}`);
    return this[map[name]](value);
  }
  /**
   * Gets or sets font size.
   *
   * @param {*} value - Value value.
   *
   * @returns {Typography|number} The resulting value.
   */
  textSize(value) {
    if (value === undefined) return this._size;
    this._size = positive(value, 'size');
    if (this._leadingIsAutomatic) this._leading = this._size * constants._DEFAULT_LEADMULT;
    this._applyContext(); return this;
  }
  /**
   * Sets the font style and related weight.
   *
   * @param {*} style - Style value.
   *
   * @throws {Error} If the style is unsupported.
   *
   * @returns {Typography} This instance for chaining.
   */
  textStyle(style) {
    style = String(style).toLowerCase().trim();
    if (![constants.NORMAL, constants.ITALIC, constants.BOLD, constants.BOLDITALIC].includes(style)) throw new TypeError(`Invalid text style: ${style}`);
    this._style = style;
    if (style === constants.BOLD || style === constants.BOLDITALIC) this._weight = constants.BOLD;
    this._applyContext(); return this;
  }
  /**
   * Sets the font weight.
   *
   * @param {*} weight - Weight value.
   *
   * @returns {Typography} This instance for chaining.
   */
  textWeight(weight) { this._weight = normalizeWeight(weight); this._applyContext(); return this; }
  /**
   * Returns the measured width of text.
   *
   * @param {*} value - Value value.
   *
   * @returns {number} The resulting value.
   */
  textWidth(value) { return this._metrics(value).width; }
  /**
   * Sets character- or word-based wrapping.
   *
   * @param {*} mode - Mode value.
   *
   * @throws {Error} If the wrapping mode is unsupported.
   *
   * @returns {Typography} This instance for chaining.
   */
  textWrap(mode) {
    mode = String(mode).toUpperCase();
    if (![constants.CHAR, constants.WORD].includes(mode)) throw new TypeError(`textWrap() expects ${constants.CHAR} or ${constants.WORD}.`);
    this._wrap = mode; return this;
  }
}

Typography.Font = Font;
module.exports = Typography;
module.exports.Typography = Typography;
module.exports.Font = Font;
