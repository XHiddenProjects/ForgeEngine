'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const constants = require('./constants.js');

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------
/**
 * Converts a value or array of values to booleans.
 *
 * @param {*} val - Value or array to convert.
 *
 * @returns {boolean|boolean[]} Converted value or array.
 */
function boolean(val) {
  if (typeof val === 'string') return val.toLowerCase() === 'true' || val === '1';
  if (typeof val === 'number') return val !== 0;
  if (Array.isArray(val)) return val.map(boolean);
  return Boolean(val);
}
/**
 * Converts a value or array to signed 8-bit integers.
 *
 * @param {*} val - Value or array to convert.
 *
 * @returns {number|number[]} Converted value or array.
 */
function byte(val) {
  if (Array.isArray(val)) return val.map(byte);
  const n = int(val);
  return ((n % 256) + 256) % 256 > 127 ? (n % 256) - 256 : n % 256;
}
/**
 * Converts a value or array to single-character strings.
 *
 * @param {*} val - Value or array to convert.
 *
 * @returns {string|string[]} Converted value or array.
 */
function char(val) {
  if (Array.isArray(val)) return val.map(char);
  return typeof val === 'number' ? String.fromCharCode(val) : String(val).charAt(0);
}
/**
 * Returns UTF-16 code units for a character or array of characters.
 *
 * @param {*} val - Value or array to convert.
 *
 * @returns {number|number[]} Converted value or array.
 */
function unchar(val) {
  if (Array.isArray(val)) return val.map(unchar);
  return String(val).charCodeAt(0);
}
/**
 * Converts a value or array to floating-point numbers.
 *
 * @param {*} val - Value or array to convert.
 *
 * @returns {number|number[]} Converted value or array.
 */
function float(val) {
  if (Array.isArray(val)) return val.map(float);
  return parseFloat(val);
}
/**
 * Converts a value or array to integers.
 *
 * @param {*} val - Value or array to convert.
 * @param {number} [radix=10] - Numeric base used for string parsing.
 *
 * @returns {number|number[]} Converted integer or array.
 */
function int(val, radix = 10) {
  if (Array.isArray(val)) return val.map(v => int(v, radix));
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'string' && val.trim().startsWith('#')) return parseInt(val.trim().slice(1), 16);
  return radix === 10 ? Math.trunc(parseFloat(val)) : parseInt(val, radix);
}
/**
 * Converts a value or array to strings.
 *
 * @param {*} val - Value or array to convert.
 *
 * @returns {string|string[]} Converted value or array.
 */
function str(val) {
  if (Array.isArray(val)) return val.map(str);
  return String(val);
}
/**
 * Formats a number or array as uppercase hexadecimal.
 *
 * @param {number|number[]} n - Number or array to format.
 * @param {number} [digits=8] - Minimum output width.
 *
 * @returns {string|string[]} Hexadecimal string or array.
 */
function hex(n, digits = 8) {
  if (Array.isArray(n)) return n.map(v => hex(v, digits));
  const unsigned = n < 0 ? n >>> 0 : n;
  return unsigned.toString(16).toUpperCase().padStart(digits, '0').slice(-Math.max(digits, unsigned.toString(16).length));
}
/**
 * Parses a hexadecimal string or array.
 *
 * @param {string|string[]} hexStr - Hexadecimal text to parse.
 *
 * @returns {number|number[]} Parsed number or array.
 */
function unhex(hexStr) {
  if (Array.isArray(hexStr)) return hexStr.map(unhex);
  return parseInt(hexStr, 16);
}

// ---------------------------------------------------------------------------
// Localstorage — Node has no window.localStorage, so this persists a small
// JSON document to disk (per-process file in the OS temp/user-data dir).
// ---------------------------------------------------------------------------
class Localstorage {
  /**
   * Creates a JSON-file-backed local storage adapter.
   *
   * @param {string} [filePath] - Storage file path; defaults to `.forge/storage.json` under the current working directory.
   */
  constructor(filePath) {
    this.filePath = filePath || path.join(process.cwd(), '.forge', 'storage.json');
    this._ensureFile();
  }
  /**
   * Ensures that the storage directory and JSON file exist.
   *
   * @returns {void} 
   */
  _ensureFile() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.filePath)) fs.writeFileSync(this.filePath, '{}', 'utf8');
  }
  /**
   * Reads and parses the storage document.
   *
   * @returns {Object} Stored key-value data, or an empty object if reading fails.
   */
  _read() {
    try { return JSON.parse(fs.readFileSync(this.filePath, 'utf8')); }
    catch (e) { return {}; }
  }
  /**
   * Serializes the storage document to disk.
   *
   * @param {Object} obj - Key-value data to persist.
   *
   * @returns {void} 
   */
  _write(obj) {
    fs.writeFileSync(this.filePath, JSON.stringify(obj, null, 2), 'utf8');
  }
  /**
   * Stores a value under a key.
   *
   * @param {string} key - Storage key.
   * @param {*} value - JSON-serializable value to store.
   *
   * @returns {*} Stored value.
   */
  storeItem(key, value) {
    const data = this._read();
    data[key] = value;
    this._write(data);
    return value;
  }
  /**
   * Retrieves a stored value.
   *
   * @param {string} key - Storage key.
   *
   * @returns {*} Stored value, or `null` when the key does not exist.
   */
  getItem(key) {
    const data = this._read();
    return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
  }
  /**
   * Removes a stored value.
   *
   * @param {string} key - Storage key.
   *
   * @returns {boolean} `true` after the storage file is updated.
   */
  removeItem(key) {
    const data = this._read();
    delete data[key];
    this._write(data);
    return true;
  }
  /**
   * Removes all stored values.
   *
   * @returns {boolean} `true` after the storage file is cleared.
   */
  clearStorage() {
    this._write({});
    return true;
  }
}

// ---------------------------------------------------------------------------
// General utility (number formatting, shuffle, tokenizing)
// ---------------------------------------------------------------------------
/**
 * Formats numbers with zero-padding and optional decimal precision.
 *
 * @param {number|number[]} num - Number or array to format.
 * @param {number} [left=0] - Minimum digits to the left of the decimal point.
 * @param {number} [right] - Digits to preserve to the right of the decimal point.
 *
 * @returns {string|string[]} Formatted value or array.
 */
function nf(num, left = 0, right = undefined) {
  const nums = Array.isArray(num) ? num : [num];
  const out = nums.map(n => {
    const neg = n < 0;
    let [intPart, decPart = ''] = Math.abs(n).toString().split('.');
    if (right !== undefined) {
      decPart = (decPart + '0'.repeat(right)).slice(0, right);
    }
    intPart = intPart.padStart(left, '0');
    let result = intPart + (right !== undefined && right > 0 ? '.' + decPart : '');
    return (neg ? '-' : '') + result;
  });
  return Array.isArray(num) ? out : out[0];
}
/**
 * Formats numbers with thousands separators.
 *
 * @param {number|number[]} num - Number or array to format.
 * @param {number} [right] - Digits to preserve after the decimal point.
 *
 * @returns {string|string[]} Comma-formatted value or array.
 */
function nfc(num, right) {
  const format = n => {
    const s = nf(n, 0, right);
    const [sign, rest] = s.startsWith('-') ? ['-', s.slice(1)] : ['', s];
    const [intPart, decPart] = rest.split('.');
    const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return sign + withCommas + (decPart !== undefined ? '.' + decPart : '');
  };
  return Array.isArray(num) ? num.map(format) : format(num);
}
/**
 * Formats numbers and prefixes nonnegative values with a plus sign.
 *
 * @param {number|number[]} num - Number or array to format.
 * @param {number} left - Minimum integer digits.
 * @param {number} right - Decimal digits.
 *
 * @returns {string|string[]} Formatted value or array.
 */
function nfp(num, left, right) {
  const format = n => (n >= 0 ? '+' : '') + nf(n, left, right);
  return Array.isArray(num) ? num.map(format) : format(num);
}
/**
 * Formats numbers and prefixes nonnegative values with a space.
 *
 * @param {number|number[]} num - Number or array to format.
 * @param {number} left - Minimum integer digits.
 * @param {number} right - Decimal digits.
 *
 * @returns {string|string[]} Formatted value or array.
 */
function nfs(num, left, right) {
  const format = n => (n >= 0 ? ' ' : '') + nf(n, left, right);
  return Array.isArray(num) ? num.map(format) : format(num);
}
/**
 * Randomly shuffles an array using the Fisher-Yates algorithm.
 *
 * @param {Array} arr - Array to shuffle.
 * @param {boolean} [modify=false] - Whether to mutate the input array.
 *
 * @returns {Array} Shuffled input array or shuffled copy.
 */
function shuffle(arr, modify = false) {
  const target = modify ? arr : arr.slice();
  for (let i = target.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [target[i], target[j]] = [target[j], target[i]];
  }
  return target;
}
/**
 * Splits text into nonempty tokens.
 *
 * @param {string} str - Text to split.
 * @param {string|RegExp} [delim=/\s+/] - Delimiter characters or regular expression.
 *
 * @returns {string[]} Nonempty tokens.
 */
function splitTokens(str, delim = /\s+/) {
  const parts = str.split(typeof delim === 'string' ? new RegExp(`[${delim.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&')}]`) : delim);
  return parts.filter(s => s.length > 0);
}

const defaultStorage = new Localstorage();

module.exports = {
  boolean, byte, char, float, hex, int, str, unchar, unhex,
  Localstorage,
  storeItem: (k, v) => defaultStorage.storeItem(k, v),
  getItem: k => defaultStorage.getItem(k),
  removeItem: k => defaultStorage.removeItem(k),
  clearStorage: () => defaultStorage.clearStorage(),
  nf, nfc, nfp, nfs, shuffle, splitTokens
};
