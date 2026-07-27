'use strict';

const { EventEmitter } = require('events');
const constants = require('./constants.js');

/**
 * These classes model input state the way p5.js does, but since Node has no
 * real keyboard/mouse/device sensors, callers feed events in explicitly via
 * the `_emit*` methods (e.g. from a websocket, Electron, or a game loop
 * driving simulated input). Handlers are plain settable callback properties,
 * matching p5's `keyPressed = () => {}` style.
 */
class Keyboard extends EventEmitter {
  /**
   * Initializes a new instance with its default state.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  constructor() {
    super();
    this._key = null;
    this._keyCode = null;
    this._code = null;
    this._pressed = new Set();
    this.keyPressed = null;
    this.keyReleased = null;
    this.keyTyped = null;
  }
  /**
   * Returns the key.
   *
   * @returns {string|null} Current value.
   */
  get key() { return this._key; }
  /**
   * Returns the keyCode.
   *
   * @returns {number} Current value.
   */
  get keyCode() { return this._keyCode; }
  /**
   * Returns the code.
   *
   * @returns {string|null} Current value.
   */
  get code() { return this._code; }
  /**
   * Returns the keyIsPressed.
   *
   * @returns {boolean} Current state.
   */
  get keyIsPressed() { return this._pressed.size > 0; }
  /**
   * Checks whether a key or code is currently pressed.
   *
   * @param {string|*} codeOrKey - Codeorkey value.
   *
   * @returns {boolean} Result of the check.
   */
  keyIsDown(codeOrKey) { return this._pressed.has(codeOrKey); }

  /**
   * Updates keyboard state and dispatches key-down callbacks.
   *
   * @param {string|*} key - Key value.
   * @param {number} keyCode - Keycode value.
   * @param {string|*} code - Code value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  _emitKeyDown(key, keyCode, code) {
    this._key = key; this._keyCode = keyCode; this._code = code;
    this._pressed.add(code || key);
    this.emit('keyPressed', { key, keyCode, code });
    if (typeof this.keyPressed === 'function') this.keyPressed({ key, keyCode, code });
    if (key && key.length === 1) {
      this.emit('keyTyped', { key });
      if (typeof this.keyTyped === 'function') this.keyTyped({ key });
    }
  }
  /**
   * Updates keyboard state and dispatches key-up callbacks.
   *
   * @param {string|*} key - Key value.
   * @param {number} keyCode - Keycode value.
   * @param {string|*} code - Code value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  _emitKeyUp(key, keyCode, code) {
    this._pressed.delete(code || key);
    this.emit('keyReleased', { key, keyCode, code });
    if (typeof this.keyReleased === 'function') this.keyReleased({ key, keyCode, code });
  }
}

class Pointer extends EventEmitter {
  /**
   * Initializes a new instance with its default state.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  constructor() {
    super();
    this._x = 0; this._y = 0;
    this._px = 0; this._py = 0;
    this._winX = 0; this._winY = 0;
    this._pWinX = 0; this._pWinY = 0;
    this._button = null;
    this._pressed = false;
    this._touches = [];
    this.mouseMoved = null;
    this.mouseDragged = null;
    this.mousePressed = null;
    this.mouseReleased = null;
    this.mouseClicked = null;
    this.doubleClicked = null;
    this.mouseWheel = null;
    this._lockRequested = false;
  }
  /**
   * Returns the mouseX.
   *
   * @returns {number} Current value.
   */
  get mouseX() { return this._x; }
  /**
   * Returns the mouseY.
   *
   * @returns {number} Current value.
   */
  get mouseY() { return this._y; }
  /**
   * Returns the pmouseX.
   *
   * @returns {number} Current value.
   */
  get pmouseX() { return this._px; }
  /**
   * Returns the pmouseY.
   *
   * @returns {number} Current value.
   */
  get pmouseY() { return this._py; }
  /**
   * Returns the winMouseX.
   *
   * @returns {number} Current value.
   */
  get winMouseX() { return this._winX; }
  /**
   * Returns the winMouseY.
   *
   * @returns {number} Current value.
   */
  get winMouseY() { return this._winY; }
  /**
   * Returns the pwinMouseX.
   *
   * @returns {number} Current value.
   */
  get pwinMouseX() { return this._pWinX; }
  /**
   * Returns the pwinMouseY.
   *
   * @returns {number} Current value.
   */
  get pwinMouseY() { return this._pWinY; }
  /**
   * Returns the movedX.
   *
   * @returns {number} Current value.
   */
  get movedX() { return this._x - this._px; }
  /**
   * Returns the movedY.
   *
   * @returns {number} Current value.
   */
  get movedY() { return this._y - this._py; }
  /**
   * Returns the mouseButton.
   *
   * @returns {string|null} Current value.
   */
  get mouseButton() { return this._button; }
  /**
   * Returns the mouseIsPressed.
   *
   * @returns {boolean} Current state.
   */
  get mouseIsPressed() { return this._pressed; }
  /**
   * Returns the touches.
   *
   * @returns {Array} Current value.
   */
  get touches() { return this._touches.slice(); }

  /**
   * Marks pointer lock as requested.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  requestPointerLock() { this._lockRequested = true; return this; }
  /**
   * Clears the pointer-lock request.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  exitPointerLock() { this._lockRequested = false; return this; }

  /**
   * Updates pointer coordinates and dispatches a move or drag event.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  _emitMove(x, y) {
    this._px = this._x; this._py = this._y;
    this._x = x; this._y = y;
    const evt = { x, y };
    const evtName = this._pressed ? 'mouseDragged' : 'mouseMoved';
    this.emit(evtName, evt);
    const handler = this._pressed ? this.mouseDragged : this.mouseMoved;
    if (typeof handler === 'function') handler(evt);
  }
  /**
   * Updates pointer state and dispatches a press event.
   *
   * @param {string|*} [button='left'] - Button value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  _emitDown(button = 'left') {
    this._pressed = true; this._button = button;
    this.emit('mousePressed', { button });
    if (typeof this.mousePressed === 'function') this.mousePressed({ button });
  }
  /**
   * Updates pointer state and dispatches release and click events.
   *
   * @param {string|*} [button='left'] - Button value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  _emitUp(button = 'left') {
    this._pressed = false;
    this.emit('mouseReleased', { button });
    if (typeof this.mouseReleased === 'function') this.mouseReleased({ button });
    this.emit('mouseClicked', { button });
    if (typeof this.mouseClicked === 'function') this.mouseClicked({ button });
  }
  /**
   * Dispatches a mouse-wheel event.
   *
   * @param {number} delta - Delta value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  _emitWheel(delta) {
    this.emit('mouseWheel', { delta });
    if (typeof this.mouseWheel === 'function') this.mouseWheel({ delta });
  }
  /**
   * Replaces the current touch-point collection.
   *
   * @param {Array} touches - Touches value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  _setTouches(touches) { this._touches = touches; return this; }
}

class Acceleration extends EventEmitter {
  /**
   * Initializes a new instance with its default state.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  constructor() {
    super();
    this._accel = { x: 0, y: 0, z: 0 };
    this._pAccel = { x: 0, y: 0, z: 0 };
    this._rotation = { x: 0, y: 0, z: 0 };
    this._pRotation = { x: 0, y: 0, z: 0 };
    this._orientation = 'landscape';
    this._moveThreshold = 15;
    this._shakeThreshold = 30;
    this.deviceMoved = null;
    this.deviceTurned = null;
    this.deviceShaken = null;
  }
  /**
   * Returns the accelerationX.
   *
   * @returns {number} Current value.
   */
  get accelerationX() { return this._accel.x; }
  /**
   * Returns the accelerationY.
   *
   * @returns {number} Current value.
   */
  get accelerationY() { return this._accel.y; }
  /**
   * Returns the accelerationZ.
   *
   * @returns {number} Current value.
   */
  get accelerationZ() { return this._accel.z; }
  /**
   * Returns the pAccelerationX.
   *
   * @returns {number} Current value.
   */
  get pAccelerationX() { return this._pAccel.x; }
  /**
   * Returns the pAccelerationY.
   *
   * @returns {number} Current value.
   */
  get pAccelerationY() { return this._pAccel.y; }
  /**
   * Returns the pAccelerationZ.
   *
   * @returns {number} Current value.
   */
  get pAccelerationZ() { return this._pAccel.z; }
  /**
   * Returns the rotationX.
   *
   * @returns {number} Current value.
   */
  get rotationX() { return this._rotation.x; }
  /**
   * Returns the rotationY.
   *
   * @returns {number} Current value.
   */
  get rotationY() { return this._rotation.y; }
  /**
   * Returns the rotationZ.
   *
   * @returns {number} Current value.
   */
  get rotationZ() { return this._rotation.z; }
  /**
   * Returns the pRotationX.
   *
   * @returns {number} Current value.
   */
  get pRotationX() { return this._pRotation.x; }
  /**
   * Returns the pRotationY.
   *
   * @returns {number} Current value.
   */
  get pRotationY() { return this._pRotation.y; }
  /**
   * Returns the pRotationZ.
   *
   * @returns {number} Current value.
   */
  get pRotationZ() { return this._pRotation.z; }
  /**
   * Returns the deviceOrientation.
   *
   * @returns {string|null} Current value.
   */
  get deviceOrientation() { return this._orientation; }
  /**
   * Returns the turnAxis.
   *
   * @returns {string|null} Current value.
   */
  get turnAxis() { return 'Z'; }

  /**
   * Sets the movement threshold for device-moved events.
   *
   * @param {number} v - V value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  setMoveThreshold(v) { this._moveThreshold = v; return this; }
  /**
   * Sets the movement threshold for device-shaken events.
   *
   * @param {number} v - V value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  setShakeThreshold(v) { this._shakeThreshold = v; return this; }

  /**
   * Updates acceleration state and dispatches motion events.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} z - Z value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  _emitMotion(x, y, z) {
    const dist = Math.hypot(x - this._accel.x, y - this._accel.y, z - this._accel.z);
    this._pAccel = { ...this._accel };
    this._accel = { x, y, z };
    if (dist > this._moveThreshold) {
      this.emit('deviceMoved');
      if (typeof this.deviceMoved === 'function') this.deviceMoved();
    }
    if (dist > this._shakeThreshold) {
      this.emit('deviceShaken');
      if (typeof this.deviceShaken === 'function') this.deviceShaken();
    }
  }
  /**
   * Updates rotation state and dispatches a turn event.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} z - Z value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  _emitRotation(x, y, z) {
    this._pRotation = { ...this._rotation };
    this._rotation = { x, y, z };
    this.emit('deviceTurned');
    if (typeof this.deviceTurned === 'function') this.deviceTurned();
  }
}

module.exports = { Keyboard, Pointer, Acceleration };
