"use strict";

const path = require("node:path");
const fs = require("node:fs/promises");

const TEMPLATES = new Set(["Blank Canvas", "2D Platformer", "Top Down"]);
function slugify(value) {
  return String(value).normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}
function httpError(status, message) { const error = new Error(message); error.status = status; return error; }
function gamePath(root, slug) {
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(slug)) throw httpError(400, "Invalid game identifier");
  return path.join(root, "games", slug);
}

function starterSource(name, template) {
  const extras = template === "2D Platformer" ? "\n  // Platformer movement and physics go here." : template === "Top Down" ? "\n  // Top-down movement and camera go here." : "";
  return `"use strict";\n\n// ${name}\nfunction startGame() {\n  console.log("Starting ${name}");${extras}\n}\n\nstartGame();\n`;
}

async function createGame(root, input) {
  const name = String(input.name || "").trim();
  const template = TEMPLATES.has(input.template) ? input.template : "Blank Canvas";
  if (!name || name.length > 64) throw httpError(400, "Game name must contain 1 to 64 characters");
  const base = slugify(name);
  if (!base) throw httpError(400, "Game name must contain letters or numbers");
  let slug = base, index = 2;
  while (true) { try { await fs.access(gamePath(root, slug)); slug = `${base.slice(0, 43)}-${index++}`; } catch (e) { if (e.code === "ENOENT") break; throw e; } }
  const dir = gamePath(root, slug);
  const now = new Date().toISOString();
  const config = { schemaVersion: 1, name, slug, template, createdAt: now, updatedAt: now,
    entry: "src/main.js", engine: { width: 1280, height: 720, background: "#101827" } };
  await fs.mkdir(path.join(dir, "src"), { recursive: true });
  await fs.mkdir(path.join(dir, "assets"), { recursive: true });
  await fs.mkdir(path.join(dir, "scenes"), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(dir, "game.config.json"), JSON.stringify(config, null, 2)),
    fs.writeFile(path.join(dir, "src", "main.js"), starterSource(name, template)),
    fs.writeFile(path.join(dir, "scenes", "main.scene.json"), JSON.stringify({ name: "Main", objects: [] }, null, 2)),
    fs.writeFile(path.join(dir, "assets", ".gitkeep"), "")
  ]);
  return config;
}

async function listGames(root) {
  await fs.mkdir(path.join(root, "games"), { recursive: true });
  const entries = await fs.readdir(path.join(root, "games"), { withFileTypes: true });
  const values = await Promise.all(entries.filter(e => e.isDirectory()).map(async e => {
    try { return JSON.parse(await fs.readFile(path.join(root, "games", e.name, "game.config.json"), "utf8")); } catch { return null; }
  }));
  return values.filter(Boolean).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function readGame(root, slug) {
  try {
    const dir = gamePath(root, slug);
    const [config, source, scene] = await Promise.all([
      fs.readFile(path.join(dir, "game.config.json"), "utf8"),
      fs.readFile(path.join(dir, "src", "main.js"), "utf8"),
      fs.readFile(path.join(dir, "scenes", "main.scene.json"), "utf8")
    ]);
    return { config: JSON.parse(config), files: { "src/main.js": source, "scenes/main.scene.json": scene } };
  } catch (error) { if (error.code === "ENOENT") throw httpError(404, "Game not found"); throw error; }
}

/**
 * Reads the real `assets/` folder on disk for every game, so the dashboard's
 * Asset Library section reflects actual files instead of being a dead tab.
 */
async function listAssets(root) {
  const games = await listGames(root);
  const perGame = await Promise.all(games.map(async game => {
    const dir = path.join(gamePath(root, game.slug), "assets");
    let files = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      files = entries.filter(e => e.isFile() && e.name !== ".gitkeep").map(e => e.name);
    } catch { /* no assets folder yet */ }
    return { slug: game.slug, name: game.name, files };
  }));
  return perGame;
}

const OBJECT_TYPES = new Set(["camera", "light", "sprite", "mesh", "group", "collider", "ui", "audio"]);

function sanitizeSceneObject(input) {
  const id = String(input?.id || "").trim().slice(0, 64);
  if (!id) return null;
  const num = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
  return {
    id,
    name: String(input?.name || "Game Object").slice(0, 64),
    type: OBJECT_TYPES.has(input?.type) ? input.type : "mesh",
    icon: String(input?.icon || "◇").slice(0, 4),
    parent: Boolean(input?.parent),
    indent: Math.max(0, Math.min(4, Math.round(num(input?.indent, 0)))),
    position: {
      x: num(input?.position?.x),
      y: num(input?.position?.y),
      z: num(input?.position?.z)
    }
  };
}

/**
 * Persists the editor's scene tree (name + objects) to `scenes/main.scene.json`
 * and bumps the game's `updatedAt` so the dashboard's "recently edited" and
 * sort-by-updated views reflect the save.
 */
async function saveScene(root, slug, input) {
  const dir = gamePath(root, slug);
  const configPath = path.join(dir, "game.config.json");
  let config;
  try { config = JSON.parse(await fs.readFile(configPath, "utf8")); }
  catch (error) { if (error.code === "ENOENT") throw httpError(404, "Game not found"); throw error; }

  if (!input || typeof input !== "object" || !Array.isArray(input.objects)) {
    throw httpError(400, "Scene must include an objects array");
  }
  if (input.objects.length > 500) throw httpError(400, "A scene can contain at most 500 objects");

  const scene = {
    name: String(input.name || "Main").trim().slice(0, 64) || "Main",
    objects: input.objects.map(sanitizeSceneObject).filter(Boolean)
  };

  await fs.writeFile(path.join(dir, "scenes", "main.scene.json"), JSON.stringify(scene, null, 2));
  config.updatedAt = new Date().toISOString();
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));

  return scene;
}

module.exports = { createGame, listGames, readGame, listAssets, saveScene };