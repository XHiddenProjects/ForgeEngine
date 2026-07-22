'use strict';

// Wrapped in an IIFE - see the comment at the top of Transform.js for why:
// this file may be loaded as a sibling <script> tag alongside the other
// engine files, all sharing ONE global scope. Sound has no dependency on
// any of them, so - like Transform.js/IO.js/dom.js - it only ever leaks
// its name via an explicit `root.Sound` assignment, never a top-level
// `const`/`class` declaration.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        const Sound = factory();
        module.exports = Sound;
        module.exports.Sound = Sound;
    } else if (root) {
        root.Sound = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

// ---------------------------------------------------------------
// Shared AudioContext (module-level singleton, like p5.sound's)
// ---------------------------------------------------------------

let sharedContext = null;

/**
 * Get the window's audio context, creating a shared one (lazily, on first
 * use) if none has been set yet. Every class below defaults to this
 * context unless one is explicitly passed to its constructor.
 *
 * @returns {AudioContext} The shared `AudioContext`.
 * @throws {Error} If no `AudioContext`/`webkitAudioContext` implementation is available.
 */
function getAudioContext() {
    if (sharedContext) return sharedContext;
    const Ctx = (typeof AudioContext !== 'undefined' && AudioContext)
        || (typeof root !== 'undefined' && root.webkitAudioContext);
    const Impl = Ctx || (typeof globalThis !== 'undefined' && (globalThis.AudioContext || globalThis.webkitAudioContext));
    if (!Impl) throw new Error('getAudioContext() requires a browser AudioContext implementation.');
    sharedContext = new Impl();
    return sharedContext;
}

/**
 * Sets the AudioContext to a specified context, to enable cross-library
 * compatibility (e.g. sharing one `AudioContext` with another audio
 * library on the same page). All classes below created afterwards default
 * to this context.
 *
 * @param {AudioContext} context - The `AudioContext` to use from now on.
 * @returns {void}
 */
function setAudioContext(context) {
    sharedContext = context;
}

/**
 * Starts audio processing in the window. Must be called from a user
 * interaction (e.g. inside a `mousePressed()` handler) - browsers block
 * audio from starting on its own to avoid autoplaying sound. Resumes the
 * shared (or given) `AudioContext` immediately, and, if it's still
 * suspended afterwards (i.e. this wasn't actually called from a trusted
 * user gesture), attaches one-time listeners to `elements` that retry on
 * the next tap/click/keypress.
 *
 * @param {HTMLElement|HTMLElement[]} [elements=document] - Element(s) to listen on for the unlocking gesture.
 * @param {function():void} [callback] - Called once the context successfully resumes.
 * @param {AudioContext} [context] - Context to start. Defaults to {@link getAudioContext}.
 * @returns {Promise<void>} Resolves once the context is running.
 */
function userStartAudio(elements, callback, context) {
    const ctx = context || getAudioContext();

    return new Promise((resolve) => {
        const tryResume = () => ctx.resume().then(() => {
            if (ctx.state === 'running') {
                cleanup();
                if (callback) callback();
                resolve();
            }
        });

        const targets = elements === undefined ? [document]
            : Array.isArray(elements) ? elements
            : (elements.length !== undefined && !(elements instanceof HTMLElement)) ? Array.from(elements)
            : [elements];
        const gestureEvents = ['touchend', 'mouseup', 'keydown'];

        const cleanup = () => {
            for (const target of targets) {
                for (const event of gestureEvents) target.removeEventListener(event, tryResume);
            }
        };

        tryResume().then(() => {
            if (ctx.state !== 'running') {
                for (const target of targets) {
                    for (const event of gestureEvents) target.addEventListener(event, tryResume);
                }
            }
        });
    });
}

/**
 * Stops audio processing in the browser window by suspending the
 * `AudioContext`. Playback can be resumed with {@link userStartAudio}.
 *
 * @param {AudioContext} [context] - Context to stop. Defaults to {@link getAudioContext}.
 * @returns {Promise<void>} Resolves once the context is suspended.
 */
function userStopAudio(context) {
    const ctx = context || getAudioContext();
    return ctx.suspend();
}

// ---------------------------------------------------------------
// SoundNode - base class for every audio-producing/-processing object
// ---------------------------------------------------------------

/**
 * Base class underlying every other class in this file. Wraps a single
 * `.output` `GainNode` (used so `amp()`/`connect()`/`disconnect()` behave
 * uniformly regardless of what a subclass does internally), and forwards
 * `getNode()` to whatever native Web Audio node subclasses consider their
 * "primary" one.
 *
 * @class
 */
class SoundNode {
    /**
     * @param {AudioContext} [context] - Audio context to build nodes on. Defaults to {@link getAudioContext}.
     */
    constructor(context) {
        /** @type {AudioContext} */
        this.ctx = context || getAudioContext();
        /** @type {GainNode} This node's output - what `connect()` connects onward. */
        this.output = this.ctx.createGain();
    }

    /**
     * Adjust the amplitude (volume) of this node's output.
     *
     * @param {number} vol - Target amplitude, generally `0`-`1`.
     * @param {number} [rampTime=0] - Time, in seconds, to smoothly ramp to `vol`. `0` changes immediately.
     * @param {number} [tFromNow=0] - Delay, in seconds, before the ramp starts.
     * @returns {SoundNode} This instance, to allow chaining.
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
     * Connects this node's output to another audio destination.
     *
     * @param {SoundNode|AudioNode|AudioParam} [unit] - Destination to connect to. Defaults to the context's speaker output (`ctx.destination`).
     * @returns {SoundNode} This instance, to allow chaining.
     */
    connect(unit) {
        const target = unit === undefined ? this.ctx.destination
            : unit instanceof SoundNode ? (unit.getInputNode ? unit.getInputNode() : unit.output)
            : unit;
        this.output.connect(target);
        return this;
    }

    /**
     * Disconnects this node's output from everything downstream, silencing
     * it without stopping/destroying it.
     *
     * @returns {SoundNode} This instance, to allow chaining.
     */
    disconnect() {
        this.output.disconnect();
        return this;
    }

    /**
     * A private-ish function called when another node tries to connect
     * *into* this one via `.setInput()`/`.connect()` - returns whichever
     * native node incoming audio should actually be wired to (which isn't
     * always `.output`; e.g. an effect's dry/wet input is upstream of its
     * output). Subclasses that receive audio (effects, `Amplitude`, `FFT`)
     * override this; sources (which have nothing upstream) don't need to.
     *
     * @returns {AudioNode} The node other nodes should connect *into*.
     */
    getInputNode() {
        return this.output;
    }

    /**
     * Returns the underlying native Web Audio node this object wraps -
     * `.output` by default, or whatever a subclass considers its primary
     * node (e.g. the `BiquadFilterNode` inside a {@link Biquad}).
     *
     * @returns {AudioNode} The primary native node.
     */
    getNode() {
        return this.output;
    }

    /**
     * Connect an audio source into this node, so it becomes (part of) this
     * node's input signal. The base implementation just connects `source`
     * to {@link SoundNode#getInputNode}; subclasses with a more
     * specific/well-known input (dry/wet effects, `Amplitude`, `FFT`,
     * `Envelope`) override this to route into the right place.
     *
     * @param {SoundNode|AudioNode} source - Source to connect in.
     * @returns {SoundNode} This instance, to allow chaining.
     */
    setInput(source) {
        const node = source instanceof SoundNode ? source.output : source;
        node.connect(this.getInputNode());
        return this;
    }
}

// ---------------------------------------------------------------
// SoundSource - base class for things that generate sound
// ---------------------------------------------------------------

/**
 * Base class for sound *sources* - things that generate audio rather than
 * process it (oscillators, sound files, noise, microphone input). Adds
 * `start()`/`stop()`, which subclasses must implement.
 *
 * @class
 * @extends SoundNode
 */
class SoundSource extends SoundNode {
    constructor(context) {
        super(context);
        /** @type {boolean} Whether this source is currently producing sound. */
        this.started = false;
    }

    /**
     * Starts the p5 sound source. Must be overridden by subclasses.
     *
     * @abstract
     * @param {number} [time=0] - Delay, in seconds, before starting.
     * @returns {SoundSource} This instance, to allow chaining.
     */
    start(time = 0) {
        throw new Error('start() must be implemented by SoundSource subclasses.');
    }

    /**
     * Stops the p5 sound source. Must be overridden by subclasses.
     *
     * @abstract
     * @param {number} [time=0] - Delay, in seconds, before stopping.
     * @returns {SoundSource} This instance, to allow chaining.
     */
    stop(time = 0) {
        throw new Error('stop() must be implemented by SoundSource subclasses.');
    }
}

// ---------------------------------------------------------------
// SoundMixEffect - base class for dry/wet effects
// ---------------------------------------------------------------

/**
 * Base class for effects with a dry/wet mix (filters, delay, reverb).
 * Internally splits incoming audio into a dry path (straight to
 * `.output`) and a wet path (through `this.effectNode`, which subclasses
 * set up in their constructor), and crossfades between them via
 * {@link SoundMixEffect#wet}.
 *
 * @class
 * @extends SoundNode
 */
class SoundMixEffect extends SoundNode {
    constructor(context) {
        super(context);
        /** @type {GainNode} Entry point - what `setInput()`/`connect()`-into wires up to. */
        this.input = this.ctx.createGain();
        /** @type {GainNode} */
        this.dryGain = this.ctx.createGain();
        /** @type {GainNode} */
        this.wetGain = this.ctx.createGain();
        /**
         * The subclass's actual effect node (`BiquadFilterNode`,
         * `DelayNode`, `ConvolverNode`, ...) - assigned by the subclass
         * constructor, then wired into the wet path by
         * {@link SoundMixEffect#_routeEffect}.
         * @type {?AudioNode}
         */
        this.effectNode = null;

        this.input.connect(this.dryGain);
        this.dryGain.connect(this.output);
        this.wetGain.connect(this.output);

        // Fully wet by default - matches p5.sound's effects, which are
        // meant to be heard until dialed back with wet().
        this.dryGain.gain.value = 0;
        this.wetGain.gain.value = 1;
    }

    /**
     * Wires up `this.effectNode` (which the subclass must have already
     * created) into the wet signal path: `input -> effectNode -> wetGain`.
     * Called once by each subclass's constructor, after it creates
     * `this.effectNode`.
     *
     * @protected
     * @returns {void}
     */
    _routeEffect() {
        this.input.connect(this.effectNode);
        this.effectNode.connect(this.wetGain);
    }

    /** @override */
    getInputNode() {
        return this.input;
    }

    /**
     * Adjusts the balance between the source node's original (dry) and
     * effected (wet) signal.
     *
     * @param {number} amount - `0` (fully dry/bypassed) to `1` (fully wet/effected).
     * @returns {SoundMixEffect} This instance, to allow chaining.
     */
    wet(amount) {
        const now = this.ctx.currentTime;
        this.wetGain.gain.setValueAtTime(amount, now);
        this.dryGain.gain.setValueAtTime(1 - amount, now);
        return this;
    }
}

// ---------------------------------------------------------------
// Gain - the plainest possible SoundNode
// ---------------------------------------------------------------

/**
 * A single, bare gain node - useful as a lightweight submixer to route
 * several sources into (via `setInput()`) and control together (via
 * `amp()`).
 *
 * @class
 * @extends SoundNode
 */
class Gain extends SoundNode {}

// ---------------------------------------------------------------
// Panner (stereo) / Panner3D
// ---------------------------------------------------------------

/**
 * Stereo panner - positions a sound source left/right in the stereo field.
 *
 * @class
 * @extends SoundNode
 */
class Panner extends SoundNode {
    constructor(context) {
        super(context);
        this._panner = this.ctx.createStereoPanner();
        this.output.connect === undefined; // no-op guard for older linters; real wiring below
        this._panner.connect(this.output);
    }

    /** @override */
    getInputNode() { return this._panner; }
    /** @override */
    getNode() { return this._panner; }

    /**
     * Pan a sound source left or right.
     *
     * @param {number} value - Pan position, from `-1` (fully left) to `1` (fully right).
     * @param {number} [rampTime=0] - Time, in seconds, to smoothly ramp to `value`.
     * @returns {Panner} This instance, to allow chaining.
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

/**
 * 3D (HRTF) panner - positions a sound source anywhere in 3D space around
 * the listener.
 *
 * @class
 * @extends SoundNode
 */
class Panner3D extends SoundNode {
    constructor(context) {
        super(context);
        this._panner = this.ctx.createPanner();
        this._panner.panningModel = 'HRTF';
        this._panner.distanceModel = 'linear';
        this._panner.connect(this.output);
    }

    /** @override */
    getInputNode() { return this._panner; }
    /** @override */
    getNode() { return this._panner; }

    /**
     * Connects an input source to the 3D panner - equivalent to
     * `setInput()`, provided under the name p5.sound uses for this class.
     *
     * @param {SoundNode|AudioNode} source - Source to connect in.
     * @returns {Panner3D} This instance, to allow chaining.
     */
    process(source) {
        return this.setInput(source);
    }

    /** @param {number} [value] - New X position. @returns {Panner3D|number} This instance when setting, or the current X position when reading. */
    positionX(value) { return this._axis('positionX', 'setPosition', 0, value); }
    /** @param {number} [value] - New Y position. @returns {Panner3D|number} This instance when setting, or the current Y position when reading. */
    positionY(value) { return this._axis('positionY', 'setPosition', 1, value); }
    /** @param {number} [value] - New Z position. @returns {Panner3D|number} This instance when setting, or the current Z position when reading. */
    positionZ(value) { return this._axis('positionZ', 'setPosition', 2, value); }

    /**
     * Set the x, y, and z position of the 3D panner, in one call.
     *
     * @param {number} [x=0] - X position.
     * @param {number} [y=0] - Y position.
     * @param {number} [z=0] - Z position.
     * @returns {Panner3D} This instance, to allow chaining.
     */
    set(x = 0, y = 0, z = 0) {
        if (this._panner.positionX) {
            const now = this.ctx.currentTime;
            this._panner.positionX.setValueAtTime(x, now);
            this._panner.positionY.setValueAtTime(y, now);
            this._panner.positionZ.setValueAtTime(z, now);
        } else {
            this._panner.setPosition(x, y, z);
        }
        return this;
    }

    /**
     * Set the maximum distance of the panner - beyond this, the sound is
     * clamped to its quietest (per `distanceModel`).
     *
     * @param {number} distance - Maximum distance.
     * @returns {Panner3D} This instance, to allow chaining.
     */
    maxDist(distance) { this._panner.maxDistance = distance; return this; }

    /**
     * Set the rolloff rate of the panner - how quickly volume falls off
     * with distance.
     *
     * @param {number} rate - Rolloff factor.
     * @returns {Panner3D} This instance, to allow chaining.
     */
    rolloff(rate) { this._panner.rolloffFactor = rate; return this; }

    /**
     * The rolloff rate of the panner, alongside its distance model - a
     * convenience for setting `rolloff()` and `distanceModel` together.
     *
     * @param {number} rate - Rolloff factor.
     * @param {'linear'|'inverse'|'exponential'} [model='linear'] - Distance model to fall off by.
     * @returns {Panner3D} This instance, to allow chaining.
     */
    setFalloff(rate, model = 'linear') {
        this._panner.distanceModel = model;
        return this.rolloff(rate);
    }

    /**
     * @private
     * @param {string} paramName - `AudioParam` name to prefer (`'positionX'`, etc.).
     * @param {string} legacyMethod - Legacy setter to fall back to (`'setPosition'`).
     * @param {number} axisIndex - `0`/`1`/`2` for x/y/z, used with the legacy setter.
     * @param {number} [value] - New value, or `undefined` to read.
     * @returns {Panner3D|number}
     */
    _axis(paramName, legacyMethod, axisIndex, value) {
        if (this._panner[paramName]) {
            if (value === undefined) return this._panner[paramName].value;
            this._panner[paramName].setValueAtTime(value, this.ctx.currentTime);
            return this;
        }
        // Older browsers only expose setPosition(x, y, z) as a single call;
        // read/track the axes ourselves so getters still work.
        this._legacyPosition = this._legacyPosition || [0, 0, 0];
        if (value === undefined) return this._legacyPosition[axisIndex];
        this._legacyPosition[axisIndex] = value;
        this._panner.setPosition(...this._legacyPosition);
        return this;
    }
}

// ---------------------------------------------------------------
// Amplitude
// ---------------------------------------------------------------

/**
 * Tracks the amplitude (volume) of an audio source over time.
 *
 * @class
 * @extends SoundNode
 */
class Amplitude extends SoundNode {
    constructor(context) {
        super(context);
        this._analyser = this.ctx.createAnalyser();
        this._analyser.fftSize = 1024;
        this._data = new Float32Array(this._analyser.fftSize);
        this._smoothing = 0;
        this._smoothedLevel = 0;
        this._analyser.connect(this.output);
    }

    /** @override */
    getInputNode() { return this._analyser; }
    /** @override */
    getNode() { return this._analyser; }

    /**
     * Connect an audio source to the amplitude object, replacing whichever
     * source (if any) was connected before. Pass nothing to analyze the
     * whole mix (the context's destination).
     *
     * @param {SoundNode|AudioNode} [source] - Source to analyze. Defaults to the master output.
     * @returns {Amplitude} This instance, to allow chaining.
     */
    setInput(source) {
        this._analyser.disconnect();
        this._analyser.connect(this.output);
        const node = source === undefined ? this.ctx.destination
            : source instanceof SoundNode ? source.output : source;
        node.connect(this._analyser);
        return this;
    }

    /**
     * Get the current amplitude (RMS level) value of the connected sound,
     * smoothed per {@link Amplitude#smooth}.
     *
     * @returns {number} Current level, roughly `0`-`1`.
     */
    getLevel() {
        this._analyser.getFloatTimeDomainData(this._data);
        let sumSquares = 0;
        for (const sample of this._data) sumSquares += sample * sample;
        const rms = Math.sqrt(sumSquares / this._data.length);

        this._smoothedLevel = this._smoothing * this._smoothedLevel + (1 - this._smoothing) * rms;
        return this._smoothedLevel;
    }

    /**
     * Sets the amount of smoothing applied between calls to
     * {@link Amplitude#getLevel}, to even out fast fluctuations.
     *
     * @param {number} value - Smoothing factor, from `0` (no smoothing) to just under `1` (heavy smoothing).
     * @returns {Amplitude} This instance, to allow chaining.
     */
    smooth(value) {
        if (value === undefined) return this._smoothing;
        this._smoothing = Math.min(0.999, Math.max(0, value));
        return this;
    }
}

// ---------------------------------------------------------------
// FFT
// ---------------------------------------------------------------

/**
 * Analyzes the frequency spectrum and waveform of an audio source.
 *
 * @class
 * @extends SoundNode
 */
class FFT extends SoundNode {
    /**
     * @param {number} [smoothing=0.8] - `AnalyserNode.smoothingTimeConstant` for frequency analysis.
     * @param {number} [bins=1024] - Number of frequency bins - must be a power of 2; `fftSize` is set to `bins * 2`.
     * @param {AudioContext} [context]
     */
    constructor(smoothing = 0.8, bins = 1024, context) {
        super(context);
        this._analyser = this.ctx.createAnalyser();
        this._analyser.fftSize = bins * 2;
        this._analyser.smoothingTimeConstant = smoothing;
        this._analyser.connect(this.output);
    }

    /** @override */
    getInputNode() { return this._analyser; }
    /** @override */
    getNode() { return this._analyser; }

    /**
     * Connects an audio source for this FFT to analyze, replacing any
     * previous one. Pass nothing to analyze the whole mix.
     *
     * @param {SoundNode|AudioNode} [source] - Source to analyze. Defaults to the master output.
     * @returns {FFT} This instance, to allow chaining.
     */
    setInput(source) {
        this._analyser.disconnect();
        this._analyser.connect(this.output);
        const node = source === undefined ? this.ctx.destination
            : source instanceof SoundNode ? source.output : source;
        node.connect(this._analyser);
        return this;
    }

    /**
     * Returns the frequency spectrum of the input signal.
     *
     * @param {number} [bins] - Number of bins to return (resizes `fftSize` to `bins * 2` if given).
     * @param {'db'|'byte'} [scale='byte'] - `'byte'` returns `0`-`255` values; `'db'` returns raw decibel values.
     * @returns {number[]} Frequency-domain amplitude values, lowest to highest frequency.
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
     * Returns an array of sample values from the input audio (a
     * time-domain "oscilloscope" view).
     *
     * @param {number} [bins] - Number of samples to return (resizes `fftSize` to `bins * 2` if given).
     * @param {'float'|'byte'} [precision='float'] - `'float'` returns `-1`-`1` values; `'byte'` returns `0`-`255` values.
     * @returns {number[]} Time-domain sample values.
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

// ---------------------------------------------------------------
// Biquad filter family
// ---------------------------------------------------------------

/**
 * Generic biquad filter effect (lowpass/highpass/bandpass/...).
 *
 * @class
 * @extends SoundMixEffect
 */
class Biquad extends SoundMixEffect {
    /**
     * @param {BiquadFilterType} [type='lowpass'] - Filter type.
     * @param {AudioContext} [context]
     */
    constructor(type = 'lowpass', context) {
        super(context);
        this.effectNode = this.ctx.createBiquadFilter();
        this.effectNode.type = type;
        this._routeEffect();
    }

    /**
     * Set the cutoff frequency of the filter.
     *
     * @param {number} value - Frequency, in Hz.
     * @param {number} [rampTime=0] - Time, in seconds, to smoothly ramp to `value`.
     * @returns {Biquad} This instance, to allow chaining.
     */
    freq(value, rampTime = 0) { return this._setParam(this.effectNode.frequency, value, rampTime); }

    /**
     * The gain of the filter, in dB - only meaningful for `'lowshelf'`,
     * `'highshelf'`, and `'peaking'` filter types.
     *
     * @param {number} value - Gain, in dB.
     * @returns {Biquad} This instance, to allow chaining.
     */
    gain(value) { return this._setParam(this.effectNode.gain, value, 0); }

    /**
     * The filter's resonance (`Q`) factor - how sharply it emphasizes
     * frequencies near the cutoff.
     *
     * @param {number} value - Resonance factor.
     * @returns {Biquad} This instance, to allow chaining.
     */
    res(value) { return this._setParam(this.effectNode.Q, value, 0); }

    /**
     * Set the type of the filter.
     *
     * @param {BiquadFilterType} type - `'lowpass'`, `'highpass'`, `'bandpass'`, `'lowshelf'`, `'highshelf'`, `'peaking'`, `'notch'`, or `'allpass'`.
     * @returns {Biquad} This instance, to allow chaining.
     */
    setType(type) { this.effectNode.type = type; return this; }

    /**
     * @private
     * @param {AudioParam} param - Param to change.
     * @param {number} value - New value.
     * @param {number} rampTime - Ramp duration, in seconds.
     * @returns {Biquad}
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

/** A {@link Biquad} filter preset to `'bandpass'`. @class @extends Biquad */
class BandPass extends Biquad {
    constructor(freq, res, context) {
        super('bandpass', context);
        if (freq !== undefined) this.freq(freq);
        if (res !== undefined) this.res(res);
    }
}

/** A {@link Biquad} filter preset to `'highpass'`. @class @extends Biquad */
class HighPass extends Biquad {
    constructor(freq, res, context) {
        super('highpass', context);
        if (freq !== undefined) this.freq(freq);
        if (res !== undefined) this.res(res);
    }
}

/** A {@link Biquad} filter preset to `'lowpass'`. @class @extends Biquad */
class LowPass extends Biquad {
    constructor(freq, res, context) {
        super('lowpass', context);
        if (freq !== undefined) this.freq(freq);
        if (res !== undefined) this.res(res);
    }
}

// ---------------------------------------------------------------
// Delay
// ---------------------------------------------------------------

/**
 * Delay/echo effect, with a feedback loop for repeating echoes.
 *
 * @class
 * @extends SoundMixEffect
 */
class Delay extends SoundMixEffect {
    /**
     * @param {AudioContext} [context]
     */
    constructor(context) {
        super(context);
        this.effectNode = this.ctx.createDelay(5); // up to 5s max delay
        this._feedback = this.ctx.createGain();
        this._feedback.gain.value = 0;
        this._filter = this.ctx.createBiquadFilter();
        this._filter.type = 'lowpass';
        this._filter.frequency.value = 22050; // effectively "off" until process()/freq set

        // input -> delay -> filter -> wetGain, with delay -> feedback -> delay looping.
        this.input.connect(this.effectNode);
        this.effectNode.connect(this._filter);
        this._filter.connect(this.wetGain);
        this._filter.connect(this._feedback);
        this._feedback.connect(this.effectNode);
    }

    /**
     * Set the delay time, in seconds.
     *
     * @param {number} seconds - Delay time.
     * @returns {Delay} This instance, to allow chaining.
     */
    delayTime(seconds) {
        this.effectNode.delayTime.setValueAtTime(seconds, this.ctx.currentTime);
        return this;
    }

    /**
     * The amount of feedback in the delay line - how much of the delayed
     * signal is fed back in, producing repeating echoes.
     *
     * @param {number} amount - Feedback amount, generally `0`-`0.9` (values close to `1` can feed back forever).
     * @returns {Delay} This instance, to allow chaining.
     */
    feedback(amount) {
        this._feedback.gain.setValueAtTime(amount, this.ctx.currentTime);
        return this;
    }

    /**
     * Process an input signal with a delay effect - a one-call
     * convenience that connects `source` in and configures the delay's
     * main parameters together.
     *
     * @param {SoundNode|AudioNode} source - Source to process.
     * @param {number} [delayTime=0.25] - Delay time, in seconds.
     * @param {number} [feedback=0] - Feedback amount, `0`-`1`.
     * @param {number} [lowPassFreq] - Optional cutoff frequency for a lowpass filter in the feedback loop, to soften repeats.
     * @returns {Delay} This instance, to allow chaining.
     */
    process(source, delayTime = 0.25, feedback = 0, lowPassFreq) {
        this.setInput(source);
        this.delayTime(delayTime);
        this.feedback(feedback);
        if (lowPassFreq !== undefined) this._filter.frequency.setValueAtTime(lowPassFreq, this.ctx.currentTime);
        return this;
    }
}

// ---------------------------------------------------------------
// Reverb
// ---------------------------------------------------------------

/**
 * Convolution reverb effect, using a synthetically-generated (exponentially
 * decaying noise) impulse response.
 *
 * @class
 * @extends SoundMixEffect
 */
class Reverb extends SoundMixEffect {
    constructor(context) {
        super(context);
        this.effectNode = this.ctx.createConvolver();
        this._routeEffect();
        this.set(3, 2, false);
    }

    /**
     * Set the decay time of the reverb, regenerating its impulse response.
     *
     * @param {number} [seconds=3] - Decay (tail) length, in seconds.
     * @param {number} [decayRate=2] - How quickly the tail decays - higher values decay faster.
     * @param {boolean} [reverse=false] - Whether to reverse the impulse response (a swelling, backwards-sounding reverb).
     * @returns {Reverb} This instance, to allow chaining.
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

// ---------------------------------------------------------------
// Envelope (ADSR)
// ---------------------------------------------------------------

/**
 * An ADSR (attack/decay/sustain/release) envelope generator, implemented as
 * a `GainNode` whose value is automated over time - insert it into a chain
 * (or `setInput()` a source into it) to apply the shape to that signal, or
 * read/drive `output.gain` directly for controlling another param.
 *
 * @class
 * @extends SoundNode
 */
class Envelope extends SoundNode {
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
     * Sets the attack time of the envelope: how long it takes to ramp from
     * silence up to `attackLevel` once triggered.
     *
     * @param {number} [time] - Attack time, in seconds.
     * @returns {Envelope|number} This instance when setting, or the current attack time when reading.
     */
    attackTime(time) {
        if (time === undefined) return this._attackTime;
        this._attackTime = time;
        return this;
    }

    /**
     * Sets the release time of the envelope: how long it takes to ramp
     * down to `releaseLevel` once released.
     *
     * @param {number} [time] - Release time, in seconds.
     * @returns {Envelope|number} This instance when setting, or the current release time when reading.
     */
    releaseTime(time) {
        if (time === undefined) return this._releaseTime;
        this._releaseTime = time;
        return this;
    }

    /**
     * Sets the attack, decay, sustain, and release times/levels of the
     * envelope, all at once.
     *
     * @param {number} attackTime - Attack time, in seconds.
     * @param {number} decayTime - Decay time, in seconds.
     * @param {number} susRatio - Sustain level, as a fraction of `attackLevel` (`0`-`1`).
     * @param {number} releaseTime - Release time, in seconds.
     * @returns {Envelope} This instance, to allow chaining.
     */
    setADSR(attackTime, decayTime, susRatio, releaseTime) {
        this._attackTime = attackTime;
        this._decayTime = decayTime;
        this._sustainLevel = susRatio;
        this._releaseTime = releaseTime;
        return this;
    }

    /**
     * Connects an audio source to be shaped by this envelope (it becomes
     * the envelope's input, gated by `output.gain`).
     *
     * @param {SoundNode|AudioNode} source - Source to connect in.
     * @returns {Envelope} This instance, to allow chaining.
     */
    setInput(source) {
        const node = source instanceof SoundNode ? source.output : source;
        node.connect(this.output);
        return this;
    }

    /**
     * Trigger the attack, and decay portion of the envelope: ramps from
     * its current value up to `attackLevel` over `attackTime`, then decays
     * to `sustainLevel` over `decayTime`.
     *
     * @param {SoundNode|AudioNode} [input] - Optional source to `setInput()` first.
     * @param {number} [time=0] - Delay, in seconds, before starting.
     * @returns {Envelope} This instance, to allow chaining.
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
     * Trigger the release of the envelope: ramps from its current value
     * down to `releaseLevel` over `releaseTime`.
     *
     * @param {number} [time=0] - Delay, in seconds, before starting.
     * @returns {Envelope} This instance, to allow chaining.
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
     * Trigger the envelope (attack + decay), then automatically release it
     * after `sustainTime`.
     *
     * @param {SoundNode|AudioNode} [input] - Optional source to `setInput()` first.
     * @param {number} [startTime=0] - Delay, in seconds, before the attack starts.
     * @param {number} [sustainTime=0] - How long to hold at the sustain level before releasing, in seconds.
     * @returns {Envelope} This instance, to allow chaining.
     */
    play(input, startTime = 0, sustainTime = 0) {
        this.triggerAttack(input, startTime);
        this.triggerRelease(startTime + this._attackTime + this._decayTime + sustainTime);
        return this;
    }
}

// ---------------------------------------------------------------
// Noise
// ---------------------------------------------------------------

const NOISE_BUFFER_SECONDS = 2;

/**
 * Generates white, pink, or brown noise.
 *
 * @class
 * @extends SoundSource
 */
class Noise extends SoundSource {
    /**
     * @param {'white'|'pink'|'brown'} [type='white'] - Noise color.
     * @param {AudioContext} [context]
     */
    constructor(type = 'white', context) {
        super(context);
        this._type = type;
        this._node = null;
        this._buffers = {};
    }

    /**
     * Changes the type of noise function.
     *
     * @param {'white'|'pink'|'brown'} type - Noise color.
     * @returns {Noise} This instance, to allow chaining.
     */
    type(type) {
        if (type === undefined) return this._type;
        this._type = type;
        if (this.started) { this.stop(); this.start(); }
        return this;
    }

    /**
     * @private
     * @returns {AudioBuffer} A cached, looping noise buffer of the current `type`.
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
     * Start the noise source.
     *
     * @param {number} [time=0] - Delay, in seconds, before starting.
     * @returns {Noise} This instance, to allow chaining.
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
     * Stop the noise source.
     *
     * @param {number} [time=0] - Delay, in seconds, before stopping.
     * @returns {Noise} This instance, to allow chaining.
     */
    stop(time = 0) {
        if (this._node) this._node.stop(this.ctx.currentTime + time);
        this._node = null;
        this.started = false;
        return this;
    }
}

// ---------------------------------------------------------------
// Oscillator family
// ---------------------------------------------------------------

/**
 * A tone generator, wrapping a native `OscillatorNode`. Because
 * `OscillatorNode`s are one-shot (a stopped one can never be restarted),
 * `start()` transparently creates a fresh native node each time.
 *
 * @class
 * @extends SoundSource
 */
class Oscillator extends SoundSource {
    /**
     * @param {number} [freq=440] - Starting frequency, in Hz.
     * @param {OscillatorType} [type='sine'] - Waveform shape.
     * @param {AudioContext} [context]
     */
    constructor(freq = 440, type = 'sine', context) {
        super(context);
        this._freq = freq;
        this._type = type;
        this._phase = 0;
        this._node = null;
    }

    /**
     * Adjusts the frequency of the oscillator.
     *
     * @param {number} value - Frequency, in Hz.
     * @param {number} [rampTime=0] - Time, in seconds, to smoothly ramp to `value`.
     * @returns {Oscillator|number} This instance when setting, or the current frequency when reading.
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
     * Adjusts the phase of the oscillator, as a fraction of one full cycle
     * (`0`-`1`). Applied by briefly delaying the next `start()` by that
     * fraction of a period - Web Audio has no native way to change the
     * phase of an already-running oscillator, so this is only exact when
     * set *before* `start()` (or before `stop()`+`start()` again).
     *
     * @param {number} value - Phase offset, from `0` to `1`.
     * @returns {Oscillator} This instance, to allow chaining.
     */
    phase(value) {
        this._phase = ((value % 1) + 1) % 1;
        return this;
    }

    /**
     * Sets the type (waveform shape) of the oscillator.
     *
     * @param {OscillatorType} type - `'sine'`, `'square'`, `'sawtooth'`, or `'triangle'`.
     * @returns {Oscillator} This instance, to allow chaining.
     */
    setType(type) {
        this._type = type;
        if (this._node) this._node.type = type;
        return this;
    }

    /**
     * Starts the oscillator.
     *
     * @param {number} [time=0] - Delay, in seconds, before starting.
     * @param {number} [freq] - Frequency to start at, in Hz (overrides any previously-set frequency).
     * @returns {Oscillator} This instance, to allow chaining.
     */
    start(time = 0, freq) {
        if (this.started) this.stop();
        if (freq !== undefined) this._freq = freq;

        this._node = this.ctx.createOscillator();
        this._node.type = this._type;
        this._node.frequency.setValueAtTime(this._freq, this.ctx.currentTime);
        this._node.connect(this.output);

        const periodDelay = this._phase / this._freq;
        this._node.start(this.ctx.currentTime + time + periodDelay);
        this.started = true;
        return this;
    }

    /**
     * Stops the oscillator.
     *
     * @param {number} [time=0] - Delay, in seconds, before stopping.
     * @returns {Oscillator} This instance, to allow chaining.
     */
    stop(time = 0) {
        if (this._node) this._node.stop(this.ctx.currentTime + time);
        this._node = null;
        this.started = false;
        return this;
    }
}

/** An {@link Oscillator} preset to a sawtooth wave. @class @extends Oscillator */
class SawOsc extends Oscillator {
    constructor(freq = 440, context) { super(freq, 'sawtooth', context); }
}

/** An {@link Oscillator} preset to a sine wave. @class @extends Oscillator */
class SinOsc extends Oscillator {
    constructor(freq = 440, context) { super(freq, 'sine', context); }
}

/** An {@link Oscillator} preset to a square wave. @class @extends Oscillator */
class SqrOsc extends Oscillator {
    constructor(freq = 440, context) { super(freq, 'square', context); }
}

/** An {@link Oscillator} preset to a triangle wave. @class @extends Oscillator */
class TriOsc extends Oscillator {
    constructor(freq = 440, context) { super(freq, 'triangle', context); }
}

// ---------------------------------------------------------------
// AudioIn (microphone)
// ---------------------------------------------------------------

/**
 * Live audio input from the user's microphone (or other input device), via
 * `getUserMedia`.
 *
 * @class
 * @extends SoundSource
 */
class AudioIn extends SoundSource {
    constructor(context) {
        super(context);
        this._stream = null;
        this._sourceNode = null;
    }

    /**
     * Start the audio input: requests microphone permission and, once
     * granted, connects the live input to `this.output`.
     *
     * @param {function(AudioIn):void} [successCallback] - Called once the input is connected.
     * @param {function(Error):void} [errorCallback] - Called if permission is denied or input can't be opened.
     * @returns {Promise<AudioIn>} Resolves once the input is connected.
     */
    start(successCallback, errorCallback) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            const error = new Error('AudioIn requires navigator.mediaDevices.getUserMedia support.');
            if (errorCallback) errorCallback(error);
            return Promise.reject(error);
        }

        return navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            this.stop();
            this._stream = stream;
            this._sourceNode = this.ctx.createMediaStreamSource(stream);
            this._sourceNode.connect(this.output);
            this.started = true;
            if (successCallback) successCallback(this);
            return this;
        }).catch(error => {
            if (errorCallback) errorCallback(error);
            throw error;
        });
    }

    /**
     * Stop the audio input: releases the microphone and disconnects it.
     *
     * @returns {AudioIn} This instance, to allow chaining.
     */
    stop() {
        if (this._sourceNode) this._sourceNode.disconnect();
        if (this._stream) for (const track of this._stream.getTracks()) track.stop();
        this._sourceNode = null;
        this._stream = null;
        this.started = false;
        return this;
    }
}

// ---------------------------------------------------------------
// PitchShifter
// ---------------------------------------------------------------

/**
 * Shifts the pitch of an audio source in real time, without changing its
 * playback speed. Implemented with the classic two-delay-line "granular"
 * pitch-shifting technique (two crossfading `DelayNode`s whose delay time
 * ramps in a sawtooth pattern) - a reasonable, dependency-free
 * approximation, not a true phase-vocoder; short (~100ms) window artifacts
 * are normal, especially for larger shifts.
 *
 * @class
 * @extends SoundNode
 */
class PitchShifter extends SoundNode {
    /**
     * @param {SoundNode|AudioNode} [input] - Source to shift. Can also be set later via `setInput()`.
     * @param {number} [initialShift=0] - Initial shift, in semitones.
     * @param {AudioContext} [context]
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

    /** @override */
    getInputNode() { return this._input; }

    /**
     * Shift the pitch of the source audio.
     *
     * @param {number} semitones - Amount to shift, in semitones (positive = higher, negative = lower).
     * @returns {PitchShifter} This instance, to allow chaining.
     */
    shift(semitones) {
        this._shift = semitones;
        this._buildCurves();
        return this;
    }

    /**
     * (Re)builds the control-rate delayTime/gain curves used each
     * scheduling window, based on the current `shift` amount.
     *
     * @private
     * @returns {void}
     */
    _buildCurves() {
        const steps = 64;
        const rate = Math.pow(2, this._shift / 12);
        // How fast the delay "drifts" across one window, in seconds/second.
        // rate > 1 (higher pitch) -> delay shrinks over the window.
        // rate < 1 (lower pitch) -> delay grows over the window.
        const drift = (1 - rate) * this._windowSize;

        const delayCurve = new Float32Array(steps);
        const gainCurve = new Float32Array(steps);
        for (let i = 0; i < steps; i++) {
            const t = i / (steps - 1);
            delayCurve[i] = Math.max(0, this._windowSize / 2 + drift * t);
            // Triangular (Hann-ish) window so each grain fades in/out,
            // avoiding clicks at the seams between windows.
            gainCurve[i] = Math.sin(Math.PI * t);
        }
        this._delayCurve = delayCurve;
        this._gainCurve = gainCurve;
    }

    /**
     * Starts (or restarts) the recurring scheduler that keeps both delay
     * lines' automation curves populated slightly ahead of playback -
     * `AudioParam` curves can't loop natively, so this resubmits them once
     * per window, offsetting line B by half a window from line A so their
     * fades crossfade into each other.
     *
     * @private
     * @returns {void}
     */
    _startScheduling() {
        const scheduleWindow = () => {
            const now = this.ctx.currentTime + 0.02; // small lookahead
            const half = this._windowSize / 2;

            this._delayA.delayTime.setValueCurveAtTime(this._delayCurve, now, this._windowSize);
            this._gainA.gain.setValueCurveAtTime(this._gainCurve, now, this._windowSize);

            this._delayB.delayTime.setValueCurveAtTime(this._delayCurve, now + half, this._windowSize);
            this._gainB.gain.setValueCurveAtTime(this._gainCurve, now + half, this._windowSize);
        };

        scheduleWindow();
        this._scheduleTimer = setInterval(scheduleWindow, this._windowSize * 1000);
    }

    /**
     * Stops the internal scheduling loop and disconnects everything -
     * call this when you're done with a `PitchShifter` so it isn't left
     * running a `setInterval` forever.
     *
     * @returns {void}
     */
    dispose() {
        if (this._scheduleTimer) clearInterval(this._scheduleTimer);
        this._scheduleTimer = null;
        this.disconnect();
        this._input.disconnect();
    }
}

// ---------------------------------------------------------------
// SoundFile
// ---------------------------------------------------------------

/**
 * Loads and plays back an audio file.
 *
 * @class
 * @extends SoundSource
 */
class SoundFile extends SoundSource {
    /**
     * @param {string} [path] - URL/path to an audio file. Loading starts immediately if given.
     * @param {function(SoundFile):void} [onload] - Called once decoding finishes.
     * @param {function(Error):void} [onerror] - Called if loading/decoding fails.
     * @param {function(number):void} [whileLoading] - Called periodically with a `0`-`100` load percentage, if the server reports a `Content-Length`.
     * @param {AudioContext} [context]
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
     * Change the path for the soundfile, and (re)load it, replacing
     * whatever was previously loaded into this instance.
     *
     * @param {string} path - URL/path to the audio file.
     * @param {function(SoundFile):void} [onload] - Called once decoding finishes.
     * @param {function(Error):void} [onerror] - Called if loading/decoding fails.
     * @param {function(number):void} [whileLoading] - Called periodically with a `0`-`100` load percentage.
     * @returns {SoundFile} This instance, to allow chaining.
     */
    setPath(path, onload, onerror, whileLoading) {
        this._path = path;
        this.buffer = null;

        fetch(path)
            .then(async response => {
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
                    return bytes.buffer;
                }
                return response.arrayBuffer();
            })
            .then(arrayBuffer => this.ctx.decodeAudioData(arrayBuffer))
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
     * Start the soundfile. An alias for {@link SoundFile#play}.
     *
     * @param {number} [time=0] - Delay, in seconds, before starting.
     * @param {number} [rate=1] - Playback rate (`1` = normal speed).
     * @param {number} [amp=1] - Playback amplitude.
     * @returns {SoundFile} This instance, to allow chaining.
     */
    start(time = 0, rate = 1, amp = 1) {
        return this.play(time, rate, amp);
    }

    /**
     * Start the soundfile (from the beginning, or from wherever
     * {@link SoundFile#pause}/{@link SoundFile#jump} left off).
     *
     * @param {number} [time=0] - Delay, in seconds, before starting.
     * @param {number} [rate=1] - Playback rate (`1` = normal speed).
     * @param {number} [amp=1] - Playback amplitude.
     * @param {number} [loopStart] - When looping, the loop's start offset, in seconds.
     * @param {number} [duration] - How long to play before automatically stopping, in seconds. Plays to the end if omitted.
     * @returns {SoundFile} This instance, to allow chaining.
     * @throws {Error} If the file hasn't finished loading yet.
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
        if (duration !== undefined) this._sourceNode.start(this.ctx.currentTime + time, offset, duration);
        else this._sourceNode.start(this.ctx.currentTime + time, offset);

        this._playing = true;
        this.started = true;
        return this;
    }

    /**
     * Loop the soundfile: equivalent to `setLoop(true)` followed by
     * `play()`.
     *
     * @param {number} [time=0] - Delay, in seconds, before starting.
     * @param {number} [rate=1] - Playback rate.
     * @param {number} [amp=1] - Playback amplitude.
     * @param {number} [loopStart=0] - Loop start offset, in seconds.
     * @param {number} [loopEnd] - Loop end offset, in seconds. Defaults to the end of the file.
     * @returns {SoundFile} This instance, to allow chaining.
     */
    loop(time = 0, rate = 1, amp = 1, loopStart = 0, loopEnd) {
        this._looping = true;
        this._loopStart = loopStart;
        this._loopEnd = loopEnd ?? (this.buffer ? this.buffer.duration : 0);
        return this.play(time, rate, amp, loopStart);
    }

    /**
     * Set whether the soundfile should loop once it reaches the end,
     * without necessarily (re)starting playback.
     *
     * @param {boolean} [shouldLoop=true] - New loop state.
     * @returns {SoundFile} This instance, to allow chaining.
     */
    setLoop(shouldLoop = true) {
        this._looping = shouldLoop;
        if (this._sourceNode) this._sourceNode.loop = shouldLoop;
        return this;
    }

    /**
     * Return the looping state of the soundfile.
     *
     * @returns {boolean} `true` if currently set to loop.
     */
    isLooping() {
        return this._looping;
    }

    /**
     * Return the playback state of the soundfile.
     *
     * @returns {boolean} `true` if currently playing.
     */
    isPlaying() {
        return this._playing;
    }

    /**
     * Pause the soundfile, remembering the current position so
     * {@link SoundFile#play} resumes from there.
     *
     * @returns {SoundFile} This instance, to allow chaining.
     */
    pause() {
        if (!this._playing) return this;
        this._pausedAt = (this.ctx.currentTime - this._startedAt) * this._rate;
        this._stopSource();
        this._playing = false;
        return this;
    }

    /**
     * Stop the soundfile, resetting playback position back to the start.
     *
     * @param {number} [time=0] - Delay, in seconds, before stopping.
     * @returns {SoundFile} This instance, to allow chaining.
     */
    stop(time = 0) {
        this._stopSource(time);
        this._playing = false;
        this._pausedAt = 0;
        return this;
    }

    /**
     * Move the playhead of a soundfile that is currently playing to a new
     * position, without stopping playback.
     *
     * @param {number} cueTime - New position, in seconds.
     * @param {number} [duration] - How long to play before automatically stopping, in seconds.
     * @returns {SoundFile} This instance, to allow chaining.
     */
    jump(cueTime, duration) {
        const wasPlaying = this._playing;
        this._stopSource();
        this._pausedAt = cueTime;
        if (wasPlaying) this.play(0, this._rate, undefined, undefined, duration);
        return this;
    }

    /**
     * Set a loop region, without changing the current loop on/off state.
     *
     * @param {number} loopStart - Loop start offset, in seconds.
     * @param {number} loopEnd - Loop end offset, in seconds.
     * @returns {SoundFile} This instance, to allow chaining.
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
     * Set the playback rate of the soundfile.
     *
     * @param {number} [value] - Playback rate (`1` = normal speed, `2` = double speed/pitch, `0.5` = half, negative = reverse).
     * @returns {SoundFile|number} This instance when setting, or the current rate when reading.
     */
    rate(value) {
        if (value === undefined) return this._rate;
        this._rate = value;
        if (this._sourceNode) this._sourceNode.playbackRate.setValueAtTime(value, this.ctx.currentTime);
        return this;
    }

    /**
     * Returns the duration of the sound file, in seconds.
     *
     * @returns {number} Duration in seconds, or `0` if not yet loaded.
     */
    duration() {
        return this.buffer ? this.buffer.duration : 0;
    }

    /**
     * Return the number of samples in the sound file.
     *
     * @returns {number} Total sample frames, or `0` if not yet loaded.
     */
    frames() {
        return this.buffer ? this.buffer.length : 0;
    }

    /**
     * Gets the number of channels in the sound file.
     *
     * @returns {number} Channel count (`1` = mono, `2` = stereo, ...), or `0` if not yet loaded.
     */
    channels() {
        return this.buffer ? this.buffer.numberOfChannels : 0;
    }

    /**
     * Return the sample rate of the sound file.
     *
     * @returns {number} Sample rate, in Hz, or the context's sample rate if not yet loaded.
     */
    sampleRate() {
        return this.buffer ? this.buffer.sampleRate : this.ctx.sampleRate;
    }

    /**
     * Define a function to call when the soundfile is done playing (fires
     * whether playback ended naturally or via `stop()`).
     *
     * @param {function(SoundFile):void} callback - Called with this instance.
     * @returns {SoundFile} This instance, to allow chaining.
     */
    onended(callback) {
        this._onendedCallbacks.push(callback);
        return this;
    }

    /**
     * @private
     * @param {number} [time=0] - Delay, in seconds, before stopping the underlying native node.
     * @returns {void}
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
 * loadSound() returns a new {@link SoundFile} from a specified path.
 * Loading happens asynchronously; the returned `SoundFile` is usable
 * immediately for hooking up callbacks/effects, but {@link
 * SoundFile#play}/etc. must wait until `onload` fires (or `soundFile.buffer`
 * is non-`null`).
 *
 * @param {string} path - URL/path to an audio file.
 * @param {function(SoundFile):void} [onload] - Called once decoding finishes.
 * @param {function(Error):void} [onerror] - Called if loading/decoding fails.
 * @param {function(number):void} [whileLoading] - Called periodically with a `0`-`100` load percentage.
 * @returns {SoundFile} A `SoundFile`, loading in the background.
 */
function loadSound(path, onload, onerror, whileLoading) {
    return new SoundFile(path, onload, onerror, whileLoading);
}

// ---------------------------------------------------------------
// Export
// ---------------------------------------------------------------

const Sound = {
    // Globals
    loadSound,
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
    Reverb
};

return Sound;
});