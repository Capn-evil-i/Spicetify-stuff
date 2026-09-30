import ReactDOM from "react-dom";
import React from "react";
import CFM from "../../../utils/config";
import translations from "../../../resources/strings";
import ICONS, { DEFAULTS } from "../../../constants";
import { Config, Settings } from "../../../types/fullscreen";
import Utils from "../../../utils/utils";
import { setHudPerspectiveStrength } from "../../../utils/hud-perspective";
import { DOM } from "../../elements";
import { headerText, getSettingCard, createAdjust, getAboutSection } from "../../../utils/setting";
import SeekableProgressBar from "../ProgressBar/ProgressBar";
import SeekableVolumeBar from "../VolumeBar/VolumeBar";
import OverviewCard from "../OverviewPopup/OverviewCard";
import {
    modifyRotationSpeed,
    animateColor,
} from "../../../utils/animation";
import { PopupModal } from "../PopupModal/PopupModal";

const GLOW_SETTING_KEYS = [
    "glowLyrics",
    "glowTitle",
    "glowDetails",
    "glowProgressBar",
    "glowControls",
    "glowArt",
] as const;

export class ConfigManager {
    static configContainer: HTMLDivElement;
    static overlayTimout: NodeJS.Timeout;
    static render: () => void;
    static activate: () => Promise<void>;
    static deactivate: () => Promise<void>;
    static openwithDef: () => void;
    static openwithTV: () => void;
    static updateBackground: (meta: any, fromResize?: boolean) => Promise<void>;
    static updateUpNextShow: () => void;
    static updateMainColor: (imageURL: string, meta: Spicetify.Metadata) => Promise<void>;

    static init(
        render: () => void,
        activate: () => Promise<void>,
        deactivate: () => Promise<void>,
        openwithDef: () => void,
        openwithTV: () => void,
        updateBackground: (meta: any, fromResize?: boolean) => Promise<void>,
        updateUpNextShow: () => void,
        updateMainColor: (imageURL: string, meta: Spicetify.Metadata) => Promise<void>
    ) {
        this.render = render;
        this.activate = activate;
        this.deactivate = deactivate;
        this.openwithDef = openwithDef;
        this.openwithTV = openwithTV;
        this.updateBackground = updateBackground;
        this.updateUpNextShow = updateUpNextShow;
        this.updateMainColor = updateMainColor;
    }

    static saveOption(key: keyof Settings, value: Settings[keyof Settings]) {
        CFM.set(key, value);
        this.render();
        if (Utils.isModeActivated()) this.activate();
    }

    static saveGlobalOption(key: keyof Config, value: Config[keyof Config]) {
        CFM.setGlobal(key, value);
        // LOCALE = CFM.getGlobal("locale") as Config["locale"]; // Update locale handled in app.tsx or getter
        this.render();
        if (Utils.isModeActivated()) this.activate();
    }

    static syncGlowAllToggle() {
        const card = this.configContainer?.querySelector<HTMLElement>('[setting-key="glowAll"]');
        const toggle = card?.querySelector<HTMLInputElement>("input");
        if (!toggle) return;

        const enabledCount = GLOW_SETTING_KEYS.filter((key) => Boolean(CFM.get(key))).length;
        const allEnabled = enabledCount === GLOW_SETTING_KEYS.length;
        const partiallyEnabled = enabledCount > 0 && !allEnabled;
        const atDefaults = GLOW_SETTING_KEYS.every(
            (key) => CFM.get(key) === DEFAULTS[CFM.getMode()][key],
        );

        toggle.checked = allEnabled;
        toggle.indeterminate = partiallyEnabled;
        card?.classList.toggle("is-partial", partiallyEnabled);
        card?.setAttribute("setting-default", String(atDefaults));
    }

    static syncGlowSettingInputs() {
        GLOW_SETTING_KEYS.forEach((key) => {
            const input = this.configContainer?.querySelector<HTMLInputElement>(
                `[setting-key="${key}"] input`,
            );
            if (input) input.checked = Boolean(CFM.get(key));
        });
        this.syncGlowAllToggle();
    }

    static syncVisualEffectClasses() {
        const glowClasses = {
            glowLyrics: "glow-lyrics",
            glowTitle: "glow-title",
            glowDetails: "glow-details",
            glowProgressBar: "glow-progress",
            glowControls: "glow-controls",
            glowArt: "glow-art",
        } as const;
        for (const [key, className] of Object.entries(glowClasses) as [keyof typeof glowClasses, string][]) {
            DOM.container.classList.toggle(className, Boolean(CFM.get(key)));
        }
        DOM.container.classList.toggle("hud-perspective", Boolean(CFM.get("hudPerspective")));
        setHudPerspectiveStrength(DOM.container, Number(CFM.get("hudPerspectiveStrength")));
    }

    static createGlowAllToggle(LOCALE: string) {
        const card = getSettingCard(
            `<label class="switch">
                <input class="glow-all-input" type="checkbox" aria-label="${translations[LOCALE].settings.glowAll}">
                <span class="slider"></span>
            </label>`,
            translations[LOCALE].settings.glowAll,
            GLOW_SETTING_KEYS[0],
            translations[LOCALE].settings.glowAllDescription,
        );
        card.classList.add("glow-all-setting");
        card.setAttribute("setting-key", "glowAll");

        const toggle = card.querySelector<HTMLInputElement>("input");
        if (toggle) {
            toggle.onchange = (event) => {
                const enabled = (event.currentTarget as HTMLInputElement).checked;
                GLOW_SETTING_KEYS.forEach((key) => CFM.set(key, enabled));
                this.syncVisualEffectClasses();
                this.syncGlowSettingInputs();
            };
        }

        return card;
    }

    static createGlowToggle(title: string, key: (typeof GLOW_SETTING_KEYS)[number]) {
        return this.createToggle(title, key, (value) => {
            CFM.set(key, value);
            this.syncVisualEffectClasses();
            this.syncGlowAllToggle();
        });
    }

    static createVisualEffectsDefaultsButton(title: string, description: string) {
        const row = document.createElement("div");
        row.className = "setting-button-row visual-effects-defaults-row";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "main-buttons-button main-button-secondary";
        button.id = "reset-visual-effects";
        button.textContent = title;
        button.title = description;
        button.onclick = () => {
            const defaults = DEFAULTS[CFM.getMode()];
            for (const key of [...GLOW_SETTING_KEYS, "hudPerspective", "hudPerspectiveStrength", "hudPerspectiveBackground"] as const) {
                CFM.resetSettings(key);
            }

            this.syncVisualEffectClasses();
            this.syncGlowSettingInputs();
            const perspective = this.configContainer.querySelector<HTMLInputElement>(
                '[setting-key="hudPerspective"] input[type="checkbox"]',
            );
            if (perspective) perspective.checked = defaults.hudPerspective;
            const background = this.configContainer.querySelector<HTMLInputElement>(
                '[setting-key="hudPerspectiveBackground"] input[type="checkbox"]',
            );
            if (background) background.checked = defaults.hudPerspectiveBackground;
            const strength = this.configContainer.querySelector<HTMLInputElement>(
                '[setting-key="hudPerspectiveStrength"] input[type="range"]',
            );
            if (strength) {
                strength.value = String(defaults.hudPerspectiveStrength);
                const output = strength.parentElement?.querySelector<HTMLOutputElement>("output");
                if (output) output.value = `${defaults.hudPerspectiveStrength}%`;
            }
            for (const key of [...GLOW_SETTING_KEYS, "hudPerspective", "hudPerspectiveStrength", "hudPerspectiveBackground"] as const) {
                this.configContainer
                    .querySelector<HTMLElement>(`[setting-key="${key}"]`)
                    ?.setAttribute("setting-default", "true");
            }

        };
        row.append(button);
        return row;
    }

    static getSettingTopHeader(LOCALE: string) {
        const container = document.createElement("div");
        container.innerHTML = `
        <div class="setting-button-row">
          <button class="main-buttons-button main-button-primary" id="mode-switch">${CFM.getGlobal("tvMode")
                ? translations[LOCALE].settings.switchToFullscreen
                : translations[LOCALE].settings.switchToTV
            }</button>
          <button class="main-buttons-button main-button-primary" id="mode-exit">
            ${translations[LOCALE].settings.exit}
          </button>
        </div>`;
        container.querySelector<HTMLElement>("#mode-exit")!.onclick = this.deactivate;
        container.querySelector<HTMLElement>("#mode-switch")!.onclick = () => {
            CFM.getGlobal("tvMode") ? this.openwithDef() : this.openwithTV();
            PopupModal.hide();
        };
        return container;
    }

    static getSettingBottomHeader(LOCALE: string) {
        const container = document.createElement("div");
        container.innerHTML = `
        <div class="setting-button-row">
          <button class="main-buttons-button main-button-secondary" id="reset-switch">${translations[LOCALE].settings.configReset}</button>
          <button class="main-buttons-button main-button-secondary" id="reload-switch">${translations[LOCALE].settings.reload}</button>
        </div>`;
        container.querySelector<HTMLElement>("#reset-switch")!.onclick = () => {
            if (Utils.isModeActivated()) {
                CFM.resetSettings();
                this.render();
                this.activate();
                this.configContainer = document.createElement("div"); // Reset container
                setTimeout(() => this.openConfig(), 5);
            } else {
                CFM.resetSettings(null, true);
                location.reload();
            }
        };
        container.querySelector<HTMLElement>("#reload-switch")!.onclick = () => {
            location.reload();
        };
        return container;
    }

    static createOptions(
        title: string,
        options: Record<string, string>,
        configValue: string | number,
        key: keyof Settings | keyof Config,
        callback: (val: string) => void,
        description = "",
    ) {
        const settingCard = getSettingCard(
            `<select>
                ${Object.keys(options)
                .map((item) => `<option value="${item}" dir="auto">${options[item]}</option>`)
                .join("\n")}
            </select>`,
            title,
            key,
            description,
        );

        const select = settingCard.querySelector<HTMLSelectElement>("select")!;
        if (!(configValue in options)) {
            if (key in DEFAULTS[CFM.getMode()]) {
                configValue = DEFAULTS[CFM.getMode()][key as keyof Settings] as string;
                this.saveOption(key as keyof Settings, configValue);
            } else if (key in DEFAULTS) {
                configValue = DEFAULTS[key as keyof Config] as string | number;
                this.saveGlobalOption(key as keyof Config, configValue as Config[keyof Config]);
            }
        }
        select.value = configValue.toString();
        select.onchange = (e) => {
            callback((e?.target as HTMLInputElement).value);
        };
        return settingCard;
    }

    static createToggle(
        title: string,
        key: keyof Settings | keyof Config,
        callback = (value: boolean) => this.saveOption(key as keyof Settings, value),
        description = "",
    ) {
        const settingCard = getSettingCard(
            `<label class="switch">
                <input type="checkbox">
                <span class="slider"></span>
            </label>`,
            title,
            key,
            description,
        );
        const toggle = settingCard.querySelector<HTMLInputElement>("input");
        if (toggle) {
            if (key in DEFAULTS) toggle.checked = CFM.getGlobal(key as keyof Config) as boolean;
            else toggle.checked = CFM.get(key as keyof Settings) as boolean;

            toggle.onchange = (evt) => callback((evt?.target as HTMLInputElement)?.checked);
        }
        return settingCard;
    }

    static createRange(
        title: string,
        key: keyof Settings,
        value: number,
        min: number,
        max: number,
        onChange: (value: number) => void,
        description = "",
    ) {
        const settingCard = getSettingCard(
            `<label class="range-setting-control">
                <input type="range" min="${min}" max="${max}" step="1" value="${value}" aria-label="${title}">
                <output class="range-setting-value">${value}%</output>
            </label>`,
            title,
            key,
            description,
        );
        const input = settingCard.querySelector<HTMLInputElement>('input[type="range"]');
        const output = settingCard.querySelector<HTMLOutputElement>("output");
        if (input && output) {
            input.oninput = () => {
                const strength = Number(input.value);
                output.value = `${strength}%`;
                setHudPerspectiveStrength(DOM.container, strength);
            };
            input.onchange = () => onChange(Number(input.value));
        }
        return settingCard;
    }

    static createInputElement(
        title: string,
        key: keyof Settings | keyof Config,
        type: string,
        callback = (value: string) => this.saveOption(key as keyof Settings, value),
        description = "",
    ): HTMLDivElement {
        const settingCard = getSettingCard(
            `<label class="gen-input">
                <input type="${type}">
            </label>`,
            title,
            key,
            description,
        );
        const inputElement = settingCard.querySelector<HTMLInputElement>("input");
        if (inputElement) {
            if (key in DEFAULTS) inputElement.value = CFM.getGlobal(key as keyof Config) as string;
            else inputElement.value = CFM.get(key as keyof Settings) as string;

            inputElement.oninput = (evt) => callback((evt?.target as HTMLInputElement)?.value);
        }
        return settingCard;
    }

    static openConfig(evt: Event | null = null): void {
        evt?.preventDefault();
        const LOCALE = CFM.getGlobal("locale") as Config["locale"];
        const INVERTED = JSON.parse(localStorage.getItem("full-screen:inverted") ?? "{}");

        this.configContainer = document.createElement("div");
        this.configContainer.id = "full-screen-config-container";
        this.configContainer.append(
            Utils.isModeActivated() ? this.getSettingTopHeader(LOCALE) : "",
            headerText(translations[LOCALE].settings.pluginSettings),
            this.createOptions(
                translations[LOCALE].settings.language,
                Utils.getAvailableLanguages(translations),
                CFM.getGlobal("locale") as Config["locale"],
                "locale",
                (value: string) => {
                    this.saveGlobalOption("locale", value);
                    PopupModal.hide();
                    this.openConfig();
                },
            ),
            this.createOptions(
                translations[LOCALE].settings.activationTypes.setting,
                {
                    both: translations[LOCALE].settings.activationTypes.both,
                    btns: translations[LOCALE].settings.activationTypes.btns,
                    keys: translations[LOCALE].settings.activationTypes.keys,
                },
                CFM.getGlobal("activationTypes") as Config["activationTypes"],
                "activationTypes",
                (value: string) => {
                    this.saveGlobalOption("activationTypes", value);
                    location.reload();
                },
                translations[LOCALE].settings.activationTypes.description,
            ),
            this.createOptions(
                translations[LOCALE].settings.buttonActivation.setting,
                {
                    both: translations[LOCALE].settings.buttonActivation.both,
                    tv: translations[LOCALE].settings.buttonActivation.tv,
                    def: translations[LOCALE].settings.buttonActivation.def,
                },
                CFM.getGlobal("buttonActivation") as Config["buttonActivation"],
                "buttonActivation",
                (value: string) => {
                    this.saveGlobalOption("buttonActivation", value);
                    location.reload();
                },
                translations[LOCALE].settings.buttonActivation.description,
            ),
            this.createOptions(
                translations[LOCALE].settings.keyActivation.setting,
                {
                    both: translations[LOCALE].settings.keyActivation.both,
                    tv: translations[LOCALE].settings.keyActivation.tv,
                    def: translations[LOCALE].settings.keyActivation.def,
                },
                CFM.getGlobal("keyActivation") as Config["keyActivation"],
                "keyActivation",
                (value: string) => {
                    this.saveGlobalOption("keyActivation", value);
                    location.reload();
                },
                translations[LOCALE].settings.keyActivation.description,
            ),

            headerText(translations[LOCALE].settings.lyricsHeader),
            this.createToggle(
                translations[LOCALE].settings.lyrics,
                "lyricsDisplay",
                (value) => {
                    this.saveOption("lyricsDisplay", value);
                    DOM.container.classList.remove("lyrics-unavailable");
                },
                translations[LOCALE].settings.lyricsDescription.join("<br>"),
            ),
            this.createToggle(translations[LOCALE].settings.autoHideLyrics, "autoHideLyrics"),
            this.createOptions(
                translations[LOCALE].settings.lyricsAlignment.setting,
                {
                    left: translations[LOCALE].settings.lyricsAlignment.left,
                    center: translations[LOCALE].settings.lyricsAlignment.center,
                    right: translations[LOCALE].settings.lyricsAlignment.right,
                },
                CFM.get("lyricsAlignment") as Settings["lyricsAlignment"],
                "lyricsAlignment",
                (value: string) => this.saveOption("lyricsAlignment", value),
            ),
            this.createToggle(
                translations[LOCALE].settings.hudPerspective,
                "hudPerspective",
                (value) => this.saveOption("hudPerspective", value),
                translations[LOCALE].settings.hudPerspectiveDescription,
            ),
            this.createRange(
                translations[LOCALE].settings.hudPerspectiveStrength,
                "hudPerspectiveStrength",
                Number(CFM.get("hudPerspectiveStrength")),
                0,
                100,
                (value) => this.saveOption("hudPerspectiveStrength", value),
                translations[LOCALE].settings.hudPerspectiveStrengthDescription,
            ),
            this.createToggle(
                translations[LOCALE].settings.hudPerspectiveBackground,
                "hudPerspectiveBackground",
                (value) => this.saveOption("hudPerspectiveBackground", value),
                translations[LOCALE].settings.hudPerspectiveBackgroundDescription,
            ),
            headerText(translations[LOCALE].settings.glowHeader),
            this.createGlowAllToggle(LOCALE),
            this.createGlowToggle(translations[LOCALE].settings.glowLyrics, "glowLyrics"),
            this.createGlowToggle(translations[LOCALE].settings.glowTitle, "glowTitle"),
            this.createGlowToggle(translations[LOCALE].settings.glowDetails, "glowDetails"),
            this.createGlowToggle(translations[LOCALE].settings.glowProgressBar, "glowProgressBar"),
            this.createGlowToggle(translations[LOCALE].settings.glowControls, "glowControls"),
            this.createGlowToggle(translations[LOCALE].settings.glowArt, "glowArt"),
            this.createVisualEffectsDefaultsButton(
                translations[LOCALE].settings.visualEffectsDefaults,
                translations[LOCALE].settings.visualEffectsDefaultsDescription,
            ),
            headerText(translations[LOCALE].settings.generalHeader),
            this.createOptions(
                translations[LOCALE].settings.progressBar,
                {
                    never: translations[LOCALE].settings.contextDisplay.never,
                    mousemove: translations[LOCALE].settings.contextDisplay.mouse,
                    always: translations[LOCALE].settings.contextDisplay.always,
                },
                CFM.get("progressBarDisplay") as Settings["progressBarDisplay"],
                "progressBarDisplay",
                (value: string) => {
                    CFM.set("progressBarDisplay", value);
                    if (value !== "never") {
                        ReactDOM.render(
                            <SeekableProgressBar state={value} />,
                            DOM.container.querySelector("#fsd-progress-parent"),
                        );
                    } else {
                        ReactDOM.unmountComponentAtNode(
                            DOM.container.querySelector("#fsd-progress-parent")!,
                        );
                    }
                },
            ),
            this.createOptions(
                translations[LOCALE].settings.playerControls,
                {
                    never: translations[LOCALE].settings.contextDisplay.never,
                    mousemove: translations[LOCALE].settings.contextDisplay.mouse,
                    always: translations[LOCALE].settings.contextDisplay.always,
                },
                CFM.get("playerControls") as Settings["playerControls"],
                "playerControls",
                (value: string) => this.saveOption("playerControls", value),
            ),
            this.createOptions(
                translations[LOCALE].settings.showAlbum.setting,
                {
                    never: translations[LOCALE].settings.showAlbum.never,
                    always: translations[LOCALE].settings.showAlbum.always,
                    date: translations[LOCALE].settings.showAlbum.date,
                },
                CFM.get("showAlbum") as Settings["showAlbum"],
                "showAlbum",
                (value: string) => this.saveOption("showAlbum", value),
            ),
            this.createToggle(translations[LOCALE].settings.icons, "icons"),
            this.createToggle(translations[LOCALE].settings.trimTitle, "trimTitle"),
            document.fullscreenEnabled
                ? this.createToggle(translations[LOCALE].settings.fullscreen, "enableFullscreen")
                : "",
            headerText(translations[LOCALE].settings.extraHeader),
            this.createOptions(
                translations[LOCALE].settings.extraControls,
                {
                    never: translations[LOCALE].settings.contextDisplay.never,
                    mousemove: translations[LOCALE].settings.contextDisplay.mouse,
                    always: translations[LOCALE].settings.contextDisplay.always,
                },
                CFM.get("extraControls") as Settings["extraControls"],
                "extraControls",
                (value: string) => this.saveOption("extraControls", value),
            ),
            this.createOptions(
                translations[LOCALE].settings.upnextDisplay,
                {
                    always: translations[LOCALE].settings.volumeDisplay.always,
                    never: translations[LOCALE].settings.volumeDisplay.never,
                    smart: translations[LOCALE].settings.volumeDisplay.smart,
                },
                CFM.get("upnextDisplay") as Settings["upnextDisplay"],
                "upnextDisplay",
                (value: string) => this.saveOption("upnextDisplay", value),
            ),
            this.createOptions(
                translations[LOCALE].settings.contextDisplay.setting,
                {
                    never: translations[LOCALE].settings.contextDisplay.never,
                    mousemove: translations[LOCALE].settings.contextDisplay.mouse,
                    always: translations[LOCALE].settings.contextDisplay.always,
                },
                CFM.get("contextDisplay") as Settings["contextDisplay"],
                "contextDisplay",
                (value: string) => this.saveOption("contextDisplay", value),
            ),
            this.createToggle(
                translations[LOCALE].settings.overviewDisplay.setting,
                "overviewDisplay",
                (value: boolean) => {
                    CFM.set("overviewDisplay", value);
                    if (value) {
                        ReactDOM.render(
                            <OverviewCard
                                onExit={this.deactivate}
                                onToggle={() => {
                                    CFM.getGlobal("tvMode") ? this.openwithDef() : this.openwithTV();
                                }}
                            />,
                            DOM.container.querySelector("#fsd-overview-card-parent"),
                        );
                    } else {
                        ReactDOM.unmountComponentAtNode(
                            DOM.container.querySelector("#fsd-overview-card-parent")!,
                        );
                    }
                },
            ),
            this.createOptions(
                translations[LOCALE].settings.volumeDisplay.setting,
                {
                    always: translations[LOCALE].settings.volumeDisplay.always,
                    never: translations[LOCALE].settings.volumeDisplay.never,
                    smart: translations[LOCALE].settings.volumeDisplay.smart,
                },
                CFM.get("volumeDisplay") as Settings["volumeDisplay"],
                "volumeDisplay",
                (value: string) => {
                    CFM.set("volumeDisplay", value);
                    if (value !== "never") {
                        ReactDOM.render(
                            <SeekableVolumeBar state={value} />,
                            DOM.container.querySelector("#fsd-volume-parent"),
                        );
                    } else {
                        ReactDOM.unmountComponentAtNode(
                            DOM.container.querySelector("#fsd-volume-parent")!,
                        );
                    }
                },
                translations[LOCALE].settings.volumeDisplay.description.join("\n"),
            ),
            headerText(
                translations[LOCALE].settings.backgroundHeader,
                translations[LOCALE].settings.backgroundSubHeader,
            ),
            this.createOptions(
                translations[LOCALE].settings.backgroundChoice.setting,
                {
                    album_art: translations[LOCALE].settings.backgroundChoice.artwork,
                    animated_album: translations[LOCALE].settings.backgroundChoice.animatedArt,
                    dynamic_color: translations[LOCALE].settings.backgroundChoice.dynamicColor,
                    static_color: translations[LOCALE].settings.backgroundChoice.staticColor,
                    artist_art: translations[LOCALE].settings.backgroundChoice.artist,
                },
                CFM.get("backgroundChoice") as Settings["backgroundChoice"],
                "backgroundChoice",
                (value: string) => {
                    CFM.set("backgroundChoice", value);
                    if (Utils.isModeActivated()) {
                        this.updateBackground(Spicetify.Player.data.item?.metadata);
                    }
                },
                translations[LOCALE].settings.backgroundChoice.description.join("<br>"),
            ),
            createAdjust(
                translations[LOCALE].settings.animationSpeed,
                "animationSpeed",
                "",
                (CFM.get("animationSpeed") as Settings["animationSpeed"]) * 100,
                2,
                2,
                40,
                (state) => {
                    CFM.set("animationSpeed", Number(state) / 100);
                    modifyRotationSpeed(Number(state) / 100);
                },
            ),
            createAdjust(
                translations[LOCALE].settings.backAnimationTime,
                "backAnimationTime",
                "s",
                CFM.get("backAnimationTime") as Settings["backAnimationTime"],
                0.1,
                0,
                5,
                (state) => {
                    CFM.set("backAnimationTime", Number(state));
                    DOM.container.style.setProperty("--fs-transition", `${state}s`);
                },
            ),
            this.createOptions(
                translations[LOCALE].settings.backgroundColor.setting,
                {
                    VIBRANT: translations[LOCALE].settings.backgroundColor.vibrant,
                    PROMINENT: translations[LOCALE].settings.backgroundColor.prominent,
                    DESATURATED: translations[LOCALE].settings.backgroundColor.desaturated,
                    LIGHT_VIBRANT: translations[LOCALE].settings.backgroundColor.lightVibrant,
                    DARK_VIBRANT: translations[LOCALE].settings.backgroundColor.darkVibrant,
                    VIBRANT_NON_ALARMING:
                        translations[LOCALE].settings.backgroundColor.vibrantNonAlarming,
                },
                CFM.get("coloredBackChoice") as Settings["coloredBackChoice"],
                "coloredBackChoice",
                (value: string) => {
                    CFM.set("coloredBackChoice", value);
                    if (Utils.isModeActivated()) {
                        this.updateBackground(Spicetify.Player.data.item?.metadata, true);
                    }
                },
            ),
            this.createInputElement(
                translations[LOCALE].settings.staticColor,
                "staticBackChoice",
                "color",
                (value) => {
                    CFM.set("staticBackChoice", value);
                    if (CFM.get("backgroundChoice") === "static_color" && Utils.isModeActivated()) {
                        Utils.overlayBack();
                        animateColor(value, DOM.back, true);
                        this.updateMainColor(
                            Spicetify.Player.data.item?.metadata.image_xlarge_url,
                            Spicetify.Player.data.item?.metadata,
                        );
                        if (this.overlayTimout) clearTimeout(this.overlayTimout);
                        this.overlayTimout = setTimeout(() => {
                            Utils.overlayBack(false);
                        }, 1500);
                    }
                },
            ),
            createAdjust(
                translations[LOCALE].settings.backgroundBlur,
                "blurSize",
                "px",
                CFM.get("blurSize") as Settings["blurSize"],
                4,
                0,
                100,
                (state) => {
                    CFM.set("blurSize", Number(state));
                    if (Utils.isModeActivated()) {
                        Utils.overlayBack();
                        this.updateBackground(Spicetify.Player.data.item?.metadata, true);
                        if (this.overlayTimout) clearTimeout(this.overlayTimout);
                        this.overlayTimout = setTimeout(() => {
                            Utils.overlayBack(false);
                        }, 2000);
                    }
                },
            ),
            this.createOptions(
                translations[LOCALE].settings.backgroundBrightness,
                {
                    0: "0%",
                    0.1: "10%",
                    0.2: "20%",
                    0.3: "30%",
                    0.4: "40%",
                    0.5: "50%",
                    0.6: "60%",
                    0.7: "70%",
                    0.8: "80%",
                    0.9: "90%",
                    1: "100%",
                },
                CFM.get("backgroundBrightness") as Settings["backgroundBrightness"],
                "backgroundBrightness",
                (value: string) => {
                    CFM.set("backgroundBrightness", value);
                    if (Utils.isModeActivated()) {
                        this.updateBackground(Spicetify.Player.data.item?.metadata, true);
                    }
                },
            ),
            headerText(
                translations[LOCALE].settings.appearanceHeader,
                translations[LOCALE].settings.appearanceSubHeader,
            ),
            this.createToggle(translations[LOCALE].settings.themedButtons, "themedButtons"),
            this.createToggle(translations[LOCALE].settings.themedIcons, "themedIcons"),
            this.createOptions(
                translations[LOCALE].settings.invertColors.setting,
                {
                    never: translations[LOCALE].settings.invertColors.never,
                    always: translations[LOCALE].settings.invertColors.always,
                    auto: translations[LOCALE].settings.invertColors.auto,
                },
                CFM.get("invertColors") as Settings["invertColors"],
                "invertColors",
                (value: string) => this.saveOption("invertColors", value),
            ),
            this.createToggle(
                translations[LOCALE].settings.verticalMonitorSupport,
                "verticalMonitorSupport",
                (value: boolean) => this.saveOption("verticalMonitorSupport", value),
                translations[LOCALE].settings.verticalMonitorSupportDescription,
            ),
            this.createToggle(translations[LOCALE].settings.trimTitleUpNext, "trimTitleUpNext"),
            this.createToggle(translations[LOCALE].settings.trimAlbum, "trimAlbum"),
            createAdjust(
                translations[LOCALE].settings.upnextTime,
                "upnextTimeToShow",
                "s",
                CFM.get("upnextTimeToShow") as Settings["upnextTimeToShow"],
                1,
                5,
                60,
                (state) => {
                    CFM.set("upnextTimeToShow", Number(state));
                    this.updateUpNextShow();
                },
            ),
            this.createToggle(
                translations[LOCALE].settings.fsHideOriginal,
                "fsHideOriginal",
                (value) => {
                    this.saveGlobalOption("fsHideOriginal", value);
                    location.reload();
                },
                translations[LOCALE].settings.fsHideOriginalDescription,
            ),
            this.createOptions(
                translations[LOCALE].settings.autoLaunch.setting,
                {
                    never: translations[LOCALE].settings.autoLaunch.never,
                    default: translations[LOCALE].settings.autoLaunch.default,
                    tvmode: translations[LOCALE].settings.autoLaunch.tvmode,
                    lastused: translations[LOCALE].settings.autoLaunch.lastused,
                },
                CFM.getGlobal("autoLaunch") as Config["autoLaunch"],
                "autoLaunch",
                (value: string) => {
                    this.saveGlobalOption("autoLaunch", value);
                },
                translations[LOCALE].settings.autoLaunch.description,
            ),
            headerText(translations[LOCALE].settings.aboutHeader),
            getAboutSection(),
            this.getSettingBottomHeader(LOCALE),
        );
        this.syncGlowSettingInputs();
        PopupModal.display({
            title:
                CFM.getMode() === "tv"
                    ? translations[LOCALE].settings.tvModeConfig
                    : translations[LOCALE].settings.fullscreenConfig,
            content: this.configContainer,
        });
    }
}
