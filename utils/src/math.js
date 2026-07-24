'use strict';

// Math helpers: a 2D/3D Vector class plus standalone Calculation, Random,
// Noise, Trigonometry, and Quaternion namespaces.
//
// Wrapped in the same IIFE pattern as the other engine files (see the
// comment at the top of transform.js) so this can be loaded either as a
// sibling <script> tag in the browser (sharing one global scope with
// canvas.js/shapes.js/etc) or via require() in Node.
(function (root, factory) {
    const MathUtils = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = MathUtils;
    } else if (root) {
        root.Vector = MathUtils.Vector;
        root.Calc = MathUtils.Calc;
        root.Random = MathUtils.Random;
        root.Noise = MathUtils.Noise;
        root.Trig = MathUtils.Trig;
        root.Quaternion = MathUtils.Quaternion;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

/**
 * A 2D or 3D Euclidean vector. Every instance-mutating method (`add`,
 * `sub`, `mult`, ...) returns `this` for chaining; the equivalent static
 * methods on the class (`Vector.add(a, b)`, ...) leave both operands
 * untouched and return a new `Vector`.
 *
 * @class
 */
class Vector {
    /**
     * @param {number} [x=0] - X component.
     * @param {number} [y=0] - Y component.
     * @param {number} [z=0] - Z component. Leave at `0` for a 2D vector.
     */
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    /** @returns {number} The number of meaningful dimensions - `2` if `z` is `0`, otherwise `3`. */
    get dimensions() { return this.z === 0 ? 2 : 3; }

    /**
     * Returns a new vector pointing in the same direction as `angle`, on the 2D plane.
     * @param {number} angle - Angle, in radians, measured from the positive x-axis.
     * @param {number} [length=1] - Desired magnitude of the result.
     * @returns {Vector}
     */
    static fromAngle(angle, length = 1) {
        return new Vector(Math.cos(angle) * length, Math.sin(angle) * length, 0);
    }

    /**
     * Returns a new 3D vector from a pair of spherical angles.
     * @param {number} theta - Polar angle, in radians, measured from the positive y-axis.
     * @param {number} phi - Azimuthal angle, in radians, measured from the positive z-axis.
     * @param {number} [length=1] - Desired magnitude of the result.
     * @returns {Vector}
     */
    static fromAngles(theta, phi, length = 1) {
        const sinTheta = Math.sin(theta);
        return new Vector(
            sinTheta * Math.sin(phi) * length,
            Math.cos(theta) * length,
            sinTheta * Math.cos(phi) * length
        );
    }

    /** @returns {Vector} A random 2D unit vector. */
    static random2D() { return Vector.fromAngle(Math.random() * Math.PI * 2); }

    /** @returns {Vector} A random 3D unit vector, uniformly distributed on the unit sphere. */
    static random3D() {
        const theta = Math.acos(2 * Math.random() - 1);
        const phi = Math.random() * Math.PI * 2;
        return Vector.fromAngles(theta, phi);
    }

    /**
     * Adds two vectors without modifying either one.
     * @param {Vector} a
     * @param {Vector} b
     * @returns {Vector} A new vector.
     */
    static add(a, b) { return a.copy().add(b); }

    /** @see Vector.add, but subtracts `b` from `a`. */
    static sub(a, b) { return a.copy().sub(b); }

    /**
     * Linearly interpolates between two vectors without modifying either one.
     * @param {Vector} a
     * @param {Vector} b
     * @param {number} amount - Interpolation amount, typically in `[0, 1]`.
     * @returns {Vector} A new vector.
     */
    static lerp(a, b, amount) { return a.copy().lerp(b, amount); }

    /**
     * Calculates the distance between two vectors' positions, without modifying either one.
     * @param {Vector} a
     * @param {Vector} b
     * @returns {number}
     */
    static dist(a, b) { return a.dist(b); }

    /**
     * Calculates the dot product of two vectors, without modifying either one.
     * @param {Vector} a
     * @param {Vector} b
     * @returns {number}
     */
    static dot(a, b) { return a.dot(b); }

    /**
     * Calculates the cross product of two vectors, without modifying either one.
     * @param {Vector} a
     * @param {Vector} b
     * @returns {Vector} A new vector.
     */
    static cross(a, b) { return a.copy().cross(b); }

    /** @returns {Vector} A copy of this vector. */
    copy() { return new Vector(this.x, this.y, this.z); }

    /** @returns {number[]} This vector's components as `[x, y, z]` (or `[x, y]` for a 2D vector). */
    array() { return this.dimensions === 2 ? [this.x, this.y] : [this.x, this.y, this.z]; }

    /**
     * Adds to this vector's components, in place.
     * @param {Vector|number[]|number} x - A vector/array to add component-wise, or an x-component.
     * @param {number} [y]
     * @param {number} [z]
     * @returns {Vector} This vector, for chaining.
     */
    add(x, y, z) {
        const [dx, dy, dz] = Vector._args(x, y, z);
        this.x += dx; this.y += dy; this.z += dz;
        return this;
    }

    /** @see Vector#add, but subtracts. */
    sub(x, y, z) {
        const [dx, dy, dz] = Vector._args(x, y, z);
        this.x -= dx; this.y -= dy; this.z -= dz;
        return this;
    }

    /**
     * Multiplies this vector's components, in place. A single number scales
     * uniformly; a vector/array multiplies component-wise.
     * @param {Vector|number[]|number} x
     * @param {number} [y]
     * @param {number} [z]
     * @returns {Vector} This vector, for chaining.
     */
    mult(x, y, z) {
        if (typeof x === 'number' && y === undefined) {
            this.x *= x; this.y *= x; this.z *= x;
            return this;
        }
        const [dx, dy, dz] = Vector._args(x, y, z);
        this.x *= dx; this.y *= dy; this.z *= dz;
        return this;
    }

    /** @see Vector#mult, but divides. */
    div(x, y, z) {
        if (typeof x === 'number' && y === undefined) {
            this.x /= x; this.y /= x; this.z /= x;
            return this;
        }
        const [dx, dy, dz] = Vector._args(x, y, z);
        this.x /= dx; this.y /= dy; this.z /= dz;
        return this;
    }

    /** @returns {number} The magnitude (length) of this vector. */
    mag() { return Math.sqrt(this.magSq()); }

    /** @returns {number} The squared magnitude of this vector (cheaper than {@link Vector#mag}). */
    magSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }

    /** @param {Vector} other @returns {number} The dot product of this vector and `other`. */
    dot(other) { return this.x * other.x + this.y * other.y + this.z * other.z; }

    /**
     * Sets this vector to the cross product of itself and `other`, in place.
     * @param {Vector} other
     * @returns {Vector} This vector, for chaining.
     */
    cross(other) {
        const x = this.y * other.z - this.z * other.y;
        const y = this.z * other.x - this.x * other.z;
        const z = this.x * other.y - this.y * other.x;
        this.x = x; this.y = y; this.z = z;
        return this;
    }

    /** @param {Vector} other @returns {number} The Euclidean distance between this vector's position and `other`'s. */
    dist(other) {
        const dx = this.x - other.x, dy = this.y - other.y, dz = this.z - other.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Scales this vector to have a magnitude of `1`, in place. Leaves a
     * zero vector unchanged.
     * @returns {Vector} This vector, for chaining.
     */
    normalize() {
        const m = this.mag();
        if (m !== 0) this.mult(1 / m);
        return this;
    }

    /**
     * Limits this vector's magnitude to `max`, in place. Vectors already
     * shorter than `max` are left unchanged.
     * @param {number} max
     * @returns {Vector} This vector, for chaining.
     */
    limit(max) {
        if (this.magSq() > max * max) {
            this.normalize().mult(max);
        }
        return this;
    }

    /**
     * Sets this vector's magnitude to `value`, in place, preserving direction.
     * @param {number} value
     * @returns {Vector} This vector, for chaining.
     */
    setMag(value) { return this.normalize().mult(value); }

    /** @returns {number} The angle this 2D vector makes with the positive x-axis, in radians. */
    heading() { return Math.atan2(this.y, this.x); }

    /**
     * Rotates this 2D vector to face `angle`, without changing its magnitude.
     * @param {number} angle - Target angle, in radians.
     * @returns {Vector} This vector, for chaining.
     */
    setHeading(angle) {
        const m = this.mag();
        this.x = Math.cos(angle) * m;
        this.y = Math.sin(angle) * m;
        return this;
    }

    /**
     * Rotates this 2D vector by `angle`, in place, without changing its magnitude.
     * @param {number} angle - Rotation amount, in radians.
     * @returns {Vector} This vector, for chaining.
     */
    rotate(angle) { return this.setHeading(this.heading() + angle); }

    /**
     * Calculates the angle between this vector and `other`.
     * @param {Vector} other
     * @returns {number} Angle, in radians, in `[0, PI]`.
     */
    angleBetween(other) {
        const denom = this.mag() * other.mag();
        if (denom === 0) return 0;
        const cos = Math.min(1, Math.max(-1, this.dot(other) / denom));
        return Math.acos(cos);
    }

    /**
     * Linearly interpolates this vector toward `other`, in place.
     * @param {Vector} other - Target vector.
     * @param {number} amount - Interpolation amount, typically in `[0, 1]`.
     * @returns {Vector} This vector, for chaining.
     */
    lerp(other, amount) {
        this.x += (other.x - this.x) * amount;
        this.y += (other.y - this.y) * amount;
        this.z += (other.z - this.z) * amount;
        return this;
    }

    /**
     * Reflects this vector about a normal (a line normal in 2D, a plane normal in 3D), in place.
     * @param {Vector} normal - Unit normal vector.
     * @returns {Vector} This vector, for chaining.
     */
    reflect(normal) {
        const d = 2 * this.dot(normal);
        this.x -= d * normal.x;
        this.y -= d * normal.y;
        this.z -= d * normal.z;
        return this;
    }

    /**
     * Checks whether all of this vector's components equal `other`'s.
     * @param {Vector} other
     * @returns {boolean}
     */
    equals(other) { return this.x === other.x && this.y === other.y && this.z === other.z; }

    /**
     * Replaces components that are very close to zero with exact zero, in place.
     * @param {number} [epsilon=1e-10] - Threshold below which a component is snapped to `0`.
     * @returns {Vector} This vector, for chaining.
     */
    clampToZero(epsilon = 1e-10) {
        if (Math.abs(this.x) < epsilon) this.x = 0;
        if (Math.abs(this.y) < epsilon) this.y = 0;
        if (Math.abs(this.z) < epsilon) this.z = 0;
        return this;
    }

    /**
     * Sets this vector's components, in place.
     * @param {Vector|number[]|number} [x=0]
     * @param {number} [y=0]
     * @param {number} [z=0]
     * @returns {Vector} This vector, for chaining.
     */
    set(x = 0, y = 0, z = 0) {
        const [dx, dy, dz] = Vector._args(x, y, z);
        this.x = dx; this.y = dy; this.z = dz;
        return this;
    }

    /** @returns {string} A human-readable representation of this vector, e.g. `"Vector(1, 2, 0)"`. */
    toString() { return `Vector(${this.x}, ${this.y}, ${this.z})`; }

    /**
     * Normalizes `(x, y, z)` arguments, which may be given as three numbers,
     * an array, or another `Vector`, into a plain `[x, y, z]` triple.
     * @private
     */
    static _args(x, y, z) {
        if (x instanceof Vector) return [x.x, x.y, x.z];
        if (Array.isArray(x)) return [x[0] ?? 0, x[1] ?? 0, x[2] ?? 0];
        return [x ?? 0, y ?? 0, z ?? 0];
    }
}

/**
 * Stateless numeric helpers (the "Calculation" category): clamping,
 * remapping, interpolation, and similar. All are plain functions - no
 * instance to construct.
 *
 * @namespace
 */
const Calc = {
    /** @returns {number} The absolute value of `n`. */
    abs: (n) => Math.abs(n),
    /** @returns {number} The closest integer greater than or equal to `n`. */
    ceil: (n) => Math.ceil(n),
    /** @returns {number} `n`, clamped to `[low, high]`. */
    constrain: (n, low, high) => Math.min(Math.max(n, low), high),
    /** @returns {number} The Euclidean distance between two points, given as `(x1, y1[, z1], x2, y2[, z2])`. */
    dist(...args) {
        if (args.length === 4) {
            const [x1, y1, x2, y2] = args;
            return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        }
        const [x1, y1, z1, x2, y2, z2] = args;
        return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2);
    },
    /** @returns {number} Euler's number `e` raised to the power of `n`. */
    exp: (n) => Math.exp(n),
    /** @returns {number} The closest integer less than or equal to `n`. */
    floor: (n) => Math.floor(n),
    /** @returns {number} The fractional part of `n`. */
    fract: (n) => n - Math.floor(n),
    /** @returns {number} A value between `start` and `stop`, at position `amount` (typically `[0, 1]`). */
    lerp: (start, stop, amount) => start + (stop - start) * amount,
    /** @returns {number} The natural (base-e) logarithm of `n`. */
    log: (n) => Math.log(n),
    /** @returns {number} The magnitude of a vector given as `(x, y[, z])` components. */
    mag: (...components) => Math.sqrt(components.reduce((sum, c) => sum + c * c, 0)),
    /** @returns {number} `n`, remapped from `[start1, stop1]` to `[start2, stop2]`. Set `withinBounds` to `true` to clamp the result to the new range. */
    map(n, start1, stop1, start2, stop2, withinBounds = false) {
        const result = start2 + (stop2 - start2) * ((n - start1) / (stop1 - start1));
        if (!withinBounds) return result;
        return start2 < stop2 ? Calc.constrain(result, start2, stop2) : Calc.constrain(result, stop2, start2);
    },
    /** @returns {number} The largest of the given numbers (or of a single array argument). */
    max: (...nums) => Math.max(...(Array.isArray(nums[0]) ? nums[0] : nums)),
    /** @returns {number} The smallest of the given numbers (or of a single array argument). */
    min: (...nums) => Math.min(...(Array.isArray(nums[0]) ? nums[0] : nums)),
    /** @returns {number} `n`, mapped from `[start, stop]` to `[0, 1]`. */
    norm: (n, start, stop) => Calc.map(n, start, stop, 0, 1),
    /** @returns {number} `base` raised to the power of `exponent`. */
    pow: (base, exponent) => Math.pow(base, exponent),
    /** @returns {number} `n`, rounded to the nearest integer (or to `decimals` decimal places, if given). */
    round: (n, decimals = 0) => {
        const f = 10 ** decimals;
        return Math.round(n * f) / f;
    },
    /** @returns {number} The square of `n`. */
    sq: (n) => n * n,
    /** @returns {number} The square root of `n`. */
    sqrt: (n) => Math.sqrt(n)
};

/**
 * Random-number helpers (the "Random" category), backed by a seedable
 * linear-congruential generator so results are reproducible when a seed is
 * supplied via {@link Random.seed}.
 *
 * @namespace
 */
const Random = {
    _state: null,

    /**
     * Seeds the generator used by {@link Random.value} / {@link Random.gaussian}.
     * Calling this with the same seed produces the same sequence of results.
     * Omit the argument to return to non-deterministic, `Math.random()`-backed output.
     * @param {number} [seed]
     */
    seed(seed) {
        if (seed === undefined) { Random._state = null; return; }
        // xmur3-style integer hash, used only to spread a possibly-small seed
        // across a full 32-bit range before it drives the LCG below.
        let h = 1779033703 ^ seed;
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        Random._state = ((h ^ (h >>> 16)) >>> 0) || 1;
    },

    /** @returns {number} The next value from the seeded generator (if seeded), or `Math.random()` otherwise, in `[0, 1)`. @private */
    _next() {
        if (Random._state === null) return Math.random();
        // Numerical Recipes LCG constants.
        Random._state = (Math.imul(Random._state, 1664525) + 1013904223) >>> 0;
        return Random._state / 4294967296;
    },

    /**
     * Returns a random number, or a random element from an array.
     * @param {number|Array} [min=0] - Lower bound, upper bound (if called with one number), or an array to pick from.
     * @param {number} [max] - Upper bound, when `min` is the lower bound.
     * @returns {number|*}
     */
    value(min, max) {
        if (Array.isArray(min)) return min[Math.floor(Random._next() * min.length)];
        if (min === undefined) return Random._next();
        if (max === undefined) return Random._next() * min;
        return min + Random._next() * (max - min);
    },

    /**
     * Returns a random number fitting a Gaussian (normal) distribution, via the Box-Muller transform.
     * @param {number} [mean=0]
     * @param {number} [sd=1] - Standard deviation.
     * @returns {number}
     */
    gaussian(mean = 0, sd = 1) {
        let u = 0, v = 0;
        while (u === 0) u = Random._next();
        while (v === 0) v = Random._next();
        const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
        return mean + z * sd;
    },

    /**
     * Shuffles the elements of an array using a Fisher-Yates shuffle.
     * @param {Array} array
     * @param {boolean} [inPlace=false] - If `true`, shuffles `array` directly; otherwise shuffles and returns a copy.
     * @returns {Array}
     */
    shuffle(array, inPlace = false) {
        const arr = inPlace ? array : array.slice();
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Random._next() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
};

/**
 * Perlin-style organic noise (the "Noise" category). A single shared
 * permutation table drives {@link Noise.value}; reseed it with {@link
 * Noise.seed} for reproducible results.
 *
 * @namespace
 */
const Noise = {
    _perm: null,
    _octaves: 4,
    _falloff: 0.5,

    /** Builds (or rebuilds) the permutation table from a seed. @private */
    _buildPerm(seed) {
        const p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) p[i] = i;
        // Simple seeded shuffle so the same seed always yields the same table.
        let state = (seed >>> 0) || 1;
        const next = () => {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state / 4294967296;
        };
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(next() * (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }
        Noise._perm = new Uint8Array(512);
        for (let i = 0; i < 512; i++) Noise._perm[i] = p[i & 255];
    },

    /**
     * Sets the seed value for {@link Noise.value}. Omit to reseed randomly.
     * @param {number} [seed]
     */
    seed(seed = Math.floor(Math.random() * 65536)) { Noise._buildPerm(seed); },

    /**
     * Adjusts the character of the noise produced by {@link Noise.value}.
     * @param {number} [lod=4] - Number of octaves to sum (level of detail).
     * @param {number} [falloff=0.5] - Amplitude multiplier applied to each successive octave.
     */
    detail(lod = 4, falloff = 0.5) {
        Noise._octaves = Math.max(1, Math.floor(lod));
        Noise._falloff = falloff;
    },

    /**
     * Returns a value tunable to feel organic (Perlin noise), roughly in
     * `[-1, 1]`, at the given 1D/2D/3D coordinate.
     * @param {number} x
     * @param {number} [y=0]
     * @param {number} [z=0]
     * @returns {number}
     */
    value(x, y = 0, z = 0) {
        if (!Noise._perm) Noise._buildPerm(0);
        let total = 0, amplitude = 1, frequency = 1, max = 0;
        for (let o = 0; o < Noise._octaves; o++) {
            total += Noise._perlin3(x * frequency, y * frequency, z * frequency) * amplitude;
            max += amplitude;
            amplitude *= Noise._falloff;
            frequency *= 2;
        }
        return max === 0 ? 0 : total / max;
    },

    /** Classic Perlin 3D noise at one octave. @private */
    _perlin3(x, y, z) {
        const P = Noise._perm;
        const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
        const lerp = (t, a, b) => a + t * (b - a);
        const grad = (hash, x, y, z) => {
            const h = hash & 15;
            const u = h < 8 ? x : y;
            const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
            return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
        };

        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
        x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
        const u = fade(x), v = fade(y), w = fade(z);

        const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z;
        const B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;

        return lerp(w,
            lerp(v, lerp(u, grad(P[AA], x, y, z), grad(P[BA], x - 1, y, z)),
                    lerp(u, grad(P[AB], x, y - 1, z), grad(P[BB], x - 1, y - 1, z))),
            lerp(v, lerp(u, grad(P[AA + 1], x, y, z - 1), grad(P[BA + 1], x - 1, y, z - 1)),
                    lerp(u, grad(P[AB + 1], x, y - 1, z - 1), grad(P[BB + 1], x - 1, y - 1, z - 1)))
        );
    }
};

/**
 * Trigonometry helpers (the "Trigonometry" category), all operating in
 * radians unless converted with {@link Trig.degrees}/{@link Trig.radians}.
 *
 * @namespace
 */
const Trig = {
    /** @returns {number} The arc cosine of `n`, in radians. */
    acos: (n) => Math.acos(n),
    /** @returns {number} The arc sine of `n`, in radians. */
    asin: (n) => Math.asin(n),
    /** @returns {number} The arc tangent of `n`, in radians. */
    atan: (n) => Math.atan(n),
    /** @returns {number} The angle, in radians, formed by the point `(x, y)`, the origin, and the positive x-axis. */
    atan2: (y, x) => Math.atan2(y, x),
    /** @returns {number} The cosine of `angle` (radians). */
    cos: (angle) => Math.cos(angle),
    /** @returns {number} `radians`, converted to degrees. */
    degrees: (radians) => (radians * 180) / Math.PI,
    /** @returns {number} `degrees`, converted to radians. */
    radians: (degrees) => (degrees * Math.PI) / 180,
    /** @returns {number} The sine of `angle` (radians). */
    sin: (angle) => Math.sin(angle),
    /** @returns {number} The tangent of `angle` (radians). */
    tan: (angle) => Math.tan(angle)
};

/**
 * A rotation represented as a unit quaternion `(w, x, y, z)`.
 *
 * @class
 */
class Quaternion {
    /**
     * @param {number} [w=1] - Scalar (real) component.
     * @param {number} [x=0] - I component.
     * @param {number} [y=0] - J component.
     * @param {number} [z=0] - K component.
     */
    constructor(w = 1, x = 0, y = 0, z = 0) {
        this.w = w; this.x = x; this.y = y; this.z = z;
    }

    /**
     * Builds a unit quaternion representing a rotation of `angle` radians about `axis`.
     * @param {Vector} axis - Rotation axis. Need not already be normalized.
     * @param {number} angle - Rotation angle, in radians.
     * @returns {Quaternion}
     */
    static fromAxisAngle(axis, angle) {
        const a = axis.copy().normalize();
        const half = angle / 2;
        const s = Math.sin(half);
        return new Quaternion(Math.cos(half), a.x * s, a.y * s, a.z * s);
    }

    /**
     * Multiplies this quaternion by `other` (`this * other`), without modifying either one.
     * @param {Quaternion} other
     * @returns {Quaternion} A new quaternion.
     */
    mult(other) {
        return new Quaternion(
            this.w * other.w - this.x * other.x - this.y * other.y - this.z * other.z,
            this.w * other.x + this.x * other.w + this.y * other.z - this.z * other.y,
            this.w * other.y - this.x * other.z + this.y * other.w + this.z * other.x,
            this.w * other.z + this.x * other.y - this.y * other.x + this.z * other.w
        );
    }

    /**
     * Rotates this quaternion in place by the rotation described by `axis`/`angle` (applies it on the left: `rotation * this`).
     * @param {Vector} axis
     * @param {number} angle - Rotation angle, in radians.
     * @returns {Quaternion} This instance, for chaining.
     */
    rotateBy(axis, angle) {
        const rotation = Quaternion.fromAxisAngle(axis, angle);
        const result = rotation.mult(this);
        this.w = result.w; this.x = result.x; this.y = result.y; this.z = result.z;
        return this;
    }

    /** @returns {Quaternion} A copy of this quaternion, normalized to unit length. */
    normalize() {
        const m = Math.sqrt(this.w * this.w + this.x * this.x + this.y * this.y + this.z * this.z) || 1;
        return new Quaternion(this.w / m, this.x / m, this.y / m, this.z / m);
    }
}

return { Vector, Calc, Random, Noise, Trig, Quaternion };
});