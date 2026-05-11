/**
 * events.js
 * Input, window, controller, and sensor utilities.
 *
 * Keyboard can now attach to any EventTarget, not just window:
 *   Keyboard.attach(canvas);
 *   Keyboard.attach(document.querySelector('#game'));
 *
 * Note: normal HTML elements must be focusable to receive keyboard events:
 *   element.tabIndex = 0;
 *   element.focus();
 */

/**
 * Keyboard input utility.
 */
export const Keyboard = class {
  /** @type {string|null} The value of the last key typed. */
  static key = null;

  /** @type {string|null} Physical key code of the last key event. Example: "KeyW", "ArrowUp", "Space" */
  static code = null;

  /** @type {number|null} keyCode of the last key event. */
  static keyCode = null;

  /** @type {boolean} True if any key is currently pressed. */
  static keyIsPressed = false;

  /** @type {Set<string>} Set of currently pressed physical keys. */
  static #pressedKeys = new Set();

  /** @type {EventTarget|null} Current keyboard event target. */
  static #target = null;

  /** @type {{keydown: Function, keyup: Function, blur: Function}|null} Stored listeners for clean detach. */
  static #listeners = null;

  /** Called once when any key is pressed. Override this to handle the event. */
  static keyPressed = (event) => {};

  /** Called once when any key is released. Override this to handle the event. */
  static keyReleased = (event) => {};

  /** Called once when a printable character key is typed. */
  static keyTyped = (event) => {};

  /**
   * Returns true if the specified physical key is currently held down.
   * Examples: "ArrowUp", "KeyW", "Space", "Enter"
   * @param {string} code Physical keyboard key code.
   * @returns {boolean}
   */
  static keyIsDown(code) {
    return this.#pressedKeys.has(code);
  }

  /**
   * Returns the current target keyboard events are attached to.
   * @returns {EventTarget|null}
   */
  static get target() {
    return this.#target;
  }

  /** @private */
  static #handleKeyDown(e) {
    this.key = e.key;
    this.code = e.code;
    this.keyCode = e.keyCode;
    this.keyIsPressed = true;

    this.#pressedKeys.add(e.code);
    this.keyPressed(e);

    // Printable character keys only. This skips Shift, Ctrl, Alt, ArrowUp, etc.
    if (e.key && e.key.length === 1) {
      this.keyTyped(e);
    }
  }

  /** @private */
  static #handleKeyUp(e) {
    this.key = e.key;
    this.code = e.code;
    this.keyCode = e.keyCode;

    this.#pressedKeys.delete(e.code);
    this.keyIsPressed = this.#pressedKeys.size > 0;

    this.keyReleased(e);
  }

  /** @private */
  static #handleBlur() {
    this.#pressedKeys.clear();
    this.keyIsPressed = false;
  }

  /**
   * Attach keyboard listeners to any EventTarget.
   *
   * Valid targets include:
   * - window
   * - document
   * - canvas
   * - div/game container
   * - any object with addEventListener/removeEventListener
   *
   * For normal HTML elements, make sure the element can receive focus:
   *   element.tabIndex = 0;
   *   element.focus();
   *
   * @param {EventTarget} target Event target to listen on.
   * @returns {boolean} True if attached successfully.
   */
  static attach(target = globalThis.window) {
    if (!target || typeof target.addEventListener !== "function") {
      return false;
    }

    // Prevent duplicate listeners and move cleanly from old target to new target.
    this.detach();

    this.#target = target;
    this.#listeners = {
      keydown: (e) => this.#handleKeyDown(e),
      keyup: (e) => this.#handleKeyUp(e),
      blur: () => this.#handleBlur(),
    };

    target.addEventListener("keydown", this.#listeners.keydown);
    target.addEventListener("keyup", this.#listeners.keyup);
    target.addEventListener("blur", this.#listeners.blur);

    return true;
  }

  /**
   * Remove keyboard listeners from the current target.
   * @returns {boolean} True if detached successfully.
   */
  static detach() {
    if (!this.#target || !this.#listeners) {
      return false;
    }

    this.#target.removeEventListener("keydown", this.#listeners.keydown);
    this.#target.removeEventListener("keyup", this.#listeners.keyup);
    this.#target.removeEventListener("blur", this.#listeners.blur);

    this.#target = null;
    this.#listeners = null;
    this.#handleBlur();

    return true;
  }

  /** Automatically attach to window by default, preserving the old behavior. */
  static {
    if (typeof window !== "undefined") {
      this.attach(window);
    }
  }
};

/**
 * Pointer / mouse / touch input utility.
 */
export const pointer = class {
  /** Current mouse X/Y relative to the target element. */
  static mouseX = 0;
  static mouseY = 0;

  /** Previous mouse X/Y relative to the target element. */
  static pmouseX = 0;
  static pmouseY = 0;

  /** Current mouse X/Y in the browser window. */
  static winMouseX = 0;
  static winMouseY = 0;

  /** Previous mouse X/Y in the browser window. */
  static pwinMouseX = 0;
  static pwinMouseY = 0;

  /** Mouse movement since the last event. */
  static movedX = 0;
  static movedY = 0;

  /** True if any mouse button is currently pressed. */
  static mouseIsPressed = false;

  /** Pen state. */
  static penIsPressed = false;
  static penPressure = 0;
  static usingPen = false;

  /** Tracks which mouse buttons are currently pressed. */
  static mouseButton = {
    left: false,
    middle: false,
    right: false,
  };

  /** Current active touches. */
  static touches = [];

  static get x() {
    return this.mouseX;
  }

  static get y() {
    return this.mouseY;
  }

  static get isPressed() {
    return this.mouseIsPressed;
  }

  static mouseClicked = (event) => {};
  static doubleClicked = (event) => {};
  static mouseDragged = (event) => {};
  static mouseMoved = (event) => {};
  static mousePressed = (event) => {};
  static mouseReleased = (event) => {};
  static mouseWheel = (event) => {};
  static mouseLeave = (event)=>{};
  static pen = (event) => {};

  /** @type {EventTarget|null} */
  static #target = null;

  /** @type {object|null} */
  static #listeners = null;

  


  /**
   * Requests pointer lock on an element.
   * Must usually be called from a user gesture such as click or mousedown.
   */
  static requestPointerLock(element = document.body) {
    if (!element || typeof element.requestPointerLock !== "function") return;
    element.requestPointerLock();
  }

  /** Exits the current pointer lock, if active. */
  static exitPointerLock() {
    if (typeof document !== "undefined" && typeof document.exitPointerLock === "function") {
      document.exitPointerLock();
    }
  }

  /** Returns the target element used for local mouse coordinates. */
  static #getTargetElement() {
    if (this.#target && this.#target !== window && this.#target.getBoundingClientRect) {
      return this.#target;
    }

    if (typeof window === "undefined" || typeof document === "undefined") {
      return null;
    }

    if (window.Canvex?.canvas) return window.Canvex.canvas;

    return document.querySelector("canvas");
  }

  /** Updates previous/current mouse position values from a pointer/mouse event. */
  static #updateMousePosition(e) {
    this.pmouseX = this.mouseX;
    this.pmouseY = this.mouseY;
    this.pwinMouseX = this.winMouseX;
    this.pwinMouseY = this.winMouseY;

    this.winMouseX = e.clientX ?? 0;
    this.winMouseY = e.clientY ?? 0;

    const target = this.#getTargetElement();
    const rect = target ? target.getBoundingClientRect() : { left: 0, top: 0 };

    this.mouseX = this.winMouseX - rect.left;
    this.mouseY = this.winMouseY - rect.top;

    this.movedX = e.movementX ?? this.mouseX - this.pmouseX;
    this.movedY = e.movementY ?? this.mouseY - this.pmouseY;
  }

  /** Updates the current touch list from a touch event. */
  static #updateTouches(e) {
    const target = this.#getTargetElement();
    const rect = target ? target.getBoundingClientRect() : { left: 0, top: 0 };

    this.touches = Array.from(e.touches ?? []).map((touch) => ({
      id: touch.identifier,
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
      winX: touch.clientX,
      winY: touch.clientY,
    }));
  }

  /** Updates a button state from a native mouse button value. */
  static #setButton(button, pressed) {
    if (button === 0) this.mouseButton.left = pressed;
    if (button === 1) this.mouseButton.middle = pressed;
    if (button === 2) this.mouseButton.right = pressed;
  }

  /** Clears all button/touch pressed states. */
  static #resetPressState() {
    this.mouseIsPressed = false;
    this.penIsPressed = false;
    this.penPressure = 0;
    this.mouseButton.left = false;
    this.mouseButton.middle = false;
    this.mouseButton.right = false;
    this.touches = [];
  }

  static #handlePointerDown(e) {
    this.#updateMousePosition(e);
    this.mouseIsPressed = true;
    this.#setButton(e.button, true);

    if (e.pointerType === "pen") {
      this.usingPen = true;
      this.penIsPressed = true;
      this.penPressure = e.pressure ?? 0;
      this.pen(e);
    }

    this.mousePressed(e);
  }

  static #handlePointerMove(e) {
    this.#updateMousePosition(e);

    if (e.pointerType === "pen") {
      this.usingPen = true;
      this.penPressure = e.pressure ?? 0;
      this.pen(e);
    }

    if (this.mouseIsPressed) {
      this.mouseDragged(e);
    } else {
      this.mouseMoved(e);
    }
  }

  static #handlePointerUp(e) {
    this.#updateMousePosition(e);
    this.#setButton(e.button, false);
    this.mouseIsPressed = this.mouseButton.left || this.mouseButton.middle || this.mouseButton.right;

    if (e.pointerType === "pen") {
      this.penIsPressed = false;
      this.penPressure = 0;
      this.pen(e);
    }

    this.mouseReleased(e);
  }

  static #handleClick(e) {
    this.#updateMousePosition(e);
    this.mouseClicked(e);
  }

  static #handleDblClick(e) {
    this.#updateMousePosition(e);
    this.doubleClicked(e);
  }

  static #handleWheel(e) {
    this.#updateMousePosition(e);
    this.mouseWheel(e);
  }

  static #handleTouchStart(e) {
    this.#updateTouches(e);
    this.mouseIsPressed = true;
  }

  static #handleTouchMove(e) {
    this.#updateTouches(e);
  }

  static #handleTouchEnd(e) {
    this.#updateTouches(e);
    this.mouseIsPressed = this.touches.length > 0;
  }

  static #handleLeave(e) {
    // Update last known positions if you want (optional)
    this.#updateMousePosition(e);

    // Common behavior when leaving the element:
    // - clear pressed buttons
    // - clear touches
    // - mouseIsPressed false
    this.#resetPressState?.();        // if you have it implemented
    this.mouseIsPressed = false;
    this.penIsPressed = false;
    this.usingPen = false;
    this.penPressure = 0;
    this.touches = [];

    // Notify user code
    this.mouseLeave(e);
  }

  /**
   * Attach pointer listeners to any element/EventTarget.
   * @param {EventTarget} target
   * @returns {boolean}
   */
  static attach(target = globalThis.window) {
  if (!target || typeof target.addEventListener !== "function") return false;

  // If already attached elsewhere, detach first
  if (this.#target && this.#target !== target) this.detach();

  this.#target = target;

  // Build listener fns once so detach() can remove them
  this.#listeners = {
    down: (e) => this.#handlePointerDown(e),
    move: (e) => this.#handlePointerMove(e),
    up: (e) => this.#handlePointerUp(e),
    click: (e) => this.#handleClick(e),
    dblclick: (e) => this.#handleDblClick(e),
    wheel: (e) => this.#handleWheel(e),
    touchstart: (e) => this.#handleTouchStart(e),
    touchmove: (e) => this.#handleTouchMove(e),
    touchend: (e) => this.#handleTouchEnd(e),
    leave: (e) => this.#handleLeave(e),
  };

  // Pointer events (recommended)
  target.addEventListener("pointerdown", this.#listeners.down);
  target.addEventListener("pointermove", this.#listeners.move);
  target.addEventListener("pointerup", this.#listeners.up);
  target.addEventListener("pointercancel", this.#listeners.up);
  target.addEventListener("pointerleave", this.#listeners.leave); // ✅

  // Optional: classic mouseleave fallback (esp. if target isn't pointer-event friendly)
  target.addEventListener("mouseleave", this.#listeners.leave); // ✅

  // Optional extras
  target.addEventListener("click", this.#listeners.click);
  target.addEventListener("dblclick", this.#listeners.dblclick);
  target.addEventListener("wheel", this.#listeners.wheel, { passive: true });

  // Touch (only if you still want explicit touch events)
  target.addEventListener("touchstart", this.#listeners.touchstart, { passive: false });
  target.addEventListener("touchmove", this.#listeners.touchmove, { passive: false });
  target.addEventListener("touchend", this.#listeners.touchend);
  target.addEventListener("touchcancel", this.#listeners.touchend);

  return true;
}

  /** Detach pointer listeners from the current target. */
  static detach() {
    if (!this.#target || !this.#listeners) return false;

    const t = this.#target;
    const L = this.#listeners;

    t.removeEventListener("pointerdown", L.down);
    t.removeEventListener("pointermove", L.move);
    t.removeEventListener("pointerup", L.up);
    t.removeEventListener("pointercancel", L.up);
    t.removeEventListener("pointerleave", L.leave);

    t.removeEventListener("mouseleave", L.leave);

    t.removeEventListener("click", L.click);
    t.removeEventListener("dblclick", L.dblclick);
    t.removeEventListener("wheel", L.wheel);

    t.removeEventListener("touchstart", L.touchstart);
    t.removeEventListener("touchmove", L.touchmove);
    t.removeEventListener("touchend", L.touchend);
    t.removeEventListener("touchcancel", L.touchend);

    this.#target = null;
    this.#listeners = null;
    return true;
  }

  /** Automatically attach to window by default. */
  static {
    if (typeof window !== "undefined") {
      this.attach(window);
    }
  }
};

/**
 * Window / document lifecycle and resize utility.
 */
export const Window = class {
  static #width = typeof window !== "undefined" ? window.innerWidth : 0;
  static #height = typeof window !== "undefined" ? window.innerHeight : 0;
  static #pwidth = this.#width;
  static #pheight = this.#height;

  static focused = typeof document !== "undefined" ? document.hasFocus() : false;
  static visible = typeof document !== "undefined" ? !document.hidden : true;
  static fullscreen = typeof document !== "undefined" ? !!document.fullscreenElement : false;

  static resized = (event) => {};
  static focusedEvent = (event) => {};
  static blurredEvent = (event) => {};
  static visibilityChanged = (event) => {};
  static fullscreenChanged = (event) => {};
  static contextMenu = (event) => {};

  static get prevWidth() {
    return this.#pwidth;
  }

  static get prevHeight() {
    return this.#pheight;
  }

  static get Width() {
    return this.#width;
  }

  static get Height() {
    return this.#height;
  }

  static get width() {
    return this.#width;
  }

  static get height() {
    return this.#height;
  }

  static #handleResize(e) {
    this.#pwidth = this.#width;
    this.#pheight = this.#height;
    this.#width = window.innerWidth;
    this.#height = window.innerHeight;
    this.resized(e);
  }

  static #handleFocus(e) {
    this.focused = true;
    this.focusedEvent(e);
  }

  static #handleBlur(e) {
    this.focused = false;
    this.blurredEvent(e);
  }

  static #handleVisibility(e) {
    this.visible = !document.hidden;
    this.visibilityChanged(e);
  }

  static #handleFullscreen(e) {
    this.fullscreen = !!document.fullscreenElement;
    this.fullscreenChanged(e);
  }
  static #handleContextMenu(e) {
  // If you want to disable the default browser menu globally, do it here:
  }

  static {
    if (typeof window !== "undefined" && typeof document !== "undefined") {
      window.addEventListener("resize", (e) => this.#handleResize(e));
      window.addEventListener("focus", (e) => this.#handleFocus(e));
      window.addEventListener("blur", (e)=>this.#handleVisibility(e));    
      window.addEventListener("blur", (e) => this.#handleBlur(e));
      document.addEventListener("fullscreenchange", (e) => this.#handleFullscreen(e));
      document.addEventListener("contextmenu", (e) => this.#handleContextMenu(e));
    }
  }

};

/**
 * Game controller / gamepad utility.
 */
export const controller = class {
  static gamepads = [];
  static connected = false;

  static connectedEvent = (gamepad) => {};
  static disconnectedEvent = (gamepad) => {};

  /** Returns a gamepad by index. */
  static get(index = 0) {
    return this.gamepads[index] ?? null;
  }

  /** Returns true if a button is pressed. */
  static button(buttonIndex, gamepadIndex = 0) {
    const gp = this.get(gamepadIndex);
    return gp ? !!gp.buttons[buttonIndex]?.pressed : false;
  }

  /** Returns an axis value from -1 to 1. */
  static axis(axisIndex, gamepadIndex = 0) {
    const gp = this.get(gamepadIndex);
    return gp ? gp.axes[axisIndex] ?? 0 : 0;
  }

  /** Internal update loop. */
  static #update() {
    if (typeof navigator === "undefined") return;

    const pads = navigator.getGamepads?.() ?? [];
    this.gamepads = Array.from(pads).filter(Boolean);
    this.connected = this.gamepads.length > 0;

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => this.#update());
    }
  }

  static {
    if (typeof window !== "undefined") {
      window.addEventListener("gamepadconnected", (e) => {
        this.connected = true;
        this.connectedEvent(e.gamepad);
      });

      window.addEventListener("gamepaddisconnected", (e) => {
        this.disconnectedEvent(e.gamepad);
      });

      this.#update();
    }
  }
};

/**
 * Device sensors utility: accelerometer, gyroscope, orientation.
 */
export const sensor = class {
  static accelerationX = 0;
  static accelerationY = 0;
  static accelerationZ = 0;

  static rotationRateAlpha = 0;
  static rotationRateBeta = 0;
  static rotationRateGamma = 0;

  static orientationAlpha = null;
  static orientationBeta = null;
  static orientationGamma = null;

  static available = false;

  static motionChanged = (event) => {};
  static orientationChanged = (event) => {};

  /**
   * Requests permission for motion/orientation sensors on iOS 13+.
   * Call from a user gesture, such as a button click.
   * @returns {Promise<boolean>}
   */
  static async requestPermission() {
    if (
      typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function"
    ) {
      try {
        const state = await DeviceMotionEvent.requestPermission();
        this.available = state === "granted";
      } catch {
        this.available = false;
      }
    } else {
      // Non-iOS: permission usually not required.
      this.available = true;
    }

    return this.available;
  }

  static #handleMotion(e) {
    const accel = e.accelerationIncludingGravity ?? e.acceleration ?? {};
    this.accelerationX = accel.x ?? 0;
    this.accelerationY = accel.y ?? 0;
    this.accelerationZ = accel.z ?? 0;

    const rotation = e.rotationRate ?? {};
    this.rotationRateAlpha = rotation.alpha ?? 0;
    this.rotationRateBeta = rotation.beta ?? 0;
    this.rotationRateGamma = rotation.gamma ?? 0;

    this.motionChanged(e);
  }

  static #handleOrientation(e) {
    this.orientationAlpha = e.alpha;
    this.orientationBeta = e.beta;
    this.orientationGamma = e.gamma;

    this.orientationChanged(e);
  }

  static {
    if (typeof window !== "undefined") {
      window.addEventListener("devicemotion", (e) => this.#handleMotion(e));
      window.addEventListener("deviceorientation", (e) => this.#handleOrientation(e));
    }
  }
};
