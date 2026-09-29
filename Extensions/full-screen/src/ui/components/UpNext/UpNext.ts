import CFM from "../../../utils/config";
import translations from "../../../resources/strings";
import { DOM } from "../../elements";
import Utils from "../../../utils/utils";
import ICONS from "../../../constants";
import { Settings, Config } from "../../../types/fullscreen";

export class UpNext {
    static upnextTimer: NodeJS.Timeout;
    static upNextShown = false;

    static async updateUpNextInfo() {
        const LOCALE = CFM.getGlobal("locale") as Config["locale"];
        DOM.fsd_up_next_text.innerText = translations[LOCALE].upnext.toUpperCase();
        let metadata: Spicetify.Metadata = {};
        const queue_metadata = Spicetify.Queue.nextTracks[0];
        if (queue_metadata) {
            metadata = queue_metadata?.contextTrack?.metadata;
        } else {
            metadata["artist_name"] = "";
            metadata["title"] = "";
        }

        let songName = metadata.title;
        if (CFM.get("trimTitleUpNext") && songName) {
            songName = Utils.trimTitle(songName);
        }
        const artistNameNext = Object.keys(metadata)
            .filter((key) => key.startsWith("artist_name"))
            .sort()
            .map((key) => metadata[key])
            .join(", ");

        let next_artist;
        if (artistNameNext) {
            next_artist = artistNameNext;
        } else {
            next_artist = translations[LOCALE].unknownArtist;
        }
        const next_image = metadata.image_xlarge_url;
        const upnextImage = new Image();
        let imageUrl: string;
        if (next_image) {
            imageUrl = next_image;
        } else {
            imageUrl = metadata.image_url || ICONS.OFFLINE_SVG;
        }
        return new Promise<void>((resolve) => {
            let settled = false;
            const setImage = (url: string) => {
                if (settled) return;
                settled = true;
                Utils.fadeBackgroundImage(DOM.fsd_nextCover, url);
                DOM.fsd_first_span.innerText = songName + "  •  " + next_artist;
                DOM.fsd_second_span.innerText = songName + "  •  " + next_artist;
                resolve();
            };
            upnextImage.onload = () => {
                setImage(upnextImage.src);
            };
            upnextImage.onerror = () => {
                setImage(ICONS.OFFLINE_SVG);
            };
            upnextImage.src = imageUrl;
            if (upnextImage.complete) {
                if (upnextImage.naturalWidth) setImage(upnextImage.src);
                else setImage(ICONS.OFFLINE_SVG);
            }
        });
    }

    static async updateUpNext() {
        const nextTrack = Spicetify.Queue?.nextTracks[0]?.contextTrack?.metadata;
        const upnextDisplay = CFM.get("upnextDisplay");

        let shouldShow = false;
        if (nextTrack?.title) {
            if (upnextDisplay === "always") {
                shouldShow = Spicetify.Platform?.PlayerAPI?._state?.repeat !== 2;
            } else if (upnextDisplay === "smart") {
                const timeToShow =
                    (CFM.get("upnextTimeToShow") as Settings["upnextTimeToShow"]) * 1000 + 50;
                const remainingTime =
                    Spicetify.Player.data.duration - Spicetify.Player.getProgress();
                shouldShow =
                    remainingTime <= timeToShow &&
                    Spicetify.Platform?.PlayerAPI?._state?.repeat !== 2;
            }
        }

        if (shouldShow) {
            await this.updateUpNextInfo();
            this.showUpNext();
        } else {
            this.hideUpNext();
        }
    }

    static showUpNext() {
        DOM.fsd_myUp.classList.add("upnext-visible");
        this.upNextShown = true;
        if (DOM.fsd_second_span.offsetWidth > DOM.fsd_next_tit_art.offsetWidth - 2) {
            this.setupScrollingAnimation();
        } else {
            this.resetUpNextAnimation();
        }
    }

    static hideUpNext() {
        this.upNextShown = false;
        DOM.fsd_myUp.classList.remove("upnext-visible");
        this.resetUpNextAnimation();
    }

    static setupScrollingAnimation() {
        DOM.fsd_first_span.style.paddingRight = "0px";
        DOM.fsd_second_span.innerText = "";

        const animTime = Math.max(
            (DOM.fsd_first_span.offsetWidth - DOM.fsd_next_tit_art.offsetWidth - 2) / 0.035,
            1700,
        );

        DOM.fsd_myUp.style.setProperty(
            "--translate_width_fsd",
            `-${DOM.fsd_first_span.offsetWidth - DOM.fsd_next_tit_art.offsetWidth + 5}px`,
        );

        DOM.fsd_next_tit_art_inner.style.animation = `fsd_translate ${animTime}ms linear 800ms infinite`;
    }

    static resetUpNextAnimation() {
        DOM.fsd_first_span.style.paddingRight = "0px";
        DOM.fsd_next_tit_art_inner.style.animation = "none";
        DOM.fsd_second_span.innerText = "";
    }

    static updateUpNextShow() {
        if (CFM.get("upnextDisplay") === "smart") {
            setTimeout(() => {
                const timetogo = Utils.getShowTime(
                    CFM.get("upnextTimeToShow") as Settings["upnextTimeToShow"],
                );
                if (this.upnextTimer) {
                    clearTimeout(this.upnextTimer);
                }
                if (timetogo < 10) {
                    if (!this.upNextShown || !DOM.fsd_myUp.classList.contains("upnext-visible")) {
                        this.updateUpNext();
                    }
                    this.upNextShown = true;
                } else {
                    DOM.fsd_myUp.classList.remove("upnext-visible");
                    this.upNextShown = false;
                    if (Spicetify.Player.isPlaying()) {
                        this.upnextTimer = setTimeout(() => {
                            this.updateUpNext();
                            this.upNextShown = true;
                        }, timetogo);
                    }
                }
            }, 100);
        } else if (CFM.get("upnextDisplay") === "always" && !this.upNextShown) {
            this.updateUpNext();
            this.upNextShown = true;
        }
    }
}
