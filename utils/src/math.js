'use strict';

const constants = require('./constants.js');

// ---------------------------------------------------------------------------
// Perlin noise (classic 3D Perlin, ported to plain JS, no external deps)
// ---------------------------------------------------------------------------
const PERLIN_YWRAPB = 4;
const PERLIN_YWRAP = 1 << PERLIN_YWRAPB;
const PERLIN_ZWRAPB = 8;
const PERLIN_ZWRAP = 1 << PERLIN_ZWRAPB;
const PERLIN_SIZE = 4095;

let perlinOctaves = 4;
let perlinAmpFalloff = 0.5;
let perlin = null;

/**
 * Computes cosine interpolation for Perlin noise.
 *
 * @param {number} i - I value.
 *
 * @returns {number} The resulting value.
 */
function scaledCosine(i) {
  return 0.5 * (1.0 - Math.cos(i * Math.PI));
}

/**
 * Creates a randomized Perlin-noise lookup table.
 *
 * @returns {number[]} The resulting value.
 */
function makePerlin() {
  const arr = new Array(PERLIN_SIZE + 1);
  /**
   * Performs the for operation.
   *
   * @param {string|number|*} [let i=0; i <= PERLIN_SIZE; i++] - Let i value.
   *
   * @returns {*} The resulting value.
   */
  for (let i = 0; i <= PERLIN_SIZE; i++) arr[i] = mathRandom();
  return arr;
}

// -----------------------------------------------------------------------
// Seedable PRNG (mulberry32) used for both random() and noise() so results
// are reproducible when a seed is supplied.
// -----------------------------------------------------------------------
let rngState = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
/**
 * Generates the next seeded pseudorandom value.
 *
 * @returns {number} The resulting value.
 */
function mulberry32() {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  /**
   * Performs the return operation.
   *
   * @param {string|number|*} (t ^ (t >>> 14 - (t ^ (t >>> 14 value.
   *
   * @returns {*} The resulting value.
   */
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/**
 * Returns a seeded pseudorandom value in the half-open interval [0, 1).
 *
 * @returns {number} The resulting value.
 */
function mathRandom() {
  return mulberry32();
}

/**
 * Seeds the pseudorandom number generator.
 *
 * @param {number} seed - Seed value.
 *
 * @returns {number} The resulting value.
 */
function randomSeed(seed) {
  rngState = (seed >>> 0) || 1;
  return rngState;
}

/**
 * Rebuilds the Perlin-noise table from a seed without changing random state.
 *
 * @param {number} seed - Seed value.
 *
 * @returns {*} The resulting value.
 */
function noiseSeed(seed) {
  const savedState = rngState;
  rngState = (seed >>> 0) || 1;
  perlin = makePerlin();
  rngState = savedState;
}

/**
 * Configures Perlin-noise octaves and amplitude falloff.
 *
 * @param {number} lod - Lod value.
 * @param {number} falloff - Falloff value.
 *
 * @returns {{octaves:number,falloff:number}} The resulting value.
 */
function noiseDetail(lod, falloff) {
  /**
   * Performs the if operation.
   *
   * @param {string|number|*} lod > 0 - Lod > 0 value.
   *
   * @returns {*} The resulting value.
   */
  if (lod > 0) perlinOctaves = lod;
  /**
   * Performs the if operation.
   *
   * @param {string|number|*} falloff > 0 - Falloff > 0 value.
   *
   * @returns {*} The resulting value.
   */
  if (falloff > 0) perlinAmpFalloff = falloff;
  return { octaves: perlinOctaves, falloff: perlinAmpFalloff };
}

/**
 * Evaluates three-dimensional Perlin noise.
 *
 * @param {number} x - X value.
 * @param {number} [y=0] - Y value.
 * @param {number} [z=0] - Z value.
 *
 * @returns {number} The resulting value.
 */
function noise(x, y = 0, z = 0) {
  /**
   * Performs the if operation.
   *
   * @param {string|number|*} [perlin== null] - Perlin value.
   *
   * @returns {*} The resulting value.
   */
  if (perlin == null) perlin = makePerlin();

  /**
   * Performs the if operation.
   *
   * @param {string|number|*} x < 0 - X < 0 value.
   *
   * @returns {*} The resulting value.
   */
  if (x < 0) x = -x;
  /**
   * Performs the if operation.
   *
   * @param {string|number|*} y < 0 - Y < 0 value.
   *
   * @returns {*} The resulting value.
   */
  if (y < 0) y = -y;
  /**
   * Performs the if operation.
   *
   * @param {string|number|*} z < 0 - Z < 0 value.
   *
   * @returns {*} The resulting value.
   */
  if (z < 0) z = -z;

  let xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let xf = x - xi, yf = y - yi, zf = z - zi;
  let rxf, ryf;

  let r = 0;
  let ampl = 0.5;

  /**
   * Performs the for operation.
   *
   * @param {string|number|*} [let o=0; o < perlinOctaves; o++] - Let o value.
   *
   * @returns {*} The resulting value.
   */
  for (let o = 0; o < perlinOctaves; o++) {
    let of = xi + (yi << PERLIN_YWRAPB) + (zi << PERLIN_ZWRAPB);

    rxf = scaledCosine(xf);
    ryf = scaledCosine(yf);

    let n1 = perlin[of & PERLIN_SIZE];
    n1 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n1);
    let n2 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
    n2 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n2);
    n1 += ryf * (n2 - n1);

    of += PERLIN_ZWRAP;
    n2 = perlin[of & PERLIN_SIZE];
    n2 += rxf * (perlin[(of + 1) & PERLIN_SIZE] - n2);
    let n3 = perlin[(of + PERLIN_YWRAP) & PERLIN_SIZE];
    n3 += rxf * (perlin[(of + PERLIN_YWRAP + 1) & PERLIN_SIZE] - n3);
    n2 += ryf * (n3 - n2);

    n1 += scaledCosine(zf) * (n2 - n1);

    r += n1 * ampl;
    ampl *= perlinAmpFalloff;
    xi <<= 1; xf *= 2;
    yi <<= 1; yf *= 2;
    zi <<= 1; zf *= 2;

    if (xf >= 1.0) { xi++; xf--; }
    if (yf >= 1.0) { yi++; yf--; }
    if (zf >= 1.0) { zi++; zf--; }
  }
  return r;
}

// ---------------------------------------------------------------------------
// Basic scalar math (real implementations, no p5 dependency)
// ---------------------------------------------------------------------------
/**
 * Performs the abs operation.
 *
 * @param {number} n - N value.
 *
 * @returns {number} The resulting value.
 */
function abs(n) { return Math.abs(n); }
/**
 * Performs the ceil operation.
 *
 * @param {number} n - N value.
 *
 * @returns {number} The resulting value.
 */
function ceil(n) { return Math.ceil(n); }
/**
 * Performs the floor operation.
 *
 * @param {number} n - N value.
 *
 * @returns {number} The resulting value.
 */
function floor(n) { return Math.floor(n); }
/**
 * Rounds a number to a requested decimal precision.
 *
 * @param {number} n - N value.
 * @param {number} [decimals=0] - Decimals value.
 *
 * @returns {number} The resulting value.
 */
function round(n, decimals = 0) {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
/**
 * Performs the sq operation.
 *
 * @param {number} n - N value.
 *
 * @returns {number} The resulting value.
 */
function sq(n) { return n * n; }
/**
 * Performs the sqrt operation.
 *
 * @param {number} n - N value.
 *
 * @returns {number} The resulting value.
 */
function sqrt(n) { return Math.sqrt(n); }
/**
 * Performs the exp operation.
 *
 * @param {number} n - N value.
 *
 * @returns {number} The resulting value.
 */
function exp(n) { return Math.exp(n); }
/**
 * Performs the pow operation.
 *
 * @param {number} n - N value.
 * @param {number} e - E value.
 *
 * @returns {number} The resulting value.
 */
function pow(n, e) { return Math.pow(n, e); }
/**
 * Clamps a value to an inclusive range.
 *
 * @param {number} n - N value.
 * @param {number} low - Low value.
 * @param {number} high - High value.
 *
 * @returns {number} The resulting value.
 */
function constrain(n, low, high) { return Math.max(Math.min(n, high), low); }
/**
 * Performs the max operation.
 *
 * @param {string|number|*} ...args - Args value.
 *
 * @returns {number} The resulting value.
 */
function max(...args) {
  /**
   * Performs the if operation.
   *
   * @param {string|number|*} Array.isArray(args[0] - Array.isarray(args[0] value.
   *
   * @returns {*} The resulting value.
   */
  if (Array.isArray(args[0])) return Math.max(...args[0]);
  return Math.max(...args);
}
/**
 * Performs the min operation.
 *
 * @param {string|number|*} ...args - Args value.
 *
 * @returns {number} The resulting value.
 */
function min(...args) {
  /**
   * Performs the if operation.
   *
   * @param {string|number|*} Array.isArray(args[0] - Array.isarray(args[0] value.
   *
   * @returns {*} The resulting value.
   */
  if (Array.isArray(args[0])) return Math.min(...args[0]);
  return Math.min(...args);
}
/**
 * Maps a value from one numeric range to another.
 *
 * @param {number} n - N value.
 * @param {string|number|*} start1 - Start1 value.
 * @param {string|number|*} stop1 - Stop1 value.
 * @param {string|number|*} start2 - Start2 value.
 * @param {string|number|*} stop2 - Stop2 value.
 * @param {boolean} [withinBounds=false] - Withinbounds value.
 *
 * @returns {number} The resulting value.
 */
function map(n, start1, stop1, start2, stop2, withinBounds = false) {
  const newValue = ((n - start1) / (stop1 - start1)) * (stop2 - start2) + start2;
  /**
   * Performs the if operation.
   *
   * @param {string|number|*} !withinBounds - !withinbounds value.
   *
   * @returns {*} The resulting value.
   */
  if (!withinBounds) return newValue;
  /**
   * Performs the if operation.
   *
   * @param {string|number|*} start2 < stop2 - Start2 < stop2 value.
   *
   * @returns {*} The resulting value.
   */
  if (start2 < stop2) return constrain(newValue, start2, stop2);
  return constrain(newValue, stop2, start2);
}
/**
 * Normalizes a value within a source range.
 *
 * @param {number} n - N value.
 * @param {number} start - Start value.
 * @param {number} stop - Stop value.
 *
 * @returns {number} The resulting value.
 */
function norm(n, start, stop) { return map(n, start, stop, 0, 1); }
/**
 * Linearly interpolates between two values.
 *
 * @param {number} start - Start value.
 * @param {number} stop - Stop value.
 * @param {number} amt - Interpolation amount.
 *
 * @returns {number} The resulting value.
 */
function lerp(start, stop, amt) { return start + (stop - start) * amt; }
/**
 * Calculates Euclidean distance in two or three dimensions.
 *
 * @param {string|number|*} ...args - Args value.
 *
 * @throws {Error} If the argument count does not describe a 2D or 3D point pair.
 *
 * @returns {number} The resulting value.
 */
function dist(...args) {
  /**
   * Performs the if operation.
   *
   * @param {string|number|*} [args.length=== 4] - Args.length value.
   *
   * @returns {*} The resulting value.
   */
  if (args.length === 4) {
    const [x1, y1, x2, y2] = args;
    return Math.hypot(x2 - x1, y2 - y1);
  }
  /**
   * Performs the if operation.
   *
   * @param {string|number|*} [args.length=== 6] - Args.length value.
   *
   * @returns {*} The resulting value.
   */
  if (args.length === 6) {
    const [x1, y1, z1, x2, y2, z2] = args;
    return Math.hypot(x2 - x1, y2 - y1, z2 - z1);
  }
  throw new Error('dist() expects (x1,y1,x2,y2) or (x1,y1,z1,x2,y2,z2)');
}
/**
 * Calculates the magnitude of a 2D or 3D vector.
 *
 * @param {number} x - X value.
 * @param {number} y - Y value.
 * @param {number} z - Z value.
 *
 * @returns {number} The resulting value.
 */
function mag(x, y, z) {
  return z !== undefined ? Math.hypot(x, y, z) : Math.hypot(x, y);
}

// Trigonometry --------------------------------------------------------------
let angleModeState = 'radians'; // 'radians' | 'degrees'
/**
 * Gets or sets the trigonometric angle unit.
 *
 * @param {string|number|*} mode - Operation or rendering mode.
 *
 * @throws {Error} If the mode is neither `radians` nor `degrees`.
 *
 * @returns {string} The resulting value.
 */
function angleMode(mode) {
  /**
   * Performs the if operation.
   *
   * @param {string|number|*} [mode=== undefined] - Operation or rendering mode.
   *
   * @returns {*} The resulting value.
   */
  if (mode === undefined) return angleModeState;
  /**
   * Performs the if operation.
   *
   * @param {string|number|*} [mode !== 'radians' && mode !== 'degrees'] - Mode ! value.
   *
   * @returns {*} The resulting value.
   */
  if (mode !== 'radians' && mode !== 'degrees') throw new Error('angleMode must be "radians" or "degrees"');
  angleModeState = mode;
  return angleModeState;
}
/**
 * Converts radians to degrees.
 *
 * @param {string|number|*} rad - Rad value.
 *
 * @returns {number} The resulting value.
 */
function degrees(rad) { return rad * constants.RAD_TO_DEG; }
/**
 * Converts degrees to radians.
 *
 * @param {string|number|*} deg - Deg value.
 *
 * @returns {number} The resulting value.
 */
function radians(deg) { return deg * constants.DEG_TO_RAD; }
/**
 * Converts an input angle to radians according to the active mode.
 *
 * @param {number} a - A value.
 *
 * @returns {number} The resulting value.
 */
function toRad(a) { return angleModeState === 'degrees' ? radians(a) : a; }
/**
 * Converts a radian result to the active angle mode.
 *
 * @param {string|number|*} rad - Rad value.
 *
 * @returns {number} The resulting value.
 */
function toOutAngle(rad) { return angleModeState === 'degrees' ? degrees(rad) : rad; }

/**
 * Performs the sin operation.
 *
 * @param {number} a - A value.
 *
 * @returns {number} The resulting value.
 */
function sin(a) { return Math.sin(toRad(a)); }
/**
 * Performs the cos operation.
 *
 * @param {number} a - A value.
 *
 * @returns {number} The resulting value.
 */
function cos(a) { return Math.cos(toRad(a)); }
/**
 * Performs the tan operation.
 *
 * @param {number} a - A value.
 *
 * @returns {number} The resulting value.
 */
function tan(a) { return Math.tan(toRad(a)); }
/**
 * Performs the asin operation.
 *
 * @param {Vector} v - V value.
 *
 * @returns {number} The resulting value.
 */
function asin(v) { return toOutAngle(Math.asin(v)); }
/**
 * Performs the acos operation.
 *
 * @param {Vector} v - V value.
 *
 * @returns {number} The resulting value.
 */
function acos(v) { return toOutAngle(Math.acos(v)); }
/**
 * Performs the atan operation.
 *
 * @param {Vector} v - V value.
 *
 * @returns {number} The resulting value.
 */
function atan(v) { return toOutAngle(Math.atan(v)); }
/**
 * Performs the atan2 operation.
 *
 * @param {number} y - Y value.
 * @param {number} x - X value.
 *
 * @returns {number} The resulting value.
 */
function atan2(y, x) { return toOutAngle(Math.atan2(y, x)); }

// Random ----------------------------------------------------------------
/**
 * Returns a pseudorandom number or random array element.
 *
 * @param {number} a - A value.
 * @param {number} b - B value.
 *
 * @returns {*} The resulting value.
 */
function random(a, b) {
  /**
   * Performs the if operation.
   *
   * @param {string|number|*} Array.isArray(a - Array.isarray(a value.
   *
   * @returns {*} The resulting value.
   */
  if (Array.isArray(a)) return a[Math.floor(mathRandom() * a.length)];
  /**
   * Performs the if operation.
   *
   * @param {number} [a=== undefined] - A value.
   *
   * @returns {*} The resulting value.
   */
  if (a === undefined) return mathRandom();
  /**
   * Performs the if operation.
   *
   * @param {number} [b=== undefined] - B value.
   *
   * @returns {*} The resulting value.
   */
  if (b === undefined) return mathRandom() * a;
  return mathRandom() * (b - a) + a;
}
/**
 * Returns a normally distributed pseudorandom number.
 *
 * @param {number} [mean=0] - Mean value.
 * @param {number} [sd=1] - Sd value.
 *
 * @returns {number} The resulting value.
 */
function randomGaussian(mean = 0, sd = 1) {
  let u1 = 0, u2 = 0;
  /**
   * Performs the while operation.
   *
   * @param {string|number|*} [u1=== 0] - U1 value.
   *
   * @returns {*} The resulting value.
   */
  while (u1 === 0) u1 = mathRandom();
  u2 = mathRandom();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * sd + mean;
}

// ---------------------------------------------------------------------------
// Vector
// ---------------------------------------------------------------------------
class Vector {
  /**
   * Creates a new Vector instance.
   *
   * @param {number} [x=0] - X value.
   * @param {number} [y=0] - Y value.
   * @param {number} [z=0] - Z value.
   */
  constructor(x = 0, y = 0, z = 0) {
    this._x = x;
    this._y = y;
    this._z = z;
  }
  /**
   * Returns the current x value.
   *
   * @returns {number} The resulting value.
   */
  get x() { return this._x; }
  /**
   * Sets the x component.
   *
   * @param {Vector} v - V value.
   *
   * @returns {void} The resulting value.
   */
  set x(v) { this._x = v; }
  /**
   * Returns the current y value.
   *
   * @returns {number} The resulting value.
   */
  get y() { return this._y; }
  /**
   * Sets the y component.
   *
   * @param {Vector} v - V value.
   *
   * @returns {void} The resulting value.
   */
  set y(v) { this._y = v; }
  /**
   * Returns the current z value.
   *
   * @returns {number} The resulting value.
   */
  get z() { return this._z; }
  /**
   * Sets the z component.
   *
   * @param {Vector} v - V value.
   *
   * @returns {void} The resulting value.
   */
  set z(v) { this._z = v; }

  /**
   * Returns the current dimensions value.
   *
   * @returns {number} The resulting value.
   */
  get dimensions() { return this._z === 0 ? 2 : 3; }

  /**
   * Sets one pixel from RGBA channels or a color-like object.
   *
   * @param {number} [x=0] - X value.
   * @param {number} [y=0] - Y value.
   * @param {number} [z=0] - Z value.
   *
   * @returns {Images} The resulting value.
   */
  set(x = 0, y = 0, z = 0) {
    if (x instanceof Vector) { this._x = x._x; this._y = x._y; this._z = x._z; return this; }
    if (Array.isArray(x)) { this._x = x[0] || 0; this._y = x[1] || 0; this._z = x[2] || 0; return this; }
    this._x = x; this._y = y; this._z = z;
    return this;
  }
  /**
   * Returns an independent copy of the vector.
   *
   * @returns {Vector} This instance for chaining.
   */
  copy() { return new Vector(this._x, this._y, this._z); }
  /**
   * Returns vector components as an array.
   *
   * @returns {number[]} The resulting value.
   */
  array() { return [this._x, this._y, this._z]; }

  /**
   * Adds components to this vector.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} z - Z value.
   *
   * @returns {Vector} This instance for chaining.
   */
  add(x, y, z) {
    if (x instanceof Vector) { this._x += x._x; this._y += x._y; this._z += x._z; return this; }
    if (Array.isArray(x)) { this._x += x[0] || 0; this._y += x[1] || 0; this._z += x[2] || 0; return this; }
    this._x += x || 0; this._y += y || 0; this._z += z || 0;
    return this;
  }
  /**
   * Subtracts components from this vector.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} z - Z value.
   *
   * @returns {Vector} This instance for chaining.
   */
  sub(x, y, z) {
    if (x instanceof Vector) { this._x -= x._x; this._y -= x._y; this._z -= x._z; return this; }
    if (Array.isArray(x)) { this._x -= x[0] || 0; this._y -= x[1] || 0; this._z -= x[2] || 0; return this; }
    this._x -= x || 0; this._y -= y || 0; this._z -= z || 0;
    return this;
  }
  /**
   * Multiplies vector components.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} z - Z value.
   *
   * @returns {Vector} This instance for chaining.
   */
  mult(x, y, z) {
    if (x instanceof Vector) { this._x *= x._x; this._y *= x._y; this._z *= x._z; return this; }
    if (Array.isArray(x)) { this._x *= x[0]; this._y *= x[1]; this._z *= x[2]; return this; }
    if (y === undefined && z === undefined) { this._x *= x; this._y *= x; this._z *= x; return this; }
    this._x *= x; this._y *= y; this._z *= z;
    return this;
  }
  /**
   * Divides vector components.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} z - Z value.
   *
   * @returns {Vector} This instance for chaining.
   */
  div(x, y, z) {
    if (x instanceof Vector) { this._x /= x._x; this._y /= x._y; this._z /= x._z; return this; }
    if (Array.isArray(x)) { this._x /= x[0]; this._y /= x[1]; this._z /= x[2]; return this; }
    if (y === undefined && z === undefined) { this._x /= x; this._y /= x; this._z /= x; return this; }
    this._x /= x; this._y /= y; this._z /= z;
    return this;
  }
  /**
   * Applies the remainder operator to vector components.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} z - Z value.
   *
   * @returns {Vector} This instance for chaining.
   */
  rem(x, y, z) {
    if (x instanceof Vector) { this._x %= x._x; this._y %= x._y; this._z %= x._z; return this; }
    this._x %= x; this._y %= (y ?? x); this._z %= (z ?? x);
    return this;
  }
  /**
   * Calculates the magnitude of a 2D or 3D vector.
   *
   * @returns {number} The resulting value.
   */
  mag() { return Math.hypot(this._x, this._y, this._z); }
  /**
   * Returns the squared vector magnitude.
   *
   * @returns {number} The resulting value.
   */
  magSq() { return this._x ** 2 + this._y ** 2 + this._z ** 2; }
  /**
   * Computes a dot product.
   *
   * @param {Vector} v - V value.
   *
   * @returns {number} The resulting value.
   */
  dot(v) {
    if (v instanceof Vector) return this._x * v._x + this._y * v._y + this._z * v._z;
    return this._x * v;
  }
  /**
   * Computes a cross product.
   *
   * @param {Vector} v - V value.
   *
   * @returns {Vector} This instance for chaining.
   */
  cross(v) {
    return new Vector(
      this._y * v._z - this._z * v._y,
      this._z * v._x - this._x * v._z,
      this._x * v._y - this._y * v._x
    );
  }
  /**
   * Calculates Euclidean distance in two or three dimensions.
   *
   * @param {Vector} v - V value.
   *
   * @throws {Error} If the argument count does not describe a 2D or 3D point pair.
   *
   * @returns {number} The resulting value.
   */
  dist(v) { return Math.hypot(this._x - v._x, this._y - v._y, this._z - v._z); }
  /**
   * Normalizes this vector in place.
   *
   * @returns {Vector} This instance for chaining.
   */
  normalize() {
    const m = this.mag();
    if (m !== 0) this.mult(1 / m);
    return this;
  }
  /**
   * Limits vector magnitude.
   *
   * @param {string|number|*} maxVal - Maxval value.
   *
   * @returns {Vector} This instance for chaining.
   */
  limit(maxVal) {
    if (this.magSq() > maxVal * maxVal) { this.normalize(); this.mult(maxVal); }
    return this;
  }
  /**
   * Sets vector magnitude.
   *
   * @param {number} n - N value.
   *
   * @returns {Vector} This instance for chaining.
   */
  setMag(n) { return this.normalize().mult(n); }
  /**
   * Returns the 2D heading in radians.
   *
   * @returns {number} The resulting value.
   */
  heading() { return Math.atan2(this._y, this._x); }
  /**
   * Sets the 2D heading while preserving magnitude.
   *
   * @param {number} a - A value.
   *
   * @returns {Vector} This instance for chaining.
   */
  setHeading(a) {
    const m = this.mag();
    this._x = Math.cos(a) * m;
    this._y = Math.sin(a) * m;
    return this;
  }
  /**
   * Rotates the vector in the XY plane.
   *
   * @param {number} a - A value.
   *
   * @returns {Vector} This instance for chaining.
   */
  rotate(a) {
    const newX = this._x * Math.cos(a) - this._y * Math.sin(a);
    const newY = this._x * Math.sin(a) + this._y * Math.cos(a);
    this._x = newX; this._y = newY;
    return this;
  }
  /**
   * Returns the unsigned angle between two vectors.
   *
   * @param {Vector} v - V value.
   *
   * @returns {number} The resulting value.
   */
  angleBetween(v) {
    const dotmag = this.dot(v) / (this.mag() * v.mag());
    return Math.acos(constrain(dotmag, -1, 1));
  }
  /**
   * Linearly interpolates between two values.
   *
   * @param {string|number|*} ...rest - Rest value.
   *
   * @returns {number} The resulting value.
   */
  lerp(...rest) {
    if (rest.length === 4) {
      const [x, y, z, a] = rest;
      this._x = lerp(this._x, x, a);
      this._y = lerp(this._y, y, a);
      this._z = lerp(this._z, z, a);
      return this;
    }
    const [v, amt] = rest;
    this._x = lerp(this._x, v._x, amt);
    this._y = lerp(this._y, v._y, amt);
    this._z = lerp(this._z, v._z, amt);
    return this;
  }
  /**
   * Spherically interpolates toward another vector.
   *
   * @param {Vector} v - V value.
   * @param {number} amt - Interpolation amount.
   *
   * @returns {Vector} This instance for chaining.
   */
  slerp(v, amt) {
    const start = this.copy();
    const omega = start.angleBetween(v) || 1e-9;
    const sinOmega = Math.sin(omega) || 1e-9;
    const a = Math.sin((1 - amt) * omega) / sinOmega;
    const b = Math.sin(amt * omega) / sinOmega;
    this._x = start._x * a + v._x * b;
    this._y = start._y * a + v._y * b;
    this._z = start._z * a + v._z * b;
    return this;
  }
  /**
   * Reflects this vector about a surface normal.
   *
   * @param {Vector} surfaceNormal - Surfacenormal value.
   *
   * @returns {Vector} This instance for chaining.
   */
  reflect(surfaceNormal) {
    const n = surfaceNormal.copy().normalize();
    const d = this.dot(n);
    this._x -= 2 * d * n._x;
    this._y -= 2 * d * n._y;
    this._z -= 2 * d * n._z;
    return this;
  }
  /**
   * Tests component equality within a tolerance.
   *
   * @param {Vector} v - V value.
   * @param {number} [tolerance=0] - Tolerance value.
   *
   * @returns {boolean} The resulting value.
   */
  equals(v, tolerance = 0) {
    return Math.abs(this._x - v._x) <= tolerance &&
           Math.abs(this._y - v._y) <= tolerance &&
           Math.abs(this._z - v._z) <= tolerance;
  }
  /**
   * Replaces near-zero components with exact zeros.
   *
   * @param {number} [epsilon=1e-10] - Epsilon value.
   *
   * @returns {Vector} This instance for chaining.
   */
  clampToZero(epsilon = 1e-10) {
    if (Math.abs(this._x) < epsilon) this._x = 0;
    if (Math.abs(this._y) < epsilon) this._y = 0;
    if (Math.abs(this._z) < epsilon) this._z = 0;
    return this;
  }
  /**
   * Returns vector components.
   *
   * @returns {number[]} The resulting value.
   */
  getValue() { return [this._x, this._y, this._z]; }
  /**
   * Sets vector components.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} z - Z value.
   *
   * @returns {Vector} This instance for chaining.
   */
  setValue(x, y, z) { return this.set(x, y, z); }
  /**
   * Performs the toString operation.
   *
   * @returns {string} The resulting value.
   */
  toString() { return `Vector [ ${this._x}, ${this._y}, ${this._z} ]`; }

  /**
   * Creates a 2D vector from an angle and length.
   *
   * @param {number} angle - Angle value.
   * @param {number} [length=1] - Length value.
   *
   * @returns {Vector} This instance for chaining.
   */
  static fromAngle(angle, length = 1) {
    return new Vector(length * Math.cos(angle), length * Math.sin(angle), 0);
  }
  /**
   * Creates a 3D vector from spherical angles and length.
   *
   * @param {number} theta - Theta value.
   * @param {number} phi - Phi value.
   * @param {number} [length=1] - Length value.
   *
   * @returns {Vector} This instance for chaining.
   */
  static fromAngles(theta, phi, length = 1) {
    return new Vector(
      length * Math.sin(theta) * Math.cos(phi),
      length * Math.sin(theta) * Math.sin(phi),
      length * Math.cos(theta)
    );
  }
  /**
   * Creates a random unit vector in 2D.
   *
   * @returns {Vector} This instance for chaining.
   */
  static random2D() { return Vector.fromAngle(mathRandom() * Math.PI * 2); }
  /**
   * Creates a random unit vector in 3D.
   *
   * @returns {Vector} This instance for chaining.
   */
  static random3D() {
    const theta = mathRandom() * Math.PI * 2;
    const z = mathRandom() * 2 - 1;
    const s = Math.sqrt(1 - z * z);
    return new Vector(s * Math.cos(theta), s * Math.sin(theta), z);
  }
  /**
   * Adds components to this vector.
   *
   * @param {number} a - A value.
   * @param {number} b - B value.
   *
   * @returns {Vector} This instance for chaining.
   */
  static add(a, b) { return a.copy().add(b); }
  /**
   * Subtracts components from this vector.
   *
   * @param {number} a - A value.
   * @param {number} b - B value.
   *
   * @returns {Vector} This instance for chaining.
   */
  static sub(a, b) { return a.copy().sub(b); }
  /**
   * Multiplies vector components.
   *
   * @param {number} a - A value.
   * @param {number} n - N value.
   *
   * @returns {Vector} This instance for chaining.
   */
  static mult(a, n) { return a.copy().mult(n); }
  /**
   * Divides vector components.
   *
   * @param {number} a - A value.
   * @param {number} n - N value.
   *
   * @returns {Vector} This instance for chaining.
   */
  static div(a, n) { return a.copy().div(n); }
  /**
   * Computes a dot product.
   *
   * @param {number} a - A value.
   * @param {number} b - B value.
   *
   * @returns {number} The resulting value.
   */
  static dot(a, b) { return a.dot(b); }
  /**
   * Computes a cross product.
   *
   * @param {number} a - A value.
   * @param {number} b - B value.
   *
   * @returns {Vector} This instance for chaining.
   */
  static cross(a, b) { return a.cross(b); }
  /**
   * Calculates Euclidean distance in two or three dimensions.
   *
   * @param {number} a - A value.
   * @param {number} b - B value.
   *
   * @throws {Error} If the argument count does not describe a 2D or 3D point pair.
   *
   * @returns {number} The resulting value.
   */
  static dist(a, b) { return a.dist(b); }
  /**
   * Linearly interpolates between two values.
   *
   * @param {number} a - A value.
   * @param {number} b - B value.
   * @param {number} amt - Interpolation amount.
   *
   * @returns {number} The resulting value.
   */
  static lerp(a, b, amt) { return a.copy().lerp(b, amt); }
}

/**
 * Creates a three-dimensional vector.
 *
 * @param {number} x - X value.
 * @param {number} y - Y value.
 * @param {number} z - Z value.
 *
 * @returns {Vector} This instance for chaining.
 */
function createVector(x, y, z) { return new Vector(x, y, z); }

// ---------------------------------------------------------------------------
// Quaternion (unit quaternion, [w, x, y, z])
// ---------------------------------------------------------------------------
class Quaternion {
  /**
   * Creates a new Quaternion instance.
   *
   * @param {number} [w=1] - W value.
   * @param {number} [x=0] - X value.
   * @param {number} [y=0] - Y value.
   * @param {number} [z=0] - Z value.
   */
  constructor(w = 1, x = 0, y = 0, z = 0) {
    this.w = w; this.x = x; this.y = y; this.z = z;
  }
  /**
   * Creates a unit quaternion from an axis-angle rotation.
   *
   * @param {number} angle - Angle value.
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} z - Z value.
   *
   * @returns {Quaternion} This instance for chaining.
   */
  static fromAxisAngle(angle, x, y, z) {
    const v = new Vector(x, y, z).normalize();
    const half = angle / 2;
    const s = Math.sin(half);
    return new Quaternion(Math.cos(half), v.x * s, v.y * s, v.z * s);
  }
  /**
   * Multiplies vector components.
   *
   * @param {Quaternion} q - Q value.
   *
   * @returns {Quaternion} This instance for chaining.
   */
  mult(q) {
    const { w: w1, x: x1, y: y1, z: z1 } = this;
    const { w: w2, x: x2, y: y2, z: z2 } = q;
    return new Quaternion(
      w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
      w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
      w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
      w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2
    );
  }
  /**
   * Returns the quaternion conjugate.
   *
   * @returns {Quaternion} This instance for chaining.
   */
  conjugate() { return new Quaternion(this.w, -this.x, -this.y, -this.z); }
  /**
   * Rotates this quaternion by another quaternion.
   *
   * @param {Quaternion} q - Q value.
   *
   * @returns {Quaternion} This instance for chaining.
   */
  rotateBy(q) { return q.mult(this).mult(q.conjugate()); }
  /**
   * Rotates a vector by this quaternion.
   *
   * @param {Vector} v - V value.
   *
   * @returns {Vector} The resulting value.
   */
  rotateVector(v) {
    const qv = new Quaternion(0, v.x, v.y, v.z);
    const result = this.mult(qv).mult(this.conjugate());
    return new Vector(result.x, result.y, result.z);
  }
  /**
   * Returns quaternion components as an array.
   *
   * @returns {number[]} The resulting value.
   */
  toArray() { return [this.w, this.x, this.y, this.z]; }
}

module.exports = {
  abs, ceil, floor, round, sq, sqrt, exp, pow, constrain, max, min, map, norm, dist, mag, lerp,
  acos, angleMode, asin, atan, atan2, cos, degrees, radians, sin, tan,
  random, randomGaussian, randomSeed, noise, noiseDetail, noiseSeed,
  createVector, Vector, Quaternion
};
