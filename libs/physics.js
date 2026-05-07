import { math } from "./math.js";
import { Helpers } from "./helpers.js";
import { Triggers } from "./triggers.js";

export const Physics = class {

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /** Gravitational constant on Earth (m/s²) */
    static GRAVITY = 9.80665;

    /** Speed of light in a vacuum (m/s) */
    static SPEED_OF_LIGHT = 299_792_458;

    /** Planck's constant (J·s) */
    static PLANCK = 6.62607015e-34;

    // -------------------------------------------------------------------------
    // Internal state
    // -------------------------------------------------------------------------

    /** @type {Map<string, object>} Named bodies registered for simulation */
    static #bodies = new Map();

    /** @type {Map<string, object>} Named springs registered for simulation */
    static #springs = new Map();

    // =========================================================================
    // VECTOR MATH
    // =========================================================================

    /**
     * Adds two 2D or 3D vectors.
     * @param {{x:number, y:number, z?:number}} a
     * @param {{x:number, y:number, z?:number}} b
     * @returns {{x:number, y:number, z:number}}
     */
    static addVec(a, b) {
        return {
            x: (a.x ?? 0) + (b.x ?? 0),
            y: (a.y ?? 0) + (b.y ?? 0),
            z: (a.z ?? 0) + (b.z ?? 0)
        };
    }

    /**
     * Subtracts vector b from vector a.
     * @param {{x:number, y:number, z?:number}} a
     * @param {{x:number, y:number, z?:number}} b
     * @returns {{x:number, y:number, z:number}}
     */
    static subVec(a, b) {
        return {
            x: (a.x ?? 0) - (b.x ?? 0),
            y: (a.y ?? 0) - (b.y ?? 0),
            z: (a.z ?? 0) - (b.z ?? 0)
        };
    }

    /**
     * Scales a vector by a scalar.
     * @param {{x:number, y:number, z?:number}} v
     * @param {number} scalar
     * @returns {{x:number, y:number, z:number}}
     */
    static scaleVec(v, scalar) {
        return {
            x: (v.x ?? 0) * scalar,
            y: (v.y ?? 0) * scalar,
            z: (v.z ?? 0) * scalar
        };
    }

    /**
     * Returns the magnitude (length) of a vector.
     * @param {{x:number, y:number, z?:number}} v
     * @returns {number}
     */
    static magVec(v) {
        return math.mag(v.x ?? 0, v.y ?? 0, v.z ?? 0);
    }

    /**
     * Returns a normalized (unit) copy of the vector.
     * Returns a zero vector if the magnitude is zero.
     * @param {{x:number, y:number, z?:number}} v
     * @returns {{x:number, y:number, z:number}}
     */
    static normalizeVec(v) {
        const mag = Physics.magVec(v);
        if (mag === 0) return { x: 0, y: 0, z: 0 };
        return Physics.scaleVec(v, 1 / mag);
    }

    /**
     * Returns the dot product of two vectors.
     * @param {{x:number, y:number, z?:number}} a
     * @param {{x:number, y:number, z?:number}} b
     * @returns {number}
     */
    static dotVec(a, b) {
        return (a.x ?? 0) * (b.x ?? 0)
             + (a.y ?? 0) * (b.y ?? 0)
             + (a.z ?? 0) * (b.z ?? 0);
    }

    /**
     * Returns the 3D cross product of two vectors.
     * @param {{x:number, y:number, z?:number}} a
     * @param {{x:number, y:number, z?:number}} b
     * @returns {{x:number, y:number, z:number}}
     */
    static crossVec(a, b) {
        const ax = a.x ?? 0, ay = a.y ?? 0, az = a.z ?? 0;
        const bx = b.x ?? 0, by = b.y ?? 0, bz = b.z ?? 0;
        return {
            x: ay * bz - az * by,
            y: az * bx - ax * bz,
            z: ax * by - ay * bx
        };
    }

    /**
     * Returns the distance between two position vectors.
     * @param {{x:number, y:number, z?:number}} a
     * @param {{x:number, y:number, z?:number}} b
     * @returns {number}
     */
    static distVec(a, b) {
        return Physics.magVec(Physics.subVec(a, b));
    }

    /**
     * Linearly interpolates between two vectors.
     * @param {{x:number, y:number, z?:number}} a Start vector.
     * @param {{x:number, y:number, z?:number}} b End vector.
     * @param {number} t Interpolation factor [0, 1].
     * @returns {{x:number, y:number, z:number}}
     */
    static lerpVec(a, b, t) {
        const amt = Helpers.clamp(t, 0, 1);
        return {
            x: math.lerp(a.x ?? 0, b.x ?? 0, amt),
            y: math.lerp(a.y ?? 0, b.y ?? 0, amt),
            z: math.lerp(a.z ?? 0, b.z ?? 0, amt)
        };
    }

    /**
     * Reflects a vector off a surface defined by a normal.
     * @param {{x:number, y:number, z?:number}} v Incident vector.
     * @param {{x:number, y:number, z?:number}} normal Surface normal (should be normalized).
     * @returns {{x:number, y:number, z:number}} Reflected vector.
     */
    static reflectVec(v, normal) {
        const dot2 = 2 * Physics.dotVec(v, normal);
        return Physics.subVec(v, Physics.scaleVec(normal, dot2));
    }

    // =========================================================================
    // KINEMATICS
    // =========================================================================

    /**
     * Calculates the final velocity using v = u + a·t.
     * @param {number} u Initial velocity.
     * @param {number} a Acceleration.
     * @param {number} t Time.
     * @returns {number} Final velocity.
     */
    static finalVelocity(u, a, t) {
        return u + a * t;
    }

    /**
     * Calculates displacement using s = u·t + ½·a·t².
     * @param {number} u Initial velocity.
     * @param {number} t Time.
     * @param {number} [a=0] Acceleration.
     * @returns {number} Displacement.
     */
    static displacement(u, t, a = 0) {
        return u * t + 0.5 * a * math.sq(t);
    }

    /**
     * Integrates position using Euler integration.
     * Returns a new position vector; does not mutate inputs.
     * @param {{x:number, y:number, z?:number}} position Current position.
     * @param {{x:number, y:number, z?:number}} velocity Current velocity.
     * @param {number} dt Delta time in seconds.
     * @returns {{x:number, y:number, z:number}} New position.
     */
    static integratePosition(position, velocity, dt) {
        return Physics.addVec(position, Physics.scaleVec(velocity, dt));
    }

    /**
     * Integrates velocity using Euler integration.
     * Returns a new velocity vector; does not mutate inputs.
     * @param {{x:number, y:number, z?:number}} velocity Current velocity.
     * @param {{x:number, y:number, z?:number}} acceleration Current acceleration.
     * @param {number} dt Delta time in seconds.
     * @returns {{x:number, y:number, z:number}} New velocity.
     */
    static integrateVelocity(velocity, acceleration, dt) {
        return Physics.addVec(velocity, Physics.scaleVec(acceleration, dt));
    }

    /**
     * Calculates the angle (in radians) and speed of a projectile launch
     * required to reach a target distance on flat ground.
     *
     * @param {number} range Horizontal range to reach (m).
     * @param {number} launchSpeed Initial speed (m/s).
     * @param {number} [g=Physics.GRAVITY] Gravitational acceleration.
     * @returns {{angle:number, time:number}|null} Launch angle in radians and flight time, or null if unreachable.
     */
    static projectileLaunchAngle(range, launchSpeed, g = Physics.GRAVITY) {
        const sin2a = (range * g) / math.sq(launchSpeed);
        if (Math.abs(sin2a) > 1) return null; // Out of range
        const angle = 0.5 * Math.asin(sin2a);
        const time = range / (launchSpeed * Math.cos(angle));
        return { angle, time };
    }

    /**
     * Calculates the position of a projectile at time t.
     * @param {number} x0 Initial x position.
     * @param {number} y0 Initial y position.
     * @param {number} vx Horizontal velocity component.
     * @param {number} vy Vertical velocity component (positive = up).
     * @param {number} t Time elapsed.
     * @param {number} [g=Physics.GRAVITY] Gravitational acceleration.
     * @returns {{x:number, y:number}} Position at time t.
     */
    static projectilePosition(x0, y0, vx, vy, t, g = Physics.GRAVITY) {
        return {
            x: x0 + vx * t,
            y: y0 + vy * t - 0.5 * g * math.sq(t)
        };
    }

    // =========================================================================
    // FORCES & DYNAMICS
    // =========================================================================

    /**
     * Calculates force using Newton's second law: F = m·a.
     * @param {number} mass Mass in kg.
     * @param {number} acceleration Acceleration in m/s².
     * @returns {number} Force in Newtons.
     */
    static force(mass, acceleration) {
        return mass * acceleration;
    }

    /**
     * Calculates acceleration from force and mass: a = F / m.
     * @param {number} force Force in Newtons.
     * @param {number} mass Mass in kg.
     * @returns {number} Acceleration in m/s².
     * @throws {RangeError} If mass is zero.
     */
    static acceleration(force, mass) {
        if (mass === 0) throw new RangeError("Mass cannot be zero.");
        return force / mass;
    }

    /**
     * Calculates the gravitational force between two masses.
     * F = G · m1 · m2 / r²
     * @param {number} m1 First mass (kg).
     * @param {number} m2 Second mass (kg).
     * @param {number} r Distance between centers (m).
     * @param {number} [G=6.674e-11] Gravitational constant.
     * @returns {number} Gravitational force (N).
     * @throws {RangeError} If distance is zero.
     */
    static gravitationalForce(m1, m2, r, G = 6.674e-11) {
        if (r === 0) throw new RangeError("Distance cannot be zero.");
        return G * m1 * m2 / math.sq(r);
    }

    /**
     * Calculates the spring force using Hooke's Law: F = -k · x.
     * @param {number} k Spring constant (N/m).
     * @param {number} displacement Extension or compression from rest (m).
     * @returns {number} Restoring force (N). Negative means opposing displacement.
     */
    static springForce(k, displacement) {
        return -k * displacement;
    }

    /**
     * Calculates friction force.
     * @param {number} mu Coefficient of friction.
     * @param {number} normalForce Normal force (N).
     * @returns {number} Friction force magnitude (N).
     */
    static friction(mu, normalForce) {
        return mu * Math.abs(normalForce);
    }

    /**
     * Applies a drag (air resistance) force opposing velocity.
     * F_drag = -½ · ρ · Cd · A · v²
     * @param {number} velocity Speed of the object (m/s).
     * @param {number} [dragCoefficient=0.47] Drag coefficient (dimensionless).
     * @param {number} [area=1] Cross-sectional area (m²).
     * @param {number} [density=1.225] Fluid density (kg/m³), defaults to air at sea level.
     * @returns {number} Drag force magnitude (N).
     */
    static dragForce(velocity, dragCoefficient = 0.47, area = 1, density = 1.225) {
        return 0.5 * density * dragCoefficient * area * math.sq(velocity);
    }

    // =========================================================================
    // ENERGY & MOMENTUM
    // =========================================================================

    /**
     * Calculates kinetic energy: KE = ½ · m · v².
     * @param {number} mass Mass (kg).
     * @param {number} velocity Speed (m/s).
     * @returns {number} Kinetic energy (J).
     */
    static kineticEnergy(mass, velocity) {
        return 0.5 * mass * math.sq(velocity);
    }

    /**
     * Calculates gravitational potential energy: PE = m · g · h.
     * @param {number} mass Mass (kg).
     * @param {number} height Height above reference (m).
     * @param {number} [g=Physics.GRAVITY] Gravitational acceleration (m/s²).
     * @returns {number} Potential energy (J).
     */
    static potentialEnergy(mass, height, g = Physics.GRAVITY) {
        return mass * g * height;
    }

    /**
     * Calculates elastic potential energy stored in a spring: E = ½ · k · x².
     * @param {number} k Spring constant (N/m).
     * @param {number} displacement Displacement from rest (m).
     * @returns {number} Elastic potential energy (J).
     */
    static springEnergy(k, displacement) {
        return 0.5 * k * math.sq(displacement);
    }

    /**
     * Calculates linear momentum: p = m · v.
     * @param {number} mass Mass (kg).
     * @param {number} velocity Velocity (m/s).
     * @returns {number} Momentum (kg·m/s).
     */
    static momentum(mass, velocity) {
        return mass * velocity;
    }

    /**
     * Calculates impulse: J = F · Δt.
     * @param {number} force Force (N).
     * @param {number} dt Time interval (s).
     * @returns {number} Impulse (N·s).
     */
    static impulse(force, dt) {
        return force * dt;
    }

    // =========================================================================
    // COLLISIONS
    // =========================================================================

    /**
     * Resolves a 1D elastic collision between two objects.
     * Returns the new velocities after collision.
     *
     * @param {number} m1 Mass of object 1 (kg).
     * @param {number} v1 Velocity of object 1 (m/s).
     * @param {number} m2 Mass of object 2 (kg).
     * @param {number} v2 Velocity of object 2 (m/s).
     * @returns {{v1:number, v2:number}} Post-collision velocities.
     */
    static elasticCollision1D(m1, v1, m2, v2) {
        const totalMass = m1 + m2;
        if (totalMass === 0) return { v1: 0, v2: 0 };
        const newV1 = ((m1 - m2) * v1 + 2 * m2 * v2) / totalMass;
        const newV2 = ((m2 - m1) * v2 + 2 * m1 * v1) / totalMass;
        return { v1: newV1, v2: newV2 };
    }

    /**
     * Resolves a 1D perfectly inelastic collision.
     * The two objects stick together and move as one.
     *
     * @param {number} m1 Mass of object 1 (kg).
     * @param {number} v1 Velocity of object 1 (m/s).
     * @param {number} m2 Mass of object 2 (kg).
     * @param {number} v2 Velocity of object 2 (m/s).
     * @returns {number} Combined velocity after collision (m/s).
     */
    static inelasticCollision1D(m1, v1, m2, v2) {
        const totalMass = m1 + m2;
        if (totalMass === 0) return 0;
        return (m1 * v1 + m2 * v2) / totalMass;
    }

    /**
     * Checks whether two axis-aligned bounding boxes (AABB) overlap.
     * @param {{x:number, y:number, w:number, h:number}} a
     * @param {{x:number, y:number, w:number, h:number}} b
     * @returns {boolean}
     */
    static aabbOverlap(a, b) {
        return (
            a.x < b.x + b.w &&
            a.x + a.w > b.x &&
            a.y < b.y + b.h &&
            a.y + a.h > b.y
        );
    }

    /**
     * Checks whether two circles overlap.
     * @param {number} x1 Center x of circle 1.
     * @param {number} y1 Center y of circle 1.
     * @param {number} r1 Radius of circle 1.
     * @param {number} x2 Center x of circle 2.
     * @param {number} y2 Center y of circle 2.
     * @param {number} r2 Radius of circle 2.
     * @returns {boolean}
     */
    static circleOverlap(x1, y1, r1, x2, y2, r2) {
        return math.dist(x1, y1, x2, y2) < r1 + r2;
    }

    /**
     * Returns the overlap depth and separation normal for two overlapping circles.
     * Returns null if the circles are not overlapping.
     *
     * @param {number} x1 Center x of circle 1.
     * @param {number} y1 Center y of circle 1.
     * @param {number} r1 Radius of circle 1.
     * @param {number} x2 Center x of circle 2.
     * @param {number} y2 Center y of circle 2.
     * @param {number} r2 Radius of circle 2.
     * @returns {{depth:number, normalX:number, normalY:number}|null}
     */
    static circleCollisionManifold(x1, y1, r1, x2, y2, r2) {
        const dist = math.dist(x1, y1, x2, y2);
        const combined = r1 + r2;
        if (dist >= combined) return null;
        const depth = combined - dist;
        const nx = dist === 0 ? 1 : (x2 - x1) / dist;
        const ny = dist === 0 ? 0 : (y2 - y1) / dist;
        return { depth, normalX: nx, normalY: ny };
    }

    /**
     * Applies a velocity bounce response to an object hitting a surface.
     * The component of velocity along the normal is reversed and scaled by the restitution.
     *
     * @param {{x:number, y:number, z?:number}} velocity Current velocity.
     * @param {{x:number, y:number, z?:number}} normal Surface normal (should be normalized).
     * @param {number} [restitution=1] Coefficient of restitution [0 = fully inelastic, 1 = fully elastic].
     * @returns {{x:number, y:number, z:number}} New velocity after bounce.
     */
    static bounce(velocity, normal, restitution = 1) {
        const e = Helpers.clamp(restitution, 0, 1);
        const dot = Physics.dotVec(velocity, normal);
        return Physics.subVec(velocity, Physics.scaleVec(normal, (1 + e) * dot));
    }

    // =========================================================================
    // TRIGGER-BASED COLLISION EVENTS
    // =========================================================================

    /**
     * Fires a callback via Triggers when two circles overlap.
     * Wraps Triggers.collision — use this in your game loop for event-driven circle collisions.
     *
     * @param {number} x1 Center x of circle 1.
     * @param {number} y1 Center y of circle 1.
     * @param {number} r1 Radius of circle 1.
     * @param {number} x2 Center x of circle 2.
     * @param {number} y2 Center y of circle 2.
     * @param {number} r2 Radius of circle 2.
     * @param {Function} callback Called when the circles are overlapping.
     * @example
     * Physics.onCollision(ball.x, ball.y, ball.r, enemy.x, enemy.y, enemy.r, () => handleHit());
     */
    static onCollision(x1, y1, r1, x2, y2, r2, callback) {
        Triggers.collision(x1, y1, x2, y2, r1, r2, callback);
    }

    /**
     * Fires a callback via Triggers when two AABBs overlap.
     * Wraps Triggers.collisionRect — use this in your game loop for event-driven rect collisions.
     *
     * @param {{x:number, y:number, w:number, h:number}} a First rectangle.
     * @param {{x:number, y:number, w:number, h:number}} b Second rectangle.
     * @param {Function} callback Called when the rectangles are overlapping.
     * @example
     * Physics.onCollisionRect(player, platform, () => player.land());
     */
    static onCollisionRect(a, b, callback) {
        Triggers.collisionRect(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h, callback);
    }

    /**
     * Fires a callback the moment a circle collision begins (rising edge only).
     * Uses Triggers.onEnter keyed by `key` so the callback fires once per collision start.
     * Must be called every frame with the same key.
     *
     * @param {string} key Unique identifier for this collision pair.
     * @param {number} x1 Center x of circle 1.
     * @param {number} y1 Center y of circle 1.
     * @param {number} r1 Radius of circle 1.
     * @param {number} x2 Center x of circle 2.
     * @param {number} y2 Center y of circle 2.
     * @param {number} r2 Radius of circle 2.
     * @param {Function} callback Called on the frame the overlap begins.
     * @example
     * Physics.onCollisionEnter("ball_enemy", ball.x, ball.y, ball.r, enemy.x, enemy.y, enemy.r, () => spawnParticles());
     */
    static onCollisionEnter(key, x1, y1, r1, x2, y2, r2, callback) {
        Triggers.onEnter(key, () => Physics.circleOverlap(x1, y1, r1, x2, y2, r2), callback);
    }

    /**
     * Fires a callback the moment a circle collision ends (falling edge only).
     * Uses Triggers.onExit keyed by `key` so the callback fires once per collision end.
     * Must be called every frame with the same key.
     *
     * @param {string} key Unique identifier for this collision pair.
     * @param {number} x1 Center x of circle 1.
     * @param {number} y1 Center y of circle 1.
     * @param {number} r1 Radius of circle 1.
     * @param {number} x2 Center x of circle 2.
     * @param {number} y2 Center y of circle 2.
     * @param {number} r2 Radius of circle 2.
     * @param {Function} callback Called on the frame the overlap ends.
     * @example
     * Physics.onCollisionExit("ball_enemy", ball.x, ball.y, ball.r, enemy.x, enemy.y, enemy.r, () => resetCombo());
     */
    static onCollisionExit(key, x1, y1, r1, x2, y2, r2, callback) {
        Triggers.onExit(key, () => Physics.circleOverlap(x1, y1, r1, x2, y2, r2), callback);
    }

    /**
     * Fires a callback the moment an AABB collision begins (rising edge only).
     * Uses Triggers.onEnter keyed by `key`.
     * Must be called every frame with the same key.
     *
     * @param {string} key Unique identifier for this collision pair.
     * @param {{x:number, y:number, w:number, h:number}} a First rectangle.
     * @param {{x:number, y:number, w:number, h:number}} b Second rectangle.
     * @param {Function} callback Called on the frame the overlap begins.
     * @example
     * Physics.onCollisionRectEnter("player_platform", player, platform, () => player.land());
     */
    static onCollisionRectEnter(key, a, b, callback) {
        Triggers.onEnter(key, () => Physics.aabbOverlap(a, b), callback);
    }

    /**
     * Fires a callback the moment an AABB collision ends (falling edge only).
     * Uses Triggers.onExit keyed by `key`.
     * Must be called every frame with the same key.
     *
     * @param {string} key Unique identifier for this collision pair.
     * @param {{x:number, y:number, w:number, h:number}} a First rectangle.
     * @param {{x:number, y:number, w:number, h:number}} b Second rectangle.
     * @param {Function} callback Called on the frame the overlap ends.
     * @example
     * Physics.onCollisionRectExit("player_platform", player, platform, () => player.fall());
     */
    static onCollisionRectExit(key, a, b, callback) {
        Triggers.onExit(key, () => Physics.aabbOverlap(a, b), callback);
    }

    /**
     * Resolves a 2D elastic collision between two registered bodies and fires a callback via Triggers.
     * The collision normal is derived from the manifold of the two circles.
     * No-ops if the bodies are not currently overlapping.
     *
     * @param {string} keyA Key of the first registered body (must have a `radius` property).
     * @param {string} keyB Key of the second registered body (must have a `radius` property).
     * @param {Function} [callback] Optional callback fired when a collision is resolved.
     * @example
     * Physics.resolveCircleBodies("ball", "enemy", () => playSfx("hit"));
     */
    static resolveCircleBodies(keyA, keyB, callback) {
        const a = Physics.getBody(keyA);
        const b = Physics.getBody(keyB);
        if (!a || !b) return;

        const rA = a.radius ?? 0;
        const rB = b.radius ?? 0;
        const manifold = Physics.circleCollisionManifold(
            a.position.x, a.position.y, rA,
            b.position.x, b.position.y, rB
        );

        Triggers.conditional(
            () => manifold !== null,
            () => {
                const normal = { x: manifold.normalX, y: manifold.normalY, z: 0 };

                // Separate bodies by half the overlap depth each
                const correction = Physics.scaleVec(normal, manifold.depth / 2);
                a.position = Physics.subVec(a.position, correction);
                b.position = Physics.addVec(b.position, correction);

                // Elastic velocity exchange along the collision normal
                const e = (a.restitution + b.restitution) / 2;
                const relVel = Physics.subVec(a.velocity, b.velocity);
                const velAlongNormal = Physics.dotVec(relVel, normal);

                if (velAlongNormal > 0) return; // Already separating

                const impulseMag = -(1 + e) * velAlongNormal / (1 / a.mass + 1 / b.mass);
                const impulse = Physics.scaleVec(normal, impulseMag);

                a.velocity = Physics.addVec(a.velocity, Physics.scaleVec(impulse,  1 / a.mass));
                b.velocity = Physics.addVec(b.velocity, Physics.scaleVec(impulse, -1 / b.mass));

                if (callback) Triggers.always(callback);
            }
        );
    }

    // =========================================================================
    // ROTATION & CIRCULAR MOTION
    // =========================================================================

    /**
     * Calculates centripetal acceleration: a = v² / r.
     * @param {number} velocity Tangential speed (m/s).
     * @param {number} radius Radius of circular path (m).
     * @returns {number} Centripetal acceleration (m/s²).
     * @throws {RangeError} If radius is zero.
     */
    static centripetalAcceleration(velocity, radius) {
        if (radius === 0) throw new RangeError("Radius cannot be zero.");
        return math.sq(velocity) / radius;
    }

    /**
     * Calculates centripetal force: F = m · v² / r.
     * @param {number} mass Mass (kg).
     * @param {number} velocity Tangential speed (m/s).
     * @param {number} radius Radius of circular path (m).
     * @returns {number} Centripetal force (N).
     */
    static centripetalForce(mass, velocity, radius) {
        return mass * Physics.centripetalAcceleration(velocity, radius);
    }

    /**
     * Converts angular velocity (rad/s) to linear speed at a given radius.
     * @param {number} omega Angular velocity (rad/s).
     * @param {number} radius Radius (m).
     * @returns {number} Linear speed (m/s).
     */
    static angularToLinear(omega, radius) {
        return omega * radius;
    }

    /**
     * Converts linear speed to angular velocity (rad/s).
     * @param {number} velocity Linear speed (m/s).
     * @param {number} radius Radius (m).
     * @returns {number} Angular velocity (rad/s).
     * @throws {RangeError} If radius is zero.
     */
    static linearToAngular(velocity, radius) {
        if (radius === 0) throw new RangeError("Radius cannot be zero.");
        return velocity / radius;
    }

    /**
     * Calculates torque: τ = r × F (magnitude in 2D: r · F · sin θ).
     * @param {number} radius Moment arm length (m).
     * @param {number} force Force magnitude (N).
     * @param {number} [angle=Math.PI / 2] Angle between r and F (radians). Defaults to perpendicular.
     * @returns {number} Torque (N·m).
     */
    static torque(radius, force, angle = Math.PI / 2) {
        return radius * force * Math.sin(angle);
    }

    /**
     * Calculates the rotational inertia of a solid sphere: I = 2/5 · m · r².
     * @param {number} mass Mass (kg).
     * @param {number} radius Radius (m).
     * @returns {number} Moment of inertia (kg·m²).
     */
    static inertiaSphere(mass, radius) {
        return (2 / 5) * mass * math.sq(radius);
    }

    /**
     * Calculates the rotational inertia of a solid cylinder or disk: I = ½ · m · r².
     * @param {number} mass Mass (kg).
     * @param {number} radius Radius (m).
     * @returns {number} Moment of inertia (kg·m²).
     */
    static inertiaCylinder(mass, radius) {
        return 0.5 * mass * math.sq(radius);
    }

    /**
     * Calculates the rotational inertia of a thin rod about its center: I = 1/12 · m · L².
     * @param {number} mass Mass (kg).
     * @param {number} length Length of rod (m).
     * @returns {number} Moment of inertia (kg·m²).
     */
    static inertiaRod(mass, length) {
        return (1 / 12) * mass * math.sq(length);
    }

    // =========================================================================
    // OSCILLATION & WAVES
    // =========================================================================

    /**
     * Calculates the period of a simple pendulum: T = 2π · √(L / g).
     * @param {number} length Pendulum length (m).
     * @param {number} [g=Physics.GRAVITY] Gravitational acceleration (m/s²).
     * @returns {number} Period (s).
     */
    static pendulumPeriod(length, g = Physics.GRAVITY) {
        return math.TWO_PI * Math.sqrt(length / g);
    }

    /**
     * Calculates the period of a mass-spring oscillator: T = 2π · √(m / k).
     * @param {number} mass Mass (kg).
     * @param {number} k Spring constant (N/m).
     * @returns {number} Period (s).
     */
    static springPeriod(mass, k) {
        return math.TWO_PI * Math.sqrt(mass / k);
    }

    /**
     * Calculates simple harmonic motion position: x(t) = A · cos(ω·t + φ).
     * @param {number} amplitude Max displacement (m).
     * @param {number} omega Angular frequency (rad/s).
     * @param {number} t Time (s).
     * @param {number} [phase=0] Phase offset (rad).
     * @returns {number} Displacement at time t.
     */
    static simpleHarmonicMotion(amplitude, omega, t, phase = 0) {
        return amplitude * Math.cos(omega * t + phase);
    }

    /**
     * Calculates wave speed: v = f · λ.
     * @param {number} frequency Frequency (Hz).
     * @param {number} wavelength Wavelength (m).
     * @returns {number} Wave speed (m/s).
     */
    static waveSpeed(frequency, wavelength) {
        return frequency * wavelength;
    }

    /**
     * Calculates the Doppler-shifted frequency observed when source and observer move.
     * f_obs = f_src · (v + v_obs) / (v + v_src)
     *
     * @param {number} sourceFq Emitted frequency (Hz).
     * @param {number} waveSpeed Speed of the wave in the medium (m/s).
     * @param {number} [observerVelocity=0] Observer speed toward source (m/s). Negative = away.
     * @param {number} [sourceVelocity=0] Source speed toward observer (m/s). Negative = away.
     * @returns {number} Observed frequency (Hz).
     */
    static dopplerEffect(sourceFq, waveSpeed, observerVelocity = 0, sourceVelocity = 0) {
        const denom = waveSpeed + sourceVelocity;
        if (denom === 0) return Infinity;
        return sourceFq * (waveSpeed + observerVelocity) / denom;
    }

    // =========================================================================
    // BODY SIMULATION
    // =========================================================================

    /**
     * Creates a physics body and registers it by key.
     *
     * @param {string} key Unique identifier for the body.
     * @param {{
     *   x?: number, y?: number, z?: number,
     *   vx?: number, vy?: number, vz?: number,
     *   ax?: number, ay?: number, az?: number,
     *   mass?: number,
     *   restitution?: number,
     *   drag?: number
     * }} [options={}] Initial body state.
     * @returns {{
     *   key: string,
     *   position: {x:number, y:number, z:number},
     *   velocity: {x:number, y:number, z:number},
     *   acceleration: {x:number, y:number, z:number},
     *   mass: number,
     *   restitution: number,
     *   drag: number,
     *   forces: {x:number, y:number, z:number}[]
     * }} The created body.
     */
    static createBody(key, options = {}) {
        const body = {
            key,
            position:     { x: options.x  ?? 0, y: options.y  ?? 0, z: options.z  ?? 0 },
            velocity:     { x: options.vx ?? 0, y: options.vy ?? 0, z: options.vz ?? 0 },
            acceleration: { x: options.ax ?? 0, y: options.ay ?? 0, z: options.az ?? 0 },
            mass:         options.mass        ?? 1,
            restitution:  options.restitution ?? 0.8,
            drag:         options.drag        ?? 0,
            forces: []
        };
        Physics.#bodies.set(key, body);
        return body;
    }

    /**
     * Retrieves a registered body by key.
     * @param {string} key
     * @returns {object|null}
     */
    static getBody(key) {
        return Physics.#bodies.get(key) ?? null;
    }
    /**
     * Checks if a body exists
     * @param {string} key 
     * @returns {Boolean}
     */
    static hasBody(key) {
        return Physics.#bodies.has(key);
    }

    /**
     * Removes a registered body by key.
     * @param {string} key
     * @returns {boolean} True if the body existed and was removed.
     */
    static removeBody(key) {
        return Physics.#bodies.delete(key);
    }

    /**
     * Applies a force vector to a registered body for the next step.
     * Forces are accumulated and cleared after each {@link Physics.step} call.
     *
     * @param {string} key Body key.
     * @param {{x:number, y:number, z?:number}} force Force vector (N).
     * @returns {void}
     * @throws {Error} If no body is found for the given key.
     */
    static applyForce(key, force) {
        const body = Physics.#bodies.get(key);
        if (!body) throw new Error(`Physics: no body with key "${key}".`);
        body.forces.push({ x: force.x ?? 0, y: force.y ?? 0, z: force.z ?? 0 });
    }

    /**
     * Steps all registered bodies forward by dt seconds.
     * Accumulated forces are applied then cleared.
     *
     * @param {number} dt Delta time (seconds).
     * @param {{x?:number, y?:number, z?:number}} [gravity] Optional gravity vector applied to all bodies.
     * @returns {void}
     */
    static step(dt, gravity = null) {
        for (const body of Physics.#bodies.values()) {
            // Sum all applied forces
            let netForce = { x: 0, y: 0, z: 0 };
            for (const f of body.forces) {
                netForce = Physics.addVec(netForce, f);
            }
            body.forces = [];

            // Optional gravity
            if (gravity) {
                netForce = Physics.addVec(
                    netForce,
                    Physics.scaleVec(gravity, body.mass)
                );
            }

            // Drag opposing velocity
            if (body.drag > 0) {
                const speed = Physics.magVec(body.velocity);
                if (speed > 0) {
                    const dragMag = Physics.dragForce(speed, body.drag);
                    const dragForce = Physics.scaleVec(
                        Physics.normalizeVec(body.velocity),
                        -dragMag
                    );
                    netForce = Physics.addVec(netForce, dragForce);
                }
            }

            // a = F / m
            body.acceleration = Physics.scaleVec(netForce, 1 / body.mass);

            // Euler integration
            body.velocity = Physics.integrateVelocity(body.velocity, body.acceleration, dt);
            body.position = Physics.integratePosition(body.position, body.velocity, dt);
        }
    }

    /**
     * Removes all registered bodies and springs, resetting the simulation.
     * @returns {void}
     */
    static reset() {
        Physics.#bodies.clear();
        Physics.#springs.clear();
    }

    // =========================================================================
    // SPRING SIMULATION
    // =========================================================================

    /**
     * Creates a spring connecting two registered bodies and registers it by key.
     *
     * @param {string} key Unique identifier for this spring.
     * @param {string} bodyAKey Key of the first body.
     * @param {string} bodyBKey Key of the second body.
     * @param {{
     *   stiffness?: number,
     *   damping?: number,
     *   restLength?: number
     * }} [options={}]
     * @returns {{key:string, bodyA:string, bodyB:string, stiffness:number, damping:number, restLength:number}} The created spring.
     * @throws {Error} If either body key is not registered.
     */
    static createSpring(key, bodyAKey, bodyBKey, options = {}) {
        if (!Physics.#bodies.has(bodyAKey)) throw new Error(`Physics: no body with key "${bodyAKey}".`);
        if (!Physics.#bodies.has(bodyBKey)) throw new Error(`Physics: no body with key "${bodyBKey}".`);
        const spring = {
            key,
            bodyA: bodyAKey,
            bodyB: bodyBKey,
            stiffness:  options.stiffness  ?? 1,
            damping:    options.damping    ?? 0.1,
            restLength: options.restLength ?? 0
        };
        Physics.#springs.set(key, spring);
        return spring;
    }

    /**
     * Applies spring forces to the connected bodies for the current frame.
     * Should be called before {@link Physics.step}.
     *
     * @param {string} key Spring key.
     * @returns {void}
     */
    static applySpring(key) {
        const spring = Physics.#springs.get(key);
        if (!spring) return;

        const a = Physics.#bodies.get(spring.bodyA);
        const b = Physics.#bodies.get(spring.bodyB);
        if (!a || !b) return;

        const diff = Physics.subVec(b.position, a.position);
        const dist = Physics.magVec(diff);
        const stretch = dist - spring.restLength;

        if (dist === 0) return;

        const normal = Physics.scaleVec(diff, 1 / dist);
        const relVel = Physics.subVec(b.velocity, a.velocity);
        const dampingFactor = Physics.dotVec(relVel, normal) * spring.damping;

        const springMag = spring.stiffness * stretch + dampingFactor;
        const forceOnA = Physics.scaleVec(normal,  springMag);
        const forceOnB = Physics.scaleVec(normal, -springMag);

        a.forces.push(forceOnA);
        b.forces.push(forceOnB);
    }

    // =========================================================================
    // UTILITY
    // =========================================================================

    /**
     * Converts a mass in kg to its weight in Newtons on a given surface.
     * @param {number} mass Mass (kg).
     * @param {number} [g=Physics.GRAVITY] Gravitational acceleration (m/s²).
     * @returns {number} Weight (N).
     */
    static weight(mass, g = Physics.GRAVITY) {
        return mass * g;
    }

    /**
     * Converts a weight in Newtons back to a mass in kg.
     * @param {number} weightN Weight (N).
     * @param {number} [g=Physics.GRAVITY] Gravitational acceleration (m/s²).
     * @returns {number} Mass (kg).
     */
    static massFromWeight(weightN, g = Physics.GRAVITY) {
        if (g === 0) throw new RangeError("Gravitational acceleration cannot be zero.");
        return weightN / g;
    }

    /**
     * Clamps a speed value to a maximum, preserving direction for vectors.
     * @param {{x:number, y:number, z?:number}} velocity Velocity vector.
     * @param {number} maxSpeed Maximum allowed speed.
     * @returns {{x:number, y:number, z:number}} Clamped velocity.
     */
    static limitSpeed(velocity, maxSpeed) {
        const speed = Physics.magVec(velocity);
        if (speed <= maxSpeed || speed === 0) {
            return { x: velocity.x, y: velocity.y, z: velocity.z ?? 0 };
        }
        return Physics.scaleVec(Physics.normalizeVec(velocity), maxSpeed);
    }

    /**
     * Maps a range of physics values through {@link math.map}.
     * Convenience wrapper for use inside physics-driven animation.
     *
     * @param {number} value The value to map.
     * @param {number} inMin Input range minimum.
     * @param {number} inMax Input range maximum.
     * @param {number} outMin Output range minimum.
     * @param {number} outMax Output range maximum.
     * @returns {number} Mapped value.
     */
    static map(value, inMin, inMax, outMin, outMax) {
        return math.map(value, inMin, inMax, outMin, outMax);
    }
};
