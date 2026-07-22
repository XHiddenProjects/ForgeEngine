"use strict";

const path = require("node:path");
const crypto = require("node:crypto");
const { Storage } = require("@ForgeEngine/utils");

const ACCOUNT_PATH = root => path.join(root, ".forge", "account.json");

const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map(v => v.trim())
      .filter(Boolean)
      .map(v => {
        const i = v.indexOf("=");
        return [decodeURIComponent(v.slice(0, i)), decodeURIComponent(v.slice(i + 1))];
      })
  );
}

function hashToken(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a || ""));
  const bufB = Buffer.from(String(b || ""));
  if (bufA.length !== bufB.length) {
    // Still run a comparison of equal length so failure isn't distinguishable by timing.
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS).toString("hex");
  return { salt, hash: derived };
}

function verifyPassword(password, record) {
  if (!record || !record.salt || !record.hash) return false;
  const derived = crypto.scryptSync(password, record.salt, SCRYPT_KEYLEN, SCRYPT_PARAMS).toString("hex");
  return timingSafeStringEqual(derived, record.hash);
}

function newSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function validateDisplayName(displayName) {
  const value = String(displayName || "").trim();
  if (!value || value.length > 40) throw httpError(400, "Display name must be 1 to 40 characters");
  return value;
}

function validatePassword(password) {
  const value = String(password || "");
  if (value.length < 8 || value.length > 256) throw httpError(400, "Password must be at least 8 characters");
  return value;
}

/**
 * The cookie attributes shared by every session cookie ForgeEngine sets.
 * Deliberately has NO `maxAge`/`expires`: that makes it a browser *session*
 * cookie, so it's discarded automatically when the browser session ends,
 * requiring the person to log back in next time.
 */
const SESSION_COOKIE = "forge_session";
const sessionCookieOptions = () => ({
  httpOnly: true,
  sameSite: "strict",
  secure: true,
  path: "/"
});

/** Reads the on-disk account record, or null if no account has been created yet. */
async function readAccount(root) {
  return Storage.readJSON(ACCOUNT_PATH(root), null);
}

/** Public-safe view of an account record (never includes password hash/session hash). */
function publicAccount(account) {
  return { id: account.id, displayName: account.displayName, createdAt: account.createdAt };
}

/**
 * Reports whether a local account has been created on this device yet, and
 * whether the current request already carries a valid session.
 */
async function accountStatus(root, req) {
  const account = await readAccount(root);
  if (!account) return { hasAccount: false, authenticated: false };

  const token = cookies(req.headers.cookie).forge_session;
  const authenticated = Boolean(token) && timingSafeStringEqual(hashToken(token), account.sessionHash || "");
  return { hasAccount: true, authenticated, displayName: account.displayName, createdAt: account.createdAt };
}

/**
 * First-run flow: creates the single local account for this device. Fails
 * if an account already exists (use login instead).
 */
async function registerAccount(root, { displayName, password }) {
  if (await readAccount(root)) throw httpError(409, "An account already exists on this device. Please log in.");

  const name = validateDisplayName(displayName);
  const pass = validatePassword(password);
  const token = newSessionToken();
  const now = new Date().toISOString();

  const account = {
    id: crypto.randomUUID(),
    displayName: name,
    password: hashPassword(pass),
    createdAt: now,
    updatedAt: now,
    sessionHash: hashToken(token)
  };

  await Storage.writeJSON(ACCOUNT_PATH(root), account);
  return { account: publicAccount(account), sessionToken: token };
}

/** Returning-user flow: verifies the password against the on-device account and issues a new session. */
async function loginAccount(root, { password }) {
  const account = await readAccount(root);
  if (!account) throw httpError(404, "No account exists on this device yet.");
  if (!verifyPassword(String(password || ""), account.password)) {
    throw httpError(401, "Incorrect password");
  }

  const token = newSessionToken();
  account.sessionHash = hashToken(token);
  account.updatedAt = new Date().toISOString();
  await Storage.writeJSON(ACCOUNT_PATH(root), account);
  return { account: publicAccount(account), sessionToken: token };
}

/** Invalidates the current session so the next request must log in again. */
async function logoutAccount(root) {
  const account = await readAccount(root);
  if (!account) return;
  account.sessionHash = crypto.randomBytes(32).toString("hex"); // unguessable, matches nothing
  account.updatedAt = new Date().toISOString();
  await Storage.writeJSON(ACCOUNT_PATH(root), account);
}

/** Settings-tab flow: verifies the current password, then sets a new one and re-issues the session. */
async function changePassword(root, { currentPassword, newPassword }) {
  const account = await readAccount(root);
  if (!account) throw httpError(404, "No account exists on this device yet.");
  if (!verifyPassword(String(currentPassword || ""), account.password)) {
    throw httpError(401, "Current password is incorrect");
  }

  const pass = validatePassword(newPassword);
  const token = newSessionToken();
  account.password = hashPassword(pass);
  account.sessionHash = hashToken(token);
  account.updatedAt = new Date().toISOString();
  await Storage.writeJSON(ACCOUNT_PATH(root), account);
  return { account: publicAccount(account), sessionToken: token };
}

/** Express middleware: requires a valid session cookie matching the on-device account. */
async function authenticateLocalRequest(root, req, res, next) {
  try {
    const token = cookies(req.headers.cookie).forge_session;
    if (!token) return res.status(401).json({ error: "Please log in" });

    const account = await readAccount(root);
    if (!account || !timingSafeStringEqual(hashToken(token), account.sessionHash || "")) {
      return res.status(401).json({ error: "Session expired, please log in again" });
    }

    req.localAccount = { id: account.id, displayName: account.displayName };
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  SESSION_COOKIE,
  sessionCookieOptions,
  accountStatus,
  registerAccount,
  loginAccount,
  logoutAccount,
  changePassword,
  authenticateLocalRequest
};