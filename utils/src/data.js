'use strict';

// Data helpers: type conversion (the "Conversion" category) and small
// formatting/parsing utilities (the "Utility Functions" category). Plain
// functions grouped in a namespace object - no state, no instance to build.
(function (root, factory) {
    const Data = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = Data;
    } else if (root) {
        root.Data = Data;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

/**
 * Type-conversion and text-formatting helpers.
 *
 * @namespace
 */
const Data = {
    // -----------------------------------------------------------------
    // Conversion
    // -----------------------------------------------------------------

    /**
     * Converts a String or Number to a Boolean.
     * @param {string|number|boolean|Array} value
     * @returns {boolean|Array<boolean>}
     */
    boolean(value) {
        if (Array.isArray(value)) return value.map(Data.boolean);
        if (typeof value === 'string') return value.trim().toLowerCase() === 'true';
        return Boolean(value);
    },

    /**
     * Converts a Boolean, String, or Number to its byte value (a signed 8-bit integer, `-128`-`127`).
     * @param {boolean|string|number|Array} value
     * @returns {number|Array<number>}
     */
    byte(value) {
        if (Array.isArray(value)) return value.map(Data.byte);
        const n = Data.int(value) & 0xff;
        return n > 127 ? n - 256 : n;
    },

    /**
     * Converts a Number or String to a single-character String.
     * @param {number|string|Array} value
     * @returns {string|Array<string>}
     */
    char(value) {
        if (Array.isArray(value)) return value.map(Data.char);
        return typeof value === 'number' ? String.fromCharCode(value) : String(value).charAt(0);
    },

    /**
     * Converts a single-character String to a Number (its char code).
     * @param {string|Array} value
     * @returns {number|Array<number>}
     */
    unchar(value) {
        if (Array.isArray(value)) return value.map(Data.unchar);
        return String(value).charCodeAt(0);
    },

    /**
     * Converts a String to a floating point (decimal) Number.
     * @param {string|Array} value
     * @returns {number|Array<number>}
     */
    float(value) {
        if (Array.isArray(value)) return value.map(Data.float);
        const n = parseFloat(value);
        return Number.isNaN(n) ? NaN : n;
    },

    /**
     * Converts a Boolean, String, or decimal Number to an integer (truncating any fractional part).
     * @param {boolean|string|number|Array} value
     * @param {number} [radix=10]
     * @returns {number|Array<number>}
     */
    int(value, radix = 10) {
        if (Array.isArray(value)) return value.map((v) => Data.int(v, radix));
        if (typeof value === 'boolean') return value ? 1 : 0;
        if (typeof value === 'number') return Math.trunc(value);
        const n = parseInt(value, radix);
        return Number.isNaN(n) ? 0 : n;
    },

    /**
     * Converts a Boolean or Number to a String.
     * @param {boolean|number|string|Array} value
     * @returns {string|Array<string>}
     */
    str(value) {
        if (Array.isArray(value)) return value.map(Data.str);
        return String(value);
    },

    /**
     * Converts a Number to a String with its hexadecimal value.
     * @param {number} value
     * @param {number} [digits] - Minimum number of hex digits, left-padded with `0`.
     * @returns {string}
     */
    hex(value, digits) {
        const n = value < 0 ? value >>> 0 : value;
        let s = n.toString(16).toUpperCase();
        if (digits) s = s.padStart(digits, '0');
        return s;
    },

    /**
     * Converts a String with a hexadecimal value to a Number.
     * @param {string} value
     * @returns {number}
     */
    unhex(value) {
        return parseInt(value, 16);
    },

    // -----------------------------------------------------------------
    // Utility Functions
    // -----------------------------------------------------------------

    /**
     * Converts a Number into a String with a given number of digits, optionally zero-padded on the left and/or right.
     * @param {number|number[]} num - A number, or an array of numbers to format individually.
     * @param {number} [left=0] - Minimum digits before the decimal point.
     * @param {number} [right] - Digits after the decimal point (omit to leave the value as-is).
     * @returns {string|string[]}
     */
    nf(num, left = 0, right) {
        if (Array.isArray(num)) return num.map((n) => Data.nf(n, left, right));
        const negative = num < 0;
        let value = Math.abs(num);
        let str = right !== undefined ? value.toFixed(right) : String(value);
        let [intPart, fracPart] = str.split('.');
        intPart = intPart.padStart(left, '0');
        const result = fracPart !== undefined ? `${intPart}.${fracPart}` : intPart;
        return negative ? `-${result}` : result;
    },

    /**
     * Converts a Number into a String with commas marking every 1,000.
     * @param {number|number[]} num
     * @param {number} [right] - Digits after the decimal point.
     * @returns {string|string[]}
     */
    nfc(num, right) {
        if (Array.isArray(num)) return num.map((n) => Data.nfc(n, right));
        const negative = num < 0;
        const value = Math.abs(num);
        const str = right !== undefined ? value.toFixed(right) : String(value);
        const [intPart, fracPart] = str.split('.');
        const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        const result = fracPart !== undefined ? `${withCommas}.${fracPart}` : withCommas;
        return negative ? `-${result}` : result;
    },

    /**
     * Converts a Number into a String, always prefixed with a `+` or `-` sign.
     * @param {number|number[]} num
     * @param {number} [left=0]
     * @param {number} [right]
     * @returns {string|string[]}
     */
    nfp(num, left = 0, right) {
        if (Array.isArray(num)) return num.map((n) => Data.nfp(n, left, right));
        const formatted = Data.nf(Math.abs(num), left, right);
        return (num < 0 ? '-' : '+') + formatted;
    },

    /**
     * Converts a positive Number into a String with an extra leading space (in place of a sign), so it lines up with negative numbers formatted by {@link Data.nfp}.
     * @param {number|number[]} num
     * @param {number} [left=0]
     * @param {number} [right]
     * @returns {string|string[]}
     */
    nfs(num, left = 0, right) {
        if (Array.isArray(num)) return num.map((n) => Data.nfs(n, left, right));
        const formatted = Data.nf(Math.abs(num), left, right);
        return (num < 0 ? '-' : ' ') + formatted;
    },

    /**
     * Shuffles the elements of an array.
     * @param {Array} array
     * @param {boolean} [inPlace=false] - If `true`, shuffles `array` directly; otherwise shuffles and returns a copy.
     * @returns {Array}
     */
    shuffle(array, inPlace = false) {
        const arr = inPlace ? array : array.slice();
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    },

    /**
     * Splits a String into pieces at any of the given delimiter characters, returning an array containing the pieces.
     * @param {string} value
     * @param {string} [delimiters=' \t\n\r\f'] - Characters to split on, treated individually (not as a substring).
     * @returns {string[]}
     */
    splitTokens(value, delimiters = ' \t\n\r\f') {
        const chars = delimiters.split('');
        const pattern = new RegExp(`[${chars.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')}]+`);
        return value.split(pattern).filter((s) => s.length > 0);
    },

    /**
     * Removes any of the specified characters ("tokens") from a String.
     * @param {string} value
     * @param {string} [tokens=' \t\n\r\f'] - Characters to remove, treated individually.
     * @returns {string}
     */
    removeTokens(value, tokens = ' \t\n\r\f') {
        const chars = tokens.split('');
        const pattern = new RegExp(`[${chars.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('')}]`, 'g');
        return value.replace(pattern, '');
    },

    /**
     * Trims leading and trailing whitespace from a String (or from every String in an array).
     * @param {string|string[]} value
     * @returns {string|string[]}
     */
    trim(value) {
        if (Array.isArray(value)) return value.map((v) => String(v).trim());
        return String(value).trim();
    }
};

return Data;
});