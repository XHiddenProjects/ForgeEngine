"use strict";

/**
 * Minimal browser-side interaction helper adapted from utils/src/3d.js.
 * This exposes orbit-control and debug-mode configuration for the editor.
 */
class Forge3DInteraction {
  constructor() {
    this._debug = false;
    this._orbit = { sensitivityX: 1, sensitivityY: 1, sensitivityZ: 1 };
  }

  debugMode(state = true) {
    this._debug = state;
    return this;
  }

  noDebugMode() {
    this._debug = false;
    return this;
  }

  orbitControl(sensitivityX = 1, sensitivityY = 1, sensitivityZ = 1) {
    this._orbit = { sensitivityX, sensitivityY, sensitivityZ };
    return this._orbit;
  }
}

window.Forge3D = window.Forge3D || {};
window.Forge3D.Interaction = Forge3DInteraction;
