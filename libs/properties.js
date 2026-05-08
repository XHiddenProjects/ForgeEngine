import { Canvex } from "./canvex.js";
import { Canvas } from "./canvas.js";
import { Image } from "./image.js";
import { math } from "./math.js";
import { Helpers } from "./helpers.js";
import { Color } from "./color.js";
import { Camera } from "./camera.js";

export const Properties = class {

    // =========================================================================
    // SIZE
    // Sets the size of an object by percentage, or explicit x/y pixel values.
    // =========================================================================

    /**
     * Sets or gets the size of an object.
     *
     * Supports three modes:
     * - `percentage`: scales both axes uniformly by a percentage (e.g. 150 = 150%).
     * - `x`: sets only the horizontal size in pixels.
     * - `y`: sets only the vertical size in pixels.
     *
     * @param {object} obj - The target object. Must have `width` and `height` properties.
     * @param {{ percentage?: number, x?: number, y?: number }} options - Size options.
     * @returns {{ percentage: number|null, x: number, y: number }} The resulting size values.
     *
     * @example
     * Properties.size(obj, { percentage: 200 });   // double the original size
     * Properties.size(obj, { x: 64 });              // set width only
     * Properties.size(obj, { y: 32 });              // set height only
     */
    static size(obj, options = {}) {
        const { percentage, x, y } = options;

        if (typeof percentage === "number") {
            const scale = percentage / 100;
            if (obj._originalWidth  == null) obj._originalWidth  = obj.width  ?? 0;
            if (obj._originalHeight == null) obj._originalHeight = obj.height ?? 0;
            obj.width  = obj._originalWidth  * scale;
            obj.height = obj._originalHeight * scale;
        }

        if (typeof x === "number") obj.width  = x;
        if (typeof y === "number") obj.height = y;

        const resultPct =
            (obj._originalWidth != null && obj._originalWidth !== 0)
                ? (obj.width / obj._originalWidth) * 100
                : null;

        return {
            percentage: resultPct,
            x: obj.width  ?? 0,
            y: obj.height ?? 0,
        };
    }

    // =========================================================================
    // ENABLED
    // Enables or disables physics simulation for an object.
    // =========================================================================

    /**
     * Enables or disables physics on an object.
     *
     * When disabled the object is treated as a static, immovable body:
     * velocity and spin are zeroed and the `physicsEnabled` flag is set to false.
     *
     * @param {object}  obj     - The target object.
     * @param {boolean} enabled - `true` to enable physics, `false` to disable.
     * @returns {boolean} The new physics-enabled state.
     *
     * @example
     * Properties.enabled(obj, false); // freeze object in place
     * Properties.enabled(obj, true);  // restore physics
     */
    static enabled(obj, enabled) {
        obj.physicsEnabled = Boolean(enabled);

        if (!obj.physicsEnabled) {
            obj.velocityX  = 0;
            obj.velocityY  = 0;
            obj.spinSpeed  = 0;
        }

        return obj.physicsEnabled;
    }

    // =========================================================================
    // ANIMATION
    // Controls frame-based sprite animation: play, stop, and go-to.
    // =========================================================================

    /**
     * Controls sprite animation playback.
     *
     * @param {object} obj - The target object. Expected animation fields:
     *   `frameIndex`, `frameCount`, `animationPlaying`, `animationLoop`,
     *   `animationPriority`, `animationStayOnLastFrame`.
     * @param {"play"|"stop"|"goto"} action - The action to perform.
     * @param {{
     *   frame?: number,
     *   loop?: boolean,
     *   stayOnLastFrame?: boolean,
     *   priority?: number
     * }} [options={}] - Additional options.
     * @returns {{ playing: boolean, done: boolean, frame: number }}
     *
     * @example
     * Properties.animation(obj, "play", { loop: true });
     * Properties.animation(obj, "stop");
     * Properties.animation(obj, "goto", { frame: 3 });
     */
    static animation(obj, action, options = {}) {
        const {
            frame            = 0,
            loop             = obj.animationLoop             ?? false,
            stayOnLastFrame  = obj.animationStayOnLastFrame  ?? false,
            priority         = obj.animationPriority         ?? 0,
        } = options;

        // Persist configurable options regardless of action
        obj.animationLoop            = loop;
        obj.animationStayOnLastFrame = stayOnLastFrame;
        obj.animationPriority        = priority;

        switch (action) {
            case "play":
                obj.animationPlaying = true;
                break;

            case "stop":
                obj.animationPlaying = false;
                if (!stayOnLastFrame) obj.frameIndex = 0;
                break;

            case "goto": {
                const frameCount = obj.frameCount ?? 1;
                obj.frameIndex   = Helpers.clamp(Math.floor(frame), 0, frameCount - 1);
                break;
            }

            default:
                throw new Error(`Properties.animation: unknown action "${action}". Use "play", "stop", or "goto".`);
        }

        const frameCount = obj.frameCount ?? 1;
        const done = !obj.animationLoop &&
                     obj.frameIndex >= frameCount - 1 &&
                     !obj.animationPlaying;

        return {
            playing: Boolean(obj.animationPlaying),
            done,
            frame:   obj.frameIndex ?? 0,
        };
    }

    // =========================================================================
    // VELOCITY
    // Sets linear velocity on an object (x, y, or forward relative to rotation).
    // =========================================================================

    /**
     * Sets the velocity of an object.
     *
     * `forward` applies speed in the direction the object is currently facing
     * (using `obj.rotation` in degrees). It is added on top of any explicit
     * `x` / `y` values supplied in the same call.
     *
     * @param {object} obj - The target object. Expected fields:
     *   `velocityX`, `velocityY`, `rotation` (degrees, 0 = right).
     * @param {{ x?: number, y?: number, forward?: number }} options - Velocity components.
     * @returns {{ x: number, y: number, forward: number }}
     *
     * @example
     * Properties.velocity(obj, { x: 5, y: -3 });
     * Properties.velocity(obj, { forward: 8 }); // move in facing direction
     */
    static velocity(obj, options = {}) {
        const { x, y, forward } = options;

        if (typeof x       === "number") obj.velocityX = x;
        if (typeof y       === "number") obj.velocityY = y;

        if (typeof forward === "number") {
            const rad       = math.radians(obj.rotation ?? 0);
            obj.velocityX   = (obj.velocityX ?? 0) + Math.cos(rad) * forward;
            obj.velocityY   = (obj.velocityY ?? 0) + Math.sin(rad) * forward;
        }

        const fwdSpeed = Math.hypot(obj.velocityX ?? 0, obj.velocityY ?? 0);

        return {
            x:       obj.velocityX ?? 0,
            y:       obj.velocityY ?? 0,
            forward: fwdSpeed,
        };
    }

    // =========================================================================
    // SPIN
    // Sets the angular (spin) velocity of an object in rotations per second.
    // =========================================================================

    /**
     * Sets the spin (rotational velocity) of an object.
     *
     * @param {object} obj        - The target object. Expected field: `spinSpeed`.
     * @param {number} rps        - Rotations per second (positive = clockwise).
     * @returns {number} The resulting spin speed.
     *
     * @example
     * Properties.spin(obj, 2);   // two full rotations per second
     * Properties.spin(obj, -1);  // one rotation per second counter-clockwise
     */
    static spin(obj, rps) {
        obj.spinSpeed = Number(rps) || 0;
        return obj.spinSpeed;
    }

    // =========================================================================
    // MATERIAL
    // Sets and reads physics material properties: friction, bounciness, density.
    // =========================================================================

    /**
     * Sets physics material properties on an object.
     *
     * All values are optional — only the keys you supply will be updated.
     *
     * @param {object} obj - The target object.
     * @param {{
     *   friction?: number,
     *   bounce?:   number,
     *   density?:  number
     * }} [options={}] - Material options.
     *   - `friction` – surface friction coefficient [0, 1].
     *   - `bounce`   – restitution / bounciness [0, 1].
     *   - `density`  – mass per unit area (≥ 0).
     * @returns {{ friction: number, bounce: number, density: number }}
     *
     * @example
     * Properties.material(obj, { friction: 0.4, bounce: 0.8 });
     */
    static material(obj, options = {}) {
        const { friction, bounce, density } = options;

        if (typeof friction === "number") obj.friction = Helpers.clamp(friction, 0, 1);
        if (typeof bounce   === "number") obj.bounce   = Helpers.clamp(bounce,   0, 1);
        if (typeof density  === "number") obj.density  = Math.max(0, density);

        return {
            friction: obj.friction ?? 0,
            bounce:   obj.bounce   ?? 0,
            density:  obj.density  ?? 1,
        };
    }

    // =========================================================================
    // FLIP
    // Flips an object horizontally or vertically, with lock and sprite-only modes.
    // =========================================================================

    /**
     * Controls the horizontal and/or vertical flip state of an object.
     *
     * Actions per axis:
     * - `"flip"`   – force the flipped (mirrored) state.
     * - `"back"`   – force the un-flipped (normal) state.
     * - `"toggle"` – invert the current state.
     *
     * Options:
     * - `lock`        – when `true`, all subsequent flip calls on this object are ignored.
     * - `spriteOnly`  – when `true`, only the rendered sprite is flipped; the physics
     *                   body / hitbox is unaffected.
     *
     * @param {object} obj - The target object. Expected fields:
     *   `flipX`, `flipY`, `flipLocked`, `spriteOnlyFlip`.
     * @param {{
     *   horizontal?: "flip"|"back"|"toggle",
     *   vertical?:   "flip"|"back"|"toggle",
     *   lock?:       boolean,
     *   spriteOnly?: boolean
     * }} [options={}]
     * @returns {{ flipX: boolean, flipY: boolean, locked: boolean, spriteOnly: boolean }}
     *
     * @example
     * Properties.flip(obj, { horizontal: "toggle" });
     * Properties.flip(obj, { vertical: "flip", spriteOnly: true });
     * Properties.flip(obj, { lock: true }); // prevent further flipping
     */
    static flip(obj, options = {}) {
        const { horizontal, vertical, lock, spriteOnly } = options;

        if (typeof lock       === "boolean") obj.flipLocked    = lock;
        if (typeof spriteOnly === "boolean") obj.spriteOnlyFlip = spriteOnly;

        if (obj.flipLocked) {
            return {
                flipX:      Boolean(obj.flipX),
                flipY:      Boolean(obj.flipY),
                locked:     true,
                spriteOnly: Boolean(obj.spriteOnlyFlip),
            };
        }

        const applyAxis = (current, action) => {
            switch (action) {
                case "flip":   return true;
                case "back":   return false;
                case "toggle": return !current;
                default:
                    throw new Error(`Properties.flip: unknown action "${action}". Use "flip", "back", or "toggle".`);
            }
        };

        if (horizontal != null) obj.flipX = applyAxis(Boolean(obj.flipX), horizontal);
        if (vertical   != null) obj.flipY = applyAxis(Boolean(obj.flipY), vertical);

        return {
            flipX:      Boolean(obj.flipX),
            flipY:      Boolean(obj.flipY),
            locked:     Boolean(obj.flipLocked),
            spriteOnly: Boolean(obj.spriteOnlyFlip),
        };
    }

    // =========================================================================
    // EXTRACTOR
    // Reads a single named property from an object without mutating it.
    // =========================================================================

    /**
     * Extracts a named value from an object.
     *
     * Built-in keys:
     * | Key             | Description                                      |
     * |-----------------|--------------------------------------------------|
     * | `"x"`           | X position in pixels                             |
     * | `"y"`           | Y position in pixels                             |
     * | `"alpha"`       | Transparency 0–100                               |
     * | `"rotation"`    | Rotation in degrees                              |
     * | `"spinSpeed"`   | Spin speed in rotations per second               |
     * | `"velocityX"`   | Horizontal velocity                              |
     * | `"velocityY"`   | Vertical velocity                                |
     * | `"scaleX"`      | Horizontal scale factor                          |
     * | `"scaleY"`      | Vertical scale factor                            |
     * | `"startValue"`  | Value passed in when the object was spawned      |
     * | `"id"`          | Unique object identifier                         |
     *
     * Any other string is treated as the name of an object variable stored on
     * `obj.variables[key]`.
     *
     * @param {object} obj - The target object.
     * @param {string} key - The property key to extract.
     * @returns {*} The extracted value, or `undefined` if not found.
     *
     * @example
     * const xPos  = Properties.extractor(obj, "x");
     * const hp    = Properties.extractor(obj, "health"); // object variable
     */
    static extractor(obj, key) {
        switch (key) {
            case "x":          return obj.x           ?? 0;
            case "y":          return obj.y           ?? 0;
            case "alpha":      return obj.alpha        ?? 100;
            case "rotation":   return obj.rotation     ?? 0;
            case "spinSpeed":  return obj.spinSpeed    ?? 0;
            case "velocityX":  return obj.velocityX    ?? 0;
            case "velocityY":  return obj.velocityY    ?? 0;
            case "scaleX":     return obj.scaleX       ?? 1;
            case "scaleY":     return obj.scaleY       ?? 1;
            case "startValue": return obj.startValue   ?? null;
            case "id":         return obj.id           ?? null;
            default:
                // Fall through to object variables
                return obj.variables?.[key];
        }
    }

    // =========================================================================
    // DISPLAY ORDER
    // Controls the z-order (draw layer) of an object.
    // =========================================================================

    /**
     * Sets the display (draw) order of an object.
     *
     * Higher values are drawn on top of lower values. The value is stored on
     * `obj.displayOrder` and returned.
     *
     * @param {object} obj   - The target object.
     * @param {number} order - The desired draw order (integer recommended).
     * @returns {number} The assigned display order.
     *
     * @example
     * Properties.displayOrder(obj, 10); // draw this object above order-5 objects
     */
    static displayOrder(obj, order) {
        obj.displayOrder = Number(order) || 0;
        return obj.displayOrder;
    }

};
