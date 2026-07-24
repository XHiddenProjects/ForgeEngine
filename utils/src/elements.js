"use strict";

/**
 * Lightweight wrapper around a browser HTMLElement.
 */
class Element {
  constructor(elt) {
    if (typeof document === "undefined" && !elt) {
      throw new Error("Element requires an HTMLElement outside a browser environment.");
    }
    this.elt = elt || document.createElement("div");
    this._listeners = [];
    this._dragState = null;
  }

  get width() {
    return this.elt.getBoundingClientRect
      ? this.elt.getBoundingClientRect().width
      : this.elt.offsetWidth || 0;
  }

  get height() {
    return this.elt.getBoundingClientRect
      ? this.elt.getBoundingClientRect().height
      : this.elt.offsetHeight || 0;
  }

  _listen(type, callback, options) {
    if (typeof callback !== "function") {
      throw new TypeError(`${type} callback must be a function.`);
    }
    this.elt.addEventListener(type, callback, options);
    this._listeners.push({ type, callback, options });
    return this;
  }

  addClass(name) {
    const names = String(name).trim().split(/\s+/).filter(Boolean);
    this.elt.classList.add(...names);
    return this;
  }

  attribute(name, value = "") {
    if (value === false || value == null) this.elt.removeAttribute(name);
    else this.elt.setAttribute(name, value === true ? "" : String(value));
    return this;
  }

  center(align = "both") {
    const mode = String(align).toLowerCase();
    if (!["horizontal", "vertical", "both"].includes(mode)) {
      throw new TypeError('center() expects "horizontal", "vertical", or "both".');
    }
    const transforms = [];
    this.elt.style.position = this.elt.style.position || "absolute";
    if (mode === "horizontal" || mode === "both") {
      this.elt.style.left = "50%";
      transforms.push("translateX(-50%)");
    }
    if (mode === "vertical" || mode === "both") {
      this.elt.style.top = "50%";
      transforms.push("translateY(-50%)");
    }
    this.elt.style.transform = transforms.join(" ");
    return this;
  }

  changed(callback) { return this._listen("change", callback); }

  child(child) {
    const node = child instanceof Element ? child.elt : child;
    if (!node || typeof node.appendChild === "function") {
      if (!node) throw new TypeError("child() requires an Element or DOM Node.");
    }
    this.elt.appendChild(node);
    return this;
  }

  class(value) {
    this.elt.className = String(value);
    return this;
  }

  doubleClicked(callback) { return this._listen("dblclick", callback); }

  draggable(enabled = true) {
    if (!enabled) {
      this.elt.draggable = false;
      if (this._dragState) {
        const { down, move, up } = this._dragState;
        this.elt.removeEventListener("pointerdown", down);
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        this._dragState = null;
      }
      return this;
    }

    if (this._dragState) return this;
    this.elt.draggable = true;
    let active = false;
    let offsetX = 0;
    let offsetY = 0;
    const down = (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      const rect = this.elt.getBoundingClientRect();
      active = true;
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      this.elt.style.position = this.elt.style.position || "absolute";
      this.elt.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    };
    const move = (event) => {
      if (!active) return;
      this.elt.style.left = `${event.clientX - offsetX}px`;
      this.elt.style.top = `${event.clientY - offsetY}px`;
    };
    const up = (event) => {
      active = false;
      this.elt.releasePointerCapture?.(event.pointerId);
    };
    this.elt.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    this._dragState = { down, move, up };
    return this;
  }

  dragLeave(callback) { return this._listen("dragleave", callback); }
  dragOver(callback) {
    return this._listen("dragover", (event) => {
      event.preventDefault();
      callback(event);
    });
  }
  drop(callback) {
    return this._listen("drop", (event) => {
      event.preventDefault();
      const files = Array.from(event.dataTransfer?.files || []).map(
        (file) => new ElementFile(file)
      );
      callback(files, event);
    });
  }

  hasClass(name) { return this.elt.classList.contains(String(name)); }
  hide() { this.elt.style.display = "none"; return this; }

  html(content, append = false) {
    if (arguments.length === 0) return this.elt.innerHTML;
    if (append) this.elt.insertAdjacentHTML("beforeend", String(content));
    else this.elt.innerHTML = String(content);
    return this;
  }

  id(value) {
    if (arguments.length === 0) return this.elt.id;
    this.elt.id = String(value);
    return this;
  }

  input(callback) { return this._listen("input", callback); }
  mouseClicked(callback) { return this._listen("click", callback); }
  mouseMoved(callback) { return this._listen("mousemove", callback); }
  mouseOut(callback) { return this._listen("mouseout", callback); }
  mouseOver(callback) { return this._listen("mouseover", callback); }
  mousePressed(callback) { return this._listen("mousedown", callback); }
  mouseReleased(callback) { return this._listen("mouseup", callback); }
  mouseWheel(callback) { return this._listen("wheel", callback); }

  parent(parent) {
    if (arguments.length === 0) return this.elt.parentElement;
    const node = parent instanceof Element ? parent.elt : parent;
    if (!node || typeof node.appendChild !== "function") {
      throw new TypeError("parent() requires an Element or DOM Node.");
    }
    node.appendChild(this.elt);
    return this;
  }

  position(x, y, positionType = "absolute") {
    this.elt.style.position = positionType;
    this.elt.style.left = typeof x === "number" ? `${x}px` : String(x);
    this.elt.style.top = typeof y === "number" ? `${y}px` : String(y);
    return this;
  }

  remove() {
    this.draggable(false);
    for (const { type, callback, options } of this._listeners) {
      this.elt.removeEventListener(type, callback, options);
    }
    this._listeners.length = 0;

    const media = this.elt.matches?.("audio,video")
      ? [this.elt]
      : Array.from(this.elt.querySelectorAll?.("audio,video") || []);
    for (const item of media) {
      item.pause?.();
      const stream = item.srcObject;
      stream?.getTracks?.().forEach((track) => track.stop());
      item.srcObject = null;
    }
    this.elt.remove();
    return this;
  }

  removeAttribute(name) { this.elt.removeAttribute(name); return this; }
  removeClass(name) {
    const names = String(name).trim().split(/\s+/).filter(Boolean);
    this.elt.classList.remove(...names);
    return this;
  }

  show(display = "") { this.elt.style.display = display; return this; }

  size(width, height = width) {
    this.elt.style.width = typeof width === "number" ? `${width}px` : String(width);
    this.elt.style.height = typeof height === "number" ? `${height}px` : String(height);
    return this;
  }

  style(property, value) {
    if (typeof property === "object" && property !== null) {
      for (const [key, val] of Object.entries(property)) this.style(key, val);
      return this;
    }
    if (arguments.length === 1) return getComputedStyle(this.elt).getPropertyValue(property);
    this.elt.style.setProperty(String(property), String(value));
    return this;
  }

  toggleClass(name, force) {
    return arguments.length > 1
      ? this.elt.classList.toggle(String(name), Boolean(force))
      : this.elt.classList.toggle(String(name));
  }

  value(value) {
    if (arguments.length === 0) return this.elt.value;
    this.elt.value = value;
    return this;
  }
}

/** Wrapper for a browser File object and its optional loaded data. */
class ElementFile extends Element {
  constructor(file, data = null) {
    const placeholder = typeof document !== "undefined" ? document.createElement("span") : {};
    super(placeholder);
    if (!(typeof File === "undefined" || file instanceof File) &&
        !(typeof Blob !== "undefined" && file instanceof Blob)) {
      throw new TypeError("ElementFile expects a File or Blob object.");
    }
    this.file = file;
    this.data = data;
  }

  get name() { return this.file?.name || ""; }
  get size() { return this.file?.size || 0; }
  get type() { return this.file?.type || ""; }
  get subtype() {
    const parts = this.type.split("/");
    return parts.length > 1 ? parts.slice(1).join("/") : "";
  }

  async loadAsDataURL() {
    if (!this.file) return this.data;
    this.data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(this.file);
    });
    return this.data;
  }

  async loadAsText(encoding = "UTF-8") {
    if (!this.file) return this.data;
    this.data = typeof this.file.text === "function"
      ? await this.file.text()
      : await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsText(this.file, encoding);
        });
    return this.data;
  }
}

/** Wrapper around an HTMLAudioElement or HTMLVideoElement. */
class ElementMedia extends Element {
  constructor(elt) {
    if (!elt && typeof document !== "undefined") elt = document.createElement("audio");
    super(elt);
    this._cues = new Map();
    this._nextCueId = 1;
    this._audioContext = null;
    this._audioSource = null;
    this._cueHandler = () => this._processCues();
    this.elt.addEventListener("timeupdate", this._cueHandler);
  }

  get src() { return this.elt.currentSrc || this.elt.src || ""; }
  set src(value) { this.elt.src = String(value); }

  addCue(time, callback, value) {
    if (!Number.isFinite(Number(time)) || typeof callback !== "function") {
      throw new TypeError("addCue() requires a numeric time and a callback.");
    }
    const id = this._nextCueId++;
    this._cues.set(id, { time: Number(time), callback, value, fired: false });
    return id;
  }

  _processCues() {
    const now = this.elt.currentTime || 0;
    for (const cue of this._cues.values()) {
      if (!cue.fired && now >= cue.time) {
        cue.fired = true;
        cue.callback(cue.value);
      } else if (now < cue.time) {
        cue.fired = false;
      }
    }
  }

  autoplay(enabled = true) { this.elt.autoplay = Boolean(enabled); return this; }
  clearCues() { this._cues.clear(); return this; }

  connect(destination) {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) throw new Error("Web Audio API is not supported.");
    this._audioContext ||= new AudioContextClass();
    this._audioSource ||= this._audioContext.createMediaElementSource(this.elt);
    this._audioSource.connect(destination || this._audioContext.destination);
    return this;
  }

  disconnect() {
    this._audioSource?.disconnect();
    return this;
  }

  duration() { return Number.isFinite(this.elt.duration) ? this.elt.duration : 0; }
  hideControls() { this.elt.controls = false; return this; }
  loop() { this.elt.loop = true; return this.play(); }
  noLoop() { this.elt.loop = false; return this; }
  onended(callback) { return this._listen("ended", callback); }
  pause() { this.elt.pause(); return this; }
  play() { return this.elt.play(); }
  removeCue(id) { return this._cues.delete(id); }
  showControls() { this.elt.controls = true; return this; }

  speed(rate) {
    if (arguments.length === 0) return this.elt.playbackRate;
    this.elt.playbackRate = Number(rate);
    return this;
  }

  stop() { this.elt.pause(); this.elt.currentTime = 0; return this; }

  time(seconds) {
    if (arguments.length === 0) return this.elt.currentTime;
    this.elt.currentTime = Number(seconds);
    this._processCues();
    return this;
  }

  volume(level) {
    if (arguments.length === 0) return this.elt.volume;
    const amount = Number(level);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1) {
      throw new RangeError("volume() expects a value from 0 to 1.");
    }
    this.elt.volume = amount;
    return this;
  }

  remove() {
    this.clearCues();
    this.elt.removeEventListener("timeupdate", this._cueHandler);
    this.disconnect();
    return super.remove();
  }
}

if (typeof globalThis !== "undefined") {
  globalThis.Element = Element;
  globalThis.ElementFile = ElementFile;
  globalThis.ElementMedia = ElementMedia;
}

if (typeof module === "object" && module.exports) {
  module.exports = { Element, ElementFile, ElementMedia };
}
