import { math }       from "./math.js";
import { Canvas }     from "./canvas.js";
import { Canvex }     from "./canvex.js";
import { Transform }  from "./transforms.js";
import { Materials }  from "./materials.js";
import { Camera }     from "./camera.js";
import { Helpers }    from "./helpers.js";
import { Lights } from "./lights.js";
/**
 * @typedef {number[]|{x:number, y:number, z:number}|number} ModelVec3Input
 * A transform vector. Arrays/objects map to `[x, y, z]`; a number is expanded to all axes.
 */

/**
 * @typedef {number[]|string} ModelColorInput
 * A material/edge color. Supports normalized RGBA arrays, 0-255 RGBA arrays, and CSS hex strings.
 */

/**
 * @typedef {Object} ModelGeometry
 * Mesh data used by `Models` and compatible with `Canvas.saveObj()` / `Canvas.saveStl()`.
 * @property {{x:number, y:number, z:number}[]} vertices Vertex positions.
 * @property {number[][]} faces Triangle indices as `[i0, i1, i2]`.
 * @property {{x:number, y:number, z:number}[]} [vertexNormals] Optional per-vertex normals.
 * @property {number[][]} [uvs] Optional texture coordinates as `[u, v]`.
 */

/**
 * @typedef {Object} ModelMaterialOptions
 * Valid material options. Omitted properties keep their existing/default values.
 * @property {ModelColorInput} [ambient=[0.72,0.72,0.70,1]] Base fill color.
 * @property {ModelColorInput} [emissive=[0,0,0,1]] Self-lit color used by emissive mode.
 * @property {ModelColorInput} [specular=[0.10,0.10,0.10,1]] Specular highlight color.
 * @property {number} [metalness=0] Metallic contribution from `0` to `1`.
 * @property {number} [shininess=18] Phong shininess. Higher values produce tighter highlights.
 * @property {'ambient'|'emissive'|'specular'|'normal'} [mode='specular'] Built-in material mode.
 * @property {?string} [textureSrc=null] URL/path for the texture image.
 * @property {'clamp'|'repeat'|'mirror'} [textureWrap='clamp'] Texture wrapping behavior.
 * @property {?Object} [shader=null] Shader handle from `Materials.createShader()` or `Materials.loadShader()`.
 * @property {number} [ambientMix=0.64] Optional matte-preview ambient blend.
 * @property {number} [depthStrength=0.18] Optional matte-preview depth darkening.
 * @property {number} [rimStrength=0.22] Optional matte-preview rim darkening.
 */

/**
 * @typedef {Object} ModelEdgeOptions
 * Valid options for the optional boundary/crease overlay.
 * @property {?ModelColorInput} [edgeColor=null] Fixed edge color; `null` derives from the material.
 * @property {number} [edgeOpacity=0.12] Edge opacity.
 * @property {number} [edgeDarken=0.62] Darkening multiplier for derived edge color.
 * @property {number} [edgeCreaseAngle=56] Crease threshold in degrees.
 * @property {number} [edgeDepthBias=1.0] Depth bias used to reduce z-fighting.
 */

/**
 * @typedef {Object} ModelCreateOptions
 * Valid options for model creation, grouping, loading, and clone overrides.
 * @property {string} [name=''] Human-readable model name.
 * @property {ModelVec3Input} [position=[0,0,0]] World-space position.
 * @property {ModelVec3Input} [rotation=[0,0,0]] Euler rotation in radians as `[rx, ry, rz]`.
 * @property {ModelVec3Input} [scale=[1,1,1]] Per-axis scale.
 * @property {ModelMaterialOptions} [material] Material overrides, deep-merged with defaults.
 * @property {?ModelGeometry} [geometry=null] Mesh to draw/export.
 * @property {boolean} [visible=true] Whether this model is drawn.
 * @property {boolean} [showEdges=false] Whether the optional edge overlay is enabled.
 * @property {?function(Object, WebGLRenderingContext|WebGL2RenderingContext):void} [draw=null] Custom renderer.
 * @property {?function(Object):void} [onLoad=null] Called after `Models.load()` succeeds or fallback geometry is applied.
 * @property {?function(Object):void} [onRemove=null] Called before the model is removed.
 * @property {?function(Error, Object):void} [onError=null] Called when `Models.load()` fails without fallback geometry.
 */

/**
 * @typedef {ModelCreateOptions} ModelLoadOptions
 * Valid options for `Models.load()`.
 * @property {boolean} [autoFit=true] Center, normalize, and orient OBJ geometry for immediate preview.
 * @property {boolean} [smoothNormals=true] Recompute smooth normals unless set to `false`.
 * @property {ModelGeometry|function():ModelGeometry} [fallbackGeometry] Geometry used when OBJ loading fails.
 */


// ─────────────────────────────────────────────────────────────────────────────
// Models
//
// A 3D model system for Canvex / WebGL scenes. Each model owns:
//   • A 3D transform  (position, euler rotation, scale) applied via Transform
//   • A material slot (ambient / emissive / specular colors, metalness,
//     shininess, optional texture, optional custom shader) driven by Materials
//   • Geometry data   (vertices, faces, normals, uvs) ready for WebGL upload,
//     compatible with Canvas.saveObj() / Canvas.saveStl()
//   • An optional draw(model, gl) callback for custom per-model rendering
//
// Requires a WebGL or WebGL2 context (Canvex.createCanvas with 'webgl'/'webgl2').
//
// Quick-start
// ───────────
//   // 1. Boot a WebGL2 canvas
//   Canvex.createCanvas(0, 0, 800, 600, 'webgl2');
//
//   // 2. Set up camera
//   Camera.perspective();
//   Camera.camera(0, 0, 5,  0, 0, 0,  0, 1, 0);
//
//   // 3. Build / load models
//   const box = Models.create({
//     geometry: Models.buildBox(1, 1, 1),
//     position: [0, 0, 0],
//     material: { ambient: '#4af', shininess:   48 },
//   });
//
//   const ship = await Models.load('ship.obj', {
//     position: [3, 0, -2],
//     material: { textureSrc: 'ship_diffuse.png' },
//   });
//
//   // 4. Draw loop
//   Canvex.draw = () => {
//     Canvas.background(10, 10, 20);
//     Models.rotate(box, 0, 0.01, 0);  // spin each frame
//     Models.drawAll();
//   };
//
//   // 5. Export
//   Models.exportOBJ(box, 'box.obj');
//   Models.exportSTL(box, 'box.stl');
//
// ─────────────────────────────────────────────────────────────────────────────

export const Models = class {

    // ─────────────────────────── Registry ───────────────────────────────────
    /** @type {Map<string, object>} All live models keyed by id. */
    static #registry = new Map();

    // Internal matte/depth shader used for OBJ previews. This avoids bright
    // white triangle/edge artifacts and lets form density come from blended
    // normal/depth shading, like a clay CAD render.
    static #matteProgram = null;

    // ─────────────────────────── Defaults ───────────────────────────────────
    static #defaults = {
        // ── 3D transform ────────────────────────────────────────────────────
        position: [0, 0, 0],      // world-space [x, y, z]
        rotation: [0, 0, 0],      // euler angles in radians [rx, ry, rz]
        scale:    [1, 1, 1],      // per-axis scale [sx, sy, sz]

        // ── Material ─────────────────────────────────────────────────────────
        material: {
            ambient:     [0.72, 0.72, 0.70, 1], // RGBA 0-1 (or CSS string accepted by Materials)
            emissive:    [0, 0, 0, 1],
            specular:    [0.10, 0.10, 0.10, 1],
            metalness:   0,            // 0–1
            shininess:   18,           // ≥0  (raised from 1 so Phong highlights are visible)
            mode:        'specular',   // 'ambient'|'emissive'|'specular'|'normal'
            textureSrc:  null,         // image URL loaded via Models.load / Models.loadTexture
            textureWrap: 'clamp',      // 'clamp'|'repeat'|'mirror'
            shader:      null,         // shader handle from Materials.createShader()
        },

        // ── Geometry ─────────────────────────────────────────────────────────
        // { vertices:[{x,y,z}…], faces:[[i,j,k]…], vertexNormals:[{x,y,z}…], uvs:[[u,v]…] }
        // Matches Canvas.saveObj() / Canvas.saveStl() input format.
        geometry: null,

        // ── GPU handles (filled lazily on first draw) ─────────────────────────
        _vao: null, _vbo: null, _nbo: null, _tbo: null, _ibo: null, _ebo: null,
        _texture: null,
        _indexCount: 0,
        _edgeCount: 0,
        _indexType: null,
        _buffersReady: false,
        // For realistic renders keep OBJ structure lines OFF by default.
        // Image-like depth should come from smooth normals + lighting, not from drawing GL_LINES over the mesh.
        showEdges: false,
        // null = derive optional edge color from the current material fill color.
        // Use a CSS color or [r,g,b,a] only if you intentionally want a fixed line color.
        edgeColor: null,
        edgeOpacity: 0.12,          // blended but noticeable: reveals where details/objects are placed
        edgeDarken: 0.62,           // same hue as the model, darker for depth instead of white sketch lines
        edgeCreaseAngle: 56,        // lower = more real structure/creases, without drawing every triangle
        edgeDepthBias: 1.0,         // pulls overlay lines slightly forward to avoid z-fighting/faint outlines

        // ── Scene ─────────────────────────────────────────────────────────────
        visible:    true,
        name:       '',

        // ── Callbacks ─────────────────────────────────────────────────────────
        draw:     null,   // (model, gl) => void  – custom per-frame rendering
        onLoad:   null,   // (model)     => void  – after geometry/texture ready
        onRemove: null,   // (model)     => void  – before removal from registry
    };

    // ═════════════════════════════════════════════════════════════════════════
    // FACTORY
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Creates, normalizes, and registers a new 3D model.
     *
     * Use this for procedural meshes, manually supplied geometry, or custom draw callbacks. The returned object is immediately available to `drawAll()`, `get()`, `clone()`, `toJSON()`, and `remove()`.
     *
     * @public
     * @static
     * @param {ModelCreateOptions} [options={}] Creation options. `material` is deep-merged; transform inputs are normalized.
     * @returns {Object} Registered model instance with generated `id` and `_type: "model3d"`.
     */
    static create(options = {}) {
        const id = Helpers.generateId({ prefix: 'mdl_', length: 10 });

        const material = {
            ...Models.#defaults.material,
            ...(options.material ?? {}),
        };

        const model = {
            ...Models.#defaults,
            ...options,
            material,
            id,
            _type:     'model3d',
            _children: [],
            _isGroup:  false,
        };

        // Normalise transform arrays.
        model.position = Models.#toVec3(model.position, 0);
        model.rotation = Models.#toVec3(model.rotation, 0);
        model.scale    = Models.#toVec3(model.scale,    1);

        Models.#registry.set(id, model);
        return model;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // LOADING
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Loads a Wavefront OBJ file, parses it into geometry, and registers the model.
     *
     * If `options.material.textureSrc` is set, the texture is loaded before `onLoad` runs. By default, OBJ geometry is auto-fitted for immediate preview; pass `autoFit: false` to preserve source coordinates.
     *
     * @async
     *
     * @public
     * @static
     * @param {string} src URL or relative path to a `.obj` file.
     * @param {ModelLoadOptions} [options={}] Load, transform, material, callback, and fallback options.
     * @returns {Promise<Object>} Promise resolving to the registered model.
     */
    static async load(src, options = {}) {
        const model = Models.create(options);
        model.name  = model.name || src.split('/').pop().replace(/\.[^.]+$/, '');

        try {
            const text     = await Models.#fetchText(src);
            model.geometry = Models.#parseOBJ(text);
            model._buffersReady = false;

            if (!model.geometry?.vertices?.length) {
                throw new Error(`Models: OBJ loaded but no vertices were parsed from "${src}"`);
            }

            // Smooth normals by default so curved OBJ surfaces do not render as a blocky silhouette.
            // Pass smoothNormals: false to keep the OBJ's original/faceted normals.
            if (options.smoothNormals !== false) {
                Models.#smoothVertexNormals(model.geometry);
            }

            // Auto-fit: re-center and normalize the geometry so any OBJ file appears
            // on-screen regardless of original scale or coordinate offset.
            if (options.autoFit !== false) {
                Models.#autoFitGeometry(model.geometry);
            }

            if (model.material.textureSrc) {
                model._texture = await Models.#loadGLTexture(model.material.textureSrc);
            }

            if (typeof model.onLoad === 'function') model.onLoad(model);
        } catch (err) {
            model._loadError = err;
            console.warn(`Models.load: failed to load "${src}".`, err);

            // Optional fallback so missing .obj files do not leave an invisible empty model.
            if (options.fallbackGeometry) {
                model.geometry = typeof options.fallbackGeometry === 'function'
                    ? options.fallbackGeometry()
                    : options.fallbackGeometry;

                if (typeof model.onLoad === 'function') model.onLoad(model);
            } else if (typeof model.onError === 'function') {
                model.onError(err, model);
            }
        }

        return model;
    }

    /**
     * Loads an image and assigns it as the texture for an existing model.
     *
     * Use this to swap or lazily attach a texture without reloading geometry.
     *
     * @async
     *
     * @public
     * @static
     * @param {Object} model Model created by this API.
     * @param {string} src Image URL or relative path.
     * @returns {Promise<Object>} The same model for chaining.
     */
    static async loadTexture(model, src) {
        Models.#assert(model);
        model._texture          = await Models.#loadGLTexture(src);
        model.material.textureSrc = src;
        return model;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // GROUPING
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Creates a transform group for drawing child models together.
     *
     * The group transform is applied first, then each child applies its own transform.
     *
     * @public
     * @static
     * @param {Object[]} [children=[]] Child models to draw inside the group transform.
     * @param {ModelCreateOptions} [options={}] Group transform, visibility, naming, and callback options.
     * @returns {Object} Registered group model.
     */
    static group(children = [], options = {}) {
        const g    = Models.create(options);
        g._isGroup = true;
        g._children = [...children];
        return g;
    }

    /**
     * Adds a child model to a group, avoiding duplicate references.
     *
     * @public
     * @static
     * @param {Object} groupModel Group model to update.
     * @param {Object} childModel Child model to add.
     * @returns {Object} The updated group model.
     */
    static addChild(groupModel, childModel) {
        Models.#assert(groupModel);
        Models.#assert(childModel);
        groupModel._isGroup = true;
        if (!groupModel._children.includes(childModel)) {
            groupModel._children.push(childModel);
        }
        return groupModel;
    }

    /**
     * Removes a child reference from a group without deleting the child model.
     *
     * Call `remove()` to delete the child from the registry and release GPU resources.
     *
     * @public
     * @static
     * @param {Object} groupModel Group model to update.
     * @param {Object} childModel Child model to detach.
     * @returns {Object} The updated group model.
     */
    static removeChild(groupModel, childModel) {
        Models.#assert(groupModel);
        groupModel._children = groupModel._children.filter(c => c !== childModel);
        return groupModel;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // DRAWING
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Draws one model or group using the active Canvex WebGL/WebGL2 context.
     *
     * Applies transform state, uploads camera/projection matrices, applies material state, lazily uploads geometry buffers, and renders the mesh. A custom `draw(model, gl)` callback replaces the built-in mesh draw.
     *
     * @public
     * @static
     * @param {Object} model Model or group created by this API.
     * @returns {Object} The same model for chaining.
     */
    static draw(model) {
        Models.#assert(model);
        if (!model.visible) return model;

        const gl = Canvex.ctx;
        if (!gl || !(gl instanceof WebGLRenderingContext ||
                     (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext))) {
            console.warn('Models.draw: requires an active WebGL/WebGL2 context.');
            return model;
        }

        // ── 1. Push transform stack ──────────────────────────────────────────
        Transform.push();

        // -- 2. Apply this model's local transform
        const [px, py, pz] = model.position;
        const [rx, ry, rz] = model.rotation;
        const [sx, sy, sz] = model.scale;

        Transform.translate(px, py, pz);
        Transform.rotateX(rx);
        Transform.rotateY(ry);
        Transform.rotateZ(rz);
        Transform.scale(sx, sy, sz);

        // -- 3. Upload MVP matrices using Camera.snapshot() (same as Interaction)
        // Camera.snapshot() is the canonical way to read view+projection in Canvex.
        // Interaction.js uses snap.viewMatrix for u_modelView and snap.projectionMatrix
        // for u_projection. We do the same, combining snap.viewMatrix * model transform.
        const program = gl.getParameter(gl.CURRENT_PROGRAM);
        if (program) {
            const snap     = typeof Camera.snapshot === 'function' ? Camera.snapshot() : null;
            const viewMat  = snap?.viewMatrix;
            const projMat  = snap?.projectionMatrix;

            const mvLoc = gl.getUniformLocation(program, 'u_modelView');
            if (mvLoc) {
                if (viewMat && viewMat.length === 16) {
                    // Combine: viewMatrix * modelMatrix so camera position is respected.
                    const modelMat = typeof Transform.getMatrix === 'function' ? Transform.getMatrix() : null;
                    if (modelMat && modelMat.length === 16) {
                        gl.uniformMatrix4fv(mvLoc, false,
                            new Float32Array(Models.#mat4Mul(viewMat, modelMat)));
                    } else {
                        // No model matrix accessor: upload view only (model stays at origin).
                        gl.uniformMatrix4fv(mvLoc, false, new Float32Array(viewMat));
                    }
                } else {
                    // Fallback: no Camera.snapshot viewMatrix, use Transform stack only.
                    Transform.setMatrixUniform(program, 'u_modelView');
                }
            }

            const projLoc = gl.getUniformLocation(program, 'u_projection');
            if (projLoc && projMat && projMat.length === 16) {
                gl.uniformMatrix4fv(projLoc, false, new Float32Array(projMat));
            }

            const useMatLoc = gl.getUniformLocation(program, 'u_useMatrices');
            if (useMatLoc) gl.uniform1i(useMatLoc, 1);
        }

                // ── 4. Apply material ────────────────────────────────────────────────
        Models.#applyMaterial(model, gl);
        // #applyMaterial can switch shader programs. Upload matrices again to
        // the shader that is active for the model draw.
        Models.#uploadActiveMatrices(gl);

        // ── 5. Render ────────────────────────────────────────────────────────
        if (model._isGroup) {
            for (const child of model._children) Models.draw(child);
        } else if (typeof model.draw === 'function') {
            model.draw(model, gl);
        } else if (model.geometry) {
            Models.#ensureBuffers(model, gl);
            Models.#issueDrawCall(model, gl);
        }

        // ── 6. Pop transform stack ───────────────────────────────────────────
        Transform.pop();

        return model;
    }

    /**
     * Draws every visible registered model once, sorted from farthest to nearest.
     *
     * Call this from the animation loop after clearing the canvas and configuring the camera.
     *
     * @public
     * @static
     * @returns {void} 
     */
    static drawAll() {
        const sorted = [...Models.#registry.values()]
            .filter(m => m.visible)
            .sort((a, b) => a.position[2] - b.position[2]); // far → near
        for (const model of sorted) Models.draw(model);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TRANSFORM HELPERS  (mutate the model's stored transform vectors)
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Moves a model by a relative world-space offset.
     *
     * @public
     * @static
     * @param {Object} model Model to move.
     * @param {number} dx Delta on X.
     * @param {number} [dy=0] Delta on Y.
     * @param {number} [dz=0] Delta on Z.
     * @returns {Object} The same model for chaining.
     */
    static translate(model, dx, dy = 0, dz = 0) {
        Models.#assert(model);
        model.position[0] += dx;
        model.position[1] += dy;
        model.position[2] += dz;
        return model;
    }

    /**
     * Sets a model's absolute world-space position. Omitted `y` or `z` values preserve the current component.
     *
     * @public
     * @static
     * @param {Object} model Model to reposition.
     * @param {number} x New X position.
     * @param {number} [y=model.position[1]] New Y position.
     * @param {number} [z=model.position[2]] New Z position.
     * @returns {Object} The same model for chaining.
     */
    static moveTo(model, x, y = model.position[1], z = model.position[2]) {
        Models.#assert(model);
        model.position = [x, y, z];
        return model;
    }

    /**
     * Adds relative Euler rotation, in radians, to a model.
     *
     * @public
     * @static
     * @param {Object} model Model to rotate.
     * @param {number} [rx=0] Pitch delta around X.
     * @param {number} [ry=0] Yaw delta around Y.
     * @param {number} [rz=0] Roll delta around Z.
     * @returns {Object} The same model for chaining.
     */
    static rotate(model, rx = 0, ry = 0, rz = 0) {
        Models.#assert(model);
        model.rotation[0] += rx;
        model.rotation[1] += ry;
        model.rotation[2] += rz;
        return model;
    }

    /**
     * Sets a model's absolute Euler rotation, in radians.
     *
     * @public
     * @static
     * @param {Object} model Model to rotate.
     * @param {number} [rx=0] Pitch around X.
     * @param {number} [ry=0] Yaw around Y.
     * @param {number} [rz=0] Roll around Z.
     * @returns {Object} The same model for chaining.
     */
    static rotateTo(model, rx = 0, ry = 0, rz = 0) {
        Models.#assert(model);
        model.rotation = [rx, ry, rz];
        return model;
    }

    /**
     * Multiplies a model's current scale by a relative factor.
     *
     * @public
     * @static
     * @param {Object} model Model to scale.
     * @param {number} sx X multiplier or uniform multiplier.
     * @param {number} [sy=sx] Y multiplier.
     * @param {number} [sz=sx] Z multiplier.
     * @returns {Object} The same model for chaining.
     */
    static scale(model, sx, sy = sx, sz = sx) {
        Models.#assert(model);
        model.scale[0] *= sx;
        model.scale[1] *= sy;
        model.scale[2] *= sz;
        return model;
    }

    /**
     * Sets a model's absolute scale.
     *
     * @public
     * @static
     * @param {Object} model Model to scale.
     * @param {number} sx X scale or uniform scale.
     * @param {number} [sy=sx] Y scale.
     * @param {number} [sz=sx] Z scale.
     * @returns {Object} The same model for chaining.
     */
    static scaleTo(model, sx, sy = sx, sz = sx) {
        Models.#assert(model);
        model.scale = [sx, sy, sz];
        return model;
    }

    /**
     * Resets position, rotation, and scale to identity values.
     *
     * @public
     * @static
     * @param {Object} model Model to reset.
     * @returns {Object} The same model for chaining.
     */
    static resetTransform(model) {
        Models.#assert(model);
        model.position = [0, 0, 0];
        model.rotation = [0, 0, 0];
        model.scale    = [1, 1, 1];
        return model;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // MATERIAL HELPERS
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Merges material properties into an existing model material.
     *
     * Valid options include `ambient`, `emissive`, `specular`, `metalness`, `shininess`, `mode`, `textureSrc`, `textureWrap`, `shader`, `ambientMix`, `depthStrength`, and `rimStrength`.
     *
     * @public
     * @static
     * @param {Object} model Model whose material should be updated.
     * @param {ModelMaterialOptions} [props={}] Material properties to merge.
     * @returns {Object} The same model for chaining.
     */
    static setMaterial(model, props = {}) {
        Models.#assert(model);
        Object.assign(model.material, props);
        // If the texture source changed, clear the cached GPU texture so it
        // is re-uploaded on the next draw call.
        if ('textureSrc' in props) model._texture = null;
        return model;
    }

    /**
     * Shows or hides the optional boundary/crease edge overlay.
     *
     * This is a subtle structure overlay, not a full wireframe. Enabling it clamps edge styling to practical preview ranges and rebuilds buffers on the next draw.
     *
     * @public
     * @static
     * @param {Object} model Model to update.
     * @param {boolean} [visible=false] Whether edge overlay rendering is enabled.
     * @param {ModelEdgeOptions} [options={}] Edge color, opacity, crease-angle, and depth-bias options.
     * @returns {Object} The same model for chaining.
     */
    static setEdges(model, visible = false, options = {}) {
        Models.#assert(model);
        model.showEdges = Boolean(visible);
        Object.assign(model, options);

        // The reference render uses soft grey structure lines that blend with the
        // material but are still readable. If a caller passes values that are too
        // faint (for example opacity 0.07 or crease angle 84), lift them to a
        // useful preview minimum so the model has clear 3-D depth and visible
        // placement of deck details, cockpit, propeller, etc.
        if (model.showEdges) {
            model.edgeOpacity = Math.max(0.06, Math.min(0.18, Number(model.edgeOpacity ?? 0.12)));
            model.edgeDarken = Math.min(0.72, Math.max(0.42, Number(model.edgeDarken ?? 0.62)));
            model.edgeCreaseAngle = Math.min(70, Math.max(28, Number(model.edgeCreaseAngle ?? 56)));
            model.edgeDepthBias = Math.max(0.35, Number(model.edgeDepthBias ?? 1.0));
        }

        Models.#releaseBuffers(model);
        return model;
    }

    /**
     * Assigns a custom shader handle to a model's material.
     *
     * @public
     * @static
     * @param {Object} model Model to update.
     * @param {Object} shaderHandle Shader handle created by the Materials API.
     * @returns {Object} The same model for chaining.
     */
    static setShader(model, shaderHandle) {
        Models.#assert(model);
        model.material.shader = shaderHandle;
        return model;
    }

    /**
     * Shows or hides a model while keeping it registered.
     *
     * @public
     * @static
     * @param {Object} model Model to show or hide.
     * @param {boolean} [visible=true] New visibility state.
     * @returns {Object} The same model for chaining.
     */
    static setVisible(model, visible = true) {
        Models.#assert(model);
        model.visible = visible;
        return model;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PROCEDURAL GEOMETRY BUILDERS
    // All builders return { vertices, faces, vertexNormals, uvs } which is
    // the same format Canvas.saveObj() / Canvas.saveStl() accept.
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Builds axis-aligned box geometry centered on the origin with flat face normals.
     *
     * @public
     * @static
     * @param {number} [w=1] Full width along X.
     * @param {number} [h=1] Full height along Y.
     * @param {number} [d=1] Full depth along Z.
     * @returns {ModelGeometry} Box mesh data.
     */
    static buildBox(w = 1, h = 1, d = 1) {
        const hx = w / 2, hy = h / 2, hz = d / 2;

        // 24 unique vertices (4 per face) so normals are face-flat.
        const posData = [
            // face,  v0,           v1,           v2,           v3
            // +Z
            [[-hx,-hy, hz],[ hx,-hy, hz],[ hx, hy, hz],[-hx, hy, hz]],
            // -Z
            [[ hx,-hy,-hz],[-hx,-hy,-hz],[-hx, hy,-hz],[ hx, hy,-hz]],
            // -X
            [[-hx,-hy,-hz],[-hx,-hy, hz],[-hx, hy, hz],[-hx, hy,-hz]],
            // +X
            [[ hx,-hy, hz],[ hx,-hy,-hz],[ hx, hy,-hz],[ hx, hy, hz]],
            // +Y
            [[-hx, hy, hz],[ hx, hy, hz],[ hx, hy,-hz],[-hx, hy,-hz]],
            // -Y
            [[-hx,-hy,-hz],[ hx,-hy,-hz],[ hx,-hy, hz],[-hx,-hy, hz]],
        ];
        const faceNormals = [
            [0,0,1],[0,0,-1],[-1,0,0],[1,0,0],[0,1,0],[0,-1,0],
        ];
        const faceUVs = [[0,0],[1,0],[1,1],[0,1]];

        const vertices = [], vertexNormals = [], uvs = [], faces = [];

        posData.forEach((quad, fi) => {
            const base = vertices.length;
            const n    = faceNormals[fi];
            quad.forEach(([x, y, z], vi) => {
                vertices.push({ x, y, z });
                vertexNormals.push({ x: n[0], y: n[1], z: n[2] });
                uvs.push(faceUVs[vi]);
            });
            faces.push([base, base+1, base+2], [base, base+2, base+3]);
        });

        return { vertices, faces, vertexNormals, uvs };
    }

    /**
     * Builds UV-sphere geometry centered on the origin.
     *
     * @public
     * @static
     * @param {number} [radius=1] Sphere radius.
     * @param {number} [widthSegments=16] Longitudinal segments.
     * @param {number} [heightSegments=12] Latitudinal segments.
     * @returns {ModelGeometry} Sphere mesh data.
     */
    static buildSphere(radius = 1, widthSegments = 16, heightSegments = 12) {
        const vertices = [], vertexNormals = [], uvs = [], faces = [];

        for (let lat = 0; lat <= heightSegments; lat++) {
            const theta    = (lat / heightSegments) * Math.PI;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);

            for (let lon = 0; lon <= widthSegments; lon++) {
                const phi  = (lon / widthSegments) * 2 * Math.PI;
                const nx   = Math.cos(phi) * sinTheta;
                const ny   = cosTheta;
                const nz   = Math.sin(phi) * sinTheta;

                vertices.push({ x: radius * nx, y: radius * ny, z: radius * nz });
                vertexNormals.push({ x: nx, y: ny, z: nz });
                uvs.push([lon / widthSegments, lat / heightSegments]);
            }
        }

        const stride = widthSegments + 1;
        for (let lat = 0; lat < heightSegments; lat++) {
            for (let lon = 0; lon < widthSegments; lon++) {
                const a = lat * stride + lon;
                const b = a + stride;
                faces.push([a, b, a + 1], [b, b + 1, a + 1]);
            }
        }

        return { vertices, faces, vertexNormals, uvs };
    }

    /**
     * Builds a flat XZ-plane grid centered on the origin with upward normals.
     *
     * @public
     * @static
     * @param {number} [width=1] Full width along X.
     * @param {number} [depth=1] Full depth along Z.
     * @param {number} [widthSegments=1] Subdivisions along X.
     * @param {number} [depthSegments=1] Subdivisions along Z.
     * @returns {ModelGeometry} Plane mesh data.
     */
    static buildPlane(width = 1, depth = 1, widthSegments = 1, depthSegments = 1) {
        const vertices = [], vertexNormals = [], uvs = [], faces = [];

        for (let iz = 0; iz <= depthSegments; iz++) {
            for (let ix = 0; ix <= widthSegments; ix++) {
                const u = ix / widthSegments;
                const v = iz / depthSegments;
                vertices.push({ x: (u - 0.5) * width, y: 0, z: (v - 0.5) * depth });
                vertexNormals.push({ x: 0, y: 1, z: 0 });
                uvs.push([u, v]);
            }
        }

        const row = widthSegments + 1;
        for (let iz = 0; iz < depthSegments; iz++) {
            for (let ix = 0; ix < widthSegments; ix++) {
                const a = iz * row + ix;
                faces.push([a, a + 1, a + row + 1], [a, a + row + 1, a + row]);
            }
        }

        return { vertices, faces, vertexNormals, uvs };
    }

    /**
     * Builds cylinder, cone, or tapered-cylinder geometry centered on the origin.
     *
     * @public
     * @static
     * @param {number} [radiusTop=1] Top ring radius.
     * @param {number} [radiusBottom=1] Bottom ring radius.
     * @param {number} [height=2] Full height along Y.
     * @param {number} [segments=16] Radial subdivisions.
     * @param {boolean} [openEnded=false] Whether to omit caps.
     * @returns {ModelGeometry} Cylinder/cone mesh data.
     */
    static buildCylinder(radiusTop = 1, radiusBottom = 1, height = 2, segments = 16, openEnded = false) {
        const vertices = [], vertexNormals = [], uvs = [], faces = [];
        const halfH    = height / 2;

        // The slope of the taper determines the Y component of the side normals.
        const slope = Math.atan2(radiusBottom - radiusTop, height);
        const ny    = Math.sin(slope);
        const nr    = Math.cos(slope);

        // Side band – 2 verts per ring slice (top + bottom).
        for (let i = 0; i <= segments; i++) {
            const u   = i / segments;
            const phi = u * 2 * Math.PI;
            const c   = Math.cos(phi), s = Math.sin(phi);

            vertices.push({ x: c * radiusTop,    y:  halfH, z: s * radiusTop    });
            vertexNormals.push({ x: c * nr, y: ny, z: s * nr });
            uvs.push([u, 0]);

            vertices.push({ x: c * radiusBottom, y: -halfH, z: s * radiusBottom });
            vertexNormals.push({ x: c * nr, y: ny, z: s * nr });
            uvs.push([u, 1]);
        }
        for (let i = 0; i < segments; i++) {
            const a = i * 2;
            faces.push([a, a+1, a+3], [a, a+3, a+2]);
        }

        if (!openEnded) {
            // Top cap
            const topCenter = vertices.length;
            vertices.push({ x: 0, y: halfH, z: 0 });
            vertexNormals.push({ x: 0, y: 1, z: 0 });
            uvs.push([0.5, 0.5]);
            for (let i = 0; i < segments; i++) {
                const phi = (i / segments) * 2 * Math.PI;
                vertices.push({ x: Math.cos(phi)*radiusTop, y: halfH, z: Math.sin(phi)*radiusTop });
                vertexNormals.push({ x: 0, y: 1, z: 0 });
                uvs.push([0.5 + 0.5*Math.cos(phi), 0.5 + 0.5*Math.sin(phi)]);
            }
            const tr = topCenter + 1;
            for (let i = 0; i < segments; i++) {
                faces.push([topCenter, tr + i, tr + (i+1) % segments]);
            }

            // Bottom cap
            const botCenter = vertices.length;
            vertices.push({ x: 0, y: -halfH, z: 0 });
            vertexNormals.push({ x: 0, y: -1, z: 0 });
            uvs.push([0.5, 0.5]);
            for (let i = 0; i < segments; i++) {
                const phi = (i / segments) * 2 * Math.PI;
                vertices.push({ x: Math.cos(phi)*radiusBottom, y: -halfH, z: Math.sin(phi)*radiusBottom });
                vertexNormals.push({ x: 0, y: -1, z: 0 });
                uvs.push([0.5 + 0.5*Math.cos(phi), 0.5 + 0.5*Math.sin(phi)]);
            }
            const br = botCenter + 1;
            for (let i = 0; i < segments; i++) {
                faces.push([botCenter, br + (i+1) % segments, br + i]);
            }
        }

        return { vertices, faces, vertexNormals, uvs };
    }

    // ═════════════════════════════════════════════════════════════════════════
    // EXPORT  (delegates to Canvas.saveObj / Canvas.saveStl)
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Exports a model's geometry as Wavefront OBJ through `Canvas.saveObj()`.
     *
     * @public
     * @static
     * @param {Object} model Model whose geometry should be exported.
     * @param {string} [fileName='model.obj'] Download file name.
     * @param {Object} [options={}] Options forwarded to `Canvas.saveObj()`.
     * @returns {string|undefined} Generated OBJ text, or `undefined` if no geometry exists.
     */
    static exportOBJ(model, fileName = 'model.obj', options = {}) {
        Models.#assert(model);
        if (!model.geometry) { console.warn('Models.exportOBJ: model has no geometry.'); return; }
        return Canvas.saveObj(model.geometry, fileName, options);
    }

    /**
     * Exports a model's geometry as ASCII STL through `Canvas.saveStl()`.
     *
     * @public
     * @static
     * @param {Object} model Model whose geometry should be exported.
     * @param {string} [fileName='model.stl'] Download file name.
     * @param {Object} [options={}] Options forwarded to `Canvas.saveStl()`.
     * @returns {string|undefined} Generated STL text, or `undefined` if no geometry exists.
     */
    static exportSTL(model, fileName = 'model.stl', options = {}) {
        Models.#assert(model);
        if (!model.geometry) { console.warn('Models.exportSTL: model has no geometry.'); return; }
        return Canvas.saveStl(model.geometry, fileName, options);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // CLONING
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Creates and registers a shallow clone of a model with a new id.
     *
     * The clone gets independent transform arrays and material data but shares the source geometry reference. GPU buffers are recreated lazily.
     *
     * @public
     * @static
     * @param {Object} model Source model to clone.
     * @param {ModelCreateOptions} [overrides={}] Properties to override on the clone.
     * @returns {Object} Registered cloned model.
     */
    static clone(model, overrides = {}) {
        Models.#assert(model);
        const id = Helpers.generateId({ prefix: 'mdl_', length: 10 });

        const cloned = {
            ...model,
            ...overrides,
            id,
            position:  [...model.position],
            rotation:  [...model.rotation],
            scale:     [...model.scale],
            material:  { ...model.material, ...(overrides.material ?? {}) },
            _children: [...model._children],
            // Clear GPU handles so they are lazily created for this clone.
            _vao: null, _vbo: null, _nbo: null, _tbo: null, _ibo: null, _ebo: null,
            _edgeCount: 0,
            _indexType: null,
            _buffersReady: false,
        };

        if (overrides.position) cloned.position = Models.#toVec3(overrides.position, 0);
        if (overrides.rotation) cloned.rotation = Models.#toVec3(overrides.rotation, 0);
        if (overrides.scale)    cloned.scale    = Models.#toVec3(overrides.scale,    1);

        Models.#registry.set(id, cloned);
        return cloned;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // REGISTRY MANAGEMENT
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Retrieves a registered model by id.
     *
     * @public
     * @static
     * @param {string} id Model id.
     * @returns {Object|undefined} Matching model, or `undefined` when not found.
     */
    static get(id) { return Models.#registry.get(id); }

    /**
     * Returns a snapshot array of every registered model.
     *
     * @public
     * @static
     * @returns {Object[]} Registered models.
     */
    static getAll() { return [...Models.#registry.values()]; }

    /**
     * Removes one model from the registry and releases its GPU resources.
     *
     * @public
     * @static
     * @param {Object|string} modelOrId Model instance or registered id.
     * @returns {boolean} `true` when a model was found and removed.
     */
    static remove(modelOrId) {
        const id    = typeof modelOrId === 'string' ? modelOrId : modelOrId?.id;
        const model = Models.#registry.get(id);
        if (!model) return false;
        if (typeof model.onRemove === 'function') model.onRemove(model);
        Models.#releaseBuffers(model);
        return Models.#registry.delete(id);
    }

    /**
     * Removes all registered models, releases GPU resources, and fires `onRemove` hooks.
     *
     * @public
     * @static
     * @returns {void} 
     */
    static clear() {
        for (const model of Models.#registry.values()) {
            if (typeof model.onRemove === 'function') model.onRemove(model);
            Models.#releaseBuffers(model);
        }
        Models.#registry.clear();
    }

    /**
     * Returns the number of models currently registered.
     *
     * @public
     * @static
     * @returns {number} Registry size.
     */
    static count() { return Models.#registry.size; }

    // ═════════════════════════════════════════════════════════════════════════
    // SERIALIZATION
    // ═════════════════════════════════════════════════════════════════════════

    /**
     * Serializes a model into a JSON-safe plain object.
     *
     * GPU handles, internal buffers, and callbacks are omitted. Group children are serialized recursively.
     *
     * @public
     * @static
     * @param {Object} model Model or group to serialize.
     * @returns {Object} JSON-safe snapshot.
     */
    static toJSON(model) {
        Models.#assert(model);
        const {
            _vao, _vbo, _nbo, _tbo, _ibo, _texture,
            _buffersReady, _indexCount, _children, _isGroup,
            draw, onLoad, onRemove,
            ...rest
        } = model;
        return {
            ...rest,
            _isGroup,
            _children: model._children.map(c => Models.toJSON(c)),
        };
    }

    /**
     * Reconstructs and registers a model from a `toJSON()` snapshot.
     *
     * GPU resources and callbacks are not restored. The original id is preserved for save/load round trips.
     *
     * @public
     * @static
     * @param {Object} json Snapshot produced by `Models.toJSON()`.
     * @returns {Object} Registered model reconstructed from the snapshot.
     */
    static fromJSON(json) {
        const { _children = [], _isGroup, id, ...rest } = json;
        const model = Models.create(rest);
        // Preserve original id so cross-references survive the round-trip.
        Models.#registry.delete(model.id);
        model.id       = id;
        model._isGroup  = Boolean(_isGroup);
        model._children = _children.map(c => Models.fromJSON(c));
        Models.#registry.set(id, model);
        return model;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═════════════════════════════════════════════════════════════════════════

    /** @private – type guard */
    static #assert(model) {
        if (!model || model._type !== 'model3d') {
            throw new TypeError(
                'Expected a 3D model created by Models.create() / Models.load() / Models.group().'
            );
        }
    }

    /**
     * @private
     * Normalises any position/rotation/scale input to a mutable [x, y, z] array.
     *
     * @param {number|number[]|{x,y,z}} input
     * @param {number} fallback  Value used for missing components.
     * @returns {number[]}
     */
    static #toVec3(input, fallback = 0) {
        if (Array.isArray(input)) {
            return [
                Number(input[0] ?? fallback),
                Number(input[1] ?? fallback),
                Number(input[2] ?? fallback),
            ];
        }
        if (input && typeof input === 'object') {
            return [Number(input.x ?? fallback), Number(input.y ?? fallback), Number(input.z ?? fallback)];
        }
        if (typeof input === 'number') return [input, input, input];
        return [fallback, fallback, fallback];
    }

    /**
     * @private
     * Applies a model's material through the Materials API.
     * Also pushes the ambient colour to `u_color` on the active shader so
     * the Canvex fallback program renders the correct colour.
     */
    static #applyMaterial(model, gl) {
        const mat = model.material;

        // Plain OBJ previews use the built-in matte shader so grey models render
        // with blended depth instead of white seams or hard sketch lines.
        // Custom shaders, textures, and normal-material previews still use the
        // engine's normal material path.
        const useInternalMatte = !mat.shader?.program && !model._texture && (mat.mode ?? 'specular') !== 'normal';
        if (useInternalMatte) {
            const program = Models.#getMatteProgram(gl);
            if (program) gl.useProgram(program);
        } else if (mat.shader?.program) {
            Materials.shader(mat.shader);
        }

        if (model._texture) {
            Materials.textureWrap(mat.textureWrap ?? 'clamp');
            Materials.texture(model._texture);
        }

        // Keep Materials state in sync, but with gentler defaults so highlights
        // don't turn creases into white lines.
        switch (mat.mode ?? 'specular') {
            case 'emissive':
                Materials.emissiveMaterial(mat.emissive); break;
            case 'normal':
                Materials.normalMaterial(); break;
            case 'ambient':
                Materials.ambientMaterial(mat.ambient); break;
            case 'specular':
            default:
                Materials.ambientMaterial(mat.ambient);
                Materials.specularMaterial(mat.specular);
                break;
        }

        Materials.metalness(mat.metalness ?? 0);
        Materials.shininess(mat.shininess ?? 18);

        const program = gl.getParameter(gl.CURRENT_PROGRAM);
        if (!program) return;

        const fill = Models.#toRgbaColor(mat.ambient, [0.72, 0.72, 0.70, 1]);
        const colorLoc = gl.getUniformLocation(program, 'u_color');
        if (colorLoc) gl.uniform4f(colorLoc, fill[0], fill[1], fill[2], fill[3]);

        const forceLoc = gl.getUniformLocation(program, 'u_forceFlatColor');
        if (forceLoc) gl.uniform1i(forceLoc, 0);

        const lightLoc = gl.getUniformLocation(program, 'u_lightDir');
        if (lightLoc) gl.uniform3f(lightLoc, -0.35, 0.65, 0.72);

        const ambientLoc = gl.getUniformLocation(program, 'u_ambientMix');
        if (ambientLoc) gl.uniform1f(ambientLoc, Number(mat.ambientMix ?? 0.64));

        const depthLoc = gl.getUniformLocation(program, 'u_depthStrength');
        if (depthLoc) gl.uniform1f(depthLoc, Number(mat.depthStrength ?? 0.18));

        const rimLoc = gl.getUniformLocation(program, 'u_rimStrength');
        if (rimLoc) gl.uniform1f(rimLoc, Number(mat.rimStrength ?? 0.22));
    }

    /**
     * @private
     * Uploads camera/model matrices to the shader currently bound. This is
     * called after material setup because material setup can switch programs.
     */
    static #uploadActiveMatrices(gl) {
        const program = gl.getParameter(gl.CURRENT_PROGRAM);
        if (!program) return;

        const snap     = typeof Camera.snapshot === 'function' ? Camera.snapshot() : null;
        const viewMat  = snap?.viewMatrix;
        const projMat  = snap?.projectionMatrix;

        const mvLoc = gl.getUniformLocation(program, 'u_modelView');
        if (mvLoc) {
            if (viewMat && viewMat.length === 16) {
                const modelMat = typeof Transform.getMatrix === 'function' ? Transform.getMatrix() : null;
                if (modelMat && modelMat.length === 16) {
                    gl.uniformMatrix4fv(mvLoc, false, new Float32Array(Models.#mat4Mul(viewMat, modelMat)));
                } else {
                    gl.uniformMatrix4fv(mvLoc, false, new Float32Array(viewMat));
                }
            } else {
                Transform.setMatrixUniform(program, 'u_modelView');
            }
        }

        const projLoc = gl.getUniformLocation(program, 'u_projection');
        if (projLoc && projMat && projMat.length === 16) {
            gl.uniformMatrix4fv(projLoc, false, new Float32Array(projMat));
        }

        const useMatLoc = gl.getUniformLocation(program, 'u_useMatrices');
        if (useMatLoc) gl.uniform1i(useMatLoc, 1);
    }

    /**
     * @private
     * Small clay/CAD preview shader. Edges become slightly denser through normal
     * and depth shading, not through white wireframe lines.
     */
    static #getMatteProgram(gl) {
        if (Models.#matteProgram) return Models.#matteProgram;

        const vsSource = `
            attribute vec3 a_position;
            attribute vec3 a_normal;
            attribute vec2 a_texcoord;
            uniform mat4 u_modelView;
            uniform mat4 u_projection;
            varying vec3 v_normal;
            varying vec3 v_viewPos;
            varying vec2 v_uv;
            void main() {
                vec4 mv = u_modelView * vec4(a_position, 1.0);
                v_viewPos = mv.xyz;
                v_normal = mat3(u_modelView) * a_normal;
                v_uv = a_texcoord;
                gl_Position = u_projection * mv;
            }
        `;

        const fsSource = `
            precision mediump float;
            uniform vec4 u_color;
            uniform vec3 u_lightDir;
            uniform float u_ambientMix;
            uniform float u_depthStrength;
            uniform float u_rimStrength;
            uniform bool u_forceFlatColor;
            varying vec3 v_normal;
            varying vec3 v_viewPos;
            varying vec2 v_uv;
            void main() {
                if (u_forceFlatColor) {
                    gl_FragColor = u_color;
                    return;
                }
                vec3 n = normalize(v_normal);
                vec3 l = normalize(u_lightDir);
                float diffuse = max(dot(n, l), 0.0);
                vec3 viewDir = normalize(-v_viewPos);
                float facing = abs(dot(n, viewDir));
                float rim = pow(1.0 - clamp(facing, 0.0, 1.0), 2.0);
                float depth = clamp((-v_viewPos.z - 80.0) / 420.0, 0.0, 1.0);
                float shade = u_ambientMix + diffuse * 0.34 - rim * u_rimStrength - depth * u_depthStrength;
                shade = clamp(shade, 0.38, 1.0);
                gl_FragColor = vec4(u_color.rgb * shade, u_color.a);
            }
        `;

        const compile = (type, source) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.warn('Models matte shader compile failed:', gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        };

        const vs = compile(gl.VERTEX_SHADER, vsSource);
        const fs = compile(gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return null;

        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.bindAttribLocation(program, 0, 'a_position');
        gl.bindAttribLocation(program, 1, 'a_normal');
        gl.bindAttribLocation(program, 2, 'a_texcoord');
        gl.linkProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.warn('Models matte shader link failed:', gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            return null;
        }

        Models.#matteProgram = program;
        return program;
    }


    /**
     * @private
     * Lazily uploads geometry to GPU on first draw.
     * Uses VAOs (WebGL2) where available for efficient re-binding.
     *
     * Attribute locations used:
     *   0 → a_position  (vec3)
     *   1 → a_normal    (vec3)
     *   2 → a_texcoord  (vec2)
     */
    static #ensureBuffers(model, gl) {
        if (model._buffersReady) return;

        const geo = model.geometry;
        if (!geo?.vertices?.length) return;

        const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;

        const fallbackNormal  = { x: 0, y: 1, z: 0 };
        const normals         = geo.vertexNormals ?? geo.vertices.map(() => fallbackNormal);
        const texcoords       = geo.uvs          ?? geo.vertices.map(() => [0, 0]);

        const positions  = new Float32Array(geo.vertices.flatMap(v => [v.x, v.y, v.z]));
        const normalData = new Float32Array(normals.flatMap(n  => [n.x, n.y, n.z]));
        const uvData     = new Float32Array(texcoords.flatMap(uv => [uv[0], uv[1]]));

        // Use Uint32Array so meshes with >65535 unique vertices don't silently
        // wrap around, which was producing corrupt-geometry line artifacts.
        const flatIndices = geo.faces.flat();
        const needsUint32 = geo.vertices.length > 65535;
        const indexData   = needsUint32
            ? new Uint32Array(flatIndices)
            : new Uint16Array(flatIndices);

        // Enable 32-bit index support on WebGL1 if needed.
        if (!isWebGL2 && needsUint32) {
            gl.getExtension('OES_element_index_uint');
        }
        // Store the index type so #issueDrawCall uses the right gl constant.
        model._indexType = needsUint32 ? (isWebGL2 ? gl.UNSIGNED_INT : (gl.getExtension('OES_element_index_uint') ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT)) : gl.UNSIGNED_SHORT;

        if (isWebGL2) {
            model._vao = gl.createVertexArray();
            gl.bindVertexArray(model._vao);
        }

        const upload = (data, location, size) => {
            const buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
            return buf;
        };

        model._vbo = upload(positions,  0, 3);
        model._nbo = upload(normalData, 1, 3);
        model._tbo = upload(uvData,     2, 2);

        model._ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model._ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData, gl.STATIC_DRAW);

        // Optional structure overlay: disabled by default for realistic renders.
        // Drawing GL_LINES on top of the surface creates the bright sketch/wireframe look in image 1.
        if (model.showEdges) {
            const edgeIndices = Models.#buildStructureEdges(geo, model.edgeCreaseAngle ?? 48);
            const edgeData = needsUint32 ? new Uint32Array(edgeIndices) : new Uint16Array(edgeIndices);
            model._ebo = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model._ebo);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, edgeData, gl.STATIC_DRAW);
            model._edgeCount = edgeData.length;

            // IMPORTANT for WebGL2 VAOs: ELEMENT_ARRAY_BUFFER binding is stored
            // inside the VAO. If the edge EBO is left bound here, the main
            // TRIANGLES pass later reads the line indices as triangle indices,
            // which causes the pale/corrupt/wireframe-looking render. Restore
            // the triangle IBO before unbinding the VAO.
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model._ibo);
        } else {
            model._ebo = null;
            model._edgeCount = 0;
        }

        if (isWebGL2) gl.bindVertexArray(null);

        model._indexCount   = indexData.length;
        model._buffersReady = true;
    }


    /**
     * @private
     * Builds a compact line-index list for boundary and crease edges only.
     * This reveals the actual OBJ structure without drawing every triangle as a noisy wireframe.
     */
    static #buildStructureEdges(geo, creaseDegrees = 52) {
        const faces = geo?.faces ?? [];
        const verts = geo?.vertices ?? [];
        if (!faces.length || !verts.length) return [];

        const faceNormals = faces.map(([i0, i1, i2]) => {
            const a = verts[i0], b = verts[i1], c = verts[i2];
            const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
            const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
            let nx = uy * vz - uz * vy;
            let ny = uz * vx - ux * vz;
            let nz = ux * vy - uy * vx;
            const len = Math.hypot(nx, ny, nz) || 1;
            return { x: nx / len, y: ny / len, z: nz / len };
        });

        const edges = new Map();
        const addEdge = (a, b, faceIndex) => {
            const lo = Math.min(a, b), hi = Math.max(a, b);
            const key = `${lo}/${hi}`;
            if (!edges.has(key)) edges.set(key, { a: lo, b: hi, faces: [] });
            edges.get(key).faces.push(faceIndex);
        };

        faces.forEach((f, fi) => {
            addEdge(f[0], f[1], fi);
            addEdge(f[1], f[2], fi);
            addEdge(f[2], f[0], fi);
        });

        const cosLimit = Math.cos((creaseDegrees * Math.PI) / 180);
        const out = [];
        for (const e of edges.values()) {
            if (e.faces.length === 1) {
                out.push(e.a, e.b); // open/boundary edge
            } else if (e.faces.length === 2) {
                const n0 = faceNormals[e.faces[0]], n1 = faceNormals[e.faces[1]];
                const dot = n0.x * n1.x + n0.y * n1.y + n0.z * n1.z;
                if (dot < cosLimit) out.push(e.a, e.b); // visible crease
            }
        }
        return out;
    }

    /**
     * @private
     * Converts material/edge colors into normalized RGBA.
     */
    static #toRgbaColor(color, fallback = [0.70, 0.70, 0.68, 1]) {
        if (Array.isArray(color)) {
            const r = Number(color[0] ?? fallback[0]);
            const g = Number(color[1] ?? fallback[1]);
            const b = Number(color[2] ?? fallback[2]);
            const a = Number(color[3] ?? fallback[3] ?? 1);
            const scale = Math.max(r, g, b) > 1 ? 255 : 1;
            return [r / scale, g / scale, b / scale, a > 1 ? a / 255 : a];
        }
        if (typeof color === 'string') {
            const s = color.trim();
            const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
            if (hex) {
                let h = hex[1];
                if (h.length === 3 || h.length === 4) h = [...h].map(ch => ch + ch).join('');
                const r = parseInt(h.slice(0, 2), 16) / 255;
                const g = parseInt(h.slice(2, 4), 16) / 255;
                const b = parseInt(h.slice(4, 6), 16) / 255;
                const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : fallback[3];
                return [r, g, b, a];
            }
        }
        return [...fallback];
    }

    /**
     * @private
     * Optional crease-line color. Same hue as the fill, slightly darker and low-alpha.
     * This prevents the white etched-line artifact from image 1.
     */
    static #resolveEdgeColor(model, currentFill) {
        if (model.edgeColor != null) return Models.#toRgbaColor(model.edgeColor, currentFill);
        const fill = Models.#toRgbaColor(currentFill, [0.70, 0.70, 0.68, 1]);
        const darken = Math.max(0, Math.min(1, Number(model.edgeDarken ?? 0.88)));
        const alpha = Math.max(0, Math.min(1, Number(model.edgeOpacity ?? 0.10)));
        return [fill[0] * darken, fill[1] * darken, fill[2] * darken, alpha];
    }

    /**
     * @private
     * Issues a single `gl.drawElements(TRIANGLES, …)` call.
     * Rebinds attribute arrays for WebGL1 (no VAO support).
     */
    /**
     * @private
     * Multiplies two column-major 4x4 matrices: returns a * b.
     * Used to combine the camera view matrix with the model's local transform.
     */
    static #mat4Mul(a, b) {
        const out = new Array(16);
        for (let col = 0; col < 4; col++) {
            for (let row = 0; row < 4; row++) {
                let sum = 0;
                for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
                out[col * 4 + row] = sum;
            }
        }
        return out;
    }

    /**
     * @private
     * Issues a single `gl.drawElements(TRIANGLES, …)` call.
     * Rebinds attribute arrays for WebGL1 (no VAO support).
     */
    static #issueDrawCall(model, gl) {
        const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;

        // Ensure depth testing is on — without it back faces bleed through the
        // front surface producing the visible-seam / line artifact.
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);

        // Keep culling off for preview loading: OBJ exporters do not all use the same winding order.
        gl.disable(gl.CULL_FACE);

        if (isWebGL2 && model._vao) {
            gl.bindVertexArray(model._vao);
        } else {
            const rebind = (buf, location, size) => {
                if (!buf) return;
                gl.bindBuffer(gl.ARRAY_BUFFER, buf);
                gl.enableVertexAttribArray(location);
                gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
            };
            rebind(model._vbo, 0, 3);
            rebind(model._nbo, 1, 3);
            rebind(model._tbo, 2, 2);
            if (model._ibo) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model._ibo);
        }

        gl.drawElements(gl.TRIANGLES, model._indexCount, model._indexType ?? gl.UNSIGNED_SHORT, 0);

        // Overlay subtle crease/boundary edges. The alpha blend keeps the lines from
        // looking like a hard cartoon wireframe while still revealing the object's structure.
        if (model.showEdges && model._ebo && model._edgeCount > 0) {
            const program = gl.getParameter(gl.CURRENT_PROGRAM);
            const loc = program ? gl.getUniformLocation(program, 'u_color') : null;
            const prevColor = Materials.state?.().ambient ?? [0.70, 0.70, 0.68, 1];
            const ec = Models.#resolveEdgeColor(model, prevColor);
            const wasBlend = gl.isEnabled(gl.BLEND);
            const wasPolyOffset = gl.isEnabled(gl.POLYGON_OFFSET_FILL);
            const wasDepthMask = gl.getParameter(gl.DEPTH_WRITEMASK);

            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(false);

            // Pull the overlay a tiny bit toward the camera. This prevents the
            // edge pass from disappearing into the surface while still keeping
            // the outlines blended into the model instead of floating above it.
            gl.enable(gl.POLYGON_OFFSET_FILL);
            gl.polygonOffset(-Number(model.edgeDepthBias ?? 1.0), -Number(model.edgeDepthBias ?? 1.0));

            if (typeof gl.lineWidth === 'function') gl.lineWidth(1);
            const forceLoc = program ? gl.getUniformLocation(program, 'u_forceFlatColor') : null;
            if (forceLoc) gl.uniform1i(forceLoc, 1);
            if (loc) gl.uniform4f(loc, ec[0], ec[1], ec[2], ec[3]);

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model._ebo);
            gl.drawElements(gl.LINES, model._edgeCount, model._indexType ?? gl.UNSIGNED_SHORT, 0);

            if (loc) gl.uniform4f(loc, prevColor[0], prevColor[1], prevColor[2], prevColor[3]);
            if (forceLoc) gl.uniform1i(forceLoc, 0);
            if (model._ibo) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, model._ibo);
            gl.depthMask(wasDepthMask);
            if (!wasPolyOffset) gl.disable(gl.POLYGON_OFFSET_FILL);
            if (!wasBlend) gl.disable(gl.BLEND);
        }

        if (isWebGL2) gl.bindVertexArray(null);
    }

    /**
     * @private
     * Deletes all WebGL objects owned by a model to prevent GPU memory leaks.
     */
    static #releaseBuffers(model) {
        const gl = Canvex.ctx;
        if (!gl) return;
        const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
        if (isWebGL2 && model._vao) gl.deleteVertexArray(model._vao);
        if (model._vbo) gl.deleteBuffer(model._vbo);
        if (model._nbo) gl.deleteBuffer(model._nbo);
        if (model._tbo) gl.deleteBuffer(model._tbo);
        if (model._ibo) gl.deleteBuffer(model._ibo);
        if (model._ebo) gl.deleteBuffer(model._ebo);
        model._vao = model._vbo = model._nbo = model._tbo = model._ibo = null;
        model._indexType = null;
        model._buffersReady = false;
    }

    /**
     * @private – fetch helper for OBJ loading.
     */
    static async #fetchText(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Models: fetch failed "${url}" (${res.status})`);
        return res.text();
    }

    /**
     * @private
     * Loads an image from `src` and uploads it as a WebGLTexture via
     * Materials.texture(), which also handles caching, wrap modes, and mipmap
     * generation.
     *
     * @param {string} src
     * @returns {Promise<WebGLTexture>}
     */
    static #loadGLTexture(src) {
        return new Promise((resolve, reject) => {
            const img   = new window.Image();
            img.crossOrigin = 'anonymous';
            img.onload  = () => {
                try { resolve(Materials.texture(img)); }
                catch (e) { reject(e); }
            };
            img.onerror = () => reject(new Error(`Models: texture load failed "${src}"`));
            img.src     = src;
        });
    }

    

    /**
     * @private
     * Recomputes smooth vertex normals and also merges duplicate-position normals.
     * Many OBJ files split the same physical point into multiple vertices for UVs/materials,
     * which can make curved surfaces look faceted or like a white block. This keeps the
     * geometry unchanged but gives lighting a continuous surface to shade.
     */
    static #smoothVertexNormals(geo) {
        const verts = geo?.vertices ?? [];
        const faces = geo?.faces ?? [];
        if (!verts.length || !faces.length) return;

        const accum = verts.map(() => ({ x: 0, y: 0, z: 0 }));

        for (const [i0, i1, i2] of faces) {
            const a = verts[i0], b = verts[i1], c = verts[i2];
            const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
            const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
            const nx = uy * vz - uz * vy;
            const ny = uz * vx - ux * vz;
            const nz = ux * vy - uy * vx;
            // Area-weighted accumulation.
            accum[i0].x += nx; accum[i0].y += ny; accum[i0].z += nz;
            accum[i1].x += nx; accum[i1].y += ny; accum[i1].z += nz;
            accum[i2].x += nx; accum[i2].y += ny; accum[i2].z += nz;
        }

        // Merge normals for duplicate physical positions that were split by OBJ UV/material indices.
        const groups = new Map();
        const keyOf = (v) => `${Math.round(v.x * 100000)}/${Math.round(v.y * 100000)}/${Math.round(v.z * 100000)}`;
        verts.forEach((v, i) => {
            const key = keyOf(v);
            if (!groups.has(key)) groups.set(key, { x: 0, y: 0, z: 0, indices: [] });
            const g = groups.get(key);
            g.x += accum[i].x; g.y += accum[i].y; g.z += accum[i].z; g.indices.push(i);
        });

        geo.vertexNormals = verts.map(() => ({ x: 0, y: 1, z: 0 }));
        for (const g of groups.values()) {
            const len = Math.hypot(g.x, g.y, g.z) || 1;
            const n = { x: g.x / len, y: g.y / len, z: g.z / len };
            for (const i of g.indices) geo.vertexNormals[i] = { ...n };
        }
    }

    /**
     * @private
     * Normalizes geometry so it is centered at the origin and its largest
     * axis fits within [-1, 1]. This makes any loaded OBJ visible regardless
     * of the original units or coordinate offset used by the authoring tool.
     *
     * - Translates vertices so the bounding-box center is at (0, 0, 0).
     * - Uniformly scales vertices so the longest axis spans exactly 2 units.
     * - Vertex normals are direction vectors and are NOT affected by the scale.
     *
     * @param {{ vertices, faces, vertexNormals, uvs }} geo
     * @returns {void} Mutates geo.vertices in place.
     */
    static #normalizeGeometry(geo) {
        const verts = geo.vertices;
        if (!verts?.length) return;

        // ── 1. Compute bounding box ──────────────────────────────────────────
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        for (const v of verts) {
            if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
            if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
            if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
        }

        // ── 2. Center offset ─────────────────────────────────────────────────
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const cz = (minZ + maxZ) / 2;

        // ── 3. Uniform scale so largest axis → canvas-relative units ─────────
        // p5.js loadModel() normalises so the longest axis = 1 canvas height,
        // giving a model that is naturally visible with the default camera
        // (eye at z = height/2 / tan(PI/6) ≈ height * 0.866).
        // We target 100 units — a comfortable fraction of typical canvas sizes —
        // matching p5.js "normalizeCoords" behaviour.
        const rangeX = maxX - minX;
        const rangeY = maxY - minY;
        const rangeZ = maxZ - minZ;
        const maxRange = Math.max(rangeX, rangeY, rangeZ) || 1;
        const TARGET   = 100;                  // ← p5.js-style canvas-unit target
        const invScale = TARGET / maxRange;

        // ── 4. Apply to every vertex ─────────────────────────────────────────
        for (const v of verts) {
            v.x = (v.x - cx) * invScale;
            v.y = (v.y - cy) * invScale;
            v.z = (v.z - cz) * invScale;
        }
    }

/**
     * @private
     * Minimal Wavefront OBJ parser.
     *
     * Supports: v, vn, vt, f (with v/vt/vn or v//vn or v/vt references).
     * Polygons with >3 vertices are triangulated via a simple fan from v0.
     *
     * Returns { vertices, faces, vertexNormals, uvs } — the geometry format
     * consumed by Canvas.saveObj() / Canvas.saveStl() and Models.#ensureBuffers().
     *
     * @param {string} text  Raw OBJ file contents.
     * @returns {{ vertices, faces, vertexNormals, uvs }}
     */
    static #parseOBJ(text) {
        // Raw index-based arrays from the OBJ file.
        const rawPos = [], rawNrm = [], rawUV = [];

        // Unique combined vertices keyed by "vi/ti/ni".
        // This ensures adjacent faces share vertices so smooth normals work.
        const vertexMap  = new Map();   // key → index into vertices[]
        const vertices       = [];
        const vertexNormals  = [];
        const uvs            = [];
        const faces          = [];

        // Triangles as [i0, i1, i2] for later per-vertex normal accumulation.
        const rawTriangles = [];

        for (const rawLine of text.split(/\r?\n/)) {
            const line  = rawLine.trim();
            if (!line || line.startsWith('#')) continue;

            const parts = line.split(/\s+/);
            switch (parts[0]) {
                case 'v':
                    rawPos.push([parseFloat(parts[1])||0, parseFloat(parts[2])||0, parseFloat(parts[3])||0]);
                    break;
                case 'vn':
                    rawNrm.push([parseFloat(parts[1])||0, parseFloat(parts[2])||0, parseFloat(parts[3])||0]);
                    break;
                case 'vt':
                    rawUV.push([parseFloat(parts[1])||0, parseFloat(parts[2])||0]);
                    break;
                case 'f': {
                    // Parse each "v/vt/vn" (or "v//vn", "v/vt", "v") reference.
                    const refs = parts.slice(1).map(token => {
                        const segs = token.split('/');
                        const toIndex = (value, length) => {
                            const n = parseInt(value, 10);
                            if (!Number.isFinite(n) || n === 0) return -1;
                            // OBJ indices are 1-based; negative indices are relative to the current list end.
                            return n < 0 ? length + n : n - 1;
                        };
                        const vi = toIndex(segs[0], rawPos.length);
                        const ti = segs[1] ? toIndex(segs[1], rawUV.length) : -1;
                        const ni = segs[2] ? toIndex(segs[2], rawNrm.length) : -1;
                        return { vi, ti, ni };
                    });

                    // Resolve or create a deduplicated vertex index.
                    const resolveIdx = (r) => {
                        const key = `${r.vi}/${r.ti}/${r.ni}`;
                        if (vertexMap.has(key)) return vertexMap.get(key);
                        const idx = vertices.length;
                        const p   = rawPos[r.vi] ?? [0, 0, 0];
                        const n   = r.ni >= 0 ? (rawNrm[r.ni] ?? [0, 1, 0]) : null;
                        const uv  = r.ti >= 0 ? (rawUV[r.ti]  ?? [0, 0])    : [0, 0];
                        vertices.push({ x: p[0], y: p[1], z: p[2] });
                        // Store OBJ normal if present; otherwise placeholder (overwritten below).
                        vertexNormals.push(n ? { x: n[0], y: n[1], z: n[2] } : { x: 0, y: 0, z: 0 });
                        uvs.push([uv[0], uv[1]]);
                        vertexMap.set(key, idx);
                        return idx;
                    };

                    // Fan-triangulate if >3 verts.
                    const i0 = resolveIdx(refs[0]);
                    for (let i = 1; i < refs.length - 1; i++) {
                        const i1 = resolveIdx(refs[i]);
                        const i2 = resolveIdx(refs[i + 1]);
                        faces.push([i0, i1, i2]);
                        rawTriangles.push([i0, i1, i2]);
                    }
                    break;
                }
            }
        }

        // ── Smooth-normal pass ────────────────────────────────────────────────
        // If the OBJ had no vn lines, or we want to override with smooth normals,
        // accumulate area-weighted face normals onto each shared vertex then
        // normalize. This eliminates seam lines caused by per-face flat normals.
        const hasOBJNormals = rawNrm.length > 0;

        if (!hasOBJNormals) {
            // Accumulate face normals onto vertices.
            for (const v of vertexNormals) { v.x = 0; v.y = 0; v.z = 0; }

            for (const [i0, i1, i2] of rawTriangles) {
                const v0 = vertices[i0], v1 = vertices[i1], v2 = vertices[i2];
                // Edge vectors
                const ax = v1.x - v0.x, ay = v1.y - v0.y, az = v1.z - v0.z;
                const bx = v2.x - v0.x, by = v2.y - v0.y, bz = v2.z - v0.z;
                // Cross product (face normal, magnitude = 2 * area).
                const nx = ay * bz - az * by;
                const ny = az * bx - ax * bz;
                const nz = ax * by - ay * bx;
                vertexNormals[i0].x += nx; vertexNormals[i0].y += ny; vertexNormals[i0].z += nz;
                vertexNormals[i1].x += nx; vertexNormals[i1].y += ny; vertexNormals[i1].z += nz;
                vertexNormals[i2].x += nx; vertexNormals[i2].y += ny; vertexNormals[i2].z += nz;
            }

            // Normalize accumulated normals.
            for (const n of vertexNormals) {
                const len = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z) || 1;
                n.x /= len; n.y /= len; n.z /= len;
            }
        }

        return { vertices, faces, vertexNormals, uvs };
    }

    /**
     * @private
     * Convenience wrapper called by load() when autoFit is enabled.
     * Normalizes geometry then applies a default orientation so the model
     * faces the user (top visible, front facing camera) instead of appearing
     * edge-on or upside-down.
     *
     * OBJ files are Y-up but many exporters orient the model so its natural
     * "front" faces +Z while the camera looks down -Z. A -30 degree tilt on X
     * (rotate top toward camera) gives the canonical 3/4-view shown in the
     * target render.
     */
    static #autoFitGeometry(geo) {
        Models.#normalizeGeometry(geo);

        // ── Step 1: Rotate +90° on X ─────────────────────────────────────────
        // OBJ files are Y-up / Z-forward. Rotating +90° on X (not -90°) swings
        // the model so its length runs left-right and the top faces up on screen.
        // cos(90°) = 0, sin(90°) = 1
        const rotateXPos90 = (verts) => {
            for (const v of verts) {
                const y = -v.z;  //  0*y - 1*z = -z
                const z =  v.y;  //  1*y + 0*z =  y
                v.y = y;
                v.z = z;
            }
        };
        rotateXPos90(geo.vertices);
        rotateXPos90(geo.vertexNormals);

        // ── Step 2: Rotate 180° on Y ─────────────────────────────────────────
        // Flip so the bow points right (conventional side-profile orientation).
        // cos(180°) = -1, sin(180°) = 0  →  negate X and Z.
        const rotateY180 = (verts) => {
            for (const v of verts) {
                v.x = -v.x;
                v.z = -v.z;
            }
        };
        rotateY180(geo.vertices);
        rotateY180(geo.vertexNormals);
        // Step 3: add a small preview tilt so the top deck/interior is visible,
        // matching the reference render instead of a flat side-on silhouette.
        const tiltX = (-4 * Math.PI) / 180;
        const ct = Math.cos(tiltX), st = Math.sin(tiltX);
        const rotateXTilt = (verts) => {
            for (const v of verts) {
                const y = v.y * ct - v.z * st;
                const z = v.y * st + v.z * ct;
                v.y = y;
                v.z = z;
            }
        };
        rotateXTilt(geo.vertices);
        rotateXTilt(geo.vertexNormals);
    }
};