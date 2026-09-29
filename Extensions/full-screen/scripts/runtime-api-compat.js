/*
 * Spotify 1.3.0.277 may finish loading its ReactDOM and Mousetrap modules after
 * Spicetify 2.x has taken its one-time API snapshot. Recover those same modules
 * from Spotify's active Rspack runtime before the extension bundle starts.
 */
;(function recoverFullscreenRuntime(window) {
    const marker = "__fullScreenResilientRuntimeCompat";
    if (window[marker]) return;

    const state = (window[marker] = { startedAt: Date.now(), ready: false });
    let runtimeChunk;
    let runtimeRequire;
    let moduleTable;
    let moduleCount = -1;
    let reactDOMFactories = [];
    let mousetrapFactories = [];
    let coreCaptureComplete = false;
    let fallbackBridgeInstalled = false;
    let progressTimer;

    function getRuntimeRequire() {
        const chunk = window.rspackChunk || window.rspackChunkclient_web || window.webpackChunkclient_web;
        if (!chunk?.push) return null;
        if (chunk !== runtimeChunk || !runtimeRequire) {
            runtimeChunk = chunk;
            runtimeRequire = chunk.push([[Symbol.for("fsd-runtime-compat")], {}, (require) => require]);
            moduleTable = null;
            moduleCount = -1;
        }
        return runtimeRequire?.m ? runtimeRequire : null;
    }

    function refreshModuleCandidates(require) {
        if (moduleTable === require.m && moduleCount === Object.keys(require.m).length) return;
        moduleTable = require.m;
        const entries = Object.entries(require.m);
        moduleCount = entries.length;
        reactDOMFactories = [];
        mousetrapFactories = [];

        for (const [id, factory] of entries) {
            const source = Function.prototype.toString.call(factory);
            if (source.includes("createPortal") && source.includes("unmountComponentAtNode")) {
                reactDOMFactories.push(id);
            }
            if (source.includes("addKeycodes") && source.includes("handleKey") && source.includes("unbind")) {
                mousetrapFactories.push(id);
            }
        }
    }

    function recoverModule(require, ids, valid) {
        for (const id of ids) {
            try {
                const loaded = require(id);
                const candidate = loaded?.default ?? loaded;
                if (valid(candidate)) return candidate;
            } catch {
                // A matching factory may be a re-export; keep checking candidates.
            }
        }
        return null;
    }

    function bridgePlayerUpdates(api) {
        const player = api.Player;
        const origin = player?.origin;
        const events = origin?._events;
        if (!origin?._state || typeof events?.addListener !== "function") return false;
        if (player.__fsdRuntimeCompatBridge) return true;

        let previous = player.data ?? origin._state;
        player.data = previous;
        const dispatch = (type, data) => {
            const event = new window.Event(type);
            event.data = data;
            player.dispatchEvent(event);
        };
        const onUpdate = ({ data } = {}) => {
            const current = data ?? origin._state;
            player.data = current;
            if (previous?.item?.uri !== current?.item?.uri) dispatch("songchange", current);
            if (previous?.isPaused !== current?.isPaused) dispatch("onplaypause", current);
            previous = current;
        };

        events.addListener("update", onUpdate);
        player.__fsdRuntimeCompatBridge = true;
        state.removeFallbackBridge = () => events.removeListener?.("update", onUpdate);
        progressTimer = window.setInterval(() => {
            if (player.data?.isPaused === false) dispatch("onprogress", player.getProgress());
        }, 100);
        state.clearFallbackBridge = () => {
            state.removeFallbackBridge?.();
            window.clearInterval(progressTimer);
            delete player.__fsdRuntimeCompatBridge;
        };
        console.info("[Full Screen] Restored the delayed player event bridge.");
        return true;
    }

    function recover() {
        const api = window.Spicetify;
        if (!api) return false;

        try {
            const require = getRuntimeRequire();
            if (require) {
                refreshModuleCandidates(require);
                if (typeof api.ReactDOM?.createPortal !== "function") {
                    const reactDOM = recoverModule(
                        require,
                        reactDOMFactories,
                        (module) =>
                            typeof module?.createPortal === "function" &&
                            typeof module?.render === "function" &&
                            typeof module?.unmountComponentAtNode === "function",
                    );
                    if (reactDOM) api.ReactDOM = reactDOM;
                }
                if (typeof api.Mousetrap?.bind !== "function") {
                    const mousetrap = recoverModule(
                        require,
                        mousetrapFactories,
                        (module) =>
                            typeof module?.bind === "function" &&
                            typeof module?.unbind === "function" &&
                            typeof module?.addKeycodes === "function",
                    );
                    if (mousetrap) api.Mousetrap = mousetrap;
                }
            }

            if (api.Player && !api.Player.origin && api.Platform?.PlayerAPI) {
                const descriptor = Object.getOwnPropertyDescriptor(api.Player, "origin");
                if (!descriptor || descriptor.configurable) {
                    Object.defineProperty(api.Player, "origin", {
                        configurable: true,
                        get: () => api.Platform?.PlayerAPI,
                    });
                }
            }

            if (api.Events?.webpackLoaded?.callbacks === undefined) coreCaptureComplete = true;
            else if (!state.captureListenerAdded && api.Events?.webpackLoaded?.on) {
                state.captureListenerAdded = true;
                api.Events.webpackLoaded.on(() => {
                    coreCaptureComplete = true;
                    state.clearFallbackBridge?.();
                });
            }

            const playerOrigin = api.Player?.origin;
            if (!coreCaptureComplete && Date.now() - state.startedAt >= 1000) {
                fallbackBridgeInstalled = bridgePlayerUpdates(api);
            }

            if (typeof api.ReactDOM?.render === "function" &&
                typeof api.Mousetrap?.bind === "function" &&
                playerOrigin?._state &&
                (coreCaptureComplete || fallbackBridgeInstalled)) {
                api.Player.data ??= playerOrigin._state;
                state.ready = true;
                window.clearInterval(state.pollTimer);
                return true;
            }
        } catch (error) {
            if (!state.loggedError) {
                state.loggedError = true;
                console.warn("[Full Screen] Waiting for Spotify's player APIs.", error);
            }
        }
        return false;
    }

    if (!recover()) state.pollTimer = window.setInterval(recover, 100);
})(window);
