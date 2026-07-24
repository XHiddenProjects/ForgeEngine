'use strict';

// Image: a portable RGBA pixel buffer, independent of any particular
// canvas. Pixel operations (get/set/loadPixels/updatePixels/resize/
// filter/mask/blend/copy) work directly on a plain Uint8ClampedArray, so
// they run the same way in Node as in the browser - only the "get pixels
// onto/off of the screen" edges (loadImage() from a URL, image()/draw()
// onto a Canvas, save() to a file) need a real DOM/browser and degrade to
// a clear error message under plain Node, the same way Canvas/DOM already
// do elsewhere in this engine.
//
// Wrapped in the same IIFE pattern as the other engine files (see the
// comment at the top of transform.js) so this can be loaded either as a
// sibling <script> tag in the browser or via require() in Node.
(function (root, factory) {
    let ImageModule;
    if (typeof module === 'object' && module.exports) {
        ImageModule = factory(require('./color.js'));
        module.exports = ImageModule;
    } else {
        if (!root || !root.Color) throw new Error('image.js requires color.js to be loaded first.');
        ImageModule = factory(root.Color);
        root.Image = ImageModule.Image;
        root.loadImage = ImageModule.loadImage;
        root.createImage = ImageModule.createImage;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Color) {

const FILTERS = { THRESHOLD: 'threshold', GRAY: 'gray', OPAQUE: 'opaque', INVERT: 'invert', POSTERIZE: 'posterize', BLUR: 'blur' };
const BLEND_MODES = { BLEND: 'blend', ADD: 'add', DARKEST: 'darkest', LIGHTEST: 'lightest', MULTIPLY: 'multiply', SCREEN: 'screen', DIFFERENCE: 'difference' };

/**
 * A width x height buffer of RGBA pixels, stored as a flat
 * `Uint8ClampedArray` (four bytes per pixel, row-major, matching
 * `CanvasRenderingContext2D`'s `ImageData` layout) so it round-trips with
 * a real `<canvas>` for free in the browser, while every pixel-editing
 * method here works without one.
 *
 * @class
 */
class Image {
    /**
     * @param {number} [width=1]
     * @param {number} [height=1]
     */
    constructor(width = 1, height = 1) {
        this.width = Math.max(1, Math.floor(width));
        this.height = Math.max(1, Math.floor(height));
        /** @type {Uint8ClampedArray} Flat RGBA pixel data, `pixels[(y * width + x) * 4 + channel]`. Call {@link Image#loadPixels}/{@link Image#updatePixels} to sync with edits made another way (e.g. via {@link Image#copy}/{@link Image#mask}). */
        this.pixels = new Uint8ClampedArray(this.width * this.height * 4);
        this._frames = [{ data: this.pixels, delay: 100 }];
        this._frameIndex = 0;
        this._playing = false;
    }

    /**
     * Loads the current pixel data into {@link Image#pixels} (a no-op for
     * a plain Image, since `pixels` is always live - provided for API
     * symmetry with `updatePixels()`, and so code written against a real
     * canvas-backed image works unchanged here).
     * @returns {Image} This instance, to allow chaining.
     */
    loadPixels() {
        return this;
    }

    /**
     * Confirms that in-place edits to {@link Image#pixels} should take
     * effect (again, a no-op here - `pixels` is the single source of
     * truth - kept for API symmetry).
     * @returns {Image} This instance, to allow chaining.
     */
    updatePixels() {
        return this;
    }

    _index(x, y) {
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) return -1;
        return (Math.floor(y) * this.width + Math.floor(x)) * 4;
    }

    /**
     * Gets a single pixel, or the whole image, as `Color`-compatible RGBA arrays.
     * @param {number} [x] @param {number} [y]
     * @returns {number[]|Image} `[r, g, b, a]` for a single pixel, or a copy of this whole Image when called with no arguments.
     */
    get(x, y) {
        if (x === undefined) {
            const copy = new Image(this.width, this.height);
            copy.pixels.set(this.pixels);
            return copy;
        }
        const i = this._index(x, y);
        if (i < 0) return [0, 0, 0, 0];
        return [this.pixels[i], this.pixels[i + 1], this.pixels[i + 2], this.pixels[i + 3]];
    }

    /**
     * Sets the color of one pixel, or draws another Image into this one at `(x, y)`.
     * @param {number} x @param {number} y
     * @param {*|Image} value - Anything {@link Color.color} accepts, or another {@link Image} to stamp in at `(x, y)`.
     * @returns {Image} This instance, to allow chaining.
     */
    set(x, y, value) {
        if (value instanceof Image) {
            this.copy(value, 0, 0, value.width, value.height, x, y, value.width, value.height);
            return this;
        }
        const i = this._index(x, y);
        if (i < 0) return this;
        const c = Color.color(value);
        this.pixels[i] = Color.red(c);
        this.pixels[i + 1] = Color.green(c);
        this.pixels[i + 2] = Color.blue(c);
        this.pixels[i + 3] = Color.alpha(c);
        return this;
    }

    /**
     * Resizes the image, resampling with nearest-neighbor interpolation. `0` for either dimension scales it proportionally from the other.
     * @param {number} width @param {number} height
     * @returns {Image} This instance, to allow chaining.
     */
    resize(width, height) {
        if (!width && !height) return this;
        if (!width) width = Math.round((height / this.height) * this.width);
        if (!height) height = Math.round((width / this.width) * this.height);
        width = Math.max(1, Math.round(width));
        height = Math.max(1, Math.round(height));

        const out = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) {
            const srcY = Math.min(this.height - 1, Math.floor((y / height) * this.height));
            for (let x = 0; x < width; x++) {
                const srcX = Math.min(this.width - 1, Math.floor((x / width) * this.width));
                const si = (srcY * this.width + srcX) * 4;
                const di = (y * width + x) * 4;
                out[di] = this.pixels[si]; out[di + 1] = this.pixels[si + 1];
                out[di + 2] = this.pixels[si + 2]; out[di + 3] = this.pixels[si + 3];
            }
        }
        this.width = width; this.height = height; this.pixels = out;
        return this;
    }

    /**
     * Copies a rectangular region from a source image (or this image, when
     * called with 8 arguments and no `src`) into a region of this image,
     * nearest-neighbor scaling if the two regions differ in size.
     * @param {Image} [src] - Source image. Omit to copy within this image itself.
     * @param {number} sx @param {number} sy @param {number} sw @param {number} sh
     * @param {number} dx @param {number} dy @param {number} dw @param {number} dh
     * @returns {Image} This instance, to allow chaining.
     */
    copy(...args) {
        const hasSource = args[0] instanceof Image;
        const [source, sX, sY, sW, sH, dX, dY, dW, dH] = hasSource ? args : [this, ...args];
        // Snapshot the source first so a self-copy (source === this) with
        // overlapping regions never reads pixels this same call already wrote.
        const srcSnapshot = source === this ? source.get() : source;

        for (let y = 0; y < dH; y++) {
            const fromY = sY + Math.floor((y / dH) * sH);
            for (let x = 0; x < dW; x++) {
                const fromX = sX + Math.floor((x / dW) * sW);
                const si = srcSnapshot._index(fromX, fromY);
                if (si < 0) continue;
                const di = this._index(dX + x, dY + y);
                if (di < 0) continue;
                this.pixels[di] = srcSnapshot.pixels[si]; this.pixels[di + 1] = srcSnapshot.pixels[si + 1];
                this.pixels[di + 2] = srcSnapshot.pixels[si + 2]; this.pixels[di + 3] = srcSnapshot.pixels[si + 3];
            }
        }
        return this;
    }

    /**
     * Blends a region of a source image into a region of this image using a blend mode, scaling if the regions differ in size.
     * @param {Image} src @param {number} sx @param {number} sy @param {number} sw @param {number} sh
     * @param {number} dx @param {number} dy @param {number} dw @param {number} dh
     * @param {string} mode - One of {@link Image.BLEND_MODES} (`'blend'`, `'add'`, `'darkest'`, `'lightest'`, `'multiply'`, `'screen'`, `'difference'`).
     * @returns {Image} This instance, to allow chaining.
     */
    blend(src, sx, sy, sw, sh, dx, dy, dw, dh, mode = BLEND_MODES.BLEND) {
        const blend1 = (a, b) => {
            switch (mode) {
                case BLEND_MODES.ADD: return a + b;
                case BLEND_MODES.DARKEST: return Math.min(a, b);
                case BLEND_MODES.LIGHTEST: return Math.max(a, b);
                case BLEND_MODES.MULTIPLY: return (a * b) / 255;
                case BLEND_MODES.SCREEN: return 255 - ((255 - a) * (255 - b)) / 255;
                case BLEND_MODES.DIFFERENCE: return Math.abs(a - b);
                default: return b;
            }
        };
        for (let y = 0; y < dh; y++) {
            const fromY = sy + Math.floor((y / dh) * sh);
            for (let x = 0; x < dw; x++) {
                const fromX = sx + Math.floor((x / dw) * sw);
                const si = src._index(fromX, fromY);
                const di = this._index(dx + x, dy + y);
                if (si < 0 || di < 0) continue;
                this.pixels[di] = blend1(this.pixels[di], src.pixels[si]);
                this.pixels[di + 1] = blend1(this.pixels[di + 1], src.pixels[si + 1]);
                this.pixels[di + 2] = blend1(this.pixels[di + 2], src.pixels[si + 2]);
                this.pixels[di + 3] = Math.max(this.pixels[di + 3], src.pixels[si + 3]);
            }
        }
        return this;
    }

    /**
     * Masks this image with another same-sized image's alpha (or brightness, if fully opaque) channel.
     * @param {Image} maskImage
     * @returns {Image} This instance, to allow chaining.
     */
    mask(maskImage) {
        for (let i = 0, n = this.pixels.length / 4; i < n; i++) {
            const mi = i * 4;
            const alpha = maskImage.pixels[mi + 3] < 255
                ? maskImage.pixels[mi + 3]
                : Math.round(0.299 * maskImage.pixels[mi] + 0.587 * maskImage.pixels[mi + 1] + 0.114 * maskImage.pixels[mi + 2]);
            this.pixels[mi + 3] = Math.round((this.pixels[mi + 3] * alpha) / 255);
        }
        return this;
    }

    /**
     * Applies an image filter in place.
     * @param {string} type - One of {@link Image.FILTERS}.
     * @param {number} [param] - `THRESHOLD` cutoff (`0`-`1`, default `0.5`) or `POSTERIZE` level count (default `4`); ignored by other filters.
     * @returns {Image} This instance, to allow chaining.
     */
    filter(type, param) {
        const p = this.pixels;
        switch (type) {
            case FILTERS.GRAY:
                for (let i = 0; i < p.length; i += 4) {
                    const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
                    p[i] = p[i + 1] = p[i + 2] = g;
                }
                break;
            case FILTERS.INVERT:
                for (let i = 0; i < p.length; i += 4) { p[i] = 255 - p[i]; p[i + 1] = 255 - p[i + 1]; p[i + 2] = 255 - p[i + 2]; }
                break;
            case FILTERS.OPAQUE:
                for (let i = 3; i < p.length; i += 4) p[i] = 255;
                break;
            case FILTERS.THRESHOLD: {
                const cutoff = (param ?? 0.5) * 255;
                for (let i = 0; i < p.length; i += 4) {
                    const g = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
                    const v = g >= cutoff ? 255 : 0;
                    p[i] = p[i + 1] = p[i + 2] = v;
                }
                break;
            }
            case FILTERS.POSTERIZE: {
                const levels = Math.max(2, Math.round(param ?? 4));
                const step = 255 / (levels - 1);
                for (let i = 0; i < p.length; i += 4) {
                    p[i] = Math.round(Math.round(p[i] / step) * step);
                    p[i + 1] = Math.round(Math.round(p[i + 1] / step) * step);
                    p[i + 2] = Math.round(Math.round(p[i + 2] / step) * step);
                }
                break;
            }
            case FILTERS.BLUR: {
                const radius = Math.max(1, Math.round(param ?? 1));
                const src = this.pixels.slice();
                for (let y = 0; y < this.height; y++) {
                    for (let x = 0; x < this.width; x++) {
                        let r = 0, g = 0, b = 0, a = 0, count = 0;
                        for (let ky = -radius; ky <= radius; ky++) {
                            for (let kx = -radius; kx <= radius; kx++) {
                                const si = this._index(x + kx, y + ky);
                                if (si < 0) continue;
                                r += src[si]; g += src[si + 1]; b += src[si + 2]; a += src[si + 3]; count++;
                            }
                        }
                        const di = this._index(x, y);
                        p[di] = r / count; p[di + 1] = g / count; p[di + 2] = b / count; p[di + 3] = a / count;
                    }
                }
                break;
            }
            default:
                throw new Error(`Image#filter(): unknown filter type "${type}". Use one of ${Object.values(FILTERS).join(', ')}.`);
        }
        return this;
    }

    /**
     * Tints the image by multiplying every pixel's RGB by a color (alpha of the tint color scales the image's own alpha).
     * @param {*} color
     * @returns {Image} This instance, to allow chaining.
     */
    tint(color) {
        const c = Color.color(color);
        const [tr, tg, tb, ta] = [Color.red(c) / 255, Color.green(c) / 255, Color.blue(c) / 255, Color.alpha(c) / 255];
        const p = this.pixels;
        for (let i = 0; i < p.length; i += 4) {
            p[i] *= tr; p[i + 1] *= tg; p[i + 2] *= tb; p[i + 3] *= ta;
        }
        return this;
    }

    /**
     * Removes any tint previously applied, by re-deriving pixel values from... actually tint() is destructive here (matching how a real GPU tint is a rendering-time effect, not stored separately) - noTint() is a no-op on a plain Image and only meaningful when this Image is being drawn onto a canvas via {@link Image#draw} with a tint argument.
     * @returns {Image} This instance, to allow chaining.
     */
    noTint() {
        return this;
    }

    /**
     * Draws this image onto a {@link Canvas}'s 2D context.
     * @param {Canvas} canvas - A Canvas already created with a `'2d'` context.
     * @param {number} [dx=0] @param {number} [dy=0] @param {number} [dw=this.width] @param {number} [dh=this.height]
     * @returns {Image} This instance, to allow chaining.
     * @throws {Error} Outside a browser, or if `ImageData` isn't available.
     */
    draw(canvas, dx = 0, dy = 0, dw = this.width, dh = this.height) {
        if (typeof ImageData === 'undefined') throw new Error('Image#draw() requires a browser (ImageData is not available in this environment).');
        const ctx = canvas.context();
        const imageData = new ImageData(new Uint8ClampedArray(this.pixels), this.width, this.height);
        if (dw === this.width && dh === this.height) {
            ctx.putImageData(imageData, dx, dy);
            return this;
        }
        // putImageData() can't scale - draw through an offscreen canvas instead.
        const off = document.createElement('canvas');
        off.width = this.width; off.height = this.height;
        off.getContext('2d').putImageData(imageData, 0, 0);
        ctx.drawImage(off, dx, dy, dw, dh);
        return this;
    }

    // -----------------------------------------------------------------
    // Animated GIF-style frame support (multi-frame images).
    // -----------------------------------------------------------------

    /** @returns {number} The number of frames in this image (`1` unless frames were added, e.g. via a GIF loader). */
    numFrames() {
        return this._frames.length;
    }

    /** @returns {number} The index of the current frame. */
    getCurrentFrame() {
        return this._frameIndex;
    }

    /**
     * Sets the current frame, swapping {@link Image#pixels} to that frame's data.
     * @param {number} index
     * @returns {Image} This instance, to allow chaining.
     */
    setFrame(index) {
        if (index < 0 || index >= this._frames.length) throw new Error(`Image#setFrame(): index ${index} out of range (0-${this._frames.length - 1}).`);
        this._frames[this._frameIndex].data = this.pixels;
        this._frameIndex = index;
        this.pixels = this._frames[index].data;
        return this;
    }

    /**
     * Changes the delay before advancing away from a given frame.
     * @param {number} index @param {number} delayMs
     * @returns {Image} This instance, to allow chaining.
     */
    delay(index, delayMs) {
        if (this._frames[index]) this._frames[index].delay = delayMs;
        return this;
    }

    /** Advances to the next frame, looping back to the first after the last. @returns {Image} This instance, to allow chaining. */
    _advanceFrame() {
        return this.setFrame((this._frameIndex + 1) % this._frames.length);
    }

    /** Restarts playback at the first frame. @returns {Image} This instance, to allow chaining. */
    reset() {
        return this.setFrame(0);
    }

    /** Plays a multi-frame image's animation (advancing frames automatically over time, if driven by an external tick - see {@link Image#pause}). @returns {Image} This instance, to allow chaining. */
    play() {
        this._playing = true;
        return this;
    }

    /** Pauses playback started by {@link Image#play}. @returns {Image} This instance, to allow chaining. */
    pause() {
        this._playing = false;
        return this;
    }
}

/**
 * Creates a new, blank (fully transparent) Image.
 * @param {number} [width=1] @param {number} [height=1]
 * @returns {Image}
 */
function createImage(width, height) {
    return new Image(width, height);
}

/**
 * Loads an image from a URL and resolves it as a pixel-populated {@link
 * Image}. Browser-only (decodes via an `HTMLImageElement` onto an
 * offscreen canvas to read its pixels back).
 *
 * @param {string} src - Image URL (or data: URI).
 * @returns {Promise<Image>}
 */
function loadImage(src) {
    // NOTE: checks `window.Image` (the browser's built-in HTMLImageElement
    // constructor), not the bare identifier `Image` - the class declared
    // above in this same module scope is *also* named `Image`, which would
    // always shadow and satisfy a bare `typeof Image` check.
    if (typeof document === 'undefined' || typeof window === 'undefined' || typeof window.Image === 'undefined') {
        return Promise.reject(new Error('loadImage() requires a browser environment to decode image files.'));
    }
    return new Promise((resolve, reject) => {
        const el = new window.Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => {
            const off = document.createElement('canvas');
            off.width = el.naturalWidth; off.height = el.naturalHeight;
            const ctx = off.getContext('2d');
            ctx.drawImage(el, 0, 0);
            const data = ctx.getImageData(0, 0, off.width, off.height);
            const img = createImage(off.width, off.height);
            img.pixels.set(data.data);
            resolve(img);
        };
        el.onerror = () => reject(new Error(`loadImage(): failed to load "${src}".`));
        el.src = src;
    });
}

return { Image, createImage, loadImage, FILTERS, BLEND_MODES };
});