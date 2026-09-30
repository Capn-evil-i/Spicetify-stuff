import * as React from "react";
import classNames from "classnames";
import "./styles.scss";
import CFM from "../../../utils/config";
import { DOM } from "../../elements";
import { setHudPerspectiveStrength } from "../../../utils/hud-perspective";

// Horizontal perspective slider for TV mode, bottom-left under the artwork. It shows up when the
// pointer reaches the bottom-left corner, like the smart volume bar does on the left edge.
// The switch turns the perspective on and off and keeps the strength; dragging the bar sets the
// strength and turns it on (0 turns it off).
const PerspectiveBar = () => {
    const savedStrength = () => Number(CFM.get("hudPerspectiveStrength"));
    const savedOn = () => Boolean(CFM.get("hudPerspective"));

    const [value, setValue] = React.useState<number>(savedStrength);
    const [on, setOn] = React.useState<boolean>(savedOn);
    const [visible, setVisible] = React.useState(true);
    const [dragging, setDragging] = React.useState(false);
    const track = React.useRef<HTMLDivElement>(null);
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const reveal = (timeout = 2000) => {
        if (timer.current) clearTimeout(timer.current);
        setVisible(true);
        timer.current = setTimeout(() => setVisible(false), timeout);
    };

    const apply = (enabled: boolean, strength: number) => {
        setOn(enabled);
        setValue(strength);
        const active = enabled && strength > 0;
        DOM.container.classList.toggle("hud-perspective", active);
        setHudPerspectiveStrength(DOM.container, active ? strength : 0);
    };

    // Snaps to 10% steps.
    const valueAt = (clientX: number) => {
        const bounds = track.current!.getBoundingClientRect();
        return Math.round(clamp((clientX - bounds.left) / bounds.width) * 10) * 10;
    };

    const onPointerDown = (evt: React.PointerEvent<HTMLDivElement>) => {
        if (evt.button !== 0) return;
        track.current!.setPointerCapture(evt.pointerId);
        setDragging(true);
        const next = valueAt(evt.clientX);
        apply(next > 0, next);
    };

    const onPointerMove = (evt: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging) return;
        const next = valueAt(evt.clientX);
        apply(next > 0, next);
    };

    const onPointerUp = (evt: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging) return;
        setDragging(false);
        const next = valueAt(evt.clientX);
        apply(next > 0, next);
        CFM.set("hudPerspective", next > 0);
        if (next > 0) CFM.set("hudPerspectiveStrength", next);
        reveal();
    };

    const onToggle = () => {
        const enabled = !on;
        // Turning it on from 0 starts at the default strength rather than doing nothing.
        const strength = enabled && value === 0 ? 40 : value;
        apply(enabled, strength);
        CFM.set("hudPerspective", enabled);
        if (strength > 0) CFM.set("hudPerspectiveStrength", strength);
        reveal();
    };

    React.useEffect(() => {
        reveal(3000);
        const onMouseMove = (evt: MouseEvent) => {
            if (evt.clientX / window.innerWidth < 0.3 && evt.clientY / window.innerHeight > 0.85) {
                if (!dragging) {
                    setValue(savedStrength());
                    setOn(savedOn());
                }
                reveal();
            }
        };
        document.addEventListener("mousemove", onMouseMove);
        return () => {
            document.removeEventListener("mousemove", onMouseMove);
            if (timer.current) clearTimeout(timer.current);
        };
    }, [dragging]);

    const active = on && value > 0;
    return (
        <div
            id="fsd-perspective-container"
            className={classNames({ "p-hidden": !visible, dragging, "perspective-off": !active })}>
            <div id="fsd-perspective-header">
                <div id="fsd-perspective-label">{active ? `Perspective ${value}%` : "Perspective off"}</div>
                <button
                    id="fsd-perspective-toggle"
                    role="switch"
                    aria-checked={active}
                    aria-label="Perspective"
                    onClick={onToggle}>
                    <span id="fsd-perspective-toggle-knob" />
                </button>
            </div>
            <div
                id="fsd-perspective-bar"
                ref={track}
                role="slider"
                aria-label="Perspective strength"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={active ? value : 0}
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
