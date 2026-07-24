"use strict";

/**
 * Named, engine-wide constants: math/angle constants, angle-mode strings,
 * color-mode strings, renderer identifiers, and layout helpers.
 *
 * All values are plain primitives (numbers or strings) exported as named
 * properties on the Constants object, so callers can do either
 * `const { PI, WEBGL } = require('./constants.js')` or
 * `Constants.PI` / `Constants.WEBGL`.
 */
(function (root, factory) {
    const Constants = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = Constants;
    } else if (root) {
        root.Constants = Constants;
        Object.assign(root, Constants);
    }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    const Constants = {
        // Math constants
        PI: Math.PI,
        HALF_PI: Math.PI / 2,
        QUARTER_PI: Math.PI / 4,
        TWO_PI: Math.PI * 2,
        TAU: Math.PI * 2,

        // Angle modes, used with angleMode()
        RADIANS: "radians",
        DEGREES: "degrees",

        // Color modes, used with colorMode()
        HSB: "hsb",

        // Renderer identifiers, used with createCanvas()/setAttributes()
        P2D: "p2d",
        P2DP3: "p2dp3",
        WEBGL: "webgl",
        WEBGL2: "webgl2",
        WEBGPU: "webgpu",

        // Layout helper, used to auto-size one dimension of an element
        AUTO: "auto",

        // splineProperty('ends') modes
        INCLUDE: "include",
        EXCLUDE: "exclude",

        // Engine version, mirrors the version field in utils/package.json
        VERSION: "1.0.0"
    };

    return Constants;
});