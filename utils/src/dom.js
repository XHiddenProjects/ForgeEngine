'use strict';

// Wrapped in an IIFE - see the comment at the top of Transform.js for why:
// this file may be loaded as a sibling <script> tag alongside the other
// engine files, all sharing ONE global scope. DOM has no dependency on any
// of them (it never touches a <canvas> - it manages *other* page elements),
// so - like Transform.js/IO.js - it only ever leaks its name via an
// explicit `root.DOM` assignment, never a top-level `const`/`class`
// declaration.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        const DOM = factory();
        module.exports = DOM;
        module.exports.DOM = DOM;
    } else if (root) {
        root.DOM = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

/**
 * Resolves a "container" argument (used throughout {@link DOM} to say
 * where a new element should be appended, or where {@link DOM#select}/
 * {@link DOM#selectAll} should search) to a real DOM node.
 *
 * @private
 * @param {?(string|Element|HTMLElement)} container - A CSS selector, a raw `HTMLElement`, an {@link Element} wrapper, or `null`/`undefined`.
 * @param {HTMLElement} fallback - Node to use if `container` is `null`/`undefined`.
 * @returns {?HTMLElement} The resolved node, or `null` if a selector matched nothing.
 */
function resolveContainer(container, fallback) {
    if (container === undefined || container === null) return fallback;
    if (typeof container === 'string') return document.querySelector(container);
    if (container instanceof Element) return container.elt;
    return container;
}

/**
 * Applies a plain object of HTML attributes to a raw DOM node. `class` and
 * `style` are handled specially (merged, rather than clobbering anything
 * already on the node); everything else is set via `setAttribute`.
 *
 * @private
 * @param {HTMLElement} node - Target node.
 * @param {Object} [attributes={}] - Attributes to apply.
 * @returns {void}
 */
function applyAttributes(node, attributes = {}) {
    for (const [key, value] of Object.entries(attributes)) {
        if (key === 'class') node.className = `${node.className} ${value}`.trim();
        else if (key === 'style') node.style.cssText += value;
        else if (value === true) node.setAttribute(key, '');
        else if (value !== false && value !== null && value !== undefined) node.setAttribute(key, value);
    }
}

// p5-style event names -> native DOM event names they wrap.
const EVENT_MAP = {
    mousePressed: 'mousedown',
    mouseReleased: 'mouseup',
    mouseClicked: 'click',
    doubleClicked: 'dblclick',
    mouseWheel: 'wheel',
    mouseMoved: 'mousemove',
    mouseOver: 'mouseover',
    mouseOut: 'mouseout',
    touchStarted: 'touchstart',
    touchMoved: 'touchmove',
    touchEnded: 'touchend',
    dragOver: 'dragover',
    dragLeave: 'dragleave',
    drop: 'drop',
    changed: 'change',
    input: 'input'
};

/**
 * Lightweight p5.Element-like wrapper around a single DOM node. Returned by
 * every `DOM#createXxx()` method (and by {@link DOM#select}/{@link
 * DOM#selectAll}), and by {@link DOM#addElement} for nodes you built
 * yourself.
 *
 * @class
 */
class Element {
    #dom;
    #listeners;

    /**
     * @param {HTMLElement} node - The raw DOM node this instance wraps.
     * @param {DOM} dom - The owning {@link DOM} instance (used so {@link Element#remove} can un-register itself).
     */
    constructor(node, dom) {
        /** @type {HTMLElement} The wrapped raw DOM node. */
        this.elt = node;
        this.#dom = dom;
        this.#listeners = new Map();
    }

    // ---------------------------------------------------------------
    // Identity / classes / attributes
    // ---------------------------------------------------------------

    /** @param {string} [id] - New `id` to set. @returns {Element|string} This instance when setting, or the current `id` when reading. */
    id(id) {
        if (id === undefined) return this.elt.id;
        this.elt.id = id;
        return this;
    }

    /** @param {string} [c] - New `class` attribute to set (replacing any existing classes). @returns {Element|string} This instance when setting, or the current `className` when reading. */
    class(c) {
        if (c === undefined) return this.elt.className;
        this.elt.className = c;
        return this;
    }

    /** @param {string} c - Class name to add. @returns {Element} This instance, to allow chaining. */
    addClass(c) { this.elt.classList.add(c); return this; }

    /** @param {string} c - Class name to remove. @returns {Element} This instance, to allow chaining. */
    removeClass(c) { this.elt.classList.remove(c); return this; }

    /** @param {string} c - Class name to check for. @returns {boolean} `true` if the element currently has this class. */
    hasClass(c) { return this.elt.classList.contains(c); }

    /** @param {string} c - Class name to toggle. @returns {Element} This instance, to allow chaining. */
    toggleClass(c) { this.elt.classList.toggle(c); return this; }

    /**
     * Gets or sets an HTML attribute. Call with no arguments to get every
     * attribute as a `{name: value}` object; call with just `attr` to get
     * one attribute; call with `attr, value` to set one (`value = null`
     * removes it).
     *
     * @param {string} [attr] - Attribute name.
     * @param {?string} [value] - New value, or `null` to remove the attribute.
     * @returns {Element|string|?Object} This instance when setting, the attribute value (or `null`) when reading one, or an object of all attributes when reading all.
     */
    attribute(attr, value) {
        if (attr === undefined) {
            return Object.fromEntries(Array.from(this.elt.attributes, a => [a.name, a.value]));
        }
        if (value === undefined) return this.elt.getAttribute(attr);
        if (value === null) this.elt.removeAttribute(attr);
        else this.elt.setAttribute(attr, value);
        return this;
    }

    /** @param {string} attr - Attribute name to remove. @returns {Element} This instance, to allow chaining. */
    removeAttribute(attr) { this.elt.removeAttribute(attr); return this; }

    // ---------------------------------------------------------------
    // Content / value
    // ---------------------------------------------------------------

    /**
     * Gets or sets this element's value - the same value a native form
     * control (`<input>`, `<select>`, ...) would report, falling back to
     * `data-value`/an internal value for elements that aren't natively
     * value-bearing.
     *
     * @param {*} [value] - New value to set.
     * @returns {Element|string|number|boolean} This instance when setting, or the current value when reading.
     */
    value(value) {
        if (value === undefined) {
            if ('value' in this.elt) {
                const raw = this.elt.value;
                const num = Number(raw);
                return raw !== '' && !Number.isNaN(num) && this.elt.type !== 'text' ? num : raw;
            }
            return this.elt.dataset.value ?? '';
        }
        if ('value' in this.elt) this.elt.value = value;
        else this.elt.dataset.value = value;
        return this;
    }

    /**
     * Gets or sets this element's inner HTML.
     *
     * @param {string} [html] - New inner HTML to set.
     * @param {boolean} [append=false] - When `true`, appends to the existing content instead of replacing it.
     * @returns {Element|string} This instance when setting, or the current inner HTML when reading.
     */
    html(html, append = false) {
        if (html === undefined) return this.elt.innerHTML;
        if (append) this.elt.innerHTML += html;
        else this.elt.innerHTML = html;
        return this;
    }

    // ---------------------------------------------------------------
    // Layout / style
    // ---------------------------------------------------------------

    /**
     * Gets or sets this element's CSS position. With no arguments, returns
     * the element's current `{x, y}` (from `getBoundingClientRect()`).
     *
     * @param {number} [x] - New X position, in pixels.
     * @param {number} [y] - New Y position, in pixels.
     * @param {string} [positionType='absolute'] - CSS `position` value to use (`'absolute'` or `'fixed'`).
     * @returns {Element|{x: number, y: number}} This instance when setting, or the current position when reading.
     */
    position(x, y, positionType = 'absolute') {
        if (x === undefined) {
            const rect = this.elt.getBoundingClientRect();
            return { x: rect.left, y: rect.top };
        }
        this.elt.style.position = positionType;
        this.elt.style.left = `${x}px`;
        this.elt.style.top = `${y}px`;
        return this;
    }

    /**
     * Gets or sets a single CSS style property.
     *
     * @param {string} property - CSS property name (e.g. `'color'`, `'font-size'`).
     * @param {string} [value] - New value to set.
     * @returns {Element|string} This instance when setting, or the current computed value when reading.
     */
    style(property, value) {
        if (value === undefined) {
            return this.elt.style[property] || getComputedStyle(this.elt)[property];
        }
        this.elt.style[property] = value;
        return this;
    }

    /**
     * Gets or sets this element's size, in pixels. Pass `DOM.AUTO` for
     * either dimension to let the browser size that axis automatically.
     *
     * @param {number|string} [w] - New width, in pixels, or `DOM.AUTO`.
     * @param {number|string} [h] - New height, in pixels, or `DOM.AUTO`.
     * @returns {Element|{width: number, height: number}} This instance when setting, or the current size when reading.
     */
    size(w, h) {
        if (w === undefined) {
            const rect = this.elt.getBoundingClientRect();
            return { width: rect.width, height: rect.height };
        }
        this.elt.style.width = w === DOM.AUTO ? '' : `${w}px`;
        this.elt.style.height = h === undefined ? this.elt.style.height : (h === DOM.AUTO ? '' : `${h}px`);
        return this;
    }

    /**
     * Centers this element within its parent (or the page), horizontally,
     * vertically, or both.
     *
     * @param {string} [align='both'] - `'horizontal'`, `'vertical'`, or `'both'`.
     * @returns {Element} This instance, to allow chaining.
     */
    center(align = 'both') {
        const parent = this.elt.parentElement || document.body;
        const parentRect = parent.getBoundingClientRect();
        const rect = this.elt.getBoundingClientRect();
        this.elt.style.position = this.elt.style.position || 'absolute';
        if (align === 'horizontal' || align === 'both') {
            this.elt.style.left = `${(parentRect.width - rect.width) / 2}px`;
        }
        if (align === 'vertical' || align === 'both') {
            this.elt.style.top = `${(parentRect.height - rect.height) / 2}px`;
        }
        return this;
    }

    /** @returns {Element} This instance, to allow chaining. Shows a previously-hidden element. */
    show() { this.elt.style.display = ''; return this; }

    /** @returns {Element} This instance, to allow chaining. Hides the element without removing it. */
    hide() { this.elt.style.display = 'none'; return this; }

    // ---------------------------------------------------------------
    // Tree
    // ---------------------------------------------------------------

    /**
     * Gets this element's parent, or reparents it under a new one.
     *
     * @param {string|HTMLElement|Element} [parent] - New parent: a CSS selector, a raw node, or an {@link Element} wrapper.
     * @returns {Element|?HTMLElement} This instance when reparenting, or the current raw parent node when reading.
     */
    parent(parent) {
        if (parent === undefined) return this.elt.parentElement;
        const node = resolveContainer(parent, null);
        if (node) node.appendChild(this.elt);
        return this;
    }

    /**
     * Gets this element's children, or appends a new child to it.
     *
     * @param {string|HTMLElement|Element} [child] - A CSS selector (appends the first match), a raw node, or an {@link Element} wrapper.
     * @returns {Element|HTMLElement[]} This instance when appending, or an array of the current children when reading.
     */
    child(child) {
        if (child === undefined) return Array.from(this.elt.children);
        const node = resolveContainer(child, null);
        if (node) this.elt.appendChild(node);
        return this;
    }

    /**
     * Removes this element from the page (and un-registers it from the
     * owning {@link DOM} instance, along with all listeners attached via
     * the `mousePressed()`-style methods below).
     *
     * @returns {void}
     */
    remove() {
        for (const [event, handler] of this.#listeners) this.elt.removeEventListener(event, handler);
        this.#listeners.clear();
        this.elt.remove();
        if (this.#dom) this.#dom._unregister(this);
    }

    /**
     * Attaches a raw DOM event listener. Used internally by the
     * `mousePressed()`-style convenience methods below, but also usable
     * directly for any native event they don't cover.
     *
     * @param {string} event - Native DOM event name (e.g. `'contextmenu'`).
     * @param {function(Event):void|false} callback - Handler to attach, or `false` to remove a previously-attached one.
     * @returns {Element} This instance, to allow chaining.
     */
    on(event, callback) {
        const existing = this.#listeners.get(event);
        if (existing) { this.elt.removeEventListener(event, existing); this.#listeners.delete(event); }
        if (callback === false || callback === undefined) return this;
        this.elt.addEventListener(event, callback);
        this.#listeners.set(event, callback);
        return this;
    }
}

// Generate the p5-style mousePressed()/changed()/input()/... convenience
// methods from EVENT_MAP, each just a thin wrapper around Element#on().
for (const [p5Name, domName] of Object.entries(EVENT_MAP)) {
    Element.prototype[p5Name] = function (callback) { return this.on(domName, callback); };
}

/**
 * {@link Element} subclass returned by `DOM#createAudio()`/`createVideo()`/
 * `createCapture()`, adding playback-control convenience methods on top of
 * the underlying `<audio>`/`<video>` node.
 *
 * @class
 * @extends Element
 */
class MediaElement extends Element {
    /** @returns {MediaElement} This instance, to allow chaining. Starts (or resumes) playback. */
    play() { this.elt.play(); return this; }

    /** @returns {MediaElement} This instance, to allow chaining. Pauses playback and rewinds to the start. */
    stop() { this.elt.pause(); this.elt.currentTime = 0; return this; }

    /** @returns {MediaElement} This instance, to allow chaining. Pauses playback in place. */
    pause() { this.elt.pause(); return this; }

    /** @param {boolean} [shouldLoop=true] - Whether playback should loop. @returns {MediaElement} This instance, to allow chaining. */
    loop(shouldLoop = true) { this.elt.loop = shouldLoop; return this; }

    /** @returns {MediaElement} This instance, to allow chaining. Disables looping. */
    noLoop() { this.elt.loop = false; return this; }

    /** @param {boolean} [shouldAutoplay=true] - Whether the media should autoplay once loaded. @returns {MediaElement} This instance, to allow chaining. */
    autoplay(shouldAutoplay = true) { this.elt.autoplay = shouldAutoplay; return this; }

    /** @param {number} [level] - New volume, from `0` to `1`. @returns {MediaElement|number} This instance when setting, or the current volume when reading. */
    volume(level) {
        if (level === undefined) return this.elt.volume;
        this.elt.volume = level;
        return this;
    }

    /** @param {number} [rate] - New playback rate (`1` = normal speed). @returns {MediaElement|number} This instance when setting, or the current rate when reading. */
    speed(rate) {
        if (rate === undefined) return this.elt.playbackRate;
        this.elt.playbackRate = rate;
        return this;
    }

    /** @param {number} [seconds] - New playback position, in seconds. @returns {MediaElement|number} This instance when setting, or the current position when reading. */
    time(seconds) {
        if (seconds === undefined) return this.elt.currentTime;
        this.elt.currentTime = seconds;
        return this;
    }

    /** @returns {number} Total duration of the media, in seconds. */
    duration() { return this.elt.duration; }

    /** @param {function(Event):void|false} callback - Called when playback ends, or `false` to remove a previously-attached callback. @returns {MediaElement} This instance, to allow chaining. */
    onended(callback) { return this.on('ended', callback); }

    /** @returns {MediaElement} This instance, to allow chaining. Shows the native playback controls. */
    showControls() { this.elt.controls = true; return this; }

    /** @returns {MediaElement} This instance, to allow chaining. Hides the native playback controls. */
    hideControls() { this.elt.controls = false; return this; }
}

/**
 * p5.js-flavored DOM API (`createDiv()`, `createButton()`, `createSlider()`,
 * `select()`, and friends) for creating and managing ordinary page elements
 * alongside a sketch's `<canvas>`.
 *
 * @class
 */
class DOM {
    #root;
    #created;

    /**
     * @param {?(string|HTMLElement)} [container] - Where new elements are appended by default: a CSS selector or a raw node. Defaults to `document.body`.
     */
    constructor(container) {
        if (typeof document === 'undefined') throw new Error('DOM requires a browser environment.');
        this.#root = resolveContainer(container, document.body) || document.body;
        this.#created = new Set();

        // p5-style constant usable with Element#size()/DOM#createImg().
        this.AUTO = 'auto';
    }

    // ---------------------------------------------------------------
    // Helpers for create methods
    // ---------------------------------------------------------------

    /**
     * Helper for the `createXxx()` methods below: wraps a raw DOM node
     * (one you built yourself, or that a `createXxx()` method just built)
     * in an {@link Element}/{@link MediaElement}, appends it to `container`
     * if it isn't already attached anywhere, and registers it so {@link
     * DOM#removeElements} can find it later.
     *
     * @param {HTMLElement} node - Raw DOM node to wrap.
     * @param {Object} [options={}] - Extra behavior.
     * @param {boolean} [options.media=false] - Wrap as a {@link MediaElement} instead of a plain {@link Element}.
     * @param {?(string|HTMLElement)} [options.container] - Where to append `node`. Defaults to this instance's default container.
     * @returns {Element|MediaElement} The wrapped element.
     */
    addElement(node, { media = false, container } = {}) {
        if (!node.isConnected) {
            const target = resolveContainer(container, this.#root) || this.#root;
            target.appendChild(node);
        }
        const wrapped = media ? new MediaElement(node, this) : new Element(node, this);
        this.#created.add(wrapped);
        return wrapped;
    }

    /**
     * Un-registers a wrapper previously tracked by {@link DOM#addElement},
     * called by {@link Element#remove}. Not normally called directly.
     *
     * @private
     * @param {Element} wrapped - Wrapper to stop tracking.
     * @returns {void}
     */
    _unregister(wrapped) {
        this.#created.delete(wrapped);
    }

    // ---------------------------------------------------------------
    // Generic element creation
    // ---------------------------------------------------------------

    /**
     * Creates a new {@link Element}, wrapping a freshly-created DOM node of
     * the given tag.
     *
     * @param {string} tag - HTML tag name (e.g. `'div'`, `'label'`).
     * @param {string} [content=''] - Inner HTML/text to set on the new element.
     * @returns {Element} The newly-created element.
     */
    createElement(tag, content = '') {
        const node = document.createElement(tag);
        if (content) node.innerHTML = content;
        return this.addElement(node);
    }

    /**
     * Creates a `<div/>` element.
     *
     * @param {string} [html=''] - Inner HTML to set.
     * @returns {Element}
     */
    createDiv(html = '') { return this.createElement('div', html); }

    /**
     * Creates a paragraph (`<p/>`) element.
     *
     * @param {string} [html=''] - Inner HTML to set.
     * @returns {Element}
     */
    createP(html = '') { return this.createElement('p', html); }

    /**
     * Creates a `<span/>` element.
     *
     * @param {string} [html=''] - Inner HTML to set.
     * @returns {Element}
     */
    createSpan(html = '') { return this.createElement('span', html); }

    /**
     * Creates an `<a/>` element that links to another web page.
     *
     * @param {string} href - Destination URL.
     * @param {string} [html=href] - Link text/HTML. Defaults to `href` itself.
     * @param {string} [target] - `target` attribute (e.g. `'_blank'`).
     * @returns {Element}
     */
    createA(href, html = href, target) {
        const node = document.createElement('a');
        node.href = href;
        node.innerHTML = html;
        if (target) node.target = target;
        return this.addElement(node);
    }

    /**
     * Creates an `<img/>` element that can appear outside of the canvas.
     *
     * @param {string} src - Image URL.
     * @param {string} [alt=''] - Alternate text, for accessibility.
     * @param {?string} [crossOrigin] - `crossorigin` attribute (e.g. `'anonymous'`), for loading images from other origins.
     * @param {function(Element):void} [onload] - Called with this element once the image finishes loading.
     * @returns {Element}
     */
    createImg(src, alt = '', crossOrigin, onload) {
        const node = document.createElement('img');
        if (crossOrigin) node.crossOrigin = crossOrigin;
        node.src = src;
        node.alt = alt;
        const wrapped = this.addElement(node);
        if (onload) node.addEventListener('load', () => onload(wrapped), { once: true });
        return wrapped;
    }

    // ---------------------------------------------------------------
    // Form controls
    // ---------------------------------------------------------------

    /**
     * Creates a text `<input/>` element.
     *
     * @param {string} [value=''] - Initial value.
     * @param {string} [type='text'] - `type` attribute (e.g. `'text'`, `'password'`, `'number'`).
     * @returns {Element}
     */
    createInput(value = '', type = 'text') {
        const node = document.createElement('input');
        node.type = type;
        node.value = value;
        return this.addElement(node);
    }

    /**
     * Creates an `<input/>` element of type `'file'`, for file uploads.
     *
     * @param {function(Object):void} [callback] - Called once per selected file, with `{file, name, size, type, data}` (`data` is a base64 data URL).
     * @param {boolean} [multiple=false] - Whether more than one file can be selected at once.
     * @returns {Element}
     */
    createFileInput(callback, multiple = false) {
        const node = document.createElement('input');
        node.type = 'file';
        node.multiple = multiple;
        const wrapped = this.addElement(node);

        node.addEventListener('change', () => {
            if (!callback) return;
            for (const file of node.files) {
                const reader = new FileReader();
                reader.onload = () => callback({
                    file,
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    data: reader.result
                });
                reader.readAsDataURL(file);
            }
        });

        return wrapped;
    }

    /**
     * Creates a `<button/>` element.
     *
     * @param {string} label - Button text/HTML.
     * @param {string} [value] - `value` attribute.
     * @returns {Element}
     */
    createButton(label, value) {
        const node = document.createElement('button');
        node.innerHTML = label;
        if (value !== undefined) node.value = value;
        return this.addElement(node);
    }

    /**
     * Creates a checkbox `<input/>` element, wrapped in a `<label>` with
     * the given text.
     *
     * @param {string} [label=''] - Text label shown next to the checkbox.
     * @param {boolean} [checked=false] - Initial checked state.
     * @returns {Element} The `<label>` wrapper; the underlying checkbox `<input>` is `element.elt.querySelector('input')`, and `element.checked()` reads/writes its state directly.
     */
    createCheckbox(label = '', checked = false) {
        const wrap = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        wrap.appendChild(input);
        wrap.appendChild(document.createTextNode(label));

        const wrapped = this.addElement(wrap);
        /** @param {boolean} [state] - New checked state. @returns {Element|boolean} `wrapped` when setting, or the current checked state when reading. */
        wrapped.checked = (state) => {
            if (state === undefined) return input.checked;
            input.checked = state;
            return wrapped;
        };
        wrapped.value = () => (input.checked ? 1 : 0);
        return wrapped;
    }

    /**
     * Creates a color picker element (`<input type="color">`).
     *
     * @param {string} [value='#000000'] - Initial color, as a CSS hex string.
     * @returns {Element} The color picker; `element.color()` reads the current selection as `{hex, toString()}`.
     */
    createColorPicker(value = '#000000') {
        const node = document.createElement('input');
        node.type = 'color';
        node.value = value;
        const wrapped = this.addElement(node);
        /** @returns {{hex: string, toString: function(): string}} The current color. */
        wrapped.color = () => ({ hex: node.value, toString: () => node.value });
        return wrapped;
    }

    /**
     * Creates a dropdown menu `<select/>` element.
     *
     * @param {boolean} [multiple=false] - Whether more than one option can be selected at once.
     * @returns {Element} The `<select>` element, with `option()`/`selected()`/`disable()` methods added for managing its `<option>`s.
     */
    createSelect(multiple = false) {
        const node = document.createElement('select');
        node.multiple = multiple;
        const wrapped = this.addElement(node);

        /**
         * Adds a new `<option>`, or (called with one argument) selects the
         * option with that value.
         * @param {string} name - Option label/value, or the value to select.
         * @param {string} [value=name] - Option value, if different from its label.
         * @returns {Element} `wrapped`, to allow chaining.
         */
        wrapped.option = (name, value = name) => {
            let option = Array.from(node.options).find(o => o.value === String(name));
            if (!option) {
                option = document.createElement('option');
                option.value = value;
                option.textContent = name;
                node.appendChild(option);
            } else {
                option.selected = true;
            }
            return wrapped;
        };

        /**
         * Removes the `<option>` with the given value.
         * @param {string} name - Value of the option to remove.
         * @returns {Element} `wrapped`, to allow chaining.
         */
        wrapped.removeOption = (name) => {
            const option = Array.from(node.options).find(o => o.value === String(name));
            if (option) option.remove();
            return wrapped;
        };

        /**
         * @param {string} [value] - Value to select.
         * @returns {Element|string|string[]} `wrapped` when setting, or the currently-selected value(s) when reading.
         */
        wrapped.selected = (value) => {
            if (value === undefined) {
                return multiple
                    ? Array.from(node.selectedOptions).map(o => o.value)
                    : node.value;
            }
            node.value = value;
            return wrapped;
        };

        /** @param {boolean} [shouldDisable=true] - Whether the whole control should be disabled. @returns {Element} `wrapped`, to allow chaining. */
        wrapped.disable = (shouldDisable = true) => { node.disabled = shouldDisable; return wrapped; };

        return wrapped;
    }

    /**
     * Creates a radio button element: a `<div>` containing one `<input
     * type="radio">` per call to the returned element's `option()` method,
     * all sharing `name`.
     *
     * @param {string} [name] - Shared `name` attribute for the radio group. Auto-generated if omitted.
     * @returns {Element} The `<div>` group wrapper, with `option()`/`value()`/`selected()`/`disable()` methods added.
     */
    createRadio(name = `radio-${Math.random().toString(36).slice(2)}`) {
        const group = document.createElement('div');
        const wrapped = this.addElement(group);

        /**
         * Adds a new radio option.
         * @param {string} value - Value for this option.
         * @param {string} [label=value] - Text label shown next to it.
         * @returns {HTMLInputElement} The new `<input type="radio">` node.
         */
        wrapped.option = (value, label = value) => {
            const optionLabel = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = name;
            input.value = value;
            optionLabel.appendChild(input);
            optionLabel.appendChild(document.createTextNode(label));
            group.appendChild(optionLabel);
            return input;
        };

        /** @param {string} value - Value of the option to remove. @returns {void} */
        wrapped.removeOption = (value) => {
            const input = group.querySelector(`input[value="${CSS.escape(String(value))}"]`);
            if (input) input.closest('label').remove();
        };

        /**
         * @param {string} [value] - Value to select.
         * @returns {Element|string} `wrapped` when setting, or the currently-selected value when reading.
         */
        wrapped.value = wrapped.selected = (value) => {
            const inputs = group.querySelectorAll('input[type="radio"]');
            if (value === undefined) {
                const checked = Array.from(inputs).find(i => i.checked);
                return checked ? checked.value : '';
            }
            inputs.forEach(i => { i.checked = (i.value === String(value)); });
            return wrapped;
        };

        /** @param {boolean} [shouldDisable=true] - Whether all options should be disabled. @returns {Element} `wrapped`, to allow chaining. */
        wrapped.disable = (shouldDisable = true) => {
            group.querySelectorAll('input[type="radio"]').forEach(i => { i.disabled = shouldDisable; });
            return wrapped;
        };

        return wrapped;
    }

    /**
     * Creates a slider `<input/>` element (`<input type="range">`).
     *
     * @param {number} min - Minimum value.
     * @param {number} max - Maximum value.
     * @param {number} [value] - Initial value. Defaults to `min`.
     * @param {number} [step] - Step increment. `0` allows any value.
     * @returns {Element} The slider; `element.value()` reads/writes it as a Number.
     */
    createSlider(min, max, value = min, step) {
        const node = document.createElement('input');
        node.type = 'range';
        node.min = min;
        node.max = max;
        node.value = value;
        if (step !== undefined) node.step = step === 0 ? 'any' : step;
        return this.addElement(node);
    }

    // ---------------------------------------------------------------
    // Media
    // ---------------------------------------------------------------

    /**
     * Creates a hidden `<audio/>` element for simple audio playback.
     *
     * @param {string|string[]} [src] - One source URL, or several (the browser picks the first supported format).
     * @param {function(MediaElement):void} [callback] - Called with this element once enough of the file has loaded to play.
     * @returns {MediaElement}
     */
    createAudio(src, callback) {
        const node = document.createElement('audio');
        node.style.display = 'none';
        this._setMediaSource(node, src);
        const wrapped = this.addElement(node, { media: true });
        if (callback) node.addEventListener('canplaythrough', () => callback(wrapped), { once: true });
        return wrapped;
    }

    /**
     * Creates a `<video/>` element for simple audio/video playback.
     *
     * @param {string|string[]} [src] - One source URL, or several (the browser picks the first supported format).
     * @param {function(MediaElement):void} [callback] - Called with this element once enough of the file has loaded to play.
     * @returns {MediaElement}
     */
    createVideo(src, callback) {
        const node = document.createElement('video');
        this._setMediaSource(node, src);
        const wrapped = this.addElement(node, { media: true });
        if (callback) node.addEventListener('canplaythrough', () => callback(wrapped), { once: true });
        return wrapped;
    }

    /**
     * Creates a `<video/>` element that "captures" the audio/video stream
     * from the webcam and microphone, via `getUserMedia`.
     *
     * @param {string|Object} [type='video'] - `'video'`, `'audio'`, or a `getUserMedia` constraints object (`{video, audio}`).
     * @param {function(MediaElement):void} [callback] - Called with this element once the stream starts playing.
     * @returns {MediaElement}
     * @throws {Error} If the browser doesn't support `navigator.mediaDevices.getUserMedia`.
     */
    createCapture(type = 'video', callback) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('createCapture() requires navigator.mediaDevices.getUserMedia support.');
        }
        const constraints = typeof type === 'object'
            ? type
            : { video: type !== 'audio', audio: type === 'audio' || type === 'both' };

        const node = document.createElement('video');
        node.autoplay = true;
        node.muted = constraints.audio !== true;
        const wrapped = this.addElement(node, { media: true });

        navigator.mediaDevices.getUserMedia(constraints).then(stream => {
            node.srcObject = stream;
            wrapped.stream = stream;
            if (callback) node.addEventListener('playing', () => callback(wrapped), { once: true });
        });

        return wrapped;
    }

    /**
     * Applies one or more `src` URLs to a freshly-created `<audio>`/
     * `<video>` node, as either `node.src` (single string) or a set of
     * `<source>` children (array, letting the browser pick the first
     * format it supports).
     *
     * @private
     * @param {HTMLMediaElement} node - Target node.
     * @param {string|string[]} [src] - Source URL(s).
     * @returns {void}
     */
    _setMediaSource(node, src) {
        if (!src) return;
        if (Array.isArray(src)) {
            for (const url of src) {
                const source = document.createElement('source');
                source.src = url;
                node.appendChild(source);
            }
        } else {
            node.src = src;
        }
    }

    // ---------------------------------------------------------------
    // Removal / selection
    // ---------------------------------------------------------------

    /**
     * Removes all elements created by this {@link DOM} instance, including
     * any event handlers attached via the `mousePressed()`-style methods.
     *
     * @returns {void}
     */
    removeElements() {
        for (const wrapped of Array.from(this.#created)) wrapped.remove();
    }

    /**
     * Searches the page for the first element that matches the given CSS
     * selector string.
     *
     * @param {string} selector - CSS selector.
     * @param {?(string|HTMLElement)} [container] - Where to search. Defaults to the whole document.
     * @returns {?Element} The matched element, wrapped, or `null` if nothing matched.
     */
    select(selector, container) {
        const root = resolveContainer(container, document);
        if (!root) return null;
        const node = root.querySelector(selector);
        return node ? new Element(node, this) : null;
    }

    /**
     * Searches the page for all elements that match the given CSS selector
     * string.
     *
     * @param {string} selector - CSS selector.
     * @param {?(string|HTMLElement)} [container] - Where to search. Defaults to the whole document.
     * @returns {Element[]} Every matched element, wrapped (empty array if none matched).
     */
    selectAll(selector, container) {
        const root = resolveContainer(container, document);
        if (!root) return [];
        return Array.from(root.querySelectorAll(selector), node => new Element(node, this));
    }
}

// Static so Element#size() (defined above, before any DOM instance exists)
// can reference DOM.AUTO directly; also mirrored onto each instance in the
// constructor below for p5-style `myDom.AUTO` access.
DOM.AUTO = 'auto';
DOM.Element = Element;
DOM.MediaElement = MediaElement;

return DOM;
});