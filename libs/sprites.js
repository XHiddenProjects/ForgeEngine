import { Canvex } from "./canvex.js";
import { Canvas } from "./canvas.js";
import { Image } from "./image.js";
import { math } from "./math.js";
import { Helpers } from "./helpers.js";
import { Shapes } from "./shapes.js";


/**
 * Sprite system for Canvex — 2D game-object management with animation, physics-lite,
 * collision detection, and batch rendering.
 *
 * ## Quick-start
 * ```js
 * // Create a sprite from a loaded image
 * const img  = await Image.load('player.png');
 * const hero = Sprites.create({ image: img, x: 100, y: 200 });
 *
 * // Animate from a sprite sheet
 * Sprites.addAnimation(hero, 'run', { frames: [0,1,2,3], fps: 12 });
 * Sprites.playAnimation(hero, 'run');
 *
 * // Update and draw every frame
 * Sprites.update(hero, deltaTime);
 * Sprites.draw(hero);
 * ```
 *
 * ## Sprite object shape
 * Every sprite returned by {@link Sprites.create} contains at minimum:
 * ```
 * {
 *   id        : string,
 *   x, y      : number,   // world position
 *   vx, vy    : number,   // velocity (pixels/second)
 *   ax, ay    : number,   // acceleration (pixels/second²)
 *   angle     : number,   // rotation in radians
 *   scaleX, scaleY : number,
 *   alpha     : number,   // 0–1
 *   width, height  : number,
 *   anchorX, anchorY : number,  // 0–1, default 0.5 (center)
 *   visible   : boolean,
 *   active    : boolean,
 *   image     : Image|null,
 *   sheet     : SpriteSheet|null,
 *   _animations : Map,
 *   _currentAnim : string|null,
 *   _animFrame   : number,
 *   _animTimer   : number,
 *   tags         : Set<string>,
 *   data         : object,   // user-defined payload
 * }
 * ```
 */
export const Sprites = class {

    // ─── Private state ───────────────────────────────────────────────────────

    /** @type {Map<string, object>} All sprites registered with the system. */
    static _registry = new Map();

    /** @type {Map<string, object>} Named sprite groups. */
    static _groups = new Map();

    // ─── Constants ───────────────────────────────────────────────────────────

    /** Anchor preset — top-left corner. */
    static TOPLEFT   = { x: 0,   y: 0   };
    /** Anchor preset — top-center. */
    static TOPCENTER = { x: 0.5, y: 0   };
    /** Anchor preset — top-right corner. */
    static TOPRIGHT  = { x: 1,   y: 0   };
    /** Anchor preset — center-left. */
    static LEFT      = { x: 0,   y: 0.5 };
    /** Anchor preset — center (default). */
    static CENTER    = { x: 0.5, y: 0.5 };
    /** Anchor preset — center-right. */
    static RIGHT     = { x: 1,   y: 0.5 };
    /** Anchor preset — bottom-left corner. */
    static BOTTOMLEFT   = { x: 0,   y: 1 };
    /** Anchor preset — bottom-center. */
    static BOTTOMCENTER = { x: 0.5, y: 1 };
    /** Anchor preset — bottom-right corner. */
    static BOTTOMRIGHT  = { x: 1,   y: 1 };

    // ─── Internal helpers ────────────────────────────────────────────────────

    /**
     * Returns the active 2D rendering context from Canvex.
     * @private
     */
    static _ctx() {
        const ctx = Canvex?.ctx ?? null;
        if (!ctx) throw new Error("Sprites requires an active Canvex rendering context.");
        return ctx;
    }

    /**
     * Clamps a value between min and max.
     * @private
     */
    static _clamp(v, min, max) {
        return Helpers.clamp(v, min, max);
    }

    // ─── Sprite creation ─────────────────────────────────────────────────────

    /**
     * Creates a new sprite object with the supplied initial properties.
     *
     * Any property not provided falls back to a sensible default. The sprite
     * is automatically registered with the global sprite registry.
     *
     * @param {object} [options={}] Initial sprite properties.
     * @param {number}  [options.x=0]        World x-position.
     * @param {number}  [options.y=0]        World y-position.
     * @param {number}  [options.vx=0]       Horizontal velocity (px/s).
     * @param {number}  [options.vy=0]       Vertical velocity (px/s).
     * @param {number}  [options.ax=0]       Horizontal acceleration (px/s²).
     * @param {number}  [options.ay=0]       Vertical acceleration (px/s²).
     * @param {number}  [options.angle=0]    Rotation in radians.
     * @param {number}  [options.scaleX=1]   Horizontal scale factor.
     * @param {number}  [options.scaleY=1]   Vertical scale factor.
     * @param {number}  [options.alpha=1]    Opacity (0–1).
     * @param {number}  [options.width=0]    Sprite width in pixels.
     * @param {number}  [options.height=0]   Sprite height in pixels.
     * @param {number}  [options.anchorX=0.5] Horizontal anchor (0 = left, 1 = right).
     * @param {number}  [options.anchorY=0.5] Vertical anchor (0 = top, 1 = bottom).
     * @param {boolean} [options.visible=true]  Whether the sprite is drawn.
     * @param {boolean} [options.active=true]   Whether the sprite is updated.
     * @param {Image|null} [options.image=null] Image instance to render.
     * @param {object|null} [options.sheet=null] Sprite-sheet descriptor (see {@link Sprites.createSheet}).
     * @param {string[]} [options.tags=[]]      Initial tags.
     * @param {object}  [options.data={}]       Free-form user payload.
     * @param {string}  [options.id]            Custom ID; auto-generated when omitted.
     * @returns {object} The created sprite.
     *
     * @example
     * const sprite = Sprites.create({ x: 100, y: 200, width: 64, height: 64 });
     */
    static create(options = {}) {
        const img = options.image ?? null;
        const w = options.width  ?? img?.width  ?? 0;
        const h = options.height ?? img?.height ?? 0;
        const sprite = {
            id: options.id ?? Helpers.generateId({ length: 12, prefix: 'spr_'}),

            // Transform
            x: Number(options.x  ?? 0),
            y: Number(options.y  ?? 0),
            vx: Number(options.vx ?? 0),
            vy: Number(options.vy ?? 0),
            ax: Number(options.ax ?? 0),
            ay: Number(options.ay ?? 0),
            angle:  Number(options.angle  ?? 0),
            scaleX: Number(options.scaleX ?? 1),
            scaleY: Number(options.scaleY ?? 1),
            alpha:  this._clamp(Number(options.alpha ?? 1), 0, 1),

            // Dimensions
            width:   Number(w),
            height:  Number(h),
            anchorX: Number(options.anchorX ?? 0.5),
            anchorY: Number(options.anchorY ?? 0.5),

            // State flags
            visible: options.visible !== false,
            active:  options.active  !== false,
            flipX:   options.flipX   === true,
            flipY:   options.flipY   === true,

            // Visuals
            image: img,
            sheet: options.sheet ?? null,
            tint:  options.tint  ?? null,  // null | CSS color string

            // Animation internals
            _animations:  new Map(),
            _currentAnim: null,
            _animFrame:   0,
            _animTimer:   0,
            _animPlaying: false,
            _animLoop:    true,
            _animDone:    false,

            // Metadata
            tags: new Set(Array.isArray(options.tags) ? options.tags : []),
            data: options.data && typeof options.data === 'object' ? { ...options.data } : {}
        };
        this._registry.set(sprite.id, sprite);
        return sprite;
    }

    /**
     * Removes a sprite from the global registry and frees associated resources.
     *
     * @param {object|string} sprite Sprite object or its ID.
     * @returns {boolean} `true` when the sprite was found and removed.
     *
     * @example
     * Sprites.destroy(hero);
     */
    static destroy(sprite) {
        const id = typeof sprite === 'string' ? sprite : sprite?.id;
        if (!id) return false;
        return this._registry.delete(id);
    }

    /**
     * Destroys all sprites that match the supplied tag.
     *
     * @param {string} tag Tag to match.
     * @returns {number} Number of sprites destroyed.
     */
    static destroyTagged(tag) {
        let count = 0;
        for (const [id, s] of this._registry) {
            if (s.tags.has(tag)) {
                this._registry.delete(id);
                count++;
            }
        }
        return count;
    }

    /**
     * Removes all sprites from the registry.
     *
     * @returns {void}
     */
    static clear() {
        this._registry.clear();
    }

    // ─── Sprite sheets ───────────────────────────────────────────────────────

    /**
     * Creates a sprite-sheet descriptor that slices a source image into frames.
     *
     * The sheet is a plain object and can be assigned directly to a sprite's
     * `sheet` property or passed through {@link Sprites.create}.
     *
     * @param {Image} image       Source image that contains all frames.
     * @param {number} frameWidth  Width of a single frame in pixels.
     * @param {number} frameHeight Height of a single frame in pixels.
     * @param {object} [options={}]
     * @param {number} [options.columns] Number of columns; auto-computed when omitted.
     * @param {number} [options.rows]    Number of rows; auto-computed when omitted.
     * @param {number} [options.margin=0]  Gap between frames (applied to all sides).
     * @param {number} [options.spacing=0] Internal padding between frames.
     * @param {number} [options.offsetX=0] Left offset of the first frame.
     * @param {number} [options.offsetY=0] Top offset of the first frame.
     * @returns {{image:Image, frameWidth:number, frameHeight:number, columns:number, rows:number, totalFrames:number, margin:number, spacing:number, offsetX:number, offsetY:number}}
     *
     * @example
     * const sheet = Sprites.createSheet(atlas, 32, 32);
     * const sprite = Sprites.create({ sheet, width: 32, height: 32 });
     */
    static createSheet(image, frameWidth, frameHeight, options = {}) {
        if (!image) throw new TypeError("createSheet: image is required");
        if (!Number.isFinite(frameWidth)  || frameWidth  <= 0) throw new TypeError("createSheet: frameWidth must be a positive number");
        if (!Number.isFinite(frameHeight) || frameHeight <= 0) throw new TypeError("createSheet: frameHeight must be a positive number");

        const margin  = Number(options.margin  ?? 0);
        const spacing = Number(options.spacing ?? 0);
        const offsetX = Number(options.offsetX ?? 0);
        const offsetY = Number(options.offsetY ?? 0);

        const usableW = image.width  - offsetX;
        const usableH = image.height - offsetY;

        const columns = math.floor(options.columns ?? math.floor(usableW / (frameWidth  + spacing)));
        const rows    = math.floor(options.rows    ?? math.floor(usableH / (frameHeight + spacing)));

        return {
            image,
            frameWidth,
            frameHeight,
            columns: math.max(1, columns),
            rows:    math.max(1, rows),
            totalFrames: math.max(1, columns) * math.max(1, rows),
            margin,
            spacing,
            offsetX,
            offsetY
        };
    }

    /**
     * Returns the source rectangle `{ sx, sy, sw, sh }` for a given frame index
     * within a sprite sheet.
     *
     * @param {object} sheet   Sheet descriptor created by {@link Sprites.createSheet}.
     * @param {number} frame   Zero-based frame index.
     * @returns {{ sx:number, sy:number, sw:number, sh:number }}
     *
     * @example
     * const rect = Sprites.frameRect(sheet, 3);
     * ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, x, y, w, h);
     */
    static frameRect(sheet, frame) {
        const col = frame % sheet.columns;
        const row = math.floor(frame / sheet.columns);

        const sx = sheet.offsetX + col * (sheet.frameWidth  + sheet.spacing) + sheet.margin;
        const sy = sheet.offsetY + row * (sheet.frameHeight + sheet.spacing) + sheet.margin;

        return { sx, sy, sw: sheet.frameWidth, sh: sheet.frameHeight };
    }

    // ─── Animation ───────────────────────────────────────────────────────────

    /**
     * Defines a named animation on a sprite.
     *
     * @param {object}   sprite     The sprite to configure.
     * @param {string}   name       Animation name (e.g. `'run'`, `'idle'`).
     * @param {object}   config     Animation configuration.
     * @param {number[]} config.frames  Array of zero-based frame indices.
     * @param {number}   [config.fps=12]  Playback speed in frames per second.
     * @param {boolean}  [config.loop=true] Whether to loop.
     * @param {Function} [config.onComplete] Optional callback when a non-looping animation finishes.
     * @returns {object} The sprite (for chaining).
     *
     * @example
     * Sprites.addAnimation(hero, 'run', { frames: [0,1,2,3], fps: 12 });
     */
    static addAnimation(sprite, name, config = {}) {
        if (!sprite || !name) throw new TypeError("addAnimation: sprite and name are required");
        if (!Array.isArray(config.frames) || config.frames.length === 0) {
            throw new TypeError("addAnimation: config.frames must be a non-empty array");
        }

        sprite._animations.set(name, {
            frames:     config.frames,
            fps:        Number(config.fps ?? 12),
            loop:       config.loop !== false,
            onComplete: typeof config.onComplete === 'function' ? config.onComplete : null
        });

        return sprite;
    }

    /**
     * Starts or restarts a named animation on a sprite.
     *
     * @param {object}  sprite  The sprite.
     * @param {string}  name    Animation name registered via {@link Sprites.addAnimation}.
     * @param {boolean} [reset=true] If `true`, restart from frame 0 even if already playing.
     * @returns {object} The sprite (for chaining).
     *
     * @example
     * Sprites.playAnimation(hero, 'run');
     */
    static playAnimation(sprite, name, reset = true) {
        if (!sprite._animations.has(name)) {
            throw new Error(`playAnimation: animation '${name}' not found on sprite '${sprite.id}'`);
        }

        if (!reset && sprite._currentAnim === name && sprite._animPlaying) return sprite;

        const anim = sprite._animations.get(name);
        sprite._currentAnim = name;
        sprite._animFrame   = 0;
        sprite._animTimer   = 0;
        sprite._animPlaying = true;
        sprite._animLoop    = anim.loop;
        sprite._animDone    = false;

        return sprite;
    }

    /**
     * Stops the current animation and optionally resets to frame 0.
     *
     * @param {object}  sprite     The sprite.
     * @param {boolean} [reset=false] If `true`, reset to the first frame.
     * @returns {object} The sprite (for chaining).
     */
    static stopAnimation(sprite, reset = false) {
        sprite._animPlaying = false;
        if (reset) {
            sprite._animFrame = 0;
            sprite._animTimer = 0;
        }
        return sprite;
    }

    /**
     * Advances animation state by `dt` seconds.
     *
     * Called automatically by {@link Sprites.update}; call it separately only
     * if you are managing the animation tick yourself.
     *
     * @param {object} sprite The sprite.
     * @param {number} dt     Elapsed seconds since the last frame.
     * @returns {void}
     */
    static tickAnimation(sprite, dt) {
        if (!sprite._animPlaying || !sprite._currentAnim) return;

        const anim = sprite._animations.get(sprite._currentAnim);
        if (!anim || anim.fps <= 0) return;

        const frameTime = 1 / anim.fps;
        sprite._animTimer += dt;

        while (sprite._animTimer >= frameTime) {
            sprite._animTimer -= frameTime;
            sprite._animFrame++;

            if (sprite._animFrame >= anim.frames.length) {
                if (anim.loop) {
                    sprite._animFrame = 0;
                } else {
                    sprite._animFrame = anim.frames.length - 1;
                    sprite._animPlaying = false;
                    sprite._animDone    = true;
                    if (typeof anim.onComplete === 'function') anim.onComplete(sprite);
                    return;
                }
            }
        }
    }

    /**
     * Returns the current sheet-frame index that the active animation points to.
     *
     * @param {object} sprite The sprite.
     * @returns {number} Sheet frame index, or `0` when no animation is active.
     */
    static currentFrame(sprite) {
        if (!sprite._currentAnim) return 0;
        const anim = sprite._animations.get(sprite._currentAnim);
        if (!anim) return 0;
        const idx = this._clamp(sprite._animFrame, 0, anim.frames.length - 1);
        return anim.frames[idx] ?? 0;
    }

    // ─── Update ──────────────────────────────────────────────────────────────

    /**
     * Advances a sprite's physics and animation state.
     *
     * @param {object} sprite  The sprite to update.
     * @param {number} [dt=1/60] Elapsed seconds since the last frame.
     * @returns {object} The sprite (for chaining).
     *
     * @example
     * Sprites.update(hero, deltaTime);
     */
    static update(sprite, dt = 1 / 60) {
        if (!sprite.active) return sprite;

        const t = Number(dt) || 0;

        // Semi-implicit Euler integration
        sprite.vx += sprite.ax * t;
        sprite.vy += sprite.ay * t;
        sprite.x  += sprite.vx * t;
        sprite.y  += sprite.vy * t;

        this.tickAnimation(sprite, t);

        return sprite;
    }

    /**
     * Updates every sprite that is currently registered in the global registry.
     *
     * @param {number} [dt=1/60] Elapsed seconds.
     * @returns {void}
     */
    static updateAll(dt = 1 / 60) {
        for (const sprite of this._registry.values()) {
            this.update(sprite, dt);
        }
    }

    // ─── Draw ────────────────────────────────────────────────────────────────

    /**
     * Draws a sprite onto the active Canvex canvas.
     *
     * When the sprite has a `sheet` and an active animation, the correct
     * frame sub-region is extracted and drawn. When only an `image` is set,
     * the whole image is drawn. If neither is set, an outlined placeholder
     * rectangle is drawn instead (useful during development).
     *
     * @param {object}  sprite  The sprite to draw.
     * @param {number}  [overrideX] Override draw x-position (uses sprite.x when omitted).
     * @param {number}  [overrideY] Override draw y-position (uses sprite.y when omitted).
     * @returns {void}
     *
     * @example
     * Sprites.draw(hero);
     */
    static draw(sprite, overrideX, overrideY) {
        if (!sprite.visible) return;

        const ctx = this._ctx();
        const x = overrideX !== undefined ? overrideX : sprite.x;
        const y = overrideY !== undefined ? overrideY : sprite.y;

        const w = sprite.width  || (sprite.sheet?.frameWidth  ?? sprite.image?.width  ?? 0);
        const h = sprite.height || (sprite.sheet?.frameHeight ?? sprite.image?.height ?? 0);
        if (w === 0 || h === 0) return;

        const ox = w * sprite.anchorX;
        const oy = h * sprite.anchorY;
        ctx.save();

        // Position + rotation + scale via native Canvas 2D transforms
        ctx.translate(x, y);
        if (sprite.angle !== 0)  ctx.rotate(sprite.angle);
        if (sprite.scaleX !== 1 || sprite.scaleY !== 1) ctx.scale(sprite.scaleX, sprite.scaleY);
        if (sprite.flipX || sprite.flipY) ctx.scale(sprite.flipX ? -1 : 1, sprite.flipY ? -1 : 1);

        // Alpha
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = prevAlpha * this._clamp(sprite.alpha, 0, 1);

        // Draw
        if (sprite.sheet) {
            this._drawSheet(ctx, sprite, -ox, -oy, w, h);
        } else if (sprite.image) {
            this._drawImage(ctx, sprite, -ox, -oy, w, h);
        } else {
            this._drawPlaceholder(ctx, -ox, -oy, w, h);
        }

        ctx.globalAlpha = prevAlpha;
        ctx.restore();
    }

    /**
     * Draws every sprite in the global registry, sorted by `sprite.data.zIndex`
     * (ascending, default 0) so higher layers render on top.
     *
     * @returns {void}
     */
    static drawAll() {
        const list = [...this._registry.values()].sort(
            (a, b) => (a.data.zIndex ?? 0) - (b.data.zIndex ?? 0)
        );
        for (const sprite of list) this.draw(sprite);
    }

    /** @private */
    static _drawSheet(ctx, sprite, dx, dy, dw, dh) {
        const sheet = sprite.sheet;
        const frame = this.currentFrame(sprite);
        const { sx, sy, sw, sh } = this.frameRect(sheet, frame);
        this._drawImageRegion(ctx, sheet.image, sx, sy, sw, sh, dx, dy, dw, dh, sprite.tint);
    }

    /** @private */
    static _drawImage(ctx, sprite, dx, dy, dw, dh) {
        this._drawImageRegion(ctx, sprite.image, 0, 0, sprite.image.width, sprite.image.height, dx, dy, dw, dh, sprite.tint);
    }

    /**
     * Draws a region of a Canvex `Image` instance onto the canvas, with optional tint.
     *
     * Sprites route image rendering through `Shapes.Image()` so sprite drawing stays
     * aligned with the shared Canvex image API instead of bypassing it with direct
     * `ctx.drawImage()` calls. Sprite-sheet frames and tinted sprites are converted
     * into temporary Canvex Image objects, then handed to `Shapes.Image()`.
     *
     * @private
     */
    static _drawImageRegion(ctx, img, sx, sy, sw, sh, dx, dy, dw, dh, tint) {
        this._ensureImageCanvas(img);

        const usesWholeImage =
            !tint &&
            sx === 0 &&
            sy === 0 &&
            sw === img.width &&
            sh === img.height;

        if (usesWholeImage) {
            this._drawViaShapesImage(img, dx, dy, dw, dh);
            return;
        }

        const temp = document.createElement('canvas');
        temp.width = sw;
        temp.height = sh;

        const tempCtx = temp.getContext('2d');
        tempCtx.drawImage(img._canvas, sx, sy, sw, sh, 0, 0, sw, sh);

        if (tint) {
            tempCtx.globalCompositeOperation = 'multiply';
            tempCtx.fillStyle = tint;
            tempCtx.fillRect(0, 0, sw, sh);
            tempCtx.globalCompositeOperation = 'destination-in';
            tempCtx.drawImage(img._canvas, sx, sy, sw, sh, 0, 0, sw, sh);
            tempCtx.globalCompositeOperation = 'source-over';
        }

        this._drawViaShapesImage(this._imageFromCanvas(temp), dx, dy, dw, dh);
    }

    /**
     * Ensures a Canvex Image has a backing canvas that can be cropped/tinted.
     * @private
     */
    static _ensureImageCanvas(img) {
        if (!img) {
            throw new TypeError("Sprites._ensureImageCanvas: img is null/undefined");
        }
        if (img._canvas && img._ctx) return img;

        const w = img.width ?? img.naturalWidth ?? 0;
        const h = img.height ?? img.naturalHeight ?? 0;
        if (!w || !h) {
            throw new Error("Sprites._ensureImageCanvas: image has no size (not loaded yet?)");
        }

        img._canvas = document.createElement("canvas");
        img._canvas.width = w;
        img._canvas.height = h;

        img._ctx = img._canvas.getContext("2d", { willReadFrequently: true });

        // If it's a Canvex Image (has pixels), use the fast path
        if (img.pixels && img.pixels.length === w * h * 4) {
            const imageData = img._ctx.createImageData(w, h);
            imageData.data.set(img.pixels);
            img._ctx.putImageData(imageData, 0, 0);
            return img;
        }

        // Fallback: HTMLImageElement / HTMLCanvasElement / ImageBitmap → draw & read pixels
        try {
            img._ctx.clearRect(0, 0, w, h);
            img._ctx.drawImage(img, 0, 0, w, h);
            img.pixels = img._ctx.getImageData(0, 0, w, h).data;
        } catch (e) {
            // This can happen if the image is not loaded OR is cross-origin tainted
            throw new Error(
            "Sprites._ensureImageCanvas: couldn't read pixels from image. " +
            "Make sure it's loaded and not cross-origin without CORS. Original: " + e.message
            );
        }

        return img;
    }

    /**
     * Converts a canvas into a Canvex Image object for use with Shapes.Image().
     * @private
     */
    static _imageFromCanvas(canvas) {
        const out = new Image();
        out.width = canvas.width;
        out.height = canvas.height;
        out._canvas = canvas;
        out._ctx = canvas.getContext('2d');
        out.pixels = out._ctx.getImageData(0, 0, out.width, out.height).data;
        return out;
    }

    /**
     * Draws through Shapes.Image while preserving the active sprite transform.
     *
     * Image._draw() uses putImageData when the destination size exactly equals
     * the source size. putImageData ignores the canvas transform matrix and alpha,
     * which breaks rotated/scaled/flipped sprites. Wrapping equal dimensions in
     * Number objects keeps the visual size the same but makes Image._draw() take
     * its transform-aware drawImage branch.
     *
     * @private
     */
    static _drawViaShapesImage(img, x, y, w, h) {
        const drawW = w === img.width ? new Number(w) : w;
        const drawH = h === img.height ? new Number(h) : h;
        Shapes.Image(img, x, y, drawW, drawH);
    }

    /** @private — draws an outlined debug placeholder */
    static _drawPlaceholder(ctx, x, y, w, h) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,0,255,0.8)';
        ctx.fillStyle   = 'rgba(255,0,255,0.12)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();
        // Cross
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y + h);
        ctx.moveTo(x + w, y);
        ctx.lineTo(x, y + h);
        ctx.stroke();
        ctx.restore();
    }

    // ─── Collision ───────────────────────────────────────────────────────────

    /**
     * Returns the axis-aligned bounding box of a sprite in world space.
     *
     * @param {object} sprite The sprite.
     * @returns {{ x:number, y:number, w:number, h:number, left:number, top:number, right:number, bottom:number }}
     *
     * @example
     * const box = Sprites.bounds(hero);
     * if (box.left < 0) hero.x -= box.left; // wall clamp
     */
    static bounds(sprite) {
        const w = sprite.width  * math.abs(sprite.scaleX);
        const h = sprite.height * math.abs(sprite.scaleY);
        const left   = sprite.x - w * sprite.anchorX;
        const top    = sprite.y - h * sprite.anchorY;
        const right  = left + w;
        const bottom = top  + h;

        return { x: left, y: top, w, h, left, top, right, bottom };
    }

    /**
     * Tests whether two sprites' AABBs overlap.
     *
     * @param {object} a First sprite.
     * @param {object} b Second sprite.
     * @returns {boolean} `true` when the sprites are overlapping.
     *
     * @example
     * if (Sprites.overlaps(hero, enemy)) { takeDamage(); }
     */
    static overlaps(a, b) {
        const ba = this.bounds(a);
        const bb = this.bounds(b);
        return (
            ba.left   < bb.right  &&
            ba.right  > bb.left   &&
            ba.top    < bb.bottom &&
            ba.bottom > bb.top
        );
    }

    /**
     * Tests whether sprite `a` fully contains sprite `b`.
     *
     * @param {object} a Outer sprite.
     * @param {object} b Inner sprite.
     * @returns {boolean}
     */
    static contains(a, b) {
        const ba = this.bounds(a);
        const bb = this.bounds(b);
        return (
            ba.left  <= bb.left  &&
            ba.right >= bb.right &&
            ba.top   <= bb.top   &&
            ba.bottom >= bb.bottom
        );
    }

    /**
     * Tests whether a world-space point is inside a sprite's AABB.
     *
     * @param {object} sprite The sprite.
     * @param {number} px     World x-coordinate.
     * @param {number} py     World y-coordinate.
     * @returns {boolean}
     *
     * @example
     * if (Sprites.hitTest(button, mouseX, mouseY)) { onClick(); }
     */
    static hitTest(sprite, px, py) {
        const b = this.bounds(sprite);
        return px >= b.left && px <= b.right && py >= b.top && py <= b.bottom;
    }

    /**
     * Computes the overlap vector between two AABB sprites.
     *
     * Returns `null` when they are not overlapping, or an object
     * `{ dx, dy }` representing the minimum translation to separate them.
     *
     * @param {object} a First sprite.
     * @param {object} b Second sprite.
     * @returns {{ dx:number, dy:number }|null}
     */
    static overlap(a, b) {
        const ba = this.bounds(a);
        const bb = this.bounds(b);

        const overlapX = math.min(ba.right, bb.right) - math.max(ba.left, bb.left);
        const overlapY = math.min(ba.bottom, bb.bottom) - math.max(ba.top, bb.top);

        if (overlapX <= 0 || overlapY <= 0) return null;

        const dx = ba.x + ba.w / 2 < bb.x + bb.w / 2 ? -overlapX : overlapX;
        const dy = ba.y + ba.h / 2 < bb.y + bb.h / 2 ? -overlapY : overlapY;

        return math.abs(dx) <= math.abs(dy) ? { dx, dy: 0 } : { dx: 0, dy };
    }

    /**
     * Resolves the overlap between two sprites by nudging sprite `a` out of `b`.
     *
     * @param {object} a The sprite to move.
     * @param {object} b The immovable obstacle.
     * @returns {object} The modified sprite `a`.
     */
    static resolveCollision(a, b) {
        const ov = this.overlap(a, b);
        if (ov) {
            a.x += ov.dx;
            a.y += ov.dy;
            // Zero out the relevant velocity component
            if (ov.dx !== 0) a.vx = 0;
            if (ov.dy !== 0) a.vy = 0;
        }
        return a;
    }

    // ─── Groups ──────────────────────────────────────────────────────────────

    /**
     * Creates or retrieves a named sprite group.
     *
     * Groups are lightweight arrays with helper methods for bulk operations.
     *
     * @param {string} name Group name.
     * @returns {object[]} The group array.
     *
     * @example
     * const enemies = Sprites.group('enemies');
     * enemies.push(Sprites.create({ x: 300, y: 100 }));
     */
    static group(name) {
        if (!this._groups.has(name)) this._groups.set(name, []);
        return this._groups.get(name);
    }

    /**
     * Runs {@link Sprites.update} on every sprite in the named group.
     *
     * @param {string} name Group name.
     * @param {number} [dt=1/60] Delta-time in seconds.
     * @returns {void}
     */
    static updateGroup(name, dt = 1 / 60) {
        const g = this._groups.get(name);
        if (!g) return;
        for (const sprite of g) this.update(sprite, dt);
    }

    /**
     * Runs {@link Sprites.draw} on every sprite in the named group.
     *
     * @param {string} name Group name.
     * @returns {void}
     */
    static drawGroup(name) {
        const g = this._groups.get(name);
        if (!g) return;
        for (const sprite of g) this.draw(sprite);
    }

    /**
     * Checks every pair of sprites in `groupA` against every sprite in
     * `groupB` and calls `callback(a, b)` for each overlapping pair.
     *
     * @param {object[]|string} groupA First group (array or name).
     * @param {object[]|string} groupB Second group (array or name).
     * @param {Function} callback Called with `(spriteA, spriteB)` per collision.
     * @returns {void}
     *
     * @example
     * Sprites.collideGroups('bullets', 'enemies', (bullet, enemy) => {
     *     Sprites.destroy(bullet);
     *     Sprites.destroy(enemy);
     * });
     */
    static collideGroups(groupA, groupB, callback) {
        const a = typeof groupA === 'string' ? (this._groups.get(groupA) ?? []) : groupA;
        const b = typeof groupB === 'string' ? (this._groups.get(groupB) ?? []) : groupB;
        for (const sa of a) {
            for (const sb of b) {
                if (this.overlaps(sa, sb)) callback(sa, sb);
            }
        }
    }

    // ─── Query helpers ───────────────────────────────────────────────────────

    /**
     * Returns all registered sprites that carry the specified tag.
     *
     * @param {string} tag Tag to filter by.
     * @returns {object[]} Matching sprites.
     */
    static getByTag(tag) {
        const results = [];
        for (const sprite of this._registry.values()) {
            if (sprite.tags.has(tag)) results.push(sprite);
        }
        return results;
    }

    /**
     * Returns the sprite from the registry with the given ID, or `null`.
     *
     * @param {string} id Sprite ID.
     * @returns {object|null}
     */
    static getById(id) {
        return this._registry.get(id) ?? null;
    }

    /**
     * Returns all registered sprites as an array.
     *
     * @returns {object[]}
     */
    static getAll() {
        return [...this._registry.values()];
    }

    // ─── Utility / transform helpers ─────────────────────────────────────────

    /**
     * Moves a sprite toward a target position at the given speed (px/s).
     *
     * @param {object} sprite    The sprite to move.
     * @param {number} targetX   Destination x.
     * @param {number} targetY   Destination y.
     * @param {number} speed     Maximum pixels per second.
     * @param {number} [dt=1/60] Elapsed seconds.
     * @returns {boolean} `true` when the sprite has arrived (within `speed * dt`).
     *
     * @example
     * const arrived = Sprites.moveToward(hero, 400, 300, 120, dt);
     */
    static moveToward(sprite, targetX, targetY, speed, dt = 1 / 60) {
        const dx = targetX - sprite.x;
        const dy = targetY - sprite.y;
        const dist = math.dist(sprite.x, sprite.y, targetX, targetY);
        const step = speed * dt;

        if (dist <= step) {
            sprite.x = targetX;
            sprite.y = targetY;
            sprite.vx = 0;
            sprite.vy = 0;
            return true;
        }

        sprite.x += (dx / dist) * step;
        sprite.y += (dy / dist) * step;
        return false;
    }

    /**
     * Rotates the sprite to face a target world-space point.
     *
     * @param {object} sprite  The sprite.
     * @param {number} targetX Target x-coordinate.
     * @param {number} targetY Target y-coordinate.
     * @param {number} [offset=0] Additional angle offset in radians.
     * @returns {void}
     */
    static lookAt(sprite, targetX, targetY, offset = 0) {
        sprite.angle = math.atan2(targetY - sprite.y, targetX - sprite.x) + offset;
    }

    /**
     * Applies a velocity impulse in the sprite's current facing direction.
     *
     * @param {object} sprite The sprite.
     * @param {number} force  Impulse magnitude in pixels per second.
     * @returns {void}
     *
     * @example
     * Sprites.thrust(hero, 200); // shoot forward
     */
    static thrust(sprite, force) {
        sprite.vx += math.cos(sprite.angle) * force;
        sprite.vy += math.sin(sprite.angle) * force;
    }

    /**
     * Applies friction/drag to a sprite's velocity each frame.
     *
     * @param {object} sprite    The sprite.
     * @param {number} friction  Value in `[0, 1]`; 0 = full stop, 1 = no damping.
     * @returns {void}
     *
     * @example
     * Sprites.applyFriction(hero, 0.92); // smooth deceleration
     */
    static applyFriction(sprite, friction) {
        const f = this._clamp(Number(friction), 0, 1);
        sprite.vx *= f;
        sprite.vy *= f;
    }

    /**
     * Wraps a sprite's position so it re-enters from the opposite edge when it
     * leaves the canvas (or the supplied bounds).
     *
     * @param {object} sprite   The sprite.
     * @param {number} [left=0]    Left boundary.
     * @param {number} [top=0]     Top boundary.
     * @param {number} [right]     Right boundary (defaults to canvas width).
     * @param {number} [bottom]    Bottom boundary (defaults to canvas height).
     * @returns {void}
     *
     * @example
     * Sprites.wrapEdges(asteroid); // torus wrap using canvas size
     */
    static wrapEdges(sprite, left = 0, top = 0, right, bottom) {
        const cw = Canvex?.width  ?? Canvex?.canvas?.width  ?? 600;
        const ch = Canvex?.height ?? Canvex?.canvas?.height ?? 400;
        const r = right  ?? cw;
        const b = bottom ?? ch;
        const w = r - left;
        const h = b - top;

        if (sprite.x < left) sprite.x += w;
        else if (sprite.x > r) sprite.x -= w;

        if (sprite.y < top)  sprite.y += h;
        else if (sprite.y > b) sprite.y -= h;
    }

    /**
     * Clamps a sprite's position so it stays inside the supplied rectangle.
     *
     * @param {object} sprite   The sprite.
     * @param {number} [left=0]  Left boundary.
     * @param {number} [top=0]   Top boundary.
     * @param {number} [right]   Right boundary (defaults to canvas width).
     * @param {number} [bottom]  Bottom boundary (defaults to canvas height).
     * @returns {void}
     *
     * @example
     * Sprites.clampEdges(hero); // keep player inside canvas
     */
    static clampEdges(sprite, left = 0, top = 0, right, bottom) {
        const cw = Canvex?.width  ?? Canvex?.canvas?.width  ?? 600;
        const ch = Canvex?.height ?? Canvex?.canvas?.height ?? 400;
        const r = right  ?? cw;
        const b = bottom ?? ch;

        const hw = (sprite.width  * math.abs(sprite.scaleX)) * sprite.anchorX;
        const hh = (sprite.height * math.abs(sprite.scaleY)) * sprite.anchorY;

        sprite.x = this._clamp(sprite.x, left + hw, r - (sprite.width  * math.abs(sprite.scaleX) - hw));
        sprite.y = this._clamp(sprite.y, top  + hh, b - (sprite.height * math.abs(sprite.scaleY) - hh));
    }

    // ─── Distance / angle utilities ──────────────────────────────────────────

    /**
     * Returns the Euclidean distance between two sprites' positions.
     *
     * @param {object} a First sprite.
     * @param {object} b Second sprite.
     * @returns {number}
     */
    static distance(a, b) {
        return math.dist(a.x, a.y, b.x, b.y);
    }

    /**
     * Returns the angle in radians from sprite `a` to sprite `b`.
     *
     * @param {object} a Source sprite.
     * @param {object} b Target sprite.
     * @returns {number} Angle in radians.
     */
    static angleTo(a, b) {
        return math.atan2(b.y - a.y, b.x - a.x);
    }

    // ─── Tween / fade helpers ────────────────────────────────────────────────

    /**
     * Immediately sets a sprite's alpha.
     *
     * @param {object} sprite The sprite.
     * @param {number} alpha  Target opacity (0–1).
     * @returns {object} The sprite.
     */
    static setAlpha(sprite, alpha) {
        sprite.alpha = this._clamp(Number(alpha), 0, 1);
        return sprite;
    }

    /**
     * Fades a sprite's alpha toward `target` at `speed` per second.
     *
     * Returns `true` when the target has been reached.
     *
     * @param {object} sprite    The sprite.
     * @param {number} target    Target alpha (0–1).
     * @param {number} speed     Rate of change per second.
     * @param {number} [dt=1/60] Elapsed seconds.
     * @returns {boolean} `true` when alpha equals target.
     *
     * @example
     * // Fade hero out over ~0.5 s
     * const done = Sprites.fadeAlpha(hero, 0, 2, dt);
     * if (done) Sprites.destroy(hero);
     */
    static fadeAlpha(sprite, target, speed, dt = 1 / 60) {
        const diff = target - sprite.alpha;
        const step = speed * dt;

        if (math.abs(diff) <= step) {
            sprite.alpha = this._clamp(target, 0, 1);
            return true;
        }

        sprite.alpha = this._clamp(sprite.alpha + Math.sign(diff) * step, 0, 1);
        return false;
    }

    /**
     * Scales a sprite toward a target scale at the given speed per second.
     *
     * @param {object} sprite    The sprite.
     * @param {number} targetScale Target uniform scale.
     * @param {number} speed     Rate of change per second.
     * @param {number} [dt=1/60] Elapsed seconds.
     * @returns {boolean} `true` when target is reached.
     */
    static scaleTo(sprite, targetScale, speed, dt = 1 / 60) {
        const diffX = targetScale - sprite.scaleX;
        const diffY = targetScale - sprite.scaleY;
        const step  = speed * dt;

        const doneX = math.abs(diffX) <= step;
        const doneY = math.abs(diffY) <= step;

        sprite.scaleX = doneX ? targetScale : sprite.scaleX + Math.sign(diffX) * step;
        sprite.scaleY = doneY ? targetScale : sprite.scaleY + Math.sign(diffY) * step;

        return doneX && doneY;
    }

    // ─── PixelArt integration ────────────────────────────────────────────────

    /**
     * Creates a sprite from a `PixelArt` editor instance using its current frame.
     *
     * Internally calls `pixelArt.toImage(scale)` to get an `HTMLImageElement`,
     * then forwards it to {@link Sprites.create} along with any extra options.
     *
     * @param {PixelArt} pixelArt  A `PixelArt` instance.
     * @param {object}   [options={}]  Any {@link Sprites.create} options.
     * @param {number}   [options.scale=1]  Integer pixel-upscale factor (e.g. 4 → 4× larger).
     * @returns {Promise<object>} Resolves to the created sprite.
     *
     * @example
     * const hero = await Sprites.createFromPixelArt(editor, { x: 100, y: 200, scale: 4 });
     * Sprites.draw(hero);
     */
    static async createFromPixelArt(pixelArt, options = {}) {
        if (typeof pixelArt?.toImage !== "function") {
            throw new TypeError("createFromPixelArt: first argument must be a PixelArt instance with a toImage() method");
        }
        const scale = options.scale ?? 1;
        const img   = await pixelArt.toImage(scale);
        const { scale: _s, ...rest } = options; // strip scale from sprite options
        return this.create({ image: img, width: img.width, height: img.height, ...rest });
    }

    /**
     * Creates a sprite backed by an animated sprite-sheet built from ALL frames
     * of a `PixelArt` editor instance.
     *
     * The method calls `pixelArt.toSpriteSheet(scale)`, builds a sheet descriptor
     * via {@link Sprites.createSheet}, defines a default `'default'` animation
     * covering all frames, and plays it immediately.
     *
     * @param {PixelArt} pixelArt  A `PixelArt` instance.
     * @param {object}   [options={}]
     * @param {number}   [options.scale=1]    Integer pixel-upscale factor.
     * @param {number}   [options.fps]        Animation FPS (falls back to the editor's FPS setting when omitted).
     * @param {boolean}  [options.loop=true]  Whether the animation loops.
     * @param {string}   [options.animName='default']  Name of the auto-created animation.
     * @param   ...rest  Any remaining {@link Sprites.create} options (x, y, alpha, etc.).
     * @returns {Promise<object>} Resolves to the created sprite.
     *
     * @example
     * // Pixel-art editor with 4 walk frames → animated sprite at 8 fps
     * const hero = await Sprites.createAnimatedFromPixelArt(editor, {
     *   x: 200, y: 300, scale: 4, fps: 8,
     * });
     */
    static async createAnimatedFromPixelArt(pixelArt, options = {}) {
        if (typeof pixelArt?.toSpriteSheet !== "function") {
            throw new TypeError("createAnimatedFromPixelArt: first argument must be a PixelArt instance with a toSpriteSheet() method");
        }
        const { scale = 1, fps, loop = true, animName = "default", ...spriteOptions } = options;

        const { image, frameWidth, frameHeight, frameCount } = await pixelArt.toSpriteSheet(scale);
        const sheet = this.createSheet(image, frameWidth, frameHeight);

        const sprite = this.create({
            image,
            sheet,
            width:  frameWidth,
            height: frameHeight,
            ...spriteOptions,
        });

        const animFps = fps ?? (typeof pixelArt._fps === "number" ? pixelArt._fps : 8);
        const frames  = Array.from({ length: frameCount }, (_, i) => i);
        this.addAnimation(sprite, animName, { frames, fps: animFps, loop });
        this.playAnimation(sprite, animName);

        return sprite;
    }

    // ─── Clone ───────────────────────────────────────────────────────────────

    /**
     * Creates a shallow clone of a sprite with a new unique ID.
     *
     * The clone inherits all properties, animations, and tags from the source
     * but starts with independent velocity, animation state, and data payload.
     *
     * @param {object} sprite     The sprite to clone.
     * @param {object} [overrides={}] Properties to override on the new sprite.
     * @returns {object} The cloned sprite.
     *
     * @example
     * const bullet = Sprites.clone(bulletTemplate, { x: hero.x, y: hero.y });
     */
    static clone(sprite, overrides = {}) {
        const copy = { ...sprite, ...overrides };
        copy.id = Helpers.generateId({ length: 12, prefix: 'spr_' });

        // Deep-copy mutable internals
        copy._animations = new Map(sprite._animations);
        copy.tags = new Set(sprite.tags);
        copy.data = { ...sprite.data, ...(overrides.data ?? {}) };

        this._registry.set(copy.id, copy);
        return copy;
    }
};
