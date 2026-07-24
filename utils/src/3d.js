'use strict';

// 3D: everything specific to WebGL sketches that sits above raw drawing -
// a movable Camera (with lookAt/pan/tilt/roll/perspective/ortho), a set of
// Lights (ambient/directional/point/spot), and Material surface
// properties (ambient/specular/emissive/normal/shininess/metalness).
// Shapes.js already renders 3D primitives with one *fixed* light and no
// camera controls (see the comment above its VERTEX_SHADER); this module
// is what a scene reaches for once it needs a movable viewpoint and more
// than one static light. Camera/Lights/Material each produce plain
// matrices/uniform-value objects, so they can be fed into any shader
// program - including shapes.js's - without this module needing to own
// the GL calls itself.
//
// GPU compute shaders and the full p5.strands shader-hook/build system
// are a large subsystem of their own and are out of scope here; Camera,
// Lights, and Material below cover the "Camera"/"Lights"/"Material"
// categories in full.
//
// Wrapped in the same IIFE pattern as the other engine files (see the
// comment at the top of transform.js) so this can be loaded either as a
// sibling <script> tag in the browser or via require() in Node.
(function (root, factory) {
    let ThreeD;
    if (typeof module === 'object' && module.exports) {
        ThreeD = factory(require('./transform.js'), require('./color.js'));
        module.exports = ThreeD;
    } else {
        if (!root || !root.Transform || !root.Color) throw new Error('3d.js requires transform.js and color.js to be loaded first.');
        ThreeD = factory(root.Transform, root.Color);
        root.Camera = ThreeD.Camera;
        root.Lights = ThreeD.Lights;
        root.Material = ThreeD.Material;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Transform, Color) {

function normalize3(v) {
    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
}
function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scale3(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
function cross3(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

/**
 * Builds a right-handed "look at" view matrix (column-major, matching {@link Transform}'s layout).
 * @param {number[]} eye - Camera position, `[x, y, z]`.
 * @param {number[]} center - Point the camera looks at, `[x, y, z]`.
 * @param {number[]} up - "Up" direction, `[x, y, z]`.
 * @returns {Float32Array} The view matrix.
 */
function lookAtMatrix(eye, center, up) {
    const zAxis = normalize3(sub3(eye, center));
    const xAxis = normalize3(cross3(up, zAxis));
    const yAxis = cross3(zAxis, xAxis);
    // prettier-ignore
    return new Float32Array([
        xAxis[0], yAxis[0], zAxis[0], 0,
        xAxis[1], yAxis[1], zAxis[1], 0,
        xAxis[2], yAxis[2], zAxis[2], 0,
        -dot3(xAxis, eye), -dot3(yAxis, eye), -dot3(zAxis, eye), 1
    ]);
}

/**
 * Builds an orthographic projection matrix (column-major).
 * @returns {Float32Array}
 */
function orthoMatrix(left, right, bottom, top, near, far) {
    const m = new Float32Array(16);
    m[0] = 2 / (right - left);
    m[5] = 2 / (top - bottom);
    m[10] = -2 / (far - near);
    m[12] = -(right + left) / (right - left);
    m[13] = -(top + bottom) / (top - bottom);
    m[14] = -(far + near) / (far - near);
    m[15] = 1;
    return m;
}

/**
 * A movable/orientable 3D viewpoint: position (`eyeX/Y/Z`), look-at target
 * (`centerX/Y/Z`), up vector (`upX/Y/Z`), and a perspective or orthographic
 * projection. Produces the view/projection matrices a WebGL draw call
 * needs (`camera.viewMatrix()` / `camera.projectionMatrix()`).
 *
 * @class
 */
class Camera {
    /**
     * @param {Object} [options={}]
     * @param {number} [options.aspect=4/3] - Viewport aspect ratio (width / height), used by perspective().
     */
    constructor(options = {}) {
        this.eyeX = 0; this.eyeY = 0; this.eyeZ = 800;
        this.centerX = 0; this.centerY = 0; this.centerZ = 0;
        this.upX = 0; this.upY = 1; this.upZ = 0;
        this._aspect = options.aspect || 4 / 3;
        this._projectionType = 'perspective';
        this.perspective();
    }

    /**
     * Sets the camera's position and orientation directly.
     * @param {number} eyeX @param {number} eyeY @param {number} eyeZ
     * @param {number} [centerX=0] @param {number} [centerY=0] @param {number} [centerZ=0]
     * @param {number} [upX=0] @param {number} [upY=1] @param {number} [upZ=0]
     * @returns {Camera} This instance, to allow chaining.
     */
    camera(eyeX, eyeY, eyeZ, centerX = 0, centerY = 0, centerZ = 0, upX = 0, upY = 1, upZ = 0) {
        Object.assign(this, { eyeX, eyeY, eyeZ, centerX, centerY, centerZ, upX, upY, upZ });
        return this;
    }

    /**
     * Points the camera at a location without changing its position.
     * @param {number} x @param {number} y @param {number} z
     * @returns {Camera} This instance, to allow chaining.
     */
    lookAt(x, y, z) {
        this.centerX = x; this.centerY = y; this.centerZ = z;
        return this;
    }

    /**
     * Sets the camera's position in world space without changing its orientation (its look-at target moves with it).
     * @param {number} x @param {number} y @param {number} z
     * @returns {Camera} This instance, to allow chaining.
     */
    setPosition(x, y, z) {
        const [fx, fy, fz] = [this.centerX - this.eyeX, this.centerY - this.eyeY, this.centerZ - this.eyeZ];
        this.eyeX = x; this.eyeY = y; this.eyeZ = z;
        this.centerX = x + fx; this.centerY = y + fy; this.centerZ = z + fz;
        return this;
    }

    /**
     * Moves the camera along its own local right/up/forward axes, without changing its orientation.
     * @param {number} x - Distance along the camera's local right axis.
     * @param {number} y - Distance along the camera's local up axis.
     * @param {number} z - Distance along the camera's local forward axis.
     * @returns {Camera} This instance, to allow chaining.
     */
    move(x, y, z) {
        const forward = normalize3(sub3([this.centerX, this.centerY, this.centerZ], [this.eyeX, this.eyeY, this.eyeZ]));
        const right = normalize3(cross3(forward, [this.upX, this.upY, this.upZ]));
        const up = cross3(right, forward);
        const delta = add3(add3(scale3(right, x), scale3(up, y)), scale3(forward, z));
        this.eyeX += delta[0]; this.eyeY += delta[1]; this.eyeZ += delta[2];
        this.centerX += delta[0]; this.centerY += delta[1]; this.centerZ += delta[2];
        return this;
    }

    /**
     * Rotates the camera left/right around its up axis, pivoting around its own position.
     * @param {number} angleRad
     * @returns {Camera} This instance, to allow chaining.
     */
    pan(angleRad) {
        const forward = sub3([this.centerX, this.centerY, this.centerZ], [this.eyeX, this.eyeY, this.eyeZ]);
        const up = normalize3([this.upX, this.upY, this.upZ]);
        const rotated = this._rotateAroundAxis(forward, up, angleRad);
        this.centerX = this.eyeX + rotated[0];
        this.centerY = this.eyeY + rotated[1];
        this.centerZ = this.eyeZ + rotated[2];
        return this;
    }

    /**
     * Rotates the camera up/down, pivoting around its own position.
     * @param {number} angleRad
     * @returns {Camera} This instance, to allow chaining.
     */
    tilt(angleRad) {
        const forward = sub3([this.centerX, this.centerY, this.centerZ], [this.eyeX, this.eyeY, this.eyeZ]);
        const up = normalize3([this.upX, this.upY, this.upZ]);
        const right = normalize3(cross3(forward, up));
        const rotated = this._rotateAroundAxis(forward, right, angleRad);
        this.centerX = this.eyeX + rotated[0];
        this.centerY = this.eyeY + rotated[1];
        this.centerZ = this.eyeZ + rotated[2];
        return this;
    }

    /**
     * Rotates the camera clockwise/counter-clockwise around its own viewing (forward) axis.
     * @param {number} angleRad
     * @returns {Camera} This instance, to allow chaining.
     */
    roll(angleRad) {
        const forward = normalize3(sub3([this.centerX, this.centerY, this.centerZ], [this.eyeX, this.eyeY, this.eyeZ]));
        const up = [this.upX, this.upY, this.upZ];
        const rotated = this._rotateAroundAxis(up, forward, angleRad);
        [this.upX, this.upY, this.upZ] = rotated;
        return this;
    }

    _rotateAroundAxis(vec, axis, angleRad) {
        // Rodrigues' rotation formula.
        const a = normalize3(axis);
        const cosA = Math.cos(angleRad), sinA = Math.sin(angleRad);
        const term1 = scale3(vec, cosA);
        const term2 = scale3(cross3(a, vec), sinA);
        const term3 = scale3(a, dot3(a, vec) * (1 - cosA));
        return add3(add3(term1, term2), term3);
    }

    /**
     * Sets a perspective projection.
     * @param {number} [fovRad=Math.PI/3] - Vertical field of view, in radians.
     * @param {number} [aspect] - Viewport aspect ratio. Defaults to the value given at construction.
     * @param {number} [near=0.1] @param {number} [far=10000]
     * @returns {Camera} This instance, to allow chaining.
     */
    perspective(fovRad = Math.PI / 3, aspect = this._aspect, near = 0.1, far = 10000) {
        this._projectionType = 'perspective';
        this._aspect = aspect;
        this._near = near; this._far = far; this._fov = fovRad;
        return this;
    }

    /**
     * Sets an orthographic projection.
     * @param {number} [left=-width/2] @param {number} [right=width/2] @param {number} [bottom=-height/2] @param {number} [top=height/2]
     * @param {number} [near=0] @param {number} [far=10000]
     * @param {number} [width=800] @param {number} [height=600] - Used only to derive default left/right/bottom/top.
     * @returns {Camera} This instance, to allow chaining.
     */
    ortho(left = -400, right = 400, bottom = -300, top = 300, near = 0, far = 10000) {
        this._projectionType = 'ortho';
        this._ortho = { left, right, bottom, top, near, far };
        return this;
    }

    /**
     * Sets the camera's viewing frustum directly (perspective projection defined by near-plane bounds rather than field of view).
     * @param {number} left @param {number} right @param {number} bottom @param {number} top @param {number} [near=0.1] @param {number} [far=10000]
     * @returns {Camera} This instance, to allow chaining.
     */
    frustum(left, right, bottom, top, near = 0.1, far = 10000) {
        this._projectionType = 'frustum';
        this._frustum = { left, right, bottom, top, near, far };
        return this;
    }

    /** @returns {Float32Array} The current view matrix. */
    viewMatrix() {
        return lookAtMatrix(
            [this.eyeX, this.eyeY, this.eyeZ],
            [this.centerX, this.centerY, this.centerZ],
            [this.upX, this.upY, this.upZ]
        );
    }

    /** @returns {Float32Array} The current projection matrix (perspective, ortho, or frustum, per the last call to one of those methods). */
    projectionMatrix() {
        if (this._projectionType === 'ortho') {
            const o = this._ortho;
            return orthoMatrix(o.left, o.right, o.bottom, o.top, o.near, o.far);
        }
        if (this._projectionType === 'frustum') {
            const f = this._frustum;
            const m = new Float32Array(16);
            m[0] = (2 * f.near) / (f.right - f.left);
            m[5] = (2 * f.near) / (f.top - f.bottom);
            m[8] = (f.right + f.left) / (f.right - f.left);
            m[9] = (f.top + f.bottom) / (f.top - f.bottom);
            m[10] = -(f.far + f.near) / (f.far - f.near);
            m[11] = -1;
            m[14] = -(2 * f.far * f.near) / (f.far - f.near);
            return m;
        }
        return Transform.perspective(this._fov, this._aspect, this._near, this._far);
    }

    /**
     * Copies another camera's position, orientation, and projection onto this one.
     * @param {Camera} other
     * @returns {Camera} This instance, to allow chaining.
     */
    set(other) {
        Object.assign(this, {
            eyeX: other.eyeX, eyeY: other.eyeY, eyeZ: other.eyeZ,
            centerX: other.centerX, centerY: other.centerY, centerZ: other.centerZ,
            upX: other.upX, upY: other.upY, upZ: other.upZ,
            _projectionType: other._projectionType, _aspect: other._aspect,
            _near: other._near, _far: other._far, _fov: other._fov,
            _ortho: other._ortho, _frustum: other._frustum
        });
        return this;
    }

    /**
     * Interpolates position, orientation, and field of view between two cameras, storing the result on this one.
     * @param {Camera} a @param {Camera} b @param {number} amt - `0` returns `a`, `1` returns `b`.
     * @returns {Camera} This instance, to allow chaining.
     */
    slerp(a, b, amt) {
        const lerp = (x, y) => x + (y - x) * amt;
        this.eyeX = lerp(a.eyeX, b.eyeX); this.eyeY = lerp(a.eyeY, b.eyeY); this.eyeZ = lerp(a.eyeZ, b.eyeZ);
        this.centerX = lerp(a.centerX, b.centerX); this.centerY = lerp(a.centerY, b.centerY); this.centerZ = lerp(a.centerZ, b.centerZ);
        this.upX = lerp(a.upX, b.upX); this.upY = lerp(a.upY, b.upY); this.upZ = lerp(a.upZ, b.upZ);
        this._projectionType = a._projectionType;
        this._aspect = lerp(a._aspect, b._aspect);
        this._near = lerp(a._near ?? 0.1, b._near ?? 0.1);
        this._far = lerp(a._far ?? 10000, b._far ?? 10000);
        this._fov = lerp(a._fov ?? Math.PI / 3, b._fov ?? Math.PI / 3);
        return this;
    }
}

/**
 * A scene's set of lights (ambient, directional, point, spot). Doesn't
 * touch the GPU itself - collects light descriptors and packs them into a
 * flat uniform-value object a shader program can be fed with `gl.uniform*`
 * calls.
 *
 * @class
 */
class Lights {
    constructor() {
        this._lights = [];
        this._falloff = { constant: 1, linear: 0, quadratic: 0 };
        this._specularColor = [1, 1, 1];
    }

    /**
     * Adds a light that shines evenly from all directions.
     * @param {*} color - Anything {@link Color.color} accepts.
     * @returns {Lights} This instance, to allow chaining.
     */
    ambientLight(color) {
        this._lights.push({ type: 'ambient', color: this._rgb(color) });
        return this;
    }

    /**
     * Adds a light that shines in one direction, from infinitely far away (like sunlight).
     * @param {*} color @param {number} dx @param {number} dy @param {number} dz
     * @returns {Lights} This instance, to allow chaining.
     */
    directionalLight(color, dx, dy, dz) {
        this._lights.push({ type: 'directional', color: this._rgb(color), direction: normalize3([dx, dy, dz]) });
        return this;
    }

    /**
     * Adds a light that shines from a single point in all directions.
     * @param {*} color @param {number} x @param {number} y @param {number} z
     * @returns {Lights} This instance, to allow chaining.
     */
    pointLight(color, x, y, z) {
        this._lights.push({ type: 'point', color: this._rgb(color), position: [x, y, z] });
        return this;
    }

    /**
     * Adds a light that shines from a point in one direction, within a cone.
     * @param {*} color @param {number} x @param {number} y @param {number} z
     * @param {number} dx @param {number} dy @param {number} dz
     * @param {number} [angleRad=Math.PI/3] - Half-angle of the spot cone.
     * @param {number} [concentration=100] - Focus falloff exponent.
     * @returns {Lights} This instance, to allow chaining.
     */
    spotLight(color, x, y, z, dx, dy, dz, angleRad = Math.PI / 3, concentration = 100) {
        this._lights.push({
            type: 'spot', color: this._rgb(color), position: [x, y, z],
            direction: normalize3([dx, dy, dz]), angle: angleRad, concentration
        });
        return this;
    }

    /**
     * Convenience: adds one default ambient + one default directional light, mirroring p5.js's `lights()`.
     * @returns {Lights} This instance, to allow chaining.
     */
    lights() {
        return this.ambientLight('#808080').directionalLight('#808080', 0, 0.4, -1);
    }

    /**
     * Sets the falloff rate for point/spot lights, i.e. how their intensity decreases over `d` distance: `1 / (constant + linear*d + quadratic*d^2)`.
     * @param {number} [constant=1] @param {number} [linear=0] @param {number} [quadratic=0]
     * @returns {Lights} This instance, to allow chaining.
     */
    lightFalloff(constant = 1, linear = 0, quadratic = 0) {
        this._falloff = { constant, linear, quadratic };
        return this;
    }

    /**
     * Sets the specular highlight color used by all lights.
     * @param {*} color
     * @returns {Lights} This instance, to allow chaining.
     */
    specularColor(color) {
        this._specularColor = this._rgb(color);
        return this;
    }

    /**
     * Removes every light that's been added.
     * @returns {Lights} This instance, to allow chaining.
     */
    noLights() {
        this._lights = [];
        return this;
    }

    /**
     * Packs the current lights into a flat, shader-ready uniform bag: arrays of ambient/directional/point/spot lights (padded to fixed max counts) plus falloff/specular values.
     * @param {number} [maxDirectional=4] @param {number} [maxPoint=4] @param {number} [maxSpot=4]
     * @returns {Object} Uniform values, ready for `gl.uniform*` calls (e.g. `uAmbientColor`, `uDirectionalColor[i]`, `uDirectionalDirection[i]`, `uDirectionalCount`, ...).
     */
    toUniforms(maxDirectional = 4, maxPoint = 4, maxSpot = 4) {
        const byType = t => this._lights.filter(l => l.type === t);
        const ambient = byType('ambient').reduce((sum, l) => add3(sum, l.color), [0, 0, 0]);
        const directional = byType('directional').slice(0, maxDirectional);
        const point = byType('point').slice(0, maxPoint);
        const spot = byType('spot').slice(0, maxSpot);
        return {
            uAmbientColor: ambient,
            uDirectionalColor: directional.map(l => l.color),
            uDirectionalDirection: directional.map(l => l.direction),
            uDirectionalCount: directional.length,
            uPointColor: point.map(l => l.color),
            uPointPosition: point.map(l => l.position),
            uPointCount: point.length,
            uSpotColor: spot.map(l => l.color),
            uSpotPosition: spot.map(l => l.position),
            uSpotDirection: spot.map(l => l.direction),
            uSpotAngle: spot.map(l => l.angle),
            uSpotConcentration: spot.map(l => l.concentration),
            uSpotCount: spot.length,
            uLightFalloff: [this._falloff.constant, this._falloff.linear, this._falloff.quadratic],
            uSpecularColor: this._specularColor
        };
    }

    _rgb(value) {
        const c = Color.color(value);
        return [Color.red(c) / 255, Color.green(c) / 255, Color.blue(c) / 255];
    }
}

/**
 * A shape's surface material properties (ambient/specular/emissive
 * reflectance, shininess, metalness, or a flat "normal" debug material).
 * Like {@link Lights}, this only tracks state and packs it into shader
 * uniforms - it doesn't touch the GPU directly.
 *
 * @class
 */
class Material {
    constructor() {
        this.reset();
    }

    /** Resets every property back to its default. @returns {Material} This instance, to allow chaining. */
    reset() {
        this._ambient = [1, 1, 1];
        this._specular = [1, 1, 1];
        this._emissive = [0, 0, 0];
        this._shininess = 1;
        this._metalness = 0;
        this._normalMaterial = false;
        return this;
    }

    /**
     * Sets the ambient reflectance color of the surface (how it responds to ambient light).
     * @param {*} color
     * @returns {Material} This instance, to allow chaining.
     */
    ambientMaterial(color) {
        this._ambient = this._rgb(color);
        this._normalMaterial = false;
        return this;
    }

    /**
     * Sets the specular reflectance color of the surface (the color of its shiny highlight).
     * @param {*} color
     * @returns {Material} This instance, to allow chaining.
     */
    specularMaterial(color) {
        this._specular = this._rgb(color);
        this._normalMaterial = false;
        return this;
    }

    /**
     * Sets the emissive color of the surface (light it appears to give off on its own, independent of scene lighting).
     * @param {*} color
     * @returns {Material} This instance, to allow chaining.
     */
    emissiveMaterial(color) {
        this._emissive = this._rgb(color);
        return this;
    }

    /**
     * Sets the amount of gloss ("shininess") of the specular highlight.
     * @param {number} amount - Higher values produce a smaller, sharper highlight.
     * @returns {Material} This instance, to allow chaining.
     */
    shininess(amount) {
        this._shininess = amount;
        return this;
    }

    /**
     * Sets the "metalness" of the material (`0` = fully dielectric, `1` = fully metallic), for physically-based-style shading.
     * @param {number} amount
     * @returns {Material} This instance, to allow chaining.
     */
    metalness(amount) {
        this._metalness = Math.min(1, Math.max(0, amount));
        return this;
    }

    /**
     * Switches the material to a "normal material": surface color is derived from the vertex normal, ignoring lights - useful for debugging geometry/normals.
     * @returns {Material} This instance, to allow chaining.
     */
    normalMaterial() {
        this._normalMaterial = true;
        return this;
    }

    /**
     * Packs the current material into a flat, shader-ready uniform bag.
     * @returns {Object}
     */
    toUniforms() {
        return {
            uAmbientMaterial: this._ambient,
            uSpecularMaterial: this._specular,
            uEmissiveMaterial: this._emissive,
            uShininess: this._shininess,
            uMetalness: this._metalness,
            uUseNormalMaterial: this._normalMaterial ? 1 : 0
        };
    }

    _rgb(value) {
        const c = Color.color(value);
        return [Color.red(c) / 255, Color.green(c) / 255, Color.blue(c) / 255];
    }
}

return { Camera, Lights, Material };
});