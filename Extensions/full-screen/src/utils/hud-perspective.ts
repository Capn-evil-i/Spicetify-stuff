import CFM from "./config";

// Perspective HUD: simulates the TV overlay on a screen curved inwards, like a HUD lens. The sides
// of a concave screen are closer to the viewer, so things there are drawn bigger and the middle
// recedes; text and artwork bend toward the middle. The warp is mainly horizontal: things are
// also made a little taller at the sides and shorter in the middle, but nothing moves up or down
// and nothing turns.
//
// The warp is pinned at the HUD's own side margins, so the gap between the screen edge and the
// artwork or lyrics is the same with the effect on or off. Between the margins a point at u
// (-1 left margin, 0 centre, 1 right margin) is drawn at f(u) = u - k sin(pi u) / pi: the margins
// stay put, the centre is drawn 1 - k as wide and the margins 1 + k as wide, and the curve is
// smooth everywhere, so there is no seam in the middle.
//
// Text is not resampled (that loses anti-aliasing): text blocks and lyric lines, their words,
// buttons and images are each moved and scaled to cover exactly their own slice of the curve.
// The blurred background is warped as an image with an SVG displacement filter.

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// At 100% strength the centre is drawn 1 - MAX_WARP as wide and the margins 1 + MAX_WARP as wide.
const MAX_WARP = 0.4;
// How much of the width change is also applied to the height.
const VERTICAL = 0.3;

const LYRIC_LINES = "#fad-lyrics-plus-container .lyrics-lyricsContainer-LyricsLine";
// Text blocks and lyric lines are scaled as a whole; their words then take only their own
// difference, which keeps every word inside its block's clipping box.
const BLOCKS = [
    "#fsd-ctx-details",
    "#fsd-title > span",
    "#fsd-artist > span",
    "#fsd-album > span",
    "#fsd_up_next_text",
    LYRIC_LINES,
].join(", ");
const LINE = "fsd-curve-line";
const WORD = "fsd-curve-word";
// The perspective slider itself is left flat: warping it would move the track under the pointer
// while it is being dragged.
const PIECES = [
    "#fsd-art",
    "#fsd-ctx-icon",
    "#fsd-title > svg",
    "#fsd-artist > svg",
    "#fsd-album > svg",
    ".fsd-controls button",
    ".extra-controls button",
    "#fsd-progress-container > *",
    "#fsd_next_art",
    "#fsd_next_tit_art",
    "#fsd-volume-container > *",
    "#fsd-overview-card > *",
].join(", ");
// The HUD's side margins are read from these, which only move when the layout does.
const LEFT_EDGE = "#fsd-ctx-icon, #fsd-art";

type Applied = { shift: number; stretch: number };
// A piece's box on the flat layout, and where its transform origin sits on it.
type Flat = { left: number; right: number; top: number; bottom: number; origin: number };
// x -> origin + stretch * (x - origin) + shift, which is what `translate` plus `scale` draw.
// `tall` is the total vertical scale, which the words inside a block divide by.
type Mapping = Applied & { origin: number; tall: number };

const IDENTITY: Mapping = { origin: 0, shift: 0, stretch: 1, tall: 1 };
const backward = (m: Mapping, y: number) => m.origin + (y - m.shift - m.origin) / m.stretch;

let warp = 0;
let margins = { left: 0, right: 0 };
let container: HTMLElement | null = null;
let frame = 0;
let textObserver: MutationObserver | null = null;
const applied = new WeakMap<Element, Applied>();
const written = new WeakMap<Element, string>();

export function setHudPerspectiveStrength(element: HTMLElement, value: number) {
    container = element;
    const normalized = clamp(Number(value) || 0, 0, 100) / 100;
    const compactScale = window.innerWidth <= 800 ? 0.55 : 1;
    warp = MAX_WARP * normalized * compactScale;
    if (active()) start();
    else stop();
    updateBackground();
}

function active() {
    return Boolean(
        container?.isConnected &&
            container.classList.contains("hud-perspective") &&
            document.body.classList.contains("fsd-activated") &&
            warp > 0,
    );
}

function start() {
    splitWords();
    if (!textObserver && container) {
        // Song changes replace the text and lyric lines; split the new words as they arrive.
        textObserver = new MutationObserver(() => {
            splitWords();
            textObserver?.takeRecords();
        });
        textObserver.observe(container, { childList: true, characterData: true, subtree: true });
    }
    if (!frame) frame = requestAnimationFrame(tick);
}

function stop() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    textObserver?.disconnect();
    textObserver = null;
    if (!container) return;
    for (const piece of container.querySelectorAll<HTMLElement>(`${BLOCKS}, ${PIECES}, ${WORD}`)) reset(piece);
    joinWords();
}

function reset(piece: HTMLElement) {
    piece.style.removeProperty("translate");
    piece.style.removeProperty("scale");
    applied.delete(piece);
    written.delete(piece);
}

// f(u) = u - k sin(pi u) / pi: f(+-1) = +-1, slope 1 - k at the centre and 1 + k at the ends.
function profile(u: number) {
    return u - (warp * Math.sin(Math.PI * u)) / Math.PI;
}

function slope(u: number) {
    return 1 - warp * Math.cos(Math.PI * u);
}

// Where the curved screen draws screen position x. Outside the margins nothing moves.
function curve(x: number) {
    const cx = window.innerWidth / 2;
    const half = x < cx ? cx - margins.left : margins.right - cx;
    if (half <= 0) return x;
    const u = (x - cx) / half;
    if (Math.abs(u) >= 1) return x;
    return cx + half * profile(u);
}

// The piece's box on the flat layout: undoes its parent block's transform, then its own from the
// last frame.
function flatBox(piece: HTMLElement, parent: Mapping): Flat | null {
    const box = piece.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    const last = applied.get(piece) ?? { shift: 0, stretch: 1 };
    const shownLeft = backward(parent, box.left);
    const width = (backward(parent, box.right) - shownLeft) / last.stretch;
    // Our stretch is about the piece's transform origin, which keeps its own transform's scale.
    const ownScale = piece.offsetWidth ? width / piece.offsetWidth : 1;
    const offset = (parseFloat(getComputedStyle(piece).transformOrigin) || 0) * ownScale;
    const left = shownLeft - last.shift + offset * (last.stretch - 1);
    return { left, right: left + width, top: box.top, bottom: box.bottom, origin: left + offset };
}

// Moves and scales the piece so its flat box [left, right] is drawn over
// [curve(left), curve(right)], given what its parent block already does to it. Its height follows
// a share of the same change, about its own middle. Blocks keep their height and leave it to their
// words: lyric lines are positioned by their own vertical transform, which a height scale would
// multiply and so move the line.
function place(piece: HTMLElement, flat: Flat, parent: Mapping, upright = true): Mapping {
    const targetLeft = curve(flat.left);
    const targetRight = curve(flat.right);
    const left = backward(parent, targetLeft);
    const right = backward(parent, targetRight);
    const stretch = (right - left) / (flat.right - flat.left);
    const shift = left - flat.origin - stretch * (flat.left - flat.origin);
    const wide = (targetRight - targetLeft) / (flat.right - flat.left);
    const tall = upright ? 1 + VERTICAL * (wide - 1) : 1;
    const ownTall = tall / parent.tall;
    applied.set(piece, { shift, stretch });
    const key = `${shift.toFixed(1)}|${stretch.toFixed(3)}|${ownTall.toFixed(3)}`;
    if (written.get(piece) !== key) {
        written.set(piece, key);
        piece.style.translate = `${shift.toFixed(1)}px 0`;
        piece.style.scale = `${stretch.toFixed(3)} ${ownTall.toFixed(3)}`;
    }
    return { origin: flat.origin, shift, stretch, tall };
}

function onScreen(box: Flat) {
    return box.right > 0 && box.left < window.innerWidth && box.bottom > 0 && box.top < window.innerHeight;
}

// The HUD's side margin: the gap left of the context icon or artwork, or right of the lyrics,
// whichever is smaller, used on both sides so the warp stays centred on the screen.
function updateMargins(elements: HTMLElement[], flats: (Flat | null)[]) {
    const width = window.innerWidth;
    let margin = Infinity;
    elements.forEach((element, i) => {
        const flat = flats[i];
        if (!flat || !onScreen(flat)) return;
        if (element.matches(LEFT_EDGE)) margin = Math.min(margin, flat.left);
        else if (element.matches(LYRIC_LINES)) margin = Math.min(margin, width - flat.right);
    });
    margin = Number.isFinite(margin) ? clamp(margin, 0, width / 4) : 0;
    margins = { left: margin, right: width - margin };
}

// Lays every piece out on the curve. Pieces keep moving (lyrics scroll, controls collapse), so
// this runs each frame while the effect is on and only writes styles that changed.
function tick() {
    frame = 0;
    if (!active() || !container) {
        stop();
        updateBackground();
        return;
    }
    const blocks = Array.from(container.querySelectorAll<HTMLElement>(BLOCKS));
    const words = Array.from(container.querySelectorAll<HTMLElement>(WORD));
    const pieces = Array.from(container.querySelectorAll<HTMLElement>(PIECES));
    // Read every position first, then write, so the frame lays out once.
    const blockFlats = blocks.map((block) => flatBox(block, IDENTITY));
    const lastBlock = new Map<Element, Mapping>();
    blocks.forEach((block, i) => {
        const flat = blockFlats[i];
        const last = applied.get(block);
        if (flat && last && onScreen(flat)) lastBlock.set(block, { origin: flat.origin, tall: 1, ...last });
    });
    // Words of blocks off screen (lyrics far from the current line) are left until they scroll in.
    const wordBlocks = words.map((word) => word.closest<HTMLElement>(BLOCKS));
    const wordFlats = words.map((word, i) => {
        const block = wordBlocks[i];
        const flat = block && blockFlats[blocks.indexOf(block)];
        if (block && (!flat || !onScreen(flat))) return null;
        return flatBox(word, (block && lastBlock.get(block)) || IDENTITY);
    });
    const pieceFlats = pieces.map((piece) => flatBox(piece, IDENTITY));
    updateMargins([...pieces, ...blocks], [...pieceFlats, ...blockFlats]);

    const blockNow = new Map<Element, Mapping>();
    blocks.forEach((block, i) => {
        const flat = blockFlats[i];
        if (flat && onScreen(flat)) blockNow.set(block, place(block, flat, IDENTITY, false));
    });
    words.forEach((word, i) => {
        const flat = wordFlats[i];
        const block = wordBlocks[i];
        if (flat) place(word, flat, (block && blockNow.get(block)) || IDENTITY);
    });
    pieces.forEach((piece, i) => {
        const flat = pieceFlats[i];
        if (!flat) return;
        if (!onScreen(flat)) {
            if (applied.has(piece)) reset(piece);
            return;
        }
        place(piece, flat, IDENTITY);
    });
    frame = requestAnimationFrame(tick);
}

// Wraps each run of text in one inline line element holding one box per word. The line keeps the
// block's own layout (line clamping counts it as a single child); the words can be transformed.
// Lyric lines hold a single text child, which React replaces whole when it changes, so splitting
// them is safe; the observer splits the new text again.
function splitWords() {
    if (!container) return;
    for (const block of container.querySelectorAll<HTMLElement>(BLOCKS)) {
        const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
        const texts: Text[] = [];
        while (walker.nextNode()) {
            const text = walker.currentNode as Text;
            if (!text.parentElement?.closest(LINE) && text.data.trim()) texts.push(text);
        }
        for (const text of texts) {
            const line = document.createElement(LINE);
            for (const part of text.data.split(/(\s+)/)) {
                if (!part) continue;
                if (/^\s+$/.test(part)) {
                    line.append(part);
                } else {
                    const word = document.createElement(WORD);
                    word.textContent = part;
                    line.append(word);
                }
            }
            text.replaceWith(line);
        }
    }
}

function joinWords() {
    if (!container) return;
    const parents = new Set<Node>();
    for (const line of container.querySelectorAll(LINE)) {
        if (line.parentNode) parents.add(line.parentNode);
        line.replaceWith(line.textContent ?? "");
    }
    parents.forEach((parent) => parent.normalize());
}

// The background is blurred, so warping it as an image looks clean.
function updateBackground() {
    const canvas = container?.querySelector<HTMLCanvasElement>("#fsd-background");
    if (!canvas) return;
    if (!active() || !CFM.get("hudPerspectiveBackground")) {
        canvas.style.removeProperty("filter");
        return;
    }
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const id = `fsd-curve-${Math.round(warp * 1000)}-${width}x${height}`;
    if (!document.getElementById(id)) {
        document.getElementById("fsd-curve-filters")?.remove();
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = "fsd-curve-filters";
        svg.setAttribute("width", "0");
        svg.setAttribute("height", "0");
        svg.style.position = "absolute";
        const { map, scale } = displacementMap(width, height);
        svg.innerHTML =
            `<filter id="${id}" x="0" y="0" width="${width}" height="${height}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">` +
            `<feImage href="${map}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" result="map"/>` +
            `<feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
        document.body.appendChild(svg);
    }
    canvas.style.filter = `url(#${id})`;
}

// Each output pixel takes the flat image from where the curve moved it: the column is f inverted,
// and the row is pulled toward the middle by that column's height scale. The background has no
// margins, so it is warped edge to edge, and its height scale never drops below 1 so no pixel is
// taken from outside the image.
function displacementMap(width: number, height: number) {
    const cx = width / 2;
    const cy = height / 2;
    // f is strictly increasing (slope >= 1 - k > 0), so a few Newton steps invert it.
    const inverse = (v: number) => {
        let u = v;
        for (let i = 0; i < 6; i++) u -= (profile(u) - v) / slope(u);
        return u;
    };
    const shortest = 1 + VERTICAL * (slope(0) - 1);
    const mapWidth = Math.max(2, Math.round(width / 4));
    const mapHeight = Math.max(2, Math.round(height / 4));
    const dx = new Float32Array(mapWidth);
    const tall = new Float32Array(mapWidth);
    let maxShift = 0;
    for (let i = 0; i < mapWidth; i++) {
        const v = (i / (mapWidth - 1)) * 2 - 1;
        const u = inverse(v);
        dx[i] = (u - v) * cx;
        tall[i] = (1 + VERTICAL * (slope(u) - 1)) / shortest;
        maxShift = Math.max(maxShift, Math.abs(dx[i]), cy * (1 - 1 / tall[i]));
    }
    const range = Math.ceil(maxShift * 2 * 1.02) || 1;
    const canvas = document.createElement("canvas");
    canvas.width = mapWidth;
    canvas.height = mapHeight;
    const context = canvas.getContext("2d")!;
    const image = context.createImageData(mapWidth, mapHeight);
    for (let j = 0; j < mapHeight; j++) {
        const y = (j / (mapHeight - 1)) * height;
        for (let i = 0; i < mapWidth; i++) {
            const dy = (y - cy) / tall[i] + cy - y;
            const p = (j * mapWidth + i) * 4;
            image.data[p] = Math.round(128 + (dx[i] / range) * 255);
            image.data[p + 1] = Math.round(128 + (dy / range) * 255);
            image.data[p + 2] = 128;
            image.data[p + 3] = 255;
        }
    }
    context.putImageData(image, 0, 0);
    return { map: canvas.toDataURL(), scale: range };
}
