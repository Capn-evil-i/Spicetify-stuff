import * as React from "react";
import "./styles.scss";
import Utils from "../../../utils/utils";
import classNames from "classnames";
import { BsPinAngle, BsPinAngleFill } from "react-icons/bs";
import { MdAutorenew } from "react-icons/md";
import CFM from "../../../utils/config";

interface OverviewCardProps {
    onExit: () => void;
    onToggle: () => void;
}

const OverviewCard = ({ onExit, onToggle }: OverviewCardProps) => {
    const [visibility, setVisibility] = React.useState(true);
    const [pinned, setPinned] = React.useState(CFM.get("overviewCardPinned"));

    const overviewCardTimer = React.useRef<NodeJS.Timeout | null>(null);

    const hideCard = (timeout = 3000) => {
        if (overviewCardTimer.current) clearTimeout(overviewCardTimer.current);
        setVisibility(true);
        overviewCardTimer.current = setTimeout(() => {
            setVisibility(false);
        }, timeout);
    };

    const handleMouseMove = (evt: MouseEvent) => {
        // Show card when mouse is on the top side of the screen and centered horizantally
        if (
            !pinned &&
            evt.clientY / window.innerHeight < 0.15 &&
            evt.clientX / window.innerWidth > 0.3 &&
            evt.clientX / window.innerWidth < 0.7
        ) {
            hideCard();
        }
    };

    React.useEffect(() => {
        if (overviewCardTimer.current) clearTimeout(overviewCardTimer.current);
        if (!pinned) {
            hideCard();
        }
        document.addEventListener("mousemove", handleMouseMove);

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
        };
    }, [pinned]);

    return (
        <div
            id="fsd-overview-card"
            className={classNames({
                "c-hidden": !visibility,
                "card-pinned": pinned,
            })}>
            <button
                id="fsd-overview-pin-button"
                type="button"
                title={pinned ? "Unpin Card" : "Pin Card"}
                aria-label={pinned ? "Unpin Card" : "Pin Card"}
                onClick={() => {
                    if (!pinned) {
                        if (overviewCardTimer.current) clearTimeout(overviewCardTimer.current);
                    }
                    setPinned(!pinned);
                    CFM.set("overviewCardPinned", !pinned);
                }}>
                {pinned ? <BsPinAngleFill /> : <BsPinAngle />}
            </button>
            <ClockSection />

            <div id="fsd-overview-button-container">
                <button
                    id="overview-toggle-button"
                    className="fsd-overview-button"
                    type="button"
                    title="Toggle Mode"
                    aria-label="Toggle Mode"
                    onClick={onToggle}>
                    <MdAutorenew />
                </button>

                <button
                    id="overview-exit-button"
                    className="fsd-overview-button"
                    type="button"
                    title="Exit"
                    aria-label="Exit"
                    dangerouslySetInnerHTML={{
                        __html: `<svg width="1.5em" height="1.5em" viewBox="0 0 16 16" fill="currentColor">${
                            Spicetify.SVGIcons.x
                        }</svg>`,
                    }}
                    onClick={onExit}
                />
            </div>
        </div>
    );
};

const ClockSection = () => {
    const [currentTime, setCurrentTime] = React.useState(Utils.getTimeFormatted());

    function updateTimeDisplay() {
        setCurrentTime(Utils.getTimeFormatted());
    }

    React.useEffect(() => {
        const updateInterval = setInterval(updateTimeDisplay, 1000);

        return () => {
            clearInterval(updateInterval);
        };
    }, []);

    return <div id="fsd-time-display">{currentTime}</div>;
};
export default OverviewCard;
