'use strict';

// Minimal column-major 4x4 matrix helpers for WebGL.
//
// Wrapped in an IIFE so this file doesn't leave a top-level `const Transform`
// sitting in global scope - all three engine files (Transform.js, canvas.js,
// shapes.js) get loaded as sibling <script> tags in index.html, so they
// share ONE global scope. A top-level `const`/`class` declaration for the
// same name in two of those files is a SyntaxError ("Identifier has already
// been declared"), so each file below only ever leaks its name via an
// explicit window.X assignment.
(function (root, factory) {
    const Transform = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = Transform;
        module.exports.Transform = Transform;
    } else if (root) {
        root.Transform = Transform;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
/**
 * Minimal collection of column-major 4x4 matrix helpers for WebGL.
 * All matrices are returned as `Float32Array`s of length 16, laid out
 * column-major (i.e. `m[col * 4 + row]`), matching the layout expected by
 * `gl.uniformMatrix4fv`.
 *
 * @namespace Transform
 */
const Transform = {
    /**
     * Builds a 4x4 identity matrix.
     *
     * @returns {Float32Array} A new column-major identity matrix.
     */
    identity() {
        // prettier-ignore
        return new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);
    },

    /**
     * Multiplies two column-major 4x4 matrices.
     *
     * @param {Float32Array} a - Left-hand matrix (16 elements, column-major).
     * @param {Float32Array} b - Right-hand matrix (16 elements, column-major).
     * @returns {Float32Array} The product `a * b` as a new matrix.
     */
    multiply(a, b) {
        const out = new Float32Array(16);
        for (let col = 0; col < 4; col++) {
            for (let row = 0; row < 4; row++) {
                let sum = 0;
                for (let k = 0; k < 4; k++) {
                    sum += a[k * 4 + row] * b[col * 4 + k];
                }
                out[col * 4 + row] = sum;
            }
        }
        return out;
    },

    /**
     * Builds a translation matrix.
     *
     * @param {number} x - Translation along the X axis.
     * @param {number} y - Translation along the Y axis.
     * @param {number} z - Translation along the Z axis.
     * @returns {Float32Array} A new translation matrix.
     */
    translate(x, y, z) {
        const m = Transform.identity();
        m[12] = x;
        m[13] = y;
        m[14] = z;
        return m;
    },

    /**
     * Builds a scale matrix.
     *
     * @param {number} sx - Scale factor along the X axis.
     * @param {number} sy - Scale factor along the Y axis.
     * @param {number} sz - Scale factor along the Z axis.
     * @returns {Float32Array} A new scale matrix.
     */
    scale(sx, sy, sz) {
        const m = Transform.identity();
        m[0] = sx;
        m[5] = sy;
        m[10] = sz;
        return m;
    },

    /**
     * Builds a rotation matrix around the X axis.
     *
     * @param {number} rad - Rotation angle, in radians.
     * @returns {Float32Array} A new rotation matrix.
     */
    rotateX(rad) {
        const m = Transform.identity();
        const c = Math.cos(rad), s = Math.sin(rad);
        m[5] = c; m[6] = s;
        m[9] = -s; m[10] = c;
        return m;
    },

    /**
     * Builds a rotation matrix around the Y axis.
     *
     * @param {number} rad - Rotation angle, in radians.
     * @returns {Float32Array} A new rotation matrix.
     */
    rotateY(rad) {
        const m = Transform.identity();
        const c = Math.cos(rad), s = Math.sin(rad);
        m[0] = c; m[2] = -s;
        m[8] = s; m[10] = c;
        return m;
    },

    /**
     * Builds a rotation matrix around the Z axis.
     *
     * @param {number} rad - Rotation angle, in radians.
     * @returns {Float32Array} A new rotation matrix.
     */
    rotateZ(rad) {
        const m = Transform.identity();
        const c = Math.cos(rad), s = Math.sin(rad);
        m[0] = c; m[1] = s;
        m[4] = -s; m[5] = c;
        return m;
    },

    /**
     * Builds a perspective projection matrix.
     *
     * @param {number} fovRad - Vertical field of view, in radians.
     * @param {number} aspect - Viewport aspect ratio (width / height).
     * @param {number} near - Distance to the near clipping plane. Must be > 0.
     * @param {number} far - Distance to the far clipping plane. Must be > near.
     * @returns {Float32Array} A new perspective projection matrix.
     */
    perspective(fovRad, aspect, near, far) {
        const f = 1 / Math.tan(fovRad / 2);
        const m = new Float32Array(16);
        m[0] = f / aspect;
        m[5] = f;
        m[10] = (far + near) / (near - far);
        m[11] = -1;
        m[14] = (2 * far * near) / (near - far);
        return m;
    },

    /**
     * Composes a model matrix by combining translation, rotation (X, then Y,
     * then Z), and scale, in that order: `translate * rotateX * rotateY *
     * rotateZ * scale`. Rotation/scale steps are skipped when they'd have no
     * effect (angle of 0, or scale of 1), as a minor optimization.
     *
     * @param {Object} [options={}] - Composition parameters.
     * @param {number} [options.x=0] - Translation along the X axis.
     * @param {number} [options.y=0] - Translation along the Y axis.
     * @param {number} [options.z=0] - Translation along the Z axis.
     * @param {number} [options.rx=0] - Rotation around the X axis, in radians.
     * @param {number} [options.ry=0] - Rotation around the Y axis, in radians.
     * @param {number} [options.rz=0] - Rotation around the Z axis, in radians.
     * @param {number} [options.sx=1] - Scale factor along the X axis.
     * @param {number} [options.sy=1] - Scale factor along the Y axis.
     * @param {number} [options.sz=1] - Scale factor along the Z axis.
     * @returns {Float32Array} The resulting composed model matrix.
     */
    compose({ x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
        let m = Transform.translate(x, y, z);
        if (rx) m = Transform.multiply(m, Transform.rotateX(rx));
        if (ry) m = Transform.multiply(m, Transform.rotateY(ry));
        if (rz) m = Transform.multiply(m, Transform.rotateZ(rz));
        if (sx !== 1 || sy !== 1 || sz !== 1) m = Transform.multiply(m, Transform.scale(sx, sy, sz));
        return m;
    }
};

return Transform;
});