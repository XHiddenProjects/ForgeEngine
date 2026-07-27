'use strict';

const constants = require('./constants.js');
const { Vector } = require('./math.js');
const { multiply, identity } = require('./transform.js');

/**
 * Returns a normalized copy of a three-dimensional vector.
 *
 * @param {number[]} v - Vector to normalize.
 *
 * @returns {number[]} Unit-length vector, or the zero vector when the input magnitude is zero.
 */
function normalize(v) {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
}
/**
 * Subtracts one three-dimensional vector from another.
 *
 * @param {number[]} a - Minuend vector.
 * @param {number[]} b - Subtrahend vector.
 *
 * @returns {number[]} Component-wise difference `a - b`.
 */
function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
/**
 * Computes the cross product of two three-dimensional vectors.
 *
 * @param {number[]} a - First vector.
 * @param {number[]} b - Second vector.
 *
 * @returns {number[]} Cross-product vector.
 */
function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
/**
 * Computes the dot product of two three-dimensional vectors.
 *
 * @param {number[]} a - First vector.
 * @param {number[]} b - Second vector.
 *
 * @returns {number} Scalar dot product.
 */
function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

/** Real look-at / perspective / orthographic matrix math (column-major 4x4). */
class Camera {
  /**
   * Creates a camera with view and projection defaults.
   *
   * @param {number[]} [eye=[0, 0, 800]] - Camera position in world space.
   * @param {number[]} [center=[0, 0, 0]] - Point the camera looks toward.
   * @param {number[]} [up=[0, 1, 0]] - Camera up direction.
   */
  constructor(eye = [0, 0, 800], center = [0, 0, 0], up = [0, 1, 0]) {
    this._eye = eye.slice();
    this._center = center.slice();
    this._up = up.slice();
    this._fov = Math.PI / 3;
    this._aspect = 1;
    this._near = 0.1;
    this._far = 10000;
    this._ortho = null; // { left, right, bottom, top, near, far } when active
  }
  /**
   * Returns the x-coordinate of the camera position.
   *
   * @returns {number} Current component value.
   */
  get eyeX() { return this._eye[0]; }
  /**
   * Returns the y-coordinate of the camera position.
   *
   * @returns {number} Current component value.
   */
  get eyeY() { return this._eye[1]; }
  /**
   * Returns the z-coordinate of the camera position.
   *
   * @returns {number} Current component value.
   */
  get eyeZ() { return this._eye[2]; }
  /**
   * Returns the x-coordinate of the look-at target.
   *
   * @returns {number} Current component value.
   */
  get centerX() { return this._center[0]; }
  /**
   * Returns the y-coordinate of the look-at target.
   *
   * @returns {number} Current component value.
   */
  get centerY() { return this._center[1]; }
  /**
   * Returns the z-coordinate of the look-at target.
   *
   * @returns {number} Current component value.
   */
  get centerZ() { return this._center[2]; }
  /**
   * Returns the x-component of the up vector.
   *
   * @returns {number} Current component value.
   */
  get upX() { return this._up[0]; }
  /**
   * Returns the y-component of the up vector.
   *
   * @returns {number} Current component value.
   */
  get upY() { return this._up[1]; }
  /**
   * Returns the z-component of the up vector.
   *
   * @returns {number} Current component value.
   */
  get upZ() { return this._up[2]; }

  /**
   * Sets the complete camera pose.
   *
   * @param {number} eyeX - Camera x-coordinate.
   * @param {number} eyeY - Camera y-coordinate.
   * @param {number} eyeZ - Camera z-coordinate.
   * @param {number} centerX - Target x-coordinate.
   * @param {number} centerY - Target y-coordinate.
   * @param {number} centerZ - Target z-coordinate.
   * @param {number} [upX=0] - Up-vector x-component.
   * @param {number} [upY=1] - Up-vector y-component.
   * @param {number} [upZ=0] - Up-vector z-component.
   *
   * @returns {Camera} This camera for chaining.
   */
  set(eyeX, eyeY, eyeZ, centerX, centerY, centerZ, upX = 0, upY = 1, upZ = 0) {
    this._eye = [eyeX, eyeY, eyeZ];
    this._center = [centerX, centerY, centerZ];
    this._up = [upX, upY, upZ];
    return this;
  }
  /**
   * Sets the camera position without changing its target.
   *
   * @param {number} x - World-space x-coordinate.
   * @param {number} y - World-space y-coordinate.
   * @param {number} z - World-space z-coordinate.
   *
   * @returns {Camera} This camera for chaining.
   */
  setPosition(x, y, z) { this._eye = [x, y, z]; return this; }
  /**
   * Sets the point toward which the camera is aimed.
   *
   * @param {number} x - Target x-coordinate.
   * @param {number} y - Target y-coordinate.
   * @param {number} z - Target z-coordinate.
   *
   * @returns {Camera} This camera for chaining.
   */
  lookAt(x, y, z) { this._center = [x, y, z]; return this; }
  /**
   * Translates the camera position and target by the same offset.
   *
   * @param {number} dx - Translation along x.
   * @param {number} dy - Translation along y.
   * @param {number} dz - Translation along z.
   *
   * @returns {Camera} This camera for chaining.
   */
  move(dx, dy, dz) {
    this._eye = [this._eye[0] + dx, this._eye[1] + dy, this._eye[2] + dz];
    this._center = [this._center[0] + dx, this._center[1] + dy, this._center[2] + dz];
    return this;
  }
  /**
   * Rotates the view direction horizontally around the camera position.
   *
   * @param {number} angle - Rotation angle in radians.
   *
   * @returns {Camera} This camera for chaining.
   */
  pan(angle) {
    const dir = sub3(this._center, this._eye);
    const c = Math.cos(angle), s = Math.sin(angle);
    this._center = [
      this._eye[0] + dir[0] * c - dir[2] * s,
      this._eye[1] + dir[1],
      this._eye[2] + dir[0] * s + dir[2] * c
    ];
    return this;
  }
  /**
   * Rotates the view direction vertically relative to the current up vector.
   *
   * @param {number} angle - Rotation angle in radians.
   *
   * @returns {Camera} This camera for chaining.
   */
  tilt(angle) {
    const dir = sub3(this._center, this._eye);
    const right = normalize(cross3(dir, this._up));
    const c = Math.cos(angle), s = Math.sin(angle);
    const newDir = [
      dir[0] * c + this._up[0] * s,
      dir[1] * c + this._up[1] * s,
      dir[2] * c + this._up[2] * s
    ];
    this._center = [this._eye[0] + newDir[0], this._eye[1] + newDir[1], this._eye[2] + newDir[2]];
    return this;
  }
  /**
   * Rotates the camera up vector around the viewing axis approximation.
   *
   * @param {number} angle - Rotation angle in radians.
   *
   * @returns {Camera} This camera for chaining.
   */
  roll(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    this._up = [
      this._up[0] * c - this._up[2] * s,
      this._up[1],
      this._up[0] * s + this._up[2] * c
    ];
    return this;
  }
  /**
   * Interpolates the camera position and target toward another camera.
   *
   * Despite its name, this implementation performs component-wise linear interpolation.
   *
   * @param {Camera} other - Destination camera.
   * @param {number} amt - Interpolation factor; values from 0 to 1 interpolate between cameras.
   *
   * @returns {Camera} This camera for chaining.
   */
  slerp(other, amt) {
    this._eye = this._eye.map((v, i) => v + (other._eye[i] - v) * amt);
    this._center = this._center.map((v, i) => v + (other._center[i] - v) * amt);
    return this;
  }

  /**
   * Configures a perspective projection and returns its matrix.
   *
   * @param {number} [fov=Math.PI / 3] - Vertical field of view in radians.
   * @param {number} [aspect=1] - Viewport width-to-height ratio.
   * @param {number} [near=0.1] - Near clipping distance.
   * @param {number} [far=10000] - Far clipping distance.
   *
   * @returns {number[]} Column-major 4x4 perspective matrix.
   */
  perspective(fov = Math.PI / 3, aspect = 1, near = 0.1, far = 10000) {
    this._ortho = null;
    Object.assign(this, { _fov: fov, _aspect: aspect, _near: near, _far: far });
    return this.projectionMatrix();
  }
  /**
   * Configures an orthographic projection and returns its matrix.
   *
   * @param {number} [left=-400] - Left clipping plane.
   * @param {number} [right=400] - Right clipping plane.
   * @param {number} [bottom=-400] - Bottom clipping plane.
   * @param {number} [top=400] - Top clipping plane.
   * @param {number} [near=0.1] - Near clipping plane.
   * @param {number} [far=10000] - Far clipping plane.
   *
   * @returns {number[]} Column-major 4x4 orthographic matrix.
   */
  ortho(left = -400, right = 400, bottom = -400, top = 400, near = 0.1, far = 10000) {
    this._ortho = { left, right, bottom, top, near, far };
    return this.projectionMatrix();
  }
  /**
   * Creates an off-axis perspective projection matrix.
   *
   * @param {number} left - Left clipping plane.
   * @param {number} right - Right clipping plane.
   * @param {number} bottom - Bottom clipping plane.
   * @param {number} top - Top clipping plane.
   * @param {number} near - Near clipping distance.
   * @param {number} far - Far clipping distance.
   *
   * @returns {number[]} Column-major 4x4 frustum matrix.
   */
  frustum(left, right, bottom, top, near, far) {
    const m = identity();
    m[0] = (2 * near) / (right - left);
    m[5] = (2 * near) / (top - bottom);
    m[8] = (right + left) / (right - left);
    m[9] = (top + bottom) / (top - bottom);
    m[10] = -(far + near) / (far - near);
    m[11] = -1;
    m[14] = -(2 * far * near) / (far - near);
    m[15] = 0;
    return m;
  }
  /**
   * Enables or disables perspective scaling for lines.
   *
   * @param {boolean} [state=true] - Whether line perspective is enabled.
   *
   * @returns {Camera} This camera for chaining.
   */
  linePerspective(state = true) { this._linePerspective = state; return this; }

  /**
   * Builds the camera view matrix from its position, target, and up vector.
   *
   * @returns {number[]} Column-major 4x4 view matrix.
   */
  viewMatrix() {
    const f = normalize(sub3(this._center, this._eye));
    const s = normalize(cross3(f, this._up));
    const u = cross3(s, f);
    return [
      s[0], u[0], -f[0], 0,
      s[1], u[1], -f[1], 0,
      s[2], u[2], -f[2], 0,
      -dot3(s, this._eye), -dot3(u, this._eye), dot3(f, this._eye), 1
    ];
  }
  /**
   * Builds the currently configured projection matrix.
   *
   * @returns {number[]} Column-major 4x4 projection matrix.
   */
  projectionMatrix() {
    if (this._ortho) {
      const { left, right, bottom, top, near, far } = this._ortho;
      const m = identity();
      m[0] = 2 / (right - left);
      m[5] = 2 / (top - bottom);
      m[10] = -2 / (far - near);
      m[12] = -(right + left) / (right - left);
      m[13] = -(top + bottom) / (top - bottom);
      m[14] = -(far + near) / (far - near);
      return m;
    }
    const f = 1 / Math.tan(this._fov / 2);
    const m = identity().map(() => 0);
    m[0] = f / this._aspect;
    m[5] = f;
    m[10] = (this._far + this._near) / (this._near - this._far);
    m[11] = -1;
    m[14] = (2 * this._far * this._near) / (this._near - this._far);
    return m;
  }
  /**
   * Builds the combined projection and view matrix.
   *
   * @returns {number[]} Column-major 4x4 view-projection matrix.
   */
  viewProjectionMatrix() { return multiply(this.projectionMatrix(), this.viewMatrix()); }
}

class Interaction {
  /**
   * Creates interaction state with debugging disabled and no orbit configuration.
   */
  constructor() { this._debug = false; this._orbit = null; }
  /**
   * Enables or disables interaction debugging.
   *
   * @param {boolean} [state=true] - Desired debug state.
   *
   * @returns {Interaction} This interaction controller for chaining.
   */
  debugMode(state = true) { this._debug = state; return this; }
  /**
   * Disables interaction debugging.
   *
   * @returns {Interaction} This interaction controller for chaining.
   */
  noDebugMode() { this._debug = false; return this; }
  /**
   * Configures orbit-control sensitivity.
   *
   * @param {number} [sensitivityX=1] - Horizontal sensitivity multiplier.
   * @param {number} [sensitivityY=1] - Vertical sensitivity multiplier.
   * @param {number} [sensitivityZ=1] - Zoom sensitivity multiplier.
   *
   * @returns {Object} Stored orbit-control configuration.
   */
  orbitControl(sensitivityX = 1, sensitivityY = 1, sensitivityZ = 1) {
    this._orbit = { sensitivityX, sensitivityY, sensitivityZ };
    return this._orbit;
  }
}

class Lights {
  /**
   * Creates an empty light collection with default attenuation and specular color.
   */
  constructor() {
    this._lights = [];
    this._falloff = [1, 0, 0];
    this._specular = [255, 255, 255];
    this._panoramaImg = null;
  }
  /**
   * Adds an ambient light.
   *
   * @param {number} r - Red channel.
   * @param {number} g - Green channel.
   * @param {number} b - Blue channel.
   *
   * @returns {Lights} This light collection for chaining.
   */
  ambientLight(r, g, b) { this._lights.push({ type: 'ambient', color: [r, g, b] }); return this; }
  /**
   * Adds a directional light.
   *
   * @param {number} r - Red channel.
   * @param {number} g - Green channel.
   * @param {number} b - Blue channel.
   * @param {number} x - Direction x-component.
   * @param {number} y - Direction y-component.
   * @param {number} z - Direction z-component.
   *
   * @returns {Lights} This light collection for chaining.
   */
  directionalLight(r, g, b, x, y, z) { this._lights.push({ type: 'directional', color: [r, g, b], direction: normalize([x, y, z]) }); return this; }
  /**
   * Adds a point light.
   *
   * @param {number} r - Red channel.
   * @param {number} g - Green channel.
   * @param {number} b - Blue channel.
   * @param {number} x - Position x-coordinate.
   * @param {number} y - Position y-coordinate.
   * @param {number} z - Position z-coordinate.
   *
   * @returns {Lights} This light collection for chaining.
   */
  pointLight(r, g, b, x, y, z) { this._lights.push({ type: 'point', color: [r, g, b], position: [x, y, z] }); return this; }
  /**
   * Adds a spotlight.
   *
   * @param {number} r - Red channel.
   * @param {number} g - Green channel.
   * @param {number} b - Blue channel.
   * @param {number} x - Position x-coordinate.
   * @param {number} y - Position y-coordinate.
   * @param {number} z - Position z-coordinate.
   * @param {number} dx - Direction x-component.
   * @param {number} dy - Direction y-component.
   * @param {number} dz - Direction z-component.
   * @param {number} [angle=Math.PI / 6] - Cone angle in radians.
   * @param {number} [concentration=20] - Spotlight concentration exponent.
   *
   * @returns {Lights} This light collection for chaining.
   */
  spotLight(r, g, b, x, y, z, dx, dy, dz, angle = Math.PI / 6, concentration = 20) {
    this._lights.push({ type: 'spot', color: [r, g, b], position: [x, y, z], direction: normalize([dx, dy, dz]), angle, concentration });
    return this;
  }
  /**
   * Adds an image-based light and stores its panorama image.
   *
   * @param {*} img - Image or texture used for environment lighting.
   *
   * @returns {Lights} This light collection for chaining.
   */
  imageLight(img) { this._panoramaImg = img; this._lights.push({ type: 'image', image: img }); return this; }
  /**
   * Sets the panorama image without adding a light entry.
   *
   * @param {*} img - Panorama image or texture.
   *
   * @returns {Lights} This light collection for chaining.
   */
  panorama(img) { this._panoramaImg = img; return this; }
  /**
   * Sets distance-attenuation coefficients for applicable lights.
   *
   * @param {number} [constantF=1] - Constant attenuation coefficient.
   * @param {number} [linear=0] - Linear attenuation coefficient.
   * @param {number} [quadratic=0] - Quadratic attenuation coefficient.
   *
   * @returns {Lights} This light collection for chaining.
   */
  lightFalloff(constantF = 1, linear = 0, quadratic = 0) { this._falloff = [constantF, linear, quadratic]; return this; }
  /**
   * Sets the global specular-light color.
   *
   * @param {number} r - Red channel.
   * @param {number} g - Green channel.
   * @param {number} b - Blue channel.
   *
   * @returns {Lights} This light collection for chaining.
   */
  specularColor(r, g, b) { this._specular = [r, g, b]; return this; }
  /**
   * Returns a shallow copy of the configured lights.
   *
   * @returns {Object[]} Light descriptors.
   */
  lights() { return this._lights.slice(); }
  /**
   * Removes all configured lights.
   *
   * @returns {Lights} This light collection for chaining.
   */
  noLights() { this._lights = []; return this; }
}

class Material {
  /**
   * Creates material state with default surface and texture settings.
   */
  constructor() {
    this.state = {
      ambient: [255, 255, 255], emissive: null, specular: null,
      shininessVal: 1, metalnessVal: 0,
      textureVal: null, textureModeVal: constants.IMAGE, textureWrapVal: [constants.CLAMP, constants.CLAMP]
    };
    this.shaders = {};
  }
  /**
   * Sets the material ambient reflectance.
   *
   * @param {number} r - Red channel.
   * @param {number} g - Green channel.
   * @param {number} [b=r] - Blue channel; defaults to the red channel.
   *
   * @returns {Material} This material for chaining.
   */
  ambientMaterial(r, g, b = r) { this.state.ambient = [r, g, b]; return this; }
  /**
   * Sets the material emissive color.
   *
   * @param {number} r - Red channel.
   * @param {number} g - Green channel.
   * @param {number} [b=r] - Blue channel; defaults to the red channel.
   *
   * @returns {Material} This material for chaining.
   */
  emissiveMaterial(r, g, b = r) { this.state.emissive = [r, g, b]; return this; }
  /**
   * Sets the material specular reflectance.
   *
   * @param {number} r - Red channel.
   * @param {number} g - Green channel.
   * @param {number} [b=r] - Blue channel; defaults to the red channel.
   *
   * @returns {Material} This material for chaining.
   */
  specularMaterial(r, g, b = r) { this.state.specular = [r, g, b]; return this; }
  /**
   * Gets or sets the material shininess.
   *
   * @param {number} [s] - New shininess value. Omit to read the current value.
   *
   * @returns {number|Material} Current value when omitted; otherwise this material.
   */
  shininess(s) { if (s === undefined) return this.state.shininessVal; this.state.shininessVal = s; return this; }
  /**
   * Gets or sets the material metalness.
   *
   * @param {number} [m] - New metalness value. Omit to read the current value.
   *
   * @returns {number|Material} Current value when omitted; otherwise this material.
   */
  metalness(m) { if (m === undefined) return this.state.metalnessVal; this.state.metalnessVal = m; return this; }
  /**
   * Enables normal-based material coloring.
   *
   * @returns {Material} This material for chaining.
   */
  normalMaterial() { this.state.normalMaterial = true; return this; }
  /**
   * Assigns a texture image to the material.
   *
   * @param {*} img - Texture image or resource.
   *
   * @returns {Material} This material for chaining.
   */
  texture(img) { this.state.textureVal = img; return this; }
  /**
   * Gets or sets the texture-coordinate mode.
   *
   * @param {*} [mode] - New texture mode. Omit to read the current mode.
   *
   * @returns {*|Material} Current mode when omitted; otherwise this material.
   */
  textureMode(mode) { if (mode === undefined) return this.state.textureModeVal; this.state.textureModeVal = mode; return this; }
  /**
   * Sets horizontal and vertical texture wrapping modes.
   *
   * @param {*} wrapX - Horizontal wrapping mode.
   * @param {*} [wrapY=wrapX] - Vertical wrapping mode.
   *
   * @returns {Material} This material for chaining.
   */
  textureWrap(wrapX, wrapY = wrapX) { this.state.textureWrapVal = [wrapX, wrapY]; return this; }

  /**
   * Creates an in-memory shader descriptor.
   *
   * @param {string} vertSrc - Vertex shader source.
   * @param {string} fragSrc - Fragment shader source.
   *
   * @returns {Object} Shader descriptor with an empty uniform map.
   */
  createShader(vertSrc, fragSrc) { const sh = { vert: vertSrc, frag: fragSrc, uniforms: {} }; return sh; }
  /**
   * Creates an in-memory filter shader descriptor.
   *
   * @param {string} fragSrc - Fragment shader source.
   *
   * @returns {Object} Filter shader descriptor.
   */
  createFilterShader(fragSrc) { return { frag: fragSrc, uniforms: {}, isFilter: true }; }
  /**
   * Synchronously loads vertex and fragment shader sources from disk.
   *
   * @param {string} vertPath - Path to the vertex shader file.
   * @param {string} fragPath - Path to the fragment shader file.
   *
   * @returns {Object} Loaded shader descriptor.
   */
  loadShader(vertPath, fragPath) {
    const fs = require('fs');
    return this.createShader(fs.readFileSync(vertPath, 'utf8'), fs.readFileSync(fragPath, 'utf8'));
  }
  /**
   * Gets or sets the active shader.
   *
   * @param {Object} [sh] - Shader to activate. Omit to get the active shader.
   *
   * @returns {Object|Material} Active shader when omitted; otherwise this material.
   */
  shader(sh) { if (sh === undefined) return this._activeShader; this._activeShader = sh; return this; }
  /**
   * Clears the active shader.
   *
   * @returns {Material} This material for chaining.
   */
  resetShader() { this._activeShader = null; return this; }
  /**
   * Sets the shader used for strokes.
   *
   * @param {Object} sh - Shader descriptor.
   *
   * @returns {Material} This material for chaining.
   */
  strokeShader(sh) { this._strokeShader = sh; return this; }
  /**
   * Sets the shader used for images.
   *
   * @param {Object} sh - Shader descriptor.
   *
   * @returns {Material} This material for chaining.
   */
  imageShader(sh) { this._imageShader = sh; return this; }
}

class Shaders {
  /**
   * Sets a uniform value on a shader descriptor.
   *
   * @param {Object} shader - Shader descriptor containing a uniform map.
   * @param {string} name - Uniform name.
   * @param {*} value - Uniform value.
   *
   * @returns {Object} The updated shader descriptor.
   */
  setUniform(shader, name, value) { shader.uniforms[name] = value; return shader; }
  /**
   * Creates a shallowly modified copy of a shader descriptor.
   *
   * @param {Object} shader - Base shader descriptor.
   * @param {Object} [modifications={}] - Properties to override or append.
   *
   * @returns {Object} Modified shader descriptor.
   */
  modify(shader, modifications = {}) { return { ...shader, ...modifications }; }
  /**
   * Returns the shader API version.
   *
   * @returns {string} Semantic version string.
   */
  version() { return '1.0.0'; }
  /**
   * Copies shader state to a rendering context when supported.
   *
   * @returns {null} Always `null` in this headless Node implementation.
   */
  copyToContext() { return null; } // no GL context in headless Node
  /**
   * Lists the uniform names exposed by a shader.
   *
   * @param {Object} shader - Shader descriptor to inspect.
   *
   * @returns {string[]} Uniform names.
   */
  inspectHooks(shader) { return Object.keys(shader.uniforms || {}); }
}

/** Strands: node-graph style shader-building helpers, tracked as plain data. */
class Strands {
  /**
   * Creates an empty node graph and named storage registry.
   */
  constructor() { this._nodes = []; this._storage = new Map(); }
  /**
   * Adds a compute node to the graph.
   *
   * @param {Function} fn - Function represented by the compute node.
   *
   * @returns {Object} Newly created node descriptor.
   */
  compute(fn) { const node = { type: 'compute', fn }; this._nodes.push(node); return node; }
  /**
   * Linearly interpolates between two numeric arrays.
   *
   * @param {number[]} a - Starting values.
   * @param {number[]} b - Ending values.
   * @param {number} t - Interpolation factor.
   *
   * @returns {number[]} Interpolated values.
   */
  mix(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }
  /**
   * Evaluates Hermite smoothstep interpolation.
   *
   * @param {number} edge0 - Lower edge.
   * @param {number} edge1 - Upper edge.
   * @param {number} x - Input value.
   *
   * @returns {number} Smoothed value clamped to the range 0 through 1.
   */
  smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }
  /**
   * Creates and registers a floating-point storage buffer.
   *
   * @param {string} name - Unique storage name.
   * @param {number} size - Number of float elements.
   *
   * @returns {Float32Array} Created storage buffer.
   */
  createStorage(name, size) { const buf = new Float32Array(size); this._storage.set(name, buf); return buf; }
  /**
   * Retrieves a named storage buffer.
   *
   * @param {string} name - Storage name.
   *
   * @returns {Float32Array|undefined} Registered buffer, if present.
   */
  uniformStorage(name) { return this._storage.get(name); }
  /**
   * Returns the supplied instance identifier.
   *
   * @param {number} i - Instance identifier.
   *
   * @returns {number} Unmodified identifier.
   */
  instanceID(i) { return i; }
  /**
   * Returns the next graph-node index.
   *
   * @returns {number} Requested value or helper.
   */
  get instanceIndex() { return this._nodes.length; }
  /**
   * Returns the current graph-node index.
   *
   * @returns {number} Requested value or helper.
   */
  get index() { return this._nodes.length; }
  /**
   * Returns a function that adds color components.
   *
   * @returns {Function} Requested value or helper.
   */
  get combineColors() { return (a, b) => a.map((v, i) => v + b[i]); }
  /**
   * Returns an identity color-filter function.
   *
   * @returns {Function} Requested value or helper.
   */
  get filterColor() { return c => c; }
  /**
   * Returns an identity final-color function.
   *
   * @returns {Function} Requested value or helper.
   */
  get finalColor() { return c => c; }
  /**
   * Returns the base camera-input descriptor.
   *
   * @returns {Object} Requested value or helper.
   */
  get cameraInputs() { return {}; }
  /**
   * Returns an empty object-input descriptor.
   *
   * @returns {Object} Descriptor placeholder.
   */
  objectInputs() { return {}; }
  /**
   * Returns an empty pixel-input descriptor.
   *
   * @returns {Object} Descriptor placeholder.
   */
  pixelInputs() { return {}; }
  /**
   * Returns an empty world-input descriptor.
   *
   * @returns {Object} Descriptor placeholder.
   */
  worldInputs() { return {}; }
  /**
   * Returns an empty base color-shader descriptor.
   *
   * @returns {Object} Descriptor placeholder.
   */
  baseColorShader() { return {}; }
  /**
   * Returns an empty base compute-shader descriptor.
   *
   * @returns {Object} Descriptor placeholder.
   */
  baseComputeShader() { return {}; }
  /**
   * Returns an empty base filter-shader descriptor.
   *
   * @returns {Object} Descriptor placeholder.
   */
  baseFilterShader() { return {}; }
  /**
   * Returns an empty base material-shader descriptor.
   *
   * @returns {Object} Descriptor placeholder.
   */
  baseMaterialShader() { return {}; }
  /**
   * Returns an empty base normal-shader descriptor.
   *
   * @returns {Object} Descriptor placeholder.
   */
  baseNormalShader() { return {}; }
  /**
   * Returns an empty base stroke-shader descriptor.
   *
   * @returns {Object} Descriptor placeholder.
   */
  baseStrokeShader() { return {}; }
  /**
   * Builds a shader node from a compute function.
   *
   * @param {Function} fn - Shader-building function.
   *
   * @returns {Object} Created compute-node descriptor.
   */
  buildColorShader(fn) { return this.compute(fn); }
  /**
   * Builds a shader node from a compute function.
   *
   * @param {Function} fn - Shader-building function.
   *
   * @returns {Object} Created compute-node descriptor.
   */
  buildComputeShader(fn) { return this.compute(fn); }
  /**
   * Builds a shader node from a compute function.
   *
   * @param {Function} fn - Shader-building function.
   *
   * @returns {Object} Created compute-node descriptor.
   */
  buildFilterShader(fn) { return this.compute(fn); }
  /**
   * Builds a shader node from a compute function.
   *
   * @param {Function} fn - Shader-building function.
   *
   * @returns {Object} Created compute-node descriptor.
   */
  buildMaterialShader(fn) { return this.compute(fn); }
  /**
   * Builds a shader node from a compute function.
   *
   * @param {Function} fn - Shader-building function.
   *
   * @returns {Object} Created compute-node descriptor.
   */
  buildNormalShader(fn) { return this.compute(fn); }
  /**
   * Builds a shader node from a compute function.
   *
   * @param {Function} fn - Shader-building function.
   *
   * @returns {Object} Created compute-node descriptor.
   */
  buildStrokeShader(fn) { return this.compute(fn); }
  /**
   * Synchronously loads color-shader source from disk.
   *
   * @param {string} p - Shader file path.
   *
   * @returns {string} Shader source text.
   */
  loadColorShader(p) { return require('fs').readFileSync(p, 'utf8'); }
  /**
   * Synchronously loads filter-shader source from disk.
   *
   * @param {string} p - Shader file path.
   *
   * @returns {string} Shader source text.
   */
  loadFilterShader(p) { return this.loadColorShader(p); }
  /**
   * Synchronously loads material-shader source from disk.
   *
   * @param {string} p - Shader file path.
   *
   * @returns {string} Shader source text.
   */
  loadMaterialShader(p) { return this.loadColorShader(p); }
  /**
   * Synchronously loads normal-shader source from disk.
   *
   * @param {string} p - Shader file path.
   *
   * @returns {string} Shader source text.
   */
  loadNormalShader(p) { return this.loadColorShader(p); }
  /**
   * Synchronously loads stroke-shader source from disk.
   *
   * @param {string} p - Shader file path.
   *
   * @returns {string} Shader source text.
   */
  loadStrokeShader(p) { return this.loadColorShader(p); }
}

class StorageBuffer {
  /**
   * Creates a floating-point storage buffer.
   *
   * @param {number} [size=0] - Number of float elements to allocate.
   */
  constructor(size = 0) { this.buffer = new Float32Array(size); }
  /**
   * Copies values into the storage buffer starting at index zero.
   *
   * @param {ArrayLike<number>} data - Values to copy.
   *
   * @returns {StorageBuffer} This buffer for chaining.
   */
  set(data) { this.buffer.set(data); return this; }
  /**
   * Updates every element using a callback.
   *
   * @param {Function} fn - Callback receiving `(value, index)` and returning the replacement value.
   *
   * @returns {StorageBuffer} This buffer for chaining.
   */
  update(fn) { for (let i = 0; i < this.buffer.length; i++) this.buffer[i] = fn(this.buffer[i], i); return this; }
  /**
   * Returns a copy of the buffer contents.
   *
   * @returns {Float32Array} Independent copy of the stored values.
   */
  read() { return this.buffer.slice(); }
}

module.exports = { Camera, Interaction, Lights, Material, Strands, Shaders, StorageBuffer };
