"use strict";

/**
 * Dependency-free color utility.
 *
 * The Color class exposes only these methods:
 * alpha, blue, brightness, color, contrast, green, hue, lerpColor,
 * lightness, paletteLerp, red, saturation, setAlpha, setBlue, setGreen,
 * setRed, and toString.
 *
 * All methods are static so they remain grouped under Color.
 * RGB/alpha channels use 0-255, hue uses 0-360, and
 * saturation/brightness/lightness use 0-100.
 */
(function (root, factory) {
    const Color = factory();

    if (typeof module === "object" && module.exports) {
        module.exports = Color;
    } else if (root) {
        root.Color = Color;
    }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const channel = value => {
        const number = Number(value);
        return Number.isFinite(number)
            ? Math.round(clamp(number, 0, 255))
            : 0;
    };

    const makeColor = (r, g, b, a = 255) => {
        const value = Object.create(Color.prototype);
        Object.defineProperties(value, {
            r: { value: channel(r), enumerable: true },
            g: { value: channel(g), enumerable: true },
            b: { value: channel(b), enumerable: true },
            a: { value: channel(a), enumerable: true }
        });
        return Object.freeze(value);
    };

    const parseHex = value => {
        let hex = value.trim().replace(/^#/, "");

        if (/^[0-9a-f]{3,4}$/i.test(hex)) {
            hex = [...hex].map(character => character + character).join("");
        }

        if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) {
            throw new TypeError(`Invalid hex color: ${value}`);
        }

        return makeColor(
            parseInt(hex.slice(0, 2), 16),
            parseInt(hex.slice(2, 4), 16),
            parseInt(hex.slice(4, 6), 16),
            hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255
        );
    };

    const parseColor = value => {
        if (value instanceof Color) return value;
        if (typeof value === "string") return parseHex(value);

        if (Array.isArray(value) || ArrayBuffer.isView(value)) {
            return makeColor(
                value[0] ?? 0,
                value[1] ?? 0,
                value[2] ?? 0,
                value[3] ?? 255
            );
        }

        if (value && typeof value === "object") {
            return makeColor(
                value.r ?? 0,
                value.g ?? 0,
                value.b ?? 0,
                value.a ?? 255
            );
        }

        if (typeof value === "number") {
            return makeColor(value, value, value, 255);
        }

        throw new TypeError("Unsupported color value.");
    };

    const metrics = value => {
        const current = parseColor(value);
        const r = current.r / 255;
        const g = current.g / 255;
        const b = current.b / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        const lightness = (max + min) / 2;

        let hue = 0;
        if (delta !== 0) {
            if (max === r) hue = 60 * (((g - b) / delta) % 6);
            else if (max === g) hue = 60 * ((b - r) / delta + 2);
            else hue = 60 * ((r - g) / delta + 4);
            if (hue < 0) hue += 360;
        }

        return {
            hue,
            saturation: max === 0 ? 0 : (delta / max) * 100,
            brightness: max * 100,
            lightness: lightness * 100
        };
    };

    class Color {
        /**
         * Gets the alpha (transparency) channel of a color.
         *
         * @param {Color|string|number|ArrayLike<number>|Object} value - The color
         * to inspect. Accepts a Color instance, hexadecimal string, grayscale
         * number, RGB(A) array, typed array, or object with r, g, b, and a fields.
         * @returns {number} The alpha channel as an integer from 0 (transparent)
         * to 255 (opaque).
         * @throws {TypeError} If the supplied value cannot be interpreted as a color.
         */
        static alpha(value) {
            return parseColor(value).a;
        }

        /**
         * Calculates the WCAG contrast ratio between two colors.
         *
         * Alpha channels are composited over an opaque white background before
         * relative luminance is calculated. The result ranges from 1 for identical
         * luminance to 21 for the maximum contrast between black and white.
         *
         * @param {Color|string|number|ArrayLike<number>|Object} first - The first
         * color to compare.
         * @param {Color|string|number|ArrayLike<number>|Object} second - The second
         * color to compare.
         * @returns {number} The contrast ratio from 1 to 21.
         * @throws {TypeError} If either value cannot be interpreted as a color.
         */
        static contrast(first, second) {
            const relativeLuminance = value => {
                const current = parseColor(value);
                const opacity = current.a / 255;
                const composite = component => (
                    (component / 255) * opacity + (1 - opacity)
                );
                const linearize = component => (
                    component <= 0.04045
                        ? component / 12.92
                        : ((component + 0.055) / 1.055) ** 2.4
                );

                return 0.2126 * linearize(composite(current.r))
                    + 0.7152 * linearize(composite(current.g))
                    + 0.0722 * linearize(composite(current.b));
            };

            const firstLuminance = relativeLuminance(first);
            const secondLuminance = relativeLuminance(second);
            const lighter = Math.max(firstLuminance, secondLuminance);
            const darker = Math.min(firstLuminance, secondLuminance);

            return (lighter + 0.05) / (darker + 0.05);
        }

        /**
         * Gets the blue channel of a color.
         *
         * @param {Color|string|number|ArrayLike<number>|Object} value - The color
         * to inspect.
         * @returns {number} The blue channel as an integer from 0 to 255.
         * @throws {TypeError} If the supplied value cannot be interpreted as a color.
         */
        static blue(value) {
            return parseColor(value).b;
        }

        /**
         * Gets the HSV/HSB brightness of a color.
         *
         * Brightness is the largest normalized RGB channel.
         *
         * @param {Color|string|number|ArrayLike<number>|Object} value - The color
         * to inspect.
         * @returns {number} The brightness percentage from 0 to 100.
         * @throws {TypeError} If the supplied value cannot be interpreted as a color.
         */
        static brightness(value) {
            return metrics(value).brightness;
        }

        /**
         * Creates an immutable Color instance.
         *
         * Supported signatures include `color(value)`, `color(gray, alpha)`,
         * `color(red, green, blue)`, and `color(red, green, blue, alpha)`.
         * A single value may be a Color instance, hexadecimal string, grayscale
         * number, RGB(A) array, typed array, or color-like object.
         *
         * @param {...*} values - The color value or channel values to convert.
         * @returns {Color} A new immutable Color instance, or the supplied Color
         * instance when one is passed directly.
         * @throws {TypeError} If a single supplied value cannot be interpreted as a color.
         */
        static color(...values) {
            if (values.length === 1) return parseColor(values[0]);

            if (values.length === 2) {
                return makeColor(values[0], values[0], values[0], values[1]);
            }

            return makeColor(
                values[0] ?? 0,
                values[1] ?? 0,
                values[2] ?? 0,
                values[3] ?? 255
            );
        }

        /**
         * Gets the green channel of a color.
         *
         * @param {Color|string|number|ArrayLike<number>|Object} value - The color
         * to inspect.
         * @returns {number} The green channel as an integer from 0 to 255.
         * @throws {TypeError} If the supplied value cannot be interpreted as a color.
         */
        static green(value) {
            return parseColor(value).g;
        }

        /**
         * Gets the hue of a color in the HSV/HSB color model.
         *
         * Achromatic colors return 0 because they have no intrinsic hue.
         *
         * @param {Color|string|number|ArrayLike<number>|Object} value - The color
         * to inspect.
         * @returns {number} The hue in degrees from 0 (inclusive) to 360 (exclusive).
         * @throws {TypeError} If the supplied value cannot be interpreted as a color.
         */
        static hue(value) {
            return metrics(value).hue;
        }

        /**
         * Linearly interpolates between two colors in RGBA space.
         *
         * Each channel is blended independently and rounded to the nearest integer.
         * The interpolation amount is clamped to the inclusive range 0 to 1.
         *
         * @param {Color|string|number|ArrayLike<number>|Object} first - The color
         * returned when `amount` is 0.
         * @param {Color|string|number|ArrayLike<number>|Object} second - The color
         * returned when `amount` is 1.
         * @param {number} amount - The interpolation position from 0 to 1.
         * @returns {Color} A new immutable interpolated Color instance.
         * @throws {TypeError} If either endpoint cannot be interpreted as a color.
         */
        static lerpColor(first, second, amount) {
            const start = parseColor(first);
            const end = parseColor(second);
            const t = clamp(Number(amount) || 0, 0, 1);

            return makeColor(
                start.r + (end.r - start.r) * t,
                start.g + (end.g - start.g) * t,
                start.b + (end.b - start.b) * t,
                start.a + (end.a - start.a) * t
            );
        }

        /**
         * Gets the HSL lightness of a color.
         *
         * Lightness is the midpoint between the largest and smallest normalized
         * RGB channels.
         *
         * @param {Color|string|number|ArrayLike<number>|Object} value - The color
         * to inspect.
         * @returns {number} The lightness percentage from 0 to 100.
         * @throws {TypeError} If the supplied value cannot be interpreted as a color.
         */
        static lightness(value) {
            return metrics(value).lightness;
        }

        /**
         * Interpolates across an ordered palette of colors.
         *
         * The palette is divided into equal segments. An amount of 0 selects the
         * first color, an amount of 1 selects the last color, and intermediate
         * values blend between adjacent entries. The amount is clamped to 0 to 1.
         *
         * @param {Array<Color|string|number|ArrayLike<number>|Object>} palette - A
         * non-empty array of colors in interpolation order.
         * @param {number} amount - The normalized position in the palette from 0 to 1.
         * @returns {Color} A new immutable Color instance at the requested position.
         * @throws {TypeError} If `palette` is empty, is not an array, or contains
         * a value that cannot be interpreted as a color.
         */
        static paletteLerp(palette, amount) {
            if (!Array.isArray(palette) || palette.length === 0) {
                throw new TypeError(
                    "Color.paletteLerp() expects a non-empty array of colors."
                );
            }

            if (palette.length === 1) return parseColor(palette[0]);

            const t = clamp(Number(amount) || 0, 0, 1);
            const scaled = t * (palette.length - 1);
            const index = Math.min(Math.floor(scaled), palette.length - 2);

            return Color.lerpColor(
                palette[index],
                palette[index + 1],
                scaled - index
            );
        }

        /**
         * Gets the red channel of a color.
         *
         * @param {Color|string|number|ArrayLike<number>|Object} value - The color
         * to inspect.
         * @returns {number} The red channel as an integer from 0 to 255.
         * @throws {TypeError} If the supplied value cannot be interpreted as a color.
         */
        static red(value) {
            return parseColor(value).r;
        }

        /**
         * Gets the HSV/HSB saturation of a color.
         *
         * @param {Color|string|number|ArrayLike<number>|Object} value - The color
         * to inspect.
         * @returns {number} The saturation percentage from 0 to 100.
         * @throws {TypeError} If the supplied value cannot be interpreted as a color.
         */
        static saturation(value) {
            return metrics(value).saturation;
        }


        /**
         * Creates a copy of a color with a new alpha (transparency) channel.
         *
         * The source color is not modified. Values are rounded and clamped to the
         * inclusive channel range 0 to 255.
         *
         * @param {Color|string|number|ArrayLike<number>|Object} value - The source color.
         * @param {number} alpha - The new alpha channel from 0 (transparent) to
         * 255 (opaque).
         * @returns {Color} A new immutable Color instance with the updated alpha channel.
         * @throws {TypeError} If `value` cannot be interpreted as a color.
         */
        static setAlpha(value, alpha) {
            const current = parseColor(value);
            return makeColor(current.r, current.g, current.b, alpha);
        }

        /**
         * Creates a copy of a color with a new blue channel.
         *
         * The source color is not modified. Values are rounded and clamped to the
         * inclusive channel range 0 to 255.
         *
         * @param {Color|string|number|ArrayLike<number>|Object} value - The source color.
         * @param {number} blue - The new blue channel from 0 to 255.
         * @returns {Color} A new immutable Color instance with the updated blue channel.
         * @throws {TypeError} If `value` cannot be interpreted as a color.
         */
        static setBlue(value, blue) {
            const current = parseColor(value);
            return makeColor(current.r, current.g, blue, current.a);
        }

        /**
         * Creates a copy of a color with a new green channel.
         *
         * The source color is not modified. Values are rounded and clamped to the
         * inclusive channel range 0 to 255.
         *
         * @param {Color|string|number|ArrayLike<number>|Object} value - The source color.
         * @param {number} green - The new green channel from 0 to 255.
         * @returns {Color} A new immutable Color instance with the updated green channel.
         * @throws {TypeError} If `value` cannot be interpreted as a color.
         */
        static setGreen(value, green) {
            const current = parseColor(value);
            return makeColor(current.r, green, current.b, current.a);
        }

        /**
         * Creates a copy of a color with a new red channel.
         *
         * The source color is not modified. Values are rounded and clamped to the
         * inclusive channel range 0 to 255.
         *
         * @param {Color|string|number|ArrayLike<number>|Object} value - The source color.
         * @param {number} red - The new red channel from 0 to 255.
         * @returns {Color} A new immutable Color instance with the updated red channel.
         * @throws {TypeError} If `value` cannot be interpreted as a color.
         */
        static setRed(value, red) {
            const current = parseColor(value);
            return makeColor(red, current.g, current.b, current.a);
        }

        /**
         * Formats a color as a CSS-compatible string.
         *
         * Opaque colors are returned as `rgb(r, g, b)`. Colors with transparency
         * are returned as `rgba(r, g, b, a)`, where alpha is normalized to 0 to 1.
         *
         * @param {Color|string|number|ArrayLike<number>|Object} value - The color
         * to format.
         * @returns {string} The color formatted as an RGB or RGBA string.
         * @throws {TypeError} If `value` cannot be interpreted as a color.
         */
        static toString(value) {
            const current = parseColor(value);

            if (current.a === 255) {
                return `rgb(${current.r}, ${current.g}, ${current.b})`;
            }

            const normalizedAlpha = Number((current.a / 255).toFixed(3));
            return `rgba(${current.r}, ${current.g}, ${current.b}, ${normalizedAlpha})`;
        }
    }

    return Color;
});
