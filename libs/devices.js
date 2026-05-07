export const Devices = class {
    constructor() {}

    // ─────────────────────────────────────────────
    // DEVICE DETECTION
    // ─────────────────────────────────────────────

    /**
     * Returns true if running in a browser / webview.
     */
    static isBrowser() {
        return typeof window !== "undefined" && typeof document !== "undefined";
    }

    /**
     * Returns true if running on a mobile device (iOS or Android).
     */
    static isMobile() {
        return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(
            navigator.userAgent
        );
    }

    /**
     * Returns true if running on a desktop.
     */
    static isDesktop() {
        return !Devices.isMobile();
    }

    /**
     * Returns true if running on iOS (Safari, WKWebView, or a store app webview).
     */
    static isIOS() {
        return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
            (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    }

    /**
     * Returns true if running on Android (Chrome, WebView, or a store app webview).
     */
    static isAndroid() {
        return /Android/i.test(navigator.userAgent);
    }

    /**
     * Returns true if a native iOS message bridge is available.
     * Your Swift/ObjC WKWebView must register a "nativeBridge" message handler.
     *
     * Swift setup:
     *   webView.configuration.userContentController
     *     .add(self, name: "nativeBridge")
     */
    static hasIOSBridge() {
        return !!(window.webkit?.messageHandlers?.nativeBridge);
    }

    /**
     * Returns true if a native Android JS bridge is available.
     * Your Android WebView must call:
     *   webView.addJavascriptInterface(new NativeBridge(this), "AndroidBridge")
     */
    static hasAndroidBridge() {
        return typeof window.AndroidBridge !== "undefined";
    }

    /**
     * Returns the current platform as a string.
     * @returns {"ios" | "android" | "desktop" | "unknown"}
     */
    static getPlatform() {
        if (Devices.isIOS())     return "ios";
        if (Devices.isAndroid()) return "android";
        if (Devices.isDesktop()) return "desktop";
        return "unknown";
    }

    // ─────────────────────────────────────────────
    // NATIVE BRIDGE HELPERS (internal)
    // ─────────────────────────────────────────────

    /**
     * Send a message to the native iOS layer (WKWebView message handler).
     * @param {string} action  - Action name the native side handles.
     * @param {object} [data]  - Optional payload.
     */
    static _sendIOS(action, data = {}) {
        if (Devices.hasIOSBridge()) {
            window.webkit.messageHandlers.nativeBridge.postMessage({ action, ...data });
        } else {
            console.warn(`[Devices._sendIOS] No iOS bridge. Action: ${action}`);
        }
    }

    /**
     * Send a message to the native Android layer (JavascriptInterface).
     * @param {string} action  - Action name the native side handles.
     * @param {object} [data]  - Optional payload (serialised to JSON string).
     */
    static _sendAndroid(action, data = {}) {
        if (Devices.hasAndroidBridge()) {
            window.AndroidBridge.postMessage(action, JSON.stringify(data));
        } else {
            console.warn(`[Devices._sendAndroid] No Android bridge. Action: ${action}`);
        }
    }

    /**
     * Send to whichever native bridge is present.
     * No-op on desktop/browser.
     */
    static _sendNative(action, data = {}) {
        if (Devices.isIOS())     return Devices._sendIOS(action, data);
        if (Devices.isAndroid()) return Devices._sendAndroid(action, data);
    }

    // ─────────────────────────────────────────────
    // ADS
    // ─────────────────────────────────────────────
    //
    // Mobile (iOS / Android store apps)
    //   → Messages are sent to your native bridge which calls the AdMob SDK.
    //     Your native code must handle these action strings:
    //     "showBannerAd", "hideBannerAd", "showInterstitialAd", "showRewardedAd"
    //
    // Desktop / browser
    //   → Uses Google Publisher Tags (GPT) — the standard web ad library.
    //     GPT is loaded on demand the first time an ad is requested.
    //     Replace the adUnitPath values with your own from Google Ad Manager.
    //     GPT docs: https://developers.google.com/publisher-tag/guides/get-started
    // ─────────────────────────────────────────────

    /**
     * Returns true if the current host is a local/dev environment where
     * GPT ads should be suppressed (they will always fail with CORS / 400).
     */
    static _isLocalhost() {
        const h = location.hostname;
        return h === "localhost" || h === "127.0.0.1" || h === "" || h.endsWith(".local");
    }

    /**
     * Returns true if the adId looks like a valid GPT ad unit path
     * (starts with "/"). AdMob-style IDs (e.g. "ca-app-pub-…") are not
     * valid for GPT and will cause 400 errors.
     */
    static _isValidGPTAdId(adId) {
        return typeof adId === "string" && adId.startsWith("/");
    }

    /**
     * Lazy-load the Google Publisher Tag (GPT) script for desktop/browser ads.
     * Safe to call multiple times — only injects the script once.
     * @returns {Promise<void>} Resolves when GPT is ready.
     */
    static _loadGPT() {
        return new Promise((resolve) => {
            // Already loaded and configured
            if (window.googletag && window.googletag.apiReady) {
                resolve();
                return;
            }
            window.googletag = window.googletag || { cmd: [] };
            if (document.getElementById("__gpt_script__")) {
                // Script already injected but not yet ready — queue behind it
                window.googletag.cmd.push(() => resolve());
                return;
            }
            const script = document.createElement("script");
            script.id    = "__gpt_script__";
            script.src   = "https://securepubads.g.doubleclick.net/tag/js/gpt.js";
            script.async = true;
            script.onload = () => {
                window.googletag.cmd.push(() => {
                    // One-time GPT config — replaces the deprecated enableSingleRequest()
                    window.googletag.setConfig({ singleRequest: true, lazyLoad: {
                        fetchMarginPercent: 500,
                        renderMarginPercent: 200,
                        mobileScaling: 2.0
                        }
                    });
                    window.googletag.pubads()
                    window.googletag.enableServices();
                    resolve();
                });
            };
            document.head.appendChild(script);
        });
    }

    /**
     * Show a banner ad.
     *
     * Mobile : sends "showBannerAd" to the native AdMob bridge.
     * Desktop: renders a real GPT banner via Google Ad Manager.
     *
     * @param {object} [options]
     * @param {string} [options.adId]
     *   Mobile  — your AdMob ad unit ID (e.g. "ca-app-pub-XXXX/YYYY").
     *   Desktop — your GPT ad unit path  (e.g. "/1234567/my-game-banner").
     * @param {"TOP"|"BOTTOM"} [options.position="BOTTOM"] - Banner position.
     * @param {boolean} [options.isTesting=false]          - Mobile: use AdMob test ads.
     * @param {number[]} [options.size=[728,90]]           - Desktop: GPT slot size [w, h].
     */
    static async showBannerAd({ adId = "", position = "BOTTOM", isTesting = false, size = [728, 90] } = {}) {
        if (Devices.isMobile()) {
            Devices._sendNative("showBannerAd", { adId, position, isTesting });
            return;
        }

        // ── Desktop / browser — GPT banner ──────────────────────────────────
        if (Devices._isLocalhost()) {
            console.info("[Devices.showBannerAd] Skipping GPT ad on localhost (ads require a registered production domain).");
            return;
        }
        if (!Devices._isValidGPTAdId(adId)) {
            console.warn(`[Devices.showBannerAd] Invalid GPT ad unit path: "${adId}". Expected a path starting with "/" (e.g. "/1234567/my-banner"). AdMob IDs cannot be used with GPT.`);
            return;
        }
        await Devices._loadGPT();

        // Create the container div if it doesn't exist yet
        let container = document.getElementById("__banner_ad__");
        if (!container) {
            container = document.createElement("div");
            container.id = "__banner_ad__";
            container.style.cssText =
                "position:fixed;" + (position === "TOP" ? "top:0;" : "bottom:0;") +
                "left:0;width:100%;display:flex;align-items:center;" +
                "justify-content:center;z-index:9999;box-sizing:border-box;";
            document.body.appendChild(container);
        }

        // GPT slot div — GPT needs a unique div id to render into
        const slotDivId = "__banner_ad_slot__";
        if (!document.getElementById(slotDivId)) {
            const slotDiv = document.createElement("div");
            slotDiv.id = slotDivId;
            container.appendChild(slotDiv);
        }

        window.googletag.cmd.push(() => {
            // Avoid defining the same slot twice — just refresh it
            if (Devices._gptBannerSlot) {
                window.googletag.pubads().refresh([Devices._gptBannerSlot]);
                return;
            }
            Devices._gptBannerSlot = window.googletag
                .defineSlot(adId || "/6355419/Travel/Europe", size, slotDivId)
                .addService(window.googletag.pubads());

            // enableServices() and setConfig() already called once in _loadGPT
            window.googletag.display(slotDivId);
        });
    }

    /**
     * Hide and remove the banner ad.
     */
    static hideBannerAd() {
        if (Devices.isMobile()) {
            Devices._sendNative("hideBannerAd");
            return;
        }
        // Destroy the GPT slot so it doesn't keep making requests
        if (window.googletag && Devices._gptBannerSlot) {
            window.googletag.cmd.push(() => {
                window.googletag.destroySlots([Devices._gptBannerSlot]);
                Devices._gptBannerSlot = null;
            });
        }
        document.getElementById("__banner_ad__")?.remove();
    }

    /**
     * Show a full-screen interstitial ad.
     *
     * Mobile : sends "showInterstitialAd" to the native AdMob bridge.
     * Desktop: renders a GPT out-of-page / interstitial slot in an overlay div.
     *
     * @param {object} [options]
     * @param {string} [options.adId]             - AdMob unit ID (mobile) or GPT unit path (desktop).
     * @param {boolean} [options.isTesting=false] - Mobile only.
     * @param {function} [options.onClose]        - Desktop: called when the user closes the overlay.
     */
    static async showInterstitialAd({ adId = "", isTesting = false, onClose } = {}) {
        if (Devices.isMobile()) {
            Devices._sendNative("showInterstitialAd", { adId, isTesting });
            return;
        }

        // ── Desktop / browser — GPT out-of-page interstitial ────────────────
        if (Devices._isLocalhost()) {
            console.info("[Devices.showInterstitialAd] Skipping GPT ad on localhost (ads require a registered production domain).");
            return;
        }
        if (!Devices._isValidGPTAdId(adId)) {
            console.warn(`[Devices.showInterstitialAd] Invalid GPT ad unit path: "${adId}". Expected a path starting with "/" (e.g. "/1234567/my-interstitial"). AdMob IDs cannot be used with GPT.`);
            return;
        }
        await Devices._loadGPT();

        // Build a full-screen overlay
        const overlay = document.createElement("div");
        overlay.id = "__interstitial_ad__";
        overlay.style.cssText =
            "position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;" +
            "flex-direction:column;align-items:center;justify-content:center;z-index:99999;";

        const slotDivId = "__interstitial_ad_slot__";
        const slotDiv   = document.createElement("div");
        slotDiv.id      = slotDivId;
        overlay.appendChild(slotDiv);

        // Close button
        const closeBtn = document.createElement("button");
        closeBtn.textContent = "✕  Close Ad";
        closeBtn.style.cssText =
            "margin-top:16px;padding:8px 24px;background:#fff;border:none;" +
            "border-radius:4px;cursor:pointer;font-size:14px;";
        closeBtn.onclick = () => {
            if (window.googletag && Devices._gptInterstitialSlot) {
                window.googletag.cmd.push(() => {
                    window.googletag.destroySlots([Devices._gptInterstitialSlot]);
                    Devices._gptInterstitialSlot = null;
                });
            }
            overlay.remove();
            if (typeof onClose === "function") onClose();
        };
        overlay.appendChild(closeBtn);
        document.body.appendChild(overlay);

        window.googletag.cmd.push(() => {
            Devices._gptInterstitialSlot = window.googletag
                .defineOutOfPageSlot(adId || "/6355419/Travel/Europe/France/Paris", slotDivId)
                .addService(window.googletag.pubads());

            // enableServices() already called once in _loadGPT
            window.googletag.display(slotDivId);
        });
    }

    /**
     * Show a rewarded ad.
     *
     * Mobile : sends "showRewardedAd" to the native AdMob bridge.
     *          The native layer must call window.Devices_onRewarded(data) when earned.
     * Desktop: uses a GPT rewarded ad slot. GPT fires the reward event natively.
     *
     * @param {object}   [options]
     * @param {string}   [options.adId]             - AdMob unit ID (mobile) or GPT unit path (desktop).
     * @param {boolean}  [options.isTesting=false]  - Mobile only.
     * @param {function} [options.onRewarded]       - Called with reward data when user earns reward.
     * @param {function} [options.onClose]          - Desktop: called when the ad is closed.
     */
    static async showRewardedAd({ adId = "", isTesting = false, onRewarded, onClose } = {}) {
        // Register the global callback for native mobile bridge callbacks
        if (typeof onRewarded === "function") {
            window.Devices_onRewarded = (data) => {
                onRewarded(data);
                delete window.Devices_onRewarded;
            };
        }

        if (Devices.isMobile()) {
            Devices._sendNative("showRewardedAd", { adId, isTesting });
            return;
        }

        // ── Desktop / browser — GPT rewarded ad ─────────────────────────────
        if (Devices._isLocalhost()) {
            console.info("[Devices.showRewardedAd] Skipping GPT ad on localhost (ads require a registered production domain).");
            return;
        }
        if (!Devices._isValidGPTAdId(adId)) {
            console.warn(`[Devices.showRewardedAd] Invalid GPT ad unit path: "${adId}". Expected a path starting with "/" (e.g. "/1234567/my-rewarded"). AdMob IDs cannot be used with GPT.`);
            return;
        }
        await Devices._loadGPT();

        window.googletag.cmd.push(() => {
            const rewardedSlot = window.googletag
                .defineOutOfPageSlot(
                    adId || "/6355419/Travel/Europe",
                    window.googletag.enums.OutOfPageFormat.REWARDED
                )
                .addService(window.googletag.pubads());

            window.googletag.pubads().addEventListener("rewardedSlotGranted", (event) => {
                if (typeof onRewarded === "function") onRewarded(event.payload);
            });

            window.googletag.pubads().addEventListener("rewardedSlotClosed", () => {
                window.googletag.destroySlots([rewardedSlot]);
                if (typeof onClose === "function") onClose();
            });

            // enableServices() already called once in _loadGPT
            window.googletag.display(rewardedSlot);
        });
    }

    // ─────────────────────────────────────────────
    // ACCELEROMETER
    // ─────────────────────────────────────────────

    /**
     * Start listening to accelerometer / device motion events.
     * Uses the standard Web DeviceMotionEvent API — no native bridge needed.
     * NOTE: must be called from a user-gesture handler on iOS 13+.
     *
     * @param {function} callback               - Called with { x, y, z, interval }.
     * @param {object}   [options]
     * @param {number}   [options.frequency=60] - Target updates/sec (best-effort).
     * @returns {function} Call the returned function to stop listening.
     */
    static startAccelerometer(callback, { frequency = 60 } = {}) {
        const handler = (event) => {
            const a = event.accelerationIncludingGravity || event.acceleration;
            if (!a) return;
            callback({
                x: a.x || 0,
                y: a.y || 0,
                z: a.z || 0,
                interval: event.interval || (1000 / frequency),
            });
        };

        const attach = () => {
            window.addEventListener("devicemotion", handler, { passive: true });
        };

        // iOS 13+ requires explicit permission from inside a user gesture
        if (
            typeof DeviceMotionEvent !== "undefined" &&
            typeof DeviceMotionEvent.requestPermission === "function"
        ) {
            DeviceMotionEvent.requestPermission()
                .then((state) => {
                    if (state === "granted") attach();
                    else console.warn("[Devices.startAccelerometer] Permission denied.");
                })
                .catch(console.error);
        } else {
            attach();
        }

        return () => window.removeEventListener("devicemotion", handler);
    }

    /**
     * One-shot accelerometer read.
     * @returns {Promise<{x: number, y: number, z: number, interval: number}>}
     */
    static getAccelerometerOnce() {
        return new Promise((resolve, reject) => {
            const stop = Devices.startAccelerometer((data) => {
                stop();
                resolve(data);
            });
            setTimeout(() => {
                stop();
                reject(new Error("[Devices.getAccelerometerOnce] Timed out."));
            }, 3000);
        });
    }

    // ─────────────────────────────────────────────
    // VIBRATION
    // ─────────────────────────────────────────────
    //
    // navigator.vibrate  — Android Chrome / most Android browsers. ✓
    // navigator.vibrate  — iOS Safari: NOT supported.
    // For iOS haptics we send a message to the native layer, which calls
    // UIImpactFeedbackGenerator / UINotificationFeedbackGenerator.
    // ─────────────────────────────────────────────

    /**
     * Trigger a vibration.
     * - Android: uses navigator.vibrate (Web Vibration API).
     * - iOS:     sends a haptic request to the native WKWebView bridge.
     * - Desktop: no-op.
     *
     * @param {number|number[]} [pattern=200] - ms duration or alternating vibrate/pause array.
     * @returns {boolean} true if vibration was triggered.
     */
    static vibrate(pattern = 200) {
        if (Devices.isAndroid() && "vibrate" in navigator) {
            return navigator.vibrate(pattern);
        }
        if (Devices.isIOS()) {
            // Translate pattern to a rough duration for the native haptic call
            const duration = Array.isArray(pattern) ? pattern[0] : pattern;
            Devices._sendIOS("vibrate", { duration });
            return true;
        }
        return false;
    }

    /**
     * Trigger a haptic impact.
     * - Android: short navigator.vibrate pulse.
     * - iOS:     UIImpactFeedbackGenerator via native bridge.
     * - Desktop: no-op.
     *
     * @param {"LIGHT"|"MEDIUM"|"HEAVY"} [style="MEDIUM"]
     */
    static hapticImpact(style = "MEDIUM") {
        if (Devices.isIOS()) {
            Devices._sendIOS("hapticImpact", { style });
            return;
        }
        if (Devices.isAndroid()) {
            Devices.vibrate(style === "LIGHT" ? 30 : style === "HEAVY" ? 100 : 60);
        }
    }

    /**
     * Trigger a haptic notification (success / warning / error).
     * - Android: distinct vibration pattern.
     * - iOS:     UINotificationFeedbackGenerator via native bridge.
     * - Desktop: no-op.
     *
     * @param {"SUCCESS"|"WARNING"|"ERROR"} [type="SUCCESS"]
     */
    static hapticNotification(type = "SUCCESS") {
        if (Devices.isIOS()) {
            Devices._sendIOS("hapticNotification", { type });
            return;
        }
        if (Devices.isAndroid()) {
            const patterns = { SUCCESS: [50], WARNING: [50, 50, 50], ERROR: [100, 50, 100] };
            Devices.vibrate(patterns[type] || [60]);
        }
    }

    /**
     * Stop any ongoing vibration.
     */
    static stopVibration() {
        if (Devices.isAndroid() && "vibrate" in navigator) {
            navigator.vibrate(0);
        }
        // iOS haptics are fire-and-forget; there is nothing to cancel.
    }

    // ─────────────────────────────────────────────
    // iOS GAME CENTER
    // ─────────────────────────────────────────────
    //
    // All Game Center calls go through the WKWebView native bridge.
    // Your Swift/ObjC code receives the action string and calls the
    // GKLocalPlayer / GKLeaderboard / GKAchievement APIs.
    //
    // For callbacks (authenticate, etc.) the native layer should call:
    //   window.Devices_gcCallback({ action: "authenticate", playerId: "...", ... })
    // ─────────────────────────────────────────────

    /**
     * Register a one-time callback for a Game Center native response.
     * @param {string}   action
     * @param {function} resolve
     * @param {function} reject
     */
    static _gcListen(action, resolve, reject) {
        const key = `Devices_gc_${action}`;
        window[key] = (data) => {
            delete window[key];
            if (data?.error) reject(new Error(data.error));
            else resolve(data);
        };
        // Expose a single unified entry point the native side can also use
        window.Devices_gcCallback = (data) => {
            const fn = window[`Devices_gc_${data?.action}`];
            if (typeof fn === "function") fn(data);
        };
    }

    /**
     * Authenticate the local player with Game Center (iOS only).
     * @returns {Promise<{playerId, displayName, alias}>}
     */
    static gameCenterAuthenticate() {
        if (!Devices.isIOS()) {
            return Promise.reject(new Error("[Devices.gameCenterAuthenticate] iOS only."));
        }
        return new Promise((resolve, reject) => {
            Devices._gcListen("authenticate", resolve, reject);
            Devices._sendIOS("gcAuthenticate");
        });
    }

    /**
     * Submit a score to a Game Center leaderboard (iOS only).
     * @param {object} options
     * @param {string} options.leaderboardId
     * @param {number} options.score
     */
    static gameCenterSubmitScore({ leaderboardId, score } = {}) {
        if (!Devices.isIOS()) {
            return Promise.reject(new Error("[Devices.gameCenterSubmitScore] iOS only."));
        }
        return new Promise((resolve, reject) => {
            Devices._gcListen("submitScore", resolve, reject);
            Devices._sendIOS("gcSubmitScore", { leaderboardId, score });
        });
    }

    /**
     * Show the native Game Center leaderboard UI (iOS only).
     * @param {object} [options]
     * @param {string} [options.leaderboardId]
     */
    static gameCenterShowLeaderboard({ leaderboardId = "" } = {}) {
        if (!Devices.isIOS()) {
            return Promise.reject(new Error("[Devices.gameCenterShowLeaderboard] iOS only."));
        }
        Devices._sendIOS("gcShowLeaderboard", { leaderboardId });
        return Promise.resolve();
    }

    /**
     * Report a Game Center achievement (iOS only).
     * @param {object} options
     * @param {string} options.achievementId
     * @param {number} [options.percentComplete=100]
     */
    static gameCenterReportAchievement({ achievementId, percentComplete = 100 } = {}) {
        if (!Devices.isIOS()) {
            return Promise.reject(new Error("[Devices.gameCenterReportAchievement] iOS only."));
        }
        return new Promise((resolve, reject) => {
            Devices._gcListen("reportAchievement", resolve, reject);
            Devices._sendIOS("gcReportAchievement", { achievementId, percentComplete });
        });
    }

    /**
     * Show the native Game Center achievements UI (iOS only).
     */
    static gameCenterShowAchievements() {
        if (!Devices.isIOS()) {
            return Promise.reject(new Error("[Devices.gameCenterShowAchievements] iOS only."));
        }
        Devices._sendIOS("gcShowAchievements");
        return Promise.resolve();
    }

    // ─────────────────────────────────────────────
    // EXIT GAME
    // ─────────────────────────────────────────────
    //
    // True programmatic exit is platform-dependent:
    //
    // Desktop browser  — blocked by browsers; no-op.
    // Android (store)  — native bridge calls finish() / moveTaskToBack(true).
    //                    Your Android JavascriptInterface must handle "exitApp".
    // iOS (store)      — Apple forbids exit(0). We dispatch a save-state event,
    //                    send the bridge a "minimizeApp" action (your Swift code
    //                    calls UIControl().sendAction for home), then fall back to
    //                    the apple-home:// URL scheme to push to background.
    // ─────────────────────────────────────────────

    /**
     * Exit / quit the application.
     *
     * @param {object}   [options]
     * @param {boolean}  [options.force=false]  - Android: skip the back-stack and force-close.
     * @param {function} [options.onSaveState]  - Called first on all platforms so you can
     *                                            flush saves before the app closes/suspends.
     */
    static exitGame({ force = false, onSaveState } = {}) {
        // 1. Save state before anything else
        if (typeof onSaveState === "function") {
            try { onSaveState(); } catch (e) {
                console.error("[Devices.exitGame] onSaveState threw:", e);
            }
        }

        // 2. Notify listeners so music/timers/sockets can be cleaned up
        window.dispatchEvent(new CustomEvent("appWillExit", {
            detail: { platform: Devices.getPlatform() }
        }));

        const platform = Devices.getPlatform();

        switch (platform) {
            case "android": {
                // Native bridge must handle "exitApp" and call finish() or moveTaskToBack()
                if (Devices.hasAndroidBridge()) {
                    Devices._sendAndroid("exitApp", { force });
                } else {
                    // Fallback: history manipulation to collapse the back-stack
                    window.history.go(-window.history.length);
                }
                break;
            }

            case "ios": {
                // Apple forbids true exit. Best-effort: move to background.
                if (Devices.hasIOSBridge()) {
                    // Your Swift handler should call:
                    //   UIApplication.shared.perform(#selector(NSXPCConnection.suspend))
                    // or present a "go home" action. Exact implementation is up to your native code.
                    Devices._sendIOS("minimizeApp");
                } else {
                    // Last resort — opens the home screen URL scheme, pushing app to background
                    window.location.href = "apple-home://";
                }
                break;
            }

            case "desktop":
            default: {
                // Browsers block window.close() unless the page opened itself.
                // Attempt it anyway in case the game runs in a popup window.
                window.close();
                console.info("[Devices.exitGame] Desktop browser — window.close() attempted (may be blocked).");
                break;
            }
        }
    }
};
