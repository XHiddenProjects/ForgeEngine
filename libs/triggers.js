import { math } from "./math.js";
import { Canvex } from "./canvex.js";
export const Triggers = class {
    static #_triggered = false;
    static #_intervalAccumulators = new Map();
    static #_onceMap = new Map();
    static #_enterStates = new Map();
    static #_sequenceStates = new Map();
    static #_nthCounters = new Map();
    static #_mailbox = new Map(); // key: address, value: Message[]
    static #_timerAccumulators = new Map(); // key: string, value: { elapsed, duration, fired }

  /**
   * Checks for collision between two circles and executes a callback if they collide.
   * @param {number} x1 - X coordinate of the center of the first circle.
   * @param {number} y1 - Y coordinate of the center of the first circle.
   * @param {number} x2 - X coordinate of the center of the second circle.
   * @param {number} y2 - Y coordinate of the center of the second circle.
   * @param {number} [r1=0] - Radius of the first circle.
   * @param {number} [r2=0] - Radius of the second circle.
   * @param {Function} callback - The function to call if a collision is detected.
   */
  static collision(x1, y1, x2, y2, r1=0, r2=0, callback) {
    const distance = math.dist(x1,y1, x2, y2);
    if (distance < r1 + r2) callback();
  }

  /**
   * Checks for collision between two axis-aligned rectangles and executes a callback if they overlap.
   * @param {number} x1 - X coordinate of the top-left corner of the first rectangle.
   * @param {number} y1 - Y coordinate of the top-left corner of the first rectangle.
   * @param {number} w1 - Width of the first rectangle.
   * @param {number} h1 - Height of the first rectangle.
   * @param {number} x2 - X coordinate of the top-left corner of the second rectangle.
   * @param {number} y2 - Y coordinate of the top-left corner of the second rectangle.
   * @param {number} w2 - Width of the second rectangle.
   * @param {number} h2 - Height of the second rectangle.
   * @param {Function} callback - The function to call if a collision is detected.
   */
  static collisionRect(x1, y1, w1, h1, x2, y2, w2, h2, callback) {
    if (x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2) {
      callback();
    }
  }

  /**
   * Trigger a callback function once when a specified condition is met.
   * @param {Function} callback - The function to call when the condition is met.
   */
  static once(callback) {
    if (!this.#_triggered) {
        callback();
        this.#_triggered = true;
    }
  }

  /**
   * Trigger a callback function once per unique key. Useful for per-entity one-shot events.
   * @param {string} key - A unique identifier for this trigger instance.
   * @param {Function} callback - The function to call the first time this key is seen.
   * @example
   * Triggers.onceKeyed("enemy_death_42", () => spawnLoot());
   */
  static onceKeyed(key, callback) {
    if (!this.#_onceMap.has(key)) {
      this.#_onceMap.set(key, true);
      callback();
    }
  }

  /**
   * Reset a keyed once trigger so it can fire again.
   * @param {string} key - The key to reset.
   */
  static resetOnce(key) {
    this.#_onceMap.delete(key);
  }

  /**
   * Trigger a callback function every time a specified condition is met.
   * @param {Function} callback - The function to call when the condition is met.
   */
  static always(callback) {
    callback();
  }

  /**
   * Trigger a callback function if a specified condition is met.
   * @param {Function} condition - A function that returns a boolean indicating whether the trigger condition is met.
   * @param {Function} callback - The function to call when the condition is met.
   * @example
   * let count = 0;
   * Triggers.conditional(() => count < 5, () => { console.log(count); count++; });
   */
  static conditional(condition, callback) {
    if(condition()) callback();
  }

  /**
   * Fires callback only on the rising edge — when condition transitions from false to true.
   * Must be called every frame with the same key.
   * @param {string} key - A unique identifier for this trigger instance.
   * @param {Function} condition - A function returning a boolean.
   * @param {Function} callback - The function to call on the rising edge.
   * @example
   * // Fires once when the player first enters the danger zone
   * Triggers.onEnter("inDanger", () => player.hp < 20, () => playAlarm());
   */
  static onEnter(key, condition, callback) {
    const wasActive = this.#_enterStates.get(key) ?? false;
    const isActive = condition();
    if (!wasActive && isActive) callback();
    this.#_enterStates.set(key, isActive);
  }

  /**
   * Fires callback only on the falling edge — when condition transitions from true to false.
   * Must be called every frame with the same key.
   * @param {string} key - A unique identifier for this trigger instance.
   * @param {Function} condition - A function returning a boolean.
   * @param {Function} callback - The function to call on the falling edge.
   * @example
   * // Fires once when the player leaves the danger zone
   * Triggers.onExit("inDanger", () => player.hp < 20, () => stopAlarm());
   */
  static onExit(key, condition, callback) {
    const wasActive = this.#_enterStates.get(key) ?? false;
    const isActive = condition();
    if (wasActive && !isActive) callback();
    this.#_enterStates.set(key, isActive);
  }

  /**
   * Fires onEnter callback when condition becomes true, onExit callback when it becomes false.
   * Must be called every frame with the same key.
   * @param {string} key - A unique identifier for this trigger instance.
   * @param {Function} condition - A function returning a boolean.
   * @param {Function} onEnterCallback - Called when condition transitions false → true.
   * @param {Function} onExitCallback - Called when condition transitions true → false.
   */
  static onEnterExit(key, condition, onEnterCallback, onExitCallback) {
    const wasActive = this.#_enterStates.get(key) ?? false;
    const isActive = condition();
    if (!wasActive && isActive) onEnterCallback();
    else if (wasActive && !isActive) onExitCallback();
    this.#_enterStates.set(key, isActive);
  }

  /**
   * Trigger a callback at a repeating interval based on accumulated delta time.
   * Must be called every frame with the same key.
   * @param {string} key - A unique identifier for this trigger instance.
   * @param {number} interval - Time in milliseconds between triggers.
   * @param {number} delta - Time in milliseconds elapsed since the last frame.
   * @param {Function} callback - The function to call each time the interval elapses.
   * @example
   * // Fire every 500ms
   * Triggers.interval("enemySpawn", 500, delta, () => spawnEnemy());
   */
  static interval(key, interval, delta, callback) {
    const acc = (this.#_intervalAccumulators.get(key) ?? 0) + delta;
    if (acc >= interval) {
      callback();
      this.#_intervalAccumulators.set(key, acc % interval);
    } else {
      this.#_intervalAccumulators.set(key, acc);
    }
  }

  /**
   * Trigger a callback only every Nth time it is called.
   * @param {string} key - A unique identifier for this trigger instance.
   * @param {number} n - How often to fire (e.g. 3 = every 3rd call).
   * @param {Function} callback - The function to call on every Nth invocation.
   * @example
   * // Only process every 3rd frame
   * Triggers.everyNth("heavyUpdate", 3, () => runExpensiveLogic());
   */
  static everyNth(key, n, callback) {
    const count = (this.#_nthCounters.get(key) ?? 0) + 1;
    this.#_nthCounters.set(key, count % n);
    if (count % n === 0) callback();
  }

  /**
   * Fires a callback when a value crosses above a threshold.
   * @param {number} value - The current value to check.
   * @param {number} threshold - The threshold to cross.
   * @param {Function} callback - The function to call when value exceeds the threshold.
   * @example
   * Triggers.threshold(score, 100, () => levelUp());
   */
  static threshold(value, threshold, callback) {
    if (value >= threshold) callback();
  }

  /**
   * Fires a callback when a value falls within a range (inclusive).
   * @param {number} value - The current value to check.
   * @param {number} min - The minimum of the range.
   * @param {number} max - The maximum of the range.
   * @param {Function} callback - The function to call when the value is within range.
   * @example
   * Triggers.inRange(player.x, 200, 400, () => enterZone());
   */
  static inRange(value, min, max, callback) {
    if (value >= min && value <= max) callback();
  }

  /**
   * Fires a different callback depending on whether a condition is true or false.
   * @param {Function} condition - A function returning a boolean.
   * @param {Function} ifCallback - Called when condition is true.
   * @param {Function} elseCallback - Called when condition is false.
   * @example
   * Triggers.branch(() => player.isGrounded, () => runJumpLogic(), () => runFallLogic());
   */
  static branch(condition, ifCallback, elseCallback) {
    if (condition()) ifCallback();
    else elseCallback();
  }

  /**
   * Fires a callback when all provided conditions are true simultaneously.
   * @param {Function[]} conditions - Array of condition functions.
   * @param {Function} callback - Called when all conditions return true.
   * @example
   * Triggers.all([() => hasKey, () => atDoor, () => !isDead], () => openDoor());
   */
  static all(conditions, callback) {
    if (conditions.every(c => c())) callback();
  }

  /**
   * Fires a callback when at least one of the provided conditions is true.
   * @param {Function[]} conditions - Array of condition functions.
   * @param {Function} callback - Called when any condition returns true.
   * @example
   * Triggers.any([() => onFire, () => inPoison], () => applyDamageOverTime());
   */
  static any(conditions, callback) {
    if (conditions.some(c => c())) callback();
  }

  /**
   * Fires callbacks in sequence — each call advances to the next step.
   * Loops back to the start after the last step.
   * @param {string} key - A unique identifier for this trigger instance.
   * @param {Function[]} callbacks - Ordered array of functions to cycle through.
   * @example
   * // Cycles: patrol → attack → retreat → patrol → ...
   * Triggers.sequence("bossPhase", [doPatrol, doAttack, doRetreat]);
   */
  static sequence(key, callbacks) {
    const index = this.#_sequenceStates.get(key) ?? 0;
    callbacks[index]();
    this.#_sequenceStates.set(key, (index + 1) % callbacks.length);
  }

  /**
   * Fires a callback when a point (px, py) is inside an axis-aligned rectangle.
   * @param {number} px - X coordinate of the point.
   * @param {number} py - Y coordinate of the point.
   * @param {number} rx - X coordinate of the rectangle's top-left corner.
   * @param {number} ry - Y coordinate of the rectangle's top-left corner.
   * @param {number} rw - Width of the rectangle.
   * @param {number} rh - Height of the rectangle.
   * @param {Function} callback - Called when the point is inside the rectangle.
   * @example
   * Triggers.pointInRect(mouse.x, mouse.y, btn.x, btn.y, btn.w, btn.h, () => hover());
   */
  static pointInRect(px, py, rx, ry, rw, rh, callback) {
    if (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh) callback();
  }

  /**
   * Fires a callback when a point (px, py) is inside a circle.
   * @param {number} px - X coordinate of the point.
   * @param {number} py - Y coordinate of the point.
   * @param {number} cx - X coordinate of the circle's center.
   * @param {number} cy - Y coordinate of the circle's center.
   * @param {number} r - Radius of the circle.
   * @param {Function} callback - Called when the point is inside the circle.
   */
  static pointInCircle(px, py, cx, cy, r, callback) {
    if (math.dist(px, py, cx, cy) <= r) callback();
  }

  // ---------------------------------------------------------------------------
  // Timer — one-shot countdown trigger
  // ---------------------------------------------------------------------------

  /**
   * Fires a callback after a duration expressed in tenths of a second (ticks),
   * where 1 tick = 100 ms. By default fires once and stops; pass `repeat: true`
   * to loop indefinitely. Must be called every frame with the same key.
   * Use `resetTimer` to rearm a one-shot timer or restart a repeating one.
   *
   * @param {string} key - A unique identifier for this timer instance.
   * @param {number} durationTicks - Number of 1/10th-second ticks before firing.
   * @param {number} delta - Time in milliseconds elapsed since the last frame.
   * @param {Function} callback - The function to call when the timer expires.
   * @param {Object} [options={}] - Optional configuration.
   * @param {boolean} [options.repeat=false] - If true the timer loops after firing.
   * @returns {number} Remaining ticks until next fire (0 when fired this frame).
   * @example
   * // One-shot: show banner after 3 seconds (30 ticks)
   * Triggers.timer("levelIntro", 30, delta, () => showBanner("Ready!"));
   *
   * // Repeating: spawn an enemy every 2 seconds (20 ticks)
   * Triggers.timer("spawn", 20, delta, () => spawnEnemy(), { repeat: true });
   *
   * // Rearm a one-shot timer (e.g. on player respawn)
   * if (player.justRespawned) Triggers.resetTimer("levelIntro");
   */
  static timer(key, durationTicks, delta, callback, { repeat = false } = {}) {
    const MS_PER_TICK = 100;
    const durationMs = durationTicks * MS_PER_TICK;

    let state = this.#_timerAccumulators.get(key);
    if (!state) {
      // repeatLimit: Infinity = loop forever, 0 = one-shot, N = N additional repeats
      const repeatLimit = repeat === true ? Infinity : (repeat === false ? 0 : repeat);
      state = { elapsed: 0, fired: false, fireCount: 0, repeatLimit };
      this.#_timerAccumulators.set(key, state);
    }

    if (state.fired) return 0;

    state.elapsed += delta;

    if (state.elapsed >= durationMs) {
      const index = state.fireCount;
      state.fireCount += 1;
      callback(index);

      const shouldRepeat = state.repeatLimit === Infinity || state.fireCount < state.repeatLimit;
      if (shouldRepeat) {
        state.elapsed = state.elapsed % durationMs;
      } else {
        state.fired = true;
        state.elapsed = durationMs;
        return 0;
      }
    }

    return Math.ceil((durationMs - state.elapsed) / MS_PER_TICK);
  }

  /**
   * Rearms a timer so it counts down fresh from zero.
   * Works for one-shot, finite-repeat, and infinite-repeat timers.
   * @param {string} key - The timer key to reset.
   * @example
   * Triggers.resetTimer("levelIntro");
   */
  static resetTimer(key) {
    this.#_timerAccumulators.delete(key);
  }

  /**
   * Returns whether a timer has fully completed (one-shot fired, or finite
   * repeat exhausted). Always returns false for infinite timers.
   * @param {string} key - The timer key to check.
   * @returns {boolean}
   */
  static timerFired(key) {
    return this.#_timerAccumulators.get(key)?.fired ?? false;
  }

  /**
   * Returns how many times a timer's callback has fired so far.
   * @param {string} key - The timer key to check.
   * @returns {number}
   */
  static timerCount(key) {
    return this.#_timerAccumulators.get(key)?.fireCount ?? 0;
  }

 

  // ---------------------------------------------------------------------------
  // Mailbox — message queue triggers
  // ---------------------------------------------------------------------------

  /**
   * Post a message to a named mailbox address.
   * @param {string} address - The mailbox to deliver to.
   * @param {*} [payload=null] - Optional data to attach to the message.
   * @example
   * Triggers.send("player", { type: "damage", amount: 10 });
   */
  static send(address, payload = null) {
    if (!this.#_mailbox.has(address)) this.#_mailbox.set(address, []);
    this.#_mailbox.get(address).push({ payload, timestamp: Date.now() });
  }

  /**
   * Fire a callback for every unread message at an address, then clear the queue.
   * Call once per frame to process incoming messages.
   * @param {string} address - The mailbox address to read from.
   * @param {Function} callback - Called with (payload, index) for each message.
   * @example
   * Triggers.receive("player", (msg) => {
   *   if (msg.type === "damage") player.hp -= msg.amount;
   * });
   */
  static receive(address, callback) {
    const messages = this.#_mailbox.get(address);
    if (!messages || messages.length === 0) return;
    messages.forEach((msg, i) => callback(msg.payload, i));
    this.#_mailbox.set(address, []);
  }

  /**
   * Fire a callback only if at least one message at the address matches a filter.
   * Matching messages are consumed; non-matching ones remain in the queue.
   * @param {string} address - The mailbox address to read from.
   * @param {Function} filter - A function that receives a payload and returns true to consume it.
   * @param {Function} callback - Called with (payload) for each matching message.
   * @example
   * Triggers.receiveIf("player", (msg) => msg.type === "heal", (msg) => player.hp += msg.amount);
   */
  static receiveIf(address, filter, callback) {
    const messages = this.#_mailbox.get(address);
    if (!messages || messages.length === 0) return;
    const remaining = [];
    for (const msg of messages) {
      if (filter(msg.payload)) callback(msg.payload);
      else remaining.push(msg);
    }
    this.#_mailbox.set(address, remaining);
  }

  /**
   * Fire a callback only for the first unread message at an address, leaving the rest.
   * @param {string} address - The mailbox address to read from.
   * @param {Function} callback - Called with (payload) for the first message.
   * @example
   * Triggers.receiveOne("boss", (msg) => handleBossEvent(msg));
   */
  static receiveOne(address, callback) {
    const messages = this.#_mailbox.get(address);
    if (!messages || messages.length === 0) return;
    const [first, ...rest] = messages;
    callback(first.payload);
    this.#_mailbox.set(address, rest);
  }

  /**
   * Check how many unread messages are waiting at an address, without consuming them.
   * @param {string} address - The mailbox address to check.
   * @returns {number} Number of pending messages.
   * @example
   * if (Triggers.pending("player") > 3) console.warn("Message backlog!");
   */
  static pending(address) {
    return this.#_mailbox.get(address)?.length ?? 0;
  }

  /**
   * Fire a callback if there is at least one unread message at an address (does not consume).
   * @param {string} address - The mailbox address to check.
   * @param {Function} callback - Called with the full messages array when mail is waiting.
   * @example
   * Triggers.hasMail("enemy_42", () => flashIndicator());
   */
  static hasMail(address, callback) {
    const messages = this.#_mailbox.get(address);
    if (messages && messages.length > 0) callback(messages.map(m => m.payload));
  }

  /**
   * Broadcast a message to all addresses that start with a given prefix.
   * @param {string} prefix - The address prefix to broadcast to (e.g. "enemy_").
   * @param {*} [payload=null] - Optional data to attach to the message.
   * @example
   * Triggers.broadcast("enemy_", { type: "alert", source: "player" });
   */
  static broadcast(prefix, payload = null) {
    for (const address of this.#_mailbox.keys()) {
      if (address.startsWith(prefix)) this.send(address, payload);
    }
    // Also seed new addresses that haven't been initialised yet by creating one entry
    // for the prefix itself so senders can target "enemy_" as a wildcard group.
    this.send(prefix + "*broadcast*", payload);
  }

  /**
   * Discard all unread messages at an address without processing them.
   * @param {string} address - The mailbox address to flush.
   */
  static flushMailbox(address) {
    this.#_mailbox.set(address, []);
  }

  /**
   * Reset all stateful trigger data (intervals, onceKeyed, enter/exit states, etc.).
   * Useful when resetting a level or scene.
   */
  static resetAll() {
    this.#_triggered = false;
    this.#_intervalAccumulators.clear();
    this.#_onceMap.clear();
    this.#_enterStates.clear();
    this.#_sequenceStates.clear();
    this.#_nthCounters.clear();
    this.#_mailbox.clear();
    this.#_timerAccumulators.clear();
  }

}
