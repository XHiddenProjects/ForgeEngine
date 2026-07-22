"use strict";

const path = require("node:path");
const fs = require("node:fs/promises");
const https = require("node:https");
const express = require("express");
const { createGame, listGames, readGame } = require("../src/game-manager");
const {
  SESSION_COOKIE,
  sessionCookieOptions,
  accountStatus,
  registerAccount,
  loginAccount,
  logoutAccount,
  authenticateLocalRequest
} = require("../src/account-manager");

const app = express();
const ROOT = path.resolve(__dirname, "..");
const CERTS_DIR = path.join(ROOT, "certs");
const TLS_KEY_FILE = process.env.TLS_KEY_FILE || "localhost-key.pem";
const TLS_CERT_FILE = process.env.TLS_CERT_FILE || "localhost.pem";
const TLS_CA_FILE = process.env.TLS_CA_FILE || "";
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || "127.0.0.1";

app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; script-src 'self'; script-src-attr 'none'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  next();
});

// Tells the dashboard whether an account exists on this device yet, and
// whether the current browser session is already logged in — the client
// uses this on every load to decide: create-account screen, login screen,
// or the dashboard itself.
app.get("/api/account/status", async (req, res, next) => {
  try { res.json(await accountStatus(ROOT, req)); }
  catch (error) { next(error); }
});

// First-run only: creates the single local account for this device.
app.post("/api/account/register", async (req, res, next) => {
  try {
    const { account, sessionToken } = await registerAccount(ROOT, req.body || {});
    res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions());
    res.status(201).json({ account });
  } catch (error) { next(error); }
});

// Returning users: verifies the password against the on-device account.
app.post("/api/account/login", async (req, res, next) => {
  try {
    const { account, sessionToken } = await loginAccount(ROOT, req.body || {});
    res.cookie(SESSION_COOKIE, sessionToken, sessionCookieOptions());
    res.status(200).json({ account });
  } catch (error) { next(error); }
});

app.post("/api/account/logout", async (req, res, next) => {
  try {
    await logoutAccount(ROOT);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    res.status(200).json({ ok: true });
  } catch (error) { next(error); }
});

// Everything else under /api requires an authenticated session.
app.use("/api", (req, res, next) => authenticateLocalRequest(ROOT, req, res, next));

app.get("/api/games", async (_req, res, next) => {
  try { res.json({ games: await listGames(ROOT) }); } catch (error) { next(error); }
});

app.post("/api/games", async (req, res, next) => {
  try {
    const game = await createGame(ROOT, req.body || {});
    res.status(201).json({ game, editorUrl: `/editor/?game=${encodeURIComponent(game.slug)}` });
  } catch (error) { next(error); }
});

app.get("/api/games/:slug", async (req, res, next) => {
  try { res.json({ game: await readGame(ROOT, req.params.slug) }); }
  catch (error) { next(error); }
});

app.use("/assets", express.static(path.join(ROOT, "assets"), { fallthrough: false }));
app.use("/editor", express.static(path.join(ROOT, "public", "editor")));
app.use(express.static(path.join(ROOT, "public")));

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: status >= 500 ? "Internal server error" : error.message });
});

async function loadTlsOptions() {
  const options = {
    key: await fs.readFile(path.join(CERTS_DIR, TLS_KEY_FILE)),
    cert: await fs.readFile(path.join(CERTS_DIR, TLS_CERT_FILE)),
    minVersion: "TLSv1.2"
  };
  if (TLS_CA_FILE) options.ca = await fs.readFile(path.join(CERTS_DIR, TLS_CA_FILE));
  return options;
}

async function startServer() {
  try {
    await fs.mkdir(path.join(ROOT, "games"), { recursive: true });
    const tlsOptions = await loadTlsOptions();
    https.createServer(tlsOptions, app).listen(PORT, HOST, () => {
      console.log(`ForgeEngine: https://${HOST}:${PORT}`);
    });
  } catch (error) {
    if (error && error.code === "ENOENT") {
      console.error(`HTTPS certificates were not found. Expected ${path.join(CERTS_DIR, TLS_KEY_FILE)} and ${path.join(CERTS_DIR, TLS_CERT_FILE)}.`);
    }
    console.error(error);
    process.exitCode = 1;
  }
}

startServer();
module.exports = app;
