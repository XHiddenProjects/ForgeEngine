'use strict';

const constants = require('./constants.js');

// 4x4 column-major matrices, stored as flat length-16 Float64Array-like arrays.
/**
 * Creates a column-major 4x4 identity matrix.
 *
 * @returns {number[]} The resulting value.
 */
function identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
/**
 * Multiplies two column-major 4x4 matrices.
 *
 * @param {number[]|number} a - A value.
 * @param {number[]|number} b - B value.
 *
 * @returns {number[]} The resulting value.
 */
function multiply(a, b) {
  const out = new Array(16).fill(0);
  /**
   * Performs the for operation.
   *
   * @param {number} [let c=0; c < 4; c++] - Let c value.
   *
   * @returns {*} The resulting value.
   */
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}
/**
 * Creates a 4x4 translation matrix.
 *
 * @param {number} x - X value.
 * @param {number} y - Y value.
 * @param {number} z - Z value.
 *
 * @returns {number[]} The resulting value.
 */
function translationMatrix(x, y, z) {
  const m = identity();
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}
/**
 * Creates a 4x4 scaling matrix.
 *
 * @param {number} x - X value.
 * @param {number} y - Y value.
 * @param {number} z - Z value.
 *
 * @returns {number[]} The resulting value.
 */
function scaleMatrix(x, y, z) {
  const m = identity();
  m[0] = x; m[5] = y; m[10] = z;
  return m;
}
/**
 * Creates a 4x4 rotation matrix around the X axis.
 *
 * @param {number[]|number} a - A value.
 *
 * @returns {number[]} The resulting value.
 */
function rotationXMatrix(a) {
  const m = identity();
  const c = Math.cos(a), s = Math.sin(a);
  m[5] = c; m[6] = s; m[9] = -s; m[10] = c;
  return m;
}
/**
 * Creates a 4x4 rotation matrix around the Y axis.
 *
 * @param {number[]|number} a - A value.
 *
 * @returns {number[]} The resulting value.
 */
function rotationYMatrix(a) {
  const m = identity();
  const c = Math.cos(a), s = Math.sin(a);
  m[0] = c; m[2] = -s; m[8] = s; m[10] = c;
  return m;
}
/**
 * Creates a 4x4 rotation matrix around the Z axis.
 *
 * @param {number[]|number} a - A value.
 *
 * @returns {number[]} The resulting value.
 */
function rotationZMatrix(a) {
  const m = identity();
  const c = Math.cos(a), s = Math.sin(a);
  m[0] = c; m[1] = s; m[4] = -s; m[5] = c;
  return m;
}
/**
 * Creates a 4x4 X-shear matrix.
 *
 * @param {number} angle - Angle value.
 *
 * @returns {number[]} The resulting value.
 */
function shearXMatrix(angle) {
  const m = identity();
  m[4] = Math.tan(angle);
  return m;
}
/**
 * Creates a 4x4 Y-shear matrix.
 *
 * @param {number} angle - Angle value.
 *
 * @returns {number[]} The resulting value.
 */
function shearYMatrix(angle) {
  const m = identity();
  m[1] = Math.tan(angle);
  return m;
}

/**
 * Transform: a push/pop matrix stack, mirroring p5's transform API but
 * operating on an explicit 4x4 matrix (usable for 2D or 3D) instead of a
 * canvas 2D context.
 */
class Transform {
  /**
   * Creates a new Transform instance.
   */
  constructor() {
    this.matrix = identity();
    this.stack = [];
  }

  /**
   * Saves a copy of the current matrix on the stack.
   *
   * @returns {Transform} This instance for chaining.
   */
  push() {
    this.stack.push(this.matrix.slice());
    return this;
  }
  /**
   * Restores the most recently saved matrix.
   *
   * @throws {Error} If the matrix stack is empty.
   *
   * @returns {Transform} This instance for chaining.
   */
  pop() {
    if (this.stack.length === 0) throw new Error('Transform.pop(): stack is empty, unmatched pop()');
    this.matrix = this.stack.pop();
    return this;
  }
  /**
   * Resets the current transformation to identity.
   *
   * @returns {Transform} This instance for chaining.
   */
  resetMatrix() {
    this.matrix = identity();
    return this;
  }
  /**
   * Post-multiplies the current matrix by a 2D affine or 4x4 matrix.
   *
   * @param {number[]|number} ...m - M value.
   *
   * @throws {Error} If the argument count is neither 6 nor 16.
   *
   * @returns {Transform} This instance for chaining.
   */
  applyMatrix(...m) {
    if (m.length === 6) {
      // 2D affine: a b c d e f  ->  [a b 0 0, c d 0 0, 0 0 1 0, e f 0 1]
      const [a, b, c, d, e, f] = m;
      const mat = identity();
      mat[0] = a; mat[1] = b; mat[4] = c; mat[5] = d; mat[12] = e; mat[13] = f;
      this.matrix = multiply(this.matrix, mat);
    } else if (m.length === 16) {
      this.matrix = multiply(this.matrix, m);
    } else {
      throw new Error('applyMatrix expects 6 (2D) or 16 (3D) values');
    }
    return this;
  }
  /**
   * Applies a translation to the current matrix.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} [z=0] - Z value.
   *
   * @returns {Transform} This instance for chaining.
   */
  translate(x, y, z = 0) {
    this.matrix = multiply(this.matrix, translationMatrix(x, y, z));
    return this;
  }
  /**
   * Applies nonuniform or uniform scaling to the current matrix.
   *
   * @param {number} x - X value.
   * @param {number} [y=x] - Y value.
   * @param {number} [z=x] - Z value.
   *
   * @returns {Transform} This instance for chaining.
   */
  scale(x, y = x, z = x) {
    this.matrix = multiply(this.matrix, scaleMatrix(x, y, z));
    return this;
  }
  /**
   * Applies a rotation around the Z axis.
   *
   * @param {number} angle - Angle value.
   * @param {number[]|number} axis - Axis value.
   *
   * @returns {Transform} This instance for chaining.
   */
  rotate(angle, axis) {
    if (!axis || (axis[2] === undefined || axis[2] === 0)) {
      this.matrix = multiply(this.matrix, rotationZMatrix(angle));
    } else {
      this.matrix = multiply(this.matrix, rotationZMatrix(angle)); // default: rotate about z (2D)
    }
    return this;
  }
  /**
   * Applies a rotation around the X axis.
   *
   * @param {number} angle - Angle value.
   *
   * @returns {Transform} This instance for chaining.
   */
  rotateX(angle) { this.matrix = multiply(this.matrix, rotationXMatrix(angle)); return this; }
  /**
   * Applies a rotation around the Y axis.
   *
   * @param {number} angle - Angle value.
   *
   * @returns {Transform} This instance for chaining.
   */
  rotateY(angle) { this.matrix = multiply(this.matrix, rotationYMatrix(angle)); return this; }
  /**
   * Applies a rotation around the Z axis.
   *
   * @param {number} angle - Angle value.
   *
   * @returns {Transform} This instance for chaining.
   */
  rotateZ(angle) { this.matrix = multiply(this.matrix, rotationZMatrix(angle)); return this; }
  /**
   * Applies an X-axis shear.
   *
   * @param {number} angle - Angle value.
   *
   * @returns {Transform} This instance for chaining.
   */
  shearX(angle) { this.matrix = multiply(this.matrix, shearXMatrix(angle)); return this; }
  /**
   * Applies a Y-axis shear.
   *
   * @param {number} angle - Angle value.
   *
   * @returns {Transform} This instance for chaining.
   */
  shearY(angle) { this.matrix = multiply(this.matrix, shearYMatrix(angle)); return this; }

  /**
   * Transforms a 3D point by the current matrix.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} [z=0] - Z value.
   *
   * @returns {number[]} The resulting value.
   */
  transformPoint(x, y, z = 0) {
    const m = this.matrix;
    return [
      m[0] * x + m[4] * y + m[8] * z + m[12],
      m[1] * x + m[5] * y + m[9] * z + m[13],
      m[2] * x + m[6] * y + m[10] * z + m[14]
    ];
  }
  /**
   * Returns a copy of the current matrix.
   *
   * @returns {number[]} The resulting value.
   */
  toArray() { return this.matrix.slice(); }
}

module.exports = { Transform, identity, multiply };
