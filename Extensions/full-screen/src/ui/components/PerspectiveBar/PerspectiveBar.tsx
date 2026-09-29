import * as React from "react";
import classNames from "classnames";
import "./styles.scss";
import CFM from "../../../utils/config";
import { DOM } from "../../elements";
import { setHudPerspectiveStrength } from "../../../utils/hud-perspective";

// Horizontal perspective slider for TV mode, bottom-left under the artwork. It shows up when the
// pointer reaches the bottom-left corner, like the smart volume bar does on the left edge.
// 0 turns the perspective off; anything above turns it on at that strength.
const PerspectiveBar = () => {
    const saved = () => (CFM.get("hudPerspective") ? Number(CFM.get("hudPerspectiveStrength")) : 0);

    const [value, setValue] = React.useState<number>(saved);
    const [visible, setVisible] = React.useState(true);
    const [dragging, setDragging] = React.useState(false);
    const track = React.useRef<HTMLDivElement>(null);
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const reveal = (timeout = 2000) => {
        if (timer.current) clearTimeout(timer.current);
        setVisible(true);
        timer.current = setTimeout(() => setVisible(false), timeout);
    };

    const show = (next: number) => {
        setValue(next);
        DOM.container.classList.toggle("hud-perspective", next > 0);
        setHudPerspectiveStrength(DOM.container, next);
    };

    const valueAt = (clientX: number) => {
        const bounds = track.current!.getBoundingClientRect();
        return Math.round(clamp((clientX - bounds.left) / bounds.width) * 100);
    };

    const onPointerDown = (evt: React.PointerEvent<HTMLDivElement>) => {
        if (evt.button !== 0) return;
        track.current!.setPointerCapture(evt.pointerId);
        setDragging(true);
        show(valueAt(evt.clientX));
    };

    const onPointerMove = (evt: React.PointerEvent<HTMLDivElement>) => {
        if (dragging) show(valueAt(evt.clientX));
    };

    const onPointerUp = (evt: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging) return;
        setDragging(false);
        const next = valueAt(evt.clientX);
        show(next);
        CFM.set("hudPerspective", next > 0);
        if (next > 0) CFM.set("hudPerspectiveStrength", next);
        reveal();
    };

    React.useEffect(() => {
        reveal(3000);
        const onMouseMove = (evt: MouseEvent) => {
            if (evt.clientX / window.innerWidth < 0.3 && evt.clientY / window.innerHeight > 0.85) {
                if (!dragging) setValue(saved());
                reveal();
            }
        };
        document.addEventListener("mousemove", onMouseMove);
        return () => {
            document.removeEventListener("mousemove", onMouseMove);
            if (timer.current) clearTimeout(timer.current);
        };
    }, [dragging]);

    return (
        <div
            id="fsd-perspective-container"
            className={classNames({ "p-hidden": !visible, dragging })}>
            <div id="fsd-perspective-label">{value > 0 ? `Perspective ${value}%` : "Perspective off"}</div>
            <div
                id="fsd-perspective-bar"
                ref={track}
                role="slider"
                aria-label="Perspective"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={value}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}>
                <div id="fsd-perspective-bar-inner" style={{ width: `${value}%` }}>
                    <div id="perspective-thumb" />
                </div>
            </div>
        </div>
    );
};

const clamp = (value: number) => Math.min(Math.max(value, 0), 1);

export default PerspectiveBar;
