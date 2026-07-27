'use strict';

const fs = require('fs');
const constants = require('./constants.js');

/**
 * Determines whether a path is an HTTP or HTTPS URL.
 *
 * @param {*} p - P value.
 *
 * @returns {boolean} The resulting value.
 */
function isURL(p) { return /^https?:\/\//i.test(p); }
/**
 * Clamps a number to an inclusive range.
 *
 * @param {number} n - N value.
 * @param {number} low - Low value.
 * @param {number} high - High value.
 *
 * @returns {number} The resulting value.
 */
function clamp(n, low, high) { return Math.max(low, Math.min(high, n)); }

// =============================================================================
// Virtual Web Audio shim
//
// Node has no Web Audio API (no real audio thread, no speakers to render
// to). Every class in this file used to be built directly on the browser's
// `AudioContext` — headless now, they're built on this instead: a small,
// dependency-free stand-in that tracks the same node graph, the same
// parameters, and the same timing a real `AudioContext` would, using
// `setTimeout`/wall-clock time in place of an audio thread (the same trick
// structure.js uses for its draw loop). Nothing here produces actual sound;
// a real front-end can later replay the exact same `connect()`/`start()`/
// `setValueAtTime()` calls against a genuine `AudioContext` to make it
// audible. This keeps the higher-level classes below (Oscillator, Envelope,
// SoundFile, ...) — and the game code that calls them — identical to what
// they'd look like on top of the real thing.
// =============================================================================

/**
 * A scheduled, automatable parameter — the headless equivalent of
 * `AudioParam`. Values set for "now" apply immediately; values scheduled
 * for the future are applied via a real timer once that time arrives.
 */
class VirtualAudioParam {
  /**
   * Creates a new VirtualAudioParam instance.
   *
   * @param {number} defaultValue - Defaultvalue value.
   * @param {*} ctx - Ctx value.
   */
  constructor(defaultValue, ctx) {
    this.value = defaultValue;
    this._ctx = ctx;
    this._timer = null;
  }
  /**
   * Schedules a parameter value at an audio-context time.
   *
   * @param {*} value - Value value.
   * @param {number} time - Time value.
   *
   * @returns {VirtualAudioParam} This instance for chaining.
   */
  setValueAtTime(value, time) { this._schedule(value, time); return this; }
  /**
   * Schedules a linear ramp to a target value.
   *
   * @param {*} value - Value value.
   * @param {number} time - Time value.
   *
   * @returns {VirtualAudioParam} This instance for chaining.
   */
  linearRampToValueAtTime(value, time) { this._schedule(value, time); return this; }
  /**
   * Schedules an exponential ramp to a target value.
   *
   * @param {*} value - Value value.
   * @param {number} time - Time value.
   *
   * @returns {VirtualAudioParam} This instance for chaining.
   */
  exponentialRampToValueAtTime(value, time) { this._schedule(value, time); return this; }
  /**
   * Schedules a value curve over a duration.
   *
   * @param {Array} curve - Curve value.
   * @param {number} time - Time value.
   * @param {number} duration - Duration value.
   *
   * @returns {VirtualAudioParam} This instance for chaining.
   */
  setValueCurveAtTime(curve, time, duration) { this._schedule(curve[curve.length - 1], time + duration); return this; }
  /**
   * Cancels the pending scheduled parameter update.
   *
   * @returns {VirtualAudioParam} This instance for chaining.
   */
  cancelScheduledValues() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    return this;
  }
  /**
   * Applies or schedules a virtual audio-parameter value.
   *
   * @param {*} value - Value value.
   * @param {number} time - Time value.
   *
   * @returns {VirtualAudioParam} This instance for chaining.
   */
  _schedule(value, time) {
    this.cancelScheduledValues();
    const delayMs = (time - this._ctx.currentTime) * 1000;
    if (delayMs <= 0) { this.value = value; return; }
    this._timer = setTimeout(() => { this.value = value; this._timer = null; }, delayMs);
    if (this._timer.unref) this._timer.unref();
  }
}

/** Base class for every virtual node — tracks outgoing connections only; there's no real signal to carry. */
class VirtualAudioNode {
  /**
   * Creates a new VirtualAudioNode instance.
   *
   * @param {*} kind - Kind value.
   * @param {*} ctx - Ctx value.
   */
  constructor(kind, ctx) {
    this.kind = kind;
    this.ctx = ctx;
    this._outputs = new Set();
  }
  /**
   * Connects this audio node to a destination.
   *
   * @param {SoundNode|VirtualAudioNode|Object} dest - Dest value.
   *
   * @returns {*} The resulting value.
   */
  connect(dest) { this._outputs.add(dest); return dest; }
  /**
   * Disconnects one or all outgoing audio connections.
   *
   * @param {SoundNode|VirtualAudioNode|Object} dest - Dest value.
   *
   * @returns {VirtualAudioNode} This instance for chaining.
   */
  disconnect(dest) {
    if (dest === undefined) this._outputs.clear();
    else this._outputs.delete(dest);
    return this;
  }
}

class VirtualGainNode extends VirtualAudioNode {
  /**
   * Creates a new VirtualGainNode instance.
   *
   * @param {*} ctx - Ctx value.
   */
  constructor(ctx) { super('gain', ctx); this.gain = new VirtualAudioParam(1, ctx); }
}
class VirtualBiquadFilterNode extends VirtualAudioNode {
  /**
   * Creates a new VirtualBiquadFilterNode instance.
   *
   * @param {*} ctx - Ctx value.
   */
  constructor(ctx) {
    super('biquad', ctx);
    this.type = 'lowpass';
    this.frequency = new VirtualAudioParam(350, ctx);
    this.Q = new VirtualAudioParam(1, ctx);
    this.gain = new VirtualAudioParam(0, ctx);
  }
}
class VirtualDelayNode extends VirtualAudioNode {
  /**
   * Creates a new VirtualDelayNode instance.
   *
   * @param {*} ctx - Ctx value.
   * @param {*} [maxDelayTime=1] - Maxdelaytime value.
   */
  constructor(ctx, maxDelayTime = 1) { super('delay', ctx); this.delayTime = new VirtualAudioParam(0, ctx); this.maxDelayTime = maxDelayTime; }
}
class VirtualStereoPannerNode extends VirtualAudioNode {
  /**
   * Creates a new VirtualStereoPannerNode instance.
   *
   * @param {*} ctx - Ctx value.
   */
  constructor(ctx) { super('stereoPanner', ctx); this.pan = new VirtualAudioParam(0, ctx); }
}
class VirtualPannerNode extends VirtualAudioNode {
  /**
   * Creates a new VirtualPannerNode instance.
   *
   * @param {*} ctx - Ctx value.
   */
  constructor(ctx) {
    super('panner3d', ctx);
    this.positionX = new VirtualAudioParam(0, ctx);
    this.positionY = new VirtualAudioParam(0, ctx);
    this.positionZ = new VirtualAudioParam(0, ctx);
    this.panningModel = 'HRTF';
    this.distanceModel = 'linear';
    this.maxDistance = 10000;
    this.rolloffFactor = 1;
  }
}
class VirtualConvolverNode extends VirtualAudioNode {
  /**
   * Creates a new VirtualConvolverNode instance.
   *
   * @param {*} ctx - Ctx value.
   */
  constructor(ctx) { super('convolver', ctx); this.buffer = null; }
}
class VirtualAnalyserNode extends VirtualAudioNode {
  /**
   * Creates a new VirtualAnalyserNode instance.
   *
   * @param {*} ctx - Ctx value.
   */
  constructor(ctx) {
    super('analyser', ctx);
    this.fftSize = 2048;
    this.smoothingTimeConstant = 0.8;
    this._source = null; // tracked so analyze()/waveform()/getLevel() have something to approximate from
  }
  /**
   * Returns the current frequencyBinCount value.
   *
   * @returns {number} The resulting value.
   */
  get frequencyBinCount() { return this.fftSize / 2; }
  // No real audio thread to sample from — these return correctly-sized,
  // silent-signal data. A real front-end swaps this node for a genuine
  // AnalyserNode to get real spectral/waveform data.
  /**
   * Writes silent byte-frequency data into an array.
   *
   * @param {Array} arr - Arr value.
   *
   * @returns {void} The resulting value.
   */
  getByteFrequencyData(arr) { arr.fill(0); }
  /**
   * Writes silent decibel-frequency data into an array.
   *
   * @param {Array} arr - Arr value.
   *
   * @returns {void} The resulting value.
   */
  getFloatFrequencyData(arr) { arr.fill(-Infinity); }
  /**
   * Writes centered byte waveform data into an array.
   *
   * @param {Array} arr - Arr value.
   *
   * @returns {void} The resulting value.
   */
  getByteTimeDomainData(arr) { arr.fill(128); }
  /**
   * Writes silent floating-point waveform data into an array.
   *
   * @param {Array} arr - Arr value.
   *
   * @returns {void} The resulting value.
   */
  getFloatTimeDomainData(arr) { arr.fill(0); }
}
class VirtualOscillatorNode extends VirtualAudioNode {
  /**
   * Creates a new VirtualOscillatorNode instance.
   *
   * @param {*} ctx - Ctx value.
   */
  constructor(ctx) {
    super('oscillator', ctx);
    this.type = 'sine';
    this.frequency = new VirtualAudioParam(440, ctx);
    this.detune = new VirtualAudioParam(0, ctx);
    this.onended = null;
  }
  /**
   * Starts or schedules the audio source.
   *
   * @throws {Error} When invoked on an abstract source or unavailable headless input.
   *
   * @returns {VirtualOscillatorNode} This instance for chaining.
   */
  start() { /* nothing to schedule — no audio thread to start */ }
  /**
   * Stops or schedules the audio source.
   *
   * @param {number} [time=0] - Time value.
   *
   * @returns {VirtualOscillatorNode} This instance for chaining.
   */
  stop(time = 0) {
    const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
    const timer = setTimeout(() => { if (this.onended) this.onended(); }, delayMs);
    if (timer.unref) timer.unref();
  }
}
class VirtualBufferSourceNode extends VirtualAudioNode {
  /**
   * Creates a new VirtualBufferSourceNode instance.
   *
   * @param {*} ctx - Ctx value.
   */
  constructor(ctx) {
    super('bufferSource', ctx);
    this.buffer = null;
    this.playbackRate = new VirtualAudioParam(1, ctx);
    this.loop = false;
    this.loopStart = 0;
    this.loopEnd = 0;
    this.onended = null;
    this._endTimer = null;
  }
  /**
   * Starts or schedules the audio source.
   *
   * @param {number} [time=0] - Time value.
   * @param {number} [offset=0] - Offset value.
   * @param {number} duration - Duration value.
   *
   * @throws {Error} When invoked on an abstract source or unavailable headless input.
   *
   * @returns {VirtualBufferSourceNode} This instance for chaining.
   */
  start(time = 0, offset = 0, duration) {
    if (this.loop) return; // loops run until stop() is called explicitly
    const bufDuration = duration !== undefined ? duration : (this.buffer ? Math.max(0, this.buffer.duration - offset) : 0);
    const rate = this.playbackRate.value || 1;
    const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000) + (bufDuration / Math.abs(rate)) * 1000;
    this._endTimer = setTimeout(() => { this._endTimer = null; if (this.onended) this.onended(); }, delayMs);
    if (this._endTimer.unref) this._endTimer.unref();
  }
  /**
   * Stops or schedules the audio source.
   *
   * @param {number} [time=0] - Time value.
   *
   * @returns {VirtualBufferSourceNode} This instance for chaining.
   */
  stop(time = 0) {
    if (this._endTimer) { clearTimeout(this._endTimer); this._endTimer = null; }
    const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
    const timer = setTimeout(() => { if (this.onended) this.onended(); }, delayMs);
    if (timer.unref) timer.unref();
  }
}

/**
 * Creates an in-memory multichannel audio buffer.
 *
 * @param {number} numberOfChannels - Numberofchannels value.
 * @param {number} length - Length value.
 * @param {number} sampleRate - Samplerate value.
 *
 * @returns {Object} The resulting value.
 */
function createVirtualAudioBuffer(numberOfChannels, length, sampleRate) {
  const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  return {
    numberOfChannels,
    length,
    sampleRate,
    duration: sampleRate > 0 ? length / sampleRate : 0,
    getChannelData(channel) { return channels[channel]; }
  };
}

// ---------------------------------------------------------------------------
// Minimal RIFF/WAVE (PCM) decoder — the one audio format Node can decode
// without a real codec library. Handles 8/16/32-bit integer and 32-bit
// float PCM. Anything else (mp3, ogg, ...) isn't decodable headlessly and
// is reported via `onerror`, same as p5.sound does for unsupported formats.
// ---------------------------------------------------------------------------
/**
 * Decodes supported PCM WAV bytes into a virtual audio buffer.
 *
 * @param {*} buf - Buf value.
 *
 * @returns {Object|null} The resulting value.
 */
function decodeWav(buf) {
  /**
   * Performs the if operation.
   *
   * @param {*} buf.length < 12 || buf.toString('ascii', 0, 4 - Buf.length < 12 || buf.tostring('ascii', 0, 4 value.
   *
   * @returns {VirtualBufferSourceNode} This instance for chaining.
   */
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return null;

  let offset = 12;
  let fmt = null;
  let dataOffset = -1;
  let dataLength = 0;
  /**
   * Performs the while operation.
   *
   * @param {*} [offset + 8 <=buf.length] - Offset + 8 < value.
   *
   * @returns {VirtualBufferSourceNode} This instance for chaining.
   */
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        numChannels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14)
      };
    } else if (id === 'data') {
      dataOffset = body;
      dataLength = size;
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }
  /**
   * Performs the if operation.
   *
   * @param {*} [!fmt || dataOffset=== -1] - !fmt || dataoffset value.
   *
   * @returns {VirtualBufferSourceNode} This instance for chaining.
   */
  if (!fmt || dataOffset === -1) return null;

  const bytesPerSample = fmt.bitsPerSample / 8;
  const frameCount = Math.floor(dataLength / (bytesPerSample * fmt.numChannels));
  const audioBuffer = createVirtualAudioBuffer(fmt.numChannels, frameCount, fmt.sampleRate);

  /**
   * Performs the for operation.
   *
   * @param {*} [let i=0; i < frameCount; i++] - Let i value.
   *
   * @returns {VirtualBufferSourceNode} This instance for chaining.
   */
  for (let i = 0; i < frameCount; i++) {
    for (let c = 0; c < fmt.numChannels; c++) {
      const sampleOffset = dataOffset + (i * fmt.numChannels + c) * bytesPerSample;
      let sample = 0;
      if (fmt.audioFormat === 3 && fmt.bitsPerSample === 32) sample = buf.readFloatLE(sampleOffset);
      else if (fmt.bitsPerSample === 16) sample = buf.readInt16LE(sampleOffset) / 32768;
      else if (fmt.bitsPerSample === 8) sample = (buf.readUInt8(sampleOffset) - 128) / 128;
      else if (fmt.bitsPerSample === 32) sample = buf.readInt32LE(sampleOffset) / 2147483648;
      audioBuffer.getChannelData(c)[i] = sample;
    }
  }
  return audioBuffer;
}

/** Headless stand-in for the browser's `AudioContext`. */
class VirtualAudioContext {
  /**
   * Creates a new VirtualAudioContext instance.
   *
   * @param {number} [sampleRate=44100] - Samplerate value.
   */
  constructor(sampleRate = 44100) {
    this.sampleRate = sampleRate;
    this.state = 'running'; // Node has no autoplay policy to enforce, so start out running
    this._startedAt = Date.now();
    this._elapsed = 0;
    this.destination = new VirtualAudioNode('destination', this);
  }
  /**
   * Returns elapsed audio-context time in seconds.
   *
   * @returns {number} The resulting value.
   */
  get currentTime() {
    return this.state === 'running' ? this._elapsed + (Date.now() - this._startedAt) / 1000 : this._elapsed;
  }
  /**
   * Resumes the virtual audio clock.
   *
   * @returns {Promise<void>} The resulting value.
   */
  resume() {
    if (this.state !== 'running') { this.state = 'running'; this._startedAt = Date.now(); }
    return Promise.resolve();
  }
  /**
   * Suspends the virtual audio clock.
   *
   * @returns {Promise<void>} The resulting value.
   */
  suspend() {
    if (this.state === 'running') { this._elapsed = this.currentTime; this.state = 'suspended'; }
    return Promise.resolve();
  }
  /**
   * Creates a virtual gain node.
   *
   * @returns {VirtualAudioContext} This instance for chaining.
   */
  createGain() { return new VirtualGainNode(this); }
  /**
   * Creates a virtual biquad filter node.
   *
   * @returns {VirtualAudioContext} This instance for chaining.
   */
  createBiquadFilter() { return new VirtualBiquadFilterNode(this); }
  /**
   * Creates a virtual delay node.
   *
   * @param {*} [maxDelayTime=1] - Maxdelaytime value.
   *
   * @returns {VirtualAudioContext} This instance for chaining.
   */
  createDelay(maxDelayTime = 1) { return new VirtualDelayNode(this, maxDelayTime); }
  /**
   * Creates a virtual stereo panner node.
   *
   * @returns {VirtualAudioContext} This instance for chaining.
   */
  createStereoPanner() { return new VirtualStereoPannerNode(this); }
  /**
   * Creates a virtual 3D panner node.
   *
   * @returns {VirtualAudioContext} This instance for chaining.
   */
  createPanner() { return new VirtualPannerNode(this); }
  /**
   * Creates a virtual convolution node.
   *
   * @returns {VirtualAudioContext} This instance for chaining.
   */
  createConvolver() { return new VirtualConvolverNode(this); }
  /**
   * Creates a virtual analyser node.
   *
   * @returns {VirtualAudioContext} This instance for chaining.
   */
  createAnalyser() { return new VirtualAnalyserNode(this); }
  /**
   * Creates a virtual oscillator node.
   *
   * @returns {VirtualAudioContext} This instance for chaining.
   */
  createOscillator() { return new VirtualOscillatorNode(this); }
  /**
   * Creates a virtual audio-buffer source.
   *
   * @returns {VirtualAudioContext} This instance for chaining.
   */
  createBufferSource() { return new VirtualBufferSourceNode(this); }
  /**
   * Creates a virtual audio buffer.
   *
   * @param {number} numberOfChannels - Numberofchannels value.
   * @param {number} length - Length value.
   * @param {number} sampleRate - Samplerate value.
   *
   * @returns {VirtualAudioContext} This instance for chaining.
   */
  createBuffer(numberOfChannels, length, sampleRate) {
    return createVirtualAudioBuffer(numberOfChannels, length, sampleRate || this.sampleRate);
  }
  /**
   * Asynchronously decodes supported audio bytes.
   *
   * @param {Buffer|ArrayBuffer|*} data - Data value.
   *
   * @throws {Error} If the data is not a supported uncompressed PCM WAV file.
   *
   * @returns {Promise<Object>} The resulting value.
   */
  decodeAudioData(data) {
    return new Promise((resolve, reject) => {
      try {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        const decoded = decodeWav(buf);
        if (!decoded) {
          reject(new Error('decodeAudioData(): only uncompressed PCM WAV can be decoded in this headless engine (no mp3/ogg/etc. codec support in Node).'));
          return;
        }
        resolve(decoded);
      } catch (error) { reject(error); }
    });
  }
}

// =============================================================================
// Shared context + global functions
// =============================================================================

let sharedContext = null;

/**
 * Returns the shared audio context, creating it lazily.
 *
 * @returns {VirtualAudioContext} This instance for chaining.
 */
function getAudioContext() {
  /**
   * Performs the if operation.
   *
   * @param {*} !sharedContext - !sharedcontext value.
   *
   * @returns {VirtualAudioContext} This instance for chaining.
   */
  if (!sharedContext) sharedContext = new VirtualAudioContext();
  return sharedContext;
}

/**
 * Replaces the shared audio context.
 *
 * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
 *
 * @returns {void} The resulting value.
 */
function setAudioContext(context) { sharedContext = context; }

/**
 * Resumes audio processing and invokes an optional callback.
 *
 * @param {*} elements - Elements value.
 * @param {Function} callback - Callback value.
 * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
 *
 * @returns {Promise<void>} The resulting value.
 */
function userStartAudio(elements, callback, context) {
  const ctx = context || getAudioContext();
  return ctx.resume().then(() => { if (callback) callback(); });
}

/**
 * Suspends audio processing.
 *
 * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
 *
 * @returns {Promise<void>} The resulting value.
 */
function userStopAudio(context) {
  const ctx = context || getAudioContext();
  return ctx.suspend();
}

// =============================================================================
// SoundNode / SoundSource / SoundMixEffect — base classes
// =============================================================================

/**
 * Base class underlying every other class in this file. Wraps a single
 * `.output` gain node (used so `amp()`/`connect()`/`disconnect()` behave
 * uniformly regardless of what a subclass does internally), and forwards
 * `getNode()` to whatever node subclasses consider their "primary" one.
 */
class SoundNode {
  /**
   * Creates a new SoundNode instance.
   *
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(context) {
    this.ctx = context || getAudioContext();
    /** @type {VirtualGainNode} This node's output — what `connect()` connects onward. */
    this.output = this.ctx.createGain();
  }

  /**
   * Sets or ramps output amplitude.
   *
   * @param {number} vol - Vol value.
   * @param {number} [rampTime=0] - Ramptime value.
   * @param {number} [tFromNow=0] - Tfromnow value.
   *
   * @returns {SoundNode} This instance for chaining.
   */
  amp(vol, rampTime = 0, tFromNow = 0) {
    const now = this.ctx.currentTime;
    const startTime = now + tFromNow;
    const param = this.output.gain;
    param.cancelScheduledValues(startTime);
    if (rampTime > 0) {
      param.setValueAtTime(param.value, startTime);
      param.linearRampToValueAtTime(vol, startTime + rampTime);
    } else {
      param.setValueAtTime(vol, startTime);
    }
    return this;
  }

  /**
   * Connects this audio node to a destination.
   *
   * @param {SoundNode|VirtualAudioNode|Object} unit - Unit value.
   *
   * @returns {*} The resulting value.
   */
  connect(unit) {
    const target = unit === undefined ? this.ctx.destination
      : unit instanceof SoundNode ? unit.getInputNode()
      : unit;
    this.output.connect(target);
    return this;
  }

  /**
   * Disconnects one or all outgoing audio connections.
   *
   * @returns {SoundNode} This instance for chaining.
   */
  disconnect() { this.output.disconnect(); return this; }

  /**
   * Returns the node that accepts incoming audio.
   *
   * @returns {SoundNode} This instance for chaining.
   */
  getInputNode() { return this.output; }

  /**
   * Returns the primary wrapped audio node.
   *
   * @returns {SoundNode} This instance for chaining.
   */
  getNode() { return this.output; }

  /**
   * Connects a source to this node’s input.
   *
   * @param {SoundNode|VirtualAudioNode|Object} source - Source value.
   *
   * @returns {SoundNode} This instance for chaining.
   */
  setInput(source) {
    const node = source instanceof SoundNode ? source.output : source;
    node.connect(this.getInputNode());
    return this;
  }
}

/** Base class for sound *sources* — oscillators, sound files, noise. Adds `start()`/`stop()`. */
class SoundSource extends SoundNode {
  /**
   * Creates a new SoundSource instance.
   *
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(context) {
    super(context);
    /** @type {boolean} */
    this.started = false;
  }
  /**
   * Starts or schedules the audio source.
   *
   * @throws {Error} When invoked on an abstract source or unavailable headless input.
   *
   * @returns {SoundSource} This instance for chaining.
   */
  start() { throw new Error('start() must be implemented by SoundSource subclasses.'); }
  /**
   * Stops or schedules the audio source.
   *
   * @returns {SoundSource} This instance for chaining.
   */
  stop() { throw new Error('stop() must be implemented by SoundSource subclasses.'); }
}

/** Base class for effects with a dry/wet mix (filters, delay, reverb). */
class SoundMixEffect extends SoundNode {
  /**
   * Creates a new SoundMixEffect instance.
   *
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(context) {
    super(context);
    this.input = this.ctx.createGain();
    this.dryGain = this.ctx.createGain();
    this.wetGain = this.ctx.createGain();
    /** @type {?VirtualAudioNode} Set by the subclass constructor, then wired in by `_routeEffect()`. */
    this.effectNode = null;

    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);
    this.wetGain.connect(this.output);

    this.dryGain.gain.value = 0;
    this.wetGain.gain.value = 1;
  }

  /**
   * Connects the wet-effect signal path.
   *
   * @returns {void} The resulting value.
   */
  _routeEffect() {
    this.input.connect(this.effectNode);
    this.effectNode.connect(this.wetGain);
  }

  /**
   * Returns the node that accepts incoming audio.
   *
   * @returns {SoundMixEffect} This instance for chaining.
   */
  getInputNode() { return this.input; }

  /**
   * Sets the dry/wet effect balance.
   *
   * @param {number} amount - Amount value.
   *
   * @returns {SoundMixEffect} This instance for chaining.
   */
  wet(amount) {
    const now = this.ctx.currentTime;
    this.wetGain.gain.setValueAtTime(amount, now);
    this.dryGain.gain.setValueAtTime(1 - amount, now);
    return this;
  }
}

// =============================================================================
// Gain
// =============================================================================

/** A single, bare gain node — a lightweight submixer for routing several sources together. */
class Gain extends SoundNode {}

// =============================================================================
// Panner / Panner3D
// =============================================================================

/** Stereo panner — positions a sound source left/right in the stereo field. */
class Panner extends SoundNode {
  /**
   * Creates a new Panner instance.
   *
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(context) {
    super(context);
    this._panner = this.ctx.createStereoPanner();
    this._panner.connect(this.output);
  }
  /**
   * Returns the node that accepts incoming audio.
   *
   * @returns {Panner} This instance for chaining.
   */
  getInputNode() { return this._panner; }
  /**
   * Returns the primary wrapped audio node.
   *
   * @returns {Panner} This instance for chaining.
   */
  getNode() { return this._panner; }

  /**
   * Sets or ramps stereo position.
   *
   * @param {*} value - Value value.
   * @param {number} [rampTime=0] - Ramptime value.
   *
   * @returns {Panner} This instance for chaining.
   */
  pan(value, rampTime = 0) {
    const now = this.ctx.currentTime;
    const param = this._panner.pan;
    param.cancelScheduledValues(now);
    if (rampTime > 0) {
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(value, now + rampTime);
    } else {
      param.setValueAtTime(value, now);
    }
    return this;
  }
}

/** 3D panner — positions a sound source anywhere in 3D space around the listener. */
class Panner3D extends SoundNode {
  /**
   * Creates a new Panner3D instance.
   *
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(context) {
    super(context);
    this._panner = this.ctx.createPanner();
    this._panner.connect(this.output);
  }
  /**
   * Returns the node that accepts incoming audio.
   *
   * @returns {Panner3D} This instance for chaining.
   */
  getInputNode() { return this._panner; }
  /**
   * Returns the primary wrapped audio node.
   *
   * @returns {Panner3D} This instance for chaining.
   */
  getNode() { return this._panner; }

  /**
   * Connects and configures an effect input.
   *
   * @param {SoundNode|VirtualAudioNode|Object} source - Source value.
   *
   * @returns {Panner3D} This instance for chaining.
   */
  process(source) { return this.setInput(source); }

  /**
   * Gets or sets the 3D panner X coordinate.
   *
   * @param {*} value - Value value.
   *
   * @returns {Panner3D} This instance for chaining.
   */
  positionX(value) { return this._axis('positionX', value); }
  /**
   * Gets or sets the 3D panner Y coordinate.
   *
   * @param {*} value - Value value.
   *
   * @returns {Panner3D} This instance for chaining.
   */
  positionY(value) { return this._axis('positionY', value); }
  /**
   * Gets or sets the 3D panner Z coordinate.
   *
   * @param {*} value - Value value.
   *
   * @returns {Panner3D} This instance for chaining.
   */
  positionZ(value) { return this._axis('positionZ', value); }

  /**
   * Updates the object’s primary configuration values.
   *
   * @param {number} [x=0] - X value.
   * @param {number} [y=0] - Y value.
   * @param {number} [z=0] - Z value.
   *
   * @returns {Panner3D} This instance for chaining.
   */
  set(x = 0, y = 0, z = 0) {
    const now = this.ctx.currentTime;
    this._panner.positionX.setValueAtTime(x, now);
    this._panner.positionY.setValueAtTime(y, now);
    this._panner.positionZ.setValueAtTime(z, now);
    return this;
  }

  /**
   * Sets the maximum panning distance.
   *
   * @param {number} distance - Distance value.
   *
   * @returns {Panner3D} This instance for chaining.
   */
  maxDist(distance) { this._panner.maxDistance = distance; return this; }

  /**
   * Sets the distance attenuation rate.
   *
   * @param {number} rate - Rate value.
   *
   * @returns {Panner3D} This instance for chaining.
   */
  rolloff(rate) { this._panner.rolloffFactor = rate; return this; }

  /**
   * Sets the distance model and attenuation rate.
   *
   * @param {number} rate - Rate value.
   * @param {string} [model='linear'] - Model value.
   *
   * @returns {Panner3D} This instance for chaining.
   */
  setFalloff(rate, model = 'linear') {
    this._panner.distanceModel = model;
    return this.rolloff(rate);
  }

  /**
   * Gets or sets one panner-axis parameter.
   *
   * @param {string} paramName - Paramname value.
   * @param {*} value - Value value.
   *
   * @returns {Panner3D} This instance for chaining.
   */
  _axis(paramName, value) {
    if (value === undefined) return this._panner[paramName].value;
    this._panner[paramName].setValueAtTime(value, this.ctx.currentTime);
    return this;
  }
}

// =============================================================================
// Amplitude
// =============================================================================

/**
 * Tracks the amplitude (volume) of an audio source over time. Headless:
 * with no real signal to measure, `getLevel()` approximates the connected
 * source's current output level (its own gain, times whether a source is
 * currently started) rather than sampling real audio — enough to drive
 * game logic (level meters, reactive visuals) against synthesized sources.
 */
class Amplitude extends SoundNode {
  /**
   * Creates a new Amplitude instance.
   *
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(context) {
    super(context);
    this._analyser = this.ctx.createAnalyser();
    this._analyser.fftSize = 1024;
    this._smoothing = 0;
    this._smoothedLevel = 0;
    this._source = null;
    this._analyser.connect(this.output);
  }
  /**
   * Returns the node that accepts incoming audio.
   *
   * @returns {Amplitude} This instance for chaining.
   */
  getInputNode() { return this._analyser; }
  /**
   * Returns the primary wrapped audio node.
   *
   * @returns {Amplitude} This instance for chaining.
   */
  getNode() { return this._analyser; }

  /**
   * Connects a source to this node’s input.
   *
   * @param {SoundNode|VirtualAudioNode|Object} source - Source value.
   *
   * @returns {Amplitude} This instance for chaining.
   */
  setInput(source) {
    this._source = source instanceof SoundNode ? source : null;
    if (source !== undefined) {
      const node = source instanceof SoundNode ? source.output : source;
      node.connect(this._analyser);
    }
    return this;
  }

  /**
   * Returns the approximated current signal level.
   *
   * @returns {number} The resulting value.
   */
  getLevel() {
    const raw = signalLevelOf(this._source);
    this._smoothedLevel = this._smoothing * this._smoothedLevel + (1 - this._smoothing) * raw;
    return this._smoothedLevel;
  }

  /**
   * Gets or sets amplitude smoothing.
   *
   * @param {*} value - Value value.
   *
   * @returns {Amplitude} This instance for chaining.
   */
  smooth(value) {
    if (value === undefined) return this._smoothing;
    this._smoothing = clamp(value, 0, 0.999);
    return this;
  }
}

/**
 * Estimates a node’s current output level in headless mode.
 *
 * @param {SoundNode|VirtualAudioNode|Object} node - Node value.
 *
 * @returns {number} The resulting value.
 */
function signalLevelOf(node) {
  /**
   * Performs the if operation.
   *
   * @param {*} !node - !node value.
   *
   * @returns {Amplitude} This instance for chaining.
   */
  if (!node) return 0;
  const own = node.output ? node.output.gain.value : 1;
  /**
   * Performs the if operation.
   *
   * @param {*} node instanceof SoundSource - Node instanceof soundsource value.
   *
   * @returns {Amplitude} This instance for chaining.
   */
  if (node instanceof SoundSource) return node.started ? clamp(own, 0, 1) : 0;
  return clamp(own, 0, 1);
}

// =============================================================================
// FFT
// =============================================================================

/** Analyzes the frequency spectrum and waveform of an audio source. */
class FFT extends SoundNode {
  /**
   * Creates a new FFT instance.
   *
   * @param {number} [smoothing=0.8] - Smoothing value.
   * @param {number} [bins=1024] - Bins value.
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(smoothing = 0.8, bins = 1024, context) {
    super(context);
    this._analyser = this.ctx.createAnalyser();
    this._analyser.fftSize = bins * 2;
    this._analyser.smoothingTimeConstant = smoothing;
    this._analyser.connect(this.output);
  }
  /**
   * Returns the node that accepts incoming audio.
   *
   * @returns {FFT} This instance for chaining.
   */
  getInputNode() { return this._analyser; }
  /**
   * Returns the primary wrapped audio node.
   *
   * @returns {FFT} This instance for chaining.
   */
  getNode() { return this._analyser; }

  /**
   * Connects a source to this node’s input.
   *
   * @param {SoundNode|VirtualAudioNode|Object} source - Source value.
   *
   * @returns {FFT} This instance for chaining.
   */
  setInput(source) {
    if (source !== undefined) {
      const node = source instanceof SoundNode ? source.output : source;
      node.connect(this._analyser);
    }
    return this;
  }

  /**
   * Returns frequency-domain values from the analyser.
   *
   * @param {number} bins - Bins value.
   * @param {*} [scale='byte'] - Scale value.
   *
   * @returns {number[]} The resulting value.
   */
  analyze(bins, scale = 'byte') {
    if (bins) this._analyser.fftSize = bins * 2;
    if (scale === 'db') {
      const data = new Float32Array(this._analyser.frequencyBinCount);
      this._analyser.getFloatFrequencyData(data);
      return Array.from(data);
    }
    const data = new Uint8Array(this._analyser.frequencyBinCount);
    this._analyser.getByteFrequencyData(data);
    return Array.from(data);
  }

  /**
   * Returns time-domain sample values from the analyser.
   *
   * @param {number} bins - Bins value.
   * @param {*} [precision='float'] - Precision value.
   *
   * @returns {number[]} The resulting value.
   */
  waveform(bins, precision = 'float') {
    if (bins) this._analyser.fftSize = bins * 2;
    if (precision === 'byte') {
      const data = new Uint8Array(this._analyser.fftSize);
      this._analyser.getByteTimeDomainData(data);
      return Array.from(data);
    }
    const data = new Float32Array(this._analyser.fftSize);
    this._analyser.getFloatTimeDomainData(data);
    return Array.from(data);
  }
}

// =============================================================================
// Biquad filter family
// =============================================================================

/** Generic biquad filter effect (lowpass/highpass/bandpass/...). */
class Biquad extends SoundMixEffect {
  /**
   * Creates a new Biquad instance.
   *
   * @param {string} [type='lowpass'] - Type value.
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(type = 'lowpass', context) {
    super(context);
    this.effectNode = this.ctx.createBiquadFilter();
    this.effectNode.type = type;
    this._routeEffect();
  }

  /**
   * Gets or sets frequency.
   *
   * @param {*} value - Value value.
   * @param {number} [rampTime=0] - Ramptime value.
   *
   * @returns {Biquad} This instance for chaining.
   */
  freq(value, rampTime = 0) { return this._setParam(this.effectNode.frequency, value, rampTime); }

  /**
   * Sets filter gain.
   *
   * @param {*} value - Value value.
   *
   * @returns {Biquad} This instance for chaining.
   */
  gain(value) { return this._setParam(this.effectNode.gain, value, 0); }

  /**
   * Sets filter resonance or bandwidth.
   *
   * @param {*} value - Value value.
   *
   * @returns {Biquad} This instance for chaining.
   */
  res(value) { return this._setParam(this.effectNode.Q, value, 0); }

  /**
   * Sets the oscillator, noise, or filter type.
   *
   * @param {string} type - Type value.
   *
   * @returns {Biquad} This instance for chaining.
   */
  setType(type) { this.effectNode.type = type; return this; }

  /**
   * Sets or ramps an audio parameter.
   *
   * @param {SoundNode|VirtualAudioNode|Object} param - Param value.
   * @param {*} value - Value value.
   * @param {number} rampTime - Ramptime value.
   *
   * @returns {Biquad} This instance for chaining.
   */
  _setParam(param, value, rampTime) {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    if (rampTime > 0) {
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(value, now + rampTime);
    } else {
      param.setValueAtTime(value, now);
    }
    return this;
  }
}

/** A {@link Biquad} filter preset to `'bandpass'`. */
class BandPass extends Biquad {
  /**
   * Creates a new BandPass instance.
   *
   * @param {number} freq - Freq value.
   * @param {*} res - Res value.
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(freq, res, context) {
    super('bandpass', context);
    if (freq !== undefined) this.freq(freq);
    if (res !== undefined) this.res(res);
  }
}

/** A {@link Biquad} filter preset to `'highpass'`. */
class HighPass extends Biquad {
  /**
   * Creates a new HighPass instance.
   *
   * @param {number} freq - Freq value.
   * @param {*} res - Res value.
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(freq, res, context) {
    super('highpass', context);
    if (freq !== undefined) this.freq(freq);
    if (res !== undefined) this.res(res);
  }
}

/** A {@link Biquad} filter preset to `'lowpass'`. */
class LowPass extends Biquad {
  /**
   * Creates a new LowPass instance.
   *
   * @param {number} freq - Freq value.
   * @param {*} res - Res value.
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(freq, res, context) {
    super('lowpass', context);
    if (freq !== undefined) this.freq(freq);
    if (res !== undefined) this.res(res);
  }
}

// =============================================================================
// Delay
// =============================================================================

/** Delay/echo effect, with a feedback loop for repeating echoes. */
class Delay extends SoundMixEffect {
  /**
   * Creates a new Delay instance.
   *
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(context) {
    super(context);
    this.effectNode = this.ctx.createDelay(5); // up to 5s max delay
    this._feedback = this.ctx.createGain();
    this._feedback.gain.value = 0;
    this._filter = this.ctx.createBiquadFilter();
    this._filter.type = 'lowpass';
    this._filter.frequency.value = 22050; // effectively "off" until process()/freq set

    this.input.connect(this.effectNode);
    this.effectNode.connect(this._filter);
    this._filter.connect(this.wetGain);
    this._filter.connect(this._feedback);
    this._feedback.connect(this.effectNode);
  }

  /**
   * Sets delay time in seconds.
   *
   * @param {number} seconds - Seconds value.
   *
   * @returns {Delay} This instance for chaining.
   */
  delayTime(seconds) {
    this.effectNode.delayTime.setValueAtTime(seconds, this.ctx.currentTime);
    return this;
  }

  /**
   * Sets delay feedback amount.
   *
   * @param {number} amount - Amount value.
   *
   * @returns {Delay} This instance for chaining.
   */
  feedback(amount) {
    this._feedback.gain.setValueAtTime(amount, this.ctx.currentTime);
    return this;
  }

  /**
   * Connects and configures an effect input.
   *
   * @param {SoundNode|VirtualAudioNode|Object} source - Source value.
   * @param {*} [delayTime=0.25] - Delaytime value.
   * @param {number} [feedback=0] - Feedback value.
   * @param {number} lowPassFreq - Lowpassfreq value.
   *
   * @returns {Delay} This instance for chaining.
   */
  process(source, delayTime = 0.25, feedback = 0, lowPassFreq) {
    this.setInput(source);
    this.delayTime(delayTime);
    this.feedback(feedback);
    if (lowPassFreq !== undefined) this._filter.frequency.setValueAtTime(lowPassFreq, this.ctx.currentTime);
    return this;
  }
}

// =============================================================================
// Reverb
// =============================================================================

/** Convolution reverb effect, using a synthetically-generated (exponentially decaying noise) impulse response. */
class Reverb extends SoundMixEffect {
  /**
   * Creates a new Reverb instance.
   *
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(context) {
    super(context);
    this.effectNode = this.ctx.createConvolver();
    this._routeEffect();
    this.set(3, 2, false);
  }

  /**
   * Updates the object’s primary configuration values.
   *
   * @param {number} [seconds=3] - Seconds value.
   * @param {number} [decayRate=2] - Decayrate value.
   * @param {*} [reverse=false] - Reverse value.
   *
   * @returns {Reverb} This instance for chaining.
   */
  set(seconds = 3, decayRate = 2, reverse = false) {
    const sampleRate = this.ctx.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * seconds));
    const impulse = this.ctx.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const t = reverse ? length - i : i;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t / length, decayRate);
      }
    }

    this.effectNode.buffer = impulse;
    return this;
  }
}

// =============================================================================
// Envelope (ADSR)
// =============================================================================

/**
 * An ADSR (attack/decay/sustain/release) envelope generator, implemented as
 * a gain node whose value is automated over time.
 */
class Envelope extends SoundNode {
  /**
   * Creates a new Envelope instance.
   *
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(context) {
    super(context);
    this.output.gain.value = 0;

    this._attackTime = 0.1;
    this._attackLevel = 1;
    this._decayTime = 0.2;
    this._sustainLevel = 0.5;
    this._releaseTime = 0.5;
    this._releaseLevel = 0;
  }

  /**
   * Gets or sets envelope attack time.
   *
   * @param {number} time - Time value.
   *
   * @returns {Envelope} This instance for chaining.
   */
  attackTime(time) {
    if (time === undefined) return this._attackTime;
    this._attackTime = time;
    return this;
  }

  /**
   * Gets or sets envelope release time.
   *
   * @param {number} time - Time value.
   *
   * @returns {Envelope} This instance for chaining.
   */
  releaseTime(time) {
    if (time === undefined) return this._releaseTime;
    this._releaseTime = time;
    return this;
  }

  /**
   * Sets attack, decay, sustain, and release values.
   *
   * @param {number} attackTime - Attacktime value.
   * @param {number} decayTime - Decaytime value.
   * @param {number} susRatio - Susratio value.
   * @param {number} releaseTime - Releasetime value.
   *
   * @returns {Envelope} This instance for chaining.
   */
  setADSR(attackTime, decayTime, susRatio, releaseTime) {
    this._attackTime = attackTime;
    this._decayTime = decayTime;
    this._sustainLevel = susRatio;
    this._releaseTime = releaseTime;
    return this;
  }

  /**
   * Connects a source to this node’s input.
   *
   * @param {SoundNode|VirtualAudioNode|Object} source - Source value.
   *
   * @returns {Envelope} This instance for chaining.
   */
  setInput(source) {
    const node = source instanceof SoundNode ? source.output : source;
    node.connect(this.output);
    return this;
  }

  /**
   * Schedules the envelope attack and decay stages.
   *
   * @param {SoundNode|VirtualAudioNode|Object} input - Input value.
   * @param {number} [time=0] - Time value.
   *
   * @returns {Envelope} This instance for chaining.
   */
  triggerAttack(input, time = 0) {
    if (input) this.setInput(input);
    const now = this.ctx.currentTime + time;
    const param = this.output.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(this._attackLevel, now + this._attackTime);
    param.linearRampToValueAtTime(this._sustainLevel, now + this._attackTime + this._decayTime);
    return this;
  }

  /**
   * Schedules the envelope release stage.
   *
   * @param {number} [time=0] - Time value.
   *
   * @returns {Envelope} This instance for chaining.
   */
  triggerRelease(time = 0) {
    const now = this.ctx.currentTime + time;
    const param = this.output.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(this._releaseLevel, now + this._releaseTime);
    return this;
  }

  /**
   * Starts or schedules playback.
   *
   * @param {SoundNode|VirtualAudioNode|Object} input - Input value.
   * @param {number} [startTime=0] - Starttime value.
   * @param {number} [sustainTime=0] - Sustaintime value.
   *
   * @throws {Error} If playback begins before the sound file has loaded.
   *
   * @returns {Envelope} This instance for chaining.
   */
  play(input, startTime = 0, sustainTime = 0) {
    this.triggerAttack(input, startTime);
    this.triggerRelease(startTime + this._attackTime + this._decayTime + sustainTime);
    return this;
  }
}

// =============================================================================
// Noise
// =============================================================================

const NOISE_BUFFER_SECONDS = 2;

/** Generates white, pink, or brown noise. */
class Noise extends SoundSource {
  /**
   * Creates a new Noise instance.
   *
   * @param {string} [type='white'] - Type value.
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(type = 'white', context) {
    super(context);
    this._type = type;
    this._node = null;
    this._buffers = {};
  }

  /**
   * Gets or sets the noise type.
   *
   * @param {string} type - Type value.
   *
   * @returns {Noise} This instance for chaining.
   */
  type(type) {
    if (type === undefined) return this._type;
    this._type = type;
    if (this.started) { this.stop(); this.start(); }
    return this;
  }

  /**
   * Returns or creates the selected noise buffer.
   *
   * @returns {Noise} This instance for chaining.
   */
  _getBuffer() {
    if (this._buffers[this._type]) return this._buffers[this._type];

    const length = Math.floor(this.ctx.sampleRate * NOISE_BUFFER_SECONDS);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    if (this._type === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    } else if (this._type === 'brown') {
      let last = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    } else {
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    }

    this._buffers[this._type] = buffer;
    return buffer;
  }

  /**
   * Starts or schedules the audio source.
   *
   * @param {number} [time=0] - Time value.
   *
   * @throws {Error} When invoked on an abstract source or unavailable headless input.
   *
   * @returns {Noise} This instance for chaining.
   */
  start(time = 0) {
    if (this.started) this.stop();
    this._node = this.ctx.createBufferSource();
    this._node.buffer = this._getBuffer();
    this._node.loop = true;
    this._node.connect(this.output);
    this._node.start(this.ctx.currentTime + time);
    this.started = true;
    return this;
  }

  /**
   * Stops or schedules the audio source.
   *
   * @param {number} [time=0] - Time value.
   *
   * @returns {Noise} This instance for chaining.
   */
  stop(time = 0) {
    if (this._node) this._node.stop(this.ctx.currentTime + time);
    this._node = null;
    this.started = false;
    return this;
  }
}

// =============================================================================
// Oscillator family
// =============================================================================

/**
 * A tone generator. Because oscillator nodes are one-shot (a stopped one
 * can never be restarted), `start()` transparently creates a fresh
 * underlying node each time.
 */
class Oscillator extends SoundSource {
  /**
   * Creates a new Oscillator instance.
   *
   * @param {number} [freq=440] - Freq value.
   * @param {string} [type='sine'] - Type value.
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(freq = 440, type = 'sine', context) {
    super(context);
    this._freq = freq;
    this._type = type;
    this._phase = 0;
    this._node = null;
  }

  /**
   * Gets or sets frequency.
   *
   * @param {*} value - Value value.
   * @param {number} [rampTime=0] - Ramptime value.
   *
   * @returns {Oscillator} This instance for chaining.
   */
  freq(value, rampTime = 0) {
    if (value === undefined) return this._freq;
    this._freq = value;
    if (this._node) {
      const now = this.ctx.currentTime;
      const param = this._node.frequency;
      param.cancelScheduledValues(now);
      if (rampTime > 0) {
        param.setValueAtTime(param.value, now);
        param.linearRampToValueAtTime(value, now + rampTime);
      } else {
        param.setValueAtTime(value, now);
      }
    }
    return this;
  }

  /**
   * Sets oscillator phase as a cycle fraction.
   *
   * @param {*} value - Value value.
   *
   * @returns {Oscillator} This instance for chaining.
   */
  phase(value) {
    this._phase = ((value % 1) + 1) % 1;
    return this;
  }

  /**
   * Sets the oscillator, noise, or filter type.
   *
   * @param {string} type - Type value.
   *
   * @returns {Oscillator} This instance for chaining.
   */
  setType(type) {
    this._type = type;
    if (this._node) this._node.type = type;
    return this;
  }

  /**
   * Starts or schedules the audio source.
   *
   * @param {number} [time=0] - Time value.
   * @param {number} freq - Freq value.
   *
   * @throws {Error} When invoked on an abstract source or unavailable headless input.
   *
   * @returns {Oscillator} This instance for chaining.
   */
  start(time = 0, freq) {
    if (this.started) this.stop();
    if (freq !== undefined) this._freq = freq;

    this._node = this.ctx.createOscillator();
    this._node.type = this._type;
    this._node.frequency.setValueAtTime(this._freq, this.ctx.currentTime);
    this._node.connect(this.output);

    const periodDelay = this._freq > 0 ? this._phase / this._freq : 0;
    this._node.start(this.ctx.currentTime + time + periodDelay);
    this.started = true;
    return this;
  }

  /**
   * Stops or schedules the audio source.
   *
   * @param {number} [time=0] - Time value.
   *
   * @returns {Oscillator} This instance for chaining.
   */
  stop(time = 0) {
    if (this._node) this._node.stop(this.ctx.currentTime + time);
    this._node = null;
    this.started = false;
    return this;
  }
}

/** An {@link Oscillator} preset to a sawtooth wave. */
class SawOsc extends Oscillator {
  /**
   * Creates a new SawOsc instance.
   *
   * @param {number} [freq=440] - Freq value.
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(freq = 440, context) { super(freq, 'sawtooth', context); }
}
/** An {@link Oscillator} preset to a sine wave. */
class SinOsc extends Oscillator {
  /**
   * Creates a new SinOsc instance.
   *
   * @param {number} [freq=440] - Freq value.
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(freq = 440, context) { super(freq, 'sine', context); }
}
/** An {@link Oscillator} preset to a square wave. */
class SqrOsc extends Oscillator {
  /**
   * Creates a new SqrOsc instance.
   *
   * @param {number} [freq=440] - Freq value.
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(freq = 440, context) { super(freq, 'square', context); }
}
/** An {@link Oscillator} preset to a triangle wave. */
class TriOsc extends Oscillator {
  /**
   * Creates a new TriOsc instance.
   *
   * @param {number} [freq=440] - Freq value.
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(freq = 440, context) { super(freq, 'triangle', context); }
}

// =============================================================================
// AudioIn (microphone)
// =============================================================================

/**
 * Live audio input from the user's microphone. Node has no
 * `getUserMedia`/microphone access of its own — this class exists for API
 * parity, but `start()` always rejects; a browser front-end is the one
 * that can actually supply microphone input.
 */
class AudioIn extends SoundSource {
  /**
   * Creates a new AudioIn instance.
   *
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(context) {
    super(context);
  }

  /**
   * Starts or schedules the audio source.
   *
   * @param {Function} successCallback - Successcallback value.
   * @param {Function} errorCallback - Errorcallback value.
   *
   * @throws {Error} When invoked on an abstract source or unavailable headless input.
   *
   * @returns {AudioIn} This instance for chaining.
   */
  start(successCallback, errorCallback) {
    const error = new Error('AudioIn.start(): no microphone access in a headless Node engine — this must be supplied by a browser front-end.');
    if (errorCallback) errorCallback(error);
    return Promise.reject(error);
  }

  /**
   * Stops or schedules the audio source.
   *
   * @returns {AudioIn} This instance for chaining.
   */
  stop() { this.started = false; return this; }
}

// =============================================================================
// PitchShifter
// =============================================================================

/**
 * Shifts the pitch of an audio source in real time, without changing its
 * playback speed. Implemented with the classic two-delay-line "granular"
 * pitch-shifting technique.
 */
class PitchShifter extends SoundNode {
  /**
   * Creates a new PitchShifter instance.
   *
   * @param {SoundNode|VirtualAudioNode|Object} input - Input value.
   * @param {*} [initialShift=0] - Initialshift value.
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(input, initialShift = 0, context) {
    super(context);
    this._windowSize = 0.1; // seconds
    this._shift = initialShift;

    this._input = this.ctx.createGain();
    this._delayA = this.ctx.createDelay(1);
    this._delayB = this.ctx.createDelay(1);
    this._gainA = this.ctx.createGain();
    this._gainB = this.ctx.createGain();

    this._input.connect(this._delayA);
    this._input.connect(this._delayB);
    this._delayA.connect(this._gainA);
    this._delayB.connect(this._gainB);
    this._gainA.connect(this.output);
    this._gainB.connect(this.output);

    this._buildCurves();
    this._scheduleTimer = null;
    this._startScheduling();

    if (input) this.setInput(input);
  }

  /**
   * Returns the node that accepts incoming audio.
   *
   * @returns {PitchShifter} This instance for chaining.
   */
  getInputNode() { return this._input; }

  /**
   * Sets pitch shift in semitones.
   *
   * @param {number} semitones - Semitones value.
   *
   * @returns {PitchShifter} This instance for chaining.
   */
  shift(semitones) {
    this._shift = semitones;
    this._buildCurves();
    return this;
  }

  /**
   * Rebuilds pitch-shifter modulation curves.
   *
   * @returns {void} The resulting value.
   */
  _buildCurves() {
    const steps = 64;
    const rate = Math.pow(2, this._shift / 12);
    const drift = (1 - rate) * this._windowSize;

    const delayCurve = new Float32Array(steps);
    const gainCurve = new Float32Array(steps);
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      delayCurve[i] = Math.max(0, this._windowSize / 2 + drift * t);
      gainCurve[i] = Math.sin(Math.PI * t);
    }
    this._delayCurve = delayCurve;
    this._gainCurve = gainCurve;
  }

  /**
   * Starts the pitch-shifter scheduling loop.
   *
   * @returns {void} The resulting value.
   */
  _startScheduling() {
    const scheduleWindow = () => {
      const now = this.ctx.currentTime + 0.02;
      const half = this._windowSize / 2;

      this._delayA.delayTime.setValueCurveAtTime(this._delayCurve, now, this._windowSize);
      this._gainA.gain.setValueCurveAtTime(this._gainCurve, now, this._windowSize);

      this._delayB.delayTime.setValueCurveAtTime(this._delayCurve, now + half, this._windowSize);
      this._gainB.gain.setValueCurveAtTime(this._gainCurve, now + half, this._windowSize);
    };

    scheduleWindow();
    this._scheduleTimer = setInterval(scheduleWindow, this._windowSize * 1000);
    if (this._scheduleTimer.unref) this._scheduleTimer.unref();
  }

  /**
   * Stops timers and disconnects pitch-shifter nodes.
   *
   * @returns {void} The resulting value.
   */
  dispose() {
    if (this._scheduleTimer) clearInterval(this._scheduleTimer);
    this._scheduleTimer = null;
    this.disconnect();
    this._input.disconnect();
  }
}

// =============================================================================
// SoundFile
// =============================================================================

/** Loads and plays back an audio file. */
class SoundFile extends SoundSource {
  /**
   * Creates a new SoundFile instance.
   *
   * @param {string} path - Path value.
   * @param {Function} onload - Onload value.
   * @param {Function} onerror - Onerror value.
   * @param {Function} whileLoading - Whileloading value.
   * @param {SoundNode|VirtualAudioNode|Object} context - Context value.
   */
  constructor(path, onload, onerror, whileLoading, context) {
    super(context);
    this.buffer = null;
    this._sourceNode = null;
    this._path = null;
    this._playing = false;
    this._looping = false;
    this._loopStart = 0;
    this._loopEnd = 0;
    this._rate = 1;
    this._startedAt = 0;
    this._pausedAt = 0;
    this._onendedCallbacks = [];

    if (path) this.setPath(path, onload, onerror, whileLoading);
  }

  /**
   * Changes and reloads the sound-file source.
   *
   * @param {string} path - Path value.
   * @param {Function} onload - Onload value.
   * @param {Function} onerror - Onerror value.
   * @param {Function} whileLoading - Whileloading value.
   *
   * @returns {SoundFile} This instance for chaining.
   */
  setPath(path, onload, onerror, whileLoading) {
    this._path = path;
    this.buffer = null;

    const readBytes = isURL(path)
      ? fetch(path).then(async response => {
        if (!response.ok) throw new Error(`SoundFile: ${response.status} ${response.statusText} for ${path}`);
        const total = Number(response.headers.get('Content-Length')) || 0;
        if (whileLoading && total && response.body) {
          const reader = response.body.getReader();
          const chunks = [];
          let received = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.length;
            whileLoading(Math.min(100, (received / total) * 100));
          }
          const bytes = new Uint8Array(received);
          let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
          return Buffer.from(bytes);
        }
        return Buffer.from(await response.arrayBuffer());
      })
      : Promise.resolve().then(() => fs.readFileSync(path));

    readBytes
      .then(buf => this.ctx.decodeAudioData(buf))
      .then(audioBuffer => {
        this.buffer = audioBuffer;
        this._loopEnd = audioBuffer.duration;
        if (whileLoading) whileLoading(100);
        if (onload) onload(this);
      })
      .catch(error => { if (onerror) onerror(error); });

    return this;
  }

  /**
   * Starts or schedules the audio source.
   *
   * @param {number} [time=0] - Time value.
   * @param {number} [rate=1] - Rate value.
   * @param {number} [amp=1] - Amp value.
   *
   * @throws {Error} When invoked on an abstract source or unavailable headless input.
   *
   * @returns {SoundFile} This instance for chaining.
   */
  start(time = 0, rate = 1, amp = 1) { return this.play(time, rate, amp); }

  /**
   * Starts or schedules playback.
   *
   * @param {number} [time=0] - Time value.
   * @param {number} [rate=1] - Rate value.
   * @param {number} [amp=1] - Amp value.
   * @param {number} loopStart - Loopstart value.
   * @param {number} duration - Duration value.
   *
   * @throws {Error} If playback begins before the sound file has loaded.
   *
   * @returns {SoundFile} This instance for chaining.
   */
  play(time = 0, rate = 1, amp = 1, loopStart, duration) {
    if (!this.buffer) throw new Error('SoundFile: play() called before the file finished loading.');
    if (this._playing) this._stopSource();

    this._rate = rate;
    this._sourceNode = this.ctx.createBufferSource();
    this._sourceNode.buffer = this.buffer;
    this._sourceNode.playbackRate.value = rate;
    this._sourceNode.loop = this._looping;
    this._sourceNode.loopStart = loopStart ?? this._loopStart;
    this._sourceNode.loopEnd = this._loopEnd || this.buffer.duration;
    this._sourceNode.connect(this.output);
    this.amp(amp);

    this._sourceNode.onended = () => {
      if (this._playing) {
        this._playing = false;
        this._pausedAt = 0;
        for (const cb of this._onendedCallbacks) cb(this);
      }
    };

    const offset = this._pausedAt;
    this._startedAt = this.ctx.currentTime + time - offset;
    this._sourceNode.start(this.ctx.currentTime + time, offset, duration);

    this._playing = true;
    this.started = true;
    return this;
  }

  /**
   * Enables looping and starts playback.
   *
   * @param {number} [time=0] - Time value.
   * @param {number} [rate=1] - Rate value.
   * @param {number} [amp=1] - Amp value.
   * @param {number} [loopStart=0] - Loopstart value.
   * @param {number} loopEnd - Loopend value.
   *
   * @returns {SoundFile} This instance for chaining.
   */
  loop(time = 0, rate = 1, amp = 1, loopStart = 0, loopEnd) {
    this._looping = true;
    this._loopStart = loopStart;
    this._loopEnd = loopEnd ?? (this.buffer ? this.buffer.duration : 0);
    return this.play(time, rate, amp, loopStart);
  }

  /**
   * Enables or disables looping.
   *
   * @param {*} [shouldLoop=true] - Shouldloop value.
   *
   * @returns {SoundFile} This instance for chaining.
   */
  setLoop(shouldLoop = true) {
    this._looping = shouldLoop;
    if (this._sourceNode) this._sourceNode.loop = shouldLoop;
    return this;
  }

  /**
   * Reports whether looping is enabled.
   *
   * @returns {boolean} The resulting value.
   */
  isLooping() { return this._looping; }

  /**
   * Reports whether playback is active.
   *
   * @returns {boolean} The resulting value.
   */
  isPlaying() { return this._playing; }

  /**
   * Pauses playback and preserves the current position.
   *
   * @returns {SoundFile} This instance for chaining.
   */
  pause() {
    if (!this._playing) return this;
    this._pausedAt = (this.ctx.currentTime - this._startedAt) * this._rate;
    this._stopSource();
    this._playing = false;
    return this;
  }

  /**
   * Stops or schedules the audio source.
   *
   * @param {number} [time=0] - Time value.
   *
   * @returns {SoundFile} This instance for chaining.
   */
  stop(time = 0) {
    this._stopSource(time);
    this._playing = false;
    this._pausedAt = 0;
    return this;
  }

  /**
   * Moves the playhead to a specified cue time.
   *
   * @param {number} cueTime - Cuetime value.
   * @param {number} duration - Duration value.
   *
   * @returns {SoundFile} This instance for chaining.
   */
  jump(cueTime, duration) {
    const wasPlaying = this._playing;
    this._stopSource();
    this._pausedAt = cueTime;
    if (wasPlaying) this.play(0, this._rate, undefined, undefined, duration);
    return this;
  }

  /**
   * Sets loop start and end times.
   *
   * @param {number} loopStart - Loopstart value.
   * @param {number} loopEnd - Loopend value.
   *
   * @returns {SoundFile} This instance for chaining.
   */
  setLoopPoints(loopStart, loopEnd) {
    this._loopStart = loopStart;
    this._loopEnd = loopEnd;
    if (this._sourceNode) {
      this._sourceNode.loopStart = loopStart;
      this._sourceNode.loopEnd = loopEnd;
    }
    return this;
  }

  /**
   * Gets or sets playback rate.
   *
   * @param {*} value - Value value.
   *
   * @returns {SoundFile} This instance for chaining.
   */
  rate(value) {
    if (value === undefined) return this._rate;
    this._rate = value;
    if (this._sourceNode) this._sourceNode.playbackRate.setValueAtTime(value, this.ctx.currentTime);
    return this;
  }

  /**
   * Returns duration in seconds.
   *
   * @returns {number} The resulting value.
   */
  duration() { return this.buffer ? this.buffer.duration : 0; }

  /**
   * Returns the sample-frame count.
   *
   * @returns {number} The resulting value.
   */
  frames() { return this.buffer ? this.buffer.length : 0; }

  /**
   * Returns the channel count.
   *
   * @returns {number} The resulting value.
   */
  channels() { return this.buffer ? this.buffer.numberOfChannels : 0; }

  /**
   * Returns the sample rate.
   *
   * @returns {number} The resulting value.
   */
  sampleRate() { return this.buffer ? this.buffer.sampleRate : this.ctx.sampleRate; }

  /**
   * Registers a playback-completion callback.
   *
   * @param {Function} callback - Callback value.
   *
   * @returns {SoundFile} This instance for chaining.
   */
  onended(callback) { this._onendedCallbacks.push(callback); return this; }

  /**
   * Stops and disconnects the active buffer source.
   *
   * @param {number} [time=0] - Time value.
   *
   * @returns {void} The resulting value.
   */
  _stopSource(time = 0) {
    if (!this._sourceNode) return;
    this._sourceNode.onended = null;
    try { this._sourceNode.stop(this.ctx.currentTime + time); } catch { /* already stopped */ }
    this._sourceNode.disconnect();
    this._sourceNode = null;
  }
}

/**
 * Creates and begins loading a sound file.
 *
 * @param {string} path - Path value.
 * @param {Function} onload - Onload value.
 * @param {Function} onerror - Onerror value.
 * @param {Function} whileLoading - Whileloading value.
 *
 * @returns {SoundFile} This instance for chaining.
 */
function loadSound(path, onload, onerror, whileLoading) {
  return new SoundFile(path, onload, onerror, whileLoading);
}

module.exports = {
  // Globals
  loadSound,
  clamp,
  getAudioContext,
  setAudioContext,
  userStartAudio,
  userStopAudio,

  // Classes
  SoundNode,
  SoundSource,
  SoundMixEffect,
  SoundFile,
  Amplitude,
  AudioIn,
  Biquad,
  BandPass,
  HighPass,
  LowPass,
  Delay,
  Envelope,
  FFT,
  Gain,
  Noise,
  Oscillator,
  SawOsc,
  SinOsc,
  SqrOsc,
  TriOsc,
  Panner,
  Panner3D,
  PitchShifter,
  Reverb,

  // Virtual Web Audio shim, exposed for advanced use (custom nodes, testing, a future front-end bridge)
  VirtualAudioContext
};
