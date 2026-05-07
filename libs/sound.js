import { Helpers } from "./helpers.js";
/**
 * Utility class for working with browser audio.
 *
 * The Sound class provides static helper methods for loading, playing,
 * pausing, stopping, cloning, fading, and controlling HTMLAudioElement sounds.
 *
 * @example
 * import { Sound } from "./sound.js";
 *
 * const jumpSound = Sound.create("./sounds/jump.mp3", {
 *   volume: 0.6,
 *   loop: false
 * });
 *
 * Sound.play(jumpSound);
 */
export class Sound {
  /**
   * Creates a new HTMLAudioElement from a source URL.
   *
   * @param {string} src - The path or URL to the audio file.
   * @param {Object} [options={}] - Optional audio configuration.
   * @param {number} [options.volume=1] - Audio volume from 0 to 1.
   * @param {boolean} [options.loop=false] - Whether the audio should loop.
   * @param {boolean} [options.autoplay=false] - Whether the audio should autoplay.
   * @param {number} [options.playbackRate=1] - Playback speed of the audio.
   * @param {boolean} [options.muted=false] - Whether the audio starts muted.
   * @returns {HTMLAudioElement} A configured audio element.
   *
   * @example
   * const music = Sound.create("./music/theme.mp3", {
   *   volume: 0.5,
   *   loop: true
   * });
   */
  static create(src, options = {}) {
    const audio = new Audio(src);

    audio.volume = Helpers.clamp(options.volume ?? 1,0,1);
    audio.loop = options.loop ?? false;
    audio.autoplay = options.autoplay ?? false;
    audio.playbackRate = options.playbackRate ?? 1;
    audio.muted = options.muted ?? false;

    return audio;
  }

  /**
   * Loads an audio file and resolves when it is ready to play.
   *
   * @param {string} src - The path or URL to the audio file.
   * @param {Object} [options={}] - Optional audio configuration.
   * @returns {Promise<HTMLAudioElement>} A promise that resolves with the loaded audio element.
   *
   * @example
   * const laser = await Sound.load("./sounds/laser.wav");
   * Sound.play(laser);
   */
  static load(src, options = {}) {
    return new Promise((resolve, reject) => {
      const audio = Sound.create(src, options);

      audio.addEventListener(
        "canplaythrough",
        () => resolve(audio),
        { once: true }
      );

      audio.addEventListener(
        "error",
        () => reject(new Error(`Failed to load audio: ${src}`)),
        { once: true }
      );

      audio.load();
    });
  }

  /**
   * Plays an audio element.
   *
   * If the audio is already playing, it continues from its current position.
   *
   * @param {HTMLAudioElement} audio - The audio element to play.
   * @returns {Promise<void>} A promise that resolves when playback starts.
   *
   * @example
   * const sound = Sound.create("./sounds/click.mp3");
   * await Sound.play(sound);
   */
  static async play(audio) {
    if (!Sound.isAudio(audio)) {
      throw new TypeError("Sound.play expected an HTMLAudioElement.");
    }

    await audio.play();
  }

  /**
   * Plays an audio element from the beginning.
   *
   * @param {HTMLAudioElement} audio - The audio element to restart and play.
   * @returns {Promise<void>} A promise that resolves when playback starts.
   *
   * @example
   * Sound.playFromStart(explosionSound);
   */
  static async playFromStart(audio) {
    Sound.setCurrentTime(audio, 0);
    await Sound.play(audio);
  }

  /**
   * Pauses an audio element without resetting its current playback position.
   *
   * @param {HTMLAudioElement} audio - The audio element to pause.
   * @returns {void}
   *
   * @example
   * Sound.pause(backgroundMusic);
   */
  static pause(audio) {
    if (!Sound.isAudio(audio)) {
      throw new TypeError("Sound.pause expected an HTMLAudioElement.");
    }

    audio.pause();
  }

  /**
   * Stops an audio element and resets it to the beginning.
   *
   * @param {HTMLAudioElement} audio - The audio element to stop.
   * @returns {void}
   *
   * @example
   * Sound.stop(backgroundMusic);
   */
  static stop(audio) {
    Sound.pause(audio);
    Sound.setCurrentTime(audio, 0);
  }

  /**
   * Toggles playback for an audio element.
   *
   * If the audio is paused, it will play.
   * If the audio is playing, it will pause.
   *
   * @param {HTMLAudioElement} audio - The audio element to toggle.
   * @returns {Promise<boolean>} Resolves to true if playing, false if paused.
   *
   * @example
   * const isPlaying = await Sound.toggle(music);
   */
  static async toggle(audio) {
    if (!Sound.isAudio(audio)) {
      throw new TypeError("Sound.toggle expected an HTMLAudioElement.");
    }

    if (audio.paused) {
      await Sound.play(audio);
      return true;
    }

    Sound.pause(audio);
    return false;
  }

  /**
   * Sets the volume of an audio element.
   *
   * Values below 0 are clamped to 0.
   * Values above 1 are clamped to 1.
   *
   * @param {HTMLAudioElement} audio - The audio element to update.
   * @param {number} volume - The new volume from 0 to 1.
   * @returns {void}
   *
   * @example
   * Sound.setVolume(music, 0.25);
   */
  static setVolume(audio, volume) {
    if (!Sound.isAudio(audio)) {
      throw new TypeError("Sound.setVolume expected an HTMLAudioElement.");
    }

    audio.volume = Helpers.clamp(volume,0,1);
  }

  /**
   * Gets the current volume of an audio element.
   *
   * @param {HTMLAudioElement} audio - The audio element to check.
   * @returns {number} The current volume from 0 to 1.
   *
   * @example
   * const volume = Sound.getVolume(music);
   */
  static getVolume(audio) {
    if (!Sound.isAudio(audio)) {
      throw new TypeError("Sound.getVolume expected an HTMLAudioElement.");
    }

    return audio.volume;
  }

  /**
   * Mutes an audio element.
   *
   * @param {HTMLAudioElement} audio - The audio element to mute.
   * @returns {void}
   *
   * @example
   * Sound.mute(music);
   */
  static mute(audio) {
    if (!Sound.isAudio(audio)) {
      throw new TypeError("Sound.mute expected an HTMLAudioElement.");
    }

    audio.muted = true;
  }

  /**
   * Unmutes an audio element.
   *
   * @param {HTMLAudioElement} audio - The audio element to unmute.
   * @returns {void}
   *
   * @example
   * Sound.unmute(music);
   */
  static unmute(audio) {
    if (!Sound.isAudio(audio)) {
      throw new TypeError("Sound.unmute expected an HTMLAudioElement.");
    }

    audio.muted = false;
  }

  /**
   * Toggles mute on an audio element.
   *
   * @param {HTMLAudioElement} audio - The audio element to toggle mute on.
   * @returns {boolean} The new muted state.
   *
   * @example
   * const muted = Sound.toggleMute(music);
   */
  static toggleMute(audio) {
    if (!Sound.isAudio(audio)) {
      throw new TypeError("Sound.toggleMute expected an HTMLAudioElement.");
    }

    audio.muted = !audio.muted;
    return audio.muted;
  }

  /**
   * Sets whether an audio element should loop.
   *
   * @param {HTMLAudioElement} audio - The audio element to update.
   * @param {boolean} shouldLoop - Whether the audio should loop.
   * @returns {void}
   *
   * @example
   * Sound.setLoop(backgroundMusic, true);
   */
  static setLoop(audio, shouldLoop) {
    if (!Sound.isAudio(audio)) {
      throw new TypeError("Sound.setLoop expected an HTMLAudioElement.");
    }

    audio.loop = Boolean(shouldLoop);
  }

  /**
   * Sets the playback speed of an audio element.
   *
   * @param {HTMLAudioElement} audio - The audio element to update.
   * @param {number} rate - Playback speed. 1 is normal speed.
   * @returns {void}
   *
   * @example
   * Sound.setPlaybackRate(sound, 1.5);
   */
  static setPlaybackRate(audio, rate) {
    if (!Sound.isAudio(audio)) {
      throw new TypeError("Sound.setPlaybackRate expected an HTMLAudioElement.");
    }

    if (!Number.isFinite(rate) || rate <= 0) {
      throw new RangeError("Playback rate must be a positive number.");
    }

    audio.playbackRate = rate;
  }

  /**
   * Sets the current playback time of an audio element.
   *
   * @param {HTMLAudioElement} audio - The audio element to update.
   * @param {number} seconds - The playback time in seconds.
   * @returns {void}
   *
   * @example
   * Sound.setCurrentTime(music, 10);
   */
  static setCurrentTime(audio, seconds) {
    if (!Sound.isAudio(audio)) {
      throw new TypeError("Sound.setCurrentTime expected an HTMLAudioElement.");
    }

    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new RangeError("Current time must be a non-negative number.");
    }

    audio.currentTime = seconds;
  }

  /**
   * Gets the current playback time of an audio element.
   *
   * @param {HTMLAudioElement} audio - The audio element to check.
   * @returns {number} The current playback time in seconds.
   *
   * @example
   * const time = Sound.getCurrentTime(music);
   */
  static getCurrentTime(audio) {
    if (!Sound.isAudio(audio)) {
      throw new TypeError("Sound.getCurrentTime expected an HTMLAudioElement.");
    }

    return audio.currentTime;
  }

  /**
   * Gets the duration of an audio element.
   *
   * Returns 0 if the duration is not available yet.
   *
   * @param {HTMLAudioElement} audio - The audio element to check.
   * @returns {number} The duration in seconds.
   *
   * @example
   * const duration = Sound.getDuration(music);
   */
  static getDuration(audio) {
    if (!Sound.isAudio(audio)) {
      throw new TypeError("Sound.getDuration expected an HTMLAudioElement.");
    }

    return Number.isFinite(audio.duration) ? audio.duration : 0;
  }

  /**
   * Checks whether an audio element is currently playing.
   *
   * @param {HTMLAudioElement} audio - The audio element to check.
   * @returns {boolean} True if the audio is playing, otherwise false.
   *
   * @example
   * if (Sound.isPlaying(music)) {
   *   console.log("Music is playing");
   * }
   */
  static isPlaying(audio) {
    if (!Sound.isAudio(audio)) {
      return false;
    }

    return !audio.paused && !audio.ended && audio.currentTime > 0;
  }

  /**
   * Creates a clone of an audio element.
   *
   * This is useful for sound effects that may need to overlap, such as
   * repeated gunshots, footsteps, or button clicks.
   *
   * @param {HTMLAudioElement} audio - The audio element to clone.
   * @returns {HTMLAudioElement} A cloned audio element.
   *
   * @example
   * const clickClone = Sound.clone(clickSound);
   * Sound.play(clickClone);
   */
  static clone(audio) {
    if (!Sound.isAudio(audio)) {
      throw new TypeError("Sound.clone expected an HTMLAudioElement.");
    }

    return audio.cloneNode(true);
  }

  /**
   * Plays a cloned copy of an audio element from the beginning.
   *
   * This allows the same sound effect to play multiple times at once.
   *
   * @param {HTMLAudioElement} audio - The audio element to clone and play.
   * @returns {Promise<HTMLAudioElement>} A promise that resolves with the cloned audio element.
   *
   * @example
   * await Sound.playClone(explosionSound);
   */
  static async playClone(audio) {
    const clone = Sound.clone(audio);
    await Sound.playFromStart(clone);
    return clone;
  }

  /**
   * Fades an audio element to a target volume over a duration.
   *
   * @param {HTMLAudioElement} audio - The audio element to fade.
   * @param {number} targetVolume - Target volume from 0 to 1.
   * @param {number} durationMs - Fade duration in milliseconds.
   * @returns {Promise<void>} A promise that resolves when the fade is complete.
   *
   * @example
   * await Sound.fadeTo(music, 0, 1000);
   */
  static fadeTo(audio, targetVolume, durationMs) {
    if (!Sound.isAudio(audio)) {
      throw new TypeError("Sound.fadeTo expected an HTMLAudioElement.");
    }

    const safeTarget = Helpers.clamp(targetVolume,0,1);
    const startVolume = audio.volume;
    const difference = safeTarget - startVolume;
    const startTime = performance.now();

    if (durationMs <= 0) {
      audio.volume = safeTarget;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const step = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / durationMs, 1);

        audio.volume = Helpers.clamp(startVolume + difference * progress,0,1);

        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          audio.volume = safeTarget;
          resolve();
        }
      };

      requestAnimationFrame(step);
    });
  }

  /**
   * Fades in an audio element from silence.
   *
   * The audio starts at volume 0, begins playing, and fades up to the target volume.
   *
   * @param {HTMLAudioElement} audio - The audio element to fade in.
   * @param {number} [targetVolume=1] - Final volume from 0 to 1.
   * @param {number} [durationMs=1000] - Fade duration in milliseconds.
   * @returns {Promise<void>} A promise that resolves when the fade-in finishes.
   *
   * @example
   * await Sound.fadeIn(music, 0.8, 2000);
   */
  static async fadeIn(audio, targetVolume = 1, durationMs = 1000) {
    Sound.setVolume(audio, 0);
    await Sound.play(audio);
    await Sound.fadeTo(audio, targetVolume, durationMs);
  }

  /**
   * Fades out an audio element and optionally stops it.
   *
   * @param {HTMLAudioElement} audio - The audio element to fade out.
   * @param {number} [durationMs=1000] - Fade duration in milliseconds.
   * @param {boolean} [stopAfter=true] - Whether to stop the audio after fading.
   * @returns {Promise<void>} A promise that resolves when the fade-out finishes.
   *
   * @example
   * await Sound.fadeOut(music, 1500);
   */
  static async fadeOut(audio, durationMs = 1000, stopAfter = true) {
    await Sound.fadeTo(audio, 0, durationMs);

    if (stopAfter) {
      Sound.stop(audio);
    }
  }

  /**
   * Waits until an audio element finishes playing.
   *
   * @param {HTMLAudioElement} audio - The audio element to wait for.
   * @returns {Promise<void>} A promise that resolves when the audio ends.
   *
   * @example
   * await Sound.waitUntilEnded(sound);
   * console.log("Sound finished");
   */
  static waitUntilEnded(audio) {
    if (!Sound.isAudio(audio)) {
      throw new TypeError("Sound.waitUntilEnded expected an HTMLAudioElement.");
    }

    return new Promise((resolve) => {
      if (audio.ended) {
        resolve();
        return;
      }

      audio.addEventListener("ended", () => resolve(), { once: true });
    });
  }

  /**
   * Adds an event listener to an audio element.
   *
   * @param {HTMLAudioElement} audio - The audio element to listen to.
   * @param {string} eventName - The audio event name.
   * @param {Function} callback - Function called when the event fires.
   * @param {Object|boolean} [options] - Optional event listener options.
   * @returns {void}
   *
   * @example
   * Sound.on(music, "ended", () => {
   *   console.log("Music ended");
   * });
   */
  static on(audio, eventName, callback, options) {
    if (!Sound.isAudio(audio)) {
      throw new TypeError("Sound.on expected an HTMLAudioElement.");
    }

    audio.addEventListener(eventName, callback, options);
  }

  /**
   * Removes an event listener from an audio element.
   *
   * @param {HTMLAudioElement} audio - The audio element to remove the listener from.
   * @param {string} eventName - The audio event name.
   * @param {Function} callback - The callback function to remove.
   * @param {Object|boolean} [options] - Optional event listener options.
   * @returns {void}
   *
   * @example
   * const onEnd = () => console.log("Done");
   * Sound.on(sound, "ended", onEnd);
   * Sound.off(sound, "ended", onEnd);
   */
  static off(audio, eventName, callback, options) {
    if (!Sound.isAudio(audio)) {
      throw new TypeError("Sound.off expected an HTMLAudioElement.");
    }

    audio.removeEventListener(eventName, callback, options);
  }

  /**
   * Preloads multiple sounds at once.
   *
   * @param {string[]} sources - Array of audio file paths or URLs.
   * @param {Object} [options={}] - Optional configuration applied to each sound.
   * @returns {Promise<HTMLAudioElement[]>} A promise resolving with loaded audio elements.
   *
   * @example
   * const sounds = await Sound.preloadAll([
   *   "./sounds/jump.mp3",
   *   "./sounds/hit.mp3",
   *   "./sounds/win.mp3"
   * ]);
   */
  static preloadAll(sources, options = {}) {
    if (!Array.isArray(sources)) {
      throw new TypeError("Sound.preloadAll expected an array of sources.");
    }

    return Promise.all(sources.map((src) => Sound.load(src, options)));
  }

  /**
   * Checks whether a value is an HTMLAudioElement.
   *
   * @param {*} value - The value to check.
   * @returns {boolean} True if the value is an HTMLAudioElement.
   *
   * @example
   * if (Sound.isAudio(sound)) {
   *   Sound.play(sound);
   * }
   */
  static isAudio(value) {
    return value instanceof HTMLAudioElement;
  }
  /**
 * Recognizes music from either a live microphone or a playing HTMLAudioElement.
 *
 * Automatically detects the input type:
 * - Pass an HTMLAudioElement to identify what the audio player is playing.
 * - Pass "mic" (or omit the first argument) to capture from the microphone.
 *
 * @param {HTMLAudioElement|"mic"} source - The audio source to identify.
 * @param {Object} [options={}] - Recognition options.
 * @param {number} [options.recordDurationMs=8000] - How long to sample in ms (8–10s recommended).
 * @param {string} options.host - Your ACRCloud host (e.g. "identify-eu-west-1.acrcloud.com").
 * @param {string} options.accessKey - Your ACRCloud access key.
 * @param {string} options.accessSecret - Your ACRCloud access secret.
 * @returns {Promise<Object>} Resolves with track details or a { match: false } result.
 *
 * @example
 * // From an audio element
 * const music = Sound.create("./music/song.mp3");
 * await Sound.play(music);
 * const result = await Sound.recognize(music, { host, accessKey, accessSecret });
 *
 * @example
 * // From the microphone
 * const result = await Sound.recognize("mic", { host, accessKey, accessSecret });
 *
 * if (result.match) {
 *   console.log(`${result.title} by ${result.artist} — ${result.album} (${result.releaseDate})`);
 *   console.log("Genres:", result.genres.join(", "));
 * } else {
 *   console.log("No match:", result.message);
 * }
 */
static async recognize(source = "mic", options = {}) {
  const { recordDurationMs = 8000, host, accessKey, accessSecret } = options;

  if (!host || !accessKey || !accessSecret) {
    throw new Error("Sound.recognize requires options: host, accessKey, and accessSecret.");
  }

  // ── 1. Acquire the MediaStream from the correct source ──────────────────

  let stream;
  const isMic = source === "mic";
  const isAudioEl = Sound.isAudio(source);

  if (!isMic && !isAudioEl) {
    throw new TypeError(
      'Sound.recognize: source must be an HTMLAudioElement or the string "mic".'
    );
  }

  if (isMic) {
    // — Microphone path —
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      throw new Error(`Sound.recognize: Microphone access denied. ${err.message}`);
    }

  } else {
    // — Audio element path —
    if (!Sound.isPlaying(source)) {
      throw new Error("Sound.recognize: The audio element must be currently playing.");
    }

    // Reuse a shared AudioContext across calls
    if (!Sound._audioContext) {
      Sound._audioContext = new AudioContext();
    }

    const ctx = Sound._audioContext;

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    // createMediaElementSource can only be called once per element — cache the node
    if (!source._sourceNode) {
      source._sourceNode = ctx.createMediaElementSource(source);
      source._sourceNode.connect(ctx.destination); // keep audio audible
    }

    const streamDest = ctx.createMediaStreamDestination();
    source._sourceNode.connect(streamDest);

    // Store the streamDest so we can disconnect it after recording
    source._recognizeStreamDest = streamDest;
    stream = streamDest.stream;
  }

  // ── 2. Record for `recordDurationMs` ────────────────────────────────────

  const audioBlob = await new Promise((resolve, reject) => {
    const chunks = [];
    const recorder = new MediaRecorder(stream);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      if (isMic) {
        // Release the microphone
        stream.getTracks().forEach((t) => t.stop());
      } else {
        // Disconnect the silent tap from the audio element
        source._sourceNode.disconnect(source._recognizeStreamDest);
        delete source._recognizeStreamDest;
      }

      resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    };

    recorder.onerror = (e) => {
      reject(new Error(`Sound.recognize: Recording failed — ${e.error}`));
    };

    recorder.start();
    setTimeout(() => recorder.stop(), recordDurationMs);
  });

  // ── 3. Sign the ACRCloud request (HMAC-SHA1 via SubtleCrypto) ───────────

  const timestamp = Math.floor(Date.now() / 1000);
  const signingString = ["POST", "/v1/identify", accessKey, "audio", "1", timestamp].join("\n");

  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(accessSecret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(signingString));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

  // ── 4. POST to ACRCloud ──────────────────────────────────────────────────

  const form = new FormData();
  form.append("sample", audioBlob, "sample.webm");
  form.append("sample_bytes", audioBlob.size);
  form.append("access_key", accessKey);
  form.append("data_type", "audio");
  form.append("signature_version", "1");
  form.append("signature", signature);
  form.append("timestamp", timestamp);

  const response = await fetch(`https://${host}/v1/identify`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Sound.recognize: ACRCloud responded with ${response.status}`);
  }

  const json = await response.json();

  // ── 5. Parse into a clean result object ─────────────────────────────────

  if (json.status?.code !== 0) {
    return { match: false, message: json.status?.msg ?? "No match found." };
  }

  const track = json.metadata?.music?.[0];
  if (!track) {
    return { match: false, message: "No music metadata in response." };
  }

  return {
    match:            true,
    title:            track.title                                   ?? "Unknown",
    artist:           track.artists?.map((a) => a.name).join(", ") ?? "Unknown",
    album:            track.album?.name                             ?? "Unknown",
    releaseDate:      track.release_date                            ?? "Unknown",
    genres:           track.genres?.map((g) => g.name)             ?? [],
    durationSeconds:  track.duration_ms != null ? Math.round(track.duration_ms / 1000) : null,
    score:            track.score             ?? null,
    externalIds:      track.external_ids      ?? {},  // e.g. { isrc, upc }
    externalMetadata: track.external_metadata ?? {},  // e.g. Spotify / YouTube IDs
  };
}
}
