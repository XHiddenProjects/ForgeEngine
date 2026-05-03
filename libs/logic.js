import { math } from "./math.js";
import { Helpers } from "./helpers.js";

export const Logic = class {
  constructor() {}

  // ---------------------------------------------------------------------------
  // Internal state stores
  // ---------------------------------------------------------------------------
  static #_repeaterAccumulators = new Map();
  static #_repeaterCounts       = new Map();
  static #_switchStates         = new Map();
  static #_toggleStates         = new Map();
  static #_routerIndices        = new Map();

  static #_counterStates        = new Map();
  static #_latchStates          = new Map();
  static #_flipflopStates       = new Map();
  static #_accumulatorStates    = new Map();
  static #_delayQueues          = new Map();
  static #_smoothStates         = new Map();
  static #_memoryStates         = new Map();

  // ===========================================================================
  // FILTER
  // Passes a value downstream only if it satisfies a condition, optionally
  // transforming it first. Mirrors Flowlab's Filter block.
  // ===========================================================================

  /**
   * Pass a value to onPass if it satisfies the condition, otherwise call onFail.
   * @param {*}        value      - The incoming value to test.
   * @param {Function} condition  - (value) => boolean
   * @param {Function} onPass     - Called with value when condition is true.
   * @param {Function} [onFail]   - Called with value when condition is false.
   * @example
   * Logic.filter(speed, v => v > 5, v => applyBoost(v), v => idle(v));
   */
  static filter(value, condition, onPass, onFail = null) {
    if (condition(value)) onPass(value);
    else if (onFail) onFail(value);
  }

  /**
   * Pass a value only if it falls within [min, max] (inclusive).
   * @param {number}   value   - The incoming number.
   * @param {number}   min
   * @param {number}   max
   * @param {Function} onPass  - Called with value when in range.
   * @param {Function} [onFail]
   */
  static filterRange(value, min, max, onPass, onFail = null) {
    Logic.filter(value, v => v >= min && v <= max, onPass, onFail);
  }

  /**
   * Pass only values that are strictly greater than a threshold.
   * @param {number}   value
   * @param {number}   threshold
   * @param {Function} onPass
   * @param {Function} [onFail]
   */
  static filterAbove(value, threshold, onPass, onFail = null) {
    Logic.filter(value, v => v > threshold, onPass, onFail);
  }

  /**
   * Pass only values that are strictly less than a threshold.
   * @param {number}   value
   * @param {number}   threshold
   * @param {Function} onPass
   * @param {Function} [onFail]
   */
  static filterBelow(value, threshold, onPass, onFail = null) {
    Logic.filter(value, v => v < threshold, onPass, onFail);
  }

  /**
   * Filter and transform: pass the mapped value if the original passes.
   * @param {*}        value
   * @param {Function} condition  - (value) => boolean
   * @param {Function} transform  - (value) => newValue
   * @param {Function} onPass     - Called with the transformed value.
   * @param {Function} [onFail]
   * @example
   * Logic.filterMap(rawAngle, v => v !== 0, v => math.degrees(v), angle => rotate(angle));
   */
  static filterMap(value, condition, transform, onPass, onFail = null) {
    if (condition(value)) onPass(transform(value));
    else if (onFail) onFail(value);
  }

  // ===========================================================================
  // REPEATER
  // Fires a callback N times, or indefinitely on a timed interval, like
  // Flowlab's Repeater block. Must be called every frame for timed mode.
  // ===========================================================================

  /**
   * Fire a callback a fixed number of times, then call onDone.
   * State is tracked by key so multiple independent repeaters can coexist.
   * @param {string}   key
   * @param {number}   times      - How many times to fire in total.
   * @param {Function} callback   - Called with (currentCount, totalTimes).
   * @param {Function} [onDone]   - Called once when count reaches `times`.
   * @example
   * Logic.repeat("explosion", 5, (i) => spawnParticle(i), () => cleanup());
   */
  static repeat(key, times, callback, onDone = null) {
    const count = this.#_repeaterCounts.get(key) ?? 0;
    if (count >= times) {
      if (onDone) onDone();
      return;
    }
    callback(count, times);
    const next = count + 1;
    this.#_repeaterCounts.set(key, next);
    if (next >= times && onDone) onDone();
  }

  /**
   * Reset a repeat counter so it can fire again.
   * @param {string} key
   */
  static resetRepeat(key) {
    this.#_repeaterCounts.delete(key);
  }

  /**
   * Fire a callback at a timed interval using delta time. Optionally stops
   * after `limit` fires. Call every frame.
   * @param {string}   key
   * @param {number}   interval  - Milliseconds between fires.
   * @param {number}   delta     - Milliseconds elapsed since last frame.
   * @param {Function} callback  - Called each time the interval elapses.
   * @param {number}   [limit=Infinity] - Stop after this many fires.
   * @param {Function} [onDone]  - Called when limit is reached.
   * @example
   * Logic.repeater("wave", 2000, delta, () => spawnWave(), 5, () => bossAppears());
   */
  static repeater(key, interval, delta, callback, limit = Infinity, onDone = null) {
    const count = this.#_repeaterCounts.get(key) ?? 0;
    if (count >= limit) {
      if (onDone) onDone();
      return;
    }
    const acc = (this.#_repeaterAccumulators.get(key) ?? 0) + delta;
    if (acc >= interval) {
      callback();
      const next = count + 1;
      this.#_repeaterCounts.set(key, next);
      this.#_repeaterAccumulators.set(key, acc % interval);
      if (next >= limit && onDone) onDone();
    } else {
      this.#_repeaterAccumulators.set(key, acc);
    }
  }

  /**
   * Reset a timed repeater (both accumulator and count).
   * @param {string} key
   */
  static resetRepeater(key) {
    this.#_repeaterAccumulators.delete(key);
    this.#_repeaterCounts.delete(key);
  }

  // ===========================================================================
  // SWITCH
  // Routes a signal to one of N outputs based on an index. Mirrors Flowlab's
  // Switch block. Index can be set manually or advanced automatically.
  // ===========================================================================

  /**
   * Call the output at the given index from the outputs array.
   * @param {Function[]} outputs  - Array of output callbacks.
   * @param {number}     index    - Zero-based index of the output to activate.
   * @param {*}          [value]  - Optional value passed to the active output.
   * @example
   * Logic.switch([goLeft, goRight, goUp, goDown], directionIndex, speed);
   */
  static switch(outputs, index, value = undefined) {
    const i = math.constrain(Math.floor(index), 0, outputs.length - 1);
    outputs[i](value);
  }

  /**
   * A stateful switch that remembers its current output index and can be
   * advanced, set, or queried. Call with a signal value to route it.
   * @param {string}     key
   * @param {Function[]} outputs
   * @param {*}          [value]     - Value passed to the active output.
   * @param {number}     [setIndex]  - If provided, sets the index before routing.
   * @example
   * Logic.switchKeyed("phase", [phase1, phase2, phase3], data);
   * Logic.switchKeyedNext("phase"); // advance to next output
   */
  static switchKeyed(key, outputs, value = undefined, setIndex = null) {
    if (setIndex !== null) {
      this.#_switchStates.set(key, math.constrain(Math.floor(setIndex), 0, outputs.length - 1));
    }
    const i = this.#_switchStates.get(key) ?? 0;
    outputs[i](value);
  }

  /**
   * Advance a keyed switch to the next output (wraps around).
   * @param {string} key
   * @param {number} [total]  - Total number of outputs (required for wrap).
   */
  static switchKeyedNext(key, total) {
    const current = this.#_switchStates.get(key) ?? 0;
    this.#_switchStates.set(key, (current + 1) % total);
  }

  /**
   * Set a keyed switch index directly.
   * @param {string} key
   * @param {number} index
   */
  static switchKeyedSet(key, index) {
    this.#_switchStates.set(key, Math.floor(index));
  }

  /**
   * Get the current index of a keyed switch.
   * @param {string} key
   * @returns {number}
   */
  static switchKeyedIndex(key) {
    return this.#_switchStates.get(key) ?? 0;
  }

  // ===========================================================================
  // TOGGLE
  // Flips a boolean state and routes to one of two outputs. Mirrors Flowlab's
  // Toggle block.
  // ===========================================================================

  /**
   * Flip the toggle state for a key and call the matching output.
   * @param {string}   key
   * @param {Function} onTrue   - Called when the toggle flips to true.
   * @param {Function} onFalse  - Called when the toggle flips to false.
   * @param {*}        [value]  - Optional value passed to the active output.
   * @example
   * Logic.toggle("door", () => openDoor(), () => closeDoor());
   */
  static toggle(key, onTrue, onFalse, value = undefined) {
    const next = !(this.#_toggleStates.get(key) ?? false);
    this.#_toggleStates.set(key, next);
    if (next) onTrue(value);
    else onFalse(value);
  }

  /**
   * Read the current toggle state without flipping it.
   * @param {string} key
   * @returns {boolean}
   */
  static toggleState(key) {
    return this.#_toggleStates.get(key) ?? false;
  }

  /**
   * Force a toggle to a specific state without calling any output.
   * @param {string}  key
   * @param {boolean} state
   */
  static toggleSet(key, state) {
    this.#_toggleStates.set(key, !!state);
  }

  // ===========================================================================
  // ROUTER
  // Sends one input to many outputs or fans in many inputs to one output.
  // Mirrors Flowlab's Router block.
  // ===========================================================================

  /**
   * Fan-out: send a single value to all output callbacks.
   * @param {*}          value
   * @param {Function[]} outputs
   * @example
   * Logic.router(playerPos, [minimap.update, radar.update, shadowCaster.update]);
   */
  static router(value, outputs) {
    for (const out of outputs) out(value);
  }

  /**
   * Round-robin: send a value to outputs one at a time, cycling on each call.
   * @param {string}     key
   * @param {*}          value
   * @param {Function[]} outputs
   * @example
   * Logic.routerRoundRobin("spawnSlot", enemy, [slot1, slot2, slot3]);
   */
  static routerRoundRobin(key, value, outputs) {
    const i = (this.#_routerIndices.get(key) ?? 0) % outputs.length;
    outputs[i](value);
    this.#_routerIndices.set(key, i + 1);
  }

  /**
   * Random router: send a value to a randomly selected output.
   * @param {*}          value
   * @param {Function[]} outputs
   */
  static routerRandom(value, outputs) {
    const i = math.randomInt(0, outputs.length - 1, true);
    outputs[i](value);
  }

  /**
   * Priority router: try each output's guard in order; call the first that passes.
   * @param {*}                           value
   * @param {Array<[Function, Function]>} guards  - Array of [condition, output] pairs.
   * @param {Function}                    [fallback] - Called if no guard passes.
   * @example
   * Logic.routerPriority(hp, [
   *   [v => v <= 0,  () => die()],
   *   [v => v < 20,  () => panic()],
   *   [v => v < 50,  () => warn()],
   * ], () => idle());
   */
  static routerPriority(value, guards, fallback = null) {
    for (const [condition, output] of guards) {
      if (condition(value)) { output(value); return; }
    }
    if (fallback) fallback(value);
  }

  // ===========================================================================
  // GATE — Boolean logic gates
  // Each gate evaluates its inputs and calls onTrue or onFalse with the result.
  // Inputs are coerced to booleans. All gates accept 2+ inputs except NOT.
  // ===========================================================================

  /**
   * AND gate — true only if every input is true.
   * @param {boolean[]} inputs
   * @param {Function}  onTrue
   * @param {Function}  [onFalse]
   * @example
   * Logic.gate.AND([hasKey, atDoor, !isDead], () => openDoor());
   */
  static gate = {
    /**
     * AND — true if all inputs are true.
     * @param {boolean[]} inputs
     * @param {Function}  onTrue
     * @param {Function}  [onFalse]
     */
    AND(inputs, onTrue, onFalse = null) {
      const result = inputs.every(Boolean);
      if (result) onTrue(result); else if (onFalse) onFalse(result);
      return result;
    },

    /**
     * OR — true if at least one input is true.
     * @param {boolean[]} inputs
     * @param {Function}  onTrue
     * @param {Function}  [onFalse]
     */
    OR(inputs, onTrue, onFalse = null) {
      const result = inputs.some(Boolean);
      if (result) onTrue(result); else if (onFalse) onFalse(result);
      return result;
    },

    /**
     * NOT — inverts a single input.
     * @param {boolean}  input
     * @param {Function} onTrue
     * @param {Function} [onFalse]
     */
    NOT(input, onTrue, onFalse = null) {
      const result = !input;
      if (result) onTrue(result); else if (onFalse) onFalse(result);
      return result;
    },

    /**
     * NAND — true if NOT all inputs are true (inverse of AND).
     * @param {boolean[]} inputs
     * @param {Function}  onTrue
     * @param {Function}  [onFalse]
     */
    NAND(inputs, onTrue, onFalse = null) {
      const result = !inputs.every(Boolean);
      if (result) onTrue(result); else if (onFalse) onFalse(result);
      return result;
    },

    /**
     * NOR — true only if all inputs are false (inverse of OR).
     * @param {boolean[]} inputs
     * @param {Function}  onTrue
     * @param {Function}  [onFalse]
     */
    NOR(inputs, onTrue, onFalse = null) {
      const result = !inputs.some(Boolean);
      if (result) onTrue(result); else if (onFalse) onFalse(result);
      return result;
    },

    /**
     * XOR — true if an odd number of inputs are true.
     * @param {boolean[]} inputs
     * @param {Function}  onTrue
     * @param {Function}  [onFalse]
     */
    XOR(inputs, onTrue, onFalse = null) {
      const result = inputs.reduce((acc, v) => acc ^ Boolean(v), false);
      if (result) onTrue(result); else if (onFalse) onFalse(result);
      return result;
    },

    /**
     * XNOR — true if all inputs are equal (inverse of XOR).
     * @param {boolean[]} inputs
     * @param {Function}  onTrue
     * @param {Function}  [onFalse]
     */
    XNOR(inputs, onTrue, onFalse = null) {
      const result = !inputs.reduce((acc, v) => acc ^ Boolean(v), false);
      if (result) onTrue(result); else if (onFalse) onFalse(result);
      return result;
    },

    /**
     * Evaluate a raw boolean expression and route its result.
     * Useful when you've already computed the condition and just want the
     * callback routing behaviour.
     * @param {boolean}  value
     * @param {Function} onTrue
     * @param {Function} [onFalse]
     */
    BOOL(value, onTrue, onFalse = null) {
      if (value) onTrue(true); else if (onFalse) onFalse(false);
      return !!value;
    },
  };

  // ===========================================================================
  // COUNTER
  // Accumulates increments and fires when it reaches a target. Mirrors
  // Flowlab's Counter block.
  // ===========================================================================

  /**
   * Increment a counter by `amount` and fire onReach when it hits `target`.
   * @param {string}   key
   * @param {number}   target      - The value that triggers the callback.
   * @param {Function} onReach     - Called with the final count when target is reached.
   * @param {number}   [amount=1]  - How much to add each call.
   * @param {boolean}  [reset=true] - Auto-reset to 0 after reaching target.
   * @example
   * Logic.counter("kills", 10, () => nextWave(), 1);
   */
  static counter(key, target, onReach, amount = 1, reset = true) {
    const current = (this.#_counterStates.get(key) ?? 0) + amount;
    if (current >= target) {
      onReach(current);
      this.#_counterStates.set(key, reset ? 0 : current);
    } else {
      this.#_counterStates.set(key, current);
    }
  }

  /**
   * Decrement a counter and fire when it reaches or falls below zero.
   * @param {string}   key
   * @param {Function} onZero     - Called when the counter hits 0 or below.
   * @param {number}   [amount=1]
   * @param {boolean}  [reset=true]
   */
  static countdown(key, onZero, amount = 1, reset = true) {
    const current = (this.#_counterStates.get(key) ?? 0) - amount;
    if (current <= 0) {
      onZero(current);
      this.#_counterStates.set(key, reset ? 0 : current);
    } else {
      this.#_counterStates.set(key, current);
    }
  }

  /**
   * Read the current value of a counter without changing it.
   * @param {string} key
   * @returns {number}
   */
  static counterValue(key) {
    return this.#_counterStates.get(key) ?? 0;
  }

  /**
   * Set a counter to a specific value.
   * @param {string} key
   * @param {number} value
   */
  static counterSet(key, value) {
    this.#_counterStates.set(key, value);
  }

  /**
   * Reset a counter to 0.
   * @param {string} key
   */
  static counterReset(key) {
    this.#_counterStates.set(key, 0);
  }

  // ===========================================================================
  // LATCH
  // Stores a value when triggered and holds it until explicitly cleared.
  // Mirrors Flowlab's Stopper/latch pattern.
  // ===========================================================================

  /**
   * Store `value` under `key` if no value is currently held.
   * @param {string}   key
   * @param {*}        value
   * @param {Function} [onStore]  - Called with value when it is first stored.
   */
  static latch(key, value, onStore = null) {
    if (!this.#_latchStates.has(key)) {
      this.#_latchStates.set(key, value);
      if (onStore) onStore(value);
    }
  }

  /**
   * Force-store a value, overwriting any existing latched value.
   * @param {string} key
   * @param {*}      value
   */
  static latchSet(key, value) {
    this.#_latchStates.set(key, value);
  }

  /**
   * Read the latched value.
   * @param {string} key
   * @param {*}      [fallback=null]
   * @returns {*}
   */
  static latchGet(key, fallback = null) {
    return this.#_latchStates.has(key) ? this.#_latchStates.get(key) : fallback;
  }

  /**
   * Clear the latch so it can accept a new value.
   * @param {string} key
   */
  static latchClear(key) {
    this.#_latchStates.delete(key);
  }

  /**
   * Pass the latched value to a callback if one is stored.
   * @param {string}   key
   * @param {Function} callback
   */
  static latchRead(key, callback) {
    if (this.#_latchStates.has(key)) callback(this.#_latchStates.get(key));
  }

  // ===========================================================================
  // FLIP-FLOP
  // Alternates between two states on each trigger pulse. Like a D flip-flop.
  // ===========================================================================

  /**
   * Alternate state between A and B on each call. Returns the new state.
   * @param {string}   key
   * @param {Function} onA      - Called when state becomes A (false).
   * @param {Function} onB      - Called when state becomes B (true).
   * @param {*}        [value]
   * @returns {boolean} The new state (true = B).
   * @example
   * Logic.flipflop("doorState", () => openDoor(), () => closeDoor());
   */
  static flipflop(key, onA, onB, value = undefined) {
    const next = !(this.#_flipflopStates.get(key) ?? false);
    this.#_flipflopStates.set(key, next);
    if (next) onB(value);
    else onA(value);
    return next;
  }

  // ===========================================================================
  // ACCUMULATOR
  // Adds incoming values over time and outputs the running total.
  // ===========================================================================

  /**
   * Add `amount` to an accumulator and pass the total to a callback.
   * @param {string}   key
   * @param {number}   amount
   * @param {Function} callback   - Called with the new total.
   * @param {number}   [max=Infinity] - Clamp the total to this maximum.
   * @param {number}   [min=-Infinity]
   * @example
   * Logic.accumulate("score", points, total => scoreDisplay.set(total), 9999, 0);
   */
  static accumulate(key, amount, callback, max = Infinity, min = -Infinity) {
    const total = math.constrain(
      (this.#_accumulatorStates.get(key) ?? 0) + amount,
      min, max
    );
    this.#_accumulatorStates.set(key, total);
    callback(total);
  }

  /**
   * Read the current accumulator value without changing it.
   * @param {string} key
   * @returns {number}
   */
  static accumulatorValue(key) {
    return this.#_accumulatorStates.get(key) ?? 0;
  }

  /**
   * Reset an accumulator to 0 (or a given value).
   * @param {string} key
   * @param {number} [value=0]
   */
  static accumulatorReset(key, value = 0) {
    this.#_accumulatorStates.set(key, value);
  }

  // ===========================================================================
  // DELAY
  // Holds values in a queue and releases them after N frames. Mirrors
  // Call every frame.
  // ===========================================================================

  /**
   * Enqueue a value and release whatever was enqueued `frames` steps ago.
   * Call once per frame with the same key and frame count.
   * @param {string}   key
   * @param {*}        value     - The incoming value this frame.
   * @param {number}   frames    - How many frames to delay by.
   * @param {Function} callback  - Called with the delayed value once it emerges.
   * @example
   * // Output what the player's position was 10 frames ago
   * Logic.delay("ghostPos", player.pos, 10, pos => drawGhost(pos));
   */
  static delay(key, value, frames, callback) {
    const queue = this.#_delayQueues.get(key) ?? [];
    queue.push(value);
    if (queue.length > frames) {
      callback(queue.shift());
    }
    this.#_delayQueues.set(key, queue);
  }

  /**
   * Flush the delay queue for a key.
   * @param {string} key
   */
  static delayReset(key) {
    this.#_delayQueues.delete(key);
  }

  // ===========================================================================
  // SMOOTH (Lerp follower)
  // Moves a stored value toward a target each frame, like Flowlab's Lerp block.
  // ===========================================================================

  /**
   * Step a stored value toward `target` by `factor` each frame, then output it.
   * Call every frame with the same key.
   * @param {string}   key
   * @param {number}   target   - The value to move toward.
   * @param {number}   factor   - Lerp factor per frame (0 = no movement, 1 = instant).
   * @param {Function} callback - Called with the current smoothed value.
   * @param {number}   [start]  - Initial value on first call (defaults to target).
   * @example
   * Logic.smooth("camX", player.x, 0.1, x => camera.x = x);
   */
  static smooth(key, target, factor, callback, start = null) {
    const current = this.#_smoothStates.has(key)
      ? this.#_smoothStates.get(key)
      : (start ?? target);
      
    const next = current + (target - current) * math.constrain(factor, 0, 1);
    this.#_smoothStates.set(key, next);
    callback(next);
  }

  /**
   * Snap the smooth follower directly to a value (e.g. after teleport).
   * @param {string} key
   * @param {number} value
   */
  static smoothSnap(key, value) {
    this.#_smoothStates.set(key, value);
  }

  // ===========================================================================
  // MEMORY
  // A simple named value store — read, write, and conditionally transform.
  // ===========================================================================

  /**
   * Write a value into memory.
   * @param {string} key
   * @param {*}      value
   */
  static memoryWrite(key, value) {
    this.#_memoryStates.set(key, value);
  }

  /**
   * Read a value from memory.
   * @param {string} key
   * @param {*}      [fallback=null]
   * @returns {*}
   */
  static memoryRead(key, fallback = null) {
    return this.#_memoryStates.has(key) ? this.#_memoryStates.get(key) : fallback;
  }

  /**
   * Read and pass a memory value to a callback.
   * @param {string}   key
   * @param {Function} callback
   * @param {*}        [fallback=null]
   */
  static memoryGet(key, callback, fallback = null) {
    callback(Logic.memoryRead(key, fallback));
  }

  /**
   * Modify a memory value in-place via a transform function.
   * @param {string}   key
   * @param {Function} transform  - (currentValue) => newValue
   * @param {*}        [initial=0]
   * @example
   * Logic.memoryModify("coins", v => v + 10);
   */
  static memoryModify(key, transform, initial = 0) {
    const current = Logic.memoryRead(key, initial);
    Logic.memoryWrite(key, transform(current));
  }

  /**
   * Delete a memory entry.
   * @param {string} key
   */
  static memoryDelete(key) {
    this.#_memoryStates.delete(key);
  }

  // ===========================================================================
  // RESET ALL
  // Wipe every internal state map — useful on scene/level transitions.
  // ===========================================================================

  /**
   * Reset all Logic state.
   */
  static resetAll() {
    this.#_repeaterAccumulators.clear();
    this.#_repeaterCounts.clear();
    this.#_switchStates.clear();
    this.#_toggleStates.clear();
    this.#_routerIndices.clear();
    this.#_counterStates.clear();
    this.#_latchStates.clear();
    this.#_flipflopStates.clear();
    this.#_accumulatorStates.clear();
    this.#_delayQueues.clear();
    this.#_smoothStates.clear();
    this.#_memoryStates.clear();
  }
};
