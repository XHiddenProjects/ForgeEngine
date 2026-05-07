import { math } from "./math.js";
import { Color } from "./color.js";
import { Logic } from "./logic.js";
import { Canvex } from "./canvex.js";

export const Particles = class {

  // ---------------------------------------------------------------------------
  // Internal particle storage
  // ---------------------------------------------------------------------------

  /** @type {Map<string, Particle[]>} Active particle pools keyed by emitter id. */
  static #pools = new Map();

  // ===========================================================================
  // EMITTER
  // Creates and manages a named particle emitter. Call every frame.
  // ===========================================================================

  /**
   * Emit particles from a point source, advancing all existing particles each
   * frame. New particles are spawned at the given rate using `Logic.repeater`.
   *
   * @param {string}   id              - Unique emitter key.
   * @param {number}   x               - World-space X origin.
   * @param {number}   y               - World-space Y origin.
   * @param {number}   delta           - Milliseconds since last frame.
   * @param {Object}   [opts]          - Emitter options.
   * @param {number}   [opts.rate=200]        - Milliseconds between spawns.
   * @param {number}   [opts.count=1]         - Particles per spawn burst.
   * @param {number}   [opts.lifetime=1000]   - Particle lifespan in ms.
   * @param {number}   [opts.speed=2]         - Initial speed (px/frame at 60fps).
   * @param {number}   [opts.speedVariance=1] - ± random spread on speed.
   * @param {number}   [opts.angle=270]       - Emit direction in degrees (0=right).
   * @param {number}   [opts.spread=30]       - ± cone spread in degrees.
   * @param {number}   [opts.size=6]          - Starting radius in px.
   * @param {number}   [opts.sizeEnd=0]       - Ending radius in px.
   * @param {*}        [opts.colorStart]      - Any Color-compatible value.
   * @param {*}        [opts.colorEnd]        - Any Color-compatible value.
   * @param {number}   [opts.gravity=0]       - Downward acceleration per frame².
   * @param {number}   [opts.drag=1]          - Velocity multiplier per frame (0–1).
   * @param {Function} [opts.onDraw]          - (ctx, p, progress) custom draw hook.
   * @param {Function} [opts.onSpawn]         - (particle) called right after birth.
   * @description Uses `Canvex.ctx` automatically for auto-draw.
   * @returns {Particle[]} The live particle array for this emitter.
   *
   * @example
   * // In your game loop:
   * Particles.emit("fire", x, y, delta, {
   *   rate: 50, colorStart: "#ff8800", colorEnd: "#ff000000",
   *   spread: 20, angle: 270, gravity: -0.05
   * });
   */
  static emit(id, x, y, delta, opts = {}) {
    const {
      rate         = 200,
      count        = 1,
      lifetime     = 1000,
      speed        = 2,
      speedVariance = 1,
      angle        = 270,
      spread       = 30,
      size         = 6,
      sizeEnd      = 0,
      colorStart   = { r: 255, g: 200, b: 50,  a: 255 },
      colorEnd     = { r: 255, g: 50,  b: 0,   a: 0   },
      gravity      = 0,
      drag         = 1,
      onDraw       = null,
      onSpawn      = null,
    } = opts;

    const ctx = Canvex.ctx;

    if (!this.#pools.has(id)) this.#pools.set(id, []);
    const pool = this.#pools.get(id);

    // Spawn new particles via a timed repeater
    Logic.repeater(`particles_${id}`, rate, delta, () => {
      for (let i = 0; i < count; i++) {
        const angleRad  = math.radians(angle + math.random(-spread, spread));
        const spd       = Math.max(0, speed + math.random(-speedVariance, speedVariance));
        const particle  = {
          x,  y,
          vx: math.cos(angleRad) * spd,
          vy: math.sin(angleRad) * spd,
          age: 0,
          lifetime,
          size,
          sizeEnd,
          colorStart: Color.color(colorStart),
          colorEnd:   Color.color(colorEnd),
          gravity,
          drag,
        };
        if (onSpawn) onSpawn(particle);
        pool.push(particle);
      }
    });

    // Advance and prune all particles
    for (let i = pool.length - 1; i >= 0; i--) {
      const p = pool[i];
      p.age += delta;

      if (p.age >= p.lifetime) {
        pool.splice(i, 1);
        continue;
      }

      // Physics
      p.vy += p.gravity;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x  += p.vx;
      p.y  += p.vy;

      // Draw if Canvex has an active 2D context
      if (ctx) {
        const progress = p.age / p.lifetime;
        Particles.#drawParticle(ctx, p, progress, onDraw);
      }
    }

    return pool;
  }

  // ===========================================================================
  // BURST
  // Fire a one-shot explosion of particles without a repeating emitter.
  // ===========================================================================

  /**
   * Instantly spawn a burst of particles. Unlike `emit`, no continuous rate is
   * involved — all particles are created in a single call.
   *
   * @param {string}   id       - Pool key (can reuse across bursts).
   * @param {number}   x        - World-space X origin.
   * @param {number}   y        - World-space Y origin.
   * @param {number}   count    - How many particles to spawn.
   * @param {Object}   [opts]   - Same options as `emit` (rate/count ignored).
   * @returns {Particle[]} The updated particle array.
   *
   * @example
   * // On enemy death:
   * Particles.burst("explosion", enemy.x, enemy.y, 30, {
   *   speed: 4, speedVariance: 2, spread: 180, angle: 0,
   *   colorStart: "#ffff00", colorEnd: "#ff000000", lifetime: 800
   * });
   */
  static burst(id, x, y, count, opts = {}) {
    const {
      lifetime     = 800,
      speed        = 3,
      speedVariance = 2,
      angle        = 0,
      spread       = 180,
      size         = 5,
      sizeEnd      = 0,
      colorStart   = { r: 255, g: 220, b: 0,  a: 255 },
      colorEnd     = { r: 255, g: 0,   b: 0,  a: 0   },
      gravity      = 0.05,
      drag         = 0.97,
      onSpawn      = null,
    } = opts;

    if (!this.#pools.has(id)) this.#pools.set(id, []);
    const pool = this.#pools.get(id);

    for (let i = 0; i < count; i++) {
      const angleRad = math.radians(angle + math.random(-spread, spread));
      const spd      = Math.max(0, speed + math.random(-speedVariance, speedVariance));
      const particle = {
        x, y,
        vx: math.cos(angleRad) * spd,
        vy: math.sin(angleRad) * spd,
        age: 0,
        lifetime,
        size,
        sizeEnd,
        colorStart: Color.color(colorStart),
        colorEnd:   Color.color(colorEnd),
        gravity,
        drag,
      };
      if (onSpawn) onSpawn(particle);
      pool.push(particle);
    }

    return pool;
  }

  // ===========================================================================
  // UPDATE
  // Advance and optionally draw an existing pool without spawning new particles.
  // Useful when you called burst() and want to tick it separately each frame.
  // ===========================================================================

  /**
   * Advance all particles in a pool by `delta` ms, pruning the dead ones.
   * Optionally draws them onto `Canvex.ctx`.
   *
   * @param {string}   id      - Pool key.
   * @param {number}   delta   - Milliseconds since last frame.
   * @param {Function} [onDraw] - (ctx, particle, progress) custom draw override.
   * @returns {Particle[]} Remaining live particles.
   *
   * @example
   * Particles.update("explosion", delta);
   */
  static update(id, delta, onDraw = null) {
    const ctx = Canvex.ctx;
    const pool = this.#pools.get(id);
    if (!pool) return [];

    for (let i = pool.length - 1; i >= 0; i--) {
      const p = pool[i];
      p.age += delta;

      if (p.age >= p.lifetime) {
        pool.splice(i, 1);
        continue;
      }

      p.vy += p.gravity;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.x  += p.vx;
      p.y  += p.vy;

      if (ctx) {
        const progress = p.age / p.lifetime;
        Particles.#drawParticle(ctx, p, progress, onDraw);
      }
    }

    return pool;
  }

  // ===========================================================================
  // DRAW
  // Render an existing pool without advancing physics.
  // ===========================================================================

  /**
   * Draw all particles in a pool onto a canvas context without ticking physics.
   * Useful when you want a separate update/draw pass order.
   *
   * @param {string}   id   - Pool key.
   * @param {Function} [onDraw] - (ctx, particle, progress) custom draw override.
   *
   * @example
   * Particles.draw("fire");
   */
  static draw(id, onDraw = null) {
    const ctx = Canvex.ctx;
    const pool = this.#pools.get(id);
    if (!pool) return;
    for (const p of pool) {
      const progress = p.age / p.lifetime;
      Particles.#drawParticle(ctx, p, progress, onDraw);
    }
  }

  // ===========================================================================
  // TRAIL
  // Attach a particle trail to a moving object using Logic.smooth for easing.
  // ===========================================================================

  /**
   * Emit a smooth position-tracked trail behind a moving object.
   * Internally uses `Logic.smooth` to gently lag the spawn origin, creating a
   * natural ribbon effect. Call every frame.
   *
   * @param {string}   id      - Unique trail key.
   * @param {number}   x       - Current object X.
   * @param {number}   y       - Current object Y.
   * @param {number}   delta   - Milliseconds since last frame.
   * @param {Object}   [opts]  - Extends emit() options with:
   * @param {number}   [opts.lag=0.4]  - Lerp factor for origin lag (0=frozen, 1=instant).
   * @returns {Particle[]}
   *
   * @example
   * Particles.trail("shipTrail", ship.x, ship.y, delta, {
   *   rate: 30, size: 4, sizeEnd: 0,
   *   colorStart: "#88aaff", colorEnd: "#0000ff00",
   *   speed: 0.5, spread: 15, lag: 0.3
   * });
   */
  static trail(id, x, y, delta, opts = {}) {
    const { lag = 0.4, ...emitOpts } = opts;

    let lagX = x;
    let lagY = y;

    Logic.smooth(`trail_x_${id}`, x, lag, v => { lagX = v; });
    Logic.smooth(`trail_y_${id}`, y, lag, v => { lagY = v; });

    return Particles.emit(id, lagX, lagY, delta, {
      angle: math.degrees(math.atan2(y - lagY, x - lagX)) + 180,
      spread: opts.spread ?? 15,
      speed:  opts.speed  ?? 1,
      ...emitOpts,
    });
  }

  // ===========================================================================
  // PALETTE EMITTER
  // Emit particles whose color is sampled from a Color.paletteLerp gradient.
  // ===========================================================================

  /**
   * Like `emit`, but colorStart/colorEnd are replaced by a multi-stop palette.
   * Each new particle picks a random color from the palette at spawn time.
   *
   * @param {string}   id       - Unique emitter key.
   * @param {number}   x        - World-space X origin.
   * @param {number}   y        - World-space Y origin.
   * @param {number}   delta    - Milliseconds since last frame.
   * @param {Array}    palette  - Array of colors for Color.paletteLerp.
   * @param {Object}   [opts]   - Same as emit() (colorStart/colorEnd ignored).
   * @returns {Particle[]}
   *
   * @example
   * Particles.paletteEmit("sparkle", x, y, delta,
   *   ["#ffffff", "#ffff00", "#ff8800", "#ff0000"],
   *   { rate: 80, spread: 360, speed: 3 }
   * );
   */
  static paletteEmit(id, x, y, delta, palette, opts = {}) {
    return Particles.emit(id, x, y, delta, {
      ...opts,
      onSpawn: (p) => {
        const t = math.random(0, 1);
        const c = Color.paletteLerp(palette, t);
        p.colorStart = c;
        p.colorEnd   = Color.alpha(c, 0);
        if (opts.onSpawn) opts.onSpawn(p);
      },
    });
  }

  // ===========================================================================
  // UTILITY
  // ===========================================================================

  /**
   * Return the number of live particles in a pool.
   * @param {string} id
   * @returns {number}
   */
  static count(id) {
    return this.#pools.get(id)?.length ?? 0;
  }

  /**
   * Returns true if the pool exists and has at least one live particle.
   * @param {string} id
   * @returns {boolean}
   */
  static isAlive(id) {
    return Particles.count(id) > 0;
  }

  /**
   * Remove all particles in a pool and stop its repeater.
   * @param {string} id
   */
  static clear(id) {
    this.#pools.delete(id);
    Logic.resetRepeater(`particles_${id}`);
    Logic.smoothSnap(`trail_x_${id}`, 0);
    Logic.smoothSnap(`trail_y_${id}`, 0);
  }

  /**
   * Clear every emitter and reset all Logic state owned by Particles.
   */
  static clearAll() {
    for (const id of this.#pools.keys()) Particles.clear(id);
    this.#pools.clear();
  }

  /**
   * Convert a Color object to a CSS rgba() string.
   * @param {{ r:number, g:number, b:number, a:number }} c
   * @returns {string}
   */
  static toCSS(c) {
    return `rgba(${c.r},${c.g},${c.b},${(c.a / 255).toFixed(3)})`;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Draw a single particle. Calls onDraw if supplied, otherwise uses the
   * default radial gradient circle renderer.
   * @private
   */
  static #drawParticle(ctx, p, progress, onDraw) {
    if (!ctx) return;

    if (onDraw) {
      onDraw(ctx, p, progress);
      return;
    }

    if (typeof ctx.createRadialGradient !== "function") return;

    const color   = Color.lerpColor(p.colorStart, p.colorEnd, progress);
    const radius  = Math.max(0, p.size + (p.sizeEnd - p.size) * progress);

    if (radius <= 0 || color.a <= 0) return;

    ctx.save();
    ctx.globalAlpha = color.a / 255;

    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
    gradient.addColorStop(0,   Particles.toCSS({ ...color, a: 255 }));
    gradient.addColorStop(1,   Particles.toCSS({ ...color, a: 0   }));

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, math.TWO_PI);
    ctx.fill();
    ctx.restore();
  }
};
