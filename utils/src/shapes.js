'use strict';

// This file is loaded two ways:
//  1. In the browser, loaded via a <script> tag in index.html, where
//     `require` doesn't exist, and where this file, canvas.js, and
//     Transform.js all share ONE global scope (they're sibling <script>
//     tags). Shapes never needs the Canvas class itself, only a canvas
//     *instance* passed into its constructor, so nothing needs to be
//     required for that case - Transform is picked up from
//     window.Transform (set by Transform.js) below.
//  2. In Node, via require('./shapes.js'), where there's no `window`, so
//     Transform is pulled in with require() instead.
//
// Everything is wrapped in an IIFE, and `Transform` is a *local* const
// inside it, so this never collides with the top-level declarations in the
// other engine files even though they share a global scope in the browser.
(function (root, factory) {
    let Shapes;
    if (typeof module === 'object' && module.exports) {
        Shapes = factory(require('./transform.js'));
        module.exports = Shapes;
        module.exports.Shapes = Shapes;
    } else {
        if (!root || !root.Transform) throw new Error('Shapes requires Transform.js to be loaded first.');
        Shapes = factory(root.Transform);
        root.Shapes = Shapes;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Transform) {
const VERTEX_SHADER = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;

    uniform mat4 uModel;
    uniform mat4 uView;
    uniform mat4 uProjection;

    varying vec3 vNormal;

    void main() {
        vNormal = mat3(uModel) * aNormal;
        gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
    }
`;

const FRAGMENT_SHADER = `
    precision mediump float;

    varying vec3 vNormal;

    uniform vec3 uColor;
    uniform vec3 uLightDir;

    void main() {
        vec3 n = normalize(vNormal);
        float diff = max(dot(n, normalize(uLightDir)), 0.15);
        gl_FragColor = vec4(uColor * diff, 1.0);
    }
`;

/**
 * Drawing helper built on top of a {@link Canvas} instance. Exposes simple
 * 2D primitives (circle, rect, line, triangle) when the canvas was created
 * with a `'2d'` context, and simple 3D primitives (cube, sphere) with basic
 * Phong-ish shading when created with a `'webgl'`/`'webgl2'` context.
 * Calling a 2D method on a 3D canvas (or vice versa) throws.
 *
 * @class
 */
class Shapes {
    /**
     * @param {Canvas} canvas - A {@link Canvas} instance that has already had `create()` called on it.
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.context();
        this.type = canvas.contextType();

        this._geometryCache = {};

        // Drawing-attribute state (attributes category): where rects/ellipses
        // are anchored, and how strokes are capped/joined/weighted/smoothed.
        // Mirrors the "pullover" pattern already used by Canvas#getFill /
        // Canvas#getStroke - set once, then implicitly applied to shapes
        // drawn afterwards unless a call overrides it explicitly.
        this.CORNER = 'corner';
        this.CENTER = 'center';
        this.RADIUS = 'radius';
        this.CORNERS = 'corners';
        this.ROUND = 'round';
        this.SQUARE = 'butt';
        this.PROJECT = 'square';
        this.MITER = 'miter';
        this.BEVEL = 'bevel';

        this._rectMode = this.CORNER;
        this._ellipseMode = this.CENTER;
        this._strokeWeight = 1;
        this._strokeCap = this.ROUND;
        this._strokeJoin = this.MITER;
        this._smoothing = true;

        if (this.type !== '2d') {
            this._initGL();
        }
    }

    // ---------------------------------------------------------------
    // Attributes
    // ---------------------------------------------------------------

    /**
     * Changes where rectangles (and squares) are drawn relative to the
     * coordinates passed to {@link Shapes#rect}/{@link Shapes#square}.
     *
     * @param {string} mode - One of `this.CORNER` (default), `this.CENTER`, `this.RADIUS`, or `this.CORNERS`.
     * @returns {Shapes} This instance, to allow chaining.
     */
    rectMode(mode) {
        this._rectMode = mode;
        return this;
    }

    /**
     * Changes where ellipses, circles, and arcs are drawn relative to the
     * coordinates passed to their respective methods.
     *
     * @param {string} mode - One of `this.CENTER` (default), `this.RADIUS`, `this.CORNER`, or `this.CORNERS`.
     * @returns {Shapes} This instance, to allow chaining.
     */
    ellipseMode(mode) {
        this._ellipseMode = mode;
        return this;
    }

    /**
     * Sets the width of the stroke used for points, lines, and the outlines
     * of shapes. Requires a 2D canvas.
     *
     * @param {number} weight - Stroke width, in pixels.
     * @returns {Shapes} This instance, to allow chaining.
     */
    strokeWeight(weight) {
        this._strokeWeight = weight;
        return this;
    }

    /**
     * Sets the style for rendering the ends of lines.
     *
     * @param {string} cap - One of `this.ROUND` (default), `this.SQUARE`, or `this.PROJECT`.
     * @returns {Shapes} This instance, to allow chaining.
     */
    strokeCap(cap) {
        this._strokeCap = cap;
        return this;
    }

    /**
     * Sets the style of the joints that connect line segments.
     *
     * @param {string} join - One of `this.MITER` (default), `this.ROUND`, or `this.BEVEL`.
     * @returns {Shapes} This instance, to allow chaining.
     */
    strokeJoin(join) {
        this._strokeJoin = join;
        return this;
    }

    /**
     * Draws certain features with smooth (antialiased) edges.
     *
     * @returns {Shapes} This instance, to allow chaining.
     */
    smooth() {
        this._smoothing = true;
        if (this.type === '2d' && this.ctx.imageSmoothingEnabled !== undefined) {
            this.ctx.imageSmoothingEnabled = true;
        }
        return this;
    }

    /**
     * Draws certain features with jagged (aliased) edges.
     *
     * @returns {Shapes} This instance, to allow chaining.
     */
    noSmooth() {
        this._smoothing = false;
        if (this.type === '2d' && this.ctx.imageSmoothingEnabled !== undefined) {
            this.ctx.imageSmoothingEnabled = false;
        }
        return this;
    }

    // ---------------------------------------------------------------
    // 2D shapes
    // ---------------------------------------------------------------

    /**
     * Draws a filled circle. Requires a 2D canvas.
     *
     * @param {number} x - Center X coordinate, in canvas pixels.
     * @param {number} y - Center Y coordinate, in canvas pixels.
     * @param {number} radius - Circle radius, in pixels.
     * @param {string} [color] - Fill color (any valid CSS color string). Defaults to the canvas's current {@link Canvas#fill} setting.
     * @returns {Shapes} This instance, to allow chaining.
     * @throws {Error} If the canvas was not created with a `'2d'` context.
     */
    circle(x, y, radius, color) {
        this._require2D('circle');
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this._applyFillAndStroke(color);
        return this;
    }

    /**
     * Draws a filled, axis-aligned rectangle. Requires a 2D canvas.
     *
     * @param {number} x - X coordinate of the top-left corner, in canvas pixels.
     * @param {number} y - Y coordinate of the top-left corner, in canvas pixels.
     * @param {number} width - Rectangle width, in pixels.
     * @param {number} height - Rectangle height, in pixels.
     * @param {string} [color] - Fill color (any valid CSS color string). Defaults to the canvas's current {@link Canvas#fill} setting.
     * @returns {Shapes} This instance, to allow chaining.
     * @throws {Error} If the canvas was not created with a `'2d'` context.
     */
    rect(x, y, width, height, color) {
        this._require2D('rect');
        const { rx, ry, rw, rh } = this._resolveRect(x, y, width, height);
        this.ctx.beginPath();
        this.ctx.rect(rx, ry, rw, rh);
        this._applyFillAndStroke(color);
        return this;
    }

    /**
     * Draws a straight line segment. Requires a 2D canvas.
     *
     * @param {number} x1 - Start point X coordinate.
     * @param {number} y1 - Start point Y coordinate.
     * @param {number} x2 - End point X coordinate.
     * @param {number} y2 - End point Y coordinate.
     * @param {string} [color] - Stroke color (any valid CSS color string). Defaults to the canvas's current {@link Canvas#stroke} color, or `'#ffffff'` if none is set.
     * @param {number} [lineWidth] - Stroke width, in pixels. Defaults to the canvas's current {@link Canvas#stroke} width, or `1` if none is set.
     * @returns {Shapes} This instance, to allow chaining.
     * @throws {Error} If the canvas was not created with a `'2d'` context.
     */
    line(x1, y1, x2, y2, color, lineWidth) {
        this._require2D('line');
        const canvasStroke = this.canvas.getStroke();
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.strokeStyle = color !== undefined ? color : (canvasStroke ? canvasStroke.color : '#ffffff');
        this.ctx.lineWidth = lineWidth !== undefined ? lineWidth : (canvasStroke ? canvasStroke.width : this._strokeWeight);
        this.ctx.lineCap = this._strokeCap;
        this.ctx.lineJoin = this._strokeJoin;
        this.ctx.stroke();
        return this;
    }

    /**
     * Draws a filled triangle from three vertices. Requires a 2D canvas.
     *
     * @param {number} x1 - First vertex X coordinate.
     * @param {number} y1 - First vertex Y coordinate.
     * @param {number} x2 - Second vertex X coordinate.
     * @param {number} y2 - Second vertex Y coordinate.
     * @param {number} x3 - Third vertex X coordinate.
     * @param {number} y3 - Third vertex Y coordinate.
     * @param {string} [color] - Fill color (any valid CSS color string). Defaults to the canvas's current {@link Canvas#fill} setting.
     * @returns {Shapes} This instance, to allow chaining.
     * @throws {Error} If the canvas was not created with a `'2d'` context.
     */
    triangle(x1, y1, x2, y2, x3, y3, color) {
        this._require2D('triangle');
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.lineTo(x3, y3);
        this.ctx.closePath();
        this._applyFillAndStroke(color);
        return this;
    }

    /**
     * Draws an ellipse (oval). Requires a 2D canvas. Interpretation of
     * `a`/`b` (and whether `c`/`d` are needed) is controlled by the current
     * {@link Shapes#ellipseMode}.
     *
     * @param {number} a - X coordinate, meaning depends on {@link Shapes#ellipseMode}.
     * @param {number} b - Y coordinate, meaning depends on {@link Shapes#ellipseMode}.
     * @param {number} c - Width (or, in `RADIUS` mode, the x-radius).
     * @param {number} [d=c] - Height (or, in `RADIUS` mode, the y-radius). Defaults to `c`, producing a circle.
     * @param {string} [color] - Fill color. Defaults to the canvas's current fill.
     * @returns {Shapes} This instance, to allow chaining.
     * @throws {Error} If the canvas was not created with a `'2d'` context.
     */
    ellipse(a, b, c, d = c, color) {
        this._require2D('ellipse');
        const { cx, cy, rx, ry } = this._resolveEllipse(a, b, c, d);
        this.ctx.beginPath();
        this.ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
        this._applyFillAndStroke(color);
        return this;
    }

    /**
     * Draws an arc. Requires a 2D canvas. Position/size are interpreted the
     * same way as {@link Shapes#ellipse}, via the current {@link
     * Shapes#ellipseMode}.
     *
     * @param {number} a - X coordinate, meaning depends on {@link Shapes#ellipseMode}.
     * @param {number} b - Y coordinate, meaning depends on {@link Shapes#ellipseMode}.
     * @param {number} c - Width (or x-radius in `RADIUS` mode).
     * @param {number} d - Height (or y-radius in `RADIUS` mode).
     * @param {number} start - Angle to start the arc, in radians.
     * @param {number} stop - Angle to stop the arc, in radians.
     * @param {string} [mode='open'] - How the arc is closed: `'open'`, `'chord'`, or `'pie'`.
     * @param {string} [color] - Fill color. Defaults to the canvas's current fill.
     * @returns {Shapes} This instance, to allow chaining.
     * @throws {Error} If the canvas was not created with a `'2d'` context.
     */
    arc(a, b, c, d, start, stop, mode = 'open', color) {
        this._require2D('arc');
        const { cx, cy, rx, ry } = this._resolveEllipse(a, b, c, d);
        this.ctx.beginPath();
        if (mode === 'pie') this.ctx.moveTo(cx, cy);
        this.ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, start, stop);
        if (mode === 'pie') this.ctx.closePath();
        else if (mode === 'chord') this.ctx.closePath();
        this._applyFillAndStroke(color);
        return this;
    }

    /**
     * Draws a single point in space. Requires a 2D canvas. Rendered as a
     * filled circle whose diameter is the current {@link Shapes#strokeWeight}.
     *
     * @param {number} x - X coordinate.
     * @param {number} y - Y coordinate.
     * @param {string} [color] - Point color. Defaults to the canvas's current stroke color, or fill color if no stroke is set.
     * @returns {Shapes} This instance, to allow chaining.
     * @throws {Error} If the canvas was not created with a `'2d'` context.
     */
    point(x, y, color) {
        this._require2D('point');
        const stroke = this.canvas.getStroke();
        const resolved = color !== undefined ? color : (stroke ? stroke.color : this.canvas.getFill());
        const radius = Math.max(this._strokeWeight, 1) / 2;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fillStyle = resolved || '#ffffff';
        this.ctx.fill();
        return this;
    }

    /**
     * Draws a quadrilateral (four-sided shape) from four vertices, given in
     * order (clockwise or counter-clockwise). Requires a 2D canvas.
     *
     * @param {number} x1 - First vertex X.
     * @param {number} y1 - First vertex Y.
     * @param {number} x2 - Second vertex X.
     * @param {number} y2 - Second vertex Y.
     * @param {number} x3 - Third vertex X.
     * @param {number} y3 - Third vertex Y.
     * @param {number} x4 - Fourth vertex X.
     * @param {number} y4 - Fourth vertex Y.
     * @param {string} [color] - Fill color. Defaults to the canvas's current fill.
     * @returns {Shapes} This instance, to allow chaining.
     * @throws {Error} If the canvas was not created with a `'2d'` context.
     */
    quad(x1, y1, x2, y2, x3, y3, x4, y4, color) {
        this._require2D('quad');
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.lineTo(x3, y3);
        this.ctx.lineTo(x4, y4);
        this.ctx.closePath();
        this._applyFillAndStroke(color);
        return this;
    }

    /**
     * Draws a square. Requires a 2D canvas. Position is interpreted the
     * same way as {@link Shapes#rect}, via the current {@link
     * Shapes#rectMode}.
     *
     * @param {number} x - X coordinate, meaning depends on {@link Shapes#rectMode}.
     * @param {number} y - Y coordinate, meaning depends on {@link Shapes#rectMode}.
     * @param {number} size - Side length.
     * @param {string} [color] - Fill color. Defaults to the canvas's current fill.
     * @returns {Shapes} This instance, to allow chaining.
     * @throws {Error} If the canvas was not created with a `'2d'` context.
     */
    square(x, y, size, color) {
        return this.rect(x, y, size, size, color);
    }

    // ---------------------------------------------------------------
    // 3D shapes
    // ---------------------------------------------------------------

    /**
     * Clears the color and depth buffers and enables depth testing. Requires
     * a WebGL canvas. Typically called once at the start of each frame.
     *
     * @param {number[]} [color=[0, 0, 0, 1]] - Clear color as `[r, g, b, a]`, each in `[0, 1]`. `a` defaults to `1` if omitted.
     * @returns {Shapes} This instance, to allow chaining.
     * @throws {Error} If the canvas was not created with a `'webgl'`/`'webgl2'` context.
     */
    clear(color = [0, 0, 0, 1]) {
        this._require3D('clear');
        const gl = this.ctx;
        gl.clearColor(color[0], color[1], color[2], color[3] ?? 1);
        gl.enable(gl.DEPTH_TEST);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        return this;
    }

    /**
     * Draws a shaded, unit-sized cube (scaled by `size`). Geometry is built
     * once and cached across calls. Requires a WebGL canvas.
     *
     * @param {Object} [options={}] - Cube parameters.
     * @param {number} [options.x=0] - Center X position, in world space.
     * @param {number} [options.y=0] - Center Y position, in world space.
     * @param {number} [options.z=-5] - Center Z position, in world space.
     * @param {number} [options.rx=0] - Rotation around the X axis, in radians.
     * @param {number} [options.ry=0] - Rotation around the Y axis, in radians.
     * @param {number} [options.rz=0] - Rotation around the Z axis, in radians.
     * @param {number} [options.size=1] - Uniform scale factor applied to all axes.
     * @param {number[]} [options.color=[1, 1, 1]] - Base color as `[r, g, b]`, each in `[0, 1]`.
     * @returns {Shapes} This instance, to allow chaining.
     * @throws {Error} If the canvas was not created with a `'webgl'`/`'webgl2'` context.
     */
    cube({ x = 0, y = 0, z = -5, rx = 0, ry = 0, rz = 0, size = 1, color = [1, 1, 1] } = {}) {
        this._require3D('cube');
        const geometry = this._getCubeGeometry();
        this._draw3D(geometry, { x, y, z, rx, ry, rz, sx: size, sy: size, sz: size, color });
        return this;
    }

    /**
     * Draws a shaded, UV sphere. Geometry is built once per distinct
     * `segments` value and cached across calls. Requires a WebGL canvas.
     *
     * @param {Object} [options={}] - Sphere parameters.
     * @param {number} [options.x=0] - Center X position, in world space.
     * @param {number} [options.y=0] - Center Y position, in world space.
     * @param {number} [options.z=-5] - Center Z position, in world space.
     * @param {number} [options.radius=1] - Sphere radius (applied as a uniform scale).
     * @param {number} [options.segments=20] - Number of latitude/longitude segments; higher values produce a smoother sphere at greater cost. Clamped to a minimum of 4.
     * @param {number[]} [options.color=[1, 1, 1]] - Base color as `[r, g, b]`, each in `[0, 1]`.
     * @returns {Shapes} This instance, to allow chaining.
     * @throws {Error} If the canvas was not created with a `'webgl'`/`'webgl2'` context.
     */
    sphere({ x = 0, y = 0, z = -5, radius = 1, segments = 20, color = [1, 1, 1] } = {}) {
        this._require3D('sphere');
        const geometry = this._getSphereGeometry(segments);
        this._draw3D(geometry, { x, y, z, sx: radius, sy: radius, sz: radius, color });
        return this;
    }

    // ---------------------------------------------------------------
    // internals
    // ---------------------------------------------------------------

    /**
     * Guards a method to only run against a 2D canvas.
     *
     * @private
     * @param {string} name - Name of the calling method, used in the thrown error message.
     * @throws {Error} If this instance's canvas is not a `'2d'` context.
     */
    _require2D(name) {
        if (this.type !== '2d') {
            throw new Error(`Shapes#${name}() requires a canvas created with ctx: '2d'`);
        }
    }

    /**
     * Guards a method to only run against a WebGL canvas.
     *
     * @private
     * @param {string} name - Name of the calling method, used in the thrown error message.
     * @throws {Error} If this instance's canvas is a `'2d'` context.
     */
    _require3D(name) {
        if (this.type === '2d') {
            throw new Error(`Shapes#${name}() requires a canvas created with ctx: 'webgl' or 'webgl2'`);
        }
    }

    /**
     * Fills and/or strokes the path already built on `this.ctx` (via a prior
     * `beginPath()`/path-building calls), using an explicit color when one
     * is passed, and otherwise falling back to whatever the canvas's shared
     * drawing state currently says via {@link Canvas#getFill}/{@link
     * Canvas#getStroke} - this is how `canvas.fill('red')`/`canvas.stroke(...)`
     * "pull over" into shapes drawn without their own explicit color.
     * Filling is skipped entirely if the canvas has {@link Canvas#noFill}
     * in effect and no explicit color was passed; stroking only happens if
     * the canvas has an active {@link Canvas#stroke}, since shapes have no
     * stroke arguments of their own.
     *
     * @private
     * @param {string} [explicitColor] - Fill color passed directly to the calling shape method, taking priority over the canvas's current fill setting.
     * @returns {void}
     */
    _applyFillAndStroke(explicitColor) {
        const fillColor = explicitColor !== undefined ? explicitColor : this.canvas.getFill();
        if (fillColor) {
            this.ctx.fillStyle = fillColor;
            this.ctx.fill();
        }

        const stroke = this.canvas.getStroke();
        if (stroke) {
            this.ctx.strokeStyle = stroke.color;
            this.ctx.lineWidth = stroke.width || this._strokeWeight;
            this.ctx.lineCap = this._strokeCap;
            this.ctx.lineJoin = this._strokeJoin;
            this.ctx.stroke();
        }
    }

    /**
     * Resolves the `(x, y, width, height)` arguments accepted by {@link
     * Shapes#rect}/{@link Shapes#square} into an absolute top-left corner
     * and size, honoring the current {@link Shapes#rectMode}.
     *
     * @private
     * @param {number} x - First coordinate, as passed to the calling method.
     * @param {number} y - Second coordinate, as passed to the calling method.
     * @param {number} width - Third argument, as passed to the calling method.
     * @param {number} height - Fourth argument, as passed to the calling method.
     * @returns {{rx: number, ry: number, rw: number, rh: number}} Top-left corner (`rx`, `ry`) and size (`rw`, `rh`), suitable for `ctx.rect()`.
     */
    _resolveRect(x, y, width, height) {
        switch (this._rectMode) {
            case this.CENTER:
                return { rx: x - width / 2, ry: y - height / 2, rw: width, rh: height };
            case this.RADIUS:
                return { rx: x - width, ry: y - height, rw: width * 2, rh: height * 2 };
            case this.CORNERS:
                return { rx: x, ry: y, rw: width - x, rh: height - y };
            case this.CORNER:
            default:
                return { rx: x, ry: y, rw: width, rh: height };
        }
    }

    /**
     * Resolves the `(a, b, c, d)` arguments accepted by {@link
     * Shapes#ellipse}/{@link Shapes#arc} into an absolute center and
     * x/y radii, honoring the current {@link Shapes#ellipseMode}.
     *
     * @private
     * @param {number} a - First coordinate, as passed to the calling method.
     * @param {number} b - Second coordinate, as passed to the calling method.
     * @param {number} c - Third argument, as passed to the calling method.
     * @param {number} d - Fourth argument, as passed to the calling method.
     * @returns {{cx: number, cy: number, rx: number, ry: number}} Center (`cx`, `cy`) and radii (`rx`, `ry`), suitable for `ctx.ellipse()`.
     */
    _resolveEllipse(a, b, c, d) {
        switch (this._ellipseMode) {
            case this.RADIUS:
                return { cx: a, cy: b, rx: c, ry: d };
            case this.CORNER:
                return { cx: a + c / 2, cy: b + d / 2, rx: c / 2, ry: d / 2 };
            case this.CORNERS:
                return { cx: (a + c) / 2, cy: (b + d) / 2, rx: (c - a) / 2, ry: (d - b) / 2 };
            case this.CENTER:
            default:
                return { cx: a, cy: b, rx: c / 2, ry: d / 2 };
        }
    }

    /**
     * Compiles and links the shared vertex/fragment shader program used for
     * all 3D drawing, and caches its attribute/uniform locations. Called
     * once from the constructor for WebGL canvases.
     *
     * @private
     * @throws {Error} If the shader program fails to link.
     */
    _initGL() {
        const gl = this.ctx;
        const vertexShader = this._compileShader(gl.VERTEX_SHADER, VERTEX_SHADER);
        const fragmentShader = this._compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error('Failed to link shader program: ' + gl.getProgramInfoLog(program));
        }

        this._program = program;
        this._locations = {
            aPosition: gl.getAttribLocation(program, 'aPosition'),
            aNormal: gl.getAttribLocation(program, 'aNormal'),
            uModel: gl.getUniformLocation(program, 'uModel'),
            uView: gl.getUniformLocation(program, 'uView'),
            uProjection: gl.getUniformLocation(program, 'uProjection'),
            uColor: gl.getUniformLocation(program, 'uColor'),
            uLightDir: gl.getUniformLocation(program, 'uLightDir')
        };
    }

    /**
     * Compiles a single shader from source.
     *
     * @private
     * @param {GLenum} type - Shader type, e.g. `gl.VERTEX_SHADER` or `gl.FRAGMENT_SHADER`.
     * @param {string} source - GLSL source code for the shader.
     * @returns {WebGLShader} The compiled shader.
     * @throws {Error} If compilation fails.
     */
    _compileShader(type, source) {
        const gl = this.ctx;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error('Failed to compile shader: ' + info);
        }
        return shader;
    }

    /**
     * Builds (or returns the cached) vertex/normal/index buffers for a unit
     * cube centered at the origin.
     *
     * @private
     * @returns {Object} Geometry buffers, as returned by {@link Shapes#_createBuffers}.
     */
    _getCubeGeometry() {
        if (this._geometryCache.cube) return this._geometryCache.cube;

        const faces = [
            { normal: [0, 0, 1], verts: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
            { normal: [0, 0, -1], verts: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
            { normal: [0, 1, 0], verts: [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
            { normal: [0, -1, 0], verts: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]] },
            { normal: [1, 0, 0], verts: [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]] },
            { normal: [-1, 0, 0], verts: [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]] }
        ];

        const positions = [];
        const normals = [];
        const indices = [];

        faces.forEach((face, fi) => {
            face.verts.forEach(v => positions.push(...v));
            for (let i = 0; i < 4; i++) normals.push(...face.normal);
            const base = fi * 4;
            indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        });

        const geometry = this._createBuffers(
            new Float32Array(positions),
            new Float32Array(normals),
            new Uint16Array(indices)
        );

        this._geometryCache.cube = geometry;
        return geometry;
    }

    /**
     * Builds (or returns the cached) vertex/normal/index buffers for a unit
     * UV sphere centered at the origin, with rings and sectors both derived
     * from `segments`. Uses a 32-bit index buffer automatically if the
     * vertex count would overflow a 16-bit one.
     *
     * @private
     * @param {number} [segments=20] - Number of latitude/longitude segments. Clamped to a minimum of 4.
     * @returns {Object} Geometry buffers, as returned by {@link Shapes#_createBuffers}.
     */
    _getSphereGeometry(segments = 20) {
        const key = `sphere_${segments}`;
        if (this._geometryCache[key]) return this._geometryCache[key];

        const rings = Math.max(4, segments);
        const sectors = Math.max(4, segments);
        const positions = [];
        const normals = [];
        const indices = [];

        for (let r = 0; r <= rings; r++) {
            const theta = (r * Math.PI) / rings; // 0..PI
            const sinT = Math.sin(theta), cosT = Math.cos(theta);
            for (let s = 0; s <= sectors; s++) {
                const phi = (s * 2 * Math.PI) / sectors; // 0..2PI
                const x = sinT * Math.cos(phi);
                const y = cosT;
                const z = sinT * Math.sin(phi);
                positions.push(x * 0.5, y * 0.5, z * 0.5);
                normals.push(x, y, z);
            }
        }

        for (let r = 0; r < rings; r++) {
            for (let s = 0; s < sectors; s++) {
                const a = r * (sectors + 1) + s;
                const b = a + sectors + 1;
                indices.push(a, b, a + 1);
                indices.push(b, b + 1, a + 1);
            }
        }

        const IndexArray = indices.length > 65535 ? Uint32Array : Uint16Array;
        const geometry = this._createBuffers(
            new Float32Array(positions),
            new Float32Array(normals),
            new IndexArray(indices)
        );

        this._geometryCache[key] = geometry;
        return geometry;
    }

    /**
     * Uploads position, normal, and index data to new GPU buffers.
     *
     * @private
     * @param {Float32Array} positions - Flattened vertex positions (3 floats per vertex).
     * @param {Float32Array} normals - Flattened vertex normals (3 floats per vertex).
     * @param {Uint16Array|Uint32Array} indices - Triangle indices.
     * @returns {{positionBuffer: WebGLBuffer, normalBuffer: WebGLBuffer, indexBuffer: WebGLBuffer, indexCount: number, indexType: GLenum}}
     *   Geometry descriptor consumed by {@link Shapes#_draw3D}. `indexType` is
     *   `gl.UNSIGNED_INT` for a `Uint32Array` and `gl.UNSIGNED_SHORT` otherwise.
     */
    _createBuffers(positions, normals, indices) {
        const gl = this.ctx;

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const normalBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);

        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        return {
            positionBuffer,
            normalBuffer,
            indexBuffer,
            indexCount: indices.length,
            indexType: indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT
        };
    }

    /**
     * Binds the shared shader program and given geometry, uploads the
     * model/view/projection matrices and lighting uniforms, and issues the
     * draw call. View matrix is fixed at identity (no camera controls) and
     * the projection uses a fixed 45° vertical FOV with the canvas's aspect
     * ratio.
     *
     * @private
     * @param {Object} geometry - Geometry descriptor, as returned by {@link Shapes#_createBuffers}.
     * @param {Object} transform - Model transform and shading parameters.
     * @param {number} transform.x - Position X.
     * @param {number} transform.y - Position Y.
     * @param {number} transform.z - Position Z.
     * @param {number} [transform.rx=0] - Rotation around the X axis, in radians.
     * @param {number} [transform.ry=0] - Rotation around the Y axis, in radians.
     * @param {number} [transform.rz=0] - Rotation around the Z axis, in radians.
     * @param {number} [transform.sx=1] - Scale along the X axis.
     * @param {number} [transform.sy=1] - Scale along the Y axis.
     * @param {number} [transform.sz=1] - Scale along the Z axis.
     * @param {number[]} transform.color - Base color as `[r, g, b]`, each in `[0, 1]`.
     * @returns {void}
     */
    _draw3D(geometry, { x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, color }) {
        const gl = this.ctx;
        const loc = this._locations;

        gl.useProgram(this._program);

        const model = Transform.compose({ x, y, z, rx, ry, rz, sx, sy, sz });
        const view = Transform.identity();
        const aspect = this.canvas.width() / this.canvas.height();
        const projection = Transform.perspective((45 * Math.PI) / 180, aspect, 0.1, 100);

        gl.uniformMatrix4fv(loc.uModel, false, model);
        gl.uniformMatrix4fv(loc.uView, false, view);
        gl.uniformMatrix4fv(loc.uProjection, false, projection);
        gl.uniform3fv(loc.uColor, color);
        gl.uniform3fv(loc.uLightDir, [0.5, 0.8, 1.0]);

        gl.bindBuffer(gl.ARRAY_BUFFER, geometry.positionBuffer);
        gl.enableVertexAttribArray(loc.aPosition);
        gl.vertexAttribPointer(loc.aPosition, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, geometry.normalBuffer);
        gl.enableVertexAttribArray(loc.aNormal);
        gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geometry.indexBuffer);
        gl.drawElements(gl.TRIANGLES, geometry.indexCount, geometry.indexType, 0);
    }
}

return Shapes;
});