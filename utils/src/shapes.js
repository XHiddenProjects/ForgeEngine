'use strict';

const fs = require('fs');
const constants = require('./constants.js');

// ---------------------------------------------------------------------------
// Geometry: a real mesh container (vertices/faces/uvs/normals) with actual
// computation — no rasterizer required, since these are pure data shapes
// meant to be handed to any renderer.
// ---------------------------------------------------------------------------
class Geometry {
  /**
   * Creates a new Geometry instance.
   */
  constructor() {
    this.vertexData = [];   // array of [x,y,z]
    this.faceData = [];     // array of [i0,i1,i2]
    this.uvData = [];       // array of [u,v]
    this.normalData = [];   // array of [x,y,z] per vertex
  }
  /**
   * Gets or replaces the vertex collection.
   *
   * @param {number} v - V value.
   *
   * @returns {Geometry} This instance for chaining.
   */
  vertices(v) { if (v === undefined) return this.vertexData; this.vertexData = v; return this; }
  /**
   * Gets or replaces the face-index collection.
   *
   * @param {*} f - F value.
   *
   * @returns {Geometry} This instance for chaining.
   */
  faces(f) { if (f === undefined) return this.faceData; this.faceData = f; return this; }
  /**
   * Gets or replaces texture coordinates.
   *
   * @param {number} u - U value.
   *
   * @returns {Geometry} This instance for chaining.
   */
  uvs(u) { if (u === undefined) return this.uvData; this.uvData = u; return this; }
  /**
   * Gets or replaces per-vertex normals.
   *
   * @param {number} n - N value.
   *
   * @returns {Geometry} This instance for chaining.
   */
  vertexNormals(n) { if (n === undefined) return this.normalData; this.normalData = n; return this; }
  /**
   * Provides a chainable vertex-property compatibility hook.
   *
   * @returns {Geometry} This instance for chaining.
   */
  vertexProperty() { return this; }
  /**
   * Returns a stable identifier derived from geometry size.
   *
   * @returns {Geometry} This instance for chaining.
   */
  gid() { return this._gid || (this._gid = `geo_${this.vertexData.length}_${this.faceData.length}`); }

  /**
   * Triangulates the vertex collection when no faces are defined.
   *
   * @returns {Geometry} This instance for chaining.
   */
  computeFaces() {
    // fan-triangulate consecutive vertex groups of 4 if faces weren't set
    if (!this.faceData.length && this.vertexData.length >= 3) {
      for (let i = 1; i < this.vertexData.length - 1; i++) this.faceData.push([0, i, i + 1]);
    }
    return this;
  }
  /**
   * Computes normalized per-vertex normals from the mesh faces.
   *
   * @returns {Geometry} This instance for chaining.
   */
  computeNormals() {
    const normals = this.vertexData.map(() => [0, 0, 0]);
    for (const [i0, i1, i2] of this.faceData) {
      const [ax, ay, az] = this.vertexData[i0];
      const [bx, by, bz] = this.vertexData[i1];
      const [cx, cy, cz] = this.vertexData[i2];
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const idx of [i0, i1, i2]) { normals[idx][0] += nx; normals[idx][1] += ny; normals[idx][2] += nz; }
    }
    this.normalData = normals.map(([x, y, z]) => {
      const m = Math.hypot(x, y, z) || 1;
      return [x / m, y / m, z / m];
    });
    return this;
  }
  /**
   * Calculates the axis-aligned bounding box.
   *
   * @returns {{min:number[],max:number[]}} The resulting value.
   */
  calculateBoundingBox() {
    const xs = this.vertexData.map(v => v[0]);
    const ys = this.vertexData.map(v => v[1]);
    const zs = this.vertexData.map(v => v[2]);
    return {
      min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)],
      max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)]
    };
  }
  /**
   * Centers and uniformly scales the geometry to a two-unit bounding extent.
   *
   * @returns {Geometry} This instance for chaining.
   */
  normalize() {
    const bb = this.calculateBoundingBox();
    const center = bb.min.map((m, i) => (m + bb.max[i]) / 2);
    const size = Math.max(...bb.max.map((m, i) => m - bb.min[i])) || 1;
    this.vertexData = this.vertexData.map(([x, y, z]) => [
      (x - center[0]) / size * 2, (y - center[1]) / size * 2, (z - center[2]) / size * 2
    ]);
    return this;
  }
  /**
   * Mirrors texture coordinates along the U axis.
   *
   * @returns {Geometry} This instance for chaining.
   */
  flipU() { this.uvData = this.uvData.map(([u, v]) => [1 - u, v]); return this; }
  /**
   * Mirrors texture coordinates along the V axis.
   *
   * @returns {Geometry} This instance for chaining.
   */
  flipV() { this.uvData = this.uvData.map(([u, v]) => [u, 1 - v]); return this; }
  /**
   * Removes all vertex-color data.
   *
   * @returns {Geometry} This instance for chaining.
   */
  clearColors() { this.colorData = []; return this; }
  /**
   * Builds the unique edge list from mesh faces.
   *
   * @returns {number[][]} The resulting value.
   */
  makeEdgesFromFaces() {
    const seen = new Set();
    const edges = [];
    for (const face of this.faceData) {
      for (let i = 0; i < face.length; i++) {
        const a = face[i], b = face[(i + 1) % face.length];
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        if (!seen.has(key)) { seen.add(key); edges.push([a, b]); }
      }
    }
    this.edgeData = edges;
    return edges;
  }
}

// ---------------------------------------------------------------------------
// Shapes: 2D outline math + 3D primitive mesh generation
// ---------------------------------------------------------------------------
class Shapes {
  /**
   * Creates a new Shapes instance.
   */
  constructor() {
    this._curveDetailVal = 20;
    this._strokeModeVal = constants.ROUND;
  }

  // -- 2D (returns geometric descriptors rather than drawing to a canvas) --
  /**
   * Creates a point descriptor.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   *
   * @returns {Object} The resulting value.
   */
  point(x, y) { return { type: 'point', x, y }; }
  /**
   * Creates a line descriptor.
   *
   * @param {number} x1 - X1 value.
   * @param {number} y1 - Y1 value.
   * @param {number} x2 - X2 value.
   * @param {number} y2 - Y2 value.
   *
   * @returns {Object} The resulting value.
   */
  line(x1, y1, x2, y2) { return { type: 'line', x1, y1, x2, y2 }; }
  /**
   * Creates a rectangle descriptor.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} w - W value.
   * @param {number} h - H value.
   * @param {*} ...radii - Radii value.
   *
   * @returns {Object} The resulting value.
   */
  rect(x, y, w, h, ...radii) { return { type: 'rect', x, y, w, h, radii }; }
  /**
   * Creates a square descriptor.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} s - S value.
   *
   * @returns {Object} The resulting value.
   */
  square(x, y, s) { return this.rect(x, y, s, s); }
  /**
   * Creates a sampled ellipse descriptor.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} w - W value.
   * @param {number} [h=w] - H value.
   *
   * @returns {Object} The resulting value.
   */
  ellipse(x, y, w, h = w) {
    const points = [];
    const detail = 40;
    for (let i = 0; i < detail; i++) {
      const a = (i / detail) * Math.PI * 2;
      points.push([x + Math.cos(a) * w / 2, y + Math.sin(a) * h / 2]);
    }
    return { type: 'ellipse', x, y, w, h, points };
  }
  /**
   * Creates a sampled circle descriptor.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} d - D value.
   *
   * @returns {Object} The resulting value.
   */
  circle(x, y, d) { return this.ellipse(x, y, d, d); }
  /**
   * Creates a sampled elliptical arc descriptor.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} w - W value.
   * @param {number} h - H value.
   * @param {number} start - Start value.
   * @param {number} stop - Stop value.
   * @param {string} [mode=constants.OPEN] - Mode value.
   *
   * @returns {Object} The resulting value.
   */
  arc(x, y, w, h, start, stop, mode = constants.OPEN) {
    const points = [];
    const detail = 30;
    for (let i = 0; i <= detail; i++) {
      const a = start + ((stop - start) * i) / detail;
      points.push([x + Math.cos(a) * w / 2, y + Math.sin(a) * h / 2]);
    }
    return { type: 'arc', x, y, w, h, start, stop, mode, points };
  }
  /**
   * Creates a triangle descriptor.
   *
   * @param {number} x1 - X1 value.
   * @param {number} y1 - Y1 value.
   * @param {number} x2 - X2 value.
   * @param {number} y2 - Y2 value.
   * @param {number} x3 - X3 value.
   * @param {number} y3 - Y3 value.
   *
   * @returns {Object} The resulting value.
   */
  triangle(x1, y1, x2, y2, x3, y3) { return { type: 'triangle', points: [[x1, y1], [x2, y2], [x3, y3]] }; }
  /**
   * Creates a quadrilateral descriptor.
   *
   * @param {number} x1 - X1 value.
   * @param {number} y1 - Y1 value.
   * @param {number} x2 - X2 value.
   * @param {number} y2 - Y2 value.
   * @param {number} x3 - X3 value.
   * @param {number} y3 - Y3 value.
   * @param {number} x4 - X4 value.
   * @param {number} y4 - Y4 value.
   *
   * @returns {Object} The resulting value.
   */
  quad(x1, y1, x2, y2, x3, y3, x4, y4) { return { type: 'quad', points: [[x1, y1], [x2, y2], [x3, y3], [x4, y4]] }; }

  // -- 3D primitive mesh generation (real vertex math) --
  /**
   * Generates a box mesh.
   *
   * @param {number} [w=50] - W value.
   * @param {number} [h=w] - H value.
   * @param {number} [d=w] - D value.
   *
   * @returns {Geometry} The resulting value.
   */
  box(w = 50, h = w, d = w) {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const g = new Geometry();
    g.vertexData = [
      [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd],       // front
      [-hw, -hh, -hd], [-hw, hh, -hd], [hw, hh, -hd], [hw, -hh, -hd]    // back
    ];
    g.faceData = [
      [0, 1, 2], [0, 2, 3],       // front
      [4, 5, 6], [4, 6, 7],       // back
      [3, 2, 6], [3, 6, 5],       // top
      [4, 7, 1], [4, 1, 0],       // bottom
      [1, 7, 6], [1, 6, 2],       // right
      [4, 0, 3], [4, 3, 5]        // left
    ];
    g.computeNormals();
    return g;
  }
  /**
   * Generates a UV sphere mesh.
   *
   * @param {number} [radius=50] - Radius value.
   * @param {number} [detailX=24] - Detailx value.
   * @param {number} [detailY=16] - Detaily value.
   *
   * @returns {Geometry} The resulting value.
   */
  sphere(radius = 50, detailX = 24, detailY = 16) {
    const g = new Geometry();
    for (let y = 0; y <= detailY; y++) {
      const v = y / detailY;
      const phi = v * Math.PI;
      for (let x = 0; x <= detailX; x++) {
        const u = x / detailX;
        const theta = u * Math.PI * 2;
        g.vertexData.push([
          radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.cos(phi),
          radius * Math.sin(phi) * Math.sin(theta)
        ]);
        g.uvData.push([u, v]);
      }
    }
    for (let y = 0; y < detailY; y++) {
      for (let x = 0; x < detailX; x++) {
        const i0 = y * (detailX + 1) + x;
        const i1 = i0 + detailX + 1;
        g.faceData.push([i0, i1, i0 + 1], [i1, i1 + 1, i0 + 1]);
      }
    }
    g.computeNormals();
    return g;
  }
  /**
   * Generates a cylinder mesh.
   *
   * @param {number} [radius=50] - Radius value.
   * @param {number} [height=100] - Height value.
   * @param {number} [detail=24] - Detail value.
   * @param {*} [capped=true] - Capped value.
   *
   * @returns {Geometry} The resulting value.
   */
  cylinder(radius = 50, height = 100, detail = 24, capped = true) {
    const g = new Geometry();
    const half = height / 2;
    for (let y = 0; y <= 1; y++) {
      for (let i = 0; i <= detail; i++) {
        const theta = (i / detail) * Math.PI * 2;
        g.vertexData.push([radius * Math.cos(theta), y ? half : -half, radius * Math.sin(theta)]);
      }
    }
    for (let i = 0; i < detail; i++) {
      const i0 = i, i1 = i + 1, i2 = detail + 1 + i, i3 = detail + 2 + i;
      g.faceData.push([i0, i2, i1], [i1, i2, i3]);
    }
    if (capped) {
      const topCenter = g.vertexData.push([0, half, 0]) - 1;
      const bottomCenter = g.vertexData.push([0, -half, 0]) - 1;
      for (let i = 0; i < detail; i++) {
        g.faceData.push([topCenter, detail + 1 + i, detail + 2 + i]);
        g.faceData.push([bottomCenter, i + 1, i]);
      }
    }
    g.computeNormals();
    return g;
  }
  /**
   * Generates a cone mesh.
   *
   * @param {number} [radius=50] - Radius value.
   * @param {number} [height=100] - Height value.
   * @param {number} [detail=24] - Detail value.
   * @param {*} [capped=true] - Capped value.
   *
   * @returns {Geometry} The resulting value.
   */
  cone(radius = 50, height = 100, detail = 24, capped = true) {
    const g = new Geometry();
    const half = height / 2;
    const apex = g.vertexData.push([0, half, 0]) - 1;
    for (let i = 0; i <= detail; i++) {
      const theta = (i / detail) * Math.PI * 2;
      g.vertexData.push([radius * Math.cos(theta), -half, radius * Math.sin(theta)]);
    }
    for (let i = 0; i < detail; i++) g.faceData.push([apex, 1 + i, 2 + i]);
    if (capped) {
      const base = g.vertexData.push([0, -half, 0]) - 1;
      for (let i = 0; i < detail; i++) g.faceData.push([base, 2 + i, 1 + i]);
    }
    g.computeNormals();
    return g;
  }
  /**
   * Generates a torus mesh.
   *
   * @param {number} [radius=50] - Radius value.
   * @param {number} [tubeRadius=20] - Tuberadius value.
   * @param {number} [detailX=24] - Detailx value.
   * @param {number} [detailY=16] - Detaily value.
   *
   * @returns {Geometry} The resulting value.
   */
  torus(radius = 50, tubeRadius = 20, detailX = 24, detailY = 16) {
    const g = new Geometry();
    for (let i = 0; i <= detailX; i++) {
      const u = (i / detailX) * Math.PI * 2;
      for (let j = 0; j <= detailY; j++) {
        const v = (j / detailY) * Math.PI * 2;
        g.vertexData.push([
          (radius + tubeRadius * Math.cos(v)) * Math.cos(u),
          tubeRadius * Math.sin(v),
          (radius + tubeRadius * Math.cos(v)) * Math.sin(u)
        ]);
        g.uvData.push([i / detailX, j / detailY]);
      }
    }
    for (let i = 0; i < detailX; i++) {
      for (let j = 0; j < detailY; j++) {
        const a = i * (detailY + 1) + j;
        const b = a + detailY + 1;
        g.faceData.push([a, b, a + 1], [b, b + 1, a + 1]);
      }
    }
    g.computeNormals();
    return g;
  }
  /**
   * Generates an ellipsoid mesh.
   *
   * @param {number} [rx=50] - Rx value.
   * @param {number} [ry=50] - Ry value.
   * @param {number} [rz=50] - Rz value.
   * @param {number} [detailX=24] - Detailx value.
   * @param {number} [detailY=16] - Detaily value.
   *
   * @returns {Geometry} The resulting value.
   */
  ellipsoid(rx = 50, ry = 50, rz = 50, detailX = 24, detailY = 16) {
    const g = this.sphere(1, detailX, detailY);
    g.vertexData = g.vertexData.map(([x, y, z]) => [x * rx, y * ry, z * rz]);
    g.computeNormals();
    return g;
  }
  /**
   * Generates a subdivided plane mesh.
   *
   * @param {number} [w=50] - W value.
   * @param {number} [h=50] - H value.
   * @param {number} [detailX=1] - Detailx value.
   * @param {number} [detailY=1] - Detaily value.
   *
   * @returns {Geometry} The resulting value.
   */
  plane(w = 50, h = 50, detailX = 1, detailY = 1) {
    const g = new Geometry();
    for (let y = 0; y <= detailY; y++) {
      for (let x = 0; x <= detailX; x++) {
        g.vertexData.push([(x / detailX - 0.5) * w, (y / detailY - 0.5) * h, 0]);
        g.uvData.push([x / detailX, y / detailY]);
      }
    }
    for (let y = 0; y < detailY; y++) {
      for (let x = 0; x < detailX; x++) {
        const i0 = y * (detailX + 1) + x;
        const i1 = i0 + detailX + 1;
        g.faceData.push([i0, i1, i0 + 1], [i1, i1 + 1, i0 + 1]);
      }
    }
    g.computeNormals();
    return g;
  }

  /**
   * Creates geometry and passes it to a builder callback.
   *
   * @param {Function} callback - Callback value.
   *
   * @returns {Geometry} The resulting value.
   */
  buildGeometry(callback) {
    const g = new Geometry();
    if (typeof callback === 'function') callback(g);
    return g;
  }
  /**
   * Clears a geometry’s vertex and face data.
   *
   * @param {Geometry} g - G value.
   *
   * @returns {Geometry} The resulting value.
   */
  freeGeometry(g) { g.vertexData = []; g.faceData = []; return g; }

  /**
   * Gets or sets curve subdivision detail.
   *
   * @param {number} n - N value.
   *
   * @returns {Shapes} This instance for chaining.
   */
  curveDetail(n) { if (n === undefined) return this._curveDetailVal; this._curveDetailVal = n; return this; }
  /**
   * Gets or sets the stroke rendering mode.
   *
   * @param {string} mode - Mode value.
   *
   * @returns {Shapes} This instance for chaining.
   */
  strokeMode(mode) { if (mode === undefined) return this._strokeModeVal; this._strokeModeVal = mode; return this; }

  /**
   * Writes geometry in Wavefront OBJ format.
   *
   * @param {Geometry} geometry - Geometry value.
   * @param {string} filePath - Filepath value.
   *
   * @returns {string} The resulting value.
   */
  saveObj(geometry, filePath) {
    const lines = [];
    for (const [x, y, z] of geometry.vertexData) lines.push(`v ${x} ${y} ${z}`);
    for (const [u, v] of geometry.uvData) lines.push(`vt ${u} ${v}`);
    for (const face of geometry.faceData) lines.push('f ' + face.map(i => i + 1).join(' '));
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    return filePath;
  }
  /**
   * Writes geometry in ASCII STL format.
   *
   * @param {Geometry} geometry - Geometry value.
   * @param {string} filePath - Filepath value.
   *
   * @returns {string} The resulting value.
   */
  saveStl(geometry, filePath) {
    const lines = ['solid mesh'];
    for (const [i0, i1, i2] of geometry.faceData) {
      const [a, b, c] = [geometry.vertexData[i0], geometry.vertexData[i1], geometry.vertexData[i2]];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const m = Math.hypot(nx, ny, nz) || 1;
      lines.push(`facet normal ${nx / m} ${ny / m} ${nz / m}`);
      lines.push('  outer loop');
      for (const v of [a, b, c]) lines.push(`    vertex ${v[0]} ${v[1]} ${v[2]}`);
      lines.push('  endloop', 'endfacet');
    }
    lines.push('endsolid mesh');
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    return filePath;
  }
}

// ---------------------------------------------------------------------------
// Models: OBJ loading (small hand-written parser, no dependency)
// ---------------------------------------------------------------------------
class Models {
  /**
   * Loads geometry from a Wavefront OBJ file.
   *
   * @param {string} filePath - Filepath value.
   *
   * @returns {Geometry} The resulting value.
   */
  load(filePath) {
    const text = fs.readFileSync(filePath, 'utf8');
    const g = new Geometry();
    for (const line of text.split(/\r\n|\r|\n/)) {
      const parts = line.trim().split(/\s+/);
      if (parts[0] === 'v') g.vertexData.push(parts.slice(1, 4).map(Number));
      else if (parts[0] === 'vt') g.uvData.push(parts.slice(1, 3).map(Number));
      else if (parts[0] === 'vn') g.normalData.push(parts.slice(1, 4).map(Number));
      else if (parts[0] === 'f') {
        g.faceData.push(parts.slice(1).map(p => parseInt(p.split('/')[0], 10) - 1));
      }
    }
    return g;
  }
  /**
   * Creates empty geometry.
   *
   * @returns {Geometry} The resulting value.
   */
  create() { return new Geometry(); }
  /**
   * Returns geometry unchanged for headless rendering.
   *
   * @param {Geometry} geometry - Geometry value.
   *
   * @returns {Geometry} The resulting value.
   */
  model(geometry) { return geometry; } // headless: no canvas to draw into
}

// ---------------------------------------------------------------------------
// Attribute: draw-style state (mirrors p5's setter API, no canvas needed)
// ---------------------------------------------------------------------------
class Attribute {
  /**
   * Creates a new Attribute instance.
   */
  constructor() {
    this._ellipseMode = constants.CENTER;
    this._rectMode = constants.CORNER;
    this._smoothVal = true;
    this._strokeCapVal = constants.ROUND;
    this._strokeJoinVal = constants.MITER;
    this._strokeWeightVal = 1;
  }
  /**
   * Gets or sets ellipse coordinate interpretation.
   *
   * @param {string} mode - Mode value.
   *
   * @returns {Attribute} This instance for chaining.
   */
  ellipseMode(mode) { if (mode === undefined) return this._ellipseMode; this._ellipseMode = mode; return this; }
  /**
   * Gets or sets rectangle coordinate interpretation.
   *
   * @param {string} mode - Mode value.
   *
   * @returns {Attribute} This instance for chaining.
   */
  rectMode(mode) { if (mode === undefined) return this._rectMode; this._rectMode = mode; return this; }
  /**
   * Gets or sets amplitude smoothing.
   *
   * @returns {Attribute} This instance for chaining.
   */
  smooth() { this._smoothVal = true; return this; }
  /**
   * Disables smoothing.
   *
   * @returns {Attribute} This instance for chaining.
   */
  noSmooth() { this._smoothVal = false; return this; }
  /**
   * Delegates to `strokeCap()` while preserving the legacy misspelling.
   *
   * @param {*} cap - Cap value.
   *
   * @returns {Attribute} This instance for chaining.
   */
  stokeCap(cap) { return this.strokeCap(cap); } // preserves the (typo'd) original method name
  /**
   * Gets or sets the stroke cap style.
   *
   * @param {*} cap - Cap value.
   *
   * @returns {Attribute} This instance for chaining.
   */
  strokeCap(cap) { if (cap === undefined) return this._strokeCapVal; this._strokeCapVal = cap; return this; }
  /**
   * Gets or sets the stroke join style.
   *
   * @param {*} join - Join value.
   *
   * @returns {Attribute} This instance for chaining.
   */
  strokeJoin(join) { if (join === undefined) return this._strokeJoinVal; this._strokeJoinVal = join; return this; }
  /**
   * Gets or sets stroke width.
   *
   * @param {number} w - W value.
   *
   * @returns {Attribute} This instance for chaining.
   */
  strokeWeight(w) { if (w === undefined) return this._strokeWeightVal; this._strokeWeightVal = w; return this; }
}

// ---------------------------------------------------------------------------
// Curves: real cubic Bezier + Catmull-Rom spline math
// ---------------------------------------------------------------------------
class Curves {
  /**
   * Evaluates a cubic Bézier curve at a parameter value.
   *
   * @param {number} a - A value.
   * @param {number} b - B value.
   * @param {number} c - C value.
   * @param {number} d - D value.
   * @param {number} t - T value.
   *
   * @returns {number} The resulting value.
   */
  bezierPoint(a, b, c, d, t) {
    const t1 = 1 - t;
    return t1 ** 3 * a + 3 * t1 ** 2 * t * b + 3 * t1 * t ** 2 * c + t ** 3 * d;
  }
  /**
   * Evaluates the tangent of a cubic Bézier curve.
   *
   * @param {number} a - A value.
   * @param {number} b - B value.
   * @param {number} c - C value.
   * @param {number} d - D value.
   * @param {number} t - T value.
   *
   * @returns {number} The resulting value.
   */
  bezierTangent(a, b, c, d, t) {
    const t1 = 1 - t;
    return 3 * t1 ** 2 * (b - a) + 6 * t1 * t * (c - b) + 3 * t ** 2 * (d - c);
  }
  /**
   * Samples a two-dimensional cubic Bézier curve.
   *
   * @param {number} x1 - X1 value.
   * @param {number} y1 - Y1 value.
   * @param {number} x2 - X2 value.
   * @param {number} y2 - Y2 value.
   * @param {number} x3 - X3 value.
   * @param {number} y3 - Y3 value.
   * @param {number} x4 - X4 value.
   * @param {number} y4 - Y4 value.
   * @param {number} [detail=20] - Detail value.
   *
   * @returns {Object} The resulting value.
   */
  bezier(x1, y1, x2, y2, x3, y3, x4, y4, detail = 20) {
    const points = [];
    for (let i = 0; i <= detail; i++) {
      const t = i / detail;
      points.push([this.bezierPoint(x1, x2, x3, x4, t), this.bezierPoint(y1, y2, y3, y4, t)]);
    }
    return { type: 'bezier', points };
  }
  /**
   * Evaluates a Catmull–Rom spline segment.
   *
   * @param {number} p0 - P0 value.
   * @param {number} p1 - P1 value.
   * @param {number} p2 - P2 value.
   * @param {number} p3 - P3 value.
   * @param {number} t - T value.
   *
   * @returns {number} The resulting value.
   */
  splinePoint(p0, p1, p2, p3, t) {
    // Catmull-Rom
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (
      2 * p1 + (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
  }
  /**
   * Evaluates a Catmull–Rom spline tangent.
   *
   * @param {number} p0 - P0 value.
   * @param {number} p1 - P1 value.
   * @param {number} p2 - P2 value.
   * @param {number} p3 - P3 value.
   * @param {number} t - T value.
   *
   * @returns {number} The resulting value.
   */
  splineTangent(p0, p1, p2, p3, t) {
    const t2 = t * t;
    return 0.5 * (
      (-p0 + p2) + 2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t +
      3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t2
    );
  }
  /**
   * Samples a Catmull–Rom spline through control points.
   *
   * @param {Array} points - Points value.
   * @param {number} [detail=20] - Detail value.
   *
   * @returns {Object} The resulting value.
   */
  spline(points, detail = 20) {
    const out = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];
      for (let j = 0; j <= detail; j++) {
        const t = j / detail;
        out.push([this.splinePoint(p0[0], p1[0], p2[0], p3[0], t), this.splinePoint(p0[1], p1[1], p2[1], p3[1], t)]);
      }
    }
    return { type: 'spline', points: out };
  }
}

// ---------------------------------------------------------------------------
// CustomShapes: beginShape/vertex/endShape path building
// ---------------------------------------------------------------------------
class CustomShapes {
  /**
   * Creates a new CustomShapes instance.
   */
  constructor() {
    this._path = null;
    this._contour = null;
    this._curves = new Curves();
  }
  /**
   * Begins recording a custom shape.
   *
   * @param {string} [mode=constants.TESS] - Mode value.
   *
   * @returns {Object} The resulting value.
   */
  beginShape(mode = constants.TESS) {
    this._path = { mode, vertices: [], contours: [] };
    return this._path;
  }
  /**
   * Appends a vertex to the active shape or contour.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} [z=0] - Z value.
   * @param {number} u - U value.
   * @param {number} v - V value.
   *
   * @throws {Error} If called before `beginShape()`.
   *
   * @returns {CustomShapes} This instance for chaining.
   */
  vertex(x, y, z = 0, u, v) {
    if (!this._path) throw new Error('vertex() called before beginShape()');
    const target = this._contour || this._path.vertices;
    target.push({ x, y, z, u, v });
    return this;
  }
  /**
   * Appends sampled cubic Bézier vertices to the active path.
   *
   * @param {number} cx1 - Cx1 value.
   * @param {number} cy1 - Cy1 value.
   * @param {number} cx2 - Cx2 value.
   * @param {number} cy2 - Cy2 value.
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} [detail=10] - Detail value.
   *
   * @returns {CustomShapes} This instance for chaining.
   */
  bezierVertex(cx1, cy1, cx2, cy2, x, y, detail = 10) {
    const target = this._contour || this._path.vertices;
    const last = target[target.length - 1] || { x: 0, y: 0 };
    for (let i = 1; i <= detail; i++) {
      const t = i / detail;
      target.push({
        x: this._curves.bezierPoint(last.x, cx1, cx2, x, t),
        y: this._curves.bezierPoint(last.y, cy1, cy2, y, t)
      });
    }
    return this;
  }
  /**
   * Appends a spline vertex to the active path.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   *
   * @returns {CustomShapes} This instance for chaining.
   */
  splineVertex(x, y) { return this.vertex(x, y); }
  /**
   * Provides a chainable Bézier-order compatibility hook.
   *
   * @returns {CustomShapes} This instance for chaining.
   */
  bezierOrder() { return this; }
  /**
   * Sets one custom property on the active shape.
   *
   * @param {string} name - Name value.
   * @param {*} value - Value value.
   *
   * @returns {CustomShapes} This instance for chaining.
   */
  splineProperty(name, value) {
    this._path.properties = this._path.properties || {};
    this._path.properties[name] = value;
    return this;
  }
  /**
   * Merges custom properties into the active shape.
   *
   * @param {Object} obj - Obj value.
   *
   * @returns {CustomShapes} This instance for chaining.
   */
  splineProperties(obj) {
    this._path.properties = { ...(this._path.properties || {}), ...obj };
    return this;
  }
  /**
   * Assigns a normal to the most recently added vertex.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} z - Z value.
   *
   * @returns {CustomShapes} This instance for chaining.
   */
  normal(x, y, z) {
    const target = this._contour || this._path.vertices;
    const last = target[target.length - 1];
    if (last) last.normal = [x, y, z];
    return this;
  }
  /**
   * Provides a chainable vertex-property compatibility hook.
   *
   * @param {string} name - Name value.
   * @param {*} value - Value value.
   *
   * @returns {CustomShapes} This instance for chaining.
   */
  vertexProperty(name, value) {
    const target = this._contour || this._path.vertices;
    const last = target[target.length - 1];
    if (last) last[name] = value;
    return this;
  }
  /**
   * Begins recording a contour within the active shape.
   *
   * @returns {CustomShapes} This instance for chaining.
   */
  beginContour() { this._contour = []; return this; }
  /**
   * Finishes the active contour and appends it to the shape.
   *
   * @returns {CustomShapes} This instance for chaining.
   */
  endContour() {
    if (this._contour) this._path.contours.push(this._contour);
    this._contour = null;
    return this;
  }
  /**
   * Finishes and returns the active custom shape.
   *
   * @param {*} [close=constants.OPEN] - Close value.
   *
   * @returns {Object|null} The resulting value.
   */
  endShape(close = constants.OPEN) {
    const shape = this._path;
    if (shape) shape.closed = close === constants.CLOSE;
    this._path = null;
    return shape;
  }
}

module.exports = { Shapes, Models, Attribute, Curves, CustomShapes, Geometry };
