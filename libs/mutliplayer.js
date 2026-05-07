import { Canvex } from "./canvex.js";
import { math } from "./math.js";
import { Helpers } from "./helpers.js";
import {
  MultiplayerHost,
  MultiplayerPeer,
  MultiplayerLocalHost,
  MultiplayerLocalPeer,
} from "./multiplayer-host.js";

class MultiplayerClient {
  static createHost(options = {}) {
    return new MultiplayerHost(options);
  }

  static createPeer(options = {}) {
    return new MultiplayerPeer(options);
  }

  static createLocalHost(options = {}) {
    return new MultiplayerLocalHost(options);
  }

  static createLocalPeer(options = {}) {
    return new MultiplayerLocalPeer(options);
  }
}

export const Multiplayer = class extends MultiplayerClient{

  // ─── Constants ────────────────────────────────────────────────────────────
  static MAX_PLAYERS   = 8;
  static MIN_PLAYERS   = 1;
  static STATE_WAITING = "waiting";
  static STATE_READY   = "ready";
  static STATE_PLAYING = "playing";
  static STATE_ENDED   = "ended";

  // ─── Constructor ──────────────────────────────────────────────────────────
  constructor(options = {}) {
    super();
    this.roomId       = options.roomId    ?? Helpers.generateId({prefix:"ROOM-",length:4});
    this.maxPlayers   = options.maxPlayers ?? Multiplayer.MAX_PLAYERS;
    this.hostId       = options.hostId    ?? null;
    this.state        = Multiplayer.STATE_WAITING;

    /** @type {Map<string, Player>} */
    this.players      = new Map();

    /** @type {Map<string, SharedData>} */
    this.shared       = new Map();

    this._listeners   = {};   // event bus
    this._tickRate    = options.tickRate ?? 60;
    this._tickTimer   = null;
  }

  // ─── Player Management ────────────────────────────────────────────────────

  /**
   * Add a player to the session.
   * @param {string} id   - Unique player ID
   * @param {object} meta - Display name, avatar, etc.
   * @returns {Player|null}
   */
  addPlayer(id, meta = {}) {
    if (this.isFull()) {
      console.warn(`[Multiplayer] Room ${this.roomId} is full.`);
      return null;
    }
    if (this.hasPlayer(id)) {
      console.warn(`[Multiplayer] Player "${id}" is already in the room.`);
      return null;
    }

    const player = {
      id,
      name:      meta.name     ?? `Player ${this.playerCount + 1}`,
      avatar:    meta.avatar   ?? null,
      score:     0,
      ready:     false,
      connected: true,
      joinedAt:  Date.now(),
      data:      {},           // arbitrary per-player payload
    };

    this.players.set(id, player);

    // First player becomes host automatically
    if (!this.hostId) this.hostId = id;

    this._emit("playerJoined", { player, playerCount: this.playerCount });
    return player;
  }

  /**
   * Remove a player from the session.
   * @param {string} id
   * @returns {boolean}
   */
  removePlayer(id) {
    if (!this.hasPlayer(id)) return false;

    const player = this.players.get(id);
    this.players.delete(id);

    // Re-assign host if the host left
    if (this.hostId === id) {
      this.hostId = this.players.size > 0
        ? this.players.keys().next().value
        : null;
      if (this.hostId) this._emit("hostChanged", { newHostId: this.hostId });
    }

    this._emit("playerLeft", { player, playerCount: this.playerCount });

    // End the game if not enough players remain
    if (this.state === Multiplayer.STATE_PLAYING && this.playerCount < Multiplayer.MIN_PLAYERS) {
      this.endGame();
    }

    return true;
  }

  /**
   * Mark a player as disconnected (keeps their slot).
   * @param {string} id
   */
  disconnectPlayer(id) {
    const player = this.getPlayer(id);
    if (!player) return;
    player.connected = false;
    this._emit("playerDisconnected", { player });
  }

  /**
   * Reconnect a previously disconnected player.
   * @param {string} id
   */
  reconnectPlayer(id) {
    const player = this.getPlayer(id);
    if (!player) return;
    player.connected = true;
    this._emit("playerReconnected", { player });
  }

  // ─── Player Queries ───────────────────────────────────────────────────────

  /** @returns {number} */
  get playerCount()       { return this.players.size; }

  /** @returns {boolean} */
  isFull()                { return this.playerCount >= this.maxPlayers; }

  /** @returns {boolean} */
  isEmpty()               { return this.playerCount === 0; }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  hasPlayer(id)           { return this.players.has(id); }

  /**
   * @param {string} id
   * @returns {Player|undefined}
   */
  getPlayer(id)           { return this.players.get(id); }

  /** @returns {Player[]} */
  getPlayers()            { return [...this.players.values()]; }

  /** @returns {Player[]} */
  getConnectedPlayers()   { return this.getPlayers().filter(p => p.connected); }

  /** @returns {Player[]} */
  getReadyPlayers()       { return this.getPlayers().filter(p => p.ready); }

  /** @returns {boolean} */
  allPlayersReady()       { return this.playerCount > 0 && this.getReadyPlayers().length === this.playerCount; }

  /**
   * Check whether a specific player is the host.
   * @param {string} id
   * @returns {boolean}
   */
  isHost(id)              { return this.hostId === id; }

  // ─── Ready System ─────────────────────────────────────────────────────────

  /**
   * Toggle or set a player's ready state.
   * @param {string}  id
   * @param {boolean} [value]
   */
  setReady(id, value) {
    const player = this.getPlayer(id);
    if (!player) return;
    player.ready = value !== undefined ? Boolean(value) : !player.ready;
    this._emit("playerReadyChanged", { player });

    if (this.allPlayersReady()) this._emit("allReady", { players: this.getPlayers() });
  }

  // ─── Shared State ─────────────────────────────────────────────────────────

  /**
   * Write a value into shared state.
   * @param {string} key
   * @param {*}      value
   * @param {string} [authorId]  - Who wrote this
   */
  setShared(key, value, authorId = null) {
    const entry = {
      key,
      value,
      authorId,
      updatedAt: Date.now(),
    };
    this.shared.set(key, entry);
    this._emit("sharedUpdated", { key, value, authorId });
  }

  /**
   * Read a value from shared state.
   * @param {string} key
   * @param {*}      [fallback]
   * @returns {*}
   */
  getShared(key, fallback = undefined) {
    return this.shared.has(key) ? this.shared.get(key).value : fallback;
  }

  /**
   * Delete a key from shared state.
   * @param {string} key
   */
  deleteShared(key) {
    this.shared.delete(key);
    this._emit("sharedDeleted", { key });
  }

  /** @returns {object} Plain snapshot of all shared entries */
  getSharedSnapshot() {
    const out = {};
    this.shared.forEach((entry, key) => { out[key] = entry.value; });
    return out;
  }

  // ─── Per-Player Data ──────────────────────────────────────────────────────

  /**
   * Set arbitrary data on a player object.
   * @param {string} playerId
   * @param {string} key
   * @param {*}      value
   */
  setPlayerData(playerId, key, value) {
    const player = this.getPlayer(playerId);
    if (!player) return;
    player.data[key] = value;
    this._emit("playerDataUpdated", { player, key, value });
  }

  /**
   * @param {string} playerId
   * @param {string} key
   * @param {*}      [fallback]
   * @returns {*}
   */
  getPlayerData(playerId, key, fallback = undefined) {
    const player = this.getPlayer(playerId);
    return player ? (player.data[key] ?? fallback) : fallback;
  }

  // ─── Scores ───────────────────────────────────────────────────────────────

  /**
   * Add (or subtract) points for a player.
   * @param {string} id
   * @param {number} delta
   */
  addScore(id, delta) {
    const player = this.getPlayer(id);
    if (!player) return;
    player.score = Helpers.clamp(player.score + delta, 0, Infinity);
    this._emit("scoreUpdated", { player, delta });
  }

  /**
   * Set a player's score directly.
   * @param {string} id
   * @param {number} value
   */
  setScore(id, value) {
    const player = this.getPlayer(id);
    if (!player) return;
    player.score = value;
    this._emit("scoreUpdated", { player, delta: 0 });
  }

  /** @returns {Player[]} Players sorted by score descending */
  getLeaderboard() {
    return this.getPlayers().sort((a, b) => b.score - a.score);
  }

  // ─── Game Lifecycle ───────────────────────────────────────────────────────

  /**
   * Transition the room to the "ready" lobby state.
   * @param {string} [requesterId]  - Must be host
   */
  setStateReady(requesterId) {
    if (!this._assertHost(requesterId)) return;
    this.state = Multiplayer.STATE_READY;
    this._emit("stateChanged", { state: this.state });
  }

  /**
   * Start the game (host only, all players must be ready).
   * @param {string} [requesterId]
   */
  startGame(requesterId) {
    if (!this._assertHost(requesterId)) return;
    if (!this.allPlayersReady()) {
      console.warn("[Multiplayer] Cannot start – not all players are ready.");
      return;
    }
    this.state = Multiplayer.STATE_PLAYING;
    this._startTick();
    this._emit("gameStarted", { players: this.getPlayers() });
    this._emit("stateChanged",  { state: this.state });
  }

  /**
   * End the game.
   * @param {string} [requesterId]
   */
  endGame(requesterId) {
    if (requesterId && !this._assertHost(requesterId)) return;
    this.state = Multiplayer.STATE_ENDED;
    this._stopTick();
    this._emit("gameEnded",   { leaderboard: this.getLeaderboard() });
    this._emit("stateChanged", { state: this.state });
  }

  /**
   * Reset the room back to the waiting state, clearing scores & ready flags.
   * @param {string} [requesterId]
   */
  resetRoom(requesterId) {
    if (!this._assertHost(requesterId)) return;
    this.players.forEach(p => { p.score = 0; p.ready = false; });
    this.shared.clear();
    this.state = Multiplayer.STATE_WAITING;
    this._stopTick();
    this._emit("roomReset", {});
    this._emit("stateChanged", { state: this.state });
  }

  // ─── Tick / Update Loop ───────────────────────────────────────────────────

  _startTick() {
    if (this._tickTimer) return;
    const interval = Math.round(1000 / this._tickRate);
    this._tickTimer = setInterval(() => this._tick(), interval);
  }

  _stopTick() {
    if (this._tickTimer) {
      clearInterval(this._tickTimer);
      this._tickTimer = null;
    }
  }

  _tick() {
    this._emit("tick", {
      state:       this.state,
      playerCount: this.playerCount,
      shared:      this.getSharedSnapshot(),
    });
  }

  // ─── Event Bus ────────────────────────────────────────────────────────────

  /**
   * Subscribe to a multiplayer event.
   * @param {string}   event
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from a multiplayer event.
   * @param {string}   event
   * @param {Function} callback
   */
  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
  }

  /**
   * Subscribe to an event exactly once.
   * @param {string}   event
   * @param {Function} callback
   */
  once(event, callback) {
    const unsub = this.on(event, (...args) => { callback(...args); unsub(); });
  }

  _emit(event, data) {
    (this._listeners[event] || []).forEach(cb => cb(data));
  }

  // ─── Serialisation ────────────────────────────────────────────────────────

  /** Serialise room state to a plain JSON-safe object. */
  toJSON() {
    return {
      roomId:      this.roomId,
      state:       this.state,
      hostId:      this.hostId,
      maxPlayers:  this.maxPlayers,
      playerCount: this.playerCount,
      players:     this.getPlayers(),
      shared:      this.getSharedSnapshot(),
    };
  }

  /**
   * Restore room state from a plain object (e.g. from server sync).
   * @param {object} json
   */
  fromJSON(json) {
    this.roomId     = json.roomId     ?? this.roomId;
    this.state      = json.state      ?? this.state;
    this.hostId     = json.hostId     ?? this.hostId;
    this.maxPlayers = json.maxPlayers ?? this.maxPlayers;

    this.players.clear();
    (json.players ?? []).forEach(p => this.players.set(p.id, p));

    this.shared.clear();
    Object.entries(json.shared ?? {}).forEach(([k, v]) => {
      this.shared.set(k, { key: k, value: v, authorId: null, updatedAt: Date.now() });
    });

    this._emit("synced", this.toJSON());
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  _assertHost(requesterId) {
    if (!requesterId) return true;          // no auth – allow
    if (this.isHost(requesterId)) return true;
    console.warn(`[Multiplayer] Action denied – "${requesterId}" is not the host.`);
    return false;
  }

  /** Human-readable summary for debugging. */
  toString() {
    return `[Multiplayer room=${this.roomId} state=${this.state} players=${this.playerCount}/${this.maxPlayers}]`;
  }
};