"use strict";

// Node-only utility (unlike the other Utils modules, this one touches the
// filesystem, so it isn't wrapped for browser usage). It gives the rest of
// ForgeEngine a single, safe way to persist data to the user's own device
// instead of ad-hoc `fs` calls scattered around the codebase or, worse,
// browser storage (localStorage/sessionStorage) which is off-limits.

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

/**
 * Reads and parses a JSON file from disk.
 *
 * @param {string} filePath - Absolute path to the JSON file.
 * @param {*} [fallback] - Value to return if the file does not exist. If
 *   omitted, a missing file rethrows the ENOENT error.
 * @returns {Promise<*>} The parsed JSON contents (or `fallback`).
 */
async function readJSON(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return fallback;
    throw error;
  }
}

/**
 * Writes an object to disk as pretty-printed JSON, atomically: the data is
 * written to a temp file in the same directory, then renamed into place, so
 * a crash or power loss mid-write can never leave a half-written/corrupt
 * file behind.
 *
 * @param {string} filePath - Absolute path to write to.
 * @param {*} data - JSON-serializable value to persist.
 * @param {{mode?: number}} [options] - `mode`: file permission bits (defaults to 0o600, owner read/write only).
 * @returns {Promise<void>}
 */
async function writeJSON(filePath, data, options = {}) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${crypto.randomBytes(6).toString("hex")}.tmp`);
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), { mode: options.mode ?? 0o600 });
  await fs.rename(tempPath, filePath);
}

/**
 * Checks whether a file exists on disk.
 *
 * @param {string} filePath - Absolute path to check.
 * @returns {Promise<boolean>}
 */
async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

module.exports = { readJSON, writeJSON, exists };
