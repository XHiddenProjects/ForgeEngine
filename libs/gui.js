import { Keyboard } from "./events.js";
import { Elements } from "./elements.js";
import { Helpers } from "./helpers.js";

// --- Striped progress bar helper (injects keyframes once) ---
const GUI_STRIPE_STYLE_ID = "gui-stripes-style";
function ensureStripeCSS() {
    if (typeof document === "undefined") return;
    if (document.getElementById(GUI_STRIPE_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = GUI_STRIPE_STYLE_ID;
    style.textContent = `
@keyframes guiStripesMove {
  from { background-position: 0 0; }
  to   { background-position: var(--gui-stripe-shift, 40px) 0; }
}`;
    document.head.appendChild(style);
}

/**
 * GUI utility class for rendering UI elements on top of the Canvex canvas.
 * @export
 * @class GUI
 */
export const GUI = class {
    constructor() {}

    /**
     * Shows or hides the mouse cursor over the canvas.
     *
     * @param {boolean} [show=true] - Whether the cursor should be visible.
     */
    static cursor(show = true) {
        if (!show) Canvex.canvas.style.cursor = 'none';
        else Canvex.canvas.style.cursor = 'default';
    }

    /**
     * Creates a modal alert dialog with a backdrop and animated appearance.
     *
     * @param {Object} [config={}] Configuration options for the alert.
     * @param {string} [config.title="Alert"] Title text displayed at the top.
     * @param {string} [config.subtitle=""] Optional smaller subtitle below the title.
     * @param {string} [config.body="Something happened."] Main body text.
     * @param {string} [config.buttonText="OK"] Text shown on the action button.
     * @param {string|HTMLElement} [config.icon="!"] Icon content. Can be a string (text/emoji/HTML) or a DOM element.
     * @param {string} [config.accent="#6c63ff"] Accent color used for icon and highlights.
     * @param {string} [config.background] Background CSS value for the alert container.
     * @param {string} [config.buttonBG] Button background color.
     * @param {string} [config.buttonHoverBG] Button hover background color.
     * @param {string} [config.text] Primary text color.
     * @param {string} [config.mutedText] Secondary/muted text color.
     * @param {string} [config.maxWidth="420px"] Maximum width of the alert dialog.
     * @param {boolean} [config.closeOnBackdrop=true] Whether clicking the backdrop closes the alert.
     * @param {Function} [config.click] Callback invoked when the button is clicked.
     *
     * @returns {{ show: Function, hide: Function }} Frozen API to control the alert visibility.
     */
    static alert(config = {}) {
        const settings = {
            title: "Alert",
            subtitle: "",
            body: "Something happened.",
            buttonText: "OK",
            icon: "!",

            accent: "#6c63ff",
            background: "linear-gradient(145deg, #20232b, #14161c)",
            buttonBG: "#6c63ff",
            buttonHoverBG: "#7c74ff",
            text: "#f4f4f5",
            mutedText: "#a1a1aa",
            maxWidth: "420px",

            closeOnBackdrop: true,
            click: () => {},
            ...config
        };

        /* ---------- Backdrop ---------- */
        const backdrop = Elements.createDiv("");
        Object.assign(backdrop.style, {
            position: "fixed",
            inset: "0",
            background: "rgba(0,0,0,0.58)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "none",
            opacity: "0",
            transition: "opacity .22s ease",
            zIndex: 9998
        });

        /* ---------- Alert Box ---------- */
        const alertBox = Elements.createDiv(`
            <div class="gui-alert-icon"></div>
            <h3 class="gui-alert-title">${settings.title}</h3>
            ${settings.subtitle ? `<p class="gui-alert-subtitle">${settings.subtitle}</p>` : ""}
            <p class="gui-alert-body">${settings.body}</p>
            <button class="gui-alert-button">${settings.buttonText}</button>
        `);

        Object.assign(alertBox.style, {
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%) scale(0.92)",
            background: settings.background,
            color: settings.text,
            padding: "28px",
            borderRadius: "20px",
            width: "calc(100% - 40px)",
            maxWidth: settings.maxWidth,
            boxShadow: "0 24px 80px rgba(0,0,0,.55)",
            border: "1px solid rgba(255,255,255,.09)",
            display: "none",
            opacity: "0",
            transition: "opacity .22s ease, transform .22s cubic-bezier(.2,.8,.2,1)",
            zIndex: 9999,
            textAlign: "center",
            boxSizing: "border-box",
            fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        });

        const iconEl = alertBox.querySelector(".gui-alert-icon");
        const button = alertBox.querySelector(".gui-alert-button");

        Object.assign(iconEl.style, {
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            margin: "0 auto 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: settings.accent,
            color: "#fff",
            fontSize: "24px",
            fontWeight: "800",
            boxShadow: `0 12px 28px ${settings.accent}55`
        });

        // Custom icon handling
        if (settings.icon instanceof HTMLElement) {
            iconEl.innerHTML = "";
            iconEl.appendChild(settings.icon);
        } else {
            iconEl.innerHTML = settings.icon;
        }

        Object.assign(button.style, {
            width: "100%",
            background: settings.buttonBG,
            color: "#fff",
            border: "none",
            padding: "12px 18px",
            borderRadius: "12px",
            cursor: "pointer",
            fontSize: "15px",
            fontWeight: "700",
            transition: "transform .15s ease, background .15s ease",
            "margin-top": "1rem"
        });

        button.onmouseenter = () => (button.style.background = settings.buttonHoverBG);
        button.onmouseleave = () => (button.style.background = settings.buttonBG);

        /* ---------- Behavior ---------- */
        const showInternal = () => {
            backdrop.style.display = "block";
            alertBox.style.display = "block";
            requestAnimationFrame(() => {
                backdrop.style.opacity = "1";
                alertBox.style.opacity = "1";
                alertBox.style.transform = "translate(-50%, -50%) scale(1)";
            });
        };

        const hideInternal = () => {
            backdrop.style.opacity = "0";
            alertBox.style.opacity = "0";
            alertBox.style.transform = "translate(-50%, -50%) scale(0.92)";
            setTimeout(() => {
                backdrop.style.display = "none";
                alertBox.style.display = "none";
            }, 220);
        };

        button.onclick = () => {
            settings.click();
            hideInternal();
        };

        if (settings.closeOnBackdrop) backdrop.onclick = hideInternal;
        Keyboard.attach(window);
        Keyboard.keyPressed = function(e){
            if (Keyboard.keyIsDown('Escape')) hideInternal();
        };

        return Object.freeze({
            show: Object.freeze(showInternal),
            hide: Object.freeze(hideInternal)
        });
    }
    /**
     * Creates a progress bar overlay.
     *
     *
     * @param {Object} [config={}]
     * @param {number} [config.x=20] X offset from the canvas top-left (px).
     * @param {number} [config.y=20] Y offset from the canvas top-left (px).
     * @param {number|string} [config.width=260] Width in px (number) or any CSS width string.
     * @param {number|string} [config.height=14] Height in px (number) or any CSS height string.
     * @param {number} [config.value=0] Current progress value.
     * @param {number} [config.max=100] Max progress value.
     * @param {string} [config.track="rgba(255,255,255,0.18)"] Track/background color.
     * @param {string} [config.fill="#6c63ff"] Fill color.
     * @param {string} [config.border="1px solid rgba(255,255,255,0.22)"] Border style.
     * @param {number|string} [config.radius=999] Border radius in px (number) or CSS radius string.
     * @param {boolean} [config.showText=false] Show percent text centered on the bar.
     * @param {string} [config.textColor="#ffffff"] Text color when showText is true.
     * @param {string} [config.font="12px Inter, system-ui, -apple-system, Segoe UI, sans-serif"] Label font.
     * @param {number} [config.zIndex=9997] Z index layering.
     * @param {boolean} [config.striped=false] Whether the fill uses a stripe overlay.
     * @param {string|null} [config.stripeAssetUrl=null] Optional replaceable asset URL (e.g. "./assets/gui-stripes.svg").
     * @param {number} [config.stripeAngle=45] Stripe angle (gradient fallback only).
     * @param {number} [config.stripeOpacity=0.22] Stripe opacity (gradient fallback only).
     * @param {number} [config.stripeSize=14] Stripe size in px.
     * @param {boolean} [config.animateStripes=true] Whether the stripe overlay scrolls.
     * @param {number} [config.stripeSpeed=0.8] Stripe scroll speed in seconds.
     * @param {boolean} [config.animate=true] Animate width transitions.
     *
     * @returns {{
     *  set: (value:number, max?:number)=>void,
     *  reset: (value?:number, max?:number)=>void,
     *  get: ()=>({value:number,max:number,percent:number}),
     *  show: ()=>void,
     *  hide: ()=>void,
     *  remove: ()=>void,
     *  onProgress: ()=>({value:number,max:number,percent:number}),
     *  onDone: ()=>()
     * }}
     */
    static bar(config = {}) {
        const settings = {
            x: 20,
            y: 20,
            width: 260,
            height: 14,
            value: 0,
            max: 100,
            track: "rgba(255,255,255,0.18)",
            fill: "#6c63ff",
            border: "1px solid rgba(255,255,255,0.22)",
            radius: 999,
            showText: false,
            textColor: "#ffffff",
            font: "12px Inter, system-ui, -apple-system, Segoe UI, sans-serif",
            zIndex: 9997,
            animate: true,

            // Striped option (can use a replaceable asset file via stripeAssetUrl)
            striped: false,
            stripeAngle: 45,
            stripeOpacity: 0.22,
            stripeSize: 14,
            animateStripes: true,
            stripeSpeed: 0.8,
            stripeAssetUrl: null,

            // Callbacks
            onProgress: null,
            onDone: null,

            ...config
        };

        const px = (v) => (typeof v === "number" ? `${v}px` : String(v));
        const toPercent = (value, max) => (max <= 0 ? 0 : (value / max) * 100);

        // Outer container created via Elements.js (matches the style used by GUI.alert) [1](https://ashlanduniversity-my.sharepoint.com/personal/gzeager_ashland_edu/Documents/Microsoft%20Copilot%20Chat%20Files/gui.js)
        const bar = Elements.createDiv("");
        bar.classList.add("gui-progress");

        Object.assign(bar.style, {
            // Elements.js already places it over the canvas; we offset from that anchor via top/left
            top: `${settings.y}px`,
            left: `${settings.x}px`,
            transform: "translate(-50%,-50%)",
            width: px(settings.width),
            height: px(settings.height),

            background: settings.track,
            border: settings.border,
            borderRadius: px(settings.radius),
            overflow: "hidden",
            boxSizing: "border-box",

            display: "none",
            opacity: "1",
            pointerEvents: "none",
            zIndex: settings.zIndex,

            // Optional polish
            boxShadow: "0 10px 24px rgba(0,0,0,.25)"
        });

        // Fill (don’t use Elements.createDiv here or it will auto-append as a separate overlay)
        const fill = document.createElement("div");
        fill.classList.add("gui-progress-fill");
        Object.assign(fill.style, {
            height: "100%",
            width: "0%",
            background: settings.fill,
            borderRadius: px(settings.radius),
            transition: settings.animate ? "width .14s ease" : "none"
        });
        // Optional striped fill
        if (settings.striped) {
            ensureStripeCSS();

            // Base fill color under stripes
            fill.style.backgroundColor = settings.fill;

            // If you provide a replaceable file (e.g. ./assets/gui-stripes.svg), we use it.
            // This lets you drag-and-replace the asset without touching code.
            if (settings.stripeAssetUrl) {
                fill.style.backgroundImage = `url("${settings.stripeAssetUrl}")`;
                fill.style.backgroundRepeat = "repeat";
                fill.style.backgroundSize = `${settings.stripeSize}px ${settings.stripeSize}px`;
            } else {
                // CSS gradient fallback (no asset file needed)
                const stripeWhite = `rgba(255,255,255,${settings.stripeOpacity})`;
                fill.style.backgroundImage = `linear-gradient(${settings.stripeAngle}deg,
                    ${stripeWhite} 25%,
                    transparent 25%,
                    transparent 50%,
                    ${stripeWhite} 50%,
                    ${stripeWhite} 75%,
                    transparent 75%,
                    transparent
                )`;
                fill.style.backgroundSize = `${settings.stripeSize}px ${settings.stripeSize}px`;
            }

            // Animate stripe movement
            fill.style.setProperty("--gui-stripe-shift", `${settings.stripeSize}px`);
            if (settings.animateStripes) {
                fill.style.animation = `guiStripesMove ${settings.stripeSpeed}s linear infinite`;
            }
        }

        // Add fill to bar
        bar.appendChild(fill);

        // Optional centered label
        let label = null;
        if (settings.showText) {
            label = document.createElement("div");
            label.classList.add("gui-progress-label");
            Object.assign(label.style, {
                position: "absolute",
                inset: "0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: settings.textColor,
                font: settings.font,
                letterSpacing: ".2px",
                textShadow: "0 2px 10px rgba(0,0,0,.45)",
                userSelect: "none",
                pointerEvents: "none"
            });
            bar.style.position = "absolute"; // ensure label positions correctly within bar
            bar.appendChild(label);
        }

        // Callback listeners (config + runtime subscriptions)
        const progressListeners = [];
        const doneListeners = [];
        if (typeof settings.onProgress === "function") progressListeners.push(settings.onProgress);
        if (typeof settings.onDone === "function") doneListeners.push(settings.onDone);
        var doneFired = false;

        // Track last emitted progress state to prevent onProgress spam once clamped at max
        let lastV = null;
        let lastM = null;
        let lastPct = null;

        const api = {
            set(value, max) {
                if (typeof max === "number") settings.max = max;
                settings.value = value;

                const v = Helpers.clamp(Number(settings.value) || 0, 0, Number(settings.max) || 0);
                const m = Number(settings.max) || 0;
                const pct = Helpers.clamp(toPercent(v, m), 0, 100);

                fill.style.width = `${pct}%`;
                if (label) label.textContent = `${Math.round(pct)}%`;

                const state = { value: v, max: m, percent: pct };

                // Determine completion state *before* emitting callbacks
                const isDone = m > 0 && v >= m;
                const wasDone = doneFired;
                // Prevent onProgress spam when values are repeatedly clamped to max
                const changed = v !== lastV || m !== lastM || pct !== lastPct;
                if (changed) {
                    lastV = v;
                    lastM = m;
                    lastPct = pct;
                }

                // Fire progress callbacks while in-flight, plus one final emission at completion
                const firstDoneFrame = isDone && !wasDone;
                if (changed && (!isDone || firstDoneFrame)) {
                    for (const fn of progressListeners) {
                        try { fn(state); } catch (err) { console.error("GUI.bar onProgress callback error", err); }
                    }
                }

                // Fire done callbacks once when crossing the finish line
                if (firstDoneFrame) {
                    for (const fn of doneListeners) {
                        try { fn(state); } catch (err) { console.error("GUI.bar onDone callback error", err); }
                    }
                }

                // Update completion latch (resets automatically if we go back under max)
                doneFired = isDone;
            },
            /** Reset completion state and restart the bar from a value (defaults to 0). */
            reset(value = 0, max = settings.max) {
                // Disable transition for the entire reset so no reverse tween plays
                const prevTransition = fill.style.transition;
                fill.style.transition = "none";

                // Wipe the fill to 0 instantly
                fill.style.width = "0%";
                if (label) label.textContent = "0%";

                // Restart stripe animation timing (if enabled)
                if (settings.striped && settings.animateStripes) {
                    const prevAnim = fill.style.animation;
                    fill.style.animation = "none";
                    void fill.offsetHeight; // flush stripe animation restart
                    fill.style.animation = prevAnim || `guiStripesMove ${settings.stripeSpeed}s linear infinite`;
                }

                // Clear completion + spam guard state so onProgress/onDone fire correctly
                doneFired = false;
                lastV = null;
                lastM = null;
                lastPct = null;

                // Apply new value while transition is still off (prevents animated jump)
                api.set(value, max);

                // Force reflow to commit the new width, then restore transition for future updates
                void fill.offsetWidth;
                fill.style.transition = prevTransition;

                return api;
            },
            get() {
                const v = Helpers.clamp(Number(settings.value) || 0, 0, Number(settings.max) || 0);
                const m = Number(settings.max) || 0;
                const pct = Helpers.clamp(toPercent(v, m), 0, 100);
                return { value: v, max: m, percent: pct };
            },

            show() {
                bar.style.display = "block";
            },

            hide() {
                bar.style.display = "none";
            },
            remove() {
                bar.remove();
            },

            /** Register a progress callback (in addition to config.onProgress). */
            onProgress(fn) {
                if (typeof fn === "function") progressListeners.push(fn);
                return api;
            },

            /** Register a done callback (in addition to config.onDone). */
            onDone(fn) {
                if (typeof fn === "function") doneListeners.push(fn);
                return api;
            }
        };

        // Initialize
        api.set(settings.value, settings.max);

        return Object.freeze(api);
    }
};