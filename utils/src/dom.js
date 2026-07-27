'use strict';

const fs = require('fs');
const { EventEmitter } = require('events');
const constants = require('./constants.js');

let _idCounter = 0;
/**
 * Generates the next unique virtual-element identifier.
 *
 * @returns {string|null} Current or generated value.
 */
function nextId() { return `forge-el-${++_idCounter}`; }

/**
 * Element: a minimal virtual DOM node. Not a real browser element (Node has
 * no window/document), but supports the same surface area p5's DOM helpers
 * expose — attributes, classes, style, position/size, parent/child, and
 * event listener registration — so game/UI logic can run headlessly and
 * later be rendered by any real front-end (HTML string, canvas, etc).
 */
class Element extends EventEmitter {
  /**
   * Initializes a new instance with its default state.
   *
   * @param {string|*} tag - Tag value.
   * @param {number} value - Value value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  constructor(tag, value) {
    super();
    this.id_ = nextId();
    this.tag = tag;
    this.value_ = value;
    this.attributes = {};
    this.styles = {};
    this.classes = new Set();
    this.children = [];
    this.parentEl = null;
    this.visible = true;
    this.pos = { x: 0, y: 0 };
    this.sizeVal = { w: null, h: null };
  }

  // -- structure --
  /**
   * Gets the child collection or appends a child element.
   *
   * @param {Object} childEl - Childel value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  child(childEl) {
    if (childEl === undefined) return this.children;
    if (typeof childEl === 'string') childEl = { id_: childEl };
    childEl.parentEl = this;
    this.children.push(childEl);
    return this;
  }
  /**
   * Gets or assigns the parent element.
   *
   * @param {Object} p - P value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  parent(p) {
    if (p === undefined) return this.parentEl;
    this.parentEl = p;
    p.children.push(this);
    return this;
  }
  /**
   * Detaches the element and removes all registered event listeners.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  remove() {
    if (this.parentEl) {
      const idx = this.parentEl.children.indexOf(this);
      if (idx !== -1) this.parentEl.children.splice(idx, 1);
    }
    this.removeAllListeners();
    return this;
  }

  // -- attributes / classes / style --
  /**
   * Gets or sets an element attribute.
   *
   * @param {string|*} name - Name value.
   * @param {number} value - Value value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  attribute(name, value) {
    if (value === undefined) return this.attributes[name];
    this.attributes[name] = value;
    return this;
  }
  /**
   * Removes an attribute from the element.
   *
   * @param {string|*} name - Name value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  removeAttribute(name) { delete this.attributes[name]; return this; }
  /**
   * Gets or sets the element identifier.
   *
   * @param {string|*} name - Name value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  id(name) { if (name === undefined) return this.id_; this.id_ = name; return this; }
  /**
   * Gets or sets the element class list.
   *
   * @param {string|*} name - Name value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  class(name) { if (name === undefined) return [...this.classes].join(' '); this.addClass(name); return this; }
  /**
   * Adds a CSS class.
   *
   * @param {string|*} name - Name value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  addClass(name) { this.classes.add(name); return this; }
  /**
   * Removes a CSS class.
   *
   * @param {string|*} name - Name value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  removeClass(name) { this.classes.delete(name); return this; }
  /**
   * Checks whether the element has a CSS class.
   *
   * @param {string|*} name - Name value.
   *
   * @returns {boolean} Result of the check.
   */
  hasClass(name) { return this.classes.has(name); }
  /**
   * Toggles a CSS class.
   *
   * @param {string|*} name - Name value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  toggleClass(name) { this.classes.has(name) ? this.classes.delete(name) : this.classes.add(name); return this; }
  /**
   * Gets or sets one or more style properties.
   *
   * @param {string|*} prop - Prop value.
   * @param {number} value - Value value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  style(prop, value) {
    if (typeof prop === 'object') { Object.assign(this.styles, prop); return this; }
    if (value === undefined) return this.styles[prop];
    this.styles[prop] = value;
    return this;
  }

  // -- content --
  /**
   * Gets or updates the element HTML content.
   *
   * @param {string|*} content - Content value.
   * @param {boolean} [append=false] - Append value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  html(content, append = false) {
    if (content === undefined) return this._html || '';
    this._html = append ? (this._html || '') + content : content;
    return this;
  }
  /**
   * Gets or sets the element value.
   *
   * @param {number} v - V value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  value(v) { if (v === undefined) return this.value_; this.value_ = v; return this; }
  /**
   * Registers an input handler and emits the current value.
   *
   * @param {Function} handler - Handler value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  input(handler) { if (handler) this.on('input', handler); this.emit('input', this.value_); return this; }
  /**
   * Registers a change-event handler.
   *
   * @param {Function} handler - Handler value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  changed(handler) { if (handler) this.on('change', handler); return this; }

  // -- layout --
  /**
   * Gets or sets the element position.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  position(x, y) { if (x === undefined) return this.pos; this.pos = { x, y }; return this; }
  /**
   * Centers the element in the virtual layout.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  center() { this.pos = { x: 'center', y: 'center' }; return this; }
  /**
   * Gets or sets the element dimensions.
   *
   * @param {number} w - W value.
   * @param {number} h - H value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  size(w, h) {
    if (w === undefined) return this.sizeVal;
    this.sizeVal = { w, h: h === undefined ? w : h };
    return this;
  }
  /**
   * Returns the width.
   *
   * @returns {number} Current value.
   */
  get width() { return this.sizeVal.w; }
  /**
   * Returns the height.
   *
   * @returns {number} Current value.
   */
  get height() { return this.sizeVal.h; }
  /**
   * Makes the element visible.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  show() { this.visible = true; return this; }
  /**
   * Hides the element.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  hide() { this.visible = false; return this; }

  // -- events (delegated onto EventEmitter, with p5-style method names) --
  /**
   * Registers a mousePressed event handler.
   *
   * @param {Function} fn - Fn value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  mousePressed(fn) { this.on('mousePressed', fn); return this; }
  /**
   * Registers a mouseReleased event handler.
   *
   * @param {Function} fn - Fn value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  mouseReleased(fn) { this.on('mouseReleased', fn); return this; }
  /**
   * Registers a mouseClicked event handler.
   *
   * @param {Function} fn - Fn value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  mouseClicked(fn) { this.on('mouseClicked', fn); return this; }
  /**
   * Registers a mouseOver event handler.
   *
   * @param {Function} fn - Fn value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  mouseOver(fn) { this.on('mouseOver', fn); return this; }
  /**
   * Registers a mouseOut event handler.
   *
   * @param {Function} fn - Fn value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  mouseOut(fn) { this.on('mouseOut', fn); return this; }
  /**
   * Registers a mouseMoved event handler.
   *
   * @param {Function} fn - Fn value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  mouseMoved(fn) { this.on('mouseMoved', fn); return this; }
  /**
   * Registers a mouseWheel event handler.
   *
   * @param {Function} fn - Fn value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  mouseWheel(fn) { this.on('mouseWheel', fn); return this; }
  /**
   * Registers a doubleClicked event handler.
   *
   * @param {Function} fn - Fn value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  doubleClicked(fn) { this.on('doubleClicked', fn); return this; }
  /**
   * Registers a dragOver event handler.
   *
   * @param {Function} fn - Fn value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  dragOver(fn) { this.on('dragOver', fn); return this; }
  /**
   * Registers a dragLeave event handler.
   *
   * @param {Function} fn - Fn value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  dragLeave(fn) { this.on('dragLeave', fn); return this; }
  /**
   * Performs the drop operation.
   *
   * @param {Function} fn - Fn value.
   * @param {Function} callback - Callback value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  drop(fn, callback) { this.on('drop', fn); if (callback) this.on('dropComplete', callback); return this; }
  /**
   * Performs the draggable operation.
   *
   * @param {boolean} [state=true] - State value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  draggable(state = true) { this._draggable = state; return this; }

  /**
   * Returns the backing virtual element.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  elt() { return this; } // no real DOM node in Node.js; returns self

  /** Very small HTML string renderer, useful for SSR / debugging. */
  /**
   * Serializes the virtual element and its descendants to HTML.
   *
   * @returns {string} Serialized HTML string.
   */
  toHTML() {
    const attrs = Object.entries(this.attributes).map(([k, v]) => ` ${k}="${v}"`).join('');
    const cls = this.classes.size ? ` class="${[...this.classes].join(' ')}"` : '';
    const styleStr = Object.entries(this.styles).map(([k, v]) => `${k}:${v}`).join(';');
    const style = styleStr ? ` style="${styleStr}"` : '';
    const inner = (this._html || '') + this.children.map(c => c.toHTML ? c.toHTML() : '').join('');
    return `<${this.tag} id="${this.id_}"${cls}${style}${attrs}>${inner}</${this.tag}>`;
  }
}

class Media extends Element {
  /**
   * Initializes a new instance with its default state.
   *
   * @param {string|*} tag - Tag value.
   * @param {string|*} src - Src value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  constructor(tag, src) {
    super(tag, src);
    this._src = src;
    this._playing = false;
    this._loop = false;
    this._volume = 1;
    this._speedVal = 1;
    this._time = 0;
    this._duration = 0;
    this._cues = [];
    this._autoplay = false;
    this._controlsVisible = false;
    this._onended = null;
  }
  /**
   * Returns the src.
   *
   * @returns {string|null} Current value.
   */
  get src() { return this._src; }
  /**
   * Starts media playback.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  play() { this._playing = true; this.emit('play'); return this; }
  /**
   * Pauses media playback.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  pause() { this._playing = false; this.emit('pause'); return this; }
  /**
   * Stops playback and resets the playhead.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  stop() { this._playing = false; this._time = 0; this.emit('stop'); return this; }
  /**
   * Gets or sets looping behavior.
   *
   * @param {boolean} state - State value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  loop(state) { if (state === undefined) return this._loop; this._loop = state; return this; }
  /**
   * Disables looping.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  noLoop() { this._loop = false; return this; }
  /**
   * Gets or sets autoplay behavior.
   *
   * @param {boolean} state - State value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  autoplay(state) { if (state === undefined) return this._autoplay; this._autoplay = state; return this; }
  /**
   * Gets or sets playback volume.
   *
   * @param {number} v - V value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  volume(v) { if (v === undefined) return this._volume; this._volume = Math.max(0, Math.min(1, v)); return this; }
  /**
   * Gets or sets playback speed.
   *
   * @param {string|*} s - S value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  speed(s) { if (s === undefined) return this._speedVal; this._speedVal = s; return this; }
  /**
   * Gets or sets the playhead time.
   *
   * @param {string|*} t - T value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  time(t) { if (t === undefined) return this._time; this._time = t; return this; }
  /**
   * Gets or sets media duration.
   *
   * @param {number} d - D value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  duration(d) { if (d === undefined) return this._duration; this._duration = d; return this; }
  /**
   * Shows media controls.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  showControls() { this._controlsVisible = true; return this; }
  /**
   * Hides media controls.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  hideControls() { this._controlsVisible = false; return this; }
  /**
   * Connects the media element to an output node.
   *
   * @param {Object} node - Node value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  connect(node) { this._connectedTo = node; return this; }
  /**
   * Disconnects the media element from its output node.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  disconnect() { this._connectedTo = null; return this; }
  /**
   * Registers a playback-ended callback.
   *
   * @param {Function} fn - Fn value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  onended(fn) { this._onended = fn; this.on('ended', fn); return this; }
  /**
   * Adds a timed media cue.
   *
   * @param {number} time - Time value.
   * @param {Function} callback - Callback value.
   * @param {number} value - Value value.
   *
   * @returns {number} Cue identifier.
   */
  addCue(time, callback, value) { const cue = { time, callback, value, id: this._cues.length }; this._cues.push(cue); return cue.id; }
  /**
   * Removes a timed media cue.
   *
   * @param {string|*} id - Id value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  removeCue(id) { this._cues = this._cues.filter(c => c.id !== id); return this; }
  /**
   * Removes all timed media cues.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  clearCues() { this._cues = []; return this; }
  /**
   * Advances simulated media playback and dispatches due cues.
   *
   * @param {number} elapsedMs - Elapsedms value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  _tick(elapsedMs) {
    if (!this._playing) return;
    this._time += (elapsedMs / 1000) * this._speedVal;
    for (const cue of this._cues) {
      if (!cue._fired && this._time >= cue.time) { cue._fired = true; cue.callback(cue.value); }
    }
    if (this._duration && this._time >= this._duration) {
      if (this._loop) { this._time = 0; this._cues.forEach(c => (c._fired = false)); }
      else { this._playing = false; this.emit('ended'); if (this._onended) this._onended(); }
    }
  }
}

class FileWrapper {
  /**
   * Initializes a new instance with its default state.
   *
   * @param {string|*} filePath - Filepath value.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  constructor(filePath) {
    this._path = filePath;
    const stat = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
    this._size = stat ? stat.size : 0;
    this._name = filePath.split('/').pop();
    const ext = (this._name.split('.').pop() || '').toLowerCase();
    this._type = ({ png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', mp3: 'audio', wav: 'audio', mp4: 'video', json: 'application', txt: 'text' })[ext] || 'application';
    this._subtype = ext;
  }
  /**
   * Returns the file.
   *
   * @returns {string|null} Current value.
   */
  get file() { return this._path; }
  /**
   * Returns the name.
   *
   * @returns {string|null} Current value.
   */
  get name() { return this._name; }
  /**
   * Gets or sets the element dimensions.
   *
   * @returns {number} Current value.
   */
  get size() { return this._size; }
  /**
   * Returns the type.
   *
   * @returns {string|null} Current value.
   */
  get type() { return this._type; }
  /**
   * Returns the subtype.
   *
   * @returns {string|null} Current value.
   */
  get subtype() { return this._subtype; }
  /**
   * Returns the data.
   *
   * @returns {Buffer} File contents.
   */
  get data() { return fs.readFileSync(this._path); }
}

// ---------------------------------------------------------------------------
// DOM: a virtual document — a tree of Elements, with query helpers.
// ---------------------------------------------------------------------------
class DOM {
  /**
   * Initializes a new instance with its default state.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  constructor() {
    this.root = new Element('body');
    this._registry = [this.root];
  }
  /**
   * Registers a virtual element.
   *
   * @param {Object} el - El value.
   *
   * @returns {Element} Created or registered element.
   */
  _register(el) { this._registry.push(el); return el; }

  /**
   * Creates a virtual element.
   *
   * @param {string|*} tag - Tag value.
   * @param {string|*} content - Content value.
   *
   * @returns {Element} Created or registered element.
   */
  createElement(tag, content) {
    const el = new Element(tag, content);
    if (content !== undefined && typeof content === 'string') el.html(content);
    return this._register(el);
  }
  /**
   * Appends an element to the virtual document root.
   *
   * @param {Object} el - El value.
   *
   * @returns {Element} Created or registered element.
   */
  addElement(el) { this.root.child(el); return el; }
  /**
   * Creates and appends a div element.
   *
   * @param {string|*} content - Content value.
   *
   * @returns {Element} Created or registered element.
   */
  createDiv(content) { return this.addElement(this.createElement('div', content)); }
  /**
   * Creates and appends a paragraph element.
   *
   * @param {string|*} content - Content value.
   *
   * @returns {Element} Created or registered element.
   */
  createP(content) { return this.addElement(this.createElement('p', content)); }
  /**
   * Creates and appends a span element.
   *
   * @param {string|*} content - Content value.
   *
   * @returns {Element} Created or registered element.
   */
  createSpan(content) { return this.addElement(this.createElement('span', content)); }
  /**
   * Creates and appends a hyperlink element.
   *
   * @param {string|*} href - Href value.
   * @param {string|*} text - Text value.
   *
   * @returns {Element} Created or registered element.
   */
  createA(href, text) { const el = this.createElement('a', text); el.attribute('href', href); return this.addElement(el); }
  /**
   * Creates and appends a button element.
   *
   * @param {string|*} label - Label value.
   *
   * @returns {Element} Created or registered element.
   */
  createButton(label) { const el = this.createElement('button', label); el.value_ = label; return this.addElement(el); }
  /**
   * Creates and appends a checkbox input.
   *
   * @param {string|*} label - Label value.
   * @param {boolean} [checked=false] - Checked value.
   *
   * @returns {Element} Created or registered element.
   */
  createCheckbox(label, checked = false) {
    const el = this.createElement('input');
    el.attribute('type', 'checkbox'); el.value_ = checked; el._label = label;
    return this.addElement(el);
  }
  /**
   * Creates and appends a radio-group container.
   *
   * @param {string|*} name - Name value.
   *
   * @returns {Element} Created or registered element.
   */
  createRadio(name) {
    const el = this.createElement('div'); el._name = name; el._options = [];
    return this.addElement(el);
  }
  /**
   * Creates and appends a color input.
   *
   * @param {number} [value='#000000'] - Value value.
   *
   * @returns {Element} Created or registered element.
   */
  createColorPicker(value = '#000000') {
    const el = this.createElement('input');
    el.attribute('type', 'color'); el.value_ = value;
    return this.addElement(el);
  }
  /**
   * Creates and appends an input element.
   *
   * @param {number} [value=''] - Value value.
   * @param {string|*} [type='text'] - Type value.
   *
   * @returns {Element} Created or registered element.
   */
  createInput(value = '', type = 'text') {
    const el = this.createElement('input');
    el.attribute('type', type); el.value_ = value;
    return this.addElement(el);
  }
  /**
   * Creates and appends a file input.
   *
   * @param {Function} callback - Callback value.
   *
   * @returns {Element} Created or registered element.
   */
  createFileInput(callback) {
    const el = this.createElement('input');
    el.attribute('type', 'file');
    if (callback) el.on('change', callback);
    return this.addElement(el);
  }
  /**
   * Creates and appends a select element.
   *
   * @returns {Element} Created or registered element.
   */
  createSelect() {
    const el = this.createElement('select');
    el._options = [];
    el.option = (name, value) => { el._options.push({ name, value: value ?? name }); return el; };
    el.selected = v => { if (v === undefined) return el.value_; el.value_ = v; return el; };
    return this.addElement(el);
  }
  /**
   * Creates and appends a range input.
   *
   * @param {number} [min=0] - Min value.
   * @param {number} [max=100] - Max value.
   * @param {number} [value=min] - Value value.
   * @param {number} [step=1] - Step value.
   *
   * @returns {Element} Created or registered element.
   */
  createSlider(min = 0, max = 100, value = min, step = 1) {
    const el = this.createElement('input');
    el.attribute('type', 'range');
    el.attribute('min', min); el.attribute('max', max); el.attribute('step', step);
    el.value_ = value;
    return this.addElement(el);
  }
  /**
   * Creates and appends an image element.
   *
   * @param {string|*} src - Src value.
   * @param {string|*} [altText=''] - Alttext value.
   *
   * @returns {Element} Created or registered element.
   */
  createImg(src, altText = '') {
    const el = this.createElement('img');
    el.attribute('src', src); el.attribute('alt', altText);
    return this.addElement(el);
  }
  /**
   * Creates and appends a virtual audio element.
   *
   * @param {string|*} src - Src value.
   *
   * @returns {Element} Created or registered element.
   */
  createAudio(src) { const el = new Media('audio', src); return this.addElement(this._register(el)); }
  /**
   * Creates and appends a virtual video element.
   *
   * @param {string|*} src - Src value.
   *
   * @returns {Element} Created or registered element.
   */
  createVideo(src) { const el = new Media('video', src); return this.addElement(this._register(el)); }
  /**
   * Creates and appends a figure caption.
   *
   * @param {string|*} text - Text value.
   *
   * @returns {Element} Created or registered element.
   */
  createCaption(text) { return this.addElement(this.createElement('figcaption', text)); }

  /**
   * Returns the first element matching a simple selector.
   *
   * @param {string|*} selector - Selector value.
   *
   * @returns {Element|null} Matching element, if found.
   */
  select(selector) {
    const isId = selector.startsWith('#');
    const isClass = selector.startsWith('.');
    const key = isId || isClass ? selector.slice(1) : selector;
    return this._registry.find(el =>
      isId ? el.id_ === key : isClass ? el.classes.has(key) : el.tag === key
    ) || null;
  }
  /**
   * Returns all elements matching a simple selector.
   *
   * @param {string|*} selector - Selector value.
   *
   * @returns {Element[]} Matching elements.
   */
  selectAll(selector) {
    const isId = selector.startsWith('#');
    const isClass = selector.startsWith('.');
    const key = isId || isClass ? selector.slice(1) : selector;
    return this._registry.filter(el =>
      isId ? el.id_ === key : isClass ? el.classes.has(key) : el.tag === key
    );
  }
  /**
   * Removes all elements except the document root.
   *
   * @returns {this|*} Method result; chainable methods return the current instance.
   */
  removeElements() {
    this._registry.filter(el => el !== this.root).forEach(el => el.remove());
    this._registry = [this.root];
    this.root.children = [];
    return this;
  }
}

module.exports = { DOM, Element, Media, File: FileWrapper };
