'use strict';

const fs = require('fs');
const zlib = require('zlib');
const constants = require('./constants.js');

// ---------------------------------------------------------------------------
// Minimal PNG encoder/decoder using only Node built-ins (zlib for
// deflate/inflate, no p5, no native canvas). Supports 8-bit RGBA truecolor,
// which covers everything this module needs to read/write.
// ---------------------------------------------------------------------------
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Computes the CRC-32 checksum of a byte buffer.
 *
 * @param {Buffer|Uint8Array|*} buf - Source byte buffer.
 *
 * @returns {number} The resulting value.
 */
function crc32(buf) {
  let crc = ~0;
  /**
   * Performs the for operation.
   *
   * @param {string|number|*} [let i=0; i < buf.length; i++] - Let i value.
   *
   * @returns {*} The resulting value.
   */
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}
/**
 * Builds a complete PNG chunk including its length and checksum.
 *
 * @param {string|number|*} type - Type value.
 * @param {Buffer|Uint8Array|*} data - Data value.
 *
 * @returns {Buffer} The resulting value.
 */
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/**
 * Encodes an 8-bit RGBA pixel buffer as a PNG file.
 *
 * @param {number} width - Width value.
 * @param {number} height - Height value.
 * @param {string|number|*} rgba /* Uint8ClampedArray/Buffer - Rgba /* uint8clampedarray/buffer value.
 *
 * @returns {Buffer} The resulting value.
 */
function encodePNG(width, height, rgba /* Uint8ClampedArray/Buffer, length w*h*4 */) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type: RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // raw scanlines, each prefixed with filter byte 0 (none)
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  /**
   * Performs the for operation.
   *
   * @param {string|number|*} [let y=0; y < height; y++] - Let y value.
   *
   * @returns {*} The resulting value.
   */
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer || rgba, rgba.byteOffset || 0).copy(
      raw, y * (stride + 1) + 1, y * stride, y * stride + stride
    );
  }
  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

/**
 * Reads core image metadata from a PNG header.
 *
 * @param {Buffer|Uint8Array|*} buf - Source byte buffer.
 *
 * @throws {Error} If the buffer does not contain a PNG signature.
 *
 * @returns {{width:number,height:number,bitDepth:number,colorType:number}} The resulting value.
 */
function decodePNGHeader(buf) {
  /**
   * Performs the if operation.
   *
   * @param {string|number|*} !buf.slice(0, 8 - !buf.slice(0, 8 value.
   *
   * @returns {*} The resulting value.
   */
  if (!buf.slice(0, 8).equals(PNG_SIGNATURE)) throw new Error('Not a PNG file');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  return { width, height, bitDepth, colorType };
}

/**
 * Returns the Paeth predictor used by PNG scanline filtering.
 *
 * @param {number} a - A value.
 * @param {number} b - B value.
 * @param {string|number|*} c - C value.
 *
 * @returns {number} The resulting value.
 */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  /**
   * Performs the if operation.
   *
   * @param {string|number|*} [pa <=pb && pa <= pc] - Pa < value.
   *
   * @returns {*} The resulting value.
   */
  if (pa <= pb && pa <= pc) return a;
  /**
   * Performs the if operation.
   *
   * @param {string|number|*} [pb <=pc] - Pb < value.
   *
   * @returns {*} The resulting value.
   */
  if (pb <= pc) return b;
  return c;
}

/** Decodes an 8-bit RGB/RGBA PNG (no interlacing) into a flat RGBA buffer. */
/**
 * Decodes a non-interlaced 8-bit PNG into RGBA pixels.
 *
 * @param {Buffer|Uint8Array|*} buf - Source byte buffer.
 *
 * @throws {Error} If the PNG uses an unsupported bit depth.
 *
 * @returns {{width:number,height:number,pixels:Buffer}} The resulting value.
 */
function decodePNG(buf) {
  const { width, height, bitDepth, colorType } = decodePNGHeader(buf);
  /**
   * Performs the if operation.
   *
   * @param {string|number|*} [bitDepth !== 8] - Bitdepth ! value.
   *
   * @returns {*} The resulting value.
   */
  if (bitDepth !== 8) throw new Error('decodePNG: only 8-bit PNGs are supported');
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;

  let idatChunks = [];
  let offset = 8;
  /**
   * Performs the while operation.
   *
   * @param {string|number|*} offset < buf.length - Offset < buf.length value.
   *
   * @returns {*} The resulting value.
   */
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.slice(offset + 8, offset + 8 + len);
    if (type === 'IDAT') idatChunks.push(data);
    offset += 8 + len + 4;
  }
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let prevLine = Buffer.alloc(stride);

  /**
   * Performs the for operation.
   *
   * @param {string|number|*} [let y=0; y < height; y++] - Let y value.
   *
   * @returns {*} The resulting value.
   */
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const line = Buffer.from(raw.slice(rowStart + 1, rowStart + 1 + stride));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prevLine[x];
      const c = x >= channels ? prevLine[x - channels] : 0;
      let val = line[x];
      if (filter === 1) val = (val + a) & 255;
      else if (filter === 2) val = (val + b) & 255;
      else if (filter === 3) val = (val + Math.floor((a + b) / 2)) & 255;
      else if (filter === 4) val = (val + paeth(a, b, c)) & 255;
      line[x] = val;
    }
    for (let x = 0; x < width; x++) {
      const si = x * channels, di = (y * width + x) * 4;
      out[di] = line[si];
      out[di + 1] = channels >= 3 ? line[si + 1] : line[si];
      out[di + 2] = channels >= 3 ? line[si + 2] : line[si];
      out[di + 3] = channels === 4 ? line[si + 3] : 255;
    }
    prevLine = line;
  }
  return { width, height, pixels: out };
}

// ---------------------------------------------------------------------------
// Images / Pixels
// ---------------------------------------------------------------------------
class Images {
  /**
   * Creates a new Images instance.
   *
   * @param {number} [width=0] - Width value.
   * @param {number} [height=0] - Height value.
   */
  constructor(width = 0, height = 0) {
    this._width = width;
    this._height = height;
    this._pixels = Buffer.alloc(width * height * 4, 0);
    this._tintColor = null;
    this._loaded = width > 0 && height > 0;
  }
  /**
   * Returns the current width value.
   *
   * @returns {number} The resulting value.
   */
  get width() { return this._width; }
  /**
   * Returns the current height value.
   *
   * @returns {number} The resulting value.
   */
  get height() { return this._height; }

  /**
   * Creates a blank RGBA image.
   *
   * @param {number} w - W value.
   * @param {number} h - H value.
   *
   * @returns {Images} This instance for chaining.
   */
  createImage(w, h) { return new Images(w, h); }

  /**
   * Loads and decodes a PNG image from disk.
   *
   * @param {string|number|*} filePath - Destination or source file path.
   *
   * @throws {Error} If the source is not a PNG image.
   *
   * @returns {Images} This instance for chaining.
   */
  loadImage(filePath) {
    const buf = fs.readFileSync(filePath);
    if (buf.slice(0, 4).toString('hex') !== '89504e47') {
      throw new Error('loadImage: only PNG is supported by this headless implementation');
    }
    const { width, height, pixels } = decodePNG(buf);
    const img = new Images(width, height);
    img._pixels = pixels;
    img._loaded = true;
    return img;
  }

  /**
   * Encodes and saves an image as PNG.
   *
   * @param {Images} img - Img value.
   * @param {string|number|*} filePath - Destination or source file path.
   *
   * @returns {string} The resulting value.
   */
  saveCanvas(img, filePath) {
    const png = encodePNG(img.width, img.height, img.pixelsRef());
    fs.writeFileSync(filePath, png);
    return filePath;
  }
  /**
   * Saves an image to disk.
   *
   * @param {Images} img - Img value.
   * @param {string|number|*} filePath - Destination or source file path.
   *
   * @returns {boolean|string} The resulting value.
   */
  save(img, filePath) { return this.saveCanvas(img, filePath); }

  /**
   * Returns the underlying mutable pixel buffer.
   *
   * @returns {Buffer} The resulting value.
   */
  pixelsRef() { return this._pixels; }
  /**
   * Returns the current pixel buffer for direct access.
   *
   * @returns {Buffer} The resulting value.
   */
  loadPixels() { return this._pixels; }
  /**
   * Replaces the current pixel buffer.
   *
   * @param {Buffer|Uint8Array|*} pixels - Pixels value.
   *
   * @returns {Images} This instance for chaining.
   */
  updatePixels(pixels) { if (pixels) this._pixels = Buffer.from(pixels); return this; }

  /**
   * Returns the image, a cropped image, or a pixel value.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} w - W value.
   * @param {number} h - H value.
   *
   * @returns {Images|number[]} The resulting value.
   */
  get(x, y, w, h) {
    if (x === undefined) return this;
    if (w !== undefined) {
      const sub = new Images(w, h);
      for (let row = 0; row < h; row++) {
        this._pixels.copy(sub._pixels, row * w * 4, ((y + row) * this._width + x) * 4, ((y + row) * this._width + x + w) * 4);
      }
      return sub;
    }
    const i = (y * this._width + x) * 4;
    return [this._pixels[i], this._pixels[i + 1], this._pixels[i + 2], this._pixels[i + 3]];
  }
  /**
   * Sets one pixel from RGBA channels or a color-like object.
   *
   * @param {number} x - X value.
   * @param {number} y - Y value.
   * @param {number} value - Value value.
   *
   * @returns {Images} This instance for chaining.
   */
  set(x, y, value) {
    const i = (y * this._width + x) * 4;
    if (Array.isArray(value)) {
      this._pixels[i] = value[0]; this._pixels[i + 1] = value[1];
      this._pixels[i + 2] = value[2]; this._pixels[i + 3] = value[3] ?? 255;
    } else if (value && typeof value.toArray === 'function') {
      const [r, g, b, a] = value.toArray();
      this._pixels[i] = r; this._pixels[i + 1] = g; this._pixels[i + 2] = b; this._pixels[i + 3] = a;
    }
    return this;
  }
  /**
   * Returns an independent copy of the vector.
   *
   * @param {Images} src - Src value.
   * @param {number} sx - Sx value.
   * @param {number} sy - Sy value.
   * @param {number} sw - Sw value.
   * @param {number} sh - Sh value.
   * @param {number} dx - Dx value.
   * @param {number} dy - Dy value.
   * @param {number} dw - Dw value.
   * @param {number} dh - Dh value.
   *
   * @returns {Vector} The resulting value.
   */
  copy(src, sx, sy, sw, sh, dx, dy, dw, dh) {
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const srcX = sx + Math.floor((x / dw) * sw);
        const srcY = sy + Math.floor((y / dh) * sh);
        this.set(dx + x, dy + y, src.get(srcX, srcY));
      }
    }
    return this;
  }
  /**
   * Blends a source image region into this image.
   *
   * @param {Images} src - Src value.
   * @param {number} sx - Sx value.
   * @param {number} sy - Sy value.
   * @param {number} sw - Sw value.
   * @param {number} sh - Sh value.
   * @param {number} dx - Dx value.
   * @param {number} dy - Dy value.
   * @param {number} dw - Dw value.
   * @param {number} dh - Dh value.
   * @param {string|number|*} [mode=constants.BLEND] - Operation or rendering mode.
   *
   * @returns {Images} This instance for chaining.
   */
  blend(src, sx, sy, sw, sh, dx, dy, dw, dh, mode = constants.BLEND) {
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const [sr, sg, sb, sa] = src.get(sx + x, sy + y);
        const [dr, dg, db] = this.get(dx + x, dy + y);
        const a = sa / 255;
        const blended = mode === constants.MULTIPLY
          ? [dr * sr / 255, dg * sg / 255, db * sb / 255]
          : [dr + (sr - dr) * a, dg + (sg - dg) * a, db + (sb - db) * a];
        this.set(dx + x, dy + y, [...blended.map(v => Math.round(v)), 255]);
      }
    }
    return this;
  }
  /**
   * Resizes the image using nearest-neighbor sampling.
   *
   * @param {number} w - W value.
   * @param {number} h - H value.
   *
   * @returns {Images} This instance for chaining.
   */
  resize(w, h) {
    const out = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcX = Math.min(this._width - 1, Math.floor((x / w) * this._width));
        const srcY = Math.min(this._height - 1, Math.floor((y / h) * this._height));
        const si = (srcY * this._width + srcX) * 4;
        const di = (y * w + x) * 4;
        out[di] = this._pixels[si]; out[di + 1] = this._pixels[si + 1];
        out[di + 2] = this._pixels[si + 2]; out[di + 3] = this._pixels[si + 3];
      }
    }
    this._width = w; this._height = h; this._pixels = out;
    return this;
  }
  /**
   * Applies an in-place image filter.
   *
   * @param {string|number|*} type - Type value.
   * @param {number} param - Param value.
   *
   * @returns {Images} This instance for chaining.
   */
  filter(type, param) {
    const n = this._width * this._height;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const [r, g, b, a] = [this._pixels[o], this._pixels[o + 1], this._pixels[o + 2], this._pixels[o + 3]];
      if (type === constants.GRAY) {
        const gray = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
        this._pixels[o] = this._pixels[o + 1] = this._pixels[o + 2] = gray;
      } else if (type === constants.INVERT) {
        this._pixels[o] = 255 - r; this._pixels[o + 1] = 255 - g; this._pixels[o + 2] = 255 - b;
      } else if (type === constants.THRESHOLD) {
        const level = (param ?? 0.5) * 255;
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const v = lum >= level ? 255 : 0;
        this._pixels[o] = this._pixels[o + 1] = this._pixels[o + 2] = v;
      } else if (type === constants.POSTERIZE) {
        const levels = Math.max(2, Math.round(param || 4));
        const step = 255 / (levels - 1);
        this._pixels[o] = Math.round(Math.round(r / step) * step);
        this._pixels[o + 1] = Math.round(Math.round(g / step) * step);
        this._pixels[o + 2] = Math.round(Math.round(b / step) * step);
      } else if (type === constants.OPAQUE) {
        this._pixels[o + 3] = 255;
      }
    }
    if (type === constants.BLUR) this._boxBlur(Math.max(1, Math.round(param || 1)));
    return this;
  }
  /**
   * Applies an in-place box blur.
   *
   * @param {number} radius - Radius value.
   *
   * @returns {*} The resulting value.
   */
  _boxBlur(radius) {
    const w = this._width, h = this._height;
    const src = Buffer.from(this._pixels);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0, count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const si = (ny * w + nx) * 4;
            r += src[si]; g += src[si + 1]; b += src[si + 2]; a += src[si + 3]; count++;
          }
        }
        const di = (y * w + x) * 4;
        this._pixels[di] = Math.round(r / count);
        this._pixels[di + 1] = Math.round(g / count);
        this._pixels[di + 2] = Math.round(b / count);
        this._pixels[di + 3] = Math.round(a / count);
      }
    }
  }
  /**
   * Replaces image alpha values using a mask image’s red channel.
   *
   * @param {Images} maskImg - Maskimg value.
   *
   * @returns {Images} This instance for chaining.
   */
  mask(maskImg) {
    const n = this._width * this._height;
    for (let i = 0; i < n; i++) {
      this._pixels[i * 4 + 3] = maskImg.pixelsRef()[i * 4]; // use red channel as alpha
    }
    return this;
  }
  /**
   * Stores tint arguments for subsequent rendering.
   *
   * @param {string|number|*} ...args - Args value.
   *
   * @returns {Images} This instance for chaining.
   */
  tint(...args) { this._tintColor = args; return this; }
  /**
   * Clears the current tint.
   *
   * @returns {Images} This instance for chaining.
   */
  noTint() { this._tintColor = null; return this; }
  /**
   * Returns this headless image instance.
   *
   * @returns {Images} This instance for chaining.
   */
  image() { return this; } // headless: no canvas to draw into; returns self for chaining
  /**
   * Provides a chainable image-mode compatibility method.
   *
   * @returns {Images} This instance for chaining.
   */
  imageMode() { return this; }
  /**
   * Returns the fixed headless pixel density.
   *
   * @returns {*} The resulting value.
   */
  pixelDensity() { return 1; }
}

class GIF {
  /**
   * Creates a new GIF instance.
   *
   * @param {Array} [frames=[]] - Frames value.
   * @param {string|number|*} [delayMs=100] - Delayms value.
   */
  constructor(frames = [], delayMs = 100) {
    this.frames = frames; // array of Images
    this._delay = delayMs;
    this._index = 0;
    this._playing = false;
  }
  /**
   * Gets or sets the delay between GIF frames.
   *
   * @param {number} ms - Ms value.
   *
   * @returns {GIF} This instance for chaining.
   */
  delay(ms) { if (ms === undefined) return this._delay; this._delay = ms; return this; }
  /**
   * Returns the number of frames.
   *
   * @returns {number} The resulting value.
   */
  numFrames() { return this.frames.length; }
  /**
   * Returns the active frame.
   *
   * @returns {Images} The resulting value.
   */
  getCurrentFrame() { return this.frames[this._index]; }
  /**
   * Selects a frame by its clamped index.
   *
   * @param {number} i - I value.
   *
   * @returns {GIF} This instance for chaining.
   */
  setFrame(i) { this._index = Math.max(0, Math.min(this.frames.length - 1, i)); return this; }
  /**
   * Resets playback to the first frame.
   *
   * @returns {GIF} This instance for chaining.
   */
  reset() { this._index = 0; return this; }
  /**
   * Starts animated playback.
   *
   * @returns {GIF} This instance for chaining.
   */
  play() { this._playing = true; return this; }
  /**
   * Pauses animated playback.
   *
   * @returns {GIF} This instance for chaining.
   */
  pause() { this._playing = false; return this; }
  /**
   * Advances playback to the next frame.
   *
   * @returns {number} The resulting value.
   */
  advance() {
    if (!this._playing) return this._index;
    this._index = (this._index + 1) % this.frames.length;
    return this._index;
  }
  /**
   * Saves every frame as a numbered PNG file.
   *
   * @param {string|number|*} dirPath - Dirpath value.
   * @param {string|number|*} imagesInstance - Imagesinstance value.
   *
   * @returns {string[]} The resulting value.
   */
  saveFrames(dirPath, imagesInstance) {
    const paths = this.frames.map((frame, i) => {
      const filePath = `${dirPath}/frame_${String(i).padStart(3, '0')}.png`;
      imagesInstance.saveCanvas(frame, filePath);
      return filePath;
    });
    return paths;
  }
}

module.exports = { Images, GIF, encodePNG, decodePNG };
