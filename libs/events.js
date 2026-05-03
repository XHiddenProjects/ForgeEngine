import { Canvex } from "./canvex.js";

/**
 * Keyboard input utility.
 */
export const Keyboard = class {
  /**
   * The value of the last key typed.
   * @type {string|null}
   */
  static key = null;

  /**
   * The physical key code of the last key event.
   * Example: "KeyW", "ArrowUp", "Space"
   * @type {string|null}
   */
  static code = null;

  /**
   * The keyCode of the last key pressed.
   * @type {number|null}
   */
  static keyCode = null;

  /**
   * True if any key is currently pressed.
   * @type {boolean}
   */
  static keyIsPressed = false;

  /**
   * Set of currently pressed physical keys.
   * @type {Set<string>}
   * @private
   */
  static #pressedKeys = new Set();

  /**
   * Called once when any key is pressed.
   * Override this to handle the event.
   *
   * @param {KeyboardEvent} event
   * @returns {void}
   */
  static keyPressed = (event) => {};

  /**
   * Called once when any key is released.
   * Override this to handle the event.
   *
   * @param {KeyboardEvent} event
   * @returns {void}
   */
  static keyReleased = (event) => {};

  /**
   * Called once when a printable character key is typed.
   * Does not fire for modifier keys like Shift, Ctrl, Alt, etc.
   *
   * @param {KeyboardEvent} event
   * @returns {void}
   */
  static keyTyped = (event) => {};

  /**
   * Returns true if the specified physical key is currently held down.
   *
   * Examples:
   * - "ArrowUp"
   * - "KeyW"
   * - "Space"
   * - "Enter"
   *
   * @param {string} code - A physical keyboard key code.
   * @returns {boolean}
   */
  static keyIsDown(code) {
    return this.#pressedKeys.has(code);
  }

  /**
   * Internal keydown handler.
   *
   * @param {KeyboardEvent} e
   * @returns {void}
   * @private
   */
  static #handleKeyDown(e) {
    this.key = e.key;
    this.code = e.code;
    this.keyCode = e.keyCode;
    this.keyIsPressed = true;

    const alreadyPressed = this.#pressedKeys.has(e.code);
    this.#pressedKeys.add(e.code);

    // Fire only once per actual press, not continuously while held
    if (!alreadyPressed) {
      this.keyPressed(e);
    }

    // Fire only for printable characters
    if (e.key.length === 1) {
      this.keyTyped(e);
    }
  }

  /**
   * Internal keyup handler.
   *
   * @param {KeyboardEvent} e
   * @returns {void}
   * @private
   */
  static #handleKeyUp(e) {
    this.key = e.key;
    this.code = e.code;
    this.keyCode = e.keyCode;

    this.#pressedKeys.delete(e.code);
    this.keyIsPressed = this.#pressedKeys.size > 0;

    this.keyReleased(e);
  }

  /**
   * Internal blur handler to prevent "stuck keys"
   * when the window loses focus.
   *
   * @returns {void}
   * @private
   */
  static #handleBlur() {
    this.#pressedKeys.clear();
    this.keyIsPressed = false;
  }

  /**
   * Automatically attach keyboard listeners when the class is evaluated.
   */
  static {
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", (e) => this.#handleKeyDown(e));
      window.addEventListener("keyup", (e) => this.#handleKeyUp(e));
      window.addEventListener("blur", () => this.#handleBlur());
    }
  }
}

/**
 * Pointer / mouse / touch input utility.
 */
export const pointer = class {
  /**
   * Current mouse X position relative to the target element.
   * If a canvas exists, this will be relative to the canvas.
   * Otherwise, it falls back to window coordinates.
   *
   * @type {number}
   */
  static mouseX = 0;

  /**
   * Current mouse Y position relative to the target element.
   * If a canvas exists, this will be relative to the canvas.
   * Otherwise, it falls back to window coordinates.
   *
   * @type {number}
   */
  static mouseY = 0;

  /**
   * Previous mouse X position relative to the target element.
   *
   * @type {number}
   */
  static pmouseX = 0;

  /**
   * Previous mouse Y position relative to the target element.
   *
   * @type {number}
   */
  static pmouseY = 0;

  /**
   * Current mouse X position in the browser window.
   *
   * @type {number}
   */
  static winMouseX = 0;

  /**
   * Current mouse Y position in the browser window.
   *
   * @type {number}
   */
  static winMouseY = 0;

  /**
   * Previous mouse X position in the browser window.
   *
   * @type {number}
   */
  static pwinMouseX = 0;

  /**
   * Previous mouse Y position in the browser window.
   *
   * @type {number}
   */
  static pwinMouseY = 0;

  /**
   * Horizontal mouse movement since the last event.
   *
   * @type {number}
   */
  static movedX = 0;

  /**
   * Vertical mouse movement since the last event.
   *
   * @type {number}
   */
  static movedY = 0;

  /**
   * True if any mouse button is currently pressed.
   *
   * @type {boolean}
   */
  static mouseIsPressed = false;

  
  /** True if pen is currently pressed */
  static penIsPressed = false;

  /** Last pen pressure (0–1) */
  static penPressure = 0;

  /** True if current pointer is a pen */
  static usingPen = false;


  /**
   * Tracks which mouse buttons are currently pressed.
   *
   * - `left`
   * - `middle`
   * - `right`
   *
   * @type {{ left: boolean, middle: boolean, right: boolean }}
   */
  static mouseButton = {
    left: false,
    middle: false,
    right: false,
  };

  /**
   * Array of current active touches.
   *
   * Each touch contains:
   * - `id`
   * - `x`
   * - `y`
   * - `winX`
   * - `winY`
   *
   * @type {Array<{id:number,x:number,y:number,winX:number,winY:number}>}
   */
  static touches = [];

  static get x(){
    return this.mouseX;
  }

  static get y(){
    return this.mouseY;
  }

  /**
   * Called once when a mouse button is clicked.
   *
   * @param {MouseEvent} event
   * @returns {void}
   */
  static mouseClicked = (event) => {};

  /**
   * Called once when a mouse button is double-clicked.
   *
   * @param {MouseEvent} event
   * @returns {void}
   */
  static doubleClicked = (event) => {};

  /**
   * Called when the mouse moves while a button is pressed.
   *
   * @param {MouseEvent} event
   * @returns {void}
   */
  static mouseDragged = (event) => {};

  /**
   * Called when the mouse moves with no button pressed.
   *
   * @param {MouseEvent} event
   * @returns {void}
   */
  static mouseMoved = (event) => {};

  /**
   * Called once when a mouse button is pressed.
   *
   * @param {MouseEvent} event
   * @returns {void}
   */
  static mousePressed = (event) => {};

  /**
   * Called once when a mouse button is released.
   *
   * @param {MouseEvent} event
   * @returns {void}
   */
  static mouseReleased = (event) => {};

  /**
   * Called once when the mouse wheel moves.
   *
   * @param {WheelEvent} event
   * @returns {void}
   */
  static mouseWheel = (event) => {};

  
  /**
   * Called when pen input is detected.
   * Override this to handle stylus input.
   * @param {PointerEvent} event
   */
  static pen = (event) => {};


  /**
   * Requests pointer lock on an element.
   *
   * Note:
   * This must usually be called from a user gesture
   * such as a click or mousedown.
   *
   * @param {HTMLElement} [element=document.body]
   * @returns {void}
   */
  static requestPointerLock(element = document.body) {
    if (!element || typeof element.requestPointerLock !== "function") return;
    element.requestPointerLock();
  }

  /**
   * Exits the current pointer lock, if active.
   *
   * @returns {void}
   */
  static exitPointerLock() {
    if (typeof document !== "undefined" && typeof document.exitPointerLock === "function") {
      document.exitPointerLock();
    }
  }

  /**
   * Returns the target element used for local mouse coordinates.
   *
   * Priority:
   * 1. `window.Canvex.canvas` if available
   * 2. First `<canvas>` element in the document
   * 3. `null` (falls back to window coordinates)
   *
   * @returns {HTMLCanvasElement|null}
   * @private
   */
  static #getTargetElement() {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return null;
    }

    if (window.Canvex && window.Canvex.canvas instanceof HTMLCanvasElement) {
      return window.Canvex.canvas;
    }

    return document.querySelector("canvas");
  }

  /**
   * Updates previous/current mouse position values from a mouse event.
   *
   * @param {MouseEvent} e
   * @returns {void}
   * @private
   */
  static #updateMousePosition(e) {
    this.pmouseX = this.mouseX;
    this.pmouseY = this.mouseY;
    this.pwinMouseX = this.winMouseX;
    this.pwinMouseY = this.winMouseY;

    this.winMouseX = e.clientX;
    this.winMouseY = e.clientY;

    const target = this.#getTargetElement();

    if (target) {
      const rect = target.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    } else {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    }

    this.movedX =
      typeof e.movementX === "number"
        ? e.movementX
        : this.winMouseX - this.pwinMouseX;

    this.movedY =
      typeof e.movementY === "number"
        ? e.movementY
        : this.winMouseY - this.pwinMouseY;
  }

  /**
   * Updates the current touch list from a touch event.
   *
   * @param {TouchEvent} e
   * @returns {void}
   * @private
   */
  static #updateTouches(e) {
    const target = this.#getTargetElement();
    const rect = target
      ? target.getBoundingClientRect()
      : { left: 0, top: 0 };

    this.touches = Array.from(e.touches, (touch) => ({
      id: touch.identifier,
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
      winX: touch.clientX,
      winY: touch.clientY,
    }));

    // Mirror the first touch into mouse-style coordinates if present.
    if (this.touches.length > 0) {
      const first = this.touches[0];

      this.pmouseX = this.mouseX;
      this.pmouseY = this.mouseY;
      this.pwinMouseX = this.winMouseX;
      this.pwinMouseY = this.winMouseY;

      this.mouseX = first.x;
      this.mouseY = first.y;
      this.winMouseX = first.winX;
      this.winMouseY = first.winY;

      this.movedX = this.mouseX - this.pmouseX;
      this.movedY = this.mouseY - this.pmouseY;
    }
  }

  /**
   * Updates a button state from a native mouse button value.
   *
   * 0 = left
   * 1 = middle
   * 2 = right
   *
   * @param {number} button
   * @param {boolean} pressed
   * @returns {void}
   * @private
   */
  static #setButton(button, pressed) {
    if (button === 0) this.mouseButton.left = pressed;
    if (button === 1) this.mouseButton.middle = pressed;
    if (button === 2) this.mouseButton.right = pressed;

    this.mouseIsPressed =
      this.mouseButton.left ||
      this.mouseButton.middle ||
      this.mouseButton.right;
  }

  /**
   * Clears all button/touch pressed states.
   *
   * @returns {void}
   * @private
   */
  static #resetPressState() {
    this.mouseButton.left = false;
    this.mouseButton.middle = false;
    this.mouseButton.right = false;
    this.mouseIsPressed = false;
    this.touches = [];
  }
  /**
   * Returns true if any mouse button is currently pressed.
   * @returns {boolean}
   */
  static get isPressed(){
    return this.mouseIsPressed;
  }


  static #handlePointerDown(e) {
  if (e.pointerType === "pen") {
    this.usingPen = true;
    this.penIsPressed = true;
    this.penPressure = e.pressure || 0;
    this.pen(e);
  }
}

static #handlePointerMove(e) {
  if (e.pointerType === "pen") {
    this.usingPen = true;
    this.penPressure = e.pressure || 0;
    this.pen(e);
  }
}

static #handlePointerUp(e) {
  if (e.pointerType === "pen") {
    this.penIsPressed = false;
    this.penPressure = 0;
    this.pen(e);
  }
}


  /**
   * Automatically attach all input listeners on import.
   */
  static {
    

    window.addEventListener("mousemove", (e) => {
      this.#updateMousePosition(e);

      if (this.mouseIsPressed) {
        this.mouseDragged(e);
      } else {
        this.mouseMoved(e);
      }
    });

    window.addEventListener("mousedown", (e) => {
      this.#updateMousePosition(e);
      this.#setButton(e.button, true);
      this.mousePressed(e);
    });

    window.addEventListener("mouseup", (e) => {
      this.#updateMousePosition(e);
      this.#setButton(e.button, false);
      this.mouseReleased(e);
    });

    window.addEventListener("click", (e) => {
      this.#updateMousePosition(e);
      this.mouseClicked(e);
    });

    window.addEventListener("dblclick", (e) => {
      this.#updateMousePosition(e);
      this.doubleClicked(e);
    });

    window.addEventListener("wheel", (e) => {
      this.#updateMousePosition(e);
      this.mouseWheel(e);
    }, { passive: true });

    window.addEventListener("touchstart", (e) => {
      this.#updateTouches(e);
      this.mouseIsPressed = this.touches.length > 0;
      this.mousePressed(e);
    }, { passive: true });

    window.addEventListener("touchmove", (e) => {
      this.#updateTouches(e);
      this.mouseIsPressed = this.touches.length > 0;

      if (this.mouseIsPressed) {
        this.mouseDragged(e);
      } else {
        this.mouseMoved(e);
      }
    }, { passive: true });

    window.addEventListener("touchend", (e) => {
      this.#updateTouches(e);
      this.mouseIsPressed = this.touches.length > 0;
      this.mouseReleased(e);
      if (!this.mouseIsPressed) {
        this.#resetPressState();
      }
    }, { passive: true });

    window.addEventListener("touchcancel", () => {
      this.#resetPressState();
      this.mouseReleased(e);
    }, { passive: true });

    window.addEventListener("blur", () => {
      this.#resetPressState();
    });
    window.addEventListener("pointerdown", (e) => this.#handlePointerDown(e));
    window.addEventListener("pointermove", (e) => this.#handlePointerMove(e));
    window.addEventListener("pointerup", (e) => this.#handlePointerUp(e));
  }
};

/**
 * Window / document lifecycle and resize utility.
 */
export const Window = class {
  /** Current window width */
  static #width = typeof window !== "undefined" ? window.innerWidth : 0;

  /** Current window height */
  static #height = typeof window !== "undefined" ? window.innerHeight : 0;

  /** Previous window width */
  static #pwidth = this.#width;

  /** Previous window height */
  static #pheight = this.#height;

  /** True when window has focus */
  static focused =
    typeof document !== "undefined"
      ? document.hasFocus()
      : false;

  /** True if document is visible (not in another tab / minimized) */
  static visible =
    typeof document !== "undefined"
      ? !document.hidden
      : true;

  /** True if fullscreen is active */
  static fullscreen =
    typeof document !== "undefined"
      ? !!document.fullscreenElement
      : false;

  /* -------------------------------------------------- */
  /* User-overridable callbacks                         */
  /* -------------------------------------------------- */

  /** Called when the window resizes */
  static resized = (event) => {};

  /** Called when the window gains focus */
  static focusedEvent = (event) => {};

  /** Called when the window loses focus */
  static blurredEvent = (event) => {};

  /** Called when visibility changes (tab switch, minimize) */
  static visibilityChanged = (event) => {};

  /** Called when fullscreen mode changes */
  static fullscreenChanged = (event) => {};
  /**Returns the previous width */
  static get prevWidth(){
    return this.#pwidth;
  }
  /**Returns the previous height */
  static get prevHeight(){
    return this.#pheight;
  }
  /**Returns the current width */
  static get Width(){
    return this.#width;
  }
  /**Returns the current height */
  static get Height(){
    return this.#height;
  }

  /* -------------------------------------------------- */
  /* Internal handlers                                  */
  /* -------------------------------------------------- */

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

  /* -------------------------------------------------- */
  /* Auto-attach listeners on import                    */
  /* -------------------------------------------------- */

  static {
    //if (typeof window === "undefined" || typeof document === "undefined") return;

    window.addEventListener("resize", (e) => this.#handleResize(e));
    window.addEventListener("focus", (e) => this.#handleFocus(e));
    window.addEventListener("blur", (e) => this.#handleBlur(e));

    document.addEventListener(
      "visibilitychange",
      (e) => this.#handleVisibility(e)
    );

    document.addEventListener(
      "fullscreenchange",
      (e) => this.#handleFullscreen(e)
    );
  }
};

/**
 * Game controller / gamepad utility.
 */
export const controller = class {
  /** @type {Array<Gamepad>} */
  static gamepads = [];

  /** True if any gamepad is connected */
  static connected = false;

  /** Called when a gamepad is connected */
  static connectedEvent = (gamepad) => {};

  /** Called when a gamepad is disconnected */
  static disconnectedEvent = (gamepad) => {};

  /**
   * Returns a gamepad by index (default: first gamepad)
   * @param {number} index
   * @returns {Gamepad|null}
   */
  static get(index = 0) {
    return this.gamepads[index] || null;
  }

  /**
   * Returns true if a button is pressed
   * @param {number} buttonIndex
   * @param {number} gamepadIndex
   */
  static button(buttonIndex, gamepadIndex = 0) {
    const gp = this.get(gamepadIndex);
    return gp ? gp.buttons[buttonIndex]?.pressed : false;
  }

  /**
   * Returns an axis value (-1 to 1)
   * @param {number} axisIndex
   * @param {number} gamepadIndex
   */
  static axis(axisIndex, gamepadIndex = 0) {
    const gp = this.get(gamepadIndex);
    return gp ? gp.axes[axisIndex] ?? 0 : 0;
  }

  /** Internal update loop */
  static #update() {
    const pads = navigator.getGamepads?.() || [];
    this.gamepads = Array.from(pads).filter(Boolean);
    this.connected = this.gamepads.length > 0;
    requestAnimationFrame(() => this.#update());
  }

  /** Auto‑attach listeners */
  static {
    //if (typeof window === "undefined") return;

    window.addEventListener("gamepadconnected", (e) => {
      this.connected = true;
      this.connectedEvent(e.gamepad);
    });

    window.addEventListener("gamepaddisconnected", (e) => {
      this.disconnectedEvent(e.gamepad);
    });

    this.#update();
  }
};

/**
 * Device sensors utility (accelerometer, gyroscope, orientation).
 */
export const sensor = class {
  /**
   * Acceleration along the X axis (left/right tilt), in m/s².
   * @type {number}
   */
  static accelerationX = 0;

  /**
   * Acceleration along the Y axis (front/back tilt), in m/s².
   * @type {number}
   */
  static accelerationY = 0;

  /**
   * Acceleration along the Z axis (up/down), in m/s².
   * @type {number}
   */
  static accelerationZ = 0;

  /**
   * Rotation rate around the alpha axis (z, compass), in deg/s.
   * @type {number}
   */
  static rotationRateAlpha = 0;

  /**
   * Rotation rate around the beta axis (x, front-back), in deg/s.
   * @type {number}
   */
  static rotationRateBeta = 0;

  /**
   * Rotation rate around the gamma axis (y, left-right), in deg/s.
   * @type {number}
   */
  static rotationRateGamma = 0;

  /**
   * Device orientation: compass heading in degrees (0–360).
   * @type {number|null}
   */
  static orientationAlpha = null;

  /**
   * Device orientation: front-to-back tilt in degrees (-180–180).
   * @type {number|null}
   */
  static orientationBeta = null;

  /**
   * Device orientation: left-to-right tilt in degrees (-90–90).
   * @type {number|null}
   */
  static orientationGamma = null;

  /**
   * True if the device supports and has granted motion/orientation events.
   * @type {boolean}
   */
  static available = false;

  /**
   * Called whenever a devicemotion event fires.
   * Override to handle updates.
   *
   * @param {DeviceMotionEvent} event
   * @returns {void}
   */
  static motionChanged = (event) => {};

  /**
   * Called whenever a deviceorientation event fires.
   * Override to handle updates.
   *
   * @param {DeviceOrientationEvent} event
   * @returns {void}
   */
  static orientationChanged = (event) => {};

  /**
   * Requests permission for motion/orientation sensors on iOS 13+.
   * Call this in response to a user gesture (e.g. a button click).
   *
   * @returns {Promise<boolean>} Resolves to true if permission was granted.
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
      // Non-iOS: permission not required
      this.available = true;
    }
    return this.available;
  }

  /**
   * Internal handler for devicemotion events.
   *
   * @param {DeviceMotionEvent} e
   * @returns {void}
   * @private
   */
  static #handleMotion(e) {
    const accel = e.accelerationIncludingGravity || e.acceleration || {};
    this.accelerationX = accel.x ?? 0;
    this.accelerationY = accel.y ?? 0;
    this.accelerationZ = accel.z ?? 0;

    const rot = e.rotationRate || {};
    this.rotationRateAlpha = rot.alpha ?? 0;
    this.rotationRateBeta  = rot.beta  ?? 0;
    this.rotationRateGamma = rot.gamma ?? 0;

    this.available = true;
    this.motionChanged(e);
  }

  /**
   * Internal handler for deviceorientation events.
   *
   * @param {DeviceOrientationEvent} e
   * @returns {void}
   * @private
   */
  static #handleOrientation(e) {
    this.orientationAlpha = e.alpha;
    this.orientationBeta  = e.beta;
    this.orientationGamma = e.gamma;

    this.available = true;
    this.orientationChanged(e);
  }

  /** Auto-attach listeners on import. */
  static {
    if (typeof window !== "undefined") {
      window.addEventListener("devicemotion",      (e) => this.#handleMotion(e));
      window.addEventListener("deviceorientation", (e) => this.#handleOrientation(e));
    }
  }
};