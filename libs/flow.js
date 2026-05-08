import { Canvex } from "./canvex.js";
import { Window } from "./events.js";
import { List } from "./list.js";

export const Flow = class {
    constructor() {}

    /**
     * Copies data to the clipboard.
     * @param {string} data - The text to copy.
     * @returns {Promise<{out: string}|{fail: string}>}
     */
    static async clipboard(data) {
        try {
            await navigator.clipboard.writeText(data);
            return { out: data };
        } catch (err) {
            return { fail: err.message ?? "Clipboard write failed." };
        }
    }

    /**
     * Fetches a URL with three modes:
     *   - "open"  : opens the URL in a new tab. Returns { out: url }.
     *   - "text"  : fetches and returns the response body as text. Returns { out: string } or { fail: string }.
     *   - "image" : fetches the URL and returns a loaded Image instance. Returns { out: Image } or { fail: string }.
     *
     * @param {string} url - The URL to fetch.
     * @param {"open"|"text"|"image"} [mode="open"] - The fetch mode.
     * @returns {Promise<{out: any}|{fail: string}>}
     */
    static async fetchURL(url, mode = "open") {
        switch (mode) {
            case "open": {
                try {
                    window.open(url, "_blank");
                    return { out: url };
                } catch (err) {
                    return { fail: err.message ?? "Failed to open URL." };
                }
            }

            case "text": {
                try {
                    const res = await fetch(url);
                    if (!res.ok) return { fail: `HTTP ${res.status}: ${res.statusText}` };
                    const text = await res.text();
                    return { out: text };
                } catch (err) {
                    return { fail: err.message ?? "Failed to load text." };
                }
            }

            case "image": {
                try {
                    const { Image } = await import("./image.js");
                    const img = await Image.load(url);
                    return { out: img };
                } catch (err) {
                    return { fail: err.message ?? "Failed to load image." };
                }
            }

            default:
                return { fail: `Unknown mode "${mode}". Use "open", "text", or "image".` };
        }
    }

    /**
     * Scaling modes applied to Canvex.canvas when entering fullscreen.
     *
     *   - "letterbox" : preserves aspect ratio with black bars (object-fit: contain).
     *   - "expand"    : fills the screen while preserving aspect ratio, cropping overflow (object-fit: cover).
     *   - "stretch"   : stretches to fill the screen exactly, ignoring aspect ratio (object-fit: fill).
     *   - "zoom"      : scales up uniformly as large as possible without cropping (CSS transform scale).
     *   - "none"      : removes all scaling styles, browser default behaviour.
     */
    static LETTERBOX = "letterbox";
    static EXPAND    = "expand";
    static STRETCH   = "stretch";
    static ZOOM      = "zoom";
    static NONE      = "none";

    /** @type {string} Currently active scaling mode. */
    static #scaleMode = "none";

    /**
     * Saved original canvas inline styles, captured before any scaling is applied.
     * Used to restore the canvas to its exact prior state on fullscreen exit.
     * @type {{width: string, height: string, objectFit: string, transform: string, transformOrigin: string, position: string}|null}
     */
    static #savedStyles = null;

    /** Registers a one-time Window.fullscreenChanged listener that restores the canvas when fullscreen ends. */
    static #watchForExit() {
        const prev = Window.fullscreenChanged;
        Window.fullscreenChanged = (event) => {
            // Restore original canvas styles whenever fullscreen is fully exited.
            if (!document.fullscreenElement) {
                Flow.#restoreCanvas();
                // Re-attach any prior listener the caller had set.
                Window.fullscreenChanged = prev;
            }
            prev?.(event);
        };
    }

    /** Saves the current inline styles of Canvex.canvas so they can be restored later. */
    static #saveCanvas() {
        const s = Canvex.canvas.style;
        this.#savedStyles = {
            width:           s.width,
            height:          s.height,
            objectFit:       s.objectFit,
            transform:       s.transform,
            transformOrigin: s.transformOrigin,
            position:        s.position,
        };
    }

    /** Restores Canvex.canvas inline styles to the snapshot taken by #saveCanvas(). */
    static #restoreCanvas() {
        const canvas = Canvex.canvas;
        const saved  = this.#savedStyles;

        if (saved) {
            canvas.style.width           = saved.width;
            canvas.style.height          = saved.height;
            canvas.style.objectFit       = saved.objectFit;
            canvas.style.transform       = saved.transform;
            canvas.style.transformOrigin = saved.transformOrigin;
            canvas.style.position        = saved.position;
        } else {
            // Nothing was saved — clear everything as a safe fallback.
            canvas.style.removeProperty("object-fit");
            canvas.style.removeProperty("width");
            canvas.style.removeProperty("height");
            canvas.style.removeProperty("transform");
            canvas.style.removeProperty("transform-origin");
            canvas.style.removeProperty("position");
        }

        this.#savedStyles = null;
        this.#scaleMode   = "none";
    }

    /**
     * Applies CSS scaling styles to Canvex.canvas based on the chosen mode.
     * @param {string} mode
     */
    static #applyScaleMode(mode) {
        const canvas = Canvex.canvas;

        // Clear any previously applied scaling styles before setting new ones.
        canvas.style.removeProperty("object-fit");
        canvas.style.removeProperty("width");
        canvas.style.removeProperty("height");
        canvas.style.removeProperty("transform");
        canvas.style.removeProperty("transform-origin");
        canvas.style.removeProperty("position");

        switch (mode) {
            case "letterbox":
                canvas.style.objectFit = "contain";
                canvas.style.width     = "100%";
                canvas.style.height    = "100%";
                break;

            case "expand":
                canvas.style.objectFit = "cover";
                canvas.style.width     = "100%";
                canvas.style.height    = "100%";
                break;

            case "stretch":
                canvas.style.objectFit = "fill";
                canvas.style.width     = "100%";
                canvas.style.height    = "100%";
                break;
            case "zoom": {
                // Scale uniformly so the canvas fills as much of the screen as
                // possible without cropping — driven by CSS transform scale.
                const scaleX = screen.width  / canvas.offsetWidth;
                const scaleY = screen.height / canvas.offsetHeight;
                const scale  = Math.min(scaleX, scaleY);
                canvas.style.transformOrigin = "top left";
                canvas.style.transform       = `scale(${scale})`;
                canvas.style.position        = "relative";
                break;
            }
            case "none":
            default:
                // All styles already cleared above.
                break;
        }

        this.#scaleMode = mode;
    }

    /**
     * Fullscreen utility. Always operates on Canvex.canvas.
     *
     * The canvas is restored to its original styles whenever fullscreen ends —
     * whether via "off", "toggle", or the user pressing Escape.
     *
     * Actions:
     *   - "on"     : enter fullscreen and apply the given scaling mode.
     *   - "off"    : exit fullscreen and restore the canvas.
     *   - "toggle" : enter or exit depending on current state.
     *   - "getW"   : returns the current screen width in pixels.
     *   - "getH"   : returns the current screen height in pixels.
     *
     * Scaling modes (pass as second argument):
     *   Flow.LETTERBOX | Flow.EXPAND | Flow.STRETCH | Flow.ZOOM | Flow.NONE
     *
     * @param {"on"|"off"|"toggle"|"getW"|"getH"} action
     * @param {"letterbox"|"expand"|"stretch"|"zoom"|"none"} [mode="none"]
     * @returns {Promise<{out: any}|{fail: string}>}
     */
    static async fullScreen(action, mode = "none") {
        const canvas = Canvex.canvas;

        switch (action) {
            case "on": {
                try {
                    if (!document.fullscreenElement) {
                        this.#saveCanvas();
                        this.#watchForExit();
                        await canvas.requestFullscreen();
                    }
                    this.#applyScaleMode(mode);
                    return { out: mode };
                } catch (err) {
                    return { fail: err.message ?? "Failed to enter fullscreen." };
                }
            }

            case "off": {
                try {
                    if (document.fullscreenElement) {
                        await document.exitFullscreen();
                        // #restoreCanvas() is called automatically by #watchForExit().
                    }
                    return { out: false };
                } catch (err) {
                    return { fail: err.message ?? "Failed to exit fullscreen." };
                }
            }

            case "toggle": {
                try {
                    if (document.fullscreenElement) {
                        await document.exitFullscreen();
                        // #restoreCanvas() is called automatically by #watchForExit().
                        return { out: false };
                    } else {
                        this.#saveCanvas();
                        this.#watchForExit();
                        await canvas.requestFullscreen();
                        this.#applyScaleMode(mode);
                        return { out: mode };
                    }
                } catch (err) {
                    return { fail: err.message ?? "Failed to toggle fullscreen." };
                }
            }

            case "getW":
                return { out: screen.width };

            case "getH":
                return { out: screen.height };

            default:
                return { fail: `Unknown action "${action}". Use "on", "off", "toggle", "getW", or "getH".` };
        }
    }
    /**
     * Persists and retrieves session-scoped values.
     * Data survives page reloads but is cleared when the tab or browser closes.
     *
     * Only four value types are accepted:
     *   - Number          — a plain JS number
     *   - String          — a plain JS string
     *   - List.textList   — a textList instance (saved as { _type:"textList",   items:[…] })
     *   - List.numberList — a numberList instance (saved as { _type:"numberList", items:[…] })
     *
     * Actions:
     *   - "set"    : validates and stores `value` under `key`.
     *                Returns { out: value } on success, { fail: string } on bad type.
     *   - "get"    : retrieves the value for `key` and restores list instances automatically.
     *                Returns { out: value } or { fail: string } if the key is missing.
     *   - "delete" : removes the entry for `key`. Returns { out: key }.
     *   - "clear"  : removes all session values written by saveValue. Returns { out: true }.
     *   - "has"    : returns { out: true } or { out: false }.
     *   - "keys"   : returns { out: string[] } of all stored keys (namespace stripped).
     *
     * @param {string} key
     * @param {"save"|"read"|"delete"|"clear"|"has"|"keys"} action
     * @param {Number|String|Object} [value] - Required for "set".
     * @returns {{ out: any }|{ fail: string }}
     */
    static saveValue(key, action, value) {
        const NS    = "canvex::";
        const nsKey = NS + key;

        // ── helpers ────────────────────────────────────────────────────────────

        /** Detects a list instance created by List.textList / List.numberList. */
        const isList = (v) =>
            v !== null &&
            typeof v === "object" &&
            typeof v.all  === "function" &&
            typeof v.type === "function" &&
            (v.type === String || v.type === Number);

        /**
         * Serialises a validated value to a plain object ready for JSON.stringify.
         * Returns null when the type is not allowed.
         */
        const serialise = (v) => {
            if (typeof v === "number")       return { _type: "number",     data: v };
            if (typeof v === "string")       return { _type: "string",     data: v };
            if (isList(v) && v.type === String) return { _type: "textList",   data: v.all() };
            if (isList(v) && v.type === Number) return { _type: "numberList", data: v.all() };
            return null;
        };

        /** Restores a deserialised envelope back to its original type. */
        const deserialise = (envelope) => {
            switch (envelope._type) {
                case "number":     return envelope.data;
                case "string":     return envelope.data;
                case "textList":   return envelope.data;
                case "numberList": return envelope.data;
                default:           return null;
            }
        };

        // ── actions ────────────────────────────────────────────────────────────

        try {
            switch (action) {
                case "save": {
                    const envelope = serialise(value);
                    if (envelope === null)
                        return { fail: `Invalid type. Only Number, String, List.textList, or List.numberList may be saved.` };
                    sessionStorage.setItem(nsKey, JSON.stringify(envelope));
                    return { out: value ? 1 : 0 };
                }

                case "read": {
                    const raw = sessionStorage.getItem(nsKey);
                    if (raw === null) return { fail: `Key "${key}" not found.` };
                    const restored = deserialise(JSON.parse(raw));
                    if (restored === null) return { fail: `Stored value for "${key}" has an unrecognised type.` };
                    return { out: restored };
                }

                case "delete": {
                    sessionStorage.removeItem(nsKey);
                    return { out: key };
                }

                case "clear": {
                    Object.keys(sessionStorage)
                        .filter(k => k.startsWith(NS))
                        .forEach(k => sessionStorage.removeItem(k));
                    return { out: true };
                }

                case "has": {
                    return { out: sessionStorage.getItem(nsKey) !== null };
                }

                case "keys": {
                    const keys = Object.keys(sessionStorage)
                        .filter(k => k.startsWith(NS))
                        .map(k => k.slice(NS.length));
                    return { out: keys };
                }

                default:
                    return { fail: `Unknown action "${action}". Use "save", "read", "delete", "clear", "has", or "keys".` };
            }
        } catch (err) {
            return { fail: err.message ?? "saveValue failed." };
        }
    }
}
