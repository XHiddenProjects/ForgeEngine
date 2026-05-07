/**
 * multiplayer-host.js
 * ─────────────────────────────────────────────────────────────────────────────
 *  Pure vanilla JS peer-to-peer multiplayer using WebRTC DataChannels.
 *  No Node.js, no npm, no external dependencies.
 *
 *  How it works:
 *    • One device creates a MultiplayerHost  → becomes the "server"
 *    • Other devices create MultiplayerPeer  → connect to the host
 *    • Signaling (offer/answer/ICE) is done via a FREE public signaling
 *      service (PeerJS cloud) or your own signaling channel (copy-paste,
 *      QR code, BroadcastChannel for same-browser tabs, etc.)
 *    • Once connected, all data flows over WebRTC DataChannels (no server).
 *
 *  Usage – Host device:
 *    const host = new MultiplayerHost({ playerId: "alice", roomId: "room_01" });
 *    await host.open();
 *    host.on("playerJoined", ({ player }) => console.log(player.name, "joined"));
 *    host.sendShared("level", 3);
 *
 *  Usage – Joining device:
 *    const peer = new MultiplayerPeer({ playerId: "bob" });
 *    await peer.join("room_01");          // connects to the host
 *    peer.on("sync",  (room) => console.log("got room", room));
 *    peer.sendShared("position", { x: 5, y: 9 });
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { Multiplayer } from "./mutliplayer.js";

// ─── Shared constants ─────────────────────────────────────────────────────────
const SIGNAL_SERVER = "https://0.peerjs.com";   // PeerJS free signaling cloud
const ICE_SERVERS   = [{ urls: "stun:stun.l.google.com:19302" }];

const MSG = Object.freeze({
  PING:          "ping",
  PONG:          "pong",
  SYNC:          "room:sync",
  PLAYER_JOINED: "player:joined",
  PLAYER_LEFT:   "player:left",
  PLAYER_READY:  "player:ready",
  PLAYER_DATA:   "player:data",
  SCORE:         "player:score",
  HOST_CHANGED:  "host:changed",
  SHARED_SET:    "shared:set",
  SHARED_DEL:    "shared:delete",
  GAME_START:    "game:start",
  GAME_STARTED:  "game:started",
  GAME_END:      "game:end",
  GAME_ENDED:    "game:ended",
  GAME_RESET:    "game:reset",
  CUSTOM:        "custom",
});

// ─── EventEmitter mixin ───────────────────────────────────────────────────────
class EventEmitter {
  constructor() { this._listeners = {}; }
  on(e, cb)    { (this._listeners[e] ??= []).push(cb); return () => this.off(e, cb); }
  off(e, cb)   { this._listeners[e] = (this._listeners[e] ?? []).filter(f => f !== cb); }
  once(e, cb)  { const u = this.on(e, (...a) => { cb(...a); u(); }); }
  emit(e, d)   { (this._listeners[e] ?? []).forEach(cb => cb(d)); }
}

// ─────────────────────────────────────────────────────────────────────────────
//  MultiplayerHost
//  Run on the device that "owns" the room. Acts as the authoritative state.
// ─────────────────────────────────────────────────────────────────────────────
export class MultiplayerHost extends EventEmitter {

  /**
   * @param {object}  opts
   * @param {string}  opts.playerId       Host's own player ID
   * @param {string}  [opts.roomId]       Room code (auto-generated if omitted)
   * @param {object}  [opts.playerMeta]   Host player meta { name, avatar }
   * @param {number}  [opts.maxPlayers]   Default 8
   * @param {number}  [opts.tickRate]     State-sync broadcast rate (default 20/s)
   */
  constructor(opts = {}) {
    super();
    this.playerId   = opts.playerId   ?? _uuid();
    this.roomId     = opts.roomId     ?? _roomCode();
    this.playerMeta = opts.playerMeta ?? {};
    this.tickRate   = opts.tickRate   ?? 20;

    this.multiplayer = new Multiplayer({
      roomId:     this.roomId,
      maxPlayers: opts.maxPlayers ?? 8,
      hostId:     this.playerId,
    });

    // Add host as first player
    this.multiplayer.addPlayer(this.playerId, this.playerMeta);

    /** @type {Map<string, RTCPeerConnection>}  peerId → RTCPeerConnection */
    this._pcs = new Map();

    /** @type {Map<string, RTCDataChannel>}     peerId → DataChannel */
    this._channels = new Map();

    this._signaling = null;   // PeerJS-compatible signaling handle
    this._tickTimer = null;
    this._open      = false;
  }

  // ─── Open the host ────────────────────────────────────────────────────────

  /**
   * Start listening for peer connections.
   * Returns the roomId that peers should pass to peer.join(roomId).
   * @returns {Promise<string>} roomId
   */
  async open() {
    this._signaling = await _createSignalingPeer(this.roomId);

    this._signaling.on("connection", (dataConn) => {
      this._handleIncomingConnection(dataConn);
    });

    this._open = true;
    this._startTick();
    this.emit("open", { roomId: this.roomId });
    console.log(`[MultiplayerHost] Room "${this.roomId}" open – share this code with players.`);
    return this.roomId;
  }

  /** Gracefully close the host room. */
  close() {
    this._stopTick();
    this._broadcast({ type: MSG.GAME_ENDED, reason: "host_closed" });
    this._pcs.forEach(pc => pc.close());
    this._pcs.clear();
    this._channels.clear();
    this._signaling?.destroy();
    this._open = false;
    this.emit("closed", {});
  }

  // ─── Incoming peer connection (via signaling) ─────────────────────────────

  _handleIncomingConnection(dataConn) {
    const peerId = dataConn.peer;

    dataConn.on("open", () => {
      this._channels.set(peerId, dataConn);
      // Send full room snapshot to the new joiner
      this._sendTo(peerId, { type: MSG.SYNC, room: _roomSnapshot(this.multiplayer) });
    });

    dataConn.on("data", (raw) => {
      try { this._handleMessage(JSON.parse(raw), peerId); }
      catch { /* ignore malformed */ }
    });

    dataConn.on("close", () => {
      this._channels.delete(peerId);
      this._pcs.delete(peerId);
      // Find which playerId this peer maps to
      const player = [...this.multiplayer.players.values()].find(p => p._peerId === peerId);
      if (player) {
        this.multiplayer.disconnectPlayer(player.id);
        this._broadcast({ type: MSG.PLAYER_LEFT, playerId: player.id });
        this.emit("playerLeft", { player });
      }
    });

    dataConn.on("error", (err) => {
      console.warn("[MultiplayerHost] DataChannel error:", err);
    });
  }

  // ─── Message dispatcher ───────────────────────────────────────────────────

  _handleMessage(msg, fromPeerId) {
    const mp = this.multiplayer;

    switch (msg.type) {

      case MSG.PING:
        this._sendTo(fromPeerId, { type: MSG.PONG, serverTime: Date.now() });
        break;

      // A peer tells us who they are on join
      case MSG.PLAYER_JOINED: {
        if (mp.isFull()) {
          this._sendTo(fromPeerId, { type: "error", code: "room_full" });
          return;
        }
        const player = mp.addPlayer(msg.player.id, msg.player);
        if (player) {
          player._peerId = fromPeerId;   // internal link
          this._broadcast({ type: MSG.PLAYER_JOINED, player }, fromPeerId);
          this._sendTo(fromPeerId, { type: MSG.SYNC, room: _roomSnapshot(mp) });
          this.emit("playerJoined", { player });
        }
        break;
      }

      case MSG.PLAYER_READY:
        mp.setReady(msg.playerId, msg.value);
        this._broadcast({ type: MSG.PLAYER_READY, playerId: msg.playerId, value: msg.value }, fromPeerId);
        this.emit("playerReadyChanged", { playerId: msg.playerId, value: msg.value });
        break;

      case MSG.PLAYER_DATA:
        mp.setPlayerData(msg.playerId, msg.key, msg.value);
        this._broadcast({ type: MSG.PLAYER_DATA, playerId: msg.playerId, key: msg.key, value: msg.value }, fromPeerId);
        this.emit("playerDataUpdated", { playerId: msg.playerId, key: msg.key, value: msg.value });
        break;

      case MSG.SHARED_SET:
        mp.setShared(msg.key, msg.value, msg.authorId);
        this._broadcast({ type: MSG.SHARED_SET, key: msg.key, value: msg.value, authorId: msg.authorId }, fromPeerId);
        this.emit("sharedUpdated", { key: msg.key, value: msg.value });
        break;

      case MSG.SHARED_DEL:
        mp.deleteShared(msg.key);
        this._broadcast({ type: MSG.SHARED_DEL, key: msg.key }, fromPeerId);
        this.emit("sharedDeleted", { key: msg.key });
        break;

      case MSG.GAME_START:
        if (msg.requesterId !== this.playerId) break;
        mp.startGame(this.playerId);
        this._broadcast({ type: MSG.GAME_STARTED, players: mp.getPlayers() });
        this.emit("gameStarted", {});
        break;

      case MSG.GAME_END:
        mp.endGame(this.playerId);
        this._broadcast({ type: MSG.GAME_ENDED, leaderboard: mp.getLeaderboard() });
        this.emit("gameEnded", { leaderboard: mp.getLeaderboard() });
        break;

      case MSG.GAME_RESET:
        if (msg.requesterId !== this.playerId) break;
        mp.resetRoom(this.playerId);
        this._broadcast({ type: MSG.GAME_RESET });
        this.emit("roomReset", {});
        break;

      case MSG.CUSTOM:
        this._broadcast({ type: MSG.CUSTOM, event: msg.event, payload: msg.payload, from: msg.from }, fromPeerId);
        this.emit("custom:" + msg.event, { payload: msg.payload, from: msg.from });
        this.emit("custom", { event: msg.event, payload: msg.payload, from: msg.from });
        break;

      case MSG.SCORE:
        mp.setScore(msg.playerId, msg.score);
        this._broadcast({ type: MSG.SCORE, playerId: msg.playerId, score: msg.score }, fromPeerId);
        this.emit("scoreUpdated", { playerId: msg.playerId, score: msg.score });
        break;
    }
  }

  // ─── Host-side outbound actions ───────────────────────────────────────────

  /** Write shared state (host authority). */
  sendShared(key, value) {
    this.multiplayer.setShared(key, value, this.playerId);
    this._broadcast({ type: MSG.SHARED_SET, key, value, authorId: this.playerId });
  }

  /** Delete shared state. */
  deleteShared(key) {
    this.multiplayer.deleteShared(key);
    this._broadcast({ type: MSG.SHARED_DEL, key });
  }

  /** Start the game. */
  startGame() {
    this._handleMessage({ type: MSG.GAME_START, requesterId: this.playerId }, null);
  }

  /** End the game. */
  endGame() {
    this._handleMessage({ type: MSG.GAME_END, requesterId: this.playerId }, null);
  }

  /** Reset the room. */
  resetRoom() {
    this._handleMessage({ type: MSG.GAME_RESET, requesterId: this.playerId }, null);
  }

  /** Send a custom event to all peers. */
  sendCustom(event, payload = {}) {
    this._broadcast({ type: MSG.CUSTOM, event, payload, from: this.playerId });
    this.emit("custom:" + event, { payload, from: this.playerId });
  }

  /** Adjust a player's score (host only). */
  setScore(playerId, score) {
    this.multiplayer.setScore(playerId, score);
    this._broadcast({ type: MSG.SCORE, playerId, score });
  }

  // ─── Tick – periodic state sync ───────────────────────────────────────────

  _startTick() {
    const ms = Math.round(1000 / this.tickRate);
    this._tickTimer = setInterval(() => {
      this._broadcast({ type: MSG.SYNC, room: _roomSnapshot(this.multiplayer) });
      this.emit("tick", _roomSnapshot(this.multiplayer));
    }, ms);
  }

  _stopTick() {
    clearInterval(this._tickTimer);
    this._tickTimer = null;
  }

  // ─── DataChannel helpers ──────────────────────────────────────────────────

  _sendTo(peerId, msg) {
    const ch = this._channels.get(peerId);
    if (ch?.readyState === "open") ch.send(JSON.stringify(msg));
  }

  _broadcast(msg, excludePeerId = null) {
    const payload = JSON.stringify(msg);
    this._channels.forEach((ch, pid) => {
      if (pid === excludePeerId) return;
      if (ch?.readyState === "open") ch.send(payload);
    });
  }

  get playerCount() { return this.multiplayer.playerCount; }
  toString() { return `[MultiplayerHost room=${this.roomId} players=${this.playerCount}]`; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  MultiplayerPeer
//  Run on every non-host device.
// ─────────────────────────────────────────────────────────────────────────────
export class MultiplayerPeer extends EventEmitter {

  /**
   * @param {object}  opts
   * @param {string}  opts.playerId         This device's player ID
   * @param {object}  [opts.playerMeta]     name, avatar, …
   * @param {number}  [opts.pingInterval]   ms (default 10 000)
   * @param {number}  [opts.reconnectDelay] ms (default 3 000)
   * @param {number}  [opts.maxReconnects]  (default 8)
   */
  constructor(opts = {}) {
    super();
    this.playerId       = opts.playerId   ?? _uuid();
    this.playerMeta     = opts.playerMeta ?? {};
    this._pingInterval  = opts.pingInterval  ?? 10_000;
    this._reconnectDelay= opts.reconnectDelay ?? 3_000;
    this._maxReconnects = opts.maxReconnects  ?? 8;

    this.roomId      = null;
    this.multiplayer = null;
    this._conn       = null;   // PeerJS DataConnection to host
    this._peer       = null;   // local PeerJS Peer
    this._pingTimer  = null;
    this._reconnects = 0;
    this._queue      = [];     // outbound queue before channel open
    this._connected  = false;
  }

  // ─── Join a room ──────────────────────────────────────────────────────────

  /**
   * Connect to a host's room.
   * @param {string} roomId   The roomId shared by the host
   * @returns {Promise<Multiplayer>}
   */
  async join(roomId) {
    this.roomId = roomId;
    this.emit("statusChanged", { status: "connecting" });

    this._peer = await _createSignalingPeer(this.playerId);
    this._conn = this._peer.connect(roomId, { reliable: true });

    return new Promise((resolve, reject) => {
      this._conn.on("open", () => {
        this._connected = true;
        this._reconnects = 0;
        // Introduce ourselves to the host
        this._send({ type: MSG.PLAYER_JOINED, player: { id: this.playerId, ...this.playerMeta } });
        this._startPing();
        this._flushQueue();
        this.emit("statusChanged", { status: "connected" });
      });

      this._conn.on("data", (raw) => {
        try {
          const msg = JSON.parse(raw);
          this._handleMessage(msg);
          // Resolve promise on first sync
          if (msg.type === MSG.SYNC && !this.multiplayer) {
            this.multiplayer = new Multiplayer({ roomId });
            this.multiplayer.fromJSON(msg.room);
            resolve(this.multiplayer);
          }
        } catch { /* ignore malformed */ }
      });

      this._conn.on("close", () => {
        this._connected = false;
        this._stopPing();
        this._scheduleReconnect();
      });

      this._conn.on("error", (err) => {
        console.warn("[MultiplayerPeer] DataChannel error:", err);
        reject(err);
      });
    });
  }

  /** Disconnect from the room. */
  leave() {
    this._stopPing();
    this._conn?.close();
    this._peer?.destroy();
    this._connected = false;
    this.emit("statusChanged", { status: "disconnected" });
  }

  // ─── Message handler ──────────────────────────────────────────────────────

  _handleMessage(msg) {
    const mp = this.multiplayer;

    switch (msg.type) {

      case MSG.SYNC:
        if (mp) mp.fromJSON(msg.room);
        this.emit("sync", msg.room);
        break;

      case MSG.PLAYER_JOINED:
        mp?.addPlayer(msg.player.id, msg.player);
        this.emit("playerJoined", { player: msg.player });
        break;

      case MSG.PLAYER_LEFT:
        mp?.removePlayer(msg.playerId);
        this.emit("playerLeft", { playerId: msg.playerId });
        break;

      case MSG.PLAYER_READY:
        mp?.setReady(msg.playerId, msg.value);
        this.emit("playerReadyChanged", { playerId: msg.playerId, value: msg.value });
        break;

      case MSG.PLAYER_DATA:
        mp?.setPlayerData(msg.playerId, msg.key, msg.value);
        this.emit("playerDataUpdated", { playerId: msg.playerId, key: msg.key, value: msg.value });
        break;

      case MSG.SHARED_SET:
        mp?.setShared(msg.key, msg.value, msg.authorId);
        this.emit("sharedUpdated", { key: msg.key, value: msg.value });
        break;

      case MSG.SHARED_DEL:
        mp?.deleteShared(msg.key);
        this.emit("sharedDeleted", { key: msg.key });
        break;

      case MSG.GAME_STARTED:
        if (mp) mp.state = Multiplayer.STATE_PLAYING;
        this.emit("gameStarted", { players: mp?.getPlayers() });
        break;

      case MSG.GAME_ENDED:
        if (mp) mp.state = Multiplayer.STATE_ENDED;
        this.emit("gameEnded", { leaderboard: msg.leaderboard });
        break;

      case MSG.GAME_RESET:
        mp?.resetRoom();
        this.emit("roomReset", {});
        break;

      case MSG.SCORE:
        mp?.setScore(msg.playerId, msg.score);
        this.emit("scoreUpdated", { playerId: msg.playerId, score: msg.score });
        break;

      case MSG.CUSTOM:
        this.emit("custom:" + msg.event, { payload: msg.payload, from: msg.from });
        this.emit("custom", { event: msg.event, payload: msg.payload, from: msg.from });
        break;

      case MSG.PONG:
        this.emit("pong", { serverTime: msg.serverTime });
        break;

      case "error":
        this.emit("error", { code: msg.code });
        break;
    }
  }

  // ─── Outbound actions (forwarded to host) ─────────────────────────────────

  sendShared(key, value) {
    this._send({ type: MSG.SHARED_SET, key, value, authorId: this.playerId });
    this.multiplayer?.setShared(key, value, this.playerId);
  }

  deleteShared(key) {
    this._send({ type: MSG.SHARED_DEL, key });
  }

  sendPlayerData(key, value) {
    this._send({ type: MSG.PLAYER_DATA, playerId: this.playerId, key, value });
    this.multiplayer?.setPlayerData(this.playerId, key, value);
  }

  sendReady(value) {
    this._send({ type: MSG.PLAYER_READY, playerId: this.playerId, value });
    this.multiplayer?.setReady(this.playerId, value);
  }

  sendCustom(event, payload = {}) {
    this._send({ type: MSG.CUSTOM, event, payload, from: this.playerId });
  }

  // ─── Reconnection ─────────────────────────────────────────────────────────

  _scheduleReconnect() {
    if (this._reconnects >= this._maxReconnects) {
      this.emit("statusChanged", { status: "disconnected" });
      this.emit("disconnected", { reason: "max_reconnects" });
      return;
    }
    this._reconnects++;
    const delay = Math.min(this._reconnectDelay * this._reconnects, 30_000);
    this.emit("statusChanged", { status: "reconnecting", attempt: this._reconnects });
    setTimeout(() => this.join(this.roomId), delay);
  }

  // ─── Ping ─────────────────────────────────────────────────────────────────

  _startPing() {
    this._pingTimer = setInterval(() => {
      this._send({ type: MSG.PING });
    }, this._pingInterval);
  }

  _stopPing() {
    clearInterval(this._pingTimer);
    this._pingTimer = null;
  }

  // ─── DataChannel helpers ──────────────────────────────────────────────────

  _send(msg) {
    if (!this._connected || this._conn?.peerConnection?.connectionState !== "connected") {
      this._queue.push(msg);
      return;
    }
    try { this._conn.send(JSON.stringify(msg)); }
    catch { this._queue.push(msg); }
  }

  _flushQueue() {
    while (this._queue.length) this._send(this._queue.shift());
  }

  toString() { return `[MultiplayerPeer player=${this.playerId} room=${this.roomId}]`; }
}

// ─────────────────────────────────────────────────────────────────────────────
//  BroadcastChannel backend (same-device / same-browser tab testing)
//  Drop-in replacement that works without any network at all.
//  Useful for local testing before deploying with WebRTC.
// ─────────────────────────────────────────────────────────────────────────────

export class MultiplayerLocalHost extends MultiplayerHost {
  async open() {
    // Two channels:
    //   mp_up_{roomId}   — peers → host  (host reads this)
    //   mp_dn_{roomId}   — host → peers  (peers read this)
    this._bcUp = new BroadcastChannel(`mp_up_${this.roomId}`);
    this._bcDn = new BroadcastChannel(`mp_dn_${this.roomId}`);

    this._bcUp.onmessage = ({ data }) => {
      try {
        const msg = JSON.parse(data);
        this._handleMessage(msg, msg._from);
      } catch { /* ignore */ }
    };

    this._open = true;
    this._startTick();
    this.emit("open", { roomId: this.roomId });
    return this.roomId;
  }

  close() {
    super.close();
    this._bcUp?.close();
    this._bcDn?.close();
  }

  // Send to one specific peer by including their id in the message
  _sendTo(peerId, msg) {
    this._bcDn?.postMessage(JSON.stringify({ ...msg, _to: peerId }));
  }

  // Broadcast to all peers (optionally skip one sender)
  _broadcast(msg, excludePeerId = null) {
    this._bcDn?.postMessage(JSON.stringify({ ...msg, _to: "peers", _exclude: excludePeerId }));
  }
}

export class MultiplayerLocalPeer extends MultiplayerPeer {
  async join(roomId) {
    this.roomId  = roomId;

    // Mirror of the host's two channels (reversed direction)
    this._bcUp = new BroadcastChannel(`mp_up_${roomId}`);  // peer writes → host
    this._bcDn = new BroadcastChannel(`mp_dn_${roomId}`);  // peer reads  ← host

    // Listen BEFORE sending the join message to avoid the race condition
    this._bcDn.onmessage = ({ data }) => {
      try {
        const msg = JSON.parse(data);
        // Accept broadcast-to-all OR messages addressed directly to this peer
        if (msg._to === "peers" && msg._exclude !== this.playerId) this._handleMessage(msg);
        else if (msg._to === this.playerId) this._handleMessage(msg);
      } catch { /* ignore */ }
    };

    this._connected = true;

    // Small defer so the onmessage handler is fully registered before the host
    // processes the join and fires its sync reply
    await new Promise(r => setTimeout(r, 0));

    // Tell host we're joining
    this._bcUp.postMessage(JSON.stringify({
      type:   MSG.PLAYER_JOINED,
      player: { id: this.playerId, ...this.playerMeta },
      _from:  this.playerId,
    }));

    return new Promise((resolve) => {
      this.once("sync", (room) => {
        if (!this.multiplayer) {
          this.multiplayer = new Multiplayer({ roomId });
        }
        this.multiplayer.fromJSON(room);
        this.emit("statusChanged", { status: "connected" });
        resolve(this.multiplayer);
      });
    });
  }

  leave() {
    this._bcUp?.close();
    this._bcDn?.close();
    this._connected = false;
    this.emit("statusChanged", { status: "disconnected" });
  }

  _send(msg) {
    this._bcUp?.postMessage(JSON.stringify({ ...msg, _from: this.playerId }));
  }
}

// ─── Private utilities ────────────────────────────────────────────────────────

/**
 * Create a PeerJS-compatible peer using the browser's native fetch + WebSocket.
 * This is a lightweight wrapper — no PeerJS library required.
 * Uses PeerJS's public REST + WebSocket signaling protocol.
 */
async function _createSignalingPeer(peerId) {
  // Dynamically load PeerJS from CDN (only ~45 KB, no build step needed)
  if (!window.Peer) {
    await _loadScript("https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js");
  }
  return new Promise((resolve, reject) => {
    const peer = new window.Peer(peerId, {
      host:   "0.peerjs.com",
      port:   443,
      path:   "/",
      secure: true,
    });
    peer.on("open",  ()    => resolve(peer));
    peer.on("error", (err) => reject(err));
  });
}

function _loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload  = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function _roomSnapshot(mp) {
  return {
    roomId:      mp.roomId,
    state:       mp.state,
    hostId:      mp.hostId,
    maxPlayers:  mp.maxPlayers,
    playerCount: mp.playerCount,
    players:     mp.getPlayers(),
    shared:      mp.getSharedSnapshot(),
  };
}

function _uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function _roomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
