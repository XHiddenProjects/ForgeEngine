"use strict";

/**
 * Cross-platform mouse, pointer-lock, wheel, and touch event manager.
 *
 * All event state, callbacks, and utilities are contained in this class.
 * Override the callback methods or assign functions to them, then call
 * Events.attach(element). The class attaches to document automatically when
 * loaded in a browser.
 *
 * @example
 * Events.mousePressed = function (event) {
 *   console.log(Events.mouseX, Events.mouseY, event);
 * };
 *
 * Events.attach(document.querySelector("canvas"));
 */
class Events {
  /** @type {number} Current horizontal position relative to the attached target. */
  static mouseX = 0;

  /** @type {number} Current vertical position relative to the attached target. */
  static mouseY = 0;

  /** @type {number} Previous horizontal position relative to the attached target. */
  static pmouseX = 0;

  /** @type {number} Previous vertical position relative to the attached target. */
  static pmouseY = 0;

  /** @type {number} Horizontal movement reported or calculated for the latest event. */
  static movedX = 0;

  /** @type {number} Vertical movement reported or calculated for the latest event. */
  static movedY = 0;

  /** @type {number} Current horizontal position within the browser viewport. */
  static winMouseX = 0;

  /** @type {number} Current vertical position within the browser viewport. */
  static winMouseY = 0;

  /** @type {number} Previous horizontal position within the browser viewport. */
  static pwinMouseX = 0;

  /** @type {number} Previous vertical position within the browser viewport. */
  static pwinMouseY = 0;

  /** @type {boolean} Whether any mouse or touch button is currently pressed. */
  static mouseIsPressed = false;

  /**
   * Current mouse-button state by both name and standard numeric index.
   *
   * @type {{left: boolean, middle: boolean, right: boolean, back: boolean,
   * forward: boolean, 0: boolean, 1: boolean, 2: boolean, 3: boolean, 4: boolean}}
   */
  static mouseButton = {
    left: false,
    middle: false,
    right: false,
    back: false,
    forward: false,
    0: false,
    1: false,
    2: false,
    3: false,
    4: false
  };

  /**
   * All active touch points in normalized form.
   *
   * @type {Array<{id: number, x: number, y: number, winX: number,
   * winY: number, force: number}>}
   */
  static touches = [];

  /** @type {EventTarget|null} @private */
  static _target = null;

  /** @type {boolean} @private */
  static _touchActive = false;

  /** @type {{time: number, x: number, y: number}|null} @private */
  static _touchStart = null;

  /** @type {{time: number, x: number, y: number}} @private */
  static _lastTap = { time: 0, x: 0, y: 0 };

  /** @type {number} @private */
  static _tapDistance = 12;

  /** @type {number} @private */
  static _tapTime = 350;

  /** @type {number} @private */
  static _doubleTapTime = 450;

  /** @type {string[]} @private */
  static _buttonNames = ["left", "middle", "right", "back", "forward"];

  /** @type {number|null} @private */
  static _touchMouseSuppressionTimer = null;

  /**
   * Called once when a mouse button is clicked twice quickly or when a
   * touchscreen is tapped twice quickly.
   *
   * Override this method to handle the event.
   *
   * @param {MouseEvent|TouchEvent} event - Original browser event.
   * @returns {void}
   */
  static doubleClicked(event) {}

  /**
   * Called once after a mouse button is pressed and released, or after a tap.
   *
   * Override this method to handle the event.
   *
   * @param {MouseEvent|TouchEvent} event - Original browser event.
   * @returns {void}
   */
  static mouseClicked(event) {}

  /**
   * Called while the pointer moves with a mouse button or touch held down.
   *
   * Override this method to handle the event.
   *
   * @param {MouseEvent|TouchEvent} event - Original browser event.
   * @returns {void}
   */
  static mouseDragged(event) {}

  /**
   * Called when the mouse moves without a pressed button.
   *
   * Override this method to handle the event.
   *
   * @param {MouseEvent} event - Original browser mousemove event.
   * @returns {void}
   */
  static mouseMoved(event) {}

  /**
   * Called once when a mouse button is pressed or a touch begins.
   *
   * Override this method to handle the event.
   *
   * @param {MouseEvent|TouchEvent} event - Original browser event.
   * @returns {void}
   */
  static mousePressed(event) {}

  /**
   * Called once when a mouse button is released, a touch ends, or a touch is canceled.
   *
   * Override this method to handle the event.
   *
   * @param {MouseEvent|TouchEvent} event - Original browser event.
   * @returns {void}
   */
  static mouseReleased(event) {}

  /**
   * Called once whenever the mouse wheel or compatible trackpad gesture moves.
   *
   * Override this method to handle the event.
   *
   * @param {WheelEvent} event - Original browser wheel event.
   * @returns {void}
   */
  static mouseWheel(event) {}

  /**
   * Converts viewport coordinates into coordinates relative to the attached target.
   *
   * @param {number} clientX - Horizontal viewport coordinate.
   * @param {number} clientY - Vertical viewport coordinate.
   * @returns {{x: number, y: number}} Target-relative coordinates.
   * @private
   */
  static _localPosition(clientX, clientY) {
    const element = Events._target || document.documentElement;
    const rect = element.getBoundingClientRect
      ? element.getBoundingClientRect()
      : { left: 0, top: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  /**
   * Updates current, previous, viewport-relative, and movement coordinates.
   *
   * @param {number} clientX - Horizontal viewport coordinate.
   * @param {number} clientY - Vertical viewport coordinate.
   * @param {number} [movementX] - Browser-reported horizontal movement.
   * @param {number} [movementY] - Browser-reported vertical movement.
   * @returns {void}
   * @private
   */
  static _updatePosition(clientX, clientY, movementX, movementY) {
    const local = Events._localPosition(clientX, clientY);
    Events.pmouseX = Events.mouseX;
    Events.pmouseY = Events.mouseY;
    Events.pwinMouseX = Events.winMouseX;
    Events.pwinMouseY = Events.winMouseY;
    Events.mouseX = local.x;
    Events.mouseY = local.y;
    Events.winMouseX = clientX;
    Events.winMouseY = clientY;
    Events.movedX = Number.isFinite(movementX)
      ? movementX
      : Events.mouseX - Events.pmouseX;
    Events.movedY = Number.isFinite(movementY)
      ? movementY
      : Events.mouseY - Events.pmouseY;
  }

  /**
   * Updates one mouse button and the aggregate pressed state.
   *
   * @param {number} button - Standard browser button index from 0 through 4.
   * @param {boolean} pressed - Whether the button is currently pressed.
   * @returns {void}
   * @private
   */
  static _setButton(button, pressed) {
    const index = Number.isInteger(button) && button >= 0 && button <= 4
      ? button
      : 0;
    Events.mouseButton[index] = pressed;
    Events.mouseButton[Events._buttonNames[index]] = pressed;
    Events.mouseIsPressed = Events._buttonNames.some(
      (name) => Events.mouseButton[name]
    );
  }

  /**
   * Resets all mouse-button state.
   *
   * @returns {void}
   * @private
   */
  static _clearButtons() {
    for (const key of Object.keys(Events.mouseButton)) {
      Events.mouseButton[key] = false;
    }
    Events.mouseIsPressed = false;
  }

  /**
   * Converts a native Touch object into the normalized touch format.
   *
   * @param {Touch} touch - Native browser touch point.
   * @returns {{id: number, x: number, y: number, winX: number,
   * winY: number, force: number}} Normalized touch point.
   * @private
   */
  static _normalizeTouch(touch) {
    const local = Events._localPosition(touch.clientX, touch.clientY);
    return {
      id: touch.identifier,
      x: local.x,
      y: local.y,
      winX: touch.clientX,
      winY: touch.clientY,
      force: Number.isFinite(touch.force) ? touch.force : 0
    };
  }

  /**
   * Rebuilds the live touches array from a touch event.
   *
   * @param {TouchEvent} event - Native touch event.
   * @returns {void}
   * @private
   */
  static _updateTouches(event) {
    Events.touches.length = 0;
    for (const touch of Array.from(event.touches || [])) {
      Events.touches.push(Events._normalizeTouch(touch));
    }
  }

  /**
   * Handles a desktop mouse-button press.
   *
   * @param {MouseEvent} event - Native mousedown event.
   * @returns {void}
   * @private
   */
  static _onMouseDown(event) {
    if (Events._touchActive) return;
    Events._updatePosition(
      event.clientX,
      event.clientY,
      event.movementX,
      event.movementY
    );
    Events._setButton(event.button, true);
    Events.mousePressed(event);
  }

  /**
   * Handles a desktop mouse-button release.
   *
   * @param {MouseEvent} event - Native mouseup event.
   * @returns {void}
   * @private
   */
  static _onMouseUp(event) {
    if (Events._touchActive) return;
    Events._updatePosition(
      event.clientX,
      event.clientY,
      event.movementX,
      event.movementY
    );
    Events._setButton(event.button, false);
    Events.mouseReleased(event);
  }

  /**
   * Dispatches the desktop click callback.
   *
   * @param {MouseEvent} event - Native click event.
   * @returns {void}
   * @private
   */
  static _onClick(event) {
    if (!Events._touchActive) Events.mouseClicked(event);
  }

  /**
   * Dispatches the desktop double-click callback.
   *
   * @param {MouseEvent} event - Native double-click event.
   * @returns {void}
   * @private
   */
  static _onDoubleClick(event) {
    if (!Events._touchActive) Events.doubleClicked(event);
  }

  /**
   * Handles desktop pointer movement and dispatches move or drag callbacks.
   *
   * @param {MouseEvent} event - Native mousemove event.
   * @returns {void}
   * @private
   */
  static _onMouseMove(event) {
    if (Events._touchActive) return;
    Events._updatePosition(
      event.clientX,
      event.clientY,
      event.movementX,
      event.movementY
    );
    if (Events.mouseIsPressed) Events.mouseDragged(event);
    else Events.mouseMoved(event);
  }

  /**
   * Dispatches the wheel callback.
   *
   * @param {WheelEvent} event - Native wheel event.
   * @returns {void}
   * @private
   */
  static _onWheel(event) {
    Events.mouseWheel(event);
  }

  /**
   * Maps the start of a touch gesture to mouse-style state and callbacks.
   *
   * @param {TouchEvent} event - Native touchstart event.
   * @returns {void}
   * @private
   */
  static _onTouchStart(event) {
    Events._touchActive = true;
    if (Events._touchMouseSuppressionTimer !== null) {
      clearTimeout(Events._touchMouseSuppressionTimer);
      Events._touchMouseSuppressionTimer = null;
    }
    Events._updateTouches(event);
    const first = event.changedTouches && event.changedTouches[0];
    if (!first) return;
    Events._updatePosition(first.clientX, first.clientY);
    Events._setButton(0, true);
    Events._touchStart = {
      time: Date.now(),
      x: first.clientX,
      y: first.clientY
    };
    Events.mousePressed(event);
  }

  /**
   * Maps touch movement to the mouseDragged callback.
   *
   * @param {TouchEvent} event - Native touchmove event.
   * @returns {void}
   * @private
   */
  static _onTouchMove(event) {
    Events._updateTouches(event);
    const first = event.changedTouches && event.changedTouches[0];
    if (!first) return;
    Events._updatePosition(first.clientX, first.clientY);
    Events.mouseDragged(event);
  }

  /**
   * Handles the end of a touch and detects taps and double taps.
   *
   * @param {TouchEvent} event - Native touchend event.
   * @returns {void}
   * @private
   */
  static _onTouchEnd(event) {
    const first = event.changedTouches && event.changedTouches[0];
    if (first) Events._updatePosition(first.clientX, first.clientY);
    Events._updateTouches(event);
    Events._setButton(0, false);
    Events.mouseReleased(event);

    if (first && Events._touchStart) {
      const now = Date.now();
      const distance = Math.hypot(
        first.clientX - Events._touchStart.x,
        first.clientY - Events._touchStart.y
      );

      if (
        now - Events._touchStart.time <= Events._tapTime &&
        distance <= Events._tapDistance
      ) {
        Events.mouseClicked(event);
        const doubleDistance = Math.hypot(
          first.clientX - Events._lastTap.x,
          first.clientY - Events._lastTap.y
        );

        if (
          now - Events._lastTap.time <= Events._doubleTapTime &&
          doubleDistance <= Events._tapDistance * 2
        ) {
          Events.doubleClicked(event);
          Events._lastTap.time = 0;
        } else {
          Events._lastTap = {
            time: now,
            x: first.clientX,
            y: first.clientY
          };
        }
      }
    }

    Events._touchStart = null;
    if (!event.touches || event.touches.length === 0) {
      Events._scheduleMouseCompatibilityReset();
    }
  }

  /**
   * Clears input state when the browser cancels a touch sequence.
   *
   * @param {TouchEvent} event - Native touchcancel event.
   * @returns {void}
   * @private
   */
  static _onTouchCancel(event) {
    Events._updateTouches(event);
    Events._clearButtons();
    Events._touchStart = null;
    Events.mouseReleased(event);
    Events._scheduleMouseCompatibilityReset();
  }

  /**
   * Delays re-enabling mouse handling so compatibility mouse events generated
   * after a touch do not trigger duplicate callbacks.
   *
   * @returns {void}
   * @private
   */
  static _scheduleMouseCompatibilityReset() {
    if (Events._touchMouseSuppressionTimer !== null) {
      clearTimeout(Events._touchMouseSuppressionTimer);
    }
    Events._touchMouseSuppressionTimer = setTimeout(() => {
      Events._touchActive = false;
      Events._touchMouseSuppressionTimer = null;
    }, 700);
  }

  /**
   * Requests pointer lock for an element.
   *
   * Pointer lock generally must be requested in response to a user gesture.
   *
   * @param {Element} [element] - Element to lock. Defaults to the attached target.
   * @returns {Promise<void>} Resolves when the request is issued or completed.
   * @throws {Error} Rejects when Pointer Lock is unsupported or the request fails.
   */
  static requestPointerLock(element) {
    const target = element || Events._target || document.documentElement;
    const request =
      target.requestPointerLock ||
      target.mozRequestPointerLock ||
      target.webkitRequestPointerLock;

    if (!request) {
      return Promise.reject(new Error("Pointer Lock API is not supported."));
    }

    try {
      const result = request.call(target);
      return result && typeof result.then === "function"
        ? result
        : Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /**
   * Exits the document's active pointer lock.
   *
   * @returns {Promise<void>} Resolves when the exit request is issued or completed.
   * @throws {Error} Rejects if the browser throws while exiting pointer lock.
   */
  static exitPointerLock() {
    const exit =
      document.exitPointerLock ||
      document.mozExitPointerLock ||
      document.webkitExitPointerLock;

    if (!exit) return Promise.resolve();

    try {
      const result = exit.call(document);
      return result && typeof result.then === "function"
        ? result
        : Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /**
   * Attaches desktop and mobile input listeners to an element.
   *
   * Calling this method first detaches existing listeners. Events.mouseX and
   * Events.mouseY are measured relative to the attached element.
   *
   * @param {EventTarget} [element=document] - Canvas, element, or document to observe.
   * @returns {typeof Events} The Events class for chaining.
   */
  static attach(element = document) {
    Events.detach();
    Events._target = element;

    element.addEventListener("mousedown", Events._onMouseDown);
    window.addEventListener("mouseup", Events._onMouseUp);
    element.addEventListener("click", Events._onClick);
    element.addEventListener("dblclick", Events._onDoubleClick);
    element.addEventListener("mousemove", Events._onMouseMove);
    element.addEventListener("wheel", Events._onWheel, { passive: true });
    element.addEventListener("touchstart", Events._onTouchStart, { passive: true });
    element.addEventListener("touchmove", Events._onTouchMove, { passive: true });
    element.addEventListener("touchend", Events._onTouchEnd, { passive: true });
    element.addEventListener("touchcancel", Events._onTouchCancel, { passive: true });
    window.addEventListener("blur", Events._clearButtons);

    return Events;
  }

  /**
   * Removes all installed input listeners and clears active input state.
   *
   * @returns {typeof Events} The Events class for chaining.
   */
  static detach() {
    const element = Events._target;
    if (!element || typeof window === "undefined") return Events;

    element.removeEventListener("mousedown", Events._onMouseDown);
    window.removeEventListener("mouseup", Events._onMouseUp);
    element.removeEventListener("click", Events._onClick);
    element.removeEventListener("dblclick", Events._onDoubleClick);
    element.removeEventListener("mousemove", Events._onMouseMove);
    element.removeEventListener("wheel", Events._onWheel);
    element.removeEventListener("touchstart", Events._onTouchStart);
    element.removeEventListener("touchmove", Events._onTouchMove);
    element.removeEventListener("touchend", Events._onTouchEnd);
    element.removeEventListener("touchcancel", Events._onTouchCancel);
    window.removeEventListener("blur", Events._clearButtons);

    if (Events._touchMouseSuppressionTimer !== null) {
      clearTimeout(Events._touchMouseSuppressionTimer);
      Events._touchMouseSuppressionTimer = null;
    }

    Events._target = null;
    Events._touchActive = false;
    Events._touchStart = null;
    Events._clearButtons();
    Events.touches.length = 0;
    return Events;
  }
}

if (typeof globalThis !== "undefined") {
  globalThis.Events = Events;
}

if (typeof module === "object" && module.exports) {
  module.exports = Events;
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  Events.attach(document);
}
